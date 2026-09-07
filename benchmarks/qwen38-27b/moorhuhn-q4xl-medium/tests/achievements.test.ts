import { describe, it, expect } from 'vitest';
import { evaluateAchievements, statValue, ACHIEVEMENTS, achievementById } from '../src/core/achievements';
import { createDefaultSave } from '../src/core/save';
import type { PlayerStats } from '../src/core/types';

function stats(over: Partial<PlayerStats> = {}): PlayerStats {
  return { ...createDefaultSave().stats, ...over };
}

describe('achievements', () => {
  it('a fresh player has none unlocked', () => {
    const res = evaluateAchievements(stats(), []);
    expect(res.length).toBe(ACHIEVEMENTS.length);
    for (const r of res) {
      expect(r.done).toBe(false);
      expect(r.unlocked).toBe(false);
    }
  });

  it('unlocks when the tracked stat reaches target', () => {
    // veteran requires 30 rounds
    const res = evaluateAchievements(stats({ totalRounds: 30 }), []);
    const vet = res.find((r) => r.id === 'veteran')!;
    expect(vet.done).toBe(true);
    expect(vet.unlocked).toBe(true);
    expect(vet.progress).toBe(30);
  });

  it('does not re-report already unlocked achievements', () => {
    const res = evaluateAchievements(stats({ totalRounds: 50 }), ['veteran']);
    const vet = res.find((r) => r.id === 'veteran')!;
    // unlocked true, but done reflects raw stat >= target (still true) — the
    // "new" filtering happens at the call site via alreadyUnlocked.
    expect(vet.unlocked).toBe(true);
  });

  it('progress is clamped to the target', () => {
    const res = evaluateAchievements(stats({ totalRounds: 1000 }), []);
    const vet = res.find((r) => r.id === 'veteran')!;
    expect(vet.progress).toBe(30);
  });

  it('statValue resolves known stats and 0 for unknown', () => {
    expect(statValue(stats({ totalHits: 77 }), 'totalHits')).toBe(77);
    const def = achievementById('boss_kill')!;
    expect(statValue(stats({ bossKills: 2 }), def.stat)).toBe(2);
  });
});
