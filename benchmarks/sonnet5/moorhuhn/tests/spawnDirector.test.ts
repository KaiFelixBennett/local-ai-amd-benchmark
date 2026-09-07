import { describe, expect, it } from 'vitest';
import { SpawnDirector, type SpawnDecisionContext } from '../src/systems/SpawnDirector';
import { BALANCE } from '../src/config/balance';

const baseCtx: SpawnDecisionContext = {
  mapId: 'nebelmoor',
  activeEvent: null,
  progress01: 0.5,
  difficultyFactor: 1,
  modeSpawnRateMultiplier: 1,
  eventSpawnRateMultiplier: 1,
};

describe('SpawnDirector', () => {
  it('is deterministic for a given seed', () => {
    const a = new SpawnDirector(1234);
    const b = new SpawnDirector(1234);
    const seqA = Array.from({ length: 20 }, () => a.pickTargetType(baseCtx));
    const seqB = Array.from({ length: 20 }, () => b.pickTargetType(baseCtx));
    expect(seqA).toEqual(seqB);
  });

  it('excludes storm-only targets (sturmvogel) when no storm event is active', () => {
    const director = new SpawnDirector(1);
    const pool = director.getEligibleTargets({ ...baseCtx, activeEvent: null });
    expect(pool.some((t) => t.id === 'sturmvogel')).toBe(false);
  });

  it('includes sturmvogel only while the storm event is active on its home map', () => {
    const director = new SpawnDirector(1);
    const pool = director.getEligibleTargets({ ...baseCtx, mapId: 'sturmklippen', activeEvent: 'storm' });
    expect(pool.some((t) => t.id === 'sturmvogel')).toBe(true);
  });

  it('restricts map-exclusive species to their own map', () => {
    const director = new SpawnDirector(1);
    const onNebelmoor = director.getEligibleTargets({ ...baseCtx, mapId: 'nebelmoor' });
    const onSturmklippen = director.getEligibleTargets({ ...baseCtx, mapId: 'sturmklippen', activeEvent: 'storm' });
    expect(onNebelmoor.some((t) => t.id === 'nebelfluesterer')).toBe(true);
    expect(onSturmklippen.some((t) => t.id === 'nebelfluesterer')).toBe(false);
  });

  it('picked target types always come from the eligible pool', () => {
    const director = new SpawnDirector(99);
    const pool = new Set(director.getEligibleTargets(baseCtx).map((t) => t.id));
    for (let i = 0; i < 50; i++) {
      expect(pool.has(director.pickTargetType(baseCtx))).toBe(true);
    }
  });

  it('spawn delay respects the configured minimum floor', () => {
    const director = new SpawnDirector(1);
    const delay = director.nextSpawnDelayMs({
      ...baseCtx,
      difficultyFactor: 100,
      modeSpawnRateMultiplier: 100,
      eventSpawnRateMultiplier: 100,
    });
    expect(delay).toBeGreaterThanOrEqual(BALANCE.spawn.minSpawnIntervalMs);
  });

  it('higher difficulty/mode multipliers produce shorter average spawn delays', () => {
    const director = new SpawnDirector(1);
    const slow = Array.from({ length: 30 }, () => director.nextSpawnDelayMs(baseCtx));
    const fast = Array.from({ length: 30 }, () =>
      director.nextSpawnDelayMs({ ...baseCtx, difficultyFactor: 1.8, modeSpawnRateMultiplier: 1.5 }),
    );
    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
    expect(avg(fast)).toBeLessThan(avg(slow));
  });

  it('entry edge is always one of the four screen edges', () => {
    const director = new SpawnDirector(1);
    const edges = new Set(['left', 'right', 'top', 'bottom']);
    for (let i = 0; i < 30; i++) {
      expect(edges.has(director.pickEntryEdge())).toBe(true);
    }
  });
});
