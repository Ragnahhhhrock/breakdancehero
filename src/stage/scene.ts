/**
 * The stage: LED dancefloor on the beat, a crowd around the cypher, a boombox, neon wall, moving light beams
 * and the breakdancer in the middle. Everything is driven by the song's beat position.
 */
import * as THREE from 'three';
import { Dancer, type MoveName } from './dancer';
import { DJBooth } from './dj';
import { Crew } from './crew';
import { Director, type BoothPlace } from './director';

export const LANE_COLORS = [0xff2d95, 0x17e1ff, 0xb6ff3d, 0xffb02e];

const PALETTES: number[][] = [
  [0xff2d95, 0x17e1ff, 0x9d6bff],
  [0xffb02e, 0xff2d95, 0xffe14d],
  [0x17e1ff, 0xb6ff3d, 0x9d6bff],
];

/** The DJ's corner: back left of the floor, turned to face the dancer. */
const BOOTH: BoothPlace = { x: -3.7, z: -3.7, yaw: Math.atan2(3.7, 3.7) };

interface Ripple { x: number; z: number; t0: number; color: THREE.Color; size: number }

export interface StageState {
  /** beat position (can be negative during the count-in) */
  beat: number;
  bar: number;
  /** 0..1, how hot the current section is */
  energy: number;
  /** drums are playing */
  kick: boolean;
  combo: number;
  move: MoveName;
}

const _dir = new THREE.Vector3();

const TILE_N = 12;
const TILE = 0.5;

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.25)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function wallTexture(): THREE.CanvasTexture {
  const W = 1024, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#120a2a');
  bg.addColorStop(1, '#2a0f45');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  // brick courses
  g.strokeStyle = 'rgba(255,255,255,0.045)';
  g.lineWidth = 2;
  for (let y = 0; y < H; y += 32) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
    for (let x = (y / 32) % 2 ? 0 : 32; x < W; x += 64) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 32); g.stroke(); }
  }
  // graffiti stripes
  const stripe = (y: number, col: string) => { g.fillStyle = col; g.fillRect(0, y, W, 8); };
  stripe(300, '#ff2d95'); stripe(314, '#17e1ff'); stripe(328, '#ffe14d');
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function signTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d')!;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '400 122px Bungee, Impact, sans-serif';
  g.shadowColor = '#ff2d95';
  g.shadowBlur = 40;
  g.fillStyle = '#ffd1ea';
  g.fillText('BREAKDANCE', 512, 150);
  g.shadowColor = '#17e1ff';
  g.fillStyle = '#d6f8ff';
  g.font = '400 190px Bungee, Impact, sans-serif';
  g.fillText('HERO', 512, 340);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const NEON_W = 1024;
const NEON_H = 480;
type NeonLayer = 'base' | 'club' | 'breakin';

function neonPath(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function glowText(g: CanvasRenderingContext2D, text: string, x: number, y: number, glow: string, core: string) {
  g.save();
  g.fillStyle = glow;
  g.shadowColor = glow;
  for (const blur of [64, 32, 14]) { g.shadowBlur = blur; g.fillText(text, x, y); }
  g.shadowBlur = 5;
  g.fillStyle = core;
  g.fillText(text, x, y);
  g.restore();
}

/** Font sizes for the two lines, shrunk if needed so the lettering sits inside the tube border. */
function neonSizes(g: CanvasRenderingContext2D): { club: number; breakin: number } {
  const fit = (text: string, px: number) => {
    g.font = `400 ${px}px Pacifico, 'Brush Script MT', cursive`;
    const w = g.measureText(text).width;
    return w > NEON_W - 230 ? (px * (NEON_W - 230)) / w : px;
  };
  return { club: fit('Club', 128), breakin: fit("Breakin'", 176) };
}

/** One layer of the "Club Breakin'" sign: the unlit board, or a lit tube group drawn on a clear canvas. */
function neonTexture(layer: NeonLayer): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = NEON_W; c.height = NEON_H;
  const g = c.getContext('2d')!;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const font = (px: number) => `400 ${px}px Pacifico, 'Brush Script MT', cursive`;
  const size = neonSizes(g);
  if (layer === 'base') {
    neonPath(g, 14, 14, NEON_W - 28, NEON_H - 28, 70);
    g.fillStyle = 'rgba(10,5,28,0.86)';
    g.fill();
    g.lineWidth = 4;
    g.strokeStyle = '#2a1d52';
    g.stroke();
    // unlit glass tubes
    neonPath(g, 44, 44, NEON_W - 88, NEON_H - 88, 52);
    g.lineWidth = 9;
    g.strokeStyle = 'rgba(23,225,255,0.22)';
    g.stroke();
    g.font = font(size.club);
    g.fillStyle = 'rgba(160,225,240,0.28)';
    g.fillText('Club', NEON_W / 2, 142);
    g.font = font(size.breakin);
    g.fillStyle = 'rgba(240,150,200,0.28)';
    g.fillText("Breakin'", NEON_W / 2, 322);
  } else if (layer === 'club') {
    neonPath(g, 44, 44, NEON_W - 88, NEON_H - 88, 52);
    g.save();
    g.lineWidth = 9;
    g.strokeStyle = '#17e1ff';
    g.shadowColor = '#17e1ff';
    g.shadowBlur = 26;
    g.stroke();
    g.shadowBlur = 0;
    g.lineWidth = 3;
    g.strokeStyle = '#e6fcff';
    g.stroke();
    g.restore();
    g.font = font(size.club);
    glowText(g, 'Club', NEON_W / 2, 142, '#17e1ff', '#e6fcff');
  } else {
    g.font = font(size.breakin);
    glowText(g, "Breakin'", NEON_W / 2, 322, '#ff2d95', '#ffe3f1');
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(45, 1, 0.1, 60);
  readonly dancer = new Dancer();

  private tiles!: THREE.InstancedMesh;
  private halos!: THREE.InstancedMesh;
  private tileXZ: { x: number; z: number }[] = [];
  private tmpC = new THREE.Color();
  private tmpM = new THREE.Matrix4();
  private ripples: Ripple[] = [];
  private missFlash = 0;
  private pulse = 0;
  private freezeFlash = 0;

  private eq!: THREE.InstancedMesh;
  private beams: { g: THREE.Group; mat: THREE.MeshBasicMaterial; phase: number }[] = [];
  private crowdBody!: THREE.InstancedMesh;
  private crowdHead!: THREE.InstancedMesh;
  private crowdArms!: THREE.InstancedMesh;
  private crowd: { x: number; z: number; ph: number; s: number }[] = [];
  private woofer: THREE.Mesh[] = [];
  private pinkLight = new THREE.PointLight(0xff2d95, 30, 12, 1.6);
  private cyanLight = new THREE.PointLight(0x17e1ff, 30, 12, 1.6);
  private readonly dummy = new THREE.Object3D();

  readonly dj = new DJBooth();
  readonly crew = new Crew();
  readonly director: Director;
  private neonMats = {} as Record<NeonLayer, THREE.MeshBasicMaterial>;
  private neonHalos: THREE.MeshBasicMaterial[] = [];
  private nextFlicker = 3;
  private flickerUntil = 0;

  private camBase = new THREE.Vector3(2.5, 2.4, 6.2);
  private baseTan = 1;
  private baseDist = 1;
  private camPos = new THREE.Vector3();
  private camTarget = new THREE.Vector3();
  private time = 0;
  private lastBeatIdx = -99;
  private beatKick = 0;

  constructor(canvas: HTMLCanvasElement, opts: { lowPower: boolean }) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !opts.lowPower, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x07041a, 1);
    this.scene.background = new THREE.Color(0x07041a);
    this.scene.fog = new THREE.FogExp2(0x07041a, 0.04);

    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.director = new Director({ booth: BOOTH, reducedMotion: reduce });

    this.buildLights();
    this.buildFloor();
    this.buildWall();
    this.buildNeonSign();
    this.buildCrowd();
    this.buildBoombox();
    this.buildBeams();
    this.dj.root.position.set(BOOTH.x, 0, BOOTH.z);
    this.dj.root.rotation.y = BOOTH.yaw;
    this.scene.add(this.dj.root, this.crew.root);
    this.scene.add(this.dancer.root);
    this.dancer.setFacing(Math.atan2(this.camBase.x, this.camBase.z) * 0.9);
  }

  private buildLights() {
    this.scene.add(new THREE.HemisphereLight(0x9a8cff, 0x241238, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(3, 6, 5);
    this.scene.add(key);
    this.pinkLight.position.set(-3, 2.2, 2.5);
    this.cyanLight.position.set(3, 2.2, -2.5);
    this.scene.add(this.pinkLight, this.cyanLight);
  }

  private buildFloor() {
    const base = new THREE.Mesh(
      new THREE.PlaneGeometry(TILE_N * TILE + 0.6, TILE_N * TILE + 0.6),
      new THREE.MeshBasicMaterial({ color: 0x050310 }),
    );
    base.rotation.x = -Math.PI / 2;
    base.position.y = -0.002;
    this.scene.add(base);

    const n = TILE_N * TILE_N;
    const geo = new THREE.PlaneGeometry(TILE * 0.9, TILE * 0.9);
    geo.rotateX(-Math.PI / 2);
    this.tiles = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }), n);
    const hgeo = new THREE.PlaneGeometry(TILE * 1.7, TILE * 1.7);
    hgeo.rotateX(-Math.PI / 2);
    this.halos = new THREE.InstancedMesh(hgeo, new THREE.MeshBasicMaterial({
      color: 0xffffff, map: glowTexture(), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false,
    }), n);
    let i = 0;
    for (let a = 0; a < TILE_N; a++) {
      for (let b = 0; b < TILE_N; b++) {
        const x = (a - (TILE_N - 1) / 2) * TILE;
        const z = (b - (TILE_N - 1) / 2) * TILE;
        this.tileXZ.push({ x, z });
        this.tmpM.makeTranslation(x, 0.003, z);
        this.tiles.setMatrixAt(i, this.tmpM);
        this.tmpM.makeTranslation(x, 0.006, z);
        this.halos.setMatrixAt(i, this.tmpM);
        this.tiles.setColorAt(i, this.tmpC.setRGB(0, 0, 0));
        this.halos.setColorAt(i, this.tmpC);
        i++;
      }
    }
    this.scene.add(this.tiles, this.halos);
  }

  private buildWall() {
    const tex = wallTexture();
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 7),
      new THREE.MeshBasicMaterial({ map: tex, fog: true }),
    );
    wall.position.set(0, 3.4, -6.2);
    this.scene.add(wall);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(5.6, 2.8),
      new THREE.MeshBasicMaterial({ map: signTexture(), transparent: true, depthWrite: false }),
    );
    sign.position.set(0, 4.3, -6.1);
    this.scene.add(sign);
    // rebuild the lettering once the webfont is ready
    void document.fonts?.load('122px Bungee').then(() => { (sign.material as THREE.MeshBasicMaterial).map = signTexture(); (sign.material as THREE.MeshBasicMaterial).needsUpdate = true; });
    // side pillars with neon tubes
    const tubeCols = [0xff2d95, 0x17e1ff, 0xffe14d, 0x9d6bff];
    for (let i = 0; i < 8; i++) {
      const side = i % 2 ? 1 : -1;
      const z = -5.2 + Math.floor(i / 2) * 2.4;
      const tube = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 4.5, 0.07),
        new THREE.MeshBasicMaterial({ color: tubeCols[Math.floor(i / 2)] }),
      );
      tube.position.set(side * 5.6, 2.4, z);
      this.scene.add(tube);
    }
    // equaliser bars under the sign
    const bars = 28;
    this.eq = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.3, 1, 0.1),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      bars,
    );
    for (let i = 0; i < bars; i++) this.eq.setColorAt(i, this.tmpC.setHex(PALETTES[0][i % 3]));
    this.eq.position.set(0, 0, -6.05);
    this.scene.add(this.eq);
  }

  /** The "Club Breakin'" neon: unlit glass tubes on a dark board with the lit tubes added on top, so they can flicker. */
  private buildNeonSign() {
    const g = new THREE.Group();
    const W = 3.9, H = (W * NEON_H) / NEON_W;
    const layers: NeonLayer[] = ['base', 'club', 'breakin'];
    layers.forEach((layer, i) => {
      const mat = new THREE.MeshBasicMaterial({
        map: neonTexture(layer), transparent: true, depthWrite: false, fog: false,
        blending: layer === 'base' ? THREE.NormalBlending : THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat);
      mesh.position.z = i * 0.012;
      mesh.renderOrder = 2 + i;
      g.add(mesh);
      this.neonMats[layer] = mat;
    });
    // coloured light thrown onto the wall behind
    for (const [col, oy] of [[0x17e1ff, 0.5], [0xff2d95, -0.35]] as const) {
      const mat = new THREE.MeshBasicMaterial({
        color: col, map: glowTexture(), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      });
      const halo = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.4), mat);
      halo.position.set(0, oy, -0.1);
      g.add(halo);
      this.neonHalos.push(mat);
    }
    g.position.set(-4.7, 2.7, -6.04);
    g.rotation.y = 0.18;
    this.scene.add(g);
    // redraw the lettering once the script font has loaded
    void document.fonts?.load('176px Pacifico').then(() => {
      for (const layer of layers) { this.neonMats[layer].map = neonTexture(layer); this.neonMats[layer].needsUpdate = true; }
    });
  }

  private buildCrowd() {
    const N = 34;
    this.crowdBody = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.17, 0.5, 4, 8), new THREE.MeshToonMaterial({ color: 0xffffff }), N);
    this.crowdHead = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshToonMaterial({ color: 0xffffff }), N);
    this.crowdArms = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.045, 0.34, 3, 6), new THREE.MeshToonMaterial({ color: 0xffffff }), N * 2);
    const jackets = [0x3b2a73, 0x0f6a7a, 0x8a1f55, 0x4d5c1f, 0x1c3f94, 0x9a5a14, 0x222233, 0x7a2a2a];
    const skins = [0xf0c8a4, 0xc58a5c, 0x8d5a3b, 0x5e3b27, 0xe3b48a];
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    // keep the crowd out of the DJ's corner, off the crew and out of the way of the cameras
    const clear = [
      { ...BOOTH, r: 2.3 },
      ...this.crew.sites().map((p) => ({ ...p, r: 0.9 })),
      ...this.director.sites().map((p) => ({ ...p, r: 1.1 })),
    ];
    let j = 0;
    for (let i = 0; i < N; i++) {
      const a = -0.18 * Math.PI + (i / (N - 1)) * 1.36 * Math.PI;
      const r = 3.5 + rnd() * 1.4 + (i % 2) * 0.6;
      const ph = rnd() * 6.28;
      const sc = 0.9 + rnd() * 0.25;
      const jacket = jackets[Math.floor(rnd() * jackets.length)];
      const skinH = skins[Math.floor(rnd() * skins.length)];
      const skinA = skins[Math.floor(rnd() * skins.length)];
      const x = Math.cos(a) * r, z = -Math.sin(a) * r + 0.2;
      if (clear.some((c) => Math.hypot(x - c.x, z - c.z) < c.r)) continue;
      this.crowd.push({ x, z, ph, s: sc });
      this.crowdBody.setColorAt(j, this.tmpC.setHex(jacket));
      this.crowdHead.setColorAt(j, this.tmpC.setHex(skinH));
      this.crowdArms.setColorAt(j * 2, this.tmpC.setHex(skinA));
      this.crowdArms.setColorAt(j * 2 + 1, this.tmpC);
      j++;
    }
    this.crowdBody.count = j;
    this.crowdHead.count = j;
    this.crowdArms.count = j * 2;
    this.scene.add(this.crowdBody, this.crowdHead, this.crowdArms);
  }

  private buildBoombox() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.42, 0.24), new THREE.MeshToonMaterial({ color: 0x2b2b3a }));
    body.position.y = 0.21;
    g.add(body);
    const grille = new THREE.MeshToonMaterial({ color: 0x9ad8ff, emissive: 0x17e1ff, emissiveIntensity: 0.4 });
    for (const x of [-0.27, 0.27]) {
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.04, 16), grille);
      cone.rotation.x = Math.PI / 2;
      cone.position.set(x, 0.21, 0.13);
      g.add(cone);
      this.woofer.push(cone);
    }
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.018, 6, 20, Math.PI), new THREE.MeshToonMaterial({ color: 0xcfcfdf }));
    handle.position.y = 0.42;
    g.add(handle);
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.02), new THREE.MeshBasicMaterial({ color: 0xff2d95 }));
    led.position.set(0, 0.32, 0.125);
    g.add(led);
    g.position.set(-2.0, 0, -1.1);
    g.rotation.y = 0.6;
    this.scene.add(g);
  }

  private buildBeams() {
    const colors = [0xff2d95, 0x17e1ff, 0xffe14d, 0x9d6bff];
    for (let i = 0; i < 4; i++) {
      const geo = new THREE.ConeGeometry(0.9, 7.5, 18, 1, true);
      geo.translate(0, -3.75, 0);
      const mat = new THREE.MeshBasicMaterial({
        color: colors[i], transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      const g = new THREE.Group();
      g.add(mesh);
      g.position.set((i - 1.5) * 2.2, 6.2, -2.5 + (i % 2) * 2.5);
      this.scene.add(g);
      this.beams.push({ g, mat, phase: i * 1.57 });
    }
  }

  /** Fit the view: where the dancer sits on screen and how large. */
  layout(width: number, height: number, anchorX: number, anchorY: number, heightFrac: number, dpr: number, band = 0.9) {
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    const cam = this.camera;
    const dist = this.camBase.distanceTo(new THREE.Vector3(0, 0.9, 0));
    cam.aspect = width / height;
    // the dancer fills `heightFrac` of the screen from the default camera. Other shots keep that scale
    // (times their zoom) however far the camera is, and never zoom past the free band above the highway.
    this.baseDist = dist;
    this.baseTan = 1 / (heightFrac * dist);
    this.director.maxZoom = Math.min(1.6, Math.max(1, (0.92 * band) / heightFrac));
    cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(this.baseTan));
    cam.position.copy(this.camBase);
    cam.lookAt(0, 0.9, 0);
    cam.clearViewOffset();
    cam.updateProjectionMatrix();
    const offX = width / 2 - anchorX * width;
    const offY = height / 2 - anchorY * height;
    cam.setViewOffset(width, height, offX, offY, width, height);
  }

  /** Floor ripple and dancer accent for a tap. */
  hit(lane: number, grade: 'perfect' | 'great' | 'good') {
    this.dancer.accent(lane, grade === 'perfect' ? 1 : 0.8);
    const col = new THREE.Color(LANE_COLORS[lane]);
    const lx = [-1.1, 0, 0, 1.1][lane];
    this.ripples.push({ x: lx * 0.4, z: 0.2, t0: this.time, color: col, size: grade === 'perfect' ? 1 : 0.7 });
    if (this.ripples.length > 8) this.ripples.shift();
    this.pulse = Math.max(this.pulse, grade === 'perfect' ? 0.5 : 0.3);
  }

  miss() { this.missFlash = 1; }
  burst() {
    this.freezeFlash = 1;
    this.pulse = 1;
    this.crew.cheer();
    this.director.hero();
  }

  update(dt: number, s: StageState) {
    dt = Math.max(0, dt);
    this.time += dt;
    const beatIdx = Math.floor(s.beat);
    const ph = s.beat - beatIdx;
    if (beatIdx !== this.lastBeatIdx) {
      this.lastBeatIdx = beatIdx;
      this.beatKick = 1;
    }
    this.beatKick *= Math.exp(-dt * 7);
    this.pulse *= Math.exp(-dt * 5);
    this.missFlash *= Math.exp(-dt * 4);
    this.freezeFlash *= Math.exp(-dt * 2.5);

    this.dancer.setMove(s.move);
    this.dancer.update(dt, s.beat, s.bar);
    const hype = Math.min(1, 0.15 + s.energy * 0.5 + Math.min(1, s.combo / 40) * 0.5);
    this.crew.update(dt, { beat: s.beat, hype, dancerFrozen: s.move === 'freeze' });
    this.dj.update(dt, s.beat, s.energy, s.kick);

    this.updateFloor(s, ph);
    this.updateEq(s, ph);
    this.updateCrowd(s);
    this.updateBeams(s);
    this.updateNeon(s);

    const flash = this.beatKick * (0.35 + s.energy * 0.65) + this.pulse * 0.6;
    this.pinkLight.intensity = 18 + 40 * flash;
    this.cyanLight.intensity = 18 + 40 * (1 - ph) * s.energy;
    for (const w of this.woofer) w.scale.set(1 + 0.18 * this.beatKick, 1, 1 + 0.18 * this.beatKick);

    this.updateCamera(dt, s);
  }

  /** The director picks the shot; here it becomes a camera with a little hand-held sway and a push on the beat. */
  private updateCamera(dt: number, s: StageState) {
    const shot = this.director.update(s.beat, dt, { move: s.move, energy: s.energy });
    const cam = this.camera;
    const pos = this.camPos.set(...shot.pos);
    const target = this.camTarget.set(...shot.target);
    pos.x += Math.sin(this.time * 0.5) * shot.sway;
    pos.y += Math.sin(this.time * 0.37) * shot.sway * 0.32;
    // a push on every beat, and a bigger one on the freeze burst while the dancer is the subject
    const push = this.beatKick * 0.05 * (0.4 + s.energy) + (shot.dj ? 0 : this.freezeFlash * 0.4);
    pos.addScaledVector(_dir.subVectors(target, pos).normalize(), push);
    cam.position.copy(pos);
    cam.lookAt(target);
    // keep the subject the same size from any distance, times the shot's zoom
    const fov = THREE.MathUtils.radToDeg(2 * Math.atan((this.baseTan * this.baseDist) / (pos.distanceTo(target) * shot.zoom)));
    if (Math.abs(fov - cam.fov) > 1e-4) { cam.fov = fov; cam.updateProjectionMatrix(); }
  }

  /** "Breakin'" flickers like a tired tube now and then; the whole sign breathes with the beat. */
  private updateNeon(s: StageState) {
    if (this.time > this.nextFlicker) {
      this.flickerUntil = this.time + 0.4;
      this.nextFlicker = this.time + 6 + Math.random() * 8;
    }
    const flick = this.time < this.flickerUntil ? (Math.floor(this.time * 28) % 3 === 0 ? 0.12 : 1) : 1;
    const breathe = 0.82 + 0.18 * (this.beatKick * (0.4 + 0.6 * s.energy));
    this.neonMats.club.opacity = breathe;
    this.neonMats.breakin.opacity = breathe * flick;
    this.neonHalos[0].opacity = 0.14 + 0.1 * breathe;
    this.neonHalos[1].opacity = (0.14 + 0.1 * breathe) * flick;
  }

  private updateFloor(s: StageState, ph: number) {
    const mod = (n: number, m: number) => ((n % m) + m) % m;
    const pal = PALETTES[mod(Math.floor(s.bar / 8), PALETTES.length)];
    const mode = mod(Math.floor(s.bar / 2), 3);
    const beatIdx = Math.floor(s.beat);
    const pulse = Math.exp(-ph * 4.5);
    const base = 0.16 + 0.12 * s.energy;
    const hot = s.kick ? 1 : 0.55;
    const c = this.tmpC;
    const red = this.missFlash;
    for (let i = 0; i < this.tileXZ.length; i++) {
      const { x, z } = this.tileXZ[i];
      const d = Math.hypot(x, z);
      let k = 0;
      let ci = 0;
      if (mode === 0) {
        // rings that expand outwards on the beat
        const wave = Math.sin(d * 2.4 - s.beat * Math.PI * 1.0);
        k = 0.5 + 0.5 * wave;
        ci = Math.floor(d * 0.9 + s.beat * 0.25);
      } else if (mode === 1) {
        // checkerboard flip
        const a = Math.round(x / TILE) + Math.round(z / TILE);
        k = (a + beatIdx) % 2 === 0 ? 1 : 0.25;
        ci = Math.floor((a + beatIdx) / 2);
      } else {
        // diagonal sweep
        k = 0.5 + 0.5 * Math.sin((x + z) * 1.6 - s.beat * Math.PI * 0.5 * 2);
        ci = Math.floor((x - z) * 0.7 + beatIdx * 0.3);
      }
      let v = base + hot * (0.25 + 0.5 * s.energy) * k * (0.4 + 0.6 * pulse) + this.pulse * 0.25;
      c.setHex(pal[((ci % 3) + 3) % 3]);
      // ripples from the player's hits
      let rip = 0;
      let rr = 0, rg = 0, rb = 0;
      for (const r of this.ripples) {
        const age = this.time - r.t0;
        if (age > 0.8) continue;
        const dd = Math.hypot(x - r.x, z - r.z);
        const front = age * 7;
        const wave = Math.exp(-Math.pow((dd - front) * 1.5, 2)) * (1 - age / 0.8) * r.size;
        rip += wave;
        rr += r.color.r * wave; rg += r.color.g * wave; rb += r.color.b * wave;
      }
      let R = c.r * v + rr * 1.3, G = c.g * v + rg * 1.3, B = c.b * v + rb * 1.3;
      if (red > 0.01) { R = R * (1 - red) + red * 0.9 * (0.3 + k * 0.7); G *= 1 - red * 0.8; B *= 1 - red * 0.8; }
      if (this.freezeFlash > 0.01) { const f = this.freezeFlash * 0.6; R += f; G += f; B += f; }
      c.setRGB(R, G, B);
      this.tiles.setColorAt(i, c);
      c.setRGB(R * 0.6, G * 0.6, B * 0.6);
      this.halos.setColorAt(i, c);
      void rip;
    }
    this.tiles.instanceColor!.needsUpdate = true;
    this.halos.instanceColor!.needsUpdate = true;
  }

  private updateEq(s: StageState, ph: number) {
    const n = this.eq.count;
    const d = this.dummy;
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * 0.46;
      const a = 0.5 + 0.5 * Math.abs(Math.sin(i * 1.7 + this.time * 3.1));
      const h = 0.12 + (0.2 + 1.6 * s.energy) * a * (0.5 + 0.5 * Math.exp(-ph * 3)) * (s.kick ? 1 : 0.55);
      d.position.set(x, h / 2 + 0.05, 0);
      d.scale.set(1, h, 1);
      d.rotation.set(0, 0, 0);
      d.updateMatrix();
      this.eq.setMatrixAt(i, d.matrix);
    }
    this.eq.instanceMatrix.needsUpdate = true;
  }

  private updateCrowd(s: StageState) {
    const d = this.dummy;
    const hype = Math.min(1, 0.15 + s.energy * 0.5 + Math.min(1, s.combo / 40) * 0.5);
    for (let i = 0; i < this.crowd.length; i++) {
      const p = this.crowd[i];
      const bob = Math.abs(Math.sin(Math.PI * s.beat + p.ph)) * (0.03 + 0.1 * hype);
      const face = Math.atan2(-p.x, -p.z);
      d.position.set(p.x, 0.5 * p.s + bob, p.z);
      d.rotation.set(0, face, Math.sin(this.time * 2 + p.ph) * 0.04 * hype);
      d.scale.set(1, p.s, 1);
      d.updateMatrix();
      this.crowdBody.setMatrixAt(i, d.matrix);
      d.position.set(p.x, 1.2 * p.s + bob, p.z);
      d.scale.setScalar(p.s);
      d.updateMatrix();
      this.crowdHead.setMatrixAt(i, d.matrix);
      // arms: hang when calm, thrown up in the air when the hype is high
      const up = hype > 0.5 ? (0.5 + 0.5 * Math.sin(Math.PI * s.beat * 2 + p.ph)) * (hype - 0.3) * 1.4 : 0;
      for (const side of [-1, 1]) {
        const lift = Math.min(1, up);
        d.position.set(p.x + Math.cos(face) * side * 0.22 * p.s, (0.8 + 0.35 * lift) * p.s + bob, p.z - Math.sin(face) * side * 0.22 * p.s);
        d.rotation.set(0, face, side * (0.1 + 2.5 * lift));
        d.scale.setScalar(p.s);
        d.updateMatrix();
        this.crowdArms.setMatrixAt(i * 2 + (side > 0 ? 1 : 0), d.matrix);
      }
    }
    this.crowdBody.instanceMatrix.needsUpdate = true;
    this.crowdHead.instanceMatrix.needsUpdate = true;
    this.crowdArms.instanceMatrix.needsUpdate = true;
  }

  private updateBeams(s: StageState) {
    const glow = 0.04 + 0.1 * s.energy + this.pulse * 0.1;
    for (const b of this.beams) {
      const t = this.time * 0.6 + b.phase;
      b.g.rotation.x = Math.sin(t) * 0.35;
      b.g.rotation.z = Math.cos(t * 0.8) * 0.35;
      b.mat.opacity = glow * (0.6 + 0.4 * Math.sin(t * 2.3));
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.renderer.dispose();
  }
}
