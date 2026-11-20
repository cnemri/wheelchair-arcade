import type { AudioEngine } from '../../engine/types';
import { SIXTEENTH_INTERVAL } from './constants';

// D minor Outrun 16-step rolling synthwave bassline (Hz)
// 4 bars x 16 steps = 64 steps -> D2, Bb1, C2, A1 progression
const BASS_BARS: readonly (readonly number[])[] = [
  // Bar 1: D minor
  [73.42, 73.42, 146.83, 73.42, 73.42, 73.42, 146.83, 73.42, 73.42, 110.0, 146.83, 73.42, 87.31, 73.42, 130.81, 110.0],
  // Bar 2: Bb major
  [58.27, 58.27, 116.54, 58.27, 58.27, 58.27, 116.54, 58.27, 58.27, 87.31, 116.54, 58.27, 73.42, 58.27, 116.54, 87.31],
  // Bar 3: C major
  [65.41, 65.41, 130.81, 65.41, 65.41, 65.41, 130.81, 65.41, 65.41, 98.0, 130.81, 65.41, 82.41, 65.41, 130.81, 98.0],
  // Bar 4: A minor / turnaround
  [55.0, 55.0, 110.0, 55.0, 55.0, 55.0, 110.0, 55.0, 55.0, 82.41, 110.0, 65.41, 73.42, 82.41, 98.0, 110.0],
];

// Sparkle synth arpeggio notes for higher Boss Phases / Overdrive (Hz)
const ARP_NOTES: readonly number[] = [
  293.66, // D4
  349.23, // F4
  440.0, // A4
  523.25, // C5
  587.33, // D5
  698.46, // F5
  880.0, // A5
];

/**
 * Fully user-gesture-gated 120 BPM Outrun synthesizer + safe wrapper around `ctx.audio`.
 * Guarantees ZERO Chrome AudioContext warnings on direct `#game=synthwave-overdrive` deep-links.
 */
export class SynthAudioController {
  private readonly hostAudio: AudioEngine;
  private audioCtx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private unlocked = false;
  private ambientStarted = false;
  private paused = false;
  private disposed = false;

  private stepAccumulator = 0;
  private stepIndex = 0;
  private lastMutedState = false;

  constructor(hostAudio: AudioEngine) {
    this.hostAudio = hostAudio;
    this.lastMutedState = hostAudio.muted;

    if (typeof navigator !== 'undefined' && navigator.userActivation?.hasBeenActive) {
      this.unlocked = true;
    }

    window.addEventListener('keydown', this.onUserGesture, { passive: true, capture: true });
    window.addEventListener('pointerdown', this.onUserGesture, { passive: true, capture: true });
  }

  get isUnlocked(): boolean {
    return this.unlocked;
  }

  private onUserGesture = (): void => {
    if (this.disposed) return;
    this.unlocked = true;
    this.removeGestureListeners();
    this.hostAudio.resume();
    this.ensureSynthContext();
    if (!this.ambientStarted && !this.paused) {
      this.ambientStarted = true;
      this.hostAudio.setAmbient('synth', 0.055);
    }
  };

  private removeGestureListeners(): void {
    window.removeEventListener('keydown', this.onUserGesture, true);
    window.removeEventListener('pointerdown', this.onUserGesture, true);
  }

  private ensureSynthContext(): AudioContext | null {
    if (!this.unlocked || this.disposed) return null;
    if (!this.audioCtx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      try {
        this.audioCtx = new Ctor();
        this.masterGain = this.audioCtx.createGain();
        this.masterGain.gain.value = this.hostAudio.muted ? 0 : 0.48;
        this.masterGain.connect(this.audioCtx.destination);
      } catch {
        return null;
      }
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx.state === 'running' ? this.audioCtx : null;
  }

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer) return this.noiseBuffer;
    const len = Math.floor(ctx.sampleRate * 0.6);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buf;
    return buf;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) {
      if (this.unlocked) {
        this.hostAudio.stopMotor();
      }
      if (this.masterGain && this.audioCtx) {
        this.masterGain.gain.setTargetAtTime(0, this.audioCtx.currentTime, 0.03);
      }
    } else if (this.masterGain && this.audioCtx && !this.hostAudio.muted) {
      this.masterGain.gain.setTargetAtTime(0.48, this.audioCtx.currentTime, 0.05);
    }
  }

  resetBeatClock(): void {
    this.stepAccumulator = 0;
    this.stepIndex = 0;
  }

  /**
   * Advances the 120 BPM rhythm synth & electric chair motor hum.
   * Returns true on quarter-note beats for audio-visual alignment if needed.
   */
  update(
    dt: number,
    opts: {
      speedNorm: number;
      boost: boolean;
      grinding: boolean;
      phase: number;
      playing: boolean;
    }
  ): void {
    if (!this.unlocked || this.disposed) return;

    if (!this.ambientStarted && !this.paused) {
      this.ambientStarted = true;
      this.hostAudio.resume();
      this.hostAudio.setAmbient('synth', 0.055);
    }

    const ctx = this.ensureSynthContext();

    // Sync mute toggle cleanly with HUD button
    if (this.hostAudio.muted !== this.lastMutedState) {
      this.lastMutedState = this.hostAudio.muted;
      if (this.masterGain && this.audioCtx) {
        const target = this.hostAudio.muted || this.paused ? 0 : 0.48;
        this.masterGain.gain.setTargetAtTime(target, this.audioCtx.currentTime, 0.03);
      }
    }

    if (this.paused || !opts.playing) {
      this.hostAudio.stopMotor();
      return;
    }

    this.hostAudio.setMotor(opts.speedNorm, {
      boost: opts.boost,
      drift: opts.grinding,
      surface: 'smooth',
    });

    if (!ctx || !this.masterGain || this.hostAudio.muted) return;

    this.stepAccumulator += dt;
    while (this.stepAccumulator >= SIXTEENTH_INTERVAL) {
      this.stepAccumulator -= SIXTEENTH_INTERVAL;
      this.triggerSequencerStep(ctx, this.stepIndex, opts.phase, opts.boost);
      this.stepIndex = (this.stepIndex + 1) % 64;
    }
  }

  private triggerSequencerStep(ctx: AudioContext, step: number, phase: number, boost: boolean): void {
    if (!this.masterGain) return;
    const now = ctx.currentTime;
    const stepInBar = step % 16;
    const barIndex = Math.floor(step / 16) % BASS_BARS.length;

    // 1. Punchy 4-on-the-floor kick on steps 0, 4, 8, 12
    if (stepInBar % 4 === 0) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(138, now);
      osc.frequency.exponentialRampToValueAtTime(42, now + 0.11);
      g.gain.setValueAtTime(0.36, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.19);
    }

    // 2. Classic 80s gated snare on beats 2 & 4 (steps 4 & 12)
    if (stepInBar === 4 || stepInBar === 12) {
      const noise = ctx.createBufferSource();
      noise.buffer = this.getNoiseBuffer(ctx);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1550, now);
      bp.Q.value = 0.85;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.22, now);
      g.gain.setValueAtTime(0.18, now + 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.19);
      noise.connect(bp);
      bp.connect(g);
      g.connect(this.masterGain);
      noise.start(now);
      noise.stop(now + 0.2);

      // Snare tonal punch body
      const tone = ctx.createOscillator();
      const tg = ctx.createGain();
      tone.type = 'triangle';
      tone.frequency.setValueAtTime(215, now);
      tone.frequency.exponentialRampToValueAtTime(115, now + 0.07);
      tg.gain.setValueAtTime(0.14, now);
      tg.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
      tone.connect(tg);
      tg.connect(this.masterGain);
      tone.start(now);
      tone.stop(now + 0.1);
    }

    // 3. Crisp closed hi-hat on off-beats (steps 2, 6, 10, 14)
    if (stepInBar % 4 === 2) {
      const noise = ctx.createBufferSource();
      noise.buffer = this.getNoiseBuffer(ctx);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(6800, now);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.08, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
      noise.connect(hp);
      hp.connect(g);
      g.connect(this.masterGain);
      noise.start(now);
      noise.stop(now + 0.05);
    }

    // 4. Rolling 16th-note analog sawtooth bassline (every 2 steps, or every step during phase >= 2 / boost)
    const bassFreq = BASS_BARS[barIndex][stepInBar];
    if (stepInBar % 2 === 0 || phase >= 2 || boost) {
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const g = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(bassFreq, now);
      filter.type = 'lowpass';
      const cutoff = boost ? 1350 : 580 + phase * 180;
      filter.frequency.setValueAtTime(cutoff, now);
      filter.frequency.exponentialRampToValueAtTime(220, now + 0.11);
      filter.Q.value = 3.2;

      const amp = stepInBar % 2 === 0 ? 0.13 : 0.075;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(amp, now + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.115);

      osc.connect(filter);
      filter.connect(g);
      g.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.125);
    }

    // 5. Shimmering retro lead arpeggio on Phase 2+ or Overdrive Surge
    if ((phase >= 2 || boost) && stepInBar % 2 === 0) {
      const arpIdx = (stepInBar / 2 + barIndex * 2) % ARP_NOTES.length;
      const freq = ARP_NOTES[arpIdx];
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(boost ? 0.095 : 0.055, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.17);
    }
  }

  playLaneWeave(dir: number): void {
    const ctx = this.ensureSynthContext();
    if (!ctx || !this.masterGain || this.hostAudio.muted) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    const startF = dir < 0 ? 320 : 380;
    const endF = dir < 0 ? 520 : 600;
    osc.frequency.setValueAtTime(startF, now);
    osc.frequency.exponentialRampToValueAtTime(endF, now + 0.065);
    g.gain.setValueAtTime(0.07, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.075);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  playJump(): void {
    if (!this.unlocked || this.hostAudio.muted) return;
    this.hostAudio.playJump(0.2);
  }

  playPrism(comboStep: number): void {
    if (!this.unlocked || this.hostAudio.muted) return;
    this.hostAudio.playCombo(comboStep % 11, 0.22);
  }

  playGateThread(): void {
    if (!this.unlocked || this.hostAudio.muted) return;
    this.hostAudio.playChime(12, 0.2);
  }

  playRailLock(): void {
    const ctx = this.ensureSynthContext();
    if (!ctx || !this.masterGain || this.hostAudio.muted) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1480, now + 0.09);
    g.gain.setValueAtTime(0.11, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.13);
  }

  playEmpPulse(): void {
    if (!this.unlocked || this.hostAudio.muted) return;
    this.hostAudio.playBoost(0.28);
    const ctx = this.ensureSynthContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;

    // Massive Outrun sub-drop + bright power-chord shimmer
    const sub = ctx.createOscillator();
    const sg = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(160, now);
    sub.frequency.exponentialRampToValueAtTime(34, now + 0.55);
    sg.gain.setValueAtTime(0.45, now);
    sg.gain.exponentialRampToValueAtTime(0.0001, now + 0.62);
    sub.connect(sg);
    sg.connect(this.masterGain);
    sub.start(now);
    sub.stop(now + 0.64);

    const chord = [293.66, 440.0, 587.33, 880.0];
    for (const freq of chord) {
      const osc = ctx.createOscillator();
      const og = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq * 0.75, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.5, now + 0.42);
      og.gain.setValueAtTime(0.0001, now);
      og.gain.linearRampToValueAtTime(0.085, now + 0.04);
      og.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);
      osc.connect(og);
      og.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.68);
    }
  }

  playBossShieldShatter(): void {
    if (!this.unlocked || this.hostAudio.muted) return;
    this.hostAudio.playBell(0.28);
    this.hostAudio.playLaser(5, 0.18);
  }

  playShieldDamage(): void {
    if (!this.unlocked || this.hostAudio.muted) return;
    this.hostAudio.playBump(0.95);
    this.hostAudio.playLaser(-8, 0.22);
  }

  playBossFire(): void {
    if (!this.unlocked || this.hostAudio.muted) return;
    this.hostAudio.playLaser(-3, 0.13);
  }

  playVictory(): void {
    if (!this.unlocked || this.hostAudio.muted) return;
    this.hostAudio.playVictory();
  }

  playGameOver(): void {
    if (!this.unlocked || this.hostAudio.muted) return;
    this.hostAudio.playGameOver();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.removeGestureListeners();
    if (this.unlocked) {
      this.hostAudio.stopMotor();
      this.hostAudio.setAmbient('none');
    }
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
      this.masterGain = null;
    }
  }
}
