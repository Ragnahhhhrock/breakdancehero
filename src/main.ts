import './style.css';
import { Stage } from './stage/scene';
import { Game, type Result } from './game/engine';
import { Highway } from './game/highway';
import type { Difficulty } from './game/chart';
import { clearUI, showMenu, showPause, showResults, showScores, showStarting } from './ui/ui';
import { track } from './analytics';
import { currentLayout } from './game/keys';

const stageCanvas = document.getElementById('stage') as HTMLCanvasElement;
const hwCanvas = document.getElementById('hw') as HTMLCanvasElement;
const hud = document.getElementById('hud')!;
const scoreEl = document.getElementById('score')!;
const hypeEl = document.getElementById('hypefill') as HTMLElement;
const g2 = hwCanvas.getContext('2d')!;

const coarse = matchMedia('(pointer:coarse)').matches;
const stage = new Stage(stageCanvas, { lowPower: coarse });
const highway = new Highway();

let W = 0, H = 0, hudTop = 0;
const dpr = () => Math.min(window.devicePixelRatio || 1, coarse ? 2 : 2);

function layout() {
  W = window.innerWidth; H = window.innerHeight;
  const d = dpr();
  hwCanvas.width = Math.round(W * d); hwCanvas.height = Math.round(H * d);
  g2.setTransform(d, 0, 0, d, 0, 0);
  hudTop = 62;
  if (W < H * 1.1) {
    // portrait: dancer on top, highway in the lower half
    const hh = Math.min(H * 0.56, 560);
    highway.layout({ x: Math.max(0, (W - Math.min(W, 460)) / 2), y: H - hh, w: Math.min(W, 460), h: hh });
    stage.layout(W, H, 0.5, (hudTop + (H - hh)) / 2 / H + 0.04, Math.min(0.34, ((H - hh - hudTop) / H) * 0.62), d, (H - hh - hudTop) / H);
  } else {
    const hw = Math.min(W * 0.42, 440);
    highway.layout({ x: W - hw - 24, y: hudTop, w: hw, h: H - hudTop - 8 });
    stage.layout(W, H, (W - hw - 24) / 2 / W, 0.56, 0.62, d, (H - hudTop) / H);
  }
}
window.addEventListener('resize', layout);
layout();

const game = new Game({
  onHit(lane, grade, delta) { highway.hit(lane, grade, delta); stage.hit(lane, grade); },
  onMiss(lane) { highway.miss(); stage.miss(); void lane; },
  onStray(lane) { highway.stray(lane); },
  onMilestone(c) { highway.announce(`${c} COMBO!`); stage.burst(); track('combo_milestone', { combo: c, level_name: game.difficulty }); },
  onEnd(r: Result) {
    track('level_end', { level_name: r.difficulty, success: true, score: r.score, grade: r.grade, accuracy: Math.round(r.accuracy * 100), max_combo: r.maxCombo, misses: r.counts.miss, new_best: r.newBest });
    track('post_score', { score: r.score, level: r.difficulty });
    hud.hidden = true; setTimeout(() => showResults(r, () => play(r.difficulty), toMenu), 1400); },
});

let menu: ReturnType<typeof showMenu> | null = null;
let loaded = false;
function toMenu() {
  game.quit();
  hud.hidden = true;
  menu = showMenu(game, loaded, play, (d) => showScores(d, toMenu));
}
async function play(d: Difficulty) {
  showStarting();
  // let the "Starting…" state paint before any audio start-up work can block the main thread
  await new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  track('level_start', { level_name: d });
  await game.start(d);
  clearUI();
  hud.hidden = false;
}

toMenu();
game.load((f) => menu?.progress(f)).then(() => { loaded = true; menu?.ready(); track('game_loaded', { load_ms: Math.round(performance.now()) }); }).catch((e) => { console.error(e); });

// ---- input
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'Escape' || e.code === 'KeyP') { togglePause(); return; }
  const lane = currentLayout().codes[e.code];
  if (lane !== undefined) { e.preventDefault(); game.tap(lane, (performance.now() - e.timeStamp) / 1000); }
});
hwCanvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  const lane = highway.laneAt(e.clientX);
  if (lane !== null) game.tap(lane, Math.max(0, (performance.now() - e.timeStamp) / 1000));
});
function togglePause() {
  if (game.phase === 'paused') { clearUI(); game.resume(); }
  else if (game.phase === 'playing' || game.phase === 'countin') {
    game.pause();
    track('game_pause', { level_name: game.difficulty, score: game.score });
    showPause(
      () => { clearUI(); track('game_resume', { level_name: game.difficulty }); game.resume(); },
      () => { track('level_quit', { level_name: game.difficulty, score: game.score, max_combo: game.maxCombo }); toMenu(); },
    );
  }
}
document.getElementById('pausebtn')!.addEventListener('click', togglePause);
document.addEventListener('visibilitychange', () => { if (document.hidden && (game.phase === 'playing' || game.phase === 'countin')) togglePause(); });

// ---- loop
let last = performance.now();
let raf = 0;
let closed = false;
function frame(now: number) {
  if (closed) return;
  raf = requestAnimationFrame(frame);
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  game.update();
  const live = game.phase !== 'menu' && game.phase !== 'results';
  let beat: number, energy: number, kick = true;
  if (live) {
    beat = game.beatPos();
    const sec = game.sectionAt(Math.max(0, Math.floor(beat / 4)));
    energy = beat < 0 ? 0.3 : sec.energy;
    kick = beat < 0 || sec.kick;
  } else if (game.phase === 'results') {
    beat = game.ctx.currentTime / game.track.beat; energy = 0.7;
  } else {
    beat = now / 1000 / game.track.beat; energy = 0.5;
  }
  const bar = Math.floor(beat / 4);
  stage.update(dt, {
    beat, bar, energy, kick, combo: game.combo,
    move: live ? game.move(beat) : game.phase === 'results' ? 'freeze' : (['toprock', 'indian', 'sixstep'] as const)[Math.floor(bar / 2) % 3 < 0 ? 0 : Math.floor(bar / 2) % 3],
  });
  stage.render();
  highway.draw(g2, game, dt, W, H, hudTop);
  if (!hud.hidden) {
    scoreEl.textContent = game.score.toLocaleString();
    hypeEl.style.width = `${Math.round(game.hype * 100)}%`;
  }
}
raf = requestAnimationFrame(frame);

// Release audio and GPU resources up front when the tab is closed, so teardown isn't one long freeze.
// A persisted pagehide means the page is going into the back/forward cache and must stay usable.
window.addEventListener('pagehide', (e) => {
  if (e.persisted) return;
  closed = true;
  cancelAnimationFrame(raf);
  game.dispose();
  stage.dispose();
});
(window as unknown as { __bdh: unknown }).__bdh = { stage, game, highway };
