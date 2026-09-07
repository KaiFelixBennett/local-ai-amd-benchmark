import type { ComboState, GameMode } from '../types';

export function createComboState(windowMs: number): ComboState {
  return {
    count: 0,
    multiplier: 1,
    lastHitTime: 0,
    windowMs,
    streakHits: 0,
    perfectStreak: 0,
  };
}

/**
 * Update combo state after a hit. Returns the updated combo and whether it expired.
 */
export function onHit(combo: ComboState, now: number, isPerfect: boolean): { combo: ComboState; expired: boolean } {
  const elapsed = now - combo.lastHitTime;
  const expired = combo.lastHitTime > 0 && elapsed > combo.windowMs;

  if (expired) {
    // Reset combo
    return {
      combo: {
        count: 1,
        multiplier: 1,
        lastHitTime: now,
        windowMs: combo.windowMs,
        streakHits: 1,
        perfectStreak: isPerfect ? 1 : 0,
      },
      expired: true,
    };
  }

  const newCount = combo.count + 1;
  // Multiplier scales: 1x, 1.2x, 1.5x, 2x, 2.5x, 3x, 3.5x, 4x (cap)
  const newMultiplier = Math.min(4, 1 + Math.floor(newCount / 3) * 0.5);

  return {
    combo: {
      count: newCount,
      multiplier: newMultiplier,
      lastHitTime: now,
      windowMs: combo.windowMs,
      streakHits: combo.streakHits + 1,
      perfectStreak: isPerfect ? combo.perfectStreak + 1 : 0,
    },
    expired: false,
  };
}

/**
 * Update combo state after a miss.
 */
export function onMiss(combo: ComboState): ComboState {
  if (combo.count <= 3) {
    // First few misses just reset the window, keep small combo
    return {
      ...combo,
      lastHitTime: 0,
      streakHits: 0,
      perfectStreak: 0,
    };
  }
  // Big combo gets reset on miss
  return {
    count: 0,
    multiplier: 1,
    lastHitTime: 0,
    windowMs: combo.windowMs,
    streakHits: 0,
    perfectStreak: 0,
  };
}

/**
 * Check if combo has expired at the given time.
 */
export function isComboExpired(combo: ComboState, now: number): boolean {
  return combo.lastHitTime > 0 && now - combo.lastHitTime > combo.windowMs;
}

/**
 * Get combo milestone label.
 */
export function getComboLabel(count: number): string | null {
  if (count >= 50) return 'LEGENDARY!';
  if (count >= 40) return 'INCREDIBLE!';
  if (count >= 30) return 'AMAZING!';
  if (count >= 20) return 'FANTASTIC!';
  if (count >= 15) return 'GREAT!';
  if (count >= 10) return 'NICE!';
  if (count >= 5) return 'GOOD!';
  return null;
}
