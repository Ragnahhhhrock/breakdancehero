import { describe, expect, it } from 'vitest';
import { buildCardboardKings } from '../src/audio/sequence';
import { buildChart, chartStats, DIFFICULTIES } from '../src/game/chart';

describe('track', () => {
  const track = buildCardboardKings();
  it('runs 90 seconds at most at 124 BPM', () => {
    expect(track.bpm).toBe(124);
    expect(track.duration).toBeGreaterThan(75);
    expect(track.duration).toBeLessThanOrEqual(90);
  });
  it('has sorted events inside the track', () => {
    for (let i = 1; i < track.events.length; i++) expect(track.events[i].t).toBeGreaterThanOrEqual(track.events[i - 1].t);
    expect(track.events.at(-1)!.t).toBeLessThan(track.duration);
  });
});

describe('charts', () => {
  const track = buildCardboardKings();
  for (const d of DIFFICULTIES) {
    it(`${d} is playable`, () => {
      const notes = buildChart(track, d);
      const s = chartStats(notes, track);
      console.log(d, JSON.stringify(s));
      for (let i = 1; i < notes.length; i++) expect(notes[i].t).toBeGreaterThanOrEqual(notes[i - 1].t);
      // every lane gets used on normal/hard, and never more than two arrows at once
      if (d !== 'easy') for (const n of s.perLane) expect(n).toBeGreaterThan(10);
      const byTime = new Map<number, number>();
      for (const n of notes) byTime.set(Math.round(n.t * 1000), (byTime.get(Math.round(n.t * 1000)) ?? 0) + 1);
      for (const c of byTime.values()) expect(c).toBeLessThanOrEqual(2);
    });
  }
  it('gets denser with difficulty', () => {
    const e = buildChart(track, 'easy').length, n = buildChart(track, 'normal').length, h = buildChart(track, 'hard').length;
    expect(e).toBeLessThan(n);
    expect(n).toBeLessThan(h);
  });
});
