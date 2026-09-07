/**
 * Rang-Tests: computeRank D..SSS inkl. Grenzfällen.
 */
import { describe, it, expect } from 'vitest';
import { computeRank } from '../src/core/scoring';

function rank(args: Partial<{
  score: number;
  parScore: number;
  accuracy: number;
  perfectRatio: number;
  maxCombo: number;
}>) {
  return computeRank({
    score: args.score ?? 0,
    parScore: args.parScore ?? 10000,
    accuracy: args.accuracy ?? 0,
    perfectRatio: args.perfectRatio ?? 0,
    maxCombo: args.maxCombo ?? 0,
  });
}

describe('computeRank', () => {
  it('sehr schwache Runde = D', () => {
    expect(rank({}).grade).toBe('D');
  });

  it('perfekte Runde = SSS', () => {
    const r = rank({
      score: 12000,
      parScore: 10000,
      accuracy: 1,
      perfectRatio: 0.8,
      maxCombo: 30,
    });
    expect(r.grade).toBe('SSS');
    expect(r.performance).toBe(1);
  });

  it('Performance ist gewichtet und in [0, 1]', () => {
    const r = rank({ score: 5000, parScore: 10000, accuracy: 0.5, perfectRatio: 0.5, maxCombo: 10 });
    // 0.45*0.5 + 0.3*0.5 + 0.15*1.0 + 0.1*0.4 = 0.565 -> round2 -> 0.57
    expect(r.performance).toBe(0.57);
    expect(r.performance).toBeGreaterThanOrEqual(0);
    expect(r.performance).toBeLessThanOrEqual(1);
  });

  it('Werte über 1 werden geclamped (keine Performance > 1)', () => {
    const r = rank({ score: 99999, parScore: 100, accuracy: 5, perfectRatio: 9, maxCombo: 999 });
    expect(r.performance).toBe(1);
    expect(r.grade).toBe('SSS');
  });

  it('Grenzverläufe: jede Stufe ist exakt erreichbar', () => {
    // Alle vier Performance-Teile auf denselben Wert v setzen ->
    // performance = 0.45v + 0.3v + 0.15v + 0.1v = v
    const vMap: Record<string, number> = {
      D: 0.1, // < 0.2
      C: 0.25, // 0.2 .. 0.36
      B: 0.4, // 0.36 .. 0.5
      A: 0.55, // 0.5 .. 0.66
      S: 0.7, // 0.66 .. 0.8
      SS: 0.85, // 0.8 .. 0.92
      SSS: 0.95, // >= 0.92
    };
    for (const [g, v] of Object.entries(vMap)) {
      const r = rank({
        score: v * 10000,
        parScore: 10000,
        accuracy: v,
        perfectRatio: v / 2, // *2 -> v
        maxCombo: v * 25, // /25 -> v
      });
      expect(r.performance).toBeCloseTo(v, 3);
      expect(r.grade).toBe(g);
    }
  });

  it('SSS erfordert performance >= 0.92', () => {
    expect(rank({ score: 10000, parScore: 10000, accuracy: 0.7, perfectRatio: 0.4, maxCombo: 8 }).grade).not.toBe('SSS');
  });
});
