// Pure helpers shared by the Worker and the unit tests (no Cloudflare types here).

export const DIFFICULTIES = ['easy', 'normal', 'hard'] as const;
export type Diff = (typeof DIFFICULTIES)[number];
export const GRADES = ['S', 'A', 'B', 'C', 'D'] as const;

export const MAX_SCORE = 2_000_000;
export const MAX_COMBO = 5000;
export const TOP_N = 10;

export interface Submission {
  difficulty: Diff;
  name: string;
  score: number;
  grade: string;
  accuracy: number;
  maxCombo: number;
}

export function cleanName(raw: unknown): string {
  const n = String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
  return n || 'AAA';
}

/** Returns a clean submission, or an error string. */
export function parseSubmission(body: unknown): Submission | string {
  const o = body as Record<string, unknown> | null;
  if (!o || typeof o !== 'object') return 'invalid body';
  const difficulty = o.difficulty as Diff;
  if (!DIFFICULTIES.includes(difficulty)) return 'invalid difficulty';
  const score = o.score, accuracy = o.accuracy, maxCombo = o.maxCombo;
  if (typeof score !== 'number' || !Number.isInteger(score) || score <= 0 || score > MAX_SCORE) return 'invalid score';
  if (typeof accuracy !== 'number' || !(accuracy >= 0 && accuracy <= 1)) return 'invalid accuracy';
  if (typeof maxCombo !== 'number' || !Number.isInteger(maxCombo) || maxCombo < 0 || maxCombo > MAX_COMBO) return 'invalid combo';
  const grade = typeof o.grade === 'string' && (GRADES as readonly string[]).includes(o.grade) ? o.grade : 'D';
  return { difficulty, name: cleanName(o.name), score, grade, accuracy, maxCombo };
}
