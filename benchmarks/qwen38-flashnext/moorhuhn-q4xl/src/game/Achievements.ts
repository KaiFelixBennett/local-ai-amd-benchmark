import type { RunResult, SaveData, Rank } from '../core/types';
import { rankAtLeast } from './scoring';
import { ACHIEVEMENTS, CHALLENGES } from '../config/achievements';
import { hiddenObjectIds } from '../config/maps';

/** Extra per-run facts the round tracks but RunStats doesn't hold. */
export interface RunFlags {
  trickshots: number;
  longshots: number;
  goldDuringThunder: boolean;
  bossClean: boolean; // boss killed without a single miss during the fight
  swarmFastestMs: number; // -1 never; otherwise ms for a full-swarm clear
  chainStepsBest: number; // longest chain completed this run (step count)
}

export function defaultRunFlags(): RunFlags {
  return {
    trickshots: 0,
    longshots: 0,
    goldDuringThunder: false,
    bossClean: false,
    swarmFastestMs: -1,
    chainStepsBest: 0,
  };
}

const RANK_INDEX: Record<Rank, number> = { D: 1, C: 2, B: 3, A: 4, S: 5, SS: 6, SSS: 7 };

export interface ChallengeMetrics {
  hitStreakNoMiss: number;
  bestPerfectStreak: number;
  chainStepsBest: number;
  accuracyPercent: number;
  swarmFastestMs: number; // 1 if a sub-3s swarm clear happened, else 0
  bossCleanCount: number;
  secretsTotal: number; // maps where every hidden object is found (0..3)
  goldDuringThunder: number;
  trickshots: number;
  rankOrder: number;
}

function metricsFor(result: RunResult, flags: RunFlags, save: SaveData): ChallengeMetrics {
  const s = result.stats;
  const acc = s.shots > 0 ? (s.hits / s.shots) * 100 : 0;
  const secretsByMap = (['nebelmoor', 'sturmklippen', 'mondbruch'] as const).filter((m) => {
    const needed = hiddenObjectIds(m);
    const found = save.progress.hiddenFound[m] ?? [];
    return needed.length > 0 && needed.every((id) => found.includes(id));
  }).length;
  return {
    hitStreakNoMiss: s.hitStreakNoMiss,
    bestPerfectStreak: s.bestPerfectStreak,
    chainStepsBest: flags.chainStepsBest,
    accuracyPercent: Math.floor(acc),
    swarmFastestMs: flags.swarmFastestMs >= 0 && flags.swarmFastestMs <= 3000 ? 1 : 0,
    bossCleanCount: flags.bossClean ? s.bossKills : 0,
    secretsTotal: Math.max(secretsByMap, save.progress.challengeProgress['secretsAll'] ?? 0),
    goldDuringThunder: flags.goldDuringThunder ? 1 : 0,
    trickshots: flags.trickshots,
    rankOrder: RANK_INDEX[result.rank],
  };
}

/**
 * Pure evaluation against a save that ALREADY contains this run (call after
 * commitRun). Mutates save.progress: adds achievements + best challenge
 * progress. Returns the ids newly earned by this run (for the results UI).
 */
export function evaluateAfterRun(result: RunResult, flags: RunFlags, save: SaveData): string[] {
  const p = save.progress;
  const g = save.stats;
  const s = result.stats;
  const earned = new Set(p.achievements);
  const newly: string[] = [];

  const grant = (id: string, ok: boolean): void => {
    if (ok && !earned.has(id)) {
      earned.add(id);
      newly.push(id);
    }
  };

  const defExists = new Set(ACHIEVEMENTS.map((a) => a.id));

  grant('firstBlood', g.totalHits >= 1);
  grant('noMiss20', s.hitStreakNoMiss >= 20);
  grant('perfect5', s.bestPerfectStreak >= 5);
  grant('swarm3s', flags.swarmFastestMs >= 0 && flags.swarmFastestMs <= 3000);
  grant('bossClean', flags.bossClean && s.bossKills > 0);
  grant(
    'secrets1',
    (['nebelmoor', 'sturmklippen', 'mondbruch'] as const).some((m) => {
      const need = hiddenObjectIds(m);
      const found = save.progress.hiddenFound[m] ?? [];
      return need.length > 0 && need.every((id) => found.includes(id));
    }),
  );
  grant('acc80', s.shots >= 40 && s.hits / s.shots >= 0.8);
  grant('chain5', flags.chainStepsBest >= 5);
  grant('goldStorm', flags.goldDuringThunder);
  grant('rankS', rankAtLeast(result.rank, 'S'));
  grant('level5', p.level >= 5);
  grant('rounds10', g.rounds >= 10);
  grant('chains3', s.chainsDone.length >= 3);
  grant('trickshot', flags.trickshots > 0);
  grant('longshot', flags.longshots > 0);

  p.achievements = ACHIEVEMENTS.filter((a) => earned.has(a.id) && defExists.has(a.id)).map((a) => a.id);

  // challenge best-progress (higher is better, except swarmFastest == flag)
  const m = metricsFor(result, flags, save);
  for (const ch of CHALLENGES) {
    const value = m[ch.metric];
    const prev = p.challengeProgress[ch.id] ?? 0;
    p.challengeProgress[ch.id] = Math.max(prev, value);
  }

  return newly;
}

export function challengeReadyToClaim(save: SaveData, id: string): boolean {
  const def = CHALLENGES.find((c) => c.id === id);
  if (!def) return false;
  if (save.progress.claimedChallenges.includes(id)) return false;
  return (save.progress.challengeProgress[id] ?? 0) >= def.goal;
}
