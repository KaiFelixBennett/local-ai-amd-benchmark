import type { Rng } from '../types';
import { getTargetDef, TARGET_IDS } from '../config/targets';
import type { PhaseId, TargetDef, TrajectoryKind } from '../config/schema';

export interface SpawnContext {
  mapId: string;
  phase: PhaseId;
  difficulty: number;
  /** active event ids (for weatherOnly gating) */
  activeEvents: string[];
  weatherIds: string[];
  activeTargetCount: number;
  maxConcurrentTargets: number;
  allowedTargets: 'all' | string[];
  eventSpawnRateMult: number;
  elapsedSec: number;
}

export interface SpawnDecision {
  targetId: string;
  trajectory: TrajectoryKind;
  groupSize: number;
  groupIndex: number;
}

/** Trajectories that only make sense past the calm intro. */
const GATED_TRAJECTORIES: Partial<Record<TrajectoryKind, PhaseId[]>> = {
  dive: ['mid', 'intense', 'finale'],
  formation: ['ramp', 'mid', 'intense', 'finale'],
  flee: ['ramp', 'mid', 'intense', 'finale'],
  spiral: ['ramp', 'mid', 'intense', 'finale'],
};

export function targetEligible(def: TargetDef, ctx: SpawnContext): boolean {
  if (ctx.allowedTargets !== 'all' && !ctx.allowedTargets.includes(def.id)) return false;
  if (def.phases && !def.phases.includes(ctx.phase)) return false;
  const isWeatherActive = ctx.activeEvents.some((e) => ctx.weatherIds.includes(e));
  if (def.flags?.weatherOnly && !isWeatherActive) return false;
  // rare targets: intro-safe, never first 8 seconds except forced
  if (def.rare && ctx.elapsedSec < 8) return false;
  const w = weightFor(def, ctx.mapId);
  return w > 0;
}

export function weightFor(def: TargetDef, mapId: string): number {
  const w = def.weights;
  const explicit = w[mapId as keyof typeof w];
  const any = w.any ?? 0;
  return explicit ?? any;
}

/**
 * Pure spawn director. Given the live context and a seeded RNG it produces a
 * deterministic sequence of spawn decisions. The engine executes them.
 */
export class SpawnDirector {
  private cooldown = 0;
  private pendingSwarmGroup: { targetId: string; trajectory: TrajectoryKind; size: number; spawned: number } | null =
    null;
  private swarmGroupDelay = 0;

  constructor(
    private baseInterval: [number, number],
    private rng: Rng,
  ) {}

  setBaseInterval(interval: [number, number]): void {
    this.baseInterval = interval;
  }

  /** Returns decisions to execute this tick. */
  tick(dtSec: number, ctx: SpawnContext): SpawnDecision[] {
    const out: SpawnDecision[] = [];

    // First deliver pending swarm members with small spacing.
    if (this.pendingSwarmGroup) {
      this.swarmGroupDelay -= dtSec;
      if (this.swarmGroupDelay <= 0 && ctx.activeTargetCount + out.length < ctx.maxConcurrentTargets) {
        const g = this.pendingSwarmGroup;
        out.push({ targetId: g.targetId, trajectory: g.trajectory, groupSize: g.size, groupIndex: g.spawned });
        g.spawned += 1;
        this.swarmGroupDelay = 0.12;
        if (g.spawned >= g.size) this.pendingSwarmGroup = null;
      }
      // still respect cooldown as well; fall through
    }

    this.cooldown -= dtSec;
    if (this.cooldown > 0) return out;
    if (ctx.activeTargetCount + out.length >= ctx.maxConcurrentTargets) return out;

    const eligible = this.collectEligible(ctx);
    if (eligible.length === 0) {
      this.cooldown = 0.5; // retry soon
      return out;
    }

    const def = this.rng.weighted(
      eligible.map((d) => ({ item: d, weight: weightFor(d, ctx.mapId) * phaseBoost(d, ctx) })),
    );
    const trajectory = this.pickTrajectory(def, ctx);

    // Swarm handling: spawn as a group.
    if (def.flags?.swarm) {
      const size = this.rng.int(def.flags.swarm.min, def.flags.swarm.max);
      // Spawn the first immediately, queue the rest.
      out.push({ targetId: def.id, trajectory, groupSize: size, groupIndex: 0 });
      if (size > 1) {
        this.pendingSwarmGroup = { targetId: def.id, trajectory, size, spawned: 1 };
        this.swarmGroupDelay = 0.12;
      }
    } else {
      out.push({ targetId: def.id, trajectory, groupSize: 1, groupIndex: 0 });
    }

    // Schedule next decision.
    const [lo, hi] = this.baseInterval;
    const base = this.rng.range(lo, hi);
    // Difficulty speeds spawns up; event multiplier too.
    const eff = base / Math.max(0.5, ctx.difficulty * ctx.eventSpawnRateMult);
    this.cooldown = Math.max(0.25, eff);
    return out;
  }

  private collectEligible(ctx: SpawnContext): TargetDef[] {
    const out: TargetDef[] = [];
    for (const id of allTargetIds()) {
      const def = getTargetDef(id);
      if (targetEligible(def, ctx)) out.push(def);
    }
    return out;
  }

  private pickTrajectory(def: TargetDef, ctx: SpawnContext): TrajectoryKind {
    const allowed = def.allowedTrajectories.filter((traj) => {
      const gate = GATED_TRAJECTORIES[traj];
      if (!gate) return true;
      return gate.includes(ctx.phase);
    });
    if (allowed.length > 0) return this.rng.pick(allowed);
    // fall back to line if everything was gated
    return 'line';
  }
}

function phaseBoost(def: TargetDef, ctx: SpawnContext): number {
  // Intro: prefer easy common targets. Finale: rare & weather birds boosted.
  if (ctx.phase === 'intro' && def.id === 'moorflatterer') return 1.8;
  if ((ctx.phase === 'intense' || ctx.phase === 'finale') && def.rare) return 2.2;
  if (ctx.phase === 'finale') return 1.1;
  return 1;
}

// Re-exported for test introspection.
export function allTargetIds(): string[] {
  return TARGET_IDS;
}
