import type * as THREE from 'three';

export type GameId =
  | 'botanical-drift'
  | 'meadow-shepherd'
  | 'noir-quay'
  | 'starlight-pinball'
  | 'sakura-parkour'
  | 'coral-delivery'
  | 'synthwave-overdrive'
  | 'living-library'
  | 'glacier-slalom'
  | 'orbital-greenhouse';

export interface ControlHint {
  keys: string;
  action: string;
}

export interface GameMeta {
  id: GameId;
  number: number;
  title: string;
  subtitle: string;
  genre: string;
  style: string;
  accentColor: string;
  controls: ControlHint[];
  objective: string;
}

export interface HudStat {
  label: string;
  value: string | number;
  accent?: boolean;
}

export interface HudMeter {
  label: string;
  /** Progress in [0, 1] when `max` is omitted, or raw value when `max` is given */
  value: number;
  max?: number;
  color?: string;
}

export interface HudResult {
  title: string;
  subtitle?: string;
  score: number;
  scoreLabel?: string;
  isNewBest?: boolean;
  victory?: boolean;
  stats?: HudStat[];
  onRestart?: () => void;
}

export interface HudState {
  stats?: HudStat[];
  meters?: HudMeter[];
  /** Subtle top-center objective or phase pill */
  statusText?: string;
  /** Subtle bottom-center contextual interaction prompt */
  promptText?: string;
  paused?: boolean;
  result?: HudResult | null;
}

export type NotifyTone = 'info' | 'success' | 'warning' | 'accent';

export type AmbientPreset = 'none' | 'wind' | 'rain' | 'synth' | 'ocean' | 'space';

export interface AudioEngine {
  readonly muted: boolean;
  setMuted(muted: boolean): void;
  toggleMute(): boolean;
  resume(): void;
  /** Continuous electric power-chair drive hum + rolling noise (call every frame) */
  setMotor(speedNorm: number, options?: { boost?: boolean; drift?: boolean; surface?: 'smooth' | 'gravel' | 'snow' | 'water' }): void;
  stopMotor(): void;
  setAmbient(preset: AmbientPreset, volume?: number): void;
  playChime(pitchSemitones?: number, volume?: number): void;
  playCombo(step: number, volume?: number): void;
  playBoost(volume?: number): void;
  playBump(intensity?: number): void;
  playBell(volume?: number): void;
  playLaser(pitchSemitones?: number, volume?: number): void;
  playSplash(intensity?: number): void;
  playJump(volume?: number): void;
  playVictory(): void;
  playGameOver(): void;
  playClick(): void;
  dispose(): void;
}

export interface GameContext {
  container: HTMLElement;
  audio: AudioEngine;
  /** Saves best score in localStorage. Returns true if it beats the previous best. */
  saveBestScore(score: number): boolean;
  getBestScore(): number | null;
  exitToHub(): void;
  setHud(hudState: HudState): void;
  notify(text: string, tone?: NotifyTone, durationMs?: number): void;
  /** Optional hook so the HUD Restart button resets cleanly in-place; if omitted, the host remounts the game. */
  setRestartHandler?(handler: (() => void) | null): void;
}

export interface GameInstance {
  dispose(): void;
  setPaused?(paused: boolean): void;
}

export interface GameModule {
  meta: GameMeta;
  mount(ctx: GameContext): Promise<GameInstance>;
}

export interface FigurineMotionState {
  /** Signed forward speed in units/sec (positive = forward along -Z) */
  speed: number;
  /** Signed angular velocity in rad/sec (positive = turning left / CCW) */
  turnRate: number;
  /** Optional vertical surface bump impulse or height delta */
  groundBump?: number;
  /** True while boosting / dashing */
  boost?: boolean;
  /** True while off the ground */
  airborne?: boolean;
  /** Extra target pitch tilt in radians (terrain slope, ramps) */
  tiltX?: number;
  /** Extra target roll tilt in radians (banking, lateral slope) */
  tiltZ?: number;
}

export interface FigurineRigOptions {
  /** Target height in world units (default 1.65) */
  targetHeight?: number;
  /** Attach subtle dual warm LED headlight mount nodes & optional spot/glow */
  headlights?: boolean;
  /** Attach rear thruster / boost-glow mount */
  boostGlow?: boolean;
  /** PBR envMapIntensity multiplier (default 1.05) */
  envMapIntensity?: number;
  /** Cast shadows on figurine meshes (default true) */
  castShadow?: boolean;
  /** Receive shadows on figurine meshes (default true) */
  receiveShadow?: boolean;
}

export interface FigurineRig {
  /** Top-level transform: position on ground (y = 0 at tire bottom), yaw faces -Z */
  root: THREE.Group;
  /** Inner spring-damped pivot for procedural pitch/roll/bounce without fighting root yaw/pos */
  model: THREE.Group;
  /** Exact normalized dimensions of the figurine in world units */
  dimensions: THREE.Vector3;
  /** Attachment point near front footrest/frame for headlights or sensors */
  headlightMount: THREE.Group;
  /** Attachment point behind chassis for boost/trail/particles */
  rearMount: THREE.Group;
  /** Optional boost glow light/mesh controller if boostGlow enabled */
  setHeadlightIntensity(intensity: number): void;
  /** Update procedural suspension, chassis lean, wheel spin, and boost glow */
  update(dt: number, state: FigurineMotionState): void;
  /** Cleanly releases any rig-specific materials/lights without touching shared GLB template */
  dispose(): void;
}
