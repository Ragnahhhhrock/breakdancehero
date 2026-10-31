/**
 * The DJ booth: a DJ behind two turntables and a mixer, scratching records in time with the song.
 *
 * The booth faces +Z (the audience). The DJ's right hand (side A, -X) works the right deck and the left hand
 * (side B, +X) works the left deck or the crossfader. Hands are placed with IK onto the spinning records, so
 * a scratch is a real back-and-forth of the record under a hand that follows it.
 */
import * as THREE from 'three';
import { Figure, blendPose, restPose, toon, toonGradient, type FigureOutfit } from './figure';

const DJ_OUTFIT: FigureOutfit = {
  skin: 0x8d5a3b, top: 0xffb02e, bottom: 0x1a1a2e, trim: 0x07041a, shoe: 0xf6f1e4, sole: 0x17e1ff,
  hat: 'capBack', hatColor: 0x2a1b4d, shades: true, chain: 0xffd24a, phones: true,
};

// layout (booth space, metres)
const TOP = 0.9;
const DECK_X = 0.52;
const DECK_Z = 0.05;
const RECORD_R = 0.235;
const RECORD_Y = 0.998;
const GRIP = 0.14;
const FADER_Z = -0.19;
const FADER_Y = 1.005;
const FADER_RANGE = 0.1;
const DJ_Z = -0.5;
const RPM = (33.3 / 60) * Math.PI * 2;
const NAMES = ['deck', 'fader', 'knob', 'up'] as const;
type Mode = (typeof NAMES)[number];

interface Plan { a: Mode; b: Mode; pat: number }
/** Eight-bar routine: baby scratches, a flare, a chirp, a transformer, hands up for the crowd, a knob twist. */
const PLAN: Plan[] = [
  { a: 'deck', b: 'fader', pat: 0 },
  { a: 'deck', b: 'fader', pat: 0 },
  { a: 'deck', b: 'fader', pat: 2 },
  { a: 'up', b: 'fader', pat: 3 },
  { a: 'fader', b: 'deck', pat: 1 },
  { a: 'fader', b: 'deck', pat: 5 },
  { a: 'deck', b: 'fader', pat: 4 },
  { a: 'knob', b: 'knob', pat: 3 },
];

const TAU = Math.PI * 2;
const tri = (x: number) => 4 * Math.abs(x - Math.floor(x + 0.5)) - 1;

/** Record displacement (radians) and crossfader gate (0..1) for a scratch pattern at beat b. */
export function scratch(pat: number, b: number): { s: number; gate: number } {
  switch (pat) {
    case 0: return { s: 0.9 * Math.sin(TAU * b), gate: Math.cos(TAU * b) > 0 ? 1 : 0 };               // baby: forward-back on every 8th
    case 1: return { s: 0.6 * Math.sin(TAU * b * 2), gate: Math.cos(TAU * b * 2) > -0.1 ? 1 : 0 };   // fast baby
    case 2: {                                                                                          // flare: long stroke, fader clicks
      const st = Math.sin(TAU * b * 0.5);
      return { s: 1.2 * st, gate: st > 0 && Math.sin(TAU * b * 3) > -0.3 ? 1 : 0 };
    }
    case 3: return { s: 1.3 * tri(b / 2), gate: 1 };                                                    // drag: long slow pulls
    case 4: return { s: 0.8 * Math.sin(TAU * b), gate: b % 1 < 0.5 ? 1 : 0 };                           // chirp
    default: return { s: 0.8 * Math.sin(TAU * b * 0.5), gate: Math.sin(TAU * b * 2) > 0 ? 1 : 0 };    // transformer
  }
}

function vinylTexture(label: string, ring: string): THREE.CanvasTexture {
  const S = 256, C = S / 2;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0a0a12';
  g.fillRect(0, 0, S, S);
  // grooves, with brighter gaps between "tracks" so the spin reads
  for (let r = 40, i = 0; r < C - 3; r += 2, i++) {
    g.strokeStyle = i % 9 === 0 ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.055)';
    g.lineWidth = 1;
    g.beginPath(); g.arc(C, C, r, 0, TAU); g.stroke();
  }
  // light catching the vinyl: two opposite wedges
  for (const a0 of [0.35, 0.35 + Math.PI]) {
    g.fillStyle = 'rgba(255,255,255,0.07)';
    g.beginPath(); g.moveTo(C, C); g.arc(C, C, C - 3, a0, a0 + 0.5); g.closePath(); g.fill();
  }
  // a notch and some scuffs near the rim: a fixed mark to follow while it moves
  g.fillStyle = ring;
  g.beginPath(); g.moveTo(C + C - 22, C); g.lineTo(C + C - 8, C - 7); g.lineTo(C + C - 8, C + 7); g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.35)';
  for (const [a, r] of [[1.2, 100], [2.4, 76], [3.9, 108], [5.1, 88]]) g.fillRect(C + Math.cos(a) * r, C + Math.sin(a) * r, 3, 3);
  // label
  g.fillStyle = label;
  g.beginPath(); g.arc(C, C, 36, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 3;
  g.beginPath(); g.arc(C, C, 25, 0.3, 2.4); g.stroke();
  g.fillStyle = '#fff';
  g.fillRect(C - 3, C - 33, 6, 14);
  g.fillStyle = '#0a0a12';
  g.beginPath(); g.arc(C, C, 4, 0, TAU); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

interface Hand { mode: Mode; blend: number; from: THREE.Vector3; pos: THREE.Vector3; fingers: THREE.Vector3; flat: boolean }

export class DJBooth {
  readonly root = new THREE.Group();
  private fig = new Figure(DJ_OUTFIT);
  private records: THREE.Group[] = [];
  private grips: THREE.Object3D[] = [];
  private fader!: THREE.Mesh;
  private knobs: THREE.Object3D[] = [];
  private leds: THREE.MeshBasicMaterial[] = [];
  private bars!: THREE.InstancedMesh;
  private beam!: THREE.Mesh;
  private nominal = [0, 0];
  private disp = [0, 0];
  private gate = 0.5;
  private pose = restPose();
  private tgt = restPose();
  private hands: Hand[] = [
    { mode: 'knob', blend: 1, from: new THREE.Vector3(), pos: new THREE.Vector3(), fingers: new THREE.Vector3(0, 0, 1), flat: true },
    { mode: 'knob', blend: 1, from: new THREE.Vector3(), pos: new THREE.Vector3(), fingers: new THREE.Vector3(0, 0, 1), flat: true },
  ];
  private readonly dummy = new THREE.Object3D();
  private readonly pole = [new THREE.Vector3(-0.6, -0.7, -0.25), new THREE.Vector3(0.6, -0.7, -0.25)];
  private fwd = new THREE.Vector3();
  private v1 = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private v3 = new THREE.Vector3();
  private beatKick = 0;
  private lastBeat = -99;

  constructor() {
    this.buildTable();
    this.buildDecks();
    this.buildMixer();
    this.fig.root.position.set(0, 0, DJ_Z);
    this.root.add(this.fig.root);
    this.beam = new THREE.Mesh(
      (() => { const g = new THREE.ConeGeometry(0.95, 5, 20, 1, true); g.translate(0, -2.5, 0); return g; })(),
      new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.beam.position.set(0, 5.3, -0.2);
    this.root.add(this.beam);
  }

  private box(w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.root) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  private buildTable() {
    const body = toon(0x1b1630);
    this.box(2.0, TOP, 0.7, body, 0, TOP / 2, 0);
    // glowing edges and an equaliser on the front panel
    this.box(2.02, 0.025, 0.025, new THREE.MeshBasicMaterial({ color: 0x17e1ff }), 0, TOP, 0.35);
    this.box(2.02, 0.025, 0.025, new THREE.MeshBasicMaterial({ color: 0xff2d95 }), 0, 0.05, 0.352);
    this.bars = new THREE.InstancedMesh(new THREE.BoxGeometry(0.09, 1, 0.012), new THREE.MeshBasicMaterial({ color: 0xffffff }), 14);
    const cols = [0xff2d95, 0x17e1ff, 0xffe14d];
    const c = new THREE.Color();
    for (let i = 0; i < 14; i++) this.bars.setColorAt(i, c.setHex(cols[i % 3]));
    this.bars.position.set(0, 0, 0.357);
    this.root.add(this.bars);
    // speaker feet
    for (const x of [-1.25, 1.25]) {
      this.box(0.5, 1.1, 0.5, toon(0x14111f), x, 0.55, -0.05);
      for (const y of [0.35, 0.78]) {
        const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.03, 18), toon(0x9ad8ff, 0x17e1ff));
        cone.rotation.x = Math.PI / 2;
        cone.position.set(x, y, 0.21);
        this.root.add(cone);
      }
    }
  }

  private buildDecks() {
    const baseM = toon(0x2c2a3c);
    const metal = toon(0xb9b9c8);
    const accents = [{ label: '#ff2d95', ring: '#ffe1f0' }, { label: '#17e1ff', ring: '#d8fbff' }];
    for (let k = 0; k < 2; k++) {
      // k=0: right deck (-X, the DJ's right hand), k=1: left deck
      const x = k === 0 ? -DECK_X : DECK_X;
      const deck = new THREE.Group();
      deck.position.set(x, TOP, DECK_Z);
      this.root.add(deck);
      this.box(0.62, 0.07, 0.56, baseM, 0, 0.035, 0, deck);
      const platter = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.02, 32), metal);
      platter.position.set(0, 0.08, 0);
      deck.add(platter);
      // record
      const rec = new THREE.Group();
      rec.position.set(0, RECORD_Y - TOP, 0);
      const tex = vinylTexture(accents[k].label, accents[k].ring);
      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(RECORD_R, RECORD_R, 0.008, 40),
        [toon(0x0a0a12), new THREE.MeshToonMaterial({ map: tex, gradientMap: toonGradient() }), toon(0x0a0a12)],
      );
      rec.add(disc);
      const grip = new THREE.Object3D();
      grip.position.set(0, 0.004, -GRIP);
      rec.add(grip);
      deck.add(rec);
      this.records.push(rec);
      this.grips.push(grip);
      const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.03, 8), metal);
      spindle.position.set(0, 0.1, 0);
      deck.add(spindle);
      // tonearm at the far corner, laid on the record
      const arm = new THREE.Group();
      arm.position.set(-0.26, 0.108, 0.2);
      arm.rotation.y = Math.atan2(0.17, -0.1);
      deck.add(arm);
      this.box(0.014, 0.014, 0.2, metal, 0, 0, 0.1, arm);
      this.box(0.03, 0.012, 0.045, toon(0x1b1b26), 0, -0.003, 0.215, arm);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.05, 12), toon(0x1b1b26));
      post.position.set(-0.26, 0.075, 0.2);
      deck.add(post);
      // buttons and a pitch slider on the near edge
      this.box(0.04, 0.012, 0.03, toon(0x222230), 0.24, 0.076, -0.2, deck);
      const led = new THREE.MeshBasicMaterial({ color: k === 0 ? 0xff3355 : 0x39ff88 });
      this.box(0.016, 0.008, 0.016, led, 0.19, 0.075, -0.2, deck);
      this.box(0.02, 0.006, 0.2, toon(0x111118), k === 0 ? 0.27 : -0.27, 0.074, 0.05, deck);
    }
  }

  private buildMixer() {
    const m = toon(0x15131f);
    this.box(0.4, 0.09, 0.5, m, 0, TOP + 0.045, 0);
    const slot = toon(0x050508);
    this.box(0.26, 0.004, 0.025, slot, 0, TOP + 0.092, FADER_Z);
    this.fader = this.box(0.045, 0.028, 0.04, toon(0xf6f1e4, 0xf6f1e4), 0, FADER_Y, FADER_Z);
    for (const x of [-0.07, 0.07]) {
      this.box(0.012, 0.004, 0.16, slot, x, TOP + 0.092, -0.02);
      this.box(0.03, 0.02, 0.02, toon(0xff2d95, 0xff2d95), x, TOP + 0.103, -0.02 + (x < 0 ? 0.03 : -0.03));
    }
    const caps = [0xff2d95, 0x17e1ff, 0xffe14d, 0xb6ff3d];
    for (const z of [0.07, 0.15]) {
      for (let i = 0; i < 4; i++) {
        const k = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.026, 10), toon(caps[(i + (z > 0.1 ? 1 : 0)) % 4]));
        k.position.set(-0.13 + i * 0.087, TOP + 0.103, z);
        this.root.add(k);
        this.knobs.push(k);
      }
    }
    for (let i = 0; i < 8; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x113322 });
      this.leds.push(mat);
      this.box(0.028, 0.01, 0.02, mat, -0.14 + i * 0.04, TOP + 0.094, 0.225);
    }
  }

  update(dt: number, beat: number, energy: number, kick: boolean) {
    const bar = Math.floor(beat / 4);
    const idx = Math.floor(beat);
    if (idx !== this.lastBeat) { this.lastBeat = idx; this.beatKick = 1; }
    this.beatKick *= Math.exp(-dt * 6);
    const live = beat >= 0;
    const plan = PLAN[((bar % 8) + 8) % 8];
    const sc = live ? scratch(plan.pat, beat) : { s: 0, gate: 0.5 };
    const down = Math.cos(Math.PI * beat) ** 2;

    // records: both spin at 33 rpm; the one under a hand is pushed and pulled on top of that
    const amp = 0.6 + 0.4 * energy;
    const want = [plan.a === 'deck' ? sc.s * amp : 0, plan.b === 'deck' ? sc.s * amp : 0];
    const kd = 1 - Math.exp(-60 * dt);
    for (let k = 0; k < 2; k++) {
      this.nominal[k] += RPM * dt;
      this.disp[k] += (want[k] - this.disp[k]) * kd;
      this.records[k].rotation.y = this.nominal[k] + this.disp[k];
    }
    const scratching = plan.a === 'deck' || plan.b === 'deck';
    this.gate += ((scratching ? sc.gate : 0.5) - this.gate) * (1 - Math.exp(-40 * dt));
    this.fader.position.x = (this.gate - 0.5) * 2 * FADER_RANGE;

    // body: lean over the decks, nod on the beat, turn towards the busy hand
    const t = this.tgt;
    Object.assign(t, restPose());
    t.sx = 0.5 + 0.05 * down;
    t.pz = 0.07;
    t.hx = -0.5 + 0.14 * down;
    t.aHX = t.bHX = 0.2;
    t.aKn = t.bKn = 0.4 + 0.1 * down;
    t.sy = (plan.a === 'deck' ? -0.12 : 0) + (plan.b === 'deck' ? 0.12 : 0);
    t.hy = -t.sy * 0.8;
    t.hz = 0.05 * Math.sin(Math.PI * beat * 0.5);
    blendPose(this.pose, t, 18, dt);
    this.fig.apply(this.pose);

    // knobs twiddle a little, meters and the front equaliser follow the music
    for (let i = 0; i < this.knobs.length; i++) this.knobs[i].rotation.y = Math.sin(beat * 0.7 + i) * 1.2;
    const lvl = (0.2 + 0.8 * energy) * (kick ? 0.45 + 0.55 * this.beatKick : 0.35);
    for (let i = 0; i < this.leds.length; i++) {
      const on = i / this.leds.length < lvl;
      this.leds[i].color.setHex(!on ? 0x0d2418 : i > 5 ? 0xff3355 : i > 3 ? 0xffe14d : 0x39ff88);
    }
    const d = this.dummy;
    for (let i = 0; i < 14; i++) {
      const a = 0.5 + 0.5 * Math.abs(Math.sin(i * 1.9 + beat * 1.3));
      const h = 0.06 + (0.12 + 0.55 * energy) * a * (0.5 + 0.5 * this.beatKick) * (kick ? 1 : 0.5);
      d.position.set((i - 6.5) * 0.14, 0.12 + h / 2, 0);
      d.scale.set(1, h, 1);
      d.updateMatrix();
      this.bars.setMatrixAt(i, d.matrix);
    }
    this.bars.instanceMatrix.needsUpdate = true;
    (this.beam.material as THREE.MeshBasicMaterial).opacity = 0.05 + 0.06 * energy + 0.05 * this.beatKick;

    this.placeHands(dt, beat, plan, live);
  }

  private placeHands(dt: number, beat: number, plan: Plan, live: boolean) {
    this.root.updateMatrixWorld(true);
    this.fwd.set(0, 0, 1).transformDirection(this.root.matrixWorld);
    const modes: Mode[] = live ? [plan.a, plan.b] : ['knob', 'knob'];
    for (let h = 0; h < 2; h++) {
      const hand = this.hands[h];
      if (modes[h] !== hand.mode) {
        hand.mode = modes[h];
        hand.blend = 0;
        hand.from.copy(hand.pos);
      }
      hand.blend = Math.min(1, hand.blend + dt / 0.14);
      const goal = this.v1;
      const fingers = this.v2;
      hand.flat = true;
      this.handGoal(h, hand.mode, beat, goal, fingers);
      if (hand.mode === 'up') hand.flat = false;
      const e = hand.blend * hand.blend * (3 - 2 * hand.blend);
      hand.pos.lerpVectors(hand.from, goal, e);
      hand.fingers.copy(fingers);
      this.fig.reach(h === 0 ? 'A' : 'B', hand.pos, this.pole[h]);
      if (hand.flat) this.fig.flatHand(h === 0 ? 'A' : 'B', hand.fingers);
    }
  }

  /** Where this hand's wrist should be, and which way the fingers point, for a mode. */
  private handGoal(h: number, mode: Mode, beat: number, wrist: THREE.Vector3, fingers: THREE.Vector3) {
    const side = h === 0 ? -1 : 1;
    const up = 0.03;
    switch (mode) {
      case 'deck': {
        const grip = this.grips[h].getWorldPosition(this.v3);
        const center = this.records[h].getWorldPosition(wrist);
        fingers.subVectors(center, grip).setY(0).normalize();
        wrist.copy(grip).addScaledVector(fingers, -0.05);
        wrist.y += up;
        return;
      }
      case 'fader': {
        fingers.copy(this.fwd);
        this.fader.getWorldPosition(wrist);
        wrist.addScaledVector(fingers, -0.05);
        wrist.y += 0.04;
        return;
      }
      case 'knob': {
        const k = this.knobs[(Math.floor(beat / 2) * 3 + h * 5) % this.knobs.length];
        fingers.copy(this.fwd);
        k.getWorldPosition(wrist);
        wrist.addScaledVector(fingers, -0.05);
        wrist.y += 0.04;
        return;
      }
      default: {
        // hand in the air, waving for the crowd
        const wave = Math.sin(Math.PI * beat);
        fingers.copy(this.fwd);
        wrist.set(side * (0.5 + 0.08 * wave), 1.95 + 0.06 * Math.abs(wave), DJ_Z + 0.15).applyMatrix4(this.root.matrixWorld);
      }
    }
  }
}
