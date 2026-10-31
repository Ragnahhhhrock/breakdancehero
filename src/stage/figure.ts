/**
 * A light-weight posable person for the stage: the DJ and the breakdancer's crew.
 *
 * Same toon look and joint conventions as the breakdancer (arms hang along -Y, +Z is forward, side A is -X,
 * side B is +X) but standing only: the hips are dropped onto whichever foot is planted, so knee bends and
 * bounces never lift a foot off the floor. Arms can be posed with joint angles or reach for a point (two-bone IK).
 */
import * as THREE from 'three';

export interface FigureOutfit {
  skin: number; top: number; bottom: number; trim: number; shoe: number; sole: number;
  hat: 'none' | 'bucket' | 'cap' | 'capBack' | 'beanie' | 'headband';
  hatColor: number;
  hair?: 'none' | 'afro' | 'flattop';
  hairColor?: number;
  shades?: boolean;
  /** gold chain colour, omit for none */
  chain?: number;
  /** over-ear headphones */
  phones?: boolean;
  longSleeves?: boolean;
  scale?: number;
}

export interface FigPose {
  /** hips: extra height (jumps), shift sideways / forward, twist, roll */
  bob: number; px: number; pz: number; yaw: number; roll: number;
  /** spine, head */
  sx: number; sy: number; sz: number;
  hx: number; hy: number; hz: number;
  /** side A (-X): shoulder raise forward, shoulder out, elbow bend, wrist flex, wrist tilt */
  aSX: number; aSZ: number; aEl: number; aWX: number; aWZ: number;
  bSX: number; bSZ: number; bEl: number; bWX: number; bWZ: number;
  /** legs: hip swing forward, hip out, knee bend */
  aHX: number; aHZ: number; aKn: number;
  bHX: number; bHZ: number; bKn: number;
}

export const POSE_KEYS: readonly (keyof FigPose)[] = [
  'bob', 'px', 'pz', 'yaw', 'roll', 'sx', 'sy', 'sz', 'hx', 'hy', 'hz',
  'aSX', 'aSZ', 'aEl', 'aWX', 'aWZ', 'bSX', 'bSZ', 'bEl', 'bWX', 'bWZ',
  'aHX', 'aHZ', 'aKn', 'bHX', 'bHZ', 'bKn',
];

export const restPose = (): FigPose => ({
  bob: 0, px: 0, pz: 0, yaw: 0, roll: 0, sx: 0, sy: 0, sz: 0, hx: 0, hy: 0, hz: 0,
  aSX: 0.1, aSZ: 0.16, aEl: 0.3, aWX: 0, aWZ: 0,
  bSX: 0.1, bSZ: 0.16, bEl: 0.3, bWX: 0, bWZ: 0,
  aHX: 0.04, aHZ: 0.05, aKn: 0.08, bHX: 0.04, bHZ: 0.05, bKn: 0.08,
});

/** Ease `cur` towards `tgt` (frame-rate independent). */
export function blendPose(cur: FigPose, tgt: FigPose, rate: number, dt: number) {
  const k = Math.min(1, Math.max(0, 1 - Math.exp(-rate * dt)));
  for (const key of POSE_KEYS) cur[key] += (tgt[key] - cur[key]) * k;
}

// body proportions (metres, matching the breakdancer)
const THIGH = 0.44, SHIN = 0.42, FOOT = 0.1075, HIP_Y = 0.02;
const UPPER = 0.31, FORE = 0.29;
export const STAND_Y = HIP_Y + THIGH + SHIN + FOOT;

/** Height of the hips above the floor for a leg with this hip swing, knee bend and hip spread (foot flat). */
function legReach(hx: number, kn: number, hz: number): number {
  return HIP_Y + (THIGH * Math.cos(hx) + SHIN * Math.cos(kn - hx)) * Math.cos(hz) + FOOT;
}

// ---- shared assets (one gradient, one blob shadow, materials cached by colour)
let gradient: THREE.DataTexture | null = null;
export function toonGradient(): THREE.DataTexture {
  if (!gradient) {
    const data = new Uint8Array([70, 70, 70, 255, 150, 150, 150, 255, 235, 235, 235, 255]);
    gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
    gradient.minFilter = THREE.NearestFilter;
    gradient.magFilter = THREE.NearestFilter;
    gradient.needsUpdate = true;
  }
  return gradient;
}

const mats = new Map<string, THREE.MeshToonMaterial>();
/** Toon material, shared by colour. Pass an emissive colour for glowing trim. */
export function toon(color: number, emissive = 0): THREE.MeshToonMaterial {
  const key = `${color}:${emissive}`;
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: toonGradient() });
    if (emissive) { m.emissive = new THREE.Color(emissive); m.emissiveIntensity = 0.35; }
    mats.set(key, m);
  }
  return m;
}

let blob: THREE.MeshBasicMaterial | null = null;
function blobMaterial(): THREE.MeshBasicMaterial {
  if (!blob) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grd.addColorStop(0, 'rgba(0,0,0,0.6)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    blob = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false });
  }
  return blob;
}

const DOWN = new THREE.Vector3(0, -1, 0);
const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4();

interface Arm { sh: THREE.Group; el: THREE.Group; wr: THREE.Group }
interface Leg { hip: THREE.Group; kn: THREE.Group }

export class Figure {
  readonly root = new THREE.Group();
  readonly hips = new THREE.Group();
  private spine = new THREE.Group();
  private neck = new THREE.Group();
  private armA: Arm = { sh: new THREE.Group(), el: new THREE.Group(), wr: new THREE.Group() };
  private armB: Arm = { sh: new THREE.Group(), el: new THREE.Group(), wr: new THREE.Group() };
  private legA: Leg = { hip: new THREE.Group(), kn: new THREE.Group() };
  private legB: Leg = { hip: new THREE.Group(), kn: new THREE.Group() };
  private shadow: THREE.Mesh;

  constructor(o: FigureOutfit) {
    this.build(o);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), blobMaterial());
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.012;
    this.root.add(this.shadow, this.hips);
    this.root.scale.setScalar(o.scale ?? 1);
    this.apply(restPose());
  }

  private build(o: FigureOutfit) {
    const skin = toon(o.skin);
    const top = toon(o.top);
    const bottom = toon(o.bottom);
    const trim = toon(o.trim);
    const dark = toon(0x101018);
    const add = <T extends THREE.Object3D>(parent: THREE.Object3D, child: T, x = 0, y = 0, z = 0) => {
      child.position.set(x, y, z);
      parent.add(child);
      return child;
    };
    const caps = (r: number, len: number, m: THREE.Material, sz = 1) => {
      const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 5, 10), m);
      mesh.scale.z = sz;
      return mesh;
    };

    const pelvis = add(this.hips, new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), bottom));
    pelvis.scale.set(1.15, 0.8, 0.85);

    const leg = (side: -1 | 1, L: Leg) => {
      add(this.hips, L.hip, side * 0.1, -HIP_Y, 0);
      add(L.hip, caps(0.085, 0.27, bottom, 0.95), 0, -0.22, 0);
      add(L.hip, new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.4, 0.05), trim), side * 0.085, -0.22, 0);
      add(L.hip, L.kn, 0, -THIGH, 0);
      add(L.kn, caps(0.07, 0.27, bottom, 0.95), 0, -0.2, 0);
      add(L.kn, new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.36, 0.05), trim), side * 0.07, -0.2, 0);
      const ankle = add(L.kn, new THREE.Group(), 0, -SHIN, 0);
      add(ankle, new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.075, 0.27), toon(o.shoe)), 0, -0.045, 0.06);
      add(ankle, new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.025, 0.285), toon(o.sole, o.sole)), 0, -0.095, 0.06);
    };
    leg(-1, this.legA);
    leg(1, this.legB);

    add(this.hips, this.spine, 0, 0.05, 0);
    const torso = add(this.spine, caps(0.15, 0.3, top, 0.72), 0, 0.3, 0);
    torso.scale.x = 1.12;
    add(this.spine, new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.48, 0.02), trim), 0, 0.3, 0.115);
    if (o.chain !== undefined) {
      const ring = add(this.spine, new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.012, 6, 16), toon(o.chain, o.chain)), 0, 0.5, 0.06);
      ring.rotation.x = Math.PI / 2 - 0.5;
      ring.scale.y = 1.2;
    }

    const sleeve = o.longSleeves ? top : skin;
    const arm = (side: -1 | 1, A: Arm) => {
      add(this.spine, A.sh, side * 0.21, 0.49, 0);
      add(A.sh, new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), top));
      add(A.sh, caps(0.055, 0.2, top), 0, -0.16, 0);
      add(A.sh, new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.03, 0.115), trim), 0, -0.075, 0);
      add(A.sh, A.el, 0, -UPPER, 0);
      add(A.el, caps(0.048, 0.18, sleeve), 0, -0.15, 0);
      add(A.el, new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.04, 10), trim), 0, -0.25, 0);
      add(A.el, A.wr, 0, -FORE, 0);
      // flat mitt so wrist flicks read
      const hand = add(A.wr, new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.05, 4, 8), skin), 0, -0.05, 0);
      hand.scale.z = 0.55;
    };
    arm(-1, this.armA);
    arm(1, this.armB);

    add(this.spine, this.neck, 0, 0.6, 0);
    add(this.neck, new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.1, 8), skin), 0, 0.02, 0);
    const head = add(this.neck, new THREE.Mesh(new THREE.SphereGeometry(0.135, 14, 12), skin), 0, 0.16, 0);
    head.scale.set(0.95, 1.08, 1);
    add(this.neck, new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 5), skin), 0, 0.15, 0.135);
    if (o.shades) {
      add(this.neck, new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.045, 0.04), dark), 0, 0.17, 0.12);
    } else {
      for (const x of [-0.05, 0.05]) add(this.neck, new THREE.Mesh(new THREE.SphereGeometry(0.017, 6, 5), dark), x, 0.18, 0.128);
    }

    const hatMat = toon(o.hatColor);
    switch (o.hat) {
      case 'bucket': {
        const cap = add(this.neck, new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.52), hatMat), 0, 0.185, 0);
        cap.scale.set(1, 0.95, 1.05);
        add(this.neck, new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.018, 16), hatMat), 0, 0.19, 0.01);
        break;
      }
      case 'cap':
      case 'capBack': {
        const cap = add(this.neck, new THREE.Mesh(new THREE.SphereGeometry(0.147, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), hatMat), 0, 0.195, 0);
        cap.scale.set(1, 0.9, 1.05);
        const brim = add(this.neck, new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.014, 0.1), hatMat), 0, 0.2, o.hat === 'cap' ? 0.17 : -0.17);
        brim.rotation.x = o.hat === 'cap' ? 0.15 : -0.15;
        break;
      }
      case 'beanie': {
        const cap = add(this.neck, new THREE.Mesh(new THREE.SphereGeometry(0.152, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hatMat), 0, 0.19, 0);
        cap.scale.set(1, 1.05, 1.05);
        const cuff = add(this.neck, new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.022, 6, 18), toon(o.trim)), 0, 0.205, 0);
        cuff.rotation.x = Math.PI / 2;
        break;
      }
      case 'headband': {
        const band = add(this.neck, new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.016, 6, 20), toon(o.hatColor, o.hatColor)), 0, 0.235, 0);
        band.rotation.x = Math.PI / 2;
        break;
      }
      default: break;
    }
    if (o.hair === 'afro') {
      const hair = add(this.neck, new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), toon(o.hairColor ?? 0x1a1020)), 0, 0.25, -0.02);
      hair.scale.set(1.05, 0.95, 1.05);
    } else if (o.hair === 'flattop') {
      add(this.neck, new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.1, 0.21), toon(o.hairColor ?? 0x15101a)), 0, 0.29, -0.005);
    }
    if (o.phones) {
      const bandM = toon(0x16161f);
      const arc = add(this.neck, new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.014, 6, 18, Math.PI), bandM), 0, 0.17, 0);
      arc.rotation.y = 0;
      for (const s of [-1, 1]) {
        const cup = add(this.neck, new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.045, 14), bandM), s * 0.17, 0.17, 0);
        cup.rotation.z = Math.PI / 2;
        const pad = add(this.neck, new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.05, 12), toon(o.trim, o.trim)), s * 0.176, 0.17, 0);
        pad.rotation.z = Math.PI / 2;
      }
    }
  }

  /** Pose the whole body from joint angles, planting the lower foot on the floor. */
  apply(p: FigPose) {
    const y = Math.max(legReach(p.aHX, p.aKn, p.aHZ), legReach(p.bHX, p.bKn, p.bHZ)) + p.bob;
    this.hips.position.set(p.px, y, p.pz);
    this.hips.rotation.set(0, p.yaw, p.roll);
    this.spine.rotation.set(p.sx, p.sy, p.sz);
    this.neck.rotation.set(p.hx, p.hy, p.hz);
    this.armA.sh.rotation.set(-p.aSX, 0, -p.aSZ);
    this.armB.sh.rotation.set(-p.bSX, 0, p.bSZ);
    this.armA.el.rotation.set(-p.aEl, 0, 0);
    this.armB.el.rotation.set(-p.bEl, 0, 0);
    this.armA.wr.rotation.set(-p.aWX, 0, -p.aWZ);
    this.armB.wr.rotation.set(-p.bWX, 0, p.bWZ);
    this.legA.hip.rotation.set(-p.aHX, 0, -p.aHZ);
    this.legB.hip.rotation.set(-p.bHX, 0, p.bHZ);
    this.legA.kn.rotation.set(p.aKn, 0, 0);
    this.legB.kn.rotation.set(p.bKn, 0, 0);
    this.shadow.scale.setScalar(1 - Math.min(0.4, Math.max(0, p.bob) * 1.5));
  }

  /**
   * Two-bone IK: swing an arm so its wrist lands on a world-space point. `pole` is the direction the elbow
   * should point, in spine space. Call after apply() and after the world matrices are current.
   */
  reach(side: 'A' | 'B', wrist: THREE.Vector3, pole: THREE.Vector3) {
    const arm = side === 'A' ? this.armA : this.armB;
    const s = _a.copy(arm.sh.position);
    const t = this.spine.worldToLocal(_b.copy(wrist));
    const v = _c.subVectors(t, s);
    const d = Math.min(Math.max(v.length(), Math.abs(UPPER - FORE) + 0.02), UPPER + FORE - 0.004);
    v.normalize();
    const cosA = (UPPER * UPPER + d * d - FORE * FORE) / (2 * UPPER * d);
    const ang = Math.acos(Math.min(1, Math.max(-1, cosA)));
    const perp = _d.copy(pole).addScaledVector(v, -pole.dot(v));
    if (perp.lengthSq() < 1e-6) perp.set(0, 0, -1);
    perp.normalize();
    const elbow = new THREE.Vector3().copy(s).addScaledVector(v, UPPER * Math.cos(ang)).addScaledVector(perp, UPPER * Math.sin(ang));
    const upper = elbow.clone().sub(s).normalize();
    _q.setFromUnitVectors(DOWN, upper);
    arm.sh.quaternion.copy(_q);
    const end = s.clone().addScaledVector(v, d);
    const fore = end.sub(elbow).normalize().applyQuaternion(_q2.copy(_q).invert());
    arm.el.quaternion.setFromUnitVectors(DOWN, fore);
  }

  /**
   * Lay a hand flat, fingers pointing along `fingers` (world space). Call after reach(), with matrices updated.
   */
  flatHand(side: 'A' | 'B', fingers: THREE.Vector3) {
    const arm = side === 'A' ? this.armA : this.armB;
    arm.el.getWorldQuaternion(_q);
    const y = _a.copy(fingers).setY(0).normalize().negate();
    const x = _b.crossVectors(y, UP).normalize();
    const z = _c.crossVectors(x, y).normalize();
    _m.makeBasis(x, y, z);
    _q2.setFromRotationMatrix(_m);
    arm.wr.quaternion.copy(_q.invert().multiply(_q2));
  }

  /** World position of the wrist joint (for aiming the hand). */
  wristWorld(side: 'A' | 'B', out: THREE.Vector3): THREE.Vector3 {
    return (side === 'A' ? this.armA : this.armB).wr.getWorldPosition(out);
  }
}
