/**
 * Moorland Mayhem – Featherstorm
 * Central shared type contracts. All modules (pure logic, engine, UI) import from here
 * so that the pure logic stays independent of Phaser and the DOM.
 */

export type Lang = 'de' | 'en';
export type QualityLevel = 'low' | 'medium' | 'high';

export const MODE_IDS = ['classic', 'blitz', 'precision', 'endless', 'daily', 'zen'] as const;
export type ModeId = (typeof MODE_IDS)[number];

export const MAP_IDS = ['nebelmoor', 'sturmklippen', 'mondbruch'] as const;
export type MapId = (typeof MAP_IDS)[number];

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export interface KeyBinds {
  fire: string;
  reload: string;
  pause: string;
  debug: string;
}

export interface Settings {
  masterVolume: number; // 0..1
  musicVolume: number; // 0..1
  sfxVolume: number; // 0..1
  ambientVolume: number; // 0..1
  fullscreen: boolean;
  quality: QualityLevel;
  screenshake: number; // 0..1
  particleDensity: number; // 0.25..1
  crosshairSize: number; // 0.6..1.8
  crosshairColor: string; // '#rrggbb'
  colorblind: boolean;
  highContrast: boolean;
  reduceMotion: boolean;
  reduceFlash: boolean;
  language: Lang;
  keyFire: string;
  keyReload: string;
  keyPause: string;
  keyDebug: string;
}

export const DEFAULT_SETTINGS: Settings = {
  masterVolume: 0.8,
  musicVolume: 0.7,
  sfxVolume: 0.9,
  ambientVolume: 0.6,
  fullscreen: false,
  quality: 'high',
  screenshake: 0.7,
  particleDensity: 1,
  crosshairSize: 1,
  crosshairColor: '#ffd54a',
  colorblind: false,
  highContrast: false,
  reduceMotion: false,
  reduceFlash: false,
  language: 'de',
  keyFire: 'Space',
  keyReload: 'KeyR',
  keyPause: 'Escape',
  keyDebug: 'F3',
};

/* ------------------------------------------------------------------ */
/* RNG                                                                 */
/* ------------------------------------------------------------------ */

/** Small deterministic seeded PRNG interface (mulberry32-based). */
export interface Rng {
  /** float in [0,1) */
  next(): number;
  /** float in [min,max) */
  range(min: number, max: number): number;
  /** integer in [min,max] inclusive */
  int(min: number, max: number): number;
  /** true with probability p */
  chance(p: number): boolean;
  /** random element (asserts non-empty) */
  pick<T>(arr: readonly T[]): T;
  /** weighted pick */
  weighted<T>(items: readonly { item: T; weight: number }[]): T;
  /** shuffled copy */
  shuffle<T>(arr: readonly T[]): T[];
  /** current seed state, for persistence/verification */
  state(): number;
}

/* ------------------------------------------------------------------ */
/* Weapon (pure state machine)                                         */
/* ------------------------------------------------------------------ */

export type WeaponState = 'ready' | 'empty' | 'reloading';

export interface WeaponSnapshot {
  ammo: number;
  magazineSize: number;
  state: WeaponState;
  reloadStartedAt: number;
  reloadDurationMs: number;
  lastShotAt: number;
  fireCooldownMs: number;
  canFire: boolean;
}

/* ------------------------------------------------------------------ */
/* Combo (pure state machine)                                          */
/* ------------------------------------------------------------------ */

export interface ComboState {
  combo: number;
  multiplier: number;
  hitsWithoutMiss: number;
  perfectStreak: number;
  bestCombo: number;
  bestPerfectStreak: number;
  timeLeftMs: number;
  windowMs: number;
}

/* ------------------------------------------------------------------ */
/* Scoring                                                             */
/* ------------------------------------------------------------------ */

export interface HitParams {
  targetId: string;
  basePoints: number;
  depthScoring?: boolean;
  /** shot position (game coords) */
  x: number;
  y: number;
  /** hitbox center + radii (outer ellipse) */
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  /** inner "perfect" ellipse radii (<= outer) */
  innerRx: number;
  innerRy: number;
  /** target apparent speed in px/s */
  speed: number;
  /** depth factor: <1 far away, >1 near/foreground */
  depth: number;
  /** time remaining in run seconds (Infinity for zen) */
  timeLeft: number;
  combo: number;
  perfectStreak: number;
  eventMultiplier: number;
  swarmBonus: boolean;
  trickshot: boolean;
  longshot: boolean;
  /** perfect hits so far in the run (for streak bonuses) */
  runPerfectHits: number;
  /** combo thresholds for streak bonuses, e.g. [5,10,15,...] */
  comboBonusThresholds: readonly number[];
  rng: Rng;
}

export interface HitResult {
  total: number;
  base: number;
  speedMult: number;
  depthMult: number;
  precisionMult: number;
  comboMult: number;
  timeBonusMult: number;
  eventMult: number;
  perfect: boolean;
  longshot: boolean;
  trickshot: boolean;
  swarmBonus: number;
  comboBonus: number;
  perfectStreakBonus: number;
  /** normalized distance from hitbox center, 0 = dead center, >=1 = edge */
  precision: number;
  /** human-readable breakdown lines (localized labels via i18n key suffix) */
  labels: string[];
}

export type Rank = 'D' | 'C' | 'B' | 'A' | 'S' | 'SS' | 'SSS';

/* ------------------------------------------------------------------ */
/* Run stats                                                           */
/* ------------------------------------------------------------------ */

export interface RunSummary {
  mode: ModeId;
  map: MapId;
  score: number;
  hits: number;
  misses: number;
  shots: number;
  reloads: number;
  perfectHits: number;
  maxCombo: number;
  bestHitPoints: number;
  bestHitTargetId: string;
  avgReactionMs: number;
  accuracy: number; // 0..1 (0 if no shots)
  targetsHit: Record<string, number>;
  swarmBonuses: number;
  trickshots: number;
  longshots: number;
  chainReactions: number;
  longestChain: number;
  hiddenObjectsFound: number;
  hiddenObjectIds: string[];
  seed: number;
  bossDefeated: boolean;
  bossMisses: number;
  eventBonusPoints: number;
  bonusTimeSeconds: number;
  noMissFinish: boolean;
  durationSeconds: number;
  maxPerfectStreak: number;
  maxHitsWithoutMiss: number;
  goldDuringStorm: boolean;
  swarmClearedFast: boolean;
}

/* ------------------------------------------------------------------ */
/* Save data (versioned)                                               */
/* ------------------------------------------------------------------ */

export interface HighScoreEntry {
  score: number;
  date: string; // ISO yyyy-mm-dd
  accuracy: number;
  maxCombo: number;
  rank: Rank;
  map: MapId;
  seed: number;
}

export interface DailyRecord {
  date: string; // yyyy-mm-dd
  score: number;
  accuracy: number;
  rank: Rank;
  seed: number;
}

export interface ChallengeRecord {
  progress: number;
  completedAt?: string;
}

export interface SaveDataV3 {
  version: 3;
  settings: Settings;
  progression: {
    xp: number;
    level: number;
    coins: number;
  };
  unlocks: {
    maps: string[];
    modes: string[];
    crosshairs: string[];
    hudSkins: string[];
    weaponSkins: string[];
  };
  equipped: {
    crosshair: string;
    hudSkin: string;
    weaponSkin: string;
  };
  stats: {
    totalRuns: number;
    totalShots: number;
    totalHits: number;
    totalScore: number;
    totalPlaySeconds: number;
    perfectHits: number;
    bossKills: number;
    chainReactions: number;
    bestCombo: number;
    targetsHit: Record<string, number>;
    mapsPlayed: Record<string, number>;
    hiddenObjectsFound: string[];
  };
  highscores: Record<string, HighScoreEntry[]>; // key: mode id
  daily: Record<string, DailyRecord>; // key: yyyy-mm-dd
  achievements: string[];
  challenges: Record<string, ChallengeRecord>;
  tutorialDone: boolean;
}

/** Shape accepted by the storage layer; migrations upgrade older shapes up to v3. */
export type SaveDataAny = { version: number } & Record<string, unknown>;

/* ------------------------------------------------------------------ */
/* Events (bus payloads)                                               */
/* ------------------------------------------------------------------ */

export type GameEventType =
  'settings:changed' | 'game:started' | 'game:ended' | 'game:paused' | 'game:resumed' | 'ui:navigate' | 'debug:toggle';

export interface GameStartPayload {
  mode: ModeId;
  map: MapId;
  seed: number;
  seedLabel: string;
}

export interface GameEndPayload {
  summary: RunSummary;
  isRecord: boolean;
  previousBest: number | null;
  newAchievements: string[];
  xpGained: number;
  coinsGained: number;
  leveledUp: boolean;
}

/* ------------------------------------------------------------------ */
/* Misc shared                                                         */
/* ------------------------------------------------------------------ */

export const GAME_WIDTH = 1920;
export const GAME_HEIGHT = 1080;

/** Clamp helper shared everywhere. */
export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
