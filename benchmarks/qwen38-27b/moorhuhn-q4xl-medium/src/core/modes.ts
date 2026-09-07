/**
 * Game mode definitions — pure data driving the round.
 */

import type { GameMode } from './types';

export interface ModeConfig {
  id: GameMode;
  /** null = endless (no hard timer) */
  durationSec: number | null;
  /** base spawn interval ms (difficulty director modulates this) */
  spawnIntervalMs: number;
  /** combo window ms for this mode */
  comboWindowMs: number;
  /** score reference for rank normalization */
  rankRefScore: number;
  /** event multiplier ramp per phase (applied on top) */
  eventRamp: number;
  /** magazine size */
  magazine: number;
  /** auto-reload when empty */
  autoReload: boolean;
  /** infinite ammo (precision is false, endless true, etc.) */
  infiniteAmmo: boolean;
  /** reduced penalties (zen) */
  gentle: boolean;
  /** name key for i18n */
  nameKey: string;
  descKey: string;
}

export const MODES: Record<GameMode, ModeConfig> = {
  classic: {
    id: 'classic',
    durationSec: 120,
    spawnIntervalMs: 900,
    comboWindowMs: 4000,
    rankRefScore: 9000,
    eventRamp: 1,
    magazine: 6,
    autoReload: true,
    infiniteAmmo: false,
    gentle: false,
    nameKey: 'mode.classic',
    descKey: 'mode.classic.desc'
  },
  blitz: {
    id: 'blitz',
    durationSec: 60,
    spawnIntervalMs: 420,
    comboWindowMs: 2200,
    rankRefScore: 8000,
    eventRamp: 1.2,
    magazine: 6,
    autoReload: true,
    infiniteAmmo: false,
    gentle: false,
    nameKey: 'mode.blitz',
    descKey: 'mode.blitz.desc'
  },
  precision: {
    id: 'precision',
    durationSec: 120,
    spawnIntervalMs: 1100,
    comboWindowMs: 5000,
    rankRefScore: 7000,
    eventRamp: 1,
    magazine: 24,
    autoReload: false,
    infiniteAmmo: false,
    gentle: false,
    nameKey: 'mode.precision',
    descKey: 'mode.precision.desc'
  },
  endless: {
    id: 'endless',
    durationSec: null,
    spawnIntervalMs: 950,
    comboWindowMs: 4200,
    rankRefScore: 12000,
    eventRamp: 1.1,
    magazine: 6,
    autoReload: true,
    infiniteAmmo: true,
    gentle: false,
    nameKey: 'mode.endless',
    descKey: 'mode.endless.desc'
  },
  daily: {
    id: 'daily',
    durationSec: 120,
    spawnIntervalMs: 900,
    comboWindowMs: 4000,
    rankRefScore: 9000,
    eventRamp: 1,
    magazine: 6,
    autoReload: true,
    infiniteAmmo: false,
    gentle: false,
    nameKey: 'mode.daily',
    descKey: 'mode.daily.desc'
  },
  zen: {
    id: 'zen',
    durationSec: 120,
    spawnIntervalMs: 1300,
    comboWindowMs: 6000,
    rankRefScore: 6000,
    eventRamp: 0.9,
    magazine: 6,
    autoReload: true,
    infiniteAmmo: false,
    gentle: true,
    nameKey: 'mode.zen',
    descKey: 'mode.zen.desc'
  }
};

export const GAME_MODES: GameMode[] = ['classic', 'blitz', 'precision', 'endless', 'daily', 'zen'];

/** Combo config (window) per mode, used to instantiate Combo. */
export const COMBO_CONFIGS: Record<GameMode, { comboWindowMs: number; rankRefScore: number }> = {
  classic: { comboWindowMs: MODES.classic.comboWindowMs, rankRefScore: MODES.classic.rankRefScore },
  blitz: { comboWindowMs: MODES.blitz.comboWindowMs, rankRefScore: MODES.blitz.rankRefScore },
  precision: { comboWindowMs: MODES.precision.comboWindowMs, rankRefScore: MODES.precision.rankRefScore },
  endless: { comboWindowMs: MODES.endless.comboWindowMs, rankRefScore: MODES.endless.rankRefScore },
  daily: { comboWindowMs: MODES.daily.comboWindowMs, rankRefScore: MODES.daily.rankRefScore },
  zen: { comboWindowMs: MODES.zen.comboWindowMs, rankRefScore: MODES.zen.rankRefScore }
};
