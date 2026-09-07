/**
 * HTML/CSS UI layer. Mounts into #ui-root and bridges the Phaser scenes to the
 * DOM through the typed event buses only (no globals, no direct scene access).
 *
 * Screens: main menu, mode select, map select, settings, statistics,
 * progression, achievements, highscores, credits, how-to, pause, results,
 * plus the in-round HUD overlay.
 */
import type Phaser from 'phaser';
import type { AppContext } from '../game/context';
import type { GameMode, MapId, Language, Quality } from '../core/types';
import { GAME_MODES, MODES } from '../core/modes';
import { MAPS, MAP_IDS } from '../core/maps';
import { ACHIEVEMENTS } from '../core/achievements';
import { xpForLevel } from '../core/save';
import { accuracy } from '../core/rank';
import { dailySeed } from '../core/rng';
import type {
  RoundEndPayload,
  HudPayload,
  ComboPayload,
  EventPayload,
  BossPayload,
  ScorePopupPayload,
  ToastPayload
} from './EventBus';

interface MountCallbacks {
  onRoundStart(mode: GameMode, map: MapId, seed: number): void;
}

type ScreenId =
  | 'menu'
  | 'modes'
  | 'maps'
  | 'settings'
  | 'stats'
  | 'progress'
  | 'achievements'
  | 'highscores'
  | 'credits'
  | 'howto'
  | 'pause'
  | 'results';

export function mountUI(ctx: AppContext, game: Phaser.Game, callbacks: MountCallbacks): void {
  const i18n = ctx.i18n;
  const t = (k: string, vars?: Record<string, string | number>): string => i18n.t(k, vars);

  const root = document.getElementById('ui-root');
  if (!root) return;
  root.innerHTML = '';

  // Selection state
  let selectedMode: GameMode = 'classic';
  let selectedMap: MapId = 'nebelmoor';

  // Refs populated as screens are built (declared up front to avoid TDZ).
  const highscoresRef: { body?: HTMLElement } = {};
  const resultsRefs: {
    p: HTMLElement;
    rank: HTMLElement;
    newrec: HTMLElement;
    score: HTMLElement;
    rewards: HTMLElement;
    unlockNote: HTMLElement;
    grid: HTMLElement;
  } = {
    p: null as unknown as HTMLElement,
    rank: null as unknown as HTMLElement,
    newrec: null as unknown as HTMLElement,
    score: null as unknown as HTMLElement,
    rewards: null as unknown as HTMLElement,
    unlockNote: null as unknown as HTMLElement,
    grid: null as unknown as HTMLElement
  };

  const el = <T extends HTMLElement = HTMLElement>(
    tag: string,
    cls?: string,
    text?: string
  ): T => {
    const e = document.createElement(tag) as T;
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };

  // ---------------------------------------------------------------------
  // i18n retranslation registry. Static labels are created with an i18n key
  // and registered here so that switching the language can re-label every
  // visible panel at once (see retranslate()). Dynamic values (score, ammo,
  // combo, toasts, …) are deliberately NOT registered — they are written by
  // the game→UI handlers using i18n.t() at emit time, so they already pick
  // up the active language.
  // ---------------------------------------------------------------------
  type I18nEntry = {
    node: HTMLElement;
    key?: string;
    vars?: Record<string, string | number>;
    render?: () => string;
  };
  const i18nReg: I18nEntry[] = [];
  const tagI18n = (node: HTMLElement, key: string, vars?: Record<string, string | number>): HTMLElement => {
    node.textContent = t(key, vars);
    i18nReg.push({ node, key, vars });
    return node;
  };
  // For labels that embed dynamic values (e.g. "XP: 120 / 300") so they can
  // be re-translated while keeping the live numbers.
  const tagRender = (node: HTMLElement, render: () => string): HTMLElement => {
    node.textContent = render();
    i18nReg.push({ node, render });
    return node;
  };
  const tl = <T extends HTMLElement = HTMLElement>(
    tagName: string,
    cls: string,
    key: string,
    vars?: Record<string, string | number>
  ): T => {
    const e = document.createElement(tagName) as T;
    if (cls) e.className = cls;
    tagI18n(e, key, vars);
    return e;
  };

  const btn = (
    key: string,
    cls: string,
    onClick: () => void,
    vars?: Record<string, string | number>
  ): HTMLButtonElement => {
    const b = el('button', `btn ${cls}`) as HTMLButtonElement;
    tagI18n(b, key, vars);
    b.addEventListener('click', () => {
      ctx.audio.playSfx('menu_confirm');
      onClick();
    });
    return b;
  };

  // =====================================================================
  // Build all screens once.
  // =====================================================================
  const screens: Partial<Record<ScreenId, HTMLElement>> = {};

  // ---------------- Main menu ----------------
  {
    const s = el('div', 'screen menu-screen');
    const wrap = el('div', 'panel small menu-wrap');
    const brand = el('div', 'brand');
    brand.append(tl('h1', '', 'app.title'), tl('p', '', 'app.subtitle'));

    const col = el('div', 'menu-col');
    col.append(
      btn('menu.play', 'primary', () => showScreen('modes')),
      btn('menu.howto', '', () => showScreen('howto')),
      btn('menu.highscores', '', () => showScreen('highscores')),
      btn('menu.stats', '', () => showScreen('stats')),
      btn('menu.progress', '', () => showScreen('progress')),
      btn('menu.achievements', '', () => showScreen('achievements')),
      btn('menu.settings', '', () => showScreen('settings')),
      btn('menu.credits', 'ghost', () => showScreen('credits'))
    );
    wrap.append(brand, col);
    s.append(wrap);
    screens.menu = s;
  }

  // ---------------- Mode select ----------------
  {
    const s = el('div', 'screen');
    const p = el('div', 'panel');
    const head = el('div', 'section-head');
    head.append(
      tl('h2', 'title', 'menu.mode'),
      btn('menu.back', 'back-btn', () => showScreen('menu'))
    );
    const grid = el('div', 'grid cols-3');
    for (const mode of GAME_MODES) {
      const cfg = MODES[mode];
      const unlocked = ctx.save.progression.unlockedModes.includes(mode);
      const card = el('div', `card${unlocked ? '' : ' locked'}`);
      const name = tl('h3', '', cfg.nameKey);
      const desc = tl('p', '', cfg.descKey);
      card.append(name, desc);
      if (!unlocked) {
        card.append(tagRender(el('div', 'badge'), () => '🔒 ' + t('common.locked')));
      } else {
        card.addEventListener('click', () => {
          ctx.audio.playSfx('menu_confirm');
          selectedMode = mode;
          grid.querySelectorAll('.card').forEach((c) => c.classList.remove('selected'));
          card.classList.add('selected');
        });
      }
      grid.append(card);
    }
    const row = el('div', 'row');
    row.append(el('div', '', ''), btn('menu.next', 'primary', () => showScreen('maps')));
    p.append(head, grid, row);
    s.append(p);
    screens.modes = s;
  }

  // ---------------- Map select ----------------
  {
    const s = el('div', 'screen');
    const p = el('div', 'panel');
    const head = el('div', 'section-head');
    head.append(
      tl('h2', 'title', 'menu.map'),
      btn('menu.back', 'back-btn', () => showScreen('modes'))
    );
    const grid = el('div', 'grid cols-3');
    for (const map of MAP_IDS) {
      const cfg = MAPS[map];
      const unlocked = ctx.save.progression.unlockedMaps.includes(map);
      const card = el('div', `card${unlocked ? '' : ' locked'}`);
      const swatch = el('div', 'swatch');
      swatch.style.background = `linear-gradient(90deg, ${cfg.skyTop}, ${cfg.skyBottom})`;
      const name = tl('h3', '', cfg.nameKey);
      const desc = tl('p', '', cfg.descKey);
      card.append(swatch, name, desc);
      if (!unlocked) {
        card.append(tagRender(el('div', 'badge'), () => '🔒 ' + t('common.locked')));
      } else {
        card.addEventListener('click', () => {
          ctx.audio.playSfx('menu_confirm');
          selectedMap = map;
          grid.querySelectorAll('.card').forEach((c) => c.classList.remove('selected'));
          card.classList.add('selected');
        });
      }
      grid.append(card);
    }
    const row = el('div', 'row');
    row.append(el('div', '', ''), btn('menu.start', 'primary', startRound));
    p.append(head, grid, row);
    s.append(p);
    screens.maps = s;
  }

  // ---------------- Settings ----------------
  {
    const s = el('div', 'screen');
    const p = el('div', 'panel');
    const head = el('div', 'section-head');
    head.append(
      tl('h2', 'title', 'settings.title'),
      btn('menu.back', 'back-btn', () => showScreen('menu'))
    );
    const grid = el('div', 'settings-grid');

    const slider = (
      labelKey: string,
      get: () => number,
      set: (v: number) => void,
      min = 0,
      max = 1,
      step = 0.05,
      live?: (v: number) => void
    ): HTMLElement => {
      const box = el('div', 'setting');
      const lab = el('div', 'label');
      const name = tl('span', '', labelKey);
      const val = el('span', 'val', Math.round(get() * 100) + '%');
      lab.append(name, val);
      const input = el('input') as HTMLInputElement;
      input.type = 'range';
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(get());
      input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        val.textContent = Math.round(v * 100) + '%';
        set(v);
        live?.(v);
      });
      box.append(lab, input);
      return box;
    };

    const st = ctx.settings;
    grid.append(
      slider('settings.master', () => st.volumeMaster, (v) => { st.volumeMaster = v; ctx.persist(() => {}); ctx.audio.setVolumes({ master: v }); }),
      slider('settings.music', () => st.volumeMusic, (v) => { st.volumeMusic = v; ctx.persist(() => {}); ctx.audio.setVolumes({ music: v }); }),
      slider('settings.sfx', () => st.volumeSfx, (v) => { st.volumeSfx = v; ctx.persist(() => {}); ctx.audio.setVolumes({ sfx: v }); }),
      slider('settings.ambient', () => st.volumeAmbient, (v) => { st.volumeAmbient = v; ctx.persist(() => {}); ctx.audio.setVolumes({ ambient: v }); }),
      slider('settings.shake', () => st.screenShake, (v) => { st.screenShake = v; ctx.persist(() => {}); }, 0, 1, 0.1),
      slider('settings.particles', () => st.particleDensity, (v) => { st.particleDensity = v; ctx.persist(() => {}); }, 0, 2, 0.1),
      slider('settings.crosshair', () => st.crosshairSize, (v) => { st.crosshairSize = v; ctx.persist(() => {}); }, 0.5, 2, 0.1)
    );

    // Crosshair color
    const colorBox = el('div', 'setting');
    const colorLab = tl('div', 'label', 'settings.crosshairColor');
    const colorInput = el('input') as HTMLInputElement;
    colorInput.type = 'color';
    colorInput.value = st.crosshairColor;
    colorInput.addEventListener('input', () => {
      st.crosshairColor = colorInput.value;
      ctx.persist(() => {});
    });
    colorBox.append(colorLab, colorInput);
    grid.append(colorBox);

    // Quality
    const qualityBox = el('div', 'setting');
    const qLab = tl('div', 'label', 'settings.quality');
    const qSel = el('select', 'select') as HTMLSelectElement;
    (['low', 'medium', 'high'] as Quality[]).forEach((q) => {
      const o = el('option', '', q) as HTMLOptionElement;
      o.value = q;
      if (st.quality === q) o.selected = true;
      qSel.append(o);
    });
    qSel.addEventListener('change', () => {
      st.quality = qSel.value as Quality;
      ctx.persist(() => {});
    });
    qualityBox.append(qLab, qSel);
    grid.append(qualityBox);

    // Language
    const langBox = el('div', 'setting');
    const lLab = tl('div', 'label', 'settings.language');
    const lSel = el('select', 'select') as HTMLSelectElement;
    (['de', 'en'] as Language[]).forEach((l) => {
      const o = el('option', '', l.toUpperCase()) as HTMLOptionElement;
      o.value = l;
      if (st.language === l) o.selected = true;
      lSel.append(o);
    });
    lSel.addEventListener('change', () => {
      const l = lSel.value as Language;
      st.language = l;
      ctx.persist(() => {});
      i18n.setLang(l);
      retranslate();
    });
    langBox.append(lLab, lSel);
    grid.append(langBox);

    // Toggles
    const toggle = (labelKey: string, get: () => boolean, set: (v: boolean) => void): HTMLElement => {
      const box = el('div', 'setting');
      const lab = el('div', 'label');
      lab.append(tl('span', '', labelKey));
      const tg = el('div', `toggle${get() ? ' on' : ''}`);
      const track = el('div', 'track');
      tg.append(track);
      tg.addEventListener('click', () => {
        const nv = !get();
        set(nv);
        tg.classList.toggle('on', nv);
        ctx.persist(() => {});
        ctx.audio.playSfx('menu_confirm');
      });
      box.append(lab, tg);
      return box;
    };
    grid.append(
      toggle('settings.colorblind', () => st.colorBlind, (v) => { st.colorBlind = v; }),
      toggle('settings.contrast', () => st.highContrast, (v) => { st.highContrast = v; }),
      toggle('settings.motion', () => st.reducedMotion, (v) => { st.reducedMotion = v; }),
      toggle('settings.flashes', () => st.reducedFlashes, (v) => { st.reducedFlashes = v; })
    );

    const row = el('div', 'row');
    row.append(
      btn('settings.reset', 'danger', () => {
        ctx.persist((s) => {
          s.settings = { ...s.settings, ...resetSettings() };
        });
        ctx.audio.setVolumes({
          master: ctx.settings.volumeMaster,
          music: ctx.settings.volumeMusic,
          sfx: ctx.settings.volumeSfx,
          ambient: ctx.settings.volumeAmbient
        });
        retranslate();
      }),
      el('div', '', '')
    );
    p.append(head, grid, row);
    s.append(p);
    screens.settings = s;
  }

  // ---------------- Statistics ----------------
  {
    const s = el('div', 'screen');
    const p = el('div', 'panel');
    const head = el('div', 'section-head');
    head.append(
      tl('h2', 'title', 'stats.title'),
      btn('menu.back', 'back-btn', () => showScreen('menu'))
    );
    const grid = el('div', 'stat-grid');
    const stats = ctx.save.stats;
    const acc = stats.totalShots > 0 ? accuracy(stats.totalHits, stats.totalShots) : 0;
    const items: [string, number | string][] = [
      ['stats.rounds', stats.totalRounds],
      ['stats.shots', stats.totalShots],
      ['stats.hits', stats.totalHits],
      ['stats.accuracy', Math.round(acc * 100) + '%'],
      ['stats.perfect', stats.totalPerfect],
      ['stats.best', stats.bestScore],
      ['stats.bosses', stats.bossKills],
      ['stats.chains', stats.chainReactions],
      ['results.maxcombo', stats.longestCombo]
    ];
    for (const [k, v] of items) {
      const st = el('div', 'stat');
      st.append(el('div', 'n', String(v)), tagI18n(el('div', 'k'), k));
      grid.append(st);
    }
    p.append(head, grid);
    s.append(p);
    screens.stats = s;
  }

  // ---------------- Progression ----------------
  {
    const s = el('div', 'screen');
    const p = el('div', 'panel');
    const head = el('div', 'section-head');
    head.append(
      tl('h2', 'title', 'progress.title'),
      btn('menu.back', 'back-btn', () => showScreen('menu'))
    );
    const prog = ctx.save.progression;
    const need = xpForLevel(prog.level);
    const frac = Math.min(1, prog.xp / Math.max(1, need));
    const top = el('div', '');
    const lvl = el('div', 'stat-grid');
    lvl.append(
      stat('progress.level', prog.level),
      stat('progress.coins', prog.featherCoins),
      stat('results.maxcombo', ctx.save.stats.longestCombo)
    );
    const xpbar = el('div', 'xpbar');
    const fill = el('div', 'fill');
    fill.style.width = Math.round(frac * 100) + '%';
    xpbar.append(fill);
    const xpLabel = el('div', 'subtitle');
    tagRender(xpLabel, () => `${t('progress.xp')}: ${prog.xp} / ${need}`);
    const mapsRow = el('div', '');
    mapsRow.append(tl('h3', '', 'menu.map'));
    const mapChips = el('div', '');
    for (const m of MAP_IDS) {
      const chip = el('span', 'reward-chip');
      tagRender(chip, () => `${ctx.save.progression.unlockedMaps.includes(m) ? '✅' : '🔒'} ${t(MAPS[m].nameKey)}`);
      chip.style.margin = '4px';
      mapChips.append(chip);
    }
    mapsRow.append(mapChips);
    top.append(lvl, xpbar, xpLabel, mapsRow);
    p.append(head, top);
    s.append(p);
    screens.progress = s;
  }

  // ---------------- Achievements ----------------
  {
    const s = el('div', 'screen');
    const p = el('div', 'panel');
    const head = el('div', 'section-head');
    head.append(
      tl('h2', 'title', 'ach.title'),
      btn('menu.back', 'back-btn', () => showScreen('menu'))
    );
    const grid = el('div', 'ach-grid');
    const done = ctx.save.progression.unlockedAchievements;
    for (const a of ACHIEVEMENTS) {
      const is = done.includes(a.id);
      const box = el('div', `ach${is ? ' done' : ''}`);
      const ico = el('div', 'ico', is ? a.icon : '🔒');
      const txt = el('div', 'txt');
      txt.append(tl('h4', '', a.nameKey), tl('p', '', a.descKey));
      box.append(ico, txt);
      grid.append(box);
    }
    p.append(head, grid);
    s.append(p);
    screens.achievements = s;
  }

  // ---------------- Highscores ----------------
  {
    const s = el('div', 'screen');
    const p = el('div', 'panel');
    const head = el('div', 'section-head');
    head.append(
      tl('h2', 'title', 'menu.highscores'),
      btn('menu.back', 'back-btn', () => showScreen('menu'))
    );
    const body = el('div', '');
    p.append(head, body);
    s.append(p);
    screens.highscores = s;
    highscoresRef.body = body;
  }
  function renderHighscores(): void {
    const body = highscoresRef.body;
    if (!body) return;
    body.innerHTML = '';
    const hs = ctx.save.highscores;
    const keys = Object.keys(hs).sort();
    if (keys.length === 0) {
      body.append(el('p', 'subtitle', '—'));
      return;
    }
    for (const key of keys) {
      const [mode, map] = key.split(':') as [GameMode, MapId];
      const list = hs[key].slice(0, 5);
      const h = el('h3', '', `${t(MODES[mode].nameKey)} · ${t(MAPS[map].nameKey)}`);
      body.append(h);
      const table = el('table', 'hs-table');
      const thead = el('thead');
      const hr = el('tr');
      hr.append(el('th', '', '#'), el('th', '', t('results.score')), el('th', '', t('results.rank')), el('th', '', t('results.accuracy')), el('th', '', t('results.maxcombo')));
      thead.append(hr);
      table.append(thead);
      const tbody = el('tbody');
      list.forEach((e, i) => {
        const tr = el('tr');
        tr.append(
          el('td', '', String(i + 1)),
          el('td score', '', String(e.score)),
          el('td', '', e.rank),
          el('td', '', Math.round(e.accuracy * 100) + '%'),
          el('td', '', e.maxCombo + 'x')
        );
        tbody.append(tr);
      });
      table.append(tbody);
      body.append(table);
    }
  }

  // ---------------- How-to ----------------
  {
    const s = el('div', 'screen');
    const p = el('div', 'panel');
    const head = el('div', 'section-head');
    head.append(
      tl('h2', 'title', 'howto.title'),
      btn('menu.back', 'back-btn', () => showScreen('menu'))
    );
    const list = el('div', 'howto-list');
    const items: [string, string][] = [
      ['🖱️', 'howto.aim'],
      ['🔫', 'howto.shoot'],
      ['🔄', 'howto.reload'],
      ['🔥', 'howto.combo'],
      ['🐦', 'howto.targets'],
      ['⚠️', 'howto.avoid']
    ];
    for (const [k, v] of items) {
      const it = el('div', 'howto-item');
      it.append(el('div', 'k', k), tagI18n(el('div', ''), v));
      list.append(it);
    }
    p.append(head, list);
    s.append(p);
    screens.howto = s;
  }

  // ---------------- Credits ----------------
  {
    const s = el('div', 'screen');
    const p = el('div', 'panel');
    const head = el('div', 'section-head');
    head.append(
      tl('h2', 'title', 'menu.credits'),
      btn('menu.back', 'back-btn', () => showScreen('menu'))
    );
    const c = el('div', 'credits-block');
    const cTitle = el('h4');
    tagRender(cTitle, () => `${t('app.title')} — ${t('app.subtitle')}`);
    const cAbout = tagI18n(el('p'), 'credits.about');
    const cEngineH = tl('h4', '', 'credits.engine');
    const cEngine = tl('p', '', 'credits.engineVal');
    const cControlsH = tl('h4', '', 'credits.controls');
    const cControls = tl('p', '', 'credits.controlsVal');
    c.append(cTitle, cAbout, cEngineH, cEngine, cControlsH, cControls);
    p.append(head, c);
    s.append(p);
    screens.credits = s;
  }

  // ---------------- Pause ----------------
  {
    const s = el('div', 'screen');
    const p = el('div', 'panel narrow');
    const title = tl('h2', 'title', 'menu.pause');
    const list = el('div', 'pause-list');
    list.append(
      btn('menu.resume', 'primary', () => { ctx.uiBus.emit('resume', undefined); }),
      btn('menu.restart', '', () => { ctx.uiBus.emit('restart', undefined); }),
      btn('menu.settings', '', () => showScreen('settings')),
      btn('menu.quit', 'danger', () => { ctx.uiBus.emit('quit-to-menu', undefined); })
    );
    p.append(title, list);
    s.append(p);
    screens.pause = s;
  }

  // ---------------- Results ----------------
  const resultsEl = el('div', 'screen');
  {
    const p = el('div', 'panel');
    const head = el('div', 'results-head');
    const title = tl('h2', 'title', 'results.title');
    const rank = el('div', 'rank-badge', 'D');
    head.append(title, rank);
    p.append(head);
    const newrec = el('div', 'newrecord', '');
    const score = el('div', 'big-score', '0');
    const rewards = el('div', 'reward-row');
    const unlockNote = el('div', 'unlock-note', '');
    const grid = el('div', 'stat-grid');
    p.append(head, newrec, score, rewards, unlockNote, grid);
    const row = el('div', 'row');
    row.append(
      btn('menu.quit', '', () => { ctx.uiBus.emit('quit-to-menu', undefined); }),
      btn('results.playagain', 'primary', () => { ctx.uiBus.emit('restart', undefined); })
    );
    p.append(row);
    resultsEl.append(p);
    screens.results = resultsEl;
    resultsRefs.p = p;
    resultsRefs.rank = rank;
    resultsRefs.newrec = newrec;
    resultsRefs.score = score;
    resultsRefs.rewards = rewards;
    resultsRefs.unlockNote = unlockNote;
    resultsRefs.grid = grid;
  }

  // =====================================================================
  // HUD
  // =====================================================================
  const hud = el('div', '', 'hud') as HTMLElement;
  hud.id = 'hud';
  const top = el('div', 'hud-top');
  const timeBox = el('div', 'hud-box hud-time');
  const timeVal = el('div', 'hud-value', '--');
  const timeLab = tagI18n(el('div', 'hud-label'), 'hud.time');
  timeBox.append(timeVal, timeLab);

  const scoreBox = el('div', 'hud-box hud-center');
  const scoreVal = el('div', 'hud-value', '0');
  const scoreLab = tagI18n(el('div', 'hud-label'), 'hud.score');
  scoreBox.append(scoreVal, scoreLab);

  const ammoBox = el('div', 'hud-box');
  const ammoPips = el('div', 'ammo-row');
  const ammoLab = tagI18n(el('div', 'hud-label'), 'hud.ammo');
  ammoBox.append(ammoPips, ammoLab);

  top.append(timeBox, scoreBox, ammoBox);

  const comboBox = el('div', '', 'combo-box');
  comboBox.id = 'combo-box';
  const comboNum = el('div', '', 'combo-num');
  const comboMult = el('div', '', 'combo-mult');
  const comboMile = el('div', '', 'combo-milestone');
  comboBox.append(comboNum, comboMult, comboMile);

  const eventBanner = el('div', '', 'event-banner');
  eventBanner.id = 'event-banner';

  const bossBar = el('div', '', 'boss-bar');
  bossBar.id = 'boss-bar';
  const bossName = el('div', '', 'boss-name');
  const bossTrack = el('div', '', 'boss-track');
  const bossFill = el('div', '', 'boss-fill');
  bossTrack.append(bossFill);
  bossBar.append(bossName, bossTrack);

  const bottom = el('div', 'hud-bottom');
  const reloadBar = el('div', 'reload-bar');
  const reloadFill = el('div', 'fill');
  reloadBar.append(reloadFill);
  const hint = el('div', 'hud-hint', '');
  bottom.append(reloadBar, hint);

  const toast = el('div', '', 'toast');
  toast.id = 'toast';

  const scoreLayer = el('div', '');
  scoreLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;';

  const countdown = el('div', '', 'countdown');
  countdown.id = 'countdown';
  const cdNum = el('div', '', 'countdown-num');
  countdown.append(cdNum);

  hud.append(top, comboBox, eventBanner, bossBar, bottom, toast, scoreLayer, countdown);

  const debugHud = el('pre', '', 'debug-hud');
  debugHud.id = 'debug-hud';

  root.append(hud, debugHud);
  Object.values(screens).forEach((sc) => root.append(sc as HTMLElement));

  // =====================================================================
  // Helpers
  // =====================================================================
  function stat(k: string, v: number | string): HTMLElement {
    const d = el('div', 'stat');
    d.append(el('div', 'n', String(v)), tagI18n(el('div', 'k'), k));
    return d;
  }

  function resetSettings(): Partial<typeof ctx.settings> {
    return {
      volumeMaster: 0.8,
      volumeMusic: 0.7,
      volumeSfx: 0.85,
      volumeAmbient: 0.6,
      quality: 'high',
      screenShake: 1,
      particleDensity: 1,
      crosshairSize: 1,
      crosshairColor: '#ffd54a',
      colorBlind: false,
      highContrast: false,
      reducedMotion: false,
      reducedFlashes: false
    };
  }

  function showScreen(id: ScreenId): void {
    Object.entries(screens).forEach(([key, sc]) => {
      if (sc) (sc as HTMLElement).classList.toggle('active', key === id);
    });
    if (id === 'highscores') renderHighscores();
    // Hide HUD on any menu screen
    if (id !== 'results' && id !== 'pause') {
      hud.classList.remove('active');
    }
    // When opening settings from pause, keep game paused.
  }

  function retranslate(): void {
    // Drop entries whose nodes were detached (results grid / highscores rebuild).
    for (let i = i18nReg.length - 1; i >= 0; i--) {
      if (!i18nReg[i].node.isConnected) i18nReg.splice(i, 1);
    }
    for (const e of i18nReg) {
      e.node.textContent = e.render ? e.render() : t(e.key!, e.vars);
    }
    if (screens.highscores?.classList.contains('active')) renderHighscores();
  }

  function startRound(): void {
    const seed = selectedMode === 'daily' ? dailySeed(new Date()) : (Date.now() & 0xffffff);
    ctx.audio.resume();
    callbacks.onRoundStart(selectedMode, selectedMap, seed);
  }

  // =====================================================================
  // Game → UI event wiring
  // =====================================================================
  let hudHidden = true;
  function setHud(visible: boolean): void {
    if (hudHidden === !visible) return;
    hudHidden = !visible;
    hud.classList.toggle('active', visible);
    if (!visible) {
      countdown.classList.remove('show');
      eventBanner.classList.remove('show');
      bossBar.classList.remove('show');
      comboBox.classList.remove('show');
    }
  }

  ctx.gameToUi.on('hud', (p: HudPayload) => {
    setHud(true);
    timeVal.textContent = formatTime(p.time);
    scoreVal.textContent = formatScore(p.score);
    // ammo pips
    ammoPips.innerHTML = '';
    const mag = Math.max(1, p.magazine);
    for (let i = 0; i < mag; i++) {
      const pip = el('div', `ammo-pip${i < p.ammo ? '' : ' spent'}`);
      ammoPips.append(pip);
    }
    // reload bar / hint
    if (p.reloading) {
      reloadFill.style.width = '50%';
      hint.textContent = i18n.t('hud.reloading');
      hint.classList.remove('empty');
    } else if (p.empty) {
      reloadFill.style.width = '0%';
      hint.textContent = i18n.t('hud.empty') + ' · ' + i18n.t('hud.reloadHint');
      hint.classList.add('empty');
    } else {
      reloadFill.style.width = '0%';
      hint.textContent = '';
      hint.classList.remove('empty');
    }
    // combo
    if (p.combo >= 2) {
      comboBox.classList.add('show');
      comboNum.textContent = p.combo + 'x';
      comboMult.textContent = '×' + p.multiplier.toFixed(2);
      comboMile.textContent = '';
    } else {
      comboBox.classList.remove('show');
    }
  });

  ctx.gameToUi.on('combo', (p: ComboPayload) => {
    comboMile.textContent = p.label;
    comboBox.classList.add('show');
    comboBox.classList.remove('pulse');
    void comboBox.offsetWidth; // restart animation
    comboBox.classList.add('pulse');
    window.setTimeout(() => comboMile.textContent = '', 1200);
  });

  ctx.gameToUi.on('event', (p: EventPayload) => {
    if (p.active) {
      eventBanner.textContent = p.name;
      eventBanner.classList.add('show');
    } else {
      eventBanner.classList.remove('show');
    }
  });

  ctx.gameToUi.on('boss', (p: BossPayload) => {
    if (p.active) {
      bossName.textContent = p.name;
      bossFill.style.width = Math.max(0, Math.min(1, p.health / p.maxHealth)) * 100 + '%';
      bossBar.classList.add('show');
    } else {
      bossBar.classList.remove('show');
    }
  });

  ctx.gameToUi.on('toast', (p: ToastPayload) => {
    toast.textContent = p.text;
    toast.className = 'toast show ' + p.kind;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2200);
  });
  let toastTimer = 0;

  ctx.gameToUi.on('score-popup', (p: ScorePopupPayload) => {
    const view = game.scale;
    const cx = view.gameSize.width * 0.5;
    const cy = view.gameSize.height * 0.5;
    const left = cx + (p.x / view.baseSize.width - 0.5) * view.gameSize.width;
    const topY = cy + (p.y / view.baseSize.height - 0.5) * view.gameSize.height;
    const pop = el('div', `score-pop${p.perfect ? ' perfect' : ''}${p.value < 0 ? ' negative' : ''}`,
      (p.value > 0 ? '+' : '') + p.value + (p.label ? '\n' + p.label : ''));
    pop.style.left = left + 'px';
    pop.style.top = topY + 'px';
    pop.style.whiteSpace = 'pre';
    scoreLayer.append(pop);
    window.setTimeout(() => pop.remove(), 950);
  });

  ctx.gameToUi.on('countdown', (p: { value: number }) => {
    cdNum.textContent = p.value > 0 ? String(p.value) : 'GO!';
    countdown.classList.add('show');
    void cdNum.offsetWidth;
    cdNum.style.animation = 'none';
    void cdNum.offsetWidth;
    cdNum.style.animation = 'cd 1s ease';
    if (p.value <= 0) {
      window.setTimeout(() => countdown.classList.remove('show'), 700);
    }
  });

  ctx.gameToUi.on('paused', (p: { paused: boolean }) => {
    if (p.paused) showScreen('pause');
    else {
      Object.values(screens).forEach((sc) => {
        if (sc) (sc as HTMLElement).classList.remove('active');
      });
    }
  });

  // Quit-to-menu: the game scene is going away, so re-open the main menu
  // panel (hides the HUD / pause overlay) and let the user pick a new round.
  ctx.gameToUi.on('back-to-menu', () => {
    setHud(false);
    showScreen('menu');
  });

  ctx.gameToUi.on('round-end', (p: RoundEndPayload) => {
    renderResults(p);
    showScreen('results');
    setHud(false);
  });

  // =====================================================================
  // Results
  // =====================================================================
  function renderResults(p: RoundEndPayload): void {
    resultsRefs.rank.textContent = p.rank;
    resultsRefs.rank.className = 'rank-badge ' + p.rank;
    resultsRefs.newrec.textContent = p.isPersonalBest ? i18n.t('results.newrecord') : '';

    const acc = p.shots > 0 ? accuracy(p.hits, p.shots) : 0;
    const rows: [string, number | string][] = [
      ['results.hits', p.hits],
      ['results.misses', p.misses],
      ['results.shots', p.shots],
      ['results.accuracy', Math.round(acc * 100) + '%'],
      ['results.perfect', p.perfectHits],
      ['results.maxcombo', p.maxCombo + 'x'],
      ['results.reaction', p.avgReactionMs > 0 ? Math.round(p.avgReactionMs) + 'ms' : '—'],
      ['results.eventboni', p.eventBonuses],
      ['results.besthit', p.bestHitValue]
    ];
    resultsRefs.grid.innerHTML = '';
    for (const [k, v] of rows) resultsRefs.grid.append(stat(k, v));

    resultsRefs.rewards.innerHTML = '';
    resultsRefs.rewards.append(
      chip('xp', `+${p.xpGained} XP`),
      chip('coins', `+${p.coinsGained} 🪶`)
    );
    const unlocks = [...p.newAchievements, ...p.newUnlocks];
    resultsRefs.unlockNote.textContent =
      unlocks.length > 0 ? '🔓 ' + unlocks.length + ' ' + i18n.t('common.unlock').toLowerCase() : '';

    animateScore(resultsRefs.score, p.score);

    if (p.rank === 'S' || p.rank === 'SS' || p.rank === 'SSS') {
      spawnConfetti(resultsRefs.p);
    }
  }

  function chip(cls: string, text: string): HTMLElement {
    const c = el('span', 'reward-chip ' + cls, text);
    return c;
  }

  function animateScore(node: HTMLElement, target: number): void {
    const start = performance.now();
    const dur = 1000;
    function frame(now: number): void {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      node.textContent = formatScore(Math.round(target * eased));
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function spawnConfetti(container: HTMLElement): void {
    const colors = ['#ffd166', '#ff8a3d', '#6fd08c', '#6db8ff', '#ffffff', '#ef5d63'];
    for (let i = 0; i < 80; i++) {
      const c = el('div', 'confetti-piece');
      c.style.left = Math.random() * 100 + '%';
      c.style.background = colors[i % colors.length];
      c.style.animationDuration = 1.4 + Math.random() * 1.4 + 's';
      c.style.animationDelay = Math.random() * 0.6 + 's';
      c.style.transform = `rotate(${Math.random() * 360}deg)`;
      container.append(c);
      window.setTimeout(() => c.remove(), 3200);
    }
  }

  function formatTime(sec: number): string {
    if (!isFinite(sec)) return '∞';
    const s = Math.max(0, Math.ceil(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r.toString().padStart(2, '0')}`;
  }

  function formatScore(n: number): string {
    return n.toLocaleString('de-DE');
  }

  // =====================================================================
  // Start in the main menu.
  // =====================================================================
  showScreen('menu');
  ctx.gameToUi.emit('state', {
    fps: 0,
    targets: 0,
    particles: 0,
    phase: 0,
    difficulty: 0,
    seed: 0,
    mode: '',
    map: ''
  });

  // Expose for dev debugging / browser verification.
  (window as unknown as Record<string, unknown>).__ui = { showScreen, startRound };
}
