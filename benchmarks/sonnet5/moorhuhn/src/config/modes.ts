import type { GameModeId } from '../core/types';
import { BALANCE } from './balance';

export interface GameModeConfig {
  id: GameModeId;
  nameKey: string;
  descriptionKey: string;
  durationMs: number | null;
  limitedAmmo: boolean;
  autoReload: boolean;
  comboWindowMs: number;
  spawnRateMultiplier: number;
  multiplierGrowth: number;
  missPenaltyMultiplier: number;
  unlockLevel: number;
  useDailySeed: boolean;
  relaxed: boolean;
}

export const MODE_CONFIGS: Record<GameModeId, GameModeConfig> = {
  classic: {
    id: 'classic',
    nameKey: 'mode.classic.name',
    descriptionKey: 'mode.classic.desc',
    durationMs: BALANCE.roundDurations.classicMs,
    limitedAmmo: false,
    autoReload: true,
    comboWindowMs: BALANCE.combo.windowMs,
    spawnRateMultiplier: 1,
    multiplierGrowth: 1,
    missPenaltyMultiplier: 1,
    unlockLevel: 1,
    useDailySeed: false,
    relaxed: false,
  },
  blitz: {
    id: 'blitz',
    nameKey: 'mode.blitz.name',
    descriptionKey: 'mode.blitz.desc',
    durationMs: BALANCE.roundDurations.blitzMs,
    limitedAmmo: false,
    autoReload: true,
    comboWindowMs: BALANCE.combo.blitzWindowMs,
    spawnRateMultiplier: 1.55,
    multiplierGrowth: 1.6,
    missPenaltyMultiplier: 1.2,
    unlockLevel: 2,
    useDailySeed: false,
    relaxed: false,
  },
  precision: {
    id: 'precision',
    nameKey: 'mode.precision.name',
    descriptionKey: 'mode.precision.desc',
    durationMs: BALANCE.roundDurations.precisionMs,
    limitedAmmo: true,
    autoReload: false,
    comboWindowMs: BALANCE.combo.windowMs * 1.15,
    spawnRateMultiplier: 0.75,
    multiplierGrowth: 1.1,
    missPenaltyMultiplier: 1.5,
    unlockLevel: 3,
    useDailySeed: false,
    relaxed: false,
  },
  endless: {
    id: 'endless',
    nameKey: 'mode.endless.name',
    descriptionKey: 'mode.endless.desc',
    durationMs: null,
    limitedAmmo: false,
    autoReload: true,
    comboWindowMs: BALANCE.combo.windowMs,
    spawnRateMultiplier: 1,
    multiplierGrowth: 1,
    missPenaltyMultiplier: 1,
    unlockLevel: 5,
    useDailySeed: false,
    relaxed: false,
  },
  daily: {
    id: 'daily',
    nameKey: 'mode.daily.name',
    descriptionKey: 'mode.daily.desc',
    durationMs: BALANCE.roundDurations.classicMs,
    limitedAmmo: false,
    autoReload: true,
    comboWindowMs: BALANCE.combo.windowMs,
    spawnRateMultiplier: 1,
    multiplierGrowth: 1,
    missPenaltyMultiplier: 1,
    unlockLevel: 1,
    useDailySeed: true,
    relaxed: false,
  },
  zen: {
    id: 'zen',
    nameKey: 'mode.zen.name',
    descriptionKey: 'mode.zen.desc',
    durationMs: BALANCE.roundDurations.zenMs,
    limitedAmmo: false,
    autoReload: true,
    comboWindowMs: BALANCE.combo.windowMs * 1.4,
    spawnRateMultiplier: 0.7,
    multiplierGrowth: 0.8,
    missPenaltyMultiplier: 0.4,
    unlockLevel: 1,
    useDailySeed: false,
    relaxed: true,
  },
};

export const MODE_LIST: GameModeConfig[] = Object.values(MODE_CONFIGS);

export function getModeConfig(id: GameModeId): GameModeConfig {
  const cfg = MODE_CONFIGS[id];
  if (!cfg) throw new Error(`Unknown mode: ${id}`);
  return cfg;
}
