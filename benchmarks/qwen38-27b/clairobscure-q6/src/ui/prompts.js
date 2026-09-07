/**
 * ui/prompts.js — The real-time reaction prompts: the timing bar, PARRY /
 * DODGE key hints, telegraph labels, combo counter, outcome popups, and the
 * big centered banners (wave start, victory, defeat).
 *
 * Drawn on the HUD canvas (screen space) each frame. The timing bar is the
 * heart of the reactive layer:
 *
 *   [  |  dodge  |  parry  | PERFECT |  parry  |  dodge  |  ]
 *                    ^-- "now" line sweeps left -> right --^
 *
 * The player presses PARRY (Space) when the line crosses the gold PERFECT
 * band, or DODGE (Shift) anywhere in the wider teal band. For GRAB attacks
 * the hint flips to "DODGE — CANNOT PARRY". Feints get a slightly dimmer
 * label as a tell.
 *
 * All positions come from the ReactionSystem's schedule (timeline ms), so
 * the bar is a faithful, readable map of the actual window — what you see
 * is what is judged.
 */
import { PALETTE } from '../engine/textures.js';
import { PERFECT_MS } from '../battle/reaction-system.js';

export class Prompts {
  constructor(ctxGetter) {
    this.getCtx = ctxGetter; // () => 2D ctx of the HUD canvas
    this._result = null;     // { text, sub, color, t, life }
    this._banner = null;     // { text, sub, color, t, life }
    this._aimHint = false;
    this._w = 0;
    this._h = 0;
  }

  setViewport(w, h) {
    this._w = w;
    this._h = h;
  }

  result(text, sub = '', color = '#e9e2cf', life = 0.75) {
    this._result = { text, sub, color, t: 0, life };
  }

  banner(text, sub = '', color = PALETTE.goldBright, life = 2.2) {
    this._banner = { text, sub, color, t: 0, life };
  }

  setAimHint(v) {
    this._aimHint = v;
  }

  /**
   * @param {object} g {
   *   reaction, state, time,
   * }
   */
  update(g) {
    const c = this.getCtx();
    // Viewport is stored as _w/_h (set in setViewport) — not w/h.
    const w = this._w;
    const h = this._h;
    if (!w || !h) return;

    // Result popup
    if (this._result) {
      this._result.t += 1 / 60;
      if (this._result.t >= this._result.life) this._result = null;
    }
    if (this._banner) {
      this._banner.t += 1 / 60;
      if (this._banner.t >= this._banner.life) this._banner = null;
    }

    if (g.state === 'enemy-attack' && g.reaction.active) {
      this._drawReaction(c, g, w, h);
    } else if (g.state === 'aim-mode') {
      this._drawAimHint(c, w, h);
    }

    if (this._result) this._drawResult(c, w, h);
    if (this._banner) this._drawBanner(c, w, h);
  }

  // ------------------------------------------------------------------
  _drawReaction(c, g, w, h) {
    const reaction = g.reaction;
    const hit = reaction.currentHit();
    if (!hit) return;
    const now = g.tl.now();
    const grab = !!hit.grab;
    const feint = !!hit.feint;

    // --- Top label: enemy attack + combo counter ---------------------
    const info = reaction.comboInfo();
    c.save();
    c.textAlign = 'center';
    c.font = '700 20px Georgia, serif';
    c.fillStyle = grab ? '#ff9a6a' : (feint ? 'rgba(200,205,215,0.75)' : '#e9e2cf');
    c.shadowColor = 'rgba(0,0,0,0.8)';
    c.shadowBlur = 8;
    c.fillText(hit.label.toUpperCase(), w / 2, h * 0.16);
    c.shadowBlur = 0;
    if (info && info.total > 1) {
      c.font = '700 14px Georgia, serif';
      c.fillStyle = PALETTE.goldBright;
      c.fillText(`HIT ${info.index + 1} / ${info.total}`, w / 2, h * 0.16 + 22);
    }
    c.restore();

    // --- Wind-up progress (thin bar under the label) ------------------
    const phase = Math.max(0, Math.min(1, (now - hit.start) / hit.windup));
    c.save();
    const bw = 220;
    const bx = w / 2 - bw / 2;
    const by = h * 0.16 + 34;
    c.fillStyle = 'rgba(10,12,16,0.6)';
    c.fillRect(bx, by, bw, 4);
    c.fillStyle = grab ? '#ff7a4a' : (feint ? 'rgba(160,170,180,0.7)' : '#c9a24b');
    c.fillRect(bx, by, bw * phase, 4);
    c.restore();

    // --- Timing bar (appears in the last 55% of the wind-up) ----------
    const showBar = phase > 0.45;
    if (showBar) {
      this._drawTimingBar(c, g, hit, w, h, grab);
    }

    // --- Key hint ------------------------------------------------------
    c.save();
    c.textAlign = 'center';
    c.font = '700 26px Georgia, serif';
    const hintY = h * 0.44;
    if (grab) {
      this._hint(c, w / 2 - 120, hintY, 'SHIFT / RMB', 'DODGE', '#ff9a6a', now, grab);
      this._hint(c, w / 2 + 120, hintY, 'PARRY FAILS', 'CANNOT PARRY', 'rgba(120,80,70,0.8)', now, false);
    } else {
      this._hint(c, w / 2 - 120, hintY, 'SPACE / J / LMB', 'PARRY', '#ffe9a8', now, false);
      this._hint(c, w / 2 + 120, hintY, 'SHIFT / L / RMB', 'DODGE', '#9fd8cf', now, false);
    }
    c.restore();
  }

  _hint(c, x, y, key, word, color, now, off) {
    const pulse = 0.75 + Math.sin(now * 0.012) * 0.25;
    c.save();
    c.globalAlpha = off ? 0.5 : pulse;
    c.font = '700 13px Georgia, serif';
    c.fillStyle = 'rgba(233,226,207,0.7)';
    c.fillText(key, x, y - 12);
    c.font = '700 30px Georgia, serif';
    c.fillStyle = color;
    if (!off) {
      c.shadowColor = color;
      c.shadowBlur = 14 * pulse;
    }
    c.fillText(word, x, y + 18);
    c.restore();
  }

  _drawTimingBar(c, g, hit, w, h, grab) {
    const now = g.tl.now();
    // Map a window of time to the bar. Show from 260ms before the parry
    // window opens until 120ms after the parry window closes, so the sweep
    // is comfortably watchable but the bands keep true proportions.
    const spanStart = hit.window.start - 260;
    const spanEnd = hit.window.end + 120;
    const span = spanEnd - spanStart;
    const barW = Math.min(560, w * 0.5);
    const barH = 16;
    const x0 = w / 2 - barW / 2;
    const y = h * 0.52;

    const t = (ms) => x0 + ((ms - spanStart) / span) * barW;

    c.save();
    // Track
    c.fillStyle = 'rgba(10,12,16,0.75)';
    this._rr(c, x0 - 6, y - barH / 2 - 5, barW + 12, barH + 10, 8);
    c.fill();
    c.strokeStyle = 'rgba(201,162,75,0.4)';
    c.lineWidth = 1;
    this._rr(c, x0 - 6, y - barH / 2 - 5, barW + 12, barH + 10, 8);
    c.stroke();

    // Dodge band (wider, teal, dim)
    const dodgeStart = t(hit.dodgeWindow.start);
    const dodgeEnd = t(hit.dodgeWindow.end);
    c.fillStyle = 'rgba(127,216,207,0.28)';
    c.fillRect(dodgeStart, y - barH / 2, dodgeEnd - dodgeStart, barH);

    // Parry band (white-teal)
    const pStart = t(hit.window.start);
    const pEnd = t(hit.window.end);
    c.fillStyle = 'rgba(159,216,207,0.5)';
    c.fillRect(pStart, y - barH / 2, pEnd - pStart, barH);

    // Perfect band (gold) — only for parry-able hits
    if (!grab) {
      const fStart = t(hit.center - PERFECT_MS);
      const fEnd = t(hit.center + PERFECT_MS);
      c.fillStyle = '#ffe9a8';
      c.fillRect(fStart, y - barH / 2, fEnd - fStart, barH);
      c.shadowColor = '#ffe9a8';
      c.shadowBlur = 10;
      c.fillRect(fStart, y - barH / 2, fEnd - fStart, barH);
      c.shadowBlur = 0;
    }

    // Center tick (the exact hit frame)
    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.fillRect(t(hit.center) - 1, y - barH / 2 - 4, 2, barH + 8);

    // The "now" line (the sweep)
    const nx = t(Math.max(spanStart, Math.min(spanEnd, now)));
    if (now >= spanStart && now <= spanEnd) {
      const inWin = now >= hit.window.start && now <= hit.window.end;
      c.fillStyle = inWin ? '#ffffff' : 'rgba(233,226,207,0.9)';
      c.shadowColor = inWin ? '#ffffff' : 'rgba(0,0,0,0.6)';
      c.shadowBlur = inWin ? 12 : 0;
      c.fillRect(nx - 2, y - barH / 2 - 8, 4, barH + 16);
      c.shadowBlur = 0;
    }

    // Edge labels
    c.font = '700 10px Georgia, serif';
    c.textAlign = 'center';
    c.fillStyle = 'rgba(159,216,207,0.8)';
    c.fillText('DODGE', (dodgeStart + pStart) / 2, y + barH / 2 + 16);
    c.fillText('DODGE', (pEnd + dodgeEnd) / 2, y + barH / 2 + 16);
    if (!grab) {
      c.fillStyle = '#ffe9a8';
      c.fillText('PERFECT PARRY', t(hit.center), y - barH / 2 - 12);
    } else {
      c.fillStyle = '#ff9a6a';
      c.fillText('DODGE OR BE GRABBED', t(hit.center), y - barH / 2 - 12);
    }
    c.restore();
  }

  _drawAimHint(c, w, h) {
    c.save();
    c.textAlign = 'center';
    const pulse = 0.7 + Math.sin(performance.now() * 0.005) * 0.3;
    c.globalAlpha = pulse;
    c.font = '700 18px Georgia, serif';
    c.fillStyle = '#ffe9a8';
    c.shadowColor = '#ffe9a8';
    c.shadowBlur = 10;
    c.fillText('AIM — move to a glowing weak point, click to lock, Space to fire', w / 2, h * 0.88);
    c.restore();
  }

  _drawResult(c, w, h) {
    const r = this._result;
    const pr = r.t / r.life;
    const pop = pr < 0.2 ? easeOutBackLocal(pr / 0.2) : 1;
    const alpha = pr > 0.6 ? 1 - (pr - 0.6) / 0.4 : 1;
    c.save();
    c.globalAlpha = alpha;
    c.textAlign = 'center';
    c.font = `700 ${Math.round(44 * pop)}px Georgia, serif`;
    c.fillStyle = r.color;
    c.shadowColor = 'rgba(0,0,0,0.9)';
    c.shadowBlur = 16;
    c.fillText(r.text, w / 2, h * 0.4);
    if (r.sub) {
      c.font = `700 ${Math.round(16 * pop)}px Georgia, serif`;
      c.fillStyle = 'rgba(233,226,207,0.85)';
      c.fillText(r.sub, w / 2, h * 0.4 + 30);
    }
    c.restore();
  }

  _drawBanner(c, w, h) {
    const b = this._banner;
    const pr = b.t / b.life;
    const inPr = Math.min(1, b.t / 0.4);
    const outPr = pr > 0.8 ? (pr - 0.8) / 0.2 : 0;
    const scale = easeOutBackLocal(inPr) * (1 - outPr * 0.05);
    const alpha = Math.min(1, inPr * 1.5) * (1 - outPr);
    c.save();
    c.globalAlpha = alpha * 0.9;
    c.fillStyle = 'rgba(6,8,12,0.55)';
    c.fillRect(0, h * 0.3, w, h * 0.32);
    // gilded rules
    c.strokeStyle = 'rgba(201,162,75,0.6)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(w * 0.2, h * 0.32);
    c.lineTo(w * 0.8, h * 0.32);
    c.moveTo(w * 0.2, h * 0.6);
    c.lineTo(w * 0.8, h * 0.6);
    c.stroke();
    c.globalAlpha = alpha;
    c.textAlign = 'center';
    c.font = `700 ${Math.round(52 * scale)}px Georgia, serif`;
    c.fillStyle = b.color;
    c.shadowColor = 'rgba(0,0,0,0.9)';
    c.shadowBlur = 20;
    c.fillText(b.text, w / 2, h * 0.46);
    if (b.sub) {
      c.font = `400 ${Math.round(17 * scale)}px Georgia, serif`;
      c.fillStyle = 'rgba(233,226,207,0.9)';
      c.shadowBlur = 8;
      c.fillText(b.sub, w / 2, h * 0.52);
    }
    c.restore();
  }

  _rr(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
}

function easeOutBackLocal(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
