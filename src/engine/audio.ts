import type { AmbientPreset, AudioEngine } from './types';

const MUTE_STORAGE_KEY = 'atelier10:muted';

export class ProceduralAudioEngine implements AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  // Continuous electric wheelchair motor + rolling tire filter
  private motorOscMain: OscillatorNode | null = null;
  private motorOscHarm: OscillatorNode | null = null;
  private motorGain: GainNode | null = null;
  private motorFilter: BiquadFilterNode | null = null;

  private rollNoise: AudioBufferSourceNode | null = null;
  private rollFilter: BiquadFilterNode | null = null;
  private rollGain: GainNode | null = null;

  private driftNoise: AudioBufferSourceNode | null = null;
  private driftFilter: BiquadFilterNode | null = null;
  private driftGain: GainNode | null = null;

  // Ambient bed
  private ambientPreset: AmbientPreset = 'none';
  private ambientNodes: AudioNode[] = [];
  private ambientGain: GainNode | null = null;

  private _muted = false;
  private gestureBound = false;

  constructor() {
    try {
      this._muted = localStorage.getItem(MUTE_STORAGE_KEY) === '1';
    } catch {
      this._muted = false;
    }
    this.bindFirstGesture();
  }

  get muted(): boolean {
    return this._muted;
  }

  setMuted(muted: boolean): void {
    this._muted = muted;
    try {
      localStorage.setItem(MUTE_STORAGE_KEY, muted ? '1' : '0');
    } catch {
      // ignore storage quota errors
    }
    if (this.masterGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.72, now, 0.03);
    }
  }

  toggleMute(): boolean {
    this.setMuted(!this._muted);
    if (!this._muted) this.playClick();
    return this._muted;
  }

  resume(): void {
    const ctx = this.ensureContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  }

  setMotor(
    speedNorm: number,
    options?: { boost?: boolean; drift?: boolean; surface?: 'smooth' | 'gravel' | 'snow' | 'water' }
  ): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    this.ensureMotorNodes();
    if (!this.motorOscMain || !this.motorOscHarm || !this.motorGain || !this.motorFilter) return;
    if (!this.rollFilter || !this.rollGain || !this.driftGain || !this.driftFilter) return;

    const s = Math.max(0, Math.min(1.5, Math.abs(speedNorm)));
    const boost = Boolean(options?.boost);
    const drift = Boolean(options?.drift);
    const surface = options?.surface ?? 'smooth';
    const now = ctx.currentTime;

    // Warm electric power-chair motor whine: subtle harmonic pair
    const baseFreq = 68 + s * 165 + (boost ? 64 : 0);
    this.motorOscMain.frequency.setTargetAtTime(baseFreq, now, 0.05);
    this.motorOscHarm.frequency.setTargetAtTime(baseFreq * 2.01, now, 0.05);
    this.motorFilter.frequency.setTargetAtTime(260 + s * 950 + (boost ? 500 : 0), now, 0.06);

    const motorLevel = s < 0.02 ? 0 : Math.min(0.11, 0.022 + s * 0.065 + (boost ? 0.025 : 0));
    this.motorGain.gain.setTargetAtTime(motorLevel, now, 0.05);

    // Terrain rolling noise
    const surfaceFreq =
      surface === 'gravel' ? 780 : surface === 'snow' ? 520 : surface === 'water' ? 1100 : 340;
    const surfaceGainMul =
      surface === 'gravel' ? 1.55 : surface === 'snow' ? 1.25 : surface === 'water' ? 1.35 : 0.7;
    this.rollFilter.frequency.setTargetAtTime(surfaceFreq + s * 520, now, 0.06);
    const rollLevel = s < 0.03 ? 0 : Math.min(0.085, s * 0.045 * surfaceGainMul);
    this.rollGain.gain.setTargetAtTime(rollLevel, now, 0.06);

    // Drift tire hiss
    this.driftFilter.frequency.setTargetAtTime(1450 + s * 900, now, 0.05);
    this.driftGain.gain.setTargetAtTime(drift && s > 0.15 ? Math.min(0.1, 0.035 + s * 0.045) : 0, now, 0.04);
  }

  stopMotor(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.motorGain?.gain.setTargetAtTime(0, now, 0.05);
    this.rollGain?.gain.setTargetAtTime(0, now, 0.05);
    this.driftGain?.gain.setTargetAtTime(0, now, 0.05);
  }

  setAmbient(preset: AmbientPreset, volume = 0.08): void {
    if (preset === this.ambientPreset) return;
    this.clearAmbient();
    this.ambientPreset = preset;
    if (preset === 'none') return;

    const ctx = this.ctx;
    if (!ctx || !this.masterGain) return;

    const bedGain = ctx.createGain();
    bedGain.gain.setValueAtTime(0.0001, ctx.currentTime);
    bedGain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.8);
    bedGain.connect(this.masterGain);
    this.ambientGain = bedGain;

    if (preset === 'wind' || preset === 'rain' || preset === 'ocean') {
      const src = ctx.createBufferSource();
      src.buffer = this.getNoiseBuffer(ctx);
      src.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = preset === 'rain' ? 'bandpass' : 'lowpass';
      filter.frequency.value = preset === 'rain' ? 1700 : preset === 'ocean' ? 320 : 520;
      filter.Q.value = preset === 'rain' ? 0.6 : 1.2;

      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = preset === 'ocean' ? 0.14 : preset === 'wind' ? 0.22 : 0.08;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = preset === 'rain' ? 280 : 190;
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);

      src.connect(filter);
      filter.connect(bedGain);
      src.start();
      lfo.start();
      this.ambientNodes.push(src, filter, lfo, lfoGain, bedGain);
    } else if (preset === 'synth' || preset === 'space') {
      const freqs = preset === 'synth' ? [110, 164.81, 220] : [98, 146.83, 246.94];
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = preset === 'synth' ? 620 : 420;
      filter.connect(bedGain);
      this.ambientNodes.push(filter, bedGain);

      for (let i = 0; i < freqs.length; i++) {
        const osc = ctx.createOscillator();
        osc.type = i === 0 ? 'triangle' : 'sine';
        osc.frequency.value = freqs[i];
        osc.detune.value = (i - 1) * 5;
        const g = ctx.createGain();
        g.gain.value = 0.28 / freqs.length;
        osc.connect(g);
        g.connect(filter);
        osc.start();
        this.ambientNodes.push(osc, g);
      }
    }
  }

  playChime(pitchSemitones = 0, volume = 0.22): void {
    const ctx = this.readyContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;
    const freq = 587.33 * Math.pow(2, pitchSemitones / 12); // D5 root

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'triangle';
    osc1.frequency.setValueAtTime(freq, now);
    osc2.frequency.setValueAtTime(freq * 2, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.48);

    const g2 = ctx.createGain();
    g2.gain.value = 0.25;

    osc1.connect(gain);
    osc2.connect(g2);
    g2.connect(gain);
    gain.connect(this.masterGain);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.5);
    osc2.stop(now + 0.5);
  }

  playCombo(step: number, volume = 0.2): void {
    const pentatonic = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
    const idx = Math.max(0, Math.min(pentatonic.length - 1, Math.floor(step)));
    this.playChime(pentatonic[idx], volume);
  }

  playBoost(volume = 0.2): void {
    const ctx = this.readyContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.getNoiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.6;
    filter.frequency.setValueAtTime(320, now);
    filter.frequency.exponentialRampToValueAtTime(2200, now + 0.28);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start(now);
    src.stop(now + 0.44);

    // Rising synth shimmer
    const osc = ctx.createOscillator();
    const og = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(540, now + 0.3);
    og.gain.setValueAtTime(0.0001, now);
    og.gain.linearRampToValueAtTime(volume * 0.45, now + 0.03);
    og.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);
    osc.connect(og);
    og.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.38);
  }

  playBump(intensity = 0.6): void {
    const ctx = this.readyContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;
    const amp = Math.max(0.08, Math.min(0.4, intensity * 0.32));

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(135, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.14);

    gain.gain.setValueAtTime(amp, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  playBell(volume = 0.24): void {
    const ctx = this.readyContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;
    const partials = [1, 2.0, 2.756, 4.07];
    const base = 660;

    for (let i = 0; i < partials.length; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(base * partials[i], now);
      const decay = 0.85 / (i + 1);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime((volume * 0.6) / (i + 1), now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + decay + 0.02);
    }
  }

  playLaser(pitchSemitones = 0, volume = 0.16): void {
    const ctx = this.readyContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;
    const startFreq = 980 * Math.pow(2, pitchSemitones / 12);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(startFreq * 0.28, now + 0.16);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2800, now);

    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  playSplash(intensity = 0.65): void {
    const ctx = this.readyContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.getNoiseBuffer(ctx);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.9;
    filter.frequency.setValueAtTime(1400, now);
    filter.frequency.exponentialRampToValueAtTime(420, now + 0.32);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(Math.min(0.28, intensity * 0.25), now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start(now);
    src.stop(now + 0.38);
  }

  playJump(volume = 0.18): void {
    const ctx = this.readyContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(210, now);
    osc.frequency.exponentialRampToValueAtTime(520, now + 0.14);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  playVictory(): void {
    const notes = [0, 4, 7, 12];
    notes.forEach((n, i) => {
      setTimeout(() => this.playChime(n, 0.22), i * 95);
    });
  }

  playGameOver(): void {
    const notes = [7, 4, 0, -5];
    notes.forEach((n, i) => {
      setTimeout(() => this.playChime(n, 0.16), i * 115);
    });
  }

  playClick(): void {
    const ctx = this.readyContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(920, now);
    osc.frequency.exponentialRampToValueAtTime(480, now + 0.04);
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.055);
  }

  dispose(): void {
    this.clearAmbient();
    try {
      this.motorOscMain?.stop();
      this.motorOscHarm?.stop();
      this.rollNoise?.stop();
      this.driftNoise?.stop();
    } catch {
      // ignore if already stopped
    }
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.masterGain = null;
  }

  private bindFirstGesture(): void {
    if (this.gestureBound) return;
    this.gestureBound = true;
    const unlock = () => {
      this.resume();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    try {
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this._muted ? 0 : 0.72;
      this.masterGain.connect(this.ctx.destination);
      return this.ctx;
    } catch {
      return null;
    }
  }

  private readyContext(): AudioContext | null {
    const ctx = this.ensureContext();
    if (!ctx) return null;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
      return null;
    }
    return ctx;
  }

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer) return this.noiseBuffer;
    const length = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      // Slightly warm pink-ish noise
      last = (last + 0.08 * white) / 1.08;
      data[i] = last * 2.4 + white * 0.35;
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  private ensureMotorNodes(): void {
    if (this.motorOscMain || !this.ctx || !this.masterGain) return;
    const ctx = this.ctx;

    // Electric power-chair hum
    this.motorOscMain = ctx.createOscillator();
    this.motorOscHarm = ctx.createOscillator();
    this.motorOscMain.type = 'triangle';
    this.motorOscHarm.type = 'sine';
    this.motorOscMain.frequency.value = 72;
    this.motorOscHarm.frequency.value = 144;

    this.motorFilter = ctx.createBiquadFilter();
    this.motorFilter.type = 'lowpass';
    this.motorFilter.frequency.value = 340;

    this.motorGain = ctx.createGain();
    this.motorGain.gain.value = 0;

    const harmGain = ctx.createGain();
    harmGain.gain.value = 0.28;

    this.motorOscMain.connect(this.motorFilter);
    this.motorOscHarm.connect(harmGain);
    harmGain.connect(this.motorFilter);
    this.motorFilter.connect(this.motorGain);
    this.motorGain.connect(this.masterGain);

    this.motorOscMain.start();
    this.motorOscHarm.start();

    // Rolling tire noise
    this.rollNoise = ctx.createBufferSource();
    this.rollNoise.buffer = this.getNoiseBuffer(ctx);
    this.rollNoise.loop = true;

    this.rollFilter = ctx.createBiquadFilter();
    this.rollFilter.type = 'bandpass';
    this.rollFilter.frequency.value = 400;
    this.rollFilter.Q.value = 0.9;

    this.rollGain = ctx.createGain();
    this.rollGain.gain.value = 0;

    this.rollNoise.connect(this.rollFilter);
    this.rollFilter.connect(this.rollGain);
    this.rollGain.connect(this.masterGain);
    this.rollNoise.start();

    // Drift tire hiss
    this.driftNoise = ctx.createBufferSource();
    this.driftNoise.buffer = this.getNoiseBuffer(ctx);
    this.driftNoise.loop = true;

    this.driftFilter = ctx.createBiquadFilter();
    this.driftFilter.type = 'highpass';
    this.driftFilter.frequency.value = 1600;

    this.driftGain = ctx.createGain();
    this.driftGain.gain.value = 0;

    this.driftNoise.connect(this.driftFilter);
    this.driftFilter.connect(this.driftGain);
    this.driftGain.connect(this.masterGain);
    this.driftNoise.start();
  }

  private clearAmbient(): void {
    for (const node of this.ambientNodes) {
      try {
        if ('stop' in node && typeof (node as AudioScheduledSourceNode).stop === 'function') {
          (node as AudioScheduledSourceNode).stop();
        }
        node.disconnect();
      } catch {
        // ignore
      }
    }
    this.ambientNodes = [];
    this.ambientGain = null;
  }
}
