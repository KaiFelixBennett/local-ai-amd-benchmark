import { describe, expect, it, beforeEach } from 'vitest';
import { SaveManager, createDefaultSaveData, migrateSaveData } from '../src/systems/SaveManager';
import { SAVE_VERSION } from '../src/core/types';

describe('createDefaultSaveData', () => {
  it('produces a valid, current-version save shape', () => {
    const data = createDefaultSaveData();
    expect(data.version).toBe(SAVE_VERSION);
    expect(data.unlocks.unlockedMaps).toContain('nebelmoor');
    expect(data.progression.level).toBe(1);
  });
});

describe('migrateSaveData', () => {
  it('returns defaults for null/undefined input', () => {
    expect(migrateSaveData(null).version).toBe(SAVE_VERSION);
    expect(migrateSaveData(undefined).version).toBe(SAVE_VERSION);
  });

  it('returns defaults for garbage input', () => {
    const result = migrateSaveData('not an object');
    expect(result.version).toBe(SAVE_VERSION);
  });

  it('migrates a legacy (unversioned) save with scoreHistory to highscores', () => {
    const legacy = {
      scoreHistory: [{ score: 1234, rank: 'A', mode: 'classic', map: 'nebelmoor', date: 1, hits: 10, misses: 2, accuracy: 0.8, highestCombo: 5 }],
      settings: { musicVolume: 0.3 },
    };
    const migrated = migrateSaveData(legacy);
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.highscores).toHaveLength(1);
    expect(migrated.highscores[0]?.score).toBe(1234);
    // untouched fields still get sane defaults merged in
    expect(migrated.settings.musicVolume).toBeCloseTo(0.3);
    expect(migrated.settings.sfxVolume).toBeGreaterThan(0);
  });

  it('fills in missing nested fields from defaults without dropping present ones', () => {
    const partial = { version: 1, progression: { level: 5, xp: 10, xpToNextLevel: 500, currency: 99 } };
    const migrated = migrateSaveData(partial);
    expect(migrated.progression.level).toBe(5);
    expect(migrated.unlocks.unlockedMaps).toContain('nebelmoor');
    expect(migrated.stats.totalShotsFired).toBe(0);
  });

  it('always guarantees the free starter map/mode unlocks even for corrupted unlock data', () => {
    const corrupted = { version: 1, unlocks: { unlockedMaps: [], unlockedModes: [] } };
    const migrated = migrateSaveData(corrupted);
    expect(migrated.unlocks.unlockedMaps).toContain('nebelmoor');
    expect(migrated.unlocks.unlockedModes).toContain('classic');
  });

  it('is idempotent: migrating an already-current save returns an equivalent save', () => {
    const fresh = createDefaultSaveData();
    const migrated = migrateSaveData(fresh);
    expect(migrated).toEqual(fresh);
  });
});

describe('SaveManager (localStorage-backed)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('load() returns defaults when nothing is stored', () => {
    const manager = new SaveManager();
    const data = manager.load();
    expect(data.version).toBe(SAVE_VERSION);
  });

  it('save() then load() round-trips data via localStorage', () => {
    const manager = new SaveManager();
    const data = manager.load();
    data.progression.currency = 500;
    manager.save(data);

    const manager2 = new SaveManager();
    const reloaded = manager2.load();
    expect(reloaded.progression.currency).toBe(500);
  });

  it('recovers gracefully from corrupted JSON in localStorage', () => {
    window.localStorage.setItem('moorland-mayhem-save', '{not valid json');
    const manager = new SaveManager();
    const data = manager.load();
    expect(data.version).toBe(SAVE_VERSION);
  });

  it('update() mutates and persists in one step', () => {
    const manager = new SaveManager();
    manager.update((d) => {
      d.progression.currency += 10;
    });
    const reloaded = new SaveManager().load();
    expect(reloaded.progression.currency).toBe(10);
  });
});
