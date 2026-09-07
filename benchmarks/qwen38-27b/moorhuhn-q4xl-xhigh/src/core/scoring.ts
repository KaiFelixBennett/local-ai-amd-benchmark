/**
 * Punkteberechnung — deterministisch, separat testbar, frei von Phaser.
 */
import type { RankGrade, RankResult, ScoreBreakdown } from './types';

export interface ScoreConfig {
  /** Punkte-Multiplikator pro Combo-Schritt, ab combo >= 5. */
  comboStart: number;
  /** Maximaler Combo-Multiplikator. */
  comboMaxMultiplier: number;
  /** Zusätzlicher Multiplikator-Schritt pro 5 Combo. */
  comboStepPerFive: number;
  /** Bonus in % für Perfect Hits (Treffpunkt im inneren Bereich). */
  perfectHitBonusPct: number;
  /** Streak-Bonus: alle N Treffer ohne Fehlschuss. */
  streakEvery: number;
  streakBonusPct: number;
  /** Longshot: Mindesttiefe (deutlich hinten) für Bonus. */
  longshotMinDepth: number;
  longshotBonusPct: number;
  /** Trickshot-Bonus in % (Umgebungskombination). */
  trickshotBonusPct: number;
  /** Multikill: Treffer im selben Frame-Cluster. */
  multikillWindowMs: number;
  multikillBonusPer: number;
  /** Schwarmbonus: alle Formationstiere binnen 3 s. */
  swarmWindowMs: number;
  swarmBonusPct: number;
  /** Bonus für Rundenrekord bei wichtigem Treffer. */
  recordHitBonusPct: number;
}

export const DEFAULT_SCORE_CONFIG: ScoreConfig = {
  comboStart: 5,
  comboMaxMultiplier: 8,
  comboStepPerFive: 0.5,
  perfectHitBonusPct: 100,
  streakEvery: 10,
  streakBonusPct: 15,
  longshotMinDepth: 0.62,
  longshotBonusPct: 40,
  trickshotBonusPct: 75,
  multikillWindowMs: 350,
  multikillBonusPer: 60,
  swarmWindowMs: 3000,
  swarmBonusPct: 120,
  recordHitBonusPct: 50,
};

export interface ScoreInput {
  /** Basiswert des Ziels. */
  base: number;
  /** Normierte Geschwindigkeit des Ziels (0..1, 1 = schnell). */
  speedNorm: number;
  /** Tiefe 0.5..1.5 (1.0 Referenz). */
  depth: number;
  /** Normierte Zielgröße (0.6 klein .. 1.4 groß); kleinere Ziele mehr Punkte. */
  sizeNorm: number;
  /** Präzision: 0 (Kante) .. 1 (genau Mitte). */
  precision: number;
  combo: number;
  /** Treffer in Folge ohne Fehlschuss. */
  streak: number;
  /** Aktiver Eventmultiplikator (1.0 = keiner). */
  eventMultiplier: number;
  /** Zeitfaktor: 1.0 normal, zuletzt erhöhter Wert. */
  timeFactor: number;
  /** War der Treffer Teil eines Multikills? */
  multikillCount: number;
  /** War es ein Schwarmkomplettbonus? */
  swarmBonus: boolean;
  /** Trickshot? */
  trickshot: boolean;
  /** Treffer auf neuen persönlichen Rekord? */
  recordHit: boolean;
  config: ScoreConfig;
}

export function comboMultiplier(combo: number, config: ScoreConfig = DEFAULT_SCORE_CONFIG): number {
  if (combo < config.comboStart) return 1;
  const steps = Math.floor((combo - config.comboStart) / 5) + 1;
  const mult = 1.25 + steps * config.comboStepPerFive;
  return Math.min(mult, config.comboMaxMultiplier);
}

export function precisionBonusFn(precision: number): number {
  // Quadratische Kurve: Mitte zählt doppelt so viel wie die Kante.
  return precision * precision;
}

export function isPerfectHit(precision: number): boolean {
  return precision >= 0.72;
}

export function computeScore(input: ScoreInput): ScoreBreakdown {
  const c = input.config;

  const base = input.base;
  const speedFactor = 1 + input.speedNorm * 0.5; // bis +50 %
  const depthFactor = 1 + Math.max(0, 1.15 - input.depth) * 0.9; // +bis 135 % bei 0.5
  const sizeFactor = 1 + Math.max(0, 1.05 - input.sizeNorm) * 0.7; // kleine Ziele mehr
  let precisionBonusVal = base * precisionBonusFn(input.precision) * (c.perfectHitBonusPct / 100) * 0.5;
  const perfect = isPerfectHit(input.precision);
  if (perfect) precisionBonusVal += base * (c.perfectHitBonusPct / 100) * 0.5;

  const comboMult = comboMultiplier(input.combo, c);
  const eventMultiplier = input.eventMultiplier;
  const timeFactor = input.timeFactor;

  let streakBonus = 0;
  if (input.streak > 0 && input.streak % c.streakEvery === 0) {
    streakBonus = base * (c.streakBonusPct / 100);
  }

  let longshotBonus = 0;
  if (input.depth <= c.longshotMinDepth) {
    longshotBonus = base * (c.longshotBonusPct / 100) * (1 - input.depth);
  }

  const trickshotBonus = input.trickshot ? base * (c.trickshotBonusPct / 100) : 0;
  const multikillBonus = Math.max(0, input.multikillCount - 1) * c.multikillBonusPer;
  const swarmBonus = input.swarmBonus ? base * (c.swarmBonusPct / 100) : 0;
  const recordBonus = input.recordHit ? base * (c.recordHitBonusPct / 100) : 0;

  const subtotal =
    base * speedFactor * depthFactor * sizeFactor + precisionBonusVal + streakBonus + longshotBonus;
  const scaled = subtotal * comboMult * eventMultiplier * timeFactor;
  const total = Math.round(scaled + trickshotBonus + multikillBonus + swarmBonus + recordBonus);

  return {
    base,
    speedFactor: round2(speedFactor),
    depthFactor: round2(depthFactor),
    sizeFactor: round2(sizeFactor),
    precisionBonus: Math.round(precisionBonusVal),
    comboMultiplier: round2(comboMult),
    eventMultiplier: round2(eventMultiplier),
    streakBonus: Math.round(streakBonus),
    longshotBonus: Math.round(longshotBonus),
    trickshotBonus: Math.round(trickshotBonus),
    multikillBonus,
    swarmBonus: Math.round(swarmBonus),
    total,
    isPerfect: perfect,
    isRecordHit: input.recordHit,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Rangbewertung D..SSS aus Trefferquote, perfekter Trefferquote und Bonus-
 *anteil. Performance liegt in [0..1].
 */
export function computeRank(args: {
  score: number;
  parScore: number;
  accuracy: number;
  perfectRatio: number;
  maxCombo: number;
}): RankResult {
  const scorePart = clamp01(args.score / args.parScore);
  const accPart = clamp01(args.accuracy);
  const perfectPart = clamp01(args.perfectRatio * 2); // 50 % Perfect = 1.0
  const comboPart = clamp01(args.maxCombo / 25);

  const performance =
    0.45 * scorePart + 0.3 * accPart + 0.15 * perfectPart + 0.1 * comboPart;

  let grade: RankGrade = 'D';
  if (performance >= 0.92) grade = 'SSS';
  else if (performance >= 0.8) grade = 'SS';
  else if (performance >= 0.66) grade = 'S';
  else if (performance >= 0.5) grade = 'A';
  else if (performance >= 0.36) grade = 'B';
  else if (performance >= 0.2) grade = 'C';
  return { grade, performance: round2(performance) };
}

export const RANK_ORDER: RankGrade[] = ['D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];

export function rankAtLeast(actual: RankGrade, min: RankGrade): boolean {
  return RANK_ORDER.indexOf(actual) >= RANK_ORDER.indexOf(min);
}

export function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

export function accuracyOf(shots: number, hits: number): number {
  if (shots <= 0) return 0;
  return hits / shots;
}

/** Durchschnittliche Reaktionszeit (Spawn -> Treffer) in ms. */
export function avgReaction(reactionTimesMs: number[]): number {
  if (reactionTimesMs.length === 0) return 0;
  const sum = reactionTimesMs.reduce((a, b) => a + b, 0);
  return Math.round(sum / reactionTimesMs.length);
}

/** Formatierung von Zielwerten (lokalisiert über UI). */
export function formatScore(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
