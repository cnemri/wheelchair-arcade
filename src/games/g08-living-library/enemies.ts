import * as THREE from 'three';

export type EnemyKind = 'bat' | 'grimoire' | 'golem' | 'boss';

export interface EnemyEntity {
  id: number;
  kind: EnemyKind;
  group: THREE.Group;
  x: number;
  z: number;
  vx: number;
  vz: number;
  knockVx: number;
  knockVz: number;
  yaw: number;
  radius: number;
  hp: number;
  maxHp: number;
  speed: number;
  contactDamage: number;
  xpValue: number;
  scoreValue: number;
  phase: number;
  hitFlashTimer: number;
  astrolabeHitCooldown: number;
  contactCooldown: number;
  /** Boss attack state */
  bossAttackTimer: number;
  bossTelegraphTimer: number;
  bossSummonTimer: number;
  telegraphRing: THREE.Mesh | null;
  /** Animated sub-parts */
  parts: {
    leftWing?: THREE.Object3D;
    rightWing?: THREE.Object3D;
    ribbon1?: THREE.Object3D;
    ribbon2?: THREE.Object3D;
    chestGear?: THREE.Object3D;
    windupKey?: THREE.Object3D;
    leftArm?: THREE.Object3D;
    rightArm?: THREE.Object3D;
    leftLeg?: THREE.Object3D;
    rightLeg?: THREE.Object3D;
    crown?: THREE.Object3D;
    core?: THREE.Object3D;
    bodyPivot: THREE.Object3D;
  };
  flashMats: THREE.MeshStandardMaterial[];
  baseEmissives: THREE.Color[];
  baseEmissiveIntensities: number[];
  ownedMats: THREE.Material[];
}

export interface EnemyProjectile {
  mesh: THREE.Group;
  x: number;
  z: number;
  vx: number;
  vz: number;
  radius: number;
  damage: number;
  life: number;
}

export interface EnemyManager {
  readonly enemies: EnemyEntity[];
  readonly projectiles: EnemyProjectile[];
  readonly boss: EnemyEntity | null;
  spawn(kind: EnemyKind, x: number, z: number, waveScale: number): EnemyEntity;
  damageEnemy(
    enemy: EnemyEntity,
    amount: number,
    knockX: number,
    knockZ: number
  ): { killed: boolean; x: number; z: number; xp: number; score: number; kind: EnemyKind };
  spawnBossVolley(boss: EnemyEntity, playerX: number, playerZ: number): void;
  updateAnimations(dt: number, elapsed: number): void;
  updateProjectiles(
    dt: number,
    arenaRadius: number,
    playerX: number,
    playerZ: number,
    playerRadius: number
  ): { hitPlayer: boolean; hitDamage: number };
  clear(): void;
  dispose(): void;
}

/**
 * Creates a crisp folded 3D origami wing geometry (double-faceted paper triangle).
 */
function createOrigamiWingGeometry(side: 1 | -1): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const s = side;
  // Two angled paper fold facets: inner wing panel + outer swept wingtip
  const positions = new Float32Array([
    // Inner facet (root front -> mid crest -> root back)
    0, 0, -0.22,
    s * 0.42, 0.12, -0.06,
    0, -0.03, 0.24,
    // Outer facet (mid crest -> wingtip -> trailing corner)
    s * 0.42, 0.12, -0.06,
    s * 0.86, -0.05, -0.24,
    s * 0.48, -0.04, 0.26,
    // Bridge triangle connecting inner back to outer trailing corner
    0, -0.03, 0.24,
    s * 0.42, 0.12, -0.06,
    s * 0.48, -0.04, 0.26,
  ]);
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a toothed clockwork brass cog geometry group using shared primitives.
 */
function buildBrassGear(
  hubGeo: THREE.BufferGeometry,
  toothGeo: THREE.BufferGeometry,
  brassMat: THREE.Material,
  teeth = 8,
  radius = 0.2
): THREE.Group {
  const g = new THREE.Group();
  const hub = new THREE.Mesh(hubGeo, brassMat);
  hub.rotation.x = Math.PI / 2;
  g.add(hub);
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const t = new THREE.Mesh(toothGeo, brassMat);
    t.position.set(Math.cos(a) * radius, Math.sin(a) * radius, 0);
    t.rotation.z = a;
    g.add(t);
  }
  return g;
}

export function createEnemyManager(scene: THREE.Scene): EnemyManager {
  const rootGroup = new THREE.Group();
  rootGroup.name = 'LivingLibraryEnemies';
  scene.add(rootGroup);

  const enemies: EnemyEntity[] = [];
  const projectiles: EnemyProjectile[] = [];
  let nextId = 1;
  let activeBoss: EnemyEntity | null = null;

  // Shared geometries disposed cleanly on manager.dispose()
  const sharedGeos: THREE.BufferGeometry[] = [];
  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    sharedGeos.push(g);
    return g;
  };

  // Origami Bat geometries
  const batBodyGeo = trackGeo(new THREE.OctahedronGeometry(0.24, 0));
  batBodyGeo.scale(0.85, 0.72, 1.55);
  const batWingLGeo = trackGeo(createOrigamiWingGeometry(-1));
  const batWingRGeo = trackGeo(createOrigamiWingGeometry(1));
  const batEarGeo = trackGeo(new THREE.ConeGeometry(0.065, 0.18, 4));
  const batEyeGeo = trackGeo(new THREE.SphereGeometry(0.042, 8, 6));
  const batPipingGeo = trackGeo(new THREE.BoxGeometry(0.04, 0.04, 0.45));

  // Grimoire geometries
  const bookSpineGeo = trackGeo(new THREE.BoxGeometry(0.22, 0.18, 0.96));
  const bookCoverGeo = trackGeo(new THREE.BoxGeometry(0.68, 0.06, 0.94));
  const bookPageBlockGeo = trackGeo(new THREE.BoxGeometry(0.6, 0.12, 0.86));
  const bookSigilGeo = trackGeo(new THREE.OctahedronGeometry(0.11, 0));
  bookSigilGeo.scale(1, 0.3, 1);
  const bookCornerGeo = trackGeo(new THREE.BoxGeometry(0.12, 0.075, 0.12));
  const ribbonSegGeo = trackGeo(new THREE.BoxGeometry(0.1, 0.025, 0.42));
  const tasselGeo = trackGeo(new THREE.OctahedronGeometry(0.08, 0));

  // Clockwork Ink-Golem geometries
  const golemTorsoGeo = trackGeo(new THREE.BoxGeometry(0.96, 0.95, 0.72));
  const golemChestFrameGeo = trackGeo(new THREE.TorusGeometry(0.28, 0.045, 8, 18));
  const golemPauldronGeo = trackGeo(new THREE.SphereGeometry(0.28, 10, 8));
  const golemArmGeo = trackGeo(new THREE.BoxGeometry(0.28, 0.72, 0.3));
  const golemFistGeo = trackGeo(new THREE.BoxGeometry(0.34, 0.28, 0.36));
  const golemLegGeo = trackGeo(new THREE.BoxGeometry(0.32, 0.46, 0.44));
  const golemHeadGeo = trackGeo(new THREE.CylinderGeometry(0.26, 0.32, 0.36, 10));
  const golemEyeGeo = trackGeo(new THREE.SphereGeometry(0.062, 8, 6));
  const gearHubGeo = trackGeo(new THREE.CylinderGeometry(0.18, 0.18, 0.08, 12));
  const gearToothGeo = trackGeo(new THREE.BoxGeometry(0.09, 0.07, 0.08));
  const keyStemGeo = trackGeo(new THREE.CylinderGeometry(0.035, 0.035, 0.34, 8));
  const keyLoopGeo = trackGeo(new THREE.TorusGeometry(0.11, 0.028, 8, 14));

  // Boss Gargoyle Tome geometries
  const bossSpineGeo = trackGeo(new THREE.BoxGeometry(0.64, 1.55, 1.48));
  const bossWingGeo = trackGeo(new THREE.BoxGeometry(1.65, 0.18, 1.85));
  const bossHornGeo = trackGeo(new THREE.ConeGeometry(0.18, 0.78, 6));
  const bossCoreGeo = trackGeo(new THREE.OctahedronGeometry(0.46, 1));
  const bossCrownRingGeo = trackGeo(new THREE.TorusGeometry(0.66, 0.055, 10, 28));
  const bossCrownInnerGeo = trackGeo(new THREE.TorusGeometry(0.42, 0.04, 8, 22));
  const bossEyeGeo = trackGeo(new THREE.SphereGeometry(0.11, 10, 8));
  const bossPageGeo = trackGeo(new THREE.BoxGeometry(1.32, 0.14, 1.55));
  const telegraphGeo = trackGeo(new THREE.RingGeometry(1.6, 2.35, 40));

  // Ground drop shadow disc + Enemy Ink-Orb projectile geometries
  const shadowDiscGeo = trackGeo(new THREE.CircleGeometry(0.55, 16));
  const orbCoreGeo = trackGeo(new THREE.OctahedronGeometry(0.26, 1));
  const orbHaloGeo = trackGeo(new THREE.TorusGeometry(0.34, 0.04, 8, 18));

  // Shared immutable accent materials (not flashed per-hit)
  const sharedMats: THREE.Material[] = [];
  const trackMat = <T extends THREE.Material>(m: T): T => {
    sharedMats.push(m);
    return m;
  };

  const shadowMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0x0b100e,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    })
  );
  const goldAccentMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xe3be68,
      roughness: 0.28,
      metalness: 0.86,
      emissive: 0x3b2608,
      emissiveIntensity: 0.25,
    })
  );
  const pageCreamMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf4ead0,
      roughness: 0.78,
      metalness: 0.02,
    })
  );
  const batEyeMat = trackMat(
    new THREE.MeshBasicMaterial({ color: 0xffb347 })
  );
  const golemEyeMat = trackMat(
    new THREE.MeshBasicMaterial({ color: 0x62ffe0 })
  );
  const bossEyeMat = trackMat(
    new THREE.MeshBasicMaterial({ color: 0xff5a6e })
  );
  const bookmarkMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xc9384a,
      emissive: 0x8a1c2d,
      emissiveIntensity: 0.65,
      roughness: 0.4,
      side: THREE.DoubleSide,
    })
  );
  const bossCoreMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x5ff5c7,
      emissive: 0x2fdca8,
      emissiveIntensity: 1.5,
      roughness: 0.18,
      metalness: 0.2,
    })
  );
  const orbCoreMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x261233,
      emissive: 0xd9487a,
      emissiveIntensity: 1.4,
      roughness: 0.25,
    })
  );
  const orbHaloMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xffbe66,
      transparent: true,
      opacity: 0.85,
    })
  );

  const grimoireColors = [0x6e1f2d, 0x243b5e, 0x244d3c, 0x592b52];
  let grimoireColorIdx = 0;

  const spawn = (kind: EnemyKind, x: number, z: number, waveScale: number): EnemyEntity => {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const bodyPivot = new THREE.Group();
    group.add(bodyPivot);

    const flashMats: THREE.MeshStandardMaterial[] = [];
    const baseEmissives: THREE.Color[] = [];
    const baseEmissiveIntensities: number[] = [];
    const ownedMats: THREE.Material[] = [];

    const registerFlashMat = (m: THREE.MeshStandardMaterial) => {
      ownedMats.push(m);
      flashMats.push(m);
      baseEmissives.push(m.emissive.clone());
      baseEmissiveIntensities.push(m.emissiveIntensity);
      return m;
    };

    // Soft contact ground shadow disc
    const shadow = new THREE.Mesh(shadowDiscGeo, shadowMat);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.03;
    group.add(shadow);

    const parts: EnemyEntity['parts'] = { bodyPivot };
    let radius = 0.65;
    let hp = 26;
    let speed = 4.6;
    let contactDamage = 8;
    let xpValue = 12;
    let scoreValue = 50;
    let telegraphRing: THREE.Mesh | null = null;

    if (kind === 'bat') {
      // === ORIGAMI PAPER BAT ===
      radius = 0.62;
      hp = Math.round(22 * waveScale);
      speed = 5.4 + Math.min(1.6, (waveScale - 1) * 0.9);
      contactDamage = 8;
      xpValue = 12;
      scoreValue = 60;
      shadow.scale.setScalar(0.92);

      const parchmentMat = registerFlashMat(
        new THREE.MeshStandardMaterial({
          color: 0xf4ebd2,
          roughness: 0.62,
          metalness: 0.06,
          emissive: 0x3b2c12,
          emissiveIntensity: 0.14,
          side: THREE.DoubleSide,
        })
      );

      bodyPivot.position.y = 1.15;

      const body = new THREE.Mesh(batBodyGeo, parchmentMat);
      body.castShadow = true;
      bodyPivot.add(body);

      const spineTrim = new THREE.Mesh(batPipingGeo, goldAccentMat);
      spineTrim.position.set(0, 0.14, 0);
      bodyPivot.add(spineTrim);

      for (const side of [-1, 1]) {
        const ear = new THREE.Mesh(batEarGeo, parchmentMat);
        ear.position.set(side * 0.11, 0.19, -0.2);
        ear.rotation.z = -side * 0.28;
        ear.rotation.x = -0.15;
        bodyPivot.add(ear);

        const eye = new THREE.Mesh(batEyeGeo, batEyeMat);
        eye.position.set(side * 0.09, 0.04, -0.32);
        bodyPivot.add(eye);
      }

      const leftWing = new THREE.Group();
      leftWing.position.set(-0.14, 0.04, -0.02);
      const leftWingMesh = new THREE.Mesh(batWingLGeo, parchmentMat);
      leftWingMesh.castShadow = true;
      const leftGoldEdge = new THREE.Mesh(
        batPipingGeo,
        goldAccentMat
      );
      leftGoldEdge.rotation.z = Math.PI / 2;
      leftGoldEdge.position.set(-0.42, 0.05, -0.15);
      leftGoldEdge.scale.set(0.65, 1.35, 0.55);
      leftWing.add(leftWingMesh, leftGoldEdge);
      bodyPivot.add(leftWing);

      const rightWing = new THREE.Group();
      rightWing.position.set(0.14, 0.04, -0.02);
      const rightWingMesh = new THREE.Mesh(batWingRGeo, parchmentMat);
      rightWingMesh.castShadow = true;
      const rightGoldEdge = new THREE.Mesh(
        batPipingGeo,
        goldAccentMat
      );
      rightGoldEdge.rotation.z = Math.PI / 2;
      rightGoldEdge.position.set(0.42, 0.05, -0.15);
      rightGoldEdge.scale.set(0.65, 1.35, 0.55);
      rightWing.add(rightWingMesh, rightGoldEdge);
      bodyPivot.add(rightWing);

      parts.leftWing = leftWing;
      parts.rightWing = rightWing;
    } else if (kind === 'grimoire') {
      // === ROGUE FLAPPING GRIMOIRE ===
      radius = 0.78;
      hp = Math.round(48 * waveScale);
      speed = 3.85 + Math.min(1.25, (waveScale - 1) * 0.65);
      contactDamage = 12;
      xpValue = 22;
      scoreValue = 110;
      shadow.scale.setScalar(1.25);

      const coverCol = grimoireColors[grimoireColorIdx++ % grimoireColors.length];
      const leatherMat = registerFlashMat(
        new THREE.MeshStandardMaterial({
          color: coverCol,
          roughness: 0.48,
          metalness: 0.14,
          emissive: 0x1c0c12,
          emissiveIntensity: 0.22,
        })
      );

      bodyPivot.position.y = 0.96;

      // Central brass-ribbed spine
      const spine = new THREE.Mesh(bookSpineGeo, leatherMat);
      spine.castShadow = true;
      bodyPivot.add(spine);

      // Left hinged cover + pages + brass filigree corners
      const leftWing = new THREE.Group();
      leftWing.position.set(-0.08, 0, 0);
      const lCover = new THREE.Mesh(bookCoverGeo, leatherMat);
      lCover.position.set(-0.34, 0.04, 0);
      lCover.castShadow = true;
      const lPages = new THREE.Mesh(bookPageBlockGeo, pageCreamMat);
      lPages.position.set(-0.31, -0.02, 0);
      const lSigil = new THREE.Mesh(bookSigilGeo, goldAccentMat);
      lSigil.position.set(-0.35, 0.08, 0);
      const lCorner1 = new THREE.Mesh(bookCornerGeo, goldAccentMat);
      lCorner1.position.set(-0.62, 0.04, -0.41);
      const lCorner2 = new THREE.Mesh(bookCornerGeo, goldAccentMat);
      lCorner2.position.set(-0.62, 0.04, 0.41);
      leftWing.add(lCover, lPages, lSigil, lCorner1, lCorner2);
      bodyPivot.add(leftWing);

      // Right hinged cover + pages + brass filigree corners
      const rightWing = new THREE.Group();
      rightWing.position.set(0.08, 0, 0);
      const rCover = new THREE.Mesh(bookCoverGeo, leatherMat);
      rCover.position.set(0.34, 0.04, 0);
      rCover.castShadow = true;
      const rPages = new THREE.Mesh(bookPageBlockGeo, pageCreamMat);
      rPages.position.set(0.31, -0.02, 0);
      const rSigil = new THREE.Mesh(bookSigilGeo, goldAccentMat);
      rSigil.position.set(0.35, 0.08, 0);
      const rCorner1 = new THREE.Mesh(bookCornerGeo, goldAccentMat);
      rCorner1.position.set(0.62, 0.04, -0.41);
      const rCorner2 = new THREE.Mesh(bookCornerGeo, goldAccentMat);
      rCorner2.position.set(0.62, 0.04, 0.41);
      rightWing.add(rCover, rPages, rSigil, rCorner1, rCorner2);
      bodyPivot.add(rightWing);

      // Glowing crimson bookmark ribbon tail streaming behind (+Z)
      const ribbon1 = new THREE.Group();
      ribbon1.position.set(0, -0.02, 0.48);
      const rMesh1 = new THREE.Mesh(ribbonSegGeo, bookmarkMat);
      rMesh1.position.set(0, 0, 0.2);
      ribbon1.add(rMesh1);

      const ribbon2 = new THREE.Group();
      ribbon2.position.set(0, 0, 0.4);
      const rMesh2 = new THREE.Mesh(ribbonSegGeo, bookmarkMat);
      rMesh2.position.set(0, 0, 0.19);
      const tassel = new THREE.Mesh(tasselGeo, goldAccentMat);
      tassel.position.set(0, 0, 0.4);
      ribbon2.add(rMesh2, tassel);
      ribbon1.add(ribbon2);
      bodyPivot.add(ribbon1);

      parts.leftWing = leftWing;
      parts.rightWing = rightWing;
      parts.ribbon1 = ribbon1;
      parts.ribbon2 = ribbon2;
    } else if (kind === 'golem') {
      // === CLOCKWORK INK-GOLEM (HEAVY ELITE) ===
      radius = 1.02;
      hp = Math.round(145 * waveScale);
      speed = 2.55 + Math.min(0.85, (waveScale - 1) * 0.4);
      contactDamage = 18;
      xpValue = 55;
      scoreValue = 280;
      shadow.scale.setScalar(1.75);

      const obsidianMat = registerFlashMat(
        new THREE.MeshStandardMaterial({
          color: 0x202730,
          roughness: 0.34,
          metalness: 0.58,
          emissive: 0x0c1921,
          emissiveIntensity: 0.24,
        })
      );
      const brassBodyMat = registerFlashMat(
        new THREE.MeshStandardMaterial({
          color: 0xd4aa55,
          roughness: 0.3,
          metalness: 0.84,
          emissive: 0x2e1e06,
          emissiveIntensity: 0.2,
        })
      );

      // Heavy torso
      const torso = new THREE.Mesh(golemTorsoGeo, obsidianMat);
      torso.position.y = 0.96;
      torso.castShadow = true;
      torso.receiveShadow = true;
      bodyPivot.add(torso);

      // Brass belt & chest bezel
      const chestFrame = new THREE.Mesh(golemChestFrameGeo, brassBodyMat);
      chestFrame.position.set(0, 0.98, -0.37);
      bodyPivot.add(chestFrame);

      // Spinning exposed brass chest gear
      const chestGear = buildBrassGear(gearHubGeo, gearToothGeo, goldAccentMat, 8, 0.21);
      chestGear.position.set(0, 0.98, -0.4);
      bodyPivot.add(chestGear);

      // Domed clockwork helm + glowing cyan-amber eyes
      const head = new THREE.Mesh(golemHeadGeo, brassBodyMat);
      head.position.set(0, 1.62, -0.02);
      head.castShadow = true;
      bodyPivot.add(head);

      for (const side of [-1, 1]) {
        const eye = new THREE.Mesh(golemEyeGeo, golemEyeMat);
        eye.position.set(side * 0.11, 1.63, -0.27);
        bodyPivot.add(eye);
      }

      // Articulated arms with riveted brass shoulder pauldrons
      const buildArm = (side: -1 | 1) => {
        const arm = new THREE.Group();
        arm.position.set(side * 0.64, 1.32, 0);
        const pauldron = new THREE.Mesh(golemPauldronGeo, brassBodyMat);
        pauldron.castShadow = true;
        const shaft = new THREE.Mesh(golemArmGeo, obsidianMat);
        shaft.position.y = -0.4;
        shaft.castShadow = true;
        const fist = new THREE.Mesh(golemFistGeo, brassBodyMat);
        fist.position.set(0, -0.78, -0.04);
        fist.castShadow = true;
        arm.add(pauldron, shaft, fist);
        bodyPivot.add(arm);
        return arm;
      };
      parts.leftArm = buildArm(-1);
      parts.rightArm = buildArm(1);

      // Heavy armored legs
      const buildLeg = (side: -1 | 1) => {
        const leg = new THREE.Group();
        leg.position.set(side * 0.28, 0.46, 0);
        const mesh = new THREE.Mesh(golemLegGeo, obsidianMat);
        mesh.position.y = -0.22;
        mesh.castShadow = true;
        leg.add(mesh);
        bodyPivot.add(leg);
        return leg;
      };
      parts.leftLeg = buildLeg(-1);
      parts.rightLeg = buildLeg(1);

      // Spinning brass wind-up key on back (+Z)
      const windupKey = new THREE.Group();
      windupKey.position.set(0, 1.05, 0.42);
      const stem = new THREE.Mesh(keyStemGeo, goldAccentMat);
      stem.rotation.x = Math.PI / 2;
      stem.position.z = 0.14;
      const loopL = new THREE.Mesh(keyLoopGeo, goldAccentMat);
      loopL.position.set(-0.11, 0, 0.34);
      const loopR = new THREE.Mesh(keyLoopGeo, goldAccentMat);
      loopR.position.set(0.11, 0, 0.34);
      windupKey.add(stem, loopL, loopR);
      bodyPivot.add(windupKey);

      parts.chestGear = chestGear;
      parts.windupKey = windupKey;
    } else {
      // === THE ARCHIVIST'S GARGOYLE TOME BOSS ===
      radius = 1.85;
      hp = Math.round(1350 * waveScale);
      speed = 3.1;
      contactDamage = 24;
      xpValue = 250;
      scoreValue = 2500;
      shadow.scale.setScalar(3.3);

      const bossStoneMat = registerFlashMat(
        new THREE.MeshStandardMaterial({
          color: 0x26212c,
          roughness: 0.36,
          metalness: 0.42,
          emissive: 0x2a101d,
          emissiveIntensity: 0.35,
        })
      );
      const bossCrimsonMat = registerFlashMat(
        new THREE.MeshStandardMaterial({
          color: 0x7c1d30,
          roughness: 0.4,
          metalness: 0.35,
          emissive: 0x3b0c16,
          emissiveIntensity: 0.4,
        })
      );

      bodyPivot.position.y = 1.65;

      // Colossal gilded obsidian gargoyle spine
      const spine = new THREE.Mesh(bossSpineGeo, bossStoneMat);
      spine.castShadow = true;
      bodyPivot.add(spine);

      // Glowing arcane heart crystal inside spine
      const core = new THREE.Mesh(bossCoreGeo, bossCoreMat);
      core.position.set(0, 0.1, -0.58);
      bodyPivot.add(core);
      parts.core = core;

      // Gargoyle horns + burning crimson sovereign eyes on brow
      for (const side of [-1, 1]) {
        const horn = new THREE.Mesh(bossHornGeo, bossStoneMat);
        horn.position.set(side * 0.38, 1.04, -0.25);
        horn.rotation.z = -side * 0.42;
        horn.rotation.x = -0.25;
        horn.castShadow = true;
        bodyPivot.add(horn);

        const eye = new THREE.Mesh(bossEyeGeo, bossEyeMat);
        eye.position.set(side * 0.2, 0.62, -0.76);
        bodyPivot.add(eye);
      }

      // Colossal articulated folio wings with crimson-gilt covers & fluttering pages
      const buildBossWing = (side: -1 | 1) => {
        const w = new THREE.Group();
        w.position.set(side * 0.34, 0.1, 0);
        const plate = new THREE.Mesh(bossWingGeo, bossCrimsonMat);
        plate.position.set(side * 0.85, 0, 0);
        plate.castShadow = true;

        const pages = new THREE.Mesh(bossPageGeo, pageCreamMat);
        pages.position.set(side * 0.78, -0.15, 0);

        const crestHorn = new THREE.Mesh(bossHornGeo, goldAccentMat);
        crestHorn.position.set(side * 1.55, 0.18, -0.78);
        crestHorn.rotation.z = -side * 0.85;
        crestHorn.scale.setScalar(0.75);

        w.add(plate, pages, crestHorn);
        bodyPivot.add(w);
        return w;
      };
      parts.leftWing = buildBossWing(-1);
      parts.rightWing = buildBossWing(1);

      // Floating All-Seeing Brass Astrolabe Crown above brow
      const crown = new THREE.Group();
      crown.position.set(0, 1.48, 0);
      const outerC = new THREE.Mesh(bossCrownRingGeo, goldAccentMat);
      const innerC = new THREE.Mesh(bossCrownInnerGeo, goldAccentMat);
      innerC.rotation.x = Math.PI / 2;
      crown.add(outerC, innerC);
      bodyPivot.add(crown);
      parts.crown = crown;

      // Ground telegraph warning ring for radial Ink-Orb volleys
      const teleMat = new THREE.MeshBasicMaterial({
        color: 0xff5a6e,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      ownedMats.push(teleMat);
      telegraphRing = new THREE.Mesh(telegraphGeo, teleMat);
      telegraphRing.rotation.x = -Math.PI / 2;
      telegraphRing.position.y = 0.06;
      telegraphRing.visible = false;
      group.add(telegraphRing);
    }

    rootGroup.add(group);

    const entity: EnemyEntity = {
      id: nextId++,
      kind,
      group,
      x,
      z,
      vx: 0,
      vz: 0,
      knockVx: 0,
      knockVz: 0,
      yaw: 0,
      radius,
      hp,
      maxHp: hp,
      speed,
      contactDamage,
      xpValue,
      scoreValue,
      phase: Math.random() * Math.PI * 2,
      hitFlashTimer: 0,
      astrolabeHitCooldown: 0,
      contactCooldown: 0,
      bossAttackTimer: 3.4,
      bossTelegraphTimer: 0,
      bossSummonTimer: 7.5,
      telegraphRing,
      parts,
      flashMats,
      baseEmissives,
      baseEmissiveIntensities,
      ownedMats,
    };

    enemies.push(entity);
    if (kind === 'boss') {
      activeBoss = entity;
    }
    return entity;
  };

  const removeEnemyAt = (idx: number) => {
    const e = enemies[idx];
    rootGroup.remove(e.group);
    for (const m of e.ownedMats) m.dispose();
    if (activeBoss === e) activeBoss = null;
    enemies.splice(idx, 1);
  };

  const damageEnemy = (
    enemy: EnemyEntity,
    amount: number,
    knockX: number,
    knockZ: number
  ) => {
    enemy.hp -= amount;
    enemy.hitFlashTimer = 0.14;

    // Heavy elites and boss resist knockback proportionally
    const resist = enemy.kind === 'boss' ? 0.12 : enemy.kind === 'golem' ? 0.35 : 1.0;
    enemy.knockVx += knockX * resist;
    enemy.knockVz += knockZ * resist;

    if (enemy.hp <= 0) {
      const idx = enemies.indexOf(enemy);
      if (idx !== -1) removeEnemyAt(idx);
      return {
        killed: true,
        x: enemy.x,
        z: enemy.z,
        xp: enemy.xpValue,
        score: enemy.scoreValue,
        kind: enemy.kind,
      };
    }

    return {
      killed: false,
      x: enemy.x,
      z: enemy.z,
      xp: 0,
      score: 0,
      kind: enemy.kind,
    };
  };

  const spawnBossVolley = (boss: EnemyEntity, playerX: number, playerZ: number) => {
    const baseAngle = Math.atan2(playerZ - boss.z, playerX - boss.x);
    const orbCount = 10;
    const orbSpeed = 7.4;

    for (let i = 0; i < orbCount; i++) {
      const a = baseAngle + (i / orbCount) * Math.PI * 2;
      const g = new THREE.Group();
      const core = new THREE.Mesh(orbCoreGeo, orbCoreMat);
      const halo = new THREE.Mesh(orbHaloGeo, orbHaloMat);
      halo.rotation.x = Math.PI / 2;
      g.add(core, halo);
      g.position.set(boss.x + Math.cos(a) * 1.4, 1.05, boss.z + Math.sin(a) * 1.4);
      rootGroup.add(g);

      projectiles.push({
        mesh: g,
        x: g.position.x,
        z: g.position.z,
        vx: Math.cos(a) * orbSpeed,
        vz: Math.sin(a) * orbSpeed,
        radius: 0.36,
        damage: 14,
        life: 4.5,
      });
    }
  };

  const updateAnimations = (dt: number, elapsed: number) => {
    for (const e of enemies) {
      e.phase += dt;
      if (e.astrolabeHitCooldown > 0) e.astrolabeHitCooldown = Math.max(0, e.astrolabeHitCooldown - dt);
      if (e.contactCooldown > 0) e.contactCooldown = Math.max(0, e.contactCooldown - dt);

      // Update world transform
      e.group.position.set(e.x, 0, e.z);
      e.group.rotation.y = e.yaw;

      // Crisp white-gold hit flash recovery
      if (e.hitFlashTimer > 0) {
        e.hitFlashTimer = Math.max(0, e.hitFlashTimer - dt);
        const f = e.hitFlashTimer / 0.14;
        for (let i = 0; i < e.flashMats.length; i++) {
          const m = e.flashMats[i];
          m.emissive.setRGB(
            THREE.MathUtils.lerp(e.baseEmissives[i].r, 1.0, f),
            THREE.MathUtils.lerp(e.baseEmissives[i].g, 0.92, f),
            THREE.MathUtils.lerp(e.baseEmissives[i].b, 0.7, f)
          );
          m.emissiveIntensity = THREE.MathUtils.lerp(e.baseEmissiveIntensities[i], 1.85, f);
        }
        const punch = 1 + f * 0.14;
        e.parts.bodyPivot.scale.set(punch, 1 / punch, punch);
      } else {
        e.parts.bodyPivot.scale.set(1, 1, 1);
      }

      // Archetype-specific bespoke procedural animation
      if (e.kind === 'bat') {
        const flap = Math.sin(elapsed * 13.5 + e.id * 1.7);
        e.parts.bodyPivot.position.y = 1.16 + Math.sin(elapsed * 5.2 + e.id) * 0.18;
        if (e.parts.leftWing) e.parts.leftWing.rotation.z = -0.18 + flap * 0.72;
        if (e.parts.rightWing) e.parts.rightWing.rotation.z = 0.18 - flap * 0.72;
        e.parts.bodyPivot.rotation.x = 0.12 + flap * 0.08;
      } else if (e.kind === 'grimoire') {
        const snap = Math.sin(elapsed * 7.8 + e.id * 2.1);
        e.parts.bodyPivot.position.y = 0.96 + Math.abs(Math.sin(elapsed * 4.2 + e.id)) * 0.24;
        if (e.parts.leftWing) e.parts.leftWing.rotation.z = -0.25 + snap * 0.56;
        if (e.parts.rightWing) e.parts.rightWing.rotation.z = 0.25 - snap * 0.56;
        if (e.parts.ribbon1) e.parts.ribbon1.rotation.y = Math.sin(elapsed * 9 + e.id) * 0.35;
        if (e.parts.ribbon2) e.parts.ribbon2.rotation.y = Math.sin(elapsed * 9 + e.id - 1.1) * 0.45;
      } else if (e.kind === 'golem') {
        const stride = Math.sin(elapsed * 6.4 + e.id);
        e.parts.bodyPivot.position.y = Math.abs(stride) * 0.08;
        e.parts.bodyPivot.rotation.z = stride * 0.065;
        if (e.parts.leftArm) e.parts.leftArm.rotation.x = stride * 0.52;
        if (e.parts.rightArm) e.parts.rightArm.rotation.x = -stride * 0.52;
        if (e.parts.leftLeg) e.parts.leftLeg.rotation.x = -stride * 0.42;
        if (e.parts.rightLeg) e.parts.rightLeg.rotation.x = stride * 0.42;
        if (e.parts.chestGear) e.parts.chestGear.rotation.z = elapsed * 2.8 + e.id;
        if (e.parts.windupKey) e.parts.windupKey.rotation.z = -elapsed * 3.6 + e.id;
      } else if (e.kind === 'boss') {
        const flap = Math.sin(elapsed * 3.8);
        e.parts.bodyPivot.position.y = 1.65 + Math.sin(elapsed * 2.3) * 0.24;
        if (e.parts.leftWing) e.parts.leftWing.rotation.z = -0.15 + flap * 0.48;
        if (e.parts.rightWing) e.parts.rightWing.rotation.z = 0.15 - flap * 0.48;
        if (e.parts.crown) {
          e.parts.crown.rotation.y = elapsed * 1.4;
          e.parts.crown.rotation.x = Math.sin(elapsed * 1.7) * 0.22;
        }
        if (e.parts.core) {
          e.parts.core.rotation.y = -elapsed * 2.2;
          const s = 1 + Math.sin(elapsed * 5.2) * 0.14;
          e.parts.core.scale.setScalar(s);
        }
        if (e.telegraphRing) {
          if (e.bossTelegraphTimer > 0) {
            e.telegraphRing.visible = true;
            const prog = 1 - e.bossTelegraphTimer / 1.1;
            const sc = 0.85 + prog * 1.45;
            e.telegraphRing.scale.setScalar(sc);
            (e.telegraphRing.material as THREE.MeshBasicMaterial).opacity =
              0.28 + Math.sin(elapsed * 28) * 0.16 + prog * 0.35;
          } else {
            e.telegraphRing.visible = false;
          }
        }
      }
    }
  };

  const updateProjectiles = (
    dt: number,
    arenaRadius: number,
    playerX: number,
    playerZ: number,
    playerRadius: number
  ) => {
    let hitPlayer = false;
    let hitDamage = 0;

    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.mesh.position.set(p.x, 1.05, p.z);
      p.mesh.rotation.y += dt * 4.5;
      p.mesh.rotation.x += dt * 2.5;

      const distCenter = Math.hypot(p.x, p.z);
      const distPlayer = Math.hypot(p.x - playerX, p.z - playerZ);

      if (distPlayer < p.radius + playerRadius) {
        hitPlayer = true;
        hitDamage = Math.max(hitDamage, p.damage);
        rootGroup.remove(p.mesh);
        projectiles.splice(i, 1);
      } else if (p.life <= 0 || distCenter > arenaRadius + 1.2) {
        rootGroup.remove(p.mesh);
        projectiles.splice(i, 1);
      }
    }

    return { hitPlayer, hitDamage };
  };

  const clear = () => {
    for (let i = enemies.length - 1; i >= 0; i--) {
      removeEnemyAt(i);
    }
    for (const p of projectiles) {
      rootGroup.remove(p.mesh);
    }
    projectiles.length = 0;
    activeBoss = null;
  };

  const dispose = () => {
    clear();
    scene.remove(rootGroup);
    for (const g of sharedGeos) g.dispose();
    for (const m of sharedMats) m.dispose();
  };

  return {
    enemies,
    projectiles,
    get boss() {
      return activeBoss;
    },
    spawn,
    damageEnemy,
    spawnBossVolley,
    updateAnimations,
    updateProjectiles,
    clear,
    dispose,
  };
}
