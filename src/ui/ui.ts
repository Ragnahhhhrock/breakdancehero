import { DIFFICULTIES, type Difficulty } from '../game/chart';
import type { Game, Result } from '../game/engine';
import { addScore, cleanName, fetchScores, loadScores, rankFor, submitScore, type ScoreEntry } from '../game/scores';
import { track } from '../analytics';
import { currentLayout, nextLayout } from '../game/keys';

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
    <div class="settings"><button class="btn small" id="tapsnd"></button></div>
    <div class="settings"><button class="btn small" id="keysbtn"></button></div>
    <div class="hint">Tap the arrows in the lanes as they hit the line. Keys: <span id="keyhint"></span> Headphones recommended.</div>
    <a class="coffee" href="https://buy.stripe.com/fZu00b521d4p4gU0UcaAw05" target="_blank" rel="noopener noreferrer">☕ Buy me a coffee · $5</a>
    <div class="credit">Another <a href="https://malgordon.com" target="_blank" rel="noopener noreferrer">Mal Gordon</a> creation</div>
  `);
  const sync = () => {
    p.querySelectorAll<HTMLButtonElement>('#diffs .btn').forEach((b) => b.classList.toggle('on', b.dataset.d === diff));
    p.querySelector('#best')!.textContent = `Best: ${game.best(diff).toLocaleString()}`;
    p.querySelector('#keysbtn')!.textContent = `Keys: ${currentLayout().label}`;
    p.querySelector('#keyhint')!.textContent = currentLayout().hint + '.';
    p.querySelector('#tapsnd')!.textContent = `Tap sound: ${game.tapSound ? 'on' : 'off'}`;
  };
  p.querySelectorAll<HTMLButtonElement>('#diffs .btn').forEach((b) => b.addEventListener('click', () => {
    diff = b.dataset.d as Difficulty;
    try { localStorage.setItem('bdh.diff', diff); } catch { /* ignore */ }
    track('difficulty_select', { level_name: diff });
    sync();
  }));
  p.querySelector('#tapsnd')!.addEventListener('click', () => { game.setTapSound(!game.tapSound); track('setting_change', { setting: 'tap_sound', value: game.tapSound ? 'on' : 'off' }); sync(); });
  p.querySelector('#keysbtn')!.addEventListener('click', () => { const l = nextLayout(); track('setting_change', { setting: 'keys', value: l.id }); sync(); });
  p.querySelector('#play')!.addEventListener('click', () => onPlay(diff));
  p.querySelector('#scores')!.addEventListener('click', () => { track('view_high_scores', { level_name: diff }); onScores(diff); });
  p.querySelector('.coffee')!.addEventListener('click', () => track('coffee_click', { location: 'menu' }));
  p.querySelector('.credit a')!.addEventListener('click', () => track('creator_link_click', { location: 'menu' }));
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
    const tbl = p.querySelector('#tbl')!;
    const want = diff;
    tbl.innerHTML = '<div class="sub">Loading…</div>';
    void fetchScores(want).then((list) => {
      if (want !== diff) return; // tab changed while loading
      tbl.innerHTML = list ? `<div class="sub">All players · top 10</div>${tableHTML(list)}` : `<div class="sub">Offline · this device only</div>${tableHTML(loadScores(want))}`;
    });
  };
  p.querySelectorAll<HTMLButtonElement>('#sd .btn').forEach((b) => b.addEventListener('click', () => { diff = b.dataset.d as Difficulty; sync(); }));
  p.querySelector('#back')!.addEventListener('click', onBack);
  root().append(p);
  sync();
}

export function showResults(r: Result, onRetry: () => void, onMenu: () => void) {
  clearUI();
  const c = r.counts;
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
  const showTable = (list: ScoreEntry[], highlight = -1, online = true) => {
    hs.innerHTML = `<div class="sub">${r.difficulty} · ${online ? 'all players · ' : 'offline · '}top 10</div>${tableHTML(list, highlight)}`;
  };
  hs.innerHTML = '<div class="sub">Loading scores…</div>';
  void fetchScores(r.difficulty).then((global) => {
    const online = global !== null;
    const list = global ?? loadScores(r.difficulty);
    const rank = rankFor(list, r.score);
    if (rank === null) { showTable(list, -1, online); return; }
    hs.innerHTML = `<div class="sub">★ Rank #${rank} — enter your initials ★</div>
      <div class="row"><input id="ini" maxlength="3" value="${localStorage.getItem('bdh.name') ?? ''}" placeholder="AAA" autocomplete="off" autocapitalize="characters" spellcheck="false" /><button class="btn small" id="save">Save</button></div>`;
    const input = hs.querySelector<HTMLInputElement>('#ini')!;
    let saving = false;
    const save = async () => {
      if (saving) return;
      saving = true;
      const name = cleanName(input.value);
      try { localStorage.setItem('bdh.name', name); } catch { /* ignore */ }
      const entry = { name, score: r.score, grade: r.grade, accuracy: r.accuracy, maxCombo: r.maxCombo, date: Date.now() };
      const local = addScore(r.difficulty, entry); // keep a personal copy for offline play
      hs.innerHTML = '<div class="sub">Saving…</div>';
      const res = await submitScore(r.difficulty, entry);
      track('high_score_saved', { level_name: r.difficulty, rank, score: r.score, global: !!res });
      if (res) showTable(res.scores, res.rank ? res.rank - 1 : -1, true);
      else showTable(local, rank - 1, false);
    };
    hs.querySelector('#save')!.addEventListener('click', () => void save());
    input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') void save(); });
    setTimeout(() => input.focus(), 50);
  });
  p.querySelector('#again')!.addEventListener('click', () => { track('play_again', { level_name: r.difficulty }); onRetry(); });
  p.querySelector('#menu')!.addEventListener('click', () => { track('results_to_menu', { level_name: r.difficulty }); onMenu(); });
  root().append(p);
}
