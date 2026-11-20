import * as THREE from 'three';
import {
  COLORS,
  DESPAWN_Z,
  LANE_COUNT,
  LANE_WIDTH,
  PLAYER_Z,
  RAIL_HEIGHT,
  ROAD_WIDTH,
  SPAWN_Z,
  getLaneX,
} from './constants';

export type ObstacleKind = 'low_barrier' | 'drone_wall' | 'boss_wave';

export interface PrismEntity {
  active: boolean;
  lane: number;
  x: number;
  y: number;
  z: number;
  gold: boolean;
  mesh: THREE.Group;
  phase: number;
}

export interface ObstacleEntity {
  active: boolean;
  kind: ObstacleKind;
  lane: number; // ignored for boss_wave (spans all lanes)
  x: number;
  z: number;
  vaulted: boolean;
  mesh: THREE.Group;
}

export interface GrindRailEntity {
  active: boolean;
  lane: number;
  x: number;
  zCenter: number;
  length: number;
  mesh: THREE.Group;
}

export interface EntityUpdateEvents {
  prismsCollected: number;
  goldPrismsCollected: number;
  prismCollectPositions: THREE.Vector3[];
  obstaclesHit: number;
  hitPositions: THREE.Vector3[];
  barriersVaulted: number;
  wavesVaulted: number;
  obstaclesShattered: number;
  shatterPositions: THREE.Vector3[];
  bossTelegraphLanes: number[] | null;
  bossWaveLaunched: boolean;
}

export interface ActiveRailMatch {
  lane: number;
  x: number;
  height: number;
}

export interface EntityManager {
  group: THREE.Group;
  /** Spawn beat-synced patterns based on beat count & current boss phase */
  onBeat(beatIndex: number, phase: number, speed: number, bossDefeated: boolean): number[] | null;
  /** Pre-populate a welcoming rhythmic opening highway so frame 1 is rich and playable */
  populateOpeningRunway(): void;
  /** Trigger the expanding electric cyan-magenta EMP shockwave dome from player position */
  triggerEmpShockwave(originX: number, originY: number): void;
  /** Check if player is currently over an active grind rail */
  findGrindRail(playerX: number, playerY: number, playerVy: number): ActiveRailMatch | null;
  /** Advance all entities, check collisions/vaults/EMP shattering */
  update(
    dt: number,
    elapsed: number,
    opts: {
      speed: number;
      beatPulse: number;
      playerX: number;
      playerY: number;
      playerInvuln: boolean;
      overdrive: boolean;
    }
  ): EntityUpdateEvents;
  reset(): void;
}

const EMP_DOME_VERTEX = /* glsl */ `
  varying vec3 vNormalView;
  varying vec3 vViewDir;
  varying vec3 vLocalPos;
  void main() {
    vLocalPos = position;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vNormalView = normalize(normalMatrix * normal);
    vViewDir = normalize(-mvPos.xyz);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const EMP_DOME_FRAGMENT = /* glsl */ `
  uniform float uProgress;
  uniform float uTime;
  varying vec3 vNormalView;
  varying vec3 vViewDir;
  varying vec3 vLocalPos;
  void main() {
    float fresnel = pow(1.0 - abs(dot(normalize(vNormalView), normalize(vViewDir))), 2.2);
    float rings = 0.5 + 0.5 * sin(vLocalPos.y * 18.0 - uTime * 22.0);
    vec3 cyan = vec3(0.0, 0.96, 1.0);
    vec3 magenta = vec3(1.0, 0.2, 0.72);
    vec3 col = mix(cyan, magenta, rings * 0.55 + uProgress * 0.4);
    float fade = (1.0 - uProgress) * (1.0 - uProgress * 0.45);
    float alpha = clamp((fresnel * 1.15 + rings * 0.22) * fade, 0.0, 0.92);
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(col * 1.5, alpha);
  }
`;

export function createEntityManager(): EntityManager {
  const group = new THREE.Group();
  group.name = 'SynthEntities';

  // -------------------------------------------------------------------------
  // Shared Geometries & Materials (Zero per-frame GPU allocation)
  // -------------------------------------------------------------------------
  const darkChromeMat = new THREE.MeshStandardMaterial({
    color: 0x181034,
    metalness: 0.85,
    roughness: 0.22,
    envMapIntensity: 1.6,
  });
  const brightChromeMat = new THREE.MeshStandardMaterial({
    color: COLORS.chrome,
    metalness: 0.92,
    roughness: 0.14,
    envMapIntensity: 1.9,
  });

  // Prism materials
  const prismCyanMat = new THREE.MeshStandardMaterial({
    color: COLORS.cyan,
    emissive: COLORS.cyan,
    emissiveIntensity: 2.3,
    roughness: 0.12,
    metalness: 0.35,
  });
  const prismGoldMat = new THREE.MeshStandardMaterial({
    color: COLORS.gold,
    emissive: COLORS.gold,
    emissiveIntensity: 2.5,
    roughness: 0.12,
    metalness: 0.45,
  });
  const prismHaloMat = new THREE.MeshBasicMaterial({
    color: COLORS.magenta,
    transparent: true,
    opacity: 0.72,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  // Barrier & Drone materials
  const laserMat = new THREE.MeshStandardMaterial({
    color: COLORS.crimson,
    emissive: COLORS.crimson,
    emissiveIntensity: 3.1,
    roughness: 0.15,
  });
  const warningStripMat = new THREE.MeshBasicMaterial({
    color: COLORS.magenta,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const droneVisorMat = new THREE.MeshStandardMaterial({
    color: 0xff2a6d,
    emissive: 0xff2a6d,
    emissiveIntensity: 3.2,
    roughness: 0.12,
  });
  const waveMat = new THREE.MeshBasicMaterial({
    color: 0xff3b9a,
    transparent: true,
    opacity: 0.86,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const waveCoreMat = new THREE.MeshStandardMaterial({
    color: 0xffd166,
    emissive: 0xff4da6,
    emissiveIntensity: 3.2,
    roughness: 0.15,
  });

  // Grind Rail materials
  const railBeamMat = new THREE.MeshStandardMaterial({
    color: COLORS.cyan,
    emissive: COLORS.cyan,
    emissiveIntensity: 2.6,
    roughness: 0.12,
    metalness: 0.3,
  });
  const railGlowMat = new THREE.MeshBasicMaterial({
    color: COLORS.cyan,
    transparent: true,
    opacity: 0.45,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const railEntryMat = new THREE.MeshStandardMaterial({
    color: COLORS.gold,
    emissive: COLORS.gold,
    emissiveIntensity: 2.8,
    roughness: 0.15,
  });

  // Shared Geometries
  const prismGeo = new THREE.OctahedronGeometry(0.46, 0);
  const prismRingGeo = new THREE.TorusGeometry(0.66, 0.04, 8, 20);
  const pylonGeo = new THREE.BoxGeometry(0.24, 1.05, 0.28);
  const beamCylGeo = new THREE.CylinderGeometry(0.06, 0.06, LANE_WIDTH - 0.35, 10);
  beamCylGeo.rotateZ(Math.PI * 0.5);
  const warnPlaneGeo = new THREE.PlaneGeometry(LANE_WIDTH - 0.3, 1.45);
  warnPlaneGeo.rotateX(-Math.PI * 0.5);

  const droneBodyGeo = new THREE.BoxGeometry(1.92, 2.35, 0.95);
  const droneCrownGeo = new THREE.OctahedronGeometry(0.55, 0);
  const droneVisorGeo = new THREE.BoxGeometry(1.66, 0.36, 0.24);
  const droneFinGeo = new THREE.BoxGeometry(0.18, 1.4, 0.72);
  const droneBarGeo = new THREE.CylinderGeometry(0.05, 0.05, 2.55, 8);

  const waveTubeGeo = new THREE.CylinderGeometry(0.16, 0.16, ROAD_WIDTH - 0.8, 12);
  waveTubeGeo.rotateZ(Math.PI * 0.5);
  const waveCurtainGeo = new THREE.PlaneGeometry(ROAD_WIDTH - 0.8, 0.72);

  // -------------------------------------------------------------------------
  // Entity Pools
  // -------------------------------------------------------------------------
  const prisms: PrismEntity[] = [];
  const PRISM_POOL_SIZE = 72;
  for (let i = 0; i < PRISM_POOL_SIZE; i++) {
    const holder = new THREE.Group();
    const crystal = new THREE.Mesh(prismGeo, prismCyanMat);
    crystal.scale.set(0.85, 1.28, 0.85);
    crystal.name = 'crystal';
    const halo = new THREE.Mesh(prismRingGeo, prismHaloMat);
    halo.name = 'halo';
    holder.add(crystal, halo);
    holder.visible = false;
    group.add(holder);
    prisms.push({
      active: false,
      lane: 2,
      x: 0,
      y: 0.95,
      z: 20,
      gold: false,
      mesh: holder,
      phase: i * 0.65,
    });
  }

  const obstacles: ObstacleEntity[] = [];
  const buildObstacleMesh = (kind: ObstacleKind): THREE.Group => {
    const g = new THREE.Group();
    if (kind === 'low_barrier') {
      const halfSpan = (LANE_WIDTH - 0.32) * 0.5;
      for (const s of [-1, 1]) {
        const p = new THREE.Mesh(pylonGeo, darkChromeMat);
        p.position.set(s * halfSpan, 0.52, 0);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.32), laserMat);
        cap.position.set(s * halfSpan, 1.05, 0);
        g.add(p, cap);
      }
      const b1 = new THREE.Mesh(beamCylGeo, laserMat);
      b1.position.y = 0.42;
      const b2 = new THREE.Mesh(beamCylGeo, laserMat);
      b2.position.y = 0.78;
      const warn = new THREE.Mesh(warnPlaneGeo, warningStripMat);
      warn.position.set(0, 0.03, 0.95);
      g.add(b1, b2, warn);
    } else if (kind === 'drone_wall') {
      const body = new THREE.Mesh(droneBodyGeo, darkChromeMat);
      body.position.y = 1.48;
      const visor = new THREE.Mesh(droneVisorGeo, droneVisorMat);
      visor.position.set(0, 1.78, 0.44);
      const lowerVisor = new THREE.Mesh(droneVisorGeo, laserMat);
      lowerVisor.scale.set(0.8, 0.45, 0.9);
      lowerVisor.position.set(0, 0.95, 0.44);
      const crown = new THREE.Mesh(droneCrownGeo, brightChromeMat);
      crown.position.set(0, 2.82, 0);
      crown.scale.set(1.25, 0.65, 0.85);
      g.add(body, visor, lowerVisor, crown);

      for (const s of [-1, 1]) {
        const fin = new THREE.Mesh(droneFinGeo, brightChromeMat);
        fin.position.set(s * 1.05, 1.55, 0);
        fin.rotation.z = s * -0.15;
        const bar = new THREE.Mesh(droneBarGeo, droneVisorMat);
        bar.position.set(s * 0.94, 1.32, 0.42);
        g.add(fin, bar);
      }
    } else {
      // Wide Boss Energy Wave (low jumpable glowing laser sweeper spanning all 5 lanes!)
      const tube = new THREE.Mesh(waveTubeGeo, waveCoreMat);
      tube.position.y = 0.72;
      const curtain = new THREE.Mesh(waveCurtainGeo, waveMat);
      curtain.position.y = 0.38;
      const trail = new THREE.Mesh(
        new THREE.PlaneGeometry(ROAD_WIDTH - 0.8, 1.75),
        warningStripMat
      );
      trail.rotation.x = -Math.PI * 0.5;
      trail.position.set(0, 0.035, 0.95);
      g.add(tube, curtain, trail);
    }
    return g;
  };

  // Pre-allocate pooled obstacles: 18 low barriers, 16 drone walls, 4 boss waves
  const poolSpec: [ObstacleKind, number][] = [
    ['low_barrier', 18],
    ['drone_wall', 16],
    ['boss_wave', 4],
  ];
  for (const [kind, count] of poolSpec) {
    for (let i = 0; i < count; i++) {
      const m = buildObstacleMesh(kind);
      m.visible = false;
      group.add(m);
      obstacles.push({
        active: false,
        kind,
        lane: 2,
        x: 0,
        z: 20,
        vaulted: false,
        mesh: m,
      });
    }
  }

  // Pre-allocate 6 Elevated Glowing Neon Grind Rails (unit-length scaled along Z)
  const rails: GrindRailEntity[] = [];
  const railBeamGeo = new THREE.BoxGeometry(0.32, 0.16, 1.0);
  const railHaloGeo = new THREE.BoxGeometry(0.62, 0.28, 1.0);
  const railStanchionGeo = new THREE.BoxGeometry(0.18, RAIL_HEIGHT, 0.26);
  const railChevronGeo = new THREE.ConeGeometry(0.38, 0.9, 4);
  railChevronGeo.rotateX(Math.PI * 0.5);

  for (let i = 0; i < 6; i++) {
    const railGroup = new THREE.Group();

    const beam = new THREE.Mesh(railBeamGeo, railBeamMat);
    beam.position.y = RAIL_HEIGHT;
    beam.name = 'beam';

    const halo = new THREE.Mesh(railHaloGeo, railGlowMat);
    halo.position.y = RAIL_HEIGHT;
    halo.name = 'halo';

    const frontStanchion = new THREE.Mesh(railStanchionGeo, darkChromeMat);
    frontStanchion.name = 'stanchionFront';
    frontStanchion.position.set(0, RAIL_HEIGHT * 0.5, 0.45);

    const midStanchion = new THREE.Mesh(railStanchionGeo, darkChromeMat);
    midStanchion.position.set(0, RAIL_HEIGHT * 0.5, 0);

    const backStanchion = new THREE.Mesh(railStanchionGeo, darkChromeMat);
    backStanchion.name = 'stanchionBack';
    backStanchion.position.set(0, RAIL_HEIGHT * 0.5, -0.45);

    const entryChevron = new THREE.Mesh(railChevronGeo, railEntryMat);
    entryChevron.name = 'entryChevron';
    entryChevron.position.set(0, RAIL_HEIGHT + 0.18, 0.52);

    railGroup.add(beam, halo, frontStanchion, midStanchion, backStanchion, entryChevron);
    railGroup.visible = false;
    group.add(railGroup);

    rails.push({
      active: false,
      lane: 2,
      x: 0,
      zCenter: 20,
      length: 22,
      mesh: railGroup,
    });
  }

  // -------------------------------------------------------------------------
  // EMP Shockwave Expanding Dome + Ground Shock Ring
  // -------------------------------------------------------------------------
  const empUniforms = {
    uProgress: { value: 1 },
    uTime: { value: 0 },
  };
  const empDomeMat = new THREE.ShaderMaterial({
    uniforms: empUniforms,
    vertexShader: EMP_DOME_VERTEX,
    fragmentShader: EMP_DOME_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const empDomeGeo = new THREE.SphereGeometry(1, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.52);
  const empDome = new THREE.Mesh(empDomeGeo, empDomeMat);
  empDome.visible = false;
  group.add(empDome);

  const empRingMat = new THREE.MeshBasicMaterial({
    color: COLORS.cyan,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const empRingGeo = new THREE.RingGeometry(0.84, 1.0, 42);
  empRingGeo.rotateX(-Math.PI * 0.5);
  const empRing = new THREE.Mesh(empRingGeo, empRingMat);
  empRing.visible = false;
  group.add(empRing);

  let empActive = false;
  let empElapsed = 0;
  const empDuration = 0.85;
  const empMaxRadius = 66;
  let empOriginX = 0;
  let empOriginY = 0.5;
  let currentPrismLane = 2;

  // -------------------------------------------------------------------------
  // Spawn Helpers
  // -------------------------------------------------------------------------
  const spawnPrism = (lane: number, z: number, y = 0.95, gold = false): void => {
    const slot = prisms.find((p) => !p.active);
    if (!slot) return;
    slot.active = true;
    slot.lane = lane;
    slot.x = getLaneX(lane);
    slot.y = y;
    slot.z = z;
    slot.gold = gold;
    const crystal = slot.mesh.getObjectByName('crystal') as THREE.Mesh | undefined;
    if (crystal) {
      crystal.material = gold ? prismGoldMat : prismCyanMat;
    }
    slot.mesh.position.set(slot.x, slot.y, slot.z);
    slot.mesh.visible = true;
  };

  const spawnObstacle = (kind: ObstacleKind, lane: number, z: number): void => {
    const slot = obstacles.find((o) => !o.active && o.kind === kind);
    if (!slot) return;
    slot.active = true;
    slot.lane = lane;
    slot.x = kind === 'boss_wave' ? 0 : getLaneX(lane);
    slot.z = z;
    slot.vaulted = false;
    slot.mesh.position.set(slot.x, 0, slot.z);
    slot.mesh.visible = true;
  };

  const spawnRail = (lane: number, zStart: number, length: number): void => {
    const slot = rails.find((r) => !r.active);
    if (!slot) return;
    slot.active = true;
    slot.lane = lane;
    slot.x = getLaneX(lane);
    slot.length = length;
    slot.zCenter = zStart - length * 0.5;

    const beam = slot.mesh.getObjectByName('beam');
    const halo = slot.mesh.getObjectByName('halo');
    const sFront = slot.mesh.getObjectByName('stanchionFront');
    const sBack = slot.mesh.getObjectByName('stanchionBack');
    const chevron = slot.mesh.getObjectByName('entryChevron');

    if (beam) beam.scale.set(1, 1, length);
    if (halo) halo.scale.set(1, 1, length);
    if (sFront) sFront.position.z = length * 0.45;
    if (sBack) sBack.position.z = -length * 0.45;
    if (chevron) chevron.position.z = length * 0.5 + 0.55;

    slot.mesh.position.set(slot.x, 0, slot.zCenter);
    slot.mesh.visible = true;

    // Line the grind rail with golden high-value prisms!
    const count = Math.max(3, Math.floor(length / 4.8));
    for (let i = 0; i < count; i++) {
      const pz = zStart - 2.2 - i * ((length - 4.4) / Math.max(1, count - 1));
      spawnPrism(lane, pz, RAIL_HEIGHT + 0.9, true);
    }
  };

  const hasRailOverlap = (lane: number, z: number, margin = 12): boolean => {
    for (const r of rails) {
      if (!r.active || r.lane !== lane) continue;
      const half = r.length * 0.5 + margin;
      if (Math.abs(r.zCenter - z) < half) return true;
    }
    return false;
  };

  const populateOpeningRunway = (): void => {
    // Welcoming center melody of glowing cyan prisms right ahead of figurine
    spawnPrism(2, -22, 0.95, false);
    spawnPrism(2, -30, 0.95, false);
    spawnPrism(2, -38, 0.95, false);

    // First jumpable low laser barrier in center lane with gold arc prisms overhead
    spawnObstacle('low_barrier', 2, -54);
    spawnPrism(2, -54, 2.35, true);
    spawnObstacle('drone_wall', 0, -54);
    spawnObstacle('drone_wall', 4, -54);

    // Inviting gleaming Neon Grind Rail in lane 3 with golden prisms & low barrier underneath!
    spawnRail(3, -68, 24);
    spawnObstacle('low_barrier', 3, -80);

    // Weave ribbon in lanes 1 -> 2 -> 3 ahead
    spawnPrism(1, -76, 0.95, false);
    spawnPrism(1, -84, 0.95, false);
    spawnObstacle('drone_wall', 2, -104);
    spawnObstacle('low_barrier', 1, -104);
    spawnPrism(1, -104, 2.3, true);
    spawnRail(1, -118, 22);
    currentPrismLane = 1;
  };

  const onBeat = (beatIndex: number, phase: number, speed: number, bossDefeated: boolean): number[] | null => {
    const safeSpeed = Math.max(30, speed);
    let telegraphLanes: number[] | null = null;

    // 1. Melodic beat-synced Synth Prisms every beat (smoothly weaving across adjacent lanes)
    if (beatIndex % 2 === 0 && !hasRailOverlap(currentPrismLane, SPAWN_Z, 8)) {
      spawnPrism(currentPrismLane, SPAWN_Z, 0.95, false);
      // Drift prism ribbon 1 lane left/right occasionally for flowing slalom rhythm
      if (beatIndex % 6 === 0) {
        const delta = Math.random() < 0.5 ? -1 : 1;
        currentPrismLane = Math.max(0, Math.min(LANE_COUNT - 1, currentPrismLane + delta));
      }
    }

    // 2. Elevated Glowing Neon Grind Rails every 10 beats
    if (beatIndex > 0 && beatIndex % 10 === 4) {
      const railLane = Math.floor(Math.random() * LANE_COUNT);
      if (!hasRailOverlap(railLane, SPAWN_Z - 12, 16)) {
        const railLen = 20 + (beatIndex % 3) * 4;
        spawnRail(railLane, SPAWN_Z, railLen);
        // Occasionally add a low laser barrier right beneath the mid-rail for stylish rail-over-laser flair!
        if (Math.random() < 0.65) {
          spawnObstacle('low_barrier', railLane, SPAWN_Z - railLen * 0.5);
        }
      }
    }

    // 3. Boss Energy Wave Sweeper (jump over all 5 lanes!) — cadence intensifies by boss phase!
    const waveEveryBeats = phase >= 3 ? 12 : phase === 2 ? 15 : 18;
    if (!bossDefeated && beatIndex >= 8 && beatIndex % waveEveryBeats === 0) {
      spawnObstacle('boss_wave', 2, SPAWN_Z + 12);
      // Place rewarding gold jump-arc prism right above wave in current prism lane
      spawnPrism(currentPrismLane, SPAWN_Z + 12, 2.35, true);
      telegraphLanes = [0, 2, 4];
      return telegraphLanes;
    }

    // 4. Structured Fair Hazard Formations (every 4 beats, faster in Phase 3)
    const hazardCadence = phase >= 3 ? 3 : 4;
    if (beatIndex >= 4 && beatIndex % hazardCadence === 0) {
      // Pick 1–2 guaranteed open weave lanes (preferring currentPrismLane or adjacent)
      const openLane = currentPrismLane;
      const pattern = beatIndex % 5;

      if (pattern === 0) {
        // Twin flanking drone walls + jumpable center low barrier
        const mid = Math.max(1, Math.min(3, openLane));
        if (!hasRailOverlap(mid, SPAWN_Z, 8)) {
          spawnObstacle('low_barrier', mid, SPAWN_Z);
          spawnPrism(mid, SPAWN_Z, 2.3, true);
        }
        const leftL = mid - 1;
        const rightL = mid + 1;
        if (!hasRailOverlap(leftL, SPAWN_Z, 10)) spawnObstacle('drone_wall', leftL, SPAWN_Z);
        if (!hasRailOverlap(rightL, SPAWN_Z, 10)) spawnObstacle('drone_wall', rightL, SPAWN_Z);
        telegraphLanes = [leftL, rightL];
      } else if (pattern === 1) {
        // Staggered drone slalom wall leaving 2–3 crisp open lanes
        const blocked: number[] = [];
        const wallCount = phase >= 2 ? 3 : 2;
        for (let k = 0; k < wallCount; k++) {
          const cand = (openLane + 1 + k * 2) % LANE_COUNT;
          if (cand !== openLane && !hasRailOverlap(cand, SPAWN_Z, 10)) {
            spawnObstacle('drone_wall', cand, SPAWN_Z);
            blocked.push(cand);
          }
        }
        if (blocked.length > 0) telegraphLanes = blocked;
      } else if (pattern === 2) {
        // Wide jumpable laser barrier line (3 adjacent lanes) with gold prisms overhead
        const start = Math.max(0, Math.min(2, openLane - 1));
        for (let l = start; l < start + 3; l++) {
          if (!hasRailOverlap(l, SPAWN_Z, 8)) {
            spawnObstacle('low_barrier', l, SPAWN_Z);
          }
        }
        spawnPrism(start + 1, SPAWN_Z, 2.35, true);
        telegraphLanes = [start, start + 2];
      } else {
        // Drone gate + adjacent low jump barrier
        const droneA = (openLane + 2) % LANE_COUNT;
        const droneB = (openLane + 3) % LANE_COUNT;
        if (!hasRailOverlap(droneA, SPAWN_Z, 10)) spawnObstacle('drone_wall', droneA, SPAWN_Z);
        if (phase >= 2 && !hasRailOverlap(droneB, SPAWN_Z, 10)) {
          spawnObstacle('drone_wall', droneB, SPAWN_Z);
        }
        const lowLane = (openLane + 1) % LANE_COUNT;
        if (!hasRailOverlap(lowLane, SPAWN_Z, 8)) {
          spawnObstacle('low_barrier', lowLane, SPAWN_Z);
          spawnPrism(lowLane, SPAWN_Z, 2.3, true);
        }
        telegraphLanes = [droneA];
      }
    }

    void safeSpeed;
    return telegraphLanes;
  };

  const triggerEmpShockwave = (originX: number, originY: number): void => {
    empActive = true;
    empElapsed = 0;
    empOriginX = originX;
    empOriginY = originY;
    empDome.visible = true;
    empRing.visible = true;
    empDome.position.set(originX, 0.05, PLAYER_Z);
    empRing.position.set(originX, 0.08, PLAYER_Z);
    empDome.scale.setScalar(1);
    empRing.scale.setScalar(1);
  };

  const findGrindRail = (playerX: number, playerY: number, playerVy: number): ActiveRailMatch | null => {
    for (const r of rails) {
      if (!r.active) continue;
      const halfLen = r.length * 0.5;
      // Player must overlap rail longitudinally and laterally
      if (PLAYER_Z > r.zCenter + halfLen + 0.4 || PLAYER_Z < r.zCenter - halfLen - 0.3) continue;
      if (Math.abs(playerX - r.x) > 1.05) continue;
      // Lock onto rail if descending or already riding near rail height
      if (playerY >= RAIL_HEIGHT - 0.36 && playerY <= RAIL_HEIGHT + 0.72 && playerVy <= 3.2) {
        return { lane: r.lane, x: r.x, height: RAIL_HEIGHT };
      }
    }
    return null;
  };

  const update = (
    dt: number,
    elapsed: number,
    opts: {
      speed: number;
      beatPulse: number;
      playerX: number;
      playerY: number;
      playerInvuln: boolean;
      overdrive: boolean;
    }
  ): EntityUpdateEvents => {
    const { speed, beatPulse, playerX, playerY, playerInvuln, overdrive } = opts;
    const dz = speed * dt;

    const events: EntityUpdateEvents = {
      prismsCollected: 0,
      goldPrismsCollected: 0,
      prismCollectPositions: [],
      obstaclesHit: 0,
      hitPositions: [],
      barriersVaulted: 0,
      wavesVaulted: 0,
      obstaclesShattered: 0,
      shatterPositions: [],
      bossTelegraphLanes: null,
      bossWaveLaunched: false,
    };

    // 1. Advance EMP Shockwave Dome
    let empRadius = 0;
    if (empActive) {
      empElapsed += dt;
      const t = Math.min(1, empElapsed / empDuration);
      const eased = 1 - Math.pow(1 - t, 2.4);
      empRadius = 1 + eased * empMaxRadius;

      empDome.position.set(empOriginX, Math.max(0.05, empOriginY * (1 - t)), PLAYER_Z);
      empDome.scale.setScalar(empRadius);
      empUniforms.uProgress.value = t;
      empUniforms.uTime.value = elapsed;

      empRing.position.set(empOriginX, 0.08, PLAYER_Z);
      empRing.scale.setScalar(empRadius * 1.08);
      empRingMat.opacity = (1 - t) * 0.85;

      if (t >= 1) {
        empActive = false;
        empDome.visible = false;
        empRing.visible = false;
      }
    }

    // Pulse shared emissive intensities subtly on the 120 BPM beat
    laserMat.emissiveIntensity = 2.6 + beatPulse * 1.4;
    droneVisorMat.emissiveIntensity = 2.5 + beatPulse * 1.5;
    railBeamMat.emissiveIntensity = 2.2 + beatPulse * 1.1;

    // 2. Update & collect Synth Prisms
    for (const p of prisms) {
      if (!p.active) continue;
      p.z += dz;
      const bobY = p.y + Math.sin(elapsed * 4.5 + p.phase) * 0.14;
      p.mesh.position.set(p.x, bobY, p.z);

      const crystal = p.mesh.getObjectByName('crystal');
      const halo = p.mesh.getObjectByName('halo');
      if (crystal) crystal.rotation.y = elapsed * 2.8 + p.phase;
      if (halo) {
        halo.rotation.x = Math.PI * 0.35 + Math.sin(elapsed * 2.2 + p.phase) * 0.35;
        halo.rotation.y = -elapsed * 2.1 + p.phase;
      }

      // Generous magnetic pickup volume around wheelchair figurine
      const dx = Math.abs(p.x - playerX);
      const dy = Math.abs(bobY - (playerY + 0.82));
      const dzPlayer = Math.abs(p.z - PLAYER_Z);
      const pickupRadiusX = overdrive ? 2.4 : 1.55;
      if (dzPlayer < 1.85 && dx < pickupRadiusX && dy < 1.55) {
        p.active = false;
        p.mesh.visible = false;
        events.prismsCollected++;
        if (p.gold) events.goldPrismsCollected++;
        events.prismCollectPositions.push(new THREE.Vector3(p.x, bobY, PLAYER_Z));
        continue;
      }

      if (p.z > DESPAWN_Z) {
        p.active = false;
        p.mesh.visible = false;
      }
    }

    // 3. Update Grind Rails
    for (const r of rails) {
      if (!r.active) continue;
      r.zCenter += dz;
      r.mesh.position.z = r.zCenter;
      const chevron = r.mesh.getObjectByName('entryChevron');
      if (chevron) {
        chevron.position.y = RAIL_HEIGHT + 0.2 + Math.sin(elapsed * 8) * 0.08;
      }
      if (r.zCenter - r.length * 0.5 > DESPAWN_Z) {
        r.active = false;
        r.mesh.visible = false;
      }
    }

    // 4. Update Obstacles + EMP Shatter + Vault Bonus + Player Collision
    for (const o of obstacles) {
      if (!o.active) continue;
      const moveMul = o.kind === 'boss_wave' ? 1.24 : 1.0;
      o.z += dz * moveMul;
      o.mesh.position.z = o.z;

      // EMP shockwave shatters ANY active obstacle in front of the player!
      if (empActive && o.z <= PLAYER_Z + 2.0 && o.z >= PLAYER_Z - empRadius) {
        o.active = false;
        o.mesh.visible = false;
        events.obstaclesShattered++;
        events.shatterPositions.push(new THREE.Vector3(o.x, o.kind === 'drone_wall' ? 1.5 : 0.75, o.z));
        continue;
      }

      // Check longitudinal overlap with player wheelchair
      const zHitHalf = o.kind === 'drone_wall' ? 1.05 : 0.78;
      if (Math.abs(o.z - PLAYER_Z) < zHitHalf) {
        const laneMatch = o.kind === 'boss_wave' || Math.abs(o.x - playerX) < 1.12;
        if (laneMatch) {
          const clearedByJump =
            (o.kind === 'low_barrier' && playerY >= 0.74) ||
            (o.kind === 'boss_wave' && playerY >= 0.68);

          if (clearedByJump) {
            if (!o.vaulted) {
              o.vaulted = true;
              if (o.kind === 'boss_wave') events.wavesVaulted++;
              else events.barriersVaulted++;
            }
          } else if (overdrive) {
            // Overdrive Surge plows straight through hazards in a shower of sparks!
            o.active = false;
            o.mesh.visible = false;
            events.obstaclesShattered++;
            events.shatterPositions.push(new THREE.Vector3(o.x, 1.0, o.z));
            continue;
          } else if (!playerInvuln) {
            o.active = false;
            o.mesh.visible = false;
            events.obstaclesHit++;
            events.hitPositions.push(new THREE.Vector3(playerX, playerY + 0.85, PLAYER_Z));
            continue;
          }
        }
      }

      if (o.z > DESPAWN_Z) {
        o.active = false;
        o.mesh.visible = false;
      }
    }

    return events;
  };

  const reset = (): void => {
    for (const p of prisms) {
      p.active = false;
      p.mesh.visible = false;
    }
    for (const o of obstacles) {
      o.active = false;
      o.mesh.visible = false;
      o.vaulted = false;
    }
    for (const r of rails) {
      r.active = false;
      r.mesh.visible = false;
    }
    empActive = false;
    empElapsed = 0;
    empDome.visible = false;
    empRing.visible = false;
    currentPrismLane = 2;
  };

  return {
    group,
    onBeat,
    populateOpeningRunway,
    triggerEmpShockwave,
    findGrindRail,
    update,
    reset,
  };
}
