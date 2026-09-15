import type { GameCoreAPI } from '../../core/api';
import type { GameClient } from '../../core/gameClient';
import { bus } from '../../core/bus';
import { t } from '../../core/i18n';
import { MODES } from '../../config/modes';
import type { ModeId } from '../../types';
import { el, fmtNum, screenShell, segmented } from '../components';
import type { ScreenHandle, UIRouter } from '../router';

/** Per-mode tabs with the top-20 highscore table. */
export function createHighscoresScreen(core: GameCoreAPI, client: GameClient, _router: UIRouter): ScreenHandle {
  const shell = screenShell(t('highscores.title'), () => core.back());
  const { body } = shell;
  shell.root.classList.add('mmf-highscores');

  const tabBar = el('div', 'mmf-tab-bar');
  tabBar.appendChild(el('span', 'mmf-tab-label', t('highscores.by_mode')));
  const tabs = segmented<ModeId>({
    options: MODES.map((m) => ({ value: m.id as ModeId, label: t(`mode.${m.id}.name`) })),
    value: 'classic',
    onChange: (v) => {
      active = v;
      renderTable();
    },
  });
  tabs.root.classList.add('mmf-tabs');
  tabBar.appendChild(tabs.root);
  body.appendChild(tabBar);

  const tableWrap = el('div', 'mmf-table-wrap');
  body.appendChild(tableWrap);

  let active: ModeId = 'classic';

  function renderTable(): void {
    tableWrap.replaceChildren();
    const entries = (client.save.highscores[active] ?? []).slice(0, 20);
    if (entries.length === 0) {
      tableWrap.appendChild(el('p', 'mmf-empty-note', t('highscores.empty')));
      return;
    }
    const table = el('table', 'mmf-table');
    const thead = el('thead');
    const hr = el('tr');
    hr.append(
      el('th', 'mmf-th-rank', t('highscores.rank')),
      el('th', undefined, t('highscores.score')),
      el('th', undefined, t('highscores.accuracy')),
      el('th', undefined, t('highscores.combo')),
      el('th', undefined, t('highscores.date')),
    );
    thead.appendChild(hr);
    table.appendChild(thead);

    const tbody = el('tbody');
    entries.forEach((entry, i) => {
      const tr = el('tr');
      if (i === 0) tr.classList.add('mmf-row--top');
      tr.append(
        el('td', `mmf-cell-rank mmf-rank-${entry.rank}`, entry.rank),
        el('td', 'mmf-cell-score', fmtNum(entry.score)),
        el('td', undefined, `${Math.round(entry.accuracy * 100)} %`),
        el('td', undefined, `×${entry.maxCombo}`),
        el('td', 'mmf-cell-date', entry.date),
      );
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    tableWrap.appendChild(table);
  }

  renderTable();
  const off = bus.on('settings:changed', renderTable);
  return {
    root: shell.root,
    refresh: renderTable,
    destroy: off,
  };
}
