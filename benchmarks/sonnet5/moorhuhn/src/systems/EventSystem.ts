import type { MapId, WeatherEventId } from '../core/types';
import { SeededRandom } from '../core/rng';
import { EVENT_CONFIGS, getEventConfig } from '../config/events';
import { getMapConfig } from '../config/maps';

export interface EventTransition {
  active: WeatherEventId | null;
  justStarted: WeatherEventId | null;
  justEnded: WeatherEventId | null;
}

interface ActiveEvent {
  id: WeatherEventId;
  startedAt: number;
  durationMs: number;
}

/**
 * Drives the round's weather/event dramaturgy: picks the next event from the
 * current map's pool (respecting per-event cooldowns and rarity weights),
 * tracks its active window, and guarantees the map's signature event fires
 * at least once, plus a guaranteed spectacular finale near round end.
 */
export class EventSystem {
  private rng: SeededRandom;
  private active: ActiveEvent | null = null;
  private cooldownUntil = new Map<WeatherEventId, number>();
  private signatureEventFired = false;
  private financeFired = false;
  private readonly mapId: MapId;
  private nextCheckAt = 0;

  constructor(seed: number, mapId: MapId) {
    this.rng = new SeededRandom(seed).fork('event-system');
    this.mapId = mapId;
  }

  update(now: number, progress01: number): EventTransition {
    let justStarted: WeatherEventId | null = null;
    let justEnded: WeatherEventId | null = null;

    if (this.active && now - this.active.startedAt >= this.active.durationMs) {
      justEnded = this.active.id;
      this.cooldownUntil.set(this.active.id, now + getEventConfig(this.active.id).cooldownMs);
      this.active = null;
    }

    if (!this.active && now >= this.nextCheckAt) {
      this.nextCheckAt = now + 2500;
      const picked = this.decideNextEvent(now, progress01);
      if (picked) {
        this.active = { id: picked, startedAt: now, durationMs: this.rollDuration(picked) };
        justStarted = picked;
        if (picked === getMapConfig(this.mapId).signatureEvent) this.signatureEventFired = true;
        if (picked === 'featherstorm' || picked === 'miniBoss') this.financeFired = true;
      }
    }

    return { active: this.active?.id ?? null, justStarted, justEnded };
  }

  forceTrigger(id: WeatherEventId, now: number): void {
    this.active = { id, startedAt: now, durationMs: this.rollDuration(id) };
  }

  getActive(): WeatherEventId | null {
    return this.active?.id ?? null;
  }

  getActiveElapsedMs(now: number): number {
    return this.active ? now - this.active.startedAt : 0;
  }

  reset(): void {
    this.active = null;
    this.cooldownUntil.clear();
    this.signatureEventFired = false;
    this.financeFired = false;
    this.nextCheckAt = 0;
  }

  private rollDuration(id: WeatherEventId): number {
    const cfg = getEventConfig(id);
    return this.rng.intRange(cfg.minDurationMs, cfg.maxDurationMs);
  }

  private decideNextEvent(now: number, progress01: number): WeatherEventId | null {
    const map = getMapConfig(this.mapId);
    const pool = map.weatherPool.filter((id) => (this.cooldownUntil.get(id) ?? 0) <= now);
    if (pool.length === 0) return null;

    // Guarantee the finale reads as spectacular: past 90% progress, force a
    // high-impact event if none has happened yet this round.
    if (progress01 > 0.9 && !this.financeFired) {
      const finale = pool.includes('featherstorm')
        ? 'featherstorm'
        : pool.includes('miniBoss')
          ? 'miniBoss'
          : null;
      if (finale) return finale;
    }

    // Guarantee the map's signature event shows up at least once mid-round.
    if (progress01 > 0.3 && progress01 < 0.7 && !this.signatureEventFired && pool.includes(map.signatureEvent)) {
      if (this.rng.chance(0.4)) return map.signatureEvent;
    }

    // Otherwise a normal weighted-random roll, with a chance of "no event right now".
    if (!this.rng.chance(0.35)) return null;
    const weights = pool.map((id) => EVENT_CONFIGS[id].rarity);
    return this.rng.pickWeighted(pool, weights);
  }
}
