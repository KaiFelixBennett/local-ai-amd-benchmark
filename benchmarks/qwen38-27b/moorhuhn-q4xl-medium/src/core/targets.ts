/**
 * Data-driven target definitions for all 10 base target kinds + 3 mini-bosses.
 * All tunable values live here, not scattered across scene code.
 */

import type { TargetConfig, TargetKind, MapId } from './types';

const ALL: MapId[] = ['nebelmoor', 'sturmklippen', 'mondbruch'];

const T = (c: TargetConfig) => c;

export const TARGETS: Record<TargetKind, TargetConfig> = {
  moorflatterer: T({
    kind: 'moorflatterer',
    baseScore: 100,
    hits: 1,
    radius: 30,
    weight: 30,
    minDifficulty: 0,
    maps: ALL,
    speedMin: 0.6,
    speedMax: 1.0,
    durationMin: 6000,
    durationMax: 9000,
    perfectFactor: 0.35,
    trajectories: ['linear', 'sine', 'bezier'],
    reactKey: 'react.flap',
    palette: 'flatterer'
  }),
  schnellfeder: T({
    kind: 'schnellfeder',
    baseScore: 180,
    hits: 1,
    radius: 16,
    weight: 16,
    minDifficulty: 0.15,
    maps: ALL,
    speedMin: 1.6,
    speedMax: 2.4,
    durationMin: 3200,
    durationMax: 5200,
    perfectFactor: 0.4,
    trajectories: ['zigzag', 'linear', 'flee'],
    reactKey: 'react.zip',
    palette: 'feder'
  }),
  korkenzieher: T({
    kind: 'korkenzieher',
    baseScore: 200,
    hits: 1,
    radius: 20,
    weight: 14,
    minDifficulty: 0.2,
    maps: ALL,
    speedMin: 1.0,
    speedMax: 1.5,
    durationMin: 5000,
    durationMax: 7500,
    perfectFactor: 0.35,
    trajectories: ['spiral', 'sine', 'bezier'],
    reactKey: 'react.spiral',
    palette: 'korken'
  }),
  panzerpelz: T({
    kind: 'panzerpelz',
    baseScore: 320,
    hits: 4,
    radius: 38,
    weight: 8,
    minDifficulty: 0.3,
    maps: ALL,
    speedMin: 0.5,
    speedMax: 0.8,
    durationMin: 9000,
    durationMax: 13000,
    perfectFactor: 0.3,
    trajectories: ['linear', 'hover'],
    reactKey: 'react.clank',
    palette: 'panzer'
  }),
  goldschnabel: T({
    kind: 'goldschnabel',
    baseScore: 600,
    hits: 1,
    radius: 24,
    weight: 3,
    minDifficulty: 0.25,
    maps: ALL,
    speedMin: 1.1,
    speedMax: 1.6,
    durationMin: 4000,
    durationMax: 6000,
    perfectFactor: 0.4,
    trajectories: ['bezier', 'sine', 'dive'],
    reactKey: 'react.shimmer',
    palette: 'gold'
  }),
  nebelfluesterer: T({
    kind: 'nebelfluesterer',
    baseScore: 260,
    hits: 1,
    radius: 26,
    weight: 9,
    minDifficulty: 0.35,
    maps: ALL,
    speedMin: 0.8,
    speedMax: 1.2,
    durationMin: 5500,
    durationMax: 8000,
    perfectFactor: 0.3,
    trajectories: ['sine', 'bezier', 'hover'],
    reactKey: 'react.mist',
    palette: 'mist'
  }),
  taeuscher: T({
    kind: 'taeuscher',
    baseScore: -300,
    hits: 1,
    radius: 28,
    weight: 6,
    minDifficulty: 0.3,
    maps: ALL,
    speedMin: 0.9,
    speedMax: 1.3,
    durationMin: 5000,
    durationMax: 7500,
    perfectFactor: 0.35,
    trajectories: ['bezier', 'linear'],
    reactKey: 'react.booby',
    palette: 'taeuscher'
  }),
  schwarmvogel: T({
    kind: 'schwarmvogel',
    baseScore: 90,
    hits: 1,
    radius: 18,
    weight: 12,
    minDifficulty: 0.2,
    maps: ALL,
    speedMin: 1.0,
    speedMax: 1.4,
    durationMin: 6000,
    durationMax: 9000,
    perfectFactor: 0.4,
    trajectories: ['formation', 'sine'],
    reactKey: 'react.flock',
    palette: 'schwarm'
  }),
  kurvensegler: T({
    kind: 'kurvensegler',
    baseScore: 240,
    hits: 1,
    radius: 28,
    weight: 10,
    minDifficulty: 0.25,
    maps: ALL,
    speedMin: 1.0,
    speedMax: 1.8,
    durationMin: 5000,
    durationMax: 8000,
    perfectFactor: 0.3,
    trajectories: ['depth', 'bezier', 'dive'],
    reactKey: 'react.glide',
    palette: 'segler'
  }),
  sturmvogel: T({
    kind: 'sturmvogel',
    baseScore: 280,
    hits: 1,
    radius: 24,
    weight: 7,
    minDifficulty: 0.3,
    maps: ['sturmklippen'],
    speedMin: 1.4,
    speedMax: 2.2,
    durationMin: 4000,
    durationMax: 6500,
    perfectFactor: 0.35,
    trajectories: ['zigzag', 'linear', 'depth'],
    reactKey: 'react.gust',
    palette: 'sturm'
  }),
  // ---- mini bosses ----
  boss_moor: T({
    kind: 'boss_moor',
    baseScore: 2500,
    hits: 24,
    radius: 62,
    weight: 0,
    minDifficulty: 0,
    maps: ALL,
    speedMin: 0.3,
    speedMax: 0.5,
    durationMin: 20000,
    durationMax: 24000,
    perfectFactor: 0.25,
    trajectories: ['hover', 'sine'],
    reactKey: 'react.bossroar',
    palette: 'boss_moor'
  }),
  boss_akrobat: T({
    kind: 'boss_akrobat',
    baseScore: 3000,
    hits: 18,
    radius: 40,
    weight: 0,
    minDifficulty: 0,
    maps: ALL,
    speedMin: 1.6,
    speedMax: 2.4,
    durationMin: 18000,
    durationMax: 22000,
    perfectFactor: 0.3,
    trajectories: ['spiral', 'zigzag', 'bezier'],
    reactKey: 'react.bossroar',
    palette: 'boss_akrobat'
  }),
  boss_nacht: T({
    kind: 'boss_nacht',
    baseScore: 3500,
    hits: 20,
    radius: 50,
    weight: 0,
    minDifficulty: 0,
    maps: ['mondbruch'],
    speedMin: 0.7,
    speedMax: 1.2,
    durationMin: 20000,
    durationMax: 26000,
    perfectFactor: 0.3,
    trajectories: ['sine', 'hover', 'bezier'],
    reactKey: 'react.bossroar',
    palette: 'boss_nacht'
  })
};

/** Kinds that participate in normal weighted spawning (bosses excluded). */
export const SPAWNABLE: TargetKind[] = [
  'moorflatterer',
  'schnellfeder',
  'korkenzieher',
  'panzerpelz',
  'goldschnabel',
  'nebelfluesterer',
  'taeuscher',
  'schwarmvogel',
  'kurvensegler',
  'sturmvogel'
];

export const BOSS_KINDS: TargetKind[] = ['boss_moor', 'boss_akrobat', 'boss_nacht'];

export function isBoss(kind: TargetKind): boolean {
  return kind.startsWith('boss_');
}
