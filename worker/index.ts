/**
 * Breakdance Hero global high scores — Cloudflare Worker + D1.
 *   GET  /api/scores?difficulty=easy|normal|hard  -> { scores: [...top 10] }
 *   POST /api/scores  { difficulty, name, score, grade, accuracy, maxCombo } -> { scores, rank }
 */
import { DIFFICULTIES, TOP_N, parseSubmission, type Diff } from './validate';

// Minimal D1 typings so the project needs no extra dev dependency.
interface D1Result<T> { results: T[] }
interface D1Statement {
  bind(...v: unknown[]): D1Statement;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
}
interface D1Database { prepare(q: string): D1Statement }
interface Env { DB: D1Database; ALLOWED_ORIGINS: string }

const RATE_LIMIT_PER_HOUR = 30; // submissions per IP hash per hour

function cors(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
  const ok = allowed.includes(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : allowed[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const json = (data: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });

async function topScores(env: Env, d: Diff) {
  const { results } = await env.DB
    .prepare('SELECT name, score, grade, accuracy, max_combo AS maxCombo, created_at AS date FROM scores WHERE difficulty = ? ORDER BY score DESC, created_at ASC LIMIT ?')
    .bind(d, TOP_N)
    .all();
  return results;
}

async function ipHash(req: Request): Promise<string> {
  const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown';
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
  return [...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const h = cors(req, env);
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    if (url.pathname !== '/api/scores') return json({ error: 'not found' }, 404, h);

    if (req.method === 'GET') {
      const d = url.searchParams.get('difficulty') as Diff;
      if (!DIFFICULTIES.includes(d)) return json({ error: 'invalid difficulty' }, 400, h);
      return json({ scores: await topScores(env, d) }, 200, { ...h, 'Cache-Control': 'public, max-age=15' });
    }

    if (req.method === 'POST') {
      let body: unknown;
      try { body = await req.json(); } catch { return json({ error: 'invalid json' }, 400, h); }
      const s = parseSubmission(body);
      if (typeof s === 'string') return json({ error: s }, 400, h);

      const ip = await ipHash(req);
      const now = Date.now();
      const recent = await env.DB
        .prepare('SELECT COUNT(*) AS n FROM scores WHERE ip_hash = ? AND created_at > ?')
        .bind(ip, now - 3_600_000)
        .first<{ n: number }>();
      if ((recent?.n ?? 0) >= RATE_LIMIT_PER_HOUR) return json({ error: 'rate limited' }, 429, h);

      await env.DB
        .prepare('INSERT INTO scores (difficulty, name, score, grade, accuracy, max_combo, created_at, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(s.difficulty, s.name, s.score, s.grade, s.accuracy, s.maxCombo, now, ip)
        .run();

      const scores = await topScores(env, s.difficulty);
      const idx = scores.findIndex((e) => (e as { score: number; date: number }).score === s.score && (e as { date: number }).date === now);
      return json({ scores, rank: idx >= 0 ? idx + 1 : null }, 201, h);
    }

    return json({ error: 'method not allowed' }, 405, h);
  },
};
