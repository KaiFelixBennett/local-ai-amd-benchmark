/**
 * The persistent heads-up display: party plates, the turn queue preview,
 * enemy nameplates projected into the world, the gradient (ultimate) meter and
 * the flow streak readout.
 *
 * Draws to the 2D overlay canvas; owns no state beyond the smoothing values it
 * needs to make bars lag prettily behind the truth.
 */

import { UI, panel, bar, pips, badge, spacedText, text, divider, rgba, portrait } from './theme.js';
import { STATUS_DEFS, ECONOMY } from '../battle/action-resolver.js';
import { worldToScreen } from '../core/project.js';
import { clamp01, damp, lerp, easeOutCubic } from '../core/easing.js';

const PLATE_W = 268;
const PLATE_H = 74;

export class HUD {
  constructor(scratchVector) {
    this._v = scratchVector;
    this.ghost = new Map();     // combatant id -> lagging hp fraction
    this.apGlow = new Map();
    this.gradientShown = 0;
    this.bannerText = '';
    this.bannerSub = '';
    this.bannerLife = 0;
    this.bannerMax = 1;
    this.toast = '';
    this.toastLife = 0;
  }

  showBanner(title, subtitle, duration = 2.6) {
    this.bannerText = title;
    this.bannerSub = subtitle || '';
    this.bannerLife = duration;
    this.bannerMax = duration;
  }

  showToast(msg, duration = 2.0) {
    this.toast = msg;
    this.toastLife = duration;
  }

  update(dt, combatants, gradient) {
    for (const c of combatants) {
      const cur = this.ghost.get(c.id);
      const target = c.hpFrac;
      if (cur === undefined) this.ghost.set(c.id, target);
      else this.ghost.set(c.id, cur < target ? target : damp(cur, target, 3.2, dt));
      const glow = this.apGlow.get(c.id) || 0;
      this.apGlow.set(c.id, Math.max(0, glow - dt * 2));
    }
    this.gradientShown = damp(this.gradientShown, gradient, 5, dt);
    this.bannerLife = Math.max(0, this.bannerLife - dt);
    this.toastLife = Math.max(0, this.toastLife - dt);
  }

  pulseAp(combatant) {
    this.apGlow.set(combatant.id, 1);
  }

  /**
   * @param {object} ctx 2D context
   * @param {object} view { w, h, camera }
   * @param {object} model { party, enemies, upcoming, actor, gradient, flow,
   *                         ultimateReady, wave, waveCount, difficulty }
   */
  draw(ctx, view, model) {
    this._drawPartyPlates(ctx, view, model);
    this._drawTurnQueue(ctx, view, model);
    this._drawEnemyPlates(ctx, view, model);
    this._drawGradient(ctx, view, model);
    this._drawWaveTag(ctx, view, model);
    if (model.flow > 1) this._drawFlow(ctx, view, model);
    if (this.bannerLife > 0) this._drawBanner(ctx, view);
    if (this.toastLife > 0) this._drawToast(ctx, view);
  }

  // -------------------------------------------------------------------------

  _drawPartyPlates(ctx, view, model) {
    const x = 22;
    let y = view.h - 22 - model.party.length * (PLATE_H + 8);
    for (const c of model.party) {
      this._drawPartyPlate(ctx, x, y, c, c === model.actor);
      y += PLATE_H + 8;
    }
  }

  _drawPartyPlate(ctx, x, y, c, active) {
    const dead = !c.alive;
    ctx.save();
    ctx.globalAlpha = dead ? 0.5 : 1;
    panel(ctx, x, y, PLATE_W, PLATE_H, {
      accent: active ? UI.goldBright : UI.goldDim,
      tint: active ? 'rgba(20,48,52,0.9)' : 'rgba(8,26,29,0.82)',
    });

    portrait(ctx, x + 32, y + PLATE_H / 2, 22, c.name.charAt(0), c.tint, { active, dead });

    const tx = x + 62;
    spacedText(ctx, c.name.toUpperCase(), tx, y + 20, {
      size: 12, weight: '600', color: active ? UI.goldBright : UI.parchment, spacing: 1.6,
    });
    text(ctx, `Lv ${c.level}`, x + PLATE_W - 12, y + 20, {
      size: 11, color: UI.goldDim, align: 'right',
    });

    const bw = PLATE_W - 62 - 14;
    const ghost = this.ghost.get(c.id);
    bar(ctx, tx, y + 27, bw, 11, c.hpFrac, {
      fill: c.hpFrac < 0.3 ? UI.hpLow : UI.hp,
      ghost,
      back: UI.hpBack,
      glow: c.hpFrac < 0.3 ? 0.6 + Math.sin(performance.now() / 200) * 0.3 : 0,
    });
    text(ctx, `${Math.max(0, Math.round(c.hp))}/${c.maxHp}`, tx + bw - 3, y + 36, {
      size: 10, color: 'rgba(240,230,205,0.9)', align: 'right', stroke: 'rgba(0,0,0,0.6)', strokeWidth: 2.5,
    });

    pips(ctx, tx, y + 50, c.ap, c.maxAp, {
      size: 5.5, gap: 3.2, color: UI.ap,
      glowIndex: (this.apGlow.get(c.id) || 0) > 0 ? c.ap - 1 : -1,
    });

    // Status icons run along the bottom edge.
    let sx = x + PLATE_W - 16;
    for (const s of c.statuses.slice(0, 6)) {
      const def = STATUS_DEFS[s.id];
      if (!def) continue;
      badge(ctx, sx, y + PLATE_H - 15, 8, def.glyph, def.color, { count: s.turns });
      sx -= 20;
    }
    ctx.restore();
  }

  // -------------------------------------------------------------------------

  _drawTurnQueue(ctx, view, model) {
    const items = model.upcoming.slice(0, 8);
    if (items.length === 0) return;
    const size = 40;
    const gap = 8;
    const totalW = items.length * (size + gap) - gap + 92;
    const x0 = view.w / 2 - totalW / 2;
    const y = 18;

    panel(ctx, x0 - 10, y - 6, totalW + 20, size + 26, { cut: 8, alpha: 0.94 });
    spacedText(ctx, 'ORDER OF ACTION', x0 + 6, y + 14, {
      size: 10, color: UI.goldDim, spacing: 2.2,
    });

    let x = x0 + 92;
    items.forEach((entry, i) => {
      const c = entry.combatant;
      const isNext = i === 0;
      const r = size / 2 - (isNext ? 0 : 3);
      const cy = y + 14 + size / 2 - 2;
      ctx.save();
      ctx.globalAlpha = lerp(1, 0.45, i / Math.max(1, items.length - 1));
      portrait(ctx, x + size / 2, cy, r, c.name.charAt(0), c.tint, { active: isNext });
      if (c.side === 'enemy') {
        ctx.beginPath();
        ctx.arc(x + size / 2, cy, r + 4.5, -0.4, 0.4);
        ctx.strokeStyle = rgba(UI.enemy, 0.85);
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      if (c.staggered) {
        text(ctx, '✹', x + size / 2 + r * 0.75, cy - r * 0.75, {
          size: 13, color: UI.breakBar, align: 'center', baseline: 'middle',
        });
      }
      ctx.restore();
      x += size + gap;
    });
  }

  // -------------------------------------------------------------------------

  _drawEnemyPlates(ctx, view, model) {
    for (const e of model.enemies) {
      if (!e.alive && e.dissolve > 0.85) continue;
      const p = worldToScreen(e.headAnchor(this._v), view.camera, view.w, view.h, this._v);
      if (!p.visible) continue;
      const w = e.isBoss ? 210 : 152;
      const x = p.x - w / 2;
      const y = p.y - 46;
      const alpha = e.alive ? 1 : 1 - e.dissolve;

      ctx.save();
      ctx.globalAlpha = alpha;
      panel(ctx, x, y, w, e.isBoss ? 44 : 36, { cut: 6, alpha: 0.86, accent: rgba(e.tint, 0.8) });
      spacedText(ctx, e.name.toUpperCase(), x + w / 2, y + 14, {
        size: e.isBoss ? 11 : 10, color: UI.parchment, spacing: 1.4, align: 'center',
      });
      bar(ctx, x + 8, y + 19, w - 16, 7, e.hpFrac, {
        fill: UI.enemy, ghost: this.ghost.get(e.id), back: 'rgba(50,16,14,0.8)', skew: 3,
      });
      if (e.breakMax > 0) {
        bar(ctx, x + 8, y + 28, w - 16, 4, e.staggered ? 1 : e.breakFrac, {
          fill: e.staggered ? '#ffd772' : UI.breakBar, back: 'rgba(40,30,10,0.8)',
          border: null, skew: 2, glow: e.staggered ? 1 : 0,
        });
      }
      if (e.isBoss) {
        text(ctx, `PHASE ${e.phase}`, x + w - 8, y + 40, {
          size: 9, color: e.phase === 2 ? UI.danger : UI.goldDim, align: 'right',
        });
      }
      if (e.staggered) {
        spacedText(ctx, 'BROKEN', x + 10, y + 40, { size: 9, color: '#ffd772', spacing: 2 });
      }

      let sx = x + w / 2 - (e.statuses.length - 1) * 10;
      for (const s of e.statuses.slice(0, 6)) {
        const def = STATUS_DEFS[s.id];
        if (!def) continue;
        badge(ctx, sx, y + (e.isBoss ? 54 : 46), 7.5, def.glyph, def.color, { count: s.turns });
        sx += 20;
      }
      ctx.restore();
    }
  }

  // -------------------------------------------------------------------------

  _drawGradient(ctx, view, model) {
    const w = 300;
    const h = 16;
    const x = view.w / 2 - w / 2;
    const y = view.h - 40;
    const frac = clamp01(this.gradientShown / ECONOMY.GRADIENT_MAX);
    const ready = model.ultimateReady;

    panel(ctx, x - 12, y - 16, w + 24, h + 30, { cut: 8, alpha: 0.9, accent: ready ? UI.goldBright : UI.goldDim });
    spacedText(ctx, 'GRADIENT', x, y - 4, { size: 10, color: ready ? UI.goldBright : UI.goldDim, spacing: 2.6 });
    text(ctx, `${Math.round(this.gradientShown)}%`, x + w, y - 4, {
      size: 11, color: ready ? UI.goldBright : UI.parchment, align: 'right',
    });
    bar(ctx, x, y, w, h, frac, {
      fill: UI.gradient, back: 'rgba(50,40,10,0.7)', segments: 4,
      glow: ready ? 0.8 + Math.sin(performance.now() / 160) * 0.2 : 0.15,
    });
    if (ready) {
      spacedText(ctx, 'OVERTURE READY — [U]', x + w / 2, y + h + 15, {
        size: 10, color: UI.goldBright, spacing: 2.4, align: 'center',
        alpha: 0.7 + Math.sin(performance.now() / 220) * 0.3,
      });
    }
  }

  _drawFlow(ctx, view, model) {
    const x = view.w / 2;
    const y = view.h - 92;
    const pulse = 0.85 + Math.sin(performance.now() / 130) * 0.15;
    ctx.save();
    ctx.globalAlpha = pulse;
    spacedText(ctx, `FLOW ×${model.flow}`, x, y, {
      size: 20, weight: '700', color: UI.goldBright, spacing: 3.4, align: 'center',
      shadow: 'rgba(0,0,0,0.7)',
    });
    ctx.restore();
  }

  _drawWaveTag(ctx, view, model) {
    const label = `APPROACH ${model.wave + 1} / ${model.waveCount}`;
    spacedText(ctx, label, view.w - 22, 26, {
      size: 11, color: UI.gold, spacing: 2.6, align: 'right', shadow: 'rgba(0,0,0,0.7)',
    });
    spacedText(ctx, model.difficulty, view.w - 22, 44, {
      size: 10, color: rgba(UI.gold, 0.75), spacing: 2.2, align: 'right', shadow: 'rgba(0,0,0,0.7)',
    });
  }

  // -------------------------------------------------------------------------

  _drawBanner(ctx, view) {
    const u = 1 - this.bannerLife / this.bannerMax;
    const inA = clamp01(u / 0.14);
    const outA = clamp01((1 - u) / 0.2);
    const alpha = Math.min(inA, outA);
    const slide = (1 - easeOutCubic(inA)) * 46;
    const y = view.h * 0.3;

    ctx.save();
    ctx.globalAlpha = alpha;
    const g = ctx.createLinearGradient(0, y - 54, 0, y + 46);
    g.addColorStop(0, 'rgba(6,20,22,0)');
    g.addColorStop(0.5, 'rgba(6,20,22,0.72)');
    g.addColorStop(1, 'rgba(6,20,22,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, y - 54, view.w, 100);

    divider(ctx, view.w / 2 - 200, y - 26, 400, { alpha: alpha * 0.8 });
    spacedText(ctx, this.bannerText, view.w / 2 + slide, y + 8, {
      size: 34, weight: '400', color: UI.goldBright, spacing: 8, align: 'center',
      shadow: 'rgba(0,0,0,0.8)',
    });
    if (this.bannerSub) {
      spacedText(ctx, this.bannerSub, view.w / 2 - slide, y + 32, {
        size: 13, color: UI.parchment, spacing: 4, align: 'center', alpha: 0.85,
      });
    }
    divider(ctx, view.w / 2 - 200, y + 44, 400, { alpha: alpha * 0.8 });
    ctx.restore();
  }

  _drawToast(ctx, view) {
    const alpha = clamp01(this.toastLife / 0.5);
    const y = 108;
    ctx.save();
    ctx.globalAlpha = alpha;
    const w = Math.max(220, this.toast.length * 8.4 + 40);
    panel(ctx, view.w / 2 - w / 2, y - 16, w, 32, { cut: 6, alpha: 0.9 });
    spacedText(ctx, this.toast, view.w / 2, y + 5, {
      size: 12, color: UI.parchment, spacing: 1.8, align: 'center',
    });
    ctx.restore();
  }
}
