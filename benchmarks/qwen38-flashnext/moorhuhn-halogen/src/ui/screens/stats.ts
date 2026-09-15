import type { GameCoreAPI } from '../../core/api';
import type { GameClient } from '../../core/gameClient';
import { bus } from '../../core/bus';
import { t } from '../../core/i18n';
import { TARGETS } from '../../config/targets';
import { MAPS } from '../../config/maps';
import { button, el, fmtDuration, fmtNum, progressBar, showConfirm } from '../components';
import type { ScreenHandle, UIRouter } from '../router';

/** Lifetime statistics, per-target bars, per-map bars and a confirm-reset. */
export function createStatsScreen(core: GameCoreAPI, client: GameClient, _router: UIRouter): ScreenHandle {
  const shell = el('div', 'mmf-screen mmf-screen-shell mmf-stats');
  const header = el('header', 'mmf-screen-header');
  const back = button(`‹ ${t('common.back')}`, () => core.back(), {
    variant: 'ghost',
    cls: 'mmf-back-btn',
    sound: 'back',
  });
  header.append(back, el('h2', 'mmf-screen-title', t('stats.title')));
  shell.appendChild(header);

  const body = el('div', 'mmf-screen-body');
  shell.appendChild(body);

  const render = (): void => {
    body.replaceChildren();
    const st = client.save.stats;
    const acc = st.totalShots > 0 ? st.totalHits / st.totalShots : 0;

    // ---- headline tiles --------------------------------------------
    const tiles = el('div', 'mmf-tile-grid');
    const tile = (label: string, value: string, cls: string): HTMLElement => {
      const node = el('div', `mmf-tile ${cls}`);
      node.appendChild(el('div', 'mmf-tile-value', value));
      node.appendChild(el('div', 'mmf-tile-label', label));
      return node;
    };
    tiles.append(
      tile(t('stats.total_runs'), fmtNum(st.totalRuns), 'mmf-tile--runs'),
      tile(t('common.score'), fmtNum(st.totalScore), 'mmf-tile--score'),
      tile(t('stats.overall_accuracy'), `${(acc * 100).toFixed(1)} %`, 'mmf-tile--acc'),
      tile(t('stats.playtime'), fmtDuration(st.totalPlaySeconds), 'mmf-tile--time'),
    );
    body.appendChild(tiles);

    // ---- detailed list ----------------------------------------------
    const list = el('div', 'mmf-stat-rows');
    const row = (label: string, value: string): void => {
      const r = el('div', 'mmf-stat-row');
      r.appendChild(el('span', 'mmf-stat-label', label));
      r.appendChild(el('span', 'mmf-stat-value', value));
      list.appendChild(r);
    };
    row(t('stats.total_shots'), fmtNum(st.totalShots));
    row(t('stats.total_hits'), fmtNum(st.totalHits));
    row(t('stats.perfect_hits'), fmtNum(st.perfectHits));
    row(t('stats.best_combo'), `×${st.bestCombo}`);
    row(t('stats.boss_kills'), fmtNum(st.bossKills));
    row(t('stats.chains'), fmtNum(st.chainReactions));
    row(t('stats.hidden_found'), String(st.hiddenObjectsFound.length));
    body.appendChild(list);

    // ---- target type bars -------------------------------------------
    const targetsSection = el('section', 'mmf-section');
    targetsSection.appendChild(el('h3', 'mmf-section-title', t('stats.targets_title')));
    const bars = el('div', 'mmf-bar-list');
    const maxTarget = Math.max(1, ...Object.values(st.targetsHit));
    const known = TARGETS.map((td) => td.id);
    const ids = [
      ...known.filter((id) => (st.targetsHit[id] ?? 0) > 0),
      ...Object.keys(st.targetsHit).filter((id) => !known.includes(id)),
    ];
    if (ids.length === 0) {
      bars.appendChild(el('p', 'mmf-empty-note', t('results.none_yet')));
    } else {
      for (const id of ids) {
        const count = st.targetsHit[id] ?? 0;
        const rowEl = el('div', 'mmf-bar-row');
        rowEl.appendChild(el('span', 'mmf-bar-label', t(`name.${id}`)));
        const bar = progressBar(count / maxTarget, 'mmf-bar--target');
        bar.fill.style.background = 'var(--mmf-moss)';
        rowEl.appendChild(bar.root);
        rowEl.appendChild(el('span', 'mmf-bar-value', fmtNum(count)));
        bars.appendChild(rowEl);
      }
    }
    targetsSection.appendChild(bars);
    body.appendChild(targetsSection);

    // ---- maps played --------------------------------------------------
    const mapsSection = el('section', 'mmf-section');
    mapsSection.appendChild(el('h3', 'mmf-section-title', t('stats.maps_title')));
    const mapList = el('div', 'mmf-bar-list');
    const maxMap = Math.max(1, ...MAPS.map((m) => st.mapsPlayed[m.id] ?? 0));
    for (const map of MAPS) {
      const played = st.mapsPlayed[map.id] ?? 0;
      const rowEl = el('div', 'mmf-bar-row');
      rowEl.appendChild(el('span', 'mmf-bar-label', t(`map.${map.id}.name`)));
      const bar = progressBar(played / maxMap, 'mmf-bar--map');
      bar.fill.style.background = 'var(--mmf-gold)';
      rowEl.appendChild(bar.root);
      rowEl.appendChild(el('span', 'mmf-bar-value', fmtNum(played)));
      mapList.appendChild(rowEl);
    }
    mapsSection.appendChild(mapList);
    body.appendChild(mapsSection);

    // ---- reset --------------------------------------------------------
    const danger = el('div', 'mmf-danger-zone');
    danger.appendChild(
      button(
        t('stats.reset'),
        () => {
          showConfirm(t('stats.reset'), t('stats.reset_confirm'), () => {
            client.save.stats = {
              totalRuns: 0,
              totalShots: 0,
              totalHits: 0,
              totalScore: 0,
              totalPlaySeconds: 0,
              perfectHits: 0,
              bossKills: 0,
              chainReactions: 0,
              bestCombo: 0,
              targetsHit: {},
              mapsPlayed: {},
              hiddenObjectsFound: [],
            };
            client.flush();
            bus.emit('toast', { message: t('stats.reset'), kind: 'info' });
            render();
          });
        },
        { variant: 'danger' },
      ),
    );
    body.appendChild(danger);
  };

  render();
  return { root: shell, refresh: render };
}
