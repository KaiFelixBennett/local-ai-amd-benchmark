/** Central shared type definitions for Moorland Mayhem – Featherstorm. */

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

export type MapId = 'nebelmoor' | 'sturmklippen' | 'mondbruch';

export type GameModeId = 'classic' | 'blitz' | 'precision' | 'endless' | 'daily' | 'zen';

export type WeatherEventId =
  | 'fog'
  | 'wind'
  | 'storm'
  | 'goldenSwarm'
  | 'fullMoon'
  | 'reedRush'
  | 'balloons'
  | 'rainfront'
  | 'frogChorus'
  | 'fireflyNight'
  | 'timeRift'
  | 'miniBoss'
  | 'featherstorm';

export type TrajectoryKind =
  | 'straight'
  | 'bezier'
  | 'sine'
  | 'spiral'
  | 'diveBomb'
  | 'zigzag'
  | 'hover'
  | 'flee'
  | 'formation'
  | 'depthDrift';

export type ScreenEdge = 'left' | 'right' | 'top' | 'bottom';

export type DepthLayer = 'background' | 'midground' | 'foreground';

export interface Vector2 {
  x: number;
  y: number;
}

/** A point in normalized round-progress space, 0..1, used for difficulty/phase curves. */
export type Progress01 = number;

export interface HitZone {
  /** Radius, in local sprite units (0..1 of sprite half-size), that counts as a Perfect Hit. */
  perfectRadius: number;
  /** Radius that counts as any valid hit at all. */
  hitRadius: number;
}

export interface TargetBehaviorConfig {
  trajectory: TrajectoryKind;
  baseSpeed: number;
  speedVariance: number;
  /** How many hit points the target has (armor layers included). */
  health: number;
  /** Score awarded per remaining armor layer broken, in addition to the kill score. */
  armorLayers: number;
  fleeOnMiss: boolean;
  formationSize?: number;
  depthLayer: DepthLayer;
}

export interface TargetConfig {
  id: TargetTypeId;
  nameKey: string;
  descriptionKey: string;
  baseScore: number;
  rarity: number; // relative spawn weight
  behavior: TargetBehaviorConfig;
  hitZone: HitZone;
  bodyRadius: number; // px at scale 1
  onlyDuringEvent?: WeatherEventId;
  minMapUnlockLevel?: number;
  exclusiveToMaps?: MapId[];
  colorPrimary: number;
  colorSecondary: number;
  colorAccent: number;
}

export interface RankThresholds {
  SSS: number;
  SS: number;
  S: number;
  A: number;
  B: number;
  C: number;
  D: number;
}

export type RankId = 'SSS' | 'SS' | 'S' | 'A' | 'B' | 'C' | 'D';

export interface ScoreBreakdownEntry {
  label: string;
  value: number;
}

export interface HitOutcome {
  targetId: TargetTypeId;
  instanceId: string;
  points: number;
  perfect: boolean;
  breakdown: ScoreBreakdownEntry[];
  comboAfter: number;
  multiplierAfter: number;
  position: Vector2;
  killed: boolean;
}

export interface RunStats {
  score: number;
  hits: number;
  misses: number;
  shotsFired: number;
  perfectHits: number;
  highestCombo: number;
  mostValuableHit: number;
  reactionTimesMs: number[];
  targetTypesHit: Partial<Record<TargetTypeId, number>>;
  eventBonusPoints: number;
  chainReactionsTriggered: number;
  bossesDefeated: number;
  startedAt: number;
  durationMs: number;
}

export interface WeaponState {
  magazineSize: number;
  ammo: number;
  isReloading: boolean;
  reloadStartedAt: number;
  reloadDurationMs: number;
  lastShotAt: number;
}

export interface PlayerSettings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  ambienceVolume: number;
  fullscreen: boolean;
  quality: 'low' | 'medium' | 'high';
  screenShakeIntensity: number;
  particleDensity: number;
  crosshairSize: number;
  crosshairColor: string;
  colorBlindMode: 'off' | 'protanopia' | 'deuteranopia' | 'tritanopia';
  highContrastHits: boolean;
  reducedMotion: boolean;
  reducedFlashing: boolean;
  language: 'de' | 'en';
  keybindReload: string;
  keybindPause: string;
  keybindFullscreen: string;
}

export interface UnlockState {
  unlockedMaps: MapId[];
  unlockedModes: GameModeId[];
  unlockedCrosshairs: string[];
  unlockedHudThemes: string[];
  unlockedWeaponSkins: string[];
  equippedCrosshair: string;
  equippedHudTheme: string;
  equippedWeaponSkin: string;
}

export interface ProgressionState {
  level: number;
  xp: number;
  xpToNextLevel: number;
  currency: number;
}

export interface AchievementProgress {
  id: string;
  unlocked: boolean;
  unlockedAt?: number;
  progress: number;
}

export interface ChallengeProgress {
  id: string;
  progress: number;
  completed: boolean;
  completedAt?: number;
}

export interface HighscoreEntry {
  score: number;
  rank: RankId;
  mode: GameModeId;
  map: MapId;
  date: number;
  hits: number;
  misses: number;
  accuracy: number;
  highestCombo: number;
}

export interface SaveDataV1 {
  version: 1;
  settings: PlayerSettings;
  unlocks: UnlockState;
  progression: ProgressionState;
  achievements: AchievementProgress[];
  challenges: ChallengeProgress[];
  highscores: HighscoreEntry[];
  dailyHighscores: Record<string, HighscoreEntry>;
  stats: {
    totalShotsFired: number;
    totalHits: number;
    totalMisses: number;
    totalRoundsPlayed: number;
    totalPlayMs: number;
    bestCombo: number;
    targetTypeKills: Partial<Record<TargetTypeId, number>>;
    bossesDefeated: number;
    chainReactionsTriggered: number;
  };
  tutorialCompleted: boolean;
}

export type SaveData = SaveDataV1;

export const SAVE_VERSION = 1;

export interface RoundConfig {
  mode: GameModeId;
  map: MapId;
  durationMs: number | null; // null = endless
  seed: number;
  limitedAmmo: boolean;
  autoReload: boolean;
  comboWindowMs: number;
}
