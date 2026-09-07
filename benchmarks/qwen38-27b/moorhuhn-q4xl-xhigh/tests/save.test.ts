/**
 * Save-Tests: Migration v0->v1, XP/Level, Highscore-UPSERT (max 25,
 * Daily getrennt), Challenge-Progress, Rundenstatistik.
 */
import { describe, it, expect } from 'vitest';
import {
  migrate,
  freshSave,
  grantXp,
  upsertHighscore,
  bumpChallenge,
  applyRoundStats,
  xpForLevel,
  levelForXp,
  SaveStore,
  SAVE_KEY,
  type HighscoreEntry,
} from '../src/core/save';

function entry(score: number, over: Partial<HighscoreEntry> = {}): HighscoreEntry {
  return {
    score,
    mode: 'classic',
    map: 'nebelmoor',
    date: new Date().toISOString(),
    rank: 'A',
    isDaily: false,
    ...over,
  };
}

describe('migrate', () => {
  it('leere Daten -> frisches Savegame', () => {
    const d = migrate(null);
    expect(d.version).toBe(1);
    expect(d.progress.unlockedModes).toContain('classic');
    expect(d.progress.unlockedModes).toContain('tutorial');
    expect(d.progress.unlockedMaps).toContain('nebelmoor');
  });

  it('v0: ungültige Modi werden gefiltert, Standard-Spawns bleiben', () => {
    const d = migrate({
      version: 0,
      progress: { unlockedModes: ['classic', 'hacked', 'zen'], unlockedMaps: ['nebelmoor', 'nope'] },
    } as unknown);
    expect(d.version).toBe(1);
    expect(d.progress.unlockedModes).toContain('classic');
    expect(d.progress.unlockedModes).toContain('zen');
    expect(d.progress.unlockedModes).not.toContain('hacked');
    expect(d.progress.unlockedMaps).toContain('nebelmoor');
    expect(d.progress.unlockedMaps).not.toContain('nope');
  });

  it('v0: kaputte Highscores werden entfernt', () => {
    const d = migrate({
      version: 0,
      highscores: [
        { score: 100, mode: 'classic', map: 'nebelmoor', date: 'x', rank: 'A', isDaily: false },
        { score: 'bad', mode: 123, map: null },
      ],
    } as unknown);
    expect(d.highscores.length).toBe(1);
    expect(d.highscores[0].score).toBe(100);
  });
});

describe('freshSave', () => {
  it('hat Version 1 und sinnvolle Defaults', () => {
    const d = freshSave();
    expect(d.version).toBe(1);
    expect(d.settings.lang).toBe('de');
    expect(d.settings.quality).toBe('high');
    expect(d.progress.level).toBe(1);
    expect(d.highscores).toEqual([]);
  });
});

describe('XP / Level', () => {
  it('xpForLevel steigt pro Level', () => {
    expect(xpForLevel(1)).toBe(100);
    expect(xpForLevel(2)).toBe(250);
    expect(xpForLevel(3)).toBe(400);
  });

  it('grantXp gibt Level-Ups zurück', () => {
    const p = freshSave().progress;
    const ups = grantXp(p, 100); // 100 XP -> Level 2
    expect(p.level).toBe(2);
    expect(ups).toEqual([2]);
  });

  it('levelForXp rechnet korrekt', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(100)).toBe(2);
    expect(levelForXp(100 + 250)).toBe(3);
  });
});

describe('upsertHighscore', () => {
  it('neuer Rekord erhöht bestScore', () => {
    const d = freshSave();
    const isRecord = upsertHighscore(d, entry(5000));
    expect(isRecord).toBe(true);
    expect(d.progress.bestScore).toBe(5000);
  });

  it('halter Rekord bleibt gleich', () => {
    const d = freshSave();
    upsertHighscore(d, entry(5000));
    const isRecord = upsertHighscore(d, entry(3000));
    expect(isRecord).toBe(false);
    expect(d.progress.bestScore).toBe(5000);
  });

  it('hält maximal 25 Einträge (höchste bleiben)', () => {
    const d = freshSave();
    for (let i = 0; i < 40; i++) upsertHighscore(d, entry(1000 + i));
    expect(d.highscores.length).toBe(25);
    // Top 25 von 1000..1039 = 1039..1015
    expect(d.highscores[0].score).toBe(1039);
    expect(d.highscores[24].score).toBe(1015);
  });

  it('sortiert absteigend nach Score', () => {
    const d = freshSave();
    upsertHighscore(d, entry(100));
    upsertHighscore(d, entry(900));
    upsertHighscore(d, entry(500));
    expect(d.highscores.map((h) => h.score)).toEqual([900, 500, 100]);
  });
});

describe('bumpChallenge', () => {
  it('steigert den Fortschritt bis zum Ziel', () => {
    const p = freshSave().progress;
    expect(bumpChallenge(p, 'combo25', 10, 25)).toBe(false);
    expect(bumpChallenge(p, 'combo25', 10, 25)).toBe(false);
    expect(bumpChallenge(p, 'combo25', 10, 25)).toBe(true);
    expect(p.challenges['combo25']).toBe(25);
    expect(p.completedChallenges).toContain('combo25');
  });

  it('abgeschlossene Challenges sind nicht mehr steigbar', () => {
    const p = freshSave().progress;
    bumpChallenge(p, 'perfect5', 5, 5);
    expect(bumpChallenge(p, 'perfect5', 5, 5)).toBe(false);
    expect(p.challenges['perfect5']).toBe(5);
  });
});

describe('applyRoundStats', () => {
  it('aggregiert Rundenstatistik', () => {
    const d = freshSave();
    applyRoundStats(d, {
      shots: 20,
      hits: 16,
      perfectHits: 3,
      maxCombo: 12,
      durationMs: 60000,
      rank: 'B',
      targetsHit: {},
    });
    expect(d.progress.roundsPlayed).toBe(1);
    expect(d.progress.totalShots).toBe(20);
    expect(d.progress.totalHits).toBe(16);
    expect(d.progress.totalPerfect).toBe(3);
    expect(d.progress.bestCombo).toBe(12);
    expect(d.progress.bestAccuracy).toBeCloseTo(0.8, 3);
    expect(d.progress.bestRank).toBe('B');
  });
});

describe('SaveStore', () => {
  function memStorage() {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    };
  }

  it('save/load round-trip', () => {
    const store = new SaveStore(memStorage() as Storage);
    const d = freshSave();
    store.save(d);
    const loaded = store.load();
    expect(loaded.version).toBe(1);
    expect(loaded.progress.level).toBe(1);
  });

  it('leeres Storage -> freshSave', () => {
    const store = new SaveStore(memStorage() as Storage);
    expect(store.load().version).toBe(1);
  });

  it('beschädigte JSON -> freshSave (kein Crash)', () => {
    const m = new Map<string, string>();
    m.set(SAVE_KEY, '{ not valid json');
    const store = new SaveStore({
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    } as Storage);
    expect(store.load().version).toBe(1);
  });

  it('clear() entfernt das Savegame', () => {
    const m = new Map<string, string>();
    const store = new SaveStore({
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    } as Storage);
    store.save(freshSave());
    expect(m.size).toBe(1);
    store.clear();
    expect(m.size).toBe(0);
  });
});
