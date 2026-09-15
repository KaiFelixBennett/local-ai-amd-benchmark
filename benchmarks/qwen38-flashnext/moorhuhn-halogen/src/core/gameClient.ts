import { bus } from './bus';
import { SaveStorage, defaultSave } from './storage';
import { SettingsStore } from './settings';
import { detectLanguage, t } from './i18n';
import type { DailyRecord, HighScoreEntry, MapId, ModeId, RunSummary, SaveDataV3 } from '../types';
import { todayIso } from './rng';
import { applyXp, evaluateAchievements } from '../logic/achievements';
import { rankForScore } from '../logic/scoring';
import { BALANCE } from '../config/balance';
import { MAP_UNLOCK_LEVEL, MODE_UNLOCK_LEVEL } from '../config/unlocks';
import { getCosmeticCost } from '../config/cosmetics';
import { MAPS } from '../config/maps';
import { MODES } from '../config/modes';

export type CosmeticKind = 'crosshairs' | 'hudSkins' | 'weaponSkins';

/**
 * GameClient owns the persistent profile and the run lifecycle glue. It is the
 * single writer of the save file (via saveNow) and broadcasts changes.
 */
export class GameClient {
  readonly save: SaveDataV3;
  readonly settings: SettingsStore;
  private storage: SaveStorage;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    const lang = detectLanguage();
    this.storage = new SaveStorage();
    const outcome = this.storage.load(lang);
    this.save = outcome.save;
    this.settings = new SettingsStore(this.save.settings);
    bus.on('settings:changed', () => {
      this.save.settings = { ...this.settings.all };
      this.saveSoon();
    });
  }

  // ---------- persistence ----------
  private saveSoon(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.storage.saveNow(this.save);
    }, 120);
  }

  flush(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.storage.saveNow(this.save);
  }

  resetProfile(): void {
    const lang = this.settings.all.language;
    const fresh = defaultSave(lang);
    Object.assign(this.save, fresh);
    this.settings.patch({
      ...fresh.settings,
      language: lang,
    } as Partial<typeof fresh.settings>);
    this.storage.saveNow(this.save);
    bus.emit('settings:changed', { keys: ['*'] });
  }

  // ---------- queries ----------
  get level(): number {
    return this.save.progression.level;
  }

  isMapUnlocked(map: MapId): boolean {
    return this.level >= MAP_UNLOCK_LEVEL[map] || this.save.unlocks.maps.includes(map);
  }

  isModeUnlocked(mode: ModeId): boolean {
    return this.level >= MODE_UNLOCK_LEVEL[mode] || this.save.unlocks.modes.includes(mode);
  }

  unlockMap(map: MapId): boolean {
    if (!this.isMapUnlocked(map)) return false;
    if (!this.save.unlocks.maps.includes(map)) {
      this.save.unlocks.maps.push(map);
      this.saveSoon();
      bus.emit('unlock:changed', { kind: 'map', id: map });
    }
    return true;
  }

  unlockMode(mode: ModeId): boolean {
    if (!this.isModeUnlocked(mode)) return false;
    if (!this.save.unlocks.modes.includes(mode)) {
      this.save.unlocks.modes.push(mode);
      this.saveSoon();
      bus.emit('unlock:changed', { kind: 'mode', id: mode });
    }
    return true;
  }

  isCosmeticOwned(kind: CosmeticKind, id: string): boolean {
    return this.save.unlocks[kind].includes(id);
  }

  equipCosmetic(kind: CosmeticKind, id: string): boolean {
    if (!this.isCosmeticOwned(kind, id)) return false;
    const mapKey = kind === 'crosshairs' ? 'crosshair' : kind === 'hudSkins' ? 'hudSkin' : 'weaponSkin';
    (this.save.equipped as Record<string, string>)[mapKey] = id;
    this.saveSoon();
    bus.emit('unlock:changed', { kind, id });
    return true;
  }

  buyCosmetic(kind: CosmeticKind, id: string): boolean {
    if (this.isCosmeticOwned(kind, id)) return this.equipCosmetic(kind, id);
    const { level, cost } = getCosmeticCost(kind, id);
    if (this.level < level) return false;
    if (this.save.progression.coins < cost) return false;
    this.save.progression.coins -= cost;
    this.save.unlocks[kind].push(id);
    const mapKey = kind === 'crosshairs' ? 'crosshair' : kind === 'hudSkins' ? 'hudSkin' : 'weaponSkin';
    (this.save.equipped as Record<string, string>)[mapKey] = id;
    this.saveSoon();
    bus.emit('unlock:changed', { kind, id });
    return true;
  }

  getBestScore(mode: ModeId): number {
    const list = this.save.highscores[mode];
    return list && list.length > 0 ? list[0].score : 0;
  }

  getDailyRecord(): DailyRecord | undefined {
    return this.save.daily[todayIso()];
  }

  // ---------- run completion ----------
  completeRun(
    summary: RunSummary,
    isDaily = false,
  ): {
    isRecord: boolean;
    previousBest: number | null;
    newAchievements: string[];
    xpGained: number;
    coinsGained: number;
    leveledUp: boolean;
  } {
    const previousBest = this.getBestScore(summary.mode);
    const isRecord = summary.score > previousBest;

    // XP & coins
    const xpGained =
      Math.round(summary.score * BALANCE.xp.scoreFactor) +
      summary.perfectHits * BALANCE.xp.perfectBonus +
      (summary.bossDefeated ? BALANCE.xp.bossBonus : 0);
    const coinsGained =
      Math.round(summary.score * BALANCE.coins.scoreFactor) +
      summary.perfectHits * BALANCE.coins.perfectFactor +
      summary.chainReactions * BALANCE.coins.chainBonus +
      (summary.bossDefeated ? BALANCE.coins.bossBonus : 0) +
      (isDaily ? BALANCE.coins.dailyBonus : 0);

    const beforeLevel = this.save.progression.level;
    const lvl = applyXp(
      beforeLevel,
      this.save.progression.xp,
      xpGained,
      BALANCE.xp.base,
      BALANCE.xp.exp,
      BALANCE.xp.maxLevel,
    );
    this.save.progression.level = lvl.level;
    this.save.progression.xp = lvl.xp;
    this.save.progression.coins += coinsGained;
    const leveledUp = lvl.levelsGained > 0;

    // achievements & challenges (evaluated against the PRE-merge save so the
    // evaluator can safely add this run's numbers without double-counting)
    const bestRoundScore = Math.max(previousBest, summary.score);
    const evalRes = evaluateAchievements(summary, this.save, bestRoundScore);

    // lifetime stats
    const st = this.save.stats;
    st.totalRuns += 1;
    st.totalShots += summary.shots;
    st.totalHits += summary.hits;
    st.totalScore += summary.score;
    st.totalPlaySeconds += summary.durationSeconds;
    st.perfectHits += summary.perfectHits;
    st.bossKills += summary.bossDefeated ? 1 : 0;
    st.chainReactions += summary.chainReactions;
    st.bestCombo = Math.max(st.bestCombo, summary.maxCombo);
    for (const [k, v] of Object.entries(summary.targetsHit)) {
      st.targetsHit[k] = (st.targetsHit[k] ?? 0) + v;
    }
    st.mapsPlayed[summary.map] = (st.mapsPlayed[summary.map] ?? 0) + 1;
    for (const id of summary.hiddenObjectIds ?? []) {
      if (!st.hiddenObjectsFound.includes(id)) st.hiddenObjectsFound.push(id);
    }
    for (const id of evalRes.newAchievements) {
      this.save.achievements.push(id);
      bus.emit('achievement:unlocked', { achievementId: id });
    }
    for (const id of evalRes.newChallenges) {
      this.save.challenges[id] = { progress: 1, completedAt: todayIso() };
      this.save.progression.coins += challengeReward(id);
      bus.emit('challenge:complete', { challengeId: id });
    }
    for (const [id, prog] of Object.entries(evalRes.challengeProgress)) {
      if (!this.save.challenges[id]) this.save.challenges[id] = { progress: prog };
      else this.save.challenges[id].progress = Math.max(this.save.challenges[id].progress, prog);
    }

    // highscores
    const rank = rankForScore(summary.score, modeMult(summary.mode));
    const entry: HighScoreEntry = {
      score: summary.score,
      date: todayIso(),
      accuracy: summary.accuracy,
      maxCombo: summary.maxCombo,
      rank,
      map: summary.map,
      seed: summary.seed,
    };
    const list = this.save.highscores[summary.mode] ?? [];
    list.push(entry);
    list.sort((a, b) => b.score - a.score);
    this.save.highscores[summary.mode] = list.slice(0, 20);

    // daily record
    if (isDaily) {
      const key = todayIso();
      const existing = this.save.daily[key];
      if (!existing || summary.score > existing.score) {
        this.save.daily[key] = {
          date: key,
          score: summary.score,
          accuracy: summary.accuracy,
          rank,
          seed: summary.seed,
        };
      }
    }

    this.save.tutorialDone = true;
    this.flush();

    return { isRecord, previousBest, newAchievements: evalRes.newAchievements, xpGained, coinsGained, leveledUp };
  }

  tutorialDone(): boolean {
    return this.save.tutorialDone;
  }

  markTutorialDone(): void {
    this.save.tutorialDone = true;
    this.saveSoon();
  }

  /** Available maps for the mode selection screen. */
  availableMaps(): MapId[] {
    return MAPS.map((m) => m.id).filter((m) => this.isMapUnlocked(m)) as MapId[];
  }

  availableModes(): ModeId[] {
    return MODES.map((m) => m.id).filter((m) => this.isModeUnlocked(m)) as ModeId[];
  }

  labelMap(id: MapId): string {
    return t(`map.${id}.name`);
  }

  labelMode(id: ModeId): string {
    return t(`mode.${id}.name`);
  }
}

function modeMult(mode: ModeId): number {
  return MODES.find((m) => m.id === mode)?.scoreMult ?? 1;
}

function challengeReward(id: string): number {
  const ch = CHALLENGE_REWARDS[id];
  return ch ?? 100;
}

import { CHALLENGES } from '../config/cosmetics';
const CHALLENGE_REWARDS: Record<string, number> = Object.fromEntries(CHALLENGES.map((c) => [c.id, c.rewardCoins]));
