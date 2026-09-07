import type { AppContext, Screen } from '../types';
import { i18n } from '../../systems/Localization';
import { fromHtml, backButton } from '../domHelpers';
import { CROSSHAIR_CONFIGS, HUD_THEME_CONFIGS, WEAPON_SKIN_CONFIGS } from '../../config/cosmetics';
import type { UnlockState } from '../../core/types';

type CosmeticKind = 'crosshair' | 'hud' | 'weapon';

export class ProgressionScreen implements Screen<void> {
  private root: HTMLElement | null = null;

  mount(root: HTMLElement, ctx: AppContext): void {
    const save = ctx.save.load();
    const p = save.progression;
    const xpFraction = Math.min(1, p.xp / p.xpToNextLevel);

    const renderSection = (
      kind: CosmeticKind,
      titleKey: string,
      items: { id: string; nameKey: string; unlockLevel: number }[],
      unlockedIds: string[],
      equippedId: string,
    ) => `
      <div class="settings-section">
        <h3>${i18n.t(titleKey as never)}</h3>
        ${items
          .map((item) => {
            const unlocked = unlockedIds.includes(item.id) || p.level >= item.unlockLevel;
            const equipped = item.id === equippedId;
            return `
            <div class="settings-row">
              <label>${i18n.t(item.nameKey as never)} ${!unlocked ? `(${i18n.t('menu.unlockAtLevel', { level: item.unlockLevel })})` : ''}</label>
              <button class="btn small ${equipped ? '' : 'secondary'}" data-kind="${kind}" data-id="${item.id}" ${!unlocked ? 'disabled' : ''}>
                ${equipped ? i18n.t('progression.equipped') : i18n.t('progression.equip')}
              </button>
            </div>`;
          })
          .join('')}
      </div>`;

    const el = fromHtml(`
      <div class="ui-screen">
        <div class="top-bar"><div></div><div></div></div>
        <div class="panel scroll-area" style="max-width:820px; width:92vw;">
          <h2 style="color:var(--accent); text-align:center; margin-top:0;">${i18n.t('progression.title')}</h2>
          <div style="text-align:center; font-size:1.3rem; font-weight:800; color:var(--accent-soft);">${i18n.t('progression.level', { level: p.level })}</div>
          <div class="xp-bar-wrap">
            <div class="xp-bar"><div class="xp-bar-fill" style="width:${xpFraction * 100}%"></div></div>
            <div style="text-align:center; font-size:0.8rem; color:var(--text-muted); margin-top:4px;">${i18n.t('progression.xp', { xp: p.xp, xpNext: p.xpToNextLevel })}</div>
          </div>
          <div style="text-align:center; margin-bottom:20px; color:var(--accent);">🪶 ${p.currency} ${i18n.t('progression.currency')}</div>
          <h3 style="color:var(--accent);">${i18n.t('progression.unlocks')}</h3>
          <div class="settings-grid">
            ${renderSection('crosshair', 'progression.crosshairs', CROSSHAIR_CONFIGS, save.unlocks.unlockedCrosshairs, save.unlocks.equippedCrosshair)}
            ${renderSection('hud', 'progression.hudThemes', HUD_THEME_CONFIGS, save.unlocks.unlockedHudThemes, save.unlocks.equippedHudTheme)}
            ${renderSection('weapon', 'progression.weaponSkins', WEAPON_SKIN_CONFIGS, save.unlocks.unlockedWeaponSkins, save.unlocks.equippedWeaponSkin)}
          </div>
        </div>
      </div>
    `);
    const topBar = el.querySelector('.top-bar') as HTMLElement;
    topBar.prepend(backButton(() => ctx.back()));
    root.appendChild(el);
    this.root = el;

    el.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const kind = btn.dataset.kind as CosmeticKind;
        const id = btn.dataset.id as string;
        ctx.audio.playMenuClick();
        ctx.save.update((d) => {
          const unlocks: UnlockState = d.unlocks;
          if (kind === 'crosshair') unlocks.equippedCrosshair = id;
          if (kind === 'hud') unlocks.equippedHudTheme = id;
          if (kind === 'weapon') unlocks.equippedWeaponSkin = id;
        });
        ctx.navigate('progression', undefined, { replace: true });
      });
    });
  }

  unmount(): void {
    this.root = null;
  }
}
