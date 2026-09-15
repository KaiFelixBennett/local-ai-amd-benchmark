import type { Rng } from '../types';
import { getEventDef } from '../config/events';
import { getBossDef } from '../config/targets';
import type { EventDef, PhaseId } from '../config/schema';
import type { ModeDef } from '../config/schema';

export interface EventState {
  id: string;
  def: EventDef;
  timeLeft: number;
}

export interface RoundDirectorContext {
  elapsed: number; // game seconds since round start
  duration: number | null; // null = endless
  difficulty: number;
  mapEventPool: string[];
  mapId: string;
}

/**
 * Owns the dramatic phase timeline and the scheduling of dynamic events.
 * Pure and deterministic given its RNG.
 */
export class RoundDirector {
  private phases: { id: PhaseId; from: number; to: number }[];
  private _phase: PhaseId = 'intro';
  private _event: EventState | null = null;
  private eventCooldown = 12;
  private eventsUsed = new Set<string>();
  private bossUsed = false;
  /** phase progress 0..1 within the current phase */
  bossScheduledAt: number | null = null;

  constructor(private mode: ModeDef) {
    this.phases = mode.phases;
  }

  get phase(): PhaseId {
    return this._phase;
  }

  get activeEvent(): EventState | null {
    return this._event;
  }

  get eventTimeLeft(): number {
    return this._event?.timeLeft ?? 0;
  }

  update(
    dt: number,
    ctx: RoundDirectorContext,
    rng: Rng,
  ): { phaseChanged: boolean; eventStarted: string | null; eventEnded: string | null; bossId: string | null } {
    let phaseChanged = false;
    let eventStarted: string | null = null;
    let eventEnded: string | null = null;
    const bossId: string | null = null;

    // Phase tracking.
    const progress = this.progressOf(ctx);
    const newPhase = this.phaseFor(progress);
    if (newPhase !== this._phase) {
      this._phase = newPhase;
      phaseChanged = true;
    }

    // Event lifecycle.
    if (this._event) {
      this._event.timeLeft -= dt;
      if (this._event.timeLeft <= 0) {
        eventEnded = this._event.id;
        this._event = null;
        this.eventCooldown = rng.range(8, 16) / Math.max(0.8, ctx.difficulty);
      }
    } else {
      this.eventCooldown -= dt;
      if (this.eventCooldown <= 0) {
        const started = this.tryStartEvent(ctx, rng);
        if (started) eventStarted = started;
        else this.eventCooldown = 6;
      }
    }

    return { phaseChanged, eventStarted, eventEnded, bossId };
  }

  private progressOf(ctx: RoundDirectorContext): number {
    if (ctx.duration == null) {
      // endless: loop phases over a 3-minute window, weighted by difficulty ramp
      return (ctx.elapsed % 180) / 180;
    }
    return Math.min(1, ctx.elapsed / ctx.duration);
  }

  private phaseFor(progress: number): PhaseId {
    let out: PhaseId = 'intro';
    for (const p of this.phases) {
      if (progress >= p.from) out = p.id;
      if (progress < p.to) return p.id;
    }
    return out;
  }

  /** True when events of this phase may pick a boss. */
  private tryStartEvent(ctx: RoundDirectorContext, rng: Rng): string | null {
    const pool = ctx.mapEventPool.filter((id) => {
      const def = getEventDef(id);
      if (def.allowedMaps && !def.allowedMaps.includes(ctx.mapId as never)) return false;
      if (def.minPhase && !phaseAtLeast(this._phase, def.minPhase)) return false;
      if (id === 'boss') {
        if (this.bossUsed || this.mode.bossChance <= 0) return false;
        if (!rng.chance(this.mode.bossChance)) return false;
        if (this.phaseOrder(this._phase) < this.phaseOrder('mid')) return false;
      }
      return true;
    });
    if (pool.length === 0) return null;
    // Slightly down-weight events that already ran, to vary the round.
    const items = pool.map((id) => ({
      item: id,
      weight: getEventDef(id).weight * (this.eventsUsed.has(id) ? 0.35 : 1),
    }));
    const chosen = rng.weighted(items);
    const def = getEventDef(chosen);
    this._event = { id: chosen, def, timeLeft: def.durationSec };
    this.eventsUsed.add(chosen);
    if (chosen === 'boss') {
      this.bossUsed = true;
      this.bossScheduledAt = ctx.elapsed;
    }
    return chosen;
  }

  private phaseOrder(p: PhaseId): number {
    return ['intro', 'ramp', 'mid', 'rest', 'intense', 'finale'].indexOf(p);
  }

  /** Force an event (used by chain reactions / tutorial). */
  forceEvent(id: string, durationOverride?: number, elapsed: number = 0): void {
    const def = getEventDef(id);
    this._event = { id, def, timeLeft: durationOverride ?? def.durationSec };
    this.eventsUsed.add(id);
    if (id === 'boss') {
      this.bossUsed = true;
      this.bossScheduledAt = elapsed;
    }
  }

  clearEvent(): void {
    this._event = null;
    this.eventCooldown = 8;
  }

  /** Pick a boss definition for the current map/phase. */
  pickBoss(mapId: string, rng: Rng): string | null {
    const candidates = ['boss_eisenmoor', 'boss_blitzschnabel', 'boss_nachtschatten'].filter((id) => {
      const b = getBossDef(id);
      return b.allowedMaps.includes(mapId as never) && phaseAtLeast(this._phase, b.minPhase);
    });
    if (candidates.length === 0) return null;
    return rng.pick(candidates);
  }
}

function phaseAtLeast(current: PhaseId, min: PhaseId): boolean {
  const order = ['intro', 'ramp', 'mid', 'rest', 'intense', 'finale'];
  // rest counts as >= mid
  return order.indexOf(current) >= order.indexOf(min);
}
