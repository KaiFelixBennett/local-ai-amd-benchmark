import type { SaveManager } from '../systems/SaveManager';
import type { AudioManager } from '../systems/AudioManager';

export type ScreenId =
  | 'mainMenu'
  | 'modeSelect'
  | 'mapSelect'
  | 'tutorial'
  | 'settings'
  | 'stats'
  | 'progression'
  | 'achievements'
  | 'credits'
  | 'results';

export interface NavigateOptions {
  /** If true, replaces the current screen instead of pushing (no back-navigation to it). */
  replace?: boolean;
}

export interface AppContext {
  save: SaveManager;
  audio: AudioManager;
  navigate: (screen: ScreenId, params?: unknown, options?: NavigateOptions) => void;
  back: () => void;
  refreshLanguage: () => void;
}

export interface Screen<P = undefined> {
  mount(root: HTMLElement, ctx: AppContext, params: P): void;
  unmount(): void;
}
