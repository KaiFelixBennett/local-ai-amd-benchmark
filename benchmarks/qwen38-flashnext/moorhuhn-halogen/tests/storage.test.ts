import { describe, expect, it } from 'vitest';
import {
  CURRENT_SAVE_VERSION,
  MIGRATIONS,
  SAVE_KEY,
  SaveStorage,
  defaultSave,
  migrate,
  validateV3,
  type StorageLike,
} from '../src/core/storage';

function fakeStorage(initial?: Record<string, string>): StorageLike & { dump(): Record<string, string> } {
  const map = new Map(Object.entries(initial ?? {}));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    dump: () => Object.fromEntries(map),
  };
}

describe('defaultSave', () => {
  it('is a valid v3 save with starter content', () => {
    const s = defaultSave('de');
    expect(s.version).toBe(3);
    expect(s.settings.language).toBe('de');
    expect(s.progression).toEqual({ xp: 0, level: 1, coins: 0 });
    expect(s.unlocks.maps).toContain('nebelmoor');
    expect(s.unlocks.modes).toEqual(expect.arrayContaining(['classic', 'blitz', 'zen']));
    expect(s.tutorialDone).toBe(false);
    expect(s.achievements).toEqual([]);
  });
});

describe('migrate', () => {
  it('v1 save gains progression/unlocks and keeps stats', () => {
    const v1 = {
      version: 1,
      settings: { masterVolume: 0.5, language: 'en' },
      stats: { totalShots: 100, totalHits: 40 },
      highscores: { classic: [{ score: 500 }] },
      tutorialDone: true,
    };
    const out = migrate(v1 as never);
    expect(out.version).toBe(3);
    expect(out.progression).toEqual({ xp: 0, level: 1, coins: 0 });
    expect(out.stats.totalShots).toBe(100);
    expect(out.settings.masterVolume).toBe(0.5);
    expect(out.settings.language).toBe('en');
    expect(out.tutorialDone).toBe(true);
    // guaranteed unlocks present
    expect(out.unlocks.maps).toContain('nebelmoor');
    expect(out.unlocks.modes).toEqual(expect.arrayContaining(['classic', 'blitz', 'zen']));
  });

  it('v2 save gains daily/achievements/challenges and keeps progression', () => {
    const v2 = {
      version: 2,
      settings: defaultSave().settings,
      progression: { xp: 1200, level: 4, coins: 300 },
      unlocks: {
        maps: ['nebelmoor', 'sturmklippen'],
        modes: ['classic', 'precision'],
        crosshairs: ['classic', 'ring'],
        hudSkins: ['classic'],
        weaponSkins: ['default'],
      },
      stats: defaultSave().stats,
      highscores: {},
      tutorialDone: false,
    };
    const out = migrate(v2 as never);
    expect(out.version).toBe(3);
    expect(out.progression.level).toBe(4);
    expect(out.progression.coins).toBe(300);
    expect(out.daily).toEqual({});
    expect(out.achievements).toEqual([]);
    expect(out.challenges).toEqual({});
    expect(out.unlocks.maps).toContain('sturmklippen');
  });

  it('a future version starts fresh instead of corrupting', () => {
    const future = { version: 99, settings: defaultSave('en').settings };
    const out = migrate(future as never);
    expect(out).toEqual(defaultSave('de'));
  });

  it('applies every registered migration in order', () => {
    expect(MIGRATIONS.map((m) => m.from)).toEqual([1, 2]);
    expect(CURRENT_SAVE_VERSION).toBe(3);
  });
});

describe('validateV3 clamping', () => {
  it('clamps volumes into 0..1', () => {
    const out = validateV3({ settings: { masterVolume: 9, musicVolume: -2 } });
    expect(out.settings.masterVolume).toBe(1);
    expect(out.settings.musicVolume).toBe(0);
  });

  it('clamps particleDensity 0.25..1 and crosshairSize 0.6..1.8', () => {
    const out = validateV3({ settings: { particleDensity: 0.01, crosshairSize: 5 } });
    expect(out.settings.particleDensity).toBe(0.25);
    expect(out.settings.crosshairSize).toBe(1.8);
  });

  it('rejects invalid crosshair colors and enums', () => {
    const out = validateV3({
      settings: { crosshairColor: 'chartreuse', quality: 'ultra', language: 'fr' },
    });
    expect(out.settings.crosshairColor).toBe('#ffd54a'); // default
    expect(out.settings.quality).toBe('high');
    expect(out.settings.language).toBe('de');
  });

  it('accepts valid hex colors and languages', () => {
    const out = validateV3({ settings: { crosshairColor: '#Ab12Ef', language: 'en' } });
    expect(out.settings.crosshairColor).toBe('#Ab12Ef');
    expect(out.settings.language).toBe('en');
  });

  it('repairs non-numeric progression values', () => {
    const out = validateV3({ progression: { xp: -50, level: 0, coins: 'lots' } });
    expect(out.progression.xp).toBe(0);
    expect(out.progression.level).toBe(1);
    expect(out.progression.coins).toBe(0);
  });

  it('filters non-string entries out of unlock arrays', () => {
    const out = validateV3({
      unlocks: {
        maps: ['nebelmoor', 42, null],
        modes: ['classic'],
        crosshairs: ['x'],
        hudSkins: ['y'],
        weaponSkins: ['z'],
      },
    });
    expect(out.unlocks.maps).toEqual(expect.arrayContaining(['nebelmoor']));
    expect(out.unlocks.maps).not.toContain(42);
  });

  it('re-adds guaranteed maps/modes that were removed', () => {
    const out = validateV3({ unlocks: { maps: ['mondbruch'], modes: ['daily'] } });
    expect(out.unlocks.maps).toContain('nebelmoor');
    expect(out.unlocks.maps).toContain('mondbruch');
    expect(out.unlocks.modes).toEqual(expect.arrayContaining(['classic', 'blitz', 'zen', 'daily']));
  });
});

describe('SaveStorage', () => {
  it('reports fresh for an empty backend and persists a default', () => {
    const be = fakeStorage();
    const st = new SaveStorage(be);
    const out = st.load('en');
    expect(out.fresh).toBe(true);
    expect(out.migrated).toBe(false);
    expect(out.save.settings.language).toBe('en');
    expect(be.dump()[SAVE_KEY]).toBeDefined();
  });

  it('reports fresh on corrupt JSON', () => {
    const be = fakeStorage({ [SAVE_KEY]: '{ not json' });
    const out = new SaveStorage(be).load('de');
    expect(out.fresh).toBe(true);
    expect(out.save.version).toBe(3);
  });

  it('reports migrated for older saves', () => {
    const be = fakeStorage({ [SAVE_KEY]: JSON.stringify({ version: 2, stats: { totalShots: 5 } }) });
    const out = new SaveStorage(be).load('de');
    expect(out.fresh).toBe(false);
    expect(out.migrated).toBe(true);
    expect(out.save.version).toBe(3);
    expect(out.save.stats.totalShots).toBe(5);
  });

  it('reports neither fresh nor migrated for current saves', () => {
    const be = fakeStorage({ [SAVE_KEY]: JSON.stringify(defaultSave('en')) });
    const out = new SaveStorage(be).load('de');
    expect(out.fresh).toBe(false);
    expect(out.migrated).toBe(false);
    expect(out.save.settings.language).toBe('en');
  });

  it('saveNow round-trips and clear removes', () => {
    const be = fakeStorage();
    const st = new SaveStorage(be);
    const s = defaultSave('de');
    s.progression.coins = 777;
    st.saveNow(s);
    const back = JSON.parse(be.dump()[SAVE_KEY] as string);
    expect(back.progression.coins).toBe(777);
    st.clear();
    expect(be.dump()[SAVE_KEY]).toBeUndefined();
  });

  it('a save written now loads later without migration', () => {
    const be = fakeStorage();
    const st = new SaveStorage(be);
    st.load('de');
    const again = st.load('de');
    expect(again.fresh).toBe(false);
    expect(again.migrated).toBe(false);
  });
});
