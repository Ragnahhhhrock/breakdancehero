/** 2D overlay: the scrolling arrow highway, receptors, hit bursts and judgement text. */
import type { Game, Grade } from './engine';

export const LANE_HEX = ['#ff2d95', '#17e1ff', '#b6ff3d', '#ffb02e'];
const ROT = [-Math.PI / 2, Math.PI, 0, Math.PI / 2]; // left, down, up, right

export interface Rect { x: number; y: number; w: number; h: number }

interface Burst { lane: number; t0: number; grade: Grade }

export class Highway {
  rect: Rect = { x: 0, y: 0, w: 1, h: 1 };
  judgeY = 0;
  topY = 0;
  private press = [0, 0, 0, 0];
  private bursts: Burst[] = [];
  private judge: { text: string; color: string; t0: number } | null = null;
  private shake = 0;
  private comboPop = 0;
  private banner: { text: string; t0: number } | null = null;

  layout(r: Rect) {
    this.rect = r;
    this.judgeY = r.y + r.h * 0.84;
    this.topY = r.y - 40;
  }

  laneAt(px: number): number | null {
    const { x, w } = this.rect;
    if (px < x || px > x + w) return null;
    return Math.min(3, Math.floor(((px - x) / w) * 4));
  }

  hit(lane: number, grade: Grade, delta: number) {
    this.press[lane] = 1;
    this.bursts.push({ lane, t0: performance.now(), grade });
    if (this.bursts.length > 12) this.bursts.shift();
    const label = grade === 'perfect' ? 'PERFECT' : grade === 'great' ? 'GREAT' : 'GOOD';
    const color = grade === 'perfect' ? '#fff35c' : grade === 'great' ? '#7dff9c' : '#8fd8ff';
    this.judge = { text: label + (grade !== 'perfect' ? (delta < 0 ? '  EARLY' : '  LATE') : ''), color, t0: performance.now() };
    this.comboPop = 1;
  }

  miss() {
    this.judge = { text: 'MISS', color: '#ff4a6e', t0: performance.now() };
    this.shake = 1;
  }

  stray(lane: number) { this.press[lane] = Math.max(this.press[lane], 0.6); }

  announce(text: string) { this.banner = { text, t0: performance.now() }; }

  draw(g: CanvasRenderingContext2D, game: Game, dt: number, W: number, H: number, hudTop: number) {
    g.clearRect(0, 0, W, H);
    const { x, y, w, h } = this.rect;
    const laneW = w / 4;
    const pos = game.songPos();
    const live = game.phase === 'playing' || game.phase === 'countin' || game.phase === 'paused';
    this.shake *= Math.exp(-dt * 9);
    this.comboPop *= Math.exp(-dt * 10);
    for (let i = 0; i < 4; i++) this.press[i] *= Math.exp(-dt * 12);

    if (!live) return;

    g.save();
    if (this.shake > 0.02) g.translate((Math.random() - 0.5) * 6 * this.shake, 0);

    // panel
    const bg = g.createLinearGradient(0, y, 0, y + h);
    bg.addColorStop(0, 'rgba(6,3,20,0.15)');
    bg.addColorStop(0.35, 'rgba(6,3,20,0.62)');
    bg.addColorStop(1, 'rgba(6,3,20,0.82)');
    g.fillStyle = bg;
    g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(255,255,255,0.1)';
    for (let i = 0; i <= 4; i++) g.fillRect(x + i * laneW - 1, y, 2, h);
    g.fillStyle = 'rgba(23,225,255,0.55)';
    g.fillRect(x - 2, y, 3, h);
    g.fillRect(x + w - 1, y, 3, h);

    const span = this.judgeY - this.topY;
    const approach = game.approach;
    const yOf = (t: number) => this.judgeY - ((t - pos) / approach) * span;

    // beat lines
    const beat = game.track.beat;
    const b0 = Math.floor(pos / beat);
    for (let b = b0; b < b0 + Math.ceil(approach / beat) + 2; b++) {
      const yy = yOf(b * beat);
      if (yy < y || yy > this.judgeY + 30) continue;
      g.fillStyle = b % 4 === 0 ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.07)';
      g.fillRect(x, yy, w, b % 4 === 0 ? 2 : 1);
    }

    // receptors
    const size = Math.min(laneW * 0.78, 66);
    for (let i = 0; i < 4; i++) {
      const cx = x + laneW * (i + 0.5);
      this.arrow(g, cx, this.judgeY, size, ROT[i], LANE_HEX[i], false, this.press[i]);
    }

    // arrows
    for (let i = game.notes.length - 1; i >= 0; i--) {
      const n = game.notes[i];
      if (n.state === 1) continue;
      const yy = yOf(n.t);
      if (yy < y - size) continue;
      if (yy > this.judgeY + size * 1.6) continue;
      const cx = x + laneW * (n.lane + 0.5);
      g.globalAlpha = n.state === 2 ? 0.28 : 1;
      this.arrow(g, cx, yy, size, ROT[n.lane], LANE_HEX[n.lane], true, 0);
      g.globalAlpha = 1;
    }

    // bursts
    const now = performance.now();
    this.bursts = this.bursts.filter((b) => now - b.t0 < 380);
    for (const b of this.bursts) {
      const k = (now - b.t0) / 380;
      const cx = x + laneW * (b.lane + 0.5);
      g.strokeStyle = LANE_HEX[b.lane];
      g.globalAlpha = 1 - k;
      g.lineWidth = 4 * (1 - k) + 1;
      g.beginPath();
      g.arc(cx, this.judgeY, size * (0.5 + k * 0.9), 0, Math.PI * 2);
      g.stroke();
      if (b.grade === 'perfect') {
        g.fillStyle = '#fff';
        for (let s = 0; s < 6; s++) {
          const a = s * 1.05 + b.t0 * 0.01;
          g.fillRect(cx + Math.cos(a) * size * (0.4 + k) - 2, this.judgeY + Math.sin(a) * size * (0.4 + k) - 2, 4, 4);
        }
      }
      g.globalAlpha = 1;
    }
    g.restore();

    // judgement + combo (centred over the highway, above the receptors)
    const midX = x + w / 2;
    if (this.judge) {
      const age = (now - this.judge.t0) / 1000;
      if (age < 0.6) {
        const a = age < 0.4 ? 1 : 1 - (age - 0.4) / 0.2;
        const sc = 1 + 0.25 * Math.max(0, 1 - age * 8);
        g.save();
        g.globalAlpha = a;
        g.translate(midX, this.judgeY - size * 1.55);
        g.scale(sc, sc);
        g.font = `${Math.round(Math.min(30, w * 0.075))}px Bungee, Impact, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.lineWidth = 6;
        g.strokeStyle = 'rgba(10,4,30,0.9)';
        g.strokeText(this.judge.text, 0, 0);
        g.fillStyle = this.judge.color;
        g.fillText(this.judge.text, 0, 0);
        g.restore();
      }
    }
    if (game.combo >= 2) {
      g.save();
      g.translate(midX, y + h * 0.42);
      const sc = 1 + this.comboPop * 0.18;
      g.scale(sc, sc);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.globalAlpha = 0.9;
      g.font = `${Math.round(Math.min(64, w * 0.16))}px Bungee, Impact, sans-serif`;
      g.lineWidth = 8;
      g.strokeStyle = 'rgba(10,4,30,0.85)';
      g.strokeText(String(game.combo), 0, 0);
      g.fillStyle = '#ffffff';
      g.fillText(String(game.combo), 0, 0);
      g.font = `${Math.round(Math.min(18, w * 0.045))}px Chakra Petch, sans-serif`;
      g.fillStyle = '#17e1ff';
      g.fillText('COMBO', 0, Math.min(44, w * 0.11));
      g.restore();
    }

    // count-in numbers and banners
    if (game.phase === 'countin') {
      const left = -pos / beat; // beats until the downbeat
      const n = Math.ceil(left);
      if (n >= 1 && n <= 4) {
        const f = n - left;
        g.save();
        g.globalAlpha = 0.95 - 0.5 * Math.min(1, f);
        g.translate(W / 2, hudTop + (H - hudTop) * 0.3);
        g.font = `${Math.round(Math.min(W, H) * 0.22)}px Bungee, Impact, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.lineWidth = 10;
        g.strokeStyle = 'rgba(10,4,30,0.85)';
        g.strokeText(String(n), 0, 0);
        g.fillStyle = '#ffe14d';
        g.fillText(String(n), 0, 0);
        g.restore();
      }
    }
    if (this.banner) {
      const age = (now - this.banner.t0) / 1000;
      if (age < 1.8) {
        const a = age < 1.3 ? 1 : 1 - (age - 1.3) / 0.5;
        g.save();
        g.globalAlpha = a;
        g.translate(W / 2, hudTop + (H - hudTop) * 0.2);
        g.font = `${Math.round(Math.min(W * 0.1, 56))}px Bungee, Impact, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.lineWidth = 8;
        g.strokeStyle = 'rgba(10,4,30,0.9)';
        g.strokeText(this.banner.text, 0, 0);
        g.fillStyle = '#ff2d95';
        g.fillText(this.banner.text, 0, 0);
        g.restore();
      }
    }
  }

  private arrow(g: CanvasRenderingContext2D, cx: number, cy: number, size: number, rot: number, color: string, filled: boolean, flash: number) {
    g.save();
    g.translate(cx, cy);
    g.rotate(rot);
    const s = size / 2;
    g.beginPath();
    g.moveTo(0, -s);
    g.lineTo(s, 0.05 * s);
    g.lineTo(s * 0.42, 0.05 * s);
    g.lineTo(s * 0.42, s * 0.85);
    g.lineTo(-s * 0.42, s * 0.85);
    g.lineTo(-s * 0.42, 0.05 * s);
    g.lineTo(-s, 0.05 * s);
    g.closePath();
    if (filled) {
      g.shadowColor = color;
      g.shadowBlur = 14;
      g.fillStyle = color;
      g.fill();
      g.shadowBlur = 0;
      g.lineWidth = 3;
      g.strokeStyle = '#fff';
      g.stroke();
    } else {
      g.fillStyle = `rgba(255,255,255,${0.06 + flash * 0.7})`;
      g.fill();
      g.lineWidth = 3 + flash * 3;
      g.strokeStyle = color;
      g.shadowColor = color;
      g.shadowBlur = 6 + flash * 18;
      g.stroke();
    }
    g.restore();
  }
}
