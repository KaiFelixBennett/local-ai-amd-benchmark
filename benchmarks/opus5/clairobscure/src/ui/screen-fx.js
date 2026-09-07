/**
 * Full-screen 2D polish drawn on the HUD overlay: vignette, film grain,
 * colour flashes, damage edges, letterboxing and radial speed lines.
 *
 * Doing this on the 2D canvas rather than in the WebGL pipeline keeps it
 * completely risk-free — nothing here can break the renderer — while still
 * carrying most of the perceived "graphics quality" of a hit or a parry.
 */

import { clamp01, easeOutCubic, damp } from '../core/easing.js';

export class ScreenFX {
  constructor() {
    this.flashes = [];
    this.damageEdge = 0;
    this.coldDrain = 0;
    this.letterbox = 0;
    this.letterboxTarget = 0;
    this.speedLines = 0;
    this.vignetteBoost = 0;
    this.grainCanvas = this._makeGrain(160);
    this.grainPattern = null;
    this.time = 0;
  }

  _makeGrain(size) {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = 118 + (Math.random() - 0.5) * 150;
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
      d[i + 3] = 26;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  /** @param {string} color CSS colour @param {number} strength 0..1 */
  flash(color, strength = 0.5, duration = 0.32) {
    this.flashes.push({ color, strength, life: duration, max: duration });
    if (this.flashes.length > 6) this.flashes.shift();
  }

  hurt(strength = 1) {
    this.damageEdge = Math.min(1.4, this.damageEdge + strength);
  }

  /** The cold chromatic drain that accompanies a perfect parry. */
  drain(strength = 1) {
    this.coldDrain = Math.max(this.coldDrain, strength);
  }

  setLetterbox(v) {
    this.letterboxTarget = clamp01(v);
  }

  burstSpeedLines(v = 1) {
    this.speedLines = Math.max(this.speedLines, v);
  }

  update(dt) {
    this.time += dt;
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      this.flashes[i].life -= dt;
      if (this.flashes[i].life <= 0) this.flashes.splice(i, 1);
    }
    this.damageEdge = Math.max(0, this.damageEdge - dt * 1.5);
    this.coldDrain = Math.max(0, this.coldDrain - dt * 1.6);
    this.speedLines = Math.max(0, this.speedLines - dt * 2.6);
    this.letterbox = damp(this.letterbox, this.letterboxTarget, 5, dt);
  }

  /** Drawn beneath the HUD. */
  drawUnder(ctx, w, h) {
    if (this.speedLines > 0.01) this._drawSpeedLines(ctx, w, h);
    if (this.coldDrain > 0.01) {
      ctx.save();
      ctx.globalAlpha = this.coldDrain * 0.22;
      ctx.fillStyle = '#9fc8d8';
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }

  /** Drawn above the HUD, last thing in the frame. */
  drawOver(ctx, w, h, intensity = 0.4) {
    this._drawVignette(ctx, w, h, intensity);
    if (this.damageEdge > 0.01) this._drawDamageEdge(ctx, w, h);
    for (const f of this.flashes) {
      const u = 1 - f.life / f.max;
      ctx.save();
      ctx.globalAlpha = (1 - easeOutCubic(u)) * f.strength;
      ctx.fillStyle = f.color;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
    this._drawGrain(ctx, w, h);
    if (this.letterbox > 0.005) this._drawLetterbox(ctx, w, h);
  }

  _drawVignette(ctx, w, h, intensity) {
    const strength = 0.42 + intensity * 0.22 + this.vignetteBoost;
    const g = ctx.createRadialGradient(
      w / 2, h * 0.48, Math.min(w, h) * 0.32,
      w / 2, h * 0.5, Math.max(w, h) * 0.72,
    );
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.65, `rgba(4,12,14,${strength * 0.4})`);
    g.addColorStop(1, `rgba(2,8,9,${strength})`);
    ctx.save();
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // A warm corner glaze so the frame reads as varnished canvas.
    const warm = ctx.createRadialGradient(
      w * 0.5, h * 0.32, 0, w * 0.5, h * 0.32, Math.max(w, h) * 0.55,
    );
    warm.addColorStop(0, 'rgba(255,214,150,0.05)');
    warm.addColorStop(1, 'rgba(255,214,150,0)');
    ctx.fillStyle = warm;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  _drawDamageEdge(ctx, w, h) {
    const a = clamp01(this.damageEdge);
    const g = ctx.createRadialGradient(
      w / 2, h / 2, Math.min(w, h) * 0.26,
      w / 2, h / 2, Math.max(w, h) * 0.62,
    );
    g.addColorStop(0, 'rgba(160,20,10,0)');
    g.addColorStop(1, `rgba(160,20,10,${a * 0.5})`);
    ctx.save();
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  _drawGrain(ctx, w, h) {
    if (!this.grainPattern) {
      this.grainPattern = ctx.createPattern(this.grainCanvas, 'repeat');
    }
    if (!this.grainPattern) return;
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.translate(
      -Math.floor(Math.random() * 160),
      -Math.floor(Math.random() * 160),
    );
    ctx.fillStyle = this.grainPattern;
    ctx.fillRect(0, 0, w + 160, h + 160);
    ctx.restore();
  }

  _drawLetterbox(ctx, w, h) {
    const barH = h * 0.11 * this.letterbox;
    ctx.save();
    ctx.fillStyle = '#040d0e';
    ctx.fillRect(0, 0, w, barH);
    ctx.fillRect(0, h - barH, w, barH);
    ctx.strokeStyle = 'rgba(217,178,98,0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, barH + 0.5);
    ctx.lineTo(w, barH + 0.5);
    ctx.moveTo(0, h - barH - 0.5);
    ctx.lineTo(w, h - barH - 0.5);
    ctx.stroke();
    ctx.restore();
  }

  _drawSpeedLines(ctx, w, h) {
    const a = this.speedLines;
    ctx.save();
    ctx.globalAlpha = a * 0.35;
    ctx.strokeStyle = 'rgba(255,236,196,0.9)';
    ctx.lineWidth = 2;
    const cx = w / 2;
    const cy = h / 2;
    const inner = Math.min(w, h) * (0.34 + (1 - a) * 0.25);
    for (let i = 0; i < 46; i++) {
      const ang = (i / 46) * Math.PI * 2 + this.time * 0.4;
      const len = Math.max(w, h) * (0.16 + ((i * 37) % 11) / 40);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * inner, cy + Math.sin(ang) * inner);
      ctx.lineTo(cx + Math.cos(ang) * (inner + len), cy + Math.sin(ang) * (inner + len));
      ctx.stroke();
    }
    ctx.restore();
  }
}
