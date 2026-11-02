/**
 * IndexedDB cache for the synthesised track. Rendering the song takes seconds of main-thread CPU,
 * so the first visit renders it and every later visit loads the stored 16-bit PCM instead.
 * Every failure path resolves to "no cache" so the game always falls back to rendering.
 */
import type { TrackData } from './sequence';

const DB = 'bdh-audio';
const STORE = 'tracks';
// Bump when synth.ts changes in a way that alters the sound.
const SYNTH_VERSION = 1;

interface Entry { key: string; rate: number; length: number; l: Int16Array; r: Int16Array }

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'key' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Cheap fingerprint so editing the song or its events invalidates the cache. */
function cacheKey(track: TrackData, sampleRate: number): string {
  let h = 2166136261;
  const mix = (n: number) => { h = Math.imul(h ^ (n | 0), 16777619); };
  for (const e of track.events) {
    mix(Math.round(e.t * 1000));
    mix(Math.round((e.note ?? 0) * 10 + (e.vel ?? 0) * 100 + (e.len ?? 0) * 1000));
    for (let i = 0; i < e.inst.length; i++) mix(e.inst.charCodeAt(i));
  }
  return `${track.id}:${SYNTH_VERSION}:${sampleRate}:${track.events.length}:${(h >>> 0).toString(36)}`;
}

export async function loadCached(track: TrackData, ctx: BaseAudioContext): Promise<AudioBuffer | null> {
  try {
    const db = await open();
    const key = cacheKey(track, ctx.sampleRate);
    const entry = await new Promise<Entry | undefined>((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result as Entry | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (!entry || entry.rate !== ctx.sampleRate) return null;
    const buf = ctx.createBuffer(2, entry.length, entry.rate);
    for (const [c, src] of [entry.l, entry.r].entries()) {
      const out = buf.getChannelData(c);
      for (let i = 0; i < src.length; i++) out[i] = src[i] / 32767;
    }
    return buf;
  } catch { return null; }
}

export async function storeCached(track: TrackData, buf: AudioBuffer): Promise<void> {
  try {
    const toInt16 = (f: Float32Array) => {
      const o = new Int16Array(f.length);
      for (let i = 0; i < f.length; i++) o[i] = Math.max(-1, Math.min(1, f[i])) * 32767;
      return o;
    };
    const entry: Entry = {
      key: cacheKey(track, buf.sampleRate), rate: buf.sampleRate, length: buf.length,
      l: toInt16(buf.getChannelData(0)), r: toInt16(buf.getChannelData(1)),
    };
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear(); // keep only the current version
      tx.objectStore(STORE).put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch { /* storage unavailable or full: next visit just renders again */ }
}
