import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GameClient } from '../src/core/gameClient';
import { SAVE_KEY } from '../src/core/storage';
import type { RunSummary } from '../src/types';

/** In-memory Storage stand-in (the vitest jsdom env does not expose localStorage). */
function installStorage(): Storage {
  const map = new Map<string, string>();
  const store: Storage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
  (globalThis as Record<string, unknown>).localStorage = store;
  return store;
}

function summary(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    mode: 'classic',
    map: 'nebelmoor',
    score: 5000,
    hits: 40,
    misses: 10,
    shots: 50,
    reloads: 9,
    perfectHits: 3,
    maxCombo: 12,
    bestHitPoints: 800,
    bestHitTargetId: 'goldschnabel',
    avgReactionMs: 900,
    accuracy: 0.8,
    targetsHit: { moorflatterer: 30, schnellfeder: 10 },
    swarmBonuses: 1,
    trickshots: 0,
    longshots: 2,
    chainReactions: 0,
    longestChain: 0,
    hiddenObjectsFound: 0,
    hiddenObjectIds: [],
    seed: 1234,
    bossDefeated: false,
    bossMisses: 0,
    eventBonusPoints: 1200,
    bonusTimeSeconds: 5,
    noMissFinish: false,
    durationSeconds: 120,
    maxPerfectStreak: 3,
    maxHitsWithoutMiss: 4,
    goldDuringStorm: false,
    swarmClearedFast: false,
    ...overrides,
  };
}

describe('GameClient (jsdom + storage shim)', () => {
  let store: Storage;
  beforeEach(() => {
    store = installStorage();
  });
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).localStorage;
  });

  it('bootstraps a fresh profile', () => {
    const c = new GameClient();
    expect(c.level).toBe(1);
    expect(c.tutorialDone()).toBe(false);
    expect(c.getBestScore('classic')).toBe(0);
    expect(c.isMapUnlocked('nebelmoor')).toBe(true);
  });

  it('completeRun awards xp/coins and marks records', () => {
    const c = new GameClient();
    const res = c.completeRun(summary({ score: 5000 }));
    expect(res.isRecord).toBe(true);
    expect(res.previousBest).toBe(0);
    // 5000*0.15 + 3*25 = 825
    expect(res.xpGained).toBe(825);
    // 5000*0.02 + 3*4 + 0 chains = 112 run coins
    expect(res.coinsGained).toBe(112);
    // The same run also completed challenges: ch_acc_80 (180) + ch_swarm_3s (200)
    expect(c.save.progression.coins).toBe(112 + 180 + 200);
    expect(c.getBestScore('classic')).toBe(5000);
    // A worse round is not a record
    const res2 = c.completeRun(summary({ score: 1000 }));
    expect(res2.isRecord).toBe(false);
    expect(res2.previousBest).toBe(5000);
  });

  it('persisted state survives a reload (new client instance)', () => {
    const c1 = new GameClient();
    c1.completeRun(summary({ score: 9001 }));
    c1.flush();
    const c2 = new GameClient();
    expect(c2.getBestScore('classic')).toBe(9001);
    expect(c2.save.stats.totalRuns).toBe(1);
    expect(store.getItem(SAVE_KEY)).toContain('9001');
  });

  it('records the daily run once per date with the best score', () => {
    const c = new GameClient();
    c.completeRun(summary({ score: 4000, mode: 'daily' }), true);
    let rec = c.getDailyRecord();
    expect(rec?.score).toBe(4000);
    // a worse daily does not overwrite
    c.completeRun(summary({ score: 1000, mode: 'daily' }), true);
    rec = c.getDailyRecord();
    expect(rec?.score).toBe(4000);
    // a better one does
    c.completeRun(summary({ score: 7000, mode: 'daily' }), true);
    rec = c.getDailyRecord();
    expect(rec?.score).toBe(7000);
  });

  it('levels up across rounds and unlocks by level', () => {
    const c = new GameClient();
    // each run ~ +1650 XP (10000 score) → several level-ups eventually
    for (let i = 0; i < 6; i++) c.completeRun(summary({ score: 10000 }));
    expect(c.level).toBeGreaterThan(1);
    // level 2 unlocks sturmklippen availability (isMapUnlocked uses level OR explicit unlock)
    if (c.level >= 2) expect(c.isMapUnlocked('sturmklippen')).toBe(true);
  });

  it('merges target-hit stats per type', () => {
    const c = new GameClient();
    c.completeRun(summary({ targetsHit: { moorflatterer: 5 } }));
    c.completeRun(summary({ targetsHit: { moorflatterer: 3, goldschnabel: 1 } }));
    expect(c.save.stats.targetsHit.moorflatterer).toBe(8);
    expect(c.save.stats.targetsHit.goldschnabel).toBe(1);
  });

  it('hidden object discovery is a de-duplicated union', () => {
    const c = new GameClient();
    c.completeRun(summary({ hiddenObjectIds: ['a', 'b'] }));
    c.completeRun(summary({ hiddenObjectIds: ['b', 'c'] }));
    expect(c.save.stats.hiddenObjectsFound.sort()).toEqual(['a', 'b', 'c']);
  });

  it('settings changes propagate to the save on flush', () => {
    const c = new GameClient();
    c.settings.set('crosshairColor', '#123456');
    c.flush();
    const raw = JSON.parse(store.getItem(SAVE_KEY) as string);
    expect(raw.settings.crosshairColor).toBe('#123456');
  });

  it('resetProfile wipes progress but keeps current language', () => {
    const c = new GameClient();
    c.settings.set('language', 'en');
    c.completeRun(summary());
    c.resetProfile();
    expect(c.save.stats.totalRuns).toBe(0);
    expect(c.save.settings.language).toBe('en');
  });

  it('cosmetic purchase debits coins and equips', () => {
    const c = new GameClient();
    c.save.progression.coins = 1000;
    c.save.progression.level = 10;
    // 'scope' crosshair costs 400
    expect(c.buyCosmetic('crosshairs', 'scope')).toBe(true);
    expect(c.save.progression.coins).toBe(600);
    expect(c.isCosmeticOwned('crosshairs', 'scope')).toBe(true);
    expect(c.save.equipped.crosshair).toBe('scope');
    // too expensive when broke ('night' weapon skin costs 500)
    c.save.progression.coins = 10;
    expect(c.buyCosmetic('weaponSkins', 'night')).toBe(false);
  });
});
