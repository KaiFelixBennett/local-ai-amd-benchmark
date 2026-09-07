import { bus } from '../core/EventBus';
import { t } from '../core/i18n';
import { clear, el } from './dom';

/**
 * In-game HUD rendered as DOM above the Phaser canvas. Subscribes to the
 * typed bus; never reads Phaser state directly.
 */
export class Hud {
  private root: HTMLElement;
  private scoreEl: HTMLElement;
  private deltaEl: HTMLElement;
  private timeEl: HTMLElement;
  private ammoEl: HTMLElement;
  private comboEl: HTMLElement;
  private eventEl: HTMLElement;
  private bossWrap: HTMLElement;
  private bossFill: HTMLElement;
  private bossLabel: HTMLElement;
  private disposers: Array<() => void> = [];

  constructor(host: HTMLElement) {
    this.root = el('div', 'hud hidden');
    this.root.dataset.hud = 'parchment';
    this.scoreEl = el('div', 'hud-score', '0');
    this.deltaEl = el('div', 'hud-delta');
    this.timeEl = el('div', 'hud-time', '0:00');
    this.ammoEl = el('div', 'hud-ammo');
    this.comboEl = el('div', 'hud-combo hidden');
    this.eventEl = el('div', 'hud-event hidden');
    this.bossWrap = el('div', 'hud-boss hidden');
    const bossName = el('div', 'hud-boss-name');
    const bar = el('div', 'hud-boss-bar');
    this.bossFill = el('div', 'hud-boss-fill');
    bar.appendChild(this.bossFill);
    this.bossLabel = el('div', 'hud-boss-state');
    this.bossWrap.append(bossName, bar, this.bossLabel);

    const left = el('div', 'hud-left');
    left.append(this.timeEl, this.eventEl);
    const right = el('div', 'hud-right');
    right.append(this.scoreEl, this.deltaEl, this.ammoEl);
    this.root.append(left, this.comboEl, this.bossWrap, right);
    host.appendChild(this.root);

    this.disposers.push(
      bus.on('hud:score', ({ score, delta }) => {
        this.scoreEl.textContent = score.toLocaleString('de-DE');
        if (delta > 0) {
          this.deltaEl.textContent = `+${delta}`;
          this.deltaEl.classList.remove('pop');
          // restart the CSS animation
          void this.deltaEl.offsetWidth;
          this.deltaEl.classList.add('pop');
        }
      }),
      bus.on('hud:time', ({ left: sec, bonus }) => {
        const s = Math.max(0, Math.ceil(sec));
        const mm = Math.floor(s / 60);
        const ss = String(s % 60).padStart(2, '0');
        this.timeEl.textContent = `${mm}:${ss}`;
        this.timeEl.classList.toggle('urgent', s <= 10);
        this.timeEl.classList.toggle('bonus', bonus);
      }),
      bus.on('hud:ammo', ({ ammo, reserve, status }) => {
        clear(this.ammoEl);
        const total = reserve < 0 ? Math.max(ammo, 0) : Math.min(reserve + ammo, 12);
        const pips = Math.max(total, ammo);
        for (let i = 0; i < pips; i++) {
          const pip = el('span', 'pip');
          if (i >= ammo && status !== 'reloading') pip.classList.add('spent');
          this.ammoEl.appendChild(pip);
        }
        this.ammoEl.setAttribute('data-status', status);
        this.ammoEl.setAttribute('aria-label', `${ammo}${reserve < 0 ? '' : ` / ${ammo + reserve}`}`);
      }),
      bus.on('hud:combo', ({ combo, mult, milestone }) => {
        if (combo < 2) {
          this.comboEl.classList.add('hidden');
          return;
        }
        this.comboEl.classList.remove('hidden');
        this.comboEl.textContent = `${combo} x${mult.toFixed(1)}`;
        this.comboEl.classList.toggle('milestone', milestone);
        this.comboEl.classList.remove('bump');
        void this.comboEl.offsetWidth;
        this.comboEl.classList.add('bump');
      }),
      bus.on('hud:event', ({ nameKey, remaining }) => {
        if (!nameKey) {
          this.eventEl.classList.add('hidden');
          return;
        }
        this.eventEl.classList.remove('hidden');
        const secs = remaining < 0 ? '' : ` ${Math.ceil(remaining)}s`;
        this.eventEl.textContent = `${t(nameKey)}${secs}`;
      }),
      bus.on('hud:boss', ({ nameKey, hp, maxHp, label }) => {
        if (!nameKey) {
          this.bossWrap.classList.add('hidden');
          return;
        }
        this.bossWrap.classList.remove('hidden');
        const name = this.bossWrap.querySelector('.hud-boss-name');
        if (name) name.textContent = t(nameKey);
        this.bossFill.style.width = `${maxHp > 0 ? Math.max(0, (hp / maxHp) * 100) : 0}%`;
        this.bossLabel.textContent = label === 'intro' ? '!' : `${hp}`;
      }),
      bus.on('run:start', () => this.root.classList.remove('hidden')),
      bus.on('run:end', () => this.root.classList.add('hidden')),
      bus.on('round:quit', () => this.root.classList.add('hidden')),
    );
  }

  /** Switch the CSS theme hooks for the equipped HUD skin. */
  setTheme(hudId: string): void {
    this.root.dataset.hud = hudId;
  }

  destroy(): void {
    for (const d of this.disposers) d();
    this.root.remove();
  }
}

/** Transient toast stack (achievements, secrets, hints). */
export class Toasts {
  private root: HTMLElement;

  constructor(host: HTMLElement) {
    this.root = el('div', 'toasts');
    host.appendChild(this.root);
    bus.on('ui:toast', ({ text, kind }) => {
      const item = el('div', `toast toast-${kind ?? 'info'}`, text);
      this.root.appendChild(item);
      requestAnimationFrame(() => item.classList.add('in'));
      window.setTimeout(() => {
        item.classList.remove('in');
        window.setTimeout(() => item.remove(), 400);
      }, 2800);
    });
  }

  clearAll(): void {
    clear(this.root);
  }
}
