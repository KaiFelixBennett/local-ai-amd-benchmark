/**
 * Floating combat text, drawn on the 2D HUD overlay from projected world
 * positions. Crits, weaknesses, heals, statuses and reaction verdicts each get
 * their own styling so the numbers themselves carry information.
 */

import { worldToScreen } from '../core/project.js';
import { clamp01, easeOutCubic, easeOutBack, lerp } from '../core/easing.js';

const STYLES = {
  damage: { color: '#f3ead2', size: 30, weight: '400' },
  crit: { color: '#ffd772', size: 44, weight: '700', shadow: '#c2521c' },
  weak: { color: '#ffe9a8', size: 38, weight: '600', shadow: '#a8412a' },
  resist: { color: '#8fa8b4', size: 24, weight: '400' },
  heal: { color: '#a8e07a', size: 32, weight: '600' },
  ap: { color: '#8fd4e8', size: 24, weight: '600' },
  status: { color: '#e0a0d0', size: 22, weight: '600' },
  parry: { color: '#bff2ff', size: 40, weight: '700', shadow: '#1d5f78' },
  dodge: { color: '#9ee8b0', size: 32, weight: '600' },
  miss: { color: '#c9a0a0', size: 26, weight: '400' },
  counter: { color: '#ffcf6a', size: 42, weight: '700', shadow: '#8a3a12' },
  break: { color: '#ff9a4a', size: 44, weight: '700', shadow: '#6a2000' },
};

export class DamageNumbers {
  constructor(scratchVector) {
    this.items = [];
    this._v = scratchVector;
    this._lane = 0;
  }

  /**
   * @param {THREE.Vector3} worldPos anchor at spawn time (copied)
   * @param {string} text
   * @param {keyof typeof STYLES} kind
   */
  spawn(worldPos, text, kind = 'damage', opts = {}) {
    const style = STYLES[kind] || STYLES.damage;
    // Fan successive numbers sideways so a multi-hit flurry stays readable.
    this._lane = (this._lane + 1) % 5;
    this.items.push({
      pos: worldPos.clone(),
      text: String(text),
      style,
      kind,
      life: opts.life || (kind === 'crit' || kind === 'counter' || kind === 'break' ? 1.5 : 1.15),
      maxLife: opts.life || (kind === 'crit' || kind === 'counter' || kind === 'break' ? 1.5 : 1.15),
      driftX: (this._lane - 2) * 16 + (Math.random() - 0.5) * 10,
      rise: opts.rise || 62,
      scaleFrom: opts.pop ? 1.9 : 1.25,
    });
    if (this.items.length > 42) this.items.shift();
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      this.items[i].life -= dt;
      if (this.items[i].life <= 0) this.items.splice(i, 1);
    }
  }

  draw(ctx, camera, width, height) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const it of this.items) {
      const p = worldToScreen(it.pos, camera, width, height, this._v);
      if (!p.visible) continue;
      const u = 1 - it.life / it.maxLife;
      const rise = easeOutCubic(u) * it.rise;
      const alpha = u < 0.75 ? 1 : 1 - (u - 0.75) / 0.25;
      const scale = u < 0.22
        ? lerp(it.scaleFrom, 1, easeOutBack(u / 0.22))
        : 1;

      const x = p.x + it.driftX * easeOutCubic(u);
      const y = p.y - rise;
      const s = it.style;
      ctx.globalAlpha = clamp01(alpha);
      ctx.font = `${s.weight} ${Math.round(s.size * scale)}px Georgia, "Times New Roman", serif`;

      if (s.shadow) {
        ctx.lineWidth = 5;
        ctx.strokeStyle = s.shadow;
        ctx.strokeText(it.text, x, y);
      }
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(6,16,18,0.85)';
      ctx.strokeText(it.text, x, y);
      ctx.fillStyle = s.color;
      ctx.fillText(it.text, x, y);
    }
    ctx.restore();
  }

  clear() {
    this.items.length = 0;
  }
}
