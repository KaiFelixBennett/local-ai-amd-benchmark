/**
 * Versioniertes Savegame in LocalStorage.
 * Schema-Version 1; Migrationen für ältere Versionen.
 * Frei von Phaser — im Browser und in Tests lauffähig.
 */
import type { MapId, ModeId, RankGrade, TargetId } from './types';
import { dayKey } from './rng';

export const SAVE_KEY = 'moorland-mayhem-featherstorm';
export const SAVE_VERSION = 1;

export interface Settings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  ambientVolume: number;
  quality: 'low' | 'medium' | 'high';
  screenShake: number; // 0..1
  particleDensity: number; // 0..1
  crosshairStyle: string;
  crosshairSize: number; // 0.6..1.6
  crosshairColor: string;
  colorblind: boolean;
  highContrastHits: boolean;
  reducedMotion: boolean;
  reducedFlashes: boolean;
  hudTheme: string;
  weaponSkin: string;
  lang: 'de' | 'en';
  pauseKey: string;
  reloadKey: string;
}

export interface HighscoreEntry {
  score: number;
  mode: ModeId;
  map: MapId;
  date: string; // ISO
  rank: RankGrade;
  isDaily: boolean;
  day?: string;
}

export interface Progress {
  xp: number;
  level: number;
  feathers: number;
  roundsPlayed: number;
  bestScore: number;
  bestCombo: number;
  bestAccuracy: number;
  bestRank: RankGrade;
  totalShots: number;
  totalHits: number;
  totalPerfect: number;
  playtimeMs: number;
  unlockedModes: ModeId[];
  unlockedMaps: MapId[];
  achievements: string[];
  challenges: Record<string, number>; // challengeId -> Fortschritt
  completedChallenges: string[];
  bestPerMap: Partial<Record<MapId, number>>;
  dailyRecords: Record<string, number>; // dayKey -> best score
  hiddenFound: Partial<Record<MapId, string[]>>;
}

export interface SaveData {
  version: number;
  settings: Settings;
  progress: Progress;
  highscores: HighscoreEntry[];
}

export const DEFAULT_SETTINGS: Settings = {
  masterVolume: 0.8,
  musicVolume: 0.6,
  sfxVolume: 0.8,
  ambientVolume: 0.6,
  quality: 'high',
  screenShake: 0.7,
  particleDensity: 0.8,
  crosshairStyle: 'classic',
  crosshairSize: 1.0,
  crosshairColor: '#ffd23e',
  colorblind: false,
  highContrastHits: true,
  reducedMotion: false,
  reducedFlashes: false,
  hudTheme: 'classic',
  weaponSkin: 'moor_bronze',
  lang: 'de',
  pauseKey: 'Escape',
  reloadKey: 'KeyR',
};

export const DEFAULT_PROGRESS: Progress = {
  xp: 0,
  level: 1,
  feathers: 0,
  roundsPlayed: 0,
  bestScore: 0,
  bestCombo: 0,
  bestAccuracy: 0,
  bestRank: 'D',
  totalShots: 0,
  totalHits: 0,
  totalPerfect: 0,
  playtimeMs: 0,
  unlockedModes: ['classic', 'tutorial'],
  unlockedMaps: ['nebelmoor'],
  achievements: [],
  challenges: {},
  completedChallenges: [],
  bestPerMap: {},
  dailyRecords: {},
  hiddenFound: {},
};

/** XP für Level n -> n+1. */
export function xpForLevel(level: number): number {
  return 100 + (level - 1) * 150;
}

/** Bestimmt Level aus XP. */
export function levelForXp(xp: number): number {
  let level = 1;
  let need = xpForLevel(level);
  while (xp >= need && level < 99) {
    xp -= need;
    level += 1;
    need = xpForLevel(level);
  }
  return level;
}

/** Migrationen: nimmt ein Savegame jeder Version, liefert aktuelles Schema. */
export function migrate(data: unknown): SaveData {
  if (!data || typeof data !== 'object') return freshSave();
  const d = data as Record<string, unknown>;
  let version = typeof d.version === 'number' ? d.version : 0;

  const settings = { ...DEFAULT_SETTINGS, ...(typeof d.settings === 'object' ? d.settings : {}) };
  const progress = { ...DEFAULT_PROGRESS, ...(typeof d.progress === 'object' ? d.progress : {}) };
  let highscores: HighscoreEntry[] = Array.isArray(d.highscores) ? (d.highscores as HighscoreEntry[]) : [];

  if (version === 0) {
    // Version 0 -> 1: alte Keys normalisieren.
    if (Array.isArray(progress.unlockedModes)) {
      progress.unlockedModes = progress.unlockedModes.filter((m) =>
        ['classic', 'blitz', 'precision', 'endless', 'daily', 'zen', 'tutorial'].includes(m),
      );
      if (!progress.unlockedModes.includes('classic')) progress.unlockedModes.push('classic');
      if (!progress.unlockedModes.includes('tutorial')) progress.unlockedModes.push('tutorial');
    }
    if (Array.isArray(progress.unlockedMaps)) {
      progress.unlockedMaps = progress.unlockedMaps.filter((m) =>
        ['nebelmoor', 'sturmklippen', 'mondbruch'].includes(m),
      );
      if (!progress.unlockedMaps.includes('nebelmoor')) progress.unlockedMaps.push('nebelmoor');
    }
    highscores = highscores.filter(
      (h) => typeof h.score === 'number' && typeof h.mode === 'string' && typeof h.map === 'string',
    );
    version = 1;
  }

  return { version: SAVE_VERSION, settings, progress, highscores };
}

export function freshSave(): SaveData {
  return {
    version: SAVE_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    progress: {
      ...DEFAULT_PROGRESS,
      unlockedModes: ['classic', 'tutorial'],
      unlockedMaps: ['nebelmoor'],
      challenges: {},
      completedChallenges: [],
      achievements: [],
      bestPerMap: {},
      dailyRecords: {},
      hiddenFound: {},
    },
    highscores: [],
  };
}

export class SaveStore {
  private storage: { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };

  constructor(storage?: Storage) {
    this.storage = storage ?? (typeof localStorage !== 'undefined' ? localStorage : nullStorage());
  }

  load(): SaveData {
    try {
      const raw = this.storage.getItem(SAVE_KEY);
      if (!raw) return freshSave();
      const parsed = JSON.parse(raw) as unknown;
      return migrate(parsed);
    } catch {
      return freshSave();
    }
  }

  save(data: SaveData): boolean {
    try {
      this.storage.setItem(SAVE_KEY, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  clear(): void {
    try {
      this.storage.removeItem(SAVE_KEY);
    } catch {
      /* ignore */
    }
  }
}

function nullStorage() {
  return {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  };
}

/** Fügt XP hinzu und gibt neue Level-upps zurück. */
export function grantXp(progress: Progress, amount: number): number[] {
  const levels: number[] = [];
  progress.xp += Math.max(0, Math.round(amount));
  const newLevel = levelForXp(progress.xp);
  while (progress.level < newLevel) {
    progress.level += 1;
    levels.push(progress.level);
  }
  if (progress.level > newLevel) progress.level = newLevel;
  return levels;
}

/** Aktualisiert Highscores (max 25 Einträge, Daily getrennt). */
export function upsertHighscore(data: SaveData, entry: HighscoreEntry): boolean {
  const isRecord = entry.score > data.progress.bestScore;
  if (entry.isDaily) {
    const key = dayKey();
    const prev = data.progress.dailyRecords[key] ?? 0;
    if (entry.score > prev) data.progress.dailyRecords[key] = entry.score;
    data.highscores = data.highscores.filter((h) => !(h.isDaily && h.day === key));
    data.highscores.push({ ...entry, day: key });
  } else {
    data.highscores.push(entry);
  }
  data.highscores.sort((a, b) => b.score - a.score);
  data.highscores = data.highscores.slice(0, 25);
  if (isRecord) data.progress.bestScore = entry.score;
  return isRecord;
}

/** Erhöht Challenge-Fortschritt; gibt true zurück bei Abschluss. */
export function bumpChallenge(progress: Progress, id: string, amount = 1, target: number): boolean {
  if (progress.completedChallenges.includes(id)) return false;
  const cur = progress.challenges[id] ?? 0;
  progress.challenges[id] = Math.min(target, cur + amount);
  if (progress.challenges[id] >= target) {
    progress.completedChallenges.push(id);
    return true;
  }
  return false;
}

/** Update der globalen Statistiken nach einer Runde. */
export function applyRoundStats(
  data: SaveData,
  stats: {
    shots: number;
    hits: number;
    perfectHits: number;
    maxCombo: number;
    durationMs: number;
    rank: RankGrade;
    targetsHit: Partial<Record<TargetId, number>>;
  },
): void {
  const p = data.progress;
  p.roundsPlayed += 1;
  p.totalShots += stats.shots;
  p.totalHits += stats.hits;
  p.totalPerfect += stats.perfectHits;
  p.playtimeMs += stats.durationMs;
  if (stats.maxCombo > p.bestCombo) p.bestCombo = stats.maxCombo;
  const acc = stats.shots > 0 ? stats.hits / stats.shots : 0;
  if (acc > p.bestAccuracy) p.bestAccuracy = acc;
  const order: RankGrade[] = ['D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];
  if (order.indexOf(stats.rank) > order.indexOf(p.bestRank)) p.bestRank = stats.rank;
}
