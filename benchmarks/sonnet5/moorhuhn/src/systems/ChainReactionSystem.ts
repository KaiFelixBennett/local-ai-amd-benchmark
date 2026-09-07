import type { MapId } from '../core/types';
import { getChainReactionsForMap, type ChainReactionDef } from '../config/chainReactions';

/**
 * Registry + one-shot bookkeeping for environment chain reactions. The
 * actual timed playback (staggering station animations/sounds) is owned by
 * GameScene via Phaser timers; this class only decides *whether* a shot on
 * a given environment object should start a chain, and prevents the same
 * chain from firing twice in one round.
 */
export class ChainReactionSystem {
  private readonly defsByTrigger = new Map<string, ChainReactionDef>();
  private triggeredIds = new Set<string>();

  constructor(mapId: MapId) {
    for (const def of getChainReactionsForMap(mapId)) {
      this.defsByTrigger.set(def.triggerObjectId, def);
    }
  }

  /** Returns the chain to play if this object id starts one and hasn't already fired this round. */
  tryTrigger(objectId: string): ChainReactionDef | null {
    const def = this.defsByTrigger.get(objectId);
    if (!def) return null;
    if (this.triggeredIds.has(def.id)) return null;
    this.triggeredIds.add(def.id);
    return def;
  }

  hasTriggered(chainId: string): boolean {
    return this.triggeredIds.has(chainId);
  }

  getTriggeredCount(): number {
    return this.triggeredIds.size;
  }

  /** Longest station count among chains triggered this round (used for the "chain of 5" challenge). */
  getLongestTriggeredChainStations(): number {
    let max = 0;
    for (const def of this.defsByTrigger.values()) {
      if (this.triggeredIds.has(def.id)) max = Math.max(max, def.stations.length);
    }
    return max;
  }

  reset(): void {
    this.triggeredIds.clear();
  }
}
