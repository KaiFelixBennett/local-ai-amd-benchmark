import type { MapId, ModeId, Rank, RunSummary, Settings } from '../types';

/**
 * Contract between the DOM UI layer and the game core. The DOM layer only ever
 * talks to this interface; the engine only emits bus events. This keeps both sides
 * independently testable and swappable.
 */
export interface GameCoreAPI {
  // audio
  unlockAudio(): void;
  playUI(name: 'click' | 'hover' | 'back'): void;

  // settings (proxies GameClient.settings, persisted automatically)
  getSetting<K extends keyof Settings>(k: K): Settings[K];
  setSetting<K extends keyof Settings>(k: K, v: Settings[K]): void;

  // navigation
  go(screen: ScreenId): void;
  back(): void;

  // game flow
  startRound(mode: ModeId, map: MapId): void;
  retryRound(): void;
  quitToMenu(): void;
  pauseGame(): void;
  resumeGame(): void;
  startTutorial(): void;

  // fullscreen
  toggleFullscreen(): void;
}

export type ScreenId =
  | 'boot'
  | 'main'
  | 'modeSelect'
  | 'mapSelect'
  | 'howto'
  | 'game'
  | 'pause'
  | 'settings'
  | 'results'
  | 'highscores'
  | 'stats'
  | 'progress'
  | 'achievements'
  | 'credits';

export interface HudState {
  score: number;
  scoreDisplay: number;
  timeLeft: number; // seconds; Infinity for zen
  isZen: boolean;
  combo: number;
  comboFrac: number;
  multiplier: number;
  ammo: number;
  magazineSize: number;
  reserve: number; // -1 = unlimited
  weaponState: 'ready' | 'empty' | 'reloading';
  reloadFrac: number;
  eventLabel: string | null;
  eventActive: boolean;
  phase: string;
  chainLabel: string | null;
  bossName: string | null;
  bossHp: number; // 0..1
  bossMaxHp: number;
  bossActive: boolean;
  perfect: boolean;
  noMiss: boolean;
  isRecord: boolean;
}

export interface ResultsPayload {
  summary: RunSummary;
  isRecord: boolean;
  previousBest: number | null;
  xpGained: number;
  coinsGained: number;
  leveledUp: boolean;
  newAchievements: string[];
  rank: Rank;
}
