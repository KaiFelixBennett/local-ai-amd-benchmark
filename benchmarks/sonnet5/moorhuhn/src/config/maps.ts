import type { MapId, TargetTypeId, WeatherEventId } from '../core/types';

export interface ParallaxLayerConfig {
  key: string;
  scrollFactor: number;
  depth: number;
  /** Vertical anchor 0..1 from top of screen. */
  yAnchor: number;
  tint: number;
}

export interface EnvironmentObjectPlacement {
  id: string;
  type: EnvironmentObjectType;
  x: number; // normalized 0..1
  y: number; // normalized 0..1
  scale: number;
}

export type EnvironmentObjectType =
  | 'windmill'
  | 'lantern'
  | 'fenceCans'
  | 'signpost'
  | 'bell'
  | 'scarecrow'
  | 'pumpkin'
  | 'mushroom'
  | 'waterSplash'
  | 'bucket'
  | 'treeHollow'
  | 'reedBundle'
  | 'abandonedCart'
  | 'weathervane'
  | 'hiddenBottle'
  | 'firefly'
  | 'ghostLight';

export interface MapConfig {
  id: MapId;
  nameKey: string;
  descriptionKey: string;
  unlockLevel: number;
  skyColorTop: number;
  skyColorBottom: number;
  fogColor: number;
  ambienceKey: string;
  parallaxLayers: ParallaxLayerConfig[];
  environmentObjects: EnvironmentObjectPlacement[];
  exclusiveTargets: TargetTypeId[];
  weatherPool: WeatherEventId[];
  signatureEvent: WeatherEventId;
  secretChainReactionId: string;
}

export const MAP_CONFIGS: Record<MapId, MapConfig> = {
  nebelmoor: {
    id: 'nebelmoor',
    nameKey: 'map.nebelmoor.name',
    descriptionKey: 'map.nebelmoor.desc',
    unlockLevel: 1,
    skyColorTop: 0xffb37a,
    skyColorBottom: 0xf2895c,
    fogColor: 0xd9c9b8,
    ambienceKey: 'ambience_nebelmoor',
    parallaxLayers: [
      { key: 'sky', scrollFactor: 0, depth: -100, yAnchor: 0, tint: 0xffffff },
      { key: 'farHills', scrollFactor: 0.08, depth: -90, yAnchor: 0.32, tint: 0xc99a78 },
      { key: 'reedsFar', scrollFactor: 0.18, depth: -80, yAnchor: 0.55, tint: 0x8a7550 },
      { key: 'waterPlane', scrollFactor: 0.3, depth: -70, yAnchor: 0.68, tint: 0x6f8f7c },
      { key: 'reedsNear', scrollFactor: 0.5, depth: 40, yAnchor: 0.85, tint: 0x5c6b3f },
    ],
    environmentObjects: [
      { id: 'windmill1', type: 'windmill', x: 0.08, y: 0.42, scale: 1.1 },
      { id: 'lantern1', type: 'lantern', x: 0.18, y: 0.6, scale: 0.8 },
      { id: 'fenceCans1', type: 'fenceCans', x: 0.28, y: 0.72, scale: 0.9 },
      { id: 'signpost1', type: 'signpost', x: 0.4, y: 0.68, scale: 0.85 },
      { id: 'bell1', type: 'bell', x: 0.5, y: 0.4, scale: 0.9 },
      { id: 'bucket1', type: 'bucket', x: 0.5, y: 0.5, scale: 0.7 },
      { id: 'treeHollow1', type: 'treeHollow', x: 0.65, y: 0.55, scale: 1.0 },
      { id: 'reedBundle1', type: 'reedBundle', x: 0.75, y: 0.78, scale: 0.9 },
      { id: 'hiddenBottle1', type: 'hiddenBottle', x: 0.83, y: 0.7, scale: 0.6 },
      { id: 'scarecrow1', type: 'scarecrow', x: 0.9, y: 0.6, scale: 1.0 },
    ],
    exclusiveTargets: ['nebelfluesterer'],
    weatherPool: ['fog', 'reedRush', 'frogChorus', 'balloons', 'timeRift'],
    signatureEvent: 'fog',
    secretChainReactionId: 'nebelmoor_bell_swarm',
  },
  sturmklippen: {
    id: 'sturmklippen',
    nameKey: 'map.sturmklippen.name',
    descriptionKey: 'map.sturmklippen.desc',
    unlockLevel: 4,
    skyColorTop: 0x35506b,
    skyColorBottom: 0x6a8aa0,
    fogColor: 0xaebfc9,
    ambienceKey: 'ambience_sturmklippen',
    parallaxLayers: [
      { key: 'sky', scrollFactor: 0, depth: -100, yAnchor: 0, tint: 0xffffff },
      { key: 'clouds', scrollFactor: 0.06, depth: -95, yAnchor: 0.15, tint: 0xe8f0f5 },
      { key: 'cliffsFar', scrollFactor: 0.12, depth: -90, yAnchor: 0.3, tint: 0x506878 },
      { key: 'sea', scrollFactor: 0.25, depth: -70, yAnchor: 0.62, tint: 0x2f5872 },
      { key: 'rocksNear', scrollFactor: 0.55, depth: 40, yAnchor: 0.85, tint: 0x3a4552 },
    ],
    environmentObjects: [
      { id: 'lighthouse1', type: 'windmill', x: 0.1, y: 0.3, scale: 1.4 },
      { id: 'weathervane1', type: 'weathervane', x: 0.25, y: 0.45, scale: 0.9 },
      { id: 'abandonedCart1', type: 'abandonedCart', x: 0.35, y: 0.75, scale: 1.0 },
      { id: 'signpost2', type: 'signpost', x: 0.48, y: 0.7, scale: 0.85 },
      { id: 'bell2', type: 'bell', x: 0.58, y: 0.42, scale: 0.9 },
      { id: 'waterSplash1', type: 'waterSplash', x: 0.65, y: 0.66, scale: 1.1 },
      { id: 'fenceCans2', type: 'fenceCans', x: 0.75, y: 0.74, scale: 0.9 },
      { id: 'hiddenBottle2', type: 'hiddenBottle', x: 0.85, y: 0.68, scale: 0.6 },
      { id: 'lantern2', type: 'lantern', x: 0.92, y: 0.58, scale: 0.8 },
    ],
    exclusiveTargets: ['sturmvogel'],
    weatherPool: ['wind', 'storm', 'rainfront', 'featherstorm', 'balloons'],
    signatureEvent: 'storm',
    secretChainReactionId: 'sturmklippen_cart_avalanche',
  },
  mondbruch: {
    id: 'mondbruch',
    nameKey: 'map.mondbruch.name',
    descriptionKey: 'map.mondbruch.desc',
    unlockLevel: 8,
    skyColorTop: 0x0c1230,
    skyColorBottom: 0x1c2b52,
    fogColor: 0x2a3a66,
    ambienceKey: 'ambience_mondbruch',
    parallaxLayers: [
      { key: 'sky', scrollFactor: 0, depth: -100, yAnchor: 0, tint: 0xffffff },
      { key: 'stars', scrollFactor: 0.03, depth: -98, yAnchor: 0.1, tint: 0xffffff },
      { key: 'farTrees', scrollFactor: 0.1, depth: -90, yAnchor: 0.35, tint: 0x1e2c46 },
      { key: 'glowVines', scrollFactor: 0.2, depth: -80, yAnchor: 0.5, tint: 0x3a5c8f },
      { key: 'waterPlane2', scrollFactor: 0.32, depth: -70, yAnchor: 0.68, tint: 0x223a5c },
      { key: 'reedsNear2', scrollFactor: 0.52, depth: 40, yAnchor: 0.86, tint: 0x14213a },
    ],
    environmentObjects: [
      { id: 'ghostLight1', type: 'ghostLight', x: 0.12, y: 0.4, scale: 0.8 },
      { id: 'mushroom1', type: 'mushroom', x: 0.22, y: 0.72, scale: 1.0 },
      { id: 'treeHollow2', type: 'treeHollow', x: 0.32, y: 0.55, scale: 1.0 },
      { id: 'pumpkin1', type: 'pumpkin', x: 0.42, y: 0.76, scale: 0.9 },
      { id: 'bell3', type: 'bell', x: 0.52, y: 0.4, scale: 0.9 },
      { id: 'firefly1', type: 'firefly', x: 0.6, y: 0.5, scale: 0.5 },
      { id: 'firefly2', type: 'firefly', x: 0.68, y: 0.35, scale: 0.5 },
      { id: 'reedBundle2', type: 'reedBundle', x: 0.75, y: 0.8, scale: 0.9 },
      { id: 'hiddenBottle3', type: 'hiddenBottle', x: 0.85, y: 0.72, scale: 0.6 },
      { id: 'ghostLight2', type: 'ghostLight', x: 0.92, y: 0.45, scale: 0.7 },
    ],
    exclusiveTargets: ['taeuscher'],
    weatherPool: ['fullMoon', 'fireflyNight', 'timeRift', 'miniBoss', 'goldenSwarm'],
    signatureEvent: 'fullMoon',
    secretChainReactionId: 'mondbruch_firefly_convergence',
  },
};

export const MAP_LIST: MapConfig[] = Object.values(MAP_CONFIGS);

export function getMapConfig(id: MapId): MapConfig {
  const cfg = MAP_CONFIGS[id];
  if (!cfg) throw new Error(`Unknown map: ${id}`);
  return cfg;
}
