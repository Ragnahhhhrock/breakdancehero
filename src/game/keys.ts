/** Keyboard layouts. Arrow keys always work; the layout adds a bigger-key alternative. */
export interface KeyLayout { id: string; label: string; hint: string; codes: Record<string, number> }

const ARROWS: Record<string, number> = { ArrowLeft: 0, ArrowDown: 1, ArrowUp: 2, ArrowRight: 3 };

// lane order: left, down, up, right
export const KEY_LAYOUTS: KeyLayout[] = [
  { id: 'wasd', label: 'Arrows + WASD', hint: '← ↓ ↑ → or A S W D', codes: { ...ARROWS, KeyA: 0, KeyS: 1, KeyW: 2, KeyD: 3 } },
  { id: 'ijkl', label: 'Arrows + J K I L', hint: '← ↓ ↑ → or J K I L', codes: { ...ARROWS, KeyJ: 0, KeyK: 1, KeyI: 2, KeyL: 3 } },
  { id: 'dfjk', label: 'Arrows + D F J K', hint: '← ↓ ↑ → or D F J K', codes: { ...ARROWS, KeyD: 0, KeyF: 1, KeyJ: 2, KeyK: 3 } },
  { id: 'zx', label: 'Arrows + Z X , .', hint: '← ↓ ↑ → or Z X , .', codes: { ...ARROWS, KeyZ: 0, KeyX: 1, Comma: 2, Period: 3 } },
];

const STORE = 'bdh.keys';

export function currentLayout(): KeyLayout {
  let id = '';
  try { id = localStorage.getItem(STORE) ?? ''; } catch { /* ignore */ }
  return KEY_LAYOUTS.find((l) => l.id === id) ?? KEY_LAYOUTS[0];
}

export function nextLayout(): KeyLayout {
  const cur = currentLayout();
  const next = KEY_LAYOUTS[(KEY_LAYOUTS.indexOf(cur) + 1) % KEY_LAYOUTS.length];
  try { localStorage.setItem(STORE, next.id); } catch { /* ignore */ }
  return next;
}
