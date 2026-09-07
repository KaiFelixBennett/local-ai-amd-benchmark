import Phaser from 'phaser';
import type {
  EventId,
  MapDef,
  ModeConfig,
  PathSpec,
  RunResult,
  RunStats,
  Settings,
  ShotHitInfo,
  TargetKind,
  WeaponState,
} from '../../core/types';
import { bus } from '../../core/EventBus';
import { Rng, todayKey } from '../../core/Rng';
import { getSettings, loadSave, markHiddenFound, mutate, commitRun } from '../../core/Save';
import { levelFromXp, runFeathers, runXp } from '../../core/Progress';
import { t } from '../../core/i18n';
import { TARGETS } from '../../config/targets';
import { EVENTS } from '../../config/events';
import { hiddenObjectIds } from '../../config/maps';
import { BALANCE } from '../../config/balance';
import { Weapon } from '../../game/Weapon';
import { ComboSystem } from '../../game/ComboSystem';
import { DifficultyDirector, type DirectorInput } from '../../game/DifficultyDirector';
import {
  planRound,
  extendEndlessPlan,
  phaseAt,
  type RoundPlan,
} from '../../game/SpawnDirector';
import {
  computeShotScore,
  isPrecision,
  isLongshot,
  multikillBonus,
  parScore,
  rankFor,
} from '../../game/scoring';
import { defaultRunFlags, evaluateAfterRun, type RunFlags } from '../../game/Achievements';
import { showUi } from '../../app/RunConfig';
import type { AudioManager } from '../../audio/AudioManager';
import type { PathCtx } from '../../game/paths';
import type { Flock, Bird } from './Flock';
import type { EnvView } from './EnvView';
import type { Fx } from './Fx';
import type { Backdrop } from '../Backdrop';

export interface RoundDeps {
  scene: Phaser.Scene;
  w: number;
  h: number;
  mode: ModeConfig;
  map: MapDef;
  seed: number;
  audio: AudioManager;
  settings: Settings;
  flock: Flock;
  env: EnvView;
  fx: Fx;
  backdrop: Backdrop;
  tutorial?: boolean;
}

const FIRE_COOLDOWN = 0.34;
const RELOAD_TIME = 2.2;

interface ActiveEvent {
  id: EventId;
  nameKey: string | null;
  endAt: number;
  mult: number;
}

interface TutorialStep {
  key: string;
  done: (c: RoundController) => boolean;
}

const TUTORIAL_STEPS: TutorialStep[] = [
  { key: 'tutorial.welcome', done: (c) => c.stats.shots > 0 },
  { key: 'tutorial.fire', done: (c) => c.stats.hits >= 1 },
  { key: 'tutorial.hit1', done: (c) => c.stats.hits >= 3 },
  { key: 'tutorial.multi', done: (c) => c.stats.combo >= 5 || c.stats.hits >= 8 },
  { key: 'tutorial.reloadCmd', done: (c) => c.reloadedOnce },
  { key: 'tutorial.reloaded', done: (c) => c.envHitOnce },
];

/**
 * Orchestrates one round: spawn playback, events, shooting resolution,
 * scoring, environment chains, tutorial and end-of-run commit. Plain class
 * (no Phaser inheritance) so GameScene stays thin; still view-coupled through
 * Flock/EnvView/Fx and therefore not unit-tested directly (the pure modules
 * behind it are).
 */
export class RoundController {
  readonly stats: RunStats;
  readonly flags: RunFlags;
  reloadedOnce = false;
  envHitOnce = false;

  private rng: Rng;
  private plan: RoundPlan;
  private spawnIdx = 0;
  private eventIdx = 0;
  private groupId = 5000;
  private time = 0;
  private paused = false;
  private over = false;
  private timeScale = 1;
  private slowUntil = -1;
  private hitstop = 0;
  private phase = -1;
  private bonusActive = false;

  private weapon: Weapon;
  private combo: ComboSystem;
  private director: DifficultyDirector;

  private active: ActiveEvent | null = null;
  private rushTimer = -1;
  private boss: Bird | null = null;
  private bossMisses = 0;
  private swarmWindow = new Map<number, { count: number; first: number }>();
  private escapes: number[] = [];
  private hudTimer = 0;
  private disposers: Array<() => void> = [];
  private tutorialStep = -1;
  private tutorialTimer = 0;

  constructor(private deps: RoundDeps) {
    this.rng = new Rng(deps.seed);
    this.plan = planRound(new Rng(deps.seed), deps.mode, deps.map.id);
    this.weapon = new Weapon({
      magazine: deps.mode.magazineSize,
      fireCooldown: FIRE_COOLDOWN,
      reloadTime: RELOAD_TIME,
      autoReload: deps.mode.autoReload,
      totalAmmo: deps.mode.totalAmmo ?? -1,
    });
    this.combo = new ComboSystem({
      window: deps.mode.comboWindow,
      decayPerSec: deps.mode.comboDecay,
      minComboToKeep: deps.mode.id === 'zen' ? 5 : 2,
      milestoneEvery: 5,
    });
    this.director = new DifficultyDirector(
      { base: deps.mode.difficultyRate * 6 + 0.55, ratePerMinute: deps.mode.difficultyRate * 10 },
      deps.mode.fixedDifficulty,
    );
    this.stats = {
      score: 0,
      hits: 0,
      misses: 0,
      shots: 0,
      perfects: 0,
      bestCombo: 0,
      combo: 0,
      bestHit: 0,
      reactionSum: 0,
      reactionCount: 0,
      kindHits: {},
      eventBonus: 0,
      envBonus: 0,
      chainBonus: 0,
      bossKills: 0,
      decoyHits: 0,
      chainsDone: [],
      hiddenFound: [],
      swarmBonusDone: false,
      perfectStreak: 0,
      bestPerfectStreak: 0,
      hitStreakNoMiss: 0,
      bonusTime: 0,
      xps: 0,
    };
    this.flags = defaultRunFlags();

    this.deps.audio.setAmbient(deps.map.ambientKey);
    this.deps.audio.setMood(deps.map.palette.night ? 'calm' : 'normal');
    bus.emit('run:start', { mode: deps.mode.id, map: deps.map.id, seed: deps.seed });
    this.push(bus.on('settings:changed', () => this.deps.fx.settingsChanged(getSettings())));
    if (deps.tutorial) this.startTutorial();
  }

  // ---------- public surface used by GameScene ----------

  get timeLeft(): number {
    const d = this.deps.mode.duration;
    if (d < 0) return -1;
    return Math.max(0, d + this.stats.bonusTime - this.time);
  }

  get isOver(): boolean {
    return this.over;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /** Current simulation speed (slowmo); GameScene scales its own view by it. */
  get simScale(): number {
    return this.timeScale;
  }

  get difficulty(): number {
    return this.director.difficulty;
  }

  reload(): void {
    if (this.paused || this.over) return;
    this.applyWeaponEvents(this.weapon.reload());
  }

  /** Ammo bar for the HUD/debug overlay. */
  get ammo(): WeaponState {
    return this.weapon.state;
  }

  /** Left click / touch: resolve one shot at (x, y) in design coordinates. */
  fire(x: number, y: number): void {
    if (this.paused || this.over) return;
    const events = this.weapon.tryFire();
    if (events.length === 0) return; // still on fire cooldown - consume nothing
    let fired = false;
    for (const ev of events) {
      if (ev.type !== 'fire') continue;
      fired = true;
      this.stats.shots += 1;
      this.deps.audio.shotgun(0.96 + this.rng.range(-0.04, 0.04));
      this.deps.fx.shake(BALANCE.screenshake.fire);
    }
    this.applyWeaponEvents(events.filter((e) => e.type !== 'fire'));
    if (fired) this.resolveShot(x, y);
  }

  setPaused(p: boolean): void {
    if (this.over || this.paused === p) return;
    this.paused = p;
    bus.emit(p ? 'round:pause' : 'round:resume', undefined);
  }

  quit(): void {
    if (this.over) return;
    this.finish();
  }

  onSettingsChanged(s: Settings): void {
    this.deps.fx.settingsChanged(s);
  }

  /** Debug snapshot for window.__mmDebug. */
  debugInfo(): {
    fps: number;
    targets: number;
    particles: number;
    pool: number;
    phase: number;
    difficulty: number;
    seed: number;
    events: string;
    score: number;
    hits: number;
    shots: number;
    lives: { x: number; y: number; kind: string }[];
  } {
    return {
      fps: Math.round(1 / Math.max(1e-4, this.lastDt)),
      targets: this.deps.flock.liveCount,
      particles: 0,
      pool: this.deps.flock.pooled,
      phase: this.phase,
      difficulty: Math.round(this.director.difficulty * 100) / 100,
      seed: this.deps.seed,
      events: this.active?.id ?? '-',
      score: this.stats.score,
      hits: this.stats.hits,
      shots: this.stats.shots,
      lives: this.deps.flock.livePositions(),
    };
  }

  private lastDt = 1 / 60;

  update(rawDt: number): void {
    this.lastDt = rawDt;
    if (this.paused || this.over) return;

    // hitstop freezes the simulation for a beat on satisfying hits
    if (this.hitstop > 0) {
      this.hitstop -= rawDt;
      this.deps.fx.update(rawDt);
      return;
    }
    this.timeScale = this.time < this.slowUntil ? 0.6 : 1;
    const dt = rawDt * this.timeScale;
    this.time += dt;
    this.phase = phaseAt(this.time, this.deps.mode.duration);

    this.playback();
    this.updateEvents();
    this.updateWeapon();
    this.combo.update(dt);
    this.updateDirector();

    const ctx: PathCtx = { width: this.deps.w, height: this.deps.h, wind: this.deps.env.wind, startClock: 0 };
    this.deps.flock.update(this.time, ctx, this.director.speedScale, (b) => this.onEscape(b));
    this.deps.env.update(dt, this.time);
    this.deps.env.tickRespawn(this.time);
    this.deps.fx.update(dt);

    if (this.rushTimer >= 0 && this.time >= this.rushTimer) {
      this.rushTimer = -1;
    } else {
      this.spawnPressure(dt);
    }
    this.updateTutorial(dt);

    // throttled HUD heartbeat
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.1;
      const left = this.timeLeft;
      bus.emit('hud:time', { left, bonus: this.bonusActive });
      bus.emit('hud:tick', undefined);
    }

    const d = this.deps.mode.duration;
    if (d >= 0 && this.timeLeft <= 0) this.finish();
  }

  // ---------- spawn playback ----------

  private playback(): void {
    if (this.deps.mode.duration < 0) {
      const last = this.plan.spawns[this.plan.spawns.length - 1]?.time ?? 0;
      if (this.time > last - 40) {
        extendEndlessPlan(this.plan, this.rng, last, last + 120, this.deps.mode, this.deps.map.id);
      }
    }
    const maxLive = this.director.maxConcurrent;
    while (
      this.spawnIdx < this.plan.spawns.length &&
      this.plan.spawns[this.spawnIdx].time <= this.time
    ) {
      const ev = this.plan.spawns[this.spawnIdx++];
      if (this.deps.flock.liveCount >= maxLive && ev.kind !== 'swarm') continue; // drop gracefully under pressure
      const gid = ev.groupId ?? this.groupId++;
      const b = this.deps.flock.spawn(ev.kind, ev.path, gid, this.time);
      if (b.boss) this.onBossSpawn(b);
    }
  }

  /** Director-driven extra spawns to keep density at the desired rate. */
  private spawnPressure(dt: number): void {
    const extra = Math.max(0, this.director.spawnRate - 0.8) * this.deps.mode.baseSpawnRate * 0.5;
    if (this.deps.flock.liveCount >= this.director.maxConcurrent) return;
    if (this.rng.next() > extra * dt) return;
    const phase = phaseAt(this.time, this.deps.mode.duration);
    const kinds = ambientKinds(phase, this.deps.map.exclusiveKinds);
    if (!kinds.length) return;
    const kind = this.rng.pick(kinds);
    const dir: 1 | -1 = this.rng.sign();
    const spec: PathSpec = {
      kind: 'line',
      edge: dir === 1 ? 'left' : 'right',
      dir,
      y0: this.rng.range(0.1, 0.62),
      speed: TARGETS[kind].speed,
    };
    this.deps.flock.spawn(kind, spec, this.groupId++, this.time);
  }

  // ---------- shooting resolution ----------

  private resolveShot(x: number, y: number): void {
    const grace = BALANCE.pelletSpread;
    const targets = this.deps.flock.overlappingAny(x, y, grace);
    const bossHit = this.boss && !this.boss.pendingKill && this.boss.distanceTo(x, y) <= this.boss.radiusPx + grace;
    if (bossHit && this.boss) {
      this.onBossHit();
      return;
    }
    if (targets.length === 0) {
      this.onMiss(x, y);
      return;
    }
    // multishot: pellets may drop a second close victim (never mixed with decoys)
    const primary = targets[0];
    const second = targets[1];
    const pair =
      second && second.distanceTo(x, y) <= grace && !!second.cfg.hostile === !!primary.cfg.hostile
        ? second
        : null;
    const killedPrimary = this.kill(primary, x, y);
    let extraKills = 0;
    if (killedPrimary && pair) {
      if (this.kill(pair, x, y)) extraKills += 1;
    }
    if (extraKills > 0 && killedPrimary && !primary.cfg.hostile) {
      const bonus = multikillBonus(extraKills + 1);
      this.addScore(bonus, primary.x, primary.y - 34);
      this.deps.fx.popup(t('multikill'), primary.x, primary.y - 58, 'gold', 26);
    }
  }

  /** Kill (or wound) one target. Returns true when it died. */
  private kill(b: Bird, shotX: number, shotY: number): boolean {
    const killed = b.hurt(1);
    if (!killed) {
      // armoured soak hit: counts as a hit and feeds the combo, but no score
      this.registerHitCommon(b);
      this.deps.audio.hit(false);
      this.deps.fx.hitStar(b.x, b.y, false);
      return false;
    }
    // decoy: punished, combo damaged, no points
    if (b.cfg.hostile) {
      this.deps.audio.splat();
      this.deps.fx.featherBurst(b.x, b.y, 0.7);
      this.deps.fx.popup(t('decoy.penalty'), b.x, b.y - 26, 'bad', 20);
      if (!this.deps.mode.zenPenalties) this.combo.reset();
      this.stats.decoyHits += 1;
      this.stats.hitStreakNoMiss = 0;
      this.stats.perfectStreak = 0;
      this.deps.flock.kill(b);
      return true;
    }
    const cfg = b.cfg;
    const dist = b.distanceTo(shotX, shotY);
    const precision = Phaser.Math.Clamp(dist / Math.max(1, b.radiusPx), 0, 1);
    const perfect = isPrecision(precision, cfg);
    const trickshot = b.fleeing;
    const longshot = isLongshot(b.speed, b.depth);

    // swarm group bonus: was every member of a fresh group already down?
    let swarmBonus = false;
    if (b.groupId > 0) {
      const group = this.deps.flock.forEachGroupId(b.groupId);
      const entry = this.swarmWindow.get(b.groupId) ?? { count: 0, first: this.time };
      entry.count += 1;
      const alive = group.length; // current live members incl. this one pre-kill
      if (cfg.id === 'swarm' && alive <= entry.count + 1) {
        if (this.time - entry.first <= BALANCE.swarmGroupWindowSec + 2) {
          swarmBonus = true;
          const ms = (this.time - entry.first) * 1000;
          if (this.flags.swarmFastestMs < 0 || ms < this.flags.swarmFastestMs) {
            this.flags.swarmFastestMs = ms;
          }
        }
        this.swarmWindow.delete(b.groupId);
      } else {
        this.swarmWindow.set(b.groupId, entry);
      }
    }

    if (this.active?.id === 'thunder' && cfg.id === 'gold') this.flags.goldDuringThunder = true;
    if (trickshot) this.flags.trickshots += 1;
    if (longshot) this.flags.longshots += 1;

    const info: ShotHitInfo = {
      kind: cfg.id,
      precision,
      depth: b.depth,
      speed: b.speed,
      sizeScale: b.scaleV,
      timeLeft: this.timeLeft,
      eventMultiplier: this.active?.mult ?? 1,
      comboHits: this.combo.state.combo,
      swarmBonus,
      trickshot,
      longshot,
      perfect,
      streak: this.stats.hitStreakNoMiss,
      kindBonusDepthPoints: cfg.pointsPerDepth,
    };
    const bd = computeShotScore(info, cfg.baseScore);
    const gained = Math.max(1, Math.round(bd.total * this.deps.mode.scoreMult));
    this.stats.score += gained;
    bus.emit('hud:score', { score: this.stats.score, delta: gained });

    if ((this.active?.mult ?? 1) > 1) {
      this.stats.eventBonus += Math.round(bd.total * ((this.active?.mult ?? 1) - 1));
    }
    this.registerHitCommon(b);
    this.stats.bestHit = Math.max(this.stats.bestHit, bd.total);
    if (perfect) {
      this.stats.perfects += 1;
      this.stats.perfectStreak += 1;
      this.stats.bestPerfectStreak = Math.max(this.stats.bestPerfectStreak, this.stats.perfectStreak);
    } else {
      this.stats.perfectStreak = 0;
    }

    // feedback stack
    this.deps.audio.hit(perfect);
    this.deps.fx.hitStar(b.x, b.y, perfect);
    this.deps.fx.featherBurst(b.x, b.y, perfect ? 1.5 : 1);
    this.deps.fx.popup(`+${gained}`, b.x, b.y - 18, perfect ? 'gold' : 'score', perfect ? 26 : 21);
    if (perfect) this.deps.fx.popup(t('perfect'), b.x, b.y - 44, 'gold', 24);
    else if (longshot) this.deps.fx.popup(t('longshot'), b.x, b.y - 44, 'info', 20);
    else if (trickshot) this.deps.fx.popup(t('trickshot'), b.x, b.y - 44, 'info', 20);
    else if (swarmBonus) {
      this.deps.fx.popup(t('swarmbonus'), b.x, b.y - 44, 'gold', 24);
      this.stats.swarmBonusDone = true;
    }
    if (cfg.quipKeys.length && this.rng.chance(0.3)) {
      this.deps.fx.popup(t(this.rng.pick(cfg.quipKeys)), b.x, b.y - 68, 'info', 17);
    }
    this.deps.fx.shake(perfect ? BALANCE.screenshake.perfect : BALANCE.screenshake.hit);
    this.hitstop = perfect ? BALANCE.hitstop.perfectMs / 1000 : BALANCE.hitstop.normalMs / 1000;

    this.deps.flock.kill(b);
    return true;
  }

  private registerHitCommon(b: Bird): void {
    this.stats.hits += 1;
    this.stats.hitStreakNoMiss += 1;
    const react = Math.max(0, this.time - b.visibleAt);
    this.stats.reactionSum += react;
    this.stats.reactionCount += 1;
    this.stats.kindHits[b.kind] = (this.stats.kindHits[b.kind] ?? 0) + 1;
    const milestone = this.combo.hit();
    const snap = this.combo.state;
    this.stats.combo = snap.combo;
    this.stats.bestCombo = Math.max(this.stats.bestCombo, snap.combo);
    bus.emit('hud:combo', { combo: snap.combo, mult: snap.mult, milestone: milestone || snap.combo % 5 === 0 });
    if (milestone && (BALANCE.comboMilestonePopups as readonly number[]).includes(snap.combo)) {
      this.deps.fx.popup(t('streak', { n: snap.combo }), this.deps.w / 2, this.deps.h * 0.3, 'gold', 30);
      this.deps.audio.milestone(Math.min(4, Math.floor(snap.combo / 10)));
    }
    if (this.stats.hitStreakNoMiss === 5) this.deps.fx.popup(t('hitstreak5'), this.deps.w / 2, this.deps.h * 0.24, 'info', 22);
    if (this.stats.hitStreakNoMiss === 10) this.deps.fx.popup(t('hitstreak10'), this.deps.w / 2, this.deps.h * 0.24, 'info', 24);
  }

  private onMiss(x: number, y: number): void {
    this.stats.misses += 1;
    this.stats.hitStreakNoMiss = 0;
    this.stats.perfectStreak = 0;
    this.combo.miss(this.deps.mode.id === 'zen');
    this.deps.fx.popup('MISS', x, y - 14, 'bad', 16);
    if (this.boss) this.bossMisses += 1;
    this.maybeFleeNear(x, y);
    this.resolveEnvironment(x, y);
  }

  /** A missed shot startles nearby birds into evasive flights. */
  private maybeFleeNear(x: number, y: number): void {
    for (const b of this.deps.flock.list) {
      if (!b.alive || b.fleeing || b.boss || b.firstSeen === false) continue;
      if (b.distanceTo(x, y) < 150 && this.rng.chance(0.55)) {
        b.flee(this.time, x < this.deps.w / 2 ? 1 : -1);
      }
    }
  }

  // ---------- environment ----------

  private resolveEnvironment(x: number, y: number): void {
    const def = this.deps.env.hitTest(x, y, 10);
    if (!def) return;
    const now = this.time;
    this.envHitOnce = true;
    this.deps.env.knockOut(def, now, BALANCE.envRespawnSec);
    if (def.hidden && !this.stats.hiddenFound.includes(def.id)) {
      const isNew = markHiddenFound(this.deps.map.id, def.id);
      this.stats.hiddenFound.push(def.id);
      this.deps.env.markFound(def.id);
      this.deps.fx.popup(
        t('prog.secretFound', {
          n: this.stats.hiddenFound.length,
          total: hiddenObjectIds(this.deps.map.id).length,
          map: t(this.deps.map.nameKey),
        }),
        x,
        y - 30,
        'ach',
        20,
      );
      bus.emit('ui:toast', { text: t('ach.secrets1.name'), kind: 'ach' });
      if (isNew) this.deps.audio.achievement();
    }
    const pts = Math.round((def.points ?? 0) * this.deps.mode.scoreMult);
    if (pts > 0) {
      this.addScore(pts, x, y);
      this.stats.envBonus += pts;
    }
    switch (def.action) {
      case 'bonusTime': {
        const bonus = 3;
        this.stats.bonusTime += bonus;
        this.bonusActive = true;
        this.deps.fx.popup(t('target.bonus.time'), x, y - 34, 'gold', 20);
        break;
      }
      case 'multiplier':
        this.activeMultUntil = now + 6;
        this.deps.fx.popup(t('target.bonus.multi'), x, y - 34, 'gold', 20);
        break;
      case 'slowmo':
        this.slowUntil = now + 2.5;
        break;
      case 'spawnGold':
        this.spawnGuest('gold', x, y);
        this.deps.audio.coin();
        break;
      case 'spawnSwarm':
        this.spawnGuestSwarm(x, y);
        break;
      case 'scare':
        for (const b of this.deps.flock.list) {
          if (b.alive && !b.boss && b.distanceTo(x, y) < 260) b.flee(now, x < this.deps.w / 2 ? 1 : -1);
        }
        this.deps.audio.whoosh();
        break;
      case 'spores':
        this.deps.fx.spores(x, y);
        break;
      case 'splash':
        this.deps.fx.splash(x, y);
        this.deps.audio.splat();
        break;
      default:
        break;
    }
    // every prop hit also advances the chain map (no-op for props not in a chain)
    this.resolveChain(def.id, x, y);
  }

  private activeMultUntil = -1;

  private resolveChain(defId: string, x: number, y: number): void {
    const chainId = this.deps.env.hitChain(defId, this.time, BALANCE.chainWindowSec, this.deps.map.chains);
    if (!chainId) return;
    const chain = this.deps.map.chains.find((c) => c.id === chainId);
    if (!chain) return;
    const steps = this.deps.env.chainStepsOf(chainId, this.deps.map.chains);
    this.flags.chainStepsBest = Math.max(this.flags.chainStepsBest, steps);
    if (!this.stats.chainsDone.includes(chainId)) this.stats.chainsDone.push(chainId);
    const bonus = Math.round(chain.bonus * this.deps.mode.scoreMult);
    this.stats.chainBonus += bonus;
    this.addScore(bonus, x, y - 20);
    this.deps.fx.popup(t('chain', { mult: chain.bonus }), x, y - 46, 'gold', 28);
    this.deps.audio.chainRumble();
    this.deps.fx.flash(0.5);
    this.deps.fx.shake(BALANCE.screenshake.chain);
  }

  private spawnGuest(kind: TargetKind, fromX: number, fromY: number): void {
    const dir: 1 | -1 = fromX < this.deps.w / 2 ? 1 : -1;
    this.deps.flock.spawn(
      kind,
      {
        kind: 'sine',
        edge: dir === 1 ? 'left' : 'right',
        dir,
        y0: Phaser.Math.Clamp(fromY / this.deps.h, 0.1, 0.7),
        speed: TARGETS[kind].speed,
        amp: 60,
        freq: 1.2,
      },
      this.groupId++,
      this.time,
    );
  }

  private spawnGuestSwarm(x: number, y: number): void {
    const gid = this.groupId++;
    const dir: 1 | -1 = x < this.deps.w / 2 ? 1 : -1;
    const spec: PathSpec = {
      kind: 'sine',
      edge: dir === 1 ? 'left' : 'right',
      dir,
      y0: Phaser.Math.Clamp(y / this.deps.h, 0.12, 0.6),
      speed: TARGETS.swarm.speed,
      amp: 46,
      freq: 1.4,
    };
    for (let i = 0; i < 6; i++) {
      this.deps.flock.spawn('swarm', { ...spec, formationIndex: i, formationLeader: gid }, gid, this.time + i * 0.06);
    }
  }

  // ---------- weapon & director ----------

  private updateWeapon(): void {
    const events = this.weapon.update(this.timeScale > 0.9 ? this.lastDt : this.lastDt * 0.5);
    this.applyWeaponEvents(events);
  }

  private applyWeaponEvents(events: ReturnType<Weapon['tryFire']>): void {
    for (const ev of events) {
      switch (ev.type) {
        case 'reloadStart':
          this.deps.audio.reloadStart();
          break;
        case 'reloadCancel':
          this.deps.audio.reloadCancel();
          break;
        case 'reloadDone':
          this.deps.audio.reloadDone();
          this.reloadedOnce = true;
          break;
        case 'dryFire':
          this.deps.audio.dryFire();
          break;
        case 'empty':
          break;
        default:
          break;
      }
    }
    const st = this.weapon.state;
    const reserve = st.reserve;
    bus.emit('hud:ammo', { ammo: st.ammo, reserve, status: st.status });
  }

  private updateDirector(): void {
    const cutoff = this.time - 10;
    while (this.escapes.length && this.escapes[0] < cutoff) this.escapes.shift();
    const input: DirectorInput = {
      accuracy: this.stats.shots > 0 ? this.stats.hits / this.stats.shots : 0,
      shots: this.stats.shots,
      combo: this.combo.state.combo,
      bestCombo: this.stats.bestCombo,
      avgReaction: this.stats.reactionCount > 0 ? this.stats.reactionSum / this.stats.reactionCount : -1,
      escapesRecent: this.escapes.length,
      elapsed: this.time,
      duration: this.deps.mode.duration,
      zen: this.deps.mode.id === 'zen',
      fixedDifficulty: this.deps.mode.fixedDifficulty,
    };
    this.director.update(input);
  }

  private onEscape(b: Bird): void {
    if (b.cfg.hostile) return;
    this.escapes.push(this.time);
  }

  // ---------- events ----------

  private updateEvents(): void {
    // start scheduled events
    while (this.eventIdx < this.plan.events.length && this.plan.events[this.eventIdx].time <= this.time) {
      const ev = this.plan.events[this.eventIdx++];
      if (this.active && this.active.id === 'boss') continue; // one spectacle at a time
      this.startEvent(ev.eventId);
    }
    // env multiplier boost rides on the eventMultiplier slot
    if (this.time < this.activeMultUntil && this.active === null) {
      this.active = { id: 'fullMoon', nameKey: 'target.bonus.multi', endAt: this.activeMultUntil, mult: 1.25 };
    }
    if (this.active && this.time >= this.active.endAt) {
      this.endEvent(this.active);
      this.active = null;
      bus.emit('hud:event', { id: null, nameKey: null, remaining: 0 });
    }
    if (this.active) {
      bus.emit('hud:event', {
        id: this.active.id,
        nameKey: this.active.nameKey,
        remaining: Math.max(0, this.active.endAt - this.time),
      });
    }
  }

  private startEvent(id: EventId): void {
    const def = EVENTS[id];
    const endAt = def.duration < 0 ? this.time + 14 : this.time + def.duration;
    this.active = { id, nameKey: def.nameKey, endAt, mult: def.effectMultiplier };
    if (def.musicMood) this.deps.audio.setMood(def.musicMood);
    bus.emit('hud:event', { id, nameKey: def.nameKey, remaining: def.duration });
    if (id === 'boss') return; // banner handled by boss intro
    this.deps.fx.banner(t(def.nameKey), t(def.descKey), BALANCE.eventBannerSec);
    switch (id) {
      case 'fog':
        this.deps.backdrop.setFog(0.75, this.deps.w, this.deps.h);
        break;
      case 'wind':
        this.deps.env.wind = this.rng.sign() * this.rng.range(40, 75);
        break;
      case 'thunder':
        this.deps.audio.thunder();
        this.deps.fx.flash(1);
        this.deps.fx.shake(BALANCE.screenshake.thunder);
        this.spawnGuest('gold', this.rng.pick([this.deps.w * 0.2, this.deps.w * 0.8]), this.deps.h * 0.3);
        break;
      case 'goldSwarm':
        for (let i = 0; i < 3; i++) this.spawnGuest('gold', this.rng.range(0.1, 0.9) * this.deps.w, this.rng.range(0.15, 0.55) * this.deps.h);
        this.deps.audio.coin();
        break;
      case 'fullMoon':
        this.deps.fx.flash(0.35);
        break;
      case 'rush':
        this.rushTimer = this.time + def.duration;
        break;
      case 'balloons':
        for (let i = 0; i < 3; i++) {
          this.deps.flock.spawn(
            'balloon',
            { kind: 'line', edge: 'bottom', dir: 1, y0: this.rng.range(0.1, 0.85), speed: TARGETS.balloon.speed },
            this.groupId++,
            this.time + i * 0.5,
          );
        }
        break;
      case 'rain':
        this.deps.backdrop.setRain(true, this.deps.w);
        break;
      case 'frogs':
        this.deps.audio.croak();
        for (let i = 0; i < 2; i++) this.deps.fx.popup('KROAK!', this.rng.range(0.2, 0.8) * this.deps.w, this.deps.h * 0.86, 'info', 18);
        break;
      case 'fireflies':
        this.deps.fx.setFireflies(true);
        break;
      case 'timeRift':
        this.slowUntil = endAt;
        break;
      case 'featherstorm':
        this.deps.fx.setFeatherStorm(true);
        this.spawnGuestSwarm(this.deps.w / 2, this.deps.h * 0.3);
        break;
      default:
        break;
    }
  }

  private endEvent(a: ActiveEvent): void {
    switch (a.id) {
      case 'fog':
        this.deps.backdrop.setFog(0, this.deps.w, this.deps.h);
        break;
      case 'wind':
        this.deps.env.wind = 0;
        break;
      case 'rain':
        this.deps.backdrop.setRain(false, this.deps.w);
        break;
      case 'fireflies':
        this.deps.fx.setFireflies(false);
        break;
      case 'featherstorm':
        this.deps.fx.setFeatherStorm(false);
        break;
      case 'timeRift':
        this.slowUntil = -1;
        break;
      default:
        break;
    }
    this.deps.audio.setMood(this.deps.map.palette.night ? 'calm' : 'normal');
  }

  // ---------- boss ----------

  private onBossSpawn(b: Bird): void {
    this.boss = b;
    this.bossMisses = 0;
    this.deps.audio.bossRoar();
    this.deps.fx.banner(t(`boss.intro.${b.kind === 'bossArmored' ? 'armored' : b.kind === 'bossAcrobat' ? 'acrobat' : 'night'}`), t(`target.${b.kind}`), BALANCE.bossIntroSec - 0.2);
    bus.emit('hud:boss', { nameKey: `target.${b.kind}`, hp: b.hp, maxHp: b.cfg.health, label: 'intro' });
  }

  private onBossHit(instant = false): void {
    const b = this.boss;
    if (!b || !b.alive) return;
    const killed = instant || b.hurt(1);
    this.registerHitCommon(b);
    this.deps.audio.hit(false);
    this.deps.fx.hitStar(b.x, b.y, false);
    this.deps.fx.shake(BALANCE.screenshake.bossHit);
    this.hitstop = BALANCE.hitstop.bossMs / 1000;
    const hp = Math.max(0, b.hp);
    bus.emit('hud:boss', { nameKey: `target.${b.kind}`, hp, maxHp: b.cfg.health, label: 'fight' });
    if (!killed) return;
    const info: ShotHitInfo = {
      kind: b.kind,
      precision: 0.25,
      depth: b.depth,
      speed: b.speed,
      sizeScale: b.scaleV,
      timeLeft: this.timeLeft,
      eventMultiplier: EVENTS.boss.effectMultiplier,
      comboHits: this.combo.state.combo,
      swarmBonus: false,
      trickshot: b.fleeing,
      longshot: false,
      perfect: true,
      streak: this.stats.hitStreakNoMiss,
      kindBonusDepthPoints: b.cfg.pointsPerDepth,
    };
    const bd = computeShotScore(info, b.cfg.baseScore);
    const gained = Math.max(1, Math.round(bd.total * this.deps.mode.scoreMult));
    this.stats.score += gained;
    this.stats.bossKills += 1;
    if (this.bossMisses === 0) this.flags.bossClean = true;
    bus.emit('hud:score', { score: this.stats.score, delta: gained });
    this.deps.fx.popup(`+${gained}`, b.x, b.y - 30, 'gold', 32);
    this.deps.fx.featherBurst(b.x, b.y, 3);
    this.deps.fx.flash(0.7);
    this.deps.fx.shake(6);
    bus.emit('hud:boss', { nameKey: null, hp: 0, maxHp: 0, label: 'dead' });
    this.deps.flock.kill(b);
    this.boss = null;
  }

  // ---------- tutorial ----------

  private startTutorial(): void {
    this.tutorialStep = 0;
    this.deps.fx.banner(t('tutorial.welcome'), undefined, 3);
  }

  private updateTutorial(dt: number): void {
    if (!this.deps.tutorial || this.tutorialStep < 0 || this.tutorialStep >= TUTORIAL_STEPS.length) return;
    this.tutorialTimer += dt;
    const step = TUTORIAL_STEPS[this.tutorialStep];
    if (step.done(this) || this.tutorialTimer > 10) {
      this.tutorialTimer = 0;
      this.tutorialStep += 1;
      const next = TUTORIAL_STEPS[this.tutorialStep];
      if (next) {
        this.deps.fx.banner(t(next.key), undefined, 2.6);
      } else {
        this.deps.fx.banner(t('tutorial.done'), undefined, 3);
        this.tutorialStep = -1;
        // tutorial finishes after a short victory lap
        this.deps.scene.time.delayedCall(2600, () => this.finish());
      }
    }
  }

  // ---------- finish ----------

  private finish(): void {
    if (this.over) return;
    this.over = true;
    const s = this.stats;
    const acc = s.shots > 0 ? s.hits / s.shots : 0;
    const dur = Math.max(1, this.time);
    const parSeconds = this.deps.mode.duration >= 0 ? this.deps.mode.duration : dur;
    const par = parScore(parSeconds, this.deps.mode.scoreMult);
    const rank = rankFor(s.score, par);
    const xp = runXp(s.score, acc, dur);
    const feathers = runFeathers(s.score, s.hits);
    s.xps = xp;
    const before = levelFromXp(loadSave().progress.xp);

    const dailyKey = this.deps.mode.id === 'daily' ? todayKey() : undefined;
    const result: RunResult = {
      mode: this.deps.mode.id,
      map: this.deps.map.id,
      seed: this.deps.seed,
      stats: s,
      rank,
      score: s.score,
      xp,
      isBest: false,
      previousBest: 0,
      newAchievements: [],
      leveledUp: false,
      newLevel: before.level,
      currencyEarned: feathers,
      dailyKey,
    };

    commitRun(result);
    mutate((save) => {
      const key = `${result.mode}|${result.map}`;
      const entry = save.highscores[key];
      result.previousBest = entry?.score ?? 0;
      result.isBest = entry?.score === s.score && s.score > 0;
      if (dailyKey) result.dailyBest = save.dailyRecords[dailyKey]?.score;
      result.newAchievements = evaluateAfterRun(result, this.flags, save);
      const after = levelFromXp(save.progress.xp);
      result.leveledUp = after.level > before.level;
      result.newLevel = after.level;
    });

    if (result.newAchievements.length) {
      this.deps.audio.achievement();
      bus.emit('ui:toast', { text: t('result.ach'), kind: 'ach' });
    }
    bus.emit('run:end', result);
    showUi('results', result);
  }

  private addScore(amount: number, x: number, y: number): void {
    this.stats.score += amount;
    bus.emit('hud:score', { score: this.stats.score, delta: amount });
    this.deps.fx.popup(`+${amount}`, x, y, 'gold', 22);
  }

  private push(d: () => void): void {
    this.disposers.push(d);
  }

  destroy(): void {
    for (const d of this.disposers) d();
    this.disposers = [];
    this.deps.audio.stopAmbient();
  }
}

/** kinds unlocked at a phase, minus map-exclusives (mirror of SpawnDirector gate) */
function ambientKinds(phase: number, exclusive: TargetKind[]): TargetKind[] {
  const all: TargetKind[] = ['flatterer', 'swift', 'corkscrew', 'armored', 'gold', 'mist', 'decoy', 'swarm', 'glider', 'storm', 'balloon'];
  return all.filter((k) => TARGETS[k].minPhase <= phase && !exclusive.includes(k));
}
