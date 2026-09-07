/**
 * ui/hud.js — The always-on battle HUD, drawn on a 2D canvas overlay each
 * frame:
 *
 *   top-left    turn queue (upcoming actors, current highlighted)
 *   top-center  wave indicator
 *   top-right   enemy cards: name, HP, stagger meter, boss phase pips
 *   bottom-left party cards: portrait, name/level, HP bar, AP pips, statuses
 *   bottom-right Lumina (ultimate) gauge + flow (parry-streak) diamonds
 *
 * Portraits are pre-rendered to offscreen canvases (textures.makePortraitCanvas)
 * so the per-frame cost is just drawImage. All layout is in CSS pixels; the
 * canvas is DPR-scaled. No DOM — one canvas, redrawn whole each frame.
 */
import { PALETTE, makePortraitCanvas } from '../engine/textures.js';
import { STATUS_DEFS, ULT_MAX } from '../battle/action-resolver.js';

const STATUS_GLYPH = {
  burn: { color: '#e07a35', draw: (c, x, y, s) => flame(c, x, y, s, '#e07a35') },
  poison: { color: '#6fce6f', draw: (c, x, y, s) => drop(c, x, y, s, '#6fce6f') },
  stun: { color: '#ffd76a', draw: (c, x, y, s) => star(c, x, y, s, '#ffd76a') },
  marked: { color: '#d84a3a', draw: (c, x, y, s) => cross(c, x, y, s, '#d84a3a') },
  atkUp: { color: '#8fe3a8', draw: (c, x, y, s) => arrow(c, x, y, s, '#8fe3a8', -1) },
  atkDown: { color: '#d84a3a', draw: (c, x, y, s) => arrow(c, x, y, s, '#d84a3a', 1) },
  defUp: { color: '#7fb4d8', draw: (c, x, y, s) => shield(c, x, y, s, '#7fb4d8') },
  defDown: { color: '#d84a3a', draw: (c, x, y, s) => shield(c, x, y, s, '#d84a3a', true) },
  shield: { color: '#9fd8cf', draw: (c, x, y, s) => barrier(c, x, y, s) },
  focus: { color: '#c9a24b', draw: (c, x, y, s) => eyeGlyph(c, x, y, s, '#c9a24b') },
};

// --- tiny glyph drawers ----------------------------------------------------
function flame(c, x, y, s, col) {
  c.fillStyle = col;
  c.beginPath();
  c.moveTo(x, y - s);
  c.quadraticCurveTo(x + s * 0.8, y - s * 0.2, x + s * 0.4, y + s * 0.6);
  c.quadraticCurveTo(x + s * 0.2, y + s * 0.9, x, y + s * 0.9);
  c.quadraticCurveTo(x - s * 0.5, y + s * 0.9, x - s * 0.5, y + s * 0.2);
  c.quadraticCurveTo(x - s * 0.5, y - s * 0.4, x, y - s);
  c.fill();
}
function drop(c, x, y, s, col) {
  c.fillStyle = col;
  c.beginPath();
  c.moveTo(x, y - s);
  c.quadraticCurveTo(x + s * 0.8, y + s * 0.4, x, y + s * 0.8);
  c.quadraticCurveTo(x - s * 0.8, y + s * 0.4, x, y - s);
  c.fill();
}
function star(c, x, y, s, col) {
  c.fillStyle = col;
  c.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    const a2 = a + Math.PI / 5;
    c.lineTo(x + Math.cos(a) * s, y + Math.sin(a) * s);
    c.lineTo(x + Math.cos(a2) * s * 0.45, y + Math.sin(a2) * s * 0.45);
  }
  c.closePath();
  c.fill();
}
function cross(c, x, y, s, col) {
  c.strokeStyle = col;
  c.lineWidth = s * 0.5;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(x - s * 0.7, y - s * 0.7);
  c.lineTo(x + s * 0.7, y + s * 0.7);
  c.moveTo(x + s * 0.7, y - s * 0.7);
  c.lineTo(x - s * 0.7, y + s * 0.7);
  c.stroke();
}
function arrow(c, x, y, s, col, dir) {
  c.fillStyle = col;
  c.beginPath();
  if (dir < 0) {
    c.moveTo(x, y - s); c.lineTo(x + s * 0.7, y + s * 0.2); c.lineTo(x - s * 0.7, y + s * 0.2);
  } else {
    c.moveTo(x, y + s); c.lineTo(x + s * 0.7, y - s * 0.2); c.lineTo(x - s * 0.7, y - s * 0.2);
  }
  c.closePath();
  c.fill();
}
function shield(c, x, y, s, col, cracked = false) {
  c.fillStyle = col;
  c.beginPath();
  c.moveTo(x, y - s);
  c.lineTo(x + s * 0.8, y - s * 0.5);
  c.lineTo(x + s * 0.7, y + s * 0.4);
  c.lineTo(x, y + s);
  c.lineTo(x - s * 0.7, y + s * 0.4);
  c.lineTo(x - s * 0.8, y - s * 0.5);
  c.closePath();
  c.fill();
  if (cracked) {
    c.strokeStyle = 'rgba(10,12,16,0.9)';
    c.lineWidth = s * 0.22;
    c.beginPath();
    c.moveTo(x, y - s * 0.7);
    c.lineTo(x + s * 0.3, y);
    c.lineTo(x - s * 0.2, y + s * 0.7);
    c.stroke();
  }
}
function barrier(c, x, y, s) {
  c.strokeStyle = '#9fd8cf';
  c.lineWidth = s * 0.3;
  for (let i = -1; i <= 1; i++) {
    c.beginPath();
    c.arc(x, y, s * (0.4 + i * 0.32), -Math.PI * 0.4, Math.PI * 0.4);
    c.stroke();
  }
}
function eyeGlyph(c, x, y, s, col) {
  c.strokeStyle = col;
  c.lineWidth = s * 0.25;
  c.beginPath();
  c.ellipse(x, y, s, s * 0.55, 0, 0, Math.PI * 2);
  c.stroke();
  c.fillStyle = col;
  c.beginPath();
  c.arc(x, y, s * 0.28, 0, Math.PI * 2);
  c.fill();
}

// ---------------------------------------------------------------------------

export class Hud {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this._portraits = new Map();
    this._w = 0;
    this._h = 0;
    this._resize();
    this._onResize = () => this._resize();
    window.addEventListener('resize', this._onResize);
  }

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = this.w * dpr;
    this.canvas.height = this.h * dpr;
    this.canvas.style.width = this.w + 'px';
    this.canvas.style.height = this.h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  portraitOf(c) {
    if (!this._portraits.has(c)) {
      const look = c.look || c.data && c.data.look || {};
      this._portraits.set(c, makePortraitCanvas({
        ...look,
        seed: look.seed || 1,
        mood: look.mood || (c.isEnemy ? 'fierce' : 'calm'),
        backdrop: look.backdrop || (c.isEnemy ? '#3a1c22' : '#20444a'),
        backdropDeep: look.backdropDeep || '#0e2126',
      }));
    }
    return this._portraits.get(c);
  }

  clearPortraits() {
    this._portraits.clear();
  }

  // The combat HUD is only drawn during battle. Outside it (intro / overworld /
  // ending) hide the canvas and clear it so no frozen combat UI lingers.
  setVisible(v) {
    if (!this.canvas) return;
    this.canvas.style.display = v ? '' : 'none';
    if (!v) this.ctx.clearRect(0, 0, this.w, this.h);
  }

  /**
   * @param {object} s {
   *   party, enemies, queue:{current, upcoming()}, actor,
   *   ultimate:{amount,max,ready}, flow:{amount,max},
   *   wave:{index,total}, seed, time (sec), lowHp:0..1,
   *   activeEnemyId (for boss bar highlight)
   * }
   */
  update(s) {
    const c = this.ctx;
    const { w, h } = this;
    c.clearRect(0, 0, w, h);

    this._turnQueue(c, s);
    this._wave(c, s);
    this._enemies(c, s);
    this._party(c, s);
    this._gauges(c, s);

    // seed watermark
    c.save();
    c.globalAlpha = 0.4;
    c.fillStyle = PALETTE.gold;
    c.font = '11px Georgia, serif';
    c.textAlign = 'left';
    c.fillText(`seed ${s.seed}`, 14, h - 12);
    c.restore();
  }

  // --- turn queue (top-left) ----------------------------------------------
  _turnQueue(c, s) {
    const { queue, actor } = s;
    if (!queue || !queue.current) return;
    const list = [queue.current, ...queue.upcoming(4)];
    let x = 18;
    const y = 18;
    const r = 17;
    c.save();
    c.font = '700 11px Georgia, serif';
    c.fillStyle = 'rgba(233,226,207,0.75)';
    c.textAlign = 'left';
    c.fillText('TURN', x, y - 4);
    c.restore();
    list.forEach((a, i) => {
      const px = x + i * (r * 2 + 10);
      const isCur = i === 0;
      const portrait = this.portraitOf(a);
      // chip bg
      c.save();
      c.beginPath();
      c.arc(px + r, y + r + 12, r + (isCur ? 3 : 0), 0, Math.PI * 2);
      c.fillStyle = a.hp <= 0 ? 'rgba(20,22,28,0.8)' : 'rgba(14,20,26,0.85)';
      c.fill();
      c.clip();
      c.drawImage(portrait, px + (isCur ? -3 : 0), y + 12 + (isCur ? -3 : 0), (r * 2 + (isCur ? 6 : 0)), (r * 2 + (isCur ? 6 : 0)));
      c.restore();
      // ring
      c.save();
      c.beginPath();
      c.arc(px + r, y + r + 12, r + (isCur ? 3 : 0), 0, Math.PI * 2);
      c.lineWidth = isCur ? 3 : 2;
      c.strokeStyle = a.isParty ? (isCur ? PALETTE.goldBright : PALETTE.teal) : (isCur ? '#ff8a5a' : '#8a4a4a');
      if (isCur) {
        c.shadowColor = PALETTE.goldBright;
        c.shadowBlur = 10;
      }
      c.stroke();
      c.restore();
      // name
      c.save();
      c.font = `${isCur ? '700' : '400'} 11px Georgia, serif`;
      c.fillStyle = isCur ? PALETTE.goldBright : 'rgba(233,226,207,0.6)';
      c.textAlign = 'center';
      c.fillText(a.name.split(' ')[0].slice(0, 8), px + r, y + r * 2 + 28);
      c.restore();
    });
  }

  // --- wave (top-center) ----------------------------------------------------
  _wave(c, s) {
    if (!s.wave) return;
    const { w } = this;
    c.save();
    c.textAlign = 'center';
    c.font = '700 13px Georgia, serif';
    c.fillStyle = 'rgba(201,162,75,0.8)';
    c.fillText(`— WAVE ${s.wave.index} / ${s.wave.total} —`, w / 2, 26);
    c.restore();
  }

  // --- enemies (top-right, stacked) ----------------------------------------
  _enemies(c, s) {
    const { w } = this;
    let y = 18;
    const cw = 236;
    const x0 = w - cw - 18;
    for (const e of s.enemies) {
      if (e.hp <= 0 && e.dead) { y += 54; continue; }
      const h = 46;
      c.save();
      // panel
      c.fillStyle = 'rgba(20,12,14,0.8)';
      this._roundRect(c, x0, y, cw, h, 6);
      c.fill();
      c.strokeStyle = e.boss ? 'rgba(216,106,58,0.7)' : 'rgba(138,74,74,0.6)';
      c.lineWidth = 1.5;
      this._roundRect(c, x0, y, cw, h, 6);
      c.stroke();
      // name
      c.font = '700 13px Georgia, serif';
      c.textAlign = 'left';
      c.fillStyle = e.boss ? '#ff9a6a' : '#d8a09a';
      c.fillText(e.name, x0 + 10, y + 16);
      if (e.boss) {
        c.font = '700 10px Georgia, serif';
        c.fillStyle = PALETTE.goldBright;
        c.fillText(`PHASE ${e.phase || 1}`, x0 + 10 + c.measureText(e.name).width + 8, y + 16);
      }
      // HP bar
      const bx = x0 + 10, by = y + 22, bw = cw - 20, bh = 8;
      c.fillStyle = 'rgba(10,8,10,0.9)';
      this._roundRect(c, bx, by, bw, bh, 4);
      c.fill();
      const frac = Math.max(0, e.hp / e.maxHp);
      if (frac > 0) {
        const g = c.createLinearGradient(bx, 0, bx + bw, 0);
        g.addColorStop(0, '#7c2d3a');
        g.addColorStop(1, '#c05a4a');
        c.fillStyle = g;
        this._roundRect(c, bx, by, bw * frac, bh, 4);
        c.fill();
      }
      c.font = '10px Georgia, serif';
      c.fillStyle = 'rgba(233,226,207,0.7)';
      c.textAlign = 'right';
      c.fillText(`${Math.ceil(e.hp)} / ${e.maxHp}`, x0 + cw - 10, by + 7);
      // Stagger meter
      if (e.staggerMax) {
        const sy = by + 11;
        c.fillStyle = 'rgba(10,8,10,0.9)';
        c.fillRect(bx, sy, bw, 4);
        const sf = e.stagger / e.staggerMax;
        c.fillStyle = e.staggered ? '#fff2c4' : PALETTE.gold;
        c.fillRect(bx, sy, bw * sf, 4);
        if (e.staggered) {
          c.font = '700 10px Georgia, serif';
          c.fillStyle = '#fff2c4';
          c.textAlign = 'right';
          c.fillText('STAGGERED', x0 + cw - 10, sy + 16);
        }
      }
      c.restore();
      y += h + 8;
    }
  }

  // --- party (bottom-left, side by side) ------------------------------------
  _party(c, s) {
    const cardW = 168;
    const cardH = 74;
    const gap = 10;
    const x0 = 18;
    const y0 = this.h - cardH - 16;
    s.party.forEach((p, i) => {
      const x = x0 + i * (cardW + gap);
      const y = y0;
      const dead = p.hp <= 0;
      const isActor = s.actor === p;
      c.save();
      // panel
      c.fillStyle = dead ? 'rgba(14,14,16,0.8)' : 'rgba(12,20,22,0.85)';
      this._roundRect(c, x, y, cardW, cardH, 7);
      c.fill();
      c.lineWidth = isActor ? 2.5 : 1.5;
      c.strokeStyle = isActor ? PALETTE.goldBright : 'rgba(201,162,75,0.35)';
      if (isActor) {
        c.shadowColor = PALETTE.goldBright;
        c.shadowBlur = 12;
      }
      this._roundRect(c, x, y, cardW, cardH, 7);
      c.stroke();
      c.shadowBlur = 0;
      // portrait
      const portrait = this.portraitOf(p);
      const ps = 52;
      c.save();
      c.beginPath();
      this._roundRect(c, x + 6, y + 8, ps, ps, 5);
      c.clip();
      c.globalAlpha = dead ? 0.35 : 1;
      c.drawImage(portrait, x + 6, y + 8, ps, ps);
      c.restore();
      // name + level
      c.font = '700 13px Georgia, serif';
      c.textAlign = 'left';
      c.fillStyle = dead ? 'rgba(233,226,207,0.35)' : '#e9e2cf';
      c.fillText(p.name, x + 66, y + 22);
      c.font = '10px Georgia, serif';
      c.fillStyle = 'rgba(201,162,75,0.8)';
      c.fillText(`Lv ${p.level} · ${p.row === 'front' ? 'Front' : 'Back'}`, x + 66, y + 35);
      // HP bar
      const bx = x + 66, by = y + 41, bw = cardW - 74, bh = 9;
      c.fillStyle = 'rgba(8,10,12,0.9)';
      this._roundRect(c, bx, by, bw, bh, 4);
      c.fill();
      const frac = Math.max(0, p.hp / p.maxHp);
      if (frac > 0) {
        const low = frac < 0.3;
        const g = c.createLinearGradient(bx, 0, bx + bw, 0);
        if (low) {
          g.addColorStop(0, '#a33243');
          g.addColorStop(1, '#d86a5a');
        } else {
          g.addColorStop(0, '#2e6f6c');
          g.addColorStop(1, '#5fb3a0');
        }
        c.fillStyle = g;
        this._roundRect(c, bx, by, Math.max(2, bw * frac), bh, 4);
        c.fill();
      }
      c.font = '10px Georgia, serif';
      c.fillStyle = 'rgba(233,226,207,0.75)';
      c.textAlign = 'right';
      c.fillText(`${Math.ceil(p.hp)}`, x + cardW - 8, by + 8);
      // Shield bar (thin, above HP)
      if (p.shield > 0) {
        c.fillStyle = '#9fd8cf';
        c.fillRect(bx, by - 4, bw * Math.min(1, p.shield / p.maxHp), 3);
      }
      // AP pips
      const apY = y + 58;
      c.font = '700 10px Georgia, serif';
      c.fillStyle = 'rgba(201,162,75,0.9)';
      c.textAlign = 'left';
      c.fillText('AP', bx, apY + 8);
      for (let k = 0; k < p.maxAp; k++) {
        const px = bx + 22 + k * 13;
        c.save();
        c.translate(px, apY + 4);
        c.rotate(Math.PI / 4);
        const filled = k < p.ap;
        c.fillStyle = filled ? PALETTE.goldBright : 'rgba(201,162,75,0.18)';
        if (filled) {
          c.shadowColor = PALETTE.goldBright;
          c.shadowBlur = 6;
        }
        c.fillRect(-4, -4, 8, 8);
        c.restore();
      }
      // Status icons (row under portrait)
      let sx = x + 8;
      const sy = y + cardH - 12;
      for (const [id] of p.statuses) {
        const g = STATUS_GLYPH[id];
        if (g) {
          c.save();
          c.globalAlpha = 0.95;
          g.draw(c, sx + 7, sy, 6);
          c.restore();
          sx += 17;
        }
      }
      c.restore();
    });
  }

  // --- gauges (bottom-right): Lumina + flow ---------------------------------
  _gauges(c, s) {
    const { h, w } = this;
    const gw = 20;
    const gh = 170;
    const gx = w - 56;
    const gy = h - gh - 26;
    c.save();
    // Lumina channel
    c.fillStyle = 'rgba(14,16,20,0.85)';
    this._roundRect(c, gx - 6, gy - 26, gw + 12, gh + 44, 8);
    c.fill();
    c.strokeStyle = 'rgba(201,162,75,0.5)';
    c.lineWidth = 1.5;
    this._roundRect(c, gx - 6, gy - 26, gw + 12, gh + 44, 8);
    c.stroke();
    // label
    c.font = '700 10px Georgia, serif';
    c.textAlign = 'center';
    c.fillStyle = PALETTE.gold;
    c.save();
    c.translate(gx + gw / 2, gy + gh / 2);
    c.rotate(-Math.PI / 2);
    c.fillText('L U M I N A', 0, 3);
    c.restore();
    // fill
    const frac = Math.max(0, Math.min(1, s.ultimate.amount / (s.ultimate.max || ULT_MAX)));
    const fy = gy + gh - gh * frac;
    if (frac > 0.005) {
      const g = c.createLinearGradient(0, gy + gh, 0, gy);
      g.addColorStop(0, '#8a6d2f');
      g.addColorStop(0.7, '#e8c979');
      g.addColorStop(1, '#fff2c4');
      c.fillStyle = g;
      if (s.ultimate.ready) {
        c.shadowColor = '#ffe9a8';
        c.shadowBlur = 14 + Math.sin(s.time * 6) * 6;
      }
      this._roundRect(c, gx, fy, gw, gy + gh - fy, 4);
      c.fill();
    }
    c.shadowBlur = 0;
    if (s.ultimate.ready) {
      c.font = '700 10px Georgia, serif';
      c.fillStyle = '#fff2c4';
      c.fillText('READY', gx + gw / 2, gy - 10);
    }
    c.restore();

    // Flow diamonds (parry streak) above the gauge
    const flowY = gy - 44;
    c.save();
    c.font = '700 9px Georgia, serif';
    c.textAlign = 'center';
    c.fillStyle = 'rgba(159,216,207,0.8)';
    c.fillText('FLOW', gx + gw / 2, flowY - 8);
    for (let i = 0; i < s.flow.max; i++) {
      const fx = gx + gw / 2 + (i - (s.flow.max - 1) / 2) * 12;
      c.save();
      c.translate(fx, flowY + 2);
      c.rotate(Math.PI / 4);
      const on = i < s.flow.amount;
      c.fillStyle = on ? '#7fd8cf' : 'rgba(127,216,207,0.15)';
      if (on) {
        c.shadowColor = '#7fd8cf';
        c.shadowBlur = 8;
      }
      c.fillRect(-4, -4, 8, 8);
      c.restore();
    }
    c.restore();
  }

  _roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
  }
}
