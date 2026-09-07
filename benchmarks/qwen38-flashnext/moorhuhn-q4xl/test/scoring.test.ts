import { describe, expect, it } from 'vitest';
import {
  computeShotScore,
  isLongshot,
  isPrecision,
  multikillBonus,
  parScore,
  rankAtLeast,
  rankFor,
  precisionFactor,
  SCORE_CFG,
} from '../src/game/scoring';
import { shotInfo } from './helpers';

describe('computeShotScore', () => {
  it('returns an all-zero breakdown for a non-positive base', () => {
    const out = computeShotScore(shotInfo(), 0);
    expect(out.total).toBe(0);
    expect(out.base).toBe(0);
    expect(out.bonus).toBe(0);
    expect(out.perfect).toBe(false);
  });

  it('is deterministic: identical input yields identical output', () => {
    const info = shotInfo({ comboHits: 7, depth: 0.8, speed: 540 });
    const a = computeShotScore(info, 120);
    const b = computeShotScore(info, 120);
    expect(a).toEqual(b);
  });

  it('total matches the documented formula for a neutral shot', () => {
    // Neutral: speed 0 -> sp 1.0, depth 0 -> dp 1.0, sizeScale 1.2 -> sz 1.0,
    // precision <= 1 -> pr 0, combo 0 -> cb 1, timeLeft < 0 -> tm 1, event 1.
    const out = computeShotScore(
      shotInfo({ speed: 0, depth: 0, sizeScale: 1.2, precision: 1, timeLeft: -1 }),
      100,
    );
    expect(out.total).toBe(100);
    expect(out.bonus).toBe(0);
  });

  it('perfect adds exactly the flat bonus on top of the multiplier total', () => {
    const base = 100;
    const plain = computeShotScore(shotInfo(), base);
    const perfect = computeShotScore(shotInfo({ perfect: true }), base);
    expect(perfect.total - plain.total).toBe(SCORE_CFG.perfectBonus);
    expect(perfect.perfect).toBe(true);
  });

  it('longshot / trickshot / swarm add their flat bonuses', () => {
    const base = 100;
    const plain = computeShotScore(shotInfo(), base);
    expect(computeShotScore(shotInfo({ longshot: true }), base).total - plain.total).toBe(
      SCORE_CFG.longshotBonus,
    );
    expect(computeShotScore(shotInfo({ trickshot: true }), base).total - plain.total).toBe(
      SCORE_CFG.trickshotBonus,
    );
    expect(computeShotScore(shotInfo({ swarmBonus: true }), base).total - plain.total).toBe(
      SCORE_CFG.swarmBonus,
    );
  });

  it('stacks all flat bonuses', () => {
    const out = computeShotScore(
      shotInfo({ perfect: true, longshot: true, trickshot: true, swarmBonus: true }),
      100,
    );
    expect(out.bonus).toBe(55 + 250 + 500 + 900);
  });

  it('endless (timeLeft -1) uses a neutral time multiplier, finite time rewards urgency', () => {
    const neutral = { speed: 0, depth: 0, sizeScale: 1.2, timeLeft: -1 };
    const endless = computeShotScore(shotInfo(neutral), 100);
    expect(endless.total).toBe(100);
    expect(endless.time).toBe(0);
    // 120s+ left saturates the end-time bonus range at 1.35
    const early = computeShotScore(shotInfo({ ...neutral, timeLeft: 120 }), 100);
    expect(early.total).toBe(Math.round(100 * 1.35));
    expect(early.total).toBeGreaterThan(endless.total);
  });

  it('rewards faster, nearer, smaller targets monotonically', () => {
    const slow = computeShotScore(shotInfo({ speed: 100 }), 100).total;
    const fast = computeShotScore(shotInfo({ speed: 700 }), 100).total;
    expect(fast).toBeGreaterThan(slow);

    const far = computeShotScore(shotInfo({ depth: 0 }), 100).total;
    const near = computeShotScore(shotInfo({ depth: 1 }), 100).total;
    expect(near).toBeGreaterThan(far);

    const big = computeShotScore(shotInfo({ sizeScale: 1.2 }), 100).total;
    const small = computeShotScore(shotInfo({ sizeScale: 0.5 }), 100).total;
    expect(small).toBeGreaterThan(big);
  });

  it('combo multiplier grows +12% per hit and caps at 4x', () => {
    const mid = computeShotScore(shotInfo({ comboHits: 10 }), 100);
    // reported combo-bonus share = base * (cb - 1) with cb = 1 + 10*0.12 = 2.2
    expect(mid.combo).toBe(Math.round(100 * 1.2));
    const capped = computeShotScore(shotInfo({ comboHits: 50 }), 100);
    const atCap = computeShotScore(shotInfo({ comboHits: 25 }), 100); // exactly 4.0
    expect(capped.total).toBe(atCap.total);
    expect(capped.combo).toBe(Math.round(100 * 3)); // clamped at cb 4
  });

  it('kindBonusDepthPoints amplify the depth factor', () => {
    const plain = computeShotScore(shotInfo({ depth: 1 }), 100).total;
    const boosted = computeShotScore(
      shotInfo({ depth: 1, kindBonusDepthPoints: 0.5 }),
      100,
    ).total;
    expect(boosted).toBeGreaterThan(plain);
  });

  it('event multiplier below 0.25 is floored at 0.25', () => {
    const floored = computeShotScore(shotInfo({ eventMultiplier: 0.05 }), 100);
    const exact = computeShotScore(shotInfo({ eventMultiplier: 0.25 }), 100);
    expect(floored.total).toBe(exact.total);
  });

  it('total never drops below 1 for tiny bases', () => {
    const out = computeShotScore(shotInfo({ depth: 0, speed: 0, sizeScale: 1.2 }), 1);
    expect(out.total).toBeGreaterThanOrEqual(1);
  });
});

describe('precision helpers', () => {
  it('isPrecision compares against the config ratio', () => {
    expect(isPrecision(0.1, { perfectRatio: 0.25 })).toBe(true);
    expect(isPrecision(0.3, { perfectRatio: 0.25 })).toBe(false);
  });

  it('precisionFactor falls off linearly, never negative', () => {
    expect(precisionFactor(0)).toBeCloseTo(SCORE_CFG.precisionBonusMax);
    expect(precisionFactor(1)).toBeCloseTo(SCORE_CFG.precisionBonusMax * 0.5);
    expect(precisionFactor(5)).toBeCloseTo(SCORE_CFG.precisionBonusMax * 0.5); // clamped
  });
});

describe('isLongshot', () => {
  it('needs both speed and distance thresholds', () => {
    expect(isLongshot(620, 0.5)).toBe(true);
    expect(isLongshot(619.999, 0.5)).toBe(false);
    expect(isLongshot(700, 0.55)).toBe(false); // too near
    expect(isLongshot(700, 0.54)).toBe(true);
  });
});

describe('multikillBonus', () => {
  it('pays per EXTRA kill only', () => {
    expect(multikillBonus(0)).toBe(0);
    expect(multikillBonus(1)).toBe(0);
    expect(multikillBonus(2)).toBe(200);
    expect(multikillBonus(3)).toBe(400);
  });
});

describe('rankFor / parScore', () => {
  const par = 1000;
  const cases: [number, string][] = [
    [1000, 'SSS'],
    [990, 'SSS'],
    [989, 'SS'],
    [860, 'SS'],
    [859, 'S'],
    [720, 'S'],
    [719, 'A'],
    [560, 'A'],
    [559, 'B'],
    [400, 'B'],
    [399, 'C'],
    [240, 'C'],
    [239, 'D'],
    [0, 'D'],
  ];
  for (const [score, rank] of cases) {
    it(`score ${score}/${par} ranks ${rank}`, () => {
      expect(rankFor(score, par)).toBe(rank);
    });
  }

  it('guards against a zero par', () => {
    expect(rankFor(0, 0)).toBe('D');
    expect(rankFor(1, 0)).not.toBe(undefined);
  });

  it('parScore scales with duration and handles endless', () => {
    expect(parScore(90)).toBe(Math.round(90 * 95 + 90 * 90 * 0.42));
    expect(parScore(-1)).toBe(parScore(180)); // endless yardstick
    expect(parScore(120, 1.35)).toBe(Math.round((120 * 95 + 14400 * 0.42) * 1.35));
    expect(parScore(120, 0.1)).toBe(Math.round((120 * 95 + 14400 * 0.42) * 0.4)); // floor mult
  });

  it('rankAtLeast compares the ladder', () => {
    expect(rankAtLeast('S', 'A')).toBe(true);
    expect(rankAtLeast('S', 'S')).toBe(true);
    expect(rankAtLeast('A', 'S')).toBe(false);
    expect(rankAtLeast('SSS', 'D')).toBe(true);
  });
});
