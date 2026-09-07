import type { AppContext, Screen } from '../types';
import { i18n } from '../../systems/Localization';
import { fromHtml, backButton } from '../domHelpers';
import { MODE_LIST } from '../../config/modes';
import type { GameModeId } from '../../core/types';

export class ModeSelectScreen implements Screen<void> {
  private root: HTMLElement | null = null;

  mount(root: HTMLElement, ctx: AppContext): void {
    const save = ctx.save.load();

    const cards = MODE_LIST.map((mode) => {
      const unlocked =
        save.unlocks.unlockedModes.includes(mode.id) || save.progression.level >= mode.unlockLevel;
      const locked = !unlocked;
      return `
        <div class="card ${locked ? 'locked' : ''}" data-mode="${mode.id}">
          ${locked ? `<span class="lock-badge">${i18n.t('menu.unlockAtLevel', { level: mode.unlockLevel })}</span>` : ''}
          <h3>${i18n.t(mode.nameKey as never)}</h3>
          <p>${i18n.t(mode.descriptionKey as never)}</p>
        </div>`;
    }).join('');

    const el = fromHtml(`
      <div class="ui-screen">
        <div class="top-bar">
          <div></div>
          <div></div>
        </div>
        <div style="display:flex; flex-direction:column; align-items:center; gap:20px;">
          <h1 class="title-hero" style="font-size:2.2rem;">${i18n.t('menu.selectMode')}</h1>
          <div class="grid-cards">${cards}</div>
        </div>
      </div>
    `);
    const topBar = el.querySelector('.top-bar') as HTMLElement;
    topBar.prepend(backButton(() => ctx.back()));

    root.appendChild(el);
    this.root = el;

    el.querySelectorAll<HTMLElement>('.card:not(.locked)').forEach((card) => {
      card.addEventListener('click', () => {
        ctx.audio.playMenuClick();
        const modeId = card.dataset.mode as GameModeId;
        ctx.navigate('mapSelect', { mode: modeId });
      });
      card.addEventListener('mouseenter', () => ctx.audio.playMenuHover());
    });
  }

  unmount(): void {
    this.root = null;
  }
}
