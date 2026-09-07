import { EV } from '../core/events.js';

// ---------------------------------------------------------------------------
// Battle command menu. A DOM overlay (crisp text, accessible focus, zero font
// measurement on the canvas hot path) styled as gilded Belle-Epoque lacquer.
// Emits choices back into the battle system via battle.choose(). Keyboard:
// digits select entries, Esc backs out of the skill grid.
// ---------------------------------------------------------------------------

export class Menu {
  constructor(root, bus, battleRef) {
    this.bus = bus;
    this.battleRef = battleRef;
    this.rootEl = root;
    this.mode = 'main';
    this.current = null; // options payload
    this.unit = null;
    this._buildDom();

    bus.on(EV.MENU_OPEN, (p) => this.open(p));
    bus.on('battle:state', (p) => {
      // Hide whenever the battle leaves MENU; keep during TARGET/AIM so the
      // header label can describe what is happening.
      if (p.state !== 'menu' && p.state !== 'target' && p.state !== 'aim') this.hide();
    });
    bus.on(EV.RESTART, () => this.hide());
  }

  _buildDom() {
    const el = document.createElement('div');
    el.id = 'menu';
    el.className = 'hidden';
    this.rootEl.appendChild(el);
    this.el = el;
  }

  get battle() { return this.battleRef(); }

  open({ unit, options }) {
    this.unit = unit;
    this.current = options;
    this.mode = 'main';
    this.render();
    this.el.classList.remove('hidden');
  }

  hide() {
    this.el.classList.add('hidden');
    this.el.innerHTML = '';
  }

  // Options payload: {canAttack, canAim, skills:[{id,skill,enabled}],
  //                     canDefend, items, gradient}
  render() {
    const o = this.current;
    const b = this.battle;
    if (!o || !b) return;
    const u = this.unit;
    let html = `<div class="menu-head"><span class="who">${u ? u.name : ''}</span>
      <span class="ap">PA ${u ? u.ap : 0}/${u ? u.maxAp : 0}</span></div>`;

    if (this.mode === 'main') {
      const items = [
        { key: '1', type: 'attack', label: 'Attack', sub: 'builds PA', on: o.canAttack },
        { key: '2', type: 'aim', label: 'Aim', sub: 'free reticle', on: o.canAim },
        { key: '3', type: 'skills', label: 'Skills', sub: `${o.skills.length}`, on: true },
        { key: '4', type: 'defend', label: 'Defend', sub: '+PA, +DEF', on: o.canDefend },
        { key: '5', type: 'item', label: 'Tincture', sub: `x${o.items}`, on: o.items > 0 },
        { key: 'G', type: 'gradient', label: 'Attaque Palette', sub: 'ULTIMATE', on: o.gradient, hot: o.gradient }
      ];
      html += '<div class="menu-grid">' + items.map((it) => `
        <button class="cmd${it.hot ? ' hot' : ''}" data-type="${it.type}" ${it.on ? '' : 'disabled'}>
          <kbd>${it.key}</kbd><span>${it.label}</span><em>${it.sub}</em>
        </button>`).join('') + '</div>';
    } else {
      html += '<div class="menu-grid">' + o.skills.map((s, i) => `
        <button class="cmd skill" data-type="skill" data-skill="${s.id}" ${s.enabled ? '' : 'disabled'}>
          <kbd>${i + 1}</kbd><span>${s.skill.name}</span>
          <em>${s.skill.cost} PA</em>
          <i class="desc">${s.skill.desc}</i>
        </button>`).join('') + '</div><div class="menu-back"><kbd>Esc</kbd> back</div>';
    }
    this.el.innerHTML = html;
  }

  choose(type, extra) {
    const b = this.battle;
    if (!b) return;
    if (type === 'skills') { this.mode = 'skills'; this.render(); return; }
    if (type === 'back') { this.mode = 'main'; this.render(); return; }
    this.hide();
    if (type === 'skill') b.choose({ type: 'skill', skillId: extra });
    else b.choose({ type });
  }

  // Keyboard routing from Game (only when menu visible). Returns true if used.
  key(e) {
    if (this.el.classList.contains('hidden')) return false;
    const k = e.key.toLowerCase();
    if (k === 'escape') {
      if (this.mode === 'skills') { this.mode = 'main'; this.render(); return true; }
      return false;
    }
    const idx = parseInt(k, 10);
    if (!Number.isNaN(idx) && idx >= 1 && idx <= 9) {
      const btns = [...this.el.querySelectorAll('button.cmd')];
      const btn = btns[idx - 1];
      if (btn && !btn.disabled) {
        this.choose(btn.dataset.type, btn.dataset.skill);
        return true;
      }
      return true; // swallow out-of-range digits while menu is open
    }
    if (k === 'g' && this.mode === 'main' && this.current && this.current.gradient) {
      this.choose('gradient');
      return true;
    }
    return false;
  }

  // Click/pointer routing from Game (DOM clicks handled natively).
  connectClicks() {
    this.el.addEventListener('click', (e) => {
      const btn = e.target.closest && e.target.closest('button.cmd');
      if (!btn || btn.disabled) return;
      this.choose(btn.dataset.type, btn.dataset.skill);
    });
  }
}
