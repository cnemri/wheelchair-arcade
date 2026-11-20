import * as THREE from 'three';
import {
  BRIDGE_CENTER_X,
  BRIDGE_HALF_LEN,
  BRIDGE_HALF_WIDTH,
  BRIDGE_Z,
  CLOVER_PATCHES,
  FORD_CENTER_X,
  FORD_Z,
  PADDOCK_GATE_POS,
  PADDOCK_GATE_Z_MAX,
  PADDOCK_GATE_Z_MIN,
  PADDOCK_MAX_X,
  PADDOCK_MAX_Z,
  PADDOCK_MIN_X,
  PADDOCK_MIN_Z,
  bridgeLocalToWorld,
  isInWater,
  streamCenterX,
  surfaceHeightAt,
  wallRadiusAtAngle,
  worldToBridgeLocal,
  type ObstacleBox,
  type ObstacleCircle,
} from './terrain';

export interface SheepEntity {
  id: number;
  golden: boolean;
  group: THREE.Group;
  bodyPivot: THREE.Group;
  headPivot: THREE.Group;
  earL: THREE.Object3D;
  earR: THREE.Object3D;
  legs: THREE.Object3D[];
  tail: THREE.Object3D;
  haloMesh: THREE.Mesh | null;
  pos: THREE.Vector3;
  vel: THREE.Vector2;
  yaw: number;
  penned: boolean;
  hopPhase: number;
  grazeTimer: number;
  wanderAngle: number;
  bellAlertTimer: number;
  cloverIgnoreTimer: number;
  celebrateTimer: number;
  spookTimer: number;
  eatingClover: boolean;
}

export interface FoxEntity {
  group: THREE.Group;
  bodyPivot: THREE.Group;
  tailPivot: THREE.Group;
  legs: THREE.Object3D[];
  pos: THREE.Vector3;
  vel: THREE.Vector2;
  yaw: number;
  waypointIdx: number;
  scaredTimer: number;
  hopPhase: number;
  nearSheep: boolean;
}

export interface FlockCallbacks {
  onSheepPenned: (sheep: SheepEntity) => void;
  onFoxShooed: (pos: THREE.Vector3) => void;
  onFoxSpookWarning: () => void;
}

export interface FlockSystem {
  group: THREE.Group;
  sheep: SheepEntity[];
  fox: FoxEntity;
  pennedCount(): number;
  goldenPennedCount(): number;
  ringBell(origin: THREE.Vector3, forwardDir: THREE.Vector2): {
    herdedCount: number;
    shooedFox: boolean;
  };
  nearestUnpennedSheep(from: THREE.Vector3): SheepEntity | null;
  update(
    dt: number,
    elapsed: number,
    playerPos: THREE.Vector3,
    playerVel: THREE.Vector2,
    obstaclesCircles: ObstacleCircle[],
    obstaclesBoxes: ObstacleBox[],
  ): void;
  reset(): void;
}

// ---------------------------------------------------------------------------
// Starting Flock Layout (12 expressive sheep: 10 classic + 2 prize golden!)
// ---------------------------------------------------------------------------

const SHEEP_SPAWNS: readonly { x: number; z: number; golden?: boolean }[] = [
  // Near-center foreground grazing group (immediately visible on frame 1!)
  { x: -3.2, z: 11.4 },
  { x: 1.4, z: 11.8 },
  { x: -0.9, z: 7.4 },
  // Sunlit eastern pasture across the arched footbridge
  { x: 14.2, z: 4.4 },
  { x: 17.4, z: 1.6, golden: true }, // Golden Fleece #1!
  { x: 20.8, z: 6.4 },
  { x: 16.4, z: 14.6 },
  // Northeast clover & ford group
  { x: 16.8, z: -9.4 },
  { x: 22.6, z: -13.2 },
  { x: 11.2, z: -15.4 },
  // Northern windmill ridge group
  { x: -5.4, z: -14.2 },
  { x: -14.8, z: -16.4, golden: true }, // Golden Fleece #2!
];

const FOX_WAYPOINTS: readonly [number, number][] = [
  [27.5, 13.5],
  [28.5, -3.5],
  [23.5, -21.0],
  [7.5, -26.5],
  [18.5, -16.5],
  [24.5, 4.0],
];

// ---------------------------------------------------------------------------
// Handcrafted Multi-Part 3D Sheep Builder (facing -Z)
// ---------------------------------------------------------------------------

function createSheepModel(id: number, golden: boolean): {
  group: THREE.Group;
  bodyPivot: THREE.Group;
  headPivot: THREE.Group;
  earL: THREE.Object3D;
  earR: THREE.Object3D;
  legs: THREE.Object3D[];
  tail: THREE.Object3D;
  haloMesh: THREE.Mesh | null;
} {
  const group = new THREE.Group();
  group.name = golden ? `golden_sheep_${id}` : `sheep_${id}`;

  const bodyPivot = new THREE.Group();
  group.add(bodyPivot);

  // Subtle individual fleece warmth variation so each sheep feels handcrafted
  const creamShades = ['#faf6ec', '#f5efe0', '#fdfaf1', '#f2ebdc', '#f7f2e6'];
  const woolColor = golden ? '#f7c948' : creamShades[id % creamShades.length];

  const woolMat = new THREE.MeshStandardMaterial({
    color: woolColor,
    emissive: golden ? '#6e4704' : '#000000',
    emissiveIntensity: golden ? 0.2 : 0,
    roughness: golden ? 0.62 : 0.94,
    metalness: golden ? 0.18 : 0.0,
  });
  const faceMat = new THREE.MeshStandardMaterial({
    color: golden ? '#403229' : '#332b26',
    roughness: 0.76,
  });
  const snoutMat = new THREE.MeshStandardMaterial({
    color: '#52443c',
    roughness: 0.72,
  });
  const hoofMat = new THREE.MeshStandardMaterial({
    color: '#1b1817',
    roughness: 0.55,
  });
  const eyeWhiteMat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.25,
  });
  const pupilMat = new THREE.MeshStandardMaterial({
    color: '#121010',
    roughness: 0.15,
  });

  // Plump multi-cloud wool torso (9 overlapping puffs for unmistakable cozy storybook volume!)
  const puffGeo = new THREE.IcosahedronGeometry(0.32, 2);
  const puffSpecs: [number, number, number, number, number, number][] = [
    [0, 0.62, 0.0, 1.38, 1.24, 1.82],     // core fleece body
    [0.24, 0.66, 0.16, 0.92, 0.9, 1.05],  // right flank puff
    [-0.24, 0.66, 0.16, 0.92, 0.9, 1.05], // left flank puff
    [0.22, 0.68, -0.22, 0.95, 0.92, 0.95],// right shoulder puff
    [-0.22, 0.68, -0.22, 0.95, 0.92, 0.95],// left shoulder puff
    [0, 0.85, -0.05, 1.15, 0.86, 1.38],   // high back crown puff
    [0, 0.63, 0.36, 1.02, 0.92, 0.86],    // plump rump puff
    [0, 0.72, -0.4, 0.88, 0.88, 0.82],    // chest / neck wool ruff
  ];

  for (const [px, py, pz, sx, sy, sz] of puffSpecs) {
    const puff = new THREE.Mesh(puffGeo, woolMat);
    puff.position.set(px, py, pz);
    puff.scale.set(sx, sy, sz);
    puff.castShadow = true;
    puff.receiveShadow = true;
    bodyPivot.add(puff);
  }

  // Cute fluffy wagging cotton tail at +Z
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 7), woolMat);
  tail.position.set(0, 0.62, 0.58);
  tail.scale.set(0.95, 0.85, 1.25);
  tail.castShadow = true;
  bodyPivot.add(tail);

  // Prize Golden Sheep crimson collar ribbon + shiny tiny brass bell!
  let haloMesh: THREE.Mesh | null = null;
  if (golden) {
    const ribbonMat = new THREE.MeshStandardMaterial({ color: '#c9322c', roughness: 0.65 });
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.045, 7, 16), ribbonMat);
    collar.position.set(0, 0.72, -0.46);
    collar.rotation.x = Math.PI * 0.42;
    bodyPivot.add(collar);

    const bellMat = new THREE.MeshStandardMaterial({
      color: '#ffdf6b',
      metalness: 0.85,
      roughness: 0.25,
    });
    const neckBell = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 8), bellMat);
    neckBell.position.set(0, 0.47, -0.52);
    bodyPivot.add(neckBell);

    // Subtle sunlit golden ring under hooves while unpenned so prize sheep sparkle invitingly
    haloMesh = new THREE.Mesh(
      new THREE.RingGeometry(0.68, 0.86, 24),
      new THREE.MeshBasicMaterial({
        color: '#ffe066',
        transparent: true,
        opacity: 0.62,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    haloMesh.rotation.x = -Math.PI * 0.5;
    haloMesh.position.y = 0.06;
    group.add(haloMesh);
  }

  // Sculpted Expressive Head Pivot at -Z
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.78, -0.48);
  bodyPivot.add(headPivot);

  const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), faceMat);
  cranium.position.set(0, 0.02, -0.14);
  cranium.scale.set(0.92, 0.98, 1.22);
  cranium.castShadow = true;
  headPivot.add(cranium);

  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), snoutMat);
  snout.position.set(0, -0.05, -0.35);
  snout.scale.set(0.92, 0.76, 1.02);
  snout.castShadow = true;
  headPivot.add(snout);

  // Cute fluffy wool topknot tuft on forehead!
  const topknot = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 1), woolMat);
  topknot.position.set(0, 0.19, -0.1);
  topknot.scale.set(1.15, 0.75, 1.1);
  topknot.castShadow = true;
  headPivot.add(topknot);

  // Expressive wide storybook eyes (white sclera + glossy dark pupils)
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.058, 8, 8), eyeWhiteMat);
    eye.position.set(side * 0.145, 0.06, -0.25);
    headPivot.add(eye);

    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 8), pupilMat);
    pupil.position.set(side * 0.162, 0.062, -0.295);
    headPivot.add(pupil);
  }

  // Floppy articulated ears
  const earGeo = new THREE.SphereGeometry(0.11, 8, 6);
  earGeo.scale(1.55, 0.45, 0.72);
  const earL = new THREE.Group();
  earL.position.set(-0.18, 0.07, -0.08);
  const earLMesh = new THREE.Mesh(earGeo, faceMat);
  earLMesh.position.set(-0.1, -0.03, 0);
  earLMesh.rotation.z = 0.42;
  earLMesh.castShadow = true;
  earL.add(earLMesh);

  const earR = new THREE.Group();
  earR.position.set(0.18, 0.07, -0.08);
  const earRMesh = new THREE.Mesh(earGeo, faceMat);
  earRMesh.position.set(0.1, -0.03, 0);
  earRMesh.rotation.z = -0.42;
  earRMesh.castShadow = true;
  earR.add(earRMesh);

  headPivot.add(earL, earR);

  // 4 Articulated Slender Legs + Black Hooves
  const legs: THREE.Object3D[] = [];
  const legPositions: [number, number, number][] = [
    [-0.2, 0.42, -0.28], // FL
    [0.2, 0.42, -0.28],  // FR
    [-0.2, 0.42, 0.28],  // BL
    [0.2, 0.42, 0.28],   // BR
  ];
  const legGeo = new THREE.CylinderGeometry(0.052, 0.044, 0.36, 7);
  const hoofGeo = new THREE.CylinderGeometry(0.048, 0.056, 0.09, 7);

  for (const [lx, ly, lz] of legPositions) {
    const legPivot = new THREE.Group();
    legPivot.position.set(lx, ly, lz);

    const upper = new THREE.Mesh(legGeo, faceMat);
    upper.position.y = -0.18;
    upper.castShadow = true;
    const hoof = new THREE.Mesh(hoofGeo, hoofMat);
    hoof.position.y = -0.37;
    hoof.castShadow = true;

    legPivot.add(upper, hoof);
    bodyPivot.add(legPivot);
    legs.push(legPivot);
  }

  return { group, bodyPivot, headPivot, earL, earR, legs, tail, haloMesh };
}

// ---------------------------------------------------------------------------
// Handcrafted Cheeky Red Fox Builder (facing -Z)
// ---------------------------------------------------------------------------

function createFoxModel(): {
  group: THREE.Group;
  bodyPivot: THREE.Group;
  tailPivot: THREE.Group;
  legs: THREE.Object3D[];
} {
  const group = new THREE.Group();
  group.name = 'cheeky_red_fox';

  const bodyPivot = new THREE.Group();
  group.add(bodyPivot);

  const furMat = new THREE.MeshStandardMaterial({ color: '#d45422', roughness: 0.84 });
  const creamMat = new THREE.MeshStandardMaterial({ color: '#f7eee0', roughness: 0.88 });
  const darkMat = new THREE.MeshStandardMaterial({ color: '#241e1c', roughness: 0.7 });

  // Sleek fox torso
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.21, 0.56, 6, 10), furMat);
  torso.rotation.x = Math.PI * 0.5;
  torso.position.set(0, 0.52, 0.0);
  torso.castShadow = true;
  bodyPivot.add(torso);

  // Cream chest ruff
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), creamMat);
  chest.position.set(0, 0.52, -0.34);
  chest.scale.set(0.95, 0.92, 0.85);
  bodyPivot.add(chest);

  // Fox head + pointed snout + crisp ears
  const head = new THREE.Group();
  head.position.set(0, 0.68, -0.44);
  bodyPivot.add(head);

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), furMat);
  skull.scale.set(1.05, 0.88, 1.1);
  skull.castShadow = true;
  head.add(skull);

  const muzzle = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.34, 8), furMat);
  muzzle.rotation.x = -Math.PI * 0.5;
  muzzle.position.set(0, -0.04, -0.24);
  muzzle.castShadow = true;
  head.add(muzzle);

  const cheekL = new THREE.Mesh(new THREE.SphereGeometry(0.095, 8, 6), creamMat);
  cheekL.position.set(-0.11, -0.05, -0.09);
  const cheekR = cheekL.clone();
  cheekR.position.x = 0.11;
  head.add(cheekL, cheekR);

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.036, 7, 7), darkMat);
  nose.position.set(0, -0.03, -0.41);
  head.add(nose);

  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.22, 6), furMat);
    ear.position.set(side * 0.11, 0.19, 0.02);
    ear.rotation.z = -side * 0.2;
    ear.castShadow = true;
    head.add(ear);

    const earTip = new THREE.Mesh(new THREE.ConeGeometry(0.038, 0.08, 6), darkMat);
    earTip.position.set(side * 0.13, 0.28, 0.02);
    earTip.rotation.z = -side * 0.2;
    head.add(earTip);

    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.032, 7, 7), darkMat);
    eye.position.set(side * 0.11, 0.04, -0.14);
    head.add(eye);
  }

  // Big fluffy russet & white-tipped bushy tail
  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 0.54, 0.38);
  bodyPivot.add(tailPivot);

  const tailBase = new THREE.Mesh(new THREE.SphereGeometry(0.16, 9, 8), furMat);
  tailBase.scale.set(0.95, 0.88, 2.25);
  tailBase.position.set(0, 0.04, 0.32);
  tailBase.rotation.x = 0.2;
  tailBase.castShadow = true;
  tailPivot.add(tailBase);

  const tailTip = new THREE.Mesh(new THREE.SphereGeometry(0.125, 8, 7), creamMat);
  tailTip.scale.set(0.92, 0.86, 1.5);
  tailTip.position.set(0, 0.1, 0.62);
  tailPivot.add(tailTip);

  // 4 dark-socked legs
  const legs: THREE.Object3D[] = [];
  const legGeo = new THREE.CylinderGeometry(0.046, 0.036, 0.42, 7);
  const legSpots: [number, number, number][] = [
    [-0.14, 0.42, -0.24],
    [0.14, 0.42, -0.24],
    [-0.14, 0.42, 0.24],
    [0.14, 0.42, 0.24],
  ];
  for (const [lx, ly, lz] of legSpots) {
    const p = new THREE.Group();
    p.position.set(lx, ly, lz);
    const m = new THREE.Mesh(legGeo, darkMat);
    m.position.y = -0.21;
    m.castShadow = true;
    p.add(m);
    bodyPivot.add(p);
    legs.push(p);
  }

  return { group, bodyPivot, tailPivot, legs };
}

// ---------------------------------------------------------------------------
// Collision Resolution Helper (keeps creatures smooth around walls & props)
// ---------------------------------------------------------------------------

function resolveCreatureCollisions(
  pos: THREE.Vector3,
  vel: THREE.Vector2,
  radius: number,
  penned: boolean,
  circles: ObstacleCircle[],
  boxes: ObstacleBox[],
): void {
  if (penned) {
    // Penned sheep happily stay safely inside the wooden paddock walls!
    const minX = PADDOCK_MIN_X + 1.05;
    const maxX = PADDOCK_MAX_X - 1.25;
    const minZ = PADDOCK_MIN_Z + 1.05;
    const maxZ = PADDOCK_MAX_Z - 1.05;
    if (pos.x < minX) {
      pos.x = minX;
      vel.x = Math.abs(vel.x) * 0.4;
    } else if (pos.x > maxX) {
      pos.x = maxX;
      vel.x = -Math.abs(vel.x) * 0.4;
    }
    if (pos.z < minZ) {
      pos.z = minZ;
      vel.y = Math.abs(vel.y) * 0.4;
    } else if (pos.z > maxZ) {
      pos.z = maxZ;
      vel.y = -Math.abs(vel.y) * 0.4;
    }
    return;
  }

  // Keep inside Cotswold dry-stone valley perimeter
  const r = Math.hypot(pos.x, pos.z);
  const theta = Math.atan2(pos.z, pos.x);
  const maxR = wallRadiusAtAngle(theta) - 1.5 - radius;
  if (r > maxR && r > 0.001) {
    const nx = pos.x / r;
    const nz = pos.z / r;
    pos.x = nx * maxR;
    pos.z = nz * maxR;
    const outDot = vel.x * nx + vel.y * nz;
    if (outDot > 0) {
      vel.x -= nx * outDot * 1.3;
      vel.y -= nz * outDot * 1.3;
    }
  }

  // Bridge side handrail containment if on the footbridge
  const br = worldToBridgeLocal(pos.x, pos.z);
  if (Math.abs(br.lx) < BRIDGE_HALF_LEN - 0.35 && Math.abs(br.lz) < BRIDGE_HALF_WIDTH + 0.5) {
    const maxLz = BRIDGE_HALF_WIDTH - 0.42 - radius * 0.5;
    if (Math.abs(br.lz) > maxLz) {
      const clampedLz = Math.sign(br.lz) * maxLz;
      const w = bridgeLocalToWorld(br.lx, clampedLz);
      pos.x = w.x;
      pos.z = w.z;
    }
  }

  // Circle obstacles (tree trunks, boulders, windmill, hay bales, gate pillars)
  for (const c of circles) {
    const dx = pos.x - c.x;
    const dz = pos.z - c.z;
    const minD = c.radius + radius;
    const dSq = dx * dx + dz * dz;
    if (dSq < minD * minD && dSq > 1e-6) {
      const d = Math.sqrt(dSq);
      const nx = dx / d;
      const nz = dz / d;
      pos.x = c.x + nx * minD;
      pos.z = c.z + nz * minD;
      const dot = vel.x * nx + vel.y * nz;
      if (dot < 0) {
        vel.x -= nx * dot * 1.15;
        vel.y -= nz * dot * 1.15;
      }
    }
  }

  // Axis-aligned box obstacles (barn & paddock fence segments)
  for (const b of boxes) {
    const cx = Math.max(b.minX, Math.min(b.maxX, pos.x));
    const cz = Math.max(b.minZ, Math.min(b.maxZ, pos.z));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const dSq = dx * dx + dz * dz;
    if (dSq < radius * radius) {
      if (dSq > 1e-6) {
        const d = Math.sqrt(dSq);
        const nx = dx / d;
        const nz = dz / d;
        pos.x = cx + nx * radius;
        pos.z = cz + nz * radius;
        const dot = vel.x * nx + vel.y * nz;
        if (dot < 0) {
          vel.x -= nx * dot * 1.1;
          vel.y -= nz * dot * 1.1;
        }
      } else {
        // Inside box center fallback: push out along nearest edge
        const dl = Math.abs(pos.x - b.minX);
        const dr = Math.abs(b.maxX - pos.x);
        const dt = Math.abs(pos.z - b.minZ);
        const db = Math.abs(b.maxZ - pos.z);
        const m = Math.min(dl, dr, dt, db);
        if (m === dl) pos.x = b.minX - radius;
        else if (m === dr) pos.x = b.maxX + radius;
        else if (m === dt) pos.z = b.minZ - radius;
        else pos.z = b.maxZ + radius;
      }
    }
  }
}

function wrapAngleDiff(target: number, current: number): number {
  let d = target - current;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// ---------------------------------------------------------------------------
// Flock & Fox Simulation System
// ---------------------------------------------------------------------------

export function createFlockSystem(callbacks: FlockCallbacks): FlockSystem {
  const group = new THREE.Group();
  group.name = 'meadow_flock_and_fox';

  const sheep: SheepEntity[] = SHEEP_SPAWNS.map((sp, idx) => {
    const model = createSheepModel(idx, Boolean(sp.golden));
    const y = surfaceHeightAt(sp.x, sp.z);
    const yaw = ((idx * 1.9 + 0.5) % (Math.PI * 2)) - Math.PI;
    model.group.position.set(sp.x, y, sp.z);
    model.group.rotation.y = yaw;
    group.add(model.group);

    return {
      id: idx,
      golden: Boolean(sp.golden),
      ...model,
      pos: new THREE.Vector3(sp.x, y, sp.z),
      vel: new THREE.Vector2(0, 0),
      yaw,
      penned: false,
      hopPhase: idx * 0.9,
      grazeTimer: 1.5 + (idx % 4) * 1.1,
      wanderAngle: yaw,
      bellAlertTimer: 0,
      cloverIgnoreTimer: 0,
      celebrateTimer: 0,
      spookTimer: 0,
      eatingClover: false,
    };
  });

  const foxModel = createFoxModel();
  const foxStart = FOX_WAYPOINTS[1];
  const foxY = surfaceHeightAt(foxStart[0], foxStart[1]);
  foxModel.group.position.set(foxStart[0], foxY, foxStart[1]);
  group.add(foxModel.group);

  const fox: FoxEntity = {
    ...foxModel,
    pos: new THREE.Vector3(foxStart[0], foxY, foxStart[1]),
    vel: new THREE.Vector2(0, 0),
    yaw: 0,
    waypointIdx: 2,
    scaredTimer: 0,
    hopPhase: 0,
    nearSheep: false,
  };

  let foxWarnCooldown = 0;

  const reset = () => {
    for (let i = 0; i < sheep.length; i++) {
      const s = sheep[i];
      const sp = SHEEP_SPAWNS[i];
      s.pos.set(sp.x, surfaceHeightAt(sp.x, sp.z), sp.z);
      s.vel.set(0, 0);
      s.yaw = ((i * 1.9 + 0.5) % (Math.PI * 2)) - Math.PI;
      s.penned = false;
      s.hopPhase = i * 0.9;
      s.grazeTimer = 1.5 + (i % 4) * 1.1;
      s.wanderAngle = s.yaw;
      s.bellAlertTimer = 0;
      s.cloverIgnoreTimer = 0;
      s.celebrateTimer = 0;
      s.spookTimer = 0;
      s.eatingClover = false;
      s.group.position.copy(s.pos);
      s.group.rotation.y = s.yaw;
      if (s.haloMesh) s.haloMesh.visible = true;
    }

    fox.pos.set(foxStart[0], surfaceHeightAt(foxStart[0], foxStart[1]), foxStart[1]);
    fox.vel.set(0, 0);
    fox.yaw = 0;
    fox.waypointIdx = 2;
    fox.scaredTimer = 0;
    fox.nearSheep = false;
    fox.group.position.copy(fox.pos);
    foxWarnCooldown = 0;
  };

  // Smart Brass Shepherd Bell response!
  const ringBell = (origin: THREE.Vector3, forwardDir: THREE.Vector2) => {
    let herdedCount = 0;
    let shooedFox = false;

    const bellRadius = 17.0;
    for (const s of sheep) {
      if (s.penned) continue;
      const dx = s.pos.x - origin.x;
      const dz = s.pos.z - origin.z;
      const dist = Math.hypot(dx, dz);
      if (dist > bellRadius) continue;

      herdedCount++;
      s.bellAlertTimer = 1.65;
      s.cloverIgnoreTimer = 6.5;
      s.eatingClover = false;
      s.spookTimer = 0;

      // Blend player pressure push + intelligent route assist toward bridge/paddock!
      const awayX = dist > 0.01 ? dx / dist : forwardDir.x;
      const awayZ = dist > 0.01 ? dz / dist : forwardDir.y;

      // Determine smart pastoral guidance target (bridge/ford if east of brook, else paddock gate)
      let goalX = PADDOCK_GATE_POS.x - 1.2;
      let goalZ = PADDOCK_GATE_POS.y;
      if (s.pos.x > streamCenterX(s.pos.z) + 1.8) {
        if (s.pos.z > -8.5) {
          goalX = BRIDGE_CENTER_X + 1.2;
          goalZ = BRIDGE_Z;
        } else {
          goalX = FORD_CENTER_X;
          goalZ = FORD_Z;
        }
      }
      const gDx = goalX - s.pos.x;
      const gDz = goalZ - s.pos.z;
      const gDist = Math.hypot(gDx, gDz) || 1;
      const toGoalX = gDx / gDist;
      const toGoalZ = gDz / gDist;

      // Check if player is herding in a helpful direction vs side/front
      const align = awayX * toGoalX + awayZ * toGoalZ;
      const goalWeight = align > 0.15 ? 0.58 : 0.44;
      const pushX = awayX * (1 - goalWeight) + toGoalX * goalWeight;
      const pushZ = awayZ * (1 - goalWeight) + toGoalZ * goalWeight;
      const pLen = Math.hypot(pushX, pushZ) || 1;

      const strength = 5.4 + (1 - dist / bellRadius) * 3.1;
      s.vel.x = (pushX / pLen) * strength;
      s.vel.y = (pushZ / pLen) * strength;
    }

    // Shoo away cheeky red fox if within bell earshot!
    const fDx = fox.pos.x - origin.x;
    const fDz = fox.pos.z - origin.z;
    const fDist = Math.hypot(fDx, fDz);
    if (fDist < 17.5 && fox.scaredTimer <= 0.5) {
      fox.scaredTimer = 16.5;
      fox.nearSheep = false;
      const nx = fDist > 0.01 ? fDx / fDist : 1;
      const nz = fDist > 0.01 ? fDz / fDist : 0;
      fox.vel.set(nx * 8.5, nz * 8.5);
      shooedFox = true;
      callbacks.onFoxShooed(fox.pos.clone());
    }

    return { herdedCount, shooedFox };
  };

  const nearestUnpennedSheep = (from: THREE.Vector3): SheepEntity | null => {
    let best: SheepEntity | null = null;
    let bestD = Infinity;
    for (const s of sheep) {
      if (s.penned) continue;
      const d = Math.hypot(s.pos.x - from.x, s.pos.z - from.z);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  };

  const update = (
    dt: number,
    elapsed: number,
    playerPos: THREE.Vector3,
    playerVel: THREE.Vector2,
    obstaclesCircles: ObstacleCircle[],
    obstaclesBoxes: ObstacleBox[],
  ) => {
    if (foxWarnCooldown > 0) foxWarnCooldown -= dt;

    // -----------------------------------------------------------------------
    // 1. Update Cheeky Red Fox Patrol / Playful Pester / Scared Scamper
    // -----------------------------------------------------------------------
    const pFoxDx = fox.pos.x - playerPos.x;
    const pFoxDz = fox.pos.z - playerPos.z;
    const pFoxDist = Math.hypot(pFoxDx, pFoxDz);

    // Driving right up to the fox also shoos it playfully!
    if (pFoxDist < 4.4 && fox.scaredTimer <= 0.5) {
      fox.scaredTimer = 15.0;
      const nx = pFoxDist > 0.01 ? pFoxDx / pFoxDist : 1;
      const nz = pFoxDist > 0.01 ? pFoxDz / pFoxDist : 0;
      fox.vel.set(nx * 8.0, nz * 8.0);
      callbacks.onFoxShooed(fox.pos.clone());
    }

    if (fox.scaredTimer > 0) {
      fox.scaredTimer -= dt;
      // Retreat toward the northeast perimeter bushes
      const retreatX = 33.0;
      const retreatZ = -18.0;
      const rDx = retreatX - fox.pos.x;
      const rDz = retreatZ - fox.pos.z;
      const rD = Math.hypot(rDx, rDz);
      if (rD > 3.0) {
        fox.vel.x += ((rDx / rD) * 7.8 - fox.vel.x) * Math.min(1, dt * 4.5);
        fox.vel.y += ((rDz / rD) * 7.8 - fox.vel.y) * Math.min(1, dt * 4.5);
      } else {
        fox.vel.multiplyScalar(Math.exp(-dt * 4));
      }
      fox.nearSheep = false;
    } else {
      // Find any nearby unpenned sheep in eastern/northern pasture to playfully pester
      let targetSheep: SheepEntity | null = null;
      let bestSD = 11.5;
      for (const s of sheep) {
        if (s.penned || s.pos.x < -3.0) continue; // Fox stays away from barn & paddock!
        const d = Math.hypot(s.pos.x - fox.pos.x, s.pos.z - fox.pos.z);
        if (d < bestSD) {
          bestSD = d;
          targetSheep = s;
        }
      }

      if (targetSheep) {
        fox.nearSheep = bestSD < 8.5;
        if (fox.nearSheep && foxWarnCooldown <= 0) {
          foxWarnCooldown = 14.0;
          callbacks.onFoxSpookWarning();
        }
        const tx = targetSheep.pos.x - fox.pos.x;
        const tz = targetSheep.pos.z - fox.pos.z;
        const td = Math.hypot(tx, tz) || 1;
        // Orbit playfully at ~3.8m rather than colliding harshly
        const desiredSpeed = td > 4.2 ? 3.8 : 1.4;
        fox.vel.x += ((tx / td) * desiredSpeed - fox.vel.x) * Math.min(1, dt * 3.0);
        fox.vel.y += ((tz / td) * desiredSpeed - fox.vel.y) * Math.min(1, dt * 3.0);
      } else {
        fox.nearSheep = false;
        const wp = FOX_WAYPOINTS[fox.waypointIdx];
        const wx = wp[0] - fox.pos.x;
        const wz = wp[1] - fox.pos.z;
        const wd = Math.hypot(wx, wz);
        if (wd < 2.6) {
          fox.waypointIdx = (fox.waypointIdx + 1) % FOX_WAYPOINTS.length;
        }
        const dirX = wd > 0.01 ? wx / wd : 0;
        const dirZ = wd > 0.01 ? wz / wd : 0;
        fox.vel.x += (dirX * 3.1 - fox.vel.x) * Math.min(1, dt * 2.5);
        fox.vel.y += (dirZ * 3.1 - fox.vel.y) * Math.min(1, dt * 2.5);
      }
    }

    fox.pos.x += fox.vel.x * dt;
    fox.pos.z += fox.vel.y * dt;
    resolveCreatureCollisions(fox.pos, fox.vel, 0.55, false, obstaclesCircles, obstaclesBoxes);
    fox.pos.y = surfaceHeightAt(fox.pos.x, fox.pos.z);
    fox.group.position.copy(fox.pos);

    const foxSpd = fox.vel.length();
    if (foxSpd > 0.25) {
      const targetYaw = Math.atan2(-fox.vel.x, -fox.vel.y);
      fox.yaw += wrapAngleDiff(targetYaw, fox.yaw) * Math.min(1, dt * 8.5);
    }
    fox.group.rotation.y = fox.yaw;
    fox.hopPhase += dt * (4.0 + foxSpd * 2.2);
    const foxStride = Math.min(1, foxSpd / 4.5);
    fox.bodyPivot.position.y = Math.abs(Math.sin(fox.hopPhase)) * 0.14 * foxStride;
    fox.tailPivot.rotation.y = Math.sin(elapsed * 5.2) * 0.26;
    fox.tailPivot.rotation.x = fox.scaredTimer > 0 ? -0.35 : 0.14;
    fox.legs[0].rotation.x = Math.sin(fox.hopPhase) * 0.65 * foxStride;
    fox.legs[1].rotation.x = -Math.sin(fox.hopPhase) * 0.65 * foxStride;
    fox.legs[2].rotation.x = -Math.sin(fox.hopPhase) * 0.65 * foxStride;
    fox.legs[3].rotation.x = Math.sin(fox.hopPhase) * 0.65 * foxStride;

    // -----------------------------------------------------------------------
    // 2. Update All 12 Sheep (Cozy Boids + Herding + Clover + Paddock Funnel)
    // -----------------------------------------------------------------------
    for (let i = 0; i < sheep.length; i++) {
      const s = sheep[i];
      if (s.bellAlertTimer > 0) s.bellAlertTimer = Math.max(0, s.bellAlertTimer - dt);
      if (s.cloverIgnoreTimer > 0) s.cloverIgnoreTimer = Math.max(0, s.cloverIgnoreTimer - dt);
      if (s.celebrateTimer > 0) s.celebrateTimer = Math.max(0, s.celebrateTimer - dt);
      if (s.spookTimer > 0) s.spookTimer = Math.max(0, s.spookTimer - dt);

      let ax = 0;
      let az = 0;
      s.eatingClover = false;

      if (s.penned) {
        // Cozy content grazing inside the sunlit paddock!
        s.grazeTimer -= dt;
        if (s.grazeTimer <= 0) {
          s.grazeTimer = 2.4 + Math.random() * 3.2;
          s.wanderAngle = Math.random() * Math.PI * 2;
        }
        const gentleMove = s.grazeTimer > 1.6 ? 0.55 : 0.0;
        ax += Math.cos(s.wanderAngle) * gentleMove;
        az += Math.sin(s.wanderAngle) * gentleMove;

        // Soft separation among penned sheep
        for (let j = 0; j < sheep.length; j++) {
          if (i === j || !sheep[j].penned) continue;
          const dx = s.pos.x - sheep[j].pos.x;
          const dz = s.pos.z - sheep[j].pos.z;
          const d = Math.hypot(dx, dz);
          if (d < 1.65 && d > 0.001) {
            const push = (1.65 - d) * 2.8;
            ax += (dx / d) * push;
            az += (dz / d) * push;
          }
        }
      } else {
        // --- Unpenned Boids: Separation + Cohesion + Alignment ---
        let cohX = 0;
        let cohZ = 0;
        let aliX = 0;
        let aliZ = 0;
        let neighbors = 0;

        for (let j = 0; j < sheep.length; j++) {
          if (i === j || sheep[j].penned) continue;
          const o = sheep[j];
          const dx = s.pos.x - o.pos.x;
          const dz = s.pos.z - o.pos.z;
          const d = Math.hypot(dx, dz);
          if (d < 1.65 && d > 0.001) {
            const sep = (1.65 - d) * 6.2;
            ax += (dx / d) * sep;
            az += (dz / d) * sep;
          }
          if (d < 8.8) {
            cohX += o.pos.x;
            cohZ += o.pos.z;
            aliX += o.vel.x;
            aliZ += o.vel.y;
            neighbors++;
          }
        }

        if (neighbors > 0) {
          cohX = cohX / neighbors - s.pos.x;
          cohZ = cohZ / neighbors - s.pos.z;
          ax += cohX * 0.42;
          az += cohZ * 0.42;
          ax += (aliX / neighbors - s.vel.x) * 0.55;
          az += (aliZ / neighbors - s.vel.y) * 0.55;
        }

        // --- Wheelchair Herding Pressure Cone ---
        const pdx = s.pos.x - playerPos.x;
        const pdz = s.pos.z - playerPos.z;
        const pDist = Math.hypot(pdx, pdz);
        const herdRadius = 8.4;
        if (pDist < herdRadius && pDist > 0.01) {
          const factor = 1 - pDist / herdRadius;
          const push = (factor * factor * 15.5 + factor * 5.2);
          ax += (pdx / pDist) * push;
          az += (pdz / pDist) * push;
          // Gentle steering transfer from wheelchair velocity so herding feels crisp & direct!
          ax += playerVel.x * factor * 0.45;
          az += playerVel.y * factor * 0.45;
          s.cloverIgnoreTimer = Math.max(s.cloverIgnoreTimer, 2.2);
        }

        // --- Cheeky Red Fox Playful Scatter ---
        if (fox.scaredTimer <= 0) {
          const fdx = s.pos.x - fox.pos.x;
          const fdz = s.pos.z - fox.pos.z;
          const fDist = Math.hypot(fdx, fdz);
          if (fDist < 7.2 && fDist > 0.01) {
            const ff = 1 - fDist / 7.2;
            ax += (fdx / fDist) * (ff * 12.5);
            az += (fdz / fDist) * (ff * 12.5);
            s.spookTimer = 0.85;
          }
        }

        // --- Tempting Clover Groves Distraction (unless freshly herded/belled!) ---
        if (s.cloverIgnoreTimer <= 0 && pDist > 7.5) {
          for (const cp of CLOVER_PATCHES) {
            const cdx = cp.x - s.pos.x;
            const cdz = cp.z - s.pos.z;
            const cd = Math.hypot(cdx, cdz);
            if (cd < cp.radius + 3.2) {
              if (cd > 1.3) {
                ax += (cdx / cd) * 1.9;
                az += (cdz / cd) * 1.9;
              } else {
                s.eatingClover = true;
              }
            }
          }
        }

        // --- Gentle Bridge Alignment Assist when crossing the brook ---
        const toBridgeDist = Math.hypot(s.pos.x - BRIDGE_CENTER_X, s.pos.z - BRIDGE_Z);
        if (toBridgeDist < 8.5 && s.vel.x < -0.6) {
          const br = worldToBridgeLocal(s.pos.x, s.pos.z);
          if (Math.abs(br.lx) < BRIDGE_HALF_LEN + 2.8 && Math.abs(br.lz) < 4.5) {
            const centerW = bridgeLocalToWorld(br.lx - 1.5, 0);
            ax += (centerW.x - s.pos.x) * 1.15;
            az += (centerW.z - s.pos.z) * 1.15;
          }
        }

        // --- Cozy Paddock Gate Welcoming Funnel! ---
        const gateDx = PADDOCK_GATE_POS.x - s.pos.x;
        const gateDz = PADDOCK_GATE_POS.y - s.pos.z;
        const gateDist = Math.hypot(gateDx, gateDz);
        if (
          gateDist < 9.2 &&
          s.pos.x > PADDOCK_MAX_X - 1.2 &&
          (s.vel.length() > 0.7 || pDist < 12.5 || s.bellAlertTimer > 0)
        ) {
          const targetX = PADDOCK_MAX_X - 2.6;
          const targetZ = PADDOCK_GATE_POS.y;
          const tdx = targetX - s.pos.x;
          const tdz = targetZ - s.pos.z;
          const td = Math.hypot(tdx, tdz) || 1;
          const funnelStrength = (1 - gateDist / 9.2) * 8.2 + 2.2;
          ax += (tdx / td) * funnelStrength;
          az += (tdz / td) * funnelStrength;
        }

        // --- Peaceful Idle Meadow Grazing Wander ---
        if (pDist > 9.0 && s.bellAlertTimer <= 0 && !s.eatingClover) {
          s.grazeTimer -= dt;
          if (s.grazeTimer <= 0) {
            s.grazeTimer = 2.0 + Math.random() * 3.0;
            s.wanderAngle += (Math.random() - 0.5) * 1.8;
          }
          if (s.grazeTimer > 1.8) {
            ax += Math.cos(s.wanderAngle) * 0.7;
            az += Math.sin(s.wanderAngle) * 0.7;
          }
        }
      }

      // Integrate velocity with cozy organic damping & water wade slowdown
      s.vel.x += ax * dt;
      s.vel.y += az * dt;

      const damp = s.penned ? 3.2 : s.eatingClover ? 4.8 : 2.15;
      s.vel.multiplyScalar(Math.exp(-damp * dt));

      const wading = isInWater(s.pos.x, s.pos.z);
      const maxSpd = s.penned
        ? 1.5
        : (s.bellAlertTimer > 0 ? 7.6 : 6.4) * (wading ? 0.72 : 1.0);
      const spd = s.vel.length();
      if (spd > maxSpd) {
        s.vel.multiplyScalar(maxSpd / spd);
      }

      s.pos.x += s.vel.x * dt;
      s.pos.z += s.vel.y * dt;

      // Check Paddock Entry BEFORE fence collision locks it outside!
      if (
        !s.penned &&
        s.pos.x < PADDOCK_MAX_X - 0.55 &&
        s.pos.x > PADDOCK_MIN_X + 0.3 &&
        s.pos.z > PADDOCK_MIN_Z + 0.4 &&
        s.pos.z < PADDOCK_MAX_Z - 0.4
      ) {
        s.penned = true;
        s.celebrateTimer = 2.4;
        s.vel.set(-1.6, (Math.random() - 0.5) * 1.2);
        if (s.haloMesh) s.haloMesh.visible = false;
        callbacks.onSheepPenned(s);
      }

      resolveCreatureCollisions(s.pos, s.vel, 0.62, s.penned, obstaclesCircles, obstaclesBoxes);

      // Keep unpenned sheep from sneaking backward into the gate edges if almost inside
      if (
        !s.penned &&
        s.pos.x < PADDOCK_MAX_X + 0.4 &&
        s.pos.x > PADDOCK_MAX_X - 0.6 &&
        s.pos.z > PADDOCK_GATE_Z_MIN + 0.3 &&
        s.pos.z < PADDOCK_GATE_Z_MAX - 0.3 &&
        s.vel.x < -0.2
      ) {
        s.pos.x -= dt * 1.8;
      }

      s.pos.y = surfaceHeightAt(s.pos.x, s.pos.z);
      s.group.position.copy(s.pos);

      // Smooth yaw facing movement direction
      const finalSpd = s.vel.length();
      if (finalSpd > 0.22) {
        const targetYaw = Math.atan2(-s.vel.x, -s.vel.y);
        s.yaw += wrapAngleDiff(targetYaw, s.yaw) * Math.min(1, dt * 8.5);
      }
      s.group.rotation.y = s.yaw;

      // Expressive Storybook Animation: bouncing hop, scampering hooves, head nibble & ear wiggle!
      s.hopPhase += dt * (2.6 + finalSpd * 2.4);
      const strideAmp = Math.min(1, finalSpd / 3.8);

      let bounceY = Math.abs(Math.sin(s.hopPhase)) * 0.2 * strideAmp;
      if (s.celebrateTimer > 0) {
        bounceY += Math.abs(Math.sin(elapsed * 9.5 + s.id)) * 0.42 * Math.min(1, s.celebrateTimer);
      } else if (s.bellAlertTimer > 1.25) {
        bounceY += Math.sin((s.bellAlertTimer - 1.25) * Math.PI * 2.5) * 0.26;
      }
      s.bodyPivot.position.y = bounceY;
      s.bodyPivot.rotation.x = Math.sin(s.hopPhase * 2) * 0.08 * strideAmp;

      // Leg gallop/trot articulation
      const legSwing = Math.sin(s.hopPhase) * 0.68 * strideAmp;
      s.legs[0].rotation.x = legSwing;
      s.legs[1].rotation.x = -legSwing * 0.85;
      s.legs[2].rotation.x = -legSwing;
      s.legs[3].rotation.x = legSwing * 0.85;

      // Head grazing dip when peacefully munching clover or grass!
      const wantsGraze =
        finalSpd < 0.45 &&
        s.celebrateTimer <= 0 &&
        s.bellAlertTimer <= 0 &&
        (s.eatingClover || s.grazeTimer < 1.8);
      const targetHeadPitch = wantsGraze
        ? -0.58 + Math.sin(elapsed * 5.4 + s.id) * 0.08
        : s.bellAlertTimer > 0
          ? 0.22
          : 0.04;
      s.headPivot.rotation.x += (targetHeadPitch - s.headPivot.rotation.x) * Math.min(1, dt * 6.5);

      // Cute ear wiggle & perk on bell ring or celebration!
      const earPerk = s.bellAlertTimer > 0 || s.spookTimer > 0 ? 0.35 : 0;
      const earWiggle = Math.sin(elapsed * 6.2 + s.id * 1.7) * (0.06 + strideAmp * 0.14);
      s.earL.rotation.z = -earPerk + earWiggle;
      s.earR.rotation.z = earPerk - earWiggle;

      // Happy cotton tail wag
      s.tail.rotation.y = Math.sin(elapsed * (s.celebrateTimer > 0 ? 18 : 6) + s.id) * 0.25;

      // Subtle sunlit golden ring shimmer under Golden-Fleece Prize Sheep
      if (s.haloMesh && s.haloMesh.visible) {
        const gp = 0.5 + 0.5 * Math.sin(elapsed * 3.4 + s.id);
        s.haloMesh.scale.setScalar(0.92 + gp * 0.14);
        (s.haloMesh.material as THREE.MeshBasicMaterial).opacity = 0.35 + gp * 0.32;
      }
    }
  };

  return {
    group,
    sheep,
    fox,
    pennedCount: () => sheep.reduce((acc, s) => acc + (s.penned ? 1 : 0), 0),
    goldenPennedCount: () => sheep.reduce((acc, s) => acc + (s.penned && s.golden ? 1 : 0), 0),
    ringBell,
    nearestUnpennedSheep,
    update,
    reset,
  };
}
