/**
 * Errungenschaften: reine Zustandsprüfung gegen Spielstand + Rundenstatistik.
 * Getrennt von Phaser, damit jede Bedingung isoliert getestet werden kann.
 */
import type { AchievementId, MapId, ModeId, RoundStats } from './types';
import type { SaveData } from './save';

export interface RoundContext {
  mode: ModeId;
  mapId: MapId;
  stats: RoundStats;
  score: number;
  maxCombo: number;
  perfectCount: number;
  hiddenFoundNow: string[];
  chainCount: number;
  bossClean: boolean;
  /** Endlose Runde erreicht 50k? */
  endlessScore: number | null;
  isDaily: boolean;
}

/** Prüft alle Errungenschaften; liefert neu freigeschaltete IDs. */
export function checkAchievements(save: SaveData, ctx: RoundContext): AchievementId[] {
  const unlocked: AchievementId[] = [];
  const owned = save.progress.achievements;
  const has = (id: AchievementId) => owned.includes(id);
  const unlock = (id: AchievementId) => {
    if (!has(id)) unlocked.push(id);
  };

  const { stats } = ctx;
  const acc = stats.hits / Math.max(1, stats.shots);
  const totalKills = Object.values(stats.targetsHit).reduce((s, n) => s + (n ?? 0), 0);

  if (!has('noMiss20') && stats.shots >= 20 && acc === 1) {
    unlock('noMiss20');
  }
  if (!has('perfect5') && ctx.perfectCount >= 5) {
    unlock('perfect5');
  }
  if (!has('acc80') && stats.shots >= 15 && acc >= 0.8) {
    unlock('acc80');
  }
  if (!has('combo25') && ctx.maxCombo >= 25) {
    unlock('combo25');
  }
  if (!has('chain5') && ctx.chainCount >= 5) {
    unlock('chain5');
  }
  if (!has('bossClean') && ctx.bossClean && stats.bossKills >= 1) {
    unlock('bossClean');
  }
  if (!has('goldThunder') && totalKills >= 5 && stats.shots >= 5 && acc >= 0.75) {
    unlock('goldThunder');
  }
  if (!has('endless50000') && ctx.endlessScore != null && ctx.endlessScore >= 50000) {
    unlock('endless50000');
  }
  if (!has('daily') && ctx.isDaily && ctx.score >= 7000) {
    unlock('daily');
  }
  if (!has('hiddenAll') && allHiddenFound(save)) {
    unlock('hiddenAll');
  }
  if (!has('sss') && ctx.score >= 20000) {
    unlock('sss');
  }
  return unlocked;
}

const ALL_HIDDEN: Record<MapId, string[]> = {
  nebelmoor: ['bottle_1', 'hollow_1'],
  sturmklippen: ['storm_bottle'],
  mondbruch: ['willow_hollow', 'moon_bottle'],
};

export function allHiddenFound(save: SaveData): boolean {
  const found = save.progress.hiddenFound;
  return (Object.keys(ALL_HIDDEN) as MapId[]).every((m) =>
    ALL_HIDDEN[m].every((id) => (found[m] ?? []).includes(id)),
  );
}

export function hiddenKey(_mapId: MapId, objId: string): string {
  return objId;
}

/** XP-Vergabe pro Runde. */
export function xpForRound(ctx: RoundContext): number {
  const base = Math.floor(ctx.score / 25);
  const perfect = ctx.perfectCount * 15;
  const comboBonus = Math.floor(ctx.maxCombo / 5) * 20;
  const bossBonus = ctx.stats.bossKills * 150;
  return Math.max(10, base + perfect + comboBonus + bossBonus);
}

/** Federn als Währung. */
export function feathersForRound(ctx: RoundContext): number {
  return Math.floor(ctx.score / 100) + ctx.perfectCount * 2 + ctx.stats.bossKills * 25;
}
