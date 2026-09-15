import type { HitParams, HitResult, Rank } from '../types';
import { clamp } from '../types';
import { BALANCE } from '../config/balance';

/**
 * Pure scoring math. Deterministic given the inputs (the only randomness is the
 * provided Rng, so runs can be replayed from a seed).
 */

/** Normalized elliptical distance: 0 center, 1 on the outer edge. */
export function ellipseDistance(x: number, y: number, cx: number, cy: number, rx: number, ry: number): number {
  if (rx <= 0 || ry <= 0) return 1;
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  return Math.sqrt(dx * dx + dy * dy);
}

export function isInsideHitbox(x: number, y: number, cx: number, cy: number, rx: number, ry: number): boolean {
  return ellipseDistance(x, y, cx, cy, rx, ry) <= 1;
}

export function isPerfect(x: number, y: number, cx: number, cy: number, innerRx: number, innerRy: number): boolean {
  return ellipseDistance(x, y, cx, cy, innerRx, innerRy) <= 1;
}

// Piecewise precision curve (kept as its own function for testability):
function precisionMultiplier(dist: number): number {
  const s = BALANCE.scoring;
  if (dist <= 0.3) {
    // dead center: strong bonus
    const t = 1 - dist / 0.3;
    return 1 + (s.perfectPrecisionMult - 1) * (0.6 + 0.4 * t);
  }
  if (dist <= 0.7) {
    // good hit
    const t = (dist - 0.3) / 0.4;
    return 1 + (s.centerPrecisionMult - 1) * (1 - t) + 0.12 * (1 - t);
  }
  // edge hit
  return s.edgePrecisionMult;
}

function speedMultiplier(speed: number): number {
  const s = BALANCE.scoring;
  const m = speed / s.speedRef;
  return clamp(Math.max(s.speedMultMin, Math.min(s.speedMultMax, 0.6 + 0.4 * m)), s.speedMultMin, s.speedMultMax);
}

function depthMultiplier(depth: number, depthScoring: boolean): number {
  const s = BALANCE.scoring;
  if (!depthScoring) return 1;
  return clamp(0.75 + 0.55 * depth, s.depthMultMin, s.depthMultMax);
}

function timeBonusMult(timeLeft: number): number {
  const s = BALANCE.scoring;
  if (!Number.isFinite(timeLeft)) return 1;
  if (timeLeft >= s.timeBonusFullUntilSec) return 1;
  const missing = s.timeBonusFullUntilSec - timeLeft;
  return clamp(1 + (missing / s.timeBonusPerSecondBeyond) * 0.01, 1, 1.35);
}

/** Combo multiplier from a combo count (shared by HUD and scoring). */
export function comboMultiplier(combo: number): number {
  const c = BALANCE.combo;
  if (combo <= 0) return 1;
  const base = 1 + combo * c.multiplierStep;
  const hot = combo > 10 ? (combo - 10) * c.hotComboBonus * 10 : 0;
  return Math.min(c.maxMultiplier, Math.round((base + hot) * 10) / 10);
}

/** Combo bonus awarded when crossing a threshold. */
export function comboBonusForThreshold(threshold: number): number {
  return threshold * BALANCE.scoring.comboBonusStep;
}

export function perfectStreakBonus(streak: number): number {
  if (streak < 2) return 0;
  return Math.round(BALANCE.scoring.perfectStreakBonusBase * (streak - 1) * (1 + streak * 0.1));
}

export function computeHit(params: HitParams): HitResult {
  const s = BALANCE.scoring;
  const dist = ellipseDistance(params.x, params.y, params.cx, params.cy, params.rx, params.ry);
  const perfect =
    params.innerRx > 0 && params.innerRy > 0
      ? ellipseDistance(params.x, params.y, params.cx, params.cy, params.innerRx, params.innerRy) <= 1
      : false;

  const speedMult = speedMultiplier(params.speed);
  const depthMult = depthMultiplier(params.depth, params.depthScoring ?? false);
  const precisionMult = precisionMultiplier(dist);
  const comboMult = comboMultiplier(params.combo);
  const timeMult = timeBonusMult(params.timeLeft);
  const eventMult = Math.max(1, params.eventMultiplier);

  let total = params.basePoints * speedMult * depthMult * precisionMult * comboMult * timeMult * eventMult;

  // Perfect hits get a small extra kick on top.
  if (perfect) total *= 1.15;

  const labels: string[] = [];
  const parts: string[] = [];
  if (Math.abs(speedMult - 1) > 0.01) {
    parts.push(`speedMult=${speedMult.toFixed(2)}`);
    labels.push('hit.breakdown.speed');
  }
  if (Math.abs(depthMult - 1) > 0.01) {
    parts.push(`depthMult=${depthMult.toFixed(2)}`);
    labels.push('hit.breakdown.depth');
  }
  if (Math.abs(precisionMult - 1) > 0.01) {
    parts.push(`precisionMult=${precisionMult.toFixed(2)}`);
    labels.push('hit.breakdown.precision');
  }
  if (comboMult > 1) {
    parts.push(`comboMult=${comboMult.toFixed(1)}`);
    labels.push('hit.breakdown.combo');
  }
  if (timeMult > 1) {
    parts.push(`timeMult=${timeMult.toFixed(2)}`);
    labels.push('hit.breakdown.time');
  }
  if (eventMult > 1) {
    parts.push(`eventMult=${eventMult.toFixed(1)}`);
    labels.push('hit.breakdown.event');
  }

  let swarmBonus = 0;
  if (params.swarmBonus) {
    swarmBonus = Math.round(total * 0.3 + 200);
    total += swarmBonus;
    labels.push('hit.breakdown.swarm');
  }

  let comboBonus = 0;
  for (const t of params.comboBonusThresholds) {
    if (params.combo === t) {
      comboBonus = comboBonusForThreshold(t);
      total += comboBonus;
      break;
    }
  }

  let perfectBonus = 0;
  if (perfect && params.perfectStreak >= 2) {
    perfectBonus = perfectStreakBonus(params.perfectStreak);
    total += perfectBonus;
    labels.push('hit.breakdown.streak');
  }

  if (params.longshot) {
    total *= s.longshotMult;
    labels.push('hit.longshot');
  }
  if (params.trickshot) {
    total *= s.trickshotMult;
    labels.push('hit.trickshot');
  }
  if (perfect) labels.push('hit.perfect');

  return {
    total: Math.max(1, Math.round(total)),
    base: params.basePoints,
    speedMult,
    depthMult,
    precisionMult,
    comboMult,
    timeBonusMult: timeMult,
    eventMult,
    perfect,
    longshot: params.longshot,
    trickshot: params.trickshot,
    swarmBonus,
    comboBonus,
    perfectStreakBonus: perfectBonus,
    precision: 1 - Math.min(1, dist),
    labels,
  };
}

/* ----------------------------- Rank ------------------------------ */

const RANK_ORDER: Rank[] = ['D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];

export function rankForScore(score: number, modeScoreMult: number): Rank {
  const r = BALANCE.ranks;
  const scale = modeScoreMult > 0 ? 1 / Math.max(0.8, Math.sqrt(modeScoreMult)) : 1;
  const s = score * scale;
  if (s >= r.SSS) return 'SSS';
  if (s >= r.SS) return 'SS';
  if (s >= r.S) return 'S';
  if (s >= r.A) return 'A';
  if (s >= r.B) return 'B';
  if (s >= r.C) return 'C';
  return 'D';
}

/** Points needed from current score to reach the next rank (0 at SSS). */
export function pointsToNextRank(score: number, modeScoreMult: number): { rank: Rank; points: number } {
  const current = rankForScore(score, modeScoreMult);
  const idx = RANK_ORDER.indexOf(current);
  if (idx >= RANK_ORDER.length - 1) return { rank: 'SSS', points: 0 };
  const next = RANK_ORDER[idx + 1] as Rank;
  const r = BALANCE.ranks;
  const scale = modeScoreMult > 0 ? 1 / Math.max(0.8, Math.sqrt(modeScoreMult)) : 1;
  const thresholdRaw = r[next];
  const threshold = Math.ceil(thresholdRaw / scale);
  return { rank: next, points: Math.max(0, threshold - score) };
}

export { RANK_ORDER };
