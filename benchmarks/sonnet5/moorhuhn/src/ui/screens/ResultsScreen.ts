import type { AppContext, Screen } from '../types';
import { i18n } from '../../systems/Localization';
import { fromHtml, formatPercent } from '../domHelpers';
import type { RoundEndedPayload } from '../GameBridge';
import { gameBridge } from '../GameBridge';
import { calculateAccuracy } from '../../systems/ScoringSystem';
import { getTargetConfig } from '../../config/targets';

export class ResultsScreen implements Screen<RoundEndedPayload> {
  private root: HTMLElement | null = null;
  private confettiTimer: number | null = null;

  mount(root: HTMLElement, ctx: AppContext, payload: RoundEndedPayload): void {
    const { stats, rank, isNewRecord, previousBest, xpGained, levelsGained, currencyGained } = payload;
    const accuracy = calculateAccuracy(stats.hits, stats.shotsFired);
    const avgReaction =
      stats.reactionTimesMs.length > 0
        ? Math.round(stats.reactionTimesMs.reduce((a, b) => a + b, 0) / stats.reactionTimesMs.length)
        : 0;

    const hitTypesSummary = Object.entries(stats.targetTypesHit)
      .map(([id, count]) => `${i18n.t(getTargetConfig(id as never).nameKey as never)} ×${count}`)
      .join(', ');

    const el = fromHtml(`
      <div class="ui-screen">
        <div class="panel results-panel scroll-area">
          <h2 style="color:var(--accent); text-align:center; margin-top:0;">${i18n.t('results.title')}</h2>
          ${isNewRecord ? `<div class="new-record-tag">🏆 ${i18n.t('results.newRecord')}</div>` : ''}
          <div class="rank-badge" data-rank>D</div>
          <div class="results-total" data-score>0</div>
          <div class="results-grid">
            <div class="row"><span>${i18n.t('results.hits')}</span><span>${stats.hits}</span></div>
            <div class="row"><span>${i18n.t('results.misses')}</span><span>${stats.misses}</span></div>
            <div class="row"><span>${i18n.t('results.shots')}</span><span>${stats.shotsFired}</span></div>
            <div class="row"><span>${i18n.t('results.accuracy')}</span><span>${formatPercent(accuracy)}</span></div>
            <div class="row"><span>${i18n.t('results.perfectHits')}</span><span>${stats.perfectHits}</span></div>
            <div class="row"><span>${i18n.t('results.highestCombo')}</span><span>${stats.highestCombo}</span></div>
            <div class="row"><span>${i18n.t('results.mostValuableHit')}</span><span>${stats.mostValuableHit}</span></div>
            <div class="row"><span>${i18n.t('results.reactionTime')}</span><span>${avgReaction}ms</span></div>
            <div class="row"><span>${i18n.t('results.eventBonus')}</span><span>${stats.eventBonusPoints}</span></div>
            <div class="row"><span>${i18n.t('results.previousBest')}</span><span>${previousBest ?? '—'}</span></div>
          </div>
          ${hitTypesSummary ? `<p style="text-align:center; color:var(--text-muted); font-size:0.85rem;">${hitTypesSummary}</p>` : ''}
          <div style="display:flex; justify-content:center; gap:24px; margin:14px 0;">
            <div style="text-align:center;"><div style="color:var(--accent);font-weight:800;">+${xpGained}</div><div style="font-size:0.75rem;color:var(--text-muted);">${i18n.t('results.xpGained')}</div></div>
            <div style="text-align:center;"><div style="color:var(--accent);font-weight:800;">+${currencyGained}</div><div style="font-size:0.75rem;color:var(--text-muted);">${i18n.t('results.currencyGained')}</div></div>
          </div>
          ${levelsGained > 0 ? `<div class="new-record-tag">⭐ ${i18n.t('results.levelUp')}</div>` : ''}
          <div style="display:flex; justify-content:center; gap:14px; margin-top:10px;">
            <button class="btn secondary" data-action="menu">${i18n.t('results.menu')}</button>
            <button class="btn" data-action="retry">${i18n.t('results.retry')}</button>
          </div>
        </div>
        <div data-confetti-layer style="position:absolute; inset:0; pointer-events:none; overflow:hidden;"></div>
      </div>
    `);
    root.appendChild(el);
    this.root = el;

    const rankEl = el.querySelector('[data-rank]') as HTMLElement;
    rankEl.textContent = rank;
    this.animateScoreCount(el.querySelector('[data-score]') as HTMLElement, stats.score);

    if (['S', 'SS', 'SSS'].includes(rank) && !document.body.classList.contains('reduced-motion')) {
      this.spawnConfetti(el.querySelector('[data-confetti-layer]') as HTMLElement);
    }

    el.querySelector('[data-action="menu"]')?.addEventListener('click', () => {
      ctx.audio.playMenuClick();
      gameBridge.emit('quitToMenuRequest', undefined);
      ctx.navigate('mainMenu', undefined, { replace: true });
    });
    el.querySelector('[data-action="retry"]')?.addEventListener('click', () => {
      ctx.audio.playMenuClick();
      gameBridge.emit('restartRequest', undefined);
    });
  }

  private animateScoreCount(el: HTMLElement, target: number): void {
    const duration = 900;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(target * eased).toLocaleString(i18n.getLanguage());
      if (t < 1 && this.root) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  private spawnConfetti(layer: HTMLElement): void {
    const colors = ['#f2c14e', '#ffe08a', '#6fcf8f', '#5cd6ff', '#e0566b'];
    for (let i = 0; i < 40; i++) {
      const piece = document.createElement('div');
      const color = colors[Math.floor(Math.random() * colors.length)];
      const left = Math.random() * 100;
      const delay = Math.random() * 0.6;
      const duration = 1.8 + Math.random() * 1.2;
      piece.style.cssText = `position:absolute; top:-20px; left:${left}%; width:8px; height:14px; background:${color}; opacity:0.9; animation: confettiFall ${duration}s ease-in ${delay}s forwards; transform: rotate(${Math.random() * 360}deg);`;
      layer.appendChild(piece);
    }
    const styleId = 'confetti-keyframes';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `@keyframes confettiFall { to { top: 100%; transform: rotate(720deg); opacity: 0.2; } }`;
      document.head.appendChild(style);
    }
  }

  unmount(): void {
    if (this.confettiTimer) window.clearTimeout(this.confettiTimer);
    this.root = null;
  }
}
