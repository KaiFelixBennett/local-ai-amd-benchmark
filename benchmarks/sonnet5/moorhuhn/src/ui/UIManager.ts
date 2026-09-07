import type { SaveManager } from '../systems/SaveManager';
import type { AudioManager } from '../systems/AudioManager';
import type { AppContext, NavigateOptions, Screen, ScreenId } from './types';
import { i18n } from '../systems/Localization';

import { MainMenuScreen } from './screens/MainMenuScreen';
import { ModeSelectScreen } from './screens/ModeSelectScreen';
import { MapSelectScreen } from './screens/MapSelectScreen';
import { TutorialScreen } from './screens/TutorialScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { StatsScreen } from './screens/StatsScreen';
import { ProgressionScreen } from './screens/ProgressionScreen';
import { AchievementsScreen } from './screens/AchievementsScreen';
import { CreditsScreen } from './screens/CreditsScreen';
import { ResultsScreen } from './screens/ResultsScreen';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ScreenFactory = () => Screen<any>;

const SCREEN_FACTORIES: Record<ScreenId, ScreenFactory> = {
  mainMenu: () => new MainMenuScreen(),
  modeSelect: () => new ModeSelectScreen(),
  mapSelect: () => new MapSelectScreen(),
  tutorial: () => new TutorialScreen(),
  settings: () => new SettingsScreen(),
  stats: () => new StatsScreen(),
  progression: () => new ProgressionScreen(),
  achievements: () => new AchievementsScreen(),
  credits: () => new CreditsScreen(),
  results: () => new ResultsScreen(),
};

interface StackEntry {
  id: ScreenId;
  params: unknown;
}

/**
 * Navigation-stack driven manager for every non-gameplay screen. HUD/Pause
 * during an active round are handled separately by HudController since they
 * overlay the live Phaser canvas rather than replacing it.
 */
export class UIManager {
  private root: HTMLElement;
  private stack: StackEntry[] = [];
  private currentScreen: Screen<unknown> | null = null;
  private ctx: AppContext;
  private backFallback: (() => void) | null = null;

  constructor(root: HTMLElement, save: SaveManager, audio: AudioManager) {
    this.root = root;
    this.ctx = {
      save,
      audio,
      navigate: (id, params, options) => this.navigate(id, params, options),
      back: () => this.back(),
      refreshLanguage: () => this.rerender(),
    };
  }

  getContext(): AppContext {
    return this.ctx;
  }

  navigate(id: ScreenId, params?: unknown, options?: NavigateOptions): void {
    if (options?.replace && this.stack.length > 0) {
      this.stack[this.stack.length - 1] = { id, params };
    } else {
      this.stack.push({ id, params });
    }
    this.render();
  }

  back(): void {
    if (this.stack.length > 1) {
      this.stack.pop();
      this.render();
    } else if (this.backFallback) {
      this.stack = [];
      this.backFallback();
    } else {
      this.navigate('mainMenu', undefined, { replace: true });
    }
  }

  /** While set, back() on an empty stack calls this instead of navigating to the main menu
   *  (used while a round is paused, so "back" from in-round Settings returns to the pause overlay). */
  setBackFallback(fn: (() => void) | null): void {
    this.backFallback = fn;
  }

  showRoot(id: ScreenId, params?: unknown): void {
    this.stack = [{ id, params }];
    this.render();
  }

  private rerender(): void {
    this.render();
  }

  hide(): void {
    this.currentScreen?.unmount();
    this.currentScreen = null;
    this.root.innerHTML = '';
    this.root.classList.remove('has-ui');
  }

  private render(): void {
    this.currentScreen?.unmount();
    this.root.innerHTML = '';
    this.root.classList.add('has-ui');
    const entry = this.stack[this.stack.length - 1];
    if (!entry) return;
    document.title = i18n.t('app.title');
    const factory = SCREEN_FACTORIES[entry.id];
    const screen = factory();
    this.currentScreen = screen;
    screen.mount(this.root, this.ctx, entry.params);
  }
}
