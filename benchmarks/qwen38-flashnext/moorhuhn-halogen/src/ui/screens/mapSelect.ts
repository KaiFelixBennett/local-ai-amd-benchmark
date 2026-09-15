import type { GameCoreAPI } from '../../core/api';
import type { GameClient } from '../../core/gameClient';
import { bus } from '../../core/bus';
import { t } from '../../core/i18n';
import { MAPS } from '../../config/maps';
import { MAP_UNLOCK_LEVEL } from '../../config/unlocks';
import type { MapId } from '../../types';
import { el, screenShell } from '../components';
import type { ScreenHandle, UIRouter } from '../router';
import { getPendingMode } from './modeSelect';

/** Three art-less gradient map cards with palette swatches and lock state. */
export function createMapSelectScreen(core: GameCoreAPI, client: GameClient, router: UIRouter): ScreenHandle {
  const shell = screenShell(t('map.select_title'), () => core.back());
  const grid = el('div', 'mmf-grid mmf-map-grid');
  shell.body.appendChild(grid);

  const render = (): void => {
    grid.replaceChildren();
    // Re-read the handshake every render: the mode may have changed since build.
    const selectedMode = getPendingMode() ?? 'classic';
    for (const map of MAPS) {
      const id = map.id as MapId;
      const unlocked = client.isMapUnlocked(id);
      const p = map.palette;

      const cardEl = el('button', `mmf-card mmf-map-card${unlocked ? '' : ' mmf-locked'}`);
      cardEl.type = 'button';

      // Art-less gradient panel built from the map palette (dynamic colors only).
      const art = el('div', 'mmf-map-art');
      art.style.background = `linear-gradient(180deg, ${p.skyTop} 0%, ${p.skyMid} 45%, ${p.skyLow} 72%, ${p.hillNear} 100%)`;
      const swatches = el('div', 'mmf-map-swatches');
      const swatchColors = [p.skyTop, p.skyMid, p.skyLow, p.accent, p.water, p.reed];
      for (const c of swatchColors) {
        const s = el('span', 'mmf-swatch');
        s.style.background = c;
        swatches.appendChild(s);
      }
      art.appendChild(swatches);
      cardEl.appendChild(art);

      const body = el('div', 'mmf-map-body');
      const top = el('div', 'mmf-map-top');
      top.appendChild(el('h3', 'mmf-map-name', t(`map.${id}.name`)));
      if (!unlocked) {
        top.appendChild(el('span', 'mmf-badge mmf-badge--lock', `⬤ ${t('common.locked')}`));
      }
      body.appendChild(top);
      body.appendChild(el('p', 'mmf-map-desc', t(`map.${id}.desc`)));
      if (!unlocked) {
        body.appendChild(el('p', 'mmf-map-req', t('common.locked_hint', { level: MAP_UNLOCK_LEVEL[id] })));
      }
      cardEl.appendChild(body);

      cardEl.addEventListener('mouseenter', () => {
        if (unlocked) core.playUI('hover');
      });
      cardEl.addEventListener('click', () => {
        if (!unlocked) return;
        core.playUI('click');
        startRound(core, router, selectedMode, id);
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

function startRound(
  core: GameCoreAPI,
  router: UIRouter,
  mode: Parameters<GameCoreAPI['startRound']>[0],
  map: MapId,
): void {
  core.startRound(mode, map);
  window.setTimeout(() => {
    if (router.current !== 'game') router.show('game');
  }, 0);
}
