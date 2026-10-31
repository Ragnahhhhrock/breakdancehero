/**
 * Thin wrapper around the GA4 gtag() global (loaded in index.html).
 * Safe to call when gtag is missing (ad blockers, offline, dev).
 */
type Params = Record<string, string | number | boolean>;

declare global {
  interface Window { gtag?: (...args: unknown[]) => void }
}

export function track(name: string, params: Params = {}): void {
  try { window.gtag?.('event', name, params); } catch { /* never break the game for analytics */ }
}
