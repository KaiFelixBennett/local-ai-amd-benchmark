/**
 * Modal screens: the pre-battle loadout, the between-wave expedition journal
 * (XP, level-ups, newly learned skills) and the victory / defeat cards.
 *
 * One class owns all of them because they share navigation, layout and framing;
 * `mode` selects which is live and `confirm()` returns a command string that
 * game.js acts on.
 */

import { UI, panel, spacedText, text, divider, rgba, bar, portrait } from './theme.js';
import { LUMINAS, LUMINA_SLOTS } from '../data/luminas.js';
import { DIFFICULTY } from '../battle/reaction-system.js';
import { clamp01 } from '../core/easing.js';

const DIFF_KEYS = Object.keys(DIFFICULTY);

export class Screens {
  constructor() {
    this.mode = 'loadout';
    this.index = 0;
    this.items = [];
    this.rects = [];
    this.appear = 0;
    this.result = null;      // payload for intermission / victory / defeat
    this._buildLoadoutItems();
  }

  _buildLoadoutItems() {
    this.items = [
      { kind: 'difficulty' },
      { kind: 'seed' },
      ...LUMINAS.map((l) => ({ kind: 'lumina', lumina: l })),
      { kind: 'begin' },
    ];
  }

  setMode(mode, result = null) {
    this.mode = mode;
    this.result = result;
    this.appear = 0;
    if (mode === 'loadout') {
      this.index = this.items.length - 1;
      this._buildLoadoutItems();
      this.index = 0;
    }
  }

  get active() {
    return this.mode !== 'none';
  }

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------

  move(dir) {
    if (this.mode !== 'loadout') return false;
    this.index = (this.index + dir + this.items.length) % this.items.length;
    return true;
  }

  /**
   * @returns {{cmd:string, value?:any}|null}
   */
  adjust(dir, state) {
    if (this.mode !== 'loadout') return null;
    const it = this.items[this.index];
    if (!it) return null;
    if (it.kind === 'difficulty') {
      const i = DIFF_KEYS.indexOf(state.difficulty);
      const next = DIFF_KEYS[(i + dir + DIFF_KEYS.length) % DIFF_KEYS.length];
      return { cmd: 'difficulty', value: next };
    }
    if (it.kind === 'seed') return { cmd: 'seed', value: dir };
    return null;
  }

  confirm(state) {
    if (this.mode === 'loadout') {
      const it = this.items[this.index];
      if (!it) return null;
      if (it.kind === 'begin') return { cmd: 'start' };
      if (it.kind === 'lumina') return { cmd: 'toggle-lumina', value: it.lumina.id };
      if (it.kind === 'seed') return { cmd: 'seed', value: 1 };
      if (it.kind === 'difficulty') {
        const i = DIFF_KEYS.indexOf(state.difficulty);
        return { cmd: 'difficulty', value: DIFF_KEYS[(i + 1) % DIFF_KEYS.length] };
      }
    }
    if (this.mode === 'intermission') return { cmd: 'advance' };
    if (this.mode === 'victory' || this.mode === 'defeat') return { cmd: 'restart' };
    return null;
  }

  hitTest(x, y) {
    for (let i = 0; i < this.rects.length; i++) {
      const r = this.rects[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
    }
    return -1;
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  draw(ctx, view, state, dt) {
    if (this.mode === 'none') return;
    this.appear = Math.min(1, this.appear + dt * 2.4);
    ctx.save();
    ctx.globalAlpha = this.appear;
    this._scrim(ctx, view);
    if (this.mode === 'loadout') this._drawLoadout(ctx, view, state);
    else if (this.mode === 'intermission') this._drawIntermission(ctx, view, state);
    else if (this.mode === 'victory') this._drawEnd(ctx, view, state, true);
    else if (this.mode === 'defeat') this._drawEnd(ctx, view, state, false);
    ctx.restore();
  }

  _scrim(ctx, view) {
    const g = ctx.createRadialGradient(
      view.w / 2, view.h / 2, 0, view.w / 2, view.h / 2, Math.max(view.w, view.h) * 0.72,
    );
    g.addColorStop(0, 'rgba(4,14,16,0.78)');
    g.addColorStop(1, 'rgba(2,8,9,0.94)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, view.w, view.h);
  }

  _title(ctx, view, title, subtitle, y = 74) {
    spacedText(ctx, title, view.w / 2, y, {
      size: 34, color: UI.goldBright, spacing: 10, align: 'center', shadow: 'rgba(0,0,0,0.8)',
    });
    divider(ctx, view.w / 2 - 230, y + 18, 460);
    if (subtitle) {
      spacedText(ctx, subtitle, view.w / 2, y + 44, {
        size: 13, color: rgba(UI.parchment, 0.85), spacing: 4, align: 'center',
      });
    }
  }

  // ---- Loadout -----------------------------------------------------------

  _drawLoadout(ctx, view, state) {
    this.rects.length = 0;
    this._title(ctx, view, 'GILDED REQUIEM', 'EXPEDITION LOADOUT');

    const colW = Math.min(430, view.w * 0.34);
    const leftX = view.w / 2 - colW - 18;
    const rightX = view.w / 2 + 18;
    const top = 150;

    this._drawRoster(ctx, leftX, top, colW, state);
    this._drawOptions(ctx, rightX, top, colW, view, state);

    spacedText(ctx, '[↑ ↓] SELECT   [← →] ADJUST   [ENTER] CONFIRM', view.w / 2, view.h - 40, {
      size: 11, color: rgba(UI.gold, 0.7), spacing: 2.6, align: 'center',
    });
  }

  _drawRoster(ctx, x, y, w, state) {
    panel(ctx, x, y, w, 340, { cut: 12 });
    spacedText(ctx, 'THE EXPEDITION', x + 20, y + 28, { size: 13, color: UI.goldBright, spacing: 3 });
    divider(ctx, x + 18, y + 38, w - 36);

    let ry = y + 58;
    for (const c of state.party) {
      portrait(ctx, x + 44, ry + 26, 24, c.name.charAt(0), c.tint, {});
      spacedText(ctx, c.name.toUpperCase(), x + 78, ry + 16, {
        size: 12, weight: '600', color: UI.parchment, spacing: 1.8,
      });
      text(ctx, c.title, x + 78, ry + 32, { size: 11, color: rgba(UI.gold, 0.8) });
      text(ctx, `Lv ${c.level}`, x + w - 20, ry + 16, { size: 11, color: UI.goldDim, align: 'right' });

      const sx = x + 78;
      const statY = ry + 48;
      const stats = [['HP', c.maxHp], ['ATK', c.stats.atk], ['DEF', c.stats.def], ['SPD', c.stats.spd]];
      let sxi = sx;
      for (const [label, val] of stats) {
        text(ctx, label, sxi, statY, { size: 9, color: rgba(UI.parchment, 0.55) });
        text(ctx, String(val), sxi, statY + 13, { size: 12, weight: '600', color: UI.parchment });
        sxi += 58;
      }
      ry += 92;
    }
  }

  _drawOptions(ctx, x, y, w, view, state) {
    const h = 348;
    panel(ctx, x, y, w, h, { cut: 12 });
    spacedText(ctx, 'ORDERS & LUMINAS', x + 20, y + 28, { size: 13, color: UI.goldBright, spacing: 3 });
    text(ctx, `${state.luminaIds.length}/${LUMINA_SLOTS}`, x + w - 20, y + 28, {
      size: 12, color: state.luminaIds.length === LUMINA_SLOTS ? UI.goldBright : UI.goldDim, align: 'right',
    });
    divider(ctx, x + 18, y + 38, w - 36);

    const rowH = 21;
    let ry = y + 58;
    this.items.forEach((it, i) => {
      const active = i === this.index;
      const rect = { x: x + 12, y: ry - 13, w: w - 24, h: rowH - 2 };
      this.rects.push(rect);
      if (active) {
        ctx.save();
        ctx.fillStyle = rgba(UI.gold, 0.18);
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        ctx.strokeStyle = rgba(UI.goldBright, 0.7);
        ctx.lineWidth = 1;
        ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
        ctx.restore();
      }
      if (it.kind === 'difficulty') {
        spacedText(ctx, 'DIFFICULTY', x + 22, ry, { size: 11, color: UI.parchment, spacing: 1.6 });
        spacedText(ctx, `◀ ${DIFFICULTY[state.difficulty].label} ▶`, x + w - 22, ry, {
          size: 11, color: UI.goldBright, spacing: 1.6, align: 'right',
        });
      } else if (it.kind === 'seed') {
        spacedText(ctx, 'ENCOUNTER SEED', x + 22, ry, { size: 11, color: UI.parchment, spacing: 1.6 });
        spacedText(ctx, `◀ ${state.seed} ▶`, x + w - 22, ry, {
          size: 11, color: UI.goldBright, spacing: 1.6, align: 'right',
        });
      } else if (it.kind === 'lumina') {
        const on = state.luminaIds.includes(it.lumina.id);
        text(ctx, it.lumina.glyph, x + 26, ry, {
          size: 13, color: on ? UI.goldBright : rgba(UI.parchment, 0.4), align: 'center',
        });
        spacedText(ctx, it.lumina.name.toUpperCase(), x + 40, ry, {
          size: 10.5, color: on ? UI.goldBright : rgba(UI.parchment, 0.75), spacing: 1.2,
        });
        text(ctx, on ? '●' : '○', x + w - 24, ry, {
          size: 12, color: on ? UI.goldBright : rgba(UI.parchment, 0.35), align: 'right',
        });
      } else {
        spacedText(ctx, '⟡  BEGIN THE EXPEDITION  ⟡', x + w / 2, ry, {
          size: 12, weight: '600', color: UI.goldBright, spacing: 2.4, align: 'center',
        });
      }
      ry += rowH;
    });

    const sel = this.items[this.index];
    const descY = y + h + 18;
    panel(ctx, x, descY, w, 62, { cut: 8, alpha: 0.9 });
    const desc = sel && sel.kind === 'lumina' ? sel.lumina.desc
      : sel && sel.kind === 'difficulty'
        ? `Timing windows scale ×${DIFFICULTY[state.difficulty].scale.toFixed(2)}. Lower is harsher.`
        : sel && sel.kind === 'seed'
          ? 'The seed fixes enemy statistics, critical rolls and every AI decision.'
          : 'Three Luminas may be carried. Choose, then begin.';
    this._wrap(ctx, desc, x + 18, descY + 24, w - 36, 15);
  }

  _wrap(ctx, str, x, y, maxW, lineH) {
    ctx.save();
    ctx.font = `12px ${UI.serif}`;
    const words = String(str).split(' ');
    let line = '';
    let ly = y;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxW && line) {
        text(ctx, line, x, ly, { size: 12, color: rgba(UI.parchment, 0.85) });
        line = word;
        ly += lineH;
      } else line = test;
    }
    if (line) text(ctx, line, x, ly, { size: 12, color: rgba(UI.parchment, 0.85) });
    ctx.restore();
  }

  // ---- Intermission ------------------------------------------------------

  _drawIntermission(ctx, view, state) {
    const r = this.result || {};
    this._title(ctx, view, 'APPROACH CLEARED', r.subtitle || '');

    const w = Math.min(660, view.w - 80);
    const x = view.w / 2 - w / 2;
    const y = 180;
    panel(ctx, x, y, w, 300, { cut: 14 });

    spacedText(ctx, `CHROMA GAINED   ${r.xp || 0}`, x + 26, y + 34, {
      size: 13, color: UI.goldBright, spacing: 2.6,
    });
    divider(ctx, x + 24, y + 46, w - 48);

    let ry = y + 74;
    for (const entry of (r.growth || [])) {
      const c = entry.character;
      portrait(ctx, x + 46, ry + 12, 20, c.name.charAt(0), c.tint, {});
      spacedText(ctx, c.name.toUpperCase(), x + 78, ry + 6, {
        size: 11.5, weight: '600', color: UI.parchment, spacing: 1.6,
      });
      text(ctx, `Lv ${c.level}`, x + 78, ry + 24, {
        size: 11, color: entry.levels > 0 ? UI.goldBright : UI.goldDim,
      });
      if (entry.levels > 0) {
        spacedText(ctx, `LEVEL UP ×${entry.levels}`, x + 140, ry + 24, {
          size: 10, color: UI.goldBright, spacing: 1.8,
        });
      }
      bar(ctx, x + 250, ry + 4, w - 300, 9, clamp01(c.xp / c.xpToNext), {
        fill: UI.gradient, back: 'rgba(40,36,14,0.75)', skew: 3,
      });
      text(ctx, `${c.xp} / ${c.xpToNext}`, x + w - 50, ry + 26, {
        size: 10, color: rgba(UI.parchment, 0.7), align: 'right',
      });
      if (entry.unlocked && entry.unlocked.length) {
        let ux = x + 250;
        for (const s of entry.unlocked) {
          spacedText(ctx, `NEW · ${s.name.toUpperCase()}`, ux, ry + 28, {
            size: 10, color: '#9ee8b0', spacing: 1.4,
          });
          ux += 190;
        }
      }
      ry += 62;
    }

    spacedText(ctx, '[ENTER] ADVANCE TO THE NEXT APPROACH', view.w / 2, view.h - 60, {
      size: 12, color: UI.goldBright, spacing: 3, align: 'center',
      alpha: 0.65 + Math.sin(performance.now() / 340) * 0.35,
    });
  }

  // ---- Victory / defeat --------------------------------------------------

  _drawEnd(ctx, view, state, won) {
    const r = this.result || {};
    this._title(
      ctx, view,
      won ? 'THE CURATOR FALLS' : 'THE EXPEDITION ENDS',
      won ? 'GILDED REQUIEM — COMPLETE' : 'ALL LIGHT EXTINGUISHED',
      view.h * 0.26,
    );

    const w = Math.min(560, view.w - 80);
    const x = view.w / 2 - w / 2;
    const y = view.h * 0.26 + 78;
    panel(ctx, x, y, w, 190, { cut: 14, accent: won ? UI.goldBright : UI.danger });

    const s = r.stats || {};
    const rows = [
      ['PERFECT PARRIES', s.parries || 0],
      ['DODGES', s.dodges || 0],
      ['LONGEST FLOW', s.bestFlow || 0],
      ['WEAK POINTS STRUCK', s.weakPoints || 0],
      ['CRITICAL STRIKES', s.crits || 0],
      ['HITS TAKEN', s.hitsTaken || 0],
    ];
    let ry = y + 34;
    for (const [label, val] of rows) {
      spacedText(ctx, label, x + 28, ry, { size: 11, color: rgba(UI.parchment, 0.8), spacing: 2 });
      text(ctx, String(val), x + w - 28, ry, {
        size: 14, weight: '600', color: UI.goldBright, align: 'right',
      });
      ry += 25;
    }

    spacedText(ctx, '[ENTER] OR [R] — RETURN TO THE LOADOUT', view.w / 2, view.h - 70, {
      size: 12, color: UI.goldBright, spacing: 3, align: 'center',
      alpha: 0.65 + Math.sin(performance.now() / 340) * 0.35,
    });
  }
}
