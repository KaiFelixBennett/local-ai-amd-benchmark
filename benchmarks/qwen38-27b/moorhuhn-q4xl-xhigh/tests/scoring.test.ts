/**
 * Scoring-Tests: Punkteberechnung, Combo-Multiplikator, Präzision,
 * Formateierung und Rang-Nutzfunktionen.
 */
import { describe, it, expect } from 'vitest';
import {
  computeScore,
  comboMultiplier,
  precisionBonusFn,
  isPerfectHit,
  accuracyOf,
  avgReaction,
  formatScore,
  rankAtLeast,
  RANK_ORDER,
  DEFAULT_SCORE_CONFIG,
  type ScoreInput,
} from '../src/core/scoring';

function input(over: Partial<ScoreInput> = {}): ScoreInput {
  return {
    base: 100,
    speedNorm: 0,
    depth: 1.0,
    sizeNorm: 1.0,
    precision: 0,
    combo: 0,
    streak: 0,
    eventMultiplier: 1,
    timeFactor: 1,
    multikillCount: 0,
    swarmBonus: false,
    trickshot: false,
    recordHit: false,
    config: DEFAULT_SCORE_CONFIG,
    ...over,
  };
}

describe('computeScore', () => {
  it('liefert einen Basiswert mit Tiefen-/Größenfaktor', () => {
    const r = computeScore(input());
    expect(r.total).toBe(117);
    expect(r.isPerfect).toBe(false);
  });

  it('Perfect-Mitten-Treffer scoret deutlich mehr und wird geflaggt', () => {
    const r = computeScore(input({ precision: 1 }));
    expect(r.isPerfect).toBe(true);
    // 117.47 Basis + 100 Präzisionsbonus = 217.47 -> 217
    expect(r.total).toBe(217);
  });

  it('höhere Präzision erhöht die Punkte', () => {
    const a = computeScore(input({ precision: 0.3 })).total;
    const b = computeScore(input({ precision: 1 })).total;
    expect(b).toBeGreaterThan(a);
  });

  it('Combo erhöht die Punkte', () => {
    const a = computeScore(input({ combo: 0 })).total;
    const b = computeScore(input({ combo: 20 })).total;
    expect(b).toBeGreaterThan(a);
  });

  it('Multikill addiert einen festen Bonus pro zusätzlichem Treffer', () => {
    const base = computeScore(input()).total;
    const mk = computeScore(input({ multikillCount: 3 })).total;
    expect(mk - base).toBe(120); // (3-1) * 60
  });

  it('Trickshot addiert einen prozentualen Bonus', () => {
    const trick = computeScore(input({ trickshot: true })).total;
    const without = computeScore(input()).total;
    expect(trick).toBe(without + 75); // 100 * 75 %
  });

  it('Event-Multiplikator skaliert den Gesamtwert', () => {
    const a = computeScore(input()).total;
    const b = computeScore(input({ eventMultiplier: 2 })).total;
    expect(b).toBeGreaterThan(a);
  });

  it('Longshot-Bonus greift nur bei geringer Tiefe', () => {
    const near = computeScore(input({ depth: 1.2 })).longshotBonus;
    const far = computeScore(input({ depth: 0.5 })).longshotBonus;
    expect(near).toBe(0);
    expect(far).toBeGreaterThan(0);
  });
});

describe('comboMultiplier', () => {
  it('unterhalb der Schwelle = 1', () => {
    expect(comboMultiplier(4)).toBe(1);
    expect(comboMultiplier(0)).toBe(1);
  });

  it('steigt alle 5 Combo-Schritte', () => {
    expect(comboMultiplier(5)).toBe(1.75);
    expect(comboMultiplier(10)).toBe(2.25);
    expect(comboMultiplier(50)).toBe(6.25);
  });

  it('ist oben durch comboMaxMultiplier gedeckelt', () => {
    expect(comboMultiplier(100)).toBe(DEFAULT_SCORE_CONFIG.comboMaxMultiplier);
  });
});

describe('Präzision', () => {
  it('isPerfectHit-Schwelle bei 0.72', () => {
    expect(isPerfectHit(0.72)).toBe(true);
    expect(isPerfectHit(0.71)).toBe(false);
    expect(isPerfectHit(1)).toBe(true);
  });

  it('precisionBonusFn ist monoton und bei 0 null', () => {
    expect(precisionBonusFn(0)).toBe(0);
    expect(precisionBonusFn(1)).toBeGreaterThan(precisionBonusFn(0.5));
  });
});

describe('Hilfsfunktionen', () => {
  it('accuracyOf', () => {
    expect(accuracyOf(20, 10)).toBe(0.5);
    expect(accuracyOf(0, 0)).toBe(0);
  });

  it('avgReaction', () => {
    expect(avgReaction([100, 300])).toBe(200);
    expect(avgReaction([])).toBe(0);
  });

  it('formatScore trennt Tausender mit Punkt', () => {
    expect(formatScore(1000000)).toBe('1.000.000');
    expect(formatScore(1234)).toBe('1.234');
    expect(formatScore(999)).toBe('999');
  });

  it('RANK_ORDER steigt von D bis SSS', () => {
    expect(RANK_ORDER[0]).toBe('D');
    expect(RANK_ORDER[RANK_ORDER.length - 1]).toBe('SSS');
  });

  it('rankAtLeast', () => {
    expect(rankAtLeast('S', 'A')).toBe(true);
    expect(rankAtLeast('B', 'S')).toBe(false);
    expect(rankAtLeast('SSS', 'SSS')).toBe(true);
  });
});
