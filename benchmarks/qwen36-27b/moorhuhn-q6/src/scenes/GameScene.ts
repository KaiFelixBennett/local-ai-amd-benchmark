import Phaser from 'phaser';
import type { GameMode, Environment, TargetTypeId, EnvironmentId, MiniBossId, EventTypeId } from '../types';
import { TARGET_TYPES, DEFAULT_WEAPON, GAME_MODES } from '../types';
import { SeededRng, getDailySeed, getDayKey } from '../core/SeededRng';
import { calculateHitScore, buildRoundResult, calculateRank, calculateXP, calculateLevel } from '../core/Scoring';
import { createComboState, onHit, onMiss, isComboExpired, getComboLabel } from '../core/Combo';
import { createWeapon, fire, startReload, updateReload, canFire } from '../core/Weapon';
import { getAudioManager } from '../systems/AudioManager';
import { SpawnDirector } from '../systems/SpawnDirector';
import { DifficultyDirector } from '../systems/DifficultyDirector';
import { loadProgress, saveProgress } from '../core/SaveManager';
import { t } from '../i18n';
import {
  spawnEnvironmentObjects,
  checkChainReaction,
  EnvObjectEntity,
  ENV_OBJECTS,
} from '../systems/EnvironmentObjects';

// ==================== Target Entity ====================

class Target extends Phaser.GameObjects.Container {
  public typeId: TargetTypeId;
  public hp!: number;
  public maxHp!: number;
  public armor!: number;
  public alive: boolean = true;
  public score!: number;
  public speed: number;
  public pathType: string;
  public isBoss: boolean = false;
  public bossId: MiniBossId | null = null;

  private wingTween: Phaser.Tweens.Tween | null = null;
  private bodySprite!: Phaser.GameObjects.Sprite;
  private timeRef!: any;
  private _angle: number = 0;
  private baseX: number = 0;
  private baseY: number = 0;
  private pathProgress: number = 0;
  private amplitude: number = 100;
  private frequency: number = 2;
  private fromX: number = 0;
  private fromY: number = 0;
  private toX: number = 800;
  private toY: number = 400;
  private hitFlashTimer: number = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, typeId: TargetTypeId, config: {
    speed: number;
    pathType: string;
    amplitude?: number;
    frequency?: number;
    fromX?: number;
    fromY?: number;
    toX?: number;
    toY?: number;
    isBoss?: boolean;
    bossId?: MiniBossId | null;
  }) {
    super(scene, x, y);
    this.typeId = typeId;
    this.timeRef = scene.time;
    this.speed = config.speed;
    this.pathType = config.pathType;
    this.amplitude = config.amplitude ?? 100;
    this.frequency = config.frequency ?? 2;
    this.fromX = config.fromX ?? x;
    this.fromY = config.fromY ?? y;
    this.toX = config.toX ?? 800;
    this.toY = config.toY ?? 400;
    this.isBoss = config.isBoss ?? false;
    this.bossId = config.bossId ?? null;

    const targetConfig = TARGET_TYPES.find(t => t.id === typeId);
    if (targetConfig) {
      this.hp = targetConfig.baseHp;
      this.maxHp = targetConfig.baseHp;
      this.armor = targetConfig.hasArmor ? targetConfig.baseHp : 0;
      this.score = targetConfig.baseScore;

      const textureKey = typeId;
      if (scene.textures.exists(textureKey)) {
        this.bodySprite = scene.add.sprite(0, 0, textureKey);
        const scale = 0.8 + Math.random() * 0.4;
        this.bodySprite.setScale(scale);
        this.add(this.bodySprite);

        // Wing flap animation
        this.wingTween = scene.tweens.add({
          targets: this.bodySprite,
          texture: `${textureKey}_wingdown`,
          duration: 500 / (targetConfig.wingSpeed * 0.1),
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }
    } else if (config.isBoss && config.bossId) {
      const bossKey = `boss_${config.bossId}`;
      this.hp = 20;
      this.maxHp = 20;
      this.armor = 10;
      this.score = 5000;

      if (scene.textures.exists(bossKey)) {
        this.bodySprite = scene.add.sprite(0, 0, bossKey);
        this.add(this.bodySprite);
      }
    }

    // Set initial direction
    if (this.toX < this.fromX) {
      this.bodySprite?.setScale(-Math.abs(this.bodySprite.scaleX), this.bodySprite.scaleY);
    }

    scene.add.existing(this);
  }

  update(dt: number): void {
    if (!this.alive) return;

    const dtSec = dt / 1000;
    this.pathProgress += dtSec * this.speed * 0.001;

    // Clamp progress
    if (this.pathProgress > 1) {
      this.alive = false;
      this.destroy();
      return;
    }

    let x: number, y: number;
    const t = this.pathProgress;

    switch (this.pathType) {
      case 'linear':
        x = Phaser.Math.Linear(this.fromX, this.toX, t);
        y = Phaser.Math.Linear(this.fromY, this.toY, t);
        break;
      case 'sine':
        x = Phaser.Math.Linear(this.fromX, this.toX, t);
        y = Phaser.Math.Linear(this.fromY, this.toY, t) +
          Math.sin(t * Math.PI * this.frequency) * this.amplitude;
        break;
      case 'spiral':
        const angle = t * Math.PI * this.frequency * 2;
        x = Phaser.Math.Linear(this.fromX, this.toX, t) + Math.cos(angle) * this.amplitude * 0.5;
        y = Phaser.Math.Linear(this.fromY, this.toY, t) + Math.sin(angle) * this.amplitude * 0.5;
        break;
      case 'zigzag':
        x = Phaser.Math.Linear(this.fromX, this.toX, t);
        y = Phaser.Math.Linear(this.fromY, this.toY, t) +
          Math.sign(Math.sin(t * Math.PI * this.frequency * 3)) * this.amplitude * 0.5;
        break;
      case 'bezier':
        const cp1x = this.fromX + (this.toX - this.fromX) * 0.3;
        const cp1y = this.fromY - this.amplitude;
        const cp2x = this.fromX + (this.toX - this.fromX) * 0.7;
        const cp2y = this.toY + this.amplitude * 0.5;
        const u = 1 - t;
        x = u * u * u * this.fromX + 3 * u * u * t * cp1x + 3 * u * t * t * cp2x + t * t * t * this.toX;
        y = u * u * u * this.fromY + 3 * u * u * t * cp1y + 3 * u * t * t * cp2y + t * t * t * this.toY;
        break;
      case 'dive':
        x = Phaser.Math.Linear(this.fromX, this.toX, t);
        y = this.fromY + Math.sin(t * Math.PI) * -200 + t * (this.toY - this.fromY);
        break;
      case 'hover':
        x = Phaser.Math.Linear(this.fromX, this.toX, t);
        y = Phaser.Math.Linear(this.fromY, this.toY, t) +
          Math.sin(t * Math.PI * this.frequency) * this.amplitude * 0.3;
        break;
      default:
        x = Phaser.Math.Linear(this.fromX, this.toX, t);
        y = Phaser.Math.Linear(this.fromY, this.toY, t);
    }

    this.setPosition(x, y);

    // Hit flash
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer -= dt;
      this.bodySprite?.setAlpha(this.hitFlashTimer > 0 ? 0.5 : 1);
    }

    // Remove if off screen
    if (x < -100 || x > this.scene.scale.width + 100 || y < -100 || y > this.scene.scale.height + 100) {
      this.alive = false;
      this.destroy();
    }
  }

  takeDamage(amount: number): boolean {
    if (!this.alive) return false;

    let actualDamage = amount;
    if (this.armor > 0) {
      this.armor--;
      if (this.armor > 0) {
        actualDamage = 0; // Armor absorbs
        // Flash armor
        this.hitFlashTimer = 100;
        return false;
      }
    }

    this.hp -= actualDamage;
    this.hitFlashTimer = 150;

    if (this.hp <= 0) {
      this.alive = false;
      return true; // Killed
    }
    return false;
  }

  getHitboxRadius(): number {
    const targetConfig = TARGET_TYPES.find(t => t.id === this.typeId);
    if (targetConfig) {
      return targetConfig.hitboxRadius * Math.abs(this.bodySprite?.scaleX ?? 1) * 3;
    }
    return 100;
  }

  getPerfectRadius(): number {
    const targetConfig = TARGET_TYPES.find(t => t.id === this.typeId);
    if (targetConfig) {
      return targetConfig.perfectRadius * Math.abs(this.bodySprite?.scaleX ?? 1);
    }
    return 12;
  }

  destroy(fromScene?: boolean): void {
    if (this.wingTween) {
      this.wingTween.stop();
      this.wingTween = null;
    }
    super.destroy(fromScene);
  }
}

// ==================== Main Game Scene ====================

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  // Game config
  private mode!: GameMode;
  private environment!: Environment;
  private seed!: number;
  private dayKey: string | null = null;

  // Systems
  private rng!: SeededRng;
  private spawnDirector!: SpawnDirector;
  private difficultyDirector!: DifficultyDirector;

  // Game state
  private score: number = 0;
  private combo: ReturnType<typeof createComboState> | null = null;
  private weapon: ReturnType<typeof createWeapon> | null = null;
  private paused: boolean = false;
  private timeLeft: number = 0;
  private roundStart: number = 0;

  // Stats
  private hits: number = 0;
  private misses: number = 0;
  private shots: number = 0;
  private perfectHits: number = 0;
  private maxCombo: number = 0;
  private bestHit: number = 0;
  private hitTimes: number[] = [];
  private targetTypesHit: Map<string, number> = new Map(); // Will be cast to Map<TargetTypeId, number>
  private eventBonuses: number = 0;

  // Entities
  private targets!: Phaser.GameObjects.Group;
  private targetList: Target[] = [];
  private envObjects: EnvObjectEntity[] = [];
  private tempVec: Phaser.Math.Vector2 = new Phaser.Math.Vector2();
  private crosshair!: Phaser.GameObjects.Image;
  private particles!: Phaser.GameObjects.Particles.ParticleEmitter;

  // HUD elements
  private hudScore!: Phaser.GameObjects.Text;
  private hudTime!: Phaser.GameObjects.Text;
  private hudCombo!: Phaser.GameObjects.Text;
  private hudAmmo!: Phaser.GameObjects.Text;
  private hudEvent!: Phaser.GameObjects.Text;

  // Event state
  private activeEvent: EventTypeId | null = null;
  private eventTimer: number = 0;
  private chainBonuses: number = 0;

  // Timers
  private timerEvent!: Phaser.Time.TimerEvent;
  private spawnTimer!: Phaser.Time.TimerEvent;
  private difficultyTimer!: Phaser.Time.TimerEvent;
  private eventTimerEvent!: Phaser.Time.TimerEvent;

  init(data: { mode: GameMode; environment: Environment; seed: number; dayKey?: string | null }): void {
    this.mode = data.mode;
    this.environment = data.environment;
    this.seed = data.seed;
    this.dayKey = data.dayKey ?? null;
  }

  create(): void {
    const { width, height } = this.scale;

    // Reset state
    this.score = 0;
    this.hits = 0;
    this.misses = 0;
    this.shots = 0;
    this.perfectHits = 0;
    this.maxCombo = 0;
    this.bestHit = 0;
    this.hitTimes = [];
    this.targetTypesHit = new Map();
    this.eventBonuses = 0;
    this.activeEvent = null;
    this.paused = false;
    this.roundStart = this.time.now;

    // Time
    this.timeLeft = this.mode.duration > 0 ? this.mode.duration : 999;

    // Systems
    this.rng = new SeededRng(this.seed);
    this.spawnDirector = new SpawnDirector(this.seed, this.mode, this.environment, width, height);
    this.difficultyDirector = new DifficultyDirector(0.6, 2.0, 0.05);

    // Combo
    this.combo = createComboState(this.mode.comboWindow);

    // Weapon
    this.weapon = createWeapon(DEFAULT_WEAPON);

    // Targets group
    this.targets = this.add.group();

    // Background
    this.drawBackground();

    // Interactive environment objects
    this.envObjects = spawnEnvironmentObjects(
      this,
      this.environment.id,
      this.rng,
      width,
      height,
    );

    // Crosshair (hidden, we use a custom one)
    // Disable mouse visibility change handling (not needed in Phaser 3.87)

    // Initialize audio
    getAudioManager().init();
    getAudioManager().startAmbient(this.environment.id === 'nebelmoor' ? 'moor' :
      this.environment.id === 'sturmklippen' ? 'coast' : 'night');
    getAudioManager().startMusic(0.3);

    // Create HUD
    this.createHUD();

    // Input handlers
    this.setupInput();
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => this.onPointerMove(pointer));

    // Timers
    this.timerEvent = this.time.addEvent({
      delay: 1000,
      callback: this.onTick,
      callbackScope: this,
      loop: true,
    });

    this.spawnTimer = this.time.addEvent({
      delay: 500,
      callback: this.onSpawnTick,
      callbackScope: this,
      loop: true,
    });

    this.difficultyTimer = this.time.addEvent({
      delay: 5000,
      callback: this.onDifficultyTick,
      callbackScope: this,
      loop: true,
    });

    // Schedule events
    this.scheduleEvents();
  }

  private drawBackground(): void {
    const { width, height } = this.scale;

    // Sky
    const skyKey = `bg_${this.environment.id}_sky`;
    if (this.textures.exists(skyKey)) {
      const sky = this.add.image(width / 2, height * 0.3, skyKey);
      sky.setScale(width / 1920, height * 0.4 / 100);
      sky.setDepth(-10);
    }

    // Ground
    const ground = this.add.graphics();
    const groundColors: Record<EnvironmentId, number> = {
      nebelmoor: 0x3a5a3a,
      sturmklippen: 0x4a4a4a,
      mondbruch: 0x1a2a1a,
    };
    ground.fillStyle(groundColors[this.environment.id] ?? 0x3a5a3a, 1);
    ground.fillRect(0, height * 0.75, width, height * 0.25);

    // Water for nebelmoor
    if (this.environment.id === 'nebelmoor') {
      ground.fillStyle(0x446688, 0.6);
      ground.fillRect(0, height * 0.82, width, height * 0.05);
      // Reeds
      ground.fillStyle(0x5a7a3a, 0.8);
      for (let i = 0; i < 30; i++) {
        const rx = this.rng.range(0, width);
        ground.fillRect(rx, height * 0.78, 3, 40);
      }
    }

    // Moon for mondbruch
    if (this.environment.id === 'mondbruch') {
      if (this.textures.exists('moon')) {
        const moon = this.add.image(width * 0.8, height * 0.15, 'moon');
        moon.setScale(1.5);
        moon.setDepth(-5);
      }
      if (this.textures.exists('stars')) {
        const stars = this.add.image(width / 2, height * 0.2, 'stars');
        stars.setDepth(-6);
      }
    }

    // Fog overlay
    if (this.environment.fogDensity > 0) {
      const fog = this.add.graphics();
      fog.fillStyle(this.environment.fogColor, this.environment.fogDensity * 20);
      fog.fillRect(0, 0, width, height);
      fog.setDepth(100);
    }
  }

  private createHUD(): void {
    const { width, height } = this.scale;

    // Score
    this.hudScore = this.add.text(20, 20, t('hud_score') + ': 0', {
      fontSize: '28px',
      fontFamily: '"Segoe UI", Arial, sans-serif',
      color: '#FFD700',
      fontStyle: 'bold',
    }).setDepth(200);

    // Time
    this.hudTime = this.add.text(width - 20, 20, `${Math.ceil(this.timeLeft)}s`, {
      fontSize: '28px',
      fontFamily: '"Segoe UI", Arial, sans-serif',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(1, 0).setDepth(200);

    // Combo
    this.hudCombo = this.add.text(width / 2, 20, '', {
      fontSize: '24px',
      fontFamily: '"Segoe UI", Arial, sans-serif',
      color: '#FF6600',
      fontStyle: 'bold',
    }).setOrigin(0.5, 0).setDepth(200);

    // Ammo
    this.hudAmmo = this.add.text(20, height - 30, this.getAmmoDisplay(), {
      fontSize: '20px',
      fontFamily: '"Segoe UI", Arial, sans-serif',
      color: '#ffffff',
    }).setDepth(200);

    // Event display
    this.hudEvent = this.add.text(width / 2, height - 30, '', {
      fontSize: '18px',
      fontFamily: '"Segoe UI", Arial, sans-serif',
      color: '#FF4444',
      fontStyle: 'italic',
    }).setOrigin(0.5, 1).setDepth(200);
  }

  private getAmmoDisplay(): string {
    if (!this.weapon) return '';
    const ammoText = this.weapon.ammo;
    const stateText = this.weapon.state === 'reloading' ? t('hud_reload') :
      this.weapon.state === 'empty' ? t('hud_empty') : '';
    return `${t('hud_ammo')}: ${ammoText}/${DEFAULT_WEAPON.magSize} ${stateText}`;
  }

  private setupInput(): void {
    // Shooting
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.paused) return;
      if (pointer.button === 0) { // Left click
        this.onShoot(pointer);
      } else if (pointer.button === 2) { // Right click
        this.onReload();
      }
    });

    // Keyboard
    this.input.keyboard?.on('keydown-R', () => this.onReload());
    this.input.keyboard?.on('keydown-ESC', () => this.onPause());
    this.input.keyboard?.on('keydown-Space', () => {
      if (!this.paused) this.onShoot(this.input.activePointer);
    });
  }

  private onShoot(pointer: Phaser.Input.Pointer | null): void {
    if (!this.weapon || !pointer) return;

    if (!canFire(this.weapon, DEFAULT_WEAPON, this.time.now)) {
      if (this.weapon.ammo <= 0) {
        getAudioManager().emptyClick();
        if (this.mode.autoReload) {
          this.onReload();
        }
      }
      return;
    }

    // Fire!
    fire(this.weapon, DEFAULT_WEAPON, this.time.now);
    this.shots++;

    // Audio
    const pitch = 0.9 + this.rng.next() * 0.2;
    getAudioManager().shoot(pitch);

    // Get click position in game coordinates
    // With FIT scaling, pointer.x/y are already in game coordinates (0 to 1280/720)
    // pointer.positionX/Y would be in screen coordinates
    const gameX = pointer.x;
    const gameY = pointer.y;

    // Visual effects
    this.showMuzzleFlash(gameX, gameY);
    this.showRecoil(gameX, gameY);

    // Hit detection: targets first (they're the priority)
    const hit = this.checkHit(gameX, gameY);
    if (hit) {
      this.onTargetHit(hit, gameX, gameY);
    } else {
      // Check environment objects
      const envHit = this.checkEnvObjectHit(gameX, gameY);
      if (envHit) {
        this.onEnvObjectHit(envHit, gameX, gameY);
      } else {
        this.onMissShot(gameX, gameY);
      }
    }

    // Auto reload
    if (this.weapon.ammo <= 0 && this.mode.autoReload) {
      this.time.delayedCall(200, () => this.onReload());
    }

    this.updateHUD();
  }

  private onReload(): void {
    if (!this.weapon) return;
    if (startReload(this.weapon, DEFAULT_WEAPON, this.time.now)) {
      getAudioManager().reload();
      // Show reload animation
      this.tweens.add({
        targets: this.hudAmmo,
        scaleX: 1.2,
        scaleY: 1.2,
        duration: 150,
        yoyo: true,
      });
    }
  }

  private onPause(): void {
    this.paused = !this.paused;
    if (this.paused) {
      this.events.emit('pause');
      // Show pause overlay
      const { width, height } = this.scale;
      const overlay = this.add.graphics();
      overlay.fillStyle(0x000000, 0.7);
      overlay.fillRect(0, 0, width, height);
      overlay.setData('pauseOverlay', true);

      this.add.text(width / 2, height / 2 - 40, t('menu_pause'), {
        fontSize: '48px',
        fontFamily: '"Segoe UI", Arial, sans-serif',
        color: '#ffffff',
        fontStyle: 'bold',
      }).setOrigin(0.5).setData('pauseText', true);

      this.add.text(width / 2, height / 2 + 20, 'Press ESC to continue', {
        fontSize: '18px',
        fontFamily: '"Segoe UI", Arial, sans-serif',
        color: '#aaaaaa',
      }).setOrigin(0.5).setData('pauseText', true);
    } else {
      this.events.emit('resume');
      // Remove pause overlay
      this.children.getAll().forEach(child => {
        if ((child as any).getData?.('pauseOverlay') || (child as any).getData?.('pauseText')) {
          (child as Phaser.GameObjects.GameObject).destroy();
        }
      });
    }
  }

  private checkHit(x: number, y: number): Target | null {
    let closest: Target | null = null;
    let closestDist = Infinity;

    this.targetList.forEach(target => {
      if (!target.alive) return;

      const dx = x - target.x;
      const dy = y - target.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const radius = target.getHitboxRadius();

      if (dist <= radius && dist < closestDist) {
        closestDist = dist;
        closest = target;
      }
    });

    return closest;
  }

  private checkEnvObjectHit(x: number, y: number): EnvObjectEntity | null {
    let closest: EnvObjectEntity | null = null;
    let closestDist = Infinity;

    this.envObjects.forEach(obj => {
      if (obj.hit) return;

      const dx = x - obj.x;
      const dy = y - obj.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const radius = obj.config.size * 0.6;

      if (dist <= radius && dist < closestDist) {
        closestDist = dist;
        closest = obj;
      }
    });

    return closest;
  }

  private onEnvObjectHit(obj: EnvObjectEntity, hitX: number, hitY: number): void {
    const result = obj.onHit(this, this.rng);
    this.score += result.score;

    // Show humor text
    if (result.humorText) {
      const text = this.add.text(hitX, hitY - 20, result.humorText, {
        fontSize: '16px',
        fontFamily: '"Segoe UI", Arial, sans-serif',
        color: '#FFD700',
        stroke: '#000000',
        strokeThickness: 3,
      }).setOrigin(0.5);
      text.setDepth(500);
      this.tweens.add({
        targets: text,
        y: hitY - 80,
        alpha: 0,
        duration: 1200,
        ease: 'Sine.easeOut',
        onComplete: () => text.destroy(),
      });
    }

    // Show score popup
    this.showScorePopup(hitX, hitY, result.score, false);

    // Check for chain reaction
    const chain = checkChainReaction(obj.objectId, this.envObjects);
    if (chain) {
      this.chainBonuses += chain.bonusScore;
      this.score += chain.bonusScore;

      // Show chain bonus text
      const chainText = this.add.text(this.scale.width / 2, this.scale.height / 2, `⚡ CHAIN REACTION! +${chain.bonusScore}`, {
        fontSize: '28px',
        fontFamily: '"Segoe UI", Arial, sans-serif',
        color: '#FF4444',
        stroke: '#000000',
        strokeThickness: 4,
      }).setOrigin(0.5);
      chainText.setDepth(1000);
      this.tweens.add({
        targets: chainText,
        scale: 1.5,
        alpha: 0,
        duration: 2000,
        ease: 'Sine.easeOut',
        onComplete: () => chainText.destroy(),
      });

      getAudioManager().hit(true);
    }

    getAudioManager().hit(false);
  }

  private onTargetHit(target: Target, hitX: number, hitY: number): void {
    const dx = hitX - target.x;
    const dy = hitY - target.y;
    const offset = Math.sqrt(dx * dx + dy * dy);
    const isPerfect = offset <= target.getPerfectRadius();

    const killed = target.takeDamage(1);

    if ((target as any).isDecoy && killed) {
      // Decoy hit - penalty
      this.score += target.score; // negative
      getAudioManager().decoyHit();
      this.showDecoyEffect(target.x, target.y);
      this.misses++;
      this.combo = onMiss(this.combo!);
    } else if (killed) {
      // Hit!
      this.hits++;
      this.perfectHits += isPerfect ? 1 : 0;
      this.hitTimes.push(this.time.now - this.roundStart);

      const targetConfig = TARGET_TYPES.find(t => t.id === target.typeId);
      if (targetConfig) {
        const now = this.time.now;
        const { combo: newCombo, expired } = onHit(this.combo!, now, isPerfect);
        this.combo = newCombo;

        if (this.combo.count > this.maxCombo) {
          this.maxCombo = this.combo.count;
        }

        // Combo milestone sound
        const label = getComboLabel(this.combo.count);
        if (label && this.combo.count % 5 === 0) {
          getAudioManager().comboMilestone(this.combo.count);
          this.showComboLabel(label);
        }

        // Calculate score
        const scoreData = calculateHitScore({
          target: targetConfig,
          targetSpeed: target.speed,
          targetDistance: target.y / this.scale.height,
          targetSize: Math.abs((target as any).bodySprite?.scaleX ?? 1),
          hitOffset: offset,
          hitboxRadius: target.getHitboxRadius(),
          perfectRadius: target.getPerfectRadius(),
          combo: this.combo,
          timeLeft: this.timeLeft,
          roundDuration: this.mode.duration,
          eventMultiplier: this.activeEvent ? 1.5 : 1.0,
          streakHits: this.combo.streakHits,
          swarmBonus: 0,
          trickshotBonus: 0,
          mode: this.mode,
        });

        this.score += scoreData.total;
        if (scoreData.total > this.bestHit) {
          this.bestHit = scoreData.total;
        }

        // Track target type
        const current = this.targetTypesHit.get(target.typeId) ?? 0;
        this.targetTypesHit.set(target.typeId, current + 1);

        // Audio
        if (targetConfig.isRare) {
          getAudioManager().rareHit();
        } else {
          getAudioManager().hit(isPerfect);
        }

        // Visual effects
        this.showHitEffect(target.x, target.y, isPerfect ? 1 : 0, scoreData.total);
        this.showScorePopup(target.x, target.y - 30, scoreData.total, isPerfect);
        this.spawnHitParticles(target.x, target.y, targetConfig);

        // Death animation
        this.animateTargetDeath(target);
      }
    } else {
      // Hit but not killed (armored)
      getAudioManager().hit(false);
      this.showHitEffect(target.x, target.y, 0, 0);
    }

    this.updateHUD();
  }

  private onMissShot(x: number, y: number): void {
    this.misses++;
    this.combo = onMiss(this.combo!);
    getAudioManager().miss();

    // Show miss indicator
    const miss = this.add.circle(x, y, 8, 0xff0000, 0.5);
    miss.setDepth(150);
    this.tweens.add({
      targets: miss,
      scale: 2,
      alpha: 0,
      duration: 300,
      onComplete: () => miss.destroy(),
    });
  }

  private showMuzzleFlash(x: number, y: number): void {
    if (!this.textures.exists('muzzle_flash')) return;
    const flash = this.add.image(x, y, 'muzzle_flash');
    flash.setDepth(150);
    flash.setScale(0.5 + this.rng.next() * 0.5);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      scale: flash.scaleX * 1.5,
      duration: 80,
      onComplete: () => flash.destroy(),
    });
  }

  private showRecoil(x: number, y: number): void {
    // Small camera shake
    const intensity = 3 * (this.mode.id === 'zen' ? 0.3 : 1.0);
    this.cameras.main.shake(50, intensity * 0.01);
  }

  private showHitEffect(x: number, y: number, isPerfect: number, score: number): void {
    const key = isPerfect ? 'hitmarker_perfect' : 'hitmarker';
    if (!this.textures.exists(key)) return;

    const marker = this.add.image(x, y, key);
    marker.setDepth(160);
    marker.setScale(1.5);
    this.tweens.add({
      targets: marker,
      alpha: 0,
      scale: 2.5,
      duration: 400,
      ease: 'Power2',
      onComplete: () => marker.destroy(),
    });
  }

  private showDecoyEffect(x: number, y: number): void {
    // Show a funny effect for decoy
    const { width } = this.scale;
    const text = this.add.text(x, y - 40, this.rng.pick(['💥 -300!', '😤 Trick!', '🤦 Oops!']), {
      fontSize: '24px',
      fontFamily: '"Segoe UI", Arial, sans-serif',
      color: '#FF4444',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(160);

    this.tweens.add({
      targets: text,
      y: y - 100,
      alpha: 0,
      duration: 1000,
      ease: 'Power2',
      onComplete: () => text.destroy(),
    });

    // Screen flash red
    const flash = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0xff0000, 0.15);
    flash.setOrigin(0).setDepth(190);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 300,
      onComplete: () => flash.destroy(),
    });
  }

  private showScorePopup(x: number, y: number, score: number, isPerfect: boolean): void {
    const text = this.add.text(x, y, `${score > 0 ? '+' : ''}${score}${isPerfect ? ' ✦' : ''}`, {
      fontSize: isPerfect ? '28px' : '22px',
      fontFamily: '"Segoe UI", Arial, sans-serif',
      color: isPerfect ? '#FFD700' : '#ffffff',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(160);

    this.tweens.add({
      targets: text,
      y: y - 60,
      alpha: 0,
      duration: 800,
      ease: 'Power2',
      onComplete: () => text.destroy(),
    });
  }

  private showComboLabel(label: string): void {
    const { width } = this.scale;
    const text = this.add.text(width / 2, this.scale.height * 0.3, label, {
      fontSize: '36px',
      fontFamily: '"Segoe UI", Arial, sans-serif',
      color: '#FF6600',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(170).setScale(0.5);

    this.tweens.add({
      targets: text,
      scale: 1.2,
      duration: 200,
      yoyo: true,
      onComplete: () => {
        this.tweens.add({
          targets: text,
          alpha: 0,
          y: text.y - 30,
          duration: 500,
          onComplete: () => text.destroy(),
        });
      },
    });
  }

  private spawnHitParticles(x: number, y: number, targetConfig: typeof TARGET_TYPES[0]): void {
    // Feather particles
    for (let i = 0; i < 6; i++) {
      const angle = this.rng.range(0, Math.PI * 2);
      const speed = this.rng.range(50, 150);
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed - 50;

      const feather = this.add.image(x, y, 'particle_feather');
      feather.setDepth(140);
      feather.setRotation(this.rng.range(0, Math.PI * 2));

      this.tweens.add({
        targets: feather,
        x: x + vx * 0.5,
        y: y + vy * 0.5 + 100,
        rotation: feather.rotation + this.rng.range(-2, 2),
        alpha: 0,
        scale: 0.3,
        duration: this.rng.range(500, 1000),
        ease: 'Quad.easeOut',
        onComplete: () => feather.destroy(),
      });
    }

    // Dust particles
    for (let i = 0; i < 3; i++) {
      const dust = this.add.image(x, y, 'particle_dust');
      dust.setDepth(139);
      this.tweens.add({
        targets: dust,
        x: x + this.rng.range(-30, 30),
        y: y + this.rng.range(-30, 30),
        alpha: 0,
        duration: this.rng.range(200, 400),
        onComplete: () => dust.destroy(),
      });
    }
  }

  private animateTargetDeath(target: Target): void {
    // Spin and fall
    this.tweens.add({
      targets: target,
      y: target.y + 100,
      rotation: Math.PI * 2,
      alpha: 0,
      scale: 0.3,
      duration: 500,
      ease: 'Power2',
      onComplete: () => {
        const idx = this.targetList.indexOf(target);
        if (idx >= 0) this.targetList.splice(idx, 1);
        target.destroy();
      },
    });
  }

  // ==================== Game Loop ====================

  private onTick(): void {
    if (this.paused) return;

    // Update time
    if (this.mode.duration > 0) {
      this.timeLeft -= 1;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.endRound();
        return;
      }
    }

    // Update weapon reload
    if (this.weapon) {
      updateReload(this.weapon, DEFAULT_WEAPON, this.time.now);
    }

    // Update HUD
    this.updateHUD();
  }

  private onSpawnTick(): void {
    if (this.paused) return;

    this.spawnDirector.update(500);

    const pending = this.spawnDirector.getPendingSpawns();
    for (const entry of pending) {
      this.spawnTarget(entry);
    }

    // Update existing targets
    this.targets.getChildren().forEach(child => {
      const target = child as Target;
      if (target.alive) {
        target.update(50);
      }
    });
  }

  private spawnTarget(entry: ReturnType<SpawnDirector['getPendingSpawns']>[0]): void {
    const { width, height } = this.scale;

    // Determine spawn position based on edge
    let fromX: number, fromY: number;
    switch (entry.fromEdge) {
      case 'left': fromX = -50; fromY = this.rng.range(height * 0.1, height * 0.6); break;
      case 'right': fromX = width + 50; fromY = this.rng.range(height * 0.1, height * 0.6); break;
      case 'top': fromX = this.rng.range(width * 0.1, width * 0.9); fromY = -50; break;
      case 'bottom': fromX = this.rng.range(width * 0.1, width * 0.9); fromY = height + 50; break;
    }

    // Determine target position (opposite direction)
    let toX: number, toY: number;
    switch (entry.toEdge) {
      case 'left': toX = -50; toY = this.rng.range(height * 0.1, height * 0.6); break;
      case 'right': toX = width + 50; toY = this.rng.range(height * 0.1, height * 0.6); break;
      case 'top': toX = this.rng.range(width * 0.1, width * 0.9); toY = -50; break;
      case 'bottom': toX = this.rng.range(width * 0.1, width * 0.9); toY = height + 50; break;
    }

    const target = new Target(this, fromX, fromY, entry.targetType, {
      speed: entry.speed,
      pathType: entry.path,
      amplitude: entry.amplitude,
      frequency: entry.frequency,
      fromX,
      fromY,
      toX,
      toY,
    });

    target.setDepth(50);
    this.targets.add(target);
    this.targetList.push(target);
  }

  private onDifficultyTick(): void {
    if (this.paused) return;

    const hitRate = this.shots > 0 ? this.hits / this.shots : 0.5;
    const factor = this.difficultyDirector.evaluate({
      hitRate,
      currentCombo: this.combo?.count ?? 0,
      misses: this.misses,
      score: this.score,
      timeRemaining: this.timeLeft,
      roundDuration: this.mode.duration,
    }, this.time.now);

    this.spawnDirector.setDifficulty(factor);
  }

  private scheduleEvents(): void {
    // Schedule random events during the round
    const eventPool: EventTypeId[] = [
      'thick_fog', 'strong_wind', 'golden_swarm', 'bonus_balloons',
      'time_slow', 'featherstorm',
    ];

    // First event at 20 seconds
    this.time.delayedCall(20000, () => {
      if (!this.paused) this.triggerEvent(this.rng.pick(eventPool));
    });

    // Second event at 50 seconds
    this.time.delayedCall(50000, () => {
      if (!this.paused) this.triggerEvent(this.rng.pick(eventPool));
    });

    // Third event at 80 seconds
    this.time.delayedCall(80000, () => {
      if (!this.paused) this.triggerEvent(this.rng.pick(eventPool));
    });

    // Mini boss at 90 seconds (if not zen mode)
    if (this.mode.id !== 'zen' && this.rng.chance(0.4)) {
      this.time.delayedCall(90000, () => {
        if (!this.paused) this.triggerEvent('mini_boss');
      });
    }
  }

  private triggerEvent(eventId: EventTypeId): void {
    this.activeEvent = eventId;
    this.spawnDirector.setEvent(eventId);
    getAudioManager().eventStart();

    // Show event notification
    const { width } = this.scale;
    const eventName = t(`event_${eventId.replace(/_/g, '_')}`) ?? eventId;

    const notif = this.add.text(width / 2, this.scale.height * 0.15, `⚡ ${eventName}`, {
      fontSize: '28px',
      fontFamily: '"Segoe UI", Arial, sans-serif',
      color: '#FFD700',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(180);

    this.tweens.add({
      targets: notif,
      alpha: 0,
      y: notif.y - 30,
      duration: 2000,
      delay: 1000,
      onComplete: () => notif.destroy(),
    });

    // Clear event after duration
    this.time.delayedCall(10000, () => {
      this.activeEvent = null;
      this.spawnDirector.setEvent(null);
    });
  }

  // ==================== HUD ====================

  private updateHUD(): void {
    if (this.hudScore) {
      this.hudScore.setText(`${t('hud_score')}: ${this.score.toLocaleString()}`);
    }

    if (this.hudTime) {
      const timeText = this.mode.duration > 0 ? `${Math.ceil(this.timeLeft)}s` : '∞';
      this.hudTime.setText(timeText);
      // Flash when time is low
      if (this.timeLeft <= 10 && this.timeLeft > 0) {
        this.hudTime.setColor(this.timeLeft % 2 === 0 ? '#FF4444' : '#FF8888');
      } else {
        this.hudTime.setColor('#ffffff');
      }
    }

    if (this.hudCombo && this.combo) {
      if (this.combo.count > 1) {
        this.hudCombo.setText(`${this.combo.count}x Combo (${this.combo.multiplier.toFixed(1)}x)`);
      } else {
        this.hudCombo.setText('');
      }
    }

    if (this.hudAmmo && this.weapon) {
      this.hudAmmo.setText(this.getAmmoDisplay());
      if (this.weapon.state === 'empty') {
        this.hudAmmo.setColor('#FF4444');
      } else if (this.weapon.state === 'reloading') {
        this.hudAmmo.setColor('#FFAA00');
      } else {
        this.hudAmmo.setColor('#ffffff');
      }
    }

    if (this.hudEvent) {
      this.hudEvent.setText(this.activeEvent ? `⚡ ${t(`event_${this.activeEvent}`) ?? this.activeEvent}` : '');
    }
  }

  // ==================== Custom Crosshair ====================

  private drawCrosshair(x: number, y: number): void {
    // Remove old crosshair
    if (this.crosshair) {
      this.crosshair.destroy();
    }

    const color = this.environment.id === 'mondbruch' ? 0x44ff44 : 0xff4444;
    const g = this.add.graphics();
    g.lineStyle(2, color);
    g.strokeCircle(x, y, 16);
    g.lineBetween(x - 24, y, x - 8, y);
    g.lineBetween(x + 8, y, x + 24, y);
    g.lineBetween(x, y - 24, x, y - 8);
    g.lineBetween(x, y + 8, x, y + 24);
    g.fillStyle(color, 1);
    g.fillCircle(x, y, 2);
    g.setDepth(200);

    this.crosshair = g as unknown as Phaser.GameObjects.Image;
  }

  // Override pointer move
  private prevCrossX = 0;
  private prevCrossY = 0;

  private crosshairGraphics!: Phaser.GameObjects.Graphics;

  private updateCrosshair(x: number, y: number): void {
    if (!this.crosshairGraphics) {
      this.crosshairGraphics = this.add.graphics();
      this.crosshairGraphics.setDepth(200);
    }

    this.crosshairGraphics.clear();
    const color = this.environment.id === 'mondbruch' ? 0x44ff44 : 0xff4444;
    this.crosshairGraphics.lineStyle(2, color);
    this.crosshairGraphics.strokeCircle(x, y, 16);
    this.crosshairGraphics.lineBetween(x - 24, y, x - 8, y);
    this.crosshairGraphics.lineBetween(x + 8, y, x + 24, y);
    this.crosshairGraphics.lineBetween(x, y - 24, x, y - 8);
    this.crosshairGraphics.lineBetween(x, y + 8, x, y + 24);
    this.crosshairGraphics.fillStyle(color, 1);
    this.crosshairGraphics.fillCircle(x, y, 2);
  }

  // ==================== Round End ====================

  private endRound(): void {
    // Stop all timers
    this.timerEvent.remove();
    this.spawnTimer.remove();
    this.difficultyTimer.remove();

    // Stop audio
    getAudioManager().stopMusic();
    getAudioManager().stopAmbient();

    // Build result
    const progress = loadProgress();
    const personalBest = progress.highscores[this.mode.id] ?? 0;

    const result = buildRoundResult({
      totalScore: this.score,
      hits: this.hits,
      misses: this.misses,
      shots: this.shots,
      perfectHits: this.perfectHits,
      maxCombo: this.maxCombo,
      bestHit: this.bestHit,
      reactionTimes: this.hitTimes,
      targetTypesHit: this.targetTypesHit as Map<any, number>,
      eventBonuses: this.eventBonuses,
      chainBonuses: this.chainBonuses,
      personalBest,
    });

    // Update progress
    progress.totalRounds++;
    progress.totalHits += this.hits;
    progress.totalShots += this.shots;
    progress.totalPerfectHits += this.perfectHits;
    progress.totalMaxCombo = Math.max(progress.totalMaxCombo, this.maxCombo);
    progress.totalScore += this.score;
    progress.totalXp += result.xpEarned;
    progress.totalCurrency += result.currencyEarned;
    progress.highscores[this.mode.id] = Math.max(progress.highscores[this.mode.id], this.score);

    // Update level

    progress.level = calculateLevel(progress.totalXp);

    // Check unlocks
    if (progress.level >= 2 && !progress.unlockedModes.includes('blitz')) {
      progress.unlockedModes.push('blitz');
    }
    if (progress.level >= 3 && !progress.unlockedModes.includes('precision')) {
      progress.unlockedModes.push('precision');
    }
    if (progress.level >= 3 && !progress.unlockedEnvironments.includes('sturmklippen')) {
      progress.unlockedEnvironments.push('sturmklippen');
    }
    if (progress.level >= 4 && !progress.unlockedModes.includes('zen')) {
      progress.unlockedModes.push('zen');
    }
    if (progress.level >= 5 && !progress.unlockedModes.includes('endless')) {
      progress.unlockedModes.push('endless');
    }
    if (progress.level >= 5 && !progress.unlockedEnvironments.includes('mondbruch')) {
      progress.unlockedEnvironments.push('mondbruch');
    }

    // Daily record
    if (this.dayKey) {
      const currentDaily = progress.dailyRecords[this.dayKey] ?? 0;
      progress.dailyRecords[this.dayKey] = Math.max(currentDaily, this.score);
    }

    saveProgress(progress);

    // Go to results
    this.scene.start('ResultsScene', { result, progress });
  }

  // ==================== Custom pointer move for crosshair ====================

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    this.updateCrosshair(pointer.x, pointer.y);
  }
}
