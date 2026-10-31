import { describe, expect, it } from 'vitest';
import { cleanName, MAX_SCORES, rankFor, sortScores, type ScoreEntry } from '../src/game/scores';

const e = (score: number, date = 0): ScoreEntry => ({ name: 'AAA', score, grade: 'A', accuracy: 0.9, maxCombo: 10, date });

describe('high scores', () => {
  it('sorts high to low and keeps only the top 10', () => {
    const list = sortScores(Array.from({ length: 15 }, (_, i) => e(i * 100)));
    expect(list).toHaveLength(MAX_SCORES);
    expect(list[0].score).toBe(1400);
    expect(list.at(-1)!.score).toBe(500);
  });
  it('ranks a new score, and rejects ones that miss the table', () => {
    const full = Array.from({ length: 10 }, (_, i) => e((10 - i) * 1000));
    expect(rankFor(full, 20000)).toBe(1);
    expect(rankFor(full, 5500)).toBe(6);
    expect(rankFor(full, 1001)).toBe(10);
    expect(rankFor(full, 1000)).toBeNull(); // ties lose to earlier entries
    expect(rankFor(full, 999)).toBeNull();
    expect(rankFor([], 1)).toBe(1);
    expect(rankFor([], 0)).toBeNull();
  });
  it('cleans initials', () => {
    expect(cleanName('ab!cd')).toBe('ABC');
    expect(cleanName('')).toBe('AAA');
  });
});
