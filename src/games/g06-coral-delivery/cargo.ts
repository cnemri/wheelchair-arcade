import * as THREE from 'three';
import { createPBRMaterial } from '../../art';

export interface CargoStepInput {
  dt: number;
  time: number;
  accel: number;
  speed: number;
  turnRate: number;
  terrainPitch: number;
  terrainRoll: number;
  bumpImpulse: number;
  bridgeSwayTorque: number;
  lowGearActive: boolean;
  counterBalancePressed: boolean;
  scrapeImpulse: number;
  scene: THREE.Scene;
  groundYAt: (x: number, z: number) => number;
}

export interface CargoStepResult {
  /** Normalized tilt hazard in [0, 1.25]; >= 0.70 triggers warning, >= 1.0 risks spill */
  instability: number;
  /** Stability meter in [0, 1] (1 = rock solid, 0 = tipping) */
  stability: number;
  piecesRemaining: number;
  maxPieces: number;
  warningActive: boolean;
  counterBalanceCooldown: number;
  counterBalanceTriggered: boolean;
  steadySaveAwarded: boolean;
  spilledPieceName: string | null;
}

export interface CargoRig {
  readonly rackGroup: THREE.Group;
  readonly worldSpillsGroup: THREE.Group;
  readonly piecesRemaining: number;
  readonly instability: number;
  readonly stability: number;
  step(input: CargoStepInput): CargoStepResult;
  restockAll(): void;
  reset(): void;
  getWorldStackTop(): THREE.Vector3;
  dispose(): void;
}

interface TumblePiece {
  mesh: THREE.Group;
  vel: THREE.Vector3;
  angVel: THREE.Vector3;
  age: number;
  maxAge: number;
  bounces: number;
}

const MAX_TILT_RAD = 0.54; // ~31 degrees at tier-1 pivot -> dramatic ~54 degrees at teapot top!
const PIECE_NAMES = ['Bound Vintage Books', 'Pastel Patisserie Cake Box', 'Porcelain Teapot'];

export function createCargoRig(): CargoRig {
  const rackGroup = new THREE.Group();
  rackGroup.name = 'TeaDeliveryCargoRack';
  // Positioned cleanly behind the backrest on rig.rearMount (z=+0.44*s, y=0.28*s)
  rackGroup.position.set(0, 0.28, 0.31);

  const worldSpillsGroup = new THREE.Group();
  worldSpillsGroup.name = 'SpilledCargoPieces';

  const ownedGeos: THREE.BufferGeometry[] = [];
  const ownedMats: THREE.Material[] = [];
  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    ownedGeos.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    ownedMats.push(m);
    return m;
  };

  // --- Materials ---
  const woodMat = trackMat(
    createPBRMaterial('woodPlanks', { repeatX: 1, repeatY: 1, seed: 620, tint: '#9a6439' }),
  );
  woodMat.roughness = 0.68;

  const brassMat = trackMat(
    createPBRMaterial('brushedBrass', { repeatX: 1, repeatY: 1, seed: 621 }),
  );
  brassMat.metalness = 0.85;
  brassMat.roughness = 0.28;

  const linenMat = trackMat(
    new THREE.MeshStandardMaterial({ color: '#fbf4e6', roughness: 0.92, metalness: 0.0 }),
  );

  const stabilizerGlowMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#34b8b0',
      emissive: '#22c7be',
      emissiveIntensity: 0.0,
      roughness: 0.35,
      metalness: 0.4,
    }),
  );

  const warningRimMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#d99e46',
      emissive: '#ff4824',
      emissiveIntensity: 0.0,
      roughness: 0.3,
      metalness: 0.65,
    }),
  );

  // --- 1. Ornate Brass-and-Wood Delivery Crate + Mounting Struts ---
  const baseTray = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.58, 0.055, 0.46)), woodMat);
  baseTray.castShadow = true;
  baseTray.receiveShadow = true;
  rackGroup.add(baseTray);

  // Cream Mediterranean linen tray liner
  const doily = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.52, 0.014, 0.40)), linenMat);
  doily.position.y = 0.032;
  doily.receiveShadow = true;
  rackGroup.add(doily);

  // Twin curved brass support struts connecting crate back to wheelchair rear frame
  for (const side of [-1, 1]) {
    const strutCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.2, -0.02, 0.05),
      new THREE.Vector3(side * 0.2, -0.14, -0.16),
      new THREE.Vector3(side * 0.19, -0.22, -0.33),
    ]);
    const strut = new THREE.Mesh(
      trackGeo(new THREE.TubeGeometry(strutCurve, 12, 0.019, 8, false)),
      brassMat,
    );
    strut.castShadow = true;
    rackGroup.add(strut);

    // Hydraulic stabilizer damper cylinders along outer frame edges (glow on Shift!)
    const piston = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.02, 0.02, 0.24, 10)),
      stabilizerGlowMat,
    );
    piston.position.set(side * 0.26, -0.08, -0.08);
    piston.rotation.x = 0.62;
    rackGroup.add(piston);
  }

  // Ornate brass corner posts, gallery rail & finial balls
  const postGeo = trackGeo(new THREE.CylinderGeometry(0.015, 0.017, 0.16, 8));
  const finialGeo = trackGeo(new THREE.SphereGeometry(0.024, 10, 8));
  const corners: Array<[number, number]> = [
    [-0.275, -0.215],
    [0.275, -0.215],
    [-0.275, 0.215],
    [0.275, 0.215],
  ];
  for (const [cx, cz] of corners) {
    const post = new THREE.Mesh(postGeo, brassMat);
    post.position.set(cx, 0.08, cz);
    post.castShadow = true;
    rackGroup.add(post);

    const finial = new THREE.Mesh(finialGeo, warningRimMat);
    finial.position.set(cx, 0.165, cz);
    rackGroup.add(finial);
  }

  // Brass perimeter gallery rails (4 sides)
  const railLongGeo = trackGeo(new THREE.CylinderGeometry(0.01, 0.01, 0.55, 8));
  railLongGeo.rotateZ(Math.PI / 2);
  const railShortGeo = trackGeo(new THREE.CylinderGeometry(0.01, 0.01, 0.43, 8));
  railShortGeo.rotateX(Math.PI / 2);

  for (const zSign of [-1, 1]) {
    const rail = new THREE.Mesh(railLongGeo, warningRimMat);
    rail.position.set(0, 0.13, zSign * 0.215);
    rackGroup.add(rail);
  }
  for (const xSign of [-1, 1]) {
    const rail = new THREE.Mesh(railShortGeo, warningRimMat);
    rail.position.set(xSign * 0.275, 0.13, 0);
    rackGroup.add(rail);
  }

  // Wooden slatted crate side panels (low so books & cake box remain proudly visible!)
  const slatFrontGeo = trackGeo(new THREE.BoxGeometry(0.54, 0.05, 0.018));
  const slatSideGeo = trackGeo(new THREE.BoxGeometry(0.018, 0.05, 0.42));
  for (const zSign of [-1, 1]) {
    const slat = new THREE.Mesh(slatFrontGeo, woodMat);
    slat.position.set(0, 0.065, zSign * 0.215);
    rackGroup.add(slat);
  }
  for (const xSign of [-1, 1]) {
    const slat = new THREE.Mesh(slatSideGeo, woodMat);
    slat.position.set(xSign * 0.275, 0.065, 0);
    rackGroup.add(slat);
  }

  // --- 2. Cascading 3-Tier Delicate Stack Pivots ---
  const tier1Pivot = new THREE.Group();
  tier1Pivot.name = 'CargoTier1_Books';
  tier1Pivot.position.set(0, 0.04, 0);
  rackGroup.add(tier1Pivot);

  const tier2Pivot = new THREE.Group();
  tier2Pivot.name = 'CargoTier2_CakeBox';
  tier2Pivot.position.set(0, 0.165, 0);
  tier1Pivot.add(tier2Pivot);

  const tier3Pivot = new THREE.Group();
  tier3Pivot.name = 'CargoTier3_Teapot';
  tier3Pivot.position.set(0, 0.225, 0);
  tier2Pivot.add(tier3Pivot);

  // TIER 1: Bound Vintage Mediterranean Folios (3 stacked books + gilt pages + leather strap)
  const buildBooksMesh = (): THREE.Group => {
    const g = new THREE.Group();
    const pagesMat = trackMat(new THREE.MeshStandardMaterial({ color: '#f5ead2', roughness: 0.9 }));
    const strapMat = trackMat(new THREE.MeshStandardMaterial({ color: '#5c3621', roughness: 0.72 }));
    const covers = ['#a8382c', '#224a6e', '#4f6d4a'];
    const dims: Array<[number, number, number, number]> = [
      [0.44, 0.055, 0.34, 0.02],
      [0.41, 0.052, 0.31, -0.05],
      [0.37, 0.048, 0.28, 0.04],
    ];

    let curY = 0;
    for (let i = 0; i < 3; i++) {
      const [bw, bh, bd, rotY] = dims[i];
      const book = new THREE.Group();
      book.position.y = curY + bh * 0.5;
      book.rotation.y = rotY;

      const coverMat = trackMat(new THREE.MeshStandardMaterial({ color: covers[i], roughness: 0.72 }));
      const cover = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(bw, bh, bd)), coverMat);
      cover.castShadow = true;
      cover.receiveShadow = true;
      book.add(cover);

      // Recessed cream paper block
      const pages = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(bw - 0.015, bh * 0.76, bd - 0.025)),
        pagesMat,
      );
      pages.position.x = 0.008;
      book.add(pages);

      // Gold spine ribbing on the rear face (+Z, facing camera!)
      const spineBand = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(bw * 0.85, bh * 0.26, 0.008)),
        brassMat,
      );
      spineBand.position.set(0, 0, bd * 0.5 + 0.002);
      book.add(spineBand);

      g.add(book);
      curY += bh;
    }

    // Cross leather bookstrap with brass buckle
    const strap = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.045, curY + 0.012, 0.355)), strapMat);
    strap.position.y = curY * 0.5;
    g.add(strap);

    const buckle = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.06, 0.022, 0.06)), brassMat);
    buckle.position.set(0, curY + 0.008, 0.14);
    g.add(buckle);

    return g;
  };

  // TIER 2: Pastel Patisserie Cake Box (blush cream & mint hatbox + coral satin ribbon + bow)
  const buildCakeBoxMesh = (): THREE.Group => {
    const g = new THREE.Group();
    const boxBodyMat = trackMat(
      new THREE.MeshStandardMaterial({ color: '#f9ece0', roughness: 0.62, metalness: 0.02 }),
    );
    const lidMat = trackMat(
      new THREE.MeshStandardMaterial({ color: '#b7dec8', roughness: 0.55, metalness: 0.04 }),
    );
    const ribbonMat = trackMat(
      new THREE.MeshStandardMaterial({ color: '#e45c4b', roughness: 0.42, metalness: 0.08 }),
    );

    // Main round patisserie drum
    const body = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.175, 0.178, 0.175, 20)), boxBodyMat);
    body.position.y = 0.088;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);

    // Pistachio pastel lid overhanging smoothly
    const lid = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.186, 0.186, 0.046, 20)), lidMat);
    lid.position.y = 0.195;
    lid.castShadow = true;
    lid.receiveShadow = true;
    g.add(lid);

    // Subtle pastel gold-foil trim ring around drum waist
    const trim = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.178, 0.006, 8, 24)), brassMat);
    trim.rotation.x = Math.PI / 2;
    trim.position.y = 0.09;
    g.add(trim);

    // Crossed coral satin ribbon bands
    const bandA = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.378, 0.224, 0.028)), ribbonMat);
    bandA.position.y = 0.112;
    const bandB = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.028, 0.224, 0.378)), ribbonMat);
    bandB.position.y = 0.112;
    g.add(bandA, bandB);

    // Sculpted satin bow loops on the back edge (facing camera!)
    const loopGeo = trackGeo(new THREE.TorusGeometry(0.036, 0.011, 8, 14));
    for (const side of [-1, 1]) {
      const loop = new THREE.Mesh(loopGeo, ribbonMat);
      loop.position.set(side * 0.034, 0.222, 0.095);
      loop.rotation.set(0.35, side * 0.45, side * 0.35);
      g.add(loop);
    }

    return g;
  };

  // TIER 3: Hand-Painted Cobalt & Gold Amalfi Porcelain Teapot + Saucer + Teacup
  const buildTeapotMesh = (): THREE.Group => {
    const g = new THREE.Group();
    const porcelainMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: '#fcfbf7',
        roughness: 0.16,
        metalness: 0.05,
      }),
    );
    const cobaltMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: '#1b5fa8',
        roughness: 0.22,
        metalness: 0.08,
      }),
    );

    // Porcelain serving saucer
    const saucer = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.165, 0.125, 0.02, 20)), porcelainMat);
    saucer.position.y = 0.01;
    saucer.castShadow = true;
    saucer.receiveShadow = true;
    g.add(saucer);

    const saucerRim = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.162, 0.005, 8, 24)), cobaltMat);
    saucerRim.rotation.x = Math.PI / 2;
    saucerRim.position.y = 0.019;
    g.add(saucerRim);

    // Lathe-sculpted teapot silhouette
    const potPts = [
      new THREE.Vector2(0.0, 0.02),
      new THREE.Vector2(0.072, 0.022),
      new THREE.Vector2(0.118, 0.075),
      new THREE.Vector2(0.122, 0.128),
      new THREE.Vector2(0.095, 0.175),
      new THREE.Vector2(0.068, 0.195),
      new THREE.Vector2(0.076, 0.205),
      new THREE.Vector2(0.062, 0.21),
    ];
    const potBody = new THREE.Mesh(trackGeo(new THREE.LatheGeometry(potPts, 20)), porcelainMat);
    potBody.castShadow = true;
    potBody.receiveShadow = true;
    g.add(potBody);

    // Decorative Amalfi cobalt floral waist band + gilt neck ring
    const cobaltBand = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.121, 0.012, 8, 22)), cobaltMat);
    cobaltBand.rotation.x = Math.PI / 2;
    cobaltBand.position.y = 0.115;
    g.add(cobaltBand);

    const goldRing = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.072, 0.006, 8, 20)), brassMat);
    goldRing.rotation.x = Math.PI / 2;
    goldRing.position.y = 0.198;
    g.add(goldRing);

    // Domed porcelain lid + gold finial knob
    const lid = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(0.066, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55)),
      porcelainMat,
    );
    lid.position.y = 0.198;
    lid.castShadow = true;
    g.add(lid);

    const knob = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.02, 10, 8)), brassMat);
    knob.position.y = 0.272;
    g.add(knob);

    // Gracefully curved S-spout (+X side, clearly visible from chase cam!)
    const spoutCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.095, 0.088, 0),
      new THREE.Vector3(0.165, 0.118, 0),
      new THREE.Vector3(0.195, 0.188, 0),
      new THREE.Vector3(0.215, 0.205, 0),
    ]);
    const spout = new THREE.Mesh(
      trackGeo(new THREE.TubeGeometry(spoutCurve, 14, 0.017, 8, false)),
      porcelainMat,
    );
    spout.castShadow = true;
    g.add(spout);

    // Arched handle (-X side)
    const handleCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.082, 0.175, 0),
      new THREE.Vector3(-0.172, 0.165, 0),
      new THREE.Vector3(-0.175, 0.095, 0),
      new THREE.Vector3(-0.102, 0.065, 0),
    ]);
    const handle = new THREE.Mesh(
      trackGeo(new THREE.TubeGeometry(handleCurve, 14, 0.013, 8, false)),
      cobaltMat,
    );
    handle.castShadow = true;
    g.add(handle);

    // Miniature matching porcelain teacup sitting beside the teapot on the rim!
    const cup = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.036, 0.024, 0.048, 12)), porcelainMat);
    cup.position.set(0.085, 0.042, 0.085);
    cup.castShadow = true;
    g.add(cup);
    const cupBand = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.034, 0.004, 6, 14)), cobaltMat);
    cupBand.rotation.x = Math.PI / 2;
    cupBand.position.set(0.085, 0.056, 0.085);
    g.add(cupBand);

    return g;
  };

  const tier1Visual = buildBooksMesh();
  const tier2Visual = buildCakeBoxMesh();
  const tier3Visual = buildTeapotMesh();

  tier1Pivot.add(tier1Visual);
  tier2Pivot.add(tier2Visual);
  tier3Pivot.add(tier3Visual);

  const tierVisuals = [tier1Visual, tier2Visual, tier3Visual];

  // --- 3. Live Spring-Pendulum Balance State ---
  let leanX = 0; // lateral roll tilt (radians; + tilts right)
  let leanZ = 0; // fore-aft pitch tilt (radians; + tilts backward toward camera)
  let velX = 0;
  let velZ = 0;

  let piecesRemaining = 3;
  let spillHoldTimer = 0;
  let invulnTimer = 0;
  let counterBalanceCooldown = 0;
  let counterFlashTimer = 0;
  let restockPopTimer = 0;
  let currentInstability = 0;

  const tumbles: TumblePiece[] = [];
  const tmpWorldPos = new THREE.Vector3();
  const tmpWorldQuat = new THREE.Quaternion();
  const tmpWorldScale = new THREE.Vector3();

  const updateTierVisibility = () => {
    tier1Visual.visible = piecesRemaining >= 1;
    tier2Visual.visible = piecesRemaining >= 2;
    tier3Visual.visible = piecesRemaining >= 3;
  };

  const clearTumbles = () => {
    for (const t of tumbles) {
      worldSpillsGroup.remove(t.mesh);
    }
    tumbles.length = 0;
  };

  const spawnSpilledPiece = (tierIndex: number, leanDirX: number, leanDirZ: number, speed: number) => {
    const sourceVisual = tierVisuals[tierIndex];
    sourceVisual.updateWorldMatrix(true, false);
    sourceVisual.matrixWorld.decompose(tmpWorldPos, tmpWorldQuat, tmpWorldScale);

    // Clone geometry/material references (already tracked in ownedGeos/ownedMats!)
    const clone = sourceVisual.clone(true);
    clone.visible = true;
    clone.position.copy(tmpWorldPos);
    clone.quaternion.copy(tmpWorldQuat);
    clone.scale.copy(tmpWorldScale);
    worldSpillsGroup.add(clone);

    // Launch outward along lean vector in world space
    const localImpulse = new THREE.Vector3(leanDirX, 0.55, leanDirZ).normalize();
    localImpulse.applyQuaternion(tmpWorldQuat);
    const vel = new THREE.Vector3(
      localImpulse.x * (2.6 + Math.min(2.4, Math.abs(speed) * 0.2)),
      2.3 + Math.random() * 0.7,
      localImpulse.z * (2.6 + Math.min(2.4, Math.abs(speed) * 0.2)),
    );
    const angVel = new THREE.Vector3(
      (Math.random() - 0.5) * 7,
      (Math.random() - 0.5) * 5,
      (Math.random() - 0.5) * 7,
    );

    tumbles.push({
      mesh: clone,
      vel,
      angVel,
      age: 0,
      maxAge: 6.5,
      bounces: 0,
    });
  };

  const restockAll = () => {
    piecesRemaining = 3;
    leanX *= 0.25;
    leanZ *= 0.25;
    velX *= 0.2;
    velZ *= 0.2;
    spillHoldTimer = 0;
    invulnTimer = 1.1;
    restockPopTimer = 0.45;
    updateTierVisibility();
  };

  const reset = () => {
    clearTumbles();
    piecesRemaining = 3;
    leanX = 0;
    leanZ = 0;
    velX = 0;
    velZ = 0;
    spillHoldTimer = 0;
    invulnTimer = 0.5;
    counterBalanceCooldown = 0;
    counterFlashTimer = 0;
    restockPopTimer = 0;
    currentInstability = 0;
    updateTierVisibility();
    tier1Pivot.rotation.set(0, 0, 0);
    tier2Pivot.rotation.set(0, 0, 0);
    tier3Pivot.rotation.set(0, 0, 0);
    tier2Pivot.position.set(0, 0.165, 0);
    tier3Pivot.position.set(0, 0.225, 0);
  };

  const step = (input: CargoStepInput): CargoStepResult => {
    const {
      dt,
      time,
      accel,
      speed,
      turnRate,
      terrainPitch,
      terrainRoll,
      bumpImpulse,
      bridgeSwayTorque,
      lowGearActive,
      counterBalancePressed,
      scrapeImpulse,
      groundYAt,
    } = input;

    if (invulnTimer > 0) invulnTimer = Math.max(0, invulnTimer - dt);
    if (counterBalanceCooldown > 0) counterBalanceCooldown = Math.max(0, counterBalanceCooldown - dt);
    if (counterFlashTimer > 0) counterFlashTimer = Math.max(0, counterFlashTimer - dt);
    if (restockPopTimer > 0) restockPopTimer = Math.max(0, restockPopTimer - dt);

    // 1. Inertial & Environmental Torques on the 3-Tier Stack
    // Note: Taller stacks (3 pieces) have slightly livelier leverage than shorter stacks!
    const heightLeverage = piecesRemaining === 3 ? 1.0 : piecesRemaining === 2 ? 0.86 : 0.72;
    const gearShield = lowGearActive ? 0.44 : 1.0;

    // Centripetal lateral lean: turning left (turnRate > 0) pushes cargo outward to the RIGHT (+X)
    const centripetalTorque = THREE.MathUtils.clamp(speed * turnRate * 0.19, -4.6, 4.6);
    // Longitudinal accel: accelerating forward pitches cargo backward (+Z); hard braking pitches forward (-Z)
    const accelTorque = THREE.MathUtils.clamp(accel * 0.145, -4.2, 4.2);

    // Steep slope & lateral camber gravity pull
    const slopePitchTorque = terrainPitch * 1.45;
    const slopeRollTorque = -terrainRoll * 1.75;

    // Rough surface / gravel bumps + suspension bridge lateral sway + wall scrapes
    const bumpX = bumpImpulse * Math.sin(time * 23.7 + 0.9) * 3.2;
    const bumpZ = bumpImpulse * Math.cos(time * 19.3) * 2.6;
    const bridgeRollTorque = bridgeSwayTorque * 3.8;
    const scrapeTorqueX = scrapeImpulse * 4.5;

    const totalTorqueX =
      (centripetalTorque + slopeRollTorque + bumpX + bridgeRollTorque + scrapeTorqueX) *
      heightLeverage *
      gearShield;
    const totalTorqueZ = (accelTorque + slopePitchTorque + bumpZ) * heightLeverage * gearShield;

    // 2. Second-order spring-damper (with Low-Gear hydraulic stabilizer boost!)
    const stiffness = lowGearActive ? 25.5 : 16.5;
    const damping = lowGearActive ? 10.2 : 3.9;

    // Mild inverted-pendulum destabilization near high angles so letting it go past 75% feels tense!
    const radial = Math.hypot(leanX, leanZ);
    const gravityAssist = radial > 0.22 && !lowGearActive ? 4.4 : 0;

    velX += (totalTorqueX - leanX * (stiffness - gravityAssist) - velX * damping) * dt;
    velZ += (totalTorqueZ - leanZ * (stiffness - gravityAssist) - velZ * damping) * dt;

    leanX = THREE.MathUtils.clamp(leanX + velX * dt, -MAX_TILT_RAD * 1.25, MAX_TILT_RAD * 1.25);
    leanZ = THREE.MathUtils.clamp(leanZ + velZ * dt, -MAX_TILT_RAD * 1.25, MAX_TILT_RAD * 1.25);

    // 3. Quick Counter-Balance Tap (Space)
    let counterBalanceTriggered = false;
    let steadySaveAwarded = false;
    const preInstability = Math.hypot(leanX, leanZ) / MAX_TILT_RAD;

    if (counterBalancePressed && counterBalanceCooldown <= 0 && piecesRemaining > 0) {
      counterBalanceTriggered = true;
      counterBalanceCooldown = 0.95;
      counterFlashTimer = 0.38;

      if (preInstability >= 0.42) {
        steadySaveAwarded = true;
      }
      // Crisp active stabilization pull toward center!
      leanX *= 0.56;
      leanZ *= 0.56;
      velX *= 0.35;
      velZ *= 0.35;
      spillHoldTimer = 0;
    }

    // 4. Evaluate Instability & Spill Condition
    currentInstability = Math.min(1.25, Math.hypot(leanX, leanZ) / MAX_TILT_RAD);
    const stability = THREE.MathUtils.clamp(1 - currentInstability, 0, 1);
    const warningActive = piecesRemaining > 0 && currentInstability >= 0.7;

    let spilledPieceName: string | null = null;
    if (piecesRemaining > 0 && invulnTimer <= 0 && currentInstability >= 1.0) {
      spillHoldTimer += dt;
      if (spillHoldTimer >= 0.18) {
        const lostIndex = piecesRemaining - 1;
        spilledPieceName = PIECE_NAMES[lostIndex] ?? 'Delicate Cargo';
        spawnSpilledPiece(lostIndex, leanX, leanZ, speed);
        piecesRemaining -= 1;
        updateTierVisibility();

        // Settle remaining stack cleanly so one spill never cascades unfairly
        leanX *= 0.32;
        leanZ *= 0.32;
        velX *= 0.25;
        velZ *= 0.25;
        spillHoldTimer = 0;
        invulnTimer = 1.45;
        currentInstability = Math.min(1.25, Math.hypot(leanX, leanZ) / MAX_TILT_RAD);
      }
    } else {
      spillHoldTimer = Math.max(0, spillHoldTimer - dt * 2.5);
    }

    // 5. Apply Cascading Tier Articulation (super readable from chase camera!)
    // Rotation X tilts fore-aft (+X lifts -Z / pitches top backward toward +Z!).
    // Rotation Z tilts laterally (-Z tilts top right toward +X!).
    const popScale =
      restockPopTimer > 0
        ? 1 + Math.sin((restockPopTimer / 0.45) * Math.PI) * 0.16
        : 1;

    tier1Pivot.rotation.set(leanZ * 0.52, 0, -leanX * 0.52);
    tier1Pivot.scale.setScalar(popScale);

    tier2Pivot.rotation.set(leanZ * 0.46, 0, -leanX * 0.46);
    tier2Pivot.position.set(leanX * 0.045, 0.165, leanZ * 0.045);

    const topMicroWobble = Math.sin(time * 9.5) * Math.min(0.055, currentInstability * 0.06);
    tier3Pivot.rotation.set(leanZ * 0.58 + topMicroWobble * 0.4, 0, -leanX * 0.58 + topMicroWobble);
    tier3Pivot.position.set(leanX * 0.055, 0.225, leanZ * 0.055);

    // 6. Visual Feedback on Brass Crate (Stabilizer Glow & Tipping Warning Rim)
    const targetStabGlow = lowGearActive ? 1.55 : counterFlashTimer > 0 ? 2.4 : 0.0;
    stabilizerGlowMat.emissiveIntensity +=
      (targetStabGlow - stabilizerGlowMat.emissiveIntensity) * Math.min(1, dt * 12);
    if (counterFlashTimer > 0) {
      stabilizerGlowMat.emissive.set('#ffd257');
    } else {
      stabilizerGlowMat.emissive.set('#22c7be');
    }

    const warnPulse = warningActive ? (0.55 + 0.45 * Math.sin(time * 16)) * 1.85 : 0;
    warningRimMat.emissiveIntensity +=
      (warnPulse - warningRimMat.emissiveIntensity) * Math.min(1, dt * 14);

    // 7. Step Tumbled Spilled Pieces in World Space
    for (let i = tumbles.length - 1; i >= 0; i--) {
      const t = tumbles[i];
      t.age += dt;
      if (t.age >= t.maxAge) {
        worldSpillsGroup.remove(t.mesh);
        tumbles.splice(i, 1);
        continue;
      }

      t.vel.y -= 14.5 * dt;
      t.mesh.position.addScaledVector(t.vel, dt);
      t.mesh.rotation.x += t.angVel.x * dt;
      t.mesh.rotation.y += t.angVel.y * dt;
      t.mesh.rotation.z += t.angVel.z * dt;

      const gy = groundYAt(t.mesh.position.x, t.mesh.position.z) + 0.12;
      if (t.mesh.position.y < gy) {
        t.mesh.position.y = gy;
        if (Math.abs(t.vel.y) > 0.7 && t.bounces < 3) {
          t.vel.y = -t.vel.y * 0.36;
          t.vel.x *= 0.62;
          t.vel.z *= 0.62;
          t.angVel.multiplyScalar(0.58);
          t.bounces++;
        } else {
          t.vel.set(0, 0, 0);
          t.angVel.multiplyScalar(0.82);
        }
      }

      // Smooth fade-shrink in final 1.2s
      if (t.age > t.maxAge - 1.2) {
        const s = Math.max(0.01, (t.maxAge - t.age) / 1.2);
        t.mesh.scale.setScalar(s);
      }
    }

    return {
      instability: currentInstability,
      stability,
      piecesRemaining,
      maxPieces: 3,
      warningActive,
      counterBalanceCooldown,
      counterBalanceTriggered,
      steadySaveAwarded,
      spilledPieceName,
    };
  };

  const getWorldStackTop = (): THREE.Vector3 => {
    const targetPivot =
      piecesRemaining >= 3 ? tier3Pivot : piecesRemaining === 2 ? tier2Pivot : tier1Pivot;
    targetPivot.updateWorldMatrix(true, false);
    const out = new THREE.Vector3(0, 0.18, 0);
    targetPivot.localToWorld(out);
    return out;
  };

  const dispose = () => {
    clearTumbles();
    for (const g of ownedGeos) g.dispose();
    for (const m of ownedMats) m.dispose();
    ownedGeos.length = 0;
    ownedMats.length = 0;
  };

  return {
    rackGroup,
    worldSpillsGroup,
    get piecesRemaining() {
      return piecesRemaining;
    },
    get instability() {
      return currentInstability;
    },
    get stability() {
      return THREE.MathUtils.clamp(1 - currentInstability, 0, 1);
    },
    step,
    restockAll,
    reset,
    getWorldStackTop,
    dispose,
  };
}
