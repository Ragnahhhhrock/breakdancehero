import { describe, expect, it } from 'vitest';
import { KEY_LAYOUTS } from '../src/game/keys';

describe('key layouts', () => {
  it('every layout maps all four lanes and keeps the arrow keys', () => {
    for (const l of KEY_LAYOUTS) {
      expect(new Set(Object.values(l.codes))).toEqual(new Set([0, 1, 2, 3]));
      expect(l.codes.ArrowLeft).toBe(0);
      expect(l.codes.ArrowRight).toBe(3);
    }
  });
  it('does not use the pause keys', () => {
    for (const l of KEY_LAYOUTS) { expect(l.codes.KeyP).toBeUndefined(); expect(l.codes.Escape).toBeUndefined(); }
  });
});
