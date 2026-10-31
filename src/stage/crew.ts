/**
 * The breakdancer's crew: a few people standing round the edge of the floor, watching.
 *
 * They bounce and nod on the beat the whole time. Every so often one of them breaks out a standing move
 * (toprock, indian step, cabbage patch, running man, a pop, a body wave) or a bit of hand dancing, always in time
 * and never down on the floor. They go off when the dancer freezes or the player hits a combo milestone.
 */
import * as THREE from 'three';
import { Figure, blendPose, restPose, type FigPose, type FigureOutfit } from './figure';

const PI = Math.PI;
const TAU = Math.PI * 2;
const sin = Math.sin;
const cos = Math.cos;
const max = Math.max;

type ArmStyle = 'relaxed' | 'crossed' | 'hips' | 'chin';
type Move = (b: number, a: number) => Partial<FigPose>;

/** How each person holds their arms while just watching. */
const ARMS: Record<ArmStyle, (down: number) => Partial<FigPose>> = {
  relaxed: (d) => ({ aSX: 0.1 + 0.1 * d, bSX: 0.1 + 0.1 * d, aSZ: 0.16, bSZ: 0.16, aEl: 0.3 + 0.3 * d, bEl: 0.3 + 0.3 * d }),
  crossed: (d) => ({ aSX: 0.45, aSZ: -0.2, aEl: 2.15 + 0.05 * d, bSX: 0.75, bSZ: -0.15, bEl: 2.15 + 0.05 * d }),
  hips: (d) => ({ aSX: 0.0, bSX: 0.0, aSZ: 0.5, bSZ: 0.5, aEl: 1.45 + 0.1 * d, bEl: 1.45 + 0.1 * d }),
  chin: (d) => ({ aSX: 0.45, aSZ: -0.2, aEl: 2.1, bSX: 0.95, bSZ: 0.1, bEl: 2.45 + 0.1 * d }),
};

/** Standing breakdance moves, loosely lifted from the dancer's own toprock and indian step. */
const BREAK: Record<string, Move> = {
  toprock: (b, a) => {
    const sway = sin(PI * b), down = cos(PI * b) ** 2, la = max(0, sway), lb = max(0, -sway);
    return {
      px: 0.07 * sway * a, roll: -0.04 * sway * a,
      sx: 0.1 + 0.08 * down, sy: 0.3 * sway * a, sz: 0.06 * sway,
      hx: 0.1 * down, hy: -0.25 * sway, hz: 0.08 * sway,
      aKn: 0.2 + 0.25 * down + 0.7 * la * a, bKn: 0.2 + 0.25 * down + 0.7 * lb * a,
      aHX: 0.1 + 0.5 * la * a, bHX: 0.1 + 0.5 * lb * a, aHZ: 0.1 + 0.2 * la, bHZ: 0.1 + 0.2 * lb,
      aSX: 0.6 * sway * a, bSX: -0.6 * sway * a, aEl: 1.2 - 0.3 * down, bEl: 1.2 - 0.3 * down, aSZ: 0.3, bSZ: 0.3,
    };
  },
  indian: (b, a) => {
    const sway = sin(PI * b), down = cos(PI * b) ** 2, la = max(0, sway), lb = max(0, -sway);
    return {
      px: 0.12 * sway * a, roll: -0.06 * sway * a,
      sx: 0.3 + 0.08 * down, sy: -0.4 * sway * a, sz: 0.08 * sway, hy: 0.3 * sway,
      aKn: 0.6 + 0.2 * down + 0.4 * la * a, bKn: 0.6 + 0.2 * down + 0.4 * lb * a,
      aHX: 0.35 + 0.4 * la * a, bHX: 0.35 + 0.4 * lb * a, aHZ: 0.3 - 0.5 * la, bHZ: 0.3 - 0.5 * lb,
      aSX: 0.9 + 0.4 * la, bSX: 0.9 + 0.4 * lb, aEl: 1.7 - 0.5 * la, bEl: 1.7 - 0.5 * lb, aSZ: 0.2, bSZ: 0.2,
    };
  },
  cabbage: (b, a) => {
    const w = TAU * b, down = cos(PI * b) ** 2;
    return {
      px: 0.06 * sin(PI * b) * a, roll: 0.06 * sin(PI * b), sy: 0.3 * sin(PI * b) * a, sx: 0.12,
      aKn: 0.45 + 0.2 * down, bKn: 0.45 + 0.2 * down, aHX: 0.22, bHX: 0.22, hx: 0.1 * down,
      aSX: 1.0 + 0.4 * sin(w) * a, bSX: 1.0 + 0.4 * sin(w + PI) * a,
      aEl: 1.7 + 0.5 * cos(w) * a, bEl: 1.7 + 0.5 * cos(w + PI) * a, aSZ: 0.12, bSZ: 0.12,
    };
  },
  runningman: (b, a) => {
    const s = sin(PI * b), la = max(0, s), lb = max(0, -s);
    return {
      px: -0.03 * s * a, sx: 0.15, sy: 0.2 * s * a, hx: 0.05,
      aHX: 0.1 + 0.85 * la * a, bHX: 0.1 + 0.85 * lb * a, aKn: 0.25 + 1.0 * la * a, bKn: 0.25 + 1.0 * lb * a,
      aSX: 0.3 - 0.8 * s * a, bSX: 0.3 + 0.8 * s * a, aEl: 1.5, bEl: 1.5, aSZ: 0.15, bSZ: 0.15,
      bob: 0.02 * Math.abs(sin(TAU * b * 0.5)),
    };
  },
  pop: (b, a) => {
    const f = b - Math.floor(b), tw = Math.exp(-f * 9), even = Math.floor(b) % 2 === 0 ? 1 : -1;
    return {
      sx: 0.08 - 0.14 * tw, sy: 0.3 * even * tw * a, hz: 0.2 * even * tw, hy: -0.3 * even * tw,
      aKn: 0.3, bKn: 0.3, aHX: 0.12, bHX: 0.12,
      aSX: 0.25 + (even > 0 ? 1.2 * tw * a : 0), bSX: 0.25 + (even < 0 ? 1.2 * tw * a : 0),
      aEl: 0.5 + (even > 0 ? -0.2 * tw : 0.5 * tw), bEl: 0.5 + (even < 0 ? -0.2 * tw : 0.5 * tw),
      aSZ: 0.2, bSZ: 0.2,
    };
  },
  bodywave: (b, a) => {
    const w = PI * b;
    return {
      sx: 0.1 + 0.18 * sin(w) * a, sz: 0.1 * sin(w * 0.5), hx: 0.2 * sin(w - 0.8) * a,
      px: 0.07 * sin(w - 1.6) * a, aKn: 0.3, bKn: 0.3, aHX: 0.14, bHX: 0.14,
      aSZ: 1.05, bSZ: 1.05, aSX: 0.2, bSX: 0.2,
      aEl: 0.35 + 0.5 * (0.5 + 0.5 * sin(w)), bEl: 0.35 + 0.5 * (0.5 + 0.5 * sin(w - 0.9)),
    };
  },
};

/** Hand dancing and crowd gestures: mostly arms, a bounce underneath. */
const HANDS: Record<string, Move> = {
  handjive: (b, a) => {
    const f = TAU * b * 2;
    return {
      aSX: 0.9 + 0.15 * sin(PI * b), bSX: 0.9 + 0.15 * sin(PI * b + PI), aSZ: 0.25 + 0.25 * sin(PI * b), bSZ: 0.25 - 0.25 * sin(PI * b),
      aEl: 2.0, bEl: 2.0, aWX: 0.7 * sin(f) * a, bWX: 0.7 * sin(f + PI) * a, aWZ: 0.8 * sin(f + 1.2) * a, bWZ: 0.8 * sin(f + 1.2 + PI) * a,
    };
  },
  wave: (b, a) => ({
    aSX: 2.6, bSX: 2.6, aSZ: 0.35 + 0.3 * sin(PI * b) * a, bSZ: 0.35 - 0.3 * sin(PI * b) * a, aEl: 0.35, bEl: 0.35,
    aWZ: 0.6 * sin(TAU * b * 2), bWZ: 0.6 * sin(TAU * b * 2 + PI), hx: -0.2, sx: -0.05,
  }),
  point: (b) => {
    const down = cos(PI * b) ** 2;
    return { aSX: 1.45 + 0.12 * down, aSZ: 0.0, aEl: 0.12, bSZ: 0.5, bSX: 0.0, bEl: 1.5, sy: -0.12 };
  },
  fistpump: (b, a) => {
    const down = cos(PI * b) ** 2;
    return { aSX: 2.1, aSZ: 0.2, aEl: 2.3 - 2.0 * down * a, bSX: 0.3, bEl: 0.8, hx: -0.1 + 0.15 * down };
  },
};

const BREAK_NAMES = Object.keys(BREAK);
const HAND_NAMES = Object.keys(HANDS);

/** Deterministic 0..1 from two integers, so the routine is the same every playthrough. */
function hash(a: number, b: number): number {
  let h = (Math.imul(a + 1, 374761393) + Math.imul(b + 7919, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export interface CrewSpec {
  x: number; z: number; style: ArmStyle; amp: number; outfit: FigureOutfit;
}

/** Four people along the back and right edge of the floor, clear of the DJ's corner. */
export const CREW: CrewSpec[] = [
  { x: -0.85, z: -3.1, style: 'crossed', amp: 1.0, outfit: { skin: 0x5e3b27, top: 0x9d6bff, bottom: 0x5a3aa8, trim: 0xf6f1e4, shoe: 0xf6f1e4, sole: 0xff2d95, hat: 'headband', hatColor: 0xff2d95, hair: 'afro', hairColor: 0x15101a, chain: 0xffd24a, scale: 0.97 } },
  { x: 0.4, z: -3.05, style: 'chin', amp: 0.9, outfit: { skin: 0xc58a5c, top: 0x2fbf5a, bottom: 0x1c3f94, trim: 0xf6f1e4, shoe: 0xffe14d, sole: 0x17e1ff, hat: 'capBack', hatColor: 0x2fbf5a, scale: 1.0 } },
  { x: 1.6, z: -1.95, style: 'hips', amp: 1.1, outfit: { skin: 0x8d5a3b, top: 0xffe14d, bottom: 0xe8264a, trim: 0x07041a, shoe: 0xf6f1e4, sole: 0xb6ff3d, hat: 'none', hatColor: 0, hair: 'flattop', hairColor: 0x15101a, shades: true, scale: 1.04 } },
  { x: 2.45, z: -0.45, style: 'relaxed', amp: 0.95, outfit: { skin: 0xf0c8a4, top: 0x0f6a7a, bottom: 0x222233, trim: 0x17e1ff, shoe: 0xf6f1e4, sole: 0xff2d95, hat: 'beanie', hatColor: 0xff2d95, longSleeves: true, scale: 0.95 } },
];

interface Member {
  fig: Figure;
  spec: CrewSpec;
  cur: FigPose;
  tgt: FigPose;
  /** what they're doing this bar: 'groove', or the name of a move */
  doing: string;
}

export interface CrewState {
  beat: number;
  /** 0..1, how fired up the night is */
  hype: number;
  dancerFrozen: boolean;
}

export class Crew {
  readonly root = new THREE.Group();
  private members: Member[] = [];
  private bar = -99;
  private cheerLeft = 0;

  constructor(specs: CrewSpec[] = CREW) {
    specs.forEach((spec, i) => {
      const fig = new Figure(spec.outfit);
      fig.root.position.set(spec.x, 0, spec.z);
      // face the dancer, give or take
      fig.root.rotation.y = Math.atan2(-spec.x, -spec.z) + (hash(i, 3) - 0.5) * 0.3;
      this.root.add(fig.root);
      this.members.push({ fig, spec, cur: restPose(), tgt: restPose(), doing: 'groove' });
    });
  }

  /** Everybody goes off for a moment. */
  cheer() { this.cheerLeft = 1.6; }

  /** Where the crew stand, for keeping other things out of their way. */
  sites(): { x: number; z: number }[] {
    return this.members.map((m) => ({ x: m.spec.x, z: m.spec.z }));
  }

  private plan(bar: number, hype: number, frozen: boolean) {
    const n = this.members.length;
    let busy = 0;
    for (let k = 0; k < n; k++) {
      const i = (k + ((bar % n) + n) % n) % n;
      const m = this.members[i];
      const h = hash(i * 31 + 5, bar);
      const pick = hash(i * 17 + 11, bar);
      let doing = 'groove';
      if (bar >= 0) {
        if (frozen) doing = 'wave';
        else if (busy < 2) {
          if (h < 0.1 + 0.16 * hype) doing = BREAK_NAMES[Math.floor(pick * BREAK_NAMES.length)];
          else if (h < 0.28 + 0.28 * hype) doing = HAND_NAMES[Math.floor(pick * HAND_NAMES.length)];
        }
      }
      if (doing !== 'groove' && !frozen) busy++;
      m.doing = doing;
    }
  }

  update(dt: number, s: CrewState) {
    const bar = Math.floor(s.beat / 4);
    if (bar !== this.bar) { this.bar = bar; this.plan(bar, s.hype, s.dancerFrozen); }
    this.cheerLeft = max(0, this.cheerLeft - dt);
    const b = s.beat;
    const down = cos(PI * b) ** 2;
    const sway = sin(PI * b * 0.5);
    for (let i = 0; i < this.members.length; i++) {
      const m = this.members[i];
      const a = m.spec.amp * (0.8 + 0.3 * s.hype);
      const t = m.tgt;
      Object.assign(t, restPose());
      // the groove everyone is always doing: knees on the beat, head nod, a slow shoulder sway
      Object.assign(t, {
        aKn: 0.1 + 0.3 * down * a, bKn: 0.1 + 0.3 * down * a, aHX: 0.05 + 0.12 * down * a, bHX: 0.05 + 0.12 * down * a,
        sx: 0.05 + 0.08 * down * a, hx: 0.12 * down * a, px: 0.03 * sway, roll: -0.03 * sway, sy: 0.06 * sway, hz: 0.05 * sway,
      }, ARMS[m.spec.style](down));
      // each person is a touch off the others so they don't move as one
      const bb = b + 0.02 * i;
      const move = this.cheerLeft > 0 ? HANDS.wave : BREAK[m.doing] ?? HANDS[m.doing];
      if (move) Object.assign(t, move(bb, a));
      if (this.cheerLeft > 0) t.bob = 0.07 * Math.abs(sin(TAU * b * 0.5 + i));
      blendPose(m.cur, t, 14, dt);
      m.fig.apply(m.cur);
    }
  }
}
