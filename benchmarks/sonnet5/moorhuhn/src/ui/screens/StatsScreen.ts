import type { AppContext, Screen } from '../types';
import { i18n } from '../../systems/Localization';
import { fromHtml, backButton, formatPercent, formatPlaytime } from '../domHelpers';
import { getTargetConfig } from '../../config/targets';
import { getMapConfig } from '../../config/maps';
import { getModeConfig } from '../../config/modes';
import type { TargetTypeId } from '../../core/types';

export class StatsScreen implements Screen<void> {
  private root: HTMLElement | null = null;

  mount(root: HTMLElement, ctx: AppContext): void {
    const save = ctx.save.load();
    const { stats, highscores } = save;
    const accuracy = stats.totalShotsFired > 0 ? stats.totalHits / stats.totalShotsFired : 0;

    let favorite: TargetTypeId | null = null;
    let favoriteCount = 0;
    for (const [id, count] of Object.entries(stats.targetTypeKills)) {
      if ((count ?? 0) > favoriteCount) {
        favorite = id as TargetTypeId;
        favoriteCount = count ?? 0;
      }
    }

    const sortedScores = [...highscores].sort((a, b) => b.score - a.score).slice(0, 10);
    const scoreRows = sortedScores.length
      ? sortedScores
          .map(
            (h, idx) => `
          <div class="row">
            <span>#${idx + 1} · ${i18n.t(getModeConfig(h.mode).nameKey as never)} · ${i18n.t(getMapConfig(h.map).nameKey as never)}</span>
            <span>${h.score} (${h.rank})</span>
          </div>`,
          )
          .join('')
      : `<p style="color:var(--text-muted);">${i18n.t('stats.noHighscores')}</p>`;

    const el = fromHtml(`
      <div class="ui-screen">
        <div class="top-bar"><div></div><div></div></div>
        <div class="panel scroll-area" style="max-width:720px; width:92vw;">
          <h2 style="color:var(--accent); text-align:center; margin-top:0;">${i18n.t('stats.title')}</h2>
          <div class="results-grid">
            <div class="row"><span>${i18n.t('stats.totalShots')}</span><span>${stats.totalShotsFired}</span></div>
            <div class="row"><span>${i18n.t('stats.totalHits')}</span><span>${stats.totalHits}</span></div>
            <div class="row"><span>${i18n.t('stats.totalMisses')}</span><span>${stats.totalMisses}</span></div>
            <div class="row"><span>${i18n.t('stats.accuracy')}</span><span>${formatPercent(accuracy)}</span></div>
            <div class="row"><span>${i18n.t('stats.totalRounds')}</span><span>${stats.totalRoundsPlayed}</span></div>
            <div class="row"><span>${i18n.t('stats.totalPlaytime')}</span><span>${formatPlaytime(stats.totalPlayMs)}</span></div>
            <div class="row"><span>${i18n.t('stats.bestCombo')}</span><span>${stats.bestCombo}</span></div>
            <div class="row"><span>${i18n.t('stats.bossesDefeated')}</span><span>${stats.bossesDefeated}</span></div>
            <div class="row"><span>${i18n.t('stats.chainReactions')}</span><span>${stats.chainReactionsTriggered}</span></div>
            <div class="row"><span>${i18n.t('stats.favoriteTarget')}</span><span>${favorite ? i18n.t(getTargetConfig(favorite).nameKey as never) : '—'}</span></div>
          </div>
          <h3 style="color:var(--accent); margin-top:24px;">${i18n.t('stats.highscoresTitle')}</h3>
          <div class="results-grid" style="grid-template-columns:1fr;">${scoreRows}</div>
        </div>
      </div>
    `);
    const topBar = el.querySelector('.top-bar') as HTMLElement;
    topBar.prepend(backButton(() => ctx.back()));
    root.appendChild(el);
    this.root = el;
  }

  unmount(): void {
    this.root = null;
  }
}
