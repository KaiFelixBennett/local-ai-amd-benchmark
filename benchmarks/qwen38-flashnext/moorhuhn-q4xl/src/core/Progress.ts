/** Pure player-progression math (XP curve, levels). Fully testable. */

/** XP needed to advance FROM `level` to the next one. Gently increasing. */
export function xpForLevel(level: number): number {
  return Math.round(120 * Math.pow(level, 1.35));
}

/** Cumulative XP required to reach `level` (level 1 = 0 xp). */
export function cumulativeXp(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += xpForLevel(l);
  return total;
}

export interface LevelInfo {
  level: number;
  xpIntoLevel: number;
  xpForNext: number;
  progress: number; // 0..1
}

/** Derive a level from total XP. Monotonic and clamped for sanity. */
export function levelFromXp(xp: number): LevelInfo {
  let level = 1;
  let remaining = Math.max(0, Math.floor(xp));
  while (level < 99 && remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level);
    level++;
  }
  const need = xpForLevel(level);
  return {
    level,
    xpIntoLevel: remaining,
    xpForNext: need,
    progress: Math.min(1, remaining / need),
  };
}

/** XP granted for a finished run based on score, mode length, and accuracy. */
export function runXp(score: number, accuracy: number, durationSec: number): number {
  const acc = Math.min(1, Math.max(0, accuracy));
  const base = Math.round(score / 42);
  const timeBonus = Math.round(durationSec / 10);
  const accBonus = Math.round(acc * 60);
  return Math.max(5, base + timeBonus * 3 + accBonus);
}

/** In-game currency ("Feathers") earned for a run. Cosmetic-only spending. */
export function runFeathers(score: number, hits: number): number {
  return Math.max(1, Math.round(score / 900) + Math.round(hits / 40));
}
