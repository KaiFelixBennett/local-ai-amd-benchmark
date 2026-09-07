/**
 * Overworld HUD: objective tracker, waypoint markers, interaction prompt,
 * cutscene subtitles, letterbox and the area title card.
 *
 * Drawn on the same 2D overlay the battle uses and with the same gilded theme,
 * so crossing between exploration and combat never looks like two games.
 */

import { UI, panel, spacedText, text, divider, rgba, bar } from '../ui/theme.js';
import { worldToScreen } from '../core/project.js';
import { clamp01, easeOutCubic } from '../core/easing.js';

export class ExploreHUD {
  constructor(scratchVector) {
    this._v = scratchVector;
    this.titleCard = null;
    this.titleLife = 0;
    this.toast = '';
    this.toastLife = 0;
    this.objectiveFlash = 0;
    this.time = 0;
  }

  showTitleCard(title, subtitle, duration = 5.0) {
    this.titleCard = { title, subtitle };
    this.titleLife = duration;
    this.titleMax = duration;
  }

  showToast(msg, duration = 3.0) {
    this.toast = msg;
    this.toastLife = duration;
    this.toastMax = duration;
  }

  flashObjective() {
    this.objectiveFlash = 1.4;
  }

  update(dt) {
    this.time += dt;
    this.titleLife = Math.max(0, this.titleLife - dt);
    this.toastLife = Math.max(0, this.toastLife - dt);
    this.objectiveFlash = Math.max(0, this.objectiveFlash - dt);
  }

  /**
   * @param {object} model {
   *   objective, seals, gate, prompt, party, subtitle, letterbox, fade,
   *   showControls, paused
   * }
   */
  draw(ctx, view, model) {
    if (model.letterbox > 0.005) this._letterbox(ctx, view, model.letterbox);

    if (!model.cinematic) {
      this._waypoints(ctx, view, model);
      this._objective(ctx, view, model);
      this._party(ctx, view, model);
      if (model.prompt) this._prompt(ctx, view, model.prompt);
      if (model.showControls) this._controls(ctx, view);
    }

    if (this.titleLife > 0) this._titleCard(ctx, view);
    if (this.toastLife > 0) this._toast(ctx, view);
    if (model.subtitle) this._subtitle(ctx, view, model.subtitle, model.letterbox);
    if (model.fade > 0.001) {
      ctx.save();
      ctx.globalAlpha = clamp01(model.fade);
      ctx.fillStyle = '#03090a';
      ctx.fillRect(0, 0, view.w, view.h);
      ctx.restore();
    }
  }

  // -------------------------------------------------------------------------

  _letterbox(ctx, view, amount) {
    const h = view.h * 0.12 * amount;
    ctx.save();
    ctx.fillStyle = '#03090a';
    ctx.fillRect(0, 0, view.w, h);
    ctx.fillRect(0, view.h - h, view.w, h);
    ctx.restore();
  }

  /** Objective tracker, top-left. */
  _objective(ctx, view, model) {
    const obj = model.objective;
    if (!obj) return;
    const x = 22;
    const y = 22;
    const w = 322;
    const done = model.seals.filter((s) => s.broken).length;
    const showProgress = obj.id === 'breakSeals';
    const h = showProgress ? 96 : 72;

    const flash = this.objectiveFlash > 0
      ? 0.5 + Math.sin(this.objectiveFlash * 22) * 0.5
      : 0;

    ctx.save();
    panel(ctx, x, y, w, h, {
      cut: 10,
      accent: flash > 0.4 ? UI.goldBright : UI.goldDim,
    });
    spacedText(ctx, 'OBJECTIVE', x + 18, y + 22, {
      size: 10, color: rgba(UI.gold, 0.75), spacing: 2.8,
    });
    divider(ctx, x + 16, y + 30, w - 32);
    this._wrap(ctx, obj.title, x + 18, y + 48, w - 36, 17, {
      size: 14, weight: '600', color: UI.goldBright,
    });
    if (obj.hint) {
      this._wrap(ctx, obj.hint, x + 18, y + (showProgress ? 66 : 64), w - 36, 14, {
        size: 11.5, color: rgba(UI.parchment, 0.75),
      });
    }
    if (showProgress) {
      bar(ctx, x + 18, y + h - 20, w - 36, 8, done / Math.max(1, model.seals.length), {
        fill: UI.gradient, back: 'rgba(40,36,14,0.8)', segments: model.seals.length, skew: 3,
      });
      text(ctx, `${done} / ${model.seals.length}`, x + w - 18, y + h - 24, {
        size: 10, color: UI.goldBright, align: 'right',
      });
    }
    ctx.restore();
  }

  /** Party health strip, bottom-left — carries attrition between fights. */
  _party(ctx, view, model) {
    if (!model.party || model.party.length === 0) return;
    const w = 214;
    const rowH = 34;
    const x = 22;
    let y = view.h - 22 - model.party.length * rowH;

    ctx.save();
    panel(ctx, x - 4, y - 12, w + 8, model.party.length * rowH + 18, { cut: 8, alpha: 0.9 });
    for (const c of model.party) {
      const dead = !c.alive;
      ctx.globalAlpha = dead ? 0.45 : 1;
      spacedText(ctx, c.name.toUpperCase(), x + 8, y + 12, {
        size: 10, color: dead ? rgba(UI.parchment, 0.6) : UI.parchment, spacing: 1.3,
      });
      bar(ctx, x + 8, y + 17, w - 20, 7, c.hpFrac, {
        fill: c.hpFrac < 0.3 ? UI.hpLow : UI.hp, back: UI.hpBack, skew: 3,
      });
      ctx.globalAlpha = 1;
      y += rowH;
    }
    ctx.restore();
  }

  /**
   * Objective waypoints: a diamond over each live target, clamped to the screen
   * edge with an arrow when it is behind you.
   */
  _waypoints(ctx, view, model) {
    const targets = [];
    for (const s of model.seals) {
      if (!s.broken) targets.push({ pos: s.position, label: s.def.name, color: s.def.color, y: 9.4 });
    }
    if (model.gate && model.gate.open) {
      targets.push({ pos: model.gate.position, label: 'The Curator', color: model.gate.def.color, y: 9 });
    }

    for (const t of targets) {
      this._v.set(t.pos.x, t.pos.y + t.y, t.pos.z);
      const p = worldToScreen(this._v, view.camera, view.w, view.h, this._v);
      const dist = Math.hypot(
        t.pos.x - model.playerPos.x, t.pos.z - model.playerPos.z,
      );
      const bob = Math.sin(this.time * 2.4) * 3;

      if (p.visible && p.x > 40 && p.x < view.w - 40 && p.y > 60 && p.y < view.h - 80) {
        ctx.save();
        ctx.globalAlpha = 0.92;
        ctx.translate(p.x, p.y + bob);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = t.color;
        ctx.fillRect(-6, -6, 12, 12);
        ctx.strokeStyle = 'rgba(6,18,20,0.85)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-6, -6, 12, 12);
        ctx.restore();
        spacedText(ctx, t.label.toUpperCase(), p.x, p.y - 16 + bob, {
          size: 10, color: t.color, spacing: 1.6, align: 'center', shadow: 'rgba(0,0,0,0.85)',
        });
        text(ctx, `${Math.round(dist)} m`, p.x, p.y + 22 + bob, {
          size: 10, color: rgba(UI.parchment, 0.8), align: 'center', stroke: 'rgba(0,0,0,0.7)', strokeWidth: 2.5,
        });
      } else {
        // Off-screen: clamp to a ring and point at it.
        const cx = view.w / 2;
        const cy = view.h / 2;
        let dx = p.x - cx;
        let dy = p.y - cy;
        if (!p.visible) { dx = -dx; dy = -dy; }
        const len = Math.hypot(dx, dy) || 1;
        const radius = Math.min(view.w, view.h) * 0.36;
        const ex = cx + (dx / len) * radius;
        const ey = cy + (dy / len) * radius;
        ctx.save();
        ctx.globalAlpha = 0.7;
        ctx.translate(ex, ey);
        ctx.rotate(Math.atan2(dy, dx));
        ctx.fillStyle = t.color;
        ctx.beginPath();
        ctx.moveTo(11, 0);
        ctx.lineTo(-7, 7);
        ctx.lineTo(-3, 0);
        ctx.lineTo(-7, -7);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        text(ctx, `${Math.round(dist)} m`, ex, ey + 20, {
          size: 10, color: rgba(t.color, 0.9), align: 'center', stroke: 'rgba(0,0,0,0.7)', strokeWidth: 2.5,
        });
      }
    }
  }

  /** Interaction prompt above the player's head area. */
  _prompt(ctx, view, prompt) {
    const w = 400;
    const x = view.w / 2 - w / 2;
    const y = view.h - 168;
    const pulse = 0.75 + Math.sin(this.time * 4) * 0.25;

    ctx.save();
    panel(ctx, x, y, w, 76, { cut: 10, accent: prompt.color || UI.gold });
    spacedText(ctx, prompt.title.toUpperCase(), view.w / 2, y + 26, {
      size: 14, weight: '600', color: prompt.color || UI.goldBright, spacing: 3, align: 'center',
    });
    if (prompt.lore) {
      this._wrapCentred(ctx, prompt.lore, view.w / 2, y + 44, w - 44, 14, {
        size: 11.5, color: rgba(UI.parchment, 0.8),
      });
    }
    ctx.globalAlpha = pulse;
    spacedText(ctx, prompt.action || '[E]  ENGAGE', view.w / 2, y + 66, {
      size: 12, weight: '600', color: UI.goldBright, spacing: 3, align: 'center',
    });
    ctx.restore();
  }

  _controls(ctx, view) {
    spacedText(
      ctx,
      '[W A S D] MOVE   [SHIFT] SPRINT   [MOUSE / Q E] LOOK   [E] INTERACT   [WHEEL] ZOOM',
      view.w / 2, view.h - 20,
      { size: 10, color: rgba(UI.gold, 0.55), spacing: 2, align: 'center' },
    );
  }

  _titleCard(ctx, view) {
    const u = 1 - this.titleLife / this.titleMax;
    const alpha = Math.min(clamp01(u / 0.12), clamp01((1 - u) / 0.25));
    const slide = (1 - easeOutCubic(clamp01(u / 0.3))) * 30;
    const y = view.h * 0.62;

    ctx.save();
    ctx.globalAlpha = alpha;
    divider(ctx, view.w / 2 - 220, y - 26, 440, { alpha: alpha * 0.9 });
    spacedText(ctx, this.titleCard.title, view.w / 2 + slide, y + 4, {
      size: 32, color: UI.goldBright, spacing: 9, align: 'center', shadow: 'rgba(0,0,0,0.85)',
    });
    if (this.titleCard.subtitle) {
      spacedText(ctx, this.titleCard.subtitle, view.w / 2 - slide, y + 28, {
        size: 12, color: rgba(UI.parchment, 0.9), spacing: 4.5, align: 'center',
      });
    }
    divider(ctx, view.w / 2 - 220, y + 44, 440, { alpha: alpha * 0.9 });
    ctx.restore();
  }

  _toast(ctx, view) {
    const alpha = Math.min(1, this.toastLife / 0.6);
    const w = Math.max(260, this.toast.length * 8.6 + 52);
    const y = 132;
    ctx.save();
    ctx.globalAlpha = alpha;
    panel(ctx, view.w / 2 - w / 2, y - 18, w, 38, { cut: 8, alpha: 0.94 });
    spacedText(ctx, this.toast, view.w / 2, y + 6, {
      size: 12, color: UI.goldBright, spacing: 2, align: 'center',
    });
    ctx.restore();
  }

  _subtitle(ctx, view, sub, letterbox) {
    const barH = view.h * 0.12 * Math.max(letterbox, 0.6);
    const y = view.h - barH * 0.5;
    ctx.save();
    ctx.globalAlpha = clamp01(sub.alpha);
    if (sub.speaker) {
      spacedText(ctx, sub.speaker.toUpperCase(), view.w / 2, y - 16, {
        size: 11, color: UI.gold, spacing: 3, align: 'center',
      });
    }
    this._wrapCentred(ctx, sub.text, view.w / 2, y + 8, Math.min(920, view.w - 140), 24, {
      size: 19, color: UI.parchment, stroke: 'rgba(0,0,0,0.8)', strokeWidth: 4,
    });
    ctx.restore();
  }

  // -------------------------------------------------------------------------

  _wrap(ctx, str, x, y, maxW, lineH, opts) {
    ctx.save();
    ctx.font = `${opts.weight || '400'} ${opts.size}px ${UI.serif}`;
    const words = String(str).split(' ');
    let line = '';
    let ly = y;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxW && line) {
        text(ctx, line, x, ly, opts);
        line = word;
        ly += lineH;
      } else line = test;
    }
    if (line) text(ctx, line, x, ly, opts);
    ctx.restore();
  }

  _wrapCentred(ctx, str, cx, y, maxW, lineH, opts) {
    ctx.save();
    ctx.font = `${opts.weight || '400'} ${opts.size}px ${UI.serif}`;
    const words = String(str).split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxW && line) {
        lines.push(line);
        line = word;
      } else line = test;
    }
    if (line) lines.push(line);
    lines.forEach((l, i) => {
      text(ctx, l, cx, y + i * lineH, { ...opts, align: 'center' });
    });
    ctx.restore();
  }
}
