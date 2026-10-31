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

/* ---- Global (all-players) high scores, served by the Cloudflare Worker in /worker ---- */

const API_BASE: string = import.meta.env.VITE_API_URL ?? 'https://api.breakdancehero.com';
const TIMEOUT_MS = 6000;

async function api(path: string, init?: RequestInit): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try { return await fetch(API_BASE + path, { ...init, signal: ctl.signal }); } finally { clearTimeout(t); }
}

/** Global top 10 for a difficulty, or null if the server can't be reached. */
export async function fetchScores(d: Difficulty): Promise<ScoreEntry[] | null> {
  try {
    const res = await api(`/api/scores?difficulty=${d}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { scores?: unknown };
    return Array.isArray(data.scores) ? sortScores(data.scores.filter(isEntry)) : null;
  } catch { return null; }
}

/** Submit a score to the global table. Returns the fresh top 10 and this score's rank, or null on failure. */
export async function submitScore(d: Difficulty, entry: ScoreEntry): Promise<{ scores: ScoreEntry[]; rank: number | null } | null> {
  try {
    const res = await api('/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ difficulty: d, name: cleanName(entry.name), score: entry.score, grade: entry.grade, accuracy: entry.accuracy, maxCombo: entry.maxCombo }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { scores?: unknown; rank?: number | null };
    if (!Array.isArray(data.scores)) return null;
    return { scores: sortScores(data.scores.filter(isEntry)), rank: typeof data.rank === 'number' ? data.rank : null };
  } catch { return null; }
}
