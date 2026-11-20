import type { GameMeta } from '../../engine/types';

export const GAME_META: GameMeta = {
  id: 'starlight-pinball',
  number: 4,
  title: 'Starlight Pinball',
  subtitle: 'Celestial Brass Observatory',
  genre: 'Kinetic Pinball',
  style: 'Brass Observatory',
  accentColor: '#D4A24E',
  controls: [
    { keys: 'A / D / Arrows', action: 'Left & Right Flippers / Move' },
    { keys: 'Space', action: 'Launch & Bump Pulse' },
    { keys: 'Shift', action: 'Nudge / Dash' },
  ],
  objective:
    'Ricochet through astrolabe bumpers, light every constellation lane, and chain celestial multipliers.',
};

// ---------------------------------------------------------------------------
// Playfield & Cabinet Dimensions (World Units, Y = 0 is playfield surface)
// ---------------------------------------------------------------------------

export const PLAYFIELD_HALF_W = 9.2;
export const PLAYFIELD_ARCH_CENTER_Z = -4.4;
export const PLAYFIELD_ARCH_RADIUS = 9.2; // Top apex at z = -13.6
export const PLAYFIELD_MIN_Z = PLAYFIELD_ARCH_CENTER_Z - PLAYFIELD_ARCH_RADIUS; // -13.6
export const PLAYFIELD_DRAIN_Z = 12.15;
export const PLAYFIELD_MAX_Z = 12.6;

export const CABINET_RAIL_THICKNESS = 1.05;
export const CABINET_RAIL_HEIGHT = 1.42;

export const BALL_RADIUS = 0.44;
export const PLAYER_RADIUS = 0.72;
export const PLAYER_START_X = 0;
export const PLAYER_START_Z = 4.9;

// ---------------------------------------------------------------------------
// Gameplay & Timing Tuning
// ---------------------------------------------------------------------------

export const MATCH_DURATION_SEC = 120;
export const BONUS_ORB_TIME_SEC = 8;
export const COMBO_DECAY_SEC = 4.2;
export const MULTIBALL_DURATION_SEC = 20;
export const DASH_DURATION_SEC = 0.28;
export const DASH_COOLDOWN_SEC = 1.15;
export const SHOCKWAVE_RADIUS = 3.6;

export const GRAVITY_Z = 7.4; // Pinball table downward slope acceleration (+Z)
export const BALL_MAX_SPEED = 36;
export const BALL_MIN_SPEED = 4.5;
export const PHYSICS_SUBSTEPS = 4;

// ---------------------------------------------------------------------------
// Playfield Feature Coordinates
// ---------------------------------------------------------------------------

export interface BumperDef {
  id: number;
  x: number;
  z: number;
  radius: number;
  points: number;
  label: string;
  accentHex: number;
}

export const BUMPERS: readonly BumperDef[] = [
  { id: 0, x: 0, z: -7.35, radius: 1.02, points: 250, label: 'Sol', accentHex: 0xffc857 },
  { id: 1, x: -4.25, z: -5.75, radius: 0.96, points: 175, label: 'Vega', accentHex: 0xffa94d },
  { id: 2, x: 4.25, z: -5.75, radius: 0.96, points: 175, label: 'Altair', accentHex: 0xffa94d },
  { id: 3, x: -3.55, z: -2.35, radius: 0.92, points: 150, label: 'Rigel', accentHex: 0xffe082 },
  { id: 4, x: 3.55, z: -2.35, radius: 0.92, points: 150, label: 'Sirius', accentHex: 0xffe082 },
];

export interface DropTargetDef {
  id: number;
  name: string;
  x: number;
  z: number;
  /** Unit normal pointing into the playfield */
  nx: number;
  nz: number;
  halfWidth: number;
  accentHex: number;
}

export const DROP_TARGETS: readonly DropTargetDef[] = [
  {
    id: 0,
    name: 'CYGNUS',
    x: -8.38,
    z: 0.55,
    nx: 0.97,
    nz: 0.24,
    halfWidth: 1.08,
    accentHex: 0x5cc8ff,
  },
  {
    id: 1,
    name: 'LYRA',
    x: 8.38,
    z: 0.55,
    nx: -0.97,
    nz: 0.24,
    halfWidth: 1.08,
    accentHex: 0x6ce5c8,
  },
  {
    id: 2,
    name: 'CASSIOPEIA',
    x: 0,
    z: -12.48,
    nx: 0,
    nz: 1,
    halfWidth: 1.38,
    accentHex: 0xffc857,
  },
];

export interface ZodiacLaneDef {
  id: number;
  name: string;
  symbol: string;
  x: number;
  z: number;
  halfWidth: number;
  halfDepth: number;
}

export const ZODIAC_LANES: readonly ZodiacLaneDef[] = [
  { id: 0, name: 'ARIES', symbol: '♈', x: -3.75, z: -10.35, halfWidth: 1.0, halfDepth: 1.05 },
  { id: 1, name: 'LEO', symbol: '♌', x: -1.25, z: -10.35, halfWidth: 1.0, halfDepth: 1.05 },
  { id: 2, name: 'LIBRA', symbol: '♎', x: 1.25, z: -10.35, halfWidth: 1.0, halfDepth: 1.05 },
  { id: 3, name: 'ORION', symbol: '✦', x: 3.75, z: -10.35, halfWidth: 1.0, halfDepth: 1.05 },
];

export interface LaneDividerDef {
  x: number;
  zStart: number;
  zEnd: number;
  radius: number;
}

export const LANE_DIVIDERS: readonly LaneDividerDef[] = [
  { x: -5.0, zStart: -11.05, zEnd: -9.55, radius: 0.16 },
  { x: -2.5, zStart: -11.25, zEnd: -9.55, radius: 0.16 },
  { x: 0.0, zStart: -11.25, zEnd: -9.55, radius: 0.16 },
  { x: 2.5, zStart: -11.25, zEnd: -9.55, radius: 0.16 },
  { x: 5.0, zStart: -11.05, zEnd: -9.55, radius: 0.16 },
];

export interface SlingshotDef {
  id: number;
  /** Active kicker edge A -> B */
  ax: number;
  az: number;
  bx: number;
  bz: number;
  /** Rear corner C */
  cx: number;
  cz: number;
  kickSpeed: number;
}

export const SLINGSHOTS: readonly SlingshotDef[] = [
  {
    id: 0,
    ax: -7.55,
    az: 3.55,
    bx: -5.45,
    bz: 6.75,
    cx: -7.65,
    cz: 6.85,
    kickSpeed: 21.5,
  },
  {
    id: 1,
    ax: 7.55,
    az: 3.55,
    bx: 5.45,
    bz: 6.75,
    cx: 7.65,
    cz: 6.85,
    kickSpeed: 21.5,
  },
];

export interface FlipperDef {
  side: 'left' | 'right';
  pivotX: number;
  pivotZ: number;
  length: number;
  baseRadius: number;
  tipRadius: number;
  restAngle: number;
  activeAngle: number;
}

// Angle 0 points along +X, positive angle rotates clockwise in XZ (+Z downward)
export const FLIPPERS: readonly FlipperDef[] = [
  {
    side: 'left',
    pivotX: -4.45,
    pivotZ: 9.45,
    length: 3.45,
    baseRadius: 0.36,
    tipRadius: 0.22,
    restAngle: 0.44,
    activeAngle: -0.54,
  },
  {
    side: 'right',
    pivotX: 4.45,
    pivotZ: 9.45,
    length: 3.45,
    baseRadius: 0.36,
    tipRadius: 0.22,
    restAngle: Math.PI - 0.44,
    activeAngle: Math.PI + 0.54,
  },
];

// Angled lower apron guide rails funneling balls from side walls to flipper pivots
export interface WallSegmentDef {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  thickness: number;
}

export const APRON_WALLS: readonly WallSegmentDef[] = [
  { ax: -PLAYFIELD_HALF_W, az: 7.45, bx: -4.45, bz: 9.45, thickness: 0.24 },
  { ax: PLAYFIELD_HALF_W, az: 7.45, bx: 4.45, bz: 9.45, thickness: 0.24 },
];

export const ASTROLABE_CENTER = { x: 0, z: 0.35, radius: 2.68 } as const;

export interface VortexDef {
  id: number;
  x: number;
  z: number;
  pullRadius: number;
  coreRadius: number;
}

export const VORTICES: readonly VortexDef[] = [
  { id: 0, x: -6.35, z: -3.55, pullRadius: 4.1, coreRadius: 1.05 },
  { id: 1, x: 6.35, z: -3.55, pullRadius: 4.1, coreRadius: 1.05 },
];

export const BONUS_ORB_SPOTS: readonly { x: number; z: number }[] = [
  { x: 0, z: -3.9 },
  { x: -5.4, z: 1.7 },
  { x: 5.4, z: 1.7 },
  { x: 0, z: 2.9 },
  { x: -6.5, z: -6.5 },
  { x: 6.5, z: -6.5 },
  { x: 0, z: -9.0 },
];
