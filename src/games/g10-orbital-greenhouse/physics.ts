import * as THREE from 'three';
import type {
  CardinalDir,
  ChamberDef,
  ConduitRuntime,
  CubeRuntime,
  GravityBasis,
  GravityDir,
  GravityPadDef,
  LaserSegment,
  MirrorRuntime,
  PlayerRuntime,
  ReceiverRuntime,
  SolidBoxDef,
  StarSeedRuntime,
} from './types';

export const CUBE_HALF = 0.65;
export const PLAYER_HALF_TANGENT = 0.54;
export const PLAYER_HEIGHT = 1.56;
export const PLAYER_HALF_HEIGHT = PLAYER_HEIGHT * 0.5;
const GRAVITY_ACCEL = 26.0;
const MAX_FALL_SPEED = 22.0;

const BASIS_MAP: Record<GravityDir, GravityBasis> = {
  floor: {
    dir: 'floor',
    roll: 0,
    down: new THREE.Vector3(0, -1, 0),
    up: new THREE.Vector3(0, 1, 0),
    right: new THREE.Vector3(1, 0, 0),
    forward: new THREE.Vector3(0, 0, -1),
  },
  right: {
    dir: 'right',
    roll: Math.PI / 2,
    down: new THREE.Vector3(1, 0, 0),
    up: new THREE.Vector3(-1, 0, 0),
    right: new THREE.Vector3(0, 1, 0),
    forward: new THREE.Vector3(0, 0, -1),
  },
  left: {
    dir: 'left',
    roll: -Math.PI / 2,
    down: new THREE.Vector3(-1, 0, 0),
    up: new THREE.Vector3(1, 0, 0),
    right: new THREE.Vector3(0, -1, 0),
    forward: new THREE.Vector3(0, 0, -1),
  },
  ceiling: {
    dir: 'ceiling',
    roll: Math.PI,
    down: new THREE.Vector3(0, 1, 0),
    up: new THREE.Vector3(0, -1, 0),
    right: new THREE.Vector3(-1, 0, 0),
    forward: new THREE.Vector3(0, 0, -1),
  },
};

export function getGravityBasis(dir: GravityDir): GravityBasis {
  return BASIS_MAP[dir];
}

export function gravityLabel(dir: GravityDir): string {
  switch (dir) {
    case 'floor':
      return 'Main Floor';
    case 'right':
      return 'East Wall';
    case 'left':
      return 'West Wall';
    case 'ceiling':
      return 'Canopy Ceiling';
  }
}

export function dirToVector(dir: CardinalDir, out = new THREE.Vector3()): THREE.Vector3 {
  switch (dir) {
    case '+x':
      return out.set(1, 0, 0);
    case '-x':
      return out.set(-1, 0, 0);
    case '+y':
      return out.set(0, 1, 0);
    case '-y':
      return out.set(0, -1, 0);
    case '+z':
      return out.set(0, 0, 1);
    case '-z':
      return out.set(0, 0, -1);
  }
}

/** Compute local rotation angle around surface normal so mesh local -Z aligns with aimDir */
export function aimDirToSurfaceYaw(surface: GravityDir, aimDir: CardinalDir): number {
  const basis = getGravityBasis(surface);
  const v = dirToVector(aimDir);
  const localX = v.dot(basis.right);
  const localZ = -v.dot(basis.forward); // +Z_local = -forward
  // Mesh forward is -Z_local: rotateY(theta) maps (0,0,-1) -> (-sin(theta), 0, -cos(theta))
  return Math.atan2(-localX, -localZ);
}

export function shortestAngleDelta(from: number, to: number): number {
  let diff = (to - from) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

export interface AABB {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

function aabbOverlap(a: AABB, b: AABB, eps = 0.001): boolean {
  return (
    a.maxX > b.minX + eps &&
    a.minX < b.maxX - eps &&
    a.maxY > b.minY + eps &&
    a.minY < b.maxY - eps &&
    a.maxZ > b.minZ + eps &&
    a.minZ < b.maxZ - eps
  );
}

export function getPlayerCenter(player: PlayerRuntime, gravity: GravityDir, out = new THREE.Vector3()): THREE.Vector3 {
  const basis = getGravityBasis(gravity);
  return out.copy(player.pos).addScaledVector(basis.up, PLAYER_HALF_HEIGHT);
}

function getPlayerAABB(pos: THREE.Vector3, gravity: GravityDir): AABB {
  const basis = getGravityBasis(gravity);
  const cx = pos.x + basis.up.x * PLAYER_HALF_HEIGHT;
  const cy = pos.y + basis.up.y * PLAYER_HALF_HEIGHT;
  const cz = pos.z + basis.up.z * PLAYER_HALF_HEIGHT;
  const hx = gravity === 'left' || gravity === 'right' ? PLAYER_HALF_HEIGHT : PLAYER_HALF_TANGENT;
  const hy = gravity === 'floor' || gravity === 'ceiling' ? PLAYER_HALF_HEIGHT : PLAYER_HALF_TANGENT;
  const hz = PLAYER_HALF_TANGENT;
  return {
    minX: cx - hx,
    maxX: cx + hx,
    minY: cy - hy,
    maxY: cy + hy,
    minZ: cz - hz,
    maxZ: cz + hz,
  };
}

function getCubeAABB(pos: THREE.Vector3): AABB {
  return {
    minX: pos.x - CUBE_HALF,
    maxX: pos.x + CUBE_HALF,
    minY: pos.y - CUBE_HALF,
    maxY: pos.y + CUBE_HALF,
    minZ: pos.z - CUBE_HALF,
    maxZ: pos.z + CUBE_HALF,
  };
}

/** Build static pedestal colliders for emitters, mirrors, and receivers so player/cubes glide around them */
export function buildDeviceColliders(chamber: ChamberDef): AABB[] {
  const boxes: AABB[] = [];
  const pedR = 0.44;
  const pedH = 1.45;

  const pushSurfaceBox = (surface: GravityDir, base: [number, number, number], r: number, h: number) => {
    const [bx, by, bz] = base;
    if (surface === 'floor') {
      boxes.push({ minX: bx - r, maxX: bx + r, minY: by, maxY: by + h, minZ: bz - r, maxZ: bz + r });
    } else if (surface === 'ceiling') {
      boxes.push({ minX: bx - r, maxX: bx + r, minY: by - h, maxY: by, minZ: bz - r, maxZ: bz + r });
    } else if (surface === 'right') {
      boxes.push({ minX: bx - h, maxX: bx, minY: by - r, maxY: by + r, minZ: bz - r, maxZ: bz + r });
    } else {
      boxes.push({ minX: bx, maxX: bx + h, minY: by - r, maxY: by + r, minZ: bz - r, maxZ: bz + r });
    }
  };

  for (const m of chamber.mirrors) {
    pushSurfaceBox(m.surface, m.basePos, pedR, pedH);
  }
  for (const r of chamber.receivers) {
    pushSurfaceBox(r.surface, r.basePos, 0.48, 1.4);
  }
  for (const e of chamber.emitters) {
    pushSurfaceBox('floor', e.mountPos, 0.44, 1.45);
  }
  return boxes;
}

export function sampleRampFloor(
  chamber: ChamberDef,
  x: number,
  z: number,
  marginX = 0.05,
  halfZ = 0.0,
): { y: number; slopeZ: number } | null {
  for (const r of chamber.ramps) {
    if (x >= r.minX - marginX && x <= r.maxX + marginX && z + halfZ >= r.minZ - 0.05 && z - halfZ <= r.maxZ + 0.05) {
      const len = Math.max(0.001, r.maxZ - r.minZ);
      const slopeZ = (r.yAtMinZ - r.yAtMaxZ) / len;
      // Sample highest point across body's Z footprint on the ramp so leading edge climbs seamlessly!
      const zSample = slopeZ >= 0 ? THREE.MathUtils.clamp(z - halfZ, r.minZ, r.maxZ) : THREE.MathUtils.clamp(z + halfZ, r.minZ, r.maxZ);
      const t = THREE.MathUtils.clamp((r.maxZ - zSample) / len, 0, 1);
      const y = THREE.MathUtils.lerp(r.yAtMaxZ, r.yAtMinZ, t);
      return { y, slopeZ };
    }
  }
  return null;
}

export interface ChamberSimState {
  chamber: ChamberDef;
  gravity: GravityDir;
  player: PlayerRuntime;
  cubes: CubeRuntime[];
  mirrors: MirrorRuntime[];
  conduits: ConduitRuntime[];
  receivers: ReceiverRuntime[];
  starSeeds: StarSeedRuntime[];
  deviceColliders: AABB[];
  lasers: LaserSegment[];
  allPowered: boolean;
  airlockOpenBlend: number;
  moves: number;
  flipCooldown: number;
}

export function createChamberSim(chamber: ChamberDef): ChamberSimState {
  const basis = getGravityBasis(chamber.initialGravity);
  const player: PlayerRuntime = {
    pos: new THREE.Vector3(...chamber.spawnPos),
    vel: new THREE.Vector3(),
    localYaw: chamber.spawnYaw,
    turnRate: 0,
    forwardSpeed: 0,
    visualRoll: basis.roll,
    grounded: true,
    airborneTime: 0,
    groundBump: 0,
    hopCooldown: 0,
    towingCubeId: null,
    tiltX: 0,
    tiltZ: 0,
  };

  const cubes: CubeRuntime[] = chamber.cubes.map((def) => ({
    def,
    pos: new THREE.Vector3(...def.startPos),
    vel: new THREE.Vector3(),
    grounded: true,
    lockedConduitId: null,
    lockBlend: 0,
    glowIntensity: 0.45,
  }));

  const mirrors: MirrorRuntime[] = chamber.mirrors.map((def) => {
    const startAngle = aimDirToSurfaceYaw(def.surface, def.aimCycle[def.initialAimIdx]);
    return {
      def,
      aimIdx: def.initialAimIdx,
      currentAngle: startAngle,
      targetAngle: startAngle,
      energized: false,
    };
  });

  const conduits: ConduitRuntime[] = chamber.conduits.map((def) => ({
    def,
    powered: false,
    powerBlend: 0,
    lockedCubeId: null,
  }));

  const receivers: ReceiverRuntime[] = chamber.receivers.map((def) => ({
    def,
    powered: false,
    bloomBlend: 0,
  }));

  const starSeeds: StarSeedRuntime[] = chamber.starSeeds.map((def) => ({
    def,
    collected: false,
  }));

  const state: ChamberSimState = {
    chamber,
    gravity: chamber.initialGravity,
    player,
    cubes,
    mirrors,
    conduits,
    receivers,
    starSeeds,
    deviceColliders: buildDeviceColliders(chamber),
    lasers: [],
    allPowered: false,
    airlockOpenBlend: 0,
    moves: 0,
    flipCooldown: 0,
  };

  traceLaserBeams(state);
  return state;
}

/** Flip chamber gravity while preserving wheelchair geometric 3D center (zero wall clipping!) */
export function triggerGravityFlip(state: ChamberSimState, nextGravity: GravityDir): boolean {
  if (nextGravity === state.gravity) return false;
  const oldBasis = getGravityBasis(state.gravity);
  const newBasis = getGravityBasis(nextGravity);

  // Preserve geometric center of wheelchair so tires rotate cleanly around center without embedding into wall/floor
  const center = state.player.pos.clone().addScaledVector(oldBasis.up, PLAYER_HALF_HEIGHT);
  state.player.pos.copy(center).addScaledVector(newBasis.up, -PLAYER_HALF_HEIGHT);
  // Nudge slightly along newUp to stay clean of corners
  state.player.pos.addScaledVector(newBasis.up, 0.08);
  state.player.vel.multiplyScalar(0.15);
  state.player.grounded = false;
  state.player.towingCubeId = null;

  // Wake any unlocked cubes so they tumble smoothly toward new gravity
  for (const cube of state.cubes) {
    if (!cube.lockedConduitId) {
      cube.grounded = false;
      cube.vel.multiplyScalar(0.2);
    }
  }

  state.gravity = nextGravity;
  state.moves += 1;
  state.flipCooldown = 0.55;
  return true;
}

export function findActiveGravityPad(state: ChamberSimState): GravityPadDef | null {
  const basis = getGravityBasis(state.gravity);
  const p = state.player.pos;
  let best: GravityPadDef | null = null;
  let bestDist = Infinity;

  for (const pad of state.chamber.gravityPads) {
    if (pad.surface !== state.gravity) continue;
    const dx = p.x - pad.pos[0];
    const dy = p.y - pad.pos[1];
    const dz = p.z - pad.pos[2];
    const normalDist = Math.abs(dx * basis.up.x + dy * basis.up.y + dz * basis.up.z);
    if (normalDist > 1.25) continue;
    const tangRight = dx * basis.right.x + dy * basis.right.y + dz * basis.right.z;
    const tangFwd = dx * basis.forward.x + dy * basis.forward.y + dz * basis.forward.z;
    const d = Math.hypot(tangRight, tangFwd);
    const rad = pad.radius ?? 1.4;
    if (d <= rad && d < bestDist) {
      bestDist = d;
      best = pad;
    }
  }
  return best;
}

export function findNearbyMirror(state: ChamberSimState): MirrorRuntime | null {
  const pCenter = getPlayerCenter(state.player, state.gravity);
  let best: MirrorRuntime | null = null;
  let bestDist = Infinity;

  for (const m of state.mirrors) {
    if (m.def.surface !== state.gravity) continue;
    const dx = pCenter.x - m.def.crystalPos[0];
    const dy = pCenter.y - m.def.crystalPos[1];
    const dz = pCenter.z - m.def.crystalPos[2];
    const dist = Math.hypot(dx, dy, dz);
    if (dist <= 2.65 && dist < bestDist) {
      bestDist = dist;
      best = m;
    }
  }
  return best;
}

export function findNearbyCube(state: ChamberSimState, maxDist = 2.35): CubeRuntime | null {
  const pCenter = getPlayerCenter(state.player, state.gravity);
  const basis = getGravityBasis(state.gravity);
  let best: CubeRuntime | null = null;
  let bestDist = Infinity;

  for (const c of state.cubes) {
    const dx = c.pos.x - pCenter.x;
    const dy = c.pos.y - pCenter.y;
    const dz = c.pos.z - pCenter.z;
    const normDiff = Math.abs(dx * basis.up.x + dy * basis.up.y + dz * basis.up.z);
    if (normDiff > 1.0) continue;
    const dist = Math.hypot(dx, dy, dz);
    if (dist <= maxDist && dist < bestDist) {
      bestDist = dist;
      best = c;
    }
  }
  return best;
}

export function rotateMirror(state: ChamberSimState, mirror: MirrorRuntime): void {
  mirror.aimIdx = (mirror.aimIdx + 1) % mirror.def.aimCycle.length;
  mirror.targetAngle = aimDirToSurfaceYaw(mirror.def.surface, mirror.def.aimCycle[mirror.aimIdx]);
  state.moves += 1;
}

export interface StepInput {
  /** Screen-up (+1 = W / Up, -1 = S / Down) */
  moveForward: number;
  /** Screen-right (+1 = D / Right, -1 = A / Left) */
  moveRight: number;
  /** Shift key held (tractor tow near cube, else magnetic glide boost) */
  shiftHeld: boolean;
  /** Space pressed this frame */
  spacePressed: boolean;
}

export interface StepEvents {
  landedBump: number;
  hopped: boolean;
  cubeLanded: THREE.Vector3[];
  conduitLocked: THREE.Vector3[];
  receiverActivated: THREE.Vector3[];
  airlockOpened: boolean;
  airlockEntered: boolean;
  starSeedsCollected: THREE.Vector3[];
  pushingCube: boolean;
}

/** Resolve single-axis movement of an AABB against static blocks + device colliders */
function resolveAxisAABB(
  pos: THREE.Vector3,
  delta: number,
  axis: 'x' | 'y' | 'z',
  getBox: (p: THREE.Vector3) => AABB,
  blocks: readonly SolidBoxDef[],
  devices: readonly AABB[],
  stepUpFloor: boolean,
  bodyBottomY: number,
): { collided: boolean; hitDir: number } {
  if (Math.abs(delta) < 1e-6) return { collided: false, hitDir: 0 };
  pos[axis] += delta;
  const box = getBox(pos);
  let collided = false;
  let hitDir = 0;

  const checkAgainst = (obs: AABB) => {
    if (!aabbOverlap(box, obs)) return;
    // Allow smooth stepping up ramp seams onto floor terraces
    if (stepUpFloor && axis !== 'y' && obs.maxY <= bodyBottomY + 0.36) {
      return;
    }
    if (delta > 0) {
      const push = obs.minX - box.maxX;
      const pushY = obs.minY - box.maxY;
      const pushZ = obs.minZ - box.maxZ;
      const corr = axis === 'x' ? push : axis === 'y' ? pushY : pushZ;
      pos[axis] += corr;
      box.minX += axis === 'x' ? corr : 0;
      box.maxX += axis === 'x' ? corr : 0;
      box.minY += axis === 'y' ? corr : 0;
      box.maxY += axis === 'y' ? corr : 0;
      box.minZ += axis === 'z' ? corr : 0;
      box.maxZ += axis === 'z' ? corr : 0;
      collided = true;
      hitDir = 1;
    } else {
      const push = obs.maxX - box.minX;
      const pushY = obs.maxY - box.minY;
      const pushZ = obs.maxZ - box.minZ;
      const corr = axis === 'x' ? push : axis === 'y' ? pushY : pushZ;
      pos[axis] += corr;
      box.minX += axis === 'x' ? corr : 0;
      box.maxX += axis === 'x' ? corr : 0;
      box.minY += axis === 'y' ? corr : 0;
      box.maxY += axis === 'y' ? corr : 0;
      box.minZ += axis === 'z' ? corr : 0;
      box.maxZ += axis === 'z' ? corr : 0;
      collided = true;
      hitDir = -1;
    }
  };

  for (const b of blocks) checkAgainst(b);
  for (const d of devices) checkAgainst(d);
  return { collided, hitDir };
}

function clampToChamberBounds(pos: THREE.Vector3, marginX: number, marginY: number, marginZ: number, chamber: ChamberDef): void {
  const b = chamber.bounds;
  pos.x = THREE.MathUtils.clamp(pos.x, b.minX + marginX, b.maxX - marginX);
  pos.y = THREE.MathUtils.clamp(pos.y, b.minY + marginY, b.maxY - marginY);
  pos.z = THREE.MathUtils.clamp(pos.z, b.minZ + marginZ, b.maxZ - marginZ);
}

/** Try moving a cube along a tangent delta (dx, dy, dz) while respecting blocks, devices, other cubes, and ramps */
function tryMoveCubeTangent(
  state: ChamberSimState,
  cube: CubeRuntime,
  dx: number,
  dy: number,
  dz: number,
): boolean {
  const { chamber, gravity, deviceColliders } = state;
  const startPos = cube.pos.clone();
  const isFloor = gravity === 'floor';
  const bottomY = cube.pos.y - CUBE_HALF;

  const otherCubeBoxes: AABB[] = [];
  for (const other of state.cubes) {
    if (other !== cube) otherCubeBoxes.push(getCubeAABB(other.pos));
  }
  const allDevices = otherCubeBoxes.length > 0 ? [...deviceColliders, ...otherCubeBoxes] : deviceColliders;

  if (Math.abs(dx) > 1e-6) {
    resolveAxisAABB(cube.pos, dx, 'x', getCubeAABB, chamber.blocks, allDevices, isFloor, bottomY);
  }
  if (Math.abs(dy) > 1e-6) {
    resolveAxisAABB(cube.pos, dy, 'y', getCubeAABB, chamber.blocks, allDevices, false, bottomY);
  }
  if (Math.abs(dz) > 1e-6) {
    resolveAxisAABB(cube.pos, dz, 'z', getCubeAABB, chamber.blocks, allDevices, isFloor, bottomY);
  }

  // Smoothly lift cube up ramps when on floor gravity
  if (isFloor) {
    const ramp = sampleRampFloor(chamber, cube.pos.x, cube.pos.z, 0.25, CUBE_HALF);
    if (ramp && cube.pos.y - CUBE_HALF < ramp.y + 0.45 && cube.pos.y - CUBE_HALF > ramp.y - 0.95) {
      cube.pos.y = ramp.y + CUBE_HALF;
    }
  }

  clampToChamberBounds(cube.pos, CUBE_HALF, CUBE_HALF, CUBE_HALF, chamber);

  return cube.pos.distanceToSquared(startPos) > 1e-7;
}

export function stepChamberSim(state: ChamberSimState, dt: number, input: StepInput): StepEvents {
  const events: StepEvents = {
    landedBump: 0,
    hopped: false,
    cubeLanded: [],
    conduitLocked: [],
    receiverActivated: [],
    airlockOpened: false,
    airlockEntered: false,
    starSeedsCollected: [],
    pushingCube: false,
  };

  const { chamber, gravity, player, deviceColliders } = state;
  const basis = getGravityBasis(gravity);
  state.flipCooldown = Math.max(0, state.flipCooldown - dt);
  player.hopCooldown = Math.max(0, player.hopCooldown - dt);
  player.groundBump = 0;

  // 1. Camera-relative steering on the active gravity surface!
  const inLen = Math.hypot(input.moveRight, input.moveForward);
  const normR = inLen > 1 ? input.moveRight / inLen : input.moveRight;
  const normF = inLen > 1 ? input.moveForward / inLen : input.moveForward;

  // Check Tractor-Tow engagement with Shift when close to a cube
  if (input.shiftHeld && player.grounded) {
    if (!player.towingCubeId) {
      const near = findNearbyCube(state, 2.3);
      if (near) {
        player.towingCubeId = near.def.id;
        // Release conduit lock if user deliberately tows a cube back out
        if (near.lockedConduitId) {
          const prevC = state.conduits.find((c) => c.def.id === near.lockedConduitId);
          if (prevC) prevC.lockedCubeId = null;
          near.lockedConduitId = null;
        }
      }
    }
  } else {
    player.towingCubeId = null;
  }

  const isBoosting = input.shiftHeld && !player.towingCubeId;
  const maxSpeed = player.towingCubeId ? 4.3 : isBoosting ? 8.6 : 6.1;

  // Desired tangent velocity in world space
  const targetRightVel = normR * maxSpeed;
  const targetFwdVel = normF * maxSpeed;
  const curRightVel = player.vel.dot(basis.right);
  const curFwdVel = player.vel.dot(basis.forward);
  const curUpVel = player.vel.dot(basis.up);

  const accelRate = inLen > 0.05 ? 14.5 : 13.0;
  const velAlpha = 1 - Math.exp(-accelRate * dt);
  const nextRightVel = curRightVel + (targetRightVel - curRightVel) * velAlpha;
  const nextFwdVel = curFwdVel + (targetFwdVel - curFwdVel) * velAlpha;

  // Smooth wheelchair heading toward travel direction (for differential wheel spin & joystick hand!)
  let nextYaw = player.localYaw;
  if (inLen > 0.08) {
    // In local surface frame: localYaw=0 faces forward (-Z_loc), localYaw=-PI/2 faces +right
    const targetYaw = Math.atan2(-normR, normF);
    const yawDiff = shortestAngleDelta(player.localYaw, targetYaw);
    const maxTurn = 11.5 * dt;
    const stepYaw = THREE.MathUtils.clamp(yawDiff, -maxTurn, maxTurn);
    nextYaw = player.localYaw + stepYaw;
    player.turnRate = stepYaw / Math.max(dt, 0.001);
  } else {
    player.turnRate *= Math.exp(-12 * dt);
  }
  player.localYaw = nextYaw;

  // Compute signed forward speed along wheelchair's facing vector for exact wheel rolling
  const chairFwdR = -Math.sin(player.localYaw);
  const chairFwdF = Math.cos(player.localYaw);
  player.forwardSpeed = nextRightVel * chairFwdR + nextFwdVel * chairFwdF;

  // Magnetic Zero-G Hop when pressing Space away from a Gravity Pad
  let nextUpVel = curUpVel;
  if (input.spacePressed && player.grounded && player.hopCooldown <= 0) {
    nextUpVel = 7.4;
    player.grounded = false;
    player.hopCooldown = 0.45;
    events.hopped = true;
  }

  // Gravity acceleration along down (= -up)
  if (!player.grounded) {
    nextUpVel = Math.max(-MAX_FALL_SPEED, nextUpVel - GRAVITY_ACCEL * dt);
  } else {
    // Small downward stickiness so slopes/ramps stay smoothly grounded
    nextUpVel = Math.min(nextUpVel, -0.35);
  }

  // Reconstruct world velocity
  player.vel
    .set(0, 0, 0)
    .addScaledVector(basis.right, nextRightVel)
    .addScaledVector(basis.forward, nextFwdVel)
    .addScaledVector(basis.up, nextUpVel);

  // 2. Move player along tangent axes first (with smooth cube pushing!)
  const isFloor = gravity === 'floor';
  const prevPlayerPos = player.pos.clone();
  const tangentDelta = new THREE.Vector3()
    .addScaledVector(basis.right, nextRightVel * dt)
    .addScaledVector(basis.forward, nextFwdVel * dt);

  const playerStepBottomY = player.pos.y;
  const moveAxes: ('x' | 'y' | 'z')[] =
    gravity === 'floor' || gravity === 'ceiling' ? ['x', 'z'] : ['y', 'z'];

  for (const ax of moveAxes) {
    const d = tangentDelta[ax];
    if (Math.abs(d) < 1e-6) continue;
    resolveAxisAABB(
      player.pos,
      d,
      ax,
      (p) => getPlayerAABB(p, gravity),
      chamber.blocks,
      deviceColliders,
      isFloor,
      playerStepBottomY,
    );

    // Check collision with Solar Energy Cubes -> smooth tactile pushing!
    const pBox = getPlayerAABB(player.pos, gravity);
    for (const cube of state.cubes) {
      const cBox = getCubeAABB(cube.pos);
      if (!aabbOverlap(pBox, cBox)) continue;

      // Compute overlap on this axis
      const overlap = d > 0 ? pBox.maxX - cBox.minX : cBox.maxX - pBox.minX;
      const pushDist =
        ax === 'x'
          ? d > 0
            ? pBox.maxX - cBox.minX
            : -(cBox.maxX - pBox.minX)
          : ax === 'y'
            ? d > 0
              ? pBox.maxY - cBox.minY
              : -(cBox.maxY - pBox.minY)
            : d > 0
              ? pBox.maxZ - cBox.minZ
              : -(cBox.maxZ - pBox.minZ);
      void overlap;

      // Push unlocked cube smoothly (locked cubes resist gentle bumps so you don't accidentally dislodge them!)
      if (!cube.lockedConduitId) {
        const pushVec = new THREE.Vector3();
        pushVec[ax] = pushDist * 0.92;
        tryMoveCubeTangent(state, cube, pushVec.x, pushVec.y, pushVec.z);
        events.pushingCube = true;
      }

      // Separate player cleanly from updated cube box
      const updatedCubeBox = getCubeAABB(cube.pos);
      if (aabbOverlap(pBox, updatedCubeBox)) {
        if (d > 0) {
          const pen =
            ax === 'x'
              ? updatedCubeBox.minX - pBox.maxX
              : ax === 'y'
                ? updatedCubeBox.minY - pBox.maxY
                : updatedCubeBox.minZ - pBox.maxZ;
          player.pos[ax] += pen;
        } else {
          const pen =
            ax === 'x'
              ? updatedCubeBox.maxX - pBox.minX
              : ax === 'y'
                ? updatedCubeBox.maxY - pBox.minY
                : updatedCubeBox.maxZ - pBox.minZ;
          player.pos[ax] += pen;
        }
      }
    }
  }

  // If Tractor-Towing a cube, pull it smoothly along player's tangent motion
  if (player.towingCubeId) {
    const towed = state.cubes.find((c) => c.def.id === player.towingCubeId);
    if (towed) {
      const moved = player.pos.clone().sub(prevPlayerPos);
      // Project motion purely onto tangent plane
      const upComp = moved.dot(basis.up);
      moved.addScaledVector(basis.up, -upComp);
      if (moved.lengthSq() > 1e-7) {
        tryMoveCubeTangent(state, towed, moved.x, moved.y, moved.z);
      }
      // Break tether if cube snags far behind
      const pCenter = getPlayerCenter(player, gravity);
      if (pCenter.distanceTo(towed.pos) > 3.1) {
        player.towingCubeId = null;
      }
    } else {
      player.towingCubeId = null;
    }
  }

  // 3. Move player along gravity axis & resolve landing + ramps!
  const gravAxis: 'x' | 'y' = gravity === 'floor' || gravity === 'ceiling' ? 'y' : 'x';
  const gravDelta = player.vel[gravAxis] * dt;
  const wasGrounded = player.grounded;

  // Build cube boxes as solid landing surfaces too (so you don't clip through cubes vertically!)
  const cubeBoxesForPlayer = state.cubes.map((c) => getCubeAABB(c.pos));
  const gravHit = resolveAxisAABB(
    player.pos,
    gravDelta,
    gravAxis,
    (p) => getPlayerAABB(p, gravity),
    chamber.blocks,
    [...deviceColliders, ...cubeBoxesForPlayer],
    false,
    player.pos.y,
  );

  // Check if landed on supporting face along `down`
  const downSign = basis.down[gravAxis]; // -1 for floor/left, +1 for right/ceiling
  let nowGrounded = gravHit.collided && gravHit.hitDir === downSign;

  // Ramp surface elevation check when gravity === 'floor'
  let targetTiltX = 0;
  if (isFloor) {
    const ramp = sampleRampFloor(chamber, player.pos.x, player.pos.z, 0.08, PLAYER_HALF_TANGENT);
    if (ramp) {
      const diff = player.pos.y - ramp.y;
      if (diff <= 0.45 && diff >= -0.95 && nextUpVel <= 0.6) {
        player.pos.y = ramp.y;
        nowGrounded = true;
        // Tilt nose up when facing -Z uphill on ramp
        targetTiltX = Math.atan(ramp.slopeZ) * Math.cos(player.localYaw);
      }
    }
  }

  if (nowGrounded) {
    if (!wasGrounded && -curUpVel > 2.4) {
      const bump = Math.min(1.4, (-curUpVel - 2.0) * 0.12);
      player.groundBump = bump;
      events.landedBump = bump;
    }
    player.vel.addScaledVector(basis.up, -player.vel.dot(basis.up));
    player.grounded = true;
    player.airborneTime = 0;
  } else {
    player.grounded = false;
    player.airborneTime += dt;
  }

  player.tiltX += (targetTiltX - player.tiltX) * (1 - Math.exp(-12 * dt));
  player.tiltZ += (0 - player.tiltZ) * (1 - Math.exp(-12 * dt));

  // Clamp player safely inside chamber bounds
  const mX = gravity === 'floor' || gravity === 'ceiling' ? PLAYER_HALF_TANGENT : 0;
  const mY = gravity === 'left' || gravity === 'right' ? PLAYER_HALF_TANGENT : 0;
  clampToChamberBounds(player.pos, mX, mY, PLAYER_HALF_TANGENT, chamber);

  // Smoothly interpolate visual roll quaternion angle toward current gravity roll
  const rollDiff = shortestAngleDelta(player.visualRoll, basis.roll);
  player.visualRoll += rollDiff * (1 - Math.exp(-9.5 * dt));

  // 4. Step Solar Energy Cubes under 3D chamber gravity!
  for (const cube of state.cubes) {
    if (cube.lockedConduitId) {
      // Smooth magnetic seating onto locked conduit!
      const cnd = state.conduits.find((c) => c.def.id === cube.lockedConduitId);
      if (cnd) {
        const cBasis = getGravityBasis(cnd.def.surface);
        const seatX = cnd.def.pos[0] + cBasis.up.x * CUBE_HALF;
        const seatY = cnd.def.pos[1] + cBasis.up.y * CUBE_HALF;
        const seatZ = cnd.def.pos[2] + cBasis.up.z * CUBE_HALF;
        const alpha = 1 - Math.exp(-10 * dt);
        cube.pos.x += (seatX - cube.pos.x) * alpha;
        cube.pos.y += (seatY - cube.pos.y) * alpha;
        cube.pos.z += (seatZ - cube.pos.z) * alpha;
        cube.vel.set(0, 0, 0);
        cube.grounded = true;
        cube.lockBlend = Math.min(1, cube.lockBlend + dt * 4.5);
        cube.glowIntensity += (1.85 - cube.glowIntensity) * (1 - Math.exp(-8 * dt));
        continue;
      }
    }

    cube.lockBlend = Math.max(0, cube.lockBlend - dt * 5.0);
    cube.glowIntensity += (0.65 - cube.glowIntensity) * (1 - Math.exp(-6 * dt));

    // Apply gravity along active down vector
    const curCubeUpVel = cube.vel.dot(basis.up);
    const nextCubeUpVel = Math.max(-MAX_FALL_SPEED, curCubeUpVel - GRAVITY_ACCEL * dt);
    cube.vel.set(0, 0, 0).addScaledVector(basis.up, nextCubeUpVel);

    const otherCubes = state.cubes.filter((o) => o !== cube).map((o) => getCubeAABB(o.pos));
    const cubeGravDelta = cube.vel[gravAxis] * dt;
    const wasCubeGrounded = cube.grounded;
    const hit = resolveAxisAABB(
      cube.pos,
      cubeGravDelta,
      gravAxis,
      getCubeAABB,
      chamber.blocks,
      [...deviceColliders, ...otherCubes],
      false,
      cube.pos.y - CUBE_HALF,
    );

    let cubeNowGrounded = hit.collided && hit.hitDir === downSign;

    // Support cube on ramps when gravity === 'floor'
    if (isFloor) {
      const ramp = sampleRampFloor(chamber, cube.pos.x, cube.pos.z, 0.25, CUBE_HALF);
      if (ramp && cube.pos.y - CUBE_HALF <= ramp.y + 0.35 && cube.pos.y - CUBE_HALF >= ramp.y - 0.85) {
        cube.pos.y = ramp.y + CUBE_HALF;
        cubeNowGrounded = true;
      }
    }

    if (cubeNowGrounded) {
      if (!wasCubeGrounded && -curCubeUpVel > 3.2) {
        events.cubeLanded.push(cube.pos.clone());
      }
      cube.vel.set(0, 0, 0);
      cube.grounded = true;
    } else {
      cube.grounded = false;
    }

    clampToChamberBounds(cube.pos, CUBE_HALF, CUBE_HALF, CUBE_HALF, chamber);
  }

  // 5. Evaluate Pressure Conduits & Magnetic Lock-In!
  for (const conduit of state.conduits) {
    const cBasis = getGravityBasis(conduit.def.surface);
    const seatPos = new THREE.Vector3(
      conduit.def.pos[0] + cBasis.up.x * CUBE_HALF,
      conduit.def.pos[1] + cBasis.up.y * CUBE_HALF,
      conduit.def.pos[2] + cBasis.up.z * CUBE_HALF,
    );

    let matchedCube: CubeRuntime | null = null;
    for (const cube of state.cubes) {
      if (cube.def.id === player.towingCubeId) continue;
      if (cube.lockedConduitId && cube.lockedConduitId !== conduit.def.id) continue;
      const dist = cube.pos.distanceTo(seatPos);
      if (dist < 0.85) {
        matchedCube = cube;
        break;
      }
    }

    const wasPowered = conduit.powered;
    if (matchedCube) {
      conduit.powered = true;
      conduit.lockedCubeId = matchedCube.def.id;
      if (!matchedCube.lockedConduitId) {
        matchedCube.lockedConduitId = conduit.def.id;
        events.conduitLocked.push(seatPos.clone());
      } else if (!wasPowered) {
        events.conduitLocked.push(seatPos.clone());
      }
    } else {
      conduit.powered = false;
      conduit.lockedCubeId = null;
    }

    const targetBlend = conduit.powered ? 1 : 0;
    conduit.powerBlend += (targetBlend - conduit.powerBlend) * (1 - Math.exp(-8 * dt));
  }

  // 6. Animate Mirror Turntables & Trace Live Solar Laser Beams!
  for (const m of state.mirrors) {
    const diff = shortestAngleDelta(m.currentAngle, m.targetAngle);
    m.currentAngle += diff * (1 - Math.exp(-15 * dt));
  }

  const prevRecvPowered = state.receivers.map((r) => r.powered);
  traceLaserBeams(state);
  for (let i = 0; i < state.receivers.length; i++) {
    const r = state.receivers[i];
    if (r.powered && !prevRecvPowered[i]) {
      events.receiverActivated.push(new THREE.Vector3(...r.def.corePos));
    }
    const targetBloom = r.powered ? 1 : 0;
    r.bloomBlend += (targetBloom - r.bloomBlend) * (1 - Math.exp(-6.5 * dt));
  }

  // 7. Collect Optional Star-Seeds!
  const pCenter = getPlayerCenter(player, gravity);
  for (const seed of state.starSeeds) {
    if (seed.collected) continue;
    const dx = pCenter.x - seed.def.pos[0];
    const dy = pCenter.y - seed.def.pos[1];
    const dz = pCenter.z - seed.def.pos[2];
    if (Math.hypot(dx, dy, dz) < 1.35) {
      seed.collected = true;
      events.starSeedsCollected.push(new THREE.Vector3(...seed.def.pos));
    }
  }

  // 8. Check Overall Chamber Power & Airlock Portal Unsealing!
  const allConduitsOk = state.conduits.every((c) => c.powered);
  const allReceiversOk = state.receivers.every((r) => r.powered);
  const nowAllPowered = allConduitsOk && allReceiversOk;

  if (nowAllPowered && !state.allPowered) {
    events.airlockOpened = true;
  }
  state.allPowered = nowAllPowered;

  const targetAirlock = nowAllPowered ? 1 : 0;
  state.airlockOpenBlend += (targetAirlock - state.airlockOpenBlend) * (1 - Math.exp(-4.2 * dt));

  if (nowAllPowered && state.airlockOpenBlend > 0.55) {
    const ax = chamber.airlockPos[0];
    const ay = chamber.airlockPos[1] + 0.9;
    const az = chamber.airlockPos[2];
    if (Math.hypot(pCenter.x - ax, pCenter.y - ay, pCenter.z - az) < 1.65) {
      events.airlockEntered = true;
    }
  }

  return events;
}

// ============================================================================
// Multi-Bounce 3D Solar Laser Raytracer
// ============================================================================

function rayIntersectAABB(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  box: AABB,
): number | null {
  let tMin = 0.001;
  let tMax = 50;

  const checkAxis = (o: number, d: number, bMin: number, bMax: number): boolean => {
    if (Math.abs(d) < 1e-8) {
      return o >= bMin && o <= bMax;
    }
    let t1 = (bMin - o) / d;
    let t2 = (bMax - o) / d;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    if (t1 > tMin) tMin = t1;
    if (t2 < tMax) tMax = t2;
    return tMin <= tMax;
  };

  if (!checkAxis(ox, dx, box.minX, box.maxX)) return null;
  if (!checkAxis(oy, dy, box.minY, box.maxY)) return null;
  if (!checkAxis(oz, dz, box.minZ, box.maxZ)) return null;
  return tMin > 0.05 ? tMin : null;
}

function rayIntersectSphere(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  cx: number,
  cy: number,
  cz: number,
  radius: number,
): number | null {
  const vx = cx - ox;
  const vy = cy - oy;
  const vz = cz - oz;
  const proj = vx * dx + vy * dy + vz * dz;
  if (proj < 0.25) return null;
  const perpSq = vx * vx + vy * vy + vz * vz - proj * proj;
  if (perpSq > radius * radius) return null;
  return proj;
}

export function traceLaserBeams(state: ChamberSimState): void {
  state.lasers.length = 0;
  for (const m of state.mirrors) m.energized = false;
  for (const r of state.receivers) r.powered = false;

  const { chamber, cubes, mirrors, receivers } = state;

  for (const emitter of chamber.emitters) {
    let origin = new THREE.Vector3(...emitter.origin);
    let dirCard: CardinalDir = emitter.dir;
    let dirVec = dirToVector(dirCard);
    const visited = new Set<string>();

    for (let bounce = 0; bounce < 8; bounce++) {
      let bestT = 26.0;
      let hitKind: LaserSegment['hitKind'] = 'void';
      let hitMirror: MirrorRuntime | null = null;
      let hitElbowIdx = -1;
      let hitReceiver: ReceiverRuntime | null = null;
      const endPos = origin.clone().addScaledVector(dirVec, bestT);

      // 1. Solid blocks that block lasers
      for (const block of chamber.blocks) {
        if (block.blocksLaser === false) continue;
        const t = rayIntersectAABB(origin.x, origin.y, origin.z, dirVec.x, dirVec.y, dirVec.z, block);
        if (t !== null && t < bestT) {
          bestT = t;
          hitKind = 'block';
          hitMirror = null;
          hitElbowIdx = -1;
          hitReceiver = null;
          endPos.copy(origin).addScaledVector(dirVec, t);
        }
      }

      // 2. Solar Energy Cubes (block beams optically!)
      for (const cube of cubes) {
        const box = getCubeAABB(cube.pos);
        const t = rayIntersectAABB(origin.x, origin.y, origin.z, dirVec.x, dirVec.y, dirVec.z, box);
        if (t !== null && t < bestT) {
          bestT = t;
          hitKind = 'cube';
          hitMirror = null;
          hitElbowIdx = -1;
          hitReceiver = null;
          endPos.copy(origin).addScaledVector(dirVec, t);
        }
      }

      // 3. Rotatable Prism Mirrors
      for (const m of mirrors) {
        if (visited.has(m.def.id)) continue;
        const [cx, cy, cz] = m.def.crystalPos;
        const t = rayIntersectSphere(origin.x, origin.y, origin.z, dirVec.x, dirVec.y, dirVec.z, cx, cy, cz, 0.62);
        if (t !== null && t < bestT) {
          bestT = t;
          hitKind = 'mirror';
          hitMirror = m;
          hitElbowIdx = -1;
          hitReceiver = null;
          endPos.set(cx, cy, cz);
        }
      }

      // 4. Fixed Brass Sky-Elbows
      for (let i = 0; i < chamber.elbows.length; i++) {
        const el = chamber.elbows[i];
        if (visited.has(el.id)) continue;
        if (el.inDir !== dirCard) continue;
        const [cx, cy, cz] = el.pos;
        const t = rayIntersectSphere(origin.x, origin.y, origin.z, dirVec.x, dirVec.y, dirVec.z, cx, cy, cz, 0.68);
        if (t !== null && t < bestT) {
          bestT = t;
          hitKind = 'elbow';
          hitMirror = null;
          hitElbowIdx = i;
          hitReceiver = null;
          endPos.set(cx, cy, cz);
        }
      }

      // 5. Photosynthesis Receivers
      for (const recv of receivers) {
        const [cx, cy, cz] = recv.def.corePos;
        const t = rayIntersectSphere(origin.x, origin.y, origin.z, dirVec.x, dirVec.y, dirVec.z, cx, cy, cz, 0.72);
        if (t !== null && t < bestT) {
          bestT = t;
          hitKind = 'receiver';
          hitMirror = null;
          hitElbowIdx = -1;
          hitReceiver = recv;
          endPos.set(cx, cy, cz);
        }
      }

      state.lasers.push({
        start: origin.clone(),
        end: endPos.clone(),
        hitKind,
      });

      if (hitKind === 'receiver' && hitReceiver) {
        hitReceiver.powered = true;
        break;
      }

      if (hitKind === 'mirror' && hitMirror) {
        hitMirror.energized = true;
        visited.add(hitMirror.def.id);
        const nextCard = hitMirror.def.aimCycle[hitMirror.aimIdx];
        origin = endPos.clone();
        dirCard = nextCard;
        dirVec = dirToVector(nextCard);
        continue;
      }

      if (hitKind === 'elbow' && hitElbowIdx >= 0) {
        const el = chamber.elbows[hitElbowIdx];
        visited.add(el.id);
        origin = endPos.clone();
        dirCard = el.outDir;
        dirVec = dirToVector(el.outDir);
        continue;
      }

      break;
    }
  }
}
