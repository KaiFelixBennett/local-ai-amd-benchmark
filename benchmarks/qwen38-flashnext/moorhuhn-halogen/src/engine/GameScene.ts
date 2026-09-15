import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, clamp } from '../types';
import type { GameStartPayload, MapId, ModeId, RunSummary } from '../types';
import { bus } from '../core/bus';
import { t } from '../core/i18n';
import { getCoreContext } from '../core/context';
import { createRng, dailySeed, seedLabel, hashString } from '../core/rng';
import { getMapDef } from '../config/maps';
import { getModeDef } from '../config/modes';
import { getEventDef, WEATHER_EVENT_IDS } from '../config/events';
import { getTargetDef, getBossDef } from '../config/targets';
import { CHALLENGES } from '../config/cosmetics';
import { BALANCE } from '../config/balance';
import type { ChainDef, EffectSpec, EnvObjectDef, EventDef, MapDef, ModeDef } from '../config/schema';
import { Weapon } from '../logic/weapon';
import { ComboTracker } from '../logic/combo';
import { SpawnDirector } from '../logic/spawnDirector';
import type { SpawnContext, SpawnDecision } from '../logic/spawnDirector';
import { RoundDirector } from '../logic/roundDirector';
import { DifficultyDirector } from '../logic/difficulty';
import { computeHit, isInsideHitbox, isPerfect, rankForScore } from '../logic/scoring';
import type { HitResult } from '../types';
import { generateTextures, disposeTextures } from './art';
import { generateBackground, disposeBackground } from './background';
import { createTrajectory, createFormation, createFormationMemberAt } from './trajectories';
import type { EnvMod, Trajectory } from './trajectories';
import { BossRuntime } from './bossRuntime';
import { Fx, Crosshair, WeaponRig } from './fx';

/* ------------------------------------------------------------------ *
 * Live game objects
 * ------------------------------------------------------------------ */

interface ActiveTarget {
  id: number;
  targetId: string;
  sprite: Phaser.GameObjects.Sprite;
  armorSprite: Phaser.GameObjects.Image | null;
  armorLeft: number;
  traj: Trajectory;
  /** shared formation anchor (null when the target owns its trajectory) */
  shared: Trajectory | null;
  groupSize: number;
  groupIndex: number;
  /** golden tint granted by a golden event */
  golden: boolean;
  spawnedAtSec: number;
}

interface EnvObjectInstance {
  def: EnvObjectDef;
  sprite: Phaser.GameObjects.Image;
  extra: Phaser.GameObjects.Image | null;
  hits: number;
  destroyed: boolean;
  revealed: boolean;
}

interface ChainState {
  def: ChainDef;
  stepIndex: number;
  complete: boolean;
}

interface SwarmGroupState {
  size: number;
  spawned: number;
  killed: number;
  escaped: number;
  firstSpawnSec: number;
  active: boolean;
}

type TutorialStep = 0 | 1 | 2 | 3;

/* ------------------------------------------------------------------ *
 * GameScene — orchestrates one full round
 * ------------------------------------------------------------------ */

export class GameScene extends Phaser.Scene {
  // round configuration
  private mode: ModeDef = getModeDef('classic');
  private map: MapDef = getMapDef('nebelmoor');
  private mapId: MapId = 'nebelmoor';
  private modeId: ModeId = 'classic';
  private seed = 1;
  private isDaily = false;
  private tutorialMode = false;

  // systems
  private rng = createRng(1);
  private weapon!: Weapon;
  private combo!: ComboTracker;
  private spawnDirector!: SpawnDirector;
  private roundDirector!: RoundDirector;
  private difficulty!: DifficultyDirector;
  private fx!: Fx;
  private crosshair!: Crosshair;
  private rig!: WeaponRig;
  private boss: BossRuntime | null = null;

  // world
  private targets: ActiveTarget[] = [];
  private envObjects: EnvObjectInstance[] = [];
  private chainStates = new Map<string, ChainState>();
  private nextTargetId = 1;
  /** live formation anchors keyed by `targetId|groupSize` for staggered members */
  private formationAnchors = new Map<string, Trajectory>();

  // clock — accumulated scaled game time only (never wall clock), so pausing is exact
  private gameSec = 0;
  private gameMs = 0;
  private running = false;
  private finishing = false;

  // environment state driven by events and effects
  private fogOverlay: Phaser.GameObjects.TileSprite | null = null;
  private darkOverlay: Phaser.GameObjects.Rectangle | null = null;
  private windNow = 0;
  private speedMultNow = 1;
  private timeScaleNow = 1;
  private scoreMultNow = 1;
  private scoreMultUntilSec = 0;
  private slowUntilSec = 0;
  private slowScale = 1;
  private goldenActive = false;
  private thunderTimer = 0;

  // run stats
  private score = 0;
  private scoreDisplay = 0;
  private shots = 0;
  private hits = 0;
  private misses = 0;
  private reloads = 0;
  private perfectHits = 0;
  private bestHitPoints = 0;
  private bestHitTargetId = '';
  private targetsHit: Record<string, number> = {};
  private swarmBonuses = 0;
  private trickshots = 0;
  private longshots = 0;
  private chainReactions = 0;
  private longestChain = 0;
  private hiddenFound = new Set<string>();
  private eventBonusPoints = 0;
  private bonusTimeSeconds = 0;
  private bossDefeated = false;
  private bossMisses = 0;
  private goldDuringStorm = false;
  private swarmClearedFast = false;
  private reactionTimes: number[] = [];
  private swarmGroup: SwarmGroupState = { size: 0, spawned: 0, killed: 0, escaped: 0, firstSpawnSec: 0, active: false };

  /** rolling hit/miss window feeding the adaptive difficulty */
  private recentResults: boolean[] = [];

  // tutorial
  private tutorialStep: TutorialStep = 0;
  private tutorialText: Phaser.GameObjects.Text | null = null;

  // event bookkeeping
  private activeEventId: string | null = null;
  private activeEventDef: EventDef | null = null;

  // input
  private pointerPos = new Phaser.Math.Vector2(GAME_WIDTH / 2, GAME_HEIGHT / 2);
  private fireQueued = false;
  private keyDownHandler: ((e: KeyboardEvent) => void) | null = null;
  private debugOn = false;
  private debugText: Phaser.GameObjects.Text | null = null;

  // bus disposers
  private offs: (() => void)[] = [];

  constructor() {
    super('game');
  }

  /* ================= lifecycle ================= */

  init(data: { mode?: ModeId; map?: MapId; seed?: number; tutorial?: boolean }): void {
    this.modeId = (data.mode ?? 'classic') as ModeId;
    this.mapId = (data.map ?? 'nebelmoor') as MapId;
    this.mode = getModeDef(this.modeId);
    this.map = getMapDef(this.mapId);
    this.isDaily = this.modeId === 'daily';
    this.tutorialMode = data.tutorial === true && !getCoreContext().client.tutorialDone();

    // Daily rounds are fully reproducible from the calendar date.
    if (this.isDaily) {
      const now = new Date();
      const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      this.seed = dailySeed(iso);
    } else if (typeof data.seed === 'number' && Number.isFinite(data.seed)) {
      this.seed = data.seed >>> 0;
    } else {
      this.seed = (Date.now() ^ hashString(`${this.modeId}:${this.mapId}`)) >>> 0;
    }
    this.rng = createRng(this.seed);
  }

  create(): void {
    const { client, audio } = getCoreContext();
    const settings = client.settings.all;

    generateTextures(this, this.map, settings.quality);
    generateBackground(this, this.map, settings.quality);

    // Full-screen overlays for darkness and fog.
    this.darkOverlay = this.add.rectangle(
      0,
      0,
      GAME_WIDTH,
      GAME_HEIGHT,
      0x0a0a14,
      this.map.ambientKind === 'night' ? 0.12 : 0,
    );
    this.darkOverlay.setOrigin(0, 0).setDepth(30);
    const fogTex = `bg_fog_${this.map.id}`;
    if (this.textures.exists(fogTex)) {
      this.fogOverlay = this.add.tileSprite(0, GAME_HEIGHT * 0.38, GAME_WIDTH, 420, fogTex);
      this.fogOverlay
        .setOrigin(0, 0.5)
        .setDepth(31)
        .setAlpha(this.map.fogBase * 0.5);
    }

    // FX
    this.fx = new Fx(this);
    this.fx.configure({
      particleDensity: settings.particleDensity,
      screenshake: settings.screenshake,
      reduceMotion: settings.reduceMotion,
      reduceFlash: settings.reduceFlash,
    });
    this.crosshair = new Crosshair(this);
    this.applyCrosshairStyle();
    this.rig = new WeaponRig(this, this.fx, settings.reduceMotion);
    this.rig.setSkin(client.save.equipped.weaponSkin ?? 'default');

    // Systems. Tutorial uses a single-round magazine with no auto-reload so the
    // reload lesson cannot be skipped.
    this.weapon = new Weapon(
      this.tutorialMode
        ? { magazineSize: 1, autoReload: false, totalAmmo: null }
        : {
            magazineSize: this.mode.magazineSize,
            autoReload: this.mode.autoReload,
            totalAmmo: this.mode.totalAmmo,
          },
    );
    this.combo = new ComboTracker({
      windowMs: this.mode.comboWindowMs,
      drainPerMiss: this.mode.comboDrainPerMiss,
    });
    this.spawnDirector = new SpawnDirector(this.mode.spawnIntervalSec, this.rng);
    this.roundDirector = new RoundDirector(this.mode);
    this.difficulty = new DifficultyDirector();
    if (this.tutorialMode) this.difficulty.set(0.85);
    this.windNow = this.map.defaultWind;

    this.spawnEnvObjects();
    this.setupChains();
    this.setupInput();

    if (this.tutorialMode) this.showTutorialStep();

    audio.startAmbient(this.map.ambientKind);
    audio.startMusic(this.mode.zen ? 'zen' : 'hunt');

    this.running = true;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());

    const payload: GameStartPayload = {
      mode: this.modeId,
      map: this.mapId,
      seed: this.seed,
      seedLabel: seedLabel(this.seed),
    };
    bus.emit('game:started', payload);

    // Guaranteed first bird so the player always has something to shoot at.
    this.time.delayedCall(250, () => {
      if (this.running && !this.finishing) this.spawnTarget('moorflatterer', 'line');
    });
  }

  private applyCrosshairStyle(): void {
    const settings = getCoreContext().client.settings.all;
    const equipped = getCoreContext().client.save.equipped.crosshair ?? 'classic';
    this.crosshair.setStyle(equipped, settings.crosshairColor, settings.crosshairSize, settings.reduceMotion);
  }

  private setupInput(): void {
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      this.pointerPos.set(p.x, p.y);
      this.crosshair.setPosition(p.x, p.y);
    });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.pointerPos.set(p.x, p.y);
      this.crosshair.setPosition(p.x, p.y);
      if (p.rightButtonDown()) {
        this.requestReload();
        return;
      }
      this.fireQueued = true;
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.rightButtonReleased() && this.weapon.cancelReload(this.gameMs)) {
        this.rig.reloadFinish();
        bus.emit('weapon:reload', { kind: 'cancel' });
      }
    });

    this.keyDownHandler = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const st = getCoreContext().client.settings.all;
      if (e.code === st.keyFire) {
        e.preventDefault();
        this.fireQueued = true;
      } else if (e.code === st.keyReload) {
        e.preventDefault();
        this.requestReload();
      } else if (e.code === st.keyPause) {
        e.preventDefault();
        getCoreContext().api.pauseGame();
      } else if (e.code === st.keyDebug) {
        e.preventDefault();
        this.toggleDebug();
      }
    };
    window.addEventListener('keydown', this.keyDownHandler);

    // React to live settings changes (crosshair, particle density, weapon skin).
    this.offs.push(
      bus.on('settings:changed', () => {
        const st = getCoreContext().client.settings.all;
        this.applyCrosshairStyle();
        this.fx.configure({
          particleDensity: st.particleDensity,
          screenshake: st.screenshake,
          reduceMotion: st.reduceMotion,
          reduceFlash: st.reduceFlash,
        });
        this.rig.setSkin(getCoreContext().client.save.equipped.weaponSkin ?? 'default');
      }),
    );
  }

  private toggleDebug(): void {
    this.debugOn = !this.debugOn;
    bus.emit('debug:toggle', { enabled: this.debugOn });
    if (this.debugOn && !this.debugText) {
      this.debugText = this.add
        .text(16, GAME_HEIGHT - 190, '', {
          fontFamily: 'monospace',
          fontSize: '18px',
          color: '#9fffb0',
          backgroundColor: '#00000099',
          padding: { x: 8, y: 6 },
        })
        .setDepth(70);
    }
    this.debugText?.setVisible(this.debugOn);
  }

  private spawnEnvObjects(): void {
    for (const def of this.map.envObjects) {
      if (!this.textures.exists(def.kind)) continue;
      const sprite = this.add.image(def.x, def.y, def.kind);
      sprite.setDepth(def.kind === 'water' ? 24 : 25);
      if (def.scale) sprite.setScale(def.scale);
      let extra: Phaser.GameObjects.Image | null = null;
      if (def.kind === 'windmill' && this.textures.exists('windmill_blades')) {
        extra = this.add.image(def.x, def.y - 90, 'windmill_blades');
        extra.setDepth(26);
        if (def.scale) extra.setScale(def.scale);
        this.tweens.add({ targets: extra, angle: 360, duration: 7000, repeat: -1 });
      }
      let revealed = true;
      if (def.hidden) {
        // Hidden objects only shimmer faintly — curious eyes get rewarded.
        sprite.setAlpha(0.16);
        sprite.setTint(0xbfd8e8);
        revealed = false;
        if (!getCoreContext().client.settings.all.reduceMotion) {
          this.tweens.add({ targets: sprite, alpha: 0.34, duration: 1300, yoyo: true, repeat: -1 });
        }
      }
      this.envObjects.push({ def, sprite, extra, hits: 0, destroyed: false, revealed });
    }
  }

  private setupChains(): void {
    for (const c of this.map.chains) {
      this.chainStates.set(c.id, { def: c, stepIndex: 0, complete: false });
    }
  }

  /* ================= main loop ================= */

  override update(_time: number, deltaMsRaw: number): void {
    if (!this.running || this.finishing) return;
    const dtMs = Math.min(50, deltaMsRaw);

    const timeScale = this.timeScaleNow * (this.slowUntilSec > this.gameSec ? this.slowScale : 1);
    const dtSec = (dtMs / 1000) * timeScale;
    this.gameSec += dtSec;
    this.gameMs += dtMs * timeScale;

    // --- round director: phases + events ---
    const duration = this.mode.durationSec;
    const rd = this.roundDirector.update(
      dtSec,
      {
        elapsed: this.gameSec,
        duration,
        difficulty: this.difficulty.factor,
        mapEventPool: this.combinedEventPool(),
        mapId: this.mapId,
      },
      this.rng,
    );
    if (rd.phaseChanged) {
      bus.emit('run:phase', { phase: this.roundDirector.phase, index: this.phaseIndex() });
      const intense = this.roundDirector.phase === 'intense' || this.roundDirector.phase === 'finale';
      if (intense && this.activeEventId !== 'boss') getCoreContext().audio.setMusicIntensity(0.75);
    }
    if (rd.eventStarted) this.onEventStarted(rd.eventStarted);
    if (rd.eventEnded) this.onEventEnded(rd.eventEnded);

    // --- difficulty director ---
    const progress = duration != null ? clamp(this.gameSec / duration, 0, 1) : 0.5;
    this.difficulty.update(dtSec, {
      accuracy: this.shots > 0 ? this.hits / this.shots : 0,
      recentAccuracy: this.recentWindowAccuracy(),
      combo: this.combo.combo,
      missStreak: this.missStreak(),
      avgReactionMs: this.avgReactionMs(),
      progress,
      sensitivity: this.mode.difficultySensitivity,
      zen: !!this.mode.zen,
    });

    // --- combo decay ---
    const tick = this.combo.update(dtMs);
    if (tick.expired && this.combo.bestCombo >= 5) getCoreContext().audio.play('combo_broken');

    // --- spawning (held back while tutorial lessons are incomplete) ---
    if (this.tutorialMode) this.tutorialSpawnGuard(dtSec);
    if (!this.tutorialMode || this.tutorialStep >= 3) {
      const ctx: SpawnContext = {
        mapId: this.mapId,
        phase: this.roundDirector.phase,
        difficulty: this.difficulty.factor,
        activeEvents: this.activeEventId ? [this.activeEventId] : [],
        weatherIds: WEATHER_EVENT_IDS,
        activeTargetCount: this.targets.length,
        maxConcurrentTargets: this.mode.maxConcurrentTargets,
        allowedTargets: this.mode.allowedTargets,
        eventSpawnRateMult: this.activeEventDef?.spawnRateMult ?? 1,
        elapsedSec: this.gameSec,
      };
      for (const d of this.spawnDirector.tick(dtSec, ctx)) this.executeSpawn(d);
    }

    this.updateTargets(dtSec);

    // --- boss ---
    if (this.boss) {
      const env: EnvMod = { wind: this.windNow, speedMult: this.speedMultNow };
      this.boss.update(dtSec, env);
    }

    this.updateEventAmbience(dtSec);

    // --- fire exactly once per update so held input cannot machine-gun ---
    const prevState = this.weapon.stateNow;
    if (this.fireQueued) {
      this.fireQueued = false;
      this.tryFire();
    }

    // weapon timers
    for (const we of this.weapon.update(this.gameMs)) {
      if (we.kind === 'reload_finish') {
        getCoreContext().audio.play('reload_end');
        this.rig.reloadFinish();
      } else if (we.kind === 'out_of_ammo') {
        this.finishRound('out_of_ammo');
        return;
      }
    }
    // Auto-reloads start inside tryFire — catch the transition so the rig dips
    // and the sound plays for auto and manual alike (manual fires it directly).
    if (prevState !== 'reloading' && this.weapon.stateNow === 'reloading' && !this.reloadVisualPending) {
      getCoreContext().audio.play('reload_start');
      this.rig.reloadDip();
      this.reloads += 1;
      bus.emit('weapon:reload', { kind: 'auto' });
      this.tutorialPump();
    }
    this.reloadVisualPending = false;

    // score display eases toward the true score
    this.scoreDisplay += (this.score - this.scoreDisplay) * Math.min(1, dtMs / 140);
    if (Math.abs(this.score - this.scoreDisplay) < 1) this.scoreDisplay = this.score;

    // --- time up ---
    if (duration != null && this.gameSec >= duration + this.bonusTimeSeconds) {
      this.finishRound('time');
      return;
    }
    // tutorial safety valve
    if (this.tutorialMode && this.gameSec > 75) this.completeTutorial();

    this.pushHud();
    this.rig.update(dtMs, this.pointerPos.x);

    if (this.fogOverlay && this.fogOverlay.alpha > 0.01) {
      this.fogOverlay.tilePositionX += (18 + this.windNow * 70) * dtSec;
    }

    if (this.debugOn && this.debugText) this.renderDebug();
  }

  /** Keep an easy bird available while the first tutorial lessons run. */
  private tutorialSpawnGuard(dtSec: number): void {
    if (this.tutorialStep > 1) return;
    this.tutSpawnTimer -= dtSec;
    if (this.targets.length === 0 || this.tutSpawnTimer <= 0) {
      this.tutSpawnTimer = 2.5;
      this.spawnTarget('moorflatterer', 'line');
    }
  }

  private tutSpawnTimer = 0;

  private updateTargets(dtSec: number): void {
    const env: EnvMod = { wind: this.windNow, speedMult: this.speedMultNow };
    // Formation members share one anchor: advance each anchor only once per tick.
    const anchorAlive = new Map<Trajectory, boolean>();
    for (let i = this.targets.length - 1; i >= 0; i--) {
      const t = this.targets[i] as ActiveTarget;
      let alive: boolean;
      if (t.shared && anchorAlive.has(t.shared)) {
        alive = anchorAlive.get(t.shared) ?? false;
      } else {
        alive = t.traj.update(dtSec, env);
        if (t.shared) anchorAlive.set(t.shared, alive);
      }
      const snap = t.traj.snapshot();
      t.sprite.setPosition(snap.x, snap.y);
      t.sprite.setScale(snap.scale);
      t.sprite.setAngle(snap.angle * (180 / Math.PI));
      t.sprite.setDepth(Math.round(10 + snap.depth * 10));
      if (t.armorSprite) {
        t.armorSprite.setPosition(snap.x, snap.y);
        t.armorSprite.setScale(snap.scale);
        t.armorSprite.setAngle(snap.angle * (180 / Math.PI));
        t.armorSprite.setDepth(t.sprite.depth + 1);
      }
      if (!alive) {
        this.targets.splice(i, 1);
        t.sprite.destroy();
        t.armorSprite?.destroy();
        if (t.groupSize >= 4 && this.swarmGroup.active) {
          this.swarmGroup.escaped += 1;
          this.checkSwarmResolved();
        }
        bus.emit('target:escaped', { targetId: t.targetId });
      }
    }
    // Drop anchors no live target references anymore.
    for (const [key, anchor] of this.formationAnchors) {
      if (!this.targets.some((t) => t.shared === anchor)) this.formationAnchors.delete(key);
    }
  }

  private groupKey(d: { targetId: string; groupSize: number }): string {
    return `${d.targetId}|${d.groupSize}`;
  }

  private executeSpawn(d: SpawnDecision): void {
    if (d.trajectory === 'formation' && d.groupSize > 1) {
      const def = getTargetDef(d.targetId);
      if (d.groupIndex === 0) {
        const { member, shared } = createFormation(def, this.rng, d.groupSize, 0);
        this.formationAnchors.set(this.groupKey(d), shared);
        this.addFlyingTarget(d.targetId, member, shared, d.groupSize, d.groupIndex);
      } else {
        const anchor = this.formationAnchors.get(this.groupKey(d));
        if (anchor) {
          const member = createFormationMemberAt(anchor, d.groupIndex, this.rng);
          this.addFlyingTarget(d.targetId, member, anchor, d.groupSize, d.groupIndex);
        } else {
          this.spawnTarget(d.targetId, 'line');
        }
      }
      return;
    }
    this.spawnTarget(d.targetId, d.trajectory);
  }

  private spawnTarget(targetId: string, kind: string): void {
    const def = getTargetDef(targetId);
    const traj = createTrajectory(kind as never, def, this.rng);
    this.addFlyingTarget(targetId, traj, null, 1, 0);
  }

  private addFlyingTarget(
    targetId: string,
    traj: Trajectory,
    shared: Trajectory | null,
    groupSize: number,
    groupIndex: number,
  ): void {
    const def = getTargetDef(targetId);
    const frameKey = `bird_${targetId}_f0`;
    if (!this.textures.exists(frameKey)) return;
    const snap = traj.snapshot();
    const sprite = this.add.sprite(snap.x, snap.y, frameKey);
    sprite.setDepth(Math.round(10 + snap.depth * 10));
    sprite.setScale(snap.scale);
    if (this.anims.exists(`fly_${targetId}`)) sprite.play(`fly_${targetId}`);

    let armorSprite: Phaser.GameObjects.Image | null = null;
    if (def.armor && def.armor > 0) {
      const lvl = clamp(def.armor, 1, 3);
      if (this.textures.exists(`armor_${lvl}`)) {
        armorSprite = this.add.image(snap.x, snap.y, `armor_${lvl}`);
        armorSprite.setDepth(sprite.depth + 1);
        armorSprite.setScale(snap.scale);
      }
    }

    const golden = this.goldenActive && this.rng.chance(0.5);
    if (golden) sprite.setTint(0xffd54a);

    const at: ActiveTarget = {
      id: this.nextTargetId++,
      targetId,
      sprite,
      armorSprite,
      armorLeft: def.armor ?? 0,
      traj,
      shared,
      groupSize,
      groupIndex,
      golden,
      spawnedAtSec: this.gameSec,
    };
    this.targets.push(at);

    // One live swarm group is tracked at a time for the fast-clear bonus.
    if (groupSize >= 4) {
      if (!this.swarmGroup.active) {
        this.swarmGroup = {
          size: groupSize,
          spawned: 1,
          killed: 0,
          escaped: 0,
          firstSpawnSec: this.gameSec,
          active: true,
        };
      } else if (this.swarmGroup.size === groupSize) {
        this.swarmGroup.spawned += 1;
      }
    }

    if (def.rare) {
      getCoreContext().audio.play('rare', { vol: 0.5 });
      if (!getCoreContext().client.settings.all.reduceMotion) {
        this.fx.popup(snap.x, snap.y - 70, t(`name.${targetId}`), { color: '#ffe08a', size: 28, small: true });
      }
    }
    bus.emit('target:spawned', { targetId, groupIndex });
  }

  private checkSwarmResolved(): void {
    const g = this.swarmGroup;
    if (!g.active) return;
    const total = Math.max(g.size, g.spawned);
    if (g.killed + g.escaped < total) return;
    if (g.escaped === 0 && g.killed >= g.size) {
      const elapsed = this.gameSec - g.firstSpawnSec;
      if (elapsed <= 6) {
        this.swarmClearedFast = true;
        this.awardSwarmBonus(g.size, elapsed);
      }
    }
    g.active = false;
  }

  /* ================= shooting ================= */

  private tryFire(): void {
    if (!this.running || this.finishing) return;
    const { audio } = getCoreContext();
    const fired = this.weapon.tryFire(this.gameMs);
    if (!fired) {
      if (this.weapon.stateNow === 'empty') audio.play('dry_fire');
      return;
    }
    this.shots += 1;
    audio.play('shot', { pitch: 0.96 + this.rng.next() * 0.08 });
    this.rig.fire(this.pointerPos.x);
    this.doScreenshake(2.5);
    bus.emit('weapon:fired', { ammo: this.weapon.ammo });

    const hit = this.resolveHit(this.pointerPos.x, this.pointerPos.y);
    if (hit) {
      this.onHit(hit.target, hit.perfect, hit.result);
      return;
    }
    if (this.tryHitEnvObject(this.pointerPos.x, this.pointerPos.y)) {
      this.hits += 1;
      this.pushRecent(true);
      return;
    }
    this.onMiss(this.pointerPos.x, this.pointerPos.y);
  }

  private resolveHit(x: number, y: number): { target: ActiveTarget; perfect: boolean; result: HitResult } | null {
    // The boss takes priority whenever it is on screen.
    if (this.boss && this.boss.alive) {
      const b = this.boss;
      const nx = (x - b.xPublic) / b.radius;
      const ny = (y - b.yPublic) / (b.radius * 0.8);
      if (nx * nx + ny * ny <= 1) {
        const perfect = Math.hypot(nx, ny) <= 0.4;
        const result = computeHit({
          targetId: b.def.id,
          basePoints: 100,
          depthScoring: true,
          x,
          y,
          cx: b.xPublic,
          cy: b.yPublic,
          rx: b.radius,
          ry: b.radius * 0.8,
          innerRx: b.radius * 0.4,
          innerRy: b.radius * 0.32,
          speed: 300,
          depth: 1.2,
          timeLeft: this.timeLeft(),
          combo: this.combo.combo,
          perfectStreak: this.combo.perfectStreak,
          eventMultiplier: this.currentScoreMult(),
          swarmBonus: false,
          trickshot: false,
          longshot: false,
          runPerfectHits: this.perfectHits,
          comboBonusThresholds: this.comboThresholds(),
          rng: this.rng,
        });
        // Boss hits use a synthetic target marker (id -1).
        return { target: { id: -1, targetId: b.def.id } as unknown as ActiveTarget, perfect, result };
      }
    }

    // Nearest-to-camera target wins when hitboxes overlap.
    let best: ActiveTarget | null = null;
    let bestDepth = -Infinity;
    for (const at of this.targets) {
      if (!at.sprite.active) continue;
      const def = getTargetDef(at.targetId);
      const snap = at.traj.snapshot();
      if (isInsideHitbox(x, y, snap.x, snap.y, snap.scale * def.rx, snap.scale * def.ry) && snap.depth > bestDepth) {
        best = at;
        bestDepth = snap.depth;
      }
    }
    if (!best) return null;

    const def = getTargetDef(best.targetId);
    const snap = best.traj.snapshot();
    const rx = snap.scale * def.rx;
    const ry = snap.scale * def.ry;
    const innerRx = rx * def.perfectRatio;
    const innerRy = ry * def.perfectRatio;
    const perfect = isPerfect(x, y, snap.x, snap.y, innerRx, innerRy);
    const distFromCenter = Math.hypot(x - snap.x, y - snap.y);
    const longshot = distFromCenter >= BALANCE.scoring.longshotMinDistPx;
    const trickshot = best.traj.kind === 'spiral' || best.traj.kind === 'formation' || this.timeScaleNow < 0.8;
    const swarmBonus = def.flags?.swarm != null && best.groupSize >= 4;

    const result = computeHit({
      targetId: best.targetId,
      basePoints: def.basePoints,
      depthScoring: !!def.depthScoring,
      x,
      y,
      cx: snap.x,
      cy: snap.y,
      rx,
      ry,
      innerRx,
      innerRy,
      speed: snap.speed,
      depth: snap.depth,
      timeLeft: this.timeLeft(),
      combo: this.combo.combo,
      perfectStreak: this.combo.perfectStreak,
      eventMultiplier: this.currentScoreMult(),
      swarmBonus,
      trickshot,
      longshot,
      runPerfectHits: this.perfectHits,
      comboBonusThresholds: this.comboThresholds(),
      rng: this.rng,
    });
    return { target: best, perfect, result };
  }

  private onHit(target: ActiveTarget, perfect: boolean, result: HitResult): void {
    const { audio, client } = getCoreContext();
    const density = client.settings.all.particleDensity;
    const x = this.pointerPos.x;
    const y = this.pointerPos.y;

    // ---- boss path ----
    if (target.id === -1 && this.boss) {
      const b = this.boss;
      const r = b.hit();
      this.hits += 1;
      this.pushRecent(true);
      this.combo.registerHit(perfect);
      this.score += result.total;
      audio.play(perfect ? 'perfect' : r.coreDamage ? 'boss_hit' : 'hit_armor');
      this.fx.armorSpark(x, y, density * (r.coreDamage ? 1 : 1.6));
      this.fx.hitRing(x, y);
      this.fx.popup(x, y - 40, `+${result.total}`, { color: r.coreDamage ? '#ff9a6a' : '#cfd8dd' });
      this.doHitStop(BALANCE.fx.bossHitStopMs);
      this.doScreenshake(5);
      if (!b.alive) this.onBossDefeated();
      else if (!r.coreDamage) this.spawnArmorPlate();
      this.checkChallengeProgress();
      return;
    }

    const def = getTargetDef(target.targetId);

    // ---- armor soaks hits first ----
    if (target.armorLeft > 0) {
      target.armorLeft -= 1;
      this.hits += 1;
      this.pushRecent(true);
      this.recordReaction(target);
      audio.play('hit_armor');
      this.fx.armorSpark(x, y, density);
      this.fx.hitRing(x, y);
      if (target.armorSprite) {
        if (target.armorLeft > 0) {
          const lvl = clamp(target.armorLeft, 1, 3);
          if (this.textures.exists(`armor_${lvl}`)) target.armorSprite.setTexture(`armor_${lvl}`);
          this.tweens.add({ targets: target.armorSprite, angle: '+=' + 4, duration: 50, yoyo: true });
        } else {
          target.armorSprite.destroy();
          target.armorSprite = null;
        }
      }
      this.score += Math.round(result.total * 0.3);
      this.fx.popup(x, y - 30, 'CLANG', { color: '#cfd8dd', small: true });
      this.checkChallengeProgress();
      return;
    }

    this.hits += 1;
    this.pushRecent(true);
    this.recordReaction(target);

    // Deceptive birds look golden but punish sloppy trigger fingers.
    if (def.flags?.deceptive && !perfect) {
      const wasBig = this.combo.registerMiss();
      if (wasBig) bus.emit('combo:broken', { combo: this.combo.combo });
      this.fx.popup(x, y - 60, t('hit.deceptive'), { color: '#ff7a7a', small: true });
    } else {
      this.combo.registerHit(perfect);
    }

    this.score += result.total;
    this.targetsHit[target.targetId] = (this.targetsHit[target.targetId] ?? 0) + 1;
    if (result.total > this.bestHitPoints) {
      this.bestHitPoints = result.total;
      this.bestHitTargetId = target.targetId;
    }
    if (perfect) this.perfectHits += 1;
    if (result.swarmBonus > 0) this.swarmBonuses += 1;
    if (result.trickshot) this.trickshots += 1;
    if (result.longshot) this.longshots += 1;
    if (target.golden && this.goldenActive) this.goldDuringStorm = true;

    if (perfect) {
      audio.play('perfect');
      this.fx.popup(x, y - 74, t('hit.perfect'), { color: '#ffe08a', size: 34 });
      this.doHitStop(BALANCE.fx.perfectHitStopMs);
    } else {
      audio.play('hit');
      this.doHitStop(BALANCE.fx.hitStopMs);
    }
    audio.play(this.pickBirdCall(target.targetId), { vol: 0.45 });
    this.fx.feathersBurst(x, y, density, target.golden);
    this.fx.hitRing(x, y);
    this.fx.popup(x, y - 40, `+${result.total}`, {
      color: target.golden ? '#ffd54a' : perfect ? '#ffe9a8' : '#ffffff',
    });
    this.doScreenshake(perfect ? 4 : 2);

    if (this.combo.combo > 0 && this.combo.combo % 10 === 0) {
      audio.play('combo_milestone');
      this.fx.popup(GAME_WIDTH / 2, GAME_HEIGHT * 0.28, t('announce.combo', { n: this.combo.combo }), {
        color: '#ffd54a',
        size: 52,
      });
      bus.emit('combo:milestone', { combo: this.combo.combo });
    }
    bus.emit('combo:changed', { combo: this.combo.combo, multiplier: this.combo.multiplier });

    if (target.groupSize >= 4 && this.swarmGroup.active) {
      this.swarmGroup.killed += 1;
      this.checkSwarmResolved();
    }

    bus.emit('target:hit', { targetId: target.targetId, points: result.total, perfect });
    this.killTarget(target);
    this.checkChallengeProgress();

    if (this.tutorialMode) this.tutorialAdvanceOnHit();
  }

  private onMiss(x: number, y: number): void {
    const { audio, client } = getCoreContext();
    this.misses += 1;
    this.pushRecent(false);
    const wasBig = this.combo.registerMiss();
    if (wasBig) {
      audio.play('combo_broken');
      this.fx.popup(x, y - 30, t('combo.broken'), { color: '#ff8a8a', small: true });
      bus.emit('combo:broken', { combo: this.combo.combo });
    }
    this.fx.smokePuff(x, y, client.settings.all.particleDensity * 0.35);

    // Shots near a target scatter it — missing has consequences.
    for (const at of this.targets) {
      const snap = at.traj.snapshot();
      if (Math.hypot(x - snap.x, y - snap.y) < 160) at.traj.flee(x, y, this.rng);
    }
    if (this.boss) {
      if (this.boss.hitDecoy(x, y)) {
        this.bossMisses += 1;
        this.fx.popup(x, y - 30, t('hit.decoy'), { color: '#b8a8ff', small: true });
      }
    }
  }

  private killTarget(target: ActiveTarget): void {
    const idx = this.targets.indexOf(target);
    if (idx >= 0) this.targets.splice(idx, 1);
    target.armorSprite?.destroy();
    target.sprite.destroy();
  }

  /* ================= environment objects & chains ================= */

  private tryHitEnvObject(x: number, y: number): boolean {
    for (let i = this.envObjects.length - 1; i >= 0; i--) {
      const inst = this.envObjects[i] as EnvObjectInstance;
      if (inst.destroyed) continue;
      const w = inst.sprite.displayWidth * 0.5;
      const h = inst.sprite.displayHeight * 0.5;
      if (Math.abs(x - inst.def.x) <= w && Math.abs(y - inst.def.y) <= h) {
        this.onEnvObjectHit(inst);
        return true;
      }
    }
    return false;
  }

  private onEnvObjectHit(inst: EnvObjectInstance): void {
    const { audio, client } = getCoreContext();
    const density = client.settings.all.particleDensity;
    inst.hits += 1;

    if (inst.def.hidden && !inst.revealed) {
      inst.revealed = true;
      this.tweens.killTweensOf(inst.sprite);
      inst.sprite.setAlpha(1).clearTint();
      this.hiddenFound.add(inst.def.id);
      this.fx.popup(inst.def.x, inst.def.y - 70, t('env.found'), { color: '#8ce8d0', size: 30 });
      audio.play('achievement', { vol: 0.6 });
    }
    audio.play('hit', { pitch: 1.15 });
    this.fx.armorSpark(inst.def.x, inst.def.y, density * 0.7);
    this.fx.hitRing(inst.def.x, inst.def.y);
    const gained = Math.round(inst.def.score * this.currentScoreMult());
    this.score += gained;
    this.fx.popup(inst.def.x, inst.def.y - 40, `+${gained}`);

    if (inst.hits >= inst.def.hitsRequired) {
      this.destroyEnvObject(inst);
    } else {
      this.tweens.add({
        targets: inst.sprite,
        x: inst.def.x + 6,
        duration: 45,
        yoyo: true,
        onComplete: () => inst.sprite.setPosition(inst.def.x, inst.def.y),
      });
    }
    this.checkChallengeProgress();
  }

  private destroyEnvObject(inst: EnvObjectInstance): void {
    const { audio, client } = getCoreContext();
    const density = client.settings.all.particleDensity;
    inst.destroyed = true;
    audio.play('explosion');
    this.fx.smokePuff(inst.def.x, inst.def.y, density * 1.6);
    this.doScreenshake(6);
    this.tweens.add({
      targets: inst.sprite,
      alpha: 0,
      scaleX: inst.sprite.scaleX * 1.25,
      scaleY: inst.sprite.scaleY * 1.25,
      duration: 240,
      onComplete: () => {
        inst.sprite.destroy();
        inst.extra?.destroy();
      },
    });
    this.applyEffect(inst.def.effect);
    if (inst.def.chainId) this.advanceChain(inst.def.chainId, inst.def.id);
    if (this.tutorialMode && this.tutorialStep === 2) this.completeTutorial();
  }

  private advanceChain(chainId: string, objectId: string): void {
    const chain = this.chainStates.get(chainId);
    if (!chain || chain.complete) return;
    const expected = chain.def.steps[chain.stepIndex];
    if (!expected || expected.objectId !== objectId) return;
    const { audio } = getCoreContext();
    audio.play('chain_step');
    bus.emit('chain:step', { chainId, step: chain.stepIndex + 1, objectId });
    this.applyEffect(expected.effect);
    chain.stepIndex += 1;
    if (chain.stepIndex >= chain.def.steps.length) {
      chain.complete = true;
      this.chainReactions += 1;
      this.longestChain = Math.max(this.longestChain, chain.def.steps.length);
      this.score += chain.def.finalBonus;
      this.eventBonusPoints += chain.def.finalBonus;
      audio.play('chain_complete');
      bus.emit('chain:complete', { chainId, steps: chain.def.steps.length });
      this.fx.popup(GAME_WIDTH / 2, GAME_HEIGHT * 0.32, t('chain.complete', { points: chain.def.finalBonus }), {
        color: '#ffd54a',
        size: 54,
      });
      this.fx.celebrate(getCoreContext().client.settings.all.particleDensity);
      this.doScreenshake(8);
    }
  }

  private applyEffect(effect: EffectSpec | undefined): void {
    if (!effect) return;
    if (effect.points) this.score += effect.points;
    if (effect.timeBonusSec) {
      this.bonusTimeSeconds += effect.timeBonusSec;
      this.fx.popup(GAME_WIDTH / 2, GAME_HEIGHT * 0.22, t('effect.time', { n: effect.timeBonusSec }), {
        color: '#8ce8d0',
        size: 40,
      });
    }
    if (effect.scoreMult) {
      this.scoreMultNow = Math.max(this.scoreMultNow, effect.scoreMult.value);
      this.scoreMultUntilSec = Math.max(this.scoreMultUntilSec, this.gameSec + effect.scoreMult.durationSec);
    }
    if (effect.slowTime) {
      this.slowUntilSec = this.gameSec + effect.slowTime.durationSec;
      this.slowScale = effect.slowTime.scale;
    }
    if (effect.spawn) {
      const spawn = effect.spawn;
      for (let i = 0; i < spawn.count; i++) {
        const kind = this.rng.pick(getTargetDef(spawn.targetId).allowedTrajectories);
        this.time.delayedCall(80 * i, () => {
          if (this.running && !this.finishing) this.spawnTarget(spawn.targetId, kind);
        });
      }
    }
    if (effect.scare) this.playScare(effect.scare);
  }

  private playScare(kind: string): void {
    const { audio } = getCoreContext();
    if (kind === 'frog') {
      audio.play('quack', { pitch: 1.3 });
      const x = this.rng.range(GAME_WIDTH * 0.1, GAME_WIDTH * 0.9);
      const frog = this.add
        .image(x, GAME_HEIGHT * 0.86, 'pumpkin')
        .setDepth(25)
        .setScale(0.4)
        .setTint(0x7fbf5f);
      this.tweens.add({
        targets: frog,
        y: GAME_HEIGHT * 0.78,
        angle: 20,
        duration: 180,
        yoyo: true,
        onComplete: () => frog.destroy(),
      });
    } else if (kind === 'owl') {
      audio.play('caw');
    } else if (kind === 'gull') {
      audio.play('caw', { pitch: 1.2 });
    }
  }

  /* ================= events ================= */

  private combinedEventPool(): string[] {
    const modePool = new Set(this.mode.eventPool);
    return this.map.eventPool.filter((id) => modePool.has(id));
  }

  private onEventStarted(eventId: string): void {
    const def = getEventDef(eventId);
    this.activeEventId = eventId;
    this.activeEventDef = def;

    if (def.wind != null) this.windNow = clamp(def.wind, -1, 1);
    if (def.speedMult != null) this.speedMultNow = def.speedMult;
    if (def.timeScale != null) this.timeScaleNow = def.timeScale;
    if (def.scoreMult != null && def.scoreMult > 1) {
      this.scoreMultNow = Math.max(this.scoreMultNow, def.scoreMult);
      this.scoreMultUntilSec = Math.max(this.scoreMultUntilSec, this.gameSec + def.durationSec);
    }
    if (def.fog != null && this.fogOverlay) {
      this.tweens.add({ targets: this.fogOverlay, alpha: def.fog * 0.85, duration: 1200 });
    }
    if (def.darkness != null && this.darkOverlay && !getCoreContext().client.settings.all.reduceFlash) {
      this.tweens.add({ targets: this.darkOverlay, fillAlpha: def.darkness, duration: 1400 });
    }
    this.goldenActive = !!def.golden;
    if (this.goldenActive) {
      for (const at of this.targets) {
        if (this.rng.chance(0.35)) {
          at.golden = true;
          at.sprite.setTint(0xffd54a);
        }
      }
    }
    if (eventId === 'gewitter') this.thunderTimer = 1.2;
    if (eventId === 'massenstart') {
      for (let i = 0; i < 6; i++) {
        this.time.delayedCall(140 * i, () => {
          if (this.running && !this.finishing) this.spawnTarget('schwarmvogel', 'line');
        });
      }
    }
    if (eventId === 'goldener_schwarm') {
      for (let i = 0; i < 4; i++) {
        this.time.delayedCall(200 * i, () => {
          if (this.running && !this.finishing) this.spawnTarget('goldschnabel', 'bezier');
        });
      }
    }
    if (eventId === 'boss') {
      const bossId = this.roundDirector.pickBoss(this.mapId, this.rng);
      if (bossId) this.spawnBoss(bossId);
    }

    getCoreContext().audio.setMusicIntensity(eventId === 'boss' ? 1 : 0.65);
    if (eventId === 'boss') getCoreContext().audio.play('boss_roar');
    const label = t(`event.${eventId}.name`);
    bus.emit('event:announced', { eventId, label });
    bus.emit('event:started', { eventId });
    this.fx.popup(GAME_WIDTH / 2, GAME_HEIGHT * 0.2, label, { color: '#ffe08a', size: 50 });
  }

  private onEventEnded(eventId: string): void {
    if (this.activeEventId !== eventId) return;
    const def = getEventDef(eventId);
    this.activeEventId = null;
    this.activeEventDef = null;
    if (def.wind != null) this.windNow = this.map.defaultWind;
    if (def.speedMult != null) this.speedMultNow = 1;
    if (def.timeScale != null) this.timeScaleNow = 1;
    if (this.scoreMultUntilSec <= this.gameSec) this.scoreMultNow = 1;
    if (def.fog != null && this.fogOverlay) {
      this.tweens.add({ targets: this.fogOverlay, alpha: this.map.fogBase * 0.5, duration: 1200 });
    }
    if (def.darkness != null && this.darkOverlay) {
      const base = this.map.ambientKind === 'night' ? 0.12 : 0;
      this.tweens.add({ targets: this.darkOverlay, fillAlpha: base, duration: 1400 });
    }
    this.goldenActive = false;
    if (eventId === 'boss') {
      // The boss window closed without a kill.
      this.boss?.destroy();
      this.boss = null;
    }
    const intense = this.roundDirector.phase === 'intense' || this.roundDirector.phase === 'finale';
    getCoreContext().audio.setMusicIntensity(intense ? 0.8 : 0.4);
    bus.emit('event:ended', { eventId });
  }

  private updateEventAmbience(dtSec: number): void {
    if (this.scoreMultUntilSec > 0 && this.gameSec >= this.scoreMultUntilSec && !this.activeEventDef?.scoreMult) {
      this.scoreMultNow = 1;
    }
    if (this.activeEventId === 'gewitter' || this.activeEventId === 'regenfront') {
      this.thunderTimer -= dtSec;
      if (this.thunderTimer <= 0) {
        this.thunderTimer = this.rng.range(2.5, 6);
        getCoreContext().audio.play('thunder', { vol: 0.7 });
        if (!getCoreContext().client.settings.all.reduceFlash) this.lightningFlash();
      }
    }
  }

  private lightningFlash(): void {
    const g = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT * 0.35, GAME_WIDTH, GAME_HEIGHT * 0.7, 0xffffff, 0)
      .setDepth(33);
    this.tweens.add({
      targets: g,
      fillAlpha: { from: 0.5, to: 0 },
      duration: 160,
      onComplete: () => g.destroy(),
    });
  }

  /* ================= boss ================= */

  private spawnBoss(bossId: string): void {
    if (this.boss) return;
    const def = getBossDef(bossId);
    const img = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT * 0.42, `boss_${bossId}_f0`);
    img.setDepth(34);
    let armorImg: Phaser.GameObjects.Image | null = null;
    if (def.behavior === 'armored' && this.textures.exists('armor_3')) {
      armorImg = this.add.image(img.x, img.y, 'armor_3');
      armorImg.setDepth(35);
    }
    this.boss = new BossRuntime(this, def, this.rng, img, armorImg);
    bus.emit('boss:spawned', { bossId });
    this.fx.popup(GAME_WIDTH / 2, GAME_HEIGHT * 0.4, def.name, { color: '#ff8a6a', size: 56 });
  }

  private spawnArmorPlate(): void {
    const plate = this.add
      .rectangle(this.rng.range(GAME_WIDTH * 0.3, GAME_WIDTH * 0.7), GAME_HEIGHT * 0.4, 30, 24, 0x8a8f9a)
      .setDepth(34);
    this.tweens.add({
      targets: plate,
      y: GAME_HEIGHT + 60,
      angle: this.rng.range(-300, 300),
      duration: 900,
      onComplete: () => plate.destroy(),
    });
  }

  private onBossDefeated(): void {
    if (!this.boss) return;
    const def = this.boss.def;
    const bx = this.boss.xPublic;
    const by = this.boss.yPublic;
    this.bossDefeated = true;
    const { audio, client } = getCoreContext();
    audio.play('boss_defeat');
    this.score += def.points;
    this.eventBonusPoints += def.points;
    const density = client.settings.all.particleDensity;
    this.fx.feathersBurst(bx, by, density * 2.5);
    this.fx.smokePuff(bx, by, density * 2);
    this.fx.celebrate(density);
    this.doScreenshake(12);
    this.fx.popup(GAME_WIDTH / 2, GAME_HEIGHT * 0.38, t('boss.defeated', { name: def.name, points: def.points }), {
      color: '#ffd54a',
      size: 56,
    });
    bus.emit('boss:defeated', { bossId: def.id });
    this.boss.destroy();
    this.boss = null;
    // Clear the boss event so the normal round flow resumes.
    if (this.activeEventId === 'boss') {
      this.roundDirector.clearEvent();
      this.activeEventId = null;
      this.activeEventDef = null;
    }
  }

  /* ================= tutorial ================= */

  private showTutorialStep(): void {
    this.tutorialText?.destroy();
    this.tutorialText = null;
    const stepKey = `tutorial.step${this.tutorialStep + 1}`;
    const txt = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT * 0.16, t(stepKey), {
      fontFamily: '"Trebuchet MS", sans-serif',
      fontSize: '32px',
      fontStyle: 'bold',
      color: '#fff6d8',
      backgroundColor: '#22160acc',
      padding: { x: 18, y: 12 },
      align: 'center',
      wordWrap: { width: 900 },
    });
    txt.setOrigin(0.5).setDepth(65);
    this.tutorialText = txt;
    if (!getCoreContext().client.settings.all.reduceMotion) {
      this.tweens.add({ targets: txt, alpha: { from: 0, to: 1 }, duration: 260 });
    }
  }

  private tutorialAdvanceOnHit(): void {
    if (this.tutorialStep !== 0) return;
    this.tutorialStep = 1;
    this.showTutorialStep();
  }

  /** Called after a reload started; advances the reload lesson. */
  private tutorialPump(): void {
    if (!this.tutorialMode) return;
    if (this.tutorialStep === 1 && this.reloads > 0) {
      this.tutorialStep = 2;
      this.showTutorialStep();
    }
  }

  private completeTutorial(): void {
    if (!this.tutorialMode) return;
    this.tutorialStep = 3;
    this.tutorialMode = false;
    if (this.tutorialText) {
      const txt = this.tutorialText;
      txt.setText(t('tutorial.done'));
      this.tweens.add({ targets: txt, alpha: 0, delay: 900, duration: 500, onComplete: () => txt.destroy() });
      this.tutorialText = null;
    }
    getCoreContext().client.markTutorialDone();
    // Restore the real magazine for the actual round.
    this.weapon = new Weapon({
      magazineSize: this.mode.magazineSize,
      autoReload: this.mode.autoReload,
      totalAmmo: this.mode.totalAmmo,
    });
  }

  /* ================= helpers ================= */

  private requestReload(): void {
    if (!this.running || this.finishing) return;
    if (this.weapon.requestReload(this.gameMs)) {
      // The update-loop transition detector plays visuals for auto reloads; this
      // flag stops it from counting the same manual reload twice.
      this.reloadVisualPending = true;
      getCoreContext().audio.play('reload_start');
      this.rig.reloadDip();
      this.reloads += 1;
      bus.emit('weapon:reload', { kind: 'manual' });
      this.tutorialPump();
    }
  }

  /** Set when requestReload already played the reload visuals. */
  private reloadVisualPending = false;

  private currentScoreMult(): number {
    const evt = this.activeEventDef?.scoreMult ?? 1;
    const prop = this.scoreMultActive() ? this.scoreMultNow : 1;
    return Math.max(1, evt * prop);
  }

  private scoreMultActive(): boolean {
    return this.gameSec < this.scoreMultUntilSec;
  }

  private timeLeft(): number {
    if (this.mode.durationSec == null) return Number.POSITIVE_INFINITY;
    return Math.max(0, this.mode.durationSec + this.bonusTimeSeconds - this.gameSec);
  }

  private phaseIndex(): number {
    const phases = ['intro', 'ramp', 'mid', 'rest', 'intense', 'finale'];
    return Math.max(0, phases.indexOf(this.roundDirector.phase));
  }

  private pushRecent(hit: boolean): void {
    this.recentResults.push(hit);
    if (this.recentResults.length > 12) this.recentResults.shift();
  }

  private recentWindowAccuracy(): number {
    if (this.recentResults.length === 0) return 0.6;
    const sum = this.recentResults.reduce((a, b) => a + (b ? 1 : 0), 0);
    return sum / this.recentResults.length;
  }

  private missStreak(): number {
    let n = 0;
    for (let i = this.recentResults.length - 1; i >= 0; i--) {
      if (this.recentResults[i]) break;
      n += 1;
    }
    return n;
  }

  private recordReaction(target: ActiveTarget): void {
    const dt = (this.gameSec - target.spawnedAtSec) * 1000;
    if (dt > 80 && dt < 15000) {
      this.reactionTimes.push(dt);
      if (this.reactionTimes.length > 25) this.reactionTimes.shift();
    }
  }

  private avgReactionMs(): number {
    if (this.reactionTimes.length === 0) return 0;
    const sorted = [...this.reactionTimes].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
  }

  private pickBirdCall(targetId: string): 'quack' | 'caw' {
    return targetId === 'sturmvogel' || targetId === 'mondglider' ? 'caw' : 'quack';
  }

  private comboThresholds(): readonly number[] {
    return [10, 20, 30, 40, 50];
  }

  private awardSwarmBonus(size: number, elapsed: number): void {
    const bonus = 500 + size * 120 + Math.max(0, Math.round((6 - elapsed) * 150));
    this.score += bonus;
    this.eventBonusPoints += bonus;
    getCoreContext().audio.play('swarm_bonus');
    this.fx.popup(GAME_WIDTH / 2, GAME_HEIGHT * 0.26, t('swarm.cleared', { n: size, points: bonus }), {
      color: '#ffe08a',
      size: 46,
    });
  }

  private doHitStop(ms: number): void {
    if (getCoreContext().client.settings.all.reduceMotion) return;
    const prev = this.timeScaleNow;
    this.timeScaleNow = prev * 0.35;
    this.time.delayedCall(ms, () => {
      this.timeScaleNow = prev;
    });
  }

  private doScreenshake(strength: number): void {
    const { client } = getCoreContext();
    const s = client.settings.all.screenshake;
    if (s <= 0 || client.settings.all.reduceMotion) return;
    this.cameras.main.shake(60, (strength * s) / GAME_HEIGHT);
  }

  private checkChallengeProgress(): void {
    const client = getCoreContext().client;
    for (const ch of CHALLENGES) {
      if (client.save.challenges[ch.id]?.completedAt != null) continue;
      if (ch.map && ch.map !== this.mapId) continue;
      let progress = 0;
      switch (ch.metric) {
        case 'hits_without_miss':
          progress = this.combo.hitsWithoutMiss;
          break;
        case 'perfect_streak':
          progress = this.combo.perfectStreak;
          break;
        case 'chain_steps':
          progress = this.longestChain;
          break;
        case 'boss_no_miss':
          progress = this.bossDefeated && this.bossMisses === 0 ? 1 : 0;
          break;
        case 'hidden_found_map':
          progress = this.hiddenFound.size;
          break;
        case 'gold_during_storm':
          progress = this.goldDuringStorm ? 1 : 0;
          break;
        case 'no_miss_run':
          progress = this.misses === 0 && this.hits > 0 ? 1 : 0;
          break;
        case 'accuracy':
          progress = Math.round(this.recentWindowAccuracy() * 100);
          break;
        case 'swarm_clear_time':
          progress = this.swarmClearedFast ? 1 : 0;
          break;
      }
      if (progress > 0) bus.emit('challenge:progress', { challengeId: ch.id, progress, goal: ch.goal });
    }
  }

  private renderDebug(): void {
    if (!this.debugText) return;
    const acc = this.shots > 0 ? (this.hits / this.shots) * 100 : 0;
    const loop = this.game.loop as unknown as { actualFps?: number };
    this.debugText.setText(
      [
        `seed ${this.seed} (${seedLabel(this.seed)})  mode ${this.modeId}  map ${this.mapId}`,
        `t ${this.gameSec.toFixed(1)}s  phase ${this.roundDirector.phase}  evt ${this.activeEventId ?? '-'}`,
        `diff ${this.difficulty.factor.toFixed(2)}→${this.difficulty.target.toFixed(2)}  targets ${this.targets.length}/${this.mode.maxConcurrentTargets}`,
        `combo ${this.combo.combo} (x${this.combo.multiplier.toFixed(1)})  acc ${acc.toFixed(0)}%  react ${Math.round(this.avgReactionMs())}ms`,
        `wind ${this.windNow.toFixed(2)}  spd ${this.speedMultNow.toFixed(2)}  ts ${this.timeScaleNow.toFixed(2)}  mult ${this.currentScoreMult().toFixed(2)}`,
        `fps ${(loop.actualFps ?? 0).toFixed(0)}  boss ${this.boss ? `${Math.max(0, this.boss.hp)}/${this.boss.def.hp}` : '-'}`,
      ].join('\n'),
    );
  }

  /* ================= HUD ================= */

  private pushHud(): void {
    const snap = this.weapon.snapshot();
    const active = this.activeEventDef;
    bus.emit('hud:update', {
      score: this.score,
      scoreDisplay: Math.round(this.scoreDisplay),
      timeLeft: this.timeLeft(),
      isZen: !!this.mode.zen,
      combo: this.combo.combo,
      comboFrac: this.combo.windowFraction,
      multiplier: this.combo.multiplier * this.currentScoreMult(),
      ammo: snap.ammo,
      magazineSize: this.weapon.magazineSize,
      reserve: this.weapon.unlimited ? -1 : this.weapon.reserve,
      weaponState: this.weapon.stateNow,
      reloadFrac: snap.reloadProgress,
      eventLabel: active ? t(`event.${active.id}.name`) : null,
      eventActive: active != null,
      phase: t(`hud.phase.${this.roundDirector.phase}`),
      chainLabel: this.currentChainLabel(),
      bossName: this.boss ? this.boss.def.name : null,
      bossHp: this.boss ? Math.max(0, this.boss.hp) / this.boss.def.hp : 0,
      bossMaxHp: this.boss?.def.hp ?? 1,
      bossActive: this.boss?.alive ?? false,
      perfect: this.combo.perfectStreak > 0,
      noMiss: this.misses === 0 && this.hits > 0,
      isRecord: this.score > getCoreContext().client.getBestScore(this.modeId),
    });
  }

  private currentChainLabel(): string | null {
    for (const c of this.chainStates.values()) {
      if (!c.complete && c.stepIndex > 0 && c.stepIndex < c.def.steps.length) {
        return `${t('hud.chain')} ${c.stepIndex}/${c.def.steps.length}`;
      }
    }
    return null;
  }

  /* ================= round end ================= */

  private finishRound(reason: 'time' | 'out_of_ammo'): void {
    if (this.finishing || !this.running) return;
    this.finishing = true;
    const { audio, client } = getCoreContext();
    audio.stopMusic();
    audio.stopAmbient();
    if (reason === 'time') this.fx.celebrate(client.settings.all.particleDensity * 0.6);
    this.time.delayedCall(900, () => this.emitResults());
  }

  private emitResults(): void {
    const { client } = getCoreContext();
    const duration =
      this.mode.durationSec != null
        ? Math.min(this.gameSec, this.mode.durationSec + this.bonusTimeSeconds)
        : this.gameSec;
    const summary: RunSummary = {
      mode: this.modeId,
      map: this.mapId,
      score: this.score,
      hits: this.hits,
      misses: this.misses,
      shots: this.shots,
      reloads: this.reloads,
      perfectHits: this.perfectHits,
      maxCombo: this.combo.bestCombo,
      bestHitPoints: this.bestHitPoints,
      bestHitTargetId: this.bestHitTargetId,
      avgReactionMs: Math.round(this.avgReactionMs()),
      accuracy: this.shots > 0 ? this.hits / this.shots : 0,
      targetsHit: this.targetsHit,
      swarmBonuses: this.swarmBonuses,
      trickshots: this.trickshots,
      longshots: this.longshots,
      chainReactions: this.chainReactions,
      longestChain: this.longestChain,
      hiddenObjectsFound: this.hiddenFound.size,
      hiddenObjectIds: [...this.hiddenFound],
      seed: this.seed,
      bossDefeated: this.bossDefeated,
      bossMisses: this.bossMisses,
      eventBonusPoints: this.eventBonusPoints,
      bonusTimeSeconds: this.bonusTimeSeconds,
      noMissFinish: this.misses === 0 && this.hits >= 5,
      durationSeconds: Math.round(duration),
      maxPerfectStreak: this.combo.bestPerfectStreak,
      maxHitsWithoutMiss: this.combo.hitsWithoutMiss,
      goldDuringStorm: this.goldDuringStorm,
      swarmClearedFast: this.swarmClearedFast,
    };

    const res = client.completeRun(summary, this.isDaily);
    bus.emit('game:ended', {
      summary,
      isRecord: res.isRecord,
      previousBest: res.previousBest,
      newAchievements: res.newAchievements,
      xpGained: res.xpGained,
      coinsGained: res.coinsGained,
      leveledUp: res.leveledUp,
    });
    bus.emit('results:show', {
      summary,
      isRecord: res.isRecord,
      previousBest: res.previousBest,
      xpGained: res.xpGained,
      coinsGained: res.coinsGained,
      leveledUp: res.leveledUp,
      newAchievements: res.newAchievements,
      rank: rankForScore(this.score, this.mode.scoreMult),
    });
    this.running = false;
  }

  /* ================= pause / resume ================= */

  pause(): void {
    if (!this.running || this.finishing) return;
    this.running = false;
    this.fireQueued = false;
    this.tweens.pauseAll();
    getCoreContext().audio.duckMusic(400);
  }

  resume(): void {
    if (this.running || this.finishing) return;
    this.tweens.resumeAll();
    this.running = true;
  }

  /* ================= cleanup ================= */

  private cleanup(): void {
    this.running = false;
    for (const off of this.offs) off();
    this.offs = [];
    if (this.keyDownHandler) window.removeEventListener('keydown', this.keyDownHandler);
    this.keyDownHandler = null;
    for (const t of this.targets) {
      t.sprite.destroy();
      t.armorSprite?.destroy();
    }
    this.targets = [];
    for (const inst of this.envObjects) {
      inst.sprite.destroy();
      inst.extra?.destroy();
    }
    this.envObjects = [];
    this.formationAnchors.clear();
    this.boss?.destroy();
    this.boss = null;
    this.fx?.destroy();
    this.crosshair?.destroy();
    this.rig?.destroy();
    try {
      disposeBackground(this);
      disposeTextures(this);
    } catch {
      // textures may already be gone with the scene
    }
  }
}
