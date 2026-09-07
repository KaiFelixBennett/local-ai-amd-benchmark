/**
 * Spawn Director — decides WHAT to spawn and WHEN, purely and deterministically
 * given an RNG, difficulty, map and mode. Returns spawn descriptors that the
 * scene turns into live entities. Unit-testable.
 */

import type { MapId, TargetConfig, TargetKind, TrajectoryDef, Vec2 } from './types';
import { TARGETS, SPAWNABLE } from './targets';
import { unlockLevel, speedFactor } from './difficulty';
import type { Rng } from './rng';

export interface SpawnContext {
  width: number;
  height: number;
  map: MapId;
  /** 0..1 difficulty */
  difficulty: number;
  /** ms since round start */
  elapsedMs: number;
  /** round phase 0..1 (0 calm start .. 1 intense finale) */
  phase: number;
  /** active event id, or null */
  event: string | null;
}

export interface SpawnDescriptor {
  kind: TargetKind;
  config: TargetConfig;
  trajectory: TrajectoryDef;
  spawnAt: number; // ms from now
  scale: number; // depth-based scale at spawn
}

/** Build a weighted list of eligible target kinds for the context. */
export function eligibleKinds(ctx: SpawnContext, _rng: Rng): TargetKind[] {
  const level = unlockLevel(ctx.difficulty);
  const list: TargetKind[] = [];
  for (const kind of SPAWNABLE) {
    const cfg = TARGETS[kind];
    if (cfg.maps.length && !cfg.maps.includes(ctx.map)) continue;
    if (cfg.minDifficulty > ctx.difficulty + 0.05) continue;
    if (kind === 'sturmvogel' && ctx.map !== 'sturmklippen') continue;
    // weight ramp: higher-level targets fade in with difficulty
    list.push(kind);
    void level;
  }
  return list;
}

/** Choose a kind by weight (with a small randomness for variety). */
export function chooseKind(ctx: SpawnContext, rng: Rng): TargetKind {
  const kinds = eligibleKinds(ctx, rng);
  if (kinds.length === 0) return 'moorflatterer';
  const weights = kinds.map((k) => {
    const cfg = TARGETS[k];
    // rare targets (gold) get a small boost from phase pressure
    let w = cfg.weight;
    if (k === 'goldschnabel' && ctx.phase > 0.7) w *= 1.5;
    if (ctx.event === 'goldenswarm' && (k === 'goldschnabel' || k === 'schwarmvogel')) w *= 3;
    return w;
  });
  const idx = rng.weightedIndex(weights);
  return kinds[idx];
}

/** Pick a random entry/exit pair along screen edges. */
export function pickPath(rng: Rng, width: number, height: number): { from: Vec2; to: Vec2 } {
  const edge = rng.pick(['l', 'r', 't', 'b'] as const);
  const m = 60; // margin outside screen
  const pick = (which: 'l' | 'r' | 't' | 'b'): Vec2 => {
    if (which === 'l') return { x: -m, y: rng.range(0.1 * height, 0.85 * height) };
    if (which === 'r') return { x: width + m, y: rng.range(0.1 * height, 0.85 * height) };
    if (which === 't') return { x: rng.range(0.05 * width, 0.95 * width), y: -m };
    return { x: rng.range(0.05 * width, 0.95 * width), y: height + m };
  };
  const from = pick(edge);
  // opposite-ish exit
  const opposite = edge === 'l' ? 'r' : edge === 'r' ? 'l' : edge === 't' ? 'b' : 't';
  const to = pick(opposite);
  return { from, to };
}

function makeTrajectory(cfg: TargetConfig, ctx: SpawnContext, rng: Rng): TrajectoryDef {
  const { width, height } = ctx;
  const { from, to } = pickPath(rng, width, height);
  const trajKind = cfg.trajectories.length ? rng.pick(cfg.trajectories) : 'linear';
  const speedMult = rng.range(cfg.speedMin, cfg.speedMax) * speedFactor(ctx.difficulty);
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const baseSpeed = 220 * speedMult;
  const duration = Math.max(1500, Math.min(14000, (dist / baseSpeed) * 1000));
  const depth = trajKind === 'depth' ? rng.range(0.3, 1) : rng.range(0.75, 1);
  return {
    kind: trajKind,
    start: from,
    end: to,
    duration,
    amplitude:
      trajKind === 'sine' || trajKind === 'zigzag'
        ? rng.range(30, 90)
        : trajKind === 'spiral'
          ? rng.range(60, 120)
          : 40,
    waves: rng.int(1, 3),
    depth,
    baseSpeed
  };
}

/** Produce one (or a few, for swarms) spawn descriptors for the next tick. */
export function nextSpawns(ctx: SpawnContext, rng: Rng): SpawnDescriptor[] {
  const out: SpawnDescriptor[] = [];
  const kind = chooseKind(ctx, rng);
  const cfg = TARGETS[kind];
  const traj = makeTrajectory(cfg, ctx, rng);
  const scale = 0.5 + (traj.depth ?? 1) * 0.6;
  out.push({ kind, config: cfg, trajectory: traj, spawnAt: 0, scale });

  // Swarms spawn in a formation of 4-6
  if (kind === 'schwarmvogel' && ctx.phase > 0.2) {
    const count = rng.int(4, 6);
    const base = traj;
    for (let i = 1; i < count; i++) {
      const offset = (i - (count - 1) / 2) * 46;
      out.push({
        kind,
        config: cfg,
        trajectory: {
          ...base,
          start: { x: base.start.x + offset, y: base.start.y + (i % 2 ? 30 : -30) },
          end: { x: base.end.x + offset, y: base.end.y + (i % 2 ? 30 : -30) }
        },
        spawnAt: i * 90,
        scale
      });
    }
  }
  return out;
}
