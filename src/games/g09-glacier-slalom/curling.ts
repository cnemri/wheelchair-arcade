import * as THREE from 'three';
import {
  HOUSE_BUTTON_RADIUS,
  HOUSE_CENTER_X,
  HOUSE_CENTER_Z,
  HOUSE_INNER_RADIUS,
  HOUSE_OUTER_RADIUS,
  RINK_CENTER_Z,
  RINK_WALL_RADIUS,
  ROUND_CONFIGS,
  type StoneStartSpec,
} from './course';

export const STONE_RADIUS = 1.02;

export type StoneRingZone = 'button' | 'inner' | 'outer' | 'none';

export interface CurlingStone {
  id: number;
  team: 'gold' | 'rival';
  x: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  angVel: number;
  zone: StoneRingZone;
  group: THREE.Group;
  haloMat: THREE.MeshBasicMaterial;
  haloMesh: THREE.Mesh;
  bandMat: THREE.MeshStandardMaterial;
}

export interface CurlingCollisionEvent {
  position: THREE.Vector3;
  intensity: number;
  kind: 'stone-stone' | 'player-stone' | 'stone-wall';
  team?: 'gold' | 'rival';
}

export interface CurlingHouseTally {
  totalPoints: number;
  goldInButton: number;
  goldInInner: number;
  goldInOuter: number;
  rivalInButton: number;
  rivalInInner: number;
  rivalInOuter: number;
  goldScoringCount: number;
  rivalThreatCount: number;
}

export interface CurlingArena {
  group: THREE.Group;
  stones: CurlingStone[];
  resetForRound: (roundIndex: number) => void;
  step: (
    dt: number,
    time: number,
    playerX: number,
    playerZ: number,
    playerVx: number,
    playerVz: number,
    playerRadius: number,
    playerBoosting: boolean,
  ) => {
    playerImpulseX: number;
    playerImpulseZ: number;
    playerPushOutX: number;
    playerPushOutZ: number;
    collisions: CurlingCollisionEvent[];
    zonePromotions: { team: 'gold' | 'rival'; zone: StoneRingZone; pos: THREE.Vector3 }[];
    tally: CurlingHouseTally;
    maxStoneSpeed: number;
  };
  computeTally: () => CurlingHouseTally;
  dispose: () => void;
}

function createSpeckledGraniteTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#333d4a';
  ctx.fillRect(0, 0, size, size);

  // Deterministic pseudo-random granite mineral grains (quartz, feldspar, mica)
  let s = 48151623;
  const rand = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };

  for (let i = 0; i < 3600; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 0.7 + rand() * 2.1;
    const pick = rand();
    if (pick < 0.35) {
      ctx.fillStyle = 'rgba(20, 26, 34, 0.55)';
    } else if (pick < 0.7) {
      ctx.fillStyle = 'rgba(92, 108, 126, 0.45)';
    } else if (pick < 0.9) {
      ctx.fillStyle = 'rgba(176, 194, 212, 0.42)';
    } else {
      ctx.fillStyle = 'rgba(235, 245, 255, 0.55)';
    }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function classifyZone(x: number, z: number): StoneRingZone {
  const d = Math.hypot(x - HOUSE_CENTER_X, z - HOUSE_CENTER_Z);
  // Standard curling rule: if the stone edge touches the ring, it counts!
  if (d <= HOUSE_BUTTON_RADIUS + STONE_RADIUS * 0.35) return 'button';
  if (d <= HOUSE_INNER_RADIUS + STONE_RADIUS * 0.25) return 'inner';
  if (d <= HOUSE_OUTER_RADIUS + STONE_RADIUS * 0.2) return 'outer';
  return 'none';
}

export function buildCurlingArena(): CurlingArena {
  const group = new THREE.Group();
  group.name = 'CurlingArenaStones';

  const ownedGeometries: THREE.BufferGeometry[] = [];
  const ownedMaterials: THREE.Material[] = [];
  const ownedTextures: THREE.Texture[] = [];

  const graniteTex = createSpeckledGraniteTexture();
  ownedTextures.push(graniteTex);

  // Authentic sculpted curling stone lathe profile (radius ~1.02m, height ~0.58m)
  const profile: THREE.Vector2[] = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.58, 0.0),
    new THREE.Vector2(0.84, 0.06),
    new THREE.Vector2(0.99, 0.17),
    new THREE.Vector2(STONE_RADIUS, 0.27),
    new THREE.Vector2(STONE_RADIUS, 0.36),
    new THREE.Vector2(0.96, 0.47),
    new THREE.Vector2(0.76, 0.55),
    new THREE.Vector2(0.42, 0.58),
    new THREE.Vector2(0.0, 0.58),
  ];
  const bodyGeo = new THREE.LatheGeometry(profile, 28);
  ownedGeometries.push(bodyGeo);

  // Gleaming striking band wrapped cleanly around the stone belly
  const bandGeo = new THREE.CylinderGeometry(
    STONE_RADIUS + 0.014,
    STONE_RADIUS + 0.014,
    0.15,
    28,
    1,
    true,
  );
  bandGeo.translate(0, 0.31, 0);
  ownedGeometries.push(bandGeo);

  // Sculpted top brass collar + ergonomic curling goose-neck handle
  const collarGeo = new THREE.CylinderGeometry(0.32, 0.37, 0.07, 18);
  collarGeo.translate(0, 0.59, 0);
  const boltGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.1, 12);
  boltGeo.translate(0, 0.64, 0);

  const handleCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.61, 0.24),
    new THREE.Vector3(0, 0.84, 0.18),
    new THREE.Vector3(0, 0.88, -0.06),
    new THREE.Vector3(0, 0.83, -0.44),
  ]);
  const handleGeo = new THREE.TubeGeometry(handleCurve, 18, 0.072, 10, false);
  const handleTipGeo = new THREE.SphereGeometry(0.084, 12, 10);
  handleTipGeo.translate(0, 0.83, -0.44);

  const haloGeo = new THREE.RingGeometry(STONE_RADIUS + 0.08, STONE_RADIUS + 0.44, 32);
  haloGeo.rotateX(-Math.PI / 2);

  ownedGeometries.push(collarGeo, boltGeo, handleGeo, handleTipGeo, haloGeo);

  const graniteMatGold = new THREE.MeshStandardMaterial({
    map: graniteTex,
    color: 0xdce4ee,
    roughness: 0.24,
    metalness: 0.14,
    envMapIntensity: 1.35,
  });
  const graniteMatRival = new THREE.MeshStandardMaterial({
    map: graniteTex,
    color: 0x8f9aa8,
    roughness: 0.28,
    metalness: 0.12,
    envMapIntensity: 1.2,
  });
  const brassHandleMat = new THREE.MeshStandardMaterial({
    color: 0xf4c44e,
    emissive: 0x704808,
    emissiveIntensity: 0.32,
    roughness: 0.22,
    metalness: 0.85,
  });
  const rivalHandleMat = new THREE.MeshStandardMaterial({
    color: 0xd93446,
    emissive: 0x5c0c16,
    emissiveIntensity: 0.3,
    roughness: 0.26,
    metalness: 0.55,
  });
  const chromeCollarMat = new THREE.MeshStandardMaterial({
    color: 0xd8e4f0,
    roughness: 0.2,
    metalness: 0.88,
  });
  ownedMaterials.push(graniteMatGold, graniteMatRival, brassHandleMat, rivalHandleMat, chromeCollarMat);

  const stones: CurlingStone[] = [];

  const createStone = (id: number, spec: StoneStartSpec): CurlingStone => {
    const stoneGroup = new THREE.Group();
    stoneGroup.name = `CurlingStone_${spec.team}_${id}`;

    const isGold = spec.team === 'gold';
    const body = new THREE.Mesh(bodyGeo, isGold ? graniteMatGold : graniteMatRival);
    body.castShadow = true;
    body.receiveShadow = true;
    stoneGroup.add(body);

    const bandMat = new THREE.MeshStandardMaterial({
      color: isGold ? 0xf6c343 : 0xcf2b3c,
      emissive: isGold ? 0xc28510 : 0x6b0c16,
      emissiveIntensity: isGold ? 0.36 : 0.28,
      roughness: 0.26,
      metalness: isGold ? 0.72 : 0.38,
    });
    ownedMaterials.push(bandMat);
    const band = new THREE.Mesh(bandGeo, bandMat);
    stoneGroup.add(band);

    const collar = new THREE.Mesh(collarGeo, isGold ? brassHandleMat : chromeCollarMat);
    const bolt = new THREE.Mesh(boltGeo, chromeCollarMat);
    const handle = new THREE.Mesh(handleGeo, isGold ? brassHandleMat : rivalHandleMat);
    handle.castShadow = true;
    const tip = new THREE.Mesh(handleTipGeo, isGold ? brassHandleMat : rivalHandleMat);
    stoneGroup.add(collar, bolt, handle, tip);

    const haloMat = new THREE.MeshBasicMaterial({
      color: isGold ? 0xffd75e : 0xff475c,
      transparent: true,
      opacity: isGold ? 0.42 : 0.24,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
    });
    ownedMaterials.push(haloMat);
    const haloMesh = new THREE.Mesh(haloGeo, haloMat);
    haloMesh.position.y = 0.032;
    stoneGroup.add(haloMesh);

    stoneGroup.position.set(spec.x, 0, spec.z);
    group.add(stoneGroup);

    return {
      id,
      team: spec.team,
      x: spec.x,
      z: spec.z,
      vx: 0,
      vz: 0,
      yaw: isGold ? 0 : Math.PI,
      angVel: 0,
      zone: classifyZone(spec.x, spec.z),
      group: stoneGroup,
      haloMat,
      haloMesh,
      bandMat,
    };
  };

  // Create initial 6 stones (3 gold, 3 rival)
  const initialSpecs = ROUND_CONFIGS[0].stones;
  for (let i = 0; i < initialSpecs.length; i++) {
    stones.push(createStone(i, initialSpecs[i]));
  }

  const resetForRound = (roundIndex: number) => {
    const cfg = ROUND_CONFIGS[Math.max(0, Math.min(ROUND_CONFIGS.length - 1, roundIndex))];
    for (let i = 0; i < stones.length; i++) {
      const s = stones[i];
      const spec = cfg.stones[i] ?? cfg.stones[0];
      s.x = spec.x;
      s.z = spec.z;
      s.vx = 0;
      s.vz = 0;
      s.yaw = spec.team === 'gold' ? (i - 1) * 0.25 : Math.PI + (i - 4) * 0.35;
      s.angVel = 0;
      s.zone = classifyZone(s.x, s.z);
      s.group.position.set(s.x, 0, s.z);
      s.group.rotation.y = s.yaw;
    }
  };

  const computeTally = (): CurlingHouseTally => {
    let goldInButton = 0;
    let goldInInner = 0;
    let goldInOuter = 0;
    let rivalInButton = 0;
    let rivalInInner = 0;
    let rivalInOuter = 0;

    for (const s of stones) {
      const z = classifyZone(s.x, s.z);
      if (s.team === 'gold') {
        if (z === 'button') goldInButton++;
        else if (z === 'inner') goldInInner++;
        else if (z === 'outer') goldInOuter++;
      } else {
        if (z === 'button') rivalInButton++;
        else if (z === 'inner') rivalInInner++;
        else if (z === 'outer') rivalInOuter++;
      }
    }

    const rawPoints =
      goldInButton * 1000 +
      goldInInner * 500 +
      goldInOuter * 250 -
      rivalInButton * 400 -
      rivalInInner * 250 -
      rivalInOuter * 150;

    return {
      totalPoints: Math.max(0, rawPoints),
      goldInButton,
      goldInInner,
      goldInOuter,
      rivalInButton,
      rivalInInner,
      rivalInOuter,
      goldScoringCount: goldInButton + goldInInner + goldInOuter,
      rivalThreatCount: rivalInButton + rivalInInner + rivalInOuter,
    };
  };

  const step: CurlingArena['step'] = (
    dt,
    time,
    playerX,
    playerZ,
    playerVx,
    playerVz,
    playerRadius,
    playerBoosting,
  ) => {
    const safeDt = Math.min(dt, 0.05);
    const collisions: CurlingCollisionEvent[] = [];
    const zonePromotions: { team: 'gold' | 'rival'; zone: StoneRingZone; pos: THREE.Vector3 }[] = [];

    let playerImpulseX = 0;
    let playerImpulseZ = 0;
    let playerPushOutX = 0;
    let playerPushOutZ = 0;

    // 1. Wheelchair-to-Stone impact physics (juicy billiard-style ramming!)
    const minPlayerDist = playerRadius + STONE_RADIUS;
    for (const s of stones) {
      const dx = s.x - playerX;
      const dz = s.z - playerZ;
      const distSq = dx * dx + dz * dz;
      if (distSq < minPlayerDist * minPlayerDist && distSq > 1e-6) {
        const dist = Math.sqrt(distSq);
        const nx = dx / dist;
        const nz = dz / dist;
        const overlap = minPlayerDist - dist;

        // Separate stone and wheelchair smoothly
        s.x += nx * overlap * 0.72;
        s.z += nz * overlap * 0.72;
        playerPushOutX -= nx * overlap * 0.28;
        playerPushOutZ -= nz * overlap * 0.28;

        const rvx = playerVx - s.vx;
        const rvz = playerVz - s.vz;
        const approach = rvx * nx + rvz * nz;

        if (approach > -0.2) {
          const hitStrength = Math.max(2.4, approach);
          const surgeMult = playerBoosting ? 1.82 : 1.42;
          const stoneKick = hitStrength * surgeMult;
          s.vx += nx * stoneKick;
          s.vz += nz * stoneKick;

          // Subtle realistic curling spin from grazing off-center strikes
          const tangVel = rvx * -nz + rvz * nx;
          s.angVel += THREE.MathUtils.clamp(tangVel * 0.32, -4.5, 4.5);

          // Tactile wheelchair recoil (lighter when boosting so player plows decisively)
          const recoil = hitStrength * (playerBoosting ? 0.26 : 0.42);
          playerImpulseX -= nx * recoil;
          playerImpulseZ -= nz * recoil;

          if (hitStrength > 2.5) {
            collisions.push({
              position: new THREE.Vector3(playerX + nx * playerRadius, 0.35, playerZ + nz * playerRadius),
              intensity: Math.min(1, hitStrength / 18),
              kind: 'player-stone',
              team: s.team,
            });
          }
        }
      }
    }

    // 2. Elastic Stone-on-Stone collisions (two passes for clean multi-stone chain reactions!)
    const minStoneDist = STONE_RADIUS * 2.0;
    const restitution = 0.88;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < stones.length; i++) {
        for (let j = i + 1; j < stones.length; j++) {
          const a = stones[i];
          const b = stones[j];
          const dx = b.x - a.x;
          const dz = b.z - a.z;
          const distSq = dx * dx + dz * dz;
          if (distSq < minStoneDist * minStoneDist && distSq > 1e-6) {
            const dist = Math.sqrt(distSq);
            const nx = dx / dist;
            const nz = dz / dist;
            const overlap = (minStoneDist - dist) * 0.5;
            a.x -= nx * overlap;
            a.z -= nz * overlap;
            b.x += nx * overlap;
            b.z += nz * overlap;

            const rvx = b.vx - a.vx;
            const rvz = b.vz - a.vz;
            const vn = rvx * nx + rvz * nz;
            if (vn < 0) {
              const jImp = -(1 + restitution) * vn * 0.5;
              a.vx -= nx * jImp;
              a.vz -= nz * jImp;
              b.vx += nx * jImp;
              b.vz += nz * jImp;

              // Transfer slight rotational curl
              const vt = rvx * -nz + rvz * nx;
              a.angVel -= vt * 0.18;
              b.angVel += vt * 0.18;

              if (pass === 0 && -vn > 1.0) {
                collisions.push({
                  position: new THREE.Vector3((a.x + b.x) * 0.5, 0.32, (a.z + b.z) * 0.5),
                  intensity: Math.min(1, -vn / 14),
                  kind: 'stone-stone',
                });
              }
            }
          }
        }
      }
    }

    // 3. Integrate glide on polished curling ice, curl curve, rink wall bounces & visual feedback
    let maxStoneSpeed = 0;
    const wallLimit = RINK_WALL_RADIUS - STONE_RADIUS - 0.15;

    for (const s of stones) {
      const speed = Math.hypot(s.vx, s.vz);
      if (speed > 0.04) {
        // Authentic subtle curling ice lateral hook from stone spin!
        const curlAccel = s.angVel * 0.16;
        const invSpd = 1 / speed;
        const perpX = -s.vz * invSpd;
        const perpZ = s.vx * invSpd;
        s.vx += perpX * curlAccel * safeDt;
        s.vz += perpZ * curlAccel * safeDt;

        // Low-friction polished pebble-ice glide with smooth final stop
        const drag = Math.exp(-0.54 * safeDt);
        s.vx *= drag;
        s.vz *= drag;
        const nextSpeed = Math.hypot(s.vx, s.vz);
        if (nextSpeed < 0.22) {
          const stopDecel = Math.max(0, 1 - 1.8 * safeDt);
          s.vx *= stopDecel;
          s.vz *= stopDecel;
        }

        s.x += s.vx * safeDt;
        s.z += s.vz * safeDt;
      } else {
        s.vx = 0;
        s.vz = 0;
      }

      s.angVel *= Math.exp(-0.85 * safeDt);
      s.yaw += s.angVel * safeDt;

      // Keep stones inside circular curling rink timber dasher boards (bank shots!)
      const rx = s.x;
      const rz = s.z - RINK_CENTER_Z;
      const rDist = Math.hypot(rx, rz);
      if (rDist > wallLimit) {
        const nx = rx / rDist;
        const nz = rz / rDist;
        s.x = nx * wallLimit;
        s.z = RINK_CENTER_Z + nz * wallLimit;
        const vn = s.vx * nx + s.vz * nz;
        if (vn > 0) {
          s.vx -= 1.68 * vn * nx;
          s.vz -= 1.68 * vn * nz;
          if (vn > 1.4) {
            collisions.push({
              position: new THREE.Vector3(s.x + nx * STONE_RADIUS * 0.6, 0.35, s.z + nz * STONE_RADIUS * 0.6),
              intensity: Math.min(1, vn / 14),
              kind: 'stone-wall',
            });
          }
        }
      }

      // Soft northern hog-line bumper so stones stay inside the curling arena
      if (s.z > -175.0) {
        s.z = -175.0;
        if (s.vz > 0) s.vz *= -0.65;
      }

      const finalSpd = Math.hypot(s.vx, s.vz);
      if (finalSpd > maxStoneSpeed) maxStoneSpeed = finalSpd;

      // Update zone & emit celebration cues when a stone enters/leaves scoring rings
      const prevZone = s.zone;
      const nextZone = classifyZone(s.x, s.z);
      s.zone = nextZone;

      const rank = (z: StoneRingZone) => (z === 'button' ? 3 : z === 'inner' ? 2 : z === 'outer' ? 1 : 0);
      if (s.team === 'gold' && rank(nextZone) > rank(prevZone)) {
        zonePromotions.push({ team: 'gold', zone: nextZone, pos: new THREE.Vector3(s.x, 0.5, s.z) });
      } else if (s.team === 'rival' && prevZone !== 'none' && nextZone === 'none') {
        zonePromotions.push({ team: 'rival', zone: 'none', pos: new THREE.Vector3(s.x, 0.5, s.z) });
      }

      // Sync visual transform + luminous scoring halo feedback
      s.group.position.set(s.x, 0, s.z);
      s.group.rotation.y = s.yaw;

      const pulse = 0.5 + 0.5 * Math.sin(time * 4.5 + s.id * 1.3);
      if (s.team === 'gold') {
        if (nextZone === 'button') {
          s.haloMat.color.setHex(0xffe566);
          s.haloMat.opacity = 0.72 + pulse * 0.25;
          s.haloMesh.scale.setScalar(1.06 + pulse * 0.08);
          s.bandMat.emissiveIntensity = 0.75 + pulse * 0.3;
        } else if (nextZone === 'inner') {
          s.haloMat.color.setHex(0xf8cf50);
          s.haloMat.opacity = 0.52 + pulse * 0.2;
          s.haloMesh.scale.setScalar(1.02 + pulse * 0.05);
          s.bandMat.emissiveIntensity = 0.52;
        } else if (nextZone === 'outer') {
          s.haloMat.color.setHex(0xdcb444);
          s.haloMat.opacity = 0.36 + pulse * 0.14;
          s.haloMesh.scale.setScalar(1.0);
          s.bandMat.emissiveIntensity = 0.4;
        } else {
          s.haloMat.color.setHex(0xffd75e);
          s.haloMat.opacity = 0.24 + pulse * 0.1;
          s.haloMesh.scale.setScalar(0.96);
          s.bandMat.emissiveIntensity = 0.32;
        }
      } else {
        if (nextZone !== 'none') {
          s.haloMat.color.setHex(0xff384f);
          s.haloMat.opacity = 0.45 + pulse * 0.3;
          s.haloMesh.scale.setScalar(1.03 + pulse * 0.06);
          s.bandMat.emissiveIntensity = 0.48 + pulse * 0.2;
        } else {
          s.haloMat.opacity = 0.08;
          s.haloMesh.scale.setScalar(0.92);
          s.bandMat.emissiveIntensity = 0.15;
        }
      }
    }

    return {
      playerImpulseX,
      playerImpulseZ,
      playerPushOutX,
      playerPushOutZ,
      collisions,
      zonePromotions,
      tally: computeTally(),
      maxStoneSpeed,
    };
  };

  const dispose = () => {
    for (const g of ownedGeometries) g.dispose();
    for (const m of ownedMaterials) m.dispose();
    for (const t of ownedTextures) t.dispose();
    ownedGeometries.length = 0;
    ownedMaterials.length = 0;
    ownedTextures.length = 0;
  };

  return {
    group,
    stones,
    resetForRound,
    step,
    computeTally,
    dispose,
  };
}
