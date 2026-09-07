import { describe, it, expect } from 'vitest';
import { computeRank, accuracy, compareRank, rankIndex } from '../src/core/rank';

describe('rank', () => {
  it('accuracy is 0..1 and 0 when no shots', () => {
    expect(accuracy(0, 0)).toBe(0);
    expect(accuracy(5, 10)).toBe(0.5);
    expect(accuracy(3, 3)).toBe(1);
  });

  it('ranks are totally ordered', () => {
    expect(rankIndex('D')).toBeLessThan(rankIndex('C'));
    expect(rankIndex('C')).toBeLessThan(rankIndex('S'));
    expect(rankIndex('S')).toBeLessThan(rankIndex('SS'));
    expect(rankIndex('SS')).toBeLessThan(rankIndex('SSS'));
    expect(compareRank('A', 'S')).toBeLessThan(0);
    expect(compareRank('SSS', 'D')).toBeGreaterThan(0);
  });

  it('a very weak round is D', () => {
    const r = computeRank({ score: 0, accuracy: 0, maxCombo: 0, perfectHits: 0, mode: 'classic' });
    expect(r).toBe('D');
  });

  it('a strong round is S or better', () => {
    const r = computeRank({ score: 12000, accuracy: 0.9, maxCombo: 30, perfectHits: 20, mode: 'classic' });
    expect(['S', 'SS', 'SSS']).toContain(r);
  });

  it('higher inputs never produce a lower rank', () => {
    const weak = computeRank({ score: 500, accuracy: 0.2, maxCombo: 2, perfectHits: 0, mode: 'blitz' });
    const strong = computeRank({ score: 9000, accuracy: 0.85, maxCombo: 25, perfectHits: 12, mode: 'blitz' });
    expect(rankIndex(strong)).toBeGreaterThanOrEqual(rankIndex(weak));
  });
});
