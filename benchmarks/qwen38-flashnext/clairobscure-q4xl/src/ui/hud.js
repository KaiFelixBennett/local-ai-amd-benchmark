import { drawPanelOrnament } from '../engine/textures.js';
import { STATUSES } from '../entities/status.js';
import { EV } from '../core/events.js';
import { GRADIENT } from '../entities/skill.js';

// ---------------------------------------------------------------------------
// 2D HUD overlay canvas: portraits + HP/AP bars for the party, enemy plates,
// stagger meters, status icons, the upcoming-turn queue, the flow (streak)
// meter and the gradient gauge. Pure drawing — reads game state, mutates none.
// ---------------------------------------------------------------------------

const ICON_CACHE = new Map();

function statusIcon(id) {
  let c = ICON_CACHE.get(id);
  if (!c) {
    const def = STATUSES[id];
    if (!def) return null;
    c = def.icon ? iconFor(def) : null;
    ICON_CACHE.set(id, c);
  }
  return c;
}

function iconFor(def) {
  const cv = document.createElement('canvas');
  cv.width = 40; cv.height = 40;
  const ctx = cv.getContext('2d');
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  def.icon(ctx, def.color);
  return cv;
}

export class HUD {
  constructor(canvas, bus, refs) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.bus = bus;
    this.refs = refs; // {game} accessor via getter fns
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.t = 0;
    this.danger = 0;
    this.queuePreview = [];
    this.flow = 0;
    this.charge = 0;
    this.gradientReady = false;
    this.log = [];
    this.round = 1;

    this._party = [];
    this._enemies = [];
    this.activeUnit = null;

    bus.on(EV.TURN_START, (p) => { if (p.unit) this.activeUnit = p.unit; else if (p.round) this.round = p.round; });
    bus.on('battle:round', (p) => { this.queuePreview = p.preview || []; this.round = p.round; });
    bus.on('turn-queue:preview', (p) => { this.queuePreview = p.preview || []; });
    bus.on(EV.CHARGE, (p) => { this.charge = p.charge; this.gradientReady = p.charge >= (p.needed || GRADIENT.chargeNeeded); });
    bus.on('battle:danger', (p) => { this.danger = p.intensity; });
    bus.on(EV.RESTART, () => { this.log = []; this.charge = 0; this.gradientReady = false; });
  }

  setCombatants(party, enemies) { this._party = party; this._enemies = enemies; }
  get party() { return typeof this.refs.party === 'function' ? this.refs.party() : this._party; }
  get enemies() { return typeof this.refs.enemies === 'function' ? this.refs.enemies() : this._enemies; }

  resize(w, h) {
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.w = w; this.h = h;
  }

  addLog(text) {
    this.log.push({ text, t: this.t });
    if (this.log.length > 5) this.log.shift();
  }

  update(dt) { this.t += dt; this._flushLog(); }

  _flushLog() {
    for (const l of this.log) if (this.t - l.t > 4.2) l.dead = true;
    const n = this.log.length;
    if (n && this.log[n - 1].dead) this.log = this.log.filter((l) => !l.dead);
  }

  draw() {
    const ctx = this.ctx;
    const W = this.w, H = this.h;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    this._drawVignette(ctx, W, H);
    this._drawPartyPanel(ctx);
    this._drawEnemyPlates(ctx);
    this._drawQueue(ctx, W);
    this._drawGradient(ctx, W, H);
    this._drawFlow(ctx, W, H);
    this._drawLog(ctx, W, H);
    this._drawHints(ctx, W, H);
  }

  // -- party cards (bottom-left, the painted roster) --------------------------

  _drawPartyPanel(ctx) {
    const party = this.party;
    const cw = 226, ch = 58, gap = 6;
    const panelH = ch * party.length + gap * (party.length - 1) + 34;
    const x = 18, y = this.h - panelH - 14;
    drawPanelOrnament(ctx, x, y, cw, ch * party.length + gap * (party.length - 1) + 34, {});
    ctx.fillStyle = '#d8a94a';
    ctx.font = '600 12px Georgia, serif';
    ctx.fillText('EXPEDITION', x + 14, y + 20);
    party.forEach((p, i) => {
      const py = y + 30 + i * (ch + gap);
      const active = this.activeUnit === p;
      if (active) {
        ctx.fillStyle = 'rgba(216,169,74,0.14)';
        ctx.fillRect(x + 6, py - 2, cw - 12, ch);
      }
      if (p.portrait) {
        ctx.save();
        ctx.globalAlpha = p.alive ? 1 : 0.35;
        ctx.drawImage(p.portrait.image, x + 12, py + 2, 44, 44);
        ctx.restore();
      }
      ctx.save();
      if (!p.alive) ctx.globalAlpha = 0.4;
      // name + level
      ctx.fillStyle = p.alive ? '#e8e2d2' : '#6d6a5e';
      ctx.font = '600 13px Georgia, serif';
      ctx.fillText(`${p.name}`, x + 64, py + 16);
      ctx.fillStyle = '#8a8577';
      ctx.font = '10px Georgia, serif';
      ctx.fillText(`nv.${p.level}  ${p.row === 'front' ? 'ligne avan.' : 'ligne arri.'}`, x + 64, py + 28);
      // HP bar
      this._bar(ctx, x + 64, py + 33, cw - 84, 8, p.hpFrac,
        p.hpFrac > 0.5 ? '#4f8f6b' : p.hpFrac > 0.25 ? '#c98f4a' : '#a12d33', `${p.hp}/${p.maxHp}`);
      // AP pips
      const pips = p.maxAp;
      const pw = 9;
      for (let a = 0; a < pips; a++) {
        ctx.fillStyle = a < p.ap ? '#f4d489' : 'rgba(244,212,137,0.14)';
        ctx.fillRect(x + 64 + a * (pw + 3), py + 45, pw, 5);
      }
      // row hint: AP label
      ctx.fillStyle = '#8a8577';
      ctx.font = '9px Georgia, serif';
      ctx.fillText('PA', x + 64 + pips * 12 + 4, py + 50);
      // status icons
      let sx = x + 64;
      for (const [id, st] of p.statuses) {
        const ic = statusIcon(id);
        if (ic) {
          ctx.drawImage(ic, sx, py + 2, 14, 14);
          ctx.fillStyle = st.color || '#fff';
          ctx.font = '8px Georgia';
          ctx.fillText(String(st.turns), sx + 10, py + 14);
          sx += 17;
        }
      }
      if (p.isBroken) {
        ctx.fillStyle = '#f4d489';
        ctx.font = 'italic 10px Georgia, serif';
        ctx.fillText('BROKEN', x + cw - 58, py + 12);
      }
      ctx.restore();
    });
  }

  _bar(ctx, x, y, w, h, frac, color, label) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
    ctx.strokeStyle = 'rgba(216,169,74,0.5)';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    if (label) {
      ctx.fillStyle = '#e8e2d2';
      ctx.font = '9px Georgia, serif';
      ctx.textAlign = 'right';
      ctx.fillText(label, x + w, y - 2);
      ctx.textAlign = 'left';
    }
  }

  // -- enemy plates (floating above enemies — positioned from 3D projection) --

  setProjector(fn) { this.project = fn; } // (Vector3)->{x,y,ok}

  _drawEnemyPlates(ctx) {
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const head = e.weakWorld ? e.weakWorld.clone().setY(e.weakWorld.y + 0.55) : e.center;
      const s = this.project ? this.project(head) : null;
      if (!s || !s.ok) continue;
      const w = 150, h = 30;
      const x = s.x - w / 2, y = s.y - h - 10;
      const active = this.activeUnit === e;
      const targeted = e.isTargeted;
      ctx.save();
      ctx.globalAlpha = 0.94;
      const g = ctx.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, 'rgba(16,22,25,0.9)');
      g.addColorStop(1, 'rgba(8,12,14,0.92)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.roundRect(x, y, w, h, 6); ctx.fill();
      ctx.strokeStyle = targeted ? '#a12d33' : active ? '#f4d489' : 'rgba(143,188,182,0.5)';
      ctx.lineWidth = targeted || active ? 1.8 : 1;
      ctx.stroke();
      // name
      ctx.fillStyle = '#e8e2d2';
      ctx.font = '600 11px Georgia, serif';
      ctx.fillText(e.name, x + 8, y + 12);
      if (e.boss) {
        ctx.fillStyle = '#b79cff';
        ctx.font = '8px Georgia';
        ctx.fillText(e.phase === 2 ? 'PHASE II' : 'PRESS', x + w - 44, y + 12);
      }
      // hp
      this._bar(ctx, x + 8, y + 16, w - 16, 5, e.hpFrac, '#a12d33');
      // stagger meter (gold, thin, below hp)
      const sf = e.staggerFrac;
      if (sf > 0.01 || e.isBroken) {
        ctx.fillStyle = 'rgba(244,212,137,0.15)';
        ctx.fillRect(x + 8, y + 23, w - 16, 3);
        ctx.fillStyle = e.isBroken ? '#fff' : '#f4d489';
        ctx.fillRect(x + 8, y + 23, (w - 16) * (e.isBroken ? 1 : sf), 3);
      }
      // statuses
      let sx = x + 8;
      for (const id of e.statuses.keys()) {
        const ic = statusIcon(id);
        if (ic) { ctx.drawImage(ic, sx, y - 18, 13, 13); sx += 15; }
      }
      if (e.isBroken) {
        ctx.fillStyle = '#f4d489';
        ctx.font = 'italic 700 10px Georgia, serif';
        ctx.fillText('BRISÉ', x + w - 40, y + 28 + 0);
      }
      ctx.restore();
    }
  }

  // -- turn queue (top-right) ---------------------------------------------------

  _drawQueue(ctx, W) {
    const preview = this.queuePreview.slice(0, 6);
    const x = W - 150, y = 14, h = 30 + preview.length * 26;
    drawPanelOrnament(ctx, x, y, 138, h, {});
    ctx.fillStyle = '#8a8577';
    ctx.font = 'italic 10px Georgia, serif';
    ctx.fillText(`ROUND ${this.round} — ORDRE`, x + 10, y + 18);
    preview.forEach((p, i) => {
      const py = y + 32 + i * 26;
      const active = i === 0;
      ctx.fillStyle = p.side === 'party' ? (active ? '#8fbcb6' : 'rgba(143,188,182,0.75)') : (active ? '#d06a6f' : 'rgba(208,106,111,0.7)');
      ctx.beginPath();
      ctx.arc(x + 16, py + 4, active ? 5 : 3.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = active ? '#e8e2d2' : '#9a958a';
      ctx.font = `${active ? '600 12px' : '11px'} Georgia, serif`;
      const nm = p.name.length > 14 ? p.name.slice(0, 13) + '…' : p.name;
      ctx.fillText(nm, x + 27, py + 8);
    });
  }

  // -- gradient gauge (bottom-center) ------------------------------------------

  _drawGradient(ctx, W, H) {
    const w = 320, x = W / 2 - w / 2, y = H - 64;
    ctx.save();
    const frac = Math.min(1, this.charge / GRADIENT.chargeNeeded);
    ctx.fillStyle = 'rgba(8,12,14,0.8)';
    ctx.beginPath(); ctx.roundRect(x - 4, y - 16, w + 8, 30, 8); ctx.fill();
    ctx.strokeStyle = this.gradientReady ? '#f4d489' : 'rgba(216,169,74,0.4)';
    ctx.lineWidth = this.gradientReady ? 2 : 1;
    ctx.stroke();
    const g = ctx.createLinearGradient(x, y, x + w, y);
    g.addColorStop(0, '#3f6b6d'); g.addColorStop(0.6, '#d8a94a'); g.addColorStop(1, '#f4d489');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w * frac, 8);
    for (let i = 1; i < 5; i++) {
      ctx.strokeStyle = 'rgba(10,14,16,0.8)';
      ctx.beginPath(); ctx.moveTo(x + (w / 5) * i, y); ctx.lineTo(x + (w / 5) * i, y + 8); ctx.stroke();
    }
    ctx.fillStyle = this.gradientReady ? '#f4d489' : '#8a8577';
    ctx.font = `${this.gradientReady ? '700 11px' : '10px'} Georgia, serif`;
    ctx.textAlign = 'center';
    const pulse = this.gradientReady ? 1 : 0;
    if (this.gradientReady && Math.sin(this.t * 6) > 0) ctx.font = '700 12px Georgia, serif';
    ctx.fillText(this.gradientReady ? 'ATTAQUE PALETTE PRETE — [G]' : `ATTAQUE PALETTE ${Math.round(frac * 100)}%`, x + w / 2, y - 4);
    ctx.textAlign = 'left';
    ctx.restore();
  }

  // -- flow/streak meter (bottom-right) ------------------------------------------

  _drawFlow(ctx, W, H) {
    const streak = this.flow;
    if (streak <= 0) return;
    const x = W - 60, y = H - 150;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f4d489';
    ctx.font = 'italic 11px Georgia, serif';
    ctx.fillText('FLUX', x, y - 60);
    const cells = Math.min(10, streak);
    for (let i = 0; i < cells; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const px = x + Math.cos(a) * 30, py = y - 34 + Math.sin(a) * 30;
      ctx.strokeStyle = '#d8a94a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(244,212,137,0.85)';
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = '#e8e2d2';
    ctx.font = '700 26px Georgia, serif';
    ctx.fillText(`x${streak}`, x, y - 26);
    ctx.restore();
  }

  _drawVignette(ctx, W, H) {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.38, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(4,7,9,${0.34 + this.danger * 0.22})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  _drawLog(ctx, W, H) {
    ctx.save();
    ctx.font = 'italic 12px Georgia, serif';
    this.log.forEach((l, i) => {
      const age = this.t - l.t;
      const alpha = age < 0.2 ? age * 5 : age > 3.4 ? Math.max(0, (4.2 - age) / 0.8) : 1;
      ctx.fillStyle = `rgba(232,226,210,${0.85 * alpha})`;
      ctx.textAlign = 'center';
      ctx.fillText(l.text, W / 2, H - 168 - (this.log.length - 1 - i) * 18);
    });
    ctx.restore();
  }

  _drawHints(ctx, W, H) {
    const state = typeof this.refs.state === 'function' ? this.refs.state() : null;
    ctx.save();
    ctx.fillStyle = 'rgba(154,149,138,0.65)';
    ctx.font = '10px Georgia, serif';
    ctx.textAlign = 'left';
    let txt = '';
    if (state === 'menu') txt = 'Select an action — keys 1-5, arrows to cycle';
    else if (state === 'target') txt = 'Choose a target — click a combatant or press Enter';
    else if (state === 'aim') txt = 'Aim: move reticle · hold to charge · release to fire · Esc cancel';
    else if (state === 'reaction') txt = 'A · parry  |  Space · dodge';
    ctx.fillText(txt, 18, 20);
    ctx.restore();
  }
}
