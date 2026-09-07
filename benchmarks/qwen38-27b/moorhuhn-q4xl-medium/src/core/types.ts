/**
 * Core shared types for Moorland Mayhem.
 * These types are pure (no Phaser dependency) so they can be used in logic + tests.
 */

export type GameMode = 'classic' | 'blitz' | 'precision' | 'endless' | 'daily' | 'zen';
export type MapId = 'nebelmoor' | 'sturmklippen' | 'mondbruch';
export type Quality = 'low' | 'medium' | 'high';
export type Language = 'de' | 'en';

export type TargetKind =
  | 'moorflatterer'
  | 'schnellfeder'
  | 'korkenzieher'
  | 'panzerpelz'
  | 'goldschnabel'
  | 'nebelfluesterer'
  | 'taeuscher'
  | 'schwarmvogel'
  | 'kurvensegler'
  | 'sturmvogel'
  | 'boss_moor'
  | 'boss_akrobat'
  | 'boss_nacht';

export type TrajectoryKind =
  | 'linear'
  | 'bezier'
  | 'sine'
  | 'spiral'
  | 'dive'
  | 'zigzag'
  | 'hover'
  | 'flee'
  | 'formation'
  | 'depth';

export interface Vec2 {
  x: number;
  y: number;
}

/** A fully-resolved trajectory sampled by the trajectory evaluator. */
export interface TrajectoryDef {
  kind: TrajectoryKind;
  /** entry/exit edges: 'l','r','t','b' */
  entry?: 'l' | 'r' | 't' | 'b';
  start: Vec2;
  end: Vec2;
  control1?: Vec2;
  control2?: Vec2;
  /** duration in ms */
  duration: number;
  /** wave amplitude for sine/zigzag (px) */
  amplitude?: number;
  /** wave frequency cycles across duration */
  waves?: number;
  /** depth (0 = back, 1 = front) for scale/speed */
  depth?: number;
  /** base speed px/s used by scoring if depth unknown */
  baseSpeed?: number;
}

/** Static, data-driven spawn rule (no runtime state). */
export interface TargetConfig {
  kind: TargetKind;
  /** base points */
  baseScore: number;
  /** hits required to destroy */
  hits: number;
  /** base radius (px) at depth 1 */
  radius: number;
  /** relative weight in the spawn pool */
  weight: number;
  /** minimum difficulty at which the target starts appearing (0..1) */
  minDifficulty: number;
  /** allowed maps (empty = all) */
  maps: MapId[];
  /** min/max speed multiplier */
  speedMin: number;
  speedMax: number;
  /** min/max duration (ms) for a single pass */
  durationMin: number;
  durationMax: number;
  /** perfect-hit inner radius factor (0..1 of radius) */
  perfectFactor: number;
  /** trajectory preference */
  trajectories: TrajectoryKind[];
  /** humor reaction key (localization) */
  reactKey: string;
  /** color theme key */
  palette: string;
}

export interface ScoreBreakdown {
  base: number;
  speedBonus: number;
  depthBonus: number;
  sizeBonus: number;
  precisionBonus: number;
  comboMultiplier: number;
  streakBonus: number;
  eventMultiplier: number;
  swarmBonus: number;
  multikillBonus: number;
  longshotBonus: number;
  trickBonus: number;
  perfectBonus: number;
  total: number;
  isPerfect: boolean;
}

export interface RoundStats {
  mode: GameMode;
  map: MapId;
  score: number;
  shots: number;
  hits: number;
  misses: number;
  perfectHits: number;
  maxCombo: number;
  bestHitValue: number;
  bestHitTarget: TargetKind | null;
  avgReactionMs: number;
  reactionSamples: number;
  hitsByTarget: Partial<Record<TargetKind, number>>;
  eventBonuses: number;
  multikills: number;
  chainReactions: number;
  bossKills: number;
  durationMs: number;
  rank: Rank;
  isPersonalBest: boolean;
}

export type Rank = 'D' | 'C' | 'B' | 'A' | 'S' | 'SS' | 'SSS';

export interface DifficultyState {
  /** 0..1 normalized difficulty */
  value: number;
  /** accuracy factor (0..1) */
  accuracy: number;
  /** combo pressure (0..1) */
  combo: number;
  /** reaction factor (0..1) */
  reaction: number;
  /** time pressure (0..1) */
  time: number;
  /** miss pressure (0..1) */
  misses: number;
  /** score pressure (0..1) */
  score: number;
}

export interface Settings {
  language: Language;
  volumeMaster: number;
  volumeMusic: number;
  volumeSfx: number;
  volumeAmbient: number;
  fullscreen: boolean;
  quality: Quality;
  screenShake: number;
  particleDensity: number;
  crosshairSize: number;
  crosshairColor: string;
  colorBlind: boolean;
  highContrast: boolean;
  reducedMotion: boolean;
  reducedFlashes: boolean;
  keyReload: string;
  keyPause: string;
  keyMute: string;
}

export interface HighscoreEntry {
  score: number;
  mode: GameMode;
  map: MapId;
  rank: Rank;
  accuracy: number;
  maxCombo: number;
  date: number;
}

export interface PlayerStats {
  totalRounds: number;
  totalShots: number;
  totalHits: number;
  totalPerfect: number;
  bestScore: number;
  bestRank: Rank;
  bestCombo: number;
  bossKills: number;
  chainReactions: number;
  totalScore: number;
  longestCombo: number;
  roundsByMode: Partial<Record<GameMode, number>>;
  roundsByMap: Partial<Record<MapId, number>>;
}

export interface Achievement {
  id: string;
  nameKey: string;
  descKey: string;
  target: number;
  /** which stat to track */
  stat: keyof PlayerStats | 'currentCombo' | 'perfectStreak' | 'roundAccuracy' | 'chainStations';
  icon: string;
  /** reward feather coins */
  reward: number;
}

export interface Progression {
  level: number;
  xp: number;
  featherCoins: number;
  unlockedMaps: MapId[];
  unlockedModes: GameMode[];
  ownedCrosshairs: string[];
  selectedCrosshair: string;
  ownedHudThemes: string[];
  selectedHudTheme: string;
  ownedWeaponSkins: string[];
  selectedWeaponSkin: string;
  unlockedAchievements: string[];
  dailyBests: Record<string, number>;
  discoveredObjects: Record<string, number>;
}

export interface SaveData {
  version: number;
  settings: Settings;
  stats: PlayerStats;
  progression: Progression;
  highscores: Record<string, HighscoreEntry[]>;
  tutorialSeen: boolean;
}
