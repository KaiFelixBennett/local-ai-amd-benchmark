import { describe, expect, it } from 'vitest';
import { applyXp, evaluateAchievements, xpForLevel } from '../src/logic/achievements';
import { defaultSave } from '../src/core/storage';
import type { RunSummary } from '../src/types';

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
    chainReactions: 2,
    longestChain: 2,
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

describe('xpForLevel', () => {
  it('grows superlinearly with the exponent', () => {
    const l1 = xpForLevel(1, 800, 1.35, 50);
    const l2 = xpForLevel(2, 800, 1.35, 50);
    expect(l2).toBeGreaterThan(l1);
    expect(l1).toBe(800);
  });

  it('is infinite at max level', () => {
    expect(xpForLevel(50, 800, 1.35, 50)).toBe(Infinity);
  });
});

describe('applyXp', () => {
  it('accumulates without leveling when under threshold', () => {
    const r = applyXp(1, 100, 200, 800, 1.35, 50);
    expect(r.level).toBe(1);
    expect(r.xp).toBe(300);
    expect(r.levelsGained).toBe(0);
  });

  it('levels up and carries the remainder over', () => {
    const need1 = xpForLevel(1, 800, 1.35, 50);
    const need2 = xpForLevel(2, 800, 1.35, 50);
    const r = applyXp(1, 0, need1 + need2 + 123, 800, 1.35, 50);
    expect(r.level).toBe(3);
    expect(r.levelsGained).toBe(2);
    expect(r.xp).toBe(123);
  });

  it('stops at max level and parks the xp there', () => {
    const r = applyXp(49, 0, 1000000, 800, 1.35, 50);
    expect(r.level).toBe(50);
    expect(r.xp).toBeGreaterThan(0);
  });

  it('zero gain is a no-op', () => {
    const r = applyXp(5, 42, 0, 800, 1.35, 50);
    expect(r).toEqual({ level: 5, xp: 42, levelsGained: 0 });
  });
});

describe('evaluateAchievements', () => {
  it('unlocks lifetime achievements as stats cross goals', () => {
    const save = defaultSave('de');
    save.stats.totalShots = 999;
    const res = evaluateAchievements(summary({ shots: 5 }), save, 5000);
    expect(res.newAchievements).toContain('shots_1000');
    expect(res.newAchievements).not.toContain('hits_5000');
  });

  it('does not re-award already unlocked achievements', () => {
    const save = defaultSave('de');
    save.stats.totalShots = 2000;
    save.achievements = ['shots_1000'];
    const res = evaluateAchievements(summary(), save, 5000);
    expect(res.newAchievements).not.toContain('shots_1000');
  });

  it('uses the round-best score for score achievements', () => {
    const save = defaultSave('de');
    const res = evaluateAchievements(summary({ score: 50000 }), save, 50000);
    expect(res.newAchievements).toContain('score_50k');
  });

  it('boss achievement requires lifetime boss kills', () => {
    const save = defaultSave('de');
    save.stats.bossKills = 2;
    const res = evaluateAchievements(summary({ bossDefeated: true }), save, 5000);
    expect(res.newAchievements).toContain('boss_3');
  });

  it('challenges map progress and complete when goals are hit', () => {
    const save = defaultSave('de');
    const res = evaluateAchievements(summary({ maxHitsWithoutMiss: 25 }), save, 5000);
    expect(res.newChallenges).toContain('ch_no_miss_20');
    expect(res.challengeProgress['ch_no_miss_20']).toBe(20);
    expect(res.challengeProgress['ch_perfect_5']).toBe(3); // maxPerfectStreak tracked but not complete
  });

  it('skips challenges that belong to a different map', () => {
    const save = defaultSave('de');
    const res = evaluateAchievements(summary({ map: 'mondbruch', hiddenObjectsFound: 5 }), save, 5000);
    // ch_hidden_nebelmoor is nebelmoor-only
    expect(res.newChallenges).not.toContain('ch_hidden_nebelmoor');
  });

  it('completes the map-scoped hidden challenge on the right map', () => {
    const save = defaultSave('de');
    const res = evaluateAchievements(summary({ map: 'nebelmoor', hiddenObjectsFound: 3 }), save, 5000);
    expect(res.newChallenges).toContain('ch_hidden_nebelmoor');
  });

  it('does not re-award completed challenges', () => {
    const save = defaultSave('de');
    save.challenges['ch_no_miss_20'] = { progress: 20, completedAt: '2025-01-01' };
    const res = evaluateAchievements(summary({ maxHitsWithoutMiss: 30 }), save, 5000);
    expect(res.newChallenges).not.toContain('ch_no_miss_20');
  });

  it('gold during storm challenge triggers on the flag', () => {
    const save = defaultSave('de');
    const res = evaluateAchievements(summary({ goldDuringStorm: true }), save, 5000);
    expect(res.newChallenges).toContain('ch_gold_storm');
  });

  it('chain challenge uses the longest chain', () => {
    const save = defaultSave('de');
    const res = evaluateAchievements(summary({ longestChain: 6 }), save, 5000);
    expect(res.newChallenges).toContain('ch_chain_5');
  });
});
