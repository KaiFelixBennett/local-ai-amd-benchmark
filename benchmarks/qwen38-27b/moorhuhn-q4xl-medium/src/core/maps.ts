/**
 * Map (stage) definitions — colors, parallax layers, weather, exclusive targets
 * and objects. All pure data used by the art generators and the scene.
 */

import type { MapId } from './types';

export interface ParallaxLayer {
  /** scroll factor 0 (static) .. 1 (moves fully) */
  factor: number;
  /** vertical baseline as a fraction of height */
  yBase: number;
  /** dominant color */
  color: string;
  /** secondary color */
  color2: string;
  /** layer kind for the painter */
  kind: 'sky' | 'hills' | 'mid' | 'reeds' | 'water' | 'fg';
  height: number; // px
}

export interface MapConfig {
  id: MapId;
  nameKey: string;
  descKey: string;
  skyTop: string;
  skyBottom: string;
  sun: { x: number; y: number; r: number; color: string; glow: string } | null;
  moon: { x: number; y: number; r: number; color: string } | null;
  layers: ParallaxLayer[];
  water: { color: string; y: number; opacity: number } | null;
  weather: 'none' | 'mist' | 'rain' | 'fog' | 'stars';
  ambientSfx: string;
  exclusiveTargets: string[];
  exclusiveObjects: string[];
  specialEvent: string;
  /** overall tint multiplier for the front of the scene (atmosphere) */
  tint: string;
  /** fog opacity 0..1 */
  fog: number;
}

export const MAPS: Record<MapId, MapConfig> = {
  nebelmoor: {
    id: 'nebelmoor',
    nameKey: 'map.nebelmoor',
    descKey: 'map.nebelmoor.desc',
    skyTop: '#2b2f4a',
    skyBottom: '#c96f4e',
    sun: { x: 0.72, y: 0.55, r: 46, color: '#ffd98a', glow: '#ff9d5c' },
    moon: null,
    layers: [
      { factor: 0.05, yBase: 0.5, color: '#3a3f63', color2: '#4a4a72', kind: 'hills', height: 120 },
      { factor: 0.15, yBase: 0.6, color: '#31404a', color2: '#3d5055', kind: 'mid', height: 100 },
      { factor: 0.35, yBase: 0.72, color: '#25313a', color2: '#2c3c44', kind: 'reeds', height: 90 },
      { factor: 0.7, yBase: 0.95, color: '#161d22', color2: '#1d262c', kind: 'fg', height: 80 }
    ],
    water: { color: '#20303a', y: 0.82, opacity: 0.55 },
    weather: 'mist',
    ambientSfx: 'water',
    exclusiveTargets: ['nebelfluesterer'],
    exclusiveObjects: ['bushels', 'bottle', 'mushroom'],
    specialEvent: 'masslaunch',
    tint: '#7a4a2a',
    fog: 0.35
  },
  sturmklippen: {
    id: 'sturmklippen',
    nameKey: 'map.sturmklippen',
    descKey: 'map.sturmklippen.desc',
    skyTop: '#39486a',
    skyBottom: '#8fa6c4',
    sun: null,
    moon: null,
    layers: [
      { factor: 0.05, yBase: 0.45, color: '#4a5878', color2: '#556286', kind: 'hills', height: 140 },
      { factor: 0.12, yBase: 0.55, color: '#41506e', color2: '#4a5a78', kind: 'mid', height: 110 },
      { factor: 0.3, yBase: 0.7, color: '#33415c', color2: '#3a4a66', kind: 'reeds', height: 100 },
      { factor: 0.65, yBase: 0.95, color: '#1c2434', color2: '#232e42', kind: 'fg', height: 90 }
    ],
    water: { color: '#2a3a52', y: 0.86, opacity: 0.7 },
    weather: 'rain',
    ambientSfx: 'wind',
    exclusiveTargets: ['sturmvogel'],
    exclusiveObjects: ['lighthouse', 'bell', 'weathervane'],
    specialEvent: 'storm',
    tint: '#2a3a5a',
    fog: 0.18
  },
  mondbruch: {
    id: 'mondbruch',
    nameKey: 'map.mondbruch',
    descKey: 'map.mondbruch.desc',
    skyTop: '#0c1030',
    skyBottom: '#2a2350',
    sun: null,
    moon: { x: 0.78, y: 0.28, r: 40, color: '#f4f1ff' },
    layers: [
      { factor: 0.05, yBase: 0.5, color: '#181840', color2: '#201f4a', kind: 'hills', height: 120 },
      { factor: 0.15, yBase: 0.62, color: '#141436', color2: '#1a1a40', kind: 'mid', height: 100 },
      { factor: 0.35, yBase: 0.74, color: '#0f0f2c', color2: '#151534', kind: 'reeds', height: 90 },
      { factor: 0.7, yBase: 0.96, color: '#080818', color2: '#0d0d20', kind: 'fg', height: 80 }
    ],
    water: { color: '#0e1430', y: 0.84, opacity: 0.6 },
    weather: 'stars',
    ambientSfx: 'night',
    exclusiveTargets: ['boss_nacht'],
    exclusiveObjects: ['ghostlight', 'fireflies', 'lantern'],
    specialEvent: 'fullmoon',
    tint: '#201a4a',
    fog: 0.25
  }
};

export const MAP_IDS: MapId[] = ['nebelmoor', 'sturmklippen', 'mondbruch'];
