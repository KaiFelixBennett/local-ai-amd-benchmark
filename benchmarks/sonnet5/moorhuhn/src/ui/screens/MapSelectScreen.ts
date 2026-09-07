import type { AppContext, Screen } from '../types';
import { i18n } from '../../systems/Localization';
import { fromHtml, backButton } from '../domHelpers';
import { MAP_LIST } from '../../config/maps';
import type { GameModeId, MapId } from '../../core/types';
import { gameBridge } from '../GameBridge';
import { dailySeedNumber } from '../../core/rng';

interface Params {
  mode: GameModeId;
}

export class MapSelectScreen implements Screen<Params> {
  private root: HTMLElement | null = null;

  mount(root: HTMLElement, ctx: AppContext, params: Params): void {
    const save = ctx.save.load();

    const cards = MAP_LIST.map((map) => {
      const unlocked = save.unlocks.unlockedMaps.includes(map.id) || save.progression.level >= map.unlockLevel;
      const locked = !unlocked;
      return `
        <div class="card ${locked ? 'locked' : ''}" data-map="${map.id}">
          ${locked ? `<span class="lock-badge">${i18n.t('menu.unlockAtLevel', { level: map.unlockLevel })}</span>` : ''}
          <h3>${i18n.t(map.nameKey as never)}</h3>
          <p>${i18n.t(map.descriptionKey as never)}</p>
        </div>`;
    }).join('');

    const el = fromHtml(`
      <div class="ui-screen">
        <div class="top-bar"><div></div><div></div></div>
        <div style="display:flex; flex-direction:column; align-items:center; gap:20px;">
          <h1 class="title-hero" style="font-size:2.2rem;">${i18n.t('menu.selectMap')}</h1>
          <div class="grid-cards">${cards}</div>
          <button class="btn" data-action="start" disabled>${i18n.t('menu.start')}</button>
        </div>
      </div>
    `);
    const topBar = el.querySelector('.top-bar') as HTMLElement;
    topBar.prepend(backButton(() => ctx.back()));
    root.appendChild(el);
    this.root = el;

    let selectedMap: MapId | null = null;
    const startBtn = el.querySelector<HTMLButtonElement>('[data-action="start"]')!;

    el.querySelectorAll<HTMLElement>('.card:not(.locked)').forEach((card) => {
      card.addEventListener('click', () => {
        ctx.audio.playMenuClick();
        el.querySelectorAll('.card').forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
        selectedMap = card.dataset.map as MapId;
        startBtn.disabled = false;
      });
      card.addEventListener('mouseenter', () => ctx.audio.playMenuHover());
    });

    startBtn.addEventListener('click', () => {
      if (!selectedMap) return;
      ctx.audio.playMenuClick();
      const seed = params.mode === 'daily' ? dailySeedNumber() : Math.floor(Math.random() * 0xffffffff);
      gameBridge.emit('startRound', { mode: params.mode, map: selectedMap, seed });
    });
  }

  unmount(): void {
    this.root = null;
  }
}
