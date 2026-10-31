/**
 * Synth: renders a track's events to an AudioBuffer with an OfflineAudioContext.
 * TR-808 style drums, saw bass, a vocoder-ish robot lead, pulse arps and laser zaps.
 * Rendering offline means playback is a single sample-accurate buffer, which is what a rhythm game needs.
 */
import type { Ev, TrackData } from './sequence';

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

function noiseBuffer(ctx: BaseAudioContext, seconds = 1.5): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  // cheap deterministic noise so every render is identical
  let seed = 1337;
  for (let i = 0; i < len; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    d[i] = (seed / 4294967296) * 2 - 1;
  }
  return buf;
}

interface Bus {
  ctx: BaseAudioContext;
  drums: GainNode;
  bass: GainNode;
  lead: GainNode;
  pad: GainNode;
  fx: GainNode;      // send into the echo
  noise: AudioBuffer;
  step: number;
}

function env(p: AudioParam, t: number, peak: number, attack: number, decayTo: number, decay: number) {
  p.setValueAtTime(0.0001, t);
  p.linearRampToValueAtTime(peak, t + attack);
  p.exponentialRampToValueAtTime(Math.max(decayTo, 0.0001), t + attack + decay);
}

function noiseSrc(b: Bus, t: number, dur: number): AudioBufferSourceNode {
  const n = b.ctx.createBufferSource();
  n.buffer = b.noise;
  // different offset per hit so hats do not sound machine-gunned
  n.start(t, (t * 7.31) % 1, dur);
  return n;
}

function kick(b: Bus, t: number, vel: number) {
  const c = b.ctx;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(165, t);
  o.frequency.exponentialRampToValueAtTime(46, t + 0.11);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(1.0 * vel, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
  o.connect(g).connect(b.drums);
  o.start(t);
  o.stop(t + 0.6);
  // click
  const n = noiseSrc(b, t, 0.02);
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1800;
  const cg = c.createGain();
  cg.gain.setValueAtTime(0.35 * vel, t);
  cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.015);
  n.connect(hp).connect(cg).connect(b.drums);
}

function snare(b: Bus, t: number, vel: number) {
  const c = b.ctx;
  const n = noiseSrc(b, t, 0.3);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2200;
  bp.Q.value = 0.7;
  const g = c.createGain();
  env(g.gain, t, 0.7 * vel, 0.002, 0.0001, 0.2);
  n.connect(bp).connect(g).connect(b.drums);
  g.connect(b.fx);
  const o = c.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(230, t);
  o.frequency.exponentialRampToValueAtTime(130, t + 0.09);
  const og = c.createGain();
  env(og.gain, t, 0.55 * vel, 0.002, 0.0001, 0.12);
  o.connect(og).connect(b.drums);
  o.start(t);
  o.stop(t + 0.2);
}

function clap(b: Bus, t: number, vel: number) {
  const c = b.ctx;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1500;
  bp.Q.value = 1.1;
  const g = c.createGain();
  const out = c.createGain();
  bp.connect(g).connect(out);
  out.connect(b.drums);
  out.connect(b.fx);
  out.gain.value = 0.8 * vel;
  // three tight bursts then a tail: the classic hand clap
  g.gain.setValueAtTime(0.0001, t);
  for (const off of [0, 0.011, 0.023]) {
    g.gain.setValueAtTime(1, t + off);
    g.gain.exponentialRampToValueAtTime(0.18, t + off + 0.01);
  }
  g.gain.setValueAtTime(0.6, t + 0.034);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  const n = noiseSrc(b, t, 0.3);
  n.connect(bp);
}

function hat(b: Bus, t: number, vel: number, open: boolean) {
  const c = b.ctx;
  const n = noiseSrc(b, t, open ? 0.35 : 0.1);
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = open ? 6500 : 8000;
  const g = c.createGain();
  env(g.gain, t, (open ? 0.3 : 0.24) * vel, 0.001, 0.0001, open ? 0.24 : 0.04);
  n.connect(hp).connect(g).connect(b.drums);
}

function cowbell(b: Bus, t: number, vel: number) {
  const c = b.ctx;
  const g = c.createGain();
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 820;
  bp.Q.value = 1.3;
  env(g.gain, t, 0.42 * vel, 0.001, 0.0001, 0.2);
  for (const f of [560, 845]) {
    const o = c.createOscillator();
    o.type = 'square';
    o.frequency.value = f;
    o.connect(bp);
    o.start(t);
    o.stop(t + 0.25);
  }
  bp.connect(g);
  g.connect(b.drums);
  g.connect(b.fx);
}

function tom(b: Bus, t: number, vel: number, pitch: number) {
  const c = b.ctx;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(pitch * 1.7, t);
  o.frequency.exponentialRampToValueAtTime(pitch, t + 0.12);
  env(g.gain, t, 0.7 * vel, 0.002, 0.0001, 0.28);
  o.connect(g).connect(b.drums);
  o.start(t);
  o.stop(t + 0.32);
}

function bass(b: Bus, t: number, midi: number, len: number, vel: number) {
  const c = b.ctx;
  const f = mtof(midi);
  const saw = c.createOscillator();
  saw.type = 'sawtooth';
  saw.frequency.value = f;
  const sub = c.createOscillator();
  sub.type = 'square';
  sub.frequency.value = f / 2;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 7;
  lp.frequency.setValueAtTime(1500, t);
  lp.frequency.exponentialRampToValueAtTime(190, t + Math.min(0.22, len));
  const g = c.createGain();
  const hold = Math.max(len, 0.06);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.5 * vel, t + 0.006);
  g.gain.setValueAtTime(0.5 * vel, t + hold - 0.02);
  g.gain.linearRampToValueAtTime(0.0001, t + hold + 0.03);
  const subG = c.createGain();
  subG.gain.value = 0.55;
  saw.connect(lp);
  sub.connect(subG).connect(lp);
  lp.connect(g).connect(b.bass);
  saw.start(t);
  sub.start(t);
  saw.stop(t + hold + 0.06);
  sub.stop(t + hold + 0.06);
}

/** Vocoder-flavoured lead: saw pair into two formant filters, with late vibrato. */
function lead(b: Bus, t: number, midi: number, len: number, vel: number) {
  const c = b.ctx;
  const f = mtof(midi);
  const hold = Math.max(len, 0.05);
  const mix = c.createGain();
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.5 * vel, t + 0.012);
  g.gain.setValueAtTime(0.5 * vel, t + hold - 0.03);
  g.gain.linearRampToValueAtTime(0.0001, t + hold + 0.05);
  const lfo = c.createOscillator();
  lfo.frequency.value = 5.8;
  const lfoG = c.createGain();
  lfoG.gain.setValueAtTime(0, t);
  lfoG.gain.linearRampToValueAtTime(9, t + 0.25); // cents
  lfo.connect(lfoG);
  for (const det of [-6, 6]) {
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    o.detune.value = det;
    lfoG.connect(o.detune);
    o.connect(mix);
    o.start(t);
    o.stop(t + hold + 0.08);
  }
  lfo.start(t);
  lfo.stop(t + hold + 0.08);
  // two formants: "ah"
  for (const [fc, q, amp] of [[820, 6, 1], [1250, 8, 0.7], [2900, 10, 0.25]] as const) {
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = fc;
    bp.Q.value = q;
    const ag = c.createGain();
    ag.gain.value = amp;
    mix.connect(bp).connect(ag).connect(g);
  }
  g.connect(b.lead);
  const send = c.createGain();
  send.gain.value = 0.4;
  g.connect(send).connect(b.fx);
}

function arp(b: Bus, t: number, midi: number, len: number, vel: number) {
  const c = b.ctx;
  const o = c.createOscillator();
  o.type = 'square';
  o.frequency.value = mtof(midi);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(5200, t);
  lp.frequency.exponentialRampToValueAtTime(1200, t + len);
  const g = c.createGain();
  env(g.gain, t, 0.16 * vel, 0.003, 0.0001, len);
  o.connect(lp).connect(g).connect(b.lead);
  const send = c.createGain();
  send.gain.value = 0.55;
  g.connect(send).connect(b.fx);
  o.start(t);
  o.stop(t + len + 0.05);
}

function pad(b: Bus, t: number, midi: number, len: number, vel: number) {
  const c = b.ctx;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.14 * vel, t + 0.35);
  g.gain.setValueAtTime(0.14 * vel, t + len - 0.2);
  g.gain.linearRampToValueAtTime(0.0001, t + len + 0.1);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(500, t);
  lp.frequency.linearRampToValueAtTime(2400, t + len);
  lp.connect(g).connect(b.pad);
  for (const det of [-9, 0, 9]) {
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = mtof(midi);
    o.detune.value = det;
    o.connect(lp);
    o.start(t);
    o.stop(t + len + 0.2);
  }
}

function zap(b: Bus, t: number, vel: number) {
  const c = b.ctx;
  const o = c.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(5200, t);
  o.frequency.exponentialRampToValueAtTime(90, t + 0.32);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2200;
  bp.Q.value = 2;
  const g = c.createGain();
  env(g.gain, t, 0.22 * vel, 0.002, 0.0001, 0.34);
  o.connect(bp).connect(g).connect(b.lead);
  g.connect(b.fx);
  o.start(t);
  o.stop(t + 0.4);
}

function crash(b: Bus, t: number, vel: number) {
  const c = b.ctx;
  const n = noiseSrc(b, t, 1.4);
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 4800;
  const g = c.createGain();
  env(g.gain, t, 0.38 * vel, 0.002, 0.0001, 1.2);
  n.connect(hp).connect(g).connect(b.drums);
}

function riser(b: Bus, t: number, len: number) {
  const c = b.ctx;
  const n = noiseSrc(b, t, len + 0.1);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 3;
  bp.frequency.setValueAtTime(300, t);
  bp.frequency.exponentialRampToValueAtTime(7000, t + len);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5, t + len * 0.98);
  g.gain.linearRampToValueAtTime(0.0001, t + len + 0.03);
  n.connect(bp).connect(g).connect(b.lead);
}

/** Robot shout: a buzzy "hey" with two formant sweeps. */
function hey(b: Bus, t: number, midi: number) {
  const c = b.ctx;
  const f = mtof(midi);
  const mix = c.createGain();
  const o = c.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(f * 1.25, t);
  o.frequency.exponentialRampToValueAtTime(f, t + 0.18);
  o.connect(mix);
  o.start(t);
  o.stop(t + 0.4);
  const g = c.createGain();
  env(g.gain, t, 0.5, 0.01, 0.0001, 0.3);
  const f1 = c.createBiquadFilter();
  f1.type = 'bandpass';
  f1.Q.value = 7;
  f1.frequency.setValueAtTime(380, t);
  f1.frequency.linearRampToValueAtTime(760, t + 0.12);
  const f2 = c.createBiquadFilter();
  f2.type = 'bandpass';
  f2.Q.value = 8;
  f2.frequency.setValueAtTime(2300, t);
  f2.frequency.linearRampToValueAtTime(1500, t + 0.12);
  mix.connect(f1).connect(g);
  mix.connect(f2).connect(g);
  g.connect(b.lead);
  g.connect(b.fx);
}

function play(b: Bus, e: Ev) {
  switch (e.inst) {
    case 'kick': kick(b, e.t, e.vel); break;
    case 'snare': snare(b, e.t, e.vel); break;
    case 'clap': clap(b, e.t, e.vel); break;
    case 'hat': hat(b, e.t, e.vel, false); break;
    case 'ohat': hat(b, e.t, e.vel, true); break;
    case 'cow': cowbell(b, e.t, e.vel); break;
    case 'tom': tom(b, e.t, e.vel, 100 + (e.step % 4) * 22); break;
    case 'bass': bass(b, e.t, e.note ?? 33, e.len ?? 0.15, e.vel); break;
    case 'lead': lead(b, e.t, e.note ?? 69, e.len ?? 0.2, e.vel); break;
    case 'arp': arp(b, e.t, e.note ?? 69, e.len ?? 0.1, e.vel); break;
    case 'pad': pad(b, e.t, e.note ?? 57, e.len ?? 2, e.vel); break;
    case 'zap': zap(b, e.t, e.vel); break;
    case 'crash': crash(b, e.t, e.vel); break;
    case 'riser': riser(b, e.t, e.len ?? 2); break;
    case 'hey': hey(b, e.t, e.note ?? 57); break;
  }
}

async function renderSegment(track: TrackData, events: Ev[], sampleRate: number, dur: number): Promise<AudioBuffer> {
  const Offline: typeof OfflineAudioContext =
    window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  const ctx = new Offline(2, Math.ceil(dur * sampleRate), sampleRate);

  const out = ctx.createGain();
  out.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 8;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.14;
  const sum = ctx.createGain();
  sum.connect(comp).connect(out).connect(ctx.destination);

  const drums = ctx.createGain();
  drums.gain.value = 0.9;
  drums.connect(sum);
  const bassBus = ctx.createGain();
  bassBus.gain.value = 0.9;
  bassBus.connect(sum);
  const leadBus = ctx.createGain();
  leadBus.gain.value = 0.52;
  leadBus.connect(sum);
  const padBus = ctx.createGain();
  padBus.gain.value = 0.7;
  padBus.connect(sum);

  // echo: dotted-eighth feel, darkened each repeat
  const fx = ctx.createGain();
  const delay = ctx.createDelay(1);
  delay.delayTime.value = track.step * 3;
  const fb = ctx.createGain();
  fb.gain.value = 0.36;
  const dlp = ctx.createBiquadFilter();
  dlp.type = 'lowpass';
  dlp.frequency.value = 2600;
  const ret = ctx.createGain();
  ret.gain.value = 0.42;
  fx.connect(delay);
  delay.connect(dlp).connect(fb).connect(delay);
  dlp.connect(ret).connect(sum);

  const bus: Bus = { ctx, drums, bass: bassBus, lead: leadBus, pad: padBus, fx, noise: noiseBuffer(ctx), step: track.step };

  // sidechain-style duck: the bass and pads dip on every kick
  for (const e of events) {
    if (e.inst !== 'kick') continue;
    for (const dest of [bassBus.gain, padBus.gain]) {
      const base = dest === bassBus.gain ? 0.9 : 0.7;
      dest.setValueAtTime(base * 0.28, e.t);
      dest.linearRampToValueAtTime(base, e.t + 0.17);
    }
  }

  for (const e of events) play(bus, e);

  return ctx.startRendering();
}

/**
 * Renders in short chunks with a pre-roll. A single long offline context keeps every note's nodes alive for the
 * whole song (minutes of CPU on a phone); chunking cuts the render time by more than an order of magnitude.
 */
export async function renderTrack(track: TrackData, sampleRate: number, onProgress?: (f: number) => void): Promise<AudioBuffer> {
  const Offline: typeof OfflineAudioContext =
    window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  const total = Math.ceil(track.duration * sampleRate);
  const buf = new Offline(2, total, sampleRate).createBuffer(2, total, sampleRate);
  const bar = track.step * 16;
  const chunk = bar * 1;
  const pre = 2.0;
  const echoes = new Set(['snare', 'clap', 'cow', 'lead', 'arp', 'zap', 'hey']);
  for (let start = 0; start < track.duration; start += chunk) {
    const end = Math.min(track.duration, start + chunk);
    const from = Math.max(0, start - pre);
    // pre-roll events are only replayed if they still sound (or echo) inside this chunk
    const evs = track.events.filter((e) => e.t < end && (e.t >= start - 1e-6
      || (e.t >= from && (e.t + (e.len ?? 0.3) > start || (echoes.has(e.inst) && e.t > start - 1.1))))).map((e) => ({ ...e, t: e.t - from }));
    const seg = await renderSegment(track, evs, sampleRate, end - from);
    const skip = Math.round((start - from) * sampleRate);
    const n = Math.min(Math.round((end - start) * sampleRate), total - Math.round(start * sampleRate));
    for (let c = 0; c < 2; c++) {
      buf.getChannelData(c).set(seg.getChannelData(c).subarray(skip, skip + n), Math.round(start * sampleRate));
    }
    onProgress?.(end / track.duration);
  }
  normalise(buf);
  return buf;
}

function normalise(buf: AudioBuffer) {
  // normalise to a safe peak
  let peak = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const v = Math.abs(d[i]);
      if (v > peak) peak = v;
    }
  }
  if (peak > 0) {
    const k = 0.92 / peak;
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] *= k;
    }
  }
}
