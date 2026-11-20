import * as THREE from 'three';

export type GravityDir = 'floor' | 'right' | 'left' | 'ceiling';

export type CardinalDir = '+x' | '-x' | '+y' | '-y' | '+z' | '-z';

export type BlockStyle = 'marble' | 'teak' | 'brass' | 'glass_curb' | 'wall_panel' | 'planter_box';

export interface SolidBoxDef {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  style: BlockStyle;
  /** If true, blocks lasers as well as bodies (default true) */
  blocksLaser?: boolean;
  /** Visual trim accent */
  brassTrim?: boolean;
}

export interface RampDef {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Height at maxZ (south/bottom edge) */
  yAtMaxZ: number;
  /** Height at minZ (north/top edge) */
  yAtMinZ: number;
}

export interface GravityPadDef {
  id: string;
  /** Surface this pad sits on */
  surface: GravityDir;
  /** World center position flush on its surface */
  pos: [number, number, number];
  /** Primary gravity direction triggered on press */
  targetGravity: GravityDir;
  /** Alternate gravity direction if already in targetGravity */
  altGravity: GravityDir;
  /** Radius of pad activation zone */
  radius?: number;
}

export interface CubeDef {
  id: string;
  /** Initial center position in world space */
  startPos: [number, number, number];
}

export interface ConduitDef {
  id: string;
  surface: GravityDir;
  /** World position flush on surface */
  pos: [number, number, number];
  /** Optional polyline points on floor/walls to trace energy wire to Airlock */
  wirePath: [number, number, number][];
}

export interface EmitterDef {
  id: string;
  /** World position of the laser aperture */
  origin: [number, number, number];
  dir: CardinalDir;
  /** Mount position for the brass heliostat housing */
  mountPos: [number, number, number];
}

export interface MirrorDef {
  id: string;
  surface: GravityDir;
  /** World position of pedestal base flush on its surface */
  basePos: [number, number, number];
  /** Crystal optical center (offset 1.15 along surface normal from basePos) */
  crystalPos: [number, number, number];
  /** Ordered list of 4 cardinal aim directions in this surface's tangent plane */
  aimCycle: [CardinalDir, CardinalDir, CardinalDir, CardinalDir];
  /** Starting index in aimCycle (0..3) */
  initialAimIdx: number;
}

export interface FixedElbowDef {
  id: string;
  /** World position of the elbow crystal center */
  pos: [number, number, number];
  inDir: CardinalDir;
  outDir: CardinalDir;
  /** Anchor bracket offset direction toward nearby wall */
  wallAttachDir?: CardinalDir;
}

export interface ReceiverDef {
  id: string;
  surface: GravityDir;
  /** World position of base flush on surface */
  basePos: [number, number, number];
  /** Optical target center */
  corePos: [number, number, number];
  wirePath: [number, number, number][];
}

export interface BotanicalAccentDef {
  kind: 'bonsai' | 'sakura' | 'olive' | 'fern' | 'boulder' | 'lantern';
  pos: [number, number, number];
  scale?: number;
  rotY?: number;
  seed?: number;
  bonsaiVariant?: 'emerald' | 'maple' | 'sakura';
}

export interface HydroBedDef {
  minX: number;
  maxX: number;
  y: number;
  minZ: number;
  maxZ: number;
  hasWater?: boolean;
  hasGrass?: boolean;
  hasFlowers?: boolean;
}

export interface StarSeedDef {
  id: string;
  pos: [number, number, number];
}

export interface ChamberDef {
  index: number;
  name: string;
  subtitle: string;
  hint: string;
  parMoves: number;
  parTime: number;
  initialGravity: GravityDir;
  spawnPos: [number, number, number];
  spawnYaw: number;
  airlockPos: [number, number, number];
  /** World bounds safety clamp */
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  };
  blocks: SolidBoxDef[];
  ramps: RampDef[];
  gravityPads: GravityPadDef[];
  cubes: CubeDef[];
  conduits: ConduitDef[];
  emitters: EmitterDef[];
  mirrors: MirrorDef[];
  elbows: FixedElbowDef[];
  receivers: ReceiverDef[];
  hydroBeds: HydroBedDef[];
  botanicals: BotanicalAccentDef[];
  starSeeds: StarSeedDef[];
  /** Chamber 5 grand centerpiece */
  hasWorldTree?: boolean;
}

export interface LaserSegment {
  start: THREE.Vector3;
  end: THREE.Vector3;
  hitKind: 'mirror' | 'elbow' | 'receiver' | 'block' | 'cube' | 'void';
}

export interface CubeRuntime {
  def: CubeDef;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  grounded: boolean;
  lockedConduitId: string | null;
  lockBlend: number;
  glowIntensity: number;
}

export interface MirrorRuntime {
  def: MirrorDef;
  aimIdx: number;
  currentAngle: number;
  targetAngle: number;
  energized: boolean;
}

export interface ConduitRuntime {
  def: ConduitDef;
  powered: boolean;
  powerBlend: number;
  lockedCubeId: string | null;
}

export interface ReceiverRuntime {
  def: ReceiverDef;
  powered: boolean;
  bloomBlend: number;
}

export interface StarSeedRuntime {
  def: StarSeedDef;
  collected: boolean;
}

export interface PlayerRuntime {
  /** World position of bottom-center of wheelchair tires */
  pos: THREE.Vector3;
  /** World velocity */
  vel: THREE.Vector3;
  /** Yaw in the active gravity surface's local frame (0 = -Z) */
  localYaw: number;
  /** Angular turn rate (rad/s) for rig animation */
  turnRate: number;
  /** Signed forward speed for rig wheel rolling */
  forwardSpeed: number;
  /** Current gravity surface roll angle around +Z (interpolated smoothly) */
  visualRoll: number;
  grounded: boolean;
  airborneTime: number;
  groundBump: number;
  hopCooldown: number;
  towingCubeId: string | null;
  tiltX: number;
  tiltZ: number;
}

export interface GravityBasis {
  dir: GravityDir;
  roll: number;
  down: THREE.Vector3;
  up: THREE.Vector3;
  right: THREE.Vector3;
  forward: THREE.Vector3;
}
