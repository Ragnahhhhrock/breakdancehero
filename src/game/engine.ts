/**
 * Game engine: audio clock, judging, scoring, hype and the choreography that drives the dancer.
 * No DOM in here; main.ts wires input and drawing around it.
 */
import { buildCardboardKings, type TrackData } from '../audio/sequence';
import { renderTrack } from '../audio/synth';
import { APPROACH, buildChart, type Difficulty, type Note } from './chart';
import type { MoveName } from '../stage/dancer';

export type Grade = 'perfect' | 'great' | 'good';
export const WINDOW: Record<Grade, number> = { perfect: 0.05, great: 0.1, good: 0.15 };
const POINTS: Record<Grade, number> = { perfect: 100, great: 70, good: 40 };
const WEIGHT: Record<Grade, number> = { perfect: 1, great: 0.7, good: 0.4 };
const HYPE: Record<Grade, number> = { perfect: 0.03, great: 0.02, good: 0.01 };

export type Phase = 'menu' | 'countin' | 'playing' | 'paused' | 'results';

export interface Result {
  score: number;
  accuracy: number;
  grade: string;
  maxCombo: number;
  counts: Record<Grade | 'miss', number>;
  total: number;
  difficulty: Difficulty;
  best: number;
  newBest: boolean;
}

export interface Callbacks {
  onHit(lane: number, grade: Grade, delta: number): void;
  onMiss(lane: number): void;
  onStray(lane: number): void;
  onMilestone(combo: number): void;
  onEnd(r: Result): void;
}

const COUNT_IN_BEATS = 4;

export class Game {
  readonly track: TrackData = buildCardboardKings();
  ctx: AudioContext;
  buffer: AudioBuffer | null = null;
  phase: Phase = 'menu';
  difficulty: Difficulty = 'normal';
  notes: Note[] = [];
  approach = APPROACH.normal;

  score = 0;
  combo = 0;
  maxCombo = 0;
  hype = 0.35;
  counts: Record<Grade | 'miss', number> = { perfect: 0, great: 0, good: 0, miss: 0 };
  tapSound = false;

  private startAt = 0;
  private src: AudioBufferSourceNode | null = null;
  private master: GainNode;
  private lastCtx = 0;
  private lastPerf = 0;
  private nextIdx = 0;
  private missTimes: number[] = [];
  private freezeUntil = -1;
  private stumbleUntil = -1;
  private endAt = 0;
  private pendingEnd = false;

  constructor(private cb: Callbacks) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    try { this.tapSound = localStorage.getItem('bdh.tap') === '1'; } catch { /* ignore */ }
    this.installUnlock();
  }

  /**
   * iOS (Safari/Chrome, all WebKit) keeps Web Audio suspended until a user gesture and
   * mutes it when the ringer switch is on silent. Unlock on the first real gesture:
   * switch the audio session to "playback", loop a silent <audio> element (moves audio
   * off the ringer channel), resume the context and play a one-sample buffer.
   */
  private unlocked = false;
  private silentEl: HTMLAudioElement | null = null;

  private installUnlock() {
    const events = ['touchend', 'pointerup', 'click', 'keydown'] as const;
    const handler = () => {
      this.unlockAudio();
      if (this.unlocked) events.forEach((e) => window.removeEventListener(e, handler, true));
    };
    events.forEach((e) => window.addEventListener(e, handler, true));
    this.ctx.addEventListener('statechange', () => {
      // iOS can drop the context to 'interrupted' (calls, tab switches); recover on next gesture
      if (this.ctx.state !== 'running') this.unlocked = false;
    });
  }

  unlockAudio() {
    try {
      const nav = navigator as Navigator & { audioSession?: { type: string } };
      if (nav.audioSession) nav.audioSession.type = 'playback';
    } catch { /* unsupported */ }
    try {
      if (!this.silentEl) {
        const el = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=');
        el.loop = true;
        el.setAttribute('playsinline', '');
        this.silentEl = el;
      }
      void this.silentEl.play().catch(() => { /* needs a gesture; retried on next one */ });
    } catch { /* ignore */ }
    if (this.ctx.state !== 'running') void this.ctx.resume().catch(() => { /* retry on next gesture */ });
    try {
      const b = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
      const s = this.ctx.createBufferSource();
      s.buffer = b;
      s.connect(this.ctx.destination);
      s.start(0);
    } catch { /* ignore */ }
    this.unlocked = this.ctx.state === 'running';
  }

  async load(onProgress?: (f: number) => void): Promise<void> {
    this.buffer = await renderTrack(this.track, this.ctx.sampleRate, onProgress);
  }

  setTapSound(on: boolean) {
    this.tapSound = on;
    try { localStorage.setItem('bdh.tap', on ? '1' : '0'); } catch { /* ignore */ }
  }

  bestKey(d: Difficulty) { return `bdh.best.${this.track.id}.${d}`; }
  best(d: Difficulty): number {
    try { return parseInt(localStorage.getItem(this.bestKey(d)) ?? '0', 10) || 0; } catch { return 0; }
  }

  get total() { return this.notes.length; }

  /** The audio-clock song position (seconds) for what the player is hearing right now. */
  songPos(): number {
    if (this.phase === 'menu' || this.phase === 'results') return this.lastCtxPos();
    const c = this.ctx.currentTime;
    const p = performance.now();
    if (c !== this.lastCtx) { this.lastCtx = c; this.lastPerf = p; }
    const extra = this.ctx.state === 'running' ? Math.min((p - this.lastPerf) / 1000, 0.04) : 0;
    const lat = (this.ctx.outputLatency || 0) || (this.ctx.baseLatency || 0);
    return c + extra - this.startAt - lat;
  }

  private lastCtxPos() { return this.ctx.currentTime - this.startAt; }

  beatPos(): number { return this.songPos() / this.track.beat; }

  async start(diff: Difficulty) {
    if (!this.buffer) return;
    this.unlockAudio();
    // don't hang forever if iOS never settles resume(); proceed after a short wait
    await Promise.race([this.ctx.resume().catch(() => {}), new Promise((r) => setTimeout(r, 600))]);
    this.stopAudio();
    this.difficulty = diff;
    this.approach = APPROACH[diff];
    this.notes = buildChart(this.track, diff);
    this.score = 0; this.combo = 0; this.maxCombo = 0; this.hype = 0.35;
    this.counts = { perfect: 0, great: 0, good: 0, miss: 0 };
    this.nextIdx = 0;
    this.missTimes = [];
    this.freezeUntil = -1; this.stumbleUntil = -1;
    this.pendingEnd = false;
    const t0 = this.ctx.currentTime + 0.15;
    const countIn = COUNT_IN_BEATS * this.track.beat;
    this.startAt = t0 + countIn;
    this.master.gain.cancelScheduledValues(0);
    this.master.gain.setValueAtTime(1, this.ctx.currentTime);
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(this.master);
    src.start(this.startAt);
    this.src = src;
    for (let i = 0; i < COUNT_IN_BEATS; i++) this.blip(t0 + i * this.track.beat, i === 0 ? 1320 : 880, 0.07, 0.25);
    this.endAt = this.notes[this.notes.length - 1].t + 2.2;
    this.phase = 'countin';
    this.lastCtx = 0;
  }

  private blip(at: number, freq: number, dur: number, vol: number) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'square';
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(at);
    o.stop(at + dur + 0.02);
  }

  /** Synthesised crowd applause: a filtered-noise roar bed plus scattered individual claps. Bypasses `master` so the music fade-out doesn't mute it. */
  private applause(grade: string) {
    const c = this.ctx;
    const level = ({ S: 1, A: 0.85, B: 0.7, C: 0.5, D: 0.35 } as Record<string, number>)[grade] ?? 0.5;
    const dur = 2.5 + level * 2;
    const t0 = c.currentTime + 0.1;
    const out = c.createGain();
    out.gain.setValueAtTime(0.0001, t0);
    out.gain.exponentialRampToValueAtTime(0.9 * level, t0 + 0.35);
    out.gain.setValueAtTime(0.9 * level, t0 + dur * 0.45);
    out.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    out.connect(c.destination);
    const len = Math.floor(c.sampleRate * 0.5);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // roar bed
    const bed = c.createBufferSource();
    bed.buffer = buf; bed.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.5;
    const bedGain = c.createGain();
    bedGain.gain.value = 0.22;
    bed.connect(bp).connect(bedGain).connect(out);
    bed.start(t0); bed.stop(t0 + dur + 0.1);
    // individual claps, dense in the middle
    const claps = Math.round(dur * 70);
    for (let i = 0; i < claps; i++) {
      const u = Math.random();
      const t = t0 + u * dur;
      const dens = Math.sin(Math.PI * Math.min(1, u * 1.1));
      if (Math.random() > 0.25 + 0.75 * dens) continue;
      const src = c.createBufferSource();
      src.buffer = buf;
      const f = c.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 1200 + Math.random() * 2800; f.Q.value = 1.2;
      const g = c.createGain();
      const v = 0.25 + Math.random() * 0.5;
      g.gain.setValueAtTime(v, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03 + Math.random() * 0.04);
      src.connect(f).connect(g).connect(out);
      src.start(t, Math.random() * 0.4, 0.1);
    }
  }

  private stopAudio() {
    if (this.src) { try { this.src.stop(); } catch { /* already stopped */ } this.src.disconnect(); this.src = null; }
  }

  pause() {
    if (this.phase !== 'playing' && this.phase !== 'countin') return;
    this.prevPhase = this.phase;
    this.phase = 'paused';
    void this.ctx.suspend();
  }
  private prevPhase: Phase = 'playing';

  resume() {
    if (this.phase !== 'paused') return;
    this.phase = this.prevPhase;
    void this.ctx.resume();
  }

  quit() {
    this.stopAudio();
    this.phase = 'menu';
    void this.ctx.resume();
  }

  /** Called every frame. */
  update() {
    if (this.phase === 'countin' && this.songPos() >= 0) this.phase = 'playing';
    if (this.phase !== 'playing' && this.phase !== 'countin') return;
    const pos = this.songPos();
    // misses
    while (this.nextIdx < this.notes.length && this.notes[this.nextIdx].state !== 0) this.nextIdx++;
    for (let i = this.nextIdx; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.t > pos - WINDOW.good) break;
      if (n.state === 0) this.miss(n, pos);
    }
    if (!this.pendingEnd && pos > this.endAt) {
      this.pendingEnd = true;
      this.finish();
    }
  }

  private miss(n: Note, pos: number) {
    n.state = 2;
    this.counts.miss++;
    this.combo = 0;
    this.hype = Math.max(0, this.hype - 0.08);
    this.missTimes.push(pos);
    this.cb.onMiss(n.lane);
  }

  /** age = seconds since the input event happened (for accurate timestamps) */
  tap(lane: number, age = 0) {
    if (this.tapSound && (this.phase === 'playing' || this.phase === 'countin')) this.blip(this.ctx.currentTime, 1800, 0.03, 0.08);
    if (this.phase !== 'playing') return;
    const pos = this.songPos() - age;
    let best: Note | null = null;
    for (let i = this.nextIdx; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.t > pos + WINDOW.good) break;
      if (n.state !== 0 || n.lane !== lane) continue;
      if (Math.abs(n.t - pos) <= WINDOW.good && (!best || Math.abs(n.t - pos) < Math.abs(best.t - pos))) best = n;
    }
    if (!best) {
      this.hype = Math.max(0, this.hype - 0.01);
      this.cb.onStray(lane);
      return;
    }
    const d = best.t - pos;
    const ad = Math.abs(d);
    const grade: Grade = ad <= WINDOW.perfect ? 'perfect' : ad <= WINDOW.great ? 'great' : 'good';
    best.state = 1;
    best.delta = -d;
    this.counts[grade]++;
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    const mult = 1 + Math.min(1, Math.floor(this.combo / 10) * 0.1);
    this.score += Math.round(POINTS[grade] * mult);
    this.hype = Math.min(1, this.hype + HYPE[grade]);
    this.cb.onHit(lane, grade, -d);
    if (this.combo > 0 && this.combo % 50 === 0) {
      this.freezeUntil = this.beatPos() + 4;
      this.cb.onMilestone(this.combo);
    }
  }

  accuracy(): number {
    if (!this.notes.length) return 0;
    const c = this.counts;
    return (c.perfect * WEIGHT.perfect + c.great * WEIGHT.great + c.good * WEIGHT.good) / this.notes.length;
  }

  private finish() {
    const acc = this.accuracy();
    const grade = acc >= 0.92 ? 'S' : acc >= 0.8 ? 'A' : acc >= 0.65 ? 'B' : acc >= 0.5 ? 'C' : 'D';
    const prev = this.best(this.difficulty);
    const newBest = this.score > prev;
    if (newBest) { try { localStorage.setItem(this.bestKey(this.difficulty), String(this.score)); } catch { /* ignore */ } }
    // fade the music out and stop
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(1, t);
    this.master.gain.linearRampToValueAtTime(0, t + 1.2);
    setTimeout(() => this.stopAudio(), 1400);
    this.applause(grade);
    this.phase = 'results';
    this.cb.onEnd({
      score: this.score, accuracy: acc, grade, maxCombo: this.maxCombo, counts: { ...this.counts },
      total: this.notes.length, difficulty: this.difficulty, best: Math.max(prev, this.score), newBest,
    });
  }

  // ---------------------------------------------------------------- choreography / stage state

  sectionAt(bar: number) {
    return this.track.sections.find((s) => bar >= s.startBar && bar < s.endBar) ?? this.track.sections[this.track.sections.length - 1];
  }

  /** Pick the dancer's move for this moment from the song section, the hype and how the player is doing. */
  move(beat: number): MoveName {
    const bar = Math.floor(beat / 4);
    const pos = beat * this.track.beat;
    if (bar < 0) return 'toprock';
    while (this.missTimes.length && this.missTimes[0] < pos - 1.6) this.missTimes.shift();
    if (this.missTimes.length >= 3 && pos > this.stumbleUntil + 1.5) this.stumbleUntil = pos + 1.1;
    if (pos < this.stumbleUntil) return 'stumble';
    if (beat < this.freezeUntil) return 'freeze';

    const sec = this.sectionAt(bar);
    const e = sec.energy;
    const p = Math.floor(bar / 2);
    if (e <= 0.35) return (['toprock', 'indian'] as MoveName[])[p % 2];
    if (e <= 0.6) return (['toprock', 'indian', 'sixstep', 'toprock'] as MoveName[])[p % 4];
    if (this.hype < 0.45) return (['toprock', 'sixstep', 'indian', 'sixstep'] as MoveName[])[p % 4];
    // hot section and the crowd is behind you
    if (bar % 8 === 7 && this.hype > 0.55) return 'freeze';
    if (this.hype >= 0.7) return (['sixstep', 'backspin', 'windmill', 'sixstep', 'windmill', 'headspin'] as MoveName[])[p % 6];
    return (['sixstep', 'backspin', 'toprock', 'windmill'] as MoveName[])[p % 4];
  }

  dispose() {
    this.stopAudio();
    void this.ctx.close();
  }
}
