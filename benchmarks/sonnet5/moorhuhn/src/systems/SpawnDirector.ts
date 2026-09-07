import type { MapId, ScreenEdge, TargetConfig, TargetTypeId, WeatherEventId } from '../core/types';
import { SeededRandom } from '../core/rng';
import { TARGET_LIST } from '../config/targets';
import { MAP_CONFIGS, getMapConfig } from '../config/maps';
import { BALANCE } from '../config/balance';

export interface SpawnDecisionContext {
  mapId: MapId;
  activeEvent: WeatherEventId | null;
  progress01: number; // 0..1 elapsed / total round duration (1 for endless -> use soft loop externally)
  difficultyFactor: number;
  modeSpawnRateMultiplier: number;
  eventSpawnRateMultiplier: number;
}

const EDGES: ScreenEdge[] = ['left', 'right', 'top', 'bottom'];

/** Which map "owns" each map-exclusive target species, derived once from MAP_CONFIGS. */
const MAP_OWNER_BY_TARGET: Partial<Record<TargetTypeId, MapId>> = (() => {
  const owner: Partial<Record<TargetTypeId, MapId>> = {};
  for (const mapConfig of Object.values(MAP_CONFIGS)) {
    for (const targetId of mapConfig.exclusiveTargets) {
      owner[targetId] = mapConfig.id;
    }
  }
  return owner;
})();

/**
 * Decides *what* spawns and *when*, independent of rendering. GameScene owns
 * the Phaser side (creating sprites, pooling) and just asks this class for
 * decisions each tick.
 */
export class SpawnDirector {
  private rng: SeededRandom;

  constructor(seed: number) {
    this.rng = new SeededRandom(seed).fork('spawn-director');
  }

  /** Eligible, spawnable target pool for the current context (map exclusivity + active event gating). */
  getEligibleTargets(ctx: SpawnDecisionContext): TargetConfig[] {
    // guarantees the map config exists / throws early on a bad id
    getMapConfig(ctx.mapId);
    return TARGET_LIST.filter((target) => {
      if (target.onlyDuringEvent && target.onlyDuringEvent !== ctx.activeEvent) return false;
      const owningMap = MAP_OWNER_BY_TARGET[target.id];
      if (owningMap && owningMap !== ctx.mapId) return false;
      return true;
    });
  }

  pickTargetType(ctx: SpawnDecisionContext): TargetTypeId {
    const pool = this.getEligibleTargets(ctx);
    const weights = pool.map((t) => t.rarity);
    return this.rng.pickWeighted(pool, weights).id;
  }

  pickEntryEdge(): ScreenEdge {
    return this.rng.pick(EDGES);
  }

  /** Returns the delay, in ms, until the next spawn given current pressure (difficulty, mode, events). */
  nextSpawnDelayMs(ctx: SpawnDecisionContext): number {
    const phaseFactor = this.phaseFactor(ctx.progress01);
    const combined =
      ctx.difficultyFactor * ctx.modeSpawnRateMultiplier * ctx.eventSpawnRateMultiplier * phaseFactor;
    const base = BALANCE.spawn.baseSpawnIntervalMs / Math.max(0.1, combined);
    const jitter = this.rng.range(0.85, 1.15);
    return Math.max(BALANCE.spawn.minSpawnIntervalMs, Math.round(base * jitter));
  }

  /** Dramaturgic curve: calm start, ramp-up, brief lull, intense finale. */
  private phaseFactor(progress01: number): number {
    if (progress01 < 0.12) return 0.6; // ruhiger Einstieg
    if (progress01 < 0.35) return 0.6 + ((progress01 - 0.12) / 0.23) * 0.6; // erste Beschleunigung
    if (progress01 < 0.5) return 1.2; // besonderes Zwischenereignis Plateau
    if (progress01 < 0.6) return 0.85; // kurze Erholungsphase
    if (progress01 < 0.88) return 1.2 + ((progress01 - 0.6) / 0.28) * 0.6; // intensive Schlussphase
    return 2.0; // spektakuläres Finale
  }

  fork(label: string): SeededRandom {
    return this.rng.fork(label);
  }

  getRng(): SeededRandom {
    return this.rng;
  }
}
