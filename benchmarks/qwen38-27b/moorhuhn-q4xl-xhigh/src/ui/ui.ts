/**
 * UI-System: alle HTML-Overlays (Menüs, Auswahl, Einstellungen, Ergebnis-Hilfen).
 * Bewusst pher- & Phaser-frei gebaut — spricht nur mit dem Savegame, der
 * i18n und (über startRound) mit der Phaser-Szene.
 */
import { ACHIEVEMENTS, CHALLENGES, CROSSHAIR_COLORS, CROSSHAIR_STYLES, HUD_THEMES, MAPS, MODES, WEAPON_SKINS } from '../config/gameConfig';
import type { MapId, ModeId } from '../core/types';
import { t, tRaw, setLang } from '../core/i18n';
import { audio, audioVolumes, getSettings, loadSave, persistSave } from '../game/state';
import { dailyChallengeSeed, dayKey } from '../core/rng';
import { formatScore } from '../core/scoring';
import { xpForLevel } from '../core/save';

let root: HTMLElement | null = null;
let currentView = '';
let selectedMode: ModeId = 'classic';
let selectedMap: MapId = 'nebelmoor';

function uiRoot(): HTMLElement {
  if (!root) {
    root = document.getElementById('ui-root');
  }
  if (!root) throw new Error('ui-root fehlt im HTML');
  return root;
}

export function clearUi(): void {
  const r = uiRoot();
  r.innerHTML = '';
  currentView = '';
}

/** Rebuild nach Sprachwechsel. */
export function refreshUi(): void {
  if (!currentView) return;
  const view = currentView;
  clearUi();
  switch (view) {
    case 'main':
      showMainMenu();
      break;
    case 'modes':
      showModeSelect();
      break;
    case 'maps':
      showMapSelect();
      break;
    case 'howto':
      showHowTo();
      break;
    case 'settings':
      showSettings();
      break;
    case 'highscores':
      showHighscores();
      break;
    case 'stats':
      showStats();
      break;
    case 'progress':
      showProgress();
      break;
    case 'credits':
      showCredits();
      break;
  }
}

function el(tag: string, cls: string, html = ''): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  e.innerHTML = html;
  return e;
}

function header(title: string, onBack: () => void): HTMLElement {
  const box = el('div', 'overlay-header');
  const back = el('button', 'btn btn-back', t('menu.back'));
  back.addEventListener('click', () => {
    audio.uiClick();
    onBack();
  });
  const h = el('h1', 'overlay-title', title);
  box.append(back, h);
  return box;
}

function overlay(view: string, content: HTMLElement): void {
  clearUi();
  currentView = view;
  const ov = el('div', 'overlay');
  ov.append(content);
  uiRoot().append(ov);
  audio.uiHover();
}

// ── Hauptmenü ────────────────────────────────────────────────────

export function showMainMenu(): void {
  const save = loadSave();
  const box = el('div', 'main-menu');
  box.append(
    el('div', 'menu-title', 'Moorland Mayhem'),
    el('div', 'menu-subtitle', 'Featherstorm'),
  );
  const list = el('div', 'menu-list');
  const items: [string, () => void, string?][] = [
    [t('menu.play'), () => {
      selectedMode = 'classic';
      showModeSelect();
    }, 'primary'],
    [t('menu.tutorial'), () => startRound('tutorial', 'nebelmoor')],
    [t('menu.modes'), () => showModeSelect()],
    [t('menu.maps'), () => showMapSelect()],
    [t('menu.progress'), () => showProgress()],
    [t('menu.highscores'), () => showHighscores()],
    [t('menu.stats'), () => showStats()],
    [t('menu.achievements'), () => showProgress('achievements')],
    [t('menu.howto'), () => showHowTo()],
    [t('menu.settings'), () => showSettings()],
    [t('menu.credits'), () => showCredits()],
  ];
  for (const [label, fn, kind] of items) {
    const b = el('button', `btn menu-btn ${kind ?? ''}`, label);
    b.addEventListener('click', () => {
      audio.uiClick();
      fn();
    });
    list.append(b);
  }
  box.append(list);
  const footer = el(
    'div',
    'menu-footer',
    `Lv ${save.progress.level} · ${formatScore(save.progress.bestScore)} Best · ${save.progress.feathers} 🪶`,
  );
  box.append(footer);
  overlay('main', box);
}

// ── Modusauswahl ─────────────────────────────────────────────────

export function isModeUnlocked(mode: ModeId): boolean {
  return loadSave().progress.unlockedModes.includes(mode);
}

export function modeUnlockHint(mode: ModeId): string {
  const s = MODES[mode];
  void loadSave().progress.level; // Level-Gates werden in showModeSelect geprüft
  if (s.unlockCond === 'combo10') return t('unlockHint.blitz');
  if (s.unlockCond === 'acc70') return t('unlockHint.precision');
  if (s.unlockLevel > 0) return t('unlockHint.level', { level: String(s.unlockLevel) });
  return '';
}

export function showModeSelect(): void {
  const box = el('div', 'select-wrap');
  box.append(header(t('menu.modes'), () => showMainMenu()));
  const grid = el('div', 'mode-grid');
  const order: ModeId[] = ['classic', 'blitz', 'precision', 'endless', 'daily', 'zen', 'tutorial'];
  for (const m of order) {
    const unlocked = isModeUnlocked(m);
    const card = el('div', `mode-card ${m === selectedMode ? 'selected' : ''} ${unlocked ? '' : 'locked'}`);
    card.append(el('h3', 'mode-name', tRaw(`mode.${m}`)));
    card.append(el('p', 'mode-desc', tRaw(`mode.${m}.desc`)));
    if (!unlocked) {
      card.append(el('div', 'lock-hint', `🔒 ${modeUnlockHint(m)}`));
    }
    if (unlocked) {
      card.addEventListener('click', () => {
        audio.uiClick();
        selectedMode = m;
        if (m === 'daily') {
          startRound('daily', selectedMap);
        } else if (m === 'tutorial') {
          startRound('tutorial', 'nebelmoor');
        } else {
          showMapSelect();
        }
      });
    }
    grid.append(card);
  }
  box.append(grid);
  overlay('modes', box);
}

// ── Kartenwahl ───────────────────────────────────────────────────

export function isMapUnlocked(map: MapId): boolean {
  return loadSave().progress.unlockedMaps.includes(map);
}

export function mapUnlockHint(map: MapId): string {
  if (map === 'sturmklippen') return t('unlockHint.map2');
  if (map === 'mondbruch') return t('unlockHint.map3');
  return '';
}

export function showMapSelect(): void {
  const box = el('div', 'select-wrap');
  box.append(header(t('menu.maps'), () => showModeSelect()));
  const grid = el('div', 'map-grid');
  const order: MapId[] = ['nebelmoor', 'sturmklippen', 'mondbruch'];
  for (const m of order) {
    const cfg = MAPS[m];
    const unlocked = isMapUnlocked(m);
    const card = el('div', `map-card ${m === selectedMap ? 'selected' : ''} ${unlocked ? '' : 'locked'}`);
    const grad = `linear-gradient(180deg, #${cfg.sky[0].toString(16).padStart(6, '0')} 0%, #${cfg.sky[1].toString(16).padStart(6, '0')} 100%)`;
    const preview = el('div', 'map-preview');
    preview.style.background = grad;
    card.append(preview);
    card.append(el('h3', 'map-name', tRaw(`map.${m}`)));
    card.append(el('p', 'map-desc', tRaw(`map.${m}.desc`)));
    if (!unlocked) {
      card.append(el('div', 'lock-hint', `🔒 ${mapUnlockHint(m)}`));
    }
    if (unlocked) {
      card.addEventListener('click', () => {
        audio.uiClick();
        selectedMap = m;
      });
    }
    grid.append(card);
  }
  const go = el('button', 'btn primary start-btn', t('menu.play'));
  go.addEventListener('click', () => {
    audio.uiClick();
    startRound(selectedMode, selectedMap);
  });
  box.append(grid, go);
  overlay('maps', box);
}

/** Startet eine Runde (Seed: Daily = Tages-Seed, sonst Zufall). */
export function startRound(mode: ModeId, mapId: MapId): void {
  const seed = mode === 'daily' ? dailyChallengeSeed() : `mm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  clearUi();
  const game = (window as unknown as { __game: PhaserLikeGame | null }).__game;
  game?.scene.start('game', { cfg: { mode, mapId, seed } });
}

interface PhaserLikeGame {
  scene: { start(key: string, data?: unknown): void };
}

// ── Anleitung ────────────────────────────────────────────────────

export function showHowTo(): void {
  const box = el('div', 'select-wrap howto');
  box.append(header(t('menu.howto'), () => showMainMenu()));
  const c = el('div', 'howto-content');
  c.innerHTML = `
    <h2>${t('hud.score')}</h2>
    <p>${t('mode.classic.desc')}</p>
    <h2>${t('hud.combo')}</h2>
    <p>${t('tutorial.step3')}</p>
    <h2>${t('result.perfect')}</h2>
    <p>${t('tutorial.step4')}</p>
    <h2>${t('hud.ammo')}</h2>
    <p>${t('tutorial.step2')}</p>
    <h2>${t('hud.event')} & ${t('chain')}</h2>
    <p>${t('map.nebelmoor.desc')}</p>
  `;
  box.append(c);
  overlay('howto', box);
}

// ── Einstellungen ────────────────────────────────────────────────

export function showSettings(): void {
  const s = getSettings();
  const save = loadSave();
  const box = el('div', 'select-wrap settings');
  box.append(header(t('settings.title'), () => showMainMenu()));
  const form = el('div', 'settings-form');

  const slider = (label: string, key: 'masterVolume' | 'musicVolume' | 'sfxVolume' | 'ambientVolume' | 'screenShake' | 'particleDensity' | 'crosshairSize', min: number, max: number, step: number): void => {
    const row = el('div', 'setting-row');
    row.append(el('label', 'setting-label', label));
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(s[key]);
    input.addEventListener('input', () => {
      const v = Number(input.value);
      save.settings[key] = v;
      persistSave();
      if (key === 'masterVolume' || key === 'musicVolume' || key === 'sfxVolume' || key === 'ambientVolume') {
        audio.setVolumes(audioVolumes());
      }
    });
    row.append(input);
    form.append(row);
  };

  slider(t('settings.master'), 'masterVolume', 0, 1, 0.05);
  slider(t('settings.music'), 'musicVolume', 0, 1, 0.05);
  slider(t('settings.sfx'), 'sfxVolume', 0, 1, 0.05);
  slider(t('settings.ambient'), 'ambientVolume', 0, 1, 0.05);
  slider(t('settings.shake'), 'screenShake', 0, 1, 0.1);
  slider(t('settings.particles'), 'particleDensity', 0, 1, 0.1);
  slider(t('settings.crosshairSize'), 'crosshairSize', 0.6, 1.6, 0.1);

  const select = (label: string, value: string, options: [string, string][], onChange: (v: string) => void): void => {
    const row = el('div', 'setting-row');
    row.append(el('label', 'setting-label', label));
    const sel = document.createElement('select');
    for (const [v, label2] of options) {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = label2;
      if (v === value) opt.selected = true;
      sel.append(opt);
    }
    sel.addEventListener('change', () => {
      onChange(sel.value);
      persistSave();
    });
    row.append(sel);
    form.append(row);
  };

  select(t('settings.quality'), s.quality, [
    ['low', t('quality.low')],
    ['medium', t('quality.medium')],
    ['high', t('quality.high')],
  ], (v) => {
    save.settings.quality = v as 'low' | 'medium' | 'high';
  });
  select(t('settings.crosshair'), s.crosshairStyle, CROSSHAIR_STYLES.map((c) => [c.id, c.id] as [string, string]), (v) => {
    save.settings.crosshairStyle = v;
  });
  select(t('settings.hudTheme'), s.hudTheme, HUD_THEMES.map((c) => [c.id, c.id] as [string, string]), (v) => {
    save.settings.hudTheme = v;
  });
  select(t('settings.weaponSkin'), s.weaponSkin, WEAPON_SKINS.map((c) => [c.id, c.id] as [string, string]), (v) => {
    save.settings.weaponSkin = v;
  });
  select(t('settings.language'), s.lang, [
    ['de', 'Deutsch'],
    ['en', 'English'],
  ], (v) => {
    save.settings.lang = v as 'de' | 'en';
    setLang(v as 'de' | 'en');
  });

  const colorRow = el('div', 'setting-row');
  colorRow.append(el('label', 'setting-label', t('settings.color')));
  const colors = el('div', 'color-swatches');
  for (const c of CROSSHAIR_COLORS) {
    const sw = el('button', `swatch ${s.crosshairColor === c.value ? 'active' : ''}`);
    sw.style.background = c.value;
    sw.title = c.id;
    sw.addEventListener('click', () => {
      save.settings.crosshairColor = c.value;
      persistSave();
      colors.querySelectorAll('.swatch').forEach((x) => x.classList.remove('active'));
      sw.classList.add('active');
    });
    colors.append(sw);
  }
  colorRow.append(colors);
  form.append(colorRow);

  const toggle = (label: string, key: 'colorblind' | 'highContrastHits' | 'reducedMotion' | 'reducedFlashes'): void => {
    const row = el('div', 'setting-row');
    row.append(el('label', 'setting-label', label));
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = s[key];
    input.addEventListener('change', () => {
      save.settings[key] = input.checked;
      persistSave();
    });
    row.append(input);
    form.append(row);
  };
  toggle(t('settings.cgb'), 'colorblind');
  toggle(t('settings.contrast'), 'highContrastHits');
  toggle(t('settings.reducedMotion'), 'reducedMotion');
  toggle(t('settings.flashes'), 'reducedFlashes');

  box.append(form);
  overlay('settings', box);
}

// ── Highscores ───────────────────────────────────────────────────

export function showHighscores(): void {
  const save = loadSave();
  const box = el('div', 'select-wrap');
  box.append(header(t('hs.title'), () => showMainMenu()));
  const table = el('div', 'hs-table');
  const head = el('div', 'hs-row hs-head');
  head.append(
    el('span', 'hs-score', t('hs.score')),
    el('span', 'hs-mode', t('hs.mode')),
    el('span', 'hs-map', t('hs.map')),
    el('span', 'hs-date', t('hs.date')),
  );
  table.append(head);
  const entries = save.highscores.slice(0, 12);
  if (entries.length === 0) {
    table.append(el('div', 'hs-empty', '–'));
  }
  for (const h of entries) {
    const row = el('div', 'hs-row');
    row.append(
      el('span', 'hs-score', formatScore(h.score)),
      el('span', 'hs-mode', tRaw(`mode.${h.mode}`)),
      el('span', 'hs-map', tRaw(`map.${h.map}`)),
      el('span', 'hs-date', h.date.slice(0, 10)),
    );
    table.append(row);
  }
  const day = save.progress.dailyRecords[dayKey()] ?? 0;
  if (day > 0) {
    table.append(el('div', 'hs-daily', `${t('daily.record')} (${dayKey()}): ${formatScore(day)}`));
  }
  box.append(table);
  overlay('highscores', box);
}

// ── Statistiken ──────────────────────────────────────────────────

export function showStats(): void {
  const p = loadSave().progress;
  const box = el('div', 'select-wrap');
  box.append(header(t('stats.title'), () => showMainMenu()));
  const acc = p.totalShots > 0 ? Math.round((p.totalHits / p.totalShots) * 100) : 0;
  const hours = Math.floor(p.playtimeMs / 3600000);
  const minutes = Math.floor((p.playtimeMs % 3600000) / 60000);
  const rows: [string, string][] = [
    [t('stats.rounds'), `${p.roundsPlayed}`],
    [t('stats.shots'), `${p.totalShots}`],
    [t('stats.hits'), `${p.totalHits}`],
    [t('stats.accuracy'), `${acc} %`],
    [t('stats.bestScore'), formatScore(p.bestScore)],
    [t('stats.bestCombo'), `${p.bestCombo}`],
    [t('stats.perfect'), `${p.totalPerfect}`],
    [t('stats.playtime'), `${hours} h ${minutes} min`],
  ];
  const list = el('div', 'stats-list');
  for (const [label, value] of rows) {
    const row = el('div', 'stat-row');
    row.append(el('span', 'stat-label', label), el('span', 'stat-value', value));
    list.append(row);
  }
  box.append(list);
  overlay('stats', box);
}

// ── Fortschritt (Level, Federn, Kosmetik, Erfolge, Challenges) ───

export function showProgress(tab: 'overview' | 'achievements' | 'challenges' = 'overview'): void {
  const save = loadSave();
  const p = save.progress;
  const box = el('div', 'select-wrap progress');
  box.append(header(t('progress.title'), () => showMainMenu()));

  const levelRow = el('div', 'level-row');
  levelRow.append(el('div', 'level-badge', `Lv ${p.level}`));
  const nextXp = xpForLevel(p.level);
  const curXp = p.xp - xpTotalBeforeLevel(p.level);
  const bar = el('div', 'xp-bar');
  const fill = el('div', 'xp-fill', '');
  bar.append(fill);
  (fill as HTMLElement).style.width = `${Math.min(100, Math.round((curXp / nextXp) * 100))}%`;
  levelRow.append(el('div', 'level-info', `${t('progress.xp')}: ${curXp} / ${nextXp}`));
  levelRow.append(el('div', 'feather-count', `${p.feathers} 🪶`));
  box.append(levelRow);

  if (tab === 'achievements') {
    const grid = el('div', 'ach-grid');
    for (const a of ACHIEVEMENTS) {
      const done = p.achievements.includes(a.id);
      const card = el('div', `ach-card ${done ? 'done' : ''}`);
      card.append(el('div', 'ach-name', tRaw(`ach.${a.id}`)));
      card.append(el('div', 'ach-reward', `+${a.xp} XP · +${a.feathers} 🪶`));
      if (!done) card.append(el('div', 'ach-locked', '🔒'));
      grid.append(card);
    }
    box.append(grid);
  } else if (tab === 'challenges') {
    const list = el('div', 'ch-list');
    for (const c of CHALLENGES) {
      const done = p.completedChallenges.includes(c.id);
      const cur = Math.min(c.target, p.challenges[c.id] ?? 0);
      const card = el('div', `ch-card ${done ? 'done' : ''}`);
      card.append(el('div', 'ch-name', tRaw(`ach.${c.id}`)));
      card.append(el('div', 'ch-progress', `${cur} / ${c.target}`));
      list.append(card);
    }
    box.append(list);
  } else {
    // Übersicht + Kosmetik-Shop
    const tabs = el('div', 'progress-tabs');
    const tabBtn = (label: string, id: 'overview' | 'achievements' | 'challenges'): void => {
      const b = el('button', `btn tab-btn ${tab === id ? 'active' : ''}`, label);
      b.addEventListener('click', () => {
        audio.uiClick();
        showProgress(id);
      });
      tabs.append(b);
    };
    tabBtn(t('progress.achievements'), 'achievements');
    tabBtn(t('progress.challenges'), 'challenges');
    box.append(tabs);

    const shop = el('div', 'shop');
    const shopItem = (label: string, def: { id: string; feathers: number; level?: number }, kind: 'crosshair' | 'hud' | 'skin', active: boolean): void => {
      const owned = active;
      const levelOk = (def.level ?? 0) <= p.level;
      const canBuy = !owned && levelOk && p.feathers >= def.feathers;
      const card = el('div', `shop-card ${owned ? 'owned' : ''} ${canBuy ? 'buyable' : ''}`);
      card.append(el('div', 'shop-label', label));
      if (owned) {
        card.append(el('div', 'shop-state', '✓'));
      } else if (!levelOk) {
        card.append(el('div', 'shop-state', `🔒 Lv ${def.level}`));
      } else {
        card.append(el('div', 'shop-state', `${def.feathers} 🪶`));
        if (canBuy) {
          const buy = el('button', 'btn small', 'Buy');
          buy.textContent = '🪶 ' + String(def.feathers);
          buy.addEventListener('click', () => {
            if (p.feathers < def.feathers) return;
            p.feathers -= def.feathers;
            if (kind === 'crosshair') save.settings.crosshairStyle = def.id;
            if (kind === 'hud') save.settings.hudTheme = def.id;
            if (kind === 'skin') save.settings.weaponSkin = def.id;
            persistSave();
            audio.bonus();
            showProgress('overview');
          });
          card.append(buy);
        }
      }
      shop.append(card);
    };
    for (const c of CROSSHAIR_STYLES) shopItem(c.id, c, 'crosshair', save.settings.crosshairStyle === c.id);
    for (const c of HUD_THEMES) shopItem(c.id, c, 'hud', save.settings.hudTheme === c.id);
    for (const c of WEAPON_SKINS) shopItem(c.id, c, 'skin', save.settings.weaponSkin === c.id);
    box.append(shop);
  }
  overlay('progress', box);
}

function xpTotalBeforeLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += xpForLevel(l);
  return total;
}

// ── Credits ──────────────────────────────────────────────────────

export function showCredits(): void {
  const box = el('div', 'select-wrap credits');
  box.append(header(t('credits.title'), () => showMainMenu()));
  box.append(el('p', 'credits-text', t('credits.text')));
  overlay('credits', box);
}

// ── Initialisierung ──────────────────────────────────────────────

export function initUi(): void {
  uiRoot();
  window.addEventListener('mm-lang-changed', () => {
    // Nicht während einer aktiven Runde (HUD gehört zur Game-Szene).
    if (currentView && currentView !== 'hud') refreshUi();
  });
}
