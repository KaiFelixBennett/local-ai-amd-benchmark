import type { MapDef, MapId, EnvObjectDef } from '../core/types';

/**
 * All three locations. Objects are placed in normalized coordinates and
 * scaled to the viewport at runtime. Chains = ordered env-object ids;
 * hitting them left-to-right (order shown in tooltips) pays a big bonus.
 */

function obj(
  id: string,
  kind: EnvObjectDef['kind'],
  x: number,
  y: number,
  radius: number,
  extra: Partial<EnvObjectDef> = {},
): EnvObjectDef {
  return { id, kind, x, y, radius, action: 'points', ...extra };
}

const NEBELMOOR: MapDef = {
  id: 'nebelmoor',
  nameKey: 'map.nebelmoor',
  descKey: 'map.nebelmoor.desc',
  unlockLevel: 1,
  ambientKey: 'water',
  specialEvent: 'fog',
  exclusiveKinds: ['mist'],
  palette: {
    skyTop: '#3b2f63',
    skyBottom: '#f2a65a',
    hillsFar: '#57436e',
    hillsMid: '#3f4254',
    ground: '#2c3325',
    reedColor: '#6d7a3f',
    fogColor: '#cfd6e6',
    accent: '#ffd166',
    waterTint: '#41597a',
    night: false,
  },
  objects: [
    obj('nbl.windmill', 'windmill', 0.14, 0.52, 74, { action: 'chain' }),
    obj('nbl.cans', 'cans', 0.3, 0.86, 34),
    obj('nbl.bell', 'bell', 0.46, 0.7, 30, { action: 'spawnSwarm' }),
    obj('nbl.scarecrow', 'scarecrow', 0.63, 0.82, 46),
    obj('nbl.pumpkin', 'pumpkin', 0.76, 0.92, 30),
    obj('nbl.hollow', 'hollow', 0.9, 0.66, 34, { hidden: true }),
    obj('nbl.puddle', 'puddle', 0.22, 0.95, 60, { action: 'splash' }),
    obj('nbl.reeds', 'reeds', 0.55, 0.96, 70, { action: 'scare' }),
    obj('nbl.wagon', 'wagon', 0.83, 0.9, 52),
    obj('nbl.mushroom', 'mushroom', 0.37, 0.93, 24, { action: 'spores' }),
    obj('nbl.sign', 'sign', 0.05, 0.8, 30, { action: 'points', points: 150 }),
    obj('nbl.nest', 'nestbasket', 0.71, 0.55, 26, { action: 'bonusTime', hidden: true }),
    obj('nbl.bottle', 'bottle', 0.49, 0.9, 20, { action: 'multiplier', hidden: true }),
  ],
  chains: [
    { id: 'nbl.ropeBell', nameKey: 'map.nebelmoor', steps: ['nbl.windmill', 'nbl.cans', 'nbl.bell'], bonus: 600 },
    {
      id: 'nbl.grandSlalom',
      nameKey: 'map.nebelmoor',
      steps: ['nbl.sign', 'nbl.windmill', 'nbl.bell', 'nbl.scarecrow', 'nbl.hollow'],
      bonus: 1500,
    },
    { id: 'nbl.featherRiot', nameKey: 'map.nebelmoor', steps: ['nbl.scarecrow', 'nbl.pumpkin', 'nbl.hollow'], bonus: 550 },
    { id: 'nbl.pondSplash', nameKey: 'map.nebelmoor', steps: ['nbl.reeds', 'nbl.puddle'], bonus: 300 },
  ],
};

const STURMKLIPPEN: MapDef = {
  id: 'sturmklippen',
  nameKey: 'map.sturmklippen',
  descKey: 'map.sturmklippen.desc',
  unlockLevel: 3,
  ambientKey: 'wind',
  specialEvent: 'wind',
  exclusiveKinds: ['storm'],
  palette: {
    skyTop: '#233b52',
    skyBottom: '#8fb3c9',
    hillsFar: '#3d566b',
    hillsMid: '#2f4658',
    ground: '#4c5560',
    reedColor: '#7f8b57',
    fogColor: '#dfe9f2',
    accent: '#ff8c42',
    waterTint: '#2e6d8c',
    night: false,
  },
  objects: [
    obj('stk.lighthouse', 'lighthouse', 0.93, 0.42, 66, { action: 'slowmo', hidden: true }),
    obj('stk.weathervane', 'weathervane', 0.1, 0.58, 34, { action: 'chain' }),
    obj('stk.bell', 'bell', 0.27, 0.64, 30, { action: 'spawnGold' }),
    obj('stk.bottle', 'bottle', 0.4, 0.9, 22, { action: 'multiplier' }),
    obj('stk.bucket', 'bucket', 0.55, 0.92, 28, { action: 'splash' }),
    obj('stk.wagon', 'wagon', 0.7, 0.88, 52),
    obj('stk.sign', 'sign', 0.2, 0.86, 28),
    obj('stk.cans', 'cans', 0.48, 0.78, 30),
    obj('stk.reeds', 'reeds', 0.82, 0.95, 64, { action: 'scare' }),
    obj('stk.crystal', 'crystal', 0.63, 0.94, 24, { action: 'points', points: 250, hidden: true }),
    obj('stk.nest', 'nestbasket', 0.34, 0.5, 24, { action: 'bonusTime', hidden: true }),
  ],
  chains: [
    { id: 'stk.harborAlarm', nameKey: 'map.sturmklippen', steps: ['stk.weathervane', 'stk.cans', 'stk.bell'], bonus: 700 },
    { id: 'stk.waveWreck', nameKey: 'map.sturmklippen', steps: ['stk.wagon', 'stk.bucket', 'stk.sign'], bonus: 400 },
  ],
};

const MONDBRUCH: MapDef = {
  id: 'mondbruch',
  nameKey: 'map.mondbruch',
  descKey: 'map.mondbruch.desc',
  unlockLevel: 6,
  ambientKey: 'night',
  specialEvent: 'fullMoon',
  exclusiveKinds: ['balloon'],
  palette: {
    skyTop: '#0b1026',
    skyBottom: '#28305c',
    hillsFar: '#1b2447',
    hillsMid: '#141b36',
    ground: '#101a18',
    reedColor: '#3c5a4a',
    fogColor: '#9fb6d8',
    accent: '#7ee8fa',
    waterTint: '#173a52',
    night: true,
  },
  objects: [
    obj('mnb.ghostlight', 'ghostlight', 0.18, 0.6, 34, { action: 'chain', hidden: true }),
    obj('mnb.crystal', 'crystal', 0.34, 0.88, 28, { action: 'multiplier' }),
    obj('mnb.hollow', 'hollow', 0.5, 0.68, 32, { action: 'spawnSwarm' }),
    obj('mnb.firefly', 'firefly', 0.62, 0.5, 20, { action: 'points', points: 200 }),
    obj('mnb.mushroom', 'mushroom', 0.44, 0.93, 26, { action: 'spores' }),
    obj('mnb.pumpkin', 'pumpkin', 0.74, 0.92, 30),
    obj('mnb.lantern', 'lantern', 0.28, 0.74, 26, { action: 'slowmo' }),
    obj('mnb.reeds', 'reeds', 0.86, 0.95, 66, { action: 'scare' }),
    obj('mnb.nest', 'nestbasket', 0.56, 0.4, 24, { action: 'bonusTime', hidden: true }),
    obj('mnb.bottle', 'bottle', 0.79, 0.88, 20, { action: 'spawnGold', hidden: true }),
    obj('mnb.wagon', 'wagon', 0.1, 0.9, 50),
  ],
  chains: [
    { id: 'mnb.ghostTrail', nameKey: 'map.mondbruch', steps: ['mnb.ghostlight', 'mnb.crystal', 'mnb.hollow'], bonus: 800 },
    { id: 'mnb.sporeGlow', nameKey: 'map.mondbruch', steps: ['mnb.lantern', 'mnb.mushroom'], bonus: 350 },
  ],
};

export const MAPS: Record<MapId, MapDef> = {
  nebelmoor: NEBELMOOR,
  sturmklippen: STURMKLIPPEN,
  mondbruch: MONDBRUCH,
};

export const MAP_ORDER: MapId[] = ['nebelmoor', 'sturmklippen', 'mondbruch'];

export function hiddenObjectIds(map: MapId): string[] {
  return MAPS[map].objects.filter((o) => o.hidden).map((o) => o.id);
}
