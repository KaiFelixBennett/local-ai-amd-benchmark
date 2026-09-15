import type { SaveDataAny, SaveDataV3, Settings } from '../types';
import { DEFAULT_SETTINGS } from '../types';

export const SAVE_KEY = 'mmf_save_v1';
export const CURRENT_SAVE_VERSION = 3;

/** Fresh v3 save with sensible defaults. */
export function defaultSave(language: 'de' | 'en' = 'de'): SaveDataV3 {
  return {
    version: 3,
    settings: { ...DEFAULT_SETTINGS, language },
    progression: { xp: 0, level: 1, coins: 0 },
    unlocks: {
      maps: ['nebelmoor'],
      modes: ['classic', 'blitz', 'zen'],
      crosshairs: ['classic'],
      hudSkins: ['classic'],
      weaponSkins: ['default'],
    },
    equipped: { crosshair: 'classic', hudSkin: 'classic', weaponSkin: 'default' },
    stats: {
      totalRuns: 0,
      totalShots: 0,
      totalHits: 0,
      totalScore: 0,
      totalPlaySeconds: 0,
      perfectHits: 0,
      bossKills: 0,
      chainReactions: 0,
      bestCombo: 0,
      targetsHit: {},
      mapsPlayed: {},
      hiddenObjectsFound: [],
    },
    highscores: {},
    daily: {},
    achievements: [],
    challenges: {},
    tutorialDone: false,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function strArr(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function clampUnit(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function migrateSettings(raw: Record<string, unknown>, base: Settings): Settings {
  const out: Settings = { ...base };
  out.masterVolume = clampUnit(num(raw.masterVolume, base.masterVolume));
  out.musicVolume = clampUnit(num(raw.musicVolume, base.musicVolume));
  out.sfxVolume = clampUnit(num(raw.sfxVolume, base.sfxVolume));
  out.ambientVolume = clampUnit(num(raw.ambientVolume, base.ambientVolume));
  out.fullscreen = typeof raw.fullscreen === 'boolean' ? raw.fullscreen : base.fullscreen;
  const q = raw.quality;
  out.quality = q === 'low' || q === 'medium' || q === 'high' ? q : base.quality;
  out.screenshake = clampUnit(num(raw.screenshake, base.screenshake));
  const pd = num(raw.particleDensity, base.particleDensity);
  out.particleDensity = Math.max(0.25, Math.min(1, pd));
  const cs = num(raw.crosshairSize, base.crosshairSize);
  out.crosshairSize = Math.max(0.6, Math.min(1.8, cs));
  out.crosshairColor =
    typeof raw.crosshairColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.crosshairColor)
      ? raw.crosshairColor
      : base.crosshairColor;
  out.colorblind = typeof raw.colorblind === 'boolean' ? raw.colorblind : base.colorblind;
  out.highContrast = typeof raw.highContrast === 'boolean' ? raw.highContrast : base.highContrast;
  out.reduceMotion = typeof raw.reduceMotion === 'boolean' ? raw.reduceMotion : base.reduceMotion;
  out.reduceFlash = typeof raw.reduceFlash === 'boolean' ? raw.reduceFlash : base.reduceFlash;
  out.language = raw.language === 'en' || raw.language === 'de' ? raw.language : base.language;
  for (const k of ['keyFire', 'keyReload', 'keyPause', 'keyDebug'] as const) {
    if (typeof raw[k] === 'string') out[k] = raw[k] as string;
  }
  return out;
}

/** Migrate v1 (settings + stats only) up to v2. */
function migrateV1ToV2(raw: Record<string, unknown>): Record<string, unknown> {
  const d = defaultSave();
  const stats = asRecord(raw.stats);
  return {
    version: 2,
    settings: migrateSettings(asRecord(raw.settings), d.settings),
    progression: { xp: 0, level: 1, coins: 0 },
    unlocks: d.unlocks,
    stats: { ...d.stats, ...stats },
    highscores: asRecord(raw.highscores),
    tutorialDone: typeof raw.tutorialDone === 'boolean' ? raw.tutorialDone : false,
  };
}

/** Migrate v2 (no daily/achievements/challenges) up to v3. */
function migrateV2ToV3(raw: Record<string, unknown>): Record<string, unknown> {
  const d = defaultSave();
  const unlocks = asRecord(raw.unlocks);
  return {
    version: 3,
    settings: migrateSettings(asRecord(raw.settings), d.settings),
    progression: {
      xp: num(asRecord(raw.progression).xp, 0),
      level: Math.max(1, num(asRecord(raw.progression).level, 1)),
      coins: Math.max(0, num(asRecord(raw.progression).coins, 0)),
    },
    unlocks: {
      maps: strArr(unlocks.maps).length > 0 ? strArr(unlocks.maps) : d.unlocks.maps,
      modes: strArr(unlocks.modes).length > 0 ? strArr(unlocks.modes) : d.unlocks.modes,
      crosshairs: strArr(unlocks.crosshairs).length > 0 ? strArr(unlocks.crosshairs) : d.unlocks.crosshairs,
      hudSkins: strArr(unlocks.hudSkins).length > 0 ? strArr(unlocks.hudSkins) : d.unlocks.hudSkins,
      weaponSkins: strArr(unlocks.weaponSkins).length > 0 ? strArr(unlocks.weaponSkins) : d.unlocks.weaponSkins,
    },
    equipped: { ...d.equipped },
    stats: { ...d.stats, ...asRecord(raw.stats) },
    highscores: asRecord(raw.highscores),
    daily: {},
    achievements: [],
    challenges: {},
    tutorialDone: typeof raw.tutorialDone === 'boolean' ? raw.tutorialDone : false,
  };
}

export interface MigrationStep {
  from: number;
  migrate: (raw: Record<string, unknown>) => Record<string, unknown>;
}

/** All migrations in order. Kept exported for tests and future schema bumps. */
export const MIGRATIONS: MigrationStep[] = [
  { from: 1, migrate: migrateV1ToV2 },
  { from: 2, migrate: migrateV2ToV3 },
];

export function migrate(raw: SaveDataAny | Record<string, unknown>): SaveDataV3 {
  let current: Record<string, unknown> = { ...raw };
  let version = num(current.version, 1);
  if (version > CURRENT_SAVE_VERSION) {
    // Unknown future version: start fresh rather than corrupting.
    return defaultSave();
  }
  for (const step of MIGRATIONS) {
    if (version === step.from) {
      current = step.migrate(current);
      version = step.from + 1;
    }
  }
  // Validate the final shape; anything structurally wrong falls back to defaults
  // field-by-field so a player never loses the whole profile to a partial bug.
  return validateV3(current);
}

export function validateV3(raw: Record<string, unknown>): SaveDataV3 {
  const d = defaultSave();
  const merged: SaveDataV3 = {
    ...d,
    version: 3,
    settings: migrateSettings(asRecord(raw.settings), d.settings),
    progression: {
      xp: Math.max(0, num(asRecord(raw.progression).xp, 0)),
      level: Math.max(1, num(asRecord(raw.progression).level, 1)),
      coins: Math.max(0, num(asRecord(raw.progression).coins, 0)),
    },
    unlocks: {
      maps: strArr(asRecord(raw.unlocks).maps),
      modes: strArr(asRecord(raw.unlocks).modes),
      crosshairs: strArr(asRecord(raw.unlocks).crosshairs),
      hudSkins: strArr(asRecord(raw.unlocks).hudSkins),
      weaponSkins: strArr(asRecord(raw.unlocks).weaponSkins),
    },
    equipped: {
      crosshair:
        typeof asRecord(raw.equipped).crosshair === 'string'
          ? (asRecord(raw.equipped).crosshair as string)
          : d.equipped.crosshair,
      hudSkin:
        typeof asRecord(raw.equipped).hudSkin === 'string'
          ? (asRecord(raw.equipped).hudSkin as string)
          : d.equipped.hudSkin,
      weaponSkin:
        typeof asRecord(raw.equipped).weaponSkin === 'string'
          ? (asRecord(raw.equipped).weaponSkin as string)
          : d.equipped.weaponSkin,
    },
    stats: { ...d.stats, ...asRecord(raw.stats) },
    highscores: asRecord(raw.highscores) as SaveDataV3['highscores'],
    daily: asRecord(raw.daily) as SaveDataV3['daily'],
    achievements: strArr(raw.achievements),
    challenges: asRecord(raw.challenges) as SaveDataV3['challenges'],
    tutorialDone: typeof raw.tutorialDone === 'boolean' ? raw.tutorialDone : false,
  };
  // Guarantee always-available content is present even if missing from old saves.
  for (const m of d.unlocks.maps) if (!merged.unlocks.maps.includes(m)) merged.unlocks.maps.push(m);
  for (const m of d.unlocks.modes) if (!merged.unlocks.modes.includes(m)) merged.unlocks.modes.push(m);
  return merged;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function tryStorage(): StorageLike | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    /* private mode etc. */
  }
  return null;
}

/** In-memory fallback so the game keeps working without localStorage. */
function memoryStorage(): StorageLike {
  const store = new Map<string, string>();
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => {
      store.set(k, v);
    },
    removeItem: (k) => {
      store.delete(k);
    },
  };
}

export interface LoadOutcome {
  save: SaveDataV3;
  migrated: boolean;
  fresh: boolean;
}

export class SaveStorage {
  private backend: StorageLike;

  constructor(backend?: StorageLike) {
    this.backend = backend ?? tryStorage() ?? memoryStorage();
  }

  load(defaultLang: 'de' | 'en' = 'de'): LoadOutcome {
    const rawJson = this.backend.getItem(SAVE_KEY);
    if (!rawJson) {
      const save = defaultSave(defaultLang);
      this.saveNow(save);
      return { save, migrated: false, fresh: true };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      const save = defaultSave(defaultLang);
      this.saveNow(save);
      return { save, migrated: false, fresh: true };
    }
    const raw = asRecord(parsed);
    const version = num(raw.version, 1);
    const save = migrate(raw as SaveDataAny);
    return { save, migrated: version !== CURRENT_SAVE_VERSION, fresh: false };
  }

  saveNow(save: SaveDataV3): void {
    try {
      this.backend.setItem(SAVE_KEY, JSON.stringify(save));
    } catch (err) {
      console.warn('[storage] failed to persist save', err);
    }
  }

  clear(): void {
    this.backend.removeItem(SAVE_KEY);
  }
}
