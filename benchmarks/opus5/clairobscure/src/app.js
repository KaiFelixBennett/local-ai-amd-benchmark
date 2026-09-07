/**
 * Top-level application: owns the GL context, the two modes and the story
 * progression between them.
 *
 *   boot ──▶ loadout ──▶ prologue ──▶ explore ⇄ battle ──▶ epilogue ──▶ ending
 *
 * The exploration scene and the battle scene are separate THREE scenes sharing
 * one renderer and one party. Crossing between them fades to black, re-parents
 * the party and hands input to whichever mode is live — there is only ever one
 * update loop.
 */

import * as THREE from 'three';

import { EventBus, EV } from './core/events.js';
import { clamp01 } from './core/easing.js';
import { createRenderer } from './engine/renderer.js';
import { AssetManager } from './world/asset-manager.js';
import { ExploreMode } from './world/explore-mode.js';
import { ExploreHUD } from './world/explore-hud.js';
import { CUTSCENES, OBJECTIVES, SEALS } from './world/story.js';
import { Game } from './game.js';
import { InputManager } from './input.js';

const FADE_TIME = 0.55;

export class App {
  constructor(glCanvas, hudCanvas) {
    this.glCanvas = glCanvas;
    this.hudCanvas = hudCanvas;
    this.hudCtx = hudCanvas.getContext('2d');
    this.bus = new EventBus();

    this.mode = 'boot';
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.last = 0;
    this.running = false;
    this.frameHandle = 0;
    this.elapsed = 0;

    this.fade = 0;
    this.transition = null;
    this.objective = OBJECTIVES.reachParvis;
    this.reachedParvis = false;
    this.assetFailures = [];
    this._scratch = new THREE.Vector3();

    this.stats = { frames: 0, fpsAccum: 0, fpsTime: 0, fps: 0 };
  }

  // -------------------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------------------

  async init(onProgress) {
    this.renderer = createRenderer(this.glCanvas);
    this.input = new InputManager();
    this.input.enablePointerLock(this.hudCanvas);

    // The battle owns the party, the audio engine and every combat system.
    this.game = new Game(this.glCanvas, this.hudCanvas, {
      renderer: this.renderer,
      bus: this.bus,
      input: this.input,
    });
    await this.game.init();
    this.game.onStartRequested = () => this.beginExpedition();
    this.game.onRestartRequested = () => this.restartRun();

    if (onProgress) onProgress(0.05, 'systems');

    this.assets = new AssetManager(this.renderer);
    const { failures } = await this.assets.loadAll((frac, label) => {
      if (onProgress) onProgress(0.05 + frac * 0.85, label);
    });
    this.assetFailures = failures;

    this.explore = new ExploreMode(this.renderer, this.assets);
    await this.explore.initPost();
    this.explore.onInteract = (target) => this.onInteract(target);
    if (onProgress) onProgress(0.97, 'world');

    this.exploreHUD = new ExploreHUD(this._scratch);

    this.bus.on(EV.ENCOUNTER_END, (e) => this.onEncounterEnd(e));

    this._onResize();
    window.addEventListener('resize', () => this._onResize());

    this.mode = 'loadout';
    if (onProgress) onProgress(1, 'ready');
  }

  // -------------------------------------------------------------------------
  // Story progression
  // -------------------------------------------------------------------------

  /** Called when the player confirms the loadout screen. */
  beginExpedition() {
    this.game.applyRunConfig();
    this.explore.attachParty(this.game.party);
    this.game.screens.setMode('none');
    this.objective = OBJECTIVES.reachParvis;
    this.reachedParvis = false;
    this.game.audio.unlock();
    this.game.audio.startMusic();
    this.game.audio.setIntensity(0.12);

    this.mode = 'explore';
    this.exploreHUD.showTitleCard('LE PARVIS NOYÉ', 'EXPEDITION 33 — LANDFALL', 6.0);
    this.explore.playCutscene(CUTSCENES.prologue, () => {
      this.exploreHUD.flashObjective();
    });
  }

  onInteract(target) {
    if (this.transition) return;
    this.pendingEncounter = target;
    this._beginTransition('battle');
  }

  onEncounterEnd(e) {
    if (e.result === 'victory') {
      // XP is awarded per encounter so the party grows across the area.
      for (const c of this.game.party) c.gainXp(Math.round(e.xp || 0));
      this._beginTransition('explore', () => this.onEncounterWon(e.id));
    } else {
      this.mode = 'gameover';
      this.game.screens.setMode('defeat', { stats: e.stats });
    }
  }

  onEncounterWon(id) {
    const seal = this.explore.sealById(id);
    if (seal) {
      seal.break_();
      this.exploreHUD.showToast(`${seal.def.name} is dark`, 3.4);
      this.game.audio.levelUp();
    }

    const broken = this.explore.sealsBroken;
    if (id === this.explore.gate.id) {
      // The Curator is down: play the epilogue and end the slice.
      this.objective = OBJECTIVES.done;
      this.explore.playCutscene(CUTSCENES.epilogue, () => {
        this.mode = 'ending';
        this.game.screens.setMode('victory', {
          stats: this.game.battle.stats, xp: this.game.battle.totalXp,
        });
      });
      this._dispelGilding();
      return;
    }

    if (broken >= SEALS.length) {
      this.objective = OBJECTIVES.faceCurator;
      this.explore.gate.openGate();
      this.explore.playCutscene(CUTSCENES.gateOpens, () => this.exploreHUD.flashObjective());
    } else {
      this.objective = OBJECTIVES.breakSeals;
      this.explore.playCutscene(CUTSCENES.sealBroken, () => this.exploreHUD.flashObjective());
    }
  }

  /** Epilogue effect: the gold drains out of the fallen. */
  _dispelGilding() {
    const group = this.explore.gildedFallen;
    if (!group) return;
    const seen = new Set();
    group.traverse((o) => {
      if (!o.isMesh || !o.material || seen.has(o.material)) return;
      seen.add(o.material);
      o.material.metalness = 0.15;
      o.material.roughness = 0.85;
      o.material.color = new THREE.Color(0x6f6a5e);
    });
  }

  restartRun() {
    this.game.restartToLoadout();
    for (const s of this.explore.seals) {
      s.broken = false;
      s.breakT = 0;
      s.shaft.visible = true;
      s.decal.visible = true;
      s.core.visible = true;
      s.ring.position.y = 7.6;
    }
    this.explore.gate.open = false;
    this.explore.gate.openT = 0;
    if (this.explore.gate.node) this.explore.gate.node.position.y = this.explore.gate.baseY;
    this.objective = OBJECTIVES.reachParvis;
    this.mode = 'loadout';
    this.fade = 0;
  }

  // -------------------------------------------------------------------------
  // Transitions
  // -------------------------------------------------------------------------

  _beginTransition(to, onSwapped) {
    this.transition = { to, t: 0, phase: 'out', onSwapped: onSwapped || null };
  }

  _updateTransition(dt) {
    const tr = this.transition;
    if (!tr) return;
    tr.t += dt;
    if (tr.phase === 'out') {
      this.fade = clamp01(tr.t / FADE_TIME);
      if (tr.t >= FADE_TIME) {
        this._swapMode(tr.to);
        if (tr.onSwapped) tr.onSwapped();
        tr.phase = 'in';
        tr.t = 0;
      }
    } else {
      this.fade = 1 - clamp01(tr.t / FADE_TIME);
      if (tr.t >= FADE_TIME) {
        this.fade = 0;
        this.transition = null;
      }
    }
  }

  _swapMode(to) {
    if (to === 'battle') {
      const target = this.pendingEncounter;
      this.pendingEncounter = null;
      this.input.releasePointerLock();
      this.game.adoptParty();
      this.mode = 'battle';
      this.game.audio.setIntensity(0.55);
      this.game.startEncounter(target.waveIndex, { name: target.title, id: target.id });
    } else if (to === 'explore') {
      this.game.releaseParty();
      this.explore.reattachParty();
      this.mode = 'explore';
      this.game.audio.setIntensity(0.12);
    }
  }

  // -------------------------------------------------------------------------
  // Frame
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
        console.error('[app] frame error:', err);
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
    let dt = now - this.last;
    this.last = now;
    if (!(dt > 0)) dt = 1 / 60;
    dt = Math.min(dt, 0.1);
    this.elapsed += dt;

    this.stats.fpsTime += dt;
    this.stats.frames++;
    if (this.stats.fpsTime >= 0.5) {
      this.stats.fps = this.stats.frames / this.stats.fpsTime;
      this.stats.frames = 0;
      this.stats.fpsTime = 0;
    }

    this._updateTransition(dt);

    if (this.mode === 'explore') this._frameExplore(dt);
    else this.game.step(dt);   // loadout, battle, gameover, ending

    this.input.endFrame();
  }

  _frameExplore(dt) {
    const input = this.input;
    const cam = input.cameraAxis();
    const cine = this.explore.cutscene.active;

    if (cine && (input.is('confirm') || input.is('space') || input.is('skip') || input.is('cancel'))) {
      this.explore.cutscene.skip();
    }

    this.explore.update(dt, {
      move: cine ? { x: 0, y: 0 } : input.moveAxis(),
      look: cine ? { dx: 0, dy: 0 } : input.lookDelta(),
      keyYaw: cine ? 0 : cam.yaw,
      keyPitch: cine ? 0 : cam.pitch,
      sprint: input.held('sprint'),
      interact: input.is('interact'),
      zoom: input.mouse.wheel * 0.9,
    });

    this._checkParvisArrival();
    this.game.audio.update(dt);
    this.exploreHUD.update(dt);

    this.explore.render();
    this._drawExploreHUD(dt);
  }

  /** First time the player stands on the parvis, advance the objective. */
  _checkParvisArrival() {
    if (this.reachedParvis || this.explore.cutscene.active) return;
    const p = this.explore.player.position;
    if (Math.hypot(p.x, p.z) > 24) return;
    this.reachedParvis = true;
    this.objective = OBJECTIVES.breakSeals;
    this.exploreHUD.flashObjective();
    this.exploreHUD.showToast('Two Chroma Seals bind the gate', 4.0);
  }

  _drawExploreHUD(dt) {
    const ctx = this.hudCtx;
    const view = { w: this.width, h: this.height, camera: this.explore.camera };
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);

    const cine = this.explore.cutscene.active;
    this.exploreHUD.draw(ctx, view, {
      objective: this.objective,
      seals: this.explore.seals,
      gate: this.explore.gate,
      prompt: cine ? null : this.explore.interactTarget,
      party: this.game.party,
      playerPos: this.explore.player.position,
      subtitle: this.explore.cutscene.subtitle,
      letterbox: cine ? this.explore.cutscene.letterbox : 0,
      fade: Math.max(this.fade, cine ? this.explore.cutscene.fade : 0),
      cinematic: cine,
      showControls: !cine,
    });

    if (cine && this.explore.cutscene.scene && this.explore.cutscene.scene.skippable !== false) {
      this._drawSkipHint(ctx, view);
    }
  }

  _drawSkipHint(ctx, view) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.font = '11px Georgia, serif';
    ctx.fillStyle = '#d9b262';
    ctx.textAlign = 'right';
    ctx.fillText('[TAB] SKIP', view.w - 26, view.h - 26);
    ctx.restore();
  }

  // -------------------------------------------------------------------------

  _onResize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(this.width, this.height, false);

    this.hudCanvas.width = Math.floor(this.width * this.dpr);
    this.hudCanvas.height = Math.floor(this.height * this.dpr);
    this.hudCanvas.style.width = `${this.width}px`;
    this.hudCanvas.style.height = `${this.height}px`;
    this.hudCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    if (this.explore) this.explore.resize(this.width, this.height);
    if (this.game) this.game._onResize();
  }

  dispose() {
    this.stop();
    this.input.dispose();
    this.game.dispose();
  }
}
