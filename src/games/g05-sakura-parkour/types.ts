import type * as THREE from 'three';

export interface Vec3Tuple {
  x: number;
  y: number;
  z: number;
}

export type SurfaceKind = 'rooftop' | 'bridge' | 'ramp' | 'balcony' | 'step';

/**
 * Analytic oriented walkable surface (supports flat terraces, parabolic arched bridges,
 * and smoothly curved upward launch ramps).
 */
export interface WalkableSurface {
  id: string;
  kind: SurfaceKind;
  /** World center X and Z */
  x: number;
  z: number;
  /** Base elevation Y at local z = 0 (or start elevation for ramps/bridges) */
  baseY: number;
  /** Half width along local X */
  halfW: number;
  /** Half length along local Z */
  halfL: number;
  /** Y-axis rotation in radians (0 = aligned with world -Z forward) */
  yaw: number;
  /** For ramps: rise from local +halfL (entry) to -halfL (exit) */
  rampRise?: number;
  /** For bridges: startY at local +halfL, endY at local -halfL, archLift at center */
  bridgeStartY?: number;
  bridgeEndY?: number;
  bridgeArchLift?: number;
  /** Optional launch boost multiplier when leaving the high edge of a ramp */
  launchBoost?: number;
  /** Which edges have decorative crimson guardrails that softly bump the chair inward */
  rails?: {
    left?: boolean;
    right?: boolean;
    back?: boolean;
    front?: boolean;
  };
  /** Minimum height below which falling from this island triggers cloud respawn */
  fallFloorY: number;
  /** Optional island index (1..10) for progression HUD */
  islandIndex: number;
}

export interface SpringPadDef {
  id: string;
  x: number;
  y: number;
  z: number;
  radius: number;
  /** Vertical launch speed in m/s */
  launchVy: number;
  /** Optional horizontal assist impulse direction & speed toward target island */
  assistVx?: number;
  assistVz?: number;
  islandIndex: number;
}

export interface CheckpointDef {
  index: number;
  islandIndex: number;
  name: string;
  /** Torii gate world position */
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Safe respawn position slightly before or under the gate */
  spawnX: number;
  spawnY: number;
  spawnZ: number;
  spawnYaw: number;
  triggerRadius: number;
}

export interface CraneDef {
  id: string;
  x: number;
  y: number;
  z: number;
  bonus?: boolean;
  islandIndex: number;
}

export interface IslandDecorDef {
  islandIndex: number;
  surfaceId: string;
  sakuraTrees?: Array<{ lx: number; lz: number; height: number; seed: number }>;
  bamboo?: Array<{ lx: number; lz: number; seed: number }>;
  boulders?: Array<{ lx: number; lz: number; radius: number; seed: number }>;
  ferns?: Array<{ lx: number; lz: number; seed: number }>;
  paperLanterns?: Array<{ lx: number; lz: number; rotY: number; withLight?: boolean }>;
  stoneLanterns?: Array<{ lx: number; lz: number; withLight?: boolean }>;
  gardenBeds?: Array<{ lx: number; lz: number; w: number; l: number; seed: number }>;
  banners?: Array<{ lx: number; lz: number; rotY: number; color: string }>;
  hasBellPavilion?: { lx: number; lz: number };
  hasPagoda?: { lx: number; lz: number };
  hasGarland?: { fromX: number; fromZ: number; toX: number; toZ: number; height: number; count: number };
}

export interface CourseData {
  surfaces: WalkableSurface[];
  springPads: SpringPadDef[];
  checkpoints: CheckpointDef[];
  cranes: CraneDef[];
  decors: IslandDecorDef[];
  summitGoal: {
    x: number;
    y: number;
    z: number;
    radius: number;
  };
  startSpawn: {
    x: number;
    y: number;
    z: number;
    yaw: number;
  };
}

export interface SolidCylinderCollider {
  x: number;
  y: number;
  z: number;
  radius: number;
  height: number;
}

export interface AnimatedSpringPad {
  def: SpringPadDef;
  group: THREE.Group;
  ringMesh: THREE.Mesh;
  coreMesh: THREE.Mesh;
  recoil: number;
  cooldown: number;
}

export interface AnimatedCheckpoint {
  def: CheckpointDef;
  group: THREE.Group;
  activated: boolean;
  plaqueMat: THREE.MeshStandardMaterial;
  beaconLight: THREE.PointLight | null;
  streamers: THREE.Mesh[];
  pulseTimer: number;
}

export interface AnimatedCrane {
  def: CraneDef;
  group: THREE.Group;
  leftWing: THREE.Object3D;
  rightWing: THREE.Object3D;
  haloMesh: THREE.Mesh;
  collected: boolean;
  collectAnim: number;
  phase: number;
}
