/**
 * Zentrale Spielkonfiguration: Modi, Karten, Ziele, Ereignisse, Fortschritt.
 * Alle Balancierungswerte sind hier konfiguriert, nicht hart gecodet.
 */
import type { EventId, MapId, ModeId, TargetId } from '../core/types';

export interface FlightBehavior {
  /** Verfügbare Flugbahnen (Gewichte implizit gleich). */
  paths: ('line' | 'bezier' | 'sine' | 'spiral' | 'dive' | 'zigzag' | 'hover' | 'formation' | 'depth')[];
  /** Basis-Geschwindigkeit in px/s (bei Tiefe 1.0). */
  speed: [number, number];
  /** Tiefe-Bereich [min, max]. */
  depth: [number, number];
  /** Verweildauer max in s (0 = fliegt durch). */
  maxLinger: number;
  /** Winkeltoleranz für Kurven (rad/s). */
  agility: number;
}

export interface TargetConfig {
  id: TargetId;
  /** Sprite-Textur-ID. */
  sprite: string;
  /** Breite/Höhe bei Größe 1.0. */
  size: [number, number];
  /** Basis-Punkte. */
  baseScore: number;
  /** Benötigte Treffer (1 = normal). */
  hp: number;
  /** Radius-Bruchteil der Hitbox (für Präzisionsberechnung). */
  hitbox: number;
  /** Spawn-Gewicht in der Standardphase. */
  spawnWeight: number;
  /** Min/max gleichzeitige Instanzen. */
  maxConcurrent: number;
  /** Nur in bestimmten Modi/Karten (leer = überall). */
  exclusiveMaps?: MapId[];
  /** Nur während eines Events. */
  requiresEvent?: EventId;
  /** Selten: eigener Spawn-Slot. */
  rare: boolean;
  flight: FlightBehavior;
  /** Humorvolle Trefferreaktion (Textur-Frame-Suffix). */
  reactions: string[];
  /** Farbe für Partikel bei Treffer. */
  featherColors: number[];
  /** Punkte-Fenster für Schwarm (Schwarmvögel). */
  swarmGroupSize?: number;
  boss?: boolean;
  /** Illusionen erzeugen (Nachtgeflüster). */
  illusions?: boolean;
}

export const TARGETS: Record<TargetId, TargetConfig> = {
  moorflatterer: {
    id: 'moorflatterer',
    sprite: 'bird_moorflatterer',
    size: [58, 40],
    baseScore: 100,
    hp: 1,
    hitbox: 0.75,
    spawnWeight: 30,
    maxConcurrent: 4,
    rare: false,
    flight: {
      paths: ['line', 'sine', 'bezier'],
      speed: [120, 190],
      depth: [0.8, 1.15],
      maxLinger: 0,
      agility: 0.6,
    },
    reactions: ['fluff', 'spin'],
    featherColors: [0xe8933a, 0xc9721f, 0xf2a952],
  },
  schnellfeder: {
    id: 'schnellfeder',
    sprite: 'bird_schnellfeder',
    size: [30, 22],
    baseScore: 250,
    hp: 1,
    hitbox: 0.7,
    spawnWeight: 18,
    maxConcurrent: 3,
    rare: false,
    flight: {
      paths: ['line', 'zigzag', 'dive'],
      speed: [340, 520],
      depth: [0.9, 1.3],
      maxLinger: 0,
      agility: 3.2,
    },
    reactions: ['blur'],
    featherColors: [0x9adcf0, 0x5fb8dd, 0xd8f3fc],
  },
  korkenzieher: {
    id: 'korkenzieher',
    sprite: 'bird_korkenzieher',
    size: [46, 36],
    baseScore: 200,
    hp: 1,
    hitbox: 0.72,
    spawnWeight: 16,
    maxConcurrent: 3,
    rare: false,
    flight: {
      paths: ['spiral', 'sine', 'bezier'],
      speed: [180, 260],
      depth: [0.75, 1.2],
      maxLinger: 2.5,
      agility: 2.0,
    },
    reactions: ['wobble'],
    featherColors: [0xb07ae0, 0x8a5cc0, 0xd4b3f2],
  },
  panzerpelz: {
    id: 'panzerpelz',
    sprite: 'bird_panzerpelz',
    size: [76, 56],
    baseScore: 500,
    hp: 3,
    hitbox: 0.8,
    spawnWeight: 8,
    maxConcurrent: 2,
    rare: false,
    flight: {
      paths: ['line', 'sine'],
      speed: [90, 140],
      depth: [0.9, 1.25],
      maxLinger: 1.5,
      agility: 0.4,
    },
    reactions: ['armor_dent', 'armor_crack', 'armor_broken'],
    featherColors: [0x8a8f98, 0x6b7078, 0xb8bec8],
  },
  goldschnabel: {
    id: 'goldschnabel',
    sprite: 'bird_goldschnabel',
    size: [44, 32],
    baseScore: 1500,
    hp: 1,
    hitbox: 0.68,
    spawnWeight: 0,
    maxConcurrent: 1,
    rare: true,
    flight: {
      paths: ['bezier', 'sine'],
      speed: [150, 220],
      depth: [0.85, 1.2],
      maxLinger: 1.2,
      agility: 1.2,
    },
    reactions: ['glitter'],
    featherColors: [0xffd23e, 0xffe98a, 0xf5b70a],
  },
  nebelfluesterer: {
    id: 'nebelfluesterer',
    sprite: 'bird_nebelfluesterer',
    size: [52, 40],
    baseScore: 400,
    hp: 1,
    hitbox: 0.7,
    spawnWeight: 6,
    maxConcurrent: 2,
    exclusiveMaps: ['nebelmoor', 'mondbruch'],
    rare: false,
    flight: {
      paths: ['line', 'hover', 'sine'],
      speed: [70, 120],
      depth: [0.7, 1.0],
      maxLinger: 4,
      agility: 0.5,
    },
    reactions: ['dissolve'],
    featherColors: [0xcfd8dc, 0x90a4ae, 0xeceff1],
  },
  taeuscher: {
    id: 'taeuscher',
    sprite: 'bird_taeuscher',
    size: [50, 38],
    baseScore: -300,
    hp: 1,
    hitbox: 0.74,
    spawnWeight: 7,
    maxConcurrent: 1,
    rare: false,
    flight: {
      paths: ['line', 'sine', 'bezier'],
      speed: [140, 200],
      depth: [0.9, 1.2],
      maxLinger: 1,
      agility: 0.8,
    },
    reactions: ['whoops'],
    featherColors: [0xef5350, 0x9e9e9e, 0xffab91],
  },
  schwarmvogel: {
    id: 'schwarmvogel',
    sprite: 'bird_schwarmvogel',
    size: [26, 20],
    baseScore: 80,
    hp: 1,
    hitbox: 0.65,
    spawnWeight: 10,
    maxConcurrent: 8,
    rare: false,
    flight: {
      paths: ['formation'],
      speed: [200, 300],
      depth: [0.9, 1.15],
      maxLinger: 0,
      agility: 1.0,
    },
    reactions: ['scatter'],
    featherColors: [0x66bb6a, 0x43a047, 0xa5d6a7],
    swarmGroupSize: 5,
  },
  kurvensegler: {
    id: 'kurvensegler',
    sprite: 'bird_kurvensegler',
    size: [64, 46],
    baseScore: 300,
    hp: 1,
    hitbox: 0.72,
    spawnWeight: 9,
    maxConcurrent: 2,
    rare: false,
    flight: {
      paths: ['depth', 'bezier', 'dive'],
      speed: [160, 240],
      depth: [0.55, 1.45],
      maxLinger: 2,
      agility: 1.4,
    },
    reactions: ['bank'],
    featherColors: [0xff8a65, 0xe64a19, 0xffccbc],
  },
  sturmvogel: {
    id: 'sturmvogel',
    sprite: 'bird_sturmvogel',
    size: [48, 36],
    baseScore: 350,
    hp: 1,
    hitbox: 0.7,
    spawnWeight: 0,
    maxConcurrent: 3,
    requiresEvent: 'crosswind',
    exclusiveMaps: ['sturmklippen'],
    rare: false,
    flight: {
      paths: ['line', 'zigzag'],
      speed: [260, 420],
      depth: [0.8, 1.3],
      maxLinger: 0,
      agility: 2.4,
    },
    reactions: ['tumble'],
    featherColors: [0x78909c, 0x546e7a, 0xb0bec5],
  },
  boss_moorkoloss: {
    id: 'boss_moorkoloss',
    sprite: 'boss_moorkoloss',
    size: [220, 160],
    baseScore: 6000,
    hp: 14,
    hitbox: 0.85,
    spawnWeight: 0,
    maxConcurrent: 1,
    rare: true,
    boss: true,
    flight: {
      paths: ['line', 'hover'],
      speed: [60, 110],
      depth: [1.0, 1.15],
      maxLinger: 30,
      agility: 0.3,
    },
    reactions: ['armor_crack'],
    featherColors: [0x5d4037, 0x8d6e63, 0xbcaaa4, 0x4e342e],
  },
  boss_federakrobat: {
    id: 'boss_federakrobat',
    sprite: 'boss_federakrobat',
    size: [150, 110],
    baseScore: 7500,
    hp: 18,
    hitbox: 0.6,
    spawnWeight: 0,
    maxConcurrent: 1,
    rare: true,
    boss: true,
    flight: {
      paths: ['spiral', 'zigzag', 'dive', 'bezier'],
      speed: [220, 420],
      depth: [0.7, 1.4],
      maxLinger: 0,
      agility: 3.5,
    },
    reactions: ['flip'],
    featherColors: [0xec407a, 0xf06292, 0xf8bbd0],
  },
  boss_nachtgeflister: {
    id: 'boss_nachtgeflister',
    sprite: 'boss_nachtgeflister',
    size: [170, 130],
    baseScore: 9000,
    hp: 16,
    hitbox: 0.62,
    spawnWeight: 0,
    maxConcurrent: 1,
    rare: true,
    boss: true,
    illusions: true,
    exclusiveMaps: ['mondbruch', 'nebelmoor'],
    flight: {
      paths: ['hover', 'line', 'bezier'],
      speed: [100, 200],
      depth: [0.8, 1.3],
      maxLinger: 5,
      agility: 1.6,
    },
    reactions: ['phase'],
    featherColors: [0x7c4dff, 0xb388ff, 0xe1bee7, 0x311b92],
  },
};

export interface ModeConfig {
  id: ModeId;
  /** Rundenlänge in s (Endless = 0). */
  duration: number;
  /** Basis-Intervalle in ms zwischen Spawns. */
  spawnInterval: [number, number];
  /** Combo-Fenster in ms. */
  comboWindowMs: number;
  /** Combo-Multiplikator-Tempo (1 = normal). */
  multiplierSpeed: number;
  /** Munition: 0 = unbegrenzt. */
  ammo: number;
  autoReload: boolean;
  reloadMs: number;
  /** Startender Schwierigkeitsfaktor. */
  startFactor: number;
  /** Events erlauben? */
  events: boolean;
  /** Bosse erlauben? */
  bosses: boolean;
  /** Zen-Flag. */
  zen: boolean;
  /** Par-Score für die Rangbewertung. */
  parScore: number;
  /** XP-Multiplikator. */
  xpMultiplier: number;
  /** Benötigtes Freischaltungslevel (0 = frei). */
  unlockLevel: number;
  /** Extra-Bedingung: 'combo10' | 'acc70' | null. */
  unlockCond: 'combo10' | 'acc70' | null;
}

export const MODES: Record<ModeId, ModeConfig> = {
  classic: {
    id: 'classic',
    duration: 120,
    spawnInterval: [900, 1500],
    comboWindowMs: 4000,
    multiplierSpeed: 1,
    ammo: 0,
    autoReload: true,
    reloadMs: 1400,
    startFactor: 1.0,
    events: true,
    bosses: true,
    zen: false,
    parScore: 9000,
    xpMultiplier: 1,
    unlockLevel: 0,
    unlockCond: null,
  },
  blitz: {
    id: 'blitz',
    duration: 60,
    spawnInterval: [450, 800],
    comboWindowMs: 2500,
    multiplierSpeed: 1.5,
    ammo: 0,
    autoReload: true,
    reloadMs: 1100,
    startFactor: 1.15,
    events: true,
    bosses: false,
    zen: false,
    parScore: 7000,
    xpMultiplier: 1.2,
    unlockLevel: 0,
    unlockCond: 'combo10',
  },
  precision: {
    id: 'precision',
    duration: 120,
    spawnInterval: [1200, 1900],
    comboWindowMs: 5000,
    multiplierSpeed: 0.8,
    ammo: 48,
    autoReload: false,
    reloadMs: 1600,
    startFactor: 0.95,
    events: true,
    bosses: false,
    zen: false,
    parScore: 8000,
    xpMultiplier: 1.4,
    unlockLevel: 0,
    unlockCond: 'acc70',
  },
  endless: {
    id: 'endless',
    duration: 0,
    spawnInterval: [900, 1500],
    comboWindowMs: 4000,
    multiplierSpeed: 1,
    ammo: 0,
    autoReload: true,
    reloadMs: 1400,
    startFactor: 1.0,
    events: true,
    bosses: true,
    zen: false,
    parScore: 0,
    xpMultiplier: 1.3,
    unlockLevel: 3,
    unlockCond: null,
  },
  daily: {
    id: 'daily',
    duration: 120,
    spawnInterval: [900, 1500],
    comboWindowMs: 4000,
    multiplierSpeed: 1,
    ammo: 0,
    autoReload: true,
    reloadMs: 1400,
    startFactor: 1.0,
    events: true,
    bosses: true,
    zen: false,
    parScore: 9000,
    xpMultiplier: 1.5,
    unlockLevel: 0,
    unlockCond: null,
  },
  zen: {
    id: 'zen',
    duration: 180,
    spawnInterval: [1400, 2200],
    comboWindowMs: 6000,
    multiplierSpeed: 0.7,
    ammo: 0,
    autoReload: true,
    reloadMs: 1200,
    startFactor: 0.85,
    events: true,
    bosses: false,
    zen: true,
    parScore: 6000,
    xpMultiplier: 1.1,
    unlockLevel: 5,
    unlockCond: null,
  },
  tutorial: {
    id: 'tutorial',
    duration: 90,
    spawnInterval: [2000, 3000],
    comboWindowMs: 6000,
    multiplierSpeed: 0.8,
    ammo: 0,
    autoReload: true,
    reloadMs: 1500,
    startFactor: 0.7,
    events: false,
    bosses: false,
    zen: true,
    parScore: 2000,
    xpMultiplier: 0.5,
    unlockLevel: 0,
    unlockCond: null,
  },
};

export interface EnvironmentObject {
  id: string;
  /** Sprite/Texture-ID. */
  sprite: string;
  /** Position als Bruchteil der Scene-Größe. */
  pos: [number, number];
  /** Größe. */
  scale: number;
  /** Punkte. */
  score: number;
  /** Ketten-Station (null = keine). */
  chain: string | null;
  /** Verstecktes Ziel spawnen. */
  spawnsTarget?: TargetId;
  /** Bonuszeit in s. */
  bonusTime?: number;
  /** Multiplikator für 10 s. */
  mult?: number;
  /** Zeitlupe. */
  slowMo?: boolean;
  /** Verstecktes Objekt (für Challenge). */
  hidden?: boolean;
}

export interface MapConfig {
  id: MapId;
  /** Grundfarbpalette. */
  sky: [number, number];
  farColor: number;
  midColor: number;
  nearColor: number;
  fogColor: number;
  fogAmount: number;
  /** Grundwind (px/s, horizontal). */
  baseWind: number;
  /** Wetter. */
  weather: 'calm' | 'wind' | 'rain' | 'night' | 'storm';
  /** Parallax-Ebenen (Anzahl). */
  layers: number;
  /** Karten-exklusive Ziele. */
  exclusiveTargets: TargetId[];
  /** Events, die hier häufiger auftreten. */
  favoredEvents: EventId[];
  /** Exklusives Spezialereignis. */
  specialEvent: EventId;
  /** Umgebungsobjekte. */
  objects: EnvironmentObject[];
  /** Secret-Ketten-ID. */
  secretChain: string;
}

export const MAPS: Record<MapId, MapConfig> = {
  nebelmoor: {
    id: 'nebelmoor',
    sky: [0x2c3e50, 0xf5a25d],
    farColor: 0x4a5d4f,
    midColor: 0x3a4a3c,
    nearColor: 0x26332a,
    fogColor: 0xd8c9a8,
    fogAmount: 0.35,
    baseWind: 12,
    weather: 'calm',
    layers: 4,
    exclusiveTargets: ['nebelfluesterer'],
    favoredEvents: ['fog', 'reed_burst', 'frog_concert'],
    specialEvent: 'reed_burst',
    secretChain: 'chain_moorglocke',
    objects: [
      { id: 'lantern_1', sprite: 'env_lantern', pos: [0.14, 0.72], scale: 1, score: 150, chain: 'lantern' },
      { id: 'rope_1', sprite: 'env_rope', pos: [0.78, 0.6], scale: 0.8, score: 90, chain: 'seil' },
      { id: 'tin_cans', sprite: 'env_tincans', pos: [0.3, 0.8], scale: 1, score: 100, chain: 'cans' },
      { id: 'scarecrow', sprite: 'env_scarecrow', pos: [0.52, 0.78], scale: 1.2, score: 200, chain: 'scarecrow', spawnsTarget: 'schwarmvogel' },
      { id: 'bell_rope', sprite: 'env_bell', pos: [0.72, 0.7], scale: 1, score: 150, chain: 'bell', mult: 2 },
      { id: 'bucket_hang', sprite: 'env_bucket', pos: [0.82, 0.66], scale: 1, score: 120, chain: 'bucket' },
      { id: 'pumpkin_1', sprite: 'env_pumpkin', pos: [0.22, 0.86], scale: 0.9, score: 80, chain: 'pumpkin' },
      { id: 'shrub_spore', sprite: 'env_fungus', pos: [0.44, 0.87], scale: 1, score: 100, chain: 'spore', slowMo: true },
      { id: 'wheel', sprite: 'env_wheel', pos: [0.9, 0.82], scale: 1.1, score: 120, chain: 'wheel' },
      { id: 'bottle_1', sprite: 'env_bottle', pos: [0.63, 0.89], scale: 0.7, score: 250, chain: null, hidden: true },
      { id: 'reed_bundle', sprite: 'env_reed', pos: [0.06, 0.85], scale: 1, score: 60, chain: 'reed', spawnsTarget: 'kurvensegler' },
      { id: 'sign_1', sprite: 'env_sign', pos: [0.88, 0.76], scale: 1, score: 90, chain: 'sign' },
      { id: 'hollow_1', sprite: 'env_hollow', pos: [0.4, 0.62], scale: 1, score: 180, chain: 'hollow', spawnsTarget: 'goldschnabel', hidden: true },
      { id: 'water_1', sprite: 'env_water', pos: [0.5, 0.93], scale: 1.6, score: 50, chain: 'water' },
      { id: 'weathervane', sprite: 'env_weathervane', pos: [0.7, 0.55], scale: 0.9, score: 110, chain: 'weathervane' },
    ],
  },
  sturmklippen: {
    id: 'sturmklippen',
    sky: [0x263445, 0x7d9bb8],
    farColor: 0x3c4f5e,
    midColor: 0x2f4150,
    nearColor: 0x1e2c38,
    fogColor: 0xb8c8d8,
    fogAmount: 0.18,
    baseWind: 60,
    weather: 'wind',
    layers: 5,
    exclusiveTargets: ['sturmvogel'],
    favoredEvents: ['crosswind', 'rain_front', 'thunderstorm', 'bonus_balloons'],
    specialEvent: 'crosswind',
    secretChain: 'chain_leuchtturm',
    objects: [
      { id: 'lantern_2', sprite: 'env_lighthouse_lamp', pos: [0.85, 0.34], scale: 0.8, score: 400, chain: 'lighthouse', spawnsTarget: 'goldschnabel' },
      { id: 'buoy', sprite: 'env_buoy', pos: [0.2, 0.86], scale: 1, score: 130, chain: 'buoy' },
      { id: 'crate_pile', sprite: 'env_crate', pos: [0.36, 0.84], scale: 1.1, score: 150, chain: 'crate', mult: 2 },
      { id: 'fishing_net', sprite: 'env_net', pos: [0.6, 0.82], scale: 1, score: 100, chain: 'net' },
      { id: 'cliff_bell', sprite: 'env_bell', pos: [0.76, 0.68], scale: 0.9, score: 200, chain: 'bell', mult: 2 },
      { id: 'rope_bucket', sprite: 'env_bucket', pos: [0.48, 0.72], scale: 0.9, score: 120, chain: 'bucket' },
      { id: 'seagull_rock', sprite: 'env_rock', pos: [0.1, 0.78], scale: 1, score: 80, chain: 'rock', spawnsTarget: 'schnellfeder' },
      { id: 'storm_bottle', sprite: 'env_bottle', pos: [0.9, 0.88], scale: 0.7, score: 250, chain: null, hidden: true },
      { id: 'wave_rock', sprite: 'env_rock', pos: [0.68, 0.9], scale: 1.3, score: 90, chain: 'water' },
      { id: 'beacon_sign', sprite: 'env_sign', pos: [0.3, 0.7], scale: 1, score: 100, chain: 'sign' },
      { id: 'ferry_wheel', sprite: 'env_wheel', pos: [0.15, 0.6], scale: 0.9, score: 140, chain: 'wheel' },
      { id: 'anchor', sprite: 'env_anchor', pos: [0.55, 0.88], scale: 0.9, score: 160, chain: 'anchor' },
    ],
  },
  mondbruch: {
    id: 'mondbruch',
    sky: [0x0d1030, 0x28306b],
    farColor: 0x232a52,
    midColor: 0x1a2142,
    nearColor: 0x10152c,
    fogColor: 0x8a93d8,
    fogAmount: 0.22,
    baseWind: 8,
    weather: 'night',
    layers: 4,
    exclusiveTargets: ['nebelfluesterer', 'boss_nachtgeflister'],
    favoredEvents: ['full_moon', 'firefly_night', 'time_rift', 'golden_swarm'],
    specialEvent: 'full_moon',
    secretChain: 'chain_geisterlicht',
    objects: [
      { id: 'moon_bell', sprite: 'env_bell', pos: [0.58, 0.62], scale: 1, score: 250, chain: 'bell', mult: 2 },
      { id: 'ghost_light_1', sprite: 'env_ghostlight', pos: [0.24, 0.5], scale: 0.8, score: 300, chain: 'ghost', hidden: true, spawnsTarget: 'nebelfluesterer' },
      { id: 'ghost_light_2', sprite: 'env_ghostlight', pos: [0.74, 0.42], scale: 0.7, score: 300, chain: 'ghost', hidden: true },
      { id: 'glow_shrub', sprite: 'env_glowplant', pos: [0.14, 0.86], scale: 1, score: 120, chain: 'spore', slowMo: true },
      { id: 'firefly_jar', sprite: 'env_jar', pos: [0.42, 0.85], scale: 0.8, score: 200, chain: 'firefly', bonusTime: 5 },
      { id: 'moon_pumpkin', sprite: 'env_pumpkin', pos: [0.66, 0.87], scale: 0.9, score: 100, chain: 'pumpkin' },
      { id: 'old_cart', sprite: 'env_cart', pos: [0.86, 0.84], scale: 1.1, score: 150, chain: 'cart', spawnsTarget: 'kurvensegler' },
      { id: 'willow_hollow', sprite: 'env_hollow', pos: [0.3, 0.58], scale: 1.1, score: 200, chain: 'hollow', spawnsTarget: 'goldschnabel', hidden: true },
      { id: 'pond_moon', sprite: 'env_water', pos: [0.5, 0.94], scale: 1.8, score: 60, chain: 'water' },
      { id: 'cairn', sprite: 'env_cairn', pos: [0.48, 0.78], scale: 0.8, score: 90, chain: 'cairn', mult: 2 },
      { id: 'spore_2', sprite: 'env_fungus', pos: [0.78, 0.9], scale: 1.1, score: 110, chain: 'spore', slowMo: true },
      { id: 'moon_bottle', sprite: 'env_bottle', pos: [0.08, 0.88], scale: 0.7, score: 250, chain: null, hidden: true },
    ],
  },
};

export interface EventConfig {
  id: EventId;
  /** Dauer in ms. */
  duration: [number, number];
  /** Multiplikator auf alle Punkte während des Events. */
  scoreMult: number;
  /** Zusätzlich spawnen (Zielart + Gewicht). */
  extraSpawn?: { target: TargetId; weight: number };
  /** Zeitlupe-Faktor (1 = normal, <1 = langsamer). */
  timeScale?: number;
  /** Visuelle Intensität (0..1). */
  intensity: number;
  /** Nicht während anderer Events. */
  exclusive: boolean;
  /** Karten, auf denen erlaubt (leer = alle). */
  maps?: MapId[];
  boss?: TargetId;
}

export const EVENTS: Record<EventId, EventConfig> = {
  fog: { id: 'fog', duration: [12000, 18000], scoreMult: 1.2, intensity: 0.7, exclusive: false },
  crosswind: {
    id: 'crosswind',
    duration: [10000, 16000],
    scoreMult: 1.3,
    extraSpawn: { target: 'sturmvogel', weight: 20 },
    intensity: 0.8,
    exclusive: false,
    maps: ['sturmklippen'],
  },
  thunderstorm: {
    id: 'thunderstorm',
    duration: [12000, 18000],
    scoreMult: 1.4,
    extraSpawn: { target: 'goldschnabel', weight: 6 },
    intensity: 0.9,
    exclusive: true,
  },
  golden_swarm: {
    id: 'golden_swarm',
    duration: [10000, 14000],
    scoreMult: 2,
    extraSpawn: { target: 'goldschnabel', weight: 12 },
    intensity: 1,
    exclusive: true,
  },
  full_moon: {
    id: 'full_moon',
    duration: [15000, 20000],
    scoreMult: 1.5,
    extraSpawn: { target: 'nebelfluesterer', weight: 14 },
    intensity: 0.8,
    exclusive: false,
    maps: ['mondbruch'],
  },
  reed_burst: {
    id: 'reed_burst',
    duration: [8000, 12000],
    scoreMult: 1.3,
    extraSpawn: { target: 'kurvensegler', weight: 16 },
    intensity: 0.7,
    exclusive: false,
    maps: ['nebelmoor'],
  },
  bonus_balloons: {
    id: 'bonus_balloons',
    duration: [12000, 16000],
    scoreMult: 1.2,
    extraSpawn: { target: 'goldschnabel', weight: 8 },
    intensity: 0.6,
    exclusive: false,
  },
  rain_front: {
    id: 'rain_front',
    duration: [14000, 20000],
    scoreMult: 1.1,
    intensity: 0.6,
    exclusive: false,
  },
  frog_concert: {
    id: 'frog_concert',
    duration: [10000, 14000],
    scoreMult: 1.1,
    intensity: 0.4,
    exclusive: false,
    maps: ['nebelmoor'],
  },
  firefly_night: {
    id: 'firefly_night',
    duration: [14000, 20000],
    scoreMult: 1.3,
    extraSpawn: { target: 'goldschnabel', weight: 6 },
    intensity: 0.7,
    exclusive: false,
    maps: ['mondbruch'],
  },
  time_rift: {
    id: 'time_rift',
    duration: [8000, 12000],
    scoreMult: 1.2,
    timeScale: 0.6,
    intensity: 0.8,
    exclusive: true,
  },
  mini_boss: {
    id: 'mini_boss',
    duration: [20000, 26000],
    scoreMult: 1.5,
    intensity: 1,
    exclusive: true,
    boss: 'boss_moorkoloss',
  },
  featherstorm: {
    id: 'featherstorm',
    duration: [10000, 15000],
    scoreMult: 1.8,
    intensity: 1,
    exclusive: true,
  },
};

/** Rundenphasen: [Startbruchteil, ID]. */
export interface RoundPhaseDef {
  id: 'calm' | 'ramp' | 'event' | 'calm2' | 'intense' | 'finale';
  from: number; // 0..1 der Rundenzeit
}

export const ROUND_PHASES: RoundPhaseDef[] = [
  { id: 'calm', from: 0 },
  { id: 'ramp', from: 0.18 },
  { id: 'event', from: 0.4 },
  { id: 'calm2', from: 0.62 },
  { id: 'intense', from: 0.78 },
  { id: 'finale', from: 0.92 },
];

/** Phase -> Multiplikator auf die Spawn-Intensität. */
export const PHASE_SPAWN_MULT: Record<RoundPhaseDef['id'], number> = {
  calm: 0.6,
  ramp: 0.9,
  event: 1.1,
  calm2: 0.7,
  intense: 1.3,
  finale: 1.6,
};

/** XP pro erzieltem Punkt (vor Multiplikator). */
export const XP_PER_SCORE = 1 / 100;

export interface CosmeticDef {
  id: string;
  /** Kosten in Federn (0 = kostenlos, Level-Freischaltung). */
  feathers: number;
  level?: number;
}

export const CROSSHAIR_STYLES: CosmeticDef[] = [
  { id: 'classic', feathers: 0, level: 1 },
  { id: 'circle', feathers: 150, level: 3 },
  { id: 'feather', feathers: 400, level: 5 },
  { id: 'hex', feathers: 300, level: 4 },
  { id: 'sniper', feathers: 600, level: 7 },
];

export const HUD_THEMES: CosmeticDef[] = [
  { id: 'classic', feathers: 0, level: 1 },
  { id: 'minimal', feathers: 200, level: 3 },
  { id: 'retro', feathers: 350, level: 5 },
];

export const WEAPON_SKINS: CosmeticDef[] = [
  { id: 'moor_bronze', feathers: 0, level: 1 },
  { id: 'storm_steel', feathers: 250, level: 3 },
  { id: 'moon_silver', feathers: 400, level: 5 },
  { id: 'featherstorm_gold', feathers: 700, level: 7 },
];

export const CROSSHAIR_COLORS = [
  { id: 'gold', value: '#ffd23e' },
  { id: 'red', value: '#ff5252' },
  { id: 'cyan', value: '#4dd0e1' },
  { id: 'green', value: '#69f0ae' },
  { id: 'violet', value: '#b388ff' },
  { id: 'white', value: '#ffffff' },
];

export interface AchievementDef {
  id: string;
  /** Zielwert (1 = boolean). */
  target: number;
  /** XP-Belohnung. */
  xp: number;
  /** Federn-Belohnung. */
  feathers: number;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'noMiss20', target: 20, xp: 200, feathers: 200 },
  { id: 'perfect5', target: 5, xp: 300, feathers: 300 },
  { id: 'swarm3s', target: 1, xp: 250, feathers: 250 },
  { id: 'bossClean', target: 1, xp: 400, feathers: 400 },
  { id: 'hiddenAll', target: 3, xp: 500, feathers: 500 },
  { id: 'acc80', target: 1, xp: 300, feathers: 300 },
  { id: 'chain5', target: 5, xp: 350, feathers: 350 },
  { id: 'goldThunder', target: 1, xp: 300, feathers: 300 },
  { id: 'sss', target: 1, xp: 600, feathers: 600 },
  { id: 'combo25', target: 25, xp: 350, feathers: 350 },
  { id: 'endless50000', target: 50000, xp: 500, feathers: 500 },
  { id: 'daily', target: 1, xp: 200, feathers: 200 },
];

/**
 * Herausforderungen: laufen parallel in jeder Runde, Fortschritt wird
 * lokal gespeichert.
 */
export interface ChallengeDef {
  id: string;
  target: number;
  xp: number;
  feathers: number;
}

export const CHALLENGES: ChallengeDef[] = [
  { id: 'noMiss20', target: 20, xp: 150, feathers: 150 },
  { id: 'perfect5', target: 5, xp: 200, feathers: 200 },
  { id: 'swarm3s', target: 1, xp: 180, feathers: 180 },
  { id: 'chain5', target: 5, xp: 200, feathers: 200 },
  { id: 'combo25', target: 25, xp: 250, feathers: 250 },
  { id: 'bossClean', target: 1, xp: 300, feathers: 300 },
  { id: 'acc80', target: 1, xp: 250, feathers: 250 },
];

/** Min-Boss-Auswahl je Karte (Gewichte). */
export const BOSS_TABLE: Record<MapId, { boss: TargetId; weight: number }[]> = {
  nebelmoor: [
    { boss: 'boss_moorkoloss', weight: 6 },
    { boss: 'boss_federakrobat', weight: 3 },
    { boss: 'boss_nachtgeflister', weight: 1 },
  ],
  sturmklippen: [
    { boss: 'boss_federakrobat', weight: 6 },
    { boss: 'boss_moorkoloss', weight: 4 },
  ],
  mondbruch: [
    { boss: 'boss_nachtgeflister', weight: 6 },
    { boss: 'boss_moorkoloss', weight: 2 },
    { boss: 'boss_federakrobat', weight: 2 },
  ],
};

/** Kettenreaktionen: [Station1, Station2, ...]. Stationen = Umgebungsobjekt-IDs. */
export interface ChainDef {
  id: string;
  /** IDs der beteiligten Umgebungsobjekte in Reihenfolge. */
  stations: string[];
  /** Bonus-Punkte pro Station. */
  stationScore: number;
  /** Abschluss-Effekt. */
  finale: 'spawn' | 'time' | 'mult' | 'none';
  /** Bonuszeit bei finale=time. */
  bonusTime?: number;
  /** Ziel bei finale=spawn. */
  spawnTarget?: TargetId;
  /** Multiplikator bei finale=mult (für 10 s). */
  mult?: number;
  /** Karte (null = alle). */
  map: MapId | null;
}

export const CHAINS: ChainDef[] = [
  // Klassische Seil-Eimer-Glocke-Kette (Nebelmoor)
  {
    id: 'chain_seil',
    stations: ['rope_1', 'bucket_hang', 'bell_rope'],
    stationScore: 150,
    finale: 'spawn',
    spawnTarget: 'goldschnabel',
    map: 'nebelmoor',
  },
  // Laternen-Dosen-Kürbis-Pilz-Ketten (Nebelmoor)
  {
    id: 'chain_lantern',
    stations: ['lantern_1', 'tin_cans', 'pumpkin_1', 'shrub_spore', 'wheel'],
    stationScore: 120,
    finale: 'time',
    bonusTime: 5,
    map: 'nebelmoor',
  },
  // Vogelscheuche-Schild-Schilf-Flucht (Nebelmoor)
  {
    id: 'chain_scarecrow',
    stations: ['scarecrow', 'sign_1', 'reed_bundle', 'hollow_1'],
    stationScore: 130,
    finale: 'mult',
    mult: 2,
    map: 'nebelmoor',
  },
  // Secret: Moorglocke (Nebelmoor)
  {
    id: 'chain_moorglocke',
    stations: ['bell_rope', 'water_1', 'lantern_1', 'shrub_spore', 'bottle_1'],
    stationScore: 200,
    finale: 'mult',
    mult: 3,
    map: 'nebelmoor',
  },
  // Leuchtturm-Kette (Sturmklippen)
  {
    id: 'chain_leuchtturm',
    stations: ['lantern_2', 'cliff_bell', 'rope_bucket', 'crate_pile', 'anchor'],
    stationScore: 160,
    finale: 'spawn',
    spawnTarget: 'goldschnabel',
    map: 'sturmklippen',
  },
  // Boje-Netze-Wagen (Sturmklippen)
  {
    id: 'chain_buoy',
    stations: ['buoy', 'fishing_net', 'seagull_rock', 'beacon_sign'],
    stationScore: 140,
    finale: 'time',
    bonusTime: 4,
    map: 'sturmklippen',
  },
  // Kiste-Dosen-Anker (Sturmklippen)
  {
    id: 'chain_crate',
    stations: ['crate_pile', 'rope_bucket', 'ferry_wheel', 'wave_rock'],
    stationScore: 130,
    finale: 'mult',
    mult: 2,
    map: 'sturmklippen',
  },
  // Geisterlicht-Kette (Mondbruch)
  {
    id: 'chain_geisterlicht',
    stations: ['ghost_light_1', 'moon_bell', 'glow_shrub', 'cairn', 'moon_bottle'],
    stationScore: 200,
    finale: 'spawn',
    spawnTarget: 'goldschnabel',
    map: 'mondbruch',
  },
  // Feuerwanne-Kartoffel-Karren (Mondbruch)
  {
    id: 'chain_firefly',
    stations: ['firefly_jar', 'moon_pumpkin', 'old_cart', 'spore_2'],
    stationScore: 150,
    finale: 'time',
    bonusTime: 6,
    map: 'mondbruch',
  },
  // Baumhohlräume-Kette (Mondbruch)
  {
    id: 'chain_hollow',
    stations: ['willow_hollow', 'moon_bell', 'pond_moon', 'cairn'],
    stationScore: 140,
    finale: 'mult',
    mult: 2,
    map: 'mondbruch',
  },
];
