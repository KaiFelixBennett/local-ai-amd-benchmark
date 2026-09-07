/**
 * ui/battle-menu.js — The turn menu (DOM, styled as gilded art-nouveau
 * panels via injected CSS).
 *
 * Shown when a party member's turn opens. Tabs:
 *   ATTACK  — basic (no AP, builds AP) + "Aimed Shot" (free-aim) for the
 *             acting character; choosing one moves to the TARGET tab.
 *   SKILLS  — the actor's unlocked skills with AP cost + description.
 *   ITEM    — two encounter supplies (Elixir, Focus Draught).
 *   LUMINA  — the ultimate, enabled when the gauge is full.
 *
 * TARGET  — a grid of enemy portraits; the armed action fires on confirm.
 *
 * Keyboard: arrows / WASD navigate, Enter/E confirm, X/Escape cancels a
 * pending target (back to the list), Tab switches tabs. Mouse: hover
 * highlights, click confirms. game.js owns the Input and forwards
 * `handleKey(action)` + `handleMouse(...)` calls.
 */

const TABS = ['attack', 'skills', 'item', 'lumina', 'target'];

export class BattleMenu {
  /**
   * @param {HTMLElement} container
   */
  constructor(container, audio) {
    this.container = container;
    this.audio = audio;
    this.isOpen = false;
    this.tab = 0;
    this.index = 0;
    this.targetIndex = 0;
    this.armed = null; // {type, skill?, item?} pending a target
    this._actor = null;
    this._enemies = [];
    this._onKey = null; // set by game.js
    this._buildShell();
  }

  _buildShell() {
    this.el = document.createElement('div');
    this.el.className = 'cm-root cm-hidden';
    this.el.innerHTML = `
      <div class="cm-panel">
        <div class="cm-head">
          <div class="cm-actor">
            <div class="cm-actor-name"></div>
            <div class="cm-actor-sub"></div>
          </div>
          <div class="cm-ap"></div>
        </div>
        <div class="cm-tabs"></div>
        <div class="cm-body"></div>
        <div class="cm-desc"></div>
        <div class="cm-foot">
          <span>&#8592;&#8593;&#8594; move</span>
          <span>&#9166; / E confirm</span>
          <span>X / Esc back</span>
          <span>Tab switch</span>
        </div>
      </div>`;
    this.container.appendChild(this.el);
    this._tabsEl = this.el.querySelector('.cm-tabs');
    this._bodyEl = this.el.querySelector('.cm-body');
    this._descEl = this.el.querySelector('.cm-desc');
    this._nameEl = this.el.querySelector('.cm-actor-name');
    this._subEl = this.el.querySelector('.cm-actor-sub');
    this._apEl = this.el.querySelector('.cm-ap');
  }

  // ------------------------------------------------------------------
  // Open / close
  // ------------------------------------------------------------------

  /**
   * @param {object} actor   the acting party member
   * @param {object[]} enemies live enemies (with .root for portraits? no — use data)
   * @param {object} o { ultimateReady, inventory, onChoose }
   */
  open(actor, enemies, o) {
    this._actor = actor;
    this._enemies = enemies.filter((e) => e.hp > 0);
    this._onChoose = o.onChoose;
    this.ultimateReady = !!o.ultimateReady;
    this.inventory = o.inventory || { elixir: 0, focus: 0 };
    this.isOpen = true;
    this.tab = 0;
    this.index = 0;
    this.targetIndex = 0;
    this.armed = null;
    this.el.classList.remove('cm-hidden');
    this._render();
  }

  close() {
    this.isOpen = false;
    this.el.classList.add('cm-hidden');
  }

  /** Keyboard from game.js. Returns true if the menu consumed the key. */
  handleKey(action) {
    if (!this.isOpen) return false;
    const inTarget = this.tab === 4 || this.armed;
    switch (action) {
      case 'left':
      case 'up':
        this._move(-1);
        break;
      case 'right':
      case 'down':
        this._move(1);
        break;
      case 'tab':
        if (!this.armed) {
          this.tab = (this.tab + 1) % 4;
          this.index = 0;
          if (this.audio) this.audio.blip();
          this._render();
        }
        break;
      case 'confirm':
        this._confirm();
        break;
      case 'cancel':
        if (this.armed || this.tab === 4) {
          this.armed = null;
          this.tab = 0;
          if (this.audio) this.audio.cancel();
          this._render();
        } else if (this.audio) {
          this.audio.cancel();
        }
        break;
      default:
        return false;
    }
    return true;
  }

  _count() {
    if (this.armed) return this._enemies.length;
    switch (this.tab) {
      case 0: return this._attackRows().length;
      case 1: return this._actor.skillList.filter((s) => this._actor.unlockedSkills.includes(s.id)).length;
      case 2: return 2;
      case 3: return 1;
      default: return 0;
    }
  }

  _move(dir) {
    const n = this._count();
    if (n <= 0) return;
    this.index = (this.index + dir + n) % n;
    if (this.audio) this.audio.blip();
    this._render();
  }

  _confirm() {
    if (this.armed) {
      const e = this._enemies[this.targetIndex % Math.max(1, this._enemies.length)];
      this.index = this.targetIndex;
      if (e) {
        if (this.audio) this.audio.confirm();
        this.close();
        this._onChoose({ ...this.armed, target: e });
      }
      return;
    }
    if (this.tab === 0) {
      const rows = this._attackRows();
      const row = rows[this.index];
      if (!row) return;
      if (row.kind === 'aim') {
        if (this.audio) this.audio.confirm();
        this.close();
        this._onChoose({ type: 'aim' });
      } else {
        this.armed = { type: 'basic' };
        this.tab = 4;
        this.targetIndex = 0;
        if (this.audio) this.audio.confirm();
        this._render();
      }
    } else if (this.tab === 1) {
      const list = this._actor.skillList.filter((s) => this._actor.unlockedSkills.includes(s.id));
      const skill = list[this.index];
      if (!skill || skill.apCost > this._actor.ap) return;
      if (this.audio) this.audio.confirm();
      if (skill.targets === 'party' || skill.targets === 'enemies' || skill.type === 'buff') {
        this.close();
        this._onChoose({ type: 'skill', skill, target: null });
      } else {
        this.armed = { type: 'skill', skill };
        this.tab = 4;
        this.targetIndex = 0;
        this._render();
      }
    } else if (this.tab === 2) {
      const items = [
        { id: 'elixir', name: 'Elixir', count: this.inventory.elixir, desc: 'Restore 40% HP to a party member.' },
        { id: 'focus', name: 'Focus Draught', count: this.inventory.focus, desc: 'Grant +2 AP to a party member.' },
      ];
      const item = items[this.index];
      if (!item || item.count <= 0) return;
      if (this.audio) this.audio.confirm();
      this.armed = { type: 'item', item: item.id, self: true };
      this._closeAndChoose({ type: 'item', item: item.id });
    } else if (this.tab === 3) {
      if (this.ultimateReady) {
        if (this.audio) this.audio.confirm();
        this.close();
        this._onChoose({ type: 'ultimate' });
      }
    }
  }

  _closeAndChoose(choice) {
    this.close();
    this._onChoose(choice);
  }

  // ------------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------------

  _attackRows() {
    const rows = [{ kind: 'basic', name: this._actor.basic.name, desc: this._actor.basic.desc, cost: 'AP +1' }];
    if (this._actor.ranged) {
      rows.push({ kind: 'aim', name: 'Aimed Shot', desc: 'Free-aim at an enemy weak point for bonus damage + Lumina. Ranged only.', cost: 'AP +1' });
    }
    return rows;
  }

  _render() {
    const actor = this._actor;
    this._nameEl.textContent = `${actor.name} — ${actor.role}`;
    this._subEl.textContent = `${actor.row === 'front' ? 'Front row' : 'Back row'} · Lv ${actor.level}`;
    this._apEl.textContent = `AP ${actor.ap} / ${actor.maxAp}`;

    // Tabs
    this._tabsEl.innerHTML = '';
    const tabNames = ['Attack', 'Skills', 'Item', 'Lumina'];
    tabNames.forEach((name, i) => {
      const b = document.createElement('div');
      b.className = 'cm-tab' + (this.tab === i && !this.armed ? ' active' : '');
      if (this.tab === 4 || this.armed) b.classList.add('dim');
      b.textContent = name + (i === 3 && this.ultimateReady ? ' ✦' : '');
      b.addEventListener('click', () => {
        if (this.armed) return;
        this.tab = i;
        this.index = 0;
        if (this.audio) this.audio.blip();
        this._render();
      });
      this._tabsEl.appendChild(b);
    });
    if (this.armed || this.tab === 4) {
      const b = document.createElement('div');
      b.className = 'cm-tab active';
      b.textContent = 'Target';
      this._tabsEl.appendChild(b);
    }

    // Body
    this._bodyEl.innerHTML = '';
    if (this.armed || this.tab === 4) {
      this._renderTargets();
    } else if (this.tab === 0) {
      this._attackRows().forEach((row, i) => {
        this._bodyEl.appendChild(this._row(row.name, row.cost, row.desc, i === this.index));
      });
    } else if (this.tab === 1) {
      const list = actor.skillList.filter((s) => actor.unlockedSkills.includes(s.id));
      list.forEach((s, i) => {
        const locked = s.apCost > actor.ap;
        this._bodyEl.appendChild(this._row(`${s.name}`, locked ? `AP ${s.apCost} ✕` : `AP ${s.apCost}`, s.desc, i === this.index, locked));
      });
    } else if (this.tab === 2) {
      const items = [
        { name: 'Elixir', count: this.inventory.elixir, desc: 'Restore 40% HP to a party member.' },
        { name: 'Focus Draught', count: this.inventory.focus, desc: 'Grant +2 AP to a party member.' },
      ];
      items.forEach((it, i) => {
        const empty = it.count <= 0;
        this._bodyEl.appendChild(this._row(`${it.name} ×${it.count}`, empty ? '—' : '1 turn', it.desc, i === this.index, empty));
      });
    } else if (this.tab === 3) {
      const ready = this.ultimateReady;
      this._bodyEl.appendChild(this._row('Unleash Lumina', ready ? 'FULL' : 'not ready', 'The whole expedition strikes at once. Huge damage to a pair of enemies.', 0 === this.index && ready, !ready));
    }
    // Description line
    this._descEl.textContent = this._descText();
  }

  _descText() {
    if (this.armed) return 'Choose a target. X / Esc to go back.';
    if (this.tab === 0) {
      const rows = this._attackRows();
      return rows[this.index] ? rows[this.index].desc : '';
    }
    if (this.tab === 1) {
      const list = this._actor.skillList.filter((s) => this._actor.unlockedSkills.includes(s.id));
      return list[this.index] ? list[this.index].desc : '';
    }
    if (this.tab === 2) {
      return ['Restore 40% HP to a party member.', 'Grant +2 AP to a party member.'][this.index] || '';
    }
    return 'Lumina is charged by perfect parries, weak-point hits and criticals.';
  }

  _row(title, right, desc, selected, disabled = false) {
    const d = document.createElement('div');
    d.className = 'cm-row' + (selected ? ' selected' : '') + (disabled ? ' disabled' : '');
    d.innerHTML = `<span class="cm-row-title"></span><span class="cm-row-right"></span>`;
    d.querySelector('.cm-row-title').textContent = title;
    d.querySelector('.cm-row-right').textContent = right;
    d.addEventListener('mouseenter', () => {
      if (disabled) return;
      this.index = Array.from(this._bodyEl.children).indexOf(d);
      this._render();
    });
    d.addEventListener('click', () => {
      if (disabled) return;
      this.index = Array.from(this._bodyEl.children).indexOf(d);
      this._confirm();
    });
    return d;
  }

  _renderTargets() {
    const box = document.createElement('div');
    box.className = 'cm-targets';
    if (this.armed && (this.armed.type === 'item')) {
      // Party-targeted item
      // (items are self-applied in _confirm; not reached here)
    }
    (this._enemies || []).forEach((e, i) => {
      const d = document.createElement('div');
      d.className = 'cm-tgt' + (i === this.targetIndex % Math.max(1, this._enemies.length) ? ' selected' : '');
      d.innerHTML = `<div class="cm-tgt-name"></div><div class="cm-tgt-hp"></div>`;
      d.querySelector('.cm-tgt-name').textContent = e.name;
      d.querySelector('.cm-tgt-hp').textContent = `${Math.ceil(e.hp)} / ${e.maxHp}`;
      d.addEventListener('mouseenter', () => {
        this.targetIndex = i;
        this._render();
      });
      d.addEventListener('click', () => {
        this.targetIndex = i;
        this._confirm();
      });
      box.appendChild(d);
    });
    this._bodyEl.appendChild(box);
  }

  /** Mouse click anywhere in the menu panel (from game.js). */
  handleMouse() {
    // handled per-element via listeners above
  }
}
