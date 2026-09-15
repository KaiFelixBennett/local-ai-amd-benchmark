import type { GameCoreAPI } from '../../core/api';
import type { GameClient } from '../../core/gameClient';
import { t } from '../../core/i18n';
import { MODES } from '../../config/modes';
import { pointsToNextRank } from '../../logic/scoring';
import type { Rank } from '../../types';
import { button, el, fmtNum } from '../components';
import type { ResultsScreenHandle, ScreenHandle, UIRouter } from '../router';
import type { ResultsPayload } from '../../core/api';

const RANK_COLORS: Record<Rank, string> = {
  D: '#8a8a9a',
  C: '#9ab87a',
  B: '#7fd0e8',
  A: '#ffb84a',
  S: '#ff9a3c',
  SS: '#ff6a5c',
  SSS: '#ff4a8a',
};

/** Round summary with rank punch, score count-up and record comparison. */
export function createResultsScreen(core: GameCoreAPI, client: GameClient, _router: UIRouter): ScreenHandle {
  const shell = el('div', 'mmf-screen mmf-screen-shell mmf-results');
  const header = el('header', 'mmf-screen-header mmf-results-header');
  header.appendChild(el('h2', 'mmf-screen-title', t('results.title')));
  shell.appendChild(header);

  const body = el('div', 'mmf-screen-body');
  const inner = el('div', 'mmf-results-inner');
  body.appendChild(inner);
  shell.appendChild(body);

  let counters: number[] = [];
  let destroyed = false;

  const clearTimers = (): void => {
    counters.forEach((id) => window.clearInterval(id));
    counters = [];
  };

  function countUp(node: HTMLElement, target: number, durationMs: number, formatter: (n: number) => string): void {
    const start = performance.now();
    const id = window.setInterval(() => {
      if (destroyed) return;
      const p = Math.min(1, (performance.now() - start) / durationMs);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - p, 3);
      node.textContent = formatter(Math.round(target * eased));
      if (p >= 1) window.clearInterval(id);
    }, 33);
    counters.push(id);
  }

  function render(payload: ResultsPayload): void {
    clearTimers();
    inner.replaceChildren();
    const s = payload.summary;
    const modeDef = MODES.find((m) => m.id === s.mode);
    const mult = modeDef?.scoreMult ?? 1;

    // ---- hero: rank + score ----------------------------------------
    const hero = el('div', 'mmf-results-hero');

    const rankWrap = el('div', 'mmf-rank-wrap');
    const rankBadge = el('div', 'mmf-rank-badge', payload.rank);
    rankBadge.style.color = RANK_COLORS[payload.rank] ?? '#ffb84a';
    rankBadge.style.borderColor = RANK_COLORS[payload.rank] ?? '#ffb84a';
    rankWrap.appendChild(rankBadge);
    rankWrap.appendChild(el('div', 'mmf-rank-label', t('results.rank')));

    const scoreWrap = el('div', 'mmf-score-wrap');
    const scoreNode = el('div', 'mmf-results-score', '0');
    scoreWrap.appendChild(el('div', 'mmf-results-score-label', t('results.score')));
    scoreWrap.appendChild(scoreNode);
    if (payload.isRecord) {
      scoreWrap.appendChild(el('div', 'mmf-record-flag', t('results.new_record')));
    } else {
      scoreWrap.appendChild(el('div', 'mmf-record-flag mmf-record-flag--none', t('results.no_record')));
    }
    hero.append(rankWrap, scoreWrap);
    inner.appendChild(hero);

    // ---- rewards row -----------------------------------------------
    const rewards = el('div', 'mmf-reward-row');
    const xpChip = el('div', 'mmf-chip mmf-chip--xp', `+${fmtNum(payload.xpGained)} ${t('common.xp')}`);
    const coinChip = el('div', 'mmf-chip mmf-chip--coins', `+${fmtNum(payload.coinsGained)} ${t('common.coins')}`);
    rewards.append(xpChip, coinChip);
    if (payload.leveledUp) {
      const lvl = el('div', 'mmf-levelup-flourish', `★ ${t('results.level_up')} ${t('common.level')} ${client.level}`);
      rewards.appendChild(lvl);
    }
    const nextRank = pointsToNextRank(s.score, mult);
    if (nextRank.points > 0) {
      rewards.appendChild(
        el('div', 'mmf-nextrank', t('results.next_rank', { points: fmtNum(nextRank.points), rank: nextRank.rank })),
      );
    }
    inner.appendChild(rewards);

    // ---- personal best comparison ----------------------------------
    const bestRow = el('div', 'mmf-pb-row');
    bestRow.appendChild(el('span', 'mmf-pb-label', t('results.personal_best')));
    if (payload.previousBest !== null && payload.previousBest > 0) {
      const delta = s.score - payload.previousBest;
      bestRow.appendChild(
        el(
          'span',
          `mmf-pb-value ${payload.isRecord ? 'mmf-pb-value--up' : ''}`.trim(),
          payload.isRecord
            ? `▲ +${fmtNum(delta)} ${t('results.compare')}`
            : `${fmtNum(payload.previousBest)} (${delta >= 0 ? '+' : ''}${fmtNum(delta)})`,
        ),
      );
    } else {
      bestRow.appendChild(el('span', 'mmf-pb-value', fmtNum(s.score)));
    }
    inner.appendChild(bestRow);

    // ---- stat rows ---------------------------------------------------
    const rows = el('div', 'mmf-results-rows');
    addRow(rows, t('results.hits'), fmtNum(s.hits), 'mmf-row-stat--hits');
    addRow(rows, t('results.misses'), fmtNum(s.misses), '');
    addRow(rows, t('results.shots'), fmtNum(s.shots), '');
    addRow(rows, t('results.accuracy'), `${Math.round(s.accuracy * 100)} %`, 'mmf-row-stat--acc');
    addRow(rows, t('results.perfect'), fmtNum(s.perfectHits), 'mmf-row-stat--perfect');
    addRow(rows, t('results.max_combo'), `×${s.maxCombo}`, 'mmf-row-stat--combo');
    addRow(rows, t('results.best_hit'), `${fmtNum(s.bestHitPoints)}`, '');
    addRow(rows, t('results.reaction'), `${Math.round(s.avgReactionMs)} ms`, '');
    addRow(rows, t('results.event_bonus'), fmtNum(s.eventBonusPoints), '');
    addRow(rows, t('results.chain_bonus'), fmtNum(s.chainReactions), '');
    addRow(rows, t('results.hidden'), fmtNum(s.hiddenObjectsFound), '');
    inner.appendChild(rows);

    // ---- target types ----------------------------------------------
    const typesWrap = el('div', 'mmf-target-types');
    typesWrap.appendChild(el('h4', 'mmf-target-types-title', t('results.target_types')));
    const chips = el('div', 'mmf-type-chips');
    const entries = Object.entries(s.targetsHit).sort((a, b) => b[1] - a[1]);
    if (entries.length === 0) {
      chips.appendChild(el('span', 'mmf-empty-note', t('results.none_yet')));
    } else {
      for (const [id, count] of entries) {
        chips.appendChild(el('span', 'mmf-type-chip', `${t(`name.${id}`)} ×${count}`));
      }
    }
    typesWrap.appendChild(chips);
    inner.appendChild(typesWrap);

    // ---- new achievements ------------------------------------------
    if (payload.newAchievements.length > 0) {
      const achWrap = el('div', 'mmf-new-ach');
      achWrap.appendChild(el('h4', 'mmf-new-ach-title', t('ach.title')));
      for (const id of payload.newAchievements) {
        achWrap.appendChild(el('span', 'mmf-badge mmf-badge--unlock', `★ ${t(`ach.${id}.name`)}`));
      }
      inner.appendChild(achWrap);
    }

    // ---- actions -----------------------------------------------------
    const actions = el('div', 'mmf-results-actions');
    actions.appendChild(button(t('results.play_again'), () => core.retryRound(), { variant: 'primary' }));
    actions.appendChild(button(t('results.change_mode'), () => core.go('modeSelect'), { variant: 'secondary' }));
    actions.appendChild(button(t('pause.quit'), () => core.quitToMenu(), { variant: 'ghost', sound: 'back' }));
    inner.appendChild(actions);

    // ---- animations --------------------------------------------------
    if (!core.getSetting('reduceMotion')) {
      rankBadge.classList.add('mmf-rank-punch');
      if (payload.isRecord) scoreNode.classList.add('mmf-score-pop');
      window.setTimeout(() => countUp(scoreNode, s.score, 900, fmtNum), 250);
      window.setTimeout(() => xpChip.classList.add('mmf-chip--pulse'), 1100);
      window.setTimeout(() => coinChip.classList.add('mmf-chip--pulse'), 1250);
    } else {
      scoreNode.textContent = fmtNum(s.score);
    }
  }

  const handle: ResultsScreenHandle = {
    root: shell,
    setData(payload: ResultsPayload): void {
      render(payload);
    },
    destroy(): void {
      destroyed = true;
      clearTimers();
    },
  };
  return handle;
}

function addRow(parent: HTMLElement, label: string, value: string, cls: string): void {
  const row = el('div', `mmf-stat-row ${cls}`.trim());
  row.appendChild(el('span', 'mmf-stat-label', label));
  row.appendChild(el('span', 'mmf-stat-value', value));
  parent.appendChild(row);
}
