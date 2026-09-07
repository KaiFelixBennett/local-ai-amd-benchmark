import { TypedEmitter } from '../core/EventBus';
import type { GameModeId, MapId, RunStats, RankId, WeatherEventId } from '../core/types';

export interface StartRoundOptions {
  mode: GameModeId;
  map: MapId;
  seed?: number;
}

export interface HudUpdatePayload {
  timeRemainingMs: number | null;
  score: number;
  comboCount: number;
  comboMultiplier: number;
  comboWindowRemaining01: number;
  ammo: number;
  magazineSize: number;
  weaponStatus: 'ready' | 'empty' | 'reloading';
  reloadProgress01: number;
}

export interface ScorePopupPayload {
  x: number;
  y: number;
  points: number;
  perfect: boolean;
  label?: string;
}

export interface BossStatusPayload {
  active: boolean;
  nameKey?: string;
  healthFraction01?: number;
}

export interface RoundEndedPayload {
  stats: RunStats;
  rank: RankId;
  mode: GameModeId;
  map: MapId;
  isNewRecord: boolean;
  previousBest: number | null;
  xpGained: number;
  levelsGained: number;
  currencyGained: number;
  newlyUnlockedAchievements: string[];
  newlyCompletedChallenges: string[];
}

export interface ChallengeHudPayload {
  labelKey: string;
  progress01: number;
}

/** UI -> Game and Game -> UI events, decoupling the Phaser layer from the DOM UI layer. */
export interface GameBridgeEvents {
  // UI -> Game
  startRound: StartRoundOptions;
  pauseRequest: void;
  resumeRequest: void;
  restartRequest: void;
  quitToMenuRequest: void;
  settingsChanged: void;

  // Game -> UI
  hudUpdate: HudUpdatePayload;
  scorePopup: ScorePopupPayload;
  centerBanner: { textKey: string; params?: Record<string, string | number> };
  eventAnnounce: { id: WeatherEventId; active: boolean };
  bossStatus: BossStatusPayload;
  challengeHud: ChallengeHudPayload[];
  roundEnded: RoundEndedPayload;
  gameReady: void;
  pauseStateChanged: { paused: boolean };
}

export const gameBridge = new TypedEmitter<GameBridgeEvents>();
