/**
 * Chart generation: turns a track's note events into arrows.
 * Lanes: 0 = left, 1 = down, 2 = up, 3 = right (like the arcade pads).
 * Easy keeps to kick and clap; Normal adds cowbell and bass; Hard adds the lead, toms and hats.
 */
import type { Ev, Inst, TrackData } from '../audio/sequence';

export type Difficulty = 'easy' | 'normal' | 'hard';
export const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];

export interface Note {
  t: number;
  lane: number;
  /** 0 pending, 1 hit, 2 missed */
  state: 0 | 1 | 2;
  /** when the player hit it, seconds of timing error (+ late) */
  delta: number;
  inst: Inst;
}

interface Rules {
  /** instruments whose arrows alternate between the left and right lanes */
  alternate: Inst[];
  minGap: number;
  /** when two arrows at once (a jump) are allowed */
  chords: 'off' | 'bar' | 'beat';
  approach: number; // seconds an arrow takes to travel down the lane
  use: Partial<Record<Inst, number>>; // priority per instrument
}

const RULES: Record<Difficulty, Rules> = {
  easy: {
    alternate: [], minGap: 0.36, chords: 'off', approach: 1.7,
    use: { clap: 10, snare: 10, kick: 9 },
  },
  normal: {
    alternate: ['cow', 'tom'], minGap: 0.12, chords: 'bar', approach: 1.45,
    use: { kick: 10, clap: 9, snare: 9, cow: 6, tom: 5 },
  },
  hard: {
    alternate: ['tom', 'lead', 'hat', 'ohat'], minGap: 0.12, chords: 'beat', approach: 1.25,
    use: { kick: 10, clap: 9, snare: 9, cow: 6, tom: 5, lead: 4, hat: 2, ohat: 2 },
  },
};

export const APPROACH: Record<Difficulty, number> = {
  easy: RULES.easy.approach, normal: RULES.normal.approach, hard: RULES.hard.approach,
};

const BASE_LANE: Partial<Record<Inst, number>> = {
  kick: 1, snare: 2, clap: 2, cow: 3, bass: 0,
};

export function buildChart(track: TrackData, diff: Difficulty): Note[] {
  const rules = RULES[diff];
  const cands: { ev: Ev; prio: number }[] = [];
  const seenKey = new Set<string>();

  for (const ev of track.events) {
    const prio = rules.use[ev.inst];
    if (!prio) continue;
    // hats and toms: only on the strong subdivisions unless the section is a peak
    if ((ev.inst === 'hat') && ev.step % 2 !== 0) continue;
    if (ev.inst === 'hat' && diff === 'hard') {
      const sec = track.sections.find((s) => ev.bar >= s.startBar && ev.bar < s.endBar);
      if (!sec || sec.energy < 0.95) {
        if (ev.step % 4 !== 2) continue; // sparse offbeat hats outside the peaks
      }
    }
    // clap and snare land on the same step: keep one
    const key = `${ev.step}:${ev.inst === 'snare' || ev.inst === 'clap' ? 'sc' : ev.inst}`;
    if (seenKey.has(key)) continue;
    seenKey.add(key);
    // short bass notes and 16th-note filler make poor arrows
    if ((ev.inst === 'bass' || ev.inst === 'lead') && (ev.len ?? 0) < track.step * 1.6) continue;
    cands.push({ ev, prio });
  }

  const accepted: Note[] = [];
  const tiers = [...new Set(cands.map((c) => c.prio))].sort((a, b) => b - a);
  let alt = 0;

  const free = (t: number, lane: number, step: number): boolean => {
    let sameTime = 0;
    for (const n of accepted) {
      const dt = Math.abs(n.t - t);
      if (dt < 0.006) {
        if (n.lane === lane) return false;
        sameTime++;
        continue;
      }
      if (dt < rules.minGap) return false;
    }
    // at most a two-arrow jump, and only where the difficulty allows them
    if (sameTime >= 1) {
      const ok = rules.chords === 'beat' ? step % 4 === 0 : rules.chords === 'bar' ? step % 16 === 0 : false;
      if (!ok || sameTime >= 2) return false;
    }
    return true;
  };

  for (const prio of tiers) {
    for (const c of cands) {
      if (c.prio !== prio) continue;
      const { ev } = c;
      let lane = BASE_LANE[ev.inst];
      if (lane === undefined || rules.alternate.includes(ev.inst)) {
        lane = alt % 2 === 0 ? 0 : 3;
        alt++;
        if (!free(ev.t, lane, ev.step)) lane = lane === 0 ? 3 : 0;
      }
      if (!free(ev.t, lane, ev.step)) continue;
      accepted.push({ t: ev.t, lane, state: 0, delta: 0, inst: ev.inst });
    }
  }

  accepted.sort((a, b) => a.t - b.t || a.lane - b.lane);
  return accepted;
}

export function chartStats(notes: Note[], track: TrackData) {
  const perLane = [0, 0, 0, 0];
  let jumps = 0;
  for (let i = 0; i < notes.length; i++) {
    perLane[notes[i].lane]++;
    if (i > 0 && Math.abs(notes[i].t - notes[i - 1].t) < 0.006) jumps++;
  }
  const span = track.bars * track.step * 16;
  return { total: notes.length, perLane, jumps, perSecond: notes.length / span };
}
