/**
 * Daily-Challenge-Tests: Seed-Format, Reproduzierbarkeit über Seeds.
 */
import { describe, it, expect } from 'vitest';
import { Rng, dailyChallengeSeed, dayKey } from '../src/core/rng';
import { createPath, samplePath } from '../src/game/paths';

describe('dailyChallengeSeed', () => {
  it('hat das Format featherstorm-daily-YYYY-MM-DD', () => {
    const seed = dailyChallengeSeed(new Date(2026, 8, 1)); // Sep 1, 2026
    expect(seed).toBe('featherstorm-daily-2026-09-01');
  });

  it('monate und tage sind null-gesetzt', () => {
    const seed = dailyChallengeSeed(new Date(2026, 0, 7));
    expect(seed).toBe('featherstorm-daily-2026-01-07');
  });

  it('gleiche Tagesdaten -> identischer Seed', () => {
    expect(dailyChallengeSeed(new Date(2026, 8, 1, 0, 0, 0))).toBe(
      dailyChallengeSeed(new Date(2026, 8, 1, 23, 59, 59)),
    );
  });

  it('unterschiedliche Tage -> unterschiedlicher Seed', () => {
    expect(dailyChallengeSeed(new Date(2026, 8, 1))).not.toBe(dailyChallengeSeed(new Date(2026, 8, 2)));
  });
});

describe('dayKey', () => {
  it('liefert YYYY-MM-DD', () => {
    expect(dayKey(new Date(2026, 8, 1))).toBe('2026-09-01');
  });
});

describe('Daily-Reproduzierbarkeit', () => {
  it('gleicher Seed -> identische RNG-Sequenz und identische Flugbahnen', () => {
    const seed = dailyChallengeSeed(new Date(2026, 8, 1));
    const run = (): { seq: number[]; pos: { x: number; y: number } } => {
      const rng = new Rng(seed);
      const seq = [rng.next(), rng.next(), rng.next()];
      const path = createPath(rng, 'bezier', 1920, 1080, 1.0, 300);
      const sample = samplePath(path, 2.5, 1.0, 1920, 1080);
      return { seq, pos: sample.pos };
    };
    const a = run();
    const b = run();
    expect(a.seq).toEqual(b.seq);
    expect(a.pos.x).toBe(b.pos.x);
    expect(a.pos.y).toBe(b.pos.y);
  });

  it('unterschiedliche Tage -> unterschiedliche Bahnen', () => {
    const dayA = new Rng(dailyChallengeSeed(new Date(2026, 8, 1)));
    const dayB = new Rng(dailyChallengeSeed(new Date(2026, 8, 2)));
    const pA = createPath(dayA, 'sine', 1920, 1080, 1.0, 300);
    const pB = createPath(dayB, 'sine', 1920, 1080, 1.0, 300);
    const sA = samplePath(pA, 3, 1.0, 1920, 1080).pos;
    const sB = samplePath(pB, 3, 1.0, 1920, 1080).pos;
    expect(sA.x === sB.x && sA.y === sB.y).toBe(false);
  });
});
