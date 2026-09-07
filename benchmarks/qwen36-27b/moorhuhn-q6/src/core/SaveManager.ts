import type { PlayerProgress, GameSettings, GameModeId, EnvironmentId } from '../types';
import { DEFAULT_PROGRESS, DEFAULT_SETTINGS } from '../types';

const SAVE_KEY = 'moorland_mayhem_save';
const SAVE_VERSION = 1;

export function loadProgress(): PlayerProgress {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return { ...DEFAULT_PROGRESS };

    const data = JSON.parse(raw) as Partial<PlayerProgress>;

    // Migration: ensure all fields exist
    const progress: PlayerProgress = {
      version: data.version ?? 1,
      totalXp: data.totalXp ?? 0,
      level: data.level ?? 1,
      totalCurrency: data.totalCurrency ?? 0,
      totalRounds: data.totalRounds ?? 0,
      totalHits: data.totalHits ?? 0,
      totalShots: data.totalShots ?? 0,
      totalPerfectHits: data.totalPerfectHits ?? 0,
      totalMaxCombo: data.totalMaxCombo ?? 0,
      totalScore: data.totalScore ?? 0,
      highscores: data.highscores ?? { classic: 0, blitz: 0, precision: 0, endless: 0, daily: 0, zen: 0 },
      unlockedEnvironments: data.unlockedEnvironments ?? ['nebelmoor'],
      unlockedModes: data.unlockedModes ?? ['classic', 'daily'],
      unlockedCrosshairs: data.unlockedCrosshairs ?? ['default'],
      unlockedHudThemes: data.unlockedHudThemes ?? ['default'],
      unlockedWeaponSkins: data.unlockedWeaponSkins ?? ['default'],
      achievements: data.achievements ?? [],
      challenges: data.challenges ?? {},
      dailyRecords: data.dailyRecords ?? {},
      settings: { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) },
    };

    // Ensure highscores has all modes
    const modes: GameModeId[] = ['classic', 'blitz', 'precision', 'endless', 'daily', 'zen'];
    for (const m of modes) {
      if (!(m in progress.highscores)) {
        progress.highscores[m] = 0;
      }
    }

    return progress;
  } catch {
    return { ...DEFAULT_PROGRESS };
  }
}

export function saveProgress(progress: PlayerProgress): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(progress));
  } catch {
    // Storage full or unavailable - silently fail
  }
}

export function loadSettings(): GameSettings {
  const progress = loadProgress();
  return progress.settings;
}

export function saveSettings(settings: GameSettings): void {
  const progress = loadProgress();
  progress.settings = settings;
  saveProgress(progress);
}
