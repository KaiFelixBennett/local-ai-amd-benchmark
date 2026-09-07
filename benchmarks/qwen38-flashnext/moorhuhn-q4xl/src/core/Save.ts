import type {
  GlobalStats,
  HighscoreEntry,
  ModeId,
  Progress,
  Rank,
  RunResult,
  SaveData,
  Settings,
  MapId,
} from './types';
import { storage } from './Storage';
import { DEFAULT_SETTINGS, sanitizeSettings } from './Settings';
import { levelFromXp } from './Progress';

export const SAVE_KEY = 'moorland-mayhem-save';
export const SAVE_VERSION = 3;

export function defaultProgress(): Progress {
  return {
    xp: 0,
    level: 1,
    currency: 0,
    ownedCrosshairs: ['ring'],
    ownedHuds: ['parchment'],
    ownedWeapons: ['oak'],
    activeCrosshair: 'ring',
    activeHud: 'parchment',
    activeWeapon: 'oak',
    achievements: [],
    challengeProgress: {},
    claimedChallenges: [],
    hiddenFound: {},
  };
}

export function defaultStats(): GlobalStats {
  return {
    rounds: 0,
    totalShots: 0,
    totalHits: 0,
    totalPerfect: 0,
    bestComboEver: 0,
    bossKillsEver: 0,
    chainsEver: 0,
    playSeconds: 0,
    kindHits: {},
    modePlays: {},
  };
}

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    progress: defaultProgress(),
    stats: defaultStats(),
    highscores: {},
    dailyRecords: {},
    seenTutorial: false,
  };
}

/**
 * Migrate any legacy save shape up to SAVE_VERSION. Each step converts
 * (version-1) -> version. Unknown/older blobs get healthy defaults merged.
 */
export function migrateSave(raw: unknown): SaveData {
  const base = defaultSave();
  if (typeof raw !== 'object' || raw === null) return base;
  const r = raw as Record<string, unknown>;
  const version =
    typeof r['version'] === 'number' && Number.isFinite(r['version'])
      ? Math.floor(r['version'] as number)
      : 0;

  // v0 -> v1: settings introduced; v1 -> v2: progress + stats; v2 -> v3: dailyRecords.
  const out: SaveData = { ...base };
  out.settings = sanitizeSettings(r['settings'] ?? r['options']);
  if (typeof r['progress'] === 'object' && r['progress'] !== null) {
    const p = r['progress'] as Record<string, unknown>;
    const dp = defaultProgress();
    out.progress = {
      ...dp,
      xp: typeof p['xp'] === 'number' ? Math.max(0, p['xp']) : dp.xp,
      currency:
        typeof p['currency'] === 'number' ? Math.max(0, p['currency']) : dp.currency,
      ownedCrosshairs: Array.isArray(p['ownedCrosshairs'])
        ? (p['ownedCrosshairs'].filter((v) => typeof v === 'string') as string[])
        : dp.ownedCrosshairs,
      ownedHuds: Array.isArray(p['ownedHuds'])
        ? (p['ownedHuds'].filter((v) => typeof v === 'string') as string[])
        : dp.ownedHuds,
      ownedWeapons: Array.isArray(p['ownedWeapons'])
        ? (p['ownedWeapons'].filter((v) => typeof v === 'string') as string[])
        : dp.ownedWeapons,
      activeCrosshair:
        typeof p['activeCrosshair'] === 'string' ? (p['activeCrosshair'] as string) : dp.activeCrosshair,
      activeHud: typeof p['activeHud'] === 'string' ? (p['activeHud'] as string) : dp.activeHud,
      activeWeapon:
        typeof p['activeWeapon'] === 'string' ? (p['activeWeapon'] as string) : dp.activeWeapon,
      achievements: Array.isArray(p['achievements'])
        ? (p['achievements'].filter((v) => typeof v === 'string') as string[])
        : [],
      challengeProgress:
        typeof p['challengeProgress'] === 'object' && p['challengeProgress'] !== null
          ? (Object.fromEntries(
              Object.entries(p['challengeProgress'] as Record<string, unknown>).filter(
                ([, v]) => typeof v === 'number',
              ),
            ) as Record<string, number>)
          : {},
      claimedChallenges: Array.isArray(p['claimedChallenges'])
        ? (p['claimedChallenges'].filter((v) => typeof v === 'string') as string[])
          : [],
      hiddenFound:
        typeof p['hiddenFound'] === 'object' && p['hiddenFound'] !== null
          ? (p['hiddenFound'] as Progress['hiddenFound'])
          : {},
    };
    // ensure actives are owned
    for (const [listKey, activeKey] of [
      ['ownedCrosshairs', 'activeCrosshair'],
      ['ownedHuds', 'activeHud'],
      ['ownedWeapons', 'activeWeapon'],
    ] as const) {
      if (!out.progress[listKey].includes(out.progress[activeKey])) {
        out.progress[activeKey] = out.progress[listKey][0] ?? dp[activeKey];
      }
    }
  }
  if (typeof r['stats'] === 'object' && r['stats'] !== null) {
    const s = r['stats'] as Record<string, unknown>;
    const ds = defaultStats();
    out.stats = {
      ...ds,
      ...Object.fromEntries(
        Object.entries(s).filter(
          ([k, v]) =>
            (typeof v === 'number' && Number.isFinite(v) && k in ds) ||
            (typeof v === 'object' && v !== null),
        ),
      ),
    } as GlobalStats;
    if (typeof s['kindHits'] === 'object' && s['kindHits'])
      out.stats.kindHits = s['kindHits'] as GlobalStats['kindHits'];
    if (typeof s['modePlays'] === 'object' && s['modePlays'])
      out.stats.modePlays = s['modePlays'] as GlobalStats['modePlays'];
  }
  if (typeof r['highscores'] === 'object' && r['highscores'] !== null) {
    const hs: Record<string, HighscoreEntry> = {};
    for (const [k, v] of Object.entries(r['highscores'] as Record<string, unknown>)) {
      if (typeof v === 'object' && v !== null) {
        const e = v as Record<string, unknown>;
        if (typeof e.score === 'number') {
          hs[k] = {
            score: Math.max(0, Math.round(e.score)),
            rank: (typeof e.rank === 'string' ? e.rank : 'D') as Rank,
            date: typeof e.date === 'string' ? e.date : '',
            accuracy: typeof e.accuracy === 'number' ? e.accuracy : 0,
          };
        }
      }
    }
    out.highscores = hs;
  }
  if (typeof r['dailyRecords'] === 'object' && r['dailyRecords'] !== null) {
    const dr: SaveData['dailyRecords'] = {};
    for (const [k, v] of Object.entries(r['dailyRecords'] as Record<string, unknown>)) {
      if (typeof v === 'object' && v !== null) {
        const e = v as Record<string, unknown>;
        if (typeof e.score === 'number' && typeof e.rank === 'string') {
          dr[k] = { score: Math.round(e.score), rank: e.rank as Rank };
        }
      }
    }
    out.dailyRecords = dr;
  }
  if (typeof r['seenTutorial'] === 'boolean') out.seenTutorial = r['seenTutorial'];

  // version bookkeeping: any pre-migration data merged, stamp current version
  out.version = Math.max(version, SAVE_VERSION);
  // recompute level from xp so it never desyncs after migration
  out.progress.level = levelFromXp(out.progress.xp).level;
  return out;
}

// ------- singleton store with change notification -------

import { bus } from './EventBus';

let current: SaveData | null = null;

export function loadSave(): SaveData {
  if (current) return current;
  const raw = storage.get(SAVE_KEY);
  let parsed: unknown = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
  }
  current = migrateSave(parsed);
  return current;
}

export function saveNow(): void {
  if (!current) return;
  storage.set(SAVE_KEY, JSON.stringify(current));
  bus.emit('settings:changed', undefined);
}

export function mutate(fn: (s: SaveData) => void): void {
  const s = loadSave();
  fn(s);
  saveNow();
}

/** Apply a finished run to progress, stats, highscores. Returns result enriched. */
export function commitRun(result: RunResult): void {
  mutate((s) => {
    const p = s.progress;
    const gs = s.stats;
    p.xp += result.xp;
    p.currency += result.currencyEarned;
    gs.rounds += 1;
    gs.totalShots += result.stats.shots;
    gs.totalHits += result.stats.hits;
    gs.totalPerfect += result.stats.perfects;
    gs.bestComboEver = Math.max(gs.bestComboEver, result.stats.bestCombo);
    gs.bossKillsEver += result.stats.bossKills;
    gs.chainsEver += result.stats.chainsDone.length;
    for (const [k, v] of Object.entries(result.stats.kindHits)) {
      gs.kindHits[k as keyof typeof gs.kindHits] =
        (gs.kindHits[k as keyof typeof gs.kindHits] ?? 0) + (v ?? 0);
    }
    gs.modePlays[result.mode as ModeId] = (gs.modePlays[result.mode] ?? 0) + 1;

    const hsKey = `${result.mode}|${result.map}`;
    const prev = s.highscores[hsKey];
    if (!prev || result.score > prev.score) {
      s.highscores[hsKey] = {
        score: result.score,
        rank: result.rank,
        date: new Date().toISOString().slice(0, 10),
        accuracy:
          result.stats.shots > 0
            ? Math.round((result.stats.hits / result.stats.shots) * 100)
            : 0,
      };
    }
    if (result.dailyKey) {
      s.dailyRecords[result.dailyKey] = { score: result.score, rank: result.rank };
    }
    // achievements evaluated by the achievements module after commit (needs fresh stats)
    void p;
  });
}

/** Pay out a finished challenge's feather reward exactly once. */
export function claimChallenge(id: string, reward: number): boolean {
  let done = false;
  mutate((s) => {
    if (s.progress.claimedChallenges.includes(id)) return;
    s.progress.claimedChallenges.push(id);
    s.progress.currency += reward;
    done = true;
  });
  return done;
}

/** Mark unlock-relevant hidden env object discovered. */
export function markHiddenFound(map: MapId, id: string): boolean {
  let isNew = false;
  mutate((s) => {
    const list = (s.progress.hiddenFound[map] ??= []);
    if (!list.includes(id)) {
      list.push(id);
      isNew = true;
    }
  });
  return isNew;
}

export function getSettings(): Settings {
  return loadSave().settings;
}

export function resetSave(): void {
  storage.remove(SAVE_KEY);
  current = null;
}

// For tests: force re-parse from storage on next access.
export function _reloadSaveForTests(): void {
  current = null;
}
