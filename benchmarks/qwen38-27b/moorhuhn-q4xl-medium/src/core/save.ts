/**
 * Save / persistence layer. Pure data + a thin storage adapter so it can run
 * in tests without a browser. Versioned schema with migration.
 */

import type { SaveData, Settings, PlayerStats, Progression, HighscoreEntry, GameMode, MapId } from './types';

export const SAVE_VERSION = 3;
export const STORAGE_KEY = 'moorland-mayhem.save.v';

export const DEFAULT_SETTINGS: Settings = {
  language: 'de',
  volumeMaster: 0.8,
  volumeMusic: 0.7,
  volumeSfx: 0.85,
  volumeAmbient: 0.6,
  fullscreen: false,
  quality: 'high',
  screenShake: 1,
  particleDensity: 1,
  crosshairSize: 1,
  crosshairColor: '#ffd54a',
  colorBlind: false,
  highContrast: false,
  reducedMotion: false,
  reducedFlashes: false,
  keyReload: 'KeyR',
  keyPause: 'Escape',
  keyMute: 'KeyM'
};

export const DEFAULT_STATS: PlayerStats = {
  totalRounds: 0,
  totalShots: 0,
  totalHits: 0,
  totalPerfect: 0,
  bestScore: 0,
  bestRank: 'D',
  bestCombo: 0,
  bossKills: 0,
  chainReactions: 0,
  totalScore: 0,
  longestCombo: 0,
  roundsByMode: {},
  roundsByMap: {}
};

export const DEFAULT_PROGRESSION: Progression = {
  level: 1,
  xp: 0,
  featherCoins: 0,
  unlockedMaps: ['nebelmoor'],
  unlockedModes: ['classic', 'blitz', 'zen'],
  ownedCrosshairs: ['classic', 'neon', 'reticle'],
  selectedCrosshair: 'classic',
  ownedHudThemes: ['default', 'sunset'],
  selectedHudTheme: 'default',
  ownedWeaponSkins: ['standard', 'brass'],
  selectedWeaponSkin: 'standard',
  unlockedAchievements: [],
  dailyBests: {},
  discoveredObjects: {}
};

export function createDefaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    stats: { ...DEFAULT_STATS, roundsByMode: {}, roundsByMap: {} },
    progression: cloneProgression(DEFAULT_PROGRESSION),
    highscores: {},
    tutorialSeen: false
  };
}

export function cloneProgression(p: Progression): Progression {
  return {
    ...p,
    unlockedMaps: [...p.unlockedMaps],
    unlockedModes: [...p.unlockedModes],
    ownedCrosshairs: [...p.ownedCrosshairs],
    ownedHudThemes: [...p.ownedHudThemes],
    ownedWeaponSkins: [...p.ownedWeaponSkins],
    unlockedAchievements: [...p.unlockedAchievements],
    dailyBests: { ...p.dailyBests },
    discoveredObjects: { ...p.discoveredObjects }
  };
}

/** Merge a partial saved object over defaults (defensive, ignores unknown keys). */
function merge<T extends object>(defaults: T, patch: Partial<T> | null | undefined): T {
  if (!patch) return { ...defaults };
  const out: T = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof T)[]) {
    const val = (patch as Record<string, unknown>)[key as string];
    if (val !== undefined) (out as Record<string, unknown>)[key as string] = val;
  }
  return out;
}

/**
 * Migrate an old save object to the current version. Returns a valid SaveData.
 * Pure: input is never mutated.
 */
export function migrate(raw: unknown): SaveData {
  const base = createDefaultSave();
  if (typeof raw !== 'object' || raw === null) return base;
  const data = raw as Partial<SaveData> & { version?: number };
  const version = typeof data.version === 'number' ? data.version : 1;

  const settings = merge(DEFAULT_SETTINGS, data.settings as Partial<Settings>);
  const stats = { ...DEFAULT_STATS, roundsByMode: {}, roundsByMap: {}, ...(data.stats ?? {}) };
  const progression = mergeProgression(data.progression);
  const highscores: Record<string, HighscoreEntry[]> = {};
  for (const [k, v] of Object.entries(data.highscores ?? {})) {
    if (Array.isArray(v)) highscores[k] = v;
  }
  const tutorialSeen = data.tutorialSeen === true;

  // Migration path: v1 -> v2 added HUD themes; v2 -> v3 added discoveredObjects.
  if (version < 2) {
    if (!progression.ownedHudThemes?.length) progression.ownedHudThemes = ['default', 'sunset'];
  }
  if (version < 3) {
    if (!progression.discoveredObjects) progression.discoveredObjects = {};
  }

  return {
    version: SAVE_VERSION,
    settings,
    stats: {
      ...DEFAULT_STATS,
      ...stats,
      roundsByMode: { ...(data.stats?.roundsByMode ?? {}) },
      roundsByMap: { ...(data.stats?.roundsByMap ?? {}) }
    },
    progression,
    highscores,
    tutorialSeen
  };
}

function mergeProgression(patch: Partial<Progression> | undefined): Progression {
  const p = cloneProgression(DEFAULT_PROGRESSION);
  if (!patch) return p;
  return {
    ...p,
    ...patch,
    unlockedMaps: patch.unlockedMaps?.length ? [...patch.unlockedMaps] : p.unlockedMaps,
    unlockedModes: patch.unlockedModes?.length ? [...patch.unlockedModes] : p.unlockedModes,
    ownedCrosshairs: patch.ownedCrosshairs?.length ? [...patch.ownedCrosshairs] : p.ownedCrosshairs,
    ownedHudThemes: patch.ownedHudThemes?.length ? [...patch.ownedHudThemes] : p.ownedHudThemes,
    ownedWeaponSkins: patch.ownedWeaponSkins?.length ? [...patch.ownedWeaponSkins] : p.ownedWeaponSkins,
    unlockedAchievements: patch.unlockedAchievements ? [...patch.unlockedAchievements] : p.unlockedAchievements,
    dailyBests: { ...p.dailyBests, ...(patch.dailyBests ?? {}) },
    discoveredObjects: { ...p.discoveredObjects, ...(patch.discoveredObjects ?? {}) }
  };
}

/** XP curve: xp needed to go from level L to L+1. */
export function xpForLevel(level: number): number {
  return Math.round(200 * Math.pow(level, 1.5));
}

/** Apply earned XP, returning new level + remaining xp + number of level-ups. */
export function applyXp(p: Progression, gained: number): { level: number; xp: number; ups: number } {
  let level = p.level;
  let xp = p.xp + gained;
  let ups = 0;
  while (xp >= xpForLevel(level)) {
    xp -= xpForLevel(level);
    level += 1;
    ups += 1;
  }
  return { level, xp, ups };
}

export interface StorageAdapter {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export class SaveStore {
  constructor(private storage: StorageAdapter) {}

  load(): SaveData {
    const raw = this.storage.get(STORAGE_KEY);
    if (!raw) return createDefaultSave();
    try {
      return migrate(JSON.parse(raw));
    } catch {
      return createDefaultSave();
    }
  }

  save(data: SaveData): void {
    this.storage.set(STORAGE_KEY, JSON.stringify(data));
  }

  clear(): void {
    this.storage.remove(STORAGE_KEY);
  }
}

export function makeMemoryStorage(): StorageAdapter {
  const map = new Map<string, string>();
  return {
    get: (k) => (map.has(k) ? map.get(k)! : null),
    set: (k, v) => void map.set(k, v),
    remove: (k) => void map.delete(k)
  };
}

export function highscoreKey(mode: GameMode, map: MapId): string {
  return `${mode}:${map}`;
}
