import { DIFFICULTIES, type Difficulty } from '../game/chart';
import type { Game, Result } from '../game/engine';
import { addScore, cleanName, loadScores, rankFor, type ScoreEntry } from '../game/scores';

const root = () => document.getElementById('ui')!;

function el(html: string): HTMLElement {
  const d = document.createElement('div');
  d.className = 'panel';
  d.innerHTML = html;
  return d;
}

export function clearUI() { root().replaceChildren(); }

export function showMenu(game: Game, ready: boolean, onPlay: (d: Difficulty) => void, onScores: (d: Difficulty) => void) {
  clearUI();
  let diff: Difficulty = (localStorage.getItem('bdh.diff') as Difficulty) || 'normal';
  const t = game.track;
  const p = el(`
    <h1>Breakdance<span>Hero</span></h1>
    <div class="track"><b>${t.title}</b>${t.artist} · ${t.bpm} BPM</div>
    <div class="row" id="diffs">${DIFFICULTIES.map((d) => `<button class="btn" data-d="${d}">${d}</button>`).join('')}</div>
    <div class="best" id="best"></div>
    <button class="btn go" id="play" ${ready ? '' : 'disabled'}>${ready ? 'Play' : 'Loading beats…'}</button>
    <button class="btn" id="scores">High scores</button>
    <div class="settings"><button class="btn small" id="tapsnd"></button>
      Timing <button class="btn small" id="offm">−</button><b id="offv"></b><button class="btn small" id="offp">+</button></div>
    <div class="hint">Tap the arrows in the lanes as they hit the line. Keys: ← ↓ ↑ → or A S W D. Headphones recommended. If hits feel late, nudge Timing.</div>
    <a class="coffee" href="https://buy.stripe.com/fZu00b521d4p4gU0UcaAw05" target="_blank" rel="noopener noreferrer">☕ Buy me a coffee · $5</a>
  `);
  const sync = () => {
    p.querySelectorAll<HTMLButtonElement>('#diffs .btn').forEach((b) => b.classList.toggle('on', b.dataset.d === diff));
    p.querySelector('#best')!.textContent = `Best: ${game.best(diff).toLocaleString()}`;
    p.querySelector('#tapsnd')!.textContent = `Tap sound: ${game.tapSound ? 'on' : 'off'}`;
    p.querySelector('#offv')!.textContent = `${Math.round(game.offset * 1000)} ms`;
  };
  p.querySelectorAll<HTMLButtonElement>('#diffs .btn').forEach((b) => b.addEventListener('click', () => {
    diff = b.dataset.d as Difficulty;
    try { localStorage.setItem('bdh.diff', diff); } catch { /* ignore */ }
    sync();
  }));
  p.querySelector('#tapsnd')!.addEventListener('click', () => { game.setTapSound(!game.tapSound); sync(); });
  p.querySelector('#offm')!.addEventListener('click', () => { game.setOffset(game.offset - 0.01); sync(); });
  p.querySelector('#offp')!.addEventListener('click', () => { game.setOffset(game.offset + 0.01); sync(); });
  p.querySelector('#play')!.addEventListener('click', () => onPlay(diff));
  p.querySelector('#scores')!.addEventListener('click', () => onScores(diff));
  root().append(p);
  sync();
  return {
    progress(f: number) {
      const b = p.querySelector<HTMLButtonElement>('#play')!;
      if (b.disabled) b.textContent = `Loading beats ${Math.round(f * 100)}%`;
    },
    ready() {
      const b = p.querySelector<HTMLButtonElement>('#play')!;
      b.disabled = false;
      b.textContent = 'Play';
    },
  };
}

export function showPause(onResume: () => void, onQuit: () => void) {
  clearUI();
  const p = el(`<h2>Paused</h2><div class="row"><button class="btn go" id="r">Resume</button></div><button class="btn" id="q">Quit</button>`);
  p.querySelector('#r')!.addEventListener('click', onResume);
  p.querySelector('#q')!.addEventListener('click', onQuit);
  root().append(p);
}

function tableHTML(list: ScoreEntry[], highlight = -1): string {
  const rows = Array.from({ length: 10 }, (_, i) => {
    const e = list[i];
    return `<li class="${i === highlight ? 'me' : ''}${e ? '' : ' empty'}"><i>${i + 1}</i><b>${e ? e.name : '---'}</b><span>${e ? e.score.toLocaleString() : '—'}</span><em>${e ? e.grade : ''}</em></li>`;
  });
  return `<ol class="scores">${rows.join('')}</ol>`;
}

export function showScores(initial: Difficulty, onBack: () => void) {
  clearUI();
  let diff = initial;
  const p = el(`
    <h2>High Scores</h2>
    <div class="row" id="sd">${DIFFICULTIES.map((d) => `<button class="btn small" data-d="${d}">${d}</button>`).join('')}</div>
    <div id="tbl"></div>
    <button class="btn" id="back">Back</button>
  `);
  const sync = () => {
    p.querySelectorAll<HTMLButtonElement>('#sd .btn').forEach((b) => b.classList.toggle('on', b.dataset.d === diff));
    p.querySelector('#tbl')!.innerHTML = tableHTML(loadScores(diff));
  };
  p.querySelectorAll<HTMLButtonElement>('#sd .btn').forEach((b) => b.addEventListener('click', () => { diff = b.dataset.d as Difficulty; sync(); }));
  p.querySelector('#back')!.addEventListener('click', onBack);
  root().append(p);
  sync();
}

export function showResults(r: Result, onRetry: () => void, onMenu: () => void) {
  clearUI();
  const c = r.counts;
  const rank = rankFor(loadScores(r.difficulty), r.score);
  const p = el(`
    <div class="sub">${r.difficulty} · results</div>
    <div class="grade">${r.grade}</div>
    <h2>${r.score.toLocaleString()}</h2>
    <div class="best">${r.newBest ? '★ NEW BEST ★' : 'Best: ' + r.best.toLocaleString()}</div>
    <div class="stats">
      <span>Accuracy</span><span>${(r.accuracy * 100).toFixed(1)}%</span>
      <span>Max combo</span><span>${r.maxCombo}</span>
      <span>Perfect</span><span>${c.perfect}</span>
      <span>Great</span><span>${c.great}</span>
      <span>Good</span><span>${c.good}</span>
      <span>Miss</span><span>${c.miss}</span>
    </div>
    <div id="hs"></div>
    <div class="row"><button class="btn go" id="again">Again</button><button class="btn" id="menu">Menu</button></div>
  `);
  const hs = p.querySelector('#hs')!;
  const showTable = (list: ScoreEntry[], highlight = -1) => { hs.innerHTML = `<div class="sub">${r.difficulty} · top 10</div>${tableHTML(list, highlight)}`; };
  if (rank === null) {
    showTable(loadScores(r.difficulty));
  } else {
    hs.innerHTML = `<div class="sub">★ Rank #${rank} — enter your initials ★</div>
      <div class="row"><input id="ini" maxlength="3" value="${localStorage.getItem('bdh.name') ?? ''}" placeholder="AAA" autocomplete="off" autocapitalize="characters" spellcheck="false" /><button class="btn small" id="save">Save</button></div>`;
    const input = hs.querySelector<HTMLInputElement>('#ini')!;
    const save = () => {
      const name = cleanName(input.value);
      try { localStorage.setItem('bdh.name', name); } catch { /* ignore */ }
      const list = addScore(r.difficulty, { name, score: r.score, grade: r.grade, accuracy: r.accuracy, maxCombo: r.maxCombo, date: Date.now() });
      showTable(list, rank - 1);
    };
    hs.querySelector('#save')!.addEventListener('click', save);
    input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') save(); });
    setTimeout(() => input.focus(), 50);
  }
  p.querySelector('#again')!.addEventListener('click', onRetry);
  p.querySelector('#menu')!.addEventListener('click', onMenu);
  root().append(p);
}
