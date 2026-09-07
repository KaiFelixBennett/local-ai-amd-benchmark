// ==================== Core Types ====================

export interface Vec2 {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ==================== Game Settings ====================

export type Language = 'de' | 'en';
export type QualityLevel = 'low' | 'medium' | 'high';

export interface GameSettings {
  language: Language;
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  ambientVolume: number;
  fullscreen: boolean;
  quality: QualityLevel;
  screenshakeIntensity: number;
  particleDensity: number;
  crosshairSize: number;
  crosshairColor: string;
  colorblindMode: boolean;
  reducedMotion: boolean;
  reducedFlashes: boolean;
  shootKey: string;
  reloadKey: string;
  pauseKey: string;
}

export const DEFAULT_SETTINGS: GameSettings = {
  language: 'de',
  masterVolume: 0.8,
  musicVolume: 0.6,
  sfxVolume: 0.8,
  ambientVolume: 0.5,
  fullscreen: false,
  quality: 'high',
  screenshakeIntensity: 1.0,
  particleDensity: 1.0,
  crosshairSize: 1.0,
  crosshairColor: '#ff4444',
  colorblindMode: false,
  reducedMotion: false,
  reducedFlashes: false,
  shootKey: 'mouse0',
  reloadKey: 'r',
  pauseKey: 'escape',
};

// ==================== Game Modes ====================

export type GameModeId = 'classic' | 'blitz' | 'precision' | 'endless' | 'daily' | 'zen';

export interface GameMode {
  id: GameModeId;
  nameKey: string;
  descriptionKey: string;
  duration: number; // seconds, 0 = endless
  autoReload: boolean;
  ammoLimit: number; // -1 = unlimited
  comboWindow: number; // ms
  comboWindowScale: number;
  spawnRateMultiplier: number;
  difficultyScale: number;
  penaltyMultiplier: number;
  unlockedAtLevel: number;
}

export const GAME_MODES: GameMode[] = [
  {
    id: 'classic',
    nameKey: 'mode_classic',
    descriptionKey: 'mode_classic_desc',
    duration: 120,
    autoReload: true,
    ammoLimit: -1,
    comboWindow: 3000,
    comboWindowScale: 1.0,
    spawnRateMultiplier: 1.0,
    difficultyScale: 1.0,
    penaltyMultiplier: 1.0,
    unlockedAtLevel: 1,
  },
  {
    id: 'blitz',
    nameKey: 'mode_blitz',
    descriptionKey: 'mode_blitz_desc',
    duration: 60,
    autoReload: true,
    ammoLimit: -1,
    comboWindow: 1500,
    comboWindowScale: 1.5,
    spawnRateMultiplier: 1.8,
    difficultyScale: 1.3,
    penaltyMultiplier: 1.5,
    unlockedAtLevel: 2,
  },
  {
    id: 'precision',
    nameKey: 'mode_precision',
    descriptionKey: 'mode_precision_desc',
    duration: 120,
    autoReload: false,
    ammoLimit: 30,
    comboWindow: 4000,
    comboWindowScale: 0.8,
    spawnRateMultiplier: 0.7,
    difficultyScale: 0.8,
    penaltyMultiplier: 2.0,
    unlockedAtLevel: 3,
  },
  {
    id: 'endless',
    nameKey: 'mode_endless',
    descriptionKey: 'mode_endless_desc',
    duration: 0,
    autoReload: true,
    ammoLimit: -1,
    comboWindow: 3000,
    comboWindowScale: 1.0,
    spawnRateMultiplier: 1.0,
    difficultyScale: 1.0,
    penaltyMultiplier: 1.0,
    unlockedAtLevel: 5,
  },
  {
    id: 'daily',
    nameKey: 'mode_daily',
    descriptionKey: 'mode_daily_desc',
    duration: 120,
    autoReload: true,
    ammoLimit: -1,
    comboWindow: 3000,
    comboWindowScale: 1.0,
    spawnRateMultiplier: 1.0,
    difficultyScale: 1.2,
    penaltyMultiplier: 1.0,
    unlockedAtLevel: 1,
  },
  {
    id: 'zen',
    nameKey: 'mode_zen',
    descriptionKey: 'mode_zen_desc',
    duration: 0,
    autoReload: true,
    ammoLimit: -1,
    comboWindow: 5000,
    comboWindowScale: 0.5,
    spawnRateMultiplier: 0.6,
    difficultyScale: 0.5,
    penaltyMultiplier: 0.3,
    unlockedAtLevel: 4,
  },
];

// ==================== Environments ====================

export type EnvironmentId = 'nebelmoor' | 'sturmklippen' | 'mondbruch';

export interface Environment {
  id: EnvironmentId;
  nameKey: string;
  descriptionKey: string;
  unlockedAtLevel: number;
  skyColors: [number, number, number];
  ambientColor: number;
  fogColor: number;
  fogDensity: number;
  parallaxLayers: number;
  weatherType: WeatherType;
  exclusiveTargets: TargetTypeId[];
  exclusiveObjects: EnvironmentObjectTypeId[];
  specialEvent: EventTypeId | null;
}

export type WeatherType = 'clear' | 'fog' | 'wind' | 'rain' | 'storm' | 'moonlight' | 'fireflies';

export const ENVIRONMENTS: Environment[] = [
  {
    id: 'nebelmoor',
    nameKey: 'env_nebelmoor',
    descriptionKey: 'env_nebelmoor_desc',
    unlockedAtLevel: 1,
    skyColors: [0x4a6741, 0x8fbc8f, 0xd4a574],
    ambientColor: 0x88aa77,
    fogColor: 0x99aa88,
    fogDensity: 0.015,
    parallaxLayers: 4,
    weatherType: 'fog',
    exclusiveTargets: ['nebelfluesterer'],
    exclusiveObjects: ['reed', 'water', 'mushroom', 'bog_owl'],
    specialEvent: 'mass_reed_spawn',
  },
  {
    id: 'sturmklippen',
    nameKey: 'env_sturmklippen',
    descriptionKey: 'env_sturmklippen_desc',
    unlockedAtLevel: 3,
    skyColors: [0x2c3e50, 0x5d7a8c, 0x8eafc2],
    ambientColor: 0x6688aa,
    fogColor: 0x8899aa,
    fogDensity: 0.008,
    parallaxLayers: 4,
    weatherType: 'wind',
    exclusiveTargets: ['sturmvogel'],
    exclusiveObjects: ['lighthouse', 'waves', 'buoy', 'net'],
    specialEvent: 'rain_front',
  },
  {
    id: 'mondbruch',
    nameKey: 'env_mondbruch',
    descriptionKey: 'env_mondbruch_desc',
    unlockedAtLevel: 5,
    skyColors: [0x0a0a2e, 0x1a1a4e, 0x2a2a6e],
    ambientColor: 0x334466,
    fogColor: 0x223344,
    fogDensity: 0.01,
    parallaxLayers: 5,
    weatherType: 'moonlight',
    exclusiveTargets: [],
    exclusiveObjects: ['firefly', 'ghost_light', 'glowing_mushroom', 'moon_pool'],
    specialEvent: null,
  },
];

// ==================== Target Types ====================

export type TargetTypeId =
  | 'moorflatterer'
  | 'schnellfeder'
  | 'korkenzieher'
  | 'panzerpelz'
  | 'goldschnabel'
  | 'nebelfluesterer'
  | 'taeuscher'
  | 'schwarmvogel'
  | 'kurvensegler'
  | 'sturmvogel';

export interface TargetTypeConfig {
  id: TargetTypeId;
  nameKey: string;
  baseScore: number;
  baseHp: number;
  speed: number;
  size: number; // scale multiplier
  hitboxRadius: number;
  perfectRadius: number;
  spawnWeight: number;
  flightPath: FlightPathType;
  color: number;
  accentColor: number;
  bodyColor: number;
  wingColor: number;
  beakColor: number;
  eyeColor: number;
  minSize: number;
  maxSize: number;
  wingSpeed: number;
  hasArmor: boolean;
  isRare: boolean;
  isSwarm: boolean;
  isDecoy: boolean;
  isWeatherDependent: boolean;
  requiredWeather?: WeatherType;
  swarmSize: number;
  swarmBonus: number;
}

export type FlightPathType =
  | 'linear'
  | 'bezier'
  | 'sine'
  | 'spiral'
  | 'dive'
  | 'zigzag'
  | 'hover'
  | 'formation'
  | 'depth_change';

export const TARGET_TYPES: TargetTypeConfig[] = [
  {
    id: 'moorflatterer',
    nameKey: 'target_moorflatterer',
    baseScore: 100,
    baseHp: 1,
    speed: 120,
    size: 1.0,
    hitboxRadius: 45,
    perfectRadius: 12,
    spawnWeight: 40,
    flightPath: 'linear',
    color: 0x8B4513,
    accentColor: 0xD2691E,
    bodyColor: 0x8B4513,
    wingColor: 0xA0522D,
    beakColor: 0xFF8C00,
    eyeColor: 0x000000,
    minSize: 0.8,
    maxSize: 1.2,
    wingSpeed: 8,
    hasArmor: false,
    isRare: false,
    isSwarm: false,
    isDecoy: false,
    isWeatherDependent: false,
    swarmSize: 0,
    swarmBonus: 0,
  },
  {
    id: 'schnellfeder',
    nameKey: 'target_schnellfeder',
    baseScore: 200,
    baseHp: 1,
    speed: 300,
    size: 0.6,
    hitboxRadius: 42,
    perfectRadius: 8,
    spawnWeight: 20,
    flightPath: 'zigzag',
    color: 0xC0C0C0,
    accentColor: 0xE8E8E8,
    bodyColor: 0xD0D0D0,
    wingColor: 0xE0E0E0,
    beakColor: 0x333333,
    eyeColor: 0x111111,
    minSize: 0.5,
    maxSize: 0.7,
    wingSpeed: 16,
    hasArmor: false,
    isRare: false,
    isSwarm: false,
    isDecoy: false,
    isWeatherDependent: false,
    swarmSize: 0,
    swarmBonus: 0,
  },
  {
    id: 'korkenzieher',
    nameKey: 'target_korkenzieher',
    baseScore: 250,
    baseHp: 1,
    speed: 150,
    size: 0.9,
    hitboxRadius: 24,
    perfectRadius: 10,
    spawnWeight: 15,
    flightPath: 'spiral',
    color: 0x228B22,
    accentColor: 0x32CD32,
    bodyColor: 0x228B22,
    wingColor: 0x2E8B57,
    beakColor: 0xFFD700,
    eyeColor: 0x000000,
    minSize: 0.7,
    maxSize: 1.1,
    wingSpeed: 10,
    hasArmor: false,
    isRare: false,
    isSwarm: false,
    isDecoy: false,
    isWeatherDependent: false,
    swarmSize: 0,
    swarmBonus: 0,
  },
  {
    id: 'panzerpelz',
    nameKey: 'target_panzerpelz',
    baseScore: 500,
    baseHp: 5,
    speed: 80,
    size: 1.4,
    hitboxRadius: 38,
    perfectRadius: 15,
    spawnWeight: 8,
    flightPath: 'linear',
    color: 0x696969,
    accentColor: 0x808080,
    bodyColor: 0x556B2F,
    wingColor: 0x6B8E23,
    beakColor: 0x708090,
    eyeColor: 0xFF4500,
    minSize: 1.2,
    maxSize: 1.6,
    wingSpeed: 5,
    hasArmor: true,
    isRare: false,
    isSwarm: false,
    isDecoy: false,
    isWeatherDependent: false,
    swarmSize: 0,
    swarmBonus: 0,
  },
  {
    id: 'goldschnabel',
    nameKey: 'target_goldschnabel',
    baseScore: 1000,
    baseHp: 1,
    speed: 180,
    size: 1.1,
    hitboxRadius: 28,
    perfectRadius: 12,
    spawnWeight: 3,
    flightPath: 'bezier',
    color: 0xFFD700,
    accentColor: 0xFFA500,
    bodyColor: 0xDAA520,
    wingColor: 0xFFD700,
    beakColor: 0xFF8C00,
    eyeColor: 0x8B0000,
    minSize: 0.9,
    maxSize: 1.3,
    wingSpeed: 7,
    hasArmor: false,
    isRare: true,
    isSwarm: false,
    isDecoy: false,
    isWeatherDependent: false,
    swarmSize: 0,
    swarmBonus: 0,
  },
  {
    id: 'nebelfluesterer',
    nameKey: 'target_nebelfluesterer',
    baseScore: 400,
    baseHp: 1,
    speed: 100,
    size: 1.0,
    hitboxRadius: 26,
    perfectRadius: 10,
    spawnWeight: 10,
    flightPath: 'hover',
    color: 0x708090,
    accentColor: 0xB0C4DE,
    bodyColor: 0x778899,
    wingColor: 0x8899AA,
    beakColor: 0x99AABB,
    eyeColor: 0x00FF7F,
    minSize: 0.8,
    maxSize: 1.2,
    wingSpeed: 4,
    hasArmor: false,
    isRare: false,
    isSwarm: false,
    isDecoy: false,
    isWeatherDependent: false,
    swarmSize: 0,
    swarmBonus: 0,
  },
  {
    id: 'taeuscher',
    nameKey: 'target_taeuscher',
    baseScore: -300,
    baseHp: 1,
    speed: 140,
    size: 1.0,
    hitboxRadius: 28,
    perfectRadius: 12,
    spawnWeight: 7,
    flightPath: 'bezier',
    color: 0xFF6347,
    accentColor: 0xFF4500,
    bodyColor: 0xFF6347,
    wingColor: 0xFF7F50,
    beakColor: 0xFFD700,
    eyeColor: 0x000000,
    minSize: 0.9,
    maxSize: 1.1,
    wingSpeed: 8,
    hasArmor: false,
    isRare: false,
    isSwarm: false,
    isDecoy: true,
    isWeatherDependent: false,
    swarmSize: 0,
    swarmBonus: 0,
  },
  {
    id: 'schwarmvogel',
    nameKey: 'target_schwarmvogel',
    baseScore: 150,
    baseHp: 1,
    speed: 200,
    size: 0.7,
    hitboxRadius: 32,
    perfectRadius: 8,
    spawnWeight: 12,
    flightPath: 'formation',
    color: 0x4169E1,
    accentColor: 0x6495ED,
    bodyColor: 0x4169E1,
    wingColor: 0x4682B4,
    beakColor: 0xFFFF00,
    eyeColor: 0x000000,
    minSize: 0.6,
    maxSize: 0.8,
    wingSpeed: 12,
    hasArmor: false,
    isRare: false,
    isSwarm: true,
    isDecoy: false,
    isWeatherDependent: false,
    swarmSize: 5,
    swarmBonus: 500,
  },
  {
    id: 'kurvensegler',
    nameKey: 'target_kurvensegler',
    baseScore: 350,
    baseHp: 1,
    speed: 160,
    size: 1.0,
    hitboxRadius: 26,
    perfectRadius: 10,
    spawnWeight: 10,
    flightPath: 'depth_change',
    color: 0x9370DB,
    accentColor: 0xBA55D3,
    bodyColor: 0x9370DB,
    wingColor: 0x8A2BE2,
    beakColor: 0xFF69B4,
    eyeColor: 0xFFD700,
    minSize: 0.5,
    maxSize: 1.8,
    wingSpeed: 9,
    hasArmor: false,
    isRare: false,
    isSwarm: false,
    isDecoy: false,
    isWeatherDependent: false,
    swarmSize: 0,
    swarmBonus: 0,
  },
  {
    id: 'sturmvogel',
    nameKey: 'target_sturmvogel',
    baseScore: 450,
    baseHp: 2,
    speed: 250,
    size: 1.2,
    hitboxRadius: 32,
    perfectRadius: 14,
    spawnWeight: 5,
    flightPath: 'sine',
    color: 0x4682B4,
    accentColor: 0x5F9EA0,
    bodyColor: 0x4682B4,
    wingColor: 0x5F9EA0,
    beakColor: 0xFF6347,
    eyeColor: 0xFFFFFF,
    minSize: 1.0,
    maxSize: 1.4,
    wingSpeed: 14,
    hasArmor: false,
    isRare: false,
    isSwarm: false,
    isDecoy: false,
    isWeatherDependent: true,
    requiredWeather: 'wind',
    swarmSize: 0,
    swarmBonus: 0,
  },
];

// ==================== Events ====================

export type EventTypeId =
  | 'thick_fog'
  | 'strong_wind'
  | 'thunderstorm'
  | 'golden_swarm'
  | 'full_moon'
  | 'mass_reed_spawn'
  | 'bonus_balloons'
  | 'rain_front'
  | 'frog_concert'
  | 'firefly_night'
  | 'time_slow'
  | 'mini_boss'
  | 'featherstorm';

export interface EventType {
  id: EventTypeId;
  nameKey: string;
  duration: number;
  descriptionKey: string;
  effect: string;
}

export const EVENT_TYPES: EventType[] = [
  { id: 'thick_fog', nameKey: 'event_fog', duration: 15000, descriptionKey: 'event_fog_desc', effect: 'visibility' },
  { id: 'strong_wind', nameKey: 'event_wind', duration: 12000, descriptionKey: 'event_wind_desc', effect: 'wind' },
  { id: 'thunderstorm', nameKey: 'event_thunder', duration: 20000, descriptionKey: 'event_thunder_desc', effect: 'storm' },
  { id: 'golden_swarm', nameKey: 'event_golden', duration: 8000, descriptionKey: 'event_golden_desc', effect: 'bonus' },
  { id: 'full_moon', nameKey: 'event_moon', duration: 25000, descriptionKey: 'event_moon_desc', effect: 'moon' },
  { id: 'mass_reed_spawn', nameKey: 'event_reed', duration: 10000, descriptionKey: 'event_reed_desc', effect: 'spawn' },
  { id: 'bonus_balloons', nameKey: 'event_balloons', duration: 12000, descriptionKey: 'event_balloons_desc', effect: 'bonus' },
  { id: 'rain_front', nameKey: 'event_rain', duration: 18000, descriptionKey: 'event_rain_desc', effect: 'weather' },
  { id: 'frog_concert', nameKey: 'event_frog', duration: 10000, descriptionKey: 'event_frog_desc', effect: 'ambient' },
  { id: 'firefly_night', nameKey: 'event_firefly', duration: 20000, descriptionKey: 'event_firefly_desc', effect: 'visual' },
  { id: 'time_slow', nameKey: 'event_timeslow', duration: 6000, descriptionKey: 'event_timeslow_desc', effect: 'time' },
  { id: 'mini_boss', nameKey: 'event_miniboss', duration: 30000, descriptionKey: 'event_miniboss_desc', effect: 'boss' },
  { id: 'featherstorm', nameKey: 'event_featherstorm', duration: 15000, descriptionKey: 'event_featherstorm_desc', effect: 'chaos' },
];

// ==================== Mini Bosses ====================

export type MiniBossId = 'armored_moor' | 'acrobat_bird' | 'night_bird';

export interface MiniBossConfig {
  id: MiniBossId;
  nameKey: string;
  hp: number;
  armor: number;
  speed: number;
  size: number;
  phases: number;
  score: number;
  color: number;
  bodyColor: number;
  wingColor: number;
}

export const MINI_BOSSES: MiniBossConfig[] = [
  {
    id: 'armored_moor',
    nameKey: 'boss_armored_moor',
    hp: 20,
    armor: 10,
    speed: 60,
    size: 3.0,
    phases: 3,
    score: 5000,
    color: 0x4a4a4a,
    bodyColor: 0x556B2F,
    wingColor: 0x6B8E23,
  },
  {
    id: 'acrobat_bird',
    nameKey: 'boss_acrobat',
    hp: 12,
    armor: 0,
    speed: 350,
    size: 1.5,
    phases: 2,
    score: 4000,
    color: 0xFF4500,
    bodyColor: 0xFF6347,
    wingColor: 0xFF7F50,
  },
  {
    id: 'night_bird',
    nameKey: 'boss_night',
    hp: 15,
    armor: 5,
    speed: 120,
    size: 2.0,
    phases: 3,
    score: 6000,
    color: 0x191970,
    bodyColor: 0x1a1a4e,
    wingColor: 0x2a2a6e,
  },
];

// ==================== Environment Objects ====================

export type EnvironmentObjectTypeId =
  | 'windmill'
  | 'lantern'
  | 'cans'
  | 'sign'
  | 'bell'
  | 'scarecrow'
  | 'pumpkin'
  | 'mushroom'
  | 'water'
  | 'bucket'
  | 'reed'
  | 'cart'
  | 'weather_vane'
  | 'bottle'
  | 'firefly'
  | 'ghost_light'
  | 'lighthouse'
  | 'waves'
  | 'buoy'
  | 'net'
  | 'glowing_mushroom'
  | 'moon_pool'
  | 'bog_owl';

export interface EnvironmentObjectConfig {
  id: EnvironmentObjectTypeId;
  nameKey: string;
  score: number;
  hp: number;
  chainReaction?: ChainReactionId[];
  color: number;
  size: number;
}

export type ChainReactionId =
  | 'bucket_bell'
  | 'lantern_chain'
  | 'pumpkin_spore'
  | 'windmill_burst'
  | 'water_splash_spawn'
  | 'scarecrow_frighten'
  | 'sign_fall'
  | 'cart_tip'
  | 'bottle_golden'
  | 'reed_mass_spawn';

// ==================== Scoring ====================

export interface ScoreBreakdown {
  baseScore: number;
  speedMultiplier: number;
  distanceMultiplier: number;
  sizeMultiplier: number;
  precisionBonus: number;
  comboMultiplier: number;
  streakBonus: number;
  timeBonus: number;
  eventMultiplier: number;
  swarmBonus: number;
  trickshotBonus: number;
  total: number;
  isPerfect: boolean;
}

export interface RoundResult {
  totalScore: number;
  hits: number;
  misses: number;
  shots: number;
  accuracy: number;
  perfectHits: number;
  maxCombo: number;
  bestHit: number;
  reactionTime: number;
  targetTypesHit: Map<TargetTypeId, number>;
  eventBonuses: number;
  chainBonuses: number;
  personalBest: number;
  rank: Rank;
  newRecord: boolean;
  xpEarned: number;
  currencyEarned: number;
}

export type Rank = 'D' | 'C' | 'B' | 'A' | 'S' | 'SS' | 'SSS';

// ==================== Combo System ====================

export interface ComboState {
  count: number;
  multiplier: number;
  lastHitTime: number;
  windowMs: number;
  streakHits: number;
  perfectStreak: number;
}

// ==================== Weapon System ====================

export type WeaponState = 'ready' | 'empty' | 'reloading';

export interface WeaponConfig {
  magSize: number;
  reloadTime: number;
  fireRate: number;
  damage: number;
  recoilAmount: number;
  recoilRecovery: number;
}

export const DEFAULT_WEAPON: WeaponConfig = {
  magSize: 6,
  reloadTime: 1500,
  fireRate: 150,
  damage: 1,
  recoilAmount: 8,
  recoilRecovery: 200,
};

// ==================== Progress & Save ====================

export interface PlayerProgress {
  version: number;
  totalXp: number;
  level: number;
  totalCurrency: number;
  totalRounds: number;
  totalHits: number;
  totalShots: number;
  totalPerfectHits: number;
  totalMaxCombo: number;
  totalScore: number;
  highscores: Record<GameModeId, number>;
  unlockedEnvironments: EnvironmentId[];
  unlockedModes: GameModeId[];
  unlockedCrosshairs: string[];
  unlockedHudThemes: string[];
  unlockedWeaponSkins: string[];
  achievements: string[];
  challenges: Record<string, number>;
  dailyRecords: Record<string, number>;
  settings: GameSettings;
}

export const DEFAULT_PROGRESS: PlayerProgress = {
  version: 1,
  totalXp: 0,
  level: 1,
  totalCurrency: 0,
  totalRounds: 0,
  totalHits: 0,
  totalShots: 0,
  totalPerfectHits: 0,
  totalMaxCombo: 0,
  totalScore: 0,
  highscores: { classic: 0, blitz: 0, precision: 0, endless: 0, daily: 0, zen: 0 },
  unlockedEnvironments: ['nebelmoor'],
  unlockedModes: ['classic', 'daily'],
  unlockedCrosshairs: ['default'],
  unlockedHudThemes: ['default'],
  unlockedWeaponSkins: ['default'],
  achievements: [],
  challenges: {},
  dailyRecords: {},
  settings: DEFAULT_SETTINGS,
};

// ==================== Achievements ====================

export interface Achievement {
  id: string;
  nameKey: string;
  descriptionKey: string;
  icon: string;
  condition: (progress: PlayerProgress, result?: RoundResult) => boolean;
}

// ==================== Challenges ====================

export interface Challenge {
  id: string;
  nameKey: string;
  descriptionKey: string;
  target: number;
  current: number;
  reward: { xp: number; currency: number };
}

// ==================== Game State ====================

export interface GameState {
  mode: GameMode;
  environment: Environment;
  seed: number;
  timeLeft: number;
  score: number;
  combo: ComboState;
  weapon: {
    state: WeaponState;
    ammo: number;
    reloadStart: number;
  };
  activeTargets: Phaser.GameObjects.Container;
  activeParticles: unknown[]; // Particle emitters
  eventActive: EventTypeId | null;
  bossActive: MiniBossId | null;
  difficultyFactor: number;
  timeScale: number;
  paused: boolean;
  roundStart: number;
  hitTimes: number[];
  spawnPhase: number;
}

// ==================== Spawn Config ====================

export interface SpawnEntry {
  targetType: TargetTypeId;
  count: number;
  path: FlightPathType;
  fromEdge: 'left' | 'right' | 'top' | 'bottom';
  toEdge: 'left' | 'right' | 'top' | 'bottom';
  delay: number;
  speed: number;
  amplitude?: number;
  frequency?: number;
}

// ==================== Crosshair ====================

export type CrosshairStyle = 'default' | 'circle' | 'dot' | 'cross' | 'scope';

export interface CrosshairConfig {
  style: CrosshairStyle;
  color: string;
  size: number;
  lineWidth: number;
}
