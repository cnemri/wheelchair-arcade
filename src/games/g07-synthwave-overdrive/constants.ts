import type { GameMeta } from '../../engine/types';

export const META: GameMeta = {
  id: 'synthwave-overdrive',
  number: 7,
  title: 'Synthwave Overdrive',
  subtitle: 'Twilight Horizon Highway',
  genre: 'Endless Runner',
  style: 'Retro Horizon',
  accentColor: '#C94B8B',
  controls: [
    { keys: 'A / D / Arrows', action: 'Weave 5 Lanes' },
    { keys: 'Space / W', action: 'Hop & Rail Grind' },
    { keys: 'Shift / E', action: 'EMP Overdrive Pulse' },
    { keys: 'R', action: 'Restart Run' },
  ],
  objective:
    'Thread glowing gate arches at full velocity, absorb energy prisms, grind neon rails, and shatter the Interceptor Boss with EMP pulses.',
};

// 5-lane wet-obsidian synth highway geometry
export const LANE_COUNT = 5;
export const LANE_WIDTH = 2.65;
export const LANE_X: readonly number[] = [-5.3, -2.65, 0, 2.65, 5.3];
export const ROAD_WIDTH = 15.0;
export const ROAD_CURB_X = 7.9;
export const HIGHWAY_LENGTH = 270;
export const HIGHWAY_CENTER_Z = -105;

// Rhythm clock (120 BPM)
export const BPM = 120;
export const BEAT_INTERVAL = 60 / BPM; // 0.5s per quarter-note beat
export const SIXTEENTH_INTERVAL = BEAT_INTERVAL / 4; // 0.125s

// Player kinematics & physics
export const BASE_SPEED = 35;
export const STAGE_SPEED_BONUS = 6.5; // per boss phase cleared (35 -> 41.5 -> 48)
export const OVERDRIVE_SPEED_BONUS = 15;
export const RAIL_GRIND_SPEED_BONUS = 5.5;
export const JUMP_VELOCITY = 14.2;
export const GRAVITY = 38.0;
export const RAIL_HEIGHT = 1.12;
export const PLAYER_Z = 0;

// Combat, scoring & progression
export const MAX_SHIELDS = 3;
export const BOSS_PHASES = 3;
export const RUN_DURATION_SECONDS = 90;
export const INITIAL_EMP_CHARGE = 0.36; // Start partially charged so first EMP lands quickly
export const PRISM_EMP_GAIN = 0.105;
export const GATE_EMP_GAIN = 0.08;
export const RAIL_EMP_PER_SEC = 0.28;
export const WAVE_VAULT_EMP_GAIN = 0.14;
export const EMP_DURATION = 2.35;
export const INVULN_AFTER_HIT = 1.65;

// Spawning distances along -Z
export const SPAWN_Z = -148;
export const DESPAWN_Z = 18;

// Neon Outrun palette constants
export const COLORS = {
  cyan: 0x00f5ff,
  magenta: 0xff2ea6,
  violet: 0x9b4dff,
  gold: 0xffce47,
  crimson: 0xff2d55,
  obsidian: 0x120926,
  chrome: 0xd8e2f5,
} as const;

export function getLaneX(lane: number): number {
  const clamped = Math.max(0, Math.min(LANE_COUNT - 1, Math.round(lane)));
  return LANE_X[clamped];
}
