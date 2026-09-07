import { describe, expect, it } from 'vitest';
import { evaluateAchievements, evaluateChallenges, type CumulativeStatsSnapshot } from '../src/systems/AchievementManager';
import { ACHIEVEMENT_FLAGS } from '../src/config/achievements';
import { CHALLENGE_FLAGS } from '../src/config/challenges';

const emptySnapshot: CumulativeStatsSnapshot = {
  cumulativeHits: 0,
  cumulativeShots: 0,
  bestCombo: 0,
  bossesDefeated: 0,
  chainReactionsTriggered: 0,
  roundsPlayed: 0,
  playerLevel: 1,
  roundFlags: new Set(),
};

describe('evaluateAchievements', () => {
  it('unlocks "first_flight" once a round has been played', () => {
    const result = evaluateAchievements([], { ...emptySnapshot, roundsPlayed: 1 });
    expect(result.newlyUnlocked.some((a) => a.id === 'first_flight')).toBe(true);
  });

  it('does not unlock threshold achievements below their target', () => {
    const result = evaluateAchievements([], { ...emptySnapshot, cumulativeHits: 50 });
    expect(result.newlyUnlocked.some((a) => a.id === 'sharpshooter_100')).toBe(false);
  });

  it('unlocks threshold achievements once the target is met', () => {
    const result = evaluateAchievements([], { ...emptySnapshot, cumulativeHits: 100 });
    expect(result.newlyUnlocked.some((a) => a.id === 'sharpshooter_100')).toBe(true);
  });

  it('is idempotent: already-unlocked achievements are never reported as newly unlocked again', () => {
    const first = evaluateAchievements([], { ...emptySnapshot, roundsPlayed: 1 });
    const second = evaluateAchievements(first.updated, { ...emptySnapshot, roundsPlayed: 1 });
    expect(second.newlyUnlocked).toHaveLength(0);
  });

  it('unlocks flag-based achievements via roundEventFlag', () => {
    const flags = new Set([ACHIEVEMENT_FLAGS.NO_MISS_20]);
    const result = evaluateAchievements([], { ...emptySnapshot, roundFlags: flags });
    expect(result.newlyUnlocked.some((a) => a.id === 'flawless_20')).toBe(true);
  });

  it('tracks fractional progress toward an unmet achievement', () => {
    const result = evaluateAchievements([], { ...emptySnapshot, bestCombo: 10 });
    const combo = result.updated.find((a) => a.id === 'combo_master');
    expect(combo?.unlocked).toBe(false);
    expect(combo?.progress).toBeGreaterThan(0);
    expect(combo?.progress).toBeLessThan(1);
  });
});

describe('evaluateChallenges', () => {
  it('completes a challenge when its flag is present this round', () => {
    const result = evaluateChallenges([], new Set([CHALLENGE_FLAGS.CHAIN_5]));
    expect(result.newlyCompleted).toContain('challenge_chain_5');
  });

  it('leaves challenges incomplete when their flag is absent', () => {
    const result = evaluateChallenges([], new Set());
    expect(result.newlyCompleted).toHaveLength(0);
  });

  it('does not re-complete an already-completed challenge', () => {
    const first = evaluateChallenges([], new Set([CHALLENGE_FLAGS.CHAIN_5]));
    const second = evaluateChallenges(first.updated, new Set([CHALLENGE_FLAGS.CHAIN_5]));
    expect(second.newlyCompleted).toHaveLength(0);
  });
});
