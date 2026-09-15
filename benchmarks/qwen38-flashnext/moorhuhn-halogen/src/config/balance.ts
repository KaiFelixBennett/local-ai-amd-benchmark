/** Central balance knobs. Everything gameplay-mathematical lives here. */
export const BALANCE = {
  weapon: {
    fireCooldownMs: 140,
    reloadDurationMs: 1100,
    /** minimum time a reload must run before it can be cancelled */
    reloadCancelGraceMs: 180,
    /** shots between fully-faster auto reloads */
    emptyDelayMs: 250,
  },
  combo: {
    /** combo * base = displayed multiplier (with caps) */
    maxMultiplier: 9.9,
    multiplierStep: 0.1,
    /** per combo point bonus beyond 10 (adds to multiplier growth) */
    hotComboBonus: 0.012,
  },
  scoring: {
    /** target speed px/s at which speed multiplier == 1 */
    speedRef: 220,
    speedMultMin: 1.0,
    speedMultMax: 2.0,
    depthMultMin: 0.85,
    depthMultMax: 1.6,
    /** inner hits give at most this precision multiplier */
    perfectPrecisionMult: 1.5,
    centerPrecisionMult: 1.15,
    /** precision multiplier at the very edge */
    edgePrecisionMult: 1.0,
    timeBonusFullUntilSec: 30,
    timeBonusPerSecondBeyond: 2,
    longshotMinDistPx: 1400,
    longshotMult: 1.4,
    trickshotMult: 1.8,
    comboBonusStep: 250, // combo bonus points = threshold * step
    perfectStreakBonusBase: 200,
  },
  difficulty: {
    /** global clamp for any adaptation so the game never breaks */
    min: 0.7,
    max: 1.6,
    /** how fast adaptation moves toward target (per second) */
    rate: 0.18,
    accuracyTarget: 0.62,
    reactionGoodMs: 700,
    reactionBadMs: 1600,
    // additive nudges per second-ish evaluation:
    nudgeAccuracyHigh: 0.1,
    nudgeAccuracyLow: -0.12,
    nudgeComboHigh: 0.08,
    nudgeMissStreak: -0.15,
    nudgeLateGame: 0.15, // final 25% of round
  },
  xp: {
    /** level n -> n+1 requires base * n^exp */
    base: 800,
    exp: 1.35,
    /** xp = score * factor + misc */
    scoreFactor: 0.15,
    perfectBonus: 25,
    bossBonus: 600,
    maxLevel: 50,
  },
  coins: {
    scoreFactor: 0.02,
    perfectFactor: 4,
    chainBonus: 60,
    bossBonus: 300,
    dailyBonus: 150,
  },
  ranks: {
    // score thresholds for a "balanced" 120s classic round; scaled by mode scoreMult
    D: 0,
    C: 4000,
    B: 9000,
    A: 16000,
    S: 26000,
    SS: 40000,
    SSS: 60000,
  },
  fx: {
    hitStopMs: 40,
    perfectHitStopMs: 70,
    bossHitStopMs: 90,
  },
} as const;

export type Balance = typeof BALANCE;
