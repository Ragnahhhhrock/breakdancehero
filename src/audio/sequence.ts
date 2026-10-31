/**
 * Track sequencer. Pure data: turns a song definition into a flat, sorted list of note events.
 * The synth renders these events to audio and the chart generator turns the very same events
 * into arrows, so the notes you hit are always exactly the sounds you hear.
 */

export type Inst =
  | 'kick' | 'snare' | 'clap' | 'hat' | 'ohat' | 'cow' | 'tom'
  | 'bass' | 'lead' | 'arp' | 'pad' | 'zap' | 'riser' | 'crash' | 'hey';

export interface Ev {
  /** seconds from the start of the track */
  t: number;
  /** absolute 16th-note index */
  step: number;
  bar: number;
  inst: Inst;
  /** MIDI note for pitched instruments */
  note?: number;
  /** duration in seconds for sustained instruments */
  len?: number;
  vel: number;
}

export interface Section {
  name: string;
  startBar: number;
  endBar: number; // exclusive
  /** 0..1 how hard the floor and crowd go off */
  energy: number;
  /** drums on / off, used by the visuals to find breakdowns */
  kick: boolean;
}

export interface TrackData {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  bars: number;
  beat: number;      // seconds per beat
  step: number;      // seconds per 16th
  duration: number;  // seconds, including the tail
  sections: Section[];
  events: Ev[];
}

type Pat = number[]; // 16 entries, 0 or velocity

const P = (steps: number[], vel = 1): Pat => {
  const a = new Array(16).fill(0);
  for (const s of steps) a[s] = vel;
  return a;
};

// --------------------------------------------------------------------------------------------
// "Cardboard Kings": 124 BPM, A minor, TR-808 drums, saw bass, robot-voice lead.
// --------------------------------------------------------------------------------------------

const BPM = 124;
const BARS = 64;

const KICK_GROOVE = P([0, 7, 10]);
const KICK_PEAK = P([0, 3, 7, 10, 14]);
const KICK_FOUR = P([0, 4, 8, 12]);
const SNARE_MAIN = P([4, 12]);
const SNARE_FILL = P([4, 10, 12, 14, 15], 0.9);
const CLAP_MAIN = P([4, 12]);
const HAT_8 = P([0, 2, 4, 6, 8, 10, 12, 14], 0.7);
const HAT_16 = P([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], 0.6);
const OHAT = P([6, 14]);
const COW_GROOVE = P([3, 11]);
const COW_PEAK = P([3, 6, 11, 14]);
const TOM_FILL = P([8, 10, 12, 13, 14, 15], 0.9);

/** Chord roots (MIDI bass) for the four-bar loop Am - Am - F - G, with the matching third. */
const BASS_ROOT = [33, 33, 29, 31];
const BASS_THIRD = [3, 3, 4, 4];

/** Bass rhythm: [step, semitones above root | 'third', length in steps] */
const BASS_RHYTHM: [number, number | 'third', number][] = [
  [0, 0, 2], [3, 0, 1], [6, 'third', 2], [10, 0, 1], [12, 7, 2], [14, 5, 2],
];
const BASS_RHYTHM_PEAK: [number, number | 'third', number][] = [
  [0, 0, 2], [2, 0, 1], [3, 12, 1], [6, 'third', 2], [8, 0, 2], [10, 0, 1], [12, 7, 1], [13, 12, 1], [14, 5, 2],
];

/** The robot-voice hook, four bars: [step, midi, length in steps] */
const LEAD_RIFF: [number, number, number][][] = [
  [[0, 69, 3], [3, 72, 1], [4, 76, 3], [8, 74, 2], [10, 72, 2], [12, 69, 4]],
  [[0, 69, 3], [3, 72, 1], [4, 76, 3], [8, 79, 2], [10, 76, 2], [12, 74, 4]],
  [[0, 65, 3], [3, 69, 1], [4, 72, 3], [8, 77, 2], [10, 72, 2], [12, 69, 4]],
  [[0, 67, 3], [3, 71, 1], [4, 74, 3], [8, 79, 2], [10, 74, 2], [12, 71, 2], [14, 67, 2]],
];

const PAD_CHORDS = [
  [57, 60, 64], [57, 60, 64], [53, 57, 60], [55, 59, 62],
];

/** Arpeggio (16ths) per chord, in semitones over the chord root note numbers. */
const ARP_NOTES = [
  [69, 72, 76, 81], [69, 72, 76, 81], [65, 69, 72, 77], [67, 71, 74, 79],
];

interface Plan {
  name: string;
  from: number;
  to: number;
  energy: number;
  kick: Pat | null;
  snare: Pat | null;
  clap: Pat | null;
  hat: Pat | null;
  ohat: Pat | null;
  cow: Pat | null;
  tom: Pat | null;
  bass: 'none' | 'groove' | 'peak';
  lead: boolean;
  arp: boolean;
  pad: boolean;
  fillLast: boolean;
}

const PLAN: Plan[] = [
  { name: 'Intro', from: 0, to: 2, energy: 0.2, kick: null, snare: null, clap: null, hat: HAT_8, ohat: null, cow: COW_GROOVE, tom: null, bass: 'none', lead: false, arp: true, pad: false, fillLast: false },
  { name: 'Drop in', from: 2, to: 4, energy: 0.4, kick: KICK_FOUR, snare: null, clap: CLAP_MAIN, hat: HAT_8, ohat: OHAT, cow: COW_GROOVE, tom: null, bass: 'none', lead: false, arp: true, pad: false, fillLast: false },
  { name: 'Groove A', from: 4, to: 12, energy: 0.55, kick: KICK_GROOVE, snare: SNARE_MAIN, clap: CLAP_MAIN, hat: HAT_8, ohat: OHAT, cow: COW_GROOVE, tom: null, bass: 'groove', lead: false, arp: false, pad: false, fillLast: true },
  { name: 'Groove B', from: 12, to: 20, energy: 0.7, kick: KICK_GROOVE, snare: SNARE_MAIN, clap: CLAP_MAIN, hat: HAT_16, ohat: OHAT, cow: COW_GROOVE, tom: null, bass: 'groove', lead: true, arp: false, pad: false, fillLast: true },
  { name: 'Breakdown', from: 20, to: 24, energy: 0.3, kick: null, snare: null, clap: CLAP_MAIN, hat: null, ohat: null, cow: null, tom: null, bass: 'none', lead: true, arp: false, pad: true, fillLast: false },
  { name: 'Peak 1', from: 24, to: 32, energy: 1, kick: KICK_PEAK, snare: SNARE_MAIN, clap: CLAP_MAIN, hat: HAT_16, ohat: OHAT, cow: COW_PEAK, tom: null, bass: 'peak', lead: true, arp: false, pad: false, fillLast: true },
  { name: 'Groove C', from: 32, to: 40, energy: 0.65, kick: KICK_GROOVE, snare: SNARE_MAIN, clap: CLAP_MAIN, hat: HAT_8, ohat: OHAT, cow: COW_PEAK, tom: null, bass: 'groove', lead: false, arp: true, pad: false, fillLast: true },
  { name: 'Break 2', from: 40, to: 44, energy: 0.3, kick: null, snare: null, clap: CLAP_MAIN, hat: null, ohat: null, cow: COW_GROOVE, tom: TOM_FILL, bass: 'none', lead: true, arp: false, pad: true, fillLast: false },
  { name: 'Peak 2', from: 44, to: 56, energy: 1, kick: KICK_PEAK, snare: SNARE_MAIN, clap: CLAP_MAIN, hat: HAT_16, ohat: OHAT, cow: COW_PEAK, tom: null, bass: 'peak', lead: true, arp: true, pad: false, fillLast: true },
  { name: 'Outro', from: 56, to: 64, energy: 0.45, kick: KICK_GROOVE, snare: null, clap: CLAP_MAIN, hat: HAT_8, ohat: null, cow: COW_GROOVE, tom: null, bass: 'groove', lead: false, arp: true, pad: false, fillLast: false },
];

export function buildCardboardKings(): TrackData {
  const beat = 60 / BPM;
  const step = beat / 4;
  const bar = step * 16;
  const events: Ev[] = [];

  const push = (barIx: number, s: number, inst: Inst, vel = 1, extra: Partial<Ev> = {}) => {
    const absStep = barIx * 16 + s;
    events.push({ t: absStep * step, step: absStep, bar: barIx, inst, vel, ...extra });
  };

  for (const plan of PLAN) {
    for (let b = plan.from; b < plan.to; b++) {
      const loopBar = (b - plan.from) % 4;
      const lastBar = b === plan.to - 1;
      const first = b === plan.from;

      const lay = (pat: Pat | null, inst: Inst) => {
        if (!pat) return;
        pat.forEach((v, s) => { if (v) push(b, s, inst, v); });
      };

      lay(plan.kick, 'kick');
      lay(plan.clap, 'clap');
      lay(plan.hat, 'hat');
      lay(plan.ohat, 'ohat');
      lay(plan.cow, 'cow');
      lay(plan.tom, 'tom');
      if (plan.snare) {
        // fill at the end of every 8 bars (and any section end with a kick)
        const fill = plan.fillLast && lastBar;
        lay(fill ? SNARE_FILL : plan.snare, 'snare');
        if (fill) lay(TOM_FILL, 'tom');
      }

      if (plan.bass !== 'none') {
        const root = BASS_ROOT[loopBar];
        const third = BASS_THIRD[loopBar];
        const rhythm = plan.bass === 'peak' ? BASS_RHYTHM_PEAK : BASS_RHYTHM;
        for (const [s, off, len] of rhythm) {
          const semi = off === 'third' ? third : off;
          push(b, s, 'bass', 1, { note: root + semi, len: len * step * 0.9 });
        }
      }

      if (plan.lead) {
        for (const [s, midi, len] of LEAD_RIFF[loopBar]) {
          push(b, s, 'lead', 0.9, { note: midi, len: len * step * 0.92 });
        }
      }

      if (plan.arp) {
        const notes = ARP_NOTES[loopBar];
        for (let s = 0; s < 16; s++) {
          push(b, s, 'arp', 0.55 + (s % 4 === 0 ? 0.25 : 0), { note: notes[s % 4] + (s >= 8 ? 12 : 0), len: step * 0.8 });
        }
      }

      if (plan.pad) {
        push(b, 0, 'pad', 0.8, { note: PAD_CHORDS[loopBar][0], len: bar * 0.98 });
        push(b, 0, 'pad', 0.8, { note: PAD_CHORDS[loopBar][1], len: bar * 0.98 });
        push(b, 0, 'pad', 0.8, { note: PAD_CHORDS[loopBar][2], len: bar * 0.98 });
      }

      if (first) {
        push(b, 0, 'crash', plan.energy > 0.6 ? 1 : 0.6);
        if (plan.energy > 0.5) push(b, 0, 'zap', 0.8);
      }
      if (lastBar && plan.name.startsWith('Break')) {
        push(b, 0, 'riser', 1, { len: bar });
      }
      // robot shouts on the breakdowns
      if (plan.name.startsWith('Break')) {
        push(b, 4, 'hey', 1, { note: 57 });
        push(b, 12, 'hey', 1, { note: 60 });
      }
    }
  }

  events.sort((a, c) => a.t - c.t || a.inst.localeCompare(c.inst));

  const sections: Section[] = PLAN.map((p) => ({
    name: p.name, startBar: p.from, endBar: p.to, energy: p.energy, kick: p.kick !== null,
  }));

  const duration = BARS * bar + 2.5;
  return {
    id: 'cardboard-kings',
    title: 'Cardboard Kings',
    artist: 'The Linoleum Crew',
    bpm: BPM,
    bars: BARS,
    beat,
    step,
    duration,
    sections,
    events,
  };
}

export const TRACKS = [buildCardboardKings];
