/**
 * The reaction prompt — the on-screen half of the parry/dodge layer.
 *
 * Three readable elements, all driven from `ReactionSystem.getPrompt()`:
 *   1. a timing bar with the dodge window drawn wide and the parry window drawn
 *      narrow inside it, and a cursor sweeping left to right;
 *   2. a combo strip showing how many hits are coming and how each resolved;
 *   3. a verdict flash (PERFECT PARRY / DODGE / HIT / MISS).
 *
 * Unblockable grabs recolour the whole prompt crimson and replace the parry
 * hint, so the player never has to guess whether a hit can be parried.
 */

import { UI, panel, spacedText, text, rgba } from './theme.js';
import { worldToScreen } from '../core/project.js';
import { clamp01, easeOutCubic, easeOutBack } from '../core/easing.js';

const BAR_W = 520;
const BAR_H = 26;

const VERDICTS = {
  parry: { text: 'PERFECT PARRY', color: '#bff2ff', glow: '#2ea8d0', size: 42 },
  dodge: { text: 'DODGE', color: '#9ee8b0', glow: '#2b7a4a', size: 34 },
  hit: { text: 'HIT', color: '#e08a72', glow: '#6a1c10', size: 30 },
  miss: { text: 'MISTIMED', color: '#d6a05a', glow: '#5a3208', size: 28 },
  unblockable: { text: 'UNBLOCKABLE!', color: '#ff8a6a', glow: '#7a1400', size: 32 },
  counter: { text: 'RIPOSTE', color: '#ffcf6a', glow: '#8a3a12', size: 40 },
};

export class Prompts {
  constructor(scratchVector) {
    this._v = scratchVector;
    this.verdict = null;
    this.verdictLife = 0;
    this.verdictMax = 0.9;
    this.hitStrip = [];
    this.grabPulse = 0;
  }

  /** @param {keyof typeof VERDICTS} kind */
  flash(kind, extra = '') {
    const v = VERDICTS[kind];
    if (!v) return;
    this.verdict = { ...v, extra };
    this.verdictLife = this.verdictMax;
  }

  update(dt, prompt) {
    this.verdictLife = Math.max(0, this.verdictLife - dt);
    this.grabPulse = prompt && prompt.kind === 'grab' && !prompt.resolved
      ? Math.min(1, this.grabPulse + dt * 4)
      : Math.max(0, this.grabPulse - dt * 3);
  }

  /**
   * @param {object} prompt from ReactionSystem.getPrompt(), may be null
   * @param {Array} hits reaction.hits for the combo strip
   */
  draw(ctx, view, prompt, hits) {
    if (this.grabPulse > 0.01) this._drawGrabVignette(ctx, view);
    if (prompt && prompt.visible) {
      this._drawTargetMarker(ctx, view, prompt);
      this._drawBar(ctx, view, prompt);
      this._drawStrip(ctx, view, prompt, hits);
    }
    if (this.verdictLife > 0) this._drawVerdict(ctx, view);
  }

  // -------------------------------------------------------------------------

  _drawGrabVignette(ctx, view) {
    const a = this.grabPulse * (0.16 + Math.sin(performance.now() / 130) * 0.05);
    const g = ctx.createRadialGradient(
      view.w / 2, view.h / 2, Math.min(view.w, view.h) * 0.3,
      view.w / 2, view.h / 2, Math.max(view.w, view.h) * 0.62,
    );
    g.addColorStop(0, 'rgba(200,40,20,0)');
    g.addColorStop(1, `rgba(200,40,20,${a})`);
    ctx.save();
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.restore();
  }

  /** Chevron over the ally being struck. */
  _drawTargetMarker(ctx, view, prompt) {
    const t = prompt.target;
    if (!t || !t.alive) return;
    const p = worldToScreen(t.headAnchor(this._v), view.camera, view.w, view.h, this._v);
    if (!p.visible) return;
    const grab = prompt.kind === 'grab';
    const col = prompt.armed ? '#bff2ff' : grab ? UI.danger : UI.goldBright;
    const bob = Math.sin(performance.now() / 160) * 4;
    const s = 15 + (1 - clamp01(Math.abs(prompt.timeToCue) / 0.6)) * 7;

    ctx.save();
    ctx.translate(p.x, p.y - 26 + bob);
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    ctx.moveTo(0, s * 0.65);
    ctx.lineTo(-s * 0.6, -s * 0.35);
    ctx.lineTo(0, -s * 0.05);
    ctx.lineTo(s * 0.6, -s * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    spacedText(ctx, t.name.toUpperCase(), p.x, p.y - 44 + bob, {
      size: 10, color: col, spacing: 1.8, align: 'center', shadow: 'rgba(0,0,0,0.8)',
    });
  }

  _drawBar(ctx, view, prompt) {
    const grab = prompt.kind === 'grab';
    const x = view.w / 2 - BAR_W / 2;
    const y = view.h - 168;

    // Header: attack name and hit counter.
    const label = `${prompt.attackName.toUpperCase()}`;
    spacedText(ctx, label, view.w / 2, y - 34, {
      size: 15, weight: '600', color: grab ? UI.danger : UI.goldBright,
      spacing: 4, align: 'center', shadow: 'rgba(0,0,0,0.85)',
    });
    if (prompt.hitCount > 1) {
      spacedText(ctx, `HIT ${prompt.hitIndex + 1} OF ${prompt.hitCount}`, view.w / 2, y - 16, {
        size: 10, color: rgba(UI.parchment, 0.8), spacing: 2.6, align: 'center',
      });
    }

    ctx.save();
    panel(ctx, x - 14, y - 8, BAR_W + 28, BAR_H + 44, {
      cut: 8, alpha: 0.92, accent: grab ? UI.danger : UI.gold,
    });

    // Track.
    ctx.fillStyle = 'rgba(4,14,16,0.9)';
    ctx.fillRect(x, y, BAR_W, BAR_H);

    // Dodge window.
    const dz = prompt.dodgeZone;
    ctx.fillStyle = rgba('#4fbf8a', 0.32);
    ctx.fillRect(x + dz[0] * BAR_W, y, (dz[1] - dz[0]) * BAR_W, BAR_H);

    // Parry window (absent on grabs).
    if (!grab) {
      const pz = prompt.parryZone;
      const g = ctx.createLinearGradient(x + pz[0] * BAR_W, 0, x + pz[1] * BAR_W, 0);
      g.addColorStop(0, rgba(UI.gold, 0.5));
      g.addColorStop(0.5, rgba(UI.goldBright, 0.92));
      g.addColorStop(1, rgba(UI.gold, 0.5));
      ctx.fillStyle = g;
      ctx.fillRect(x + pz[0] * BAR_W, y, (pz[1] - pz[0]) * BAR_W, BAR_H);
    }

    // Centre line — the exact beat.
    const cx = x + prompt.centre * BAR_W;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(cx, y - 5);
    ctx.lineTo(cx, y + BAR_H + 5);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Cursor.
    const px = x + clamp01(prompt.cursor) * BAR_W;
    const near = 1 - clamp01(Math.abs(prompt.timeToCue) / 0.35);
    ctx.save();
    ctx.shadowColor = prompt.lockedOut ? UI.danger : '#ffffff';
    ctx.shadowBlur = 12 + near * 16;
    ctx.fillStyle = prompt.lockedOut ? UI.danger : '#ffffff';
    ctx.fillRect(px - 2, y - 9, 4, BAR_H + 18);
    ctx.restore();

    // Frame.
    ctx.strokeStyle = grab ? UI.danger : UI.goldDim;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(x - 0.5, y - 0.5, BAR_W + 1, BAR_H + 1);

    // Lockout shade.
    if (prompt.lockedOut) {
      ctx.fillStyle = `rgba(180,40,30,${0.28 * prompt.lockoutFrac})`;
      ctx.fillRect(x, y, BAR_W, BAR_H);
      spacedText(ctx, 'RECOVERING', view.w / 2, y + BAR_H / 2 + 5, {
        size: 12, color: '#ffb0a0', spacing: 3, align: 'center',
      });
    }

    // Key hints.
    const hintY = y + BAR_H + 26;
    if (grab) {
      spacedText(ctx, 'UNBLOCKABLE — [SHIFT] DODGE', view.w / 2, hintY, {
        size: 12, weight: '600', color: UI.danger, spacing: 3, align: 'center',
        alpha: 0.7 + Math.sin(performance.now() / 120) * 0.3,
      });
    } else {
      const armed = prompt.armed;
      spacedText(ctx, '[SPACE] PARRY', view.w / 2 - 108, hintY, {
        size: 12, weight: armed === 'parry' ? '700' : '400',
        color: armed === 'parry' ? '#bff2ff' : UI.goldBright, spacing: 2.4, align: 'center',
      });
      spacedText(ctx, '[SHIFT] DODGE', view.w / 2 + 108, hintY, {
        size: 12, weight: armed === 'dodge' ? '700' : '400',
        color: armed === 'dodge' ? '#9ee8b0' : '#7fc9a0', spacing: 2.4, align: 'center',
      });
    }
    ctx.restore();
  }

  /**
   * Row of lozenges, one per hit in the combo, coloured by outcome.
   * Sits clear above the attack name — the two must never overlap, since both
   * are read at a glance mid-wind-up.
   */
  _drawStrip(ctx, view, prompt, hits) {
    if (!hits || hits.length <= 1) return;
    const size = 13;
    const gap = 9;
    const total = hits.length * (size + gap) - gap;
    const x0 = view.w / 2 - total / 2;
    const y = view.h - 168 - 62;

    for (let i = 0; i < hits.length; i++) {
      const h = hits[i];
      const cx = x0 + i * (size + gap) + size / 2;
      const active = i === prompt.hitIndex && !h.resolved;
      let color = 'rgba(120,140,145,0.55)';
      if (h.outcome === 'parry') color = '#bff2ff';
      else if (h.outcome === 'dodge') color = '#9ee8b0';
      else if (h.outcome === 'hit') color = '#c9583f';
      else if (h.kind === 'grab') color = UI.danger;
      else if (active) color = UI.goldBright;

      ctx.save();
      ctx.translate(cx, y);
      ctx.rotate(Math.PI / 4);
      const s = active ? size * 0.62 * (1 + Math.sin(performance.now() / 110) * 0.14) : size * 0.5;
      ctx.fillStyle = color;
      ctx.globalAlpha = h.resolved ? 0.95 : active ? 1 : 0.55;
      ctx.fillRect(-s, -s, s * 2, s * 2);
      ctx.strokeStyle = 'rgba(6,18,20,0.9)';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(-s, -s, s * 2, s * 2);
      ctx.restore();
    }
  }

  /**
   * Free-aim reticle. Widens and turns gold over a weak point, and names it.
   * @param {object} targeting the TargetingSystem instance
   */
  drawAim(ctx, view, targeting, shooter) {
    if (!targeting.active) return;
    const p = targeting.screenPosition(view.w, view.h);
    const hover = targeting.hover;
    const onWeak = hover && hover.kind === 'weak';
    const col = onWeak ? UI.goldBright : hover ? UI.parchment : 'rgba(200,214,210,0.62)';
    const spin = performance.now() / 1000;
    const r = onWeak ? 26 + Math.sin(spin * 8) * 2.5 : 18;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.6;

    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.globalAlpha = 0.85;
    ctx.stroke();

    if (onWeak) {
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
      ctx.globalAlpha = 0.55;
      ctx.stroke();
      for (let i = 0; i < 4; i++) {
        ctx.save();
        ctx.rotate((i / 4) * Math.PI * 2 + spin);
        ctx.beginPath();
        ctx.moveTo(r + 5, 0);
        ctx.lineTo(r + 15, 0);
        ctx.globalAlpha = 0.95;
        ctx.lineWidth = 2.4;
        ctx.stroke();
        ctx.restore();
      }
    }

    ctx.globalAlpha = 0.95;
    ctx.lineWidth = 1.4;
    for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      ctx.beginPath();
      ctx.moveTo(ax * (r - 7), ay * (r - 7));
      ctx.lineTo(ax * (r - 1), ay * (r - 1));
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, 0, 1.8, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.restore();

    if (hover) {
      const name = onWeak ? hover.weakPoint.name.toUpperCase() : hover.enemy.name.toUpperCase();
      spacedText(ctx, name, p.x, p.y - r - 16, {
        size: 11, weight: onWeak ? '700' : '400', color: col, spacing: 2.2,
        align: 'center', shadow: 'rgba(0,0,0,0.85)',
      });
      if (onWeak) {
        spacedText(ctx, `×${hover.weakPoint.multiplier.toFixed(1)} DAMAGE`, p.x, p.y + r + 24, {
          size: 10, color: UI.goldBright, spacing: 2, align: 'center', shadow: 'rgba(0,0,0,0.85)',
        });
      }
    }

    // Instruction strip.
    const y = view.h - 78;
    panel(ctx, view.w / 2 - 230, y - 20, 460, 40, { cut: 8, alpha: 0.92 });
    spacedText(ctx, `${shooter ? shooter.aimShot.name.toUpperCase() : 'FREE AIM'}`, view.w / 2 - 210, y + 5, {
      size: 12, color: UI.goldBright, spacing: 2,
    });
    spacedText(ctx, '[MOUSE / ARROWS] AIM   [SPACE] FIRE   [ESC] CANCEL', view.w / 2 + 210, y + 5, {
      size: 10, color: rgba(UI.parchment, 0.8), spacing: 1.6, align: 'right',
    });
  }

  _drawVerdict(ctx, view) {
    const v = this.verdict;
    const u = 1 - this.verdictLife / this.verdictMax;
    const scale = u < 0.2 ? easeOutBack(u / 0.2) : 1;
    const alpha = u < 0.65 ? 1 : 1 - (u - 0.65) / 0.35;
    const y = view.h * 0.42 - easeOutCubic(u) * 26;

    ctx.save();
    ctx.globalAlpha = clamp01(alpha);
    ctx.translate(view.w / 2, y);
    ctx.scale(scale, scale);
    spacedText(ctx, v.text, 0, 0, {
      size: v.size, weight: '700', color: v.color, spacing: 6, align: 'center',
      shadow: v.glow,
    });
    if (v.extra) {
      spacedText(ctx, v.extra, 0, v.size * 0.78, {
        size: 14, color: rgba(UI.parchment, 0.9), spacing: 3, align: 'center',
      });
    }
    ctx.restore();
  }
}
