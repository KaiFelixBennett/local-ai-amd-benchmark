import { describe, it, expect } from 'vitest';
import {
  createDefaultSave,
  migrate,
  SaveStore,
  makeMemoryStorage,
  xpForLevel,
  applyXp,
  SAVE_VERSION,
  highscoreKey
} from '../src/core/save';

describe('save', () => {
  it('default save has the current version and sane defaults', () => {
    const s = createDefaultSave();
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.settings.language).toBe('de');
    expect(s.stats.totalRounds).toBe(0);
    expect(s.progression.unlockedMaps).toContain('nebelmoor');
  });

  it('migrate handles null/undefined/garbage gracefully', () => {
    for (const raw of [null, undefined, 42, 'x', [], {}]) {
      const m = migrate(raw);
      expect(m.version).toBe(SAVE_VERSION);
      expect(m.settings).toBeDefined();
      expect(m.stats).toBeDefined();
      expect(m.progression).toBeDefined();
    }
  });

  it('migrate keeps known data and fills missing fields', () => {
    const m = migrate({ version: 3, settings: { language: 'en', volumeMaster: 0.3 }, stats: { totalRounds: 7 } });
    expect(m.settings.language).toBe('en');
    expect(m.settings.volumeMaster).toBe(0.3);
    expect(m.settings.volumeMusic).toBeGreaterThan(0); // default filled
    expect(m.stats.totalRounds).toBe(7);
  });

  it('migrate is pure (does not mutate input)', () => {
    const raw = { version: 3, stats: { totalRounds: 1 } };
    const snapshot = JSON.stringify(raw);
    migrate(raw);
    expect(JSON.stringify(raw)).toBe(snapshot);
  });

  it('xpForLevel grows and applyXp levels up', () => {
    expect(xpForLevel(1)).toBeGreaterThan(0);
    expect(xpForLevel(2)).toBeGreaterThanOrEqual(xpForLevel(1));
    const base = createDefaultSave().progression;
    const big = applyXp(base, xpForLevel(base.level) + 100);
    expect(big.level).toBeGreaterThan(base.level);
    expect(big.ups).toBeGreaterThanOrEqual(1);
    const small = applyXp(base, 0);
    expect(small.level).toBe(base.level);
    expect(small.ups).toBe(0);
  });

  it('SaveStore round-trips through a memory storage', () => {
    const store = new SaveStore(makeMemoryStorage());
    expect(store.load().stats.totalRounds).toBe(0);
    const data = createDefaultSave();
    data.stats.totalRounds = 42;
    store.save(data);
    expect(store.load().stats.totalRounds).toBe(42);
    store.clear();
    expect(store.load().stats.totalRounds).toBe(0);
  });

  it('highscoreKey is stable and unique per mode/map', () => {
    expect(highscoreKey('classic', 'nebelmoor')).toBe('classic:nebelmoor');
    expect(highscoreKey('classic', 'nebelmoor')).not.toBe(highscoreKey('blitz', 'nebelmoor'));
  });
});
