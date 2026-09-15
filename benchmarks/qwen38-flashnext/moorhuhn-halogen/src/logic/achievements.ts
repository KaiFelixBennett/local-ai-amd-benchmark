import { ACHIEVEMENTS, CHALLENGES } from '../config/cosmetics';
import type { RunSummary, SaveDataV3 } from '../types';

export interface EvaluationResult {
  newChallenges: string[];
  newAchievements: string[];
  challengeProgress: Record<string, number>;
}

/**
 * Pure evaluator: compares run summary + lifetime save stats against challenge and
 * achievement definitions. Deterministic and side-effect free.
 */
export function evaluateAchievements(
  summary: RunSummary,
  save: SaveDataV3,
  lifetimeBestRoundScore: number,
): EvaluationResult {
  const newChallenges: string[] = [];
  const newAchievements: string[] = [];
  const challengeProgress: Record<string, number> = {};

  const done = new Set(
    Object.entries(save.challenges)
      .filter(([, v]) => v.completedAt)
      .map(([k]) => k),
  );

  for (const ch of CHALLENGES) {
    if (done.has(ch.id)) continue;
    const progress = challengeValue(ch.id, summary);
    challengeProgress[ch.id] = Math.max(progress, save.challenges[ch.id]?.progress ?? 0);
    if (ch.map && summary.map !== ch.map) continue;
    if (progress >= ch.goal) {
      newChallenges.push(ch.id);
      challengeProgress[ch.id] = ch.goal;
    }
  }

  const unlocked = new Set(save.achievements);
  for (const a of ACHIEVEMENTS) {
    if (unlocked.has(a.id)) continue;
    const v = lifetimeMetric(a.metric, save, summary, lifetimeBestRoundScore);
    if (v >= a.goal) newAchievements.push(a.id);
  }

  return { newChallenges, newAchievements, challengeProgress };
}

function challengeValue(id: string, s: RunSummary): number {
  switch (id) {
    case 'ch_no_miss_20':
      return s.maxHitsWithoutMiss;
    case 'ch_perfect_5':
      return s.maxPerfectStreak;
    case 'ch_swarm_3s':
      return s.swarmBonuses > 0 ? 1 : 0;
    case 'ch_boss_clean':
      return s.bossDefeated && s.bossMisses === 0 ? 1 : 0;
    case 'ch_hidden_nebelmoor':
      return s.hiddenObjectsFound;
    case 'ch_acc_80':
      return s.accuracy >= 0.8 && s.shots >= 10 ? 1 : 0;
    case 'ch_chain_5':
      return s.longestChain;
    case 'ch_gold_storm':
      return s.goldDuringStorm ? 1 : 0;
    default:
      return 0;
  }
}

function lifetimeMetric(metric: string, save: SaveDataV3, summary: RunSummary, bestRoundScore: number): number {
  const st = save.stats;
  switch (metric) {
    case 'totalShots':
      return st.totalShots + summary.shots;
    case 'totalHits':
      return st.totalHits + summary.hits;
    case 'perfectHits':
      return st.perfectHits + summary.perfectHits;
    case 'bestCombo':
      return Math.max(st.bestCombo, summary.maxCombo);
    case 'bestRoundScore':
      return Math.max(bestRoundScore, summary.score);
    case 'bossKills':
      return st.bossKills + (summary.bossDefeated ? 1 : 0);
    case 'totalRuns':
      return st.totalRuns + 1;
    case 'chainReactions':
      return st.chainReactions + summary.chainReactions;
    default:
      return 0;
  }
}

/** XP required to advance from `level` to `level+1`. */
export function xpForLevel(level: number, base: number, exp: number, maxLevel: number): number {
  if (level >= maxLevel) return Infinity;
  return Math.round(base * Math.pow(level, exp));
}

export interface LevelUpResult {
  level: number;
  xp: number;
  levelsGained: number;
}

export function applyXp(
  level: number,
  xp: number,
  gained: number,
  base: number,
  exp: number,
  maxLevel: number,
): LevelUpResult {
  let curLevel = level;
  let curXp = xp + gained;
  let levels = 0;
  while (curLevel < maxLevel && curXp >= xpForLevel(curLevel, base, exp, maxLevel)) {
    curXp -= xpForLevel(curLevel, base, exp, maxLevel);
    curLevel += 1;
    levels += 1;
  }
  return { level: curLevel, xp: curXp, levelsGained: levels };
}
