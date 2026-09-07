import { drawCornerTendril } from '../engine/textures.js';
import { EV } from '../core/events.js';
import { clamp, clamp01, easeOutCubic } from '../core/easing.js';

// ---------------------------------------------------------------------------
// Real-time defense prompts. Draws on the HUD canvas every frame while a
// reaction combo is live:
//   * telegraph banner (attack name, intent chip, hit dots)
//   * a readable timing track: playhead sweeping right toward landing zones.
//     Zones are drawn EXACTLY to the real windows (dodge = wide teal band,
//     parry = narrow gold band, perfect = white core), so fairness is visible.
//   * a shrinking guard ring around the defender + big judgment stamps
//   * screen flashes (cold on parry, gold on perfect, red on fail)
// The track shows the last hit of the combo at 2.6s-of-history so multi-hit
// rhythms stay legible: earlier strikes leave "ghost" marks (judgments).
// ---------------------------------------------------------------------------

const CUE_WINDOW_S = 2.2; // seconds of incoming rhythm visible on the track

export class Prompts {
  constructor(bus) {
    this.bus = bus;
    this.combo = null;        // {pattern, hits(with land/judge), defenders, attacker, unparryable, t0}
    this.stamps = [];         // {text, color, t, x?, y?} big judgment stamps
    this.flash = null;        // {color, until, dur}
    this._endTimer = 0;       // keeps the cue briefly after COMBO_END for readability
    this.cold = 0;
    this.desat = 0;
    bus.on(EV.TELEGRAPH, (p) => this._onTelegraph(p));
    bus.on(EV.COMBO_END, () => { this._endTimer = 0.45; });
    bus.on(EV.REACT_HIT, (p) => this._onVerdict(p));
    bus.on(EV.FLASH, (p) => { this.flash = { color: p.color, dur: (p.ms || 250) / 1000, age: 0 }; });
    bus.on(EV.GRADIENT_FIRE, () => { this.flash = { color: 'rgba(253,250,242,0.8)', dur: 0.6, age: 0 }; });
    bus.on(EV.DEATH, (p) => { if (p && p.unit) this._killComboFor(p.unit); });
  }

  _onTelegraph(p) {
    // The battle layer also mirrors combo data here for HUD drawing.
    this.combo = {
      pattern: p, defenders: p.defenders || [p.defender], unparryable: p.unparryable,
      t0: null, startedAt: performance.now() / 1000, t: 0,
      hitsLive: null // injected every frame by Game via sync()
    };
  }

  // Game syncs the live hit list (with land times + judges) every frame.
  sync(comboList, clockT, clockScale) {
    if (comboList.length) {
      const c = comboList[0];
      if (!this.combo) this.combo = {};
      this.combo.clockT = clockT;
      this.combo.hitsLive = c.hits;
      this.combo.t0 = c.t0;
      this.combo.unparryable = !!c.pattern.unparryable;
      this.combo.defenders = c.defenders || [c.defender];
      this.combo.meta = c.pattern;
      this.combo.clockScale = clockScale;
      this._endTimer = 0.5; // linger briefly after the last combo ends
    } else if (this._endTimer <= 0) {
      this.combo = null;
    }
  }

  _onVerdict(p) {
    const v = p.verdict;
    const label = {
      perfect: 'PERFECT!', parry: 'PARRY!', dodge: 'DODGE', fail: 'HIT!',
      'grab-parry': 'CANT PARRY GRAB!'
    }[v] || '';
    const color = {
      perfect: '#fdfaf2', parry: '#f4d489', dodge: '#8fbcb6', fail: '#c0392b',
      'grab-parry': '#a8552f'
    }[v] || '#fff';
    this.stamps.push({ text: label, color, t: 0, big: v === 'perfect' });
    if (this.stamps.length > 3) this.stamps.shift();
    if (v === 'perfect') { this.cold = 1; this.desat = 1; this.flash = { color: 'rgba(180,220,255,0.5)', dur: 0.28, age: 0 }; }
    else if (v === 'parry') { this.cold = 0.7; this.flash = { color: 'rgba(140,200,230,0.3)', dur: 0.2, age: 0 }; }
    else if (v === 'dodge') { this.flash = { color: 'rgba(143,188,182,0.25)', dur: 0.18, age: 0 }; }
    else if (v === 'fail' || v === 'grab-parry') { this.flash = { color: 'rgba(161,45,51,0.4)', dur: 0.25, age: 0 }; }
  }

  _killComboFor(unit) { /* combo cleanup handled by system; nothing cached dangerous */ }

  update(dt) {
    for (const s of this.stamps) s.t += dt;
    this.stamps = this.stamps.filter((s) => s.t < 1.1);
    if (this._endTimer > 0) this._endTimer -= dt;
    if (this.flash) {
      this.flash.age += dt;
      if (this.flash.age > this.flash.dur) this.flash = null;
    }
    this.cold = Math.max(0, this.cold - dt * 2.5);
    this.desat = Math.max(0, this.desat - dt * 1.6);
  }

  get cssFilter() {
    const s = this.desat;
    if (s <= 0.01) return '';
    return `saturate(${1 - 0.65 * s}) brightness(${1 + 0.15 * s}) contrast(${1 + 0.1 * s})`;
  }

  draw(ctx, W, H, projectPoint, clockT, clockScale) {
    if (this.combo) this._drawCue(ctx, W, H, projectPoint, clockT, clockScale);
    this._drawStamps(ctx, W, H);
    this._drawFlash(ctx, W, H);
    this._drawGrain(ctx, W, H);
  }

  _drawCue(ctx, W, H, projectPoint, clockT, clockScale) {
    const c = this.combo;
    const hits = c.hitsLive;
    if (!hits) return;
    const meta = c.meta || {};
    const now = clockT;
    const lastLand = hits[hits.length - 1].land;

    // ---- banner -------------------------------------------------------------
    const bw = 300, bx = W / 2 - bw / 2, by = 92;
    ctx.save();
    const g = ctx.createLinearGradient(bx, by, bx, by + 40);
    g.addColorStop(0, 'rgba(12,18,21,0.88)');
    g.addColorStop(1, 'rgba(8,12,14,0.92)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.roundRect(bx, by, bw, 40, 8); ctx.fill();
    const pulse = 0.5 + 0.5 * Math.sin(now * 14);
    ctx.strokeStyle = meta.color || '#a12d33';
    ctx.globalAlpha = 0.7 + 0.3 * pulse;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.globalAlpha = 1;
    // intent chip
    const intent = meta.intent || 'ATTACK';
    ctx.font = '700 10px Georgia, serif';
    const chipW = ctx.measureText(intent).width + 16;
    ctx.fillStyle = c.unparryable ? '#a8552f' : (meta.color || '#a12d33');
    ctx.beginPath(); ctx.roundRect(bx + 10, by + 12, chipW, 16, 4); ctx.fill();
    ctx.fillStyle = '#fdfaf2';
    ctx.fillText(intent, bx + 18, by + 24);
    ctx.font = '600 15px Georgia, serif';
    ctx.fillStyle = '#e8e2d2';
    ctx.fillText(meta.name || 'Attack', bx + chipW + 20, by + 25);
    ctx.font = 'italic 10px Georgia, serif';
    ctx.fillStyle = '#9a958a';
    ctx.textAlign = 'right';
    ctx.fillText(c.unparryable ? 'DODGE ONLY' : `${hits.length} strike${hits.length > 1 ? 's' : ''} — [A] parry / [SPACE] dodge`,
      bx + bw - 12, by + 24);
    ctx.textAlign = 'left';
    ctx.restore();

    // ---- timing track ---------------------------------------------------------
    // Timeline in game-seconds; playhead at `now`, landing zones drawn by real
    // windows. Track spans [now - 0.35, now + CUE_WINDOW_S].
    const tw = Math.min(640, W - 260);
    const tx = W / 2 - tw / 2;
    const ty = H - 118;
    const t0 = now - 0.35;
    const tSpan = CUE_WINDOW_S + 0.35;
    const X = (t) => tx + ((t - t0) / tSpan) * tw;

    ctx.save();
    // track plate
    ctx.fillStyle = 'rgba(8,12,14,0.78)';
    ctx.beginPath(); ctx.roundRect(tx - 14, ty - 26, tw + 28, 52, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(216,169,74,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
    drawCornerTendril(ctx, tx - 6, ty - 18, 10, 0, 'rgba(216,169,74,0.6)');
    drawCornerTendril(ctx, tx + tw + 6, ty - 18, 10, Math.PI / 2, 'rgba(216,169,74,0.6)');

    // baseline
    ctx.strokeStyle = 'rgba(232,226,210,0.25)';
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + tw, ty); ctx.stroke();

    for (const hit of hits) {
      if (hit.land < t0 - 0.4) continue;
      if (hit.land > t0 + tSpan + 0.6) continue;
      const x = X(hit.land);
      // dodge band (wide)
      if (hit.dodge) {
        ctx.fillStyle = 'rgba(63,107,109,0.55)';
        ctx.fillRect(x - (hit.dodge / tSpan) * tw, ty - 3, 2 * (hit.dodge / tSpan) * tw, 6);
      }
      // parry band (narrow) — skip on grabs
      if (!c.unparryable && hit.parry) {
        ctx.fillStyle = 'rgba(216,169,74,0.9)';
        ctx.fillRect(x - (hit.parry / tSpan) * tw, ty - 5, 2 * (hit.parry / tSpan) * tw, 10);
        // perfect core
        ctx.fillStyle = '#fdfaf2';
        ctx.fillRect(x - 1, ty - 7, 2, 14);
      }
      // landing tick
      ctx.strokeStyle = hit.judged ? 'rgba(232,226,210,0.35)' : '#e8e2d2';
      ctx.lineWidth = hit.judged ? 1 : 2;
      ctx.beginPath(); ctx.moveTo(x, ty - 12); ctx.lineTo(x, ty + 12); ctx.stroke();
      if (hit.judged) {
        const jc = { perfect: '#fdfaf2', parry: '#f4d489', dodge: '#8fbcb6', fail: '#a12d33', 'grab-parry': '#a8552f' }[hit.judge] || '#888';
        ctx.fillStyle = jc;
        ctx.beginPath(); ctx.arc(x, ty + 18, 3.5, 0, Math.PI * 2); ctx.fill();
      } else {
        // incoming hit diamond
        const near = clamp01(1 - (hit.land - now) / 0.5);
        ctx.fillStyle = c.unparryable ? '#a8552f' : '#d06a6f';
        const r2 = 4 + 3 * easeOutCubic(near);
        ctx.beginPath();
        ctx.moveTo(x, ty - r2 - 12); ctx.lineTo(x + 5, ty - 12); ctx.lineTo(x, ty - 12 + r2); ctx.lineTo(x - 5, ty - 12);
        ctx.closePath(); ctx.fill();
        ctx.font = '9px Georgia, serif';
        ctx.fillStyle = 'rgba(232,226,210,0.6)';
        ctx.textAlign = 'center';
        ctx.fillText(c.unparryable ? 'DODGE' : 'PARRY', x, ty - 24 - r2);
        ctx.textAlign = 'left';
      }
    }

    // playhead
    const px = X(now);
    ctx.strokeStyle = '#fdfaf2';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(px, ty - 16); ctx.lineTo(px, ty + 16); ctx.stroke();
    ctx.fillStyle = '#fdfaf2';
    ctx.beginPath();
    ctx.moveTo(px, ty + 16); ctx.lineTo(px - 5, ty + 24); ctx.lineTo(px + 5, ty + 24);
    ctx.closePath(); ctx.fill();

    // feint warning near the current time
    if (c.feintWarn && now < c.feintWarn) {
      ctx.fillStyle = 'rgba(161,45,51,0.9)';
      ctx.font = 'italic 700 12px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText('…feint?', W / 2, ty + 38);
      ctx.textAlign = 'left';
    }
    ctx.restore();

    // guard ring over the defender(s)
    for (const d of (c.defenders || [])) {
      if (!d.alive) continue;
      const head = d.weakWorld ? d.weakWorld.clone().setY(d.weakWorld.y + 0.8) : d.center.clone().setY(2.1);
      const s = projectPoint(head);
      if (!s || !s.ok) continue;
      const nextHit = hits.find((h) => h.land > now);
      if (nextHit) {
        const p = clamp01((nextHit.land - now) / 0.6);
        const r = 18 + 46 * p;
        ctx.save();
        ctx.strokeStyle = c.unparryable ? 'rgba(168,85,47,0.9)' : `rgba(244,212,137,${0.35 + 0.65 * (1 - p)})`;
        ctx.lineWidth = 2 + 3 * (1 - p);
        ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      // "DEFEND" label
      ctx.save();
      ctx.font = '700 11px Georgia, serif';
      ctx.fillStyle = 'rgba(253,250,242,0.85)';
      ctx.textAlign = 'center';
      ctx.fillText('DEFEND', s.x, s.y - 56);
      ctx.restore();
    }
  }

  _drawStamps(ctx, W, H) {
    for (const s of this.stamps) {
      const k = s.t / 1.1;
      const scale = s.big ? 1.4 : 1;
      const alpha = k < 0.12 ? k / 0.12 : k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.translate(W / 2, H * 0.34 - k * 34);
      ctx.scale(1 + k * 0.35 * scale, 1 + k * 0.35 * scale);
      ctx.font = `700 ${Math.round(44 * scale)}px Georgia, serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(10,14,16,0.85)';
      ctx.strokeText(s.text, 0, 0);
      ctx.fillStyle = s.color;
      ctx.fillText(s.text, 0, 0);
      ctx.restore();
    }
  }

  _drawFlash(ctx, W, H) {
    if (!this.flash) return;
    const a = Math.max(0, 1 - this.flash.age / this.flash.dur);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = this.flash.color;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // Subtle film grain — cheap, static-noise tiles cycled by time.
  _drawGrain(ctx, W, H) {
    if (!this._grainTiles) this._makeGrain();
    const idx = Math.floor(performance.now() / 90) % this._grainTiles.length;
    const tile = this._grainTiles[idx];
    ctx.save();
    ctx.globalAlpha = 0.05;
    const pat = ctx.createPattern(tile, 'repeat');
    if (pat) { ctx.fillStyle = pat; ctx.fillRect(0, 0, W, H); }
    ctx.restore();
  }

  _makeGrain() {
    this._grainTiles = [];
    for (let n = 0; n < 3; n++) {
      const c = document.createElement('canvas');
      c.width = 128; c.height = 128;
      const cx = c.getContext('2d');
      const img = cx.createImageData(128, 128);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = 128 + (Math.random() - 0.5) * 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = Math.random() * 60;
      }
      cx.putImageData(img, 0, 0);
      this._grainTiles.push(c);
    }
  }
}
