import Phaser from 'phaser';
import type { HighscoreEntry, PlayerSettings, RunStats, TargetTypeId } from '../core/types';
import { getModeConfig } from '../config/modes';
import { getMapConfig } from '../config/maps';
import { getEventConfig } from '../config/events';
import { BALANCE } from '../config/balance';
import { getTargetConfig } from '../config/targets';
import { getBossConfig, type BossId } from '../config/bosses';
import { getCrosshairConfig, getWeaponSkinConfig } from '../config/cosmetics';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/screen';
import { CHALLENGE_FLAGS, getChallengeConfig } from '../config/challenges';
import { ACHIEVEMENT_FLAGS } from '../config/achievements';

import { SeededRandom } from '../core/rng';
import { SpawnDirector } from '../systems/SpawnDirector';
import { DifficultyDirector } from '../systems/DifficultyDirector';
import { EventSystem } from '../systems/EventSystem';
import { ComboSystem } from '../systems/ComboSystem';
import { WeaponSystem } from '../systems/WeaponSystem';
import { ChainReactionSystem } from '../systems/ChainReactionSystem';
import { calculateHitScore, calculateRank, calculateAccuracy } from '../systems/ScoringSystem';
import type { TrajectoryParams } from '../systems/TrajectorySystem';
import { ParticleManager } from '../systems/ParticleManager';
import { saveManager } from '../systems/SaveManager';
import { evaluateAchievements, evaluateChallenges } from '../systems/AchievementManager';
import { applyXpGain, computeRoundCurrency, computeRoundXp } from '../systems/ProgressionManager';
import { i18n } from '../systems/Localization';

import { Target } from '../entities/Target';
import { TargetPool } from '../entities/TargetPool';
import { EnvironmentObject } from '../entities/EnvironmentObject';
import { Boss } from '../entities/Boss';

import { gameBridge, type StartRoundOptions } from '../ui/GameBridge';
import { registerGameCanvas } from '../ui/coords';
import type { AudioManager } from '../systems/AudioManager';

const BOSS_IDS: BossId[] = ['armored', 'acrobat', 'night'];

interface FormationGroup {
  ids: Set<string>;
  total: number;
  spawnedAt: number;
}

type ResolvedRoundOptions = StartRoundOptions & { seed: number };

export class GameScene extends Phaser.Scene {
  private opts!: ResolvedRoundOptions;
  private modeConfig = getModeConfig('classic');
  private mapConfig = getMapConfig('nebelmoor');
  private settings!: PlayerSettings;
  private audio!: AudioManager;

  private rng!: SeededRandom;
  private spawnDirector!: SpawnDirector;
  private difficultyDirector!: DifficultyDirector;
  private eventSystem!: EventSystem;
  private comboSystem!: ComboSystem;
  private weapon!: WeaponSystem;
  private chainSystem!: ChainReactionSystem;
  private particles!: ParticleManager;
  private targetPool!: TargetPool;

  private envObjects: EnvironmentObject[] = [];
  private boss: Boss | null = null;
  private bossIllusionGraveyard: Phaser.GameObjects.Sprite[] = [];

  private crosshair!: Phaser.GameObjects.Sprite;
  private weaponSprite!: Phaser.GameObjects.Sprite;
  private muzzleFlash!: Phaser.GameObjects.Sprite;

  private stats!: RunStats;
  private roundFlags = new Set<string>();
  private consecutiveHitsNoMiss = 0;
  private consecutivePerfectHits = 0;
  private missStreak = 0;
  private lastHitAt = -Infinity;
  private multikillChain = 0;
  private lastEnvHitAt = -Infinity;
  private formations = new Map<string, FormationGroup>();

  private simTime = 0;
  private slowMoUntil = 0;
  private slowMoFactor = 1;
  private envMultiplierUntil = 0;
  private envMultiplierValue = 1;

  private startedAtWall = 0;
  private elapsedMs = 0;
  private remainingMs: number | null = null;
  private nextSpawnAt = 0;
  private paused = false;
  private ended = false;

  private discoveredSecrets = new Set<string>();
  private totalSecrets = 0;

  private unsubs: Array<() => void> = [];

  constructor() {
    super('GameScene');
  }

  init(data: StartRoundOptions & { audio: AudioManager }): void {
    const seed = data.seed ?? Math.floor(Math.random() * 0xffffffff);
    this.opts = { ...data, seed };
    this.modeConfig = getModeConfig(data.mode);
    this.mapConfig = getMapConfig(data.map);
    this.audio = data.audio;
    this.settings = saveManager.load().settings;

    this.rng = new SeededRandom(seed);
    this.spawnDirector = new SpawnDirector(seed);
    this.difficultyDirector = new DifficultyDirector();
    this.eventSystem = new EventSystem(seed, data.map);
    this.comboSystem = new ComboSystem(this.modeConfig.comboWindowMs, this.modeConfig.missPenaltyMultiplier);
    this.weapon = new WeaponSystem({
      magazineSize: BALANCE.weapon.magazineSize,
      reloadDurationMs: BALANCE.weapon.reloadDurationMs,
      autoReload: this.modeConfig.autoReload,
      limitedAmmo: this.modeConfig.limitedAmmo,
      reserveMagazines: BALANCE.weapon.precisionModeMaxMagazines,
    });
    this.chainSystem = new ChainReactionSystem(data.map);

    this.stats = {
      score: 0,
      hits: 0,
      misses: 0,
      shotsFired: 0,
      perfectHits: 0,
      highestCombo: 0,
      mostValuableHit: 0,
      reactionTimesMs: [],
      targetTypesHit: {},
      eventBonusPoints: 0,
      chainReactionsTriggered: 0,
      bossesDefeated: 0,
      startedAt: Date.now(),
      durationMs: 0,
    };
    this.roundFlags.clear();
    this.consecutiveHitsNoMiss = 0;
    this.consecutivePerfectHits = 0;
    this.missStreak = 0;
    this.multikillChain = 0;
    this.formations.clear();
    this.discoveredSecrets.clear();
    this.envObjects = [];
    this.boss = null;
    this.simTime = 0;
    this.slowMoUntil = 0;
    this.envMultiplierUntil = 0;
    this.remainingMs = this.modeConfig.durationMs;
    this.elapsedMs = 0;
    this.nextSpawnAt = 0;
    this.paused = false;
    this.ended = false;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(this.mapConfig.skyColorTop);
    registerGameCanvas(this.game.canvas);

    this.buildParallax();
    this.buildEnvironmentObjects();
    this.particles = new ParticleManager(this);
    this.particles.setDensity(this.settings.particleDensity);
    this.targetPool = new TargetPool(this, 18);

    this.buildWeaponAndCrosshair();
    this.input.setDefaultCursor('none');

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown()) {
        this.tryReload();
      } else {
        this.tryFire(pointer.x, pointer.y);
      }
    });
    this.input.mouse?.disableContextMenu();
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this.crosshair.setPosition(pointer.x, pointer.y);
    });

    const keyboard = this.input.keyboard;
    if (keyboard) {
      keyboard.on('keydown', (e: KeyboardEvent) => {
        if (this.matchesKeybind(e, this.settings.keybindReload)) this.tryReload();
        if (this.matchesKeybind(e, this.settings.keybindPause)) this.togglePause();
      });
    }

    this.audio.startAmbience(this.mapConfig.ambienceKey);
    this.audio.startMusic();

    this.bindBridgeListeners();
    gameBridge.emit('gameReady', undefined);
    gameBridge.emit('pauseStateChanged', { paused: false });

    this.startedAtWall = this.time.now;
  }

  // -------------------------------------------------------------------
  // Setup
  // -------------------------------------------------------------------
  private buildParallax(): void {
    for (const layer of this.mapConfig.parallaxLayers) {
      const y = layer.yAnchor * GAME_HEIGHT;
      const img = this.add.tileSprite(0, y, GAME_WIDTH, GAME_HEIGHT - y, `layer_${layer.key}`);
      img.setOrigin(0, 0);
      img.setTint(layer.tint);
      img.setDepth(layer.depth);
      img.setData('scrollFactor', layer.scrollFactor);
    }
    const vignette = this.add.graphics();
    vignette.fillStyle(this.mapConfig.fogColor, 0);
    vignette.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    vignette.setDepth(-60);
    vignette.setName('weatherOverlay');
  }

  private buildEnvironmentObjects(): void {
    for (const placement of this.mapConfig.environmentObjects) {
      const obj = new EnvironmentObject(this, placement, GAME_WIDTH, GAME_HEIGHT);
      this.envObjects.push(obj);
      if (obj.isHiddenSecret) this.totalSecrets++;
    }
  }

  private buildWeaponAndCrosshair(): void {
    const skin = getWeaponSkinConfig(saveManager.load().unlocks.equippedWeaponSkin);
    this.weaponSprite = this.add.sprite(GAME_WIDTH / 2, GAME_HEIGHT - 40, `weapon_field`);
    void skin;
    this.weaponSprite.setOrigin(0.15, 0.5);
    this.weaponSprite.setScale(1.4);
    this.weaponSprite.setDepth(2000);

    this.muzzleFlash = this.add.sprite(GAME_WIDTH / 2 + 150, GAME_HEIGHT - 60, 'muzzle_flash');
    this.muzzleFlash.setDepth(2001);
    this.muzzleFlash.setVisible(false);

    const crosshairCfg = getCrosshairConfig(saveManager.load().unlocks.equippedCrosshair);
    const gfx = this.add.graphics();
    const size = 40;
    const color = Phaser.Display.Color.HexStringToColor(this.settings.crosshairColor || crosshairCfg.color).color;
    gfx.lineStyle(3, color, 1);
    gfx.strokeCircle(size / 2, size / 2, size / 2 - 4);
    gfx.lineBetween(size / 2, 2, size / 2, 12);
    gfx.lineBetween(size / 2, size - 12, size / 2, size - 2);
    gfx.lineBetween(2, size / 2, 12, size / 2);
    gfx.lineBetween(size - 12, size / 2, size - 2, size / 2);
    gfx.generateTexture('crosshair_live', size, size);
    gfx.destroy();

    this.crosshair = this.add.sprite(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'crosshair_live');
    this.crosshair.setDepth(2100);
    this.crosshair.setScale(this.settings.crosshairSize);
  }

  // -------------------------------------------------------------------
  // Bridge listeners (UI -> Game)
  // -------------------------------------------------------------------
  private bindBridgeListeners(): void {
    this.unsubs.push(gameBridge.on('pauseRequest', () => this.setPaused(true)));
    this.unsubs.push(gameBridge.on('resumeRequest', () => this.setPaused(false)));
    this.unsubs.push(
      gameBridge.on('settingsChanged', () => {
        this.settings = saveManager.load().settings;
        this.particles.setDensity(this.settings.particleDensity);
        this.crosshair.setScale(this.settings.crosshairSize);
      }),
    );
  }

  private matchesKeybind(e: KeyboardEvent, bind: string): boolean {
    const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
    return key === bind;
  }

  private togglePause(): void {
    this.setPaused(!this.paused);
  }

  private setPaused(paused: boolean): void {
    if (this.ended || this.paused === paused) return;
    this.paused = paused;
    gameBridge.emit('pauseStateChanged', { paused });
    if (paused) {
      this.audio.setMusicIntensity(0);
      this.scene.pause();
    } else {
      this.scene.resume();
    }
  }

  // -------------------------------------------------------------------
  // Update loop
  // -------------------------------------------------------------------
  update(time: number, delta: number): void {
    if (this.paused || this.ended) return;

    this.elapsedMs += delta;
    if (this.remainingMs !== null) {
      this.remainingMs = Math.max(0, this.remainingMs - delta);
    }

    const timeScale = time < this.slowMoUntil ? this.slowMoFactor : 1;
    this.simTime += delta * timeScale;

    this.weapon.update(time);
    const comboSnap = this.comboSystem.tick(time);

    this.updateParallax(delta);
    this.updateWeatherOverlay();
    this.updateSpawning(time);
    this.updateTargets(time, delta);
    this.updateBoss(time);
    this.updateEvents(time);
    this.updateDifficulty(time, comboSnap.count);
    this.updateChallengeHud();

    gameBridge.emit('hudUpdate', {
      timeRemainingMs: this.remainingMs,
      score: this.stats.score,
      comboCount: comboSnap.count,
      comboMultiplier: comboSnap.multiplier,
      comboWindowRemaining01: comboSnap.windowRemaining01,
      ammo: this.weapon.ammo,
      magazineSize: this.weapon.magazineSize,
      weaponStatus: this.weapon.getStatus(time),
      reloadProgress01: this.weapon.reloadProgress01(time),
    });

    if (this.remainingMs !== null && this.remainingMs <= 0) {
      this.endRound();
    }
  }

  private updateParallax(delta: number): void {
    for (const child of this.children.list) {
      if (child instanceof Phaser.GameObjects.TileSprite) {
        const factor = (child.getData('scrollFactor') as number) ?? 0;
        child.tilePositionX += factor * delta * 0.02;
      }
    }
  }

  private updateWeatherOverlay(): void {
    const overlay = this.children.getByName('weatherOverlay') as Phaser.GameObjects.Graphics | null;
    if (!overlay) return;
    const active = this.eventSystem.getActive();
    const cfg = active ? getEventConfig(active) : null;
    const fogAlpha = cfg ? cfg.fogDensity * 0.5 : 0;
    overlay.clear();
    if (fogAlpha > 0) {
      overlay.fillStyle(this.mapConfig.fogColor, fogAlpha);
      overlay.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    }
  }

  // -------------------------------------------------------------------
  // Spawning
  // -------------------------------------------------------------------
  private roundProgress01(): number {
    if (this.modeConfig.durationMs !== null) {
      return Phaser.Math.Clamp(this.elapsedMs / this.modeConfig.durationMs, 0, 1);
    }
    const cycle = 150000;
    return (this.elapsedMs % cycle) / cycle;
  }

  private updateSpawning(time: number): void {
    if (this.boss) return; // no ambient spawns while a boss is active
    if (time < this.nextSpawnAt) return;
    if (this.targetPool.activeCount() >= BALANCE.spawn.maxConcurrentTargets) {
      this.nextSpawnAt = time + 200;
      return;
    }

    const activeEvent = this.eventSystem.getActive();
    const eventCfg = activeEvent ? getEventConfig(activeEvent) : null;
    const ctx = {
      mapId: this.opts.map,
      activeEvent,
      progress01: this.roundProgress01(),
      difficultyFactor: this.difficultyDirector.getFactor(),
      modeSpawnRateMultiplier: this.modeConfig.spawnRateMultiplier,
      eventSpawnRateMultiplier: eventCfg?.spawnRateMultiplier ?? 1,
    };

    const targetId = this.spawnDirector.pickTargetType(ctx);
    if (targetId === 'schwarmvogel') {
      this.spawnFormation();
    } else {
      this.spawnSingle(targetId);
    }
    this.nextSpawnAt = time + this.spawnDirector.nextSpawnDelayMs(ctx);
  }

  private buildEntrySegment(edge: 'left' | 'right' | 'top' | 'bottom', speed: number) {
    const pad = 100;
    const rng = this.rng;
    let start: { x: number; y: number };
    let end: { x: number; y: number };
    switch (edge) {
      case 'left':
        start = { x: -pad, y: rng.range(150, GAME_HEIGHT * 0.75) };
        end = { x: GAME_WIDTH + pad, y: rng.range(150, GAME_HEIGHT * 0.75) };
        break;
      case 'right':
        start = { x: GAME_WIDTH + pad, y: rng.range(150, GAME_HEIGHT * 0.75) };
        end = { x: -pad, y: rng.range(150, GAME_HEIGHT * 0.75) };
        break;
      case 'top':
        start = { x: rng.range(100, GAME_WIDTH - 100), y: -pad };
        end = { x: rng.range(100, GAME_WIDTH - 100), y: GAME_HEIGHT * 0.7 };
        break;
      default:
        start = { x: rng.range(100, GAME_WIDTH - 100), y: GAME_HEIGHT + pad };
        end = { x: rng.range(100, GAME_WIDTH - 100), y: GAME_HEIGHT * 0.4 };
    }
    const distance = Phaser.Math.Distance.Between(start.x, start.y, end.x, end.y) || 400;
    const durationMs = Math.max(1200, (distance / speed) * 1000);
    return { start, end, durationMs };
  }

  private spawnSingle(targetId: TargetTypeId, formationOffset?: { x: number; y: number }, forceEdge?: 'left' | 'right' | 'top' | 'bottom'): Target {
    const config = getTargetConfig(targetId);
    const edge = forceEdge ?? this.spawnDirector.pickEntryEdge();
    const difficultyFactor = this.difficultyDirector.getFactor();
    const speed = config.behavior.baseSpeed * difficultyFactor + this.rng.range(-config.behavior.speedVariance, config.behavior.speedVariance);
    const segment = this.buildEntrySegment(edge, Math.max(60, speed));

    const params: TrajectoryParams = {
      kind: config.behavior.trajectory,
      start: segment.start,
      end: segment.end,
      control1: { x: segment.start.x + (segment.end.x - segment.start.x) * 0.3, y: segment.start.y - 150 },
      control2: { x: segment.start.x + (segment.end.x - segment.start.x) * 0.7, y: segment.end.y - 150 },
      amplitude: this.rng.range(30, 80),
      frequency: this.rng.range(1, 2.4),
      durationMs: segment.durationMs,
      spiralTurns: this.rng.range(2, 4),
      spiralRadius: this.rng.range(40, 90),
      formationOffset: formationOffset ?? { x: 0, y: 0 },
      windStrength: this.currentWindStrength(),
    };

    return this.targetPool.spawn(config, params, this.simTime);
  }

  private spawnFormation(): void {
    const config = getTargetConfig('schwarmvogel');
    const size = config.behavior.formationSize ?? 5;
    const edge = this.spawnDirector.pickEntryEdge();
    const groupId = `f${this.simTime}_${Math.floor(this.rng.next() * 1000)}`;
    const group: FormationGroup = { ids: new Set(), total: size, spawnedAt: this.time.now };
    this.formations.set(groupId, group);

    for (let i = 0; i < size; i++) {
      const row = i % 2 === 0 ? -1 : 1;
      const col = Math.ceil(i / 2);
      const offset = { x: -col * 55, y: row * col * 30 };
      const target = this.spawnSingle('schwarmvogel', offset, edge);
      target.setData('formationId', groupId);
      group.ids.add(target.instanceId);
    }
  }

  private currentWindStrength(): number {
    const active = this.eventSystem.getActive();
    if (!active) return 0;
    const cfg = getEventConfig(active);
    return cfg.windStrength * 0.4;
  }

  // -------------------------------------------------------------------
  // Target / boss ticking
  // -------------------------------------------------------------------
  private updateTargets(_time: number, delta: number): void {
    for (const target of this.targetPool.getActive()) {
      target.tick(this.simTime, delta, 140, GAME_WIDTH, GAME_HEIGHT);
    }
  }

  private updateBoss(time: number): void {
    if (!this.boss) return;
    this.boss.tick(this.simTime);
    gameBridge.emit('bossStatus', {
      active: true,
      nameKey: this.boss.config.nameKey,
      healthFraction01:
        (this.boss.hp + this.boss.armorLayersRemaining) / (this.boss.config.maxHealth + this.boss.config.armorLayers),
    });
    void time;
  }

  // -------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------
  private updateEvents(time: number): void {
    const transition = this.eventSystem.update(time, this.roundProgress01());
    if (transition.justEnded) {
      gameBridge.emit('eventAnnounce', { id: transition.justEnded, active: false });
      this.audio.setMusicIntensity(0.3);
    }
    if (transition.justStarted) {
      const cfg = getEventConfig(transition.justStarted);
      gameBridge.emit('eventAnnounce', { id: transition.justStarted, active: true });
      gameBridge.emit('centerBanner', { textKey: cfg.announceKey });
      this.audio.setMusicIntensity(0.4 + cfg.musicIntensityDelta);
      this.cameraShake(0.15);

      if (transition.justStarted === 'miniBoss' && !this.boss) {
        this.spawnBoss();
      }
      if (transition.justStarted === 'goldenSwarm') {
        this.spawnFormation();
      }
    }
  }

  private spawnBoss(): void {
    const id = BOSS_IDS[Math.floor(this.rng.next() * BOSS_IDS.length)] as BossId;
    this.boss = new Boss(this, id, GAME_WIDTH, GAME_HEIGHT, this.opts.seed + 7);
    this.audio.playBossIntro();
    this.cameraShake(0.6);
    const cfg = getBossConfig(id);
    gameBridge.emit('centerBanner', { textKey: cfg.introKey });
    this.targetPool.despawnAll();
  }

  // -------------------------------------------------------------------
  // Difficulty
  // -------------------------------------------------------------------
  private updateDifficulty(time: number, comboCount: number): void {
    const accuracy = calculateAccuracy(this.stats.hits, this.stats.shotsFired);
    const timeRemainingFraction =
      this.remainingMs !== null && this.modeConfig.durationMs
        ? this.remainingMs / this.modeConfig.durationMs
        : 0.5;
    this.difficultyDirector.update(time, {
      accuracy: this.stats.shotsFired > 4 ? accuracy : BALANCE.difficultyDirector.accuracyTarget,
      comboCount,
      avgReactionTimeMs: 500,
      missStreak: this.missStreak,
      timeRemainingFraction,
    });
  }

  private updateChallengeHud(): void {
    const payload = [];
    if (!this.roundFlags.has(CHALLENGE_FLAGS.NO_MISS_20)) {
      payload.push({ labelKey: 'challenge.no_miss_20.name', progress01: Math.min(1, this.consecutiveHitsNoMiss / 20) });
    }
    if (!this.roundFlags.has(CHALLENGE_FLAGS.PERFECT_STREAK_5)) {
      payload.push({ labelKey: 'challenge.perfect_5.name', progress01: Math.min(1, this.consecutivePerfectHits / 5) });
    }
    gameBridge.emit('challengeHud', payload.slice(0, 2));
  }

  // -------------------------------------------------------------------
  // Firing / hit detection
  // -------------------------------------------------------------------
  private tryFire(x: number, y: number): void {
    if (this.paused || this.ended) return;
    if (!this.audio.isInitialized()) this.audio.init();
    this.audio.resume();

    const time = this.time.now;
    const result = this.weapon.fire(time);
    if (!result.fired) {
      if (this.weapon.getStatus(time) === 'empty') this.audio.playEmptyClick();
      return;
    }

    this.stats.shotsFired++;
    this.audio.playShot(Math.floor(this.rng.next() * 3));
    this.recoilWeapon();
    this.crosshairPunch();
    this.muzzleFlashPlay();
    this.particles.smoke(GAME_WIDTH / 2 + 150, GAME_HEIGHT - 60, 2);

    if (result.autoReloadTriggered) this.audio.playReloadStart();

    this.resolveHit(x, y, time);
  }

  private tryReload(): void {
    const time = this.time.now;
    if (this.weapon.startReload(time)) {
      this.audio.playReloadStart();
    }
  }

  private resolveHit(x: number, y: number, time: number): void {
    // 1. Boss (and its illusions) take priority — always foreground.
    if (this.boss) {
      const distReal = Phaser.Math.Distance.Between(x, y, this.boss.x, this.boss.y);
      if (distReal <= this.boss.getHitRadiusPx()) {
        this.handleBossHit(distReal, x, y, time);
        return;
      }
      for (const illusion of this.boss.getIllusionSprites()) {
        const d = Phaser.Math.Distance.Between(x, y, illusion.x, illusion.y);
        if (d <= this.boss.getHitRadiusPx()) {
          this.particles.feathers(x, y, 6);
          gameBridge.emit('scorePopup', { x, y, points: 0, perfect: false, label: i18n.t('popup.decoyHit') });
          this.registerMiss(time, x, y);
          return;
        }
      }
    }

    // 2. Targets, nearest/foreground-most first.
    const candidates = this.targetPool
      .getActive()
      .map((t) => ({ t, d: Phaser.Math.Distance.Between(x, y, t.x, t.y), r: t.getHitRadiusPx() }))
      .filter((c) => c.d <= c.r)
      .sort((a, b) => b.t.depth - a.t.depth);

    if (candidates.length > 0) {
      this.handleTargetHit(candidates[0]!.t, x, y, time);
      return;
    }

    // 3. Environment objects.
    for (const obj of this.envObjects) {
      const d = Phaser.Math.Distance.Between(x, y, obj.x, obj.y);
      if (d <= obj.getHitRadiusPx()) {
        this.handleEnvironmentHit(obj, time);
        return;
      }
    }

    // 4. Miss.
    this.registerMiss(time, x, y);
  }

  private registerMiss(time: number, x: number, y: number): void {
    this.stats.misses++;
    this.consecutiveHitsNoMiss = 0;
    this.consecutivePerfectHits = 0;
    this.missStreak++;
    this.multikillChain = 0;
    this.comboSystem.registerMiss(time);
    this.audio.playMiss();
    this.boss?.registerMiss();

    for (const target of this.targetPool.getActive()) {
      const d = Phaser.Math.Distance.Between(x, y, target.x, target.y);
      if (d <= target.getHitRadiusPx() * 2.2) {
        target.triggerFlee(this.simTime, GAME_WIDTH, GAME_HEIGHT);
      }
    }
  }

  private handleTargetHit(target: Target, x: number, y: number, time: number): void {
    const distance = Phaser.Math.Distance.Between(x, y, target.x, target.y);
    const hitRadius = target.getHitRadiusPx();
    const perfectRadius = target.getPerfectRadiusPx();
    const precision01 = Phaser.Math.Clamp(1 - distance / hitRadius, 0, 1);
    const isPerfect = distance <= perfectRadius;
    const config = target.config;

    if (config.id === 'taeuscher') {
      this.handleDecoyHit(target, x, y, time);
      return;
    }

    const { killed, armorBroke } = target.applyHit();
    if (armorBroke) {
      this.audio.playArmorBreak();
      this.particles.dust(x, y, 8);
    }

    if (!killed) {
      this.particles.spark(x, y, 4);
      return;
    }

    this.finalizeKill(target, x, y, time, distance, precision01, isPerfect);
  }

  private handleDecoyHit(target: Target, x: number, y: number, time: number): void {
    this.stats.hits++;
    this.audio.playDecoy();
    this.comboSystem.registerMiss(time);
    this.missStreak++;
    this.consecutiveHitsNoMiss = 0;
    this.particles.feathers(x, y, 6, 0xffe08a);
    gameBridge.emit('scorePopup', { x, y, points: 0, perfect: false, label: i18n.t('popup.decoyHit') });
    gameBridge.emit('centerBanner', { textKey: 'popup.decoyHit' });
    target.despawn('killed');
  }

  private finalizeKill(
    target: Target,
    x: number,
    y: number,
    time: number,
    distance: number,
    precision01: number,
    isPerfect: boolean,
  ): void {
    const config = target.config;
    this.stats.hits++;
    this.consecutiveHitsNoMiss++;
    this.missStreak = 0;
    if (isPerfect) {
      this.stats.perfectHits++;
      this.consecutivePerfectHits++;
    } else {
      this.consecutivePerfectHits = 0;
    }

    const reactionMs = time - target.spawnedAt;
    this.stats.reactionTimesMs.push(Math.max(0, reactionMs));

    const comboSnap = this.comboSystem.registerHit(time);
    this.stats.highestCombo = Math.max(this.stats.highestCombo, comboSnap.count);

    const depth01 = target.getCurrentDepth01();
    const activeEvent = this.eventSystem.getActive();
    const eventCfg = activeEvent ? getEventConfig(activeEvent) : null;
    const envMultiplier = time < this.envMultiplierUntil ? this.envMultiplierValue : 1;
    const eventMultiplier = (eventCfg?.scoreMultiplier ?? 1) * envMultiplier;

    const { total, breakdown } = calculateHitScore({
      baseScore: config.baseScore,
      speedFactor: Phaser.Math.Clamp(config.behavior.baseSpeed / 180, 0.6, 1.8),
      depthFactor: 1 + (1 - depth01) * 0.5,
      sizeFactor: Phaser.Math.Clamp(34 / config.bodyRadius, 0.7, 1.8),
      precision01,
      comboMultiplier: comboSnap.multiplier,
      eventMultiplier,
      timeRemainingFraction:
        this.remainingMs !== null && this.modeConfig.durationMs ? this.remainingMs / this.modeConfig.durationMs : 0.5,
      isPerfect,
    });
    void breakdown;

    let bonus = 0;
    let bannerKey: string | null = null;

    // Longshot: background-layer kill
    if (depth01 < 0.3) {
      bonus += BALANCE.scoring.longshotBonus;
      bannerKey = 'popup.longshot';
    }

    // Multikill chain
    if (time - this.lastHitAt <= BALANCE.scoring.multikillWindowMs) {
      this.multikillChain++;
    } else {
      this.multikillChain = 1;
    }
    this.lastHitAt = time;
    if (this.multikillChain >= 2) {
      bonus += BALANCE.scoring.multikillBonusPerExtra * (this.multikillChain - 1);
      bannerKey = 'popup.multikill';
    }

    // Trickshot: kill shortly after an environment interaction
    if (time - this.lastEnvHitAt < 700) {
      bonus += BALANCE.scoring.trickshotBonus;
      bannerKey = 'popup.trickshot';
      this.lastEnvHitAt = -Infinity;
    }

    // No-miss streak milestone
    if (
      this.consecutiveHitsNoMiss > 0 &&
      this.consecutiveHitsNoMiss % BALANCE.scoring.noMissStreakBonusEvery === 0
    ) {
      bonus += BALANCE.scoring.noMissStreakBonus;
      bannerKey = 'popup.noMissStreak';
    }
    if (this.consecutiveHitsNoMiss >= 20) this.roundFlags.add(ACHIEVEMENT_FLAGS.NO_MISS_20);
    if (this.consecutivePerfectHits >= 5) this.roundFlags.add(ACHIEVEMENT_FLAGS.PERFECT_STREAK_5);
    if (config.id === 'goldschnabel' && activeEvent === 'storm') this.roundFlags.add(ACHIEVEMENT_FLAGS.GOLD_DURING_STORM);

    const finalPoints = total + bonus;
    this.stats.score += finalPoints;
    this.stats.mostValuableHit = Math.max(this.stats.mostValuableHit, finalPoints);
    this.stats.targetTypesHit[config.id] = (this.stats.targetTypesHit[config.id] ?? 0) + 1;
    this.stats.eventBonusPoints += Math.round(config.baseScore * (eventMultiplier - 1));

    gameBridge.emit('scorePopup', { x, y, points: finalPoints, perfect: isPerfect });
    if (bannerKey) {
      gameBridge.emit('centerBanner', { textKey: bannerKey, params: { count: this.multikillChain } });
    }

    this.audio.playHit(isPerfect);
    if (isPerfect) this.particles.glowPop(x, y);
    this.particles.feathers(x, y, isPerfect ? 16 : 9, config.colorPrimary);
    if (config.id === 'goldschnabel') {
      this.audio.playRareTarget();
      this.particles.ring(x, y);
    }
    if (isPerfect || config.id === 'goldschnabel') this.triggerHitstop(60);
    this.cameraShake(isPerfect ? 0.22 : 0.12);

    if ((this.stats.hits % 5) === 0) this.audio.playComboMilestone(comboSnap.count);

    // Formation completion check
    const formationId = target.getData('formationId') as string | undefined;
    if (formationId) {
      const group = this.formations.get(formationId);
      if (group) {
        group.ids.delete(target.instanceId);
        if (group.ids.size === 0) {
          this.stats.score += BALANCE.scoring.swarmBonusPerBird * group.total;
          gameBridge.emit('centerBanner', { textKey: 'popup.swarmBonus' });
          this.particles.confetti(x, y, 20);
          if (time - group.spawnedAt <= 3000) this.roundFlags.add(ACHIEVEMENT_FLAGS.SWARM_IN_3S);
          this.formations.delete(formationId);
        }
      }
    }

    target.despawn('killed');
    void distance;
  }

  private handleBossHit(distance: number, x: number, y: number, time: number): void {
    const boss = this.boss;
    if (!boss) return;
    const precision01 = Phaser.Math.Clamp(1 - distance / boss.getHitRadiusPx(), 0, 1);
    const isPerfect = distance <= boss.getPerfectRadiusPx();
    const { killed, armorBroke } = boss.applyHit();
    this.audio.playBossHit();
    this.particles.feathers(x, y, 10, boss.config.textureKey === 'boss_armored' ? 0x8b5a3c : undefined);
    this.cameraShake(0.3);

    const comboSnap = this.comboSystem.registerHit(time);
    this.stats.hits++;
    this.stats.highestCombo = Math.max(this.stats.highestCombo, comboSnap.count);
    if (isPerfect) this.stats.perfectHits++;

    const basePoints = armorBroke ? 120 : 220;
    const points = Math.round(basePoints * (1 + precision01 * 0.4) * comboSnap.multiplier);
    this.stats.score += points;
    this.stats.mostValuableHit = Math.max(this.stats.mostValuableHit, points);
    gameBridge.emit('scorePopup', { x, y, points, perfect: isPerfect });

    if (killed) {
      this.stats.score += boss.config.scoreReward;
      this.stats.bossesDefeated++;
      this.audio.playBossDefeat();
      gameBridge.emit('centerBanner', { textKey: 'popup.bossDefeated' });
      this.particles.confetti(boss.x, boss.y, 50);
      this.cameraShake(0.8);
      if (boss.wasHitWithoutMiss) this.roundFlags.add(ACHIEVEMENT_FLAGS.BOSS_NO_MISS);
      gameBridge.emit('bossStatus', { active: false });
      boss.destroy();
      this.boss = null;
    }
  }

  private handleEnvironmentHit(obj: EnvironmentObject, time: number): void {
    obj.playHitPunch();
    this.particles.dust(obj.x, obj.y, 5);
    this.audio.playHit(false);

    if (obj.isHiddenSecret && !obj.found) {
      this.discoveredSecrets.add(obj.placement.id);
      if (this.discoveredSecrets.size >= this.totalSecrets && this.totalSecrets > 0) {
        this.roundFlags.add(ACHIEVEMENT_FLAGS.ALL_HIDDEN_FOUND);
      }
    }

    const canReward = obj.canTrigger(time);
    if (canReward) {
      obj.markTriggered(time);
      this.stats.score += obj.behavior.points;
      gameBridge.emit('scorePopup', { x: obj.x, y: obj.y, points: obj.behavior.points, perfect: false });
      this.applyEnvironmentEffect(obj, time);
      this.lastEnvHitAt = time;
    }

    const chainDef = this.chainSystem.tryTrigger(obj.placement.id);
    if (chainDef) {
      this.stats.chainReactionsTriggered++;
      this.playChainSequence(chainDef, time);
      if (chainDef.stations.length >= 5) this.roundFlags.add(ACHIEVEMENT_FLAGS.CHAIN_5);
    }
  }

  private applyEnvironmentEffect(obj: EnvironmentObject, time: number): void {
    switch (obj.behavior.effect) {
      case 'slowTime':
        this.slowMoUntil = time + 3000;
        this.slowMoFactor = 0.45;
        this.particles.smoke(obj.x, obj.y - 20, 6);
        break;
      case 'bonusTime':
        if (this.remainingMs !== null) this.remainingMs += 6000;
        break;
      case 'multiplier':
        this.envMultiplierUntil = time + 5000;
        this.envMultiplierValue = 1.5;
        break;
      case 'scareAnimals':
        for (const target of this.targetPool.getActive()) target.triggerFlee(this.simTime, GAME_WIDTH, GAME_HEIGHT);
        break;
      case 'secretAchievement':
      case 'none':
      default:
        break;
    }
  }

  private playChainSequence(def: ReturnType<ChainReactionSystem['tryTrigger']>, time: number): void {
    if (!def) return;
    this.audio.playChainReaction();
    gameBridge.emit('centerBanner', { textKey: 'popup.chainReaction' });

    def.stations.forEach((station, idx) => {
      this.time.delayedCall(station.delayMs, () => {
        const obj = this.envObjects.find((o) => o.placement.id === station.objectId);
        if (obj) {
          obj.playHitPunch();
          this.particles.dust(obj.x, obj.y, 6);
        }
        if (idx === def.stations.length - 1) {
          this.applyChainReward(def, obj);
        }
      });
    });
    this.stats.score += def.scoreBonus;
    void time;
  }

  private applyChainReward(
    def: NonNullable<ReturnType<ChainReactionSystem['tryTrigger']>>,
    lastObj: EnvironmentObject | undefined,
  ): void {
    const pos = lastObj ? { x: lastObj.x, y: lastObj.y } : { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2 };
    switch (def.reward) {
      case 'spawnRareSwarm':
        this.spawnFormation();
        this.particles.confetti(pos.x, pos.y, 20);
        break;
      case 'revealHiddenObject':
        if (lastObj?.isHiddenSecret) {
          lastObj.sprite.setAlpha(1);
        }
        this.particles.glowPop(pos.x, pos.y);
        break;
      case 'bonusTime':
        if (this.remainingMs !== null) this.remainingMs += 8000;
        break;
      case 'timeSlow':
        this.slowMoUntil = this.time.now + 3500;
        this.slowMoFactor = 0.4;
        break;
      case 'scoreMultiplier':
        this.envMultiplierUntil = this.time.now + 6000;
        this.envMultiplierValue = 1.6;
        break;
      case 'startleFlee':
        for (const target of this.targetPool.getActive()) target.triggerFlee(this.simTime, GAME_WIDTH, GAME_HEIGHT);
        break;
      default:
        break;
    }
  }

  // -------------------------------------------------------------------
  // Visual feedback helpers
  // -------------------------------------------------------------------
  private recoilWeapon(): void {
    this.tweens.add({
      targets: this.weaponSprite,
      x: this.weaponSprite.x - 18,
      angle: -4,
      duration: 60,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
  }

  private crosshairPunch(): void {
    this.tweens.add({
      targets: this.crosshair,
      scale: this.settings.crosshairSize * 1.3,
      duration: 60,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
  }

  private muzzleFlashPlay(): void {
    this.muzzleFlash.setVisible(true);
    this.muzzleFlash.setAlpha(1);
    this.muzzleFlash.setScale(0.8 + Math.random() * 0.4);
    this.tweens.add({
      targets: this.muzzleFlash,
      alpha: 0,
      duration: 70,
      onComplete: () => this.muzzleFlash.setVisible(false),
    });
  }

  private cameraShake(strength01: number): void {
    if (this.settings.reducedMotion) return;
    const intensity = 0.006 * strength01 * Math.max(0.1, this.settings.screenShakeIntensity);
    this.cameras.main.shake(120, intensity);
  }

  private triggerHitstop(ms: number): void {
    if (this.settings.reducedMotion) return;
    this.time.timeScale = 0.05;
    this.time.delayedCall(ms, () => {
      this.time.timeScale = 1;
    });
  }

  // -------------------------------------------------------------------
  // Round end
  // -------------------------------------------------------------------
  private endRound(): void {
    if (this.ended) return;
    this.ended = true;
    this.stats.durationMs = this.elapsedMs;

    if (calculateAccuracy(this.stats.hits, this.stats.shotsFired) >= 0.8 && this.stats.shotsFired >= 10) {
      this.roundFlags.add(ACHIEVEMENT_FLAGS.ACCURACY_80);
    }
    if (this.chainSystem.getLongestTriggeredChainStations() >= 5) {
      this.roundFlags.add(ACHIEVEMENT_FLAGS.CHAIN_5);
    }

    const rank = calculateRank(this.stats.score);
    const xpGained = computeRoundXp(this.stats);
    const currencyGained = computeRoundCurrency(rank);

    const save = saveManager.load();
    const previousBestEntry = save.highscores
      .filter((h) => h.mode === this.opts.mode && h.map === this.opts.map)
      .sort((a, b) => b.score - a.score)[0];
    const previousBest = previousBestEntry?.score ?? null;
    const isNewRecord = previousBest === null || this.stats.score > previousBest;

    const entry: HighscoreEntry = {
      score: this.stats.score,
      rank,
      mode: this.opts.mode,
      map: this.opts.map,
      date: Date.now(),
      hits: this.stats.hits,
      misses: this.stats.misses,
      accuracy: calculateAccuracy(this.stats.hits, this.stats.shotsFired),
      highestCombo: this.stats.highestCombo,
    };

    const xpResult = applyXpGain(save.progression, xpGained);

    const updated = saveManager.update((d) => {
      d.progression = xpResult.progression;
      d.progression.currency += currencyGained;
      d.highscores.push(entry);
      d.highscores.sort((a, b) => b.score - a.score);
      d.highscores = d.highscores.slice(0, 50);
      if (this.opts.mode === 'daily') {
        const seedKey = String(this.opts.seed);
        const existing = d.dailyHighscores[seedKey];
        if (!existing || entry.score > existing.score) d.dailyHighscores[seedKey] = entry;
      }
      d.stats.totalShotsFired += this.stats.shotsFired;
      d.stats.totalHits += this.stats.hits;
      d.stats.totalMisses += this.stats.misses;
      d.stats.totalRoundsPlayed += 1;
      d.stats.totalPlayMs += this.stats.durationMs;
      d.stats.bestCombo = Math.max(d.stats.bestCombo, this.stats.highestCombo);
      d.stats.bossesDefeated += this.stats.bossesDefeated;
      d.stats.chainReactionsTriggered += this.stats.chainReactionsTriggered;
      for (const [id, count] of Object.entries(this.stats.targetTypesHit)) {
        d.stats.targetTypeKills[id as TargetTypeId] = (d.stats.targetTypeKills[id as TargetTypeId] ?? 0) + (count ?? 0);
      }
    });

    const achievementResult = evaluateAchievements(updated.achievements, {
      cumulativeHits: updated.stats.totalHits,
      cumulativeShots: updated.stats.totalShotsFired,
      bestCombo: updated.stats.bestCombo,
      bossesDefeated: updated.stats.bossesDefeated,
      chainReactionsTriggered: updated.stats.chainReactionsTriggered,
      roundsPlayed: updated.stats.totalRoundsPlayed,
      playerLevel: updated.progression.level,
      roundFlags: this.roundFlags,
    });
    const challengeResult = evaluateChallenges(updated.challenges, this.roundFlags);

    saveManager.update((d) => {
      d.achievements = achievementResult.updated;
      d.challenges = challengeResult.updated;
      for (const cfg of achievementResult.newlyUnlocked) {
        d.progression.currency += cfg.currencyReward;
      }
      for (const id of challengeResult.newlyCompleted) {
        const cfg = getChallengeConfig(id);
        d.progression.currency += cfg.currencyReward;
      }
    });

    this.audio.stopMusic();
    this.audio.stopAmbience();

    gameBridge.emit('roundEnded', {
      stats: this.stats,
      rank,
      mode: this.opts.mode,
      map: this.opts.map,
      isNewRecord,
      previousBest,
      xpGained,
      levelsGained: xpResult.levelsGained,
      currencyGained,
      newlyUnlockedAchievements: achievementResult.newlyUnlocked.map((a) => a.id),
      newlyCompletedChallenges: challengeResult.newlyCompleted,
    });

    this.shutdownScene();
  }

  private shutdownScene(): void {
    for (const unsub of this.unsubs) unsub();
    this.unsubs = [];
    this.audio.stopMusic();
    this.audio.stopAmbience();
    this.particles.destroy();
    this.targetPool.destroy();
    this.boss?.destroy();
    this.boss = null;
    this.input.setDefaultCursor('default');
  }

  shutdown(): void {
    this.shutdownScene();
  }
}
