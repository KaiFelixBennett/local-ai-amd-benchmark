import type { MapId, ModeId } from '../types';

/* Phase of a round's dramatic structure. */
export type PhaseId = 'intro' | 'ramp' | 'mid' | 'rest' | 'intense' | 'finale';

export const PHASE_IDS: readonly PhaseId[] = ['intro', 'ramp', 'mid', 'rest', 'intense', 'finale'];

export type TrajectoryKind =
  'line' | 'bezier' | 'sine' | 'spiral' | 'dive' | 'zigzag' | 'hover' | 'flee' | 'formation' | 'depth';

export type WeightedMap = Partial<Record<MapId | 'any', number>>;

export interface TargetDef {
  id: string;
  /** i18n keys: name.<id> defined in i18n or auto-fallback to id */
  basePoints: number;
  hp: number;
  armor?: number; // extra hits required, drawn as breaking plates
  /** baseline apparent speed range px/s at depth 1 */
  speed: [number, number];
  /** outer hitbox radii at scale 1 */
  rx: number;
  ry: number;
  /** inner perfect ellipse as ratio of outer */
  perfectRatio: number;
  /** 0..1 spawn weight (0 = never unless forced) */
  weights: WeightedMap;
  allowedTrajectories: TrajectoryKind[];
  /** apparent depth range (0.5 far .. 1.6 near) */
  depthRange: [number, number];
  /** phases this target may spawn in (omit = all) */
  phases?: PhaseId[];
  /** score is scaled by depth (foreground/back targets) */
  depthScoring?: boolean;
  rare?: boolean;
  /** behavior flags */
  flags?: {
    /** disappears/partially hidden in fog */
    fogHidden?: boolean;
    /** only spawns during a weather event */
    weatherOnly?: boolean;
    /** penalizes on hit (Täuscher) */
    deceptive?: boolean;
    /** spawns as a formation group */
    swarm?: { min: number; max: number; bonusWindowSec: number; bonus: number };
  };
}

export interface PhaseSlice {
  id: PhaseId;
  /** fraction of round duration */
  from: number;
  to: number;
}

export interface ModeDef {
  id: ModeId;
  /** null = endless/zen (no hard stop) */
  durationSec: number | null;
  magazineSize: number;
  autoReload: boolean;
  comboWindowMs: number;
  comboDrainPerMiss: number;
  /** base interval between spawn decisions, seconds */
  spawnIntervalSec: [number, number];
  scoreMult: number;
  /** multiplier on difficultyDirector influence */
  difficultySensitivity: number;
  /** fixed total ammo for precision mode, null = unlimited */
  totalAmmo: number | null;
  eventPool: string[];
  /** 'all' or explicit target id list */
  allowedTargets: 'all' | string[];
  phases: PhaseSlice[];
  bossChance: number;
  maxConcurrentTargets: number;
  zen?: boolean;
}

export interface EffectSpec {
  points?: number;
  timeBonusSec?: number;
  scoreMult?: { value: number; durationSec: number };
  slowTime?: { durationSec: number; scale: number };
  spawn?: { targetId: string; count: number };
  /** humorous scare animation on a creature */
  scare?: string;
  reveal?: { hiddenObjectId: string };
}

export interface EnvObjectDef {
  id: string;
  kind: string; // renderer picks art by kind
  x: number;
  y: number;
  scale?: number;
  hitsRequired: number;
  hidden?: boolean;
  score: number;
  effect?: EffectSpec;
  /** if part of a chain, the chain id this object advances */
  chainId?: string;
  /** secret: counts toward hidden-object discovery */
  secret?: boolean;
}

export interface ChainStepDef {
  objectId: string;
  effect: EffectSpec;
}

export interface ChainDef {
  id: string;
  map: MapId;
  windowSec: number; // max time between steps to keep chain alive
  steps: ChainStepDef[];
  finalBonus: number;
}

export interface EventDef {
  id: string;
  durationSec: number;
  /** spawn-rate multiplier while active */
  spawnRateMult?: number;
  speedMult?: number;
  scoreMult?: number;
  fog?: number; // 0..1 fog intensity
  wind?: number; // -1..1 lateral wind strength
  darkness?: number; // 0..1
  golden?: boolean;
  timeScale?: number; // slow-mo etc.
  weatherOnly?: boolean; // counts as a weather event (gates Sturmvögel)
  allowedMaps?: MapId[];
  minPhase?: PhaseId;
  weight: number;
}

export interface MapDef {
  id: MapId;
  /** palette hexes consumed by procedural art */
  palette: Record<string, string>;
  defaultWind: number;
  fogBase: number;
  eventPool: string[];
  exclusiveTargets: string[];
  envObjects: EnvObjectDef[];
  chains: ChainDef[];
  ambientKind: 'marsh' | 'coast' | 'night';
}

export interface CrosshairDef {
  id: string;
  style: 'ring' | 'cross' | 'dot' | 'reticle' | 'feather' | 'scope';
  color: string;
  unlockLevel?: number;
  cost?: number;
}

export interface HudSkinDef {
  id: string;
  theme: 'classic' | 'neon' | 'paper' | 'military';
  unlockLevel?: number;
  cost?: number;
}

export interface WeaponSkinDef {
  id: string;
  bodyColor: string;
  accentColor: string;
  unlockLevel?: number;
  cost?: number;
}

export interface ChallengeDef {
  id: string;
  goal: number;
  rewardCoins: number;
  /** which live metric this challenge tracks (updated during runs) */
  metric:
    | 'hits_without_miss'
    | 'perfect_streak'
    | 'swarm_clear_time'
    | 'boss_no_miss'
    | 'hidden_found_map'
    | 'accuracy'
    | 'chain_steps'
    | 'gold_during_storm'
    | 'no_miss_run';
  /** optional: restrict to a map */
  map?: MapId;
  repeatable?: boolean;
}

export interface AchievementDef {
  id: string;
  goal: number;
  /** lifetime metric key on save.stats */
  metric: string;
}
