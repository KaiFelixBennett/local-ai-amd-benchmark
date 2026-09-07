/**
 * Spawn-Regie: bestimmt, WANN und WAS erscheint – gewichtet nach Modus,
 * Karte, Rundenphase, Schwierigkeitsfaktor und aktiven Ereignissen.
 * Die Auswahl-Logik ist als pure Funktion getrennt und damit testbar.
 */
import type { MapId, ModeId, TargetId } from '../core/types';
import { MODES, TARGETS, type TargetConfig } from '../config/gameConfig';
import { Rng } from '../core/rng';

export interface SpawnRequest {
  targetId: TargetId;
  depth: number;
  groupId: number | null;
  count: number;
  illusion?: boolean;
}

const ALL_TARGETS: TargetConfig[] = Object.values(TARGETS);

/** Pures Auswahlevent – für Tests. */
export interface SelectionContext {
  mapId: MapId;
  mode: ModeId;
  eventExtra: TargetId | null;
  /** Id des aktuell aktiven Ereignisses (null = keins). */
  activeEvent: string | null;
  activeCounts: Partial<Record<TargetId, number>>;
  rng: Rng;
  /** 0..1 – Rundenfortschritt, für seltene Spawns im Finale. */
  progress: number;
}

/**
 * Wählt das nächste Ziel aus.
 * Regeln: Karte-Exklusivität, Event-Voraussetzungen, maxConcurrent,
 * seltene Ziele nur mit Glück, Schwärme für bestimmte Zielarten.
 */
export function chooseSpawn(ctx: SelectionContext): SpawnRequest | null {
  const { rng, mapId, activeCounts, eventExtra } = ctx;

  // 1) Event-bedingte Zusatzziele haben Vorrang
  if (eventExtra) {
    const cfg = TARGETS[eventExtra];
    if (cfg && (activeCounts[eventExtra] ?? 0) < cfg.maxConcurrent) {
      return { targetId: eventExtra, depth: 0.9, groupId: null, count: 1 };
    }
  }

  // 2) Gewichtete Auswahl
  const candidates = ALL_TARGETS.filter((t) => {
    if (!t.id) return false;
    if (t.boss) return false; // Bosse kommen nur über das Event-System
    if (t.exclusiveMaps && !t.exclusiveMaps.includes(mapId)) return false;
    if (t.requiresEvent && t.requiresEvent !== ctx.activeEvent) return false;
    if ((activeCounts[t.id] ?? 0) >= t.maxConcurrent) return false;
    return true;
  });

  if (candidates.length === 0) return null;

  let totalWeight = 0;
  for (const c of candidates) totalWeight += c.spawnWeight;
  let roll = rng.next() * totalWeight;
  let chosen = candidates[0];
  for (const c of candidates) {
    roll -= c.spawnWeight;
    if (roll <= 0) {
      chosen = c;
      break;
    }
  }

  // 3) Seltene Ziele: nur mit Glück, später in der Runde wahrscheinlicher
  if (chosen.rare) {
    const lateBonus = ctx.progress > 0.7 ? 0.25 : 0;
    if (!rng.chance(0.15 + lateBonus)) {
      // Auf ein anderes Ziel ausweichen
      const fallback = candidates.find((c) => c.id !== chosen.id);
      if (!fallback) return null;
      chosen = fallback;
    }
  }

  // 4) Schwarm für bestimmte Ziele
  const swarmChance = chosen.id === 'schwarmvogel' ? 0.3 : chosen.id === 'goldschnabel' ? 0.15 : 0;
  if (rng.chance(swarmChance)) {
    const size = 3 + rng.int(0, 2);
    return { targetId: chosen.id, depth: 1.0, groupId: rng.int(1, 1_000_000), count: size };
  }

  const [dMin, dMax] = chosen.flight.depth;
  return { targetId: chosen.id, depth: rng.range(dMin, dMax), groupId: null, count: 1 };
}

/**
 * Die Regie selbst: taktet Spawn-Intervalle.
 */
export class Spawner {
  private nextSpawnAt = 0;
  private rng: Rng;
  private mode: ModeId;
  private mapId: MapId;

  constructor(mapId: MapId, mode: ModeId, rng: Rng) {
    this.mapId = mapId;
    this.mode = mode;
    this.rng = rng;
  }

  get modeCfg() {
    return MODES[this.mode];
  }

  /** Initialisiert den ersten Spawn. */
  begin(nowMs: number): void {
    this.nextSpawnAt = nowMs + 800;
  }

  /**
   * Soll jetzt gespawnt werden?
   */
  due(nowMs: number, _phaseMult: number, _difficulty: number): boolean {
    return nowMs >= this.nextSpawnAt;
  }

  /** After einem Spawn: nächstes Zeitfenster berechnen. */
  rollNext(nowMs: number, phaseMult: number, difficulty: number): void {
    const [lo, hi] = this.modeCfg.spawnInterval;
    const base = this.rng.range(lo, hi);
    const scaled = base / (phaseMult * difficulty);
    this.nextSpawnAt = nowMs + Math.max(180, scaled);
  }

  request(
    nowMs: number,
    phaseMult: number,
    difficulty: number,
    activeCounts: Partial<Record<TargetId, number>>,
    eventExtra: TargetId | null,
    activeEvent: string | null,
    progress: number,
  ): SpawnRequest | null {
    if (!this.due(nowMs, phaseMult, difficulty)) return null;
    const req = chooseSpawn({
      mapId: this.mapId,
      mode: this.mode,
      eventExtra,
      activeEvent,
      activeCounts,
      rng: this.rng,
      progress,
    });
    this.rollNext(nowMs, phaseMult, difficulty);
    return req;
  }
}
