/**
 * Orchestrator.
 *
 * Owns every system, runs the frame loop, and routes input to whichever layer
 * is currently listening (modal screen, action menu, free-aim reticle, or the
 * real-time reaction windows). All rules live in battle/, all feedback lives in
 * presentation.js — this file wires them together and does nothing else.
 */

import * as THREE from 'three';

import { EventBus, EV } from './core/events.js';
import { RNG } from './core/rng.js';
import { damp } from './core/easing.js';

import { RenderCore } from './engine/renderer.js';
import { PostFX } from './engine/postfx.js';
import { Stage } from './engine/stage.js';
import { CameraDirector } from './engine/camera-director.js';
import { AudioEngine } from './engine/audio.js';
import { disposeTextures } from './engine/textures.js';

import { ParticleSystem } from './fx/particles.js';
import { TelegraphFX } from './fx/telegraph.js';
import { DamageNumbers } from './fx/damage-numbers.js';

import { Character } from './entities/character.js';
import { Enemy } from './entities/enemy.js';

import { BattleSystem, STATE } from './battle/battle-system.js';
import { TargetingSystem } from './battle/targeting.js';
import { DIFFICULTY } from './battle/reaction-system.js';

import { HUD } from './ui/hud.js';
import { BattleMenu } from './ui/battle-menu.js';
import { Prompts } from './ui/prompts.js';
import { Screens } from './ui/loadout.js';
import { ScreenFX } from './ui/screen-fx.js';
import { UI, spacedText, panel } from './ui/theme.js';

import { PARTY_DATA } from './data/party.js';
import { WAVES, enemyData } from './data/enemies.js';
import { aggregate, LUMINA_SLOTS } from './data/luminas.js';

import { Presentation } from './presentation.js';
import { InputManager } from './input.js';

const PARTY_FACING = Math.PI / 2;
const ENEMY_FACING = -Math.PI / 2;

export class Game {
  /**
   * @param {HTMLCanvasElement} glCanvas
   * @param {HTMLCanvasElement} hudCanvas
   * @param {{renderer?:object, bus?:object, input?:object, standalone?:boolean}} opts
   *        When embedded in the exploration app, the renderer, event bus and
   *        input manager are supplied and shared rather than created here.
   */
  constructor(glCanvas, hudCanvas, opts = {}) {
    this.glCanvas = glCanvas;
    this.hudCanvas = hudCanvas;
    this.hudCtx = hudCanvas.getContext('2d');
    this.opts = opts;
    this.embedded = !!opts.renderer;
    this.bus = opts.bus || new EventBus();

    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.elapsed = 0;
    this.last = 0;
    this.timeScale = 1;
    this.stopScale = 1;
    this.stopTime = 0;
    this.running = false;
    this.contextMessage = '';
    this.frameHandle = 0;

    // Run configuration surfaced on the loadout screen.
    this.config = { seed: 1873, difficulty: 'expedition', luminaIds: ['energising-parry', 'first-stroke', 'cruel-aim'] };
    this.waveData = WAVES;
    this.waveIndex = 0;
    this.xpAwarded = 0;
    this.inEncounter = false;
    this.onStartRequested = null;
    this.onRestartRequested = null;
    this.encounterName = '';
    this.encounterId = '';

    this._scratch = new THREE.Vector3();
    this._scratchB = new THREE.Vector3();
  }

  // -------------------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------------------

  async init() {
    this.renderCore = new RenderCore(
      this.glCanvas,
      (msg) => { this.contextMessage = msg; },
      this.opts.renderer || null,
    );
    this.scene = this.renderCore.scene;
    this.camera = this.renderCore.camera;

    this.postfx = new PostFX(this.renderCore);
    await this.postfx.init();

    this.stage = new Stage(this.scene);
    this.cameraDirector = new CameraDirector(this.camera);
    this.particles = new ParticleSystem(this.scene);
    this.particles.setCamera(this.camera);
    this.telegraphFx = new TelegraphFX(this.scene);
    this.numbers = new DamageNumbers(this._scratchB);
    this.audio = new AudioEngine();

    this.rng = new RNG(this.config.seed);
    this.luminas = aggregate(this.config.luminaIds);

    this.party = [];
    this.enemies = [];
    this.partyGroup = new THREE.Group();
    this.enemyGroup = new THREE.Group();
    this.scene.add(this.partyGroup, this.enemyGroup);
    this._buildParty();

    this.battle = new BattleSystem(this.bus, this.rng, {
      luminas: this.luminas, difficulty: this.config.difficulty,
    });
    this.battle.setParty(this.party);
    this.targeting = new TargetingSystem(this.camera);

    this.hud = new HUD(this._scratch);
    this.menu = new BattleMenu(this._scratch);
    this.prompts = new Prompts(this._scratch);
    this.screens = new Screens();
    this.screenFx = new ScreenFX();

    this.presentation = new Presentation(this);
    this.input = this.opts.input || new InputManager();

    this._wireGameEvents();
    this._onResize();
    if (!this.embedded) window.addEventListener('resize', () => this._onResize());

    // Show the roster on the stage behind the loadout screen.
    this._placeParty();
    this.screens.setMode('loadout');
    this.cameraDirector.set('overview', {}, { snap: true });
  }

  _buildParty() {
    for (const data of PARTY_DATA) {
      const c = new Character(data, { level: 1, luminas: this.luminas });
      this.party.push(c);
      this.partyGroup.add(c.root);
    }
  }

  _placeParty() {
    for (const c of this.party) {
      c.placeAt(c.data.stance.x, c.data.stance.z, PARTY_FACING);
    }
  }

  _wireGameEvents() {
    this.bus.on(EV.WAVE_CLEAR, () => this._onWaveClear());
    this.bus.on(EV.VICTORY, (e) => {
      if (this.inEncounter) {
        this.inEncounter = false;
        this.bus.emit(EV.ENCOUNTER_END, {
          result: 'victory', id: this.encounterId, xp: this.battle.totalXp, stats: e.stats,
        });
        return;
      }
      this.screens.setMode('victory', { stats: e.stats, xp: e.xp });
    });
    this.bus.on(EV.DEFEAT, (e) => {
      if (this.inEncounter) {
        this.inEncounter = false;
        this.bus.emit(EV.ENCOUNTER_END, {
          result: 'defeat', id: this.encounterId, stats: this.battle.stats,
        });
        return;
      }
      this.screens.setMode('defeat', { stats: this.battle.stats, wave: e.wave });
    });
  }

  // -------------------------------------------------------------------------
  // Run lifecycle
  // -------------------------------------------------------------------------

  startRun() {
    this.rng = new RNG(this.config.seed);
    this.luminas = aggregate(this.config.luminaIds);
    this.battle.rng = this.rng;
    this.battle.ai.rng = this.rng;
    this.battle.queue.rng = this.rng;
    this.battle.luminas = this.luminas;
    this.battle.reaction.setDifficulty(this.config.difficulty);
    this.battle.hardReset();

    for (const c of this.party) c.resetForBattle(this.luminas);
    this._placeParty();

    this.waveIndex = 0;
    this.xpAwarded = 0;
    this.numbers.clear();
    this.screens.setMode('none');
    this.audio.unlock();
    this.audio.startMusic();
    this._spawnWave(0);
  }

  /**
   * Apply the loadout screen's configuration without starting a wave. The
   * overworld calls this once, then owns when battles actually happen.
   */
  applyRunConfig() {
    this.rng = new RNG(this.config.seed);
    this.luminas = aggregate(this.config.luminaIds);
    this.battle.rng = this.rng;
    this.battle.ai.rng = this.rng;
    this.battle.queue.rng = this.rng;
    this.battle.luminas = this.luminas;
    this.battle.reaction.setDifficulty(this.config.difficulty);
    this.battle.hardReset();
    for (const c of this.party) c.resetForBattle(this.luminas);
    this.xpAwarded = 0;
    this.numbers.clear();
  }

  /** Re-parent the party into the battle scene (they live in the world scene). */
  adoptParty() {
    for (const c of this.party) this.partyGroup.add(c.root);
  }

  /** Release the party so the world can take them back. */
  releaseParty() {
    for (const c of this.party) this.partyGroup.remove(c.root);
    this._clearEnemies();
  }

  _spawnWave(index, waveCount = this.waveData.length) {
    this._clearEnemies();
    this.waveIndex = index;
    const wave = this.waveData[index];
    const level = 1 + index * 2;

    for (let i = 0; i < wave.enemies.length; i++) {
      const spec = wave.enemies[i];
      const data = enemyData(spec.type);
      const e = new Enemy(data, {
        level, scale: spec.scale, rng: this.rng, index: i,
      });
      e.placeAt(spec.x, spec.z, ENEMY_FACING);
      this.enemies.push(e);
      this.enemyGroup.add(e.root);
    }
    this.targeting.invalidateCache();
    this.battle.beginWave(this.enemies, index, waveCount);
  }

  /**
   * Launch one encounter from the overworld. Unlike `startRun`, party health,
   * levels and XP carry over — the area is a war of attrition, not a series of
   * fresh starts. Completion is announced with EV.ENCOUNTER_END.
   */
  startEncounter(waveIndex, opts = {}) {
    this.encounterName = opts.name || this.waveData[waveIndex].subtitle;
    this.encounterId = opts.id || `wave-${waveIndex}`;
    this.inEncounter = true;
    this.battle.hardReset();
    this.numbers.clear();
    for (const c of this.party) c.prepareForEncounter();
    this._placeParty();
    this.screens.setMode('none');
    this.audio.unlock();
    this.audio.startMusic();
    // waveCount = index + 1 makes this the final wave, so the battle resolves to
    // VICTORY rather than looking for a next wave that the world owns.
    this._spawnWave(waveIndex, waveIndex + 1);
  }

  _clearEnemies() {
    for (const e of this.enemies) {
      this.enemyGroup.remove(e.root);
      e.dispose();
    }
    this.enemies.length = 0;
    this.telegraphFx.clear();
  }

  _onWaveClear() {
    const gain = this.battle.totalXp - this.xpAwarded;
    this.xpAwarded = this.battle.totalXp;
    const growth = this.party.map((c) => {
      const res = c.gainXp(gain);
      return { character: c, levels: res.levels, unlocked: res.unlocked };
    });
    if (growth.some((g) => g.levels > 0)) this.audio.levelUp();
    this.screens.setMode('intermission', {
      xp: gain,
      growth,
      subtitle: this.waveData[this.waveIndex].subtitle,
    });
  }

  _advanceWave() {
    for (const c of this.party) c.restBetweenWaves();
    this._placeParty();
    this.battle.acknowledgeWaveClear();
    this.screens.setMode('none');
    this._spawnWave(this.waveIndex + 1);
  }

  restartToLoadout() {
    this.battle.hardReset();
    this._clearEnemies();
    for (const c of this.party) {
      this.partyGroup.remove(c.root);
      c.dispose();
    }
    this.party.length = 0;
    this._buildParty();
    this.battle.setParty(this.party);
    this._placeParty();
    this.numbers.clear();
    this.audio.stopMusic(0.6);
    this.screens.setMode('loadout');
    this.cameraDirector.set('overview', {}, { snap: true });
  }

  // -------------------------------------------------------------------------
  // Frame loop
  // -------------------------------------------------------------------------

  start() {
    this.running = true;
    this.last = performance.now() / 1000;
    const tick = () => {
      if (!this.running) return;
      this.frameHandle = requestAnimationFrame(tick);
      try {
        this._frame();
      } catch (err) {
        this.running = false;
        console.error('[game] frame error:', err);
        this.bus.emit('fatal', err);
      }
    };
    this.frameHandle = requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    if (this.frameHandle) cancelAnimationFrame(this.frameHandle);
  }

  _frame() {
    const now = performance.now() / 1000;
    let rawDt = now - this.last;
    this.last = now;
    if (!(rawDt > 0)) rawDt = 1 / 60;
    this.step(Math.min(rawDt, 0.1));
  }

  /**
   * One battle frame. Split out from the rAF callback so the exploration app
   * can drive the battle on its own loop while sharing input and the renderer.
   */
  step(rawDt) {
    // Hit-stop / slow-motion.
    if (this.stopTime > 0) {
      this.stopTime -= rawDt;
      this.timeScale = damp(this.timeScale, this.stopScale, 26, rawDt);
    } else {
      this.timeScale = damp(this.timeScale, 1, 7, rawDt);
    }
    const dt = rawDt * this.timeScale;
    this.elapsed += dt;

    this._handleInput(rawDt);
    this._update(dt, rawDt);
    this._render(rawDt);
    if (!this.embedded) this.input.endFrame();
  }

  hitStop(scale, duration) {
    this.stopScale = Math.min(this.stopScale, scale);
    this.stopTime = Math.max(this.stopTime, duration);
    if (this.stopTime <= 0) this.stopScale = 1;
  }

  _update(dt, rawDt) {
    if (this.stopTime <= 0) this.stopScale = 1;

    if (!this.screens.active) {
      this.battle.reaction.timeScale = this.timeScale;
      this.battle.update(dt, rawDt);
      this.presentation.update(dt, this.elapsed);
    }

    for (const c of this.party) c.update(dt, this.elapsed);
    for (const e of this.enemies) e.update(dt, this.elapsed);

    if (this.targeting.active) this.targeting.update(rawDt);

    this.stage.update(dt, this.elapsed, this.battle.intensity);
    this.particles.update(dt);
    this.renderCore.update(dt, this.elapsed);
    this.postfx.update(dt);
    this.cameraDirector.update(dt);
    this.audio.update(rawDt);

    this.numbers.update(rawDt);
    this.hud.update(rawDt, [...this.party, ...this.enemies], this.battle.gradient);
    this.prompts.update(rawDt, this.battle.reaction.getPrompt());
    this.screenFx.update(rawDt);
  }

  _render(rawDt) {
    if (this.renderCore.contextLost) {
      this._drawHudFrame(rawDt);
      return;
    }
    this.postfx.render();
    this._drawHudFrame(rawDt);
  }

  _drawHudFrame(rawDt) {
    const ctx = this.hudCtx;
    const view = { w: this.width, h: this.height, camera: this.camera };
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);

    this.screenFx.drawUnder(ctx, this.width, this.height);

    if (!this.screens.active) {
      const model = {
        party: this.party,
        enemies: this.enemies,
        upcoming: this.battle.queue.preview(8),
        actor: this.battle.actor,
        gradient: this.battle.gradient,
        ultimateReady: this.battle.ultimateReady,
        flow: this.battle.reaction.flow,
        wave: this.waveIndex,
        waveCount: this.waveData.length,
        encounterName: this.inEncounter ? this.encounterName : '',
        difficulty: DIFFICULTY[this.config.difficulty].label,
      };
      this.hud.draw(ctx, view, model);
      this.menu.draw(ctx, view, rawDt);
      this.menu.drawTargetCursor(ctx, view);
      this.prompts.draw(ctx, view, this.battle.reaction.getPrompt(), this.battle.reaction.hits);
      this.prompts.drawAim(ctx, view, this.targeting, this.battle.actor);
      this.numbers.draw(ctx, this.camera, this.width, this.height);
      this._drawControlHint(ctx);
    }

    this.screens.draw(ctx, view, {
      party: this.party,
      seed: this.config.seed,
      difficulty: this.config.difficulty,
      luminaIds: this.config.luminaIds,
    }, rawDt);

    this.screenFx.drawOver(ctx, this.width, this.height, this.battle.intensity);

    if (this.contextMessage) this._drawContextWarning(ctx, view);
  }

  /**
   * Key hints sit just above the party plates: the top-centre strip belongs to
   * the turn queue, and at narrower viewports the two would collide there.
   */
  _drawControlHint(ctx) {
    if (this.battle.state !== STATE.PLAYER_MENU) return;
    const plateTop = this.height - 22 - this.party.length * 82;
    spacedText(ctx, '[↑ ↓] SELECT   [ENTER] CONFIRM   [ESC] BACK   [U] OVERTURE', 24, plateTop - 12, {
      size: 10, color: 'rgba(217,178,98,0.72)', spacing: 2,
    });
  }

  _drawContextWarning(ctx, view) {
    const w = 460;
    const x = view.w / 2 - w / 2;
    panel(ctx, x, view.h / 2 - 40, w, 80, { cut: 10, accent: UI.danger });
    spacedText(ctx, 'GRAPHICS CONTEXT LOST', view.w / 2, view.h / 2 - 6, {
      size: 15, color: UI.danger, spacing: 3, align: 'center',
    });
    spacedText(ctx, this.contextMessage, view.w / 2, view.h / 2 + 18, {
      size: 11, color: UI.parchment, spacing: 1.6, align: 'center',
    });
  }

  // -------------------------------------------------------------------------
  // Input routing
  // -------------------------------------------------------------------------

  _handleInput(rawDt) {
    const input = this.input;
    if (input.anyInput) {
      if (this.audio.unlock() && !this.screens.active) this.audio.startMusic();
    }
    if (input.is('mute')) this.audio.setMuted(!this.audio.muted);

    if (this.screens.active) { this._screenInput(); return; }

    switch (this.battle.state) {
      case STATE.PLAYER_MENU: this._menuInput(); break;
      case STATE.PLAYER_TARGET: this._targetInput(); break;
      case STATE.PLAYER_AIM: this._aimInput(rawDt); break;
      case STATE.ENEMY_ATTACK: this._reactionInput(); break;
      default: break;
    }
  }

  _screenInput() {
    const input = this.input;
    const state = {
      seed: this.config.seed,
      difficulty: this.config.difficulty,
      luminaIds: this.config.luminaIds,
      party: this.party,
    };

    if (this.screens.mode === 'loadout') {
      if (input.mouse.inside) {
        const hit = this.screens.hitTest(input.mouse.x, input.mouse.y);
        if (hit >= 0 && hit !== this.screens.index) {
          this.screens.index = hit;
          this.audio.menuMove();
        }
      }
      if (input.is('up')) { this.screens.move(-1); this.audio.menuMove(); }
      if (input.is('down')) { this.screens.move(1); this.audio.menuMove(); }
      if (input.is('left')) this._applyScreenCommand(this.screens.adjust(-1, state));
      if (input.is('right')) this._applyScreenCommand(this.screens.adjust(1, state));
    }

    if (input.is('confirm') || input.is('space') || input.mouse.clicked) {
      this._applyScreenCommand(this.screens.confirm(state));
    }
    if (this.screens.mode !== 'loadout' && input.is('restart')) {
      this._applyScreenCommand({ cmd: 'restart' });
    }
  }

  _applyScreenCommand(cmd) {
    if (!cmd) return;
    switch (cmd.cmd) {
      case 'difficulty':
        this.config.difficulty = cmd.value;
        this.battle.reaction.setDifficulty(cmd.value);
        this.audio.menuConfirm();
        break;
      case 'seed':
        this.config.seed = Math.max(1, this.config.seed + cmd.value * 1);
        this.audio.menuMove();
        break;
      case 'toggle-lumina': {
        const list = this.config.luminaIds;
        const i = list.indexOf(cmd.value);
        if (i >= 0) { list.splice(i, 1); this.audio.menuCancel(); }
        else if (list.length < LUMINA_SLOTS) { list.push(cmd.value); this.audio.menuConfirm(); }
        else { this.audio.menuCancel(); }
        break;
      }
      case 'start':
        this.audio.menuConfirm();
        if (this.onStartRequested) this.onStartRequested();
        else this.startRun();
        break;
      case 'advance':
        this.audio.menuConfirm();
        this._advanceWave();
        break;
      case 'restart':
        this.audio.menuConfirm();
        if (this.onRestartRequested) this.onRestartRequested();
        else this.restartToLoadout();
        break;
      default:
        break;
    }
  }

  _menuInput() {
    const input = this.input;
    if (input.mouse.inside) {
      const hit = this.menu.hitTest(input.mouse.x, input.mouse.y);
      if (hit >= 0 && hit !== this.menu.index && this.menu.entries[hit] && this.menu.entries[hit].enabled) {
        this.menu.index = hit;
        this.audio.menuMove();
      }
    }
    if (input.is('up') && this.menu.move(-1)) this.audio.menuMove();
    if (input.is('down') && this.menu.move(1)) this.audio.menuMove();
    if (input.is('ultimate')) {
      if (this.battle.chooseAction({ type: 'ultimate' }) === 'started') this.audio.menuConfirm();
      else this.audio.menuCancel();
      return;
    }
    if (input.is('aim')) {
      this.battle.chooseAction({ type: 'aim' });
      this.audio.menuConfirm();
      return;
    }
    if (input.is('cancel')) {
      if (this.menu.back()) this.audio.menuCancel();
      return;
    }
    if (input.is('confirm') || input.is('space') || input.mouse.clicked) {
      const res = this.menu.confirm();
      if (!res) return;
      if (res.nav) {
        this.audio[res.nav === 'denied' ? 'menuCancel' : 'menuConfirm']();
        return;
      }
      const outcome = this.battle.chooseAction(res);
      if (outcome === 'rejected') this.audio.menuCancel();
      else this.audio.menuConfirm();
      this.menu.refresh();
    }
  }

  _targetInput() {
    const input = this.input;
    if (input.is('up') || input.is('left')) { this.menu.move(-1); this.audio.menuMove(); }
    if (input.is('down') || input.is('right')) { this.menu.move(1); this.audio.menuMove(); }
    if (input.is('cancel')) {
      this.battle.cancel();
      this.menu.endTargeting();
      this.audio.menuCancel();
      return;
    }
    if (input.is('confirm') || input.is('space') || input.mouse.clicked) {
      const t = this.menu.selectedTarget;
      if (t && this.battle.chooseTarget(t)) {
        this.menu.endTargeting();
        this.audio.menuConfirm();
      } else {
        this.audio.menuCancel();
      }
    }
  }

  _aimInput(rawDt) {
    const input = this.input;
    this.targeting.move(
      { dx: input.mouse.dx * 1.7, dy: input.mouse.dy * 1.7 },
      input.axis(),
      rawDt,
    );
    if (input.is('cancel')) {
      this.targeting.exit();
      this.battle.cancel();
      this.audio.menuCancel();
      return;
    }
    if (input.is('confirm') || input.is('space') || input.mouse.clicked) {
      const result = this.targeting.fire();
      this.battle.resolveAimShot(result);
      this.targeting.exit();
    }
  }

  _reactionInput() {
    const input = this.input;
    if (input.is('space') || input.is('parry')) this.battle.reactionInput('parry');
    if (input.is('dodge')) this.battle.reactionInput('dodge');
  }

  // -------------------------------------------------------------------------
  // Resize
  // -------------------------------------------------------------------------

  _onResize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.renderCore.resize(this.width, this.height);
    this.postfx.resize(this.width, this.height);

    this.hudCanvas.width = Math.floor(this.width * this.dpr);
    this.hudCanvas.height = Math.floor(this.height * this.dpr);
    this.hudCanvas.style.width = `${this.width}px`;
    this.hudCanvas.style.height = `${this.height}px`;
    this.hudCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  dispose() {
    this.stop();
    this.input.dispose();
    this._clearEnemies();
    for (const c of this.party) c.dispose();
    this.postfx.dispose();
    this.renderCore.dispose();
    disposeTextures();
  }
}
