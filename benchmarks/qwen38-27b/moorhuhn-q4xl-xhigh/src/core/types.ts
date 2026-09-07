/** Gemeinsame ID-Typen des Spiels. */

export type ModeId =
  | 'classic'
  | 'blitz'
  | 'precision'
  | 'endless'
  | 'daily'
  | 'zen'
  | 'tutorial';

export type MapId = 'nebelmoor' | 'sturmklippen' | 'mondbruch';

export type TargetId =
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
  | 'boss_moorkoloss'
  | 'boss_federakrobat'
  | 'boss_nachtgeflister';

export type EventId =
  | 'fog'
  | 'crosswind'
  | 'thunderstorm'
  | 'golden_swarm'
  | 'full_moon'
  | 'reed_burst'
  | 'bonus_balloons'
  | 'rain_front'
  | 'frog_concert'
  | 'firefly_night'
  | 'time_rift'
  | 'mini_boss'
  | 'featherstorm';

export type Quality = 'low' | 'medium' | 'high';

export type CrosshairStyle = 'classic' | 'circle' | 'feather' | 'hex' | 'sniper';

export type HudTheme = 'classic' | 'minimal' | 'retro';

export type WeaponSkin = 'moor_bronze' | 'storm_steel' | 'moon_silver' | 'featherstorm_gold';

export type GamePhase = 'ambient' | 'countdown' | 'playing' | 'paused' | 'ended';

/** Tiefe: 0.5 (weit hinten) bis 1.5 (vorn). 1.0 = Referenzebene. */
export interface Vec2 {
  x: number;
  y: number;
}

/** Errungenschafts-Identifikatoren. */
export type AchievementId =
  | 'noMiss20'
  | 'perfect5'
  | 'acc80'
  | 'combo25'
  | 'chain5'
  | 'bossClean'
  | 'goldThunder'
  | 'endless50000'
  | 'daily'
  | 'hiddenAll'
  | 'sss'
  | 'swarm3s';

export interface RoundStats {
  shots: number;
  hits: number;
  perfectHits: number;
  misses: number;
  maxCombo: number;
  bestHit: number;
  bestHitTarget: TargetId | null;
  avgReactionMs: number;
  targetsHit: Partial<Record<TargetId, number>>;
  eventBonuses: number;
  chainReactions: number;
  bossKills: number;
  noMissStreak: number;
  durationMs: number;
}

export interface ScoreBreakdown {
  base: number;
  speedFactor: number;
  depthFactor: number;
  sizeFactor: number;
  precisionBonus: number;
  comboMultiplier: number;
  eventMultiplier: number;
  streakBonus: number;
  longshotBonus: number;
  trickshotBonus: number;
  multikillBonus: number;
  swarmBonus: number;
  total: number;
  isPerfect: boolean;
  isRecordHit: boolean;
}

export type RankGrade = 'D' | 'C' | 'B' | 'A' | 'S' | 'SS' | 'SSS';

export interface RankResult {
  grade: RankGrade;
  performance: number;
}
