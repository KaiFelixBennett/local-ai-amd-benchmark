/**
 * fx/screen-fx.js — 2D painterly screen-space polish, drawn on a HUD canvas
 * overlay that sits above the WebGL canvas.
 *
 * Zero WebGL risk, high impact:
 *   - baked vignette (drawn once, composited each frame)
 *   - animated film grain (tiled, random offset)
 *   - full-screen flash (hit = warm, parry = cold, weakness = gold)
 *   - desaturate + edge cool during slow-mo (perfect parry / ultimate)
 *   - a thin gilded frame border
 *
 * The canvas is sized to the window (CSS px, scaled by devicePixelRatio).
 * `game.js` calls update(dt) after the 3D render; the HUD (ui/hud.js) draws
 * its own bars/menus on a SEPARATE canvas so the two never fight.
 */
import * as THREE from 'three';

export class ScreenFX {
  /**
   * @param {HTMLCanvasElement} canvas  (absolute-positioned over the scene)
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this._grainPattern = null;
    this._flash = { r: 0, g: 0, b: 0, a: 0 };
    this._desat = 0;      // 0..1 target
    this._desatCur = 0;
    this._vignetteCanvas = null;
    this._resize();
    this._onResize = () => this._resize();
    window.addEventListener('resize', this._onResize);
    this._grainCanvas = document.createElement('canvas');
    this._grainCanvas.width = 256;
    this._grainCanvas.height = 256;
    this._grainCtx = this._grainCanvas.getContext('2d');
  }

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = this.w * dpr;
    this.canvas.height = this.h * dpr;
    this.canvas.style.width = this.w + 'px';
    this.canvas.style.height = this.h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._buildVignette();
  }

  _buildVignette() {
    const c = document.createElement('canvas');
    c.width = this.w;
    c.height = this.h;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(
      this.w / 2, this.h * 0.46, Math.min(this.w, this.h) * 0.3,
      this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.72
    );
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.75, 'rgba(8,10,14,0.22)');
    g.addColorStop(1, 'rgba(4,6,10,0.62)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
    // Gilded inner frame
    ctx.strokeStyle = 'rgba(201,162,75,0.20)';
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, this.w - 20, this.h - 20);
    ctx.strokeStyle = 'rgba(201,162,75,0.08)';
    ctx.lineWidth = 1;
    ctx.strokeRect(16, 16, this.w - 32, this.h - 32);
    this._vignetteCanvas = c;
  }

  /** Fire a flash. color: hex number. strength 0..1. */
  flash(color = 0xffffff, strength = 0.5) {
    const c = new THREE.Color(color);
    this._flash = { r: c.r, g: c.g, b: c.b, a: Math.max(this._flash.a, strength) };
  }

  /** Desaturate/cool target 0..1 (set >0 during slow-mo, decays). */
  setDesaturate(v) {
    this._desat = Math.max(this._desat, v);
  }

  /**
   * @param {object} o { slowed: bool (timeline.timeScale < 1), lowHp: 0..1 }
   */
  update(dt, o = {}) {
    const ctx = this.ctx;
    const { w, h } = this;
    ctx.clearRect(0, 0, w, h);

    // 1) Vignette (baked)
    if (this._vignetteCanvas) ctx.drawImage(this._vignetteCanvas, 0, 0, w, h);

    // 2) Desaturate: during slow-mo, draw a cool translucent wash + a light
    //    'saturation' trick (soft-light gray). Keep it gentle.
    this._desatCur += (this._desat - this._desatCur) * Math.min(1, dt * 6);
    if (this._desatCur > 0.01) {
      const d = this._desatCur;
      ctx.globalCompositeOperation = 'saturation';
      ctx.fillStyle = `rgba(128,128,128,${d * 0.85})`;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'soft-light';
      ctx.fillStyle = `rgba(140,180,200,${d * 0.35})`;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    }
    this._desat = Math.max(0, this._desat - dt * 0.5);

    // 3) Low-HP danger wash: a faint crimson pulse at the edges
    if (o.lowHp > 0.01) {
      const pulse = 0.5 + Math.sin(performance.now() * 0.006) * 0.5;
      const a = o.lowHp * 0.16 * (0.6 + pulse * 0.4);
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.7);
      g.addColorStop(0, 'rgba(124,45,58,0)');
      g.addColorStop(1, `rgba(124,45,58,${a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    // 4) Flash (decays fast)
    if (this._flash.a > 0.004) {
      ctx.fillStyle = `rgba(${(this._flash.r * 255) | 0},${(this._flash.g * 255) | 0},${(this._flash.b * 255) | 0},${this._flash.a})`;
      ctx.fillRect(0, 0, w, h);
      this._flash.a = Math.max(0, this._flash.a - dt * 3.2);
    }

    // 5) Film grain (subtle, re-tiled randomly)
    if (!this._grainPattern) {
      this._grainCtx.clearRect(0, 0, 256, 256);
      const img = this._grainCtx.createImageData(256, 256);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = 200 + ((Math.random() * 55) | 0);
        img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v;
        img.data[i + 3] = (Math.random() * 22) | 0;
      }
      this._grainCtx.putImageData(img, 0, 0);
      this._grainPattern = ctx.createPattern(this._grainCanvas, 'repeat');
    }
    ctx.save();
    ctx.globalAlpha = 0.5;
    const ox = (Math.random() * 256) | 0;
    const oy = (Math.random() * 256) | 0;
    ctx.translate(-ox, -oy);
    ctx.fillStyle = this._grainPattern;
    ctx.fillRect(0, 0, w + 256, h + 256);
    ctx.restore();
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
  }
}
