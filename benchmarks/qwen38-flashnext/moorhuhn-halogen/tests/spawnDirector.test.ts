import { describe, expect, it } from 'vitest';
import { SpawnDirector, targetEligible, weightFor, type SpawnContext } from '../src/logic/spawnDirector';
import { getTargetDef } from '../src/config/targets';
import { createRng } from '../src/core/rng';

function ctx(overrides: Partial<SpawnContext> = {}): SpawnContext {
  return {
    mapId: 'nebelmoor',
    phase: 'mid',
    difficulty: 1,
    activeEvents: [],
    weatherIds: ['gewitter', 'regenfront'],
    activeTargetCount: 0,
    maxConcurrentTargets: 10,
    allowedTargets: 'all',
    eventSpawnRateMult: 1,
    elapsedSec: 60,
    ...overrides,
  };
}

describe('targetEligible', () => {
  const flatterer = getTargetDef('moorflatterer');
  const sturm = getTargetDef('sturmvogel');
  const gold = getTargetDef('goldschnabel');
  const schilf = getTargetDef('schilfgeist');

  it('common target is eligible in a normal context', () => {
    expect(targetEligible(flatterer, ctx())).toBe(true);
  });

  it('allowedTargets filters explicitly', () => {
    const flatterer = getTargetDef('moorflatterer');
    expect(targetEligible(flatterer, ctx({ allowedTargets: ['schnellfeder'] }))).toBe(false);
    expect(targetEligible(flatterer, ctx({ allowedTargets: ['moorflatterer'] }))).toBe(true);
  });

  it('phase-restricted targets respect their phases', () => {
    expect(targetEligible(schilf, ctx({ phase: 'intro' }))).toBe(false);
    expect(targetEligible(schilf, ctx({ phase: 'mid' }))).toBe(true);
  });

  it('weatherOnly targets need an active weather event', () => {
    expect(targetEligible(sturm, ctx())).toBe(false);
    expect(targetEligible(sturm, ctx({ activeEvents: ['gewitter'] }))).toBe(true);
    // a non-weather event does not help
    expect(targetEligible(sturm, ctx({ activeEvents: ['goldener_schwarm'] }))).toBe(false);
  });

  it('rare targets are blocked during the first 8 seconds', () => {
    expect(targetEligible(gold, ctx({ elapsedSec: 7.9 }))).toBe(false);
    expect(targetEligible(gold, ctx({ elapsedSec: 8 }))).toBe(true);
  });

  it('map weights decide eligibility across maps', () => {
    // schilfgeist only weighted on nebelmoor
    expect(targetEligible(schilf, ctx({ mapId: 'mondbruch', phase: 'mid' }))).toBe(false);
    expect(weightFor(schilf, 'nebelmoor')).toBeGreaterThan(0);
    expect(weightFor(schilf, 'mondbruch')).toBe(0);
    // 'any' fallback applies elsewhere
    expect(weightFor(flatterer, 'sturmklippen')).toBe(1.0);
  });
});

describe('SpawnDirector', () => {
  it('waits out the initial cooldown before the first spawn', () => {
    const d = new SpawnDirector([1, 2], createRng(5));
    // First tick: cooldown starts at 0, so a spawn is produced immediately.
    const out = d.tick(0.016, ctx());
    expect(out.length).toBe(1);
    expect(out[0].groupIndex).toBe(0);
    // Immediately after, the cooldown blocks further spawns.
    expect(d.tick(0.016, ctx())).toEqual([]);
  });

  it('respects maxConcurrentTargets', () => {
    const d = new SpawnDirector([0.1, 0.2], createRng(9));
    const full = ctx({ activeTargetCount: 10, maxConcurrentTargets: 10 });
    expect(d.tick(1, full)).toEqual([]);
  });

  it('cooldown has a hard floor of 0.25s even with huge difficulty', () => {
    const d = new SpawnDirector([0.1, 0.2], createRng(3));
    d.tick(0.016, ctx({ difficulty: 50, eventSpawnRateMult: 50 }));
    // With cooldown floored at 0.25s, 0.2s later must still be empty.
    expect(d.tick(0.2, ctx({ difficulty: 50, eventSpawnRateMult: 50 }))).toEqual([]);
    // and the next tick past 0.25 produces one.
    expect(d.tick(0.06, ctx({ difficulty: 50, eventSpawnRateMult: 50 })).length).toBe(1);
  });

  it('retries after a short delay when nothing is eligible', () => {
    const d = new SpawnDirector([1, 2], createRng(11));
    const none = ctx({ allowedTargets: ['schilfgeist'], phase: 'intro' });
    expect(d.tick(1, none)).toEqual([]);
    // retry cooldown is 0.5s
    expect(d.tick(0.4, none)).toEqual([]);
    expect(d.tick(0.15, none).length).toBe(0); // still nothing eligible, keeps cycling
  });

  it('swarm targets emit group index 0 then queued members with spacing', () => {
    const d = new SpawnDirector([0.5, 0.6], createRng(21));
    // Force the swarm by allowing only the swarm bird.
    const swarmOnly = ctx({ allowedTargets: ['schwarmvogel'] });
    const first = d.tick(0.016, swarmOnly);
    expect(first.length).toBe(1);
    expect(first[0].targetId).toBe('schwarmvogel');
    expect(first[0].groupIndex).toBe(0);
    const size = first[0].groupSize;
    expect(size).toBeGreaterThanOrEqual(4);
    expect(size).toBeLessThanOrEqual(8);
    if (size > 1) {
      // Members arrive spaced ~0.12s apart; run ticks to collect the rest.
      const seen: number[] = [];
      for (let i = 0; i < 200; i++) {
        const out = d.tick(0.12, swarmOnly);
        for (const o of out) seen.push(o.groupIndex);
        if (seen.length >= size - 1) break;
      }
      expect(seen[0]).toBe(1);
      expect(seen).toContain(size - 1);
      expect(new Set(seen).size).toBe(seen.length); // no duplicates
    }
  });

  it('gated trajectories never appear before their phase window', () => {
    // dive/formation/flee/spiral are gated to phases past intro.
    const gated = new Set(['dive', 'formation', 'flee', 'spiral']);
    const d = new SpawnDirector([0.01, 0.02], createRng(33));
    let decisions = 0;
    for (let i = 0; i < 500; i++) {
      for (const dec of d.tick(0.05, ctx({ phase: 'intro', elapsedSec: 5 }))) {
        decisions++;
        expect(gated.has(dec.trajectory)).toBe(false);
      }
    }
    expect(decisions).toBeGreaterThan(10); // sanity: the director actually ran
  });

  it('dive trajectories do appear once the phase allows it', () => {
    const d = new SpawnDirector([0.01, 0.02], createRng(34));
    const divers = ctx({
      phase: 'mid',
      activeEvents: ['gewitter'], // unlock the weather-only diver
      elapsedSec: 100,
    });
    let sawDive = false;
    for (let i = 0; i < 800 && !sawDive; i++) {
      for (const dec of d.tick(0.05, divers)) {
        if (dec.trajectory === 'dive') sawDive = true;
      }
    }
    expect(sawDive).toBe(true);
  });

  it('same seed produces the same spawn plan', () => {
    const plan = (seed: number) => {
      const d = new SpawnDirector([0.3, 0.5], createRng(seed));
      const out: string[] = [];
      for (let i = 0; i < 100; i++) {
        for (const dec of d.tick(0.25, ctx())) out.push(`${dec.targetId}:${dec.trajectory}`);
      }
      return out;
    };
    expect(plan(4242)).toEqual(plan(4242));
    expect(plan(1)).not.toEqual(plan(2));
  });
});
