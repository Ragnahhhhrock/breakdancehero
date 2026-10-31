/**
 * The breakdancer: a Three.js skeleton of simple toon-shaded parts, animated procedurally.
 * Each move is a function from beat position to a pose (joint angles). Poses are blended every frame,
 * the body is dropped onto the floor automatically so every pose touches the ground, and spinning
 * moves rotate around a move-specific pivot (shoulders for windmills, head for headspins).
 */
import * as THREE from 'three';

export type MoveName =
  | 'toprock' | 'indian' | 'sixstep' | 'backspin' | 'windmill' | 'headspin' | 'freeze' | 'stumble';

export interface Pose {
  // whole body
  rx: number; rz: number; px: number; pz: number; lift: number;
  // spine and head
  sx: number; sy: number; sz: number;
  hx: number; hy: number; hz: number;
  // side A (screen left, -X) and side B (screen right, +X)
  aShX: number; aShZ: number; aEl: number;
  bShX: number; bShZ: number; bEl: number;
  aHpX: number; aHpZ: number; aKn: number;
  bHpX: number; bHpZ: number; bKn: number;
}

const KEYS = [
  'rx', 'rz', 'px', 'pz', 'lift', 'sx', 'sy', 'sz', 'hx', 'hy', 'hz',
  'aShX', 'aShZ', 'aEl', 'bShX', 'bShZ', 'bEl',
  'aHpX', 'aHpZ', 'aKn', 'bHpX', 'bHpZ', 'bKn',
] as const;

const neutral = (): Pose => ({
  rx: 0, rz: 0, px: 0, pz: 0, lift: 0, sx: 0, sy: 0, sz: 0, hx: 0, hy: 0, hz: 0,
  aShX: 0, aShZ: 0.12, aEl: 0.25, bShX: 0, bShZ: 0.12, bEl: 0.25,
  aHpX: 0, aHpZ: 0.05, aKn: 0.05, bHpX: 0, bHpZ: 0.05, bKn: 0.05,
});

type Pivot = 'hips' | 'shoulders' | 'head' | 'hands';

interface MoveDef {
  pose: (b: number, bar: number) => Partial<Pose>;
  /** yaw spin rate in rad/s (0 = none) */
  spin: number;
  pivot: Pivot;
  /** how quickly the pose blends in (1/s) */
  k: number;
  /** how much of the per-lane hit accents show on top */
  accents: number;
}

const PI = Math.PI;
const sin = Math.sin;
const cos = Math.cos;
const max = Math.max;

const MOVES: Record<MoveName, MoveDef> = {
  /** Standing side-step with a bounce on every beat and swinging arms. */
  toprock: {
    spin: 0, pivot: 'hips', k: 12, accents: 1,
    pose: (b) => {
      const sway = sin(PI * b);
      const down = cos(PI * b) ** 2;
      const la = max(0, sway);
      const lb = max(0, -sway);
      return {
        px: 0.1 * sway, rz: -0.05 * sway,
        sx: 0.12 + 0.1 * down, sy: 0.4 * sway, sz: 0.08 * sway,
        hx: 0.1 * down, hy: -0.3 * sway, hz: 0.1 * sway,
        aKn: 0.25 + 0.3 * down + 0.9 * la, bKn: 0.25 + 0.3 * down + 0.9 * lb,
        aHpX: 0.12 + 0.7 * la, bHpX: 0.12 + 0.7 * lb,
        aHpZ: 0.12 + 0.3 * la, bHpZ: 0.12 + 0.3 * lb,
        aShX: 0.8 * sway, bShX: -0.8 * sway,
        aEl: 1.3 - 0.3 * down, bEl: 1.3 - 0.3 * down,
        aShZ: 0.3, bShZ: 0.3,
      };
    },
  },

  /** Wider, lower step with crossing legs and punching fists. */
  indian: {
    spin: 0, pivot: 'hips', k: 12, accents: 1,
    pose: (b) => {
      const sway = sin(PI * b);
      const down = cos(PI * b) ** 2;
      const la = max(0, sway);
      const lb = max(0, -sway);
      return {
        px: 0.16 * sway, rz: -0.08 * sway,
        sx: 0.32 + 0.08 * down, sy: -0.5 * sway, sz: 0.1 * sway,
        hx: -0.05, hy: 0.4 * sway,
        aKn: 0.8 + 0.3 * down + 0.5 * la, bKn: 0.8 + 0.3 * down + 0.5 * lb,
        aHpX: 0.5 + 0.5 * la, bHpX: 0.5 + 0.5 * lb,
        aHpZ: 0.35 - 0.7 * la, bHpZ: 0.35 - 0.7 * lb,
        aShX: 1.0 + 0.5 * la, bShX: 1.0 + 0.5 * lb,
        aEl: 1.7 - 0.6 * la, bEl: 1.7 - 0.6 * lb,
        aShZ: 0.2, bShZ: 0.2,
      };
    },
  },

  /** Hands on the floor, legs sweeping around in the classic floor-work circle. */
  sixstep: {
    spin: 0, pivot: 'hips', k: 10, accents: 0.35,
    pose: (b) => {
      const th = (2 * PI * b) / 4;
      const down = cos(PI * b) ** 2;
      const swA = sin(th);
      const swB = sin(th + PI);
      return {
        rx: 1.2, sx: -0.2, px: 0.04 * sin(th), lift: 0.015 * down,
        aShX: 1.0, bShX: 1.0, aShZ: 0.22, bShZ: 0.22, aEl: 0.12, bEl: 0.12,
        hx: -0.6, hy: 0.25 * sin(th * 0.5),
        aHpZ: 0.45 + 0.5 * swA, bHpZ: 0.45 + 0.5 * swB,
        aHpX: -0.1 + 0.4 * cos(th), bHpX: -0.1 + 0.4 * cos(th + PI),
        aKn: 0.45 + 0.6 * max(0, cos(th)), bKn: 0.45 + 0.6 * max(0, cos(th + PI)),
      };
    },
  },

  /** Flat on the back, knees tucked, spinning on the shoulders. */
  backspin: {
    spin: 8.5, pivot: 'shoulders', k: 9, accents: 0.15,
    pose: (b) => {
      const pulse = 0.5 + 0.5 * cos(2 * PI * b);
      return {
        rx: -1.35, sx: 0.1, hx: 0.5,
        aShX: 0.9, bShX: 0.9, aShZ: -0.25, bShZ: -0.25, aEl: 1.9, bEl: 1.9,
        aHpX: 1.7 - 0.3 * pulse, bHpX: 1.7 - 0.3 * pulse,
        aHpZ: 0.12, bHpZ: 0.12,
        aKn: 1.5 + 0.2 * pulse, bKn: 1.5 + 0.2 * pulse,
      };
    },
  },

  /** On the back with legs flying out in a V, rolling round on the shoulders. */
  windmill: {
    spin: 6.6, pivot: 'shoulders', k: 9, accents: 0.15,
    pose: (b) => {
      const th = 2 * PI * b / 2;
      return {
        rx: -1.3 + 0.1 * sin(th * 2), rz: 0.18 * sin(th * 2), sx: 0.05, hx: 0.4,
        aShX: 0.3, bShX: 0.3, aShZ: 1.25, bShZ: 1.25, aEl: 0.3, bEl: 0.3,
        aHpX: 1.1 + 0.15 * sin(th * 2), bHpX: 1.1 - 0.15 * sin(th * 2),
        aHpZ: 0.7 + 0.15 * cos(th * 2), bHpZ: 0.7 - 0.15 * cos(th * 2),
        aKn: 0.15, bKn: 0.15,
      };
    },
  },

  /** Upside down on the head, legs in a V, spinning like a top. */
  headspin: {
    spin: 12.5, pivot: 'head', k: 8, accents: 0.1,
    pose: (b) => {
      const pulse = 0.5 + 0.5 * cos(2 * PI * b);
      return {
        rx: PI, rz: 0.04 * sin(2 * PI * b), sx: 0, hx: 0,
        aShX: 3.0, bShX: 3.0, aShZ: 0.9, bShZ: 0.9, aEl: 2.4, bEl: 2.4,
        aHpX: 0, bHpX: 0,
        aHpZ: 0.3 + 0.3 * pulse, bHpZ: 0.3 + 0.3 * pulse,
        aKn: 0.1 + 0.5 * pulse, bKn: 0.1 + 0.5 * pulse,
      };
    },
  },

  /** A handstand freeze with scissor legs: the money pose. */
  freeze: {
    spin: 0, pivot: 'hands', k: 11, accents: 0,
    pose: (b, bar) => {
      const wob = 0.035 * sin(2 * PI * b / 2);
      const flip = bar % 2 === 0 ? 1 : -1;
      return {
        rx: PI, rz: wob, sx: 0.0, hx: 0.5,
        aShX: PI, bShX: PI, aShZ: 0.3, bShZ: 0.3, aEl: 0.05, bEl: 0.05,
        aHpX: 0.3 * flip, bHpX: -0.3 * flip,
        aHpZ: 0.75, bHpZ: 0.75,
        aKn: flip > 0 ? 1.5 : 0.1, bKn: flip > 0 ? 0.1 : 1.5,
      };
    },
  },

  /** Lost the beat: staggering, arms windmilling. */
  stumble: {
    spin: 0, pivot: 'hips', k: 16, accents: 0.5,
    pose: (b) => {
      const w = 2 * PI * b * 2;
      return {
        px: 0.12 * sin(w), pz: -0.05,
        sx: 0.45, hx: 0.1, hz: 0.3 * sin(w), sz: 0.25 * sin(w),
        aShX: 1.6 * sin(w), bShX: 1.6 * sin(w + PI), aShZ: 0.9, bShZ: 0.9, aEl: 0.6, bEl: 0.6,
        aHpX: 0.5 * max(0, sin(w)), bHpX: 0.5 * max(0, -sin(w)),
        aKn: 0.7, bKn: 0.7, aHpZ: 0.25, bHpZ: 0.25,
      };
    },
  },
};

/** Which moves spin the body clockwise vs. the other way. */
const SPIN_DIR: Partial<Record<MoveName, number>> = { backspin: 1, windmill: -1, headspin: 1 };

interface Marker { obj: THREE.Object3D; r: number }

export interface Outfit {
  jacket: number; pants: number; trim: number; shoe: number; sole: number; hat: number; skin: number; chain: number;
}

export const DEFAULT_OUTFIT: Outfit = {
  jacket: 0xe8264a, pants: 0x1fc2cf, trim: 0xf6f1e4, shoe: 0xf6f1e4, sole: 0xff2d95, hat: 0x2a1b4d, skin: 0xc58a5c, chain: 0xffd24a,
};

function toonGradient(): THREE.DataTexture {
  const data = new Uint8Array([70, 70, 70, 255, 150, 150, 150, 255, 235, 235, 235, 255]);
  const t = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

export class Dancer {
  readonly root = new THREE.Group();
  private spin = new THREE.Group();
  private body = new THREE.Group();
  private spine = new THREE.Group();
  private neck = new THREE.Group();
  private armA = { sh: new THREE.Group(), el: new THREE.Group() };
  private armB = { sh: new THREE.Group(), el: new THREE.Group() };
  private legA = { hip: new THREE.Group(), kn: new THREE.Group() };
  private legB = { hip: new THREE.Group(), kn: new THREE.Group() };
  private markers: Marker[] = [];
  private pivots: Record<Pivot, THREE.Object3D[]> = { hips: [], shoulders: [], head: [], hands: [] };

  private cur: Pose = neutral();
  private tgt: Pose = neutral();
  private move: MoveName = 'toprock';
  private yaw = 0;
  private spinRate = 0;
  private baseYaw = 0.35;
  private pcx = 0;
  private pcz = 0;
  /** per-lane hit accents, 1 right after a hit */
  private acc = [0, 0, 0, 0];
  private shadow: THREE.Mesh;
  private grad = toonGradient();
  /** height of the lowest body part, exposed so the stage can react */
  height = 0;

  constructor(outfit: Outfit = DEFAULT_OUTFIT) {
    this.build(outfit);
    this.shadow = this.makeShadow();
    this.root.add(this.shadow);
    this.root.add(this.spin);
  }

  setFacing(yaw: number) { this.baseYaw = yaw; }
  currentMove(): MoveName { return this.move; }

  setMove(m: MoveName) { this.move = m; }

  /** Trigger the per-lane accent: the dancer visibly answers every tap. */
  accent(lane: number, strength = 1) { this.acc[lane] = Math.max(this.acc[lane], strength); }

  private mat(color: number, emissive = 0): THREE.MeshToonMaterial {
    const m = new THREE.MeshToonMaterial({ color, gradientMap: this.grad });
    if (emissive) { m.emissive = new THREE.Color(emissive); m.emissiveIntensity = 0.35; }
    return m;
  }

  private makeShadow(): THREE.Mesh {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grd.addColorStop(0, 'rgba(0,0,0,0.65)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 1.5),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.012;
    return m;
  }

  private mark(parent: THREE.Object3D, x: number, y: number, z: number, r: number): THREE.Object3D {
    const o = new THREE.Object3D();
    o.position.set(x, y, z);
    parent.add(o);
    this.markers.push({ obj: o, r });
    return o;
  }

  private build(o: Outfit) {
    const skin = this.mat(o.skin);
    const jacket = this.mat(o.jacket);
    const trim = this.mat(o.trim);
    const pants = this.mat(o.pants);
    const shoe = this.mat(o.shoe);
    const sole = this.mat(o.sole, o.sole);
    const hat = this.mat(o.hat);
    const chain = this.mat(o.chain, o.chain);
    const dark = this.mat(0x101018);

    const caps = (r: number, len: number, m: THREE.Material, sz = 1) => {
      const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 5, 10), m);
      mesh.scale.z = sz;
      return mesh;
    };
    const add = <T extends THREE.Object3D>(parent: THREE.Object3D, child: T, x = 0, y = 0, z = 0) => {
      child.position.set(x, y, z);
      parent.add(child);
      return child;
    };

    this.spin.add(this.body);

    // pelvis
    const pelvis = add(this.body, new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), pants), 0, 0.0, 0);
    pelvis.scale.set(1.15, 0.8, 0.85);
    this.pivots.hips.push(pelvis);
    this.markers.push({ obj: pelvis, r: 0.11 });

    // legs
    const leg = (side: -1 | 1, L: { hip: THREE.Group; kn: THREE.Group }) => {
      add(this.body, L.hip, side * 0.1, -0.02, 0);
      add(L.hip, caps(0.085, 0.27, pants, 0.95), 0, -0.22, 0);
      const stripe = add(L.hip, new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.4, 0.05), trim), side * 0.085, -0.22, 0);
      stripe.visible = true;
      add(L.hip, L.kn, 0, -0.44, 0);
      add(L.kn, caps(0.07, 0.27, pants, 0.95), 0, -0.2, 0);
      add(L.kn, new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.36, 0.05), trim), side * 0.07, -0.2, 0);
      const ankle = add(L.kn, new THREE.Group(), 0, -0.42, 0);
      add(ankle, new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.075, 0.27), shoe), 0, -0.045, 0.06);
      add(ankle, new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.025, 0.285), sole), 0, -0.095, 0.06);
      this.mark(L.kn, 0, 0, 0, 0.08);
      this.mark(ankle, 0, -0.08, 0.15, 0.05);
      this.mark(ankle, 0, -0.08, -0.04, 0.05);
    };
    leg(-1, this.legA);
    leg(1, this.legB);

    // spine and torso
    add(this.body, this.spine, 0, 0.05, 0);
    const torso = add(this.spine, caps(0.15, 0.3, jacket, 0.72), 0, 0.3, 0);
    torso.scale.x = 1.12;
    add(this.spine, new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.48, 0.02), trim), 0, 0.3, 0.115);
    // gold chain
    const ring = add(this.spine, new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.012, 6, 16), chain), 0, 0.5, 0.06);
    ring.rotation.x = Math.PI / 2 - 0.5;
    ring.scale.y = 1.2;
    this.mark(this.spine, 0, 0.18, -0.11, 0.1);
    this.pivots.shoulders.push(this.mark(this.spine, 0, 0.42, -0.11, 0.1));
    this.mark(this.spine, 0, 0.4, 0.1, 0.1);

    // arms
    const arm = (side: -1 | 1, A: { sh: THREE.Group; el: THREE.Group }) => {
      add(this.spine, A.sh, side * 0.21, 0.49, 0);
      add(A.sh, new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), jacket));
      add(A.sh, caps(0.055, 0.2, jacket), 0, -0.16, 0);
      add(A.sh, new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.03, 0.115), trim), 0, -0.075, 0).scale.set(1, 1, 1);
      add(A.sh, A.el, 0, -0.31, 0);
      add(A.el, caps(0.048, 0.18, skin), 0, -0.15, 0);
      add(A.el, new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.04, 10), trim), 0, -0.25, 0);
      const hand = add(A.el, new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), skin), 0, -0.33, 0);
      this.markers.push({ obj: hand, r: 0.06 });
      this.pivots.hands.push(hand);
      this.mark(A.el, 0, 0, 0, 0.06);
      this.mark(A.sh, 0, 0, 0, 0.08);
    };
    arm(-1, this.armA);
    arm(1, this.armB);

    // head
    add(this.spine, this.neck, 0, 0.6, 0);
    add(this.neck, new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.1, 8), skin), 0, 0.02, 0);
    const head = add(this.neck, new THREE.Mesh(new THREE.SphereGeometry(0.135, 14, 12), skin), 0, 0.16, 0);
    head.scale.set(0.95, 1.08, 1);
    this.markers.push({ obj: head, r: 0.15 });
    this.pivots.head.push(head);
    // bucket hat, brim and sunglasses
    const cap = add(this.neck, new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.52), hat), 0, 0.185, 0);
    cap.scale.set(1, 0.95, 1.05);
    add(this.neck, new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.018, 16), hat), 0, 0.19, 0.01);
    add(this.neck, new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.045, 0.04), dark), 0, 0.16, 0.12);
    const band = add(this.neck, new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.012, 6, 20), this.mat(0xff2d95, 0xff2d95)), 0, 0.205, 0);
    band.rotation.x = Math.PI / 2;
  }

  /** Move to a pose, drop onto the floor, centre the spin pivot. */
  private applyPose(p: Pose, yaw: number, dt: number) {
    // 1. joint angles
    this.body.rotation.set(p.rx, 0, p.rz);
    this.spine.rotation.set(p.sx, p.sy, p.sz);
    this.neck.rotation.set(p.hx, p.hy, p.hz);
    this.armA.sh.rotation.set(-p.aShX, 0, -p.aShZ);
    this.armB.sh.rotation.set(-p.bShX, 0, p.bShZ);
    this.armA.el.rotation.set(-p.aEl, 0, 0);
    this.armB.el.rotation.set(-p.bEl, 0, 0);
    this.legA.hip.rotation.set(-p.aHpX, 0, -p.aHpZ);
    this.legB.hip.rotation.set(-p.bHpX, 0, p.bHpZ);
    this.legA.kn.rotation.set(p.aKn, 0, 0);
    this.legB.kn.rotation.set(p.bKn, 0, 0);

    // 2. measure with no spin and the body at the origin
    this.spin.rotation.y = 0;
    this.body.position.set(0, 0, 0);
    this.spin.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    let low = Infinity;
    for (const m of this.markers) {
      m.obj.getWorldPosition(v);
      low = Math.min(low, v.y - m.r);
    }
    // pivot: where the spin axis passes through the body
    const pivotObjs = this.pivots[MOVES[this.move].pivot];
    let cx = 0, cz = 0;
    for (const o of pivotObjs) { o.getWorldPosition(v); cx += v.x; cz += v.z; }
    cx /= pivotObjs.length; cz /= pivotObjs.length;
    const kp = 1 - Math.exp(-14 * dt);
    this.pcx += (cx - this.pcx) * kp;
    this.pcz += (cz - this.pcz) * kp;

    const y = -low + p.lift;
    this.height = y;
    this.body.position.set(p.px - this.pcx, y, p.pz - this.pcz);
    this.spin.rotation.y = yaw;
    this.shadow.scale.setScalar(1 + Math.max(0, 0.25 - y) * 0.5);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = 1 - Math.min(0.6, Math.max(0, y - 0.9));
  }

  /**
   * @param b beat position (can be negative during the count-in)
   * @param bar bar index
   */
  update(dt: number, b: number, bar: number) {
    const def = MOVES[this.move];
    const target = { ...neutral(), ...def.pose(b, bar) };
    this.tgt = target;
    const k = 1 - Math.exp(-def.k * dt);
    for (const key of KEYS) this.cur[key] += (this.tgt[key] - this.cur[key]) * k;

    // per-lane accents on top of the blended pose
    const p = { ...this.cur };
    const s = def.accents;
    const [l, d, u, r] = this.acc;
    p.aShZ += 1.1 * l * s; p.aShX += 0.7 * l * s; p.aHpZ += 0.7 * l * s; p.aHpX += 0.5 * l * s; p.hy += 0.3 * l * s;
    p.bShZ += 1.1 * r * s; p.bShX += 0.7 * r * s; p.bHpZ += 0.7 * r * s; p.bHpX += 0.5 * r * s; p.hy -= 0.3 * r * s;
    p.aKn += 0.55 * d * s; p.bKn += 0.55 * d * s; p.sx += 0.35 * d * s; p.hx += 0.3 * d * s;
    p.aShX += 1.5 * u * s; p.bShX += 1.5 * u * s; p.aEl -= 0.5 * u * s; p.bEl -= 0.5 * u * s; p.hx -= 0.3 * u * s; p.sx -= 0.12 * u * s;
    const decay = Math.exp(-dt * 8);
    for (let i = 0; i < 4; i++) this.acc[i] *= decay;

    // spin
    const dir = SPIN_DIR[this.move] ?? 0;
    const want = def.spin * dir;
    this.spinRate += (want - this.spinRate) * (1 - Math.exp(-6 * dt));
    this.yaw += this.spinRate * dt;
    if (want === 0) {
      // settle back to facing the audience on the nearest turn
      const turn = Math.round((this.yaw - this.baseYaw) / (Math.PI * 2));
      const goal = this.baseYaw + turn * Math.PI * 2;
      this.yaw += (goal - this.yaw) * (1 - Math.exp(-9 * dt));
      // a little groove sway while facing out
      const sway = 0.12 * Math.sin(Math.PI * b);
      this.applyPose(p, this.yaw + (this.move === 'toprock' || this.move === 'indian' ? sway : 0), dt);
    } else {
      this.applyPose(p, this.yaw, dt);
    }
  }
}
