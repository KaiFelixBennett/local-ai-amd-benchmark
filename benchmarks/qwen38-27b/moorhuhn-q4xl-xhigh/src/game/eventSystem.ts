/**
 * Event-System: plant moor-typische Ereignisse entlang des Rundenfortschritts,
 * waltet Aktive (Dauer, Score-Multiplikator, Wind, Zeitskalierung, Boss)
 * und meldet Start/Ende über den EventBus.
 */
import type { MapId, ModeId, TargetId } from '../core/types';
import { BOSS_TABLE, EVENTS, MAPS, MODES, type EventConfig } from '../config/gameConfig';
import { Rng } from '../core/rng';
import type { EventBus } from '../core/events';

export interface ActiveEvent {
  cfg: EventConfig;
  startedAt: number;
  endsAt: number;
}

export class EventSystem {
  private active: ActiveEvent | null = null;
  private scheduled: { atProgress: number; id: EventConfig['id'] }[] = [];
  private fired = new Set<string>();
  private windBase: number;
  private events: EventBus;
  private mapId: MapId;
  private mode: ModeId;
  private rng: Rng;
  /** Extra-Spawns des aktiven Events (Ziel-IDs). */
  private extraSpawns: TargetId[] = [];
  /** Gewichtung des Extra-Spawns. */
  private extraWeight = 0;
  /** Boss des aktiven Events (falls vorhanden). */
  private bossPending: TargetId | null = null;

  constructor(mapId: MapId, mode: ModeId, rng: Rng, events: EventBus) {
    this.mapId = mapId;
    this.mode = mode;
    this.rng = rng;
    this.events = events;
    this.windBase = MAPS[mapId].baseWind;
    if (MODES[mode].events) this.schedule();
  }

  /** Ereignisse für die Runde planen (deterministisch über den Seed). */
  private schedule(): void {
    const map = MAPS[this.mapId];
    const pool = Object.values(EVENTS).filter((e) => {
      if (e.id === 'mini_boss') return false; // kommt nur über die Boss-Planung
      if (e.maps && !e.maps.includes(this.mapId)) return false;
      if (this.mode === 'tutorial') return e.id === 'fog' || e.id === 'frog_concert';
      if (this.mode === 'zen') return ['golden_swarm', 'featherstorm', 'time_rift'].includes(e.id);
      return true;
    });

    const preferred = pool.filter((e) => map.favoredEvents.includes(e.id));
    const rest = pool.filter((e) => !map.favoredEvents.includes(e.id));

    const picks: EventConfig[] = [];
    for (const p of preferred) {
      if (picks.length < 2 && this.rng.chance(0.85)) picks.push(p);
    }
    const shuffledRest = this.rng.shuffle(rest);
    while (picks.length < 4 && shuffledRest.length > 0) {
      picks.push(shuffledRest.shift()!);
    }

    const positions = this.rng.shuffle([0.14, 0.34, 0.55, 0.75, 0.88]).slice(0, picks.length);
    for (let i = 0; i < picks.length; i++) {
      this.scheduled.push({ atProgress: positions[i], id: picks[i].id });
    }
    this.scheduled.sort((a, b) => a.atProgress - b.atProgress);

    // Karte-spezifisches Spezialereignis
    if (MODES[this.mode].bosses || map.specialEvent !== 'mini_boss') {
      this.scheduled.push({ atProgress: 0.5, id: map.specialEvent });
    }
    // Mini-Boss im späten Teil der Runde
    if (MODES[this.mode].bosses) {
      this.scheduled.push({ atProgress: 0.68, id: 'mini_boss' });
    }
  }

  get activeEvent(): ActiveEvent | null {
    return this.active;
  }

  get scoreMult(): number {
    return this.active ? this.active.cfg.scoreMult : 1;
  }

  get wind(): number {
    if (!this.active) return this.windBase;
    const id = this.active.cfg.id;
    if (id === 'crosswind' || id === 'thunderstorm') return this.windBase + 90;
    return this.windBase;
  }

  get timeScale(): number {
    return this.active?.cfg.timeScale ?? 1;
  }

  /** Boss, der erscheinen soll (null = keiner). Wird nach Abholung zurückgesetzt. */
  get bossTarget(): TargetId | null {
    return this.bossPending;
  }

  /** Boss abholen (einmalig). */
  consumeBoss(): TargetId | null {
    const b = this.bossPending;
    this.bossPending = null;
    return b;
  }

  /** Tick: plant Start/Ende. progress ∈ [0,1]. */
  tick(nowMs: number, progress: number): void {
    if (!this.active) {
      while (this.scheduled.length > 0 && this.scheduled[0].atProgress <= progress) {
        const next = this.scheduled.shift()!;
        if (this.fired.has(next.id) || this.active) break;
        this.startEvent(next.id, nowMs);
      }
    } else if (nowMs >= this.active.endsAt) {
      const ended = this.active;
      this.active = null;
      this.extraSpawns = [];
      this.extraWeight = 0;
      this.events.emit('event-ended', { eventId: ended.cfg.id });
    }
  }

  private startEvent(id: EventConfig['id'], nowMs: number): void {
    const cfg = EVENTS[id];
    if (!cfg) return;
    const [dMin, dMax] = cfg.duration;
    const duration = this.rng.range(dMin, dMax) * (this.mode === 'zen' ? 0.85 : 1);
    this.active = { cfg, startedAt: nowMs, endsAt: nowMs + duration };
    this.fired.add(id);
    this.extraSpawns = [];
    this.extraWeight = 0;
    this.bossPending = null;

    if (cfg.extraSpawn) {
      this.extraSpawns = [cfg.extraSpawn.target];
      this.extraWeight = cfg.extraSpawn.weight;
    }
    if (id === 'mini_boss') {
      this.bossPending = this.pickBoss();
    }
    this.events.emit('event-started', { eventId: id, durationMs: duration });
  }

  /** Boss je Karte gewichtet auswählen. */
  private pickBoss(): TargetId {
    const table = BOSS_TABLE[this.mapId];
    const total = table.reduce((s, e) => s + e.weight, 0);
    let roll = this.rng.next() * total;
    for (const entry of table) {
      roll -= entry.weight;
      if (roll <= 0) return entry.boss;
    }
    return table[0].boss;
  }

  /** Extra-Spawn des aktiven Events (gewichtete Chance). */
  popExtraSpawn(): TargetId | null {
    if (this.extraSpawns.length === 0 || !this.active) return null;
    if (!this.rng.chance(Math.min(0.8, 0.2 + this.extraWeight / 25))) return null;
    return this.extraSpawns[this.rng.int(0, this.extraSpawns.length - 1)];
  }

  reset(): void {
    this.active = null;
    this.scheduled = [];
    this.fired.clear();
    this.bossPending = null;
    this.extraSpawns = [];
  }
}
