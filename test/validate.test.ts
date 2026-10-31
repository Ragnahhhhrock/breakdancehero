import { describe, expect, it } from 'vitest';
import { cleanName, MAX_SCORE, parseSubmission } from '../worker/validate';

const ok = { difficulty: 'hard', name: 'mal', score: 12345, grade: 'S', accuracy: 0.95, maxCombo: 120 };

describe('score submission validation', () => {
  it('accepts a good submission and cleans the name', () => {
    expect(parseSubmission(ok)).toEqual({ ...ok, name: 'MAL' });
    expect(cleanName('a!b#c$d')).toBe('ABC');
    expect(cleanName(undefined)).toBe('AAA');
  });
  it('rejects bad difficulty, score, accuracy and combo', () => {
    expect(parseSubmission({ ...ok, difficulty: 'insane' })).toBe('invalid difficulty');
    expect(parseSubmission({ ...ok, score: 0 })).toBe('invalid score');
    expect(parseSubmission({ ...ok, score: 1.5 })).toBe('invalid score');
    expect(parseSubmission({ ...ok, score: MAX_SCORE + 1 })).toBe('invalid score');
    expect(parseSubmission({ ...ok, accuracy: 2 })).toBe('invalid accuracy');
    expect(parseSubmission({ ...ok, maxCombo: -1 })).toBe('invalid combo');
    expect(parseSubmission(null)).toBe('invalid body');
  });
  it('falls back to grade D for an unknown grade', () => {
    expect(parseSubmission({ ...ok, grade: 'ZZZ' })).toMatchObject({ grade: 'D' });
  });
});
