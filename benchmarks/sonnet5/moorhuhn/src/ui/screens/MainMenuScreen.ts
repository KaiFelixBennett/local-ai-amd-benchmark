import type { AppContext, Screen } from '../types';
import { i18n } from '../../systems/Localization';
import { fromHtml } from '../domHelpers';

export class MainMenuScreen implements Screen<void> {
  private root: HTMLElement | null = null;

  mount(root: HTMLElement, ctx: AppContext): void {
    const save = ctx.save.load();
    const el = fromHtml(`
      <div class="ui-screen">
        <div class="top-bar">
          <div class="hud-chip">${i18n.t('progression.level', { level: save.progression.level })}</div>
          <div style="display:flex; gap:10px;">
            <button class="icon-btn" data-lang="de" title="Deutsch">DE</button>
            <button class="icon-btn" data-lang="en" title="English">EN</button>
          </div>
        </div>
        <div style="display:flex; flex-direction:column; align-items:center;">
          <h1 class="title-hero">Moorland Mayhem</h1>
          <p class="subtitle">${i18n.t('menu.subtitle')}</p>
          <div class="menu-stack">
            <button class="btn" data-action="play">${i18n.t('menu.play')}</button>
            <button class="btn secondary" data-action="tutorial">${i18n.t('menu.tutorial')}</button>
            <button class="btn secondary" data-action="progression">${i18n.t('menu.progression')}</button>
            <button class="btn secondary" data-action="achievements">${i18n.t('menu.achievements')}</button>
            <button class="btn secondary" data-action="stats">${i18n.t('menu.stats')}</button>
            <button class="btn secondary" data-action="settings">${i18n.t('menu.settings')}</button>
            <button class="btn secondary" data-action="credits">${i18n.t('menu.credits')}</button>
          </div>
        </div>
      </div>
    `);
    root.appendChild(el);
    this.root = el;

    el.querySelector('[data-action="play"]')?.addEventListener('click', () => {
      ctx.audio.playMenuClick();
      ctx.navigate('modeSelect');
    });
    el.querySelector('[data-action="tutorial"]')?.addEventListener('click', () => {
      ctx.audio.playMenuClick();
      ctx.navigate('tutorial');
    });
    el.querySelector('[data-action="progression"]')?.addEventListener('click', () => {
      ctx.audio.playMenuClick();
      ctx.navigate('progression');
    });
    el.querySelector('[data-action="achievements"]')?.addEventListener('click', () => {
      ctx.audio.playMenuClick();
      ctx.navigate('achievements');
    });
    el.querySelector('[data-action="stats"]')?.addEventListener('click', () => {
      ctx.audio.playMenuClick();
      ctx.navigate('stats');
    });
    el.querySelector('[data-action="settings"]')?.addEventListener('click', () => {
      ctx.audio.playMenuClick();
      ctx.navigate('settings');
    });
    el.querySelector('[data-action="credits"]')?.addEventListener('click', () => {
      ctx.audio.playMenuClick();
      ctx.navigate('credits');
    });

    el.querySelectorAll<HTMLButtonElement>('[data-lang]').forEach((btn) => {
      if (btn.dataset.lang === i18n.getLanguage()) btn.style.background = 'rgba(242,193,78,0.3)';
      btn.addEventListener('click', () => {
        const lang = btn.dataset.lang as 'de' | 'en';
        i18n.setLanguage(lang);
        ctx.save.update((d) => {
          d.settings.language = lang;
        });
        ctx.audio.playMenuClick();
        ctx.refreshLanguage();
      });
    });

    for (const btn of Array.from(el.querySelectorAll('button'))) {
      btn.addEventListener('mouseenter', () => ctx.audio.playMenuHover());
    }
  }

  unmount(): void {
    this.root = null;
  }
}
