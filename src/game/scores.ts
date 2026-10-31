import type { Difficulty } from './chart';

export interface ScoreEntry {
  name: string;
  score: number;
  grade: string;
  accuracy: number;
  maxCombo: number;
  date: number;
}

export const MAX_SCORES = 10;
const key = (d: Difficulty) => `bdh.scores.${d}`;

function isEntry(e: unknown): e is ScoreEntry {
  const o = e as ScoreEntry;
  return !!o && typeof o.name === 'string' && typeof o.score === 'number' && Number.isFinite(o.score);
}

/** Sort high to low; earlier entries win ties. */
export function sortScores(list: ScoreEntry[]): ScoreEntry[] {
  return [...list].sort((a, b) => b.score - a.score || a.date - b.date).slice(0, MAX_SCORES);
}

export function loadScores(d: Difficulty): ScoreEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key(d)) ?? '[]');
    return Array.isArray(raw) ? sortScores(raw.filter(isEntry)) : [];
  } catch { return []; }
}

/** 1-based rank this score would take, or null if it misses the top 10. */
export function rankFor(list: ScoreEntry[], score: number): number | null {
  if (score <= 0) return null;
  const rank = list.filter((e) => e.score >= score).length + 1;
  return rank <= MAX_SCORES ? rank : null;
}

export function cleanName(raw: string): string {
  const n = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
  return n || 'AAA';
}

/** Insert an entry, persist, and return the new list. */
export function addScore(d: Difficulty, entry: ScoreEntry): ScoreEntry[] {
  const next = sortScores([...loadScores(d), { ...entry, name: cleanName(entry.name) }]);
  try { localStorage.setItem(key(d), JSON.stringify(next)); } catch { /* ignore */ }
  return next;
}
