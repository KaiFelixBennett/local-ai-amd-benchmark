/** Gemeinsame Typen für Runden-Konfiguration und -Ergebnis (Phaser-frei). */
import type { MapId, ModeId, RankResult, RoundStats } from '../core/types';

export interface RoundConfig {
  mode: ModeId;
  mapId: MapId;
  /** Seed (Daily: dailyChallengeSeed()). */
  seed: string | number;
}

export interface RoundResultData {
  mode: ModeId;
  mapId: MapId;
  seed: string;
  score: number;
  stats: RoundStats;
  rank: RankResult;
  /** Neuer persönlicher Rekord? */
  isRecord: boolean;
  /** Bisheriger Bestwert (vor dieser Runde). */
  previousBest: number;
  /** Tagesrekord (Daily). */
  dailyRecord: number | null;
  xpGained: number;
  levelsGained: number[];
  feathersGained: number;
  /** Neu freigeschaltete Errungenschaften. */
  newAchievements: string[];
  /** Neu abgeschlossene Herausforderungen. */
  newChallenges: string[];
  /** Neu freigeschaltete Modi/Karten (Anzeige). */
  newUnlocks: string[];
}
