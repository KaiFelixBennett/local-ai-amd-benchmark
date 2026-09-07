/**
 * Errungenschafts-Tests: jede Bedingung isoliert, XP/Federn pro Runde.
 */
import { describe, it, expect } from 'vitest';
import { checkAchievements, xpForRound, feathersForRound, allHiddenFound, type RoundContext } from '../src/core/achievements';
import { freshSave, type SaveData } from '../src/core/save';
import type { RoundStats } from '../src/core/types';

function stats(over: Partial<RoundStats> = {}): RoundStats {
  return {
    shots: 0,
    hits: 0,
    perfectHits: 0,
    misses: 0,
    maxCombo: 0,
    bestHit: 0,
    bestHitTarget: null,
    avgReactionMs: 0,
    targetsHit: {},
    eventBonuses: 0,
    chainReactions: 0,
    bossKills: 0,
    noMissStreak: 0,
    durationMs: 60000,
    ...over,
  };
}

function ctx(over: Partial<RoundContext> = {}, s: RoundStats = stats()): RoundContext {
  return {
    mode: 'classic',
    mapId: 'nebelmoor',
    stats: s,
    score: 0,
    maxCombo: 0,
    perfectCount: 0,
    hiddenFoundNow: [],
    chainCount: 0,
    bossClean: false,
    endlessScore: null,
    isDaily: false,
    ...over,
  };
}

function run(over: Partial<RoundContext> = {}, s: RoundStats = stats(), save?: SaveData) {
  const d = save ?? freshSave();
  return { unlocked: checkAchievements(d, ctx(over, s)), save: d };
}

describe('checkAchievements', () => {
  it('noMiss20: 20+ Schüsse, 100 % Trefferquote', () => {
    expect(run({}, stats({ shots: 20, hits: 20 })).unlocked).toContain('noMiss20');
    expect(run({}, stats({ shots: 20, hits: 19 })).unlocked).not.toContain('noMiss20');
    expect(run({}, stats({ shots: 19, hits: 19 })).unlocked).not.toContain('noMiss20');
  });

  it('perfect5: 5+ Perfect Hits', () => {
    expect(run({ perfectCount: 5 }).unlocked).toContain('perfect5');
    expect(run({ perfectCount: 4 }).unlocked).not.toContain('perfect5');
  });

  it('acc80: 15+ Schüsse, 80 % Trefferquote', () => {
    expect(run({}, stats({ shots: 15, hits: 12 })).unlocked).toContain('acc80'); // 80 %
    expect(run({}, stats({ shots: 15, hits: 11 })).unlocked).not.toContain('acc80'); // 73 %
  });

  it('combo25: maxCombo >= 25', () => {
    expect(run({ maxCombo: 25 }).unlocked).toContain('combo25');
    expect(run({ maxCombo: 24 }).unlocked).not.toContain('combo25');
  });

  it('chain5: Kettenreaktion mit 5 Stationen', () => {
    expect(run({ chainCount: 5 }).unlocked).toContain('chain5');
    expect(run({ chainCount: 4 }).unlocked).not.toContain('chain5');
  });

  it('bossClean: Boss ohne Fehlschuss', () => {
    expect(run({ bossClean: true }, stats({ bossKills: 1 })).unlocked).toContain('bossClean');
    expect(run({ bossClean: false }, stats({ bossKills: 1 })).unlocked).not.toContain('bossClean');
  });

  it('goldThunder: 5+ Kills, 5+ Schüsse, 75 % Trefferquote', () => {
    const s = stats({ shots: 8, hits: 7, targetsHit: { goldschnabel: 5 } });
    expect(run({}, s).unlocked).toContain('goldThunder'); // 87.5 %
    const s2 = stats({ shots: 8, hits: 5, targetsHit: { goldschnabel: 5 } });
    expect(run({}, s2).unlocked).not.toContain('goldThunder'); // 62.5 %
  });

  it('endless50000: Endlos-Score >= 50000', () => {
    expect(run({ endlessScore: 50000 }).unlocked).toContain('endless50000');
    expect(run({ endlessScore: 49999 }).unlocked).not.toContain('endless50000');
  });

  it('daily: Daily Challenge mit 7000+ Punkten', () => {
    expect(run({ isDaily: true, score: 7000 }).unlocked).toContain('daily');
    expect(run({ isDaily: true, score: 6999 }).unlocked).not.toContain('daily');
    expect(run({ isDaily: false, score: 90000 }).unlocked).not.toContain('daily');
  });

  it('sss: Score >= 20000', () => {
    expect(run({ score: 20000 }).unlocked).toContain('sss');
    expect(run({ score: 19999 }).unlocked).not.toContain('sss');
  });

  it('hiddenAll: alle versteckten Objekte aller Karten', () => {
    const d = freshSave();
    d.progress.hiddenFound = {
      nebelmoor: ['bottle_1', 'hollow_1'],
      sturmklippen: ['storm_bottle'],
      mondbruch: ['willow_hollow', 'moon_bottle'],
    };
    expect(allHiddenFound(d)).toBe(true);
    expect(run({}, stats(), d).unlocked).toContain('hiddenAll');

    const d2 = freshSave();
    d2.progress.hiddenFound = { nebelmoor: ['bottle_1'] };
    expect(allHiddenFound(d2)).toBe(false);
  });

  it('bereits besessene Errungenschaften werden nicht doppelt freigeschaltet', () => {
    const d = freshSave();
    d.progress.achievements = ['combo25'];
    expect(run({ maxCombo: 30 }, stats(), d).unlocked).not.toContain('combo25');
  });
});

describe('xpForRound / feathersForRound', () => {
  it('XP steigt mit Score, Perfekten, Combo und Boss-Kills', () => {
    const base = xpForRound(ctx({ score: 0, maxCombo: 0, perfectCount: 0 }, stats({ bossKills: 0 })));
    const rich = xpForRound(ctx({ score: 10000, maxCombo: 25, perfectCount: 5 }, stats({ bossKills: 1 })));
    expect(rich).toBeGreaterThan(base);
    expect(base).toBeGreaterThanOrEqual(10);
  });

  it('Federn sind Währung aus Score + Perfekte + Boss-Kills', () => {
    const f = feathersForRound(ctx({ score: 5000, perfectCount: 3 }, stats({ bossKills: 2 })));
    // floor(5000/100)=50 + 3*2=6 + 2*25=50 = 106
    expect(f).toBe(106);
  });
});
