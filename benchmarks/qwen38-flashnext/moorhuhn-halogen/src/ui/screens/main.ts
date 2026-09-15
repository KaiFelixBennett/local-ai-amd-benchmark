import type { GameCoreAPI } from '../../core/api';
import type { GameClient } from '../../core/gameClient';
import { t } from '../../core/i18n';
import { bus } from '../../core/bus';
import { dailySeed, seedLabel, todayIso } from '../../core/rng';
import { button, el } from '../components';
import type { ScreenHandle, UIRouter } from '../router';

interface MenuEntry {
  labelKey: string;
  screen: Parameters<UIRouter['show']>[0];
  hint?: string;
}

const ENTRIES: MenuEntry[] = [
  { labelKey: 'menu.play', screen: 'modeSelect' },
  { labelKey: 'menu.progress', screen: 'progress' },
  { labelKey: 'menu.highscores', screen: 'highscores' },
  { labelKey: 'menu.stats', screen: 'stats' },
  { labelKey: 'menu.achievements', screen: 'achievements' },
  { labelKey: 'menu.howto', screen: 'howto' },
  { labelKey: 'menu.settings', screen: 'settings' },
  { labelKey: 'menu.credits', screen: 'credits' },
];

/** Title + main menu + player status strip. */
export function createMainScreen(core: GameCoreAPI, client: GameClient, _router: UIRouter): ScreenHandle {
  const root = el('div', 'mmf-screen mmf-main');

  const head = el('div', 'mmf-main-head');
  head.appendChild(el('h1', 'mmf-main-title', t('game.title')));
  head.appendChild(el('div', 'mmf-main-subtitle', t('game.subtitle')));

  const status = el('div', 'mmf-status-strip');
  const chipLevel = el('div', 'mmf-chip mmf-chip--level');
  const chipCoins = el('div', 'mmf-chip mmf-chip--coins');
  const chipSeed = el('div', 'mmf-chip mmf-chip--seed');
  status.append(chipLevel, chipCoins, chipSeed);

  const menu = el('nav', 'mmf-menu');
  for (const entry of ENTRIES) {
    menu.appendChild(
      button(t(entry.labelKey), () => core.go(entry.screen), {
        variant: entry.labelKey === 'menu.play' ? 'primary' : 'menu',
        cls: `mmf-menu-item mmf-menu-item--${entry.screen}`,
      }),
    );
  }

  const hint = el('p', 'mmf-hint', t('menu.quit_hint'));
  root.append(head, status, menu, hint);

  const paintStatus = (): void => {
    chipLevel.textContent = `${t('common.level')} ${client.level}`;
    chipCoins.textContent = `${t('common.coins')}: ${client.save.progression.coins.toLocaleString()}`;
    chipSeed.textContent = `${t('common.seed')}: ${seedLabel(dailySeed(todayIso()))}`;
  };
  paintStatus();

  // Keep the status strip honest if progression changes while we sit here.
  const offUnlock = bus.on('unlock:changed', paintStatus);
  const offChallenge = bus.on('challenge:complete', paintStatus);

  return {
    root,
    refresh: paintStatus,
    destroy(): void {
      offUnlock();
      offChallenge();
    },
  };
}
