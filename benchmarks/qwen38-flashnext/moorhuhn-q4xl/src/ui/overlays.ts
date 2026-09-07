import { bus } from '../core/EventBus';
import { t, currentLang } from '../core/i18n';
import { getSettings, loadSave, mutate, resetSave, claimChallenge } from '../core/Save';
import type { RunResult, Settings, MapId, ModeId } from '../core/types';
import { MODES, MODE_ORDER } from '../config/modes';
import { MAPS, MAP_ORDER } from '../config/maps';
import { ACHIEVEMENTS, CHALLENGES } from '../config/achievements';
import { CROSSHAIRS, HUD_THEMES, WEAPON_SKINS } from '../config/cosmetics';
import { levelFromXp } from '../core/Progress';
import { challengeReadyToClaim } from '../game/Achievements';
import { dailySeed, todayKey } from '../core/Rng';
import { startRun, getLastRun, quitToMenu } from '../app/bootstrap';
import type { RunConfig } from '../app/RunConfig';
import { button, clear, el, show } from './dom';

export type OverlayName =
  | 'menu'
  | 'modes'
  | 'maps'
  | 'settings'
  | 'stats'
  | 'highscores'
  | 'achievements'
  | 'progress'
  | 'howto'
  | 'credits'
  | 'results'
  | 'pause'
  | 'quit';

/** All DOM menu/modal screens, driven by the 'ui:show' bus event. */
export class Overlays {
  private root: HTMLElement;
  private screens = new Map<OverlayName, HTMLElement>();
  private selection = { mode: 'classic' as ModeId, map: 'nebelmoor' as MapId };
  private active: OverlayName | null = null;

  constructor(host: HTMLElement) {
    this.root = el('div', 'overlays');
    host.appendChild(this.root);
    for (const name of [
      'menu',
      'modes',
      'maps',
      'settings',
      'stats',
      'highscores',
      'achievements',
      'progress',
      'howto',
      'credits',
      'results',
      'pause',
      'quit',
    ] as OverlayName[]) {
      const s = el('div', `overlay overlay-${name} hidden`);
      s.setAttribute('role', 'dialog');
      this.screens.set(name, s);
      this.root.appendChild(s);
    }

    bus.on('ui:show', ({ name, payload }) => this.open(name as OverlayName, payload));
    bus.on('round:pause', () => this.open('pause'));
    bus.on('round:resume', () => this.closeAll());
    bus.on('run:start', () => this.closeAll());
    // language (and other setting) changes repaint the visible screen instantly
    bus.on('settings:changed', () => {
      if (this.active) this.open(this.active, this.lastPayload ?? undefined);
    });
  }

  private lastPayload: unknown = null;

  private closeAll(): void {
    this.active = null;
    for (const s of this.screens.values()) show(s, false);
  }

  open(name: OverlayName, payload?: unknown): void {
    // pause/quit float above whatever is open; screens are exclusive otherwise
    if (name !== 'pause' && name !== 'quit') this.closeAll();
    const s = this.screens.get(name);
    if (!s) return;
    if (name !== 'pause' && name !== 'quit') this.lastPayload = payload ?? null;
    this.render(name, s, payload);
    show(s, true);
    this.active = name;
  }

  get anyOpen(): boolean {
    return [...this.screens.values()].some((s) => !s.classList.contains('hidden'));
  }

  private render(name: OverlayName, host: HTMLElement, payload?: unknown): void {
    clear(host);
    switch (name) {
      case 'menu':
        this.renderMenu(host);
        break;
      case 'modes':
        this.renderModes(host);
        break;
      case 'maps':
        this.renderMaps(host);
        break;
      case 'settings':
        this.renderSettings(host);
        break;
      case 'stats':
        this.renderStats(host);
        break;
      case 'highscores':
        this.renderHighscores(host);
        break;
      case 'achievements':
        this.renderAchievements(host);
        break;
      case 'progress':
        this.renderProgress(host);
        break;
      case 'howto':
        this.renderHowto(host);
        break;
      case 'credits':
        this.renderCredits(host);
        break;
      case 'results':
        this.renderResults(host, payload as RunResult);
        break;
      case 'pause':
        this.renderPause(host);
        break;
      case 'quit':
        this.renderQuit(host);
        break;
    }
  }

  // ---------------- menu ----------------

  private renderMenu(host: HTMLElement): void {
    const panel = el('div', 'panel menu-panel');
    const title = el('h1', 'menu-title');
    title.append(el('span', 'menu-title-main', t('app.title')), el('span', 'menu-title-sub', t('app.subtitle')));
    const tagline = el('p', 'menu-tagline', t('app.tagline'));
    const s = loadSave();
    const lvl = levelFromXp(s.progress.xp);
    const badges = el('div', 'menu-badges');
    badges.append(
      el('span', 'badge', `${t('prog.level', { n: lvl.level })}`),
      el('span', 'badge', `${s.progress.currency} ${t('prog.currency')}`),
    );
    const items: Array<[string, OverlayName]> = [
      ['menu.modes', 'modes'],
      ['menu.map', 'maps'],
      ['menu.progress', 'progress'],
      ['menu.achievements', 'achievements'],
      ['menu.highscores', 'highscores'],
      ['menu.stats', 'stats'],
      ['menu.howto', 'howto'],
      ['menu.settings', 'settings'],
      ['menu.credits', 'credits'],
    ];
    const list = el('nav', 'menu-list');
    for (const [key, target] of items) {
      list.appendChild(button('menu-btn', t(key), () => this.open(target)));
    }
    const quick = button('menu-btn menu-btn-play', t('menu.play'), () => this.launch());
    list.prepend(quick);
    panel.append(title, tagline, badges, list);
    host.appendChild(panel);
  }

  private launch(): void {
    const { mode, map } = this.selection;
    const cfg: RunConfig = {
      mode,
      map,
      seed: mode === 'daily' ? dailySeed(todayKey()) : (Math.random() * 2147483647) | 0,
    };
    startRun(cfg);
  }

  // ---------------- modes / maps ----------------

  private renderModes(host: HTMLElement): void {
    const panel = el('div', 'panel');
    panel.appendChild(el('h2', 'panel-title', t('menu.modes')));
    const grid = el('div', 'card-grid');
    const level = loadSave().progress.level;
    for (const id of MODE_ORDER) {
      const m = MODES[id];
      const locked = level < m.unlockLevel;
      const card = el('div', `mode-card${locked ? ' locked' : ''}`);
      card.append(
        el('h3', 'card-title', t(`mode.${id}`)),
        el('p', 'card-desc', t(`mode.${id}.desc`)),
        el('div', 'card-meta', locked ? t('menu.levelReq', { n: m.unlockLevel }) : `${m.duration < 0 ? '\u221e' : `${m.duration}s`} · ${t('menu.start')}`),
      );
      if (locked) card.title = t('menu.locked');
      else
        card.addEventListener('click', () => {
          this.selection.mode = id;
          this.open('maps');
        });
      grid.appendChild(card);
    }
    panel.appendChild(grid);
    panel.appendChild(this.backRow(() => this.open('menu')));
    host.appendChild(panel);
  }

  private renderMaps(host: HTMLElement): void {
    const panel = el('div', 'panel');
    panel.appendChild(el('h2', 'panel-title', t('menu.map')));
    const grid = el('div', 'card-grid');
    const level = loadSave().progress.level;
    for (const id of MAP_ORDER) {
      const m = MAPS[id];
      const locked = level < m.unlockLevel;
      const card = el('div', `map-card${locked ? ' locked' : ''}`);
      const swatch = el('div', 'map-swatch');
      swatch.style.background = `linear-gradient(160deg, ${m.palette.skyTop}, ${m.palette.skyBottom} 55%, ${m.palette.ground})`;
      card.append(
        swatch,
        el('h3', 'card-title', t(`map.${id}`)),
        el('p', 'card-desc', t(`map.${id}.desc`)),
        el('div', 'card-meta', locked ? t('menu.levelReq', { n: m.unlockLevel }) : this.selection.mode),
      );
      if (locked) card.title = t('menu.locked');
      else
        card.addEventListener('click', () => {
          this.selection.map = id;
          this.launch();
        });
      grid.appendChild(card);
    }
    panel.appendChild(grid);
    panel.appendChild(this.backRow(() => this.open('modes')));
    host.appendChild(panel);
  }

  private backRow(onBack: () => void): HTMLElement {
    const row = el('div', 'panel-actions');
    row.appendChild(button('btn btn-back', t('menu.back'), onBack));
    return row;
  }

  // ---------------- settings ----------------

  private renderSettings(host: HTMLElement): void {
    const panel = el('div', 'panel panel-scroll');
    panel.appendChild(el('h2', 'panel-title', t('settings.title')));

    const s = getSettings();
    const set = <K extends keyof Settings>(key: K, value: Settings[K]): void => {
      mutate((save) => {
        save.settings[key] = value;
      });
    };

    const slider = (label: string, key: 'masterVolume' | 'musicVolume' | 'sfxVolume' | 'ambientVolume' | 'shakeIntensity' | 'particleDensity', max = 1.5): HTMLElement => {
      const row = el('label', 'opt-row');
      const span = el('span', 'opt-label', label);
      const input = el('input');
      input.type = 'range';
      input.min = '0';
      input.max = String(max);
      input.step = '0.05';
      input.value = String(s[key]);
      input.addEventListener('input', () => set(key, Number(input.value)));
      row.append(span, input);
      return row;
    };

    const select = <K extends keyof Settings>(
      label: string,
      key: K,
      options: Array<[string, Settings[K]]>,
    ): HTMLElement => {
      const row = el('label', 'opt-row');
      row.appendChild(el('span', 'opt-label', label));
      const input = el('select');
      for (const [label2, value] of options) {
        const o = el('option', undefined, label2);
        o.value = String(value);
        if (String(s[key]) === String(value)) o.selected = true;
        input.appendChild(o);
      }
      input.addEventListener('change', () => {
        const found = options.find(([, v]) => String(v) === input.value);
        if (found) set(key, found[1]);
      });
      row.appendChild(input);
      return row;
    };

    const toggle = (label: string, key: 'highContrast' | 'reduceMotion' | 'reduceFlashes' | 'leftCanFire'): HTMLElement => {
      const row = el('label', 'opt-row');
      const input = el('input');
      input.type = 'checkbox';
      input.checked = s[key];
      input.addEventListener('change', () => set(key, input.checked));
      row.append(el('span', 'opt-label', label), input);
      return row;
    };

    const group = (title: string, children: HTMLElement[]): HTMLElement => {
      const g = el('div', 'opt-group');
      g.appendChild(el('h3', 'opt-group-title', title));
      g.append(...children);
      return g;
    };

    panel.appendChild(
      group(t('settings.audio'), [
        slider(t('settings.master'), 'masterVolume'),
        slider(t('settings.music'), 'musicVolume'),
        slider(t('settings.sfx'), 'sfxVolume'),
        slider(t('settings.ambient'), 'ambientVolume'),
      ]),
    );
    panel.appendChild(
      group(t('settings.video'), [
        select(t('settings.quality'), 'quality', [
          [t('settings.quality.low'), 'low'],
          [t('settings.quality.medium'), 'medium'],
          [t('settings.quality.high'), 'high'],
        ]),
        slider(t('settings.shake'), 'shakeIntensity'),
        slider(t('settings.particles'), 'particleDensity'),
        button('btn', t('settings.fullscreen'), () => {
          if (document.fullscreenElement) void document.exitFullscreen?.();
          else void document.documentElement.requestFullscreen?.();
        }),
      ]),
    );
    panel.appendChild(
      group(t('settings.a11y'), [
        select(t('settings.colorblind'), 'colorblind', [
          [t('settings.cb.off'), 'off'],
          [t('settings.cb.protanopia'), 'protanopia'],
          [t('settings.cb.deuteranopia'), 'deuteranopia'],
          [t('settings.cb.tritanopia'), 'tritanopia'],
        ]),
        toggle(t('settings.contrast'), 'highContrast'),
        toggle(t('settings.reduceMotion'), 'reduceMotion'),
        toggle(t('settings.reduceFlashes'), 'reduceFlashes'),
      ]),
    );
    panel.appendChild(
      group(t('settings.input'), [
        toggle(t('settings.leftCanFire'), 'leftCanFire'),
        this.keyRow(t('settings.keyReload'), 'keyReload'),
        this.keyRow(t('settings.keyPause'), 'keyPause'),
        select(t('settings.language'), 'language', [
          [t('settings.auto'), 'auto'],
          ['Deutsch', 'de'],
          ['English', 'en'],
        ]),
      ]),
    );
    const danger = el('div', 'opt-group');
    const reset = button('btn btn-danger', t('settings.resetSave'), () => {
      if (window.confirm(t('settings.resetSave.confirm'))) {
        resetSave();
        bus.emit('settings:changed', undefined);
      }
    });
    danger.appendChild(reset);
    panel.appendChild(danger);
    panel.appendChild(this.backRow(() => this.open('menu')));
    host.appendChild(panel);
  }

  private keyRow(label: string, key: 'keyReload' | 'keyPause'): HTMLElement {
    const row = el('div', 'opt-row');
    row.appendChild(el('span', 'opt-label', label));
    const btn = button('btn btn-key', this.formatKey(getSettings()[key]), () => {
      btn.textContent = t('settings.pressKey');
      const grab = (e: KeyboardEvent): void => {
        e.preventDefault();
        e.stopPropagation();
        mutate((save) => {
          save.settings[key] = e.code;
        });
        btn.textContent = this.formatKey(e.code);
        window.removeEventListener('keydown', grab, true);
      };
      window.addEventListener('keydown', grab, { capture: true, once: true });
    });
    row.appendChild(btn);
    return row;
  }

  private formatKey(code: string): string {
    return code
      .replace('Key', '')
      .replace('Digit', '')
      .replace('Escape', 'Esc')
      .replace('Backquote', '`')
      .replace('Arrow', '');
  }

  // ---------------- stats ----------------

  private renderStats(host: HTMLElement): void {
    const panel = el('div', 'panel panel-scroll');
    panel.appendChild(el('h2', 'panel-title', t('stats.title')));
    const g = loadSave().stats;
    const acc = g.totalShots > 0 ? Math.round((g.totalHits / g.totalShots) * 100) : 0;
    const mins = Math.floor(g.playSeconds / 60);
    const rows: Array<[string, string]> = [
      [t('stats.rounds'), String(g.rounds)],
      [t('stats.shots'), String(g.totalShots)],
      [t('stats.hits'), String(g.totalHits)],
      [t('stats.accuracy'), `${acc}%`],
      [t('stats.perfect'), String(g.totalPerfect)],
      [t('stats.bestCombo'), String(g.bestComboEver)],
      [t('stats.bosses'), String(g.bossKillsEver)],
      [t('stats.chains'), String(g.chainsEver)],
      [t('stats.time'), `${mins} min`],
    ];
    const table = el('div', 'stat-table');
    for (const [k, v] of rows) {
      const r = el('div', 'stat-row');
      r.append(el('span', undefined, k), el('strong', undefined, v));
      table.appendChild(r);
    }
    panel.appendChild(table);
    const kinds = Object.entries(g.kindHits).filter(([, n]) => (n ?? 0) > 0);
    if (kinds.length) {
      panel.appendChild(el('h3', 'opt-group-title', t('stats.byKind')));
      const chips = el('div', 'chip-row');
      for (const [kind, n] of kinds) chips.appendChild(el('span', 'chip', `${t(`target.${kind}`)}  x${n}`));
      panel.appendChild(chips);
    }
    panel.appendChild(this.backRow(() => this.open('menu')));
    host.appendChild(panel);
  }

  // ---------------- highscores ----------------

  private renderHighscores(host: HTMLElement): void {
    const panel = el('div', 'panel panel-scroll');
    panel.appendChild(el('h2', 'panel-title', t('hs.title')));
    const save = loadSave();
    const entries = Object.entries(save.highscores);
    if (!entries.length) panel.appendChild(el('p', 'empty', t('hs.empty')));
    const table = el('table', 'hs-table');
    const thead = el('thead');
    const head = el('tr');
    for (const h of [t('menu.modes'), t('menu.map'), t('result.total'), t('result.rank'), t('result.accuracy'), t('hs.date')])
      head.appendChild(el('th', undefined, h));
    table.appendChild(head);
    for (const [key, e] of entries.sort((a, b) => b[1].score - a[1].score)) {
      const [mode, map] = key.split('|');
      const tr = el('tr');
      tr.append(
        el('td', undefined, t(`mode.${mode}`)),
        el('td', undefined, map),
        el('td', undefined, e.score.toLocaleString('de-DE')),
        el('td', undefined, e.rank),
        el('td', undefined, `${e.accuracy}%`),
        el('td', undefined, e.date),
      );
      table.appendChild(tr);
    }
    thead.appendChild(head);
    table.appendChild(thead);
    panel.appendChild(table);
    panel.appendChild(this.backRow(() => this.open('menu')));
    host.appendChild(panel);
  }

  // ---------------- achievements ----------------

  private renderAchievements(host: HTMLElement): void {
    const panel = el('div', 'panel panel-scroll');
    panel.appendChild(el('h2', 'panel-title', t('ach.title')));
    const save = loadSave();
    const earned = new Set(save.progress.achievements);
    const grid = el('div', 'ach-grid');
    for (const a of ACHIEVEMENTS) {
      const on = earned.has(a.id);
      const item = el('div', `ach-item${on ? ' earned' : ''}`);
      item.append(
        el('div', 'ach-icon', on ? '\u2605' : '\u2606'),
        el('div', 'ach-name', t(a.nameKey)),
        el('div', 'ach-desc', t(a.descKey)),
      );
      grid.appendChild(item);
    }
    panel.appendChild(grid);
    panel.appendChild(this.backRow(() => this.open('menu')));
    host.appendChild(panel);
  }

  // ---------------- progress / shop ----------------

  private renderProgress(host: HTMLElement): void {
    const panel = el('div', 'panel panel-scroll');
    panel.appendChild(el('h2', 'panel-title', t('prog.title')));
    const save = loadSave();
    const p = save.progress;
    const lvl = levelFromXp(p.xp);
    const head = el('div', 'prog-head');
    const bar = el('div', 'xp-bar');
    const fill = el('div', 'xp-fill');
    fill.style.width = `${Math.round(lvl.progress * 100)}%`;
    bar.appendChild(fill);
    head.append(
      el('div', 'prog-level', t('prog.level', { n: lvl.level })),
      bar,
      el('div', 'prog-xp', t('prog.xp', { cur: lvl.xpIntoLevel, need: lvl.xpForNext })),
      el('div', 'prog-feathers', `${p.currency} ${t('prog.currency')}`),
    );
    panel.appendChild(head);

    const shop = (title: string, list: typeof CROSSHAIRS, active: string, owned: string[], kind: 'crosshair' | 'hud' | 'weapon'): HTMLElement => {
      const g = el('div', 'opt-group');
      g.appendChild(el('h3', 'opt-group-title', title));
      const row = el('div', 'shop-row');
      for (const c of list) {
        const has = owned.includes(c.id) || c.price === 0;
        const isActive = active === c.id;
        const levelOk = p.level >= c.unlockLevel;
        const card = el('div', `shop-card${isActive ? ' active' : ''}`);
        card.append(
          el('div', 'shop-name', c.name[currentLang()]),
          el('div', 'shop-meta', has ? (isActive ? t('prog.equipped') : t('prog.equip')) : levelOk ? t('prog.buy', { n: c.price }) : t('menu.levelReq', { n: c.unlockLevel })),
        );
        card.addEventListener('click', () => {
          if (isActive) return;
          if (!has) {
            if (!levelOk || p.currency < c.price) return;
            mutate((s2) => {
              s2.progress.currency -= c.price;
              (kind === 'crosshair'
                ? s2.progress.ownedCrosshairs
                : kind === 'hud'
                  ? s2.progress.ownedHuds
                  : s2.progress.ownedWeapons).push(c.id);
            });
            bus.emit('ui:toast', { text: `${c.name[currentLang()]} \u00b7 ${t('prog.equip')}`, kind: 'gold' });
          }
          mutate((s2) => {
            if (kind === 'crosshair') s2.progress.activeCrosshair = c.id;
            else if (kind === 'hud') s2.progress.activeHud = c.id;
            else s2.progress.activeWeapon = c.id;
          });
          this.open('progress');
        });
        row.appendChild(card);
      }
      g.appendChild(row);
      return g;
    };

    panel.appendChild(shop(t('prog.unlockCrosshair'), CROSSHAIRS, p.activeCrosshair, p.ownedCrosshairs, 'crosshair'));
    panel.appendChild(shop(t('prog.unlockHud'), HUD_THEMES, p.activeHud, p.ownedHuds, 'hud'));
    panel.appendChild(shop(t('prog.unlockWeapon'), WEAPON_SKINS, p.activeWeapon, p.ownedWeapons, 'weapon'));

    panel.appendChild(el('h3', 'opt-group-title', t('prog.challenges')));
    const chList = el('div', 'challenge-list');
    for (const ch of CHALLENGES) {
      const done = p.claimedChallenges.includes(ch.id);
      const ready = challengeReadyToClaim(save, ch.id);
      const value = p.challengeProgress[ch.id] ?? 0;
      const item = el('div', `challenge${done ? ' done' : ready ? ' ready' : ''}`);
      item.append(
        el('div', 'challenge-name', t(ch.nameKey)),
        el('div', 'challenge-prog', `${Math.min(value, ch.goal)} / ${ch.goal} (${ch.metric})`),
      );
      if (ready && !done) {
        item.appendChild(
          button('btn btn-claim', t('prog.claim'), () => {
            if (claimChallenge(ch.id, ch.reward)) bus.emit('ui:toast', { text: `${t('prog.claim')} +${ch.reward}`, kind: 'gold' });
            this.open('progress');
          }),
        );
      } else if (done) {
        item.appendChild(el('span', 'challenge-claimed', t('prog.claimed')));
      }
      chList.appendChild(item);
    }
    panel.appendChild(chList);
    panel.appendChild(this.backRow(() => this.open('menu')));
    host.appendChild(panel);
  }

  // ---------------- howto / credits ----------------

  private renderHowto(host: HTMLElement): void {
    const panel = el('div', 'panel');
    panel.appendChild(el('h2', 'panel-title', t('howto.title')));
    const list = el('ul', 'howto-list');
    for (const k of ['howto.move', 'howto.fire', 'howto.reload', 'howto.combo', 'howto.perfect', 'howto.bonus', 'howto.modes'])
      list.appendChild(el('li', undefined, t(k)));
    panel.appendChild(list);
    panel.appendChild(button('btn btn-primary', t('howto.gotit'), () => this.open('menu')));
    host.appendChild(panel);
  }

  private renderCredits(host: HTMLElement): void {
    const panel = el('div', 'panel');
    panel.appendChild(el('h2', 'panel-title', t('credits.title')));
    for (const k of ['credits.intro', 'credits.designCode', 'credits.art', 'credits.audio', 'credits.engine', 'credits.inspiration', 'credits.note'])
      panel.appendChild(el('p', 'credit-line', t(k)));
    panel.appendChild(this.backRow(() => this.open('menu')));
    host.appendChild(panel);
  }

  // ---------------- results ----------------

  private renderResults(host: HTMLElement, r?: RunResult): void {
    if (!r) {
      this.open('menu');
      return;
    }
    const panel = el('div', 'panel panel-results');
    panel.appendChild(el('h2', 'panel-title', t('result.title')));
    const big = el('div', 'result-head');
    big.append(
      el('div', `result-rank rank-${r.rank}`, r.rank),
      el('div', 'result-score', r.score.toLocaleString('de-DE')),
      el('div', 'result-sub', `${t(`mode.${r.mode}`)} · ${t(`map.${r.map}`)}`),
    );
    if (r.isBest) big.appendChild(el('div', 'result-record', t('result.newRecord')));
    else if (r.previousBest > 0)
      big.appendChild(
        el('div', 'result-near', t(r.score > r.previousBest ? 'result.beat' : 'result.beatBy', { n: Math.abs(r.score - r.previousBest).toLocaleString('de-DE') })),
      );
    if (r.dailyBest !== undefined) big.appendChild(el('div', 'result-daily', t('result.dailybest', { n: r.dailyBest.toLocaleString('de-DE') })));
    if (r.leveledUp) big.appendChild(el('div', 'result-levelup', t('result.levelUp', { n: r.newLevel })));
    panel.appendChild(big);

    const s = r.stats;
    const acc = s.shots > 0 ? Math.round((s.hits / s.shots) * 100) : 0;
    const rows: Array<[string, string]> = [
      [t('result.hits'), String(s.hits)],
      [t('result.shots'), String(s.shots)],
      [t('result.accuracy'), `${acc}%`],
      [t('result.perfect'), String(s.perfects)],
      [t('result.bestCombo'), String(s.bestCombo)],
      [t('result.bestHit'), s.bestHit.toLocaleString('de-DE')],
      [t('result.reaction'), s.reactionCount > 0 ? `${Math.round((s.reactionSum / s.reactionCount) * 1000)} ms` : '\u2013'],
      [t('result.events'), String(s.eventBonus)],
      [t('result.env'), String(s.envBonus)],
      [t('result.chains'), s.chainsDone.length ? s.chainsDone.map((c) => humanizeChainId(c)).join(', ') : '\u2013'],
      [t('result.bosses'), String(s.bossKills)],
      [t('result.xp'), `+${r.xp}`],
      [t('result.feathers'), `+${r.currencyEarned}`],
    ];
    const table = el('div', 'stat-table');
    for (const [k, v] of rows) {
      const row = el('div', 'stat-row');
      row.append(el('span', undefined, k), el('strong', undefined, v));
      table.appendChild(row);
    }
    panel.appendChild(table);
    if (r.newAchievements.length) {
      const ach = el('div', 'result-ach');
      for (const id of r.newAchievements) {
        const def = ACHIEVEMENTS.find((a) => a.id === id);
        ach.appendChild(el('div', 'result-ach-item', `\u2605 ${def ? t(def.nameKey) : id}`));
      }
      panel.appendChild(ach);
    }
    const actions = el('div', 'panel-actions');
    actions.append(
      button('btn btn-primary', t('result.retry'), () => {
        const last = getLastRun();
        if (last) startRun({ ...last, seed: last.mode === 'daily' ? dailySeed(todayKey()) : (Math.random() * 2147483647) | 0 });
      }),
      button('btn', t('result.menu'), () => {
        quitToMenu();
        this.open('menu');
      }),
    );
    panel.appendChild(actions);
    host.appendChild(panel);
  }

  // ---------------- pause / quit ----------------

  private renderPause(host: HTMLElement): void {
    const panel = el('div', 'panel panel-pause');
    panel.appendChild(el('h2', 'panel-title', t('pause.title')));
    panel.appendChild(el('p', 'pause-hint', t('pause.hint', { key: t('pause.resumeKey') })));
    const actions = el('div', 'panel-actions');
    actions.append(
      button('btn btn-primary', t('menu.resume'), () => bus.emit('round:resume', undefined)),
      button('btn', t('menu.restart'), () => {
        const last = getLastRun();
        bus.emit('round:resume', undefined);
        if (last) startRun({ ...last, seed: last.mode === 'daily' ? dailySeed(todayKey()) : (Math.random() * 2147483647) | 0 });
      }),
      button('btn btn-danger', t('menu.quit'), () => this.open('quit')),
    );
    panel.appendChild(actions);
    host.appendChild(panel);
  }

  private renderQuit(host: HTMLElement): void {
    const panel = el('div', 'panel panel-pause');
    panel.appendChild(el('h2', 'panel-title', t('quit.confirm.title')));
    const actions = el('div', 'panel-actions');
    actions.append(
      button('btn btn-danger', t('quit.confirm.yes'), () => {
        this.closeAll();
        bus.emit('round:quit', undefined);
        quitToMenu();
        this.open('menu');
      }),
      button('btn', t('quit.confirm.no'), () => {
        this.closeAll();
        bus.emit('round:resume', undefined);
      }),
    );
    panel.appendChild(actions);
    host.appendChild(panel);
  }
}

/** 'nbl.ropeBell' -> 'Rope Bell' – readable fallback for the results breakdown. */
function humanizeChainId(chainId: string): string {
  const tail = chainId.split('.').pop() ?? chainId;
  const spaced = tail.replace(/([a-z])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
