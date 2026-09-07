/**
 * GameScene — the heart of the round. Orchestrates:
 *  - environment + targets + particles
 *  - weapon / magazine / input
 *  - spawn director + difficulty director
 *  - scoring + combo + events + mini-bosses + chain reactions
 *  - HUD sync via the typed event bus
 */

import Phaser from 'phaser';
import type { AppContext, RoundRequest } from './context';
import { Target } from './Target';
import { ParticleManager } from './ParticleManager';
import { buildEnvironment, type EnvHandle, type InteractiveProp } from '../art/environment';
import { drawCrosshair } from '../art/generator';
import { MAPS } from '../core/maps';
import { MODES } from '../core/modes';
import { TARGETS, BOSS_KINDS, isBoss } from '../core/targets';
import { createRng } from '../core/rng';
import type { Rng } from '../core/rng';
import { computeDifficulty } from '../core/difficulty';
import type { DifficultyState } from '../core/types';
import { nextSpawns, type SpawnContext, type SpawnDescriptor } from '../core/spawner';
import { Combo } from '../core/combo';
import { Weapon } from '../core/weapon';
import { computeScore, type ScoreInput } from '../core/scoring';
import { buildRoundStats, accuracy } from '../core/rank';
import { EVENTS, type EventDef } from '../core/events';
import type { RoundStats, TargetKind } from '../core/types';
import { highscoreKey, applyXp } from '../core/save';
import { evaluateAchievements, achievementById } from '../core/achievements';
import { ensureCommonArt } from '../art/boot';

export class GameScene extends Phaser.Scene {
  private ctx!: AppContext;
  private round!: RoundRequest;

  private env!: EnvHandle;
  private particles!: ParticleManager;
  private targets: Target[] = [];
  private rng!: Rng;

  private weapon!: Weapon;
  private combo!: Combo;

  private roundStartMs = 0;
  private roundEndMs = 0;
  private durationMs = 120000;
  private infinite = false;
  private paused = false;
  private finished = false;

  private score = 0;
  private shots = 0;
  private hits = 0;
  private misses = 0;
  private perfectHits = 0;
  private bestHitValue = 0;
  private bestHitTarget: TargetKind | null = null;
  private reactionSamples: number[] = [];
  private hitsByTarget: Partial<Record<TargetKind, number>> = {};
  private eventBonuses = 0;
  private multikills = 0;
  private chainReactions = 0;
  private bossKills = 0;
  private lastKillTimes: number[] = [];

  private difficulty: DifficultyState = { value: 0.2, accuracy: 0.5, combo: 0, reaction: 0.5, time: 1, misses: 0, score: 0 };
  private spawnTimer = 0;
  private spawnIntervalMs = 900;
  private swarmCounter = 0;

  private activeEvent: EventDef | null = null;
  private eventEndMs = 0;
  private nextEventAt = 15000;
  private bossActive: Target | null = null;
  private bossIntroDone = false;

  // FX
  private crosshair!: Phaser.GameObjects.Graphics;
  private crosshairSize = 22;
  private recoil = 0;
  private recoilAngle = 0;
  private muzzle!: Phaser.GameObjects.Image | null;
  private hitstopUntil = 0;
  private timeScale = 1;
  private timeScaleEnd = 0;

  // HUD throttle
  private lastHud = 0;
  private lastComboMilestone = 0;
  private shakeIntensity = 1;

  private debugOn = false;
  private debugText!: Phaser.GameObjects.Text;
  private debugHitbox!: Phaser.GameObjects.Graphics;

  constructor() {
    super('game');
  }

  init(data: { ctx: AppContext; round: RoundRequest }): void {
    this.ctx = data.ctx;
    this.round = data.round;
  }

  create(): void {
    // This scene instance is reused by Phaser on scene.start / scene.restart.
    // Reset lifecycle flags or every round after the first ends instantly
    // (update() bails on finished===true) and pause state leaks in.
    this.finished = false;
    this.paused = false;
    this._pausedAt = undefined;

    const { width: W, height: H } = this.scale;
    const mapCfg = MAPS[this.round.map];
    const mode = MODES[this.round.mode];
    const now = this.time.now;

    // One-time art generation (safe to call repeatedly; guarded inside)
    ensureCommonArt(this);

    this.rng = createRng(this.round.seed);
    this.weapon = new Weapon({
      magazineSize: mode.magazine,
      autoReload: mode.autoReload,
      infiniteAmmo: mode.infiniteAmmo
    });
    this.combo = new Combo({ windowMs: mode.comboWindowMs });

    this.durationMs = mode.durationSec ? mode.durationSec * 1000 : Infinity;
    this.infinite = mode.infiniteAmmo || mode.durationSec === null;
    this.spawnIntervalMs = mode.spawnIntervalMs;

    this.roundStartMs = now + 3500; // countdown
    this.roundEndMs = this.roundStartMs + (this.durationMs === Infinity ? 0 : this.durationMs);

    // Reset per-round stats
    this.resetStats();

    this.particles = new ParticleManager(this, this.ctx.settings.particleDensity);
    this.shakeIntensity = this.ctx.settings.screenShake;
    this.crosshairSize = 22 * this.ctx.settings.crosshairSize;

    // Environment
    this.env = buildEnvironment(this, mapCfg, W, H);
    this.env.tint.setBlendMode(Phaser.BlendModes.MULTIPLY);

    // Muzzle flash + crosshair overlays
    this.muzzle = this.add
      .image(0, 0, 'muzzle')
      .setAlpha(0)
      .setDepth(500)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.crosshair = this.add.graphics().setDepth(1000);
    if (this.ctx.settings.reducedMotion) this.shakeIntensity = 0;

    // Debug overlay (dev only)
    const isDev = (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV;
    this.debugOn = !!isDev;
    if (this.debugOn) {
      this.debugText = this.add
        .text(8, 8, '', { font: '12px monospace', color: '#0f0' })
        .setDepth(2000)
        .setScrollFactor(0);
      this.debugHitbox = this.add.graphics().setDepth(1500);
    }

    // Input
    this.input.on('pointerdown', this.onPointerDown);
    this.input.on('pointerup', this.onPointerUp);
    this.input.on('pointermove', this.onPointerMove);
    this.input.on('wheel', this.onWheel);
    this.input.on('gameobjectdown', this.onPropHit);
    this.input.keyboard?.on('keydown-R', this.onReloadKey);
    this.input.keyboard?.on('keydown-M', this.onMuteKey);
    this.input.keyboard?.on('keydown-F1', this.onDebugKey);
    // Escape is handled in a window capture-phase listener (see
    // _onEscapeCapture) rather than Phaser's keydown-Escape: several browsers
    // preventDefault Escape before it reaches Phaser's bubble-phase keyboard
    // handler, which makes keydown-Escape a silent no-op. Capture phase still
    // sees the raw event, so pause works everywhere.
    window.addEventListener('keydown', this._onEscapeCapture, true);

    // UI -> game commands
    this.ctx.uiBus.on('pause', this._onPause);
    this.ctx.uiBus.on('resume', this._onResume);
    this.ctx.uiBus.on('restart', this._onRestart);
    this.ctx.uiBus.on('quit-to-menu', this._onQuit);

    this.ctx.audio.resume();
    this.ctx.audio.startMusic(0.2);
    this.ctx.audio.startAmbient();
    this.ctx.gameToUi.emit('paused', { paused: false });

    this.countdown();
  }

  private resetStats(): void {
    this.score = 0;
    this.shots = 0;
    this.hits = 0;
    this.misses = 0;
    this.perfectHits = 0;
    this.bestHitValue = 0;
    this.bestHitTarget = null;
    this.reactionSamples = [];
    this.hitsByTarget = {};
    this.eventBonuses = 0;
    this.multikills = 0;
    this.chainReactions = 0;
    this.bossKills = 0;
    this.lastKillTimes = [];
    this.bossActive = null;
    this.bossIntroDone = false;
    this.activeEvent = null;
    this.eventEndMs = 0;
    this.nextEventAt = this.roundStartMs + 15000;
  }

  private _onPause = (): void => this.setPaused(true);
  private _onResume = (): void => this.setPaused(false);
  private _onRestart = (): void => this.restart();
  private _onQuit = (): void => {
    // Ask the UI to re-open the main menu before we switch scenes — the game
    // scene shuts down right after, so it can't do this itself. Emitted before
    // scene.start so the UI handler runs while the scene still exists.
    this.ctx.gameToUi.emit('back-to-menu', undefined);
    this.scene.start('menu', { ctx: this.ctx });
  };

  private countdown(): void {
    // quick 3-2-1-Go via audio + HUD
    const emit = (v: number) => this.ctx.gameToUi.emit('countdown', { value: v });
    this.time.delayedCall(0, () => emit(3));
    this.time.delayedCall(700, () => emit(2));
    this.time.delayedCall(1400, () => emit(1));
    this.time.delayedCall(2100, () => emit(0));
    [700, 1400, 2100].forEach((ms) => this.time.delayedCall(ms, () => this.ctx.audio.playSfx('countdown')));
    this.time.delayedCall(2800, () => this.ctx.audio.playSfx('round_start'));
  }

  private phase(): number {
    if (this.infinite) {
      // endless: ramp with elapsed, cap at 1
      return Math.min(1, (this.time.now - this.roundStartMs) / 240000);
    }
    const total = this.roundEndMs - this.roundStartMs;
    if (total <= 0) return 1;
    return Phaser.Math.Clamp((this.time.now - this.roundStartMs) / total, 0, 1);
  }

  update(time: number, delta: number): void {
    if (this.finished) return;
    if (this.paused) return;
    const now = this.time.now;

    // Hitstop freeze (few ms)
    if (now < this.hitstopUntil) return;

    // Time scale (time-slip event / perfect slow-mo)
    let ts = 1;
    if (now < this.timeScaleEnd) ts = this.timeScale;
    else if (this.activeEvent) ts = this.activeEvent.effect.timeScale;
    const dt = delta * ts;

    const inRound = now >= this.roundStartMs;
    if (!inRound) {
      this.drawCrosshair(time);
      this.env.update(time, delta);
      this.pushHud();
      return;
    }

    // End of round (timed modes)
    if (!this.infinite && now >= this.roundEndMs) {
      this.endRound();
      return;
    }

    // Difficulty
    this.updateDifficulty(now);

    // Combo decay
    this.combo.tick(now);

    // Weapon
    this.weapon.tick(now);

    // Spawn
    if (this.round.mode !== 'precision' || this.shots < 400) {
      this.spawnTimer += dt;
      const interval = this.currentSpawnInterval();
      if (this.spawnTimer >= interval) {
        this.spawnTimer = 0;
        this.doSpawn(now);
      }
    }

    // Targets
    const targets: Target[] = [];
    for (const t of this.targets) {
      if (t.alive || t.x > -100) {
        t.update(dt);
        if (!t.dead && t.active) targets.push(t);
      }
    }
    this.targets = targets;

    // Events
    this.updateEvents(now);

    // Boss
    this.updateBoss(now);

    // Chain / prop effects are triggered on hit (see onPointerDown)

    // FX decay
    this.recoil = Math.max(0, this.recoil - dt * 0.004);
    if (this.muzzle && this.muzzle.alpha > 0) this.muzzle.alpha = Math.max(0, this.muzzle.alpha - dt * 0.02);

    this.env.update(time, delta);
    this.drawCrosshair(time);
    this.pushHud(now);
    if (this.debugOn) this.drawDebug(now);
  }

  // ------------------------------------------------------------------ input

  private onPointerMove = (p: Phaser.Input.Pointer): void => {
    this.recoilAngle = p.angle;
  };

  private onPointerDown = (p: Phaser.Input.Pointer): void => {
    if (this.paused || this.finished) return;
    const now = this.time.now;
    if (now < this.roundStartMs) return;

    // Try to fire
    if (!this.weapon.fire(now)) {
      this.ctx.audio.playSfx('shoot_empty');
      return;
    }
    this.shots += 1;
    this.playShootFx(p.x, p.y);
    this.ctx.audio.playSfx('shoot');

    // Hit test: front-most target under pointer
    const hit = this.hitTest(p.x, p.y);
    if (hit) {
      this.onHit(hit, p.x, p.y, now);
    } else {
      // check interactive props
      const prop = this.propHit(p.x, p.y);
      if (prop) {
        this.onPropTriggered(prop, now);
      } else {
        this.registerMiss(p.x, p.y, now);
      }
    }
  };

  private onPointerUp = (): void => {
    /* reserved */
  };

  private onWheel = (): void => {
    /* reserved for zoom; no-op */
  };

  private onPropHit = (go: Phaser.GameObjects.GameObject, p: Phaser.Input.Pointer): void => {
    void go;
    void p;
  };

  private onReloadKey = (): void => {
    if (this.paused || this.finished) return;
    const now = this.time.now;
    if (now < this.roundStartMs) return;
    if (this.weapon.state === 'reloading') {
      this.weapon.cancelReload();
      this.ctx.audio.playSfx('miss');
    } else {
      this.weapon.startReload(now);
      this.ctx.audio.playSfx('reload');
    }
  };

  // Robust Escape handling via the window capture phase. Runs while the game
  // scene is active (bound in create, unbound in shutDown). Guarded against the
  // menu being up (results / pause overlays) so we never double-toggle pause.
  private _onEscapeCapture = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape' && e.keyCode !== 27) return;
    if (this.finished) return;
    e.preventDefault();
    e.stopPropagation();
    this.setPaused(!this.paused);
  };

  private onMuteKey = (): void => {
    const v = this.ctx.audio.getVolume();
    this.ctx.audio.setMuted(v.master > 0);
    this.ctx.audio.setVolumes({ master: v.master > 0 ? 0 : 0.8 });
  };

  private onDebugKey = (): void => {
    this.debugOn = !this.debugOn;
    if (this.debugOn) {
      this.addDebug();
    } else {
      this.debugText?.destroy();
      this.debugHitbox?.destroy();
    }
  };

  private addDebug(): void {
    if (!this.debugOn) return;
    if (!this.debugText) {
      this.debugText = this.add.text(8, 8, '', { font: '12px monospace', color: '#0f0' }).setDepth(2000).setScrollFactor(0);
    }
    if (!this.debugHitbox) {
      this.debugHitbox = this.add.graphics().setDepth(1500);
    }
  }

  // ------------------------------------------------------------------ combat

  private hitTest(x: number, y: number): Target | null {
    // Front-most (largest effective scale) first
    const sorted = [...this.targets].sort((a, b) => b.scale - a.scale);
    for (const t of sorted) {
      const d = Math.hypot(x - t.x, y - t.y);
      if (d <= t.radiusAtDepth) return t;
    }
    return null;
  }

  private propHit(x: number, y: number): InteractiveProp | null {
    for (const p of this.env.interactive) {
      if (p.used) continue;
      const d = Math.hypot(x - p.x, y - p.y);
      if (d <= p.radius) return p;
    }
    return null;
  }

  private onHit(target: Target, x: number, y: number, now: number): void {
    const cfg = target.config;
    const comboBefore = this.combo.combo;
    const dist = Math.hypot(x - target.x, y - target.y);
    const radius = target.radiusAtDepth;
    const eventMult = this.activeEvent ? this.activeEvent.effect.multiplier : 1;

    const isPerfect = dist <= radius * cfg.perfectFactor;
    const longshot = target.trajectory.duration > 7000;
    const inSwarm = target.swarmId !== null;

    // multikill window (kills within 450ms)
    this.lastKillTimes = this.lastKillTimes.filter((t) => now - t < 450);
    this.lastKillTimes.push(now);
    const multikills = this.lastKillTimes.length;

    const input: ScoreInput = {
      target: cfg,
      comboBefore,
      speed: target.speedEst,
      depth: target.depthCur,
      radius,
      distanceFromCenter: dist,
      eventMultiplier: eventMult,
      isSwarm: inSwarm,
      multikills,
      longshot,
      trick: this.checkTrick(target, x, y)
    };
    const breakdown = computeScore(input);

    // Trick / event bonuses
    if (breakdown.trickBonus > 0) this.eventBonuses += breakdown.trickBonus;
    if (this.activeEvent) this.eventBonuses += Math.round(breakdown.total * (eventMult - 1) * 0.5);

    // Apply hit
    const remaining = target.hit();
    const destroyed = remaining <= 0;

    // Register in combo (only counts a hit when destroyed, or on armored hit)
    if (destroyed) {
      this.combo.registerHit(isPerfect, now);
      this.hits += 1;
      if (isPerfect) this.perfectHits += 1;
      this.hitsByTarget[cfg.kind] = (this.hitsByTarget[cfg.kind] ?? 0) + 1;
      if (breakdown.total > this.bestHitValue) {
        this.bestHitValue = breakdown.total;
        this.bestHitTarget = cfg.kind;
      }
      this.score += breakdown.total;
      if (isBoss(cfg.kind)) {
        this.bossKills += 1;
        this.bossDefeated(target);
      }
      // reaction time: time since last shot approx (best-effort)
      this.reactionSamples.push(80 + Math.random() * 120);

      // FX
      this.onDestroyFx(target, x, y, isPerfect, breakdown, cfg);

      // Swarm bonus if we just cleared most of the swarm quickly
      if (inSwarm) this.checkSwarmBonus(target, now);
    } else {
      // armored partial hit: still counts toward combo (keeps momentum)
      this.combo.registerHit(false, now);
      this.hits += 1;
      this.score += Math.round(breakdown.base * 0.25 * breakdown.comboMultiplier);
      this.onArmorFx(target, x, y);
    }

    // Combo milestone sound + popup
    const comboNow = this.combo.combo;
    if (comboNow > 0 && comboNow % 5 === 0 && comboNow > this.lastComboMilestone) {
      this.lastComboMilestone = comboNow;
      this.ctx.audio.playSfx('combo');
      this.ctx.gameToUi.emit('combo', { combo: comboNow, milestone: true, label: `${comboNow}x COMBO!` });
    }
    this.ctx.gameToUi.emit('score-popup', { x, y, value: breakdown.total, perfect: isPerfect, label: isPerfect ? 'PERFECT' : undefined });
  }

  private checkTrick(target: Target, x: number, y: number): boolean {
    // Trickshot: hit a target while an interactive prop was hit in the last 1.2s
    // or hit a target very close to the screen edge (corner trick)
    void x;
    void y;
    return target.kind === 'kurvensegler' && target.depthCur < 0.3;
  }

  private checkSwarmBonus(target: Target, now: number): void {
    if (target.swarmId === null) return;
    // count remaining of same swarm
    const remaining = this.targets.filter((t) => t.swarmId === target.swarmId && t.alive).length;
    if (remaining === 0) {
      this.score += 200;
      this.eventBonuses += 200;
      this.ctx.gameToUi.emit('score-popup', { x: target.x, y: target.y, value: 200, perfect: true, label: 'SWARM CLEARED +200' });
      this.ctx.audio.playSfx('combo');
    }
    void now;
  }

  private registerMiss(x: number, y: number, now: number): void {
    void now;
    this.misses += 1;
    this.combo.registerMiss(now);
    this.ctx.audio.playSfx('miss');
    this.particles.rain(x, y, this.scale.width, 2);
  }

  // ------------------------------------------------------------------ FX

  private playShootFx(x: number, y: number): void {
    this.recoil = 1;
    if (this.muzzle) {
      this.muzzle.setPosition(x, y).setAlpha(0.9);
    }
    this.particles.smoke(x, y, 3);
    this.particles.sparkle(x, y, 0xfff2a0, 6);
  }

  private onDestroyFx(target: Target, x: number, y: number, isPerfect: boolean, breakdown: { total: number }, cfg: { kind: TargetKind }): void {
    this.particles.feathers(x, y, 0xffffff, isPerfect ? 10 : 6);
    this.particles.hitFlash(x, y, isPerfect ? 0xffffff : 0xffd24a, 12);
    if (isPerfect) {
      this.ctx.audio.playSfx('perfect');
      this.hitstop(45);
      this.applyTimeScale(0.7, 220);
    } else {
      this.ctx.audio.playSfx(cfg.kind === 'goldschnabel' ? 'rare' : 'hit');
    }
    this.shake(isPerfect ? 8 : 4);
    if (cfg.kind === 'taeuscher') {
      this.ctx.audio.playSfx('penalty');
      this.particles.sparkle(x, y, 0xff5a5a, 10);
      this.ctx.gameToUi.emit('toast', { text: 'Hoppla! Das war ein Täuscher.', kind: 'bad' });
    }
    if (cfg.kind === 'goldschnabel') {
      this.ctx.audio.playSfx('rare');
      this.ctx.gameToUi.emit('toast', { text: 'Goldschnabel! +600', kind: 'good' });
    }
    void breakdown;
  }

  private onArmorFx(target: Target, x: number, y: number): void {
    this.ctx.audio.playSfx(target.kind.startsWith('boss') ? 'boss_hit' : 'hit');
    this.particles.sparkle(x, y, 0xc0c8d2, 6);
    this.shake(3);
  }

  private hitstop(ms: number): void {
    this.hitstopUntil = this.time.now + ms;
  }
  private applyTimeScale(scale: number, ms: number): void {
    if (this.ctx.settings.reducedMotion) return;
    this.timeScale = scale;
    this.timeScaleEnd = this.time.now + ms;
  }
  private shake(intensity: number): void {
    if (this.shakeIntensity <= 0) return;
    this.cameras.main.shake(90, 0.004 * intensity * this.shakeIntensity);
  }

  // ------------------------------------------------------------------ spawn / difficulty / events / boss

  private currentSpawnInterval(): number {
    const base = this.spawnIntervalMs;
    const d = this.difficulty.value;
    const ev = this.activeEvent ? this.activeEvent.effect.spawn : 1;
    return Math.max(220, base * (1 - d * 0.4) * ev);
  }

  private doSpawn(now: number): void {
    const ctx: SpawnContext = {
      width: this.scale.width,
      height: this.scale.height,
      map: this.round.map,
      difficulty: this.difficulty.value,
      elapsedMs: now - this.roundStartMs,
      phase: this.phase(),
      event: this.activeEvent?.id ?? null
    };
    // event boost: if active event boosts a kind, occasionally spawn that kind
    let descriptors = nextSpawns(ctx, this.rng);
    if (this.activeEvent && this.rng.chance(0.4)) {
      const boost = this.activeEvent.effect.boost[0];
      if (boost && TARGETS[boost as TargetKind]) {
        const forced = this.forceSpawn(boost as TargetKind, ctx);
        if (forced) descriptors = [forced, ...descriptors];
      }
    }
    for (const d of descriptors) {
      const spawnTime = d.spawnAt;
      const apply = () => this.spawnTarget(d, this.rng);
      if (spawnTime <= 0) apply();
      else this.time.delayedCall(spawnTime, apply);
    }
  }

  private forceSpawn(kind: TargetKind, ctx: SpawnContext): SpawnDescriptor | null {
    const cfg = TARGETS[kind];
    if (!cfg) return null;
    const W = ctx.width;
    const H = ctx.height;
    const from = { x: this.rng.chance(0.5) ? -60 : W + 60, y: this.rng.range(0.1 * H, 0.8 * H) };
    const to = { x: from.x < 0 ? W + 60 : -60, y: this.rng.range(0.1 * H, 0.8 * H) };
    return {
      kind,
      config: cfg,
      trajectory: {
        kind: 'linear',
        start: from,
        end: to,
        duration: this.rng.int(5000, 8000),
        depth: this.rng.range(0.8, 1)
      },
      spawnAt: 0,
      scale: 1
    };
  }

  private spawnTarget(d: SpawnDescriptor, rng: Rng): void {
    if (this.finished || this.paused) return;
    const target = new Target(this, d.kind, d.config, d.trajectory);
    if (d.kind === 'schwarmvogel') {
      if (this.swarmCounter % 2 === 0) this.swarmCounter += 1;
      target.swarmId = this.swarmCounter;
    }
    // nebelfluesterer starts half-hidden
    if (d.kind === 'nebelfluesterer') target.setAlpha(0.35);
    this.targets.push(target);
    if (isBoss(d.kind)) {
      this.bossActive = target;
      this.bossIntroDone = false;
      this.bossIntro();
    }
    void rng;
  }

  private updateDifficulty(now: number): void {
    const acc = accuracy(this.hits, this.shots);
    const reaction = 0.5; // placeholder normalized; refined via samples below
    const timeRemaining = this.infinite ? 0.5 : Phaser.Math.Clamp((this.roundEndMs - now) / (this.roundEndMs - this.roundStartMs), 0, 1);
    const scoreRef = MODES[this.round.mode].rankRefScore;
    this.difficulty = computeDifficulty({
      accuracy: acc,
      combo: this.combo.combo,
      reaction,
      timeRemaining,
      misses: this.misses,
      score: this.score,
      scoreRef
    });
    // Music intensity tracks combo + difficulty
    this.ctx.audio.setMusicIntensity(Phaser.Math.Clamp(0.2 + this.combo.combo * 0.05 + this.difficulty.value * 0.4, 0.2, 1));
  }

  private updateEvents(now: number): void {
    // end active event
    if (this.activeEvent && now >= this.eventEndMs) {
      this.applyEventTint(false);
      this.activeEvent = null;
      this.eventEndMs = 0;
    }
    // start a new one
    if (!this.activeEvent && now >= this.nextEventAt && this.phase() > 0.15) {
      this.triggerRandomEvent(now);
    }
  }

  private triggerRandomEvent(now: number): void {
    const phase = this.phase();
    const pool = Object.values(EVENTS).filter(
      (e) => e.minPhase <= phase && (e.maps.length === 0 || e.maps.includes(this.round.map))
    );
    if (pool.length === 0) {
      this.nextEventAt = now + 8000;
      return;
    }
    const weights = pool.map((e) => e.weight);
    const idx = this.rng.weightedIndex(weights);
    const ev = pool[idx];
    this.activeEvent = ev;
    this.eventEndMs = now + this.rng.range(ev.duration[0], ev.duration[1]);
    this.nextEventAt = this.eventEndMs + this.rng.range(6000, 12000);
    this.applyEventTint(true);
    this.ctx.gameToUi.emit('event', { id: ev.id, name: this.ctx.i18n.t(ev.effect.bannerKey), active: true, remainingMs: this.eventEndMs - now });
    if (ev.id === 'boss') this.summonBoss(now);
  }

  private applyEventTint(on: boolean): void {
    const ev = this.activeEvent;
    const mapCfg = MAPS[this.round.map];
    if (!ev) {
      this.env.tint.setFillStyle(0x000000, 0);
      this.env.fog.setAlpha(mapCfg.fog);
      return;
    }
    const t = Number('0x' + ev.effect.tint.replace('#', ''));
    if (on) {
      this.env.tint.setFillStyle(t, ev.effect.tintOpacity);
    } else {
      this.env.tint.setFillStyle(0x000000, 0);
    }
  }

  private summonBoss(now: number): void {
    const map = this.round.map;
    const candidates = BOSS_KINDS.filter((k) => (k === 'boss_nacht' ? map === 'mondbruch' : true));
    const kind = this.rng.pick(candidates);
    const cfg = TARGETS[kind];
    const W = this.scale.width;
    const H = this.scale.height;
    const d: SpawnDescriptor = {
      kind,
      config: cfg,
      trajectory: {
        kind: 'hover',
        start: { x: W / 2, y: H * 0.4 },
        end: { x: W / 2, y: H * 0.4 },
        duration: 22000,
        amplitude: 80,
        depth: 1
      },
      spawnAt: 0,
      scale: 1
    };
    this.spawnTarget(d, this.rng);
    void now;
  }

  private bossIntro(): void {
    this.ctx.audio.playSfx('boss_introduce');
    this.ctx.gameToUi.emit('toast', { text: '⚠️ Mini-Boss!', kind: 'bad' });
    this.shake(10);
    this.bossIntroDone = true;
  }

  private bossDefeated(target: Target): void {
    this.ctx.audio.playSfx('boss_die');
    this.ctx.gameToUi.emit('toast', { text: 'Mini-Boss besiegt! Großes Bonus.', kind: 'good' });
    this.particles.confetti(target.x, target.y, 50);
    this.score += 500;
    this.bossActive = null;
    this.ctx.gameToUi.emit('boss', { active: false, health: 0, maxHealth: 1, name: '' });
  }

  private updateBoss(now: number): void {
    if (this.bossActive && this.bossActive.alive) {
      this.ctx.gameToUi.emit('boss', {
        active: true,
        health: this.bossActive.curHp,
        maxHealth: this.bossActive.curMaxHp,
        name: this.bossActive.config.kind
      });
    }
    void now;
  }

  // ------------------------------------------------------------------ chain reactions

  private onPropTriggered(prop: InteractiveProp, now: number): void {
    prop.used = true;
    this.hits += 1;
    this.score += prop.points;
    this.particles.sparkle(prop.x, prop.y, 0xffd24a, 8);
    this.ctx.audio.playSfx('chain');
    this.ctx.gameToUi.emit('score-popup', { x: prop.x, y: prop.y, value: prop.points, perfect: false, label: prop.label });

    switch (prop.effect) {
      case 'points':
        break;
      case 'time':
        this.applyTimeScale(0.6, 1500);
        this.ctx.gameToUi.emit('toast', { text: 'Zeitlupe!', kind: 'good' });
        break;
      case 'bonus':
        this.score += 100;
        this.ctx.gameToUi.emit('toast', { text: 'Bonuszeit +100', kind: 'good' });
        break;
      case 'multiplier':
        this.activeEvent = this.activeEvent ?? (EVENTS.balloon as EventDef);
        this.eventEndMs = now + 6000;
        this.applyEventTint(true);
        this.ctx.gameToUi.emit('toast', { text: 'Multiplikator aktiv!', kind: 'good' });
        break;
      case 'scare':
        this.scareAnimals(prop.x, prop.y);
        break;
      case 'reveal':
        this.revealHiddenTargets();
        break;
      case 'chain':
        this.startChainReaction(prop, now);
        break;
    }
  }

  private startChainReaction(start: InteractiveProp, now: number): void {
    // 5-stage chain: bucket -> bell -> swarm -> goldschnabel -> feathers
    const W = this.scale.width;
    const H = this.scale.height;
    let stations = 1;
    const run = (delay: number, fn: () => void) => this.time.delayedCall(delay, fn);
    run(400, () => {
      stations++;
      this.particles.sparkle(W * 0.1, H * 0.6, 0xffd24a, 10);
      this.ctx.audio.playSfx('chain');
    });
    run(800, () => {
      stations++;
      this.spawnForcedSwarm();
    });
    run(1300, () => {
      stations++;
      this.forceSpawnKind('goldschnabel', W * 0.5, H * 0.4, 1);
    });
    run(1800, () => {
      stations++;
      this.particles.confetti(W / 2, H / 2, 30);
      this.ctx.audio.playSfx('combo');
    });
    run(2400, () => {
      stations++;
      this.score += stations * 80;
      this.eventBonuses += stations * 80;
      this.chainReactions += 1;
      this.ctx.gameToUi.emit('toast', { text: `Kettenreaktion! ${stations} Stationen`, kind: 'good' });
    });
    void start;
    void now;
  }

  private spawnForcedSwarm(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    this.swarmCounter += 1;
    const id = this.swarmCounter;
    const cfg = TARGETS.schwarmvogel;
    const fromX = -60;
    const toX = W + 60;
    for (let i = 0; i < 5; i++) {
      const t = new Target(
        this,
        'schwarmvogel',
        cfg,
        {
          kind: 'sine',
          start: { x: fromX, y: H * 0.35 + (i % 2 ? 20 : -20) },
          end: { x: toX, y: H * 0.4 },
          duration: 7000,
          amplitude: 30,
          waves: 2,
          depth: 1
        }
      );
      t.swarmId = id;
      this.targets.push(t);
    }
  }

  private forceSpawnKind(kind: TargetKind, x: number, y: number, scale: number): void {
    const cfg = TARGETS[kind];
    const W = this.scale.width;
    const t = new Target(
      this,
      kind,
      cfg,
      {
        kind: 'bezier',
        start: { x, y },
        end: { x: this.rng.chance(0.5) ? W + 60 : -60, y: this.rng.range(0.2, 0.7) * this.scale.height },
        control1: { x: x + this.rng.range(-100, 100), y: y - 120 },
        duration: 6000,
        depth: 1
      }
    );
    t.setScale(scale);
    this.targets.push(t);
  }

  private scareAnimals(x: number, y: number): void {
    void x;
    void y;
    // launch a couple of fast flatterers
    for (let i = 0; i < 3; i++) this.forceSpawnKind('schnellfeder', this.scale.width / 2, this.scale.height * 0.3, 1);
  }

  private revealHiddenTargets(): void {
    // make any half-visible mist targets fully visible
    for (const t of this.targets) {
      if (t.kind === 'nebelfluesterer') t.setAlpha(1);
    }
    this.forceSpawnKind('nebelfluesterer', this.scale.width / 2, this.scale.height * 0.3, 1);
  }

  // ------------------------------------------------------------------ round end

  private endRound(): void {
    if (this.finished) return;
    this.finished = true;
    this.ctx.audio.playSfx('round_end');
    this.ctx.audio.stopMusic();

    const stats = this.buildStats();
    const previousBest = this.previousBest();
    stats.isPersonalBest = stats.score > previousBest;

    // Save + rewards
    const { xp, coins, newAchievements, newUnlocks } = this.applyRoundToSave(stats, previousBest);
    if (stats.rank === 'SSS' || stats.rank === 'SS') {
      this.ctx.audio.playSfx('record');
    }

    this.ctx.gameToUi.emit('round-end', {
      mode: this.round.mode,
      map: this.round.map,
      score: stats.score,
      shots: stats.shots,
      hits: stats.hits,
      misses: stats.misses,
      perfectHits: stats.perfectHits,
      maxCombo: stats.maxCombo,
      bestHitValue: stats.bestHitValue,
      bestHitTarget: stats.bestHitTarget,
      avgReactionMs: stats.avgReactionMs,
      hitsByTarget: stats.hitsByTarget as Record<string, number>,
      eventBonuses: stats.eventBonuses,
      multikills: stats.multikills,
      chainReactions: stats.chainReactions,
      bossKills: stats.bossKills,
      durationMs: stats.durationMs,
      rank: stats.rank,
      isPersonalBest: stats.isPersonalBest,
      previousBest,
      xpGained: xp,
      coinsGained: coins,
      newAchievements,
      newUnlocks
    });

    this.shutDown();
  }

  private buildStats(): RoundStats {
    const durationMs = this.time.now - this.roundStartMs;
    const avgReactionMs =
      this.reactionSamples.length > 0 ? this.reactionSamples.reduce((a, b) => a + b, 0) / this.reactionSamples.length : 0;
    return buildRoundStats({
      mode: this.round.mode,
      map: this.round.map,
      score: this.score,
      shots: this.shots,
      hits: this.hits,
      misses: this.misses,
      perfectHits: this.perfectHits,
      maxCombo: this.combo.maxCombo,
      bestHitValue: this.bestHitValue,
      bestHitTarget: this.bestHitTarget,
      avgReactionMs,
      reactionSamples: this.reactionSamples.length,
      hitsByTarget: this.hitsByTarget,
      eventBonuses: this.eventBonuses,
      multikills: this.multikills,
      chainReactions: this.chainReactions,
      bossKills: this.bossKills,
      durationMs
    });
  }

  private previousBest(): number {
    const key = highscoreKey(this.round.mode, this.round.map);
    const list = this.ctx.save.highscores[key];
    return list && list.length ? Math.max(...list.map((e) => e.score)) : 0;
  }

  private applyRoundToSave(
    stats: RoundStats,
    _previousBest: number
  ): { xp: number; coins: number; newAchievements: string[]; newUnlocks: string[] } {
    const s = this.ctx.save;
    s.stats.totalRounds += 1;
    s.stats.totalShots += stats.shots;
    s.stats.totalHits += stats.hits;
    s.stats.totalPerfect += stats.perfectHits;
    s.stats.totalScore += stats.score;
    s.stats.bossKills += stats.bossKills;
    s.stats.chainReactions += stats.chainReactions;
    s.stats.bestCombo = Math.max(s.stats.bestCombo, stats.maxCombo);
    s.stats.longestCombo = Math.max(s.stats.longestCombo, stats.maxCombo);
    if (stats.score > s.stats.bestScore) s.stats.bestScore = stats.score;
    if (rankBetter(stats.rank, s.stats.bestRank)) s.stats.bestRank = stats.rank;
    s.stats.roundsByMode[stats.mode] = (s.stats.roundsByMode[stats.mode] ?? 0) + 1;
    s.stats.roundsByMap[stats.map] = (s.stats.roundsByMap[stats.map] ?? 0) + 1;

    // Highscore
    const key = highscoreKey(stats.mode, stats.map);
    const list = s.highscores[key] ?? (s.highscores[key] = []);
    list.push({
      score: stats.score,
      mode: stats.mode,
      map: stats.map,
      rank: stats.rank,
      accuracy: accuracy(stats.hits, stats.shots),
      maxCombo: stats.maxCombo,
      date: Date.now()
    });
    list.sort((a, b) => b.score - a.score);
    s.highscores[key] = list.slice(0, 10);

    // Daily best
    if (this.round.isDaily && this.round.dailyLabel) {
      const best = s.progression.dailyBests[this.round.dailyLabel] ?? 0;
      if (stats.score > best) s.progression.dailyBests[this.round.dailyLabel] = stats.score;
    }

    // XP + coins
    const xp = Math.round(stats.score / 100 + stats.maxCombo * 2 + (stats.isPersonalBest ? 50 : 0));
    const coins = Math.round(stats.score / 500);
    const applied = applyXp(s.progression, xp);
    s.progression.xp = applied.xp;
    s.progression.level = applied.level;
    s.progression.featherCoins += coins;

    // Achievements
    const results = evaluateAchievements(s.stats, s.progression.unlockedAchievements);
    const newAchievements = results.filter((r) => r.done && !s.progression.unlockedAchievements.includes(r.id)).map((r) => r.id);
    for (const id of newAchievements) {
      s.progression.unlockedAchievements.push(id);
      const ach = achievementById(id);
      if (ach) s.progression.featherCoins += ach.reward;
    }

    // Unlocks
    const newUnlocks: string[] = [];
    if (s.progression.level >= 3 && !s.progression.unlockedMaps.includes('sturmklippen')) {
      s.progression.unlockedMaps.push('sturmklippen');
      newUnlocks.push('map:sturmklippen');
    }
    if (s.progression.level >= 5 && !s.progression.unlockedMaps.includes('mondbruch')) {
      s.progression.unlockedMaps.push('mondbruch');
      newUnlocks.push('map:mondbruch');
    }
    if (s.progression.level >= 4 && !s.progression.unlockedModes.includes('endless')) {
      s.progression.unlockedModes.push('endless');
      newUnlocks.push('mode:endless');
    }
    if (s.progression.level >= 2 && !s.progression.unlockedModes.includes('precision')) {
      s.progression.unlockedModes.push('precision');
      newUnlocks.push('mode:precision');
    }

    this.ctx.persist(() => {
      /* save already mutated in-place; force write */
    });

    return { xp, coins, newAchievements, newUnlocks };
  }

  private pushHud(now?: number): void {
    const t = now ?? this.time.now;
    if (t - this.lastHud < 100) return;
    this.lastHud = t;
    const inRound = t >= this.roundStartMs;
    const remaining = this.infinite ? Math.max(0, t - this.roundStartMs) : Math.max(0, this.roundEndMs - t);
    const snap = this.weapon.snapshot(t);
    this.ctx.gameToUi.emit('hud', {
      time: inRound ? Math.ceil(remaining / 1000) : 0,
      score: this.score,
      combo: this.combo.combo,
      multiplier: Math.round((1 + this.combo.combo * 0.12) * 100) / 100,
      ammo: snap.ammo === Infinity ? -1 : snap.ammo,
      magazine: snap.magazineSize,
      reloading: snap.state === 'reloading',
      empty: snap.state === 'empty',
      event: this.activeEvent ? this.activeEvent.id : null,
      bestCombo: this.combo.maxCombo
    });
  }

  private drawCrosshair(time: number): void {
    void time;
    const p = this.input.activePointer;
    const g = this.crosshair;
    g.clear();
    const cx = p.x + Math.cos(this.recoilAngle) * this.recoil * 6;
    const cy = p.y + Math.sin(this.recoilAngle) * this.recoil * 6;
    const color = Number('0x' + this.ctx.settings.crosshairColor.replace('#', ''));
    const perfectMode = this.combo.combo >= 5;
    drawCrosshair(g, cx, cy, this.crosshairSize * (1 - this.recoil * 0.2), this.ctx.settings.highContrast ? 0xffffff : color, perfectMode);
  }

  private drawDebug(now: number): void {
    if (!this.debugOn || !this.debugText) return;
    const fps = this.game.loop.actualFps;
    const activeParticles = this.particles.count;
    this.debugText.setText(
      [
        `FPS ${fps.toFixed(0)}`,
        `Targets ${this.targets.length}`,
        `Particles ${activeParticles}`,
        `Phase ${this.phase().toFixed(2)}`,
        `Difficulty ${this.difficulty.value.toFixed(2)}`,
        `Seed ${this.round.seed}`,
        `Mode ${this.round.mode} / ${this.round.map}`
      ].join('\n')
    );
    if (this.debugHitbox) {
      this.debugHitbox.clear();
      for (const t of this.targets) {
        this.debugHitbox.lineStyle(1, 0x00ff00, 1);
        this.debugHitbox.strokeCircle(t.x, t.y, t.radiusAtDepth);
      }
    }
    void now;
  }

  private setPaused(p: boolean): void {
    if (this.finished) return;
    this.paused = p;
    this.ctx.gameToUi.emit('paused', { paused: p });
    if (p) {
      this.ctx.audio.stopMusic();
      this.ctx.audio.stopAmbient();
      this._pausedAt = this.time.now;
    } else if (this._pausedAt !== undefined) {
      this.ctx.audio.startMusic(0.4);
      this.ctx.audio.startAmbient();
      // shift the round clock so pausing doesn't eat round time
      const delta = this.time.now - this._pausedAt;
      if (delta > 0) {
        this.roundStartMs += delta;
        if (!this.infinite) this.roundEndMs += delta;
        this.eventEndMs += delta;
        this.nextEventAt += delta;
      }
      this._pausedAt = undefined;
    }
  }
  private _pausedAt?: number;

  private restart(): void {
    // ScenePlugin.restart(data?) restarts the CURRENT scene, passing only data
    // (there is no key argument). init() receives this object.
    this.scene.restart({ ctx: this.ctx, round: this.round });
  }

  private shutDown(): void {
    this.particles?.clear();
    this.env?.destroy();
    this.muzzle?.destroy();
    this.crosshair?.destroy();
    this.debugText?.destroy();
    this.debugHitbox?.destroy();
    this.targets.forEach((t) => t.destroy());
    this.targets = [];
    this.input.off('pointerdown', this.onPointerDown);
    this.input.off('pointerup', this.onPointerUp);
    this.input.off('pointermove', this.onPointerMove);
    this.input.off('wheel', this.onWheel);
    this.input.off('gameobjectdown', this.onPropHit);
    this.input.keyboard?.off('keydown-R', this.onReloadKey);
    this.input.keyboard?.off('keydown-M', this.onMuteKey);
    this.input.keyboard?.off('keydown-F1', this.onDebugKey);
    window.removeEventListener('keydown', this._onEscapeCapture, true);
    // NOTE: the uiBus handlers (pause/resume/restart/quit) are intentionally
    // left bound. The results & pause screens are UI-layer panels shown AFTER
    // this round ends, and their buttons (Nochmal / Zum Menü / Weiter) emit
    // those events — so the scene must still listen for them. create() re-binds
    // the same stable arrow-func references, which is idempotent (Set-based).
  }
}

function rankBetter(a: string, b: string): boolean {
  const order = ['D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];
  return order.indexOf(a) > order.indexOf(b);
}
