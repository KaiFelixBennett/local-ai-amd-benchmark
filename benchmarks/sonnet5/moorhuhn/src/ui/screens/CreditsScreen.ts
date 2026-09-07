import type { AppContext, Screen } from '../types';
import { i18n } from '../../systems/Localization';
import { fromHtml, backButton } from '../domHelpers';

export class CreditsScreen implements Screen<void> {
  private root: HTMLElement | null = null;

  mount(root: HTMLElement, ctx: AppContext): void {
    const el = fromHtml(`
      <div class="ui-screen">
        <div class="top-bar"><div></div><div></div></div>
        <div class="panel" style="max-width:560px; width:90vw;">
          <h2 style="color:var(--accent); text-align:center; margin-top:0;">${i18n.t('credits.title')}</h2>
          <p style="white-space:pre-line; line-height:1.6; color:var(--text-main);">${i18n.t('credits.body')}</p>
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
