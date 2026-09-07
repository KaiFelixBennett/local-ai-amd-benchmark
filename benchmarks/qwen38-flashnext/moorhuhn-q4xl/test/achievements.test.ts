import { beforeEach, describe, expect, it } from 'vitest';
import {
  challengeReadyToClaim,
  defaultRunFlags,
  evaluateAfterRun,
  type RunFlags,
} from '../src/game/Achievements';
import { ACHIEVEMENTS, CHALLENGES } from '../src/config/achievements';
import { hiddenObjectIds } from '../src/config/maps';
import {
  _reloadSaveForTests,
  claimChallenge,
  commitRun,
  loadSave,
  SAVE_KEY,
} from '../src/core/Save';
import { storage } from '../src/core/Storage';
import type { SaveData } from '../src/core/types';
import { runResult, runStats } from './helpers';

function reset(): void {
  storage.remove(SAVE_KEY);
  _reloadSaveForTests();
}

/** Mimic the game loop: commit the run first, then evaluate on the live save. */
function finish(result: ReturnType<typeof runResult>, flags: Partial<RunFlags> = {}): {
  newly: string[];
  save: SaveData;
} {
  commitRun(result);
  const save = loadSave();
  const newly = evaluateAfterRun(result, { ...defaultRunFlags(), ...flags }, save);
  return { newly, save };
}

describe('evaluateAfterRun', () => {
  beforeEach(reset);

  it('grants firstBlood once a hit exists in global stats', () => {
    const r = runResult({ stats: runStats({ hits: 1, shots: 5 }) });
    expect(finish(r).newly).toContain('firstBlood');
  });

  it('never re-grants an achieved trophy', () => {
    const r = runResult({ stats: runStats({ hits: 1, shots: 5 }) });
    finish(r);
    const second = finish(r);
    expect(second.newly).not.toContain('firstBlood');
  });

  it('run-local conditions: noMiss20, perfect5, chains3, rankS', () => {
    const r = runResult({
      rank: 'S',
      stats: runStats({ hits: 30, shots: 30, hitStreakNoMiss: 20, bestPerfectStreak: 5, chainsDone: ['a', 'b', 'c'] }),
    });
    const { newly } = finish(r);
    expect(newly).toEqual(expect.arrayContaining(['noMiss20', 'perfect5', 'chains3', 'rankS']));
  });

  it('flag conditions: swarm3s, bossClean, goldStorm, trickshot, longshot, chain5', () => {
    const r = runResult({ stats: runStats({ hits: 5, shots: 5, bossKills: 1 }) });
    const { newly } = finish(r, {
      swarmFastestMs: 2400,
      bossClean: true,
      goldDuringThunder: true,
      trickshots: 2,
      longshots: 1,
      chainStepsBest: 5,
    });
    expect(newly).toEqual(
      expect.arrayContaining(['swarm3s', 'bossClean', 'goldStorm', 'trickshot', 'longshot', 'chain5']),
    );
  });

  it('a slow swarm clear does NOT satisfy swarm3s', () => {
    const { newly } = finish(runResult(), { swarmFastestMs: 3500 });
    expect(newly).not.toContain('swarm3s');
  });

  it('no swarms at all (-1) does not satisfy swarm3s', () => {
    const { newly } = finish(runResult(), { swarmFastestMs: -1 });
    expect(newly).not.toContain('swarm3s');
  });

  it('accuracy trophy needs both volume and rate', () => {
    expect(finish(runResult({ stats: runStats({ shots: 39, hits: 39 }) })).newly).not.toContain('acc80');
    expect(finish(runResult({ stats: runStats({ shots: 50, hits: 39 }) })).newly).not.toContain('acc80');
    expect(finish(runResult({ stats: runStats({ shots: 40, hits: 32 }) })).newly).toContain('acc80');
  });

  it('bossClean requires a clean flag AND a boss kill', () => {
    expect(finish(runResult(), { bossClean: true }).newly).not.toContain('bossClean');
    const withKill = runResult({ stats: runStats({ bossKills: 1 }) });
    expect(finish(withKill, { bossClean: true }).newly).toContain('bossClean');
  });

  it('secrets1 fires when a map is fully explored (state from commit/markHidden)', () => {
    const save = loadSave();
    save.progress.hiddenFound.nebelmoor = [...hiddenObjectIds('nebelmoor')];
    const { newly } = finish(runResult());
    expect(newly).toContain('secrets1');
  });

  it('global-state trophies: rounds10 and level5', () => {
    for (let i = 0; i < 9; i++) commitRun(runResult());
    expect(finish(runResult()).newly).toContain('rounds10'); // 10th run

    reset();
    const save = loadSave();
    save.progress.level = 5;
    expect(evaluateAfterRun(runResult(), defaultRunFlags(), save)).toContain('level5');
  });

  it('keeps the trophy list in canonical definition order', () => {
    const order = ACHIEVEMENTS.map((a) => a.id);
    const r = runResult({
      rank: 'SSS',
      stats: runStats({
        hits: 50,
        shots: 50,
        hitStreakNoMiss: 25,
        bestPerfectStreak: 9,
        chainsDone: ['a', 'b', 'c'],
        bossKills: 2,
      }),
    });
    const { save } = finish(r, {
      swarmFastestMs: 1000,
      bossClean: true,
      goldDuringThunder: true,
      trickshots: 3,
      longshots: 3,
      chainStepsBest: 7,
    });
    const idx = save.progress.achievements.map((id) => order.indexOf(id));
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
    expect(save.progress.achievements).not.toContain('level5');
    expect(save.progress.achievements).not.toContain('rounds10');
  });
});

describe('challenge progress', () => {
  beforeEach(reset);

  it('records best progress per metric across runs', () => {
    finish(runResult({ stats: runStats({ hits: 50, shots: 100, hitStreakNoMiss: 10 }) }));
    expect(loadSave().progress.challengeProgress['noMiss20']).toBe(10);
    // worse later run keeps the best
    finish(runResult({ stats: runStats({ hits: 5, shots: 100, hitStreakNoMiss: 4 }) }));
    expect(loadSave().progress.challengeProgress['noMiss20']).toBe(10);
  });

  it('floors the accuracy percentage', () => {
    finish(runResult({ stats: runStats({ hits: 33, shots: 50 }) })); // 66%
    expect(loadSave().progress.challengeProgress['acc70Round']).toBe(66);
  });

  it('maps a qualifying rank to the ladder index', () => {
    finish(runResult({ rank: 'A' })); // D1 C2 B3 A4
    expect(loadSave().progress.challengeProgress['rankA']).toBe(4);
  });

  it('readyToClaim requires goal met and unclaimed; claim pays once', () => {
    finish(runResult({ stats: runStats({ shots: 100, hits: 80 }) })); // 80% >= 70
    const def = CHALLENGES.find((c) => c.id === 'acc70Round');
    expect(def).toBeDefined();
    expect(challengeReadyToClaim(loadSave(), 'acc70Round')).toBe(true);
    expect(challengeReadyToClaim(loadSave(), 'noMiss20')).toBe(false);
    expect(challengeReadyToClaim(loadSave(), 'not-a-challenge')).toBe(false);

    expect(claimChallenge('acc70Round', def?.reward ?? 0)).toBe(true);
    expect(challengeReadyToClaim(loadSave(), 'acc70Round')).toBe(false);
  });

  it('secretsTotal metric counts fully explored maps', () => {
    const save = loadSave();
    save.progress.hiddenFound.nebelmoor = [...hiddenObjectIds('nebelmoor')];
    finish(runResult());
    expect(loadSave().progress.challengeProgress['secretsAll']).toBe(1);
  });
});
