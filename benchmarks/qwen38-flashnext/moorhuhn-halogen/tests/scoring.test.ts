import { describe, expect, it } from 'vitest';
import {
  RANK_ORDER,
  comboBonusForThreshold,
  comboMultiplier,
  computeHit,
  ellipseDistance,
  isInsideHitbox,
  isPerfect,
  perfectStreakBonus,
  pointsToNextRank,
  rankForScore,
} from '../src/logic/scoring';
import { createRng } from '../src/core/rng';
import type { HitParams } from '../src/types';

function params(overrides: Partial<HitParams> = {}): HitParams {
  return {
    targetId: 'moorflatterer',
    basePoints: 100,
    x: 0,
    y: 0,
    cx: 0,
    cy: 0,
    rx: 100,
    ry: 50,
    innerRx: 45,
    innerRy: 22.5,
    speed: 220,
    depth: 1,
    timeLeft: 100,
    combo: 0,
    perfectStreak: 0,
    eventMultiplier: 1,
    swarmBonus: false,
    trickshot: false,
    longshot: false,
    runPerfectHits: 0,
    comboBonusThresholds: [5, 10, 15, 20],
    rng: createRng(1),
    ...overrides,
  };
}

describe('ellipse geometry', () => {
  it('ellipseDistance: 0 at center, 1 on the axes, >1 outside', () => {
    expect(ellipseDistance(0, 0, 0, 0, 100, 50)).toBe(0);
    expect(ellipseDistance(100, 0, 0, 0, 100, 50)).toBeCloseTo(1, 9);
    expect(ellipseDistance(0, 50, 0, 0, 100, 50)).toBeCloseTo(1, 9);
    expect(ellipseDistance(200, 0, 0, 0, 100, 50)).toBeCloseTo(2, 9);
    expect(ellipseDistance(50, 25, 0, 0, 100, 50)).toBeCloseTo(Math.SQRT2 / 2, 9);
  });

  it('degenerate radii report distance 1 (edge boundary)', () => {
    expect(ellipseDistance(0, 0, 0, 0, 0, 50)).toBe(1);
    expect(ellipseDistance(0, 0, 0, 0, 100, -1)).toBe(1);
  });

  it('isInsideHitbox / isPerfect', () => {
    expect(isInsideHitbox(90, 0, 0, 0, 100, 50)).toBe(true);
    expect(isInsideHitbox(110, 0, 0, 0, 100, 50)).toBe(false);
    expect(isPerfect(0, 0, 0, 0, 45, 22)).toBe(true);
    expect(isPerfect(50, 0, 0, 0, 45, 22)).toBe(false);
  });
});

describe('multipliers', () => {
  it('comboMultiplier: linear then hot-zone then cap', () => {
    expect(comboMultiplier(0)).toBe(1);
    expect(comboMultiplier(5)).toBeCloseTo(1.5, 5);
    expect(comboMultiplier(10)).toBeCloseTo(2.0, 5);
    // combo 20: base 3.0 + hot (10 * 0.012 * 10 = 1.2) = 4.2
    expect(comboMultiplier(20)).toBeCloseTo(4.2, 5);
    // huge combos clamp at 9.9
    expect(comboMultiplier(1000)).toBe(9.9);
    // monotonic growth
    let prev = 1;
    for (let c = 1; c <= 60; c++) {
      const m = comboMultiplier(c);
      expect(m).toBeGreaterThanOrEqual(prev);
      prev = m;
    }
  });

  it('comboBonusForThreshold uses the 250-point step', () => {
    expect(comboBonusForThreshold(5)).toBe(1250);
    expect(comboBonusForThreshold(10)).toBe(2500);
  });

  it('perfectStreakBonus starts at streak 2', () => {
    expect(perfectStreakBonus(0)).toBe(0);
    expect(perfectStreakBonus(1)).toBe(0);
    expect(perfectStreakBonus(2)).toBe(240); // 200*1*1.2
    expect(perfectStreakBonus(3)).toBe(520); // 200*2*1.3
    expect(perfectStreakBonus(5)).toBe(1200); // 200*4*1.5
  });
});

describe('computeHit', () => {
  it('dead-center perfect shot: precision 1.5 × perfect kick 1.15', () => {
    const r = computeHit(params());
    expect(r.perfect).toBe(true);
    expect(r.precisionMult).toBeCloseTo(1.5, 9);
    expect(r.total).toBe(Math.round(100 * 1.5 * 1.15)); // 173
  });

  it('edge hit has precision 1 and is not perfect', () => {
    const r = computeHit(params({ x: 100 }));
    expect(r.perfect).toBe(false);
    expect(r.precisionMult).toBeCloseTo(1.0, 9);
    expect(r.precision).toBeCloseTo(0, 9);
    expect(r.total).toBe(100);
  });

  it('mid-range precision tapers between perfect and edge', () => {
    const mid = computeHit(params({ x: 50, innerRx: 0, innerRy: 0 }));
    expect(mid.precisionMult).toBeGreaterThan(1.05);
    expect(mid.precisionMult).toBeLessThan(1.35);
  });

  it('speed multiplier: 1.0 at reference speed, capped at 2.0', () => {
    expect(computeHit(params({ speed: 220, innerRx: 0, innerRy: 0 })).speedMult).toBeCloseTo(1, 9);
    expect(computeHit(params({ speed: 440, innerRx: 0, innerRy: 0 })).speedMult).toBeCloseTo(1.4, 9);
    expect(computeHit(params({ speed: 2000, innerRx: 0, innerRy: 0 })).speedMult).toBe(2.0);
    // slow targets floor at 1.0
    expect(computeHit(params({ speed: 50, innerRx: 0, innerRy: 0 })).speedMult).toBe(1.0);
  });

  it('depth scoring off means depthMult 1; on scales with clamp', () => {
    expect(computeHit(params({ depth: 1.6 })).depthMult).toBe(1);
    const withDepth = computeHit(params({ depth: 1.6, depthScoring: true }));
    expect(withDepth.depthMult).toBe(1.6);
    // 0.75 + 0.55*0.1 = 0.805 → clamped up to 0.85
    expect(computeHit(params({ depth: 0.1, depthScoring: true })).depthMult).toBe(0.85);
  });

  it('late-round time bonus: kicks in under 30s, capped at 1.35', () => {
    expect(computeHit(params({ timeLeft: 45 })).timeBonusMult).toBe(1);
    // 10s left → missing 20 → 1 + 20/2*0.01 = 1.1
    expect(computeHit(params({ timeLeft: 10 })).timeBonusMult).toBeCloseTo(1.1, 9);
    // 0s left → missing 30 → 1.15; far past zero still caps at 1.35
    expect(computeHit(params({ timeLeft: 0 })).timeBonusMult).toBeCloseTo(1.15, 9);
    expect(computeHit(params({ timeLeft: -500 })).timeBonusMult).toBe(1.35);
  });

  it('event multiplier below 1 is floored at 1', () => {
    expect(computeHit(params({ eventMultiplier: 0.2 })).eventMult).toBe(1);
    expect(computeHit(params({ eventMultiplier: 2 })).eventMult).toBe(2);
  });

  it('combo multiplies into the total and threshold bonus is added once', () => {
    const r = computeHit(params({ x: 100, combo: 10 }));
    expect(r.comboMult).toBeCloseTo(2, 5);
    expect(r.comboBonus).toBe(2500);
    // 100 * 2 (combo) + 2500 = 2700
    expect(r.total).toBe(2700);
  });

  it('combo between thresholds gets no threshold bonus', () => {
    const r = computeHit(params({ x: 100, combo: 9 }));
    expect(r.comboBonus).toBe(0);
  });

  it('swarm bonus formula: 30% + 200', () => {
    const r = computeHit(params({ x: 100, swarmBonus: true }));
    expect(r.swarmBonus).toBe(Math.round(100 * 0.3 + 200));
    expect(r.total).toBe(100 + r.swarmBonus);
  });

  it('perfect streak bonus requires perfect hits with streak >= 2', () => {
    const r = computeHit(params({ perfectStreak: 3 }));
    expect(r.perfect).toBe(true);
    expect(r.perfectStreakBonus).toBe(520);
    // perfect hits carry the ×1.15 kick (applied before the additive streak bonus):
    // 100 base × 1.5 precision × 1.15 + 520 streak = 692.5 → 693
    expect(r.total).toBe(Math.round(100 * 1.5 * 1.15 + 520));
    const nonPerfect = computeHit(params({ x: 100, perfectStreak: 3 }));
    expect(nonPerfect.perfect).toBe(false);
    expect(nonPerfect.perfectStreakBonus).toBe(0);
    expect(nonPerfect.total).toBe(100);
  });

  it('longshot and trickshot multiply the running total', () => {
    const ls = computeHit(params({ x: 100, longshot: true }));
    expect(ls.total).toBe(140);
    const ts = computeHit(params({ x: 100, trickshot: true }));
    expect(ts.total).toBe(180);
    const both = computeHit(params({ x: 100, longshot: true, trickshot: true }));
    expect(both.total).toBe(Math.round(100 * 1.4 * 1.8)); // 252
  });

  it('never scores below 1', () => {
    const r = computeHit(params({ basePoints: 0, innerRx: 0, innerRy: 0, x: 100 }));
    expect(r.total).toBeGreaterThanOrEqual(1);
  });

  it('is deterministic for identical inputs', () => {
    const a = computeHit(params({ combo: 13 }));
    const b = computeHit(params({ combo: 13 }));
    expect(a).toEqual(b);
  });

  it('labels include every applied bonus', () => {
    const r = computeHit(
      params({
        speed: 440,
        depthScoring: true,
        depth: 1.2,
        combo: 5,
        timeLeft: 10,
        eventMultiplier: 2,
        perfectStreak: 2,
        swarmBonus: true,
      }),
    );
    for (const l of [
      'hit.breakdown.speed',
      'hit.breakdown.depth',
      'hit.breakdown.precision',
      'hit.breakdown.combo',
      'hit.breakdown.time',
      'hit.breakdown.event',
      'hit.breakdown.swarm',
      'hit.breakdown.streak',
    ]) {
      expect(r.labels).toContain(l);
    }
    expect(r.labels).toContain('hit.perfect');
  });

  it('plain baseline hit has minimal labels', () => {
    const r = computeHit(params({ innerRx: 0, innerRy: 0, x: 100 }));
    expect(r.labels).toEqual([]);
  });
});

describe('ranks', () => {
  it('thresholds at score mult 1', () => {
    expect(rankForScore(3999, 1)).toBe('D');
    expect(rankForScore(4000, 1)).toBe('C');
    expect(rankForScore(9000, 1)).toBe('B');
    expect(rankForScore(16000, 1)).toBe('A');
    expect(rankForScore(26000, 1)).toBe('S');
    expect(rankForScore(40000, 1)).toBe('SS');
    expect(rankForScore(60000, 1)).toBe('SSS');
  });

  it('high scoreMult compresses rank scaling (blitz harder per point)', () => {
    const scale = 1 / Math.sqrt(1.6);
    expect(rankForScore(4000, 1.6)).toBe('D');
    expect(rankForScore(Math.ceil(4000 / scale), 1.6)).toBe('C');
  });

  it('scoreMult below 1 eases thresholds (scaled score grows per point)', () => {
    // scale = 1 / max(0.8, sqrt(0.8)) ≈ 1.118 → C needs score ≥ 4000/scale ≈ 3577.7
    expect(rankForScore(3570, 0.8)).toBe('D');
    expect(rankForScore(3580, 0.8)).toBe('C');
  });

  it('pointsToNextRank', () => {
    expect(pointsToNextRank(3999, 1)).toEqual({ rank: 'C', points: 1 });
    expect(pointsToNextRank(4000, 1)).toEqual({ rank: 'B', points: 5000 });
    expect(pointsToNextRank(9000, 1)).toEqual({ rank: 'A', points: 7000 });
    expect(pointsToNextRank(60000, 1)).toEqual({ rank: 'SSS', points: 0 });
  });

  it('RANK_ORDER is ordered lowest to highest', () => {
    expect(RANK_ORDER).toEqual(['D', 'C', 'B', 'A', 'S', 'SS', 'SSS']);
  });
});
