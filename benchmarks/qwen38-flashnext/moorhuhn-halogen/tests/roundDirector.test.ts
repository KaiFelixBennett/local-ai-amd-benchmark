import { describe, expect, it } from 'vitest';
import { RoundDirector, type RoundDirectorContext } from '../src/logic/roundDirector';
import { getModeDef } from '../src/config/modes';
import { createRng } from '../src/core/rng';

function ctx(overrides: Partial<RoundDirectorContext> = {}): RoundDirectorContext {
  return {
    elapsed: 0,
    duration: 120,
    difficulty: 1,
    mapEventPool: ['nebel', 'wind', 'gewitter', 'goldener_schwarm', 'boss'],
    mapId: 'nebelmoor',
    ...overrides,
  };
}

const classic = getModeDef('classic');

describe('RoundDirector phases', () => {
  it('starts in intro', () => {
    const d = new RoundDirector(classic);
    expect(d.phase).toBe('intro');
  });

  it('follows the classic phase timeline', () => {
    const d = new RoundDirector(classic);
    const seen: string[] = [];
    for (let t = 0; t <= 120; t += 1) {
      const r = d.update(1, ctx({ elapsed: t }), createRng(t));
      if (r.phaseChanged) seen.push(d.phase);
    }
    // starts in intro (no change reported), then marches through the rest
    expect(['intro', ...seen]).toEqual(['intro', 'ramp', 'mid', 'rest', 'intense', 'finale']);
    // exact boundary checks for classic FULL_PHASES
    const d2 = new RoundDirector(classic);
    d2.update(1, ctx({ elapsed: 16.68 }), createRng(1));
    expect(d2.phase).toBe('intro');
    d2.update(1, ctx({ elapsed: 16.8 }), createRng(2));
    expect(d2.phase).toBe('ramp');
    d2.update(1, ctx({ elapsed: 120 }), createRng(3));
    expect(d2.phase).toBe('finale');
  });

  it('clamps progress at duration and loops endlessly', () => {
    const endless = getModeDef('endless');
    const d = new RoundDirector(endless);
    // endless loops on a 180s window: at elapsed 180 we should be back at intro
    d.update(1, ctx({ elapsed: 179, duration: null }), createRng(1));
    const r = d.update(1, ctx({ elapsed: 180.001, duration: null }), createRng(2));
    expect(r.phaseChanged).toBe(true);
    expect(d.phase).toBe('intro');
  });
});

describe('RoundDirector events', () => {
  it('first event fires only after the initial 12s cooldown', () => {
    const d = new RoundDirector(classic);
    const rng = createRng(7);
    let startedAt: number | null = null;
    for (let t = 0; t < 60 && !startedAt; t += 1) {
      const r = d.update(1, ctx({ elapsed: t }), rng);
      if (r.eventStarted) startedAt = t;
    }
    expect(startedAt).not.toBeNull();
    expect(startedAt).toBeGreaterThanOrEqual(12);
  });

  it('active event counts down and ends', () => {
    const d = new RoundDirector(classic);
    d.forceEvent('nebel', 10); // 10s custom duration
    expect(d.activeEvent?.id).toBe('nebel');
    expect(d.eventTimeLeft).toBe(10);
    const r = d.update(10.01, ctx({ elapsed: 30 }), createRng(5));
    expect(r.eventEnded).toBe('nebel');
    expect(d.activeEvent).toBeNull();
  });

  it('only one event at a time', () => {
    const d = new RoundDirector(classic);
    d.forceEvent('wind', 20);
    const r = d.update(1, ctx({ elapsed: 40 }), createRng(3));
    expect(r.eventStarted).toBeNull(); // cannot stack while one runs
    expect(d.activeEvent?.id).toBe('wind');
  });

  it('clearEvent stops the active event and sets an 8s cooldown', () => {
    const d = new RoundDirector(classic);
    d.forceEvent('nebel', 30);
    d.clearEvent();
    expect(d.activeEvent).toBeNull();
    const rng = createRng(9);
    let started = -1;
    for (let t = 40; t < 60; t += 1) {
      const r = d.update(1, ctx({ elapsed: t }), rng);
      if (r.eventStarted) {
        started = t;
        break;
      }
    }
    expect(started).toBeGreaterThanOrEqual(47);
  });

  it('respects event minPhase gating', () => {
    // 'boss' needs mid+. Also featherstorm needs finale.
    const d = new RoundDirector(classic);
    // During intro, try to naturally start events many times — none of the gated ones may run.
    const rng = createRng(11);
    for (let t = 0; t < 14; t += 1) {
      const r = d.update(1, ctx({ elapsed: t, mapEventPool: ['featherstorm'] }), rng);
      expect(r.eventStarted).not.toBe('featherstorm');
    }
  });

  it('respects allowedMaps gating', () => {
    const d = new RoundDirector(classic);
    // vollmond is mondbruch-only
    const rng = createRng(13);
    for (let t = 0; t < 100; t += 1) {
      const r = d.update(1, ctx({ elapsed: 60 + t * 0, mapEventPool: ['vollmond'], mapId: 'nebelmoor' }), rng);
      expect(r.eventStarted).not.toBe('vollmond');
    }
    // but it can run on its own map
    const d2 = new RoundDirector(classic);
    const rng2 = createRng(14);
    let started = false;
    for (let t = 12; t < 130 && !started; t += 1) {
      const r = d2.update(1, ctx({ elapsed: t, mapEventPool: ['vollmond'], mapId: 'mondbruch' }), rng2);
      if (r.eventStarted === 'vollmond') started = true;
    }
    expect(started).toBe(true);
  });

  it('boss events respect bossChance=0', () => {
    const zen = getModeDef('zen');
    const d = new RoundDirector({ ...zen, bossChance: 0 });
    const rng = createRng(17);
    for (let t = 0; t < 200; t += 1) {
      const r = d.update(1, ctx({ elapsed: t, mapEventPool: ['boss'], duration: null }), rng);
      expect(r.eventStarted).not.toBe('boss');
    }
  });

  it('boss only fires once per round', () => {
    const d = new RoundDirector(classic);
    d.forceEvent('boss', 5);
    expect(d.activeEvent?.id).toBe('boss');
    // after it ends, 'boss' must not start again
    d.update(5.01, ctx({ elapsed: 60 }), createRng(19));
    const rng = createRng(20);
    for (let t = 61; t < 119; t += 1) {
      const r = d.update(1, ctx({ elapsed: t }), rng);
      expect(r.eventStarted).not.toBe('boss');
    }
  });

  it('bossScheduledAt records the boss start time', () => {
    const d = new RoundDirector(classic);
    d.forceEvent('boss', 20, 61);
    expect(d.bossScheduledAt).toBe(61);
  });
});

describe('RoundDirector.pickBoss', () => {
  it('filters by map and phase', () => {
    const d = new RoundDirector(classic);
    // intro: no boss allowed anywhere
    expect(d.pickBoss('nebelmoor', createRng(1))).toBeNull();
    d.forceEvent('nebel', 1);
    // advance director to mid by simulating
    for (let t = 45; t < 60; t += 1) d.update(1, ctx({ elapsed: t }), createRng(3));
    expect(d.phase).toBe('mid');
    const pick = d.pickBoss('nebelmoor', createRng(2));
    expect(pick).toBe('boss_eisenmoor'); // nachtschatten needs finale on nebelmoor
    // sturmklippen never hosts nachtschatten, but can host eisenmoor/blitzschnabel in finale
    for (let t = 0; t <= 120; t += 1) d.update(1, ctx({ elapsed: t }), createRng(4));
    expect(d.phase).toBe('finale');
    for (let i = 1; i < 50; i++) {
      const p = d.pickBoss('sturmklippen', createRng(i));
      expect(p).not.toBeNull();
      expect(p).not.toBe('boss_nachtschatten');
    }
  });

  it('mondbruch in finale can pick nachtschatten', () => {
    const d = new RoundDirector(classic);
    for (let t = 0; t <= 120; t += 1) d.update(1, ctx({ elapsed: t }), createRng(5));
    expect(d.phase).toBe('finale');
    const picks = new Set<string>();
    for (let i = 1; i < 40; i++) {
      const p = d.pickBoss('mondbruch', createRng(i));
      if (p) picks.add(p);
    }
    expect(picks.has('boss_nachtschatten')).toBe(true);
    // mondbruch cannot host eisenmoor
    expect(picks.has('boss_eisenmoor')).toBe(false);
  });
});

describe('RoundDirector determinism', () => {
  it('same seed replays the same event timeline', () => {
    const run = (seed: number) => {
      const d = new RoundDirector(classic);
      const rng = createRng(seed);
      const events: string[] = [];
      for (let t = 0; t < 120; t += 1) {
        const r = d.update(1, ctx({ elapsed: t }), rng);
        if (r.eventStarted) events.push(r.eventStarted);
        if (r.eventEnded) d.clearEvent(); // end-of-round bookkeeping
      }
      return events;
    };
    expect(run(999)).toEqual(run(999));
  });
});
