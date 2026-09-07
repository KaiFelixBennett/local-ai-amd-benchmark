/** Shared type definitions for Moorland Mayhem - Featherstorm. */

export type Lang = 'de' | 'en';
export type Quality = 'low' | 'medium' | 'high';
export type Colorblind = 'off' | 'protanopia' | 'deuteranopia' | 'tritanopia';

export interface Settings {
  masterVolume: number; // 0..1
  musicVolume: number;
  sfxVolume: number;
  ambientVolume: number;
  quality: Quality;
  shakeIntensity: number; // 0..1.5
  particleDensity: number; // 0..1.5
  crosshairSize: number; // 0.7..1.6 scale
  crosshairColor: string; // css color
  colorblind: Colorblind;
  highContrast: boolean;
  reduceMotion: boolean;
  reduceFlashes: boolean;
  language: Lang | 'auto';
  leftCanFire: boolean;
  keyReload: string; // KeyboardEvent.code
  keyPause: string;
  keySlow: string; // debug slow motion during dev
}

export interface KeybindInfo {
  code: string;
  labelKey: string;
}

export type ModeId =
  | 'classic'
  | 'blitz'
  | 'precision'
  | 'endless'
  | 'daily'
  | 'zen'
  | 'tutorial';

export type MapId = 'nebelmoor' | 'sturmklippen' | 'mondbruch';

export type TargetKind =
  | 'flatterer'
  | 'swift'
  | 'corkscrew'
  | 'armored'
  | 'gold'
  | 'mist'
  | 'decoy'
  | 'swarm'
  | 'glider'
  | 'storm'
  | 'balloon'
  | 'bossArmored'
  | 'bossAcrobat'
  | 'bossNight';

export interface TargetConfig {
  id: TargetKind;
  nameKey: string;
  baseScore: number;
  hitRadius: number; // in texture units at scale 1
  perfectRatio: number; // fraction of hitRadius counting as perfect
  health: number;
  speed: number; // world px/s at depth 0.5
  weight: number; // base spawn weight
  minPhase: number; // 0..5 story phase index at which it may spawn
  maxActive: number;
  pointsPerDepth: number; // extra multiplier per depth unit 0..1
  quipKeys: string[]; // humor popups when hit
  hostile?: boolean; // penalty on hit (decoy)
}

export type PathKind =
  | 'line'
  | 'bezier'
  | 'sine'
  | 'spiral'
  | 'dive'
  | 'zigzag'
  | 'hover'
  | 'formation'
  | 'depth';

export interface PathSpec {
  kind: PathKind;
  edge: Edge;
  dir?: 1 | -1; // horizontal launch direction override (for edge top/bottom)
  y0?: number; // normalized start offset along edge 0..1
  length?: number; // travel distance px
  speed?: number; // px/s (scaled by difficulty)
  amp?: number; // wave amplitude px
  freq?: number; // wave frequency cycles per 100px
  curl?: number; // spiral curl
  ctrl?: [number, number][]; // relative bezier control points
  holdAt?: number; // hover: normalized t at which the target stops briefly
  holdTime?: number; // hover duration seconds
  depthStart?: number; // depth path 0..1
  depthEnd?: number;
  formationIndex?: number; // offset index for formation birds
  formationLeader?: number; // group id
}

export type Edge = 'left' | 'right' | 'top' | 'bottom';

export interface SpawnEvent {
  time: number; // seconds from round start
  kind: TargetKind;
  path: PathSpec;
  groupId?: number; // links swarm members / boss waves
}

export type EventId =
  | 'fog'
  | 'wind'
  | 'thunder'
  | 'goldSwarm'
  | 'fullMoon'
  | 'rush'
  | 'balloons'
  | 'rain'
  | 'frogs'
  | 'fireflies'
  | 'timeRift'
  | 'boss'
  | 'featherstorm';

export interface RoundEventDef {
  id: EventId;
  nameKey: string;
  descKey: string;
  duration: number; // seconds; -1 = until phase end
  weight: number;
  effectMultiplier: number; // score multiplier while active
  musicMood?: 'calm' | 'normal' | 'tense' | 'magical';
  maps?: MapId[]; // restricted maps
  minPhase?: number;
}

export interface ModeConfig {
  id: ModeId;
  nameKey: string;
  descKey: string;
  duration: number; // seconds, -1 endless
  magazineSize: number;
  autoReload: boolean;
  totalAmmo?: number; // precision: finite ammo for whole round
  comboWindow: number; // seconds a hit extends combo
  comboDecay: number; // multiplier lost per second idle
  baseSpawnRate: number; // targets per second baseline
  difficultyRate: number; // speed ramp per minute
  scoreMult: number;
  eventsEnabled: boolean;
  eventEvery?: [number, number]; // seconds range between events
  fixedDifficulty?: number; // daily: fixed difficulty factor
  zenPenalties?: boolean;
  unlockLevel: number; // required player level
}

export interface EnvObjectDef {
  id: string;
  kind: EnvKind;
  x: number; // normalized 0..1 over game width
  y: number;
  radius: number;
  scale?: number;
  flip?: boolean;
  points?: number;
  action?: EnvAction;
  chainTrigger?: string; // chain id completed by hitting this
  hidden?: boolean; // counts as secret discovery
}

export type EnvKind =
  | 'windmill'
  | 'lantern'
  | 'cans'
  | 'sign'
  | 'bell'
  | 'scarecrow'
  | 'pumpkin'
  | 'mushroom'
  | 'puddle'
  | 'bucket'
  | 'hollow'
  | 'reeds'
  | 'wagon'
  | 'weathervane'
  | 'bottle'
  | 'firefly'
  | 'ghostlight'
  | 'lighthouse'
  | 'crystal'
  | 'nestbasket';

export type EnvAction =
  | 'points'
  | 'bonusTime'
  | 'multiplier'
  | 'slowmo'
  | 'spawnGold'
  | 'spawnSwarm'
  | 'scare'
  | 'spores'
  | 'splash'
  | 'chain';

export interface ChainDef {
  id: string;
  nameKey: string;
  steps: string[]; // env object ids in order
  bonus: number;
}

export interface MapDef {
  id: MapId;
  nameKey: string;
  descKey: string;
  unlockLevel: number;
  palette: MapPalette;
  objects: EnvObjectDef[];
  chains: ChainDef[];
  exclusiveKinds: TargetKind[];
  specialEvent: EventId;
  ambientKey: 'wind' | 'water' | 'night';
}

export interface MapPalette {
  skyTop: string;
  skyBottom: string;
  hillsFar: string;
  hillsMid: string;
  ground: string;
  reedColor: string;
  fogColor: string;
  accent: string;
  waterTint: string;
  night: boolean;
}

// ---------- scoring & run state ----------

export interface ShotHitInfo {
  kind: TargetKind;
  precision: number; // 0..1 relative distance to center (0 = center)
  depth: number; // 0 far .. 1 near
  speed: number; // current world speed px/s
  sizeScale: number; // visual scale
  timeLeft: number; // seconds; -1 endless
  eventMultiplier: number;
  comboHits: number; // hits in current combo before this hit
  swarmBonus: boolean;
  trickshot: boolean;
  longshot: boolean;
  perfect: boolean;
  streak: number; // consecutive hits without miss
  kindBonusDepthPoints: number; // per-config extra points per depth unit
}

export interface ScoreBreakdown {
  base: number;
  speed: number;
  depth: number;
  size: number;
  precision: number;
  combo: number;
  time: number;
  event: number;
  bonus: number;
  total: number;
  perfect: boolean;
}

export interface WeaponState {
  status: 'ready' | 'firing' | 'reloading' | 'empty';
  ammo: number;
  reserve: number; // -1 = unlimited
  reloadLeft: number;
  fireLeft: number;
}

export interface RunStats {
  score: number;
  hits: number;
  misses: number;
  shots: number;
  perfects: number;
  bestCombo: number;
  combo: number;
  bestHit: number;
  reactionSum: number;
  reactionCount: number;
  kindHits: Partial<Record<TargetKind, number>>;
  eventBonus: number;
  envBonus: number;
  chainBonus: number;
  bossKills: number;
  decoyHits: number;
  chainsDone: string[];
  hiddenFound: string[];
  swarmBonusDone: boolean;
  perfectStreak: number;
  bestPerfectStreak: number;
  hitStreakNoMiss: number;
  bonusTime: number;
  xps: number;
}

export type Rank = 'D' | 'C' | 'B' | 'A' | 'S' | 'SS' | 'SSS';

export interface RunResult {
  mode: ModeId;
  map: MapId;
  seed: number;
  stats: RunStats;
  rank: Rank;
  score: number;
  xp: number;
  isBest: boolean;
  previousBest: number;
  newAchievements: string[];
  leveledUp: boolean;
  newLevel: number;
  currencyEarned: number;
  dailyKey?: string;
  dailyBest?: number;
}

// ---------- save ----------

export interface HighscoreEntry {
  score: number;
  rank: Rank;
  date: string;
  accuracy: number;
}

export interface GlobalStats {
  rounds: number;
  totalShots: number;
  totalHits: number;
  totalPerfect: number;
  bestComboEver: number;
  bossKillsEver: number;
  chainsEver: number;
  playSeconds: number;
  kindHits: Partial<Record<TargetKind, number>>;
  modePlays: Partial<Record<ModeId, number>>;
}

export interface Progress {
  xp: number;
  level: number;
  currency: number;
  ownedCrosshairs: string[];
  ownedHuds: string[];
  ownedWeapons: string[];
  activeCrosshair: string;
  activeHud: string;
  activeWeapon: string;
  achievements: string[];
  challengeProgress: Record<string, number>;
  claimedChallenges: string[];
  hiddenFound: Partial<Record<MapId, string[]>>;
}

export interface SaveData {
  version: number;
  settings: Settings;
  progress: Progress;
  stats: GlobalStats;
  highscores: Record<string, HighscoreEntry>; // key mode|map
  dailyRecords: Record<string, { score: number; rank: Rank }>; // key YYYY-MM-DD
  seenTutorial: boolean;
}
