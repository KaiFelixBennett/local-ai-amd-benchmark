import type { MapId } from '../core/types';

export type ChainRewardType =
  | 'spawnRareSwarm'
  | 'revealHiddenObject'
  | 'bonusTime'
  | 'timeSlow'
  | 'scoreMultiplier'
  | 'startleFlee';

export interface ChainStation {
  /** Environment object instance id (see config/maps.ts placements). */
  objectId: string;
  delayMs: number;
}

export interface ChainReactionDef {
  id: string;
  mapId: MapId;
  /** Environment object instance id that starts the chain when shot. */
  triggerObjectId: string;
  /** Stations after the trigger, played back in order with their delay. */
  stations: ChainStation[];
  reward: ChainRewardType;
  secret: boolean;
  scoreBonus: number;
}

export const CHAIN_REACTION_CONFIGS: ChainReactionDef[] = [
  {
    id: 'nebelmoor_bell_swarm',
    mapId: 'nebelmoor',
    triggerObjectId: 'bucket1',
    stations: [
      { objectId: 'bucket1', delayMs: 0 },
      { objectId: 'bell1', delayMs: 450 },
    ],
    reward: 'spawnRareSwarm',
    secret: true,
    scoreBonus: 400,
  },
  {
    id: 'nebelmoor_windmill_startle',
    mapId: 'nebelmoor',
    triggerObjectId: 'windmill1',
    stations: [
      { objectId: 'windmill1', delayMs: 0 },
      { objectId: 'scarecrow1', delayMs: 500 },
      { objectId: 'hiddenBottle1', delayMs: 900 },
    ],
    reward: 'revealHiddenObject',
    secret: false,
    scoreBonus: 200,
  },
  {
    id: 'sturmklippen_cart_avalanche',
    mapId: 'sturmklippen',
    triggerObjectId: 'weathervane1',
    stations: [
      { objectId: 'weathervane1', delayMs: 0 },
      { objectId: 'lantern2', delayMs: 400 },
      { objectId: 'abandonedCart1', delayMs: 800 },
      { objectId: 'fenceCans2', delayMs: 1200 },
      { objectId: 'hiddenBottle2', delayMs: 1600 },
    ],
    reward: 'revealHiddenObject',
    secret: true,
    scoreBonus: 600,
  },
  {
    id: 'mondbruch_firefly_convergence',
    mapId: 'mondbruch',
    triggerObjectId: 'firefly1',
    stations: [
      { objectId: 'firefly1', delayMs: 0 },
      { objectId: 'firefly2', delayMs: 350 },
      { objectId: 'ghostLight2', delayMs: 700 },
    ],
    reward: 'timeSlow',
    secret: true,
    scoreBonus: 350,
  },
  {
    id: 'mondbruch_pumpkin_spores',
    mapId: 'mondbruch',
    triggerObjectId: 'pumpkin1',
    stations: [
      { objectId: 'pumpkin1', delayMs: 0 },
      { objectId: 'mushroom1', delayMs: 400 },
    ],
    reward: 'bonusTime',
    secret: false,
    scoreBonus: 250,
  },
];

export function getChainReactionsForMap(mapId: MapId): ChainReactionDef[] {
  return CHAIN_REACTION_CONFIGS.filter((c) => c.mapId === mapId);
}
