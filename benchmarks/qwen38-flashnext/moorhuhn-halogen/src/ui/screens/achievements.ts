import type { GameCoreAPI } from '../../core/api';
import type { GameClient } from '../../core/gameClient';
import { bus } from '../../core/bus';
import { t } from '../../core/i18n';
import { ACHIEVEMENTS } from '../../config/cosmetics';
import type { SaveDataV3 } from '../../types';
import { el, fmtNum, progressBar } from '../components';
import type { ScreenHandle, UIRouter } from '../router';

/** Metric reader mirroring the achievement evaluator's lifetime metrics. */
function lifetimeMetric(metric: string, save: SaveDataV3): number {
  const st = save.stats;
  switch (metric) {
    case 'totalShots':
      return st.totalShots;
    case 'totalHits':
      return st.totalHits;
    case 'perfectHits':
      return st.perfectHits;
    case 'bestCombo':
      return st.bestCombo;
    case 'bossKills':
      return st.bossKills;
    case 'totalRuns':
      return st.totalRuns;
    case 'chainReactions':
      return st.chainReactions;
    case 'bestRoundScore': {
      // best across all mode highscore tables
      let best = 0;
      for (const list of Object.values(save.highscores)) {
        if (list && list.length > 0) best = Math.max(best, list[0].score);
      }
      return best;
    }
    default:
      return 0;
  }
}

/** Grid of every achievement with unlocked state and progress bars. */
export function createAchievementsScreen(core: GameCoreAPI, client: GameClient, _router: UIRouter): ScreenHandle {
  const shell = el('div', 'mmf-screen mmf-screen-shell mmf-achievements');
  const header = el('header', 'mmf-screen-header');
  const back = el('button', 'mmf-btn btn mmf-btn--ghost mmf-back-btn', `‹ ${t('common.back')}`);
  back.type = 'button';
  back.addEventListener('click', () => {
    core.playUI('back');
    core.back();
  });
  back.addEventListener('mouseenter', () => core.playUI('hover'));
  header.append(back, el('h2', 'mmf-screen-title', t('ach.title')));
  shell.appendChild(header);

  const body = el('div', 'mmf-screen-body');
  const grid = el('div', 'mmf-ach-grid');
  body.appendChild(grid);
  shell.appendChild(body);

  const render = (): void => {
    grid.replaceChildren();
    const unlocked = new Set(client.save.achievements);
    for (const ach of ACHIEVEMENTS) {
      const done = unlocked.has(ach.id);
      const value = lifetimeMetric(ach.metric, client.save);
      const frac = Math.min(1, value / ach.goal);

      const cardEl = el('div', `mmf-card mmf-ach-card ${done ? 'mmf-ach-card--done' : 'mmf-ach-card--locked'}`);
      const icon = el('div', 'mmf-ach-icon', done ? '★' : '☆');
      cardEl.appendChild(icon);

      const info = el('div', 'mmf-ach-info');
      info.appendChild(el('h4', 'mmf-ach-name', t(`ach.${ach.id}.name`)));
      info.appendChild(el('p', 'mmf-ach-desc', t(`ach.${ach.id}.desc`)));

      if (done) {
        info.appendChild(el('div', 'mmf-ach-done-label', `✓ ${t('common.unlocked')}`));
      } else {
        const bar = progressBar(frac, 'mmf-bar--ach');
        info.appendChild(bar.root);
        info.appendChild(
          el(
            'div',
            'mmf-ach-progress',
            t('ach.progress', { progress: fmtNum(Math.min(value, ach.goal)), goal: fmtNum(ach.goal) }),
          ),
        );
        info.appendChild(el('div', 'mmf-ach-locked-label', t('ach.locked')));
      }
      cardEl.appendChild(info);
      grid.appendChild(cardEl);
    }
  };

  render();
  const offUnlock = bus.on('achievement:unlocked', render);
  const offLang = bus.on('settings:changed', render);
  return {
    root: shell,
    refresh: render,
    destroy(): void {
      offUnlock();
      offLang();
    },
  };
}
