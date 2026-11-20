import * as THREE from 'three';

export interface AstrolabeOrbPos {
  x: number;
  z: number;
  radius: number;
}

export interface NovaBolt {
  mesh: THREE.Group;
  x: number;
  z: number;
  vx: number;
  vz: number;
  radius: number;
  damage: number;
  pierceLeft: number;
  hitIds: Set<number>;
  life: number;
}

export interface KnowledgeGem {
  mesh: THREE.Group;
  x: number;
  z: number;
  xp: number;
  tier: 'emerald' | 'sapphire' | 'gold';
  magnetized: boolean;
  speed: number;
  bobPhase: number;
  age: number;
}

interface LightningBoltVfx {
  group: THREE.Group;
  life: number;
  maxLife: number;
  materials: THREE.MeshBasicMaterial[];
}

interface ShockwaveVfx {
  group: THREE.Group;
  ring: THREE.Mesh;
  dome: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  domeMat: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
  maxRadius: number;
}

export interface ArcaneArsenal {
  readonly bolts: NovaBolt[];
  readonly gems: KnowledgeGem[];
  syncAstrolabes(count: number, orbitRadius: number): void;
  updateAstrolabes(
    dt: number,
    elapsed: number,
    playerX: number,
    playerZ: number,
    orbitRadius: number,
    orbitSpeed: number
  ): AstrolabeOrbPos[];
  spawnChainLightning(points: THREE.Vector3[]): void;
  spawnNovaBolt(
    x: number,
    z: number,
    dirX: number,
    dirZ: number,
    speed: number,
    damage: number,
    pierce: number
  ): void;
  spawnShockwave(x: number, z: number, maxRadius: number, colorHex?: number): void;
  spawnGem(x: number, z: number, xp: number): void;
  updateVfxAndBolts(dt: number, elapsed: number, arenaRadius: number): void;
  updateGems(
    dt: number,
    elapsed: number,
    playerX: number,
    playerZ: number,
    magnetRadius: number
  ): { collectedXp: number; collectedCount: number };
  clear(): void;
  dispose(): void;
}

/**
 * Generates an inscribed golden arcane rune ring texture for the Shockwave Dash burst.
 */
function createShockwaveRuneTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;

  ctx.clearRect(0, 0, size, size);

  // Outer glowing energy rim
  const grad = ctx.createRadialGradient(cx, cy, 74, cx, cy, 126);
  grad.addColorStop(0, 'rgba(255, 224, 130, 0)');
  grad.addColorStop(0.55, 'rgba(255, 212, 108, 0.22)');
  grad.addColorStop(0.84, 'rgba(255, 238, 178, 0.92)');
  grad.addColorStop(0.95, 'rgba(111, 255, 224, 0.65)');
  grad.addColorStop(1, 'rgba(255, 224, 130, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, 126, 0, Math.PI * 2);
  ctx.fill();

  // Concentric geometric rune circles + cardinal diamonds
  ctx.strokeStyle = 'rgba(255, 244, 200, 0.95)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, 112, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(cx, cy, 94, 0, Math.PI * 2);
  ctx.stroke();

  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 94, cy + Math.sin(a) * 94);
    ctx.lineTo(cx + Math.cos(a) * 112, cy + Math.sin(a) * 112);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createArcaneArsenal(scene: THREE.Scene): ArcaneArsenal {
  const root = new THREE.Group();
  root.name = 'ArcaneArsenalRoot';
  scene.add(root);

  const astrolabeRoot = new THREE.Group();
  root.add(astrolabeRoot);

  const bolts: NovaBolt[] = [];
  const gems: KnowledgeGem[] = [];
  const lightningBolts: LightningBoltVfx[] = [];
  const shockwaves: ShockwaveVfx[] = [];

  const sharedGeos: THREE.BufferGeometry[] = [];
  const sharedMats: THREE.Material[] = [];
  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    sharedGeos.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    sharedMats.push(m);
    return m;
  };

  // Shared Geometries
  const astroOuterGeo = trackGeo(new THREE.TorusGeometry(0.32, 0.036, 10, 24));
  const astroInnerGeo = trackGeo(new THREE.TorusGeometry(0.22, 0.026, 8, 20));
  const astroCoreGeo = trackGeo(new THREE.OctahedronGeometry(0.13, 0));
  const orbitTrackGeo = trackGeo(new THREE.RingGeometry(0.96, 1.01, 48));

  const boltWingGeo = trackGeo(new THREE.ConeGeometry(0.16, 0.34, 4));
  const boltKnotGeo = trackGeo(new THREE.OctahedronGeometry(0.11, 0));
  const boltHaloGeo = trackGeo(new THREE.TorusGeometry(0.24, 0.028, 6, 16));

  const lightningUnitGeo = trackGeo(new THREE.CylinderGeometry(1, 1, 1, 6, 1, true));
  const lightningSparkGeo = trackGeo(new THREE.OctahedronGeometry(0.2, 0));

  const shockPlaneGeo = trackGeo(new THREE.PlaneGeometry(2, 2));
  const shockDomeGeo = trackGeo(new THREE.CylinderGeometry(1.0, 1.0, 0.72, 32, 1, true));

  const gemGeo = trackGeo(new THREE.OctahedronGeometry(0.22, 0));
  gemGeo.scale(0.82, 1.35, 0.82);
  const gemGlowGeo = trackGeo(new THREE.RingGeometry(0.14, 0.3, 16));

  const runeTex = createShockwaveRuneTexture();

  // Shared Materials
  const astroBrassMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf0ca74,
      roughness: 0.22,
      metalness: 0.9,
      emissive: 0x614311,
      emissiveIntensity: 0.45,
    })
  );
  const astroCoreMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x7effd8,
      emissive: 0x3ef0be,
      emissiveIntensity: 1.55,
      roughness: 0.15,
    })
  );
  const orbitTrackMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xeec978,
      transparent: true,
      opacity: 0.24,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );

  const boltCrimsonMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd93b55,
      emissive: 0xff4262,
      emissiveIntensity: 1.15,
      roughness: 0.25,
      metalness: 0.3,
    })
  );
  const boltGoldMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffe08a,
      emissive: 0xffb84d,
      emissiveIntensity: 1.3,
      roughness: 0.2,
      metalness: 0.85,
    })
  );
  const boltHaloMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xffb366,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );

  const gemMats = {
    emerald: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x3ee89e,
        emissive: 0x19a86e,
        emissiveIntensity: 0.95,
        roughness: 0.16,
        metalness: 0.22,
      })
    ),
    sapphire: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x57c7ff,
        emissive: 0x2278d4,
        emissiveIntensity: 1.05,
        roughness: 0.14,
        metalness: 0.26,
      })
    ),
    gold: trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffd766,
        emissive: 0xd98f1e,
        emissiveIntensity: 1.2,
        roughness: 0.14,
        metalness: 0.65,
      })
    ),
  };

  const gemRingMats = {
    emerald: trackMat(
      new THREE.MeshBasicMaterial({
        color: 0x56f5b0,
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    ),
    sapphire: trackMat(
      new THREE.MeshBasicMaterial({
        color: 0x70d0ff,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    ),
    gold: trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xffe07d,
        transparent: true,
        opacity: 0.62,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    ),
  };

  // Subtle dashed/solid brass orbit track ring beneath the player
  const orbitTrackMesh = new THREE.Mesh(orbitTrackGeo, orbitTrackMat);
  orbitTrackMesh.rotation.x = -Math.PI / 2;
  orbitTrackMesh.position.y = 0.04;
  astrolabeRoot.add(orbitTrackMesh);

  interface AstrolabeNode {
    group: THREE.Group;
    outer: THREE.Mesh;
    inner: THREE.Mesh;
    core: THREE.Mesh;
  }
  const astrolabeNodes: AstrolabeNode[] = [];
  let orbitAngle = 0;

  const createAstrolabeNode = (): AstrolabeNode => {
    const group = new THREE.Group();
    const outer = new THREE.Mesh(astroOuterGeo, astroBrassMat);
    const inner = new THREE.Mesh(astroInnerGeo, astroBrassMat);
    inner.rotation.x = Math.PI / 2;
    const core = new THREE.Mesh(astroCoreGeo, astroCoreMat);
    group.add(outer, inner, core);
    astrolabeRoot.add(group);
    return { group, outer, inner, core };
  };

  const syncAstrolabes = (count: number, orbitRadius: number) => {
    while (astrolabeNodes.length < count) {
      astrolabeNodes.push(createAstrolabeNode());
    }
    while (astrolabeNodes.length > count) {
      const removed = astrolabeNodes.pop()!;
      astrolabeRoot.remove(removed.group);
    }
    orbitTrackMesh.scale.setScalar(orbitRadius);
  };

  const updateAstrolabes = (
    dt: number,
    elapsed: number,
    playerX: number,
    playerZ: number,
    orbitRadius: number,
    orbitSpeed: number
  ): AstrolabeOrbPos[] => {
    orbitAngle += orbitSpeed * dt;
    astrolabeRoot.position.set(playerX, 0, playerZ);
    orbitTrackMesh.scale.setScalar(orbitRadius);

    const positions: AstrolabeOrbPos[] = [];
    const n = astrolabeNodes.length;
    for (let i = 0; i < n; i++) {
      const a = orbitAngle + (i / Math.max(1, n)) * Math.PI * 2;
      const lx = Math.cos(a) * orbitRadius;
      const lz = Math.sin(a) * orbitRadius;
      const node = astrolabeNodes[i];
      node.group.position.set(lx, 0.96 + Math.sin(elapsed * 4.5 + i * 1.4) * 0.08, lz);
      node.outer.rotation.y = elapsed * 3.8 + i;
      node.outer.rotation.x = Math.sin(elapsed * 2.4 + i) * 0.65;
      node.inner.rotation.z = -elapsed * 5.2 + i;
      node.core.rotation.y = elapsed * 6.0;

      positions.push({
        x: playerX + lx,
        z: playerZ + lz,
        radius: 0.44,
      });
    }
    return positions;
  };

  // Helper vectors for cylinder-beam orientation
  const upVec = new THREE.Vector3(0, 1, 0);
  const segDir = new THREE.Vector3();
  const segMid = new THREE.Vector3();
  const segQuat = new THREE.Quaternion();

  const spawnChainLightning = (points: THREE.Vector3[]) => {
    if (points.length < 2) return;

    const group = new THREE.Group();
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xe6fff9,
      transparent: true,
      opacity: 0.96,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x54f2d2,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const goldAccentArcMat = new THREE.MeshBasicMaterial({
      color: 0xffd978,
      transparent: true,
      opacity: 0.78,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const steps = 4;
      let prev = p0.clone();

      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const curr = new THREE.Vector3().lerpVectors(p0, p1, t);
        if (s < steps) {
          curr.x += (Math.random() - 0.5) * 0.52;
          curr.y += (Math.random() - 0.5) * 0.32;
          curr.z += (Math.random() - 0.5) * 0.52;
        }

        segDir.subVectors(curr, prev);
        const len = segDir.length();
        if (len > 0.001) {
          segMid.addVectors(prev, curr).multiplyScalar(0.5);
          segQuat.setFromUnitVectors(upVec, segDir.normalize());

          const coreSeg = new THREE.Mesh(lightningUnitGeo, coreMat);
          coreSeg.position.copy(segMid);
          coreSeg.quaternion.copy(segQuat);
          coreSeg.scale.set(0.036, len, 0.036);
          group.add(coreSeg);

          const haloSeg = new THREE.Mesh(
            lightningUnitGeo,
            (i + s) % 2 === 0 ? glowMat : goldAccentArcMat
          );
          haloSeg.position.copy(segMid);
          haloSeg.quaternion.copy(segQuat);
          haloSeg.scale.set(0.095, len, 0.095);
          group.add(haloSeg);
        }
        prev = curr;
      }

      // Impact flash crystal at each target node
      const spark = new THREE.Mesh(lightningSparkGeo, goldAccentArcMat);
      spark.position.copy(p1);
      spark.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      group.add(spark);
    }

    root.add(group);
    lightningBolts.push({
      group,
      life: 0.22,
      maxLife: 0.22,
      materials: [coreMat, glowMat, goldAccentArcMat],
    });
  };

  const spawnNovaBolt = (
    x: number,
    z: number,
    dirX: number,
    dirZ: number,
    speed: number,
    damage: number,
    pierce: number
  ) => {
    const g = new THREE.Group();

    // Ornate Crimson-and-Gold Bow-Tie Nova Projectile!
    const leftWing = new THREE.Mesh(boltWingGeo, boltCrimsonMat);
    leftWing.rotation.z = -Math.PI / 2;
    leftWing.position.x = -0.17;
    const rightWing = new THREE.Mesh(boltWingGeo, boltCrimsonMat);
    rightWing.rotation.z = Math.PI / 2;
    rightWing.position.x = 0.17;
    const knot = new THREE.Mesh(boltKnotGeo, boltGoldMat);
    const halo = new THREE.Mesh(boltHaloGeo, boltHaloMat);
    halo.rotation.x = Math.PI / 2;

    g.add(leftWing, rightWing, knot, halo);
    g.position.set(x, 1.04, z);
    g.rotation.y = Math.atan2(-dirX, -dirZ);
    root.add(g);

    bolts.push({
      mesh: g,
      x,
      z,
      vx: dirX * speed,
      vz: dirZ * speed,
      radius: 0.34,
      damage,
      pierceLeft: pierce,
      hitIds: new Set<number>(),
      life: 2.4,
    });
  };

  const spawnShockwave = (x: number, z: number, maxRadius: number, colorHex = 0xffd578) => {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const ringMat = new THREE.MeshBasicMaterial({
      map: runeTex,
      color: colorHex,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(shockPlaneGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.08;
    group.add(ring);

    const domeMat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const dome = new THREE.Mesh(shockDomeGeo, domeMat);
    dome.position.y = 0.38;
    group.add(dome);

    root.add(group);
    shockwaves.push({
      group,
      ring,
      dome,
      ringMat,
      domeMat,
      life: 0.44,
      maxLife: 0.44,
      maxRadius,
    });
  };

  const spawnGem = (x: number, z: number, xp: number) => {
    // Cap active gems cleanly by merging oldest if arena gets super flooded
    if (gems.length > 110) {
      const oldest = gems[0];
      oldest.xp += xp;
      return;
    }

    const tier: KnowledgeGem['tier'] = xp >= 45 ? 'gold' : xp >= 20 ? 'sapphire' : 'emerald';
    const g = new THREE.Group();
    const crystal = new THREE.Mesh(gemGeo, gemMats[tier]);
    const scale = tier === 'gold' ? 1.38 : tier === 'sapphire' ? 1.12 : 0.94;
    crystal.scale.setScalar(scale);
    crystal.position.y = 0.56;
    crystal.castShadow = false;

    const ring = new THREE.Mesh(gemGlowGeo, gemRingMats[tier]);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    ring.scale.setScalar(scale);

    g.add(crystal, ring);
    g.position.set(x, 0, z);
    root.add(g);

    gems.push({
      mesh: g,
      x,
      z,
      xp,
      tier,
      magnetized: false,
      speed: 2.5,
      bobPhase: Math.random() * Math.PI * 2,
      age: 0,
    });
  };

  const updateVfxAndBolts = (dt: number, elapsed: number, arenaRadius: number) => {
    // Update Bow-Tie Nova Bolts
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i];
      b.life -= dt;
      b.x += b.vx * dt;
      b.z += b.vz * dt;
      b.mesh.position.set(b.x, 1.04, b.z);
      b.mesh.rotation.y += dt * 11;

      if (b.life <= 0 || Math.hypot(b.x, b.z) > arenaRadius + 1.2) {
        root.remove(b.mesh);
        bolts.splice(i, 1);
      }
    }

    // Update Chain-Lightning visual bolts
    for (let i = lightningBolts.length - 1; i >= 0; i--) {
      const lb = lightningBolts[i];
      lb.life -= dt;
      const alpha = Math.max(0, lb.life / lb.maxLife);
      lb.materials[0].opacity = alpha * 0.98;
      lb.materials[1].opacity = alpha * 0.68;
      lb.materials[2].opacity = alpha * 0.8;
      if (lb.life <= 0) {
        root.remove(lb.group);
        for (const m of lb.materials) m.dispose();
        lightningBolts.splice(i, 1);
      }
    }

    // Update Shockwave Dash Rune Rings
    for (let i = shockwaves.length - 1; i >= 0; i--) {
      const sw = shockwaves[i];
      sw.life -= dt;
      const t = 1 - Math.max(0, sw.life / sw.maxLife);
      const easeOut = 1 - Math.pow(1 - t, 3);
      const r = 0.75 + easeOut * (sw.maxRadius - 0.75);
      sw.ring.scale.set(r, r, 1);
      sw.ring.rotation.z = elapsed * 2.2;
      sw.dome.scale.set(r * 0.96, 1 - t * 0.6, r * 0.96);

      const fade = Math.pow(1 - t, 1.4);
      sw.ringMat.opacity = fade * 0.95;
      sw.domeMat.opacity = fade * 0.52;

      if (sw.life <= 0) {
        root.remove(sw.group);
        sw.ringMat.dispose();
        sw.domeMat.dispose();
        shockwaves.splice(i, 1);
      }
    }
  };

  const updateGems = (
    dt: number,
    elapsed: number,
    playerX: number,
    playerZ: number,
    magnetRadius: number
  ) => {
    let collectedXp = 0;
    let collectedCount = 0;

    for (let i = gems.length - 1; i >= 0; i--) {
      const gem = gems[i];
      gem.age += dt;
      const dx = playerX - gem.x;
      const dz = playerZ - gem.z;
      const dist = Math.hypot(dx, dz);

      if (dist < magnetRadius) {
        gem.magnetized = true;
      }

      if (gem.magnetized) {
        gem.speed = Math.min(24, gem.speed + 36 * dt);
        if (dist > 0.001) {
          gem.x += (dx / dist) * gem.speed * dt;
          gem.z += (dz / dist) * gem.speed * dt;
        }
      }

      gem.mesh.position.set(gem.x, 0, gem.z);
      const crystal = gem.mesh.children[0];
      if (crystal) {
        crystal.position.y = 0.54 + Math.sin(elapsed * 4.4 + gem.bobPhase) * 0.13;
        crystal.rotation.y = elapsed * 2.8 + gem.bobPhase;
      }

      if (dist < 0.92) {
        collectedXp += gem.xp;
        collectedCount++;
        root.remove(gem.mesh);
        gems.splice(i, 1);
      }
    }

    return { collectedXp, collectedCount };
  };

  const clear = () => {
    for (const b of bolts) root.remove(b.mesh);
    bolts.length = 0;

    for (const g of gems) root.remove(g.mesh);
    gems.length = 0;

    for (const lb of lightningBolts) {
      root.remove(lb.group);
      for (const m of lb.materials) m.dispose();
    }
    lightningBolts.length = 0;

    for (const sw of shockwaves) {
      root.remove(sw.group);
      sw.ringMat.dispose();
      sw.domeMat.dispose();
    }
    shockwaves.length = 0;
  };

  const dispose = () => {
    clear();
    for (const node of astrolabeNodes) {
      astrolabeRoot.remove(node.group);
    }
    astrolabeNodes.length = 0;
    scene.remove(root);
    runeTex.dispose();
    for (const g of sharedGeos) g.dispose();
    for (const m of sharedMats) m.dispose();
  };

  return {
    bolts,
    gems,
    syncAstrolabes,
    updateAstrolabes,
    spawnChainLightning,
    spawnNovaBolt,
    spawnShockwave,
    spawnGem,
    updateVfxAndBolts,
    updateGems,
    clear,
    dispose,
  };
}
