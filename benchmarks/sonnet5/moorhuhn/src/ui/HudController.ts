import { gameBridge, type ChallengeHudPayload, type HudUpdatePayload, type ScorePopupPayload } from './GameBridge';
import { i18n } from '../systems/Localization';
import { fromHtml, formatTime } from './domHelpers';
import { gameToScreen } from './coords';
import type { UIManager } from './UIManager';
import type { AudioManager } from '../systems/AudioManager';
import { EVENT_CONFIGS } from '../config/events';
import type { GameModeId, MapId } from '../core/types';

/**
 * Owns the always-on-top HUD overlay (#hud-root) during an active round:
 * time/score/combo/ammo chips, event + boss banners, floating score popups,
 * center banners, the pause button and the pause overlay itself.
 */
export class HudController {
  private root: HTMLElement;
  private uiManager: UIManager;
  private audio: AudioManager;
  private mounted = false;
  private paused = false;
  private unsubs: Array<() => void> = [];
  private pauseOverlay: HTMLElement | null = null;

  constructor(root: HTMLElement, uiManager: UIManager, audio: AudioManager) {
    this.root = root;
    this.uiManager = uiManager;
    this.audio = audio;
  }

  show(mode: GameModeId, map: MapId): void {
    if (this.mounted) this.hide();
    this.mounted = true;
    this.paused = false;
    void mode;
    void map;

    const el = fromHtml(`
      <div id="hud-inner">
        <div class="hud-top">
          <div class="hud-chip"><span class="label">${i18n.t('hud.time')}</span><span data-time>--:--</span></div>
          <div class="hud-chip hud-score"><span class="label">${i18n.t('hud.score')}</span><span data-score>0</span></div>
        </div>
        <div class="hud-combo-wrap">
          <div class="hud-combo-text" data-combo-text></div>
          <div class="hud-combo-bar"><div class="hud-combo-bar-fill" data-combo-fill></div></div>
        </div>
        <div class="hud-event-banner" data-event-banner></div>
        <div class="hud-boss-bar-wrap" data-boss-wrap>
          <div class="hud-boss-name" data-boss-name></div>
          <div class="hud-boss-bar"><div class="hud-boss-bar-fill" data-boss-fill></div></div>
        </div>
        <div class="hud-ammo-wrap">
          <div class="hud-ammo-slots" data-ammo-slots></div>
          <div class="hud-ammo-status" data-ammo-status>${i18n.t('hud.ready')}</div>
        </div>
        <div class="hud-challenge-tracker" data-challenge-tracker style="display:none;"></div>
        <button class="icon-btn hud-pause-btn" data-pause-btn aria-label="pause">⏸</button>
        <div data-popup-layer style="position:fixed; inset:0; pointer-events:none;"></div>
        <div class="center-banner" data-center-banner></div>
      </div>
    `);
    this.root.appendChild(el);
    this.root.classList.add('has-ui');

    el.querySelector('[data-pause-btn]')?.addEventListener('click', () => {
      this.audio.playMenuClick();
      gameBridge.emit('pauseRequest', undefined);
    });

    this.unsubs.push(gameBridge.on('hudUpdate', (p) => this.updateHud(p)));
    this.unsubs.push(gameBridge.on('scorePopup', (p) => this.spawnScorePopup(p)));
    this.unsubs.push(gameBridge.on('centerBanner', (p) => this.showCenterBanner(i18n.t(p.textKey as never, p.params))));
    this.unsubs.push(
      gameBridge.on('eventAnnounce', (p) => {
        const banner = this.root.querySelector('[data-event-banner]') as HTMLElement | null;
        if (!banner) return;
        if (p.active) {
          banner.textContent = `⚡ ${i18n.t(EVENT_CONFIGS[p.id].nameKey as never)}`;
          banner.classList.add('visible');
        } else {
          banner.classList.remove('visible');
        }
      }),
    );
    this.unsubs.push(
      gameBridge.on('bossStatus', (p) => {
        const wrap = this.root.querySelector('[data-boss-wrap]') as HTMLElement | null;
        if (!wrap) return;
        wrap.classList.toggle('visible', p.active);
        if (p.active && p.nameKey) {
          (wrap.querySelector('[data-boss-name]') as HTMLElement).textContent =
            `${i18n.t('hud.boss')}: ${i18n.t(p.nameKey as never)}`;
        }
        if (p.healthFraction01 !== undefined) {
          (wrap.querySelector('[data-boss-fill]') as HTMLElement).style.width = `${p.healthFraction01 * 100}%`;
        }
      }),
    );
    this.unsubs.push(
      gameBridge.on('challengeHud', (list) => this.updateChallengeTracker(list)),
    );
    this.unsubs.push(
      gameBridge.on('pauseStateChanged', (p) => {
        this.paused = p.paused;
        if (p.paused) this.showPauseOverlay();
        else this.hidePauseOverlay();
      }),
    );
  }

  private updateHud(p: HudUpdatePayload): void {
    const timeEl = this.root.querySelector('[data-time]');
    if (timeEl) timeEl.textContent = p.timeRemainingMs === null ? '∞' : formatTime(p.timeRemainingMs);
    const scoreEl = this.root.querySelector('[data-score]');
    if (scoreEl) scoreEl.textContent = Math.round(p.score).toLocaleString(i18n.getLanguage());

    const comboText = this.root.querySelector('[data-combo-text]') as HTMLElement | null;
    if (comboText) {
      if (p.comboCount > 1) {
        comboText.textContent = `${i18n.t('hud.combo')} ×${p.comboCount} (${p.comboMultiplier.toFixed(1)}x)`;
        comboText.classList.add('visible');
      } else {
        comboText.classList.remove('visible');
      }
    }
    const comboFill = this.root.querySelector('[data-combo-fill]') as HTMLElement | null;
    if (comboFill) comboFill.style.width = `${p.comboWindowRemaining01 * 100}%`;

    const slotsEl = this.root.querySelector('[data-ammo-slots]');
    if (slotsEl) {
      slotsEl.innerHTML = '';
      for (let i = 0; i < p.magazineSize; i++) {
        const slot = document.createElement('div');
        slot.className = `ammo-slot ${i < p.ammo ? 'filled' : ''}`;
        slotsEl.appendChild(slot);
      }
    }
    const statusEl = this.root.querySelector('[data-ammo-status]') as HTMLElement | null;
    if (statusEl) {
      statusEl.classList.remove('empty', 'reloading');
      if (p.weaponStatus === 'reloading') {
        statusEl.textContent = i18n.t('hud.reloading');
        statusEl.classList.add('reloading');
      } else if (p.weaponStatus === 'empty') {
        statusEl.textContent = i18n.t('hud.empty');
        statusEl.classList.add('empty');
      } else {
        statusEl.textContent = i18n.t('hud.ready');
      }
    }
  }

  private updateChallengeTracker(list: ChallengeHudPayload[]): void {
    const tracker = this.root.querySelector('[data-challenge-tracker]') as HTMLElement | null;
    if (!tracker) return;
    if (list.length === 0) {
      tracker.style.display = 'none';
      return;
    }
    tracker.style.display = 'block';
    tracker.innerHTML =
      `<strong>${i18n.t('hud.challenge')}</strong><br/>` +
      list
        .map((c) => `${i18n.t(c.labelKey as never)}: ${Math.round(c.progress01 * 100)}%`)
        .join('<br/>');
  }

  private spawnScorePopup(p: ScorePopupPayload): void {
    const layer = this.root.querySelector('[data-popup-layer]');
    if (!layer) return;
    const screenPos = gameToScreen(p.x, p.y);
    const popup = document.createElement('div');
    popup.className = `score-popup ${p.perfect ? 'perfect' : ''}`;
    popup.style.left = `${screenPos.x}px`;
    popup.style.top = `${screenPos.y}px`;
    popup.textContent = p.label ?? `+${p.points}`;
    layer.appendChild(popup);
    window.setTimeout(() => popup.remove(), 1100);
  }

  private showCenterBanner(text: string): void {
    const banner = this.root.querySelector('[data-center-banner]') as HTMLElement | null;
    if (!banner) return;
    banner.textContent = text;
    banner.classList.remove('show');
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    void banner.offsetWidth; // restart CSS animation
    banner.classList.add('show');
  }

  private showPauseOverlay(): void {
    if (this.pauseOverlay) return;
    const overlay = fromHtml(`
      <div class="ui-screen" style="pointer-events:auto; background:rgba(6,10,8,0.6); z-index:20; position:absolute; inset:0;">
        <div class="panel" style="text-align:center; min-width:320px;">
          <h2 style="color:var(--accent); margin-top:0;">${i18n.t('pause.title')}</h2>
          <div class="menu-stack">
            <button class="btn" data-pause-action="resume">${i18n.t('pause.resume')}</button>
            <button class="btn secondary" data-pause-action="restart">${i18n.t('pause.restart')}</button>
            <button class="btn secondary" data-pause-action="settings">${i18n.t('pause.settings')}</button>
            <button class="btn danger" data-pause-action="quit">${i18n.t('pause.quit')}</button>
          </div>
        </div>
      </div>
    `);
    this.root.appendChild(overlay);
    this.pauseOverlay = overlay;

    overlay.querySelector('[data-pause-action="resume"]')?.addEventListener('click', () => {
      this.audio.playMenuClick();
      gameBridge.emit('resumeRequest', undefined);
    });
    overlay.querySelector('[data-pause-action="restart"]')?.addEventListener('click', () => {
      this.audio.playMenuClick();
      gameBridge.emit('restartRequest', undefined);
    });
    overlay.querySelector('[data-pause-action="settings"]')?.addEventListener('click', () => {
      this.audio.playMenuClick();
      this.uiManager.setBackFallback(() => this.uiManager.hide());
      this.uiManager.showRoot('settings');
    });
    overlay.querySelector('[data-pause-action="quit"]')?.addEventListener('click', () => {
      this.audio.playMenuClick();
      gameBridge.emit('quitToMenuRequest', undefined);
    });
  }

  private hidePauseOverlay(): void {
    this.pauseOverlay?.remove();
    this.pauseOverlay = null;
  }

  hide(): void {
    if (!this.mounted) return;
    this.mounted = false;
    this.hidePauseOverlay();
    for (const unsub of this.unsubs) unsub();
    this.unsubs = [];
    this.root.innerHTML = '';
    this.root.classList.remove('has-ui');
  }

  isPaused(): boolean {
    return this.paused;
  }
}
