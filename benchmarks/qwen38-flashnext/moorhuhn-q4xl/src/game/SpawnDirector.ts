import type { EventId, MapId, ModeConfig, PathSpec, SpawnEvent, TargetKind, Edge } from '../core/types';
import { TARGETS, SWARM_SIZE, BOSS_ORDER } from '../config/targets';
import { MAPS } from '../config/maps';
import { eventsForMap, RANDOM_EVENT_IDS } from '../config/events';
import type { Rng } from '../core/Rng';

/**
 * Deterministic round planner. Given (seed, mode, map) the FULL spawn and
 * event timeline is fixed — required for Daily Challenge fairness and easy
 * unit testing of spawn rules. The runtime only replays the plan.
 */

export interface RoundPlan {
  spawns: SpawnEvent[];
  events: { time: number; eventId: EventId }[];
  /** scheduled duration; -1 for endless (plan covers `PLAN_HORIZON`). */
  duration: number;
}

export const PLAN_HORIZON = 300; // endless plans pre-generate 5 minutes, then extend()

const STORY_PHASES = 6; // 0..5; time maps uniformly onto phases for finite rounds

export function phaseAt(time: number, duration: number): number {
  if (duration <= 0) return Math.min(STORY_PHASES - 1, 2 + Math.floor(time / 75));
  return Math.min(STORY_PHASES - 1, Math.floor((time / duration) * STORY_PHASES));
}

function kindsAvailable(phase: number): TargetKind[] {
  return (Object.keys(TARGETS) as TargetKind[]).filter((k) => {
    const cfg = TARGETS[k];
    if (cfg.weight <= 0) return false; // event-only kinds spawn via events
    if (cfg.minPhase > phase) return false;
    // map-exclusive kinds ALSO allowed everywhere at low weight, non-exclusive
    // everywhere; exclusive kinds get boosted on their home map
    return true;
  });
}

function weightsFor(kinds: TargetKind[], map: MapId): number[] {
  const exclusive = MAPS[map].exclusiveKinds;
  return kinds.map((k) => {
    let w = TARGETS[k].weight;
    if (exclusive.includes(k)) w *= 2.4;
    if (!exclusive.length) return w;
    // kinds that are exclusive to ANOTHER map appear rarely elsewhere
    const otherExclusive = (Object.keys(MAPS) as MapId[]).some(
      (m) => m !== map && MAPS[m].exclusiveKinds.includes(k),
    );
    if (otherExclusive) w *= 0.25;
    return w;
  });
}

function pickPath(kind: TargetKind, rng: Rng): PathSpec {
  const cfg = TARGETS[kind];
  const edges: Edge[] = ['left', 'right'];
  const edge = rng.pick(edges);
  const base: PathSpec = { kind: 'line', edge, y0: rng.range(0.08, 0.8) };
  const dir: 1 | -1 = edge === 'left' ? 1 : -1;

  switch (kind) {
    case 'swarm':
      return { ...base, kind: 'formation', dir, speed: cfg.speed, y0: rng.range(0.15, 0.7) };
    case 'swift':
      return rng.chance(0.6)
        ? { ...base, kind: 'line', dir, speed: cfg.speed }
        : { ...base, kind: 'bezier', dir, speed: cfg.speed, ctrl: [[0.3, rng.sign() * 0.3], [0.7, rng.sign() * 0.25]] };
    case 'corkscrew':
      return { ...base, kind: 'spiral', dir, speed: cfg.speed, curl: rng.range(1.6, 3) , amp: rng.range(34, 60) };
    case 'gold':
      return { ...base, kind: 'sine', dir, speed: cfg.speed, amp: rng.range(50, 90), freq: rng.range(1.1, 1.8) };
    case 'mist':
      return { ...base, kind: 'sine', dir, speed: cfg.speed, amp: rng.range(28, 55), freq: rng.range(0.6, 1.0) };
    case 'glider':
      return {
        kind: 'depth',
        edge: rng.pick(['left', 'right'] as Edge[]),
        y0: rng.range(0.1, 0.9),
        speed: cfg.speed * 0.55,
        depthStart: 0.12,
        depthEnd: 0.95,
      };
    case 'armored':
      return { ...base, kind: 'line', dir, speed: cfg.speed };
    case 'balloon':
      return { kind: 'line', edge: 'bottom', dir: 1, y0: rng.range(0.1, 0.9), speed: cfg.speed };
    case 'decoy':
      return rng.chance(0.5)
        ? { ...base, kind: 'sine', dir, speed: cfg.speed, amp: 40 }
        : { ...base, kind: 'line', dir, speed: cfg.speed };
    default: {
      // flatterer & friends: friendly variety
      const roll = rng.next();
      if (roll < 0.4) return { ...base, kind: 'line', dir, speed: cfg.speed };
      if (roll < 0.65) return { ...base, kind: 'sine', dir, speed: cfg.speed * 0.95, amp: rng.range(40, 85), freq: rng.range(0.8, 1.5) };
      if (roll < 0.82)
        return {
          ...base,
          kind: 'bezier',
          dir,
          speed: cfg.speed,
          ctrl: [
            [0.28, rng.sign() * 0.22],
            [0.7, rng.sign() * 0.3],
          ],
        };
      return { ...base, kind: 'sine', dir, speed: cfg.speed * 0.9, amp: rng.range(30, 70), freq: 1.1 };
    }
  }
}

/** Schedule a swarm/formation group of N members at the same base time. */
function spawnGroup(
  out: SpawnEvent[],
  time: number,
  kind: TargetKind,
  size: number,
  rng: Rng,
  groupId: number,
): void {
  const leader = pickPath(kind, rng);
  for (let i = 0; i < size; i++) {
    const member: PathSpec =
      kind === 'swarm'
        ? { ...leader, formationIndex: i, formationLeader: groupId }
        : { ...leader };
    out.push({
      time: time + (i === 0 ? 0 : rng.range(0.02, 0.12)), // near-simultaneous
      kind,
      path: member,
      groupId,
    });
  }
}

/** Plan a full round. Fully deterministic for fixed (rng seed, mode, map). */
export function planRound(rng: Rng, mode: ModeConfig, map: MapId): RoundPlan {
  const duration = mode.duration > 0 ? mode.duration : PLAN_HORIZON;
  const spawns: SpawnEvent[] = [];
  const events: { time: number; eventId: EventId }[] = [];
  let groupId = 1;

  // ---------- ambient spawns ----------
  let t = 0.6;
  while (t < duration - 1.5) {
    const phase = phaseAt(t, mode.duration);
    // calm intro and a short breather between story phases
    const restGap = phase % 3 === 2 ? 1.55 : 1; // 'rest' phase has lower pressure
    const rate = mode.baseSpawnRate * (0.75 + phase * 0.11) / restGap;
    const gap = rng.range(0.65, 1.45) / Math.max(0.25, rate);
    if (t + gap >= duration - 1) break;
    t += gap;

    const kinds = kindsAvailable(phase);
    if (!kinds.length) continue;
    const w = weightsFor(kinds, map);
    const kind = kinds[rng.weighted(w)];

    if (kind === 'swarm') {
      const size = SWARM_SIZE[Math.min(SWARM_SIZE.length - 1, Math.floor(phase / 2))];
      spawnGroup(spawns, t, 'swarm', size, rng, groupId++);
      t += 1.2; // swarm cadence
    } else {
      spawns.push({ time: t, kind, path: pickPath(kind, rng) });
    }
  }

  // ---------- timed events ----------
  if (mode.eventsEnabled) {
    const pool = eventsForMap(map).filter((e) => RANDOM_EVENT_IDS.includes(e.id));
    const [minE, maxE] = mode.eventEvery ?? [18, 28];
    let et = rng.range(minE * 0.6, minE);
    while (et < duration - 12) {
      const phase = phaseAt(et, mode.duration);
      const allowed = pool.filter((e) => (e.minPhase ?? 0) <= phase);
      if (allowed.length) {
        const chosen = allowed[rng.weighted(allowed.map((e) => e.weight))];
        events.push({ time: et, eventId: chosen.id });
      }
      et += rng.range(minE, maxE);
    }

    // scheduled mini-bosses: climax of the round (and one extra late for long rounds)
    const bossTimes = [duration * 0.62];
    if (duration >= 240) bossTimes.push(duration * 0.86);
    for (const bt of bossTimes) {
      const boss = BOSS_ORDER[rng.int(0, BOSS_ORDER.length)];
      // swarm escort 1s before the boss for drama
      spawnGroup(spawns, bt - 1.0, 'swarm', 6, rng, groupId++);
      spawns.push({ time: bt, kind: boss, path: pickBossPath(boss, rng) });
      events.push({ time: bt, eventId: 'boss' });
    }
  }

  spawns.sort((a, b) => a.time - b.time);
  events.sort((a, b) => a.time - b.time);
  return { spawns, events, duration: mode.duration };
}

function pickBossPath(kind: TargetKind, rng: Rng): PathSpec {
  const cfg = TARGETS[kind];
  const edge: Edge = rng.pick(['left', 'right'] as Edge[]);
  const dir: 1 | -1 = edge === 'left' ? 1 : -1;
  return {
    kind: kind === 'bossAcrobat' ? 'bezier' : 'hover',
    edge,
    dir,
    y0: rng.range(0.18, 0.6),
    speed: cfg.speed,
    holdAt: 0.4,
    holdTime: 3.2,
    ctrl: [
      [0.25, -0.35],
      [0.6, 0.4],
      [0.85, -0.3],
    ],
  };
}

/** Extend an endless plan beyond PLAN_HORIZON with the same rng stream. */
export function extendEndlessPlan(plan: RoundPlan, rng: Rng, from: number, to: number, mode: ModeConfig, map: MapId): void {
  let t = from + 1;
  let groupId = 1000 + Math.floor(from);
  while (t < to) {
    const phase = phaseAt(t, -1);
    const kinds = kindsAvailable(phase);
    const w = weightsFor(kinds, map);
    const kind = kinds[rng.weighted(w)];
    if (kind === 'swarm') {
      spawnGroup(plan.spawns, t, 'swarm', SWARM_SIZE[SWARM_SIZE.length - 1], rng, groupId++);
      t += 1.5;
    } else {
      plan.spawns.push({ time: t, kind, path: pickPath(kind, rng) });
      t += rng.range(0.5, 1.2) / Math.max(0.3, mode.baseSpawnRate * (0.9 + phase * 0.12));
    }
  }
  plan.spawns.sort((a, b) => a.time - b.time);
}
