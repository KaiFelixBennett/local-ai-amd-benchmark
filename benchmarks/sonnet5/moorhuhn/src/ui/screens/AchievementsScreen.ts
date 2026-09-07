import type { AppContext, Screen } from '../types';
import { i18n } from '../../systems/Localization';
import { fromHtml, backButton } from '../domHelpers';
import { ACHIEVEMENT_CONFIGS } from '../../config/achievements';
import { CHALLENGE_CONFIGS } from '../../config/challenges';

export class AchievementsScreen implements Screen<void> {
  private root: HTMLElement | null = null;

  mount(root: HTMLElement, ctx: AppContext): void {
    const save = ctx.save.load();
    const achByI = new Map(save.achievements.map((a) => [a.id, a]));
    const chByI = new Map(save.challenges.map((c) => [c.id, c]));

    const achievementRows = ACHIEVEMENT_CONFIGS.map((cfg) => {
      const state = achByI.get(cfg.id);
      const unlocked = state?.unlocked ?? false;
      const showHidden = cfg.hidden && !unlocked;
      const name = showHidden ? i18n.t('achievements.hiddenName') : i18n.t(cfg.nameKey as never);
      const desc = showHidden ? i18n.t('achievements.hiddenDesc') : i18n.t(cfg.descriptionKey as never);
      return `
        <div class="achievement-item ${unlocked ? 'unlocked' : ''}">
          <div class="achievement-icon">${unlocked ? '★' : '?'}</div>
          <div class="achievement-text">
            <strong>${name}</strong>
            <span>${desc}</span>
          </div>
        </div>`;
    }).join('');

    const challengeRows = CHALLENGE_CONFIGS.map((cfg) => {
      const state = chByI.get(cfg.id);
      const completed = state?.completed ?? false;
      return `
        <div class="challenge-item ${completed ? 'unlocked achievement-item' : 'achievement-item'}">
          <div class="achievement-icon">${completed ? '✓' : '…'}</div>
          <div class="achievement-text">
            <strong>${i18n.t(cfg.nameKey as never)}</strong>
            <span>${i18n.t(cfg.descriptionKey as never)} — ${completed ? i18n.t('challenges.completed') : i18n.t('challenges.inProgress')}</span>
          </div>
        </div>`;
    }).join('');

    const el = fromHtml(`
      <div class="ui-screen">
        <div class="top-bar"><div></div><div></div></div>
        <div class="panel scroll-area" style="max-width:720px; width:92vw;">
          <h2 style="color:var(--accent); text-align:center; margin-top:0;">${i18n.t('achievements.title')}</h2>
          <div>${achievementRows}</div>
          <h2 style="color:var(--accent); text-align:center;">${i18n.t('challenges.title')}</h2>
          <div>${challengeRows}</div>
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
