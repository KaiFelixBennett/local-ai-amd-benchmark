/**
 * Shared factories for unit tests. These fabricate the exact shapes declared
 * in `src/core/types.ts` so assertions stay honest about every field.
 */
import type {
  RunResult,
  RunStats,
  SaveData,
  ShotHitInfo,
  TargetKind,
} from '../src/core/types';
import { defaultSave } from '../src/core/Save';

/** A mid-difficulty hit with neutral multipliers; override per test. */
export function shotInfo(overrides: Partial<ShotHitInfo> = {}): ShotHitInfo {
  return {
    kind: 'flatterer',
    precision: 0.5,
    depth: 0.5,
    speed: 300,
    sizeScale: 1,
    timeLeft: -1,
    eventMultiplier: 1,
    comboHits: 0,
    swarmBonus: false,
    trickshot: false,
    longshot: false,
    perfect: false,
    streak: 0,
    kindBonusDepthPoints: 0,
    ...overrides,
  };
}

/** Every field of RunStats, zeroed; override per test. */
export function runStats(overrides: Partial<RunStats> = {}): RunStats {
  return {
    score: 0,
    hits: 0,
    misses: 0,
    shots: 0,
    perfects: 0,
    bestCombo: 0,
    combo: 0,
    bestHit: 0,
    reactionSum: 0,
    reactionCount: 0,
    kindHits: {},
    eventBonus: 0,
    envBonus: 0,
    chainBonus: 0,
    bossKills: 0,
    decoyHits: 0,
    chainsDone: [],
    hiddenFound: [],
    swarmBonusDone: false,
    perfectStreak: 0,
    bestPerfectStreak: 0,
    hitStreakNoMiss: 0,
    bonusTime: 0,
    xps: 0,
    ...overrides,
  };
}

/** A finished-run record; override per test. */
export function runResult(overrides: Partial<RunResult> = {}): RunResult {
  return {
    mode: 'classic',
    map: 'nebelmoor',
    seed: 42,
    stats: runStats(),
    rank: 'C',
    score: 1000,
    xp: 100,
    isBest: false,
    previousBest: 0,
    newAchievements: [],
    leveledUp: false,
    newLevel: 1,
    currencyEarned: 5,
    ...overrides,
  };
}

/** A pristine save object (not the module cache). */
export function freshSave(): SaveData {
  return defaultSave();
}

/** Convenience: a kind-hit map for assertions. */
export function kindHits(
  entries: Partial<Record<TargetKind, number>>,
): Partial<Record<TargetKind, number>> {
  return entries;
}
