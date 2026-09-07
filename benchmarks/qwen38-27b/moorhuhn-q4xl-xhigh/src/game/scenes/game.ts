/**
 * Game-Szene: führt eine komplette Runde — Countdown, Phasen, Spawn-Regie,
 * Waffe, Events, Kettenreaktionen, Mini-Bosse, HUD und Rundenabrechnung.
 * Alles deterministische Kernlogik kommt aus src/core (testbar, Phaser-frei).
 */
import Phaser from 'phaser';
import {
  ACHIEVEMENTS,
  CHALLENGES,
  CHAINS,
  MAPS,
  MODES,
  PHASE_SPAWN_MULT,
  ROUND_PHASES,
  TARGETS,
  type EnvironmentObject,
  type RoundPhaseDef,
} from '../../config/gameConfig';
import { Rng, dayKey } from '../../core/rng';
import { Weapon } from '../../core/weapon';
import { ComboTracker } from '../../core/combo';
import { DifficultyDirector } from '../../core/difficulty';
import {
  accuracyOf,
  avgReaction,
  computeRank,
  computeScore,
  formatScore,
  isPerfectHit,
  rankAtLeast,
  DEFAULT_SCORE_CONFIG,
} from '../../core/scoring';
import type { MapId, RankResult, RoundStats, TargetId } from '../../core/types';
import { checkAchievements, feathersForRound, xpForRound, type RoundContext } from '../../core/achievements';
import { applyRoundStats, bumpChallenge, grantXp, upsertHighscore } from '../../core/save';
import { t, tRaw } from '../../core/i18n';
import { audio, events, getSettings, loadSave, persistSave, bootOnce, audioVolumes } from '../state';
import { TargetEntity } from '../target';
import { createPath, type PathInstance } from '../paths';
import { ParticleManager } from '../particles';
import { EventSystem } from '../eventSystem';
import { Spawner } from '../spawner';
import { ChainSystem } from '../chains';
import type { RoundConfig, RoundResultData } from '../roundTypes';

const W = 1920;
const H = 1080;

export class GameScene extends Phaser.Scene {
  private cfg!: RoundConfig;
  private rng!: Rng;
  private nowMs = 0;

  /** Runden-Phase. */
  private phase: 'countdown' | 'playing' | 'ended' = 'countdown';
  private countdownUntil = 0;
  private roundStartMs = 0;
  private bonusMs = 0;
  private ended = false;

  private score = 0;
  private stats!: RoundStats;
  private reactionTimes: number[] = [];
  private recentKills: number[] = [];
  private swarmWindows = new Map<number, number[]>();
  /** Anzahl abgeschlossener Schwarmboni in dieser Runde. */
  private swarmBonusCount = 0;
  private chainMultUntil = 0;
  private chainMultValue = 1;
  private slowMoUntil = 0;
  private slowMoFactor = 1;
  private hitstopUntil = 0;
  /** Virtuelle Spielzeit: läuft mit timeScale (Slow-Mo/Hitstop), fließt für Flugbahnen. */
  private virtualNowMs = 0;
  private lastPhaseId = '';

  /** Bosse. */
  private boss: TargetEntity | null = null;
  private bossMisses = 0;
  private bossClean = false;

  /** Systeme. */
  private weapon!: Weapon;
  private combo!: ComboTracker;
  private director!: DifficultyDirector;
  private eventSystem!: EventSystem;
  private chains!: ChainSystem;
  private spawner!: Spawner;
  private particles!: ParticleManager;

  /** Welt. */
  private targets: TargetEntity[] = [];
  private envObjects: { obj: EnvironmentObject; sprite: Phaser.GameObjects.Image; hitAt: number }[] = [];
  private fogRect: Phaser.GameObjects.Rectangle | null = null;
  private parallax: Phaser.GameObjects.Image[] = [];
  private crosshair!: Phaser.GameObjects.Graphics;
  private debugText: Phaser.GameObjects.Text | null = null;
  private debugOn = false;

  /** Tutorial. */
  private tutorialStep = 0;

  /** UI. */
  private hud: Record<string, HTMLElement | null> = {};
  private paused = false;

  constructor() {
    super('game');
  }

  init(data: { cfg: RoundConfig }): void {
    this.cfg = data.cfg;
  }

  create(): void {
    const mode = this.cfg.mode;
    const mapId = this.cfg.mapId;
    const modeCfg = MODES[mode];

    this.rng = new Rng(this.cfg.seed);
    this.stats = this.freshStats();
    this.score = 0;
    this.phase = 'countdown';
    this.ended = false;

    // ── Systeme ────────────────────────────────────────────────
    const weaponCfg = {
      magazineSize: 6,
      reloadMs: modeCfg.reloadMs,
      reserve: modeCfg.ammo > 0 ? modeCfg.ammo : 0,
      autoReload: modeCfg.autoReload,
    };
    this.weapon = new Weapon(weaponCfg, {
      onShot: () => void 0,
      onEmptyClick: () => audio.emptyClick(),
      onReloadStart: () => audio.reload(),
      onReloadEnd: () => void 0,
      onStateChange: () => this.updateHudAmmo(),
    });
    this.combo = new ComboTracker({
      windowMs: modeCfg.comboWindowMs,
      zen: modeCfg.zen,
    });
    this.director = new DifficultyDirector(modeCfg.startFactor);
    this.eventSystem = new EventSystem(mapId, mode, this.rng.fork('events'), events);
    this.spawner = new Spawner(mapId, mode, this.rng.fork('spawn'));
    this.particles = new ParticleManager(this, this.add.container());
    const s = getSettings();
    this.particles.setDensity(s.particleDensity);
    this.particles.setReducedMotion(s.reducedMotion);

    this.chains = new ChainSystem(
      CHAINS.filter((c) => c.map === null || c.map === mapId),
      {
        onStation: (stationId, stage, chainId) => this.onChainStation(stationId, stage, chainId),
        onFinale: (chain) => this.onChainFinale(chain.def),
      },
    );

    // Combo-Callbacks
    this.combo.onMilestone = (n) => {
      audio.comboMilestone(n);
      this.toast(t('combo.milestone', { n: String(n) }), 'gold');
      if (this.cfg.mode === 'tutorial') this.advanceTutorial('combo');
    };
    this.combo.onWindowExpired = () => {
      events.emit('combo-lost', { remaining: 0 });
    };
    this.combo.onMiss = () => {
      this.toast(t('hud.empty'), 'dim');
    };

    // ── Welt aufbauen ──────────────────────────────────────────
    this.buildWorld(mapId);

    // ── Input ──────────────────────────────────────────────────
    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.shoot(p));
    this.input.keyboard?.on('keydown-' + s.reloadKey, () => {
      bootOnce();
      const ok = this.weapon.startReload(this.nowMs, false);
      if (ok) {
        this.toast(t('hud.reload'), 'dim');
        if (this.cfg.mode === 'tutorial') this.advanceTutorial('reload');
      }
    });
    this.input.keyboard?.on(`keydown-${s.pauseKey}`, () => this.togglePause());
    // Dev-only: F3 schaltet Debug-Overlay (Seed, Director-Reason, Trefferboxen) ein/aus
    this.input.keyboard?.on('keydown-F3', () => this.toggleDebug());

    // Event-Feedback
    events.on('event-started', ({ eventId }) => this.onEventStarted(eventId));
    events.on('bonus-time', ({ seconds }) => {
      this.bonusMs += seconds * 1000;
      this.toast(t('bonusTime', { s: String(seconds) }), 'green');
    });
    events.on('time-slow', ({ factor }) => {
      this.slowMoUntil = this.nowMs + 4000;
      this.slowMoFactor = factor;
      this.toast(t('slowMo'), 'blue');
    });

    // ── Audio ──────────────────────────────────────────────────
    bootOnce();
    audio.setVolumes(audioVolumes());
    audio.startMusic(modeCfg.zen || mode === 'zen');
    audio.setAmbience(this.ambienceFor(mapId));

    // ── HUD ────────────────────────────────────────────────────
    this.buildHud();
    this.updateHud();

    // ── Countdown ──────────────────────────────────────────────
    this.countdownUntil = this.time.now + 3200;
    this.nowMs = this.time.now;
    this.virtualNowMs = 0;
  }

  private freshStats(): RoundStats {
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
      durationMs: 0,
    };
  }

  // ── Welt ─────────────────────────────────────────────────────

  private buildWorld(mapId: MapId): void {
    const map = MAPS[mapId];
    const sky = this.add.image(0, 0, `sky_${mapId}`).setOrigin(0, 0).setDisplaySize(W, H).setDepth(-100);
    void sky;

    const layers = this.parallaxLayersFor(mapId);
    for (const [key, y, scale, speed] of layers) {
      const img = this.add.image(W / 2, y, key).setOrigin(0.5, 1).setDisplaySize(W * scale, 400 * scale).setDepth(-50 + speed * 10);
      img.setData('speed', speed);
      this.parallax.push(img);
    }

    // Umgebungsobjekte
    for (const obj of map.objects) {
      const sprite = this.add
        .image(obj.pos[0] * W, obj.pos[1] * H, obj.sprite)
        .setScale(obj.scale)
        .setDepth(10)
        .setAlpha(obj.hidden ? 0.55 : 1);
      this.envObjects.push({ obj, sprite, hitAt: 0 });
    }

    // Nebel
    this.fogRect = this.add.rectangle(W / 2, H / 2, W, H, map.fogColor, map.fogAmount).setDepth(60);

    // Wetter
    if (map.weather === 'night') {
      this.particles.fireflies(W, H);
    }

    // Fadenkreuz
    this.crosshair = this.add.graphics().setDepth(500);
  }

  private parallaxLayersFor(mapId: MapId): [string, number, number, number][] {
    if (mapId === 'nebelmoor') {
      return [
        ['layer_nebelmoor_far', H * 0.72, 1.15, 0.002],
        ['layer_nebelmoor_trees', H * 0.8, 1.1, 0.005],
        ['layer_nebelmoor_reeds', H * 0.95, 1.05, 0.012],
      ];
    }
    if (mapId === 'sturmklippen') {
      return [
        ['layer_sturmklippen_far', H * 0.7, 1.15, 0.004],
        ['layer_sturmklippen_mid', H * 0.8, 1.1, 0.008],
        ['layer_sturmklippen_reeds', H * 0.95, 1.05, 0.014],
      ];
    }
    return [
      ['layer_mondbruch_stars', H * 0.55, 1.2, 0.001],
      ['layer_mondbruch_moon', H * 0.5, 1.2, 0.0015],
      ['layer_mondbruch_far', H * 0.78, 1.12, 0.004],
      ['layer_mondbruch_reeds', H * 0.95, 1.05, 0.01],
    ];
  }

  private ambienceFor(mapId: MapId): 'moor' | 'coast' | 'night' {
    if (mapId === 'sturmklippen') return 'coast';
    if (mapId === 'mondbruch') return 'night';
    return 'moor';
  }

  // ── Schießen ─────────────────────────────────────────────────

  private shoot(pointer: Phaser.Input.Pointer): void {
    if (this.phase !== 'playing' || this.paused || this.ended) return;
    bootOnce();
    const x = pointer.x;
    const y = pointer.y;
    const now = this.nowMs;

    const fired = this.weapon.fire(now);
    if (!fired) {
      audio.emptyClick();
      if (!MODES[this.cfg.mode].autoReload) {
        this.toast(t('hud.empty'), 'dim');
      }
      return;
    }
    audio.shot();
    this.particles.muzzle(x, y);
    events.emit('shot-fired', { x, y });
    this.stats.shots += 1;

    // 1) Vornehmstes Ziel treffen
    const sorted = [...this.targets].sort(
      (a, b) => (20 + b.flightDepth * 40) - (20 + a.flightDepth * 40),
    );
    for (const target of sorted) {
      if (!target.alive) continue;
      if (target.containsPoint(x, y)) {
        const precision = target.precisionAt(x, y);
        const isKill = target.damage(1);
        this.processHit(target, x, y, precision, isKill);
        return;
      }
    }

    // 2) Umgebungsobjekte
    for (const eo of this.envObjects) {
      const sprite = eo.sprite;
      const rw = Math.max(sprite.displayWidth, sprite.displayHeight) * 0.6;
      if (Math.hypot(x - sprite.x, y - sprite.y) <= rw) {
        this.hitEnvironment(eo, now);
        return;
      }
    }

    // 3) Fehlschuss
    this.registerMiss(x, y, now);
  }

  private registerMiss(x: number, y: number, now: number): void {
    this.stats.misses += 1;
    this.stats.noMissStreak = 0;
    if (this.boss) this.bossMisses += 1; // „Boss ohne Fehlschuss"-Bedingung
    this.combo.registerMiss(now);
    audio.miss();
    // Fast verfehlt? Das Ziel flüchtet kurz schneller.
    for (const t0 of this.targets) {
      if (!t0.alive || t0.fleeing || t0.isBoss) continue;
      const r = Math.max(t0.width, t0.height) * 0.5 * t0.cfg.hitbox * 1.35 * 1.9;
      if (Math.hypot(x - t0.x, y - t0.y) <= r) t0.flee(this.virtualNowMs);
    }
    // Fast verfehlt? Das Ziel flüchtet kurz schneller.
    for (const t0 of this.targets) {
      if (!t0.alive || t0.fleeing || t0.isBoss) continue;
      const r = Math.max(t0.width, t0.height) * 0.5 * t0.cfg.hitbox * 1.35 * 1.9;
      if (Math.hypot(x - t0.x, y - t0.y) <= r) t0.flee(now);
    }
    events.emit('shot-miss', { x, y });
    const g = this.add.graphics().setDepth(400);
    g.lineStyle(3, 0xff5252, 0.9);
    g.lineBetween(x - 8, y - 8, x + 8, y + 8);
    g.lineBetween(x + 8, y - 8, x - 8, y + 8);
    this.tweens.add({
      targets: g,
      alpha: 0,
      duration: 300,
      onComplete: () => g.destroy(),
    });
  }

  private processHit(
    target: TargetEntity,
    x: number,
    y: number,
    precision: number,
    isKill: boolean,
  ): void {
    const now = this.nowMs;
    const cfg = target.cfg;
    const perfect = isPerfectHit(precision);

    this.reactionTimes.push(Math.max(0, this.virtualNowMs - target.spawnAt));
    this.stats.noMissStreak += 1;
    this.combo.registerHit(now);

    // Schwarm-Verfolgung
    let swarmBonus = false;
    if (isKill && target.groupId != null) {
      const arr = this.swarmWindows.get(target.groupId) ?? [];
      arr.push(now);
      this.swarmWindows.set(target.groupId, arr);
      const groupSize = cfg.swarmGroupSize ?? 3;
      if (arr.length >= groupSize) {
        const span = arr[arr.length - 1] - arr[0];
        if (span <= DEFAULT_SCORE_CONFIG.swarmWindowMs) {
          swarmBonus = true;
          this.swarmBonusCount += 1;
          this.swarmWindows.delete(target.groupId);
        }
      }
    }

    // Multikill zählen
    let multikillCount = 0;
    if (isKill) {
      this.recentKills.push(now);
      this.recentKills = this.recentKills.filter((t0) => now - t0 <= DEFAULT_SCORE_CONFIG.multikillWindowMs);
      multikillCount = this.recentKills.length;
    }

    const recordHit =
      isKill && this.score < loadSave().progress.bestScore && this.score + 500 >= loadSave().progress.bestScore;

    const sizeNorm = Phaser.Math.Clamp(cfg.size[0] / 55, 0.6, 1.4);
    const speedNorm = Phaser.Math.Clamp((target.path.speed - 100) / 400, 0, 1);
    const eventMult = this.eventSystem.scoreMult * (now < this.chainMultUntil ? this.chainMultValue : 1);

    const breakdown = computeScore({
      base: cfg.baseScore,
      speedNorm,
      depth: target.flightDepth,
      sizeNorm,
      precision,
      combo: this.combo.combo,
      streak: this.combo.streak,
      eventMultiplier: eventMult,
      timeFactor: 1,
      multikillCount,
      swarmBonus,
      trickshot: target.trick,
      recordHit,
      config: DEFAULT_SCORE_CONFIG,
    });
    const total = breakdown.total;
    this.score += total;
    events.emit('score-changed', { score: this.score });

    // Feedback
    this.particles.hitFlash(x, y, perfect ? 'gold' : 'white');
    audio.hit(perfect, this.combo.combo);
    if (multikillCount >= 2) {
      audio.multikill(multikillCount);
      this.toast(t('multikill', { n: String(multikillCount) }), 'gold');
    }
    if (swarmBonus) {
      this.toast(t('swarm'), 'gold');
      this.stats.eventBonuses += breakdown.swarmBonus;
    }
    if (breakdown.isPerfect) {
      this.toast(t('perfect'), 'gold');
    }
    if (target.flightDepth <= DEFAULT_SCORE_CONFIG.longshotMinDepth && isKill) {
      this.toast(t('longshot'), 'blue');
    }

    if (target.isBoss) {
      events.emit('boss-damage', { hp: target.hp, maxHp: cfg.hp });
      this.updateBossBar();
      this.directorKick();
    }

    if (isKill) {
      this.stats.hits += 1;
      this.stats.targetsHit[cfg.id] = (this.stats.targetsHit[cfg.id] ?? 0) + 1;
      if (perfect) this.stats.perfectHits += 1;
      if (total > this.stats.bestHit) {
        this.stats.bestHit = total;
        this.stats.bestHitTarget = cfg.id;
      }
      if (this.combo.maxCombo > this.stats.maxCombo) this.stats.maxCombo = this.combo.maxCombo;

      this.particles.feathers(x, y, target.featherColorName, cfg.id === 'goldschnabel' ? 18 : 10);

      // Game-Feel
      const reduced = getSettings().reducedMotion;
      if (!reduced) {
        this.hitstopUntil = now + (perfect ? 55 : 30);
        this.cameras.main.shake(90, 0.004 * getSettings().screenShake);
      }
      if (cfg.rare) audio.rareHit();

      if (target.isBoss) {
        this.onBossDefeated(target);
      } else if (cfg.id === 'taeuscher') {
        audio.deceiverBoom();
        this.particles.smoke(x, y, 12);
      }

      events.emit('target-killed', { targetId: cfg.id, x, y, score: total });
      events.emit('shot-hit', {
        targetId: cfg.id,
        x,
        y,
        perfect,
        score: total,
        combo: this.combo.combo,
      });
      if (this.cfg.mode === 'tutorial') this.advanceTutorial(perfect ? 'perfect' : 'hit');
    }
  }

  private onBossDefeated(target: TargetEntity): void {
    const cfg = target.cfg;
    const reward = cfg.baseScore;
    this.score += reward;
    this.stats.bossKills += 1;
    this.stats.eventBonuses += reward;
    audio.bossDefeated();
    this.particles.confetti(target.x, target.y, 60);
    this.cameras.main.shake(400, 0.01 * getSettings().screenShake);
    this.hitstopUntil = this.nowMs + 140;
    this.toast(t('boss.defeated'), 'gold');
    events.emit('boss-defeated', { bossId: cfg.id, reward });
    this.boss = null;
    this.updateBossBar();
    if (this.bossMisses === 0) this.bossClean = true;
  }

  private directorKick(): void {
    // Boss-Treffer zählt für den Director als „gut".
    this.director.update(this.nowMs, this.directorInput());
  }

  // ── Umgebung & Ketten ────────────────────────────────────────

  private hitEnvironment(eo: { obj: EnvironmentObject; sprite: Phaser.GameObjects.Image; hitAt: number }, now: number): void {
    const obj = eo.obj;
    if (now - eo.hitAt < 1200) return; // kurze Abklingzeit
    eo.hitAt = now;

    const base = obj.score * this.eventSystem.scoreMult;
    this.score += Math.round(base);
    events.emit('score-changed', { score: this.score });

    // Sound je Objekttyp
    if (obj.sprite.includes('bell')) audio.bell();
    else if (obj.sprite.includes('water')) audio.splash();
    else if (obj.sprite.includes('fungus')) audio.spore();
    else if (obj.sprite.includes('ghost')) audio.whoosh();
    else audio.chainClank(0);

    // Effekt-Objekte
    if (obj.mult) {
      this.chainMultUntil = now + 10000;
      this.chainMultValue = obj.mult;
      this.toast(t('eventMult', { m: String(obj.mult) }), 'gold');
    }
    if (obj.bonusTime) {
      events.emit('bonus-time', { seconds: obj.bonusTime });
    }
    if (obj.slowMo) {
      events.emit('time-slow', { factor: 0.55, durationMs: 4000 });
    }
    if (obj.spawnsTarget) {
      this.spawnSingle(obj.spawnsTarget, eo.sprite.x, eo.sprite.y, true);
    }
    if (obj.hidden) {
      const save = loadSave();
      const found = save.progress.hiddenFound[this.cfg.mapId] ?? [];
      if (!found.includes(obj.id)) {
        found.push(obj.id);
        save.progress.hiddenFound[this.cfg.mapId] = found;
        persistSave();
        this.toast('🔍 ' + t('result.targets'), 'gold');
      }
    }

    // Kette starten oder fortsetzen
    if (!this.chains.tryStart(obj.id, now)) {
      this.chains.feedStation(obj.id, now);
    }
  }

  private onChainStation(stationId: string, stage: number, _chainId: string): void {
    const eo = this.envObjects.find((e) => e.obj.id === stationId);
    if (eo) {
      const { sprite } = eo;
      audio.chainClank(stage);
      this.particles.sparkle(sprite.x, sprite.y);
      this.tweens.add({ targets: sprite, angle: 12, duration: 90, yoyo: true });
    }
    // Stationen-Punkte
    const chainDef = this.chains.current?.def;
    const mult = this.eventSystem.scoreMult;
    const pts = Math.round((chainDef?.stationScore ?? 100) * mult);
    this.score += pts;
    events.emit('score-changed', { score: this.score });
    this.stats.eventBonuses += pts;
  }

  private onChainFinale(def: (typeof CHAINS)[number]): void {
    this.stats.chainReactions += 1;
    this.toast(t('chain'), 'gold');
    if (def.finale === 'time' && def.bonusTime) {
      events.emit('bonus-time', { seconds: def.bonusTime });
    }
    if (def.finale === 'mult' && def.mult) {
      this.chainMultUntil = this.nowMs + 10000;
      this.chainMultValue = def.mult;
    }
    if (def.finale === 'spawn' && def.spawnTarget) {
      this.spawnSingle(def.spawnTarget, W * 0.5, H * 0.4, true);
    }
    events.emit('chain-triggered', { chainId: def.id, stations: def.stations.length });
  }

  // ── Spawning ─────────────────────────────────────────────────

  private spawnTargets(count: number, depth: number, groupId: number | null, targetId: TargetId, trick = false): void {
    for (let i = 0; i < count; i++) {
      this.spawnSingle(targetId, 0, 0, trick, depth, groupId);
    }
  }

  private spawnSingle(
    targetId: TargetId,
    fx: number,
    fy: number,
    trick: boolean,
    depthOverride?: number,
    groupId: number | null = null,
  ): void {
    const cfg = TARGETS[targetId];
    const depth = depthOverride ?? cfg.flight.depth[0];
    const speed = this.rng.range(cfg.flight.speed[0], cfg.flight.speed[1]) * this.director.state.factor;
    const kind = this.rng.pick(cfg.flight.paths);
    const path = createPath(this.rng, kind, W, H, depth, speed);
    const target = new TargetEntity(this, cfg, path.start.x, path.start.y, depth, path, this.rng, W, H);
    target.spawnAt = this.virtualNowMs;
        target.trick = trick;
    if (groupId != null) target.groupId = groupId;
    target.setAlpha(1);
    // Trickshots (via Umgebung/Events) fliegen von der Quelle
    if (trick && (fx > 0 || fy > 0)) {
      path.start = { x: fx, y: fy };
      target.x = fx;
      target.y = fy;
    }
    this.targets.push(target);
  }

  private spawnBoss(bossId: TargetId): void {
    const cfg = TARGETS[bossId];
    const path: PathInstance = createPath(this.rng, 'hover', W, H, 1.05, 70);
    const boss = new TargetEntity(this, cfg, path.start.x, path.start.y, 1.05, path, this.rng, W, H);
        boss.spawnAt = this.virtualNowMs;
    boss.setScale(1.6);
    this.targets.push(boss);
    this.boss = boss;
    this.bossMisses = 0;
    audio.bossRoar(true);
    this.cameras.main.shake(500, 0.008 * getSettings().screenShake);
    this.toast(t('boss.intro'), 'red');
    events.emit('boss-appeared', { bossId, name: tRaw(`target.${bossId}`), maxHp: cfg.hp });
    this.updateBossBar();
  }

  // ── Update-Loop ──────────────────────────────────────────────

  override update(_time: number, delta: number): void {
    this.nowMs = this.time.now;
    const now = this.nowMs;

    // Parallax mit Wind
    const wind = this.eventSystem.wind;
    for (const layer of this.parallax) {
      const speed = layer.getData('speed') as number;
      layer.x -= (delta * speed * (1 + wind / 60)) % (W + 80);
      if (layer.x < -W) layer.x += W * 2;
    }

    if (
        this.phase === 'countdown') {
      const left = Math.ceil((this.countdownUntil - now) / 1000);
      const el = this.hud['countdown'];
      if (el) el.textContent = left > 0 ? String(left) : t('countdown');
      if (now >= this.countdownUntil) {
        this.phase = 'playing';
        this.virtualNowMs = 0;
        this.roundStartMs = now;
        this.combo.reset(now);
        this.spawner.begin(now);
        const el2 = this.hud['countdown'];
        if (el2) el2.classList.add('hidden');
      }
      this.drawCrosshair();
      return;
    }
    if (this.phase !== 'playing' || this.paused) {
      this.drawCrosshair();
      return;
    }

    // ── Zeitsteuerung: Slow-Mo & Hitstop ──────────────────────
    const reduced = getSettings().reducedMotion;
    let timeScale = 1;
    if (now < this.slowMoUntil && !reduced) timeScale = this.slowMoFactor;
    const evScale = this.eventSystem.timeScale;
    timeScale = Math.min(timeScale, evScale);
    if (now < this.hitstopUntil && !reduced) timeScale = 0;
    const dt = delta * timeScale;
    // Virtuelle Zeit für Flugbahnen: friert bei Hitstop, verlangsamt bei Slow-Mo
    this.virtualNowMs += dt;
    const vnow = this.virtualNowMs;

    // ── Rundenende ─────────────────────────────────────────────
    const modeCfg = MODES[this.cfg.mode];
    const durationMs = modeCfg.duration > 0 ? modeCfg.duration * 1000 : Infinity;
    const elapsed = now - this.roundStartMs;
    if (elapsed + this.bonusMs >= durationMs) {
      this.endRound(elapsed);
      return;
    }
    // Precision: Munition komplett aufgebraucht
    const snap = this.weapon.snapshot;
    if (modeCfg.ammo > 0 && snap.current === 0 && snap.totalLeft <= 0 && snap.state !== 'reloading' && this.targets.length === 0) {
      this.endRound(elapsed);
      return;
    }

    const progress = durationMs === Infinity ? Math.min(1, elapsed / 240000) : (elapsed + this.bonusMs) / durationMs;

    // ── Phasen ─────────────────────────────────────────────────
    let phaseId: RoundPhaseDef['id'] = 'calm';
    for (const p of ROUND_PHASES) {
      if (progress >= p.from) phaseId = p.id;
    }
    if (phaseId !== this.lastPhaseId) {
      this.lastPhaseId = phaseId;
      const idx = ROUND_PHASES.findIndex((p) => p.id === phaseId);
      events.emit('round-phase', { index: idx, name: phaseId });
      if (this.cfg.mode !== 'tutorial') this.toast(tRaw(`phase.${phaseId}`), 'dim');
    }
    const phaseMult = PHASE_SPAWN_MULT[phaseId];

    // ── Systeme ticken ─────────────────────────────────────────
    this.eventSystem.tick(now, progress);
    const bossId = this.eventSystem.consumeBoss();
    if (bossId && !this.boss) this.spawnBoss(bossId);

    this.director.update(now, this.directorInput());

    // Spawner
    const activeCounts: Partial<Record<TargetId, number>> = {};
    for (const t0 of this.targets) {
      activeCounts[t0.cfg.id] = (activeCounts[t0.cfg.id] ?? 0) + 1;
    }
    const req = this.spawner.request(
      now,
      phaseMult,
      this.director.state.factor,
      activeCounts,
      this.eventSystem.popExtraSpawn(),
      this.eventSystem.activeEvent?.cfg.id ?? null,
      progress,
    );
    if (req) {
      const depth = req.depth * (0.9 + 0.2 * this.director.state.factor);
      this.spawnTargets(req.count, depth, req.groupId, req.targetId);
    }

    // Ketten
    const chainResult = this.chains.tick(now);
    if (chainResult === 'station') {
      // automatische Stationen (Objekt reagiert selbst)
    } else if (chainResult === 'finale') {
      // finale oben in onChainFinale
    }

    // ── Ziele aktualisieren ────────────────────────────────────
    const windX = (this.eventSystem.wind - MAPS[this.cfg.mapId].baseWind) * 0.4;
    for (let i = this.targets.length - 1; i >= 0; i--) {
      const target = this.targets[i];
      target.setWind(windX);
      const res = target.update(vnow, dt);
      if (res.done) {
        this.targets.splice(i, 1);
        if (target.isBoss) this.boss = null;
        if (res.escaped) target.destroy();
      }
    }

    // Combo-Timeout
    if (this.combo.tick(now)) {
      events.emit('combo-lost', { remaining: 0 });
    }

    // Waffe (Nachladen)
    this.weapon.update(now);

    // Nebel-Atmen
    if (this.fogRect) {
      const base = MAPS[this.cfg.mapId].fogAmount;
      const fogEvent = this.eventSystem.activeEvent?.cfg.id === 'fog' ? 0.3 : 0;
      this.fogRect.alpha = base + fogEvent + 0.05 * Math.sin(now / 1600);
    }

    // Regen bei Regenfront
    const activeEv = this.eventSystem.activeEvent?.cfg.id;
    if ((activeEv === 'rain_front' || activeEv === 'thunderstorm') && !this.raining) {
      this.raining = true;
      this.particles.rain(0, W, H, 0.8);
    } else if (activeEv !== 'rain_front' && activeEv !== 'thunderstorm' && this.raining) {
      this.raining = false;
      this.particles.clearAll();
    }

    // Debug
    if (this.debugOn) this.updateDebug(now, phaseId, progress);

    // HUD
    this.updateHud();
    this.drawCrosshair();
  }

  private raining = false;

  private directorInput() {
    const modeCfg = MODES[this.cfg.mode];
    const elapsed = this.nowMs - this.roundStartMs;
    const durationMs = modeCfg.duration > 0 ? modeCfg.duration * 1000 : 240000;
    return {
      accuracy: accuracyOf(this.stats.shots, this.stats.hits),
      combo: this.combo.combo,
      reactionMs: this.reactionTimes.length > 0 ? this.reactionTimes[this.reactionTimes.length - 1] : 0,
      timeLeft: Math.max(0, (durationMs - elapsed) / 1000),
      roundLength: durationMs / 1000,
      misses: this.stats.misses,
      score: this.score,
    };
  }

  // ── Fadenkreuz ───────────────────────────────────────────────

  private drawCrosshair(): void {
    const g = this.crosshair;
    g.clear();
    const p = this.input.activePointer;
    const x = p.x;
    const y = p.y;
    const s = getSettings();
    const size = 14 * s.crosshairSize;
    const hex = s.crosshairColor.replace('#', '');
    const cr = parseInt(hex.substring(0, 2), 16);
    const cg = parseInt(hex.substring(2, 4), 16);
    const cbx = parseInt(hex.substring(4, 6), 16);
    const c = (cr << 16) | (cg << 8) | cbx;

    if (s.crosshairStyle === 'circle') {
      g.lineStyle(2, c, 1);
      g.strokeCircle(x, y, size);
      g.fillStyle(c, 1);
      g.fillCircle(x, y, 2);
    } else if (s.crosshairStyle === 'sniper') {
      g.lineStyle(1.5, c, 1);
      g.lineBetween(x - size * 1.4, y, x - size * 0.4, y);
      g.lineBetween(x + size * 0.4, y, x + size * 1.4, y);
      g.lineBetween(x, y - size * 1.4, x, y - size * 0.4);
      g.lineBetween(x, y + size * 0.4, x, y + size * 1.4);
      g.fillStyle(c, 1);
      g.fillCircle(x, y, 1.6);
    } else if (s.crosshairStyle === 'hex') {
      g.lineStyle(2, c, 1);
      let px = x + Math.cos(Math.PI / 6) * size;
      let py = y + Math.sin(Math.PI / 6) * size;
      for (let i = 1; i <= 6; i++) {
        const a = (Math.PI / 3) * i + Math.PI / 6;
        const nx = x + Math.cos(a) * size;
        const ny = y + Math.sin(a) * size;
        g.lineBetween(px, py, nx, ny);
        px = nx;
        py = ny;
      }
    } else if (s.crosshairStyle === 'feather') {
      g.lineStyle(2, c, 1);
      g.strokeCircle(x, y, size);
      g.lineStyle(3, c, 1);
      g.lineBetween(x - size * 0.6, y + size * 0.6, x + size * 0.6, y - size * 0.6);
    } else {
      // classic
      g.lineStyle(2.5, c, 1);
      g.lineBetween(x - size, y, x - size * 0.35, y);
      g.lineBetween(x + size * 0.35, y, x + size, y);
      g.lineBetween(x, y - size, x, y - size * 0.35);
      g.lineBetween(x, y + size * 0.35, x, y + size);
      g.fillStyle(c, 1);
      g.fillCircle(x, y, 1.8);
    }

    // Debug-Hitboxes
    if (this.debugOn) {
      g.lineStyle(1, 0x00ff88, 0.6);
      for (const t0 of this.targets) {
        const r = Math.max(t0.displayWidth, t0.displayHeight) * 0.5 * t0.cfg.hitbox * 1.35;
        g.strokeCircle(t0.x, t0.y, r);
      }
    }
  }

  // ── Pause ────────────────────────────────────────────────────

  private togglePause(): void {
    if (this.phase !== 'playing' || this.ended) return;
    this.paused = !this.paused;
    if (this.paused) {
      audio.suspend();
      this.scene.pause();
      this.showPauseMenu();
    } else {
      audio.resume();
      this.hidePauseMenu();
      this.scene.resume();
    }
  }

  resumeFromUi(): void {
    if (this.paused) this.togglePause();
  }

  private showPauseMenu(): void {
    const root = document.getElementById('ui-root');
    if (!root) return;
    const box = document.createElement('div');
    box.className = 'overlay-modal';
    box.id = 'pause-overlay';
    box.innerHTML = `
      <div class="modal">
        <h2>${t('hud.paused')}</h2>
        <button class="btn" data-act="resume">${t('menu.resume')}</button>
        <button class="btn" data-act="restart">${t('menu.restart')}</button>
        <button class="btn" data-act="quit">${t('menu.quit')}</button>
      </div>`;
    root.appendChild(box);
    box.querySelector('[data-act="resume"]')?.addEventListener('click', () => this.togglePause());
    box.querySelector('[data-act="restart"]')?.addEventListener('click', () => {
      this.hidePauseMenu();
      this.scene.restart({ cfg: this.cfg });
    });
    box.querySelector('[data-act="quit"]')?.addEventListener('click', () => {
      this.hidePauseMenu();
      audio.resume();
      this.scene.start('menu');
    });
  }

  private hidePauseMenu(): void {
    document.getElementById('pause-overlay')?.remove();
  }

  // ── Event-Feedback ───────────────────────────────────────────

  private onEventStarted(eventId: string): void {
    const label = tRaw(`event.${eventId}`);
    const ev = this.eventSystem.activeEvent;
    this.toast(label, 'event');
    if (!ev) return;
    const id = ev.cfg.id;
    if (id === 'thunderstorm') {
      audio.thunder();
      if (!getSettings().reducedFlashes) {
        const flash = this.add.rectangle(W / 2, H / 2, W, H, 0xffffff, 0).setDepth(80);
        this.tweens.add({ targets: flash, alpha: 0.35, duration: 60, yoyo: true, onComplete: () => flash.destroy() });
      }
    }
    if (id === 'frog_concert') {
      audio.frog();
    }
    if (id === 'golden_swarm') {
      this.particles.confetti(W * 0.3, H * 0.3, 30);
      this.particles.confetti(W * 0.7, H * 0.3, 30);
    }
    if (id === 'featherstorm') {
      this.particles.confetti(W / 2, H * 0.4, 50);
      audio.bonus();
    }
  }

  // ── Tutorial ─────────────────────────────────────────────────

  private advanceTutorial(stage: 'hit' | 'reload' | 'combo' | 'perfect'): void {
    if (this.cfg.mode !== 'tutorial') return;
    const el = this.hud['tutorial'];
    if (!el) return;
    const stepFor: Record<string, number> = { hit: 1, reload: 2, combo: 3, perfect: 4 };
    const want = stepFor[stage];
    if (want != null && want <= this.tutorialStep + 1) {
      this.tutorialStep = Math.max(this.tutorialStep, want - 1);
      if (this.tutorialStep < 4) {
        el.textContent = tRaw(`tutorial.step${this.tutorialStep + 1}`);
      } else {
        el.classList.add('hidden');
      }
    }
  }

  // ── HUD ──────────────────────────────────────────────────────

  private buildHud(): void {
    const root = document.getElementById('ui-root');
    if (!root) return;
    const s = getSettings();
    const hud = document.createElement('div');
    hud.id = 'hud';
    hud.className = `hud-theme-${s.hudTheme}`;
    hud.innerHTML = `
      <div class="hud-top">
        <div class="hud-left">
          <div class="hud-time" data-hud="time">--:--</div>
          <div class="hud-phase" data-hud="phase"></div>
        </div>
        <div class="hud-center">
          <div class="hud-score" data-hud="score">0</div>
          <div class="hud-event" data-hud="event"></div>
          <div class="hud-boss" data-hud="boss" hidden>
            <div class="hud-boss-name" data-hud="bossName"></div>
            <div class="hud-boss-bar"><div class="hud-boss-fill" data-hud="bossFill"></div></div>
          </div>
        </div>
        <div class="hud-right">
          <div class="hud-combo" data-hud="combo"></div>
          <div class="hud-ammo" data-hud="ammo"></div>
          <div class="hud-reload" data-hud="reload" hidden>
            <div class="hud-reload-bar"><div class="hud-reload-fill" data-hud="reloadFill"></div></div>
          </div>
        </div>
      </div>
      <div class="hud-countdown" data-hud="countdown">3</div>
      <div class="hud-toasts" data-hud="toasts"></div>
      ${this.cfg.mode === 'tutorial' ? `<div class="hud-tutorial" data-hud="tutorial">${t('tutorial.step1')}</div>` : ''}
    `;
    root.appendChild(hud);
    for (const key of ['time', 'phase', 'score', 'event', 'combo', 'ammo', 'reload', 'reloadFill', 'boss', 'bossName', 'bossFill', 'countdown', 'toasts', 'tutorial']) {
      this.hud[key] = hud.querySelector(`[data-hud="${key}"]`);
    }
    this.updateHudAmmo();

    // Tutorial: startet bei Schritt 1 (wird im Update via Treffer/Reload fortgeschrieben).
    if (this.cfg.mode === 'tutorial') {
      this.tutorialStep = 0;
    }
  }

  private updateHudAmmo(): void {
    const el = this.hud['ammo'];
    const reloadEl = this.hud['reload'];
    const fillEl = this.hud['reloadFill'];
    if (!el) return;
    const snap = this.weapon.snapshot;
    if (snap.totalLeft === 0) {
      el.textContent = `${snap.current}/${snap.size}`;
    } else {
      el.textContent = `${snap.current}/${snap.size} · ${snap.totalLeft}`;
    }
    if (reloadEl && fillEl) {
      if (snap.state === 'reloading') {
        reloadEl.hidden = false;
        fillEl.style.width = `${Math.round(snap.reloadProgress * 100)}%`;
      } else {
        reloadEl.hidden = true;
      }
    }
    if (snap.state === 'empty' && !MODES[this.cfg.mode].autoReload) {
      el.classList.add('empty');
    } else {
      el.classList.remove('empty');
    }
  }

  private updateHud(): void {
    if (!this.hud['time']) return;
    const modeCfg = MODES[this.cfg.mode];
    const durationMs = modeCfg.duration > 0 ? modeCfg.duration * 1000 : Infinity;
    const elapsed = this.phase === 'playing' ? this.nowMs - this.roundStartMs : 0;
    const leftMs = durationMs === Infinity ? elapsed : Math.max(0, durationMs - this.bonusMs - elapsed);
    const leftS = Math.max(0, Math.ceil(leftMs / 1000));
    const mm = String(Math.floor(leftS / 60)).padStart(2, '0');
    const ss = String(leftS % 60).padStart(2, '0');
    if (durationMs === Infinity) {
      this.hud['time']!.textContent = `+${mm}:${ss}`;
    } else {
      this.hud['time']!.textContent = `${mm}:${ss}`;
    }
    this.hud['score']!.textContent = formatScore(this.score);
    this.hud['event']!.textContent = this.eventSystem.activeEvent
      ? `${tRaw(`event.${this.eventSystem.activeEvent.cfg.id}`)} ×${this.eventSystem.scoreMult}`
      : '';
    const comboEl = this.hud['combo']!;
    if (this.combo.combo >= 2) {
      const mult = 1.25 + Math.max(0, Math.floor((this.combo.combo - 5) / 5)) * 0.5;
      comboEl.textContent = `${this.combo.combo} · ×${Math.min(8, mult).toFixed(2)}`;
      comboEl.classList.add('active');
    } else {
      comboEl.textContent = '';
      comboEl.classList.remove('active');
    }
  }

  private updateBossBar(): void {
    const bossEl = this.hud['boss'];
    const nameEl = this.hud['bossName'];
    const fillEl = this.hud['bossFill'];
    if (!bossEl || !nameEl || !fillEl) return;
    if (this.boss) {
      bossEl.hidden = false;
      nameEl.textContent = tRaw(`target.${this.boss.cfg.id}`);
      fillEl.style.width = `${Math.max(0, Math.round((this.boss.hp / this.boss.cfg.hp) * 100))}%`;
    } else {
      bossEl.hidden = true;
    }
  }

  private toast(text: string, kind: 'gold' | 'dim' | 'red' | 'blue' | 'green' | 'event'): void {
    const box = this.hud['toasts'];
    if (!box) return;
    const el = document.createElement('div');
    el.className = `toast toast-${kind}`;
    el.textContent = text;
    box.appendChild(el);
    this.time.delayedCall(1600, () => el.remove());
    while (box.children.length > 4) box.firstChild?.remove();
  }

  // ── Debug ────────────────────────────────────────────────────

  private updateDebug(now: number, phaseId: string, progress: number): void {
    if (!this.debugText) {
      this.debugText = this.add
        .text(12, 12, '', {
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#00ff88',
          backgroundColor: '#00000088',
          padding: { x: 8, y: 6 },
        })
        .setDepth(900);
    }
    const d = this.director.state;
    this.debugText.setText(
      [
        `seed: ${String(this.cfg.seed)}`,
        `phase: ${phaseId} (${Math.round(progress * 100)}%)`,
        `director: ${d.factor.toFixed(2)} — ${d.reason}`,
        `targets: ${this.targets.length} · particles: ${this.particles.activeCount}`,
        `event: ${this.eventSystem.activeEvent?.cfg.id ?? '-'} · wind: ${this.eventSystem.wind}`,
        `score: ${this.score} · combo: ${this.combo.combo} · chainMult: ${now < this.chainMultUntil ? this.chainMultValue : 1}`,
        `hits: ${this.targets.map((t0) => t0.debugInfo()).join(' | ')}`,
      ].join('\n'),
    );
  }

  toggleDebug(): void {
    this.debugOn = !this.debugOn;
    if (!this.debugOn) this.debugText?.destroy();
  }

  // ── Rundenende ───────────────────────────────────────────────

  private endRound(elapsedMs: number): void {
    if (this.ended) return;
    this.ended = true;
    this.phase = 'ended';
    // HUD-Overlay ausblenden, damit nur die Result-Scene sichtbar ist
    const hudEl = document.getElementById('hud');
    if (hudEl) hudEl.style.display = 'none';
    this.stats.durationMs = Math.round(elapsedMs);
    this.stats.avgReactionMs = avgReaction(this.reactionTimes);
    if (this.combo.maxCombo > this.stats.maxCombo) this.stats.maxCombo = this.combo.maxCombo;

    const modeCfg = MODES[this.cfg.mode];
    const accuracy = accuracyOf(this.stats.shots, this.stats.hits);
    const perfectRatio = this.stats.hits > 0 ? this.stats.perfectHits / this.stats.hits : 0;
    const rank: RankResult = computeRank({
      score: this.score,
      parScore: modeCfg.parScore,
      accuracy,
      perfectRatio,
      maxCombo: this.stats.maxCombo,
    });

    audio.stopMusic();
    audio.stopAmbience();
    audio.roundEnd();

    // ── Fortschritt ────────────────────────────────────────────
    const save = loadSave();
    const previousBest = save.progress.bestScore;
    const ctx: RoundContext = {
      mode: this.cfg.mode,
      mapId: this.cfg.mapId,
      stats: this.stats,
      score: this.score,
      maxCombo: this.stats.maxCombo,
      perfectCount: this.stats.perfectHits,
      hiddenFoundNow: (save.progress.hiddenFound[this.cfg.mapId] ?? []).slice(),
      chainCount: this.stats.chainReactions,
      bossClean: this.bossClean,
      endlessScore: this.cfg.mode === 'endless' ? this.score : null,
      isDaily: this.cfg.mode === 'daily',
    };

    // XP & Federn
    let xpGain = Math.round(xpForRound(ctx) * modeCfg.xpMultiplier);
    let feathersGain = feathersForRound(ctx);

    // Errungenschaften
    const newAchievements: string[] = [];
    for (const id of checkAchievements(save, ctx)) {
      save.progress.achievements.push(id);
      newAchievements.push(id);
      const def = ACHIEVEMENTS.find((a) => a.id === id);
      if (def) {
        xpGain += def.xp;
        feathersGain += def.feathers;
      }
      events.emit('achievement-unlocked', { achievementId: id });
    }
    if (newAchievements.length > 0) audio.achievement();

    // Herausforderungen (gleiche IDs wie Errungenschaften + swarm3s)
    const newChallenges: string[] = [];
    const challengeValue: Record<string, number> = {
      noMiss20: this.stats.noMissStreak,
      perfect5: this.stats.perfectHits,
      swarm3s: this.swarmBonusCount,
      chain5: this.stats.chainReactions,
      combo25: this.stats.maxCombo,
      bossClean: this.bossClean && this.stats.bossKills > 0 ? 1 : 0,
      acc80: accuracy >= 0.8 && this.stats.shots >= 15 ? 1 : 0,
    };
    for (const ch of CHALLENGES) {
      const value = challengeValue[ch.id] ?? 0;
      if (value >= ch.target && bumpChallenge(save.progress, ch.id, value, ch.target)) {
        newChallenges.push(ch.id);
        xpGain += ch.xp;
        feathersGain += ch.feathers;
      }
    }

    const levelsGained = grantXp(save.progress, xpGain);
    if (levelsGained.length > 0) audio.levelUp();
    save.progress.feathers += feathersGain;

    // Freischaltungen
    const newUnlocks: string[] = [];
    const p = save.progress;
    if (!p.unlockedModes.includes('blitz') && this.stats.maxCombo >= 10) {
      p.unlockedModes.push('blitz');
      newUnlocks.push('mode.blitz');
    }
    if (!p.unlockedModes.includes('precision') && accuracy >= 0.7) {
      p.unlockedModes.push('precision');
      newUnlocks.push('mode.precision');
    }
    if (!p.unlockedModes.includes('endless') && p.level >= 3) {
      p.unlockedModes.push('endless');
      newUnlocks.push('mode.endless');
    }
    if (!p.unlockedModes.includes('zen') && p.level >= 5) {
      p.unlockedModes.push('zen');
      newUnlocks.push('mode.zen');
    }
    if (!p.unlockedMaps.includes('sturmklippen') && p.roundsPlayed + 1 >= 3) {
      p.unlockedMaps.push('sturmklippen');
      newUnlocks.push('map.sturmklippen');
    }
    if (!p.unlockedMaps.includes('mondbruch') && rankAtLeast(rank.grade, 'B')) {
      p.unlockedMaps.push('mondbruch');
      newUnlocks.push('map.mondbruch');
    }

    // Statistiken + Highscore
    applyRoundStats(save, {
      shots: this.stats.shots,
      hits: this.stats.hits,
      perfectHits: this.stats.perfectHits,
      maxCombo: this.stats.maxCombo,
      durationMs: this.stats.durationMs,
      rank: rank.grade,
      targetsHit: this.stats.targetsHit,
    });
    const isRecord = upsertHighscore(save, {
      score: this.score,
      mode: this.cfg.mode,
      map: this.cfg.mapId,
      date: new Date().toISOString(),
      rank: rank.grade,
      isDaily: this.cfg.mode === 'daily',
    });
    if (isRecord) events.emit('new-record', { score: this.score });
    const mapBest = p.bestPerMap[this.cfg.mapId] ?? 0;
    if (this.score > mapBest) p.bestPerMap[this.cfg.mapId] = this.score;

    const dailyRecord = this.cfg.mode === 'daily' ? save.progress.dailyRecords[dayKey()] ?? null : null;

    persistSave();

    const result: RoundResultData = {
      mode: this.cfg.mode,
      mapId: this.cfg.mapId,
      seed: String(this.cfg.seed),
      score: this.score,
      stats: this.stats,
      rank,
      isRecord,
      previousBest,
      dailyRecord,
      xpGained: xpGain,
      levelsGained,
      feathersGained: feathersGain,
      newAchievements,
      newChallenges,
      newUnlocks,
    };

    this.particles.clearAll();
    this.time.delayedCall(900, () => {
      this.scene.start('result', { data: result });
    });
  }

  shutdown(): void {
    events.clear();
    audio.stopMusic();
    audio.stopAmbience();
    const hudEl = document.getElementById('hud');
    if (hudEl) hudEl.remove();
    this.hidePauseMenu();
    for (const t0 of this.targets) t0.destroy();
    this.targets = [];
    this.envObjects = [];
    this.parallax = [];
  }
}
