import { describe, expect, it } from 'vitest';
import { phaseAt, planRound, PLAN_HORIZON, extendEndlessPlan } from '../src/game/SpawnDirector';
import { dailySeed, Rng } from '../src/core/Rng';
import { MODES } from '../src/config/modes';
import { MAP_ORDER } from '../src/config/maps';
import { BOSS_ORDER } from '../src/config/targets';

describe('phaseAt', () => {
  it('maps finite durations uniformly onto phases 0..5', () => {
    expect(phaseAt(0, 120)).toBe(0);
    expect(phaseAt(19.9, 120)).toBe(0);
    expect(phaseAt(20, 120)).toBe(1);
    expect(phaseAt(119.9, 120)).toBe(5);
    expect(phaseAt(9999, 120)).toBe(5); // clamped
  });

  it('endless starts in phase 2 and caps at 5', () => {
    expect(phaseAt(0, -1)).toBe(2);
    expect(phaseAt(74, -1)).toBe(2);
    expect(phaseAt(75, -1)).toBe(3);
    expect(phaseAt(300, -1)).toBe(5);
    expect(phaseAt(10000, -1)).toBe(5);
  });
});

describe('planRound determinism', () => {
  it('same seed + mode + map => byte-identical plan', () => {
    const a = planRound(new Rng(1337), MODES.classic, 'nebelmoor');
    const b = planRound(new Rng(1337), MODES.classic, 'nebelmoor');
    expect(a).toEqual(b);
  });

  it('different seeds produce different timelines', () => {
    const a = planRound(new Rng(1), MODES.classic, 'nebelmoor');
    const b = planRound(new Rng(2), MODES.classic, 'nebelmoor');
    expect(a.spawns.map((s) => s.kind)).not.toEqual(b.spawns.map((s) => s.kind));
  });

  it('reports the raw mode duration (endless stays -1) while planning the horizon', () => {
    expect(planRound(new Rng(5), MODES.classic, 'nebelmoor').duration).toBe(120);
    const endless = planRound(new Rng(5), MODES.endless, 'nebelmoor');
    expect(endless.duration).toBe(-1);
    expect(endless.spawns.length).toBeGreaterThan(10);
    expect(endless.spawns[endless.spawns.length - 1].time).toBeLessThanOrEqual(PLAN_HORIZON);
  });

  it('the daily challenge seed yields a fixed shared timeline', () => {
    const seed = dailySeed('2026-09-03');
    const a = planRound(new Rng(seed), MODES.daily, 'mondbruch');
    const b = planRound(new Rng(dailySeed('2026-09-03')), MODES.daily, 'mondbruch');
    expect(a).toEqual(b);
  });
});

describe('planRound spawn rules', () => {
  it('spawns are sorted and inside the round for every map/mode', () => {
    for (const map of MAP_ORDER) {
      const plan = planRound(new Rng(42), MODES.classic, map);
      let last = -Infinity;
      for (const s of plan.spawns) {
        expect(s.time).toBeGreaterThanOrEqual(last);
        last = s.time;
        expect(s.time).toBeGreaterThanOrEqual(0.6);
        expect(s.time).toBeLessThan(120);
      }
    }
  });

  it('swarm groups share a groupId and land near-simultaneously', () => {
    const plan = planRound(new Rng(42), MODES.classic, 'nebelmoor');
    const swarms = plan.spawns.filter((s) => s.kind === 'swarm');
    expect(swarms.length).toBeGreaterThan(0);
    const groups = new Map<number, number[]>();
    for (const s of swarms) {
      const g = s.groupId ?? -1;
      groups.set(g, [...(groups.get(g) ?? []), s.time]);
    }
    for (const times of groups.values()) {
      const span = Math.max(...times) - Math.min(...times);
      expect(span).toBeLessThanOrEqual(0.6); // members within jitter window
    }
  });

  it('boss kinds never appear without the events system', () => {
    const plan = planRound(new Rng(42), MODES.tutorial, 'nebelmoor');
    const kinds = new Set(plan.spawns.map((s) => s.kind));
    for (const boss of BOSS_ORDER) expect(kinds.has(boss)).toBe(false);
    expect(plan.events).toEqual([]);
  });

  it('extendEndlessPlan continues sorted spawns beyond the horizon', () => {
    const rng = new Rng(77);
    const plan = planRound(rng, MODES.endless, 'sturmklippen');
    extendEndlessPlan(plan, rng, PLAN_HORIZON, PLAN_HORIZON + 60, MODES.endless, 'sturmklippen');
    const late = plan.spawns.filter((s) => s.time >= PLAN_HORIZON);
    expect(late.length).toBeGreaterThan(10);
    let last = -Infinity;
    for (const s of plan.spawns) {
      expect(s.time).toBeGreaterThanOrEqual(last);
      last = s.time;
    }
  });
});

describe('planRound events & bosses', () => {
  it('classic schedules a mini-boss at ~62% of the round', () => {
    const plan = planRound(new Rng(42), MODES.classic, 'nebelmoor');
    const bossEvents = plan.events.filter((e) => e.eventId === 'boss');
    expect(bossEvents.length).toBeGreaterThanOrEqual(1);
    expect(bossEvents[0].time).toBeCloseTo(120 * 0.62, 5);
    const bossKind = plan.spawns.find(
      (s) => (BOSS_ORDER as string[]).includes(s.kind) && Math.abs(s.time - bossEvents[0].time) < 0.001,
    );
    expect(bossKind).toBeDefined();
  });

  it('long rounds get a second late boss and swarm escorts beforehand', () => {
    const daily = { ...MODES.daily, duration: 240 };
    const plan = planRound(new Rng(9), daily, 'mondbruch');
    const bossTimes = plan.events.filter((e) => e.eventId === 'boss').map((e) => e.time);
    expect(bossTimes.length).toBe(2);
    expect(bossTimes[1]).toBeCloseTo(240 * 0.86, 5);
    // escort: six swarm members within the second before each boss
    for (const bt of bossTimes) {
      const escort = plan.spawns.filter(
        (s) => s.kind === 'swarm' && s.time >= bt - 1.05 && s.time < bt,
      );
      expect(escort.length).toBe(6);
    }
  });

  it('timed events respect the mode cadence window and finish before the end', () => {
    const mode = { ...MODES.classic, eventsEnabled: true, eventEvery: [16, 26] as [number, number] };
    const plan = planRound(new Rng(4242), mode, 'nebelmoor');
    const timed = plan.events.filter((e) => e.eventId !== 'boss');
    expect(timed.length).toBeGreaterThan(1);
    expect(timed[0].time).toBeGreaterThanOrEqual(16 * 0.6 - 0.001);
    for (let i = 1; i < timed.length; i++) {
      // Cadence slots can be skipped when phase-gated events are not yet
      // eligible, so only the lower bound is a hard guarantee.
      expect(timed[i].time - timed[i - 1].time).toBeGreaterThanOrEqual(16 - 0.001);
    }
    for (const e of plan.events) expect(e.time).toBeLessThan(120);
  });

  it('every map can be planned without empty spawn lists', () => {
    for (const map of MAP_ORDER) {
      const plan = planRound(new Rng(3), MODES.blitz, map);
      expect(plan.spawns.length).toBeGreaterThan(20); // 60s @ 1.7/s-ish
    }
  });
});
