import { beforeEach, describe, expect, it } from 'vitest';
import {
  _reloadSaveForTests,
  claimChallenge,
  commitRun,
  defaultSave,
  loadSave,
  markHiddenFound,
  migrateSave,
  SAVE_KEY,
  SAVE_VERSION,
  resetSave,
  saveNow,
} from '../src/core/Save';
import { storage } from '../src/core/Storage';
import { runResult } from './helpers';

function reset(): void {
  storage.remove(SAVE_KEY);
  _reloadSaveForTests();
}

describe('migrateSave', () => {
  it('replaces garbage with a pristine default save', () => {
    for (const raw of [null, undefined, 42, 'nope', []]) {
      expect(migrateSave(raw)).toEqual(defaultSave());
    }
  });

  it('stamps the current version', () => {
    expect(migrateSave(null).version).toBe(SAVE_VERSION);
  });

  it('fills missing sections from defaults while keeping valid bits', () => {
    const out = migrateSave({ version: 1, settings: { masterVolume: 0.3, bubblegum: true } });
    expect(out.settings.masterVolume).toBe(0.3);
    expect(out.settings.sfxVolume).toBe(defaultSave().settings.sfxVolume);
    expect(out.progress.level).toBe(1);
    expect(out.stats.rounds).toBe(0);
    expect(out.seenTutorial).toBe(false);
  });

  it('drops settings of the wrong type back to defaults', () => {
    const out = migrateSave({
      version: 3,
      settings: { masterVolume: 'loud', quality: 'ultra', language: 'fr' },
    });
    const d = defaultSave();
    expect(out.settings.masterVolume).toBe(d.settings.masterVolume);
    expect(out.settings.quality).toBe(d.settings.quality);
    expect(out.settings.language).toBe(d.settings.language);
  });

  it('keeps a valid owned/equipped cosmetic set', () => {
    const out = migrateSave({
      version: 3,
      progress: { ownedCrosshairs: ['ring', 'flint'], activeCrosshair: 'flint' },
    });
    expect(out.progress.ownedCrosshairs).toEqual(['ring', 'flint']);
    expect(out.progress.activeCrosshair).toBe('flint');
  });

  it('sanitises an equipped cosmetic the player does not own', () => {
    const out = migrateSave({
      version: 3,
      progress: { ownedCrosshairs: ['ring'], activeCrosshair: 'neonbog' },
    });
    expect(out.progress.activeCrosshair).toBe('ring');
  });
});

describe('save cycle', () => {
  beforeEach(reset);

  it('persists mutations across reloads', () => {
    const s = loadSave();
    s.progress.xp = 500;
    s.settings.language = 'en';
    saveNow();
    _reloadSaveForTests();
    const again = loadSave();
    expect(again.progress.xp).toBe(500);
    expect(again.settings.language).toBe('en');
  });

  it('survives corrupted storage', () => {
    storage.set(SAVE_KEY, '{not json');
    _reloadSaveForTests();
    expect(loadSave()).toEqual(defaultSave());
  });

  it('resetSave wipes back to defaults', () => {
    commitRun(runResult({ xp: 400, currencyEarned: 10 }));
    resetSave();
    _reloadSaveForTests();
    expect(loadSave()).toEqual(defaultSave());
  });
});

describe('commitRun', () => {
  beforeEach(reset);

  it('accumulates xp, currency, and global stats', () => {
    commitRun(
      runResult({
        xp: 120,
        currencyEarned: 7,
        stats: runResult().stats,
      }),
    );
    const s = loadSave();
    expect(s.progress.xp).toBe(120);
    expect(s.progress.currency).toBe(7);
    expect(s.stats.rounds).toBe(1);
  });

  it('tracks kind hits, chains, and mode plays', () => {
    commitRun(
      runResult({
        stats: {
          ...runResult().stats,
          shots: 50,
          hits: 30,
          perfects: 4,
          bestCombo: 9,
          bossKills: 1,
          chainsDone: ['nbl.ropeBell', 'nbl.pondSplash'],
          kindHits: { flatterer: 12, gold: 3 },
        },
      }),
    );
    const s = loadSave();
    expect(s.stats.totalShots).toBe(50);
    expect(s.stats.totalHits).toBe(30);
    expect(s.stats.totalPerfect).toBe(4);
    expect(s.stats.bestComboEver).toBe(9);
    expect(s.stats.bossKillsEver).toBe(1);
    expect(s.stats.chainsEver).toBe(2);
    expect(s.stats.kindHits.flatterer).toBe(12);
    expect(s.stats.kindHits.gold).toBe(3);
    expect(s.stats.modePlays.classic).toBe(1);
  });

  it('keeps only the better highscore per mode|map key', () => {
    commitRun(runResult({ score: 1000, rank: 'B' }));
    const first = loadSave().highscores['classic|nebelmoor'];
    expect(first.score).toBe(1000);

    commitRun(runResult({ score: 800, rank: 'S' })); // worse -> ignored
    expect(loadSave().highscores['classic|nebelmoor'].score).toBe(1000);

    commitRun(runResult({ score: 1500, rank: 'A' })); // better -> replaces
    const best = loadSave().highscores['classic|nebelmoor'];
    expect(best.score).toBe(1500);
    expect(best.rank).toBe('A');
    expect(best.accuracy).toBe(0); // fabricated stats have 0 shots
  });

  it('separates highscore keys per mode and map', () => {
    commitRun(runResult({ mode: 'classic', map: 'nebelmoor', score: 900 }));
    commitRun(runResult({ mode: 'blitz', map: 'nebelmoor', score: 700 }));
    commitRun(runResult({ mode: 'classic', map: 'mondbruch', score: 800 }));
    const s = loadSave();
    expect(Object.keys(s.highscores).sort()).toEqual([
      'blitz|nebelmoor',
      'classic|mondbruch',
      'classic|nebelmoor',
    ]);
  });

  it('writes daily records unconditionally when a dailyKey is present', () => {
    commitRun(runResult({ dailyKey: '2026-09-03', score: 300, rank: 'C' }));
    commitRun(runResult({ dailyKey: '2026-09-03', score: 100, rank: 'D' }));
    expect(loadSave().dailyRecords['2026-09-03'].score).toBe(100);
  });
});

describe('challenges & secrets', () => {
  beforeEach(reset);

  it('claims a challenge reward exactly once', () => {
    expect(claimChallenge('noMiss20', 120)).toBe(true);
    expect(loadSave().progress.currency).toBe(120);
    expect(claimChallenge('noMiss20', 120)).toBe(false);
    expect(loadSave().progress.currency).toBe(120);
    expect(loadSave().progress.claimedChallenges).toEqual(['noMiss20']);
  });

  it('reports new hidden-object discoveries only the first time', () => {
    expect(markHiddenFound('nebelmoor', 'lantern')).toBe(true);
    expect(markHiddenFound('nebelmoor', 'lantern')).toBe(false);
    expect(markHiddenFound('sturmklippen', 'lantern')).toBe(true); // per-map
    expect(loadSave().progress.hiddenFound).toEqual({
      nebelmoor: ['lantern'],
      sturmklippen: ['lantern'],
    });
  });
});
