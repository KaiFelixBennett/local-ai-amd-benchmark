/**
 * The player's action menu and the target cursor.
 *
 * The menu is a two-level list (root -> skills/items) with keyboard and mouse
 * input; it produces plain action descriptors and hands them to the battle
 * system, which owns all the rules. Rects are recorded on every draw so mouse
 * hit-testing stays in sync with whatever is actually on screen.
 */

import { UI, panel, spacedText, text, divider, rgba, bar } from './theme.js';
import { ELEMENTS } from '../battle/action-resolver.js';
import { ITEMS } from '../entities/skill.js';
import { worldToScreen } from '../core/project.js';
import { easeOutCubic } from '../core/easing.js';

const MENU_W = 340;
const ROW_H = 34;

export class BattleMenu {
  constructor(scratchVector) {
    this._v = scratchVector;
    this.mode = 'root';
    this.index = 0;
    this.entries = [];
    this.actor = null;
    this.battle = null;
    this.rects = [];
    this.open = false;
    this.appear = 0;

    // Target selection
    this.targeting = false;
    this.targets = [];
    this.targetIndex = 0;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  openFor(actor, battle) {
    this.actor = actor;
    this.battle = battle;
    this.mode = 'root';
    this.index = 0;
    this.open = true;
    this.appear = 0;
    this.targeting = false;
    this._rebuild();
  }

  close() {
    this.open = false;
    this.targeting = false;
  }

  beginTargeting(targets) {
    this.targeting = true;
    this.targets = targets.slice();
    this.targetIndex = 0;
  }

  endTargeting() {
    this.targeting = false;
  }

  _rebuild() {
    const a = this.actor;
    const b = this.battle;
    if (!a || !b) { this.entries = []; return; }

    if (this.mode === 'skills') {
      this.entries = a.skills.map((s) => ({
        key: 'skill', skill: s, label: s.name.toUpperCase(),
        cost: s.cost, enabled: a.ap >= s.cost,
        element: s.element, desc: s.desc,
      }));
      this.entries.push({ key: 'back', label: '← BACK', cost: 0, enabled: true, desc: 'Return to the action list.' });
    } else if (this.mode === 'items') {
      this.entries = Object.values(ITEMS).map((it) => ({
        key: 'item', item: it, label: it.name.toUpperCase(),
        count: b.items[it.id], enabled: b.items[it.id] > 0,
        desc: it.desc,
      }));
      this.entries.push({ key: 'back', label: '← BACK', cost: 0, enabled: true, desc: 'Return to the action list.' });
    } else {
      const skillCount = a.affordableSkills().length;
      const itemCount = Object.values(b.items).reduce((x, y) => x + y, 0);
      this.entries = [
        {
          key: 'attack', label: 'ATTACK', enabled: true, cost: 0,
          desc: `${a.basic.name} — costs nothing and builds 3 Action Points. ${a.basic.hits > 1 ? `${a.basic.hits} strikes.` : ''}`,
          element: a.basic.element,
        },
        {
          key: 'skills', label: 'SKILLS', enabled: a.skills.length > 0, sub: true,
          badge: `${skillCount}/${a.skills.length}`,
          desc: 'Spend Action Points on the character’s learned techniques.',
        },
        {
          key: 'aim', label: 'FREE AIM', enabled: true, cost: 0,
          desc: 'Take manual aim. Weak-point hits deal heavy damage and grant 3 AP.',
          element: a.aimShot.element,
        },
        {
          key: 'items', label: 'ITEMS', enabled: itemCount > 0, sub: true,
          badge: `${itemCount}`,
          desc: 'Consumables carried by the expedition.',
        },
        {
          key: 'guard', label: 'GUARD', enabled: true, cost: 0,
          desc: 'Brace: gain Aegis for two turns and recover 2 Action Points.',
        },
        {
          key: 'ultimate', label: 'OVERTURE', enabled: b.ultimateReady, cost: 0,
          badge: `${Math.round(b.gradient)}%`,
          desc: 'Requiem of the Gilded Dawn — the whole expedition strikes as one, then mends.',
        },
      ];
    }
    this.index = Math.min(this.index, this.entries.length - 1);
    if (!this.entries[this.index] || !this.entries[this.index].enabled) this._snapToEnabled(1);
  }

  _snapToEnabled(dir) {
    for (let i = 0; i < this.entries.length; i++) {
      const idx = (this.index + dir * i + this.entries.length * 2) % this.entries.length;
      if (this.entries[idx].enabled) { this.index = idx; return; }
    }
  }

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------

  /** @returns {boolean} whether the cursor actually moved */
  move(dir) {
    if (this.targeting) {
      if (this.targets.length === 0) return false;
      this.targetIndex = (this.targetIndex + dir + this.targets.length) % this.targets.length;
      return true;
    }
    if (this.entries.length === 0) return false;
    const before = this.index;
    for (let i = 1; i <= this.entries.length; i++) {
      const idx = (this.index + dir * i + this.entries.length * 2) % this.entries.length;
      if (this.entries[idx].enabled) { this.index = idx; break; }
    }
    return this.index !== before;
  }

  get selectedTarget() {
    return this.targets[this.targetIndex] || null;
  }

  /**
   * @returns {{type:string}|{nav:string}|null} an action for the battle system,
   *          a navigation result, or null when nothing happened
   */
  confirm() {
    if (this.entries.length === 0) return null;
    const e = this.entries[this.index];
    if (!e || !e.enabled) return { nav: 'denied' };

    if (e.key === 'back') { this.mode = 'root'; this._rebuild(); return { nav: 'back' }; }
    if (e.key === 'skills') { this.mode = 'skills'; this.index = 0; this._rebuild(); return { nav: 'sub' }; }
    if (e.key === 'items') { this.mode = 'items'; this.index = 0; this._rebuild(); return { nav: 'sub' }; }
    if (e.key === 'skill') return { type: 'skill', skill: e.skill };
    if (e.key === 'item') return { type: 'item', item: e.item };
    return { type: e.key };
  }

  back() {
    if (this.mode !== 'root') { this.mode = 'root'; this.index = 0; this._rebuild(); return true; }
    return false;
  }

  refresh() {
    this._rebuild();
  }

  /** @returns {number} the entry index under the cursor, or -1 */
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

  draw(ctx, view, dt) {
    if (!this.open || !this.actor) return;
    this.appear = Math.min(1, this.appear + dt * 5.5);
    const slide = (1 - easeOutCubic(this.appear)) * 40;

    const rows = this.entries.length;
    const h = rows * ROW_H + 96;
    const x = view.w - MENU_W - 22 + slide;
    const y = view.h - h - 22;
    this.rects.length = 0;

    ctx.save();
    ctx.globalAlpha = this.appear;
    panel(ctx, x, y, MENU_W, h, { cut: 12, accent: UI.gold });

    spacedText(ctx, this.actor.name.toUpperCase(), x + 18, y + 26, {
      size: 13, weight: '600', color: UI.goldBright, spacing: 2.2,
    });
    text(ctx, `${this.actor.ap} AP`, x + MENU_W - 18, y + 26, {
      size: 14, weight: '600', color: UI.ap, align: 'right',
    });
    divider(ctx, x + 16, y + 36, MENU_W - 32);

    let ry = y + 46;
    this.entries.forEach((e, i) => {
      this._drawRow(ctx, x + 10, ry, MENU_W - 20, ROW_H - 4, e, i === this.index);
      this.rects.push({ x: x + 10, y: ry, w: MENU_W - 20, h: ROW_H - 4 });
      ry += ROW_H;
    });

    const sel = this.entries[this.index];
    if (sel) {
      divider(ctx, x + 16, ry + 2, MENU_W - 32);
      this._wrapText(ctx, sel.desc || '', x + 18, ry + 20, MENU_W - 36, 14, {
        size: 11.5, color: 'rgba(226,214,186,0.82)',
      });
    }
    ctx.restore();
  }

  _drawRow(ctx, x, y, w, h, e, active) {
    ctx.save();
    if (active) {
      const g = ctx.createLinearGradient(x, y, x + w, y);
      g.addColorStop(0, rgba(UI.gold, 0.3));
      g.addColorStop(1, rgba(UI.gold, 0.02));
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = rgba(UI.goldBright, 0.8);
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      // Cursor lozenge.
      ctx.save();
      ctx.translate(x - 3, y + h / 2);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = UI.goldBright;
      ctx.fillRect(-3.5, -3.5, 7, 7);
      ctx.restore();
    }
    ctx.globalAlpha = e.enabled ? 1 : 0.36;
    spacedText(ctx, e.label, x + 14, y + h / 2 + 4, {
      size: 13, weight: active ? '600' : '400',
      color: active ? UI.goldBright : UI.parchment, spacing: 1.8,
    });

    let rx = x + w - 12;
    if (e.cost > 0) {
      text(ctx, `${e.cost} AP`, rx, y + h / 2 + 4, {
        size: 12, weight: '600', align: 'right',
        color: e.enabled ? UI.ap : 'rgba(120,150,160,0.7)',
      });
      rx -= 46;
    } else if (e.badge) {
      text(ctx, e.badge, rx, y + h / 2 + 4, {
        size: 11, align: 'right', color: rgba(UI.gold, 0.85),
      });
      rx -= 40;
    } else if (e.count !== undefined) {
      text(ctx, `×${e.count}`, rx, y + h / 2 + 4, {
        size: 12, align: 'right', color: UI.parchment,
      });
      rx -= 34;
    }
    if (e.element && ELEMENTS[e.element]) {
      const el = ELEMENTS[e.element];
      text(ctx, el.glyph, rx, y + h / 2 + 4, {
        size: 13, align: 'right', color: el.color,
      });
    }
    if (e.sub) {
      text(ctx, '›', x + w - 4, y + h / 2 + 4, { size: 15, align: 'right', color: UI.goldDim });
    }
    ctx.restore();
  }

  _wrapText(ctx, str, x, y, maxW, lineH, opts) {
    ctx.save();
    ctx.font = `${opts.size}px ${UI.serif}`;
    const words = String(str).split(' ');
    let line = '';
    let ly = y;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxW && line) {
        text(ctx, line, x, ly, opts);
        line = word;
        ly += lineH;
      } else {
        line = test;
      }
    }
    if (line) text(ctx, line, x, ly, opts);
    ctx.restore();
  }

  /** Projected reticle over the currently selected target. */
  drawTargetCursor(ctx, view) {
    if (!this.targeting) return;
    const t = this.selectedTarget;
    if (!t) return;
    const p = worldToScreen(t.anchor(this._v), view.camera, view.w, view.h, this._v);
    if (!p.visible) return;

    const time = performance.now() / 1000;
    const pulse = 0.85 + Math.sin(time * 6) * 0.15;
    const r = 34 * pulse;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.strokeStyle = UI.goldBright;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.95;
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.rotate((i / 4) * Math.PI * 2 + time * 0.6);
      ctx.beginPath();
      ctx.moveTo(r, -9);
      ctx.lineTo(r + 11, 0);
      ctx.lineTo(r, 9);
      ctx.stroke();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.globalAlpha = 0.4;
    ctx.stroke();
    ctx.restore();

    // Target readout under the reticle.
    const w = 176;
    const x = p.x - w / 2;
    const y = p.y + 44;
    ctx.save();
    panel(ctx, x, y, w, 42, { cut: 6, alpha: 0.95 });
    spacedText(ctx, t.name.toUpperCase(), x + w / 2, y + 17, {
      size: 11, color: UI.goldBright, spacing: 1.6, align: 'center',
    });
    bar(ctx, x + 10, y + 24, w - 20, 8, t.hpFrac, {
      fill: t.side === 'enemy' ? UI.enemy : UI.hp, skew: 3,
    });
    if (this.targets.length > 1) {
      spacedText(ctx, '◀  ▶', x + w / 2, y + 55, {
        size: 11, color: rgba(UI.gold, 0.75), spacing: 3, align: 'center',
      });
    }
    ctx.restore();
  }
}
