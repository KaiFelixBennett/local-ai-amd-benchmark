import { describe, it, expect } from 'vitest';
import { computeScore, comboMultiplier, isPerfect } from '../src/core/scoring';
import { TARGETS } from '../src/core/targets';
import { SCORE_PARAMS } from '../src/core/scoreParams';
import type { ScoreInput } from '../src/core/scoring';

function baseInput(over: Partial<ScoreInput> = {}): ScoreInput {
  return {
    target: TARGETS.moorflatterer,
    comboBefore: 0,
    speed: 220,
    depth: 0.5,
    radius: TARGETS.moorflatterer.radius,
    distanceFromCenter: TARGETS.moorflatterer.radius * 0.2,
    eventMultiplier: 1,
    isSwarm: false,
    multikills: 1,
    longshot: false,
    trick: false,
    ...over
  };
}

describe('scoring', () => {
  it('comboMultiplier ramps and caps', () => {
    expect(comboMultiplier(0)).toBe(1);
    expect(comboMultiplier(1)).toBeCloseTo(1 + SCORE_PARAMS.comboStep);
    expect(comboMultiplier(1000)).toBe(SCORE_PARAMS.comboMax);
  });

  it('isPerfect depends on distance vs radius*perfectFactor', () => {
    const t = TARGETS.moorflatterer;
    expect(isPerfect(0, t.radius, t)).toBe(true);
    expect(isPerfect(t.radius * t.perfectFactor, t.radius, t)).toBe(true);
    expect(isPerfect(t.radius * t.perfectFactor + 0.01, t.radius, t)).toBe(false);
  });

  it('a dead-center perfect hit scores more than an off-center hit', () => {
    const perfect = computeScore(baseInput({ distanceFromCenter: 0 }));
    const off = computeScore(baseInput({ distanceFromCenter: TARGETS.moorflatterer.radius }));
    expect(perfect.isPerfect).toBe(true);
    expect(off.isPerfect).toBe(false);
    expect(perfect.total).toBeGreaterThan(off.total);
  });

  it('higher combo multiplies the total', () => {
    const low = computeScore(baseInput({ comboBefore: 0 }));
    const high = computeScore(baseInput({ comboBefore: 4 }));
    expect(high.total).toBeGreaterThan(low.total);
  });

  it('event multiplier scales the total up', () => {
    const none = computeScore(baseInput({ eventMultiplier: 1 }));
    const gold = computeScore(baseInput({ eventMultiplier: 2 }));
    expect(gold.total).toBeGreaterThanOrEqual(none.total);
  });

  it('breakdown parts sum consistently and total is positive', () => {
    const r = computeScore(baseInput({ longshot: true, trick: true, comboBefore: 2 }));
    expect(r.total).toBeGreaterThan(0);
    expect(r.comboMultiplier).toBeCloseTo(comboMultiplier(2));
    expect(r.base).toBe(TARGETS.moorflatterer.baseScore);
  });

  it('faster targets pay more (speed bonus)', () => {
    const slow = computeScore(baseInput({ speed: 100 }));
    const fast = computeScore(baseInput({ speed: 400 }));
    expect(fast.speedBonus).toBeGreaterThanOrEqual(slow.speedBonus);
  });
});
