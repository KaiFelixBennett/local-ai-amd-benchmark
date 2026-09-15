import { bus } from '../core/bus';
import type { GameCoreAPI, HudState, ResultsPayload, ScreenId } from '../core/api';
import type { GameClient } from '../core/gameClient';
import { t } from '../core/i18n';
import './uiKeys';
import { el, setUiSoundHook } from './components';
import { Hud } from './hud';
import { createBootScreen } from './screens/boot';
import { createMainScreen } from './screens/main';
import { createModeSelectScreen } from './screens/modeSelect';
import { createMapSelectScreen } from './screens/mapSelect';
import { createHowToScreen } from './screens/howto';
import { createSettingsScreen } from './screens/settings';
import { createResultsScreen } from './screens/results';
import { createHighscoresScreen } from './screens/highscores';
import { createStatsScreen } from './screens/stats';
import { createProgressScreen } from './screens/progress';
import { createAchievementsScreen } from './screens/achievements';
import { createCreditsScreen } from './screens/credits';

/** Common shape returned by every screen factory. */
export interface ScreenHandle {
  root: HTMLElement;
  refresh?(): void;
  destroy?(): void;
}

/** Results screen additionally accepts its payload after construction. */
export interface ResultsScreenHandle extends ScreenHandle {
  setData(payload: ResultsPayload): void;
}

export type ScreenFactory = (core: GameCoreAPI, client: GameClient, router: UIRouter) => ScreenHandle;

const FACTORIES: Record<Exclude<ScreenId, 'game' | 'pause'>, ScreenFactory> = {
  boot: createBootScreen,
  main: createMainScreen,
  modeSelect: createModeSelectScreen,
  mapSelect: createMapSelectScreen,
  howto: createHowToScreen,
  settings: createSettingsScreen,
  results: createResultsScreen,
  highscores: createHighscoresScreen,
  stats: createStatsScreen,
  progress: createProgressScreen,
  achievements: createAchievementsScreen,
  credits: createCreditsScreen,
};

const LEAVE_MS = 150;
const HISTORY_MAX = 16;

/**
 * Owns the DOM overlay: swaps screen components with a fade/slide transition,
 * manages the pause overlay, HUD forwarding and toasts. Driven by bus events
 * (`ui:navigate`, `results:show`, `hud:update`, `toast`) plus direct calls.
 */
export class UIRouter {
  readonly root: HTMLElement;
  private readonly core: GameCoreAPI;
  private readonly client: GameClient;
  private readonly screens = new Map<ScreenId, ScreenHandle>();
  private readonly stage: HTMLElement;
  private readonly toastLayer: HTMLElement;
  private hud: Hud;
  private pauseRoot: HTMLElement | null = null;
  private currentScreen: ScreenId | null = null;
  private history: ScreenId[] = [];
  private lastResults: ResultsPayload | null = null;
  private busy = false;
  private disposers: (() => void)[] = [];

  constructor(root: HTMLElement, core: GameCoreAPI, client: GameClient) {
    this.root = root;
    this.core = core;
    this.client = client;
    root.classList.add('mmf-ui-root');
    setUiSoundHook(core);

    this.stage = el('div', 'mmf-stage');
    this.toastLayer = el('div', 'mmf-toast-layer');
    this.hud = new Hud(core, client);
    root.appendChild(this.stage);
    root.appendChild(this.hud.root);
    root.appendChild(this.toastLayer);

    this.syncAccessibilityClasses();

    this.disposers.push(
      bus.on('ui:navigate', ({ screen }) => {
        const id = screen as ScreenId;
        if (id === 'pause') this.showPause('game');
        else this.show(id);
      }),
      bus.on('results:show', (payload) => this.showResults(payload)),
      bus.on('hud:update', (state) => this.onHud(state)),
      bus.on('toast', ({ message, kind }) => this.toast(message, kind)),
      bus.on('settings:changed', ({ keys }) => {
        this.syncAccessibilityClasses();
        if (keys.includes('language') || keys.includes('*')) {
          this.refreshCurrent();
        }
      }),
      bus.on('game:started', () => {
        this.hidePause();
        this.show('game');
      }),
      bus.on('game:resumed', () => this.hidePause()),
    );
  }

  get current(): ScreenId | null {
    return this.currentScreen;
  }

  /** Mirror accessibility settings onto <html> so CSS can react globally. */
  private syncAccessibilityClasses(): void {
    const s = this.core;
    const html = document.documentElement;
    html.classList.toggle('reduced-motion', s.getSetting('reduceMotion'));
    html.classList.toggle('high-contrast', s.getSetting('highContrast'));
    html.classList.toggle('mmf-colorblind', s.getSetting('colorblind'));
  }

  private reducedMotion(): boolean {
    return this.core.getSetting('reduceMotion');
  }

  private getHandle(screen: ScreenId): ScreenHandle | null {
    if (screen === 'game' || screen === 'pause') return null;
    let handle = this.screens.get(screen);
    if (!handle) {
      const factory = FACTORIES[screen];
      handle = factory(this.core, this.client, this);
      this.screens.set(screen, handle);
    }
    return handle;
  }

  /** Swap the visible screen with a fade/slide transition. */
  show(screen: ScreenId): void {
    this.navigate(screen, true);
  }

  private navigate(screen: ScreenId, pushHistory: boolean): void {
    if (this.busy || screen === this.currentScreen) return;
    const prev = this.currentScreen;
    const pushable = pushHistory && screen !== 'pause' && prev !== null && prev !== 'game' && prev !== screen;
    if (pushable && prev) {
      this.history.push(prev);
      if (this.history.length > HISTORY_MAX) this.history.shift();
    }

    const previous = this.currentScreen;
    this.currentScreen = screen;
    this.root.dataset.screen = screen;

    // The game screen shows only the HUD — Phaser canvas lives underneath.
    if (screen === 'game') {
      this.fadeOutStage(previous);
      this.hud.show();
      this.root.classList.add('mmf-ui-root--passthru');
      return;
    }
    this.hud.hide();
    this.root.classList.remove('mmf-ui-root--passthru');

    const handle = this.getHandle(screen);
    if (!handle) return;

    if (screen === 'results' && this.lastResults) {
      (handle as unknown as ResultsScreenHandle).setData(this.lastResults);
    }
    handle.refresh?.();

    if (this.reducedMotion()) {
      this.stage.replaceChildren(handle.root);
      return;
    }

    this.busy = true;
    const leaving = this.stage.firstElementChild as HTMLElement | null;
    if (leaving) {
      leaving.classList.add('mmf-screen--leaving');
      window.setTimeout(() => {
        leaving.classList.remove('mmf-screen--leaving');
        if (leaving.parentNode === this.stage) this.stage.removeChild(leaving);
      }, LEAVE_MS);
    }
    handle.root.classList.add('mmf-screen--entering');
    this.stage.appendChild(handle.root);
    window.setTimeout(() => {
      handle.root.classList.remove('mmf-screen--entering');
      this.busy = false;
    }, LEAVE_MS + 10);
  }

  /** Pause overlay floating above the game (or any screen id given). */
  showPause(over: string): void {
    if (this.pauseRoot) return;
    const overlay = el('div', 'mmf-pause-overlay');
    overlay.dataset.over = over;
    const panel = el('div', 'mmf-pause-panel');
    panel.appendChild(el('h2', 'mmf-pause-title', t('pause.title')));
    const actions = el('div', 'mmf-pause-actions');
    const mk = (label: string, fn: () => void, variant: 'primary' | 'secondary' | 'ghost' = 'secondary') => {
      const btn = el('button', `mmf-btn btn mmf-btn--${variant}`, label);
      btn.type = 'button';
      btn.addEventListener('mouseenter', () => this.core.playUI('hover'));
      btn.addEventListener('click', () => {
        this.core.playUI('click');
        fn();
      });
      actions.appendChild(btn);
    };
    mk(
      t('pause.resume'),
      () => {
        this.hidePause();
        this.core.resumeGame();
      },
      'primary',
    );
    mk(t('pause.restart'), () => {
      this.hidePause();
      this.core.retryRound();
    });
    mk(t('pause.settings'), () => {
      this.hidePause();
      this.core.go('settings');
    });
    mk(
      t('pause.quit'),
      () => {
        this.hidePause();
        this.core.quitToMenu();
      },
      'ghost',
    );
    panel.appendChild(actions);
    panel.appendChild(el('p', 'mmf-pause-hint', t('pause.hint')));
    overlay.appendChild(panel);
    this.pauseRoot = overlay;
    this.root.appendChild(overlay);
    const first = panel.querySelector('button');
    first?.focus();
  }

  hidePause(): void {
    this.pauseRoot?.remove();
    this.pauseRoot = null;
  }

  /** Forward a HUD snapshot (also exposed via bus `hud:update`). */
  onHud(state: HudState): void {
    this.hud.update(state);
  }

  /** Store the payload and switch to the results screen. */
  showResults(payload: ResultsPayload): void {
    this.lastResults = payload;
    this.hidePause();
    this.show('results');
  }

  /** Transient notification. */
  toast(message: string, kind: 'info' | 'coins' | 'unlock' | 'record' = 'info'): void {
    const node = el('div', `mmf-toast mmf-toast--${kind}`, message);
    node.setAttribute('role', 'status');
    this.toastLayer.appendChild(node);
    const life = this.reducedMotion() ? 1800 : 2600;
    window.setTimeout(() => {
      node.classList.add('mmf-toast--out');
      window.setTimeout(() => node.remove(), 300);
    }, life);
    // Keep at most 4 toasts stacked.
    while (this.toastLayer.children.length > 4) {
      this.toastLayer.firstElementChild?.remove();
    }
  }

  /** Back in navigation history (used by `core.back()`). */
  back(): void {
    const prev = this.history.pop() ?? 'main';
    if (this.currentScreen === prev) return;
    this.currentScreen = null;
    this.navigate(prev, false);
  }

  private refreshCurrent(): void {
    if (!this.currentScreen) return;
    const handle = this.currentScreen === 'game' ? null : this.screens.get(this.currentScreen);
    handle?.refresh?.();
    this.syncAccessibilityClasses();
  }

  private fadeOutStage(previous: ScreenId | null): void {
    const leaving = this.stage.firstElementChild as HTMLElement | null;
    if (!leaving) return;
    if (this.reducedMotion() || previous === null) {
      leaving.remove();
      return;
    }
    leaving.classList.add('mmf-screen--leaving');
    window.setTimeout(() => leaving.remove(), LEAVE_MS);
  }

  dispose(): void {
    for (const off of this.disposers) off();
    this.disposers = [];
    for (const handle of this.screens.values()) handle.destroy?.();
    this.screens.clear();
    this.hud.dispose();
    this.root.replaceChildren();
  }
}
