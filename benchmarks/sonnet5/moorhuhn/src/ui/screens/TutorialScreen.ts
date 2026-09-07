import type { AppContext, Screen } from '../types';
import { i18n } from '../../systems/Localization';
import { fromHtml, backButton } from '../domHelpers';

const STEP_ICONS = ['🎯', '🔫', '🔄', '✨', '🔥', '💥'];

export class TutorialScreen implements Screen<void> {
  private root: HTMLElement | null = null;
  private step = 0;
  private readonly totalSteps = 6;

  mount(root: HTMLElement, ctx: AppContext): void {
    const el = fromHtml(`
      <div class="ui-screen">
        <div class="top-bar"><div></div><div></div></div>
        <div class="panel" style="max-width:520px; text-align:center;">
          <div style="font-size:3.5rem; margin-bottom:10px;" data-icon></div>
          <h2 style="color:var(--accent); margin: 0 0 12px;">${i18n.t('tutorial.title')}</h2>
          <p style="min-height:70px; font-size:1.05rem; line-height:1.5;" data-text></p>
          <div style="display:flex; justify-content:center; gap:6px; margin:16px 0;" data-dots></div>
          <div style="display:flex; justify-content:center; gap:12px;">
            <button class="btn secondary" data-action="skip">${i18n.t('tutorial.skip')}</button>
            <button class="btn" data-action="next">${i18n.t('tutorial.next')}</button>
          </div>
        </div>
      </div>
    `);
    const topBar = el.querySelector('.top-bar') as HTMLElement;
    topBar.prepend(backButton(() => ctx.back()));
    root.appendChild(el);
    this.root = el;

    const iconEl = el.querySelector('[data-icon]') as HTMLElement;
    const textEl = el.querySelector('[data-text]') as HTMLElement;
    const dotsEl = el.querySelector('[data-dots]') as HTMLElement;
    const nextBtn = el.querySelector('[data-action="next"]') as HTMLButtonElement;

    const render = () => {
      iconEl.textContent = STEP_ICONS[this.step] ?? '🎯';
      textEl.textContent = i18n.t(`tutorial.step${this.step + 1}` as never);
      dotsEl.innerHTML = '';
      for (let i = 0; i < this.totalSteps; i++) {
        const dot = document.createElement('span');
        dot.style.cssText = `width:8px;height:8px;border-radius:50%;background:${
          i === this.step ? 'var(--accent)' : 'rgba(255,255,255,0.2)'
        };`;
        dotsEl.appendChild(dot);
      }
      nextBtn.textContent = this.step === this.totalSteps - 1 ? i18n.t('tutorial.done') : i18n.t('tutorial.next');
    };
    render();

    const finish = () => {
      ctx.save.update((d) => {
        d.tutorialCompleted = true;
      });
      ctx.back();
    };

    nextBtn.addEventListener('click', () => {
      ctx.audio.playMenuClick();
      if (this.step >= this.totalSteps - 1) {
        finish();
        return;
      }
      this.step += 1;
      render();
    });

    el.querySelector('[data-action="skip"]')?.addEventListener('click', () => {
      ctx.audio.playMenuClick();
      finish();
    });
  }

  unmount(): void {
    this.root = null;
  }
}
