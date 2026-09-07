/**
 * Rank (D..SSS) calculation and round summary. Pure.
 */

import type { Rank, RoundStats, GameMode } from './types';
import { COMBO_CONFIGS } from './modes';

const RANKS: Rank[] = ['D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];

export function rankIndex(rank: Rank): number {
  return RANKS.indexOf(rank);
}

export function compareRank(a: Rank, b: Rank): number {
  return rankIndex(a) - rankIndex(b);
}

export interface RankInput {
  score: number;
  accuracy: number; // 0..1
  maxCombo: number;
  perfectHits: number;
  mode: GameMode;
}

/**
 * Blend score (normalized against a per-mode reference) with accuracy and
 * combo to produce a D..SSS grade.
 */
export function computeRank(input: RankInput): Rank {
  const ref = COMBO_CONFIGS[input.mode].rankRefScore;
  const scoreFactor = Math.min(1.6, input.score / ref);
  const acc = Math.max(0, Math.min(1, input.accuracy));
  const comboFactor = Math.min(1, input.maxCombo / 20);
  const perfectFactor = Math.min(1, input.perfectHits / 15);

  const value = scoreFactor * 0.5 + acc * 0.3 + comboFactor * 0.12 + perfectFactor * 0.08;

  // thresholds (on a 0..~1.6-ish scale)
  if (value >= 1.15) return 'SSS';
  if (value >= 1.0) return 'SS';
  if (value >= 0.82) return 'S';
  if (value >= 0.62) return 'A';
  if (value >= 0.42) return 'B';
  if (value >= 0.24) return 'C';
  return 'D';
}

/** Accuracy as 0..1 from raw counts. */
export function accuracy(hits: number, shots: number): number {
  if (shots <= 0) return 0;
  return hits / shots;
}

/** Build a finalized RoundStats object. */
export function buildRoundStats(args: {
  mode: GameMode;
  map: RoundStats['map'];
  score: number;
  shots: number;
  hits: number;
  misses: number;
  perfectHits: number;
  maxCombo: number;
  bestHitValue: number;
  bestHitTarget: RoundStats['bestHitTarget'];
  avgReactionMs: number;
  reactionSamples: number;
  hitsByTarget: RoundStats['hitsByTarget'];
  eventBonuses: number;
  multikills: number;
  chainReactions: number;
  bossKills: number;
  durationMs: number;
}): RoundStats {
  const acc = accuracy(args.hits, args.shots);
  const rank = computeRank({
    score: args.score,
    accuracy: acc,
    maxCombo: args.maxCombo,
    perfectHits: args.perfectHits,
    mode: args.mode
  });
  return {
    mode: args.mode,
    map: args.map,
    score: args.score,
    shots: args.shots,
    hits: args.hits,
    misses: args.misses,
    perfectHits: args.perfectHits,
    maxCombo: args.maxCombo,
    bestHitValue: args.bestHitValue,
    bestHitTarget: args.bestHitTarget,
    avgReactionMs: args.avgReactionMs,
    reactionSamples: args.reactionSamples,
    hitsByTarget: args.hitsByTarget,
    eventBonuses: args.eventBonuses,
    multikills: args.multikills,
    chainReactions: args.chainReactions,
    bossKills: args.bossKills,
    durationMs: args.durationMs,
    rank,
    isPersonalBest: false
  };
}
