import { describe, it, expect } from 'vitest';
import { eligibleKinds, chooseKind, nextSpawns } from '../src/core/spawner';
import type { SpawnContext } from '../src/core/spawner';
import { TARGETS, SPAWNABLE } from '../src/core/targets';
import { createRng } from '../src/core/rng';

const ctx = (over: Partial<SpawnContext> = {}): SpawnContext => ({
  width: 1280,
  height: 720,
  map: 'nebelmoor',
  difficulty: 0.5,
  elapsedMs: 5000,
  phase: 0.4,
  event: null,
  ...over
});

describe('spawner', () => {
  it('eligibleKinds respects map restrictions', () => {
    const r = createRng(1);
    // sturmvogel is sturmklippen-exclusive
    expect(eligibleKinds(ctx({ map: 'nebelmoor' }), r)).not.toContain('sturmvogel');
    expect(eligibleKinds(ctx({ map: 'sturmklippen' }), r)).toContain('sturmvogel');
  });

  it('eligibleKinds only contains spawnable kinds at high difficulty', () => {
    const r = createRng(2);
    const kinds = eligibleKinds(ctx({ difficulty: 1 }), r);
    expect(kinds.length).toBeGreaterThan(0);
    for (const k of kinds) {
      expect(SPAWNABLE).toContain(k);
      expect(TARGETS[k]).toBeDefined();
    }
  });

  it('lower difficulty yields fewer eligible kinds', () => {
    const low = eligibleKinds(ctx({ difficulty: 0.05 }), createRng(3));
    const high = eligibleKinds(ctx({ difficulty: 0.9 }), createRng(3));
    expect(high.length).toBeGreaterThanOrEqual(low.length);
  });

  it('chooseKind always returns a valid kind', () => {
    const r = createRng(5);
    for (let i = 0; i < 200; i++) {
      const k = chooseKind(ctx(), r);
      expect(TARGETS[k]).toBeDefined();
    }
  });

  it('nextSpawns returns at least one descriptor with a trajectory', () => {
    const r = createRng(7);
    const out = nextSpawns(ctx(), r);
    expect(out.length).toBeGreaterThanOrEqual(1);
    for (const d of out) {
      expect(TARGETS[d.kind]).toBeDefined();
      expect(d.trajectory.start).toBeDefined();
      expect(d.trajectory.end).toBeDefined();
      expect(d.trajectory.duration).toBeGreaterThan(0);
      expect(d.spawnAt).toBeGreaterThanOrEqual(0);
    }
  });

  it('any schwarmvogel descriptor spawns a formation of 4+ members', () => {
    // Run many seeds; whenever the chosen kind is a swarm bird it must expand.
    let sawSwarm = false;
    for (let seed = 0; seed < 300; seed++) {
      const r = createRng(seed);
      const out = nextSpawns(ctx({ phase: 0.6, event: 'goldenswarm' }), r);
      if (out[0].kind === 'schwarmvogel') {
        sawSwarm = true;
        expect(out.length).toBeGreaterThanOrEqual(4);
      }
    }
    // goldenswarm heavily boosts the swarm/gold weights, so we expect to have
    // hit at least one swarm across 300 seeds.
    expect(sawSwarm).toBe(true);
  });
});
