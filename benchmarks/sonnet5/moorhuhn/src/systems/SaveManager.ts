import { SAVE_VERSION, type SaveData, type SaveDataV1 } from '../core/types';
import { BALANCE } from '../config/balance';

const STORAGE_KEY = 'moorland-mayhem-save';

export function createDefaultSaveData(): SaveDataV1 {
  return {
    version: SAVE_VERSION,
    settings: {
      masterVolume: 0.8,
      musicVolume: 0.7,
      sfxVolume: 0.9,
      ambienceVolume: 0.6,
      fullscreen: false,
      quality: 'high',
      screenShakeIntensity: 0.7,
      particleDensity: 1.0,
      crosshairSize: 1.0,
      crosshairColor: '#f2c14e',
      colorBlindMode: 'off',
      highContrastHits: false,
      reducedMotion: false,
      reducedFlashing: false,
      language: 'de',
      keybindReload: 'R',
      keybindPause: 'Escape',
      keybindFullscreen: 'F',
    },
    unlocks: {
      unlockedMaps: ['nebelmoor'],
      unlockedModes: ['classic', 'daily', 'zen'],
      unlockedCrosshairs: ['classic', 'dot'],
      unlockedHudThemes: ['default'],
      unlockedWeaponSkins: ['field'],
      equippedCrosshair: 'classic',
      equippedHudTheme: 'default',
      equippedWeaponSkin: 'field',
    },
    progression: {
      level: 1,
      xp: 0,
      xpToNextLevel: BALANCE.progression.xpToNextLevelBase,
      currency: 0,
    },
    achievements: [],
    challenges: [],
    highscores: [],
    dailyHighscores: {},
    stats: {
      totalShotsFired: 0,
      totalHits: 0,
      totalMisses: 0,
      totalRoundsPlayed: 0,
      totalPlayMs: 0,
      bestCombo: 0,
      targetTypeKills: {},
      bossesDefeated: 0,
      chainReactionsTriggered: 0,
    },
    tutorialCompleted: false,
  };
}

/** Deep-merges parsed/partial save data onto a fresh default so missing fields are always present. */
function sanitize(raw: Record<string, unknown>): SaveDataV1 {
  const base = createDefaultSaveData();
  const merged: SaveDataV1 = {
    ...base,
    ...raw,
    version: SAVE_VERSION,
    settings: { ...base.settings, ...(raw.settings as object | undefined) },
    unlocks: { ...base.unlocks, ...(raw.unlocks as object | undefined) },
    progression: { ...base.progression, ...(raw.progression as object | undefined) },
    stats: { ...base.stats, ...(raw.stats as object | undefined) },
    achievements: Array.isArray(raw.achievements) ? (raw.achievements as SaveDataV1['achievements']) : [],
    challenges: Array.isArray(raw.challenges) ? (raw.challenges as SaveDataV1['challenges']) : [],
    highscores: Array.isArray(raw.highscores) ? (raw.highscores as SaveDataV1['highscores']) : [],
    dailyHighscores:
      raw.dailyHighscores && typeof raw.dailyHighscores === 'object'
        ? (raw.dailyHighscores as SaveDataV1['dailyHighscores'])
        : {},
    tutorialCompleted: Boolean(raw.tutorialCompleted),
  };
  // unlocks always include the free starter set even for hand-edited/corrupt saves
  merged.unlocks.unlockedMaps = Array.from(new Set(['nebelmoor', ...merged.unlocks.unlockedMaps]));
  merged.unlocks.unlockedModes = Array.from(
    new Set(['classic', 'daily', 'zen', ...merged.unlocks.unlockedModes]),
  );
  return merged;
}

/** Legacy pre-versioning shape (version 0 / undefined): had `score` history instead of `highscores`. */
function migrateV0toV1(raw: Record<string, unknown>): Record<string, unknown> {
  const migrated: Record<string, unknown> = { ...raw };
  if (!Array.isArray(migrated.highscores) && Array.isArray(migrated.scoreHistory)) {
    migrated.highscores = migrated.scoreHistory;
  }
  delete migrated.scoreHistory;
  migrated.version = 1;
  return migrated;
}

/** Upgrades arbitrary/parsed save JSON to the current schema, applying migrations in order. */
export function migrateSaveData(raw: unknown): SaveDataV1 {
  if (!raw || typeof raw !== 'object') return createDefaultSaveData();
  let data = raw as Record<string, unknown>;
  let version = typeof data.version === 'number' ? data.version : 0;

  if (version < 1) {
    data = migrateV0toV1(data);
    version = 1;
  }

  return sanitize(data);
}

export class SaveManager {
  private cache: SaveDataV1 | null = null;

  load(): SaveDataV1 {
    if (this.cache) return this.cache;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        this.cache = createDefaultSaveData();
        return this.cache;
      }
      const parsed: unknown = JSON.parse(raw);
      this.cache = migrateSaveData(parsed);
    } catch (err) {
      console.warn('[SaveManager] Failed to load save data, using defaults.', err);
      this.cache = createDefaultSaveData();
    }
    return this.cache;
  }

  save(data: SaveData): void {
    this.cache = data as SaveDataV1;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      console.warn('[SaveManager] Failed to persist save data.', err);
    }
  }

  update(mutator: (data: SaveDataV1) => void): SaveDataV1 {
    const data = this.load();
    mutator(data);
    this.save(data);
    return data;
  }

  reset(): SaveDataV1 {
    const fresh = createDefaultSaveData();
    this.save(fresh);
    return fresh;
  }
}

export const saveManager = new SaveManager();
