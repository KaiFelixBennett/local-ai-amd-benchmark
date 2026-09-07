/**
 * AppContext — the shared services a scene receives. Kept explicit (no globals)
 * so the scene stays testable and free of hidden dependencies.
 */

import type { AudioManager } from '../audio/AudioManager';
import type { I18N } from '../core/i18n';
import type { SaveData, GameMode, MapId, Settings } from '../core/types';
import type { UiBus, EventBus } from '../ui/EventBus';

export interface RoundRequest {
  mode: GameMode;
  map: MapId;
  seed: number;
  isDaily: boolean;
  dailyLabel?: string;
}

export interface AppContext {
  audio: AudioManager;
  i18n: I18N;
  save: SaveData;
  settings: Settings;
  uiBus: UiBus;
  gameToUi: EventBus;
  /** persist a change to the save (mutates + stores) */
  persist: (mutator: (save: SaveData) => void) => void;
}
