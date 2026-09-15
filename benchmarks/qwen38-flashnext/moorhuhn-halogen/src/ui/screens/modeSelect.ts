import type { GameCoreAPI, ScreenId } from '../../core/api';
import type { GameClient } from '../../core/gameClient';
import { bus } from '../../core/bus';
import { t } from '../../core/i18n';
import { MODES } from '../../config/modes';
import { MODE_UNLOCK_LEVEL } from '../../config/unlocks';
import type { ModeId } from '../../types';
import { el, fmtNum, screenShell } from '../components';
import type { ScreenHandle, UIRouter } from '../router';

/**
 * The chosen mode is carried between ModeSelect and MapSelect through this tiny
 * module-level handshake — GameCoreAPI has no argument channel.
 */
let pendingMode: ModeId | null = null;

export function setPendingMode(mode: ModeId | null): void {
  pendingMode = mode;
}

export function getPendingMode(): ModeId | null {
  return pendingMode;
}

/** Grid of all six modes with lock badges, best scores and the daily record. */
export function createModeSelectScreen(core: GameCoreAPI, client: GameClient, router: UIRouter): ScreenHandle {
  const shell = screenShell(t('mode.select_title'), () => core.back());
  const grid = el('div', 'mmf-grid mmf-mode-grid');
  shell.body.appendChild(grid);

  const render = (): void => {
    grid.replaceChildren();
    for (const mode of MODES) {
      const id = mode.id as ModeId;
      const unlocked = client.isModeUnlocked(id);
      const best = client.getBestScore(id);

      const cardEl = el('button', `mmf-card mmf-mode-card${unlocked ? '' : ' mmf-locked'}`);
      cardEl.type = 'button';

      const top = el('div', 'mmf-mode-top');
      top.appendChild(el('h3', 'mmf-mode-name', t(`mode.${id}.name`)));
      if (!unlocked) {
        top.appendChild(el('span', 'mmf-badge mmf-badge--lock', `⬤ ${t('common.locked')}`));
      }
      cardEl.appendChild(top);

      cardEl.appendChild(el('p', 'mmf-mode-desc', t(`mode.${id}.desc`)));

      const meta = el('div', 'mmf-mode-meta');
      if (unlocked) {
        meta.appendChild(el('span', 'mmf-meta-item', `${t('common.best')}: ${best > 0 ? fmtNum(best) : '—'}`));
      } else {
        meta.appendChild(
          el('span', 'mmf-meta-item mmf-meta-item--req', t('mode.locked_by_level', { level: MODE_UNLOCK_LEVEL[id] })),
        );
      }
      if (id === 'daily') {
        const rec = client.getDailyRecord();
        meta.appendChild(
          el(
            'span',
            'mmf-meta-item mmf-meta-item--daily',
            rec ? `${t('mode.daily.record')}: ${fmtNum(rec.score)}` : t('mode.daily.no_record'),
          ),
        );
      }
      cardEl.appendChild(meta);

      cardEl.addEventListener('mouseenter', () => {
        if (unlocked) core.playUI('hover');
      });
      cardEl.addEventListener('click', () => {
        if (!unlocked) return;
        core.playUI('click');
        pendingMode = id;
        goTo(core, router, 'mapSelect');
      });
      grid.appendChild(cardEl);
    }
  };
  render();

  const offUnlock = bus.on('unlock:changed', render);
  const offLang = bus.on('settings:changed', render);
  return {
    root: shell.root,
    refresh: render,
    destroy(): void {
      offUnlock();
      offLang();
    },
  };
}

/** Navigate, falling back to the router if the core's go() is a no-op elsewhere. */
function goTo(core: GameCoreAPI, router: UIRouter, screen: ScreenId): void {
  core.go(screen);
  window.setTimeout(() => {
    if (router.current !== screen) router.show(screen);
  }, 0);
}
