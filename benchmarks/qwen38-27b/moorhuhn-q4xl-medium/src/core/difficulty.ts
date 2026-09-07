/**
 * Difficulty Director — pure, bounded, explainable.
 * Blends six signals into a single 0..1 difficulty value and clamps it so it
 * never gets wildly unfair.
 */

import type { DifficultyState } from './types';
import { DIFFICULTY } from './difficultyParams';

export interface DifficultyInput {
  /** 0..1 hit accuracy so far */
  accuracy: number;
  /** current combo count */
  combo: number;
  /** 0..1 normalized reaction (1 = fast) */
  reaction: number;
  /** 0..1 remaining time (1 = start) */
  timeRemaining: number;
  /** number of misses this round */
  misses: number;
  /** score so far */
  score: number;
  /** score reference for normalization (per mode) */
  scoreRef: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function computeDifficulty(input: DifficultyInput, params = DIFFICULTY): DifficultyState {
  const accuracy = clamp01(input.accuracy);
  const combo = clamp01(input.combo / params.comboRef);
  const reaction = clamp01(input.reaction);
  const time = clamp01(input.timeRemaining);
  // misses reduce difficulty (be kinder to struggling players)
  const misses = clamp01(input.misses / params.missRef);
  const score = clamp01(input.score / params.scoreRef);

  // Weighted blend. Good, fast, on-fire players push difficulty up;
  // missing a lot or being early in the round pulls it back down.
  let value =
    accuracy * params.wAccuracy +
    combo * params.wCombo +
    reaction * params.wReaction +
    (1 - time) * params.wTime +
    score * params.wScore +
    (1 - misses) * params.wMiss;

  // clamp into the bounded band
  value = Math.max(params.min, Math.min(params.max, value));

  return { value, accuracy, combo, reaction, time, misses, score };
}

/** How much faster targets move, as a multiplier of 1. */
export function speedFactor(difficulty: number, params = DIFFICULTY): number {
  return 1 + difficulty * params.speedScale;
}

/** Spawn interval multiplier (lower = more frequent). */
export function spawnIntervalFactor(difficulty: number, params = DIFFICULTY): number {
  return 1 - difficulty * params.spawnScale;
}

/** How many "hard" targets are unlocked at this difficulty. */
export function unlockLevel(difficulty: number): number {
  if (difficulty < 0.15) return 0;
  if (difficulty < 0.35) return 1;
  if (difficulty < 0.55) return 2;
  if (difficulty < 0.75) return 3;
  return 4;
}
