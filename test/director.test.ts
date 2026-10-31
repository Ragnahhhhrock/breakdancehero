import { describe, expect, it } from 'vitest';
import { Director, type ShotId } from '../src/stage/director';
import { scratch } from '../src/stage/dj';

const booth = { x: -3.7, z: -3.7, yaw: Math.PI / 4 };
const ctx = { move: 'toprock' as const, energy: 0.8 };

/** Run the director over a stretch of the song and log every cut. */
function run(d: Director, from: number, to: number) {
  const cuts: { beat: number; shot: ShotId }[] = [];
  let last: ShotId | null = null;
  for (let b = from; b < to; b += 1 / 30) {
    const s = d.update(b, 1 / 30, ctx);
    if (s.shot !== last) { cuts.push({ beat: b, shot: s.shot }); last = s.shot; }
  }
  return cuts;
}

describe('camera director', () => {
  it('holds the establishing shot through the count-in', () => {
    const d = new Director({ booth });
    for (let b = -8; b < 0; b += 0.25) expect(d.update(b, 0.1, ctx).shot).toBe('wide');
  });

  it('cuts on the bar line', () => {
    const cuts = run(new Director({ booth }), 0, 400);
    expect(cuts.length).toBeGreaterThan(20);
    // sampled at 30 fps, so a cut lands within one frame after the bar line
    for (const c of cuts) expect(c.beat % 4).toBeLessThan(0.05);
  });

  it('cuts away to the DJ now and then, but never for long', () => {
    const d = new Director({ booth });
    let dj = 0, total = 0;
    let first = Infinity;
    for (let b = 0; b < 480; b += 1 / 30) {
      const s = d.update(b, 1 / 30, ctx);
      total++;
      if (s.dj) { dj++; first = Math.min(first, b); }
    }
    expect(dj / total).toBeGreaterThan(0.05);
    expect(dj / total).toBeLessThan(0.35);
    expect(first).toBeGreaterThanOrEqual(24);
  });

  it('is the same every time for the same seed', () => {
    const a = run(new Director({ booth, seed: 7 }), 0, 200).map((c) => c.shot).join();
    const b = run(new Director({ booth, seed: 7 }), 0, 200).map((c) => c.shot).join();
    expect(a).toBe(b);
  });

  it('never zooms the dancer past the limit', () => {
    const d = new Director({ booth });
    d.maxZoom = 1.2;
    for (let b = 0; b < 300; b += 1 / 30) {
      const s = d.update(b, 1 / 30, ctx);
      if (!s.dj) expect(s.zoom).toBeLessThanOrEqual(1.2 + 1e-9);
    }
  });

  it('cuts to a hero shot on request and restarts cleanly', () => {
    const d = new Director({ booth });
    d.update(20, 0.03, ctx);
    d.hero();
    const s = d.update(21, 0.03, ctx);
    expect(['hero', 'close']).toContain(s.shot);
    expect(d.update(2, 0.03, ctx).shot).toBe('wide');
  });

  it('holds one steady shot with reduced motion', () => {
    const cuts = run(new Director({ booth, reducedMotion: true }), 0, 200);
    expect(cuts.map((c) => c.shot)).toEqual(['wide']);
  });
});

describe('scratch patterns', () => {
  it('keep the record and the crossfader in range', () => {
    for (let pat = 0; pat < 6; pat++) {
      for (let b = 0; b < 16; b += 0.05) {
        const s = scratch(pat, b);
        expect(Math.abs(s.s)).toBeLessThanOrEqual(1.31);
        expect([0, 1]).toContain(s.gate);
      }
    }
  });
});
