/**
 * The camera director. Plain numbers in, plain numbers out, so it is easy to test.
 *
 * It cuts between shots on the bar line (a cut every one or two bars), pushes in or pulls out during a shot,
 * picks angles to suit the move the dancer is doing, and now and then cuts away to the DJ scratching on the
 * decks. A combo milestone cuts straight to a hero shot. With reduced motion it holds one steady shot.
 */
import type { MoveName } from './dancer';

export type Vec3 = [number, number, number];

export type ShotId =
  | 'wide' | 'hero' | 'close' | 'side' | 'high' | 'orbit' | 'pushIn' | 'pullOut'
  | 'djFront' | 'djSide' | 'djDecks';

interface ShotDef {
  /** DJ shots are in booth space (DJ behind the decks, +Z towards the floor), the rest in world space */
  dj: boolean;
  pos: Vec3;
  /** DJ shots: the look-at point. Dancer shots: [0, dy, 0], dy added to the body height (or absolute when !follow) */
  look: Vec3;
  /** framing multiplier at the start and end of the shot (1 = the dancer's default size) */
  zoom: [number, number];
  /** radians swung round the look-at point over the shot */
  orbit: number;
  /** hand-held sway in metres */
  sway: number;
  follow: boolean;
  /** may be flipped left-right for variety */
  mirror: boolean;
}

const dancer = (pos: Vec3, dy: number, zoom: [number, number], sway: number, extra: Partial<ShotDef> = {}): ShotDef =>
  ({ dj: false, pos, look: [0, dy, 0], zoom, orbit: 0, sway, follow: true, mirror: true, ...extra });
const dj = (pos: Vec3, look: Vec3, zoom: [number, number], sway: number, orbit = 0): ShotDef =>
  ({ dj: true, pos, look, zoom, orbit, sway, follow: false, mirror: false });

const SHOTS: Record<ShotId, ShotDef> = {
  /** the original over-the-shoulder camera */
  wide: dancer([2.5, 2.4, 6.2], 0.9, [1, 1.06], 0.25, { follow: false, mirror: false }),
  /** low angle looking up at the dancer */
  hero: dancer([0.5, 0.5, 4.3], 0.15, [1.15, 1.4], 0.06),
  close: dancer([1.4, 1.5, 3.6], 0.1, [1.35, 1.5], 0.1),
  side: dancer([-4.2, 1.5, 4.4], 0, [1.1, 1.25], 0.12),
  /** from above, good for the floor work */
  high: dancer([0.6, 5.2, 3.4], -0.2, [1.0, 1.2], 0.1),
  orbit: dancer([-2.8, 1.9, 3.4], 0, [1.15, 1.3], 0.05, { orbit: 1.3 }),
  pushIn: dancer([2.2, 1.9, 5.2], 0, [0.95, 1.45], 0.08),
  pullOut: dancer([1.2, 1.7, 4.6], 0, [1.5, 0.95], 0.08),
  djFront: dj([-0.5, 1.55, 2.4], [0, 1.15, -0.2], [1.0, 1.2], 0.05),
  djSide: dj([-1.9, 1.5, 0.9], [-0.1, 1.1, 0], [1.5, 1.8], 0.05, 0.35),
  /** close on the right deck and the hand pushing the record */
  djDecks: dj([-0.35, 1.7, 1.25], [-0.4, 1.0, 0.05], [2.2, 2.8], 0.03),
};

const DANCER_SHOTS: ShotId[] = ['wide', 'hero', 'close', 'side', 'high', 'orbit', 'pushIn', 'pullOut'];

type Weights = Partial<Record<ShotId, number>>;
const STANDING: Weights = { wide: 3, side: 2, hero: 2, close: 1.5, orbit: 1.5, pushIn: 1.5, pullOut: 1, high: 0.5 };
const FLOOR: Weights = { high: 3, hero: 2.5, orbit: 2, side: 1.5, close: 1.5, wide: 1.5 };
const WEIGHTS: Record<MoveName, Weights> = {
  toprock: STANDING,
  indian: STANDING,
  sixstep: { high: 3, close: 2, side: 2, wide: 2, orbit: 1.5, hero: 0.7, pushIn: 1 },
  backspin: FLOOR,
  windmill: FLOOR,
  headspin: { hero: 3, high: 2.5, orbit: 2, wide: 2, close: 1.5, side: 1 },
  freeze: { close: 3, hero: 3, pushIn: 2, orbit: 1, wide: 1 },
  stumble: { wide: 3, pullOut: 2, side: 1 },
};

/** Height to aim at for each move, so the camera follows the body down to the floor. */
const BODY_Y: Record<MoveName, number> = {
  toprock: 0.95, indian: 0.85, sixstep: 0.5, backspin: 0.45, windmill: 0.5, headspin: 0.8, freeze: 0.9, stumble: 0.95,
};

const DJ_SETS: ShotId[][] = [['djFront'], ['djSide'], ['djDecks'], ['djFront', 'djDecks'], ['djSide', 'djDecks']];
/** no DJ cutaway within this many bars of the last one, and at least one this often */
const DJ_GAP = 6;
const DJ_FORCE = 14;

export interface BoothPlace { x: number; z: number; yaw: number }

export interface DirectorOptions {
  booth: BoothPlace;
  reducedMotion?: boolean;
  seed?: number;
}

export interface CameraState {
  shot: ShotId;
  pos: Vec3;
  target: Vec3;
  /** framing multiplier, 1 = default dancer size, bigger = tighter */
  zoom: number;
  /** hand-held sway amplitude in metres */
  sway: number;
  /** 0..1 progress through the shot */
  t: number;
  dj: boolean;
}

export interface DirectorContext { move: MoveName; energy: number }

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (t: number) => t * t * (3 - 2 * t);

export class Director {
  /** tightest framing allowed on the dancer; the stage sets this from the layout so the b-boy never slides under the highway */
  maxZoom = 1.4;
  private readonly booth: BoothPlace;
  private readonly reduced: boolean;
  private rng: () => number;
  private armed = false;
  private start = 0;
  private end = 0;
  private id: ShotId = 'wide';
  private flip = 1;
  private queue: ShotId[] = [];
  private lastDj = 0;
  private prev: ShotId = 'wide';
  private heroPending = false;
  private ty = 0.9;

  constructor(opts: DirectorOptions) {
    this.booth = opts.booth;
    this.reduced = !!opts.reducedMotion;
    this.rng = mulberry32(opts.seed ?? 1984);
  }

  /** Cut to a close hero shot of the dancer right away (combo milestones). */
  hero() { this.heroPending = true; }

  /** Booth space to world space. */
  private toWorld(p: Vec3): Vec3 {
    const { x, z, yaw } = this.booth;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    return [x + p[0] * c + p[2] * s, p[1], z - p[0] * s + p[2] * c];
  }

  /** Ground positions of every camera the director can use, so props and crowd can stay out of the way. */
  sites(): { x: number; z: number }[] {
    const out: { x: number; z: number }[] = [];
    for (const id of Object.keys(SHOTS) as ShotId[]) {
      const d = SHOTS[id];
      if (d.dj) {
        for (const o of d.orbit ? [0, d.orbit] : [0]) {
          const p = this.toWorld(this.orbitAround(d.pos, d.look, o));
          out.push({ x: p[0], z: p[2] });
        }
      } else {
        for (const f of d.mirror ? [1, -1] : [1]) {
          for (const o of d.orbit ? [0, d.orbit * f] : [0]) {
            const p = this.orbitAround([d.pos[0] * f, d.pos[1], d.pos[2]], [0, 0, 0], o);
            out.push({ x: p[0], z: p[2] });
          }
        }
      }
    }
    return out;
  }

  private orbitAround(pos: Vec3, look: Vec3, angle: number): Vec3 {
    if (!angle) return pos;
    const dx = pos[0] - look[0], dz = pos[2] - look[2];
    const c = Math.cos(angle), s = Math.sin(angle);
    return [look[0] + dx * c + dz * s, pos[1], look[2] - dx * s + dz * c];
  }

  private weighted(w: Weights): ShotId {
    let total = 0;
    for (const id of DANCER_SHOTS) total += id === this.prev ? 0 : w[id] ?? 0;
    let r = this.rng() * total;
    for (const id of DANCER_SHOTS) {
      const x = id === this.prev ? 0 : w[id] ?? 0;
      if ((r -= x) < 0 && x > 0) return id;
    }
    return 'wide';
  }

  /** Choose the next shot and how many bars it runs. */
  private next(bar: number, ctx: DirectorContext): { id: ShotId; bars: number } {
    if (this.queue.length) return { id: this.queue.shift()!, bars: 1 };
    const since = bar - this.lastDj;
    if (since >= DJ_GAP && ctx.move !== 'freeze' && (since >= DJ_FORCE || this.rng() < 0.3)) {
      const set = DJ_SETS[Math.floor(this.rng() * DJ_SETS.length)];
      this.lastDj = bar;
      this.queue = set.slice(1);
      return { id: set[0], bars: 1 };
    }
    const id = this.weighted(WEIGHTS[ctx.move]);
    return { id, bars: this.rng() < 0.3 + 0.4 * ctx.energy ? 1 : 2 };
  }

  private cut(id: ShotId, start: number, end: number) {
    this.prev = this.id;
    this.id = id;
    this.start = start;
    this.end = end;
    this.flip = this.rng() < 0.5 ? -1 : 1;
  }

  update(beat: number, dt: number, ctx: DirectorContext): CameraState {
    this.ty += (BODY_Y[ctx.move] - this.ty) * (1 - Math.exp(-4 * dt));
    if (this.reduced || beat < 0) {
      this.armed = false;
      this.id = 'wide';
      return this.state('wide', 0, 1);
    }
    const bar = Math.floor(beat / 4);
    if (this.heroPending) {
      this.heroPending = false;
      this.queue = [];
      this.armed = true;
      this.cut(this.rng() < 0.5 ? 'close' : 'hero', beat, Math.ceil((beat + 3) / 4) * 4);
    } else if (!this.armed || beat < this.start - 0.01 || beat > this.end + 8) {
      // first shot after the count-in, or the song restarted: start with the establishing shot
      this.armed = true;
      this.lastDj = bar;
      this.queue = [];
      this.prev = 'wide';
      this.cut('wide', bar * 4, bar * 4 + 8);
    } else if (beat >= this.end) {
      const n = this.next(bar, ctx);
      const start = Math.floor(beat / 4) * 4;
      this.cut(n.id, start, start + n.bars * 4);
    }
    const t = Math.min(1, Math.max(0, (beat - this.start) / (this.end - this.start)));
    return this.state(this.id, t, this.flip);
  }

  private state(id: ShotId, t: number, flip: number): CameraState {
    const d = SHOTS[id];
    const e = smooth(t);
    const zoom = d.zoom[0] + (d.zoom[1] - d.zoom[0]) * e;
    if (d.dj) {
      const pos = this.toWorld(this.orbitAround(d.pos, d.look, d.orbit * e));
      return { shot: id, pos, target: this.toWorld(d.look), zoom, sway: d.sway, t, dj: true };
    }
    const f = d.mirror ? flip : 1;
    const base: Vec3 = [d.pos[0] * f, d.pos[1], d.pos[2]];
    const pos = this.orbitAround(base, [0, 0, 0], d.orbit * f * e);
    const ly = d.follow ? this.ty + d.look[1] : d.look[1];
    return { shot: id, pos, target: [0, ly, 0], zoom: Math.min(zoom, this.maxZoom), sway: d.sway, t, dj: false };
  }
}
