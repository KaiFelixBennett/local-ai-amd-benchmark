/**
 * game.js — The orchestrator. Owns every system, routes events to
 * presentation, and drives the frame loop.
 *
 *   boot:  intro cinematic -> overworld (traverse + POIs) -> story encounters
 *          -> (boss) -> the choice -> ending. The battle core is untouched.
 *   frame: timeline -> input -> phase (intro/overworld/battle/ending) -> fx
 *          -> slow-mo recovery -> entities -> fx -> render -> HUD
 *   events: reaction results, presentation steps, deaths, boss phases,
 *          XP/level-ups, win/lose -> animations, particles, numbers,
 *          camera, screen fx, audio, banners.
 *
 * Everything degrades gracefully: a failed module import, a missing
 * WebGL context, or a lost GL context all end in a visible message,
 * never an uncaught exception.
 */
import * as THREE from 'three';
import { Rng, clamp } from './core/rng.js';
import { Timeline } from './core/timeline.js';
import { EventBus } from './core/events.js';
import { Input } from './core/input.js';
import { Renderer } from './engine/renderer.js';
import { PostFX } from './engine/postfx.js';
import { Audio } from './engine/audio.js';
import { ParticleSystem } from './fx/particles.js';
import { CameraRig } from './fx/camera.js';
import { ScreenFX } from './fx/screen-fx.js';
import { DamageNumbers } from './fx/damage-numbers.js';
import { Targeting } from './battle/targeting.js';
import { ReactionSystem } from './battle/reaction-system.js';
import { BattleSystem } from './battle/battle-system.js';
import { makePartyData } from './entities/party-data.js';
import { makeEnemyData } from './entities/enemy-data.js';
import { Character } from './entities/character.js';
import { Enemy } from './entities/enemy.js';
import { Hud } from './ui/hud.js';
import { BattleMenu } from './ui/battle-menu.js';
import { Prompts } from './ui/prompts.js';
import { Overworld } from './world/overworld.js';
import { Director } from './fx/director.js';
import { Subtitles } from './ui/subtitles.js';
import * as STORY from './story/story.js';

const ELE_COLOR = { fire: 0xff8a4a, ice: 0x7fd8cf, gold: 0xe8c979, arcane: 0xb48aff, none: 0xd9e6e2 };

export class Game {
  constructor(root = document.body) {
    this.root = root;

    // --- seed (deterministic battles; shown as a watermark) ---------------
    const params = new URLSearchParams(window.location.search);
    const seedParam = params.get('seed');
    this.seed = seedParam != null && seedParam !== '' ? (parseInt(seedParam, 10) || 1) : (Math.random() * 1e9) | 0;
    this.rng = new Rng(this.seed);
    this.fxRng = new Rng(this.seed ^ 0x9e3779b9); // cosmetic RNG: never disturbs the battle's draws

    // --- DOM ----------------------------------------------------------------
    this.sceneEl = document.getElementById('scene');
    this.hudCanvas = document.getElementById('hud');
    this.fxCanvas = document.getElementById('fx');
    this.uiEl = document.getElementById('ui');
    if (!this.sceneEl || !this.hudCanvas || !this.fxCanvas || !this.uiEl) {
      throw new Error('Game container elements (#scene, #hud, #fx, #ui) are missing from the page.');
    }

    // --- core ---------------------------------------------------------------
    this.tl = new Timeline();
    this.events = new EventBus();
    this.input = new Input(this.sceneEl, this.tl);

    this._slow = null; // { at, scale } slow-mo recovery
    this._moteT = 0;
    this._ultAnims = new Set();
    if (typeof window !== 'undefined') window.__game = this; // console/debug hook
    this.inventory = { elixir: 2, focus: 2 };

    // --- 3D + fx ------------------------------------------------------------
    this.renderer = new Renderer(this.sceneEl, {
      onContextLost: () => this._onContextLost(),
      onContextRestored: () => this._onContextRestored(),
    });
    const cam = this.renderer.camera;
    this.postfx = new PostFX(this.renderer.renderer, this.renderer.scene, cam);
    this.particles = new ParticleSystem(this.renderer.scene);
    this.particles.setPixelRatio(this.renderer.renderer.getPixelRatio());
    this.camera = new CameraRig(cam);
    this.screenFx = new ScreenFX(this.fxCanvas);
    this.dmg = new DamageNumbers(cam);
    this.targeting = new Targeting(cam, this.sceneEl);

    // --- battle -------------------------------------------------------------
    this.reaction = new ReactionSystem(this.input, this.tl, this.events);
    this.party = makePartyData();
    this.enemies = [];
    this.charEnts = this.party.map((d, i) => new Character(this.renderer.scene, d, i));
    this.enemyEnts = [];
    this.battle = new BattleSystem({
      rng: this.rng, events: this.events, timeline: this.tl,
      reaction: this.reaction, party: this.party, enemies: this.enemies, audio: this.audio,
    });
    this._bindEvents();

    // --- UI -------------------------------------------------------------------
    this.audio = new Audio(this.rng);
    this.battle.audio = this.audio; // battle-system captured `this.audio` (undefined) at construction
    this._bedWanted = false;
    this.hud = new Hud(this.hudCanvas);
    this.menu = new BattleMenu(this.uiEl, this.audio);
    this.prompts = new Prompts(() => this.hud.ctx);

    // --- Phase machine (story + overworld layer) ---------------------------
    // The battle core above is untouched; the game now flows through phases:
    //   intro -> overworld -> battle -> (win/lose) -> ... -> ending
    this.phase = 'intro';
    this._currentAct = 1;          // 1..4 story act (drives banners + objectives)
    this._encounterKey = null;     // which STORY.ENCOUNTERS entry is in this battle
    this._endingSide = null;       // 'A' | 'B' once the final choice is made

    // The guided objective chain. The gold marker always points to the next
    // story beat (memory or fight); camps + the secret are optional side goals.
    this._OBJECTIVE_CHAIN = ['mem_gold', 'ambush_1', 'mem_tide', 'gate', 'ambush_2', 'mem_bone', 'boss'];
    this._ACT_BY_OBJ = { mem_gold: 1, ambush_1: 1, mem_tide: 2, gate: 2, ambush_2: 3, mem_bone: 3, boss: 3 };

    // A free overworld subtitle clears itself after this many seconds.
    this._subClearAt = 0;

    // World-gen seed for the region (independent of the battle seed so the
    // overworld is identical every run and combat RNG is never touched).
    this._worldSeed = 0x0b17c0de;

    // Cinematic text layer (letterbox + subtitles + title card) on #ui.
    this.subtitles = new Subtitles(this.uiEl);

    this._onResize = () => {
      this.renderer.resize();
      this.postfx.resize(window.innerWidth, window.innerHeight, this.renderer.renderer.getPixelRatio());
      this.particles.setPixelRatio(this.renderer.renderer.getPixelRatio());
      this.dmg.setViewport(window.innerWidth, window.innerHeight);
      this.prompts.setViewport(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', this._onResize);
    this._onResize();

    this._last = performance.now();
    this._raf = requestAnimationFrame((t) => this._frame(t));

    // Begin the opening cinematic (builds the overworld behind it). This is
    // narrative: seed-independent, skippable, then hands to the overworld.
    this._start();
  }

  // ------------------------------------------------------------------
  // Phase bootstrap
  // ------------------------------------------------------------------

  _start() {
    this._buildOverworld();
    this._enterIntro();
  }

  _buildOverworld() {
    if (this.overworld) return;
    this.overworld = new Overworld(this.renderer.scene, {
      camera: this.renderer.camera,
      renderer: this.renderer.renderer,
      input: this.input,
      timeline: this.tl,
      areas: STORY.AREAS,
      pois: STORY.POIS,
      characters: STORY.CHARACTERS,
      onMemory: (poi) => this._onMemory(poi),
      onEncounter: (poi) => this._onEncounter(poi),
      onCamp: (poi) => this._onCamp(poi),
      onSecret: (poi) => this._onSecret(poi),
    });
    this.overworld.world.visible = false;
  }

  _enterIntro() {
    this.phase = 'intro';
    this._setWorldVisible(true);
    this._setCombatantsVisible(false);
    // The battle set (painted wall, columns) stays hidden — the intro flies
    // over the open world, not the combat stage.
    this.renderer.setStageVisible(false);
    this.postfx.setCinematic(true);
    this.subtitles.setLetterbox(true);
    this.subtitles.setSkipHint(true);
    this.overworld.setAtmosphere('dusk_city');
    this.overworld.objectiveId = null;
    // Build the Director AFTER the world exists so it can fly over terrain.
    this.director = new Director(this.renderer.camera, this.overworld, STORY.INTRO, {
      onSubtitle: (line) => this.subtitles.setSubtitle(line),
      onCard: (title, sub) => this.subtitles.setCard(title, sub),
      onLetterbox: (on) => this.subtitles.setLetterbox(on),
      onDone: () => this._introDone(),
    });
    this.director.play();
  }

  // ------------------------------------------------------------------
  // Frame loop
  // ------------------------------------------------------------------

  _frame(t) {
    const dt = Math.min(0.1, Math.max(0.0001, (t - this._last) / 1000));
    this._last = t;
    try {
      this._frameBody(dt);
    } catch (err) {
      // A presentation bug must never take the game down.
      console.error(err);
      this.screenFx.flash(0xff5050, 0.5);
    }
    this._raf = requestAnimationFrame((tt) => this._frame(tt));
  }

  _frameBody(dt) {
    this.tl.update();
    this.input.update();

    const worldT = this.tl.now() / 1000;
    const phase = this.phase;

    // Per-phase logic (drives the shared camera + that phase's systems).
    if (phase === 'intro') this._frameIntro(dt, worldT);
    else if (phase === 'overworld') this._frameOverworld(dt, worldT);
    else if (phase === 'battle') this._frameBattle(dt, worldT);
    else if (phase === 'ending') this._frameEnding(dt, worldT);

    // Shared presentation. The camera is already placed by the phase above;
    // we only decay fx, advance the composer, and render. Screen pressure
    // (the red low-HP vignette) applies only during combat.
    const pressure = phase === 'battle' ? this._battlePressure() : 0;
    this.screenFx.update(dt, { lowHp: pressure });

    // The audio bed needs one user gesture; poll it in every phase so a key
    // press or click in the intro/overworld unlocks the operatic score.
    if (this._bedWanted && this.audio.ctx && !this.audio._bedNodes) {
      this._bedWanted = false;
      this.audio.startBed();
    }

    this.postfx.update(dt);
    this.renderer.update(dt);
    this.postfx.render();
    this.particles.update(dt);
  }

  _battlePressure() {
    const lowHp = this.battle.partyAlive.length ? 1 - this._partyMinHpRatio() : 1;
    return lowHp > 0.4 ? (lowHp - 0.4) / 0.6 : 0;
  }

  // ------------------------------------------------------------------
  // Battle frame — the verified combat core (unchanged from Phase 2).
  // Everything that is combat-specific (battle state machine, entities,
  // targeting, combatant animation, HUD, prompts, combat lighting) lives
  // here. The shared tail (fx, composer, render) runs in `_frameBody`.
  // ------------------------------------------------------------------
  _frameBattle(dt, worldT) {
    this.battle.update();
    this.battle.maybeUltimateBoom();

    if (this._slow && this.tl.now() >= this._slow.at) {
      this.tl.setTimescale(this._slow.scale);
      this._slow = null;
    }

    this._processInput();

    // Entity animation (dead members keep updating so the death fall plays out)
    for (const c of this.charEnts) c.update(dt, worldT);
    for (const e of this.enemyEnts) e.update(dt, worldT);

    // Targeting
    if (this.battle.state === 'aim-mode') {
      this.targeting.update(dt, this.input.mouseNdc);
    }
    this.targeting.updatePop(dt);

    // Ambient paint motes — the stage is always breathing.
    this._moteT += dt;
    if (this._moteT > 0.22) {
      this._moteT = 0;
      this.particles.mote([this.fxRng.range(-9, 9), this.fxRng.range(0.4, 4.5), this.fxRng.range(-8, 4)]);
    }

    // Low-HP pressure drives the combat lighting + audio intensity.
    const lowHp = this.battle.partyAlive.length ? 1 - this._partyMinHpRatio() : 1;
    this.audio.setIntensity(clamp(lowHp, 0, 1));
    this.renderer.setIntensity(clamp(lowHp, 0, 1));

    this.camera.update(dt, worldT);

    this.hud.update({
      party: this.party,
      enemies: this.enemies,
      queue: this.battle.queue,
      actor: this.battle.queue.current || null,
      ultimate: { amount: this.battle.ultimate, max: 100, ready: this.battle.ultimateReady },
      flow: { amount: this.battle.flow, max: this.battle.maxFlow },
      wave: this._encWave(),
      seed: this.seed,
      time: this.tl.now() / 1000,
      lowHp,
    });
    this.dmg.update(dt);
    this.dmg.draw(this.hud.ctx);
    this.prompts.update({
      reaction: this.reaction,
      state: this.battle.state,
      tl: this.tl,
    });
  }

  _processInput() {
    const battle = this.battle;

    // Menu open: the DOM menu owns clicks; we forward navigation keys.
    if (this.menu.isOpen) {
      for (const a of ['left', 'right', 'up', 'down', 'tab', 'confirm', 'cancel']) {
        if (this.input.pressed(a) && this.menu.handleKey(a)) break;
      }
      return;
    }

    // Aim mode: steer the reticle, lock with click or Enter/E, cancel with X/Esc.
    if (battle.state === 'aim-mode') {
      if (this.input.pressed('cancel')) {
        this.targeting.endAim();
        this.prompts.setAimHint(false);
        battle.aimCancel();
      } else {
        const lock = this.input.mouseLock() || this.input.pressed('confirm') || this.input.pressed('parry');
        if (lock) {
          const r = this.targeting.confirm();
          this.targeting.endAim();
          this.prompts.setAimHint(false);
          if (r) {
            this.targeting.pop(1);
            this.battle.aimConfirm(r);
          } else {
            battle.aimCancel();
          }
        }
      }
    }
  }

  _partyMinHpRatio() {
    let m = 1;
    for (const c of this.party) if (!c.dead) m = Math.min(m, c.hp / c.maxHp);
    return m;
  }

  // ------------------------------------------------------------------
  // Slow motion
  // ------------------------------------------------------------------

  /** `durMs` is WALL-clock: the logical threshold scales with the new rate. */
  _slowMo(scale = 0.3, durMs = 450) {
    this.tl.setTimescale(scale);
    this._slow = { at: this.tl.now() + durMs * scale, scale: 1 };
  }

  // ------------------------------------------------------------------
  // Event routing
  // ------------------------------------------------------------------

  _bindEvents() {
    const E = this.events;
    E.on('menu-opened', (p) => this._onMenuOpened(p));
    E.on('aim-mode', (p) => this._onAimMode(p));
    E.on('enemy-attacking', (p) => this._onEnemyAttacking(p));
    E.on('telegraph-started', (p) => this._onTelegraph(p));
    E.on('hit-landed', (p) => this._onHitLanded(p));
    E.on('hit-resolved', (p) => this._onHitResolved(p));
    E.on('attack-finished', (p) => this._onAttackFinished(p));
    E.on('counter-fired', (p) => this._onCounterFired(p));
    E.on('presentation-started', (p) => this._onPresentation(p));
    E.on('weakness-hit', (p) => this._onWeaknessHit(p));
    E.on('weak-point-hit', (p) => this._onWeakPointHit(p));
    E.on('status-ticked', (p) => this._onStatusTicked(p));
    E.on('character-dead', (p) => this._onDeath(p));
    E.on('hp-changed', (p) => this._onHpChanged(p));
    E.on('level-up', (p) => this._onLevelUp(p));
    E.on('skill-unlocked', (p) => this._onSkillUnlocked(p));
    E.on('ultimate-cast', (p) => this._onUltimateCast(p));
    E.on('battle-won', () => this._onBattleWon());
    E.on('battle-lost', () => this._onBattleLost());
  }

  _onMenuOpened(p) {
    this.menu.open(p.actor, this.battle.enemies, {
      ultimateReady: this.battle.ultimateReady,
      inventory: this.inventory,
      onChoose: (c) => this._onChoose(c),
    });
    this.camera.setMode('duel', this._entOf(p.actor), null);
  }

  _onAimMode(p) {
    if (p.active) {
      this.targeting.beginAim(this.battle.enemies);
      this.prompts.setAimHint(true);
      const actor = this.battle.queue.current;
      this.camera.setMode('focus', this._entOf(actor), null);
    } else {
      this.targeting.endAim();
      this.prompts.setAimHint(false);
    }
  }

  _onEnemyAttacking(p) {
    const e = this._entOf(p.enemy);
    if (e) this.camera.setMode('duel', e, this._entOf(p.target));
  }

  _onTelegraph(p) {
    const e = this._entOf(p.attacker);
    if (e) {
      e.enterTelegraph(p.attack.pattern, p.hit);
      this.camera.setMode('over', e, this._entOf(p.attack.target));
    }
    this.audio.telegraphRise(p.hit.windup);
    if (p.phase.isGrab) this.prompts.result('DODGE!', 'grabs cannot be parried', '#ff9a6a', 0.9);
    else if (p.phase.isFeint) this.prompts.result('FEINT…', '', 'rgba(200,205,215,0.8)', 0.7);
  }

  _onHitLanded(p) {
    const { hit, target, attacker } = p;
    const ent = this._entOf(target);
    const eent = this._entOf(attacker);
    if (hit.quality === 'perfect' || hit.quality === 'good') {
      if (ent) {
        ent.playParry();
        this.particles.burst(this.combatPos(ent), { color: 0xfff2c4, count: 30, speed: 3.4, size: 12, life: 0.55, upBias: 0.5 });
        this.screenFx.flash(0xbfefff, 0.35);
        this.renderer.flash(1);
        this.postfx.pulse(hit.quality === 'perfect' ? 0.8 : 0.4);
        if (hit.quality === 'perfect') this._slowMo(0.3, 450);
      }
      if (eent) eent.resolveTelegraph(hit); // deflected recoil follow-through
      this.prompts.result(
        hit.quality === 'perfect' ? 'PERFECT PARRY' : 'PARRY',
        'the swing shatters on your blade',
        hit.quality === 'perfect' ? '#ffe9a8' : '#d9e6e2',
        0.8
      );
      this.camera.dolly(hit.quality === 'perfect' ? 1.2 : 0.6);
    } else if (hit.quality === 'dodge') {
      if (ent) ent.playDodge();
      if (eent) eent.resolveTelegraph(hit); // follow-through of the missed swing
      this.prompts.result('DODGED', '', '#9fd8cf', 0.7);
    } else if (hit.quality === 'whiff') {
      // The player reacted to a feint — the input is spent and nothing lands.
      if (eent) eent.resolveTelegraph(hit);
      this.prompts.result('WHIFFED', 'the swing never came', 'rgba(170,180,192,0.7)', 0.7);
    } else if (hit.quality === 'hit' || hit.quality === 'early') {
      if (hit.feint) {
        // The window lapsed on a feint: the swing was pulled back. No impact.
        if (eent) eent.resolveTelegraph(hit);
        this.prompts.result('WHIFF', 'a feint — the real blow follows', 'rgba(170,180,192,0.75)', 0.7);
        return;
      }
      // The swing connects. Damage is applied by the battle system; the
      // number itself arrives via the 'hit-resolved' event (exact value).
      if (ent) ent.playHit();
      if (eent) eent.resolveTelegraph(hit); // full strike follow-through + flash
      this.particles.burst(this.combatPos(ent), { color: 0xd86a5a, count: 20, speed: 2.8, size: 10, life: 0.5 });
      this.screenFx.flash(0xff7a4a, 0.18);
      this.camera.addShake(0.7);
      if (hit.quality === 'early') this.prompts.result('TOO EARLY', '', 'rgba(159,216,207,0.7)', 0.55);
    }
  }

  /** Enemy swing connected: float the real damage number + impact sound. */
  _onHitResolved(p) {
    if (p.outcome !== 'hit') return;
    this.dmgNumber(p.target, p.damage, { crit: !!p.crit, weakness: !!p.weakness });
    this.audio.hit({ crit: !!p.crit, weakness: !!p.weakness });
  }

  _onAttackFinished(p) {
    if (p.allParried && p.attack.hits.length > 1) {
      this.prompts.result('COMBO CLEARED', 'every swing deflected', '#e8c979', 1.0);
    }
  }

  _onCounterFired(p) {
    const s = this._entOf(p.source);
    if (s) {
      s.playAttack(620);
      this.camera.setMode('duel', s, this._entOf(p.target));
      this.camera.dolly(1.2);
    }
    this.screenFx.flash(0xe8c979, 0.4);
  }

  _onPresentation(p) {
    const step = p.step;
    if (step.kind === 'hit') {
      const ult = !!step.ultimate;
      if (ult) {
        const key = step.member && step.member.id;
        if (key && !this._ultAnims.has(key)) {
          this._ultAnims.add(key);
          const m = this._entOf(step.member);
          if (m) {
            m.playAttack(430);
            this.camera.setMode('duel', m, this._entOf(step.target));
          }
        }
      } else if (step.hitIndex == null) {
        const c = this._entOf(p.actor);
        if (c && c.data.isParty) {
          c.playAttack(p.opts && p.opts.ranged ? 640 : 560);
          this.camera.setMode('duel', c, this._entOf(step.target));
          // Ranged shots get a paint-bolt streak to the target.
          if (p.opts && p.opts.ranged) {
            const from = c.toWorld(new THREE.Vector3(0, 1.35, 0.4));
            const to = this.combatPos(this._entOf(step.target));
            this.particles.tracer(from, to, {
              color: step.crit ? 0xbfefff : (ELE_COLOR[c.data.element] || 0x7fd8cf),
              count: 20, size: 8, life: 0.45,
            });
          }
        }
      }
      const weak = !!step.weakness;
      this.dmgNumber(step.target, step.damage, {
        crit: !!step.crit, weakness: weak,
        color: ult ? 0xb48aff : undefined,
      });
      const t = this._entOf(step.target);
      if (t) {
        this.particles.burst(this.combatPos(t), {
          color: ult ? 0xb48aff : (ELE_COLOR[p.actor && p.actor.element] || 0xe8c979),
          count: ult ? 34 : 22, speed: ult ? 3.6 : 2.6, size: ult ? 14 : 10, life: 0.6,
        });
      }
      if (weak) {
        this.screenFx.flash(0xffd76a, 0.3);
        this.audio.weaknessApplied();
      }
      if (step.crit) {
        this.screenFx.flash(0x7fd8cf, 0.22);
        this.camera.addShake(0.5);
      }
      if (step.staggered && t) {
        t.playStagger();
        this.prompts.result('STAGGERED!', 'open for a strike', '#ffd76a', 0.9);
        this.audio.stagger();
        this.events.emit('staggered', { character: step.target });
      }
    } else if (step.kind === 'heal') {
      const t = this._entOf(step.target);
      if (t) {
        t.playHeal();
        this.particles.burst(this.combatPos(t), { color: 0x8fe3a8, count: 22, speed: 2, size: 10, life: 0.8, grav: -1 });
        this.dmg.spawnAt(t, `+${step.amount}`, { kind: 'heal' });
        this.camera.setMode('focus', this._entOf(p.actor), t);
      }
    } else if (step.kind === 'shield' || step.kind === 'status' || step.kind === 'note') {
      const t = this._entOf(step.target);
      if (t && t.data.isParty) t.playBuff();
      if (step.kind === 'shield' && t) {
        this.particles.burst(this.combatPos(t), { color: 0x9fd8cf, count: 18, speed: 1.8, size: 9, life: 0.7, grav: -0.6 });
      }
      if (step.kind === 'status' && t) {
        this.dmg.spawnAt(t, step.id.toUpperCase(), { kind: 'status', color: '#c9a24b' });
        if (t.data.isEnemy && t.data.staggered) t.playStagger();
      }
      if (step.kind === 'shield' || (step.kind === 'status' && step.target && step.target.isParty)) {
        this.camera.setMode('focus', this._entOf(p.actor), t);
      }
    }
  }

  _onWeaknessHit(p) {
    const e = this._entOf(p.target);
    if (e) this.dmg.spawnAt(e, 'WEAK!', { kind: 'weak', color: '#ffd76a', size: 16, tag: null, life: 1.0 });
  }

  _onWeakPointHit(p) {
    this.prompts.result('WEAK POINT PIERCED', '', '#ffd76a', 0.9);
    if (p.weakPoint) {
      this.particles.burst(p.weakPoint, { color: 0xffd76a, count: 30, speed: 3, size: 12, life: 0.6, upBias: 0.3 });
    }
    this.audio.weakPointHit();
    this.postfx.pulse(0.5);
  }

  _onStatusTicked(p) {
    const e = this._entOf(p.character);
    if (e) {
      this.dmg.spawnAt(e, `-${p.damage}`, { kind: 'status', color: p.status === 'burn' ? '#ff8a4a' : '#9fd8cf', size: 15 });
      this.particles.burst(this.combatPos(e), { color: p.status === 'burn' ? 0xff8a4a : 0x9fd8cf, count: 8, speed: 1.2, size: 6, life: 0.5, grav: 0.5 });
    }
  }

  _onDeath(p) {
    const c = p.character;
    const e = this._entOf(c);
    if (e) {
      e.playDeath();
      const accent = c.look ? c.look.accent : (c.data && c.data.look ? c.data.look.accent : '#c9a24b');
      this.particles.dissolve(this.combatPos(e), { color: new THREE.Color(accent).getHex() });
      this.camera.addShake(0.4);
    }
    this.prompts.result(c.name.toUpperCase(), c.isParty ? 'falls from the expedition' : 'dissolves into the Nox', '#e9e2cf', 1.2);
  }

  _onHpChanged(p) {
    const c = p && p.character;
    if (c && c.isEnemy && c.id === 'nameless') this._refreshBossPatterns(c);
  }

  _onLevelUp(p) {
    this.prompts.banner(`${p.character.name} — LEVEL ${p.level}`, 'the expedition grows stronger', '#ffe9a8', 1.8);
    const e = this._entOf(p.character);
    if (e) this.particles.burst(this.combatPos(e), { color: 0xffe9a8, count: 40, speed: 2.6, size: 12, life: 0.9, upBias: 0.6 });
  }

  _onSkillUnlocked(p) {
    this.prompts.result('SKILL UNLOCKED', `${p.character.name} learns a new art`, '#e8c979', 1.4);
  }

  _onUltimateCast(p) {
    this._ultAnims.clear();
    this._slowMo(0.35, 900);
    this.screenFx.setDesaturate(0.5);
    this.screenFx.flash(0xb48aff, 0.5);
    this.camera.dolly(1.8);
    if (p.actor) this.camera.setMode('duel', this._entOf(p.actor), null);
  }

  _onBattleWon() {
    const isBoss = this._encounterKey === 'boss';
    for (const c of this.charEnts) if (!c.data.dead) c.playVictory();
    this.camera.setMode('wide');
    for (let i = 0; i < 40; i++) {
      this.particles.burst(
        [this.fxRng.range(-5, 5), this.fxRng.range(1, 3.4), this.fxRng.range(-3, 3)],
        { color: i % 2 ? 0xe8c979 : 0x7fd8cf, count: 8, speed: 2.2, size: 10, life: 1.2, upBias: 0.6 }
      );
    }
    this.screenFx.flash(0xe8c979, 0.4);
    if (isBoss) {
      // The Eraser is undone — the party chooses what the last page says.
      this._showChoice();
    } else {
      this._showScreen({
        title: 'THE NOX DISSIPATES',
        sub: 'the fog parts — the road opens',
        button: 'Continue',
        onButton: () => this._returnToOverworld(),
      });
    }
  }

  _onBattleLost() {
    this.screenFx.setDesaturate(0.7);
    this._showScreen({
      title: 'THE EXPEDITION ENDS',
      sub: 'The Nox claims another party. The Nox keeps its names.',
      button: 'Try Again',
      onButton: () => window.location.reload(),
    });
  }

  // ------------------------------------------------------------------
  // Boss phases
  // ------------------------------------------------------------------

  _refreshBossPatterns(boss) {
    if (!boss || !boss.isEnemy) return;
    const mesh = this.enemyEnts.find((m) => m.data === boss);
    if (!mesh || mesh.data.id !== 'nameless') return;
    const pct = boss.hp / boss.maxHp;
    let want = 1;
    if (pct <= 0.3) want = 3;
    else if (pct <= 0.6) want = 2;
    if (want === (boss.phase || 1)) return;
    boss.phase = want; // HUD reads the phase off the data object
    mesh.setPhase(want);
    boss.patterns = (boss.basePatterns || boss.patterns).filter((pt) => pt.phase <= want);
    this.events.emit('staggered', { character: boss });
    if (want === 2) {
      this.prompts.banner('THE NAMELESS AWAKENS', 'feints enter the dance — trust your eyes', '#7fd8cf', 2.0);
    } else if (want === 3) {
      this.prompts.banner('THE NAMELESS UNRAVELS', 'desperate and faster — hold the line', '#ff7a4a', 2.0);
    }
    if (this.audio) this.audio.stagger();
  }

  // ------------------------------------------------------------------
  // Story encounters (replace the old fixed waves)
  // ------------------------------------------------------------------

  _encWave() {
    const n = this._encounterKey === 'boss' ? 3 : this._encounterKey === 'gate' ? 2 : 1;
    return { index: n, total: 3 };
  }

  // Reset the party to a fresh expedition between fights (the overworld is the
  // safe place; combat is where you spend health). Keeps the story flowing and
  // keeps the verified battle core intact.
  _resetParty() {
    for (const c of this.party) {
      c.dead = false;
      c.hp = c.maxHp;
      c.shield = 0;
      c.ap = 0;
      c.stagger = 0;
      if (c.statuses) c.statuses.clear();
    }
    // Revive any fallen party member: reset their pose + return to idle.
    for (const m of this.charEnts) if (typeof m.playIdle === 'function') m.playIdle();
  }

  _spawnEncounter(key) {
    const enc = STORY.ENCOUNTERS[key];
    // Tear down the previous encounter's enemies (Rig.dispose needs the scene
    // it was built in). Without this a later fight would leak the old meshes
    // into the new battle.
    for (const ent of this.enemyEnts) {
      if (ent && typeof ent.dispose === 'function') ent.dispose(this.renderer.scene);
    }
    this.enemies.length = 0;
    this.enemyEnts.length = 0;
    if (!enc) return;
    for (const def of enc.enemies) {
      const data = makeEnemyData(def.data.id, def.pos);
      if (def.data.id === 'nameless') data.basePatterns = def.data.patterns;
      data.patterns = def.data.id === 'nameless' ? def.data.patterns.filter((p) => p.phase <= 1) : def.data.patterns;
      this.enemies.push(data);
      this.enemyEnts.push(new Enemy(this.renderer.scene, data, this.tl));
    }
  }

  _beginEncounter(key) {
    this._hideScreen();
    this._encounterKey = key;
    this.phase = 'battle'; // route the frame loop to _frameBattle
    // Restore the battle's tuned scene fog (the overworld swaps it per-area).
    this.renderer.scene.fog = new THREE.FogExp2(0x0d1a22, 0.028);
    const enc = STORY.ENCOUNTERS[key];
    this._resetParty();
    this._spawnEncounter(key);
    this._setWorldVisible(false);
    this._setCombatantsVisible(true);
    this.renderer.setStageVisible(true); // back to the combat stage
    this.menu.close();
    this.targeting.endAim();
    this.prompts.setAimHint(false);
    this.battle.victory = false;
    this.battle.defeat = false;
    this.battle.pendingCounter = null;
    this.battle.begin({}); // -> state 'intro' + intro timer (no pictos applied)
    // Battle look: no god rays / no DOF — the combat frame stays crisp.
    this.postfx.setWorldLook(false);
    // An overworld "E — <place>" hint may still be showing from standing near
    // the POI that triggered this fight; clear it so it doesn't linger in
    // the combat frame.
    this._setInteractHint(null);
    this.camera.setMode('wide');
    this.hud.setVisible(true);
    this.prompts.banner(enc.name, enc.intro, '#e8c979', 3.0);
    this.screenFx.flash(0x000000, 0.5);
    if (this.audio) this.audio.init();
    if (this.audio.ctx && this.audio.ctx.state === 'suspended') this.audio.ctx.resume().catch(() => {});
    this._bedWanted = true;
  }

  // Back to the open world after a fight: mark it cleared, advance the
  // objective chain (which also raises the act), and re-show the region.
  _returnToOverworld() {
    this._leaveBattle();
    this._hideScreen();
    this.subtitles.setSubtitle(null);
    const key = this._encounterKey;
    if (this.overworld) {
      this.overworld.markCollected(key);
      if (key === 'gate') this.overworld.markGateOpen(key);
    }
    this._setWorldVisible(true);
    this._setCombatantsVisible(false);
    this.renderer.setStageVisible(false); // the region, not the stage
    this.postfx.setCinematic(false);
    this.hud.setVisible(false);
    this.audio.setIntensity(0);
    this.renderer.setIntensity(0);
    this.phase = 'overworld';
    const before = this._currentAct;
    this._advanceObjective(key);
    if (this._currentAct === before) {
      this.prompts.banner('THE FOG PARTS', 'the road opens — follow the marker', '#7fd8cf', 2.2);
    }
  }

  _actRoman(n) { return ['I', 'II', 'III', 'IV'][n - 1] || 'I'; }

  // ------------------------------------------------------------------
  // Phase frames (intro / overworld / ending) — battle lives in `_frameBattle`
  // ------------------------------------------------------------------

  _frameIntro(dt, worldT) {
    const d = this.director;
    if (d) {
      // The "skip →" hint is real: Enter/E or X/Esc fast-forwards to the end.
      if (this.input.pressed('confirm') || this.input.pressed('cancel')) d.skip();
      d.update(performance.now());
    }
    // The director may null itself out (onDone -> _introDone) while the phase
    // is still 'intro' for one frame; never dereference it after that.
    this.overworld.renderAmbient(dt, worldT);
    this._updateWorldLook(30); // soft mid-focus across the establishing shots
  }

  _frameOverworld(dt, worldT) {
    this.overworld.update(dt, worldT);
    // A POI interaction (ambush / memory / gate / secret) runs synchronously
    // inside overworld.update() and can flip the phase to 'battle' mid-frame.
    // If that happened, `_beginEncounter` already restored the crisp combat
    // look — bail out BEFORE the overworld post-processing below, which would
    // otherwise re-enable god rays + DOF and re-show the interact hint.
    if (this.phase !== 'overworld') return;
    // Keep the player (and the foreground) sharp, let the city and the Spire
    // fall off into a cinematic bokeh behind the party.
    this._updateWorldLook(
      this.renderer.camera.position.distanceTo(this.overworld.player.position) + 2
    );
    this._updateAreaAtmosphere();
    // Free-form overworld dialogue (memories, camps) clears itself; cinematic
    // subtitles (intro/ending) are cleared explicitly by the Director instead.
    if (this._subClearAt > 0 && this.tl.now() >= this._subClearAt) {
      this._subClearAt = 0;
      this.subtitles.setSubtitle(null);
    }
    this._setInteractHint(this.overworld._pendingInteract);
  }

  // Shift fog / sky / light / exposure as the party crosses between areas —
  // the region feels alive, and it re-sets the scene.fog the battle resets.
  _updateAreaAtmosphere() {
    const ow = this.overworld;
    const areas = ow.areas || STORY.AREAS;
    const p = ow.player.position;
    let best = null, bd = Infinity;
    for (const a of areas) {
      const dx = p.x - a.center[0], dz = p.z - a.center[2];
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = a; }
    }
    if (best && best.id !== ow.currentArea?.id) {
      ow.setAtmosphere(best.id);
    }
  }

  // Small floating "E — <place>" hint shown when the player is close to a POI.
  _setInteractHint(poi) {
    const el = (this._hintEl = this._hintEl || this._makeHintEl());
    if (!poi) { el.style.opacity = '0'; return; }
    el.textContent = `E — ${poi.name}`;
    el.style.opacity = '1';
  }

  _makeHintEl() {
    const el = document.createElement('div');
    el.style.cssText =
      'position:absolute;left:50%;bottom:19vh;transform:translateX(-50%);' +
      'padding:7px 18px;font:600 13px Georgia,serif;letter-spacing:.14em;color:#e9e2cf;' +
      'background:rgba(9,12,17,.72);border:1px solid rgba(232,201,121,.5);' +
      'border-radius:2px;pointer-events:none;opacity:0;transition:opacity .2s;' +
      'text-shadow:0 1px 8px rgba(0,0,0,.8);z-index:25;';
    this.uiEl.appendChild(el);
    return el;
  }

  _frameEnding(dt, worldT) {
    if (this._endDirector) this._endDirector.update(performance.now());
    this.overworld.renderAmbient(dt, worldT);
    this._updateWorldLook(26); // trio sharp, Spire haloed behind
  }

  // World-look post passes (god rays from the Spire beacon + depth of
  // field). Enabled for every non-battle phase; `_beginEncounter` turns it
  // off so the verified combat look stays crisp and fast.
  _updateWorldLook(focus) {
    const fx = this.postfx;
    if (!fx) return;
    if (!this._spireAnchor) this._spireAnchor = new THREE.Vector3(0, 69, 0);
    fx.setWorldLook(true, focus);
    fx.setLightAnchor(this._spireAnchor);
  }

  _setWorldVisible(v) {
    if (this.overworld) this.overworld.setVisible(v);
  }

  // Show a transient line of dialogue in the overworld (clears after `dur`s).
  _overworldSay(text, speaker = null, dur = 4.2) {
    this.subtitles.setSubtitle({ speaker, text });
    this._subClearAt = this.tl.now() + dur * 1000;
  }

  _setCombatantsVisible(v) {
    for (const m of this.charEnts) if (m.root) m.root.visible = v;
    for (const e of this.enemyEnts) if (e.root) e.root.visible = v;
  }

  // Called whenever we leave a fight (win -> choice / overworld). Without it
  // the battle menu + overworld interact hint linger behind the next overlay.
  _leaveBattle() {
    if (this.menu) this.menu.close();
    this._setInteractHint(null);
  }

  // ------------------------------------------------------------------
  // Intro cinematic completion → open the world
  // ------------------------------------------------------------------

  _introDone() {
    if (this.director) {
      this.director.onDone = null; // never fires again
      this.director = null;
    }
    this.subtitles.setLetterbox(false);
    this.subtitles.setSkipHint(false);
    this.subtitles.setCard(null);
    this.postfx.setCinematic(false);
    this.hud.setVisible(false);
    if (this.overworld) {
      this.overworld.setVisible(true);
      this.overworld.start();          // active -> update() drives player + camera
      this.overworld.setAtmosphere('dusk_city');
    }
    this._currentAct = 1;
    this.overworld.setObjective(this._OBJECTIVE_CHAIN[0]);
    this.phase = 'overworld';
    this.prompts.banner('ACT I — THE DUSK CITY', 'follow the gilded marker · WASD move · drag to look', '#e8c979', 3.2);
  }

  // ------------------------------------------------------------------
  // Objective chain + overworld point-of-interest callbacks
  // ------------------------------------------------------------------

  _advanceObjective(clearedId) {
    const chain = this._OBJECTIVE_CHAIN;
    let i = chain.indexOf(clearedId);
    if (i < 0) return;
    let next = null;
    for (let j = i + 1; j < chain.length; j++) {
      if (!this.overworld.collected.has(chain[j]) && !this.overworld.openedGates.has(chain[j])) { next = chain[j]; break; }
    }
    if (next) {
      this.overworld.setObjective(next);
      const act = this._ACT_BY_OBJ[next];
      if (act && act !== this._currentAct) {
        this._currentAct = act;
        this.prompts.banner(`ACT ${this._actRoman(act)}`, this._actTagline(act), '#e8c979', 2.6);
      }
    }
  }

  _actTagline(n) {
    return n === 1 ? 'the Veil brightens — find what it took'
      : n === 2 ? 'cross the ford; the gate stands watch'
      : 'the Spire waits — and the Eraser at its heart';
  }

  _onMemory(poi) {
    this.overworld.markCollected(poi.id);
    const p = (STORY.PICTOS || []).find((x) => x.id === poi.picto);
    this._overworldSay(p ? `${p.name} — ${p.meaning}` : 'A name, written back into the paint.', 'MAE', 4.5);
    if (this.audio) this.audio.weaknessApplied();
    this._advanceObjective(poi.id);
  }

  _onSecret(poi) {
    this.overworld.markCollected(poi.id);
    this._overworldSay('Gustave says the name aloud. It still counts.', 'GUSTAVE', 4.5);
    if (this.audio) this.audio.heal();
  }

  _onCamp(poi) {
    this.overworld.markCollected(poi.id);
    for (const c of this.party) { c.hp = c.maxHp; c.shield = 0; c.stagger = 0; if (c.statuses) c.statuses.clear(); }
    this._overworldSay('An expedition flag. The wounds close; the paint is ready again.', null, 4.0);
    if (this.audio) this.audio.heal();
  }

  _onEncounter(poi) {
    // Defense in depth: a cleared ambush/gate must never re-trigger, even if
    // a stale proximity hint or a fast double-confirm reaches us.
    const key = poi.encounter || poi.id;
    if (this.overworld.collected.has(key)) return;
    if (poi.kind === 'gate' && this.overworld.openedGates.has(key)) return;
    this._beginEncounter(key);
  }

  // ------------------------------------------------------------------
  // The choice (after the boss) and the two endings
  // ------------------------------------------------------------------

  _showChoice() {
    this._leaveBattle();
    const A = STORY.ENDINGS.A;
    const B = STORY.ENDINGS.B;
    const el = document.createElement('div');
    el.className = 'ov ov-end ov-choice';
    el.innerHTML = `
      <div class="ov-card">
        <div class="ov-title">THE LAST PAGE</div>
        <div class="ov-sub">The Nox is undone. The city is yours to finish. What should the page say?</div>
        <div class="choice-row">
          <button class="ov-btn choice-btn" data-side="A"></button>
          <button class="ov-btn choice-btn" data-side="B"></button>
        </div>
      </div>`;
    const [ba, bb] = el.querySelectorAll('.choice-btn');
    ba.innerHTML = `<b>${A.title}</b><span>${A.card}</span>`;
    bb.innerHTML = `<b>${B.title}</b><span>${B.card}</span>`;
    ba.addEventListener('click', () => this._chooseEnding('A'));
    bb.addEventListener('click', () => this._chooseEnding('B'));
    this.uiEl.appendChild(el);
    this._screenEl = el;
  }

  _chooseEnding(side) {
    this._leaveBattle();
    this._hideScreen();
    const end = STORY.ENDINGS[side];
    this._endingSide = side;
    this.phase = 'ending';
    this.postfx.setCinematic(true);
    this.hud.setVisible(false);
    this.subtitles.setLetterbox(true);
    this._setWorldVisible(true);
    this._setCombatantsVisible(false);
    this.renderer.setStageVisible(false);
    this.overworld.setAtmosphere('summit');
    const gate = STORY.POIS.find((p) => p.id === 'boss');
    if (gate) this.overworld.movePlayerTo(gate.pos[0], gate.pos[2]);
    this._endDirector = new Director(this.renderer.camera, this.overworld, this._endingBeats(side), {
      onSubtitle: (line) => this.subtitles.setSubtitle(line),
      onCard: (t, s, txt) => this.subtitles.setCard(t, s, txt),
      onLetterbox: (on) => this.subtitles.setLetterbox(on),
      onDone: () => this._endingDone(side),
      onBeat: () => {},
    });
    this._endDirector.play();
  }

  _endingBeats(side) {
    const end = STORY.ENDINGS[side];
    const shots = ['trio', 'spire', 'sky'];
    const beats = (end.lines || []).slice(0, 3).map((ln, i) => ({
      dur: 3.2,
      shot: { kind: shots[i] || 'sky', rise: i === 0 ? 2.2 : 1 },
      sfx: 'rise',
      subtitle: { speaker: (ln.speaker || '').toUpperCase(), text: ln.text },
    }));
    beats.push({
      dur: 2.8,
      shot: { kind: 'title' },
      sfx: 'card',
      card: end.title,
      sub: 'CLAIR OBSCURE — EXPEDITION 33 · THE UNWRITTEN',
    });
    return beats;
  }

  _endingDone(side) {
    const end = STORY.ENDINGS[side];
    const el = document.createElement('div');
    el.className = 'ov ov-end ov-ending';
    el.innerHTML = `
      <div class="ov-card">
        <div class="ov-title"></div>
        <div class="ov-sub"></div>
        <button class="ov-btn">Play Again</button>
      </div>`;
    el.querySelector('.ov-title').textContent = end.title;
    el.querySelector('.ov-sub').textContent = end.card;
    el.querySelector('.ov-btn').addEventListener('click', () => window.location.reload());
    this.uiEl.appendChild(el);
    this._screenEl = el;
  }

  // ------------------------------------------------------------------
  // Player choices
  // ------------------------------------------------------------------

  _onChoose(c) {
    const battle = this.battle;
    if (c.type === 'aim') {
      battle.playerChoose({ type: 'aim' }); // -> 'aim-mode'; mouse/Enter locks
      return;
    }
    if (c.type === 'skill' || c.type === 'basic') {
      battle.playerChoose({ type: c.type, skill: c.skill || null, target: c.target });
    } else if (c.type === 'item') {
      if (this.inventory[c.item] <= 0) return;
      this.inventory[c.item] -= 1;
      battle.playerChoose({ type: 'item', item: c.item });
    } else if (c.type === 'ultimate') {
      battle.playerChoose({ type: 'ultimate' });
    }
  }

  // ------------------------------------------------------------------
  // Overlays
  // ------------------------------------------------------------------

  _showScreen({ title, sub, button, onButton, kind = '' }) {
    this._hideScreen();
    // A full-screen overlay owns the view: drop any lingering cinematic card.
    if (this.subtitles) this.subtitles.setCard(null);
    const el = document.createElement('div');
    el.className = `ov ov-end${kind ? ' ' + kind : ''}`;
    el.innerHTML = `
      <div class="ov-card">
        <div class="ov-title"></div>
        <div class="ov-sub"></div>
        <button class="ov-btn"></button>
      </div>`;
    el.querySelector('.ov-title').textContent = title;
    el.querySelector('.ov-sub').textContent = sub || '';
    const b = el.querySelector('.ov-btn');
    b.textContent = button || 'Continue';
    b.addEventListener('click', () => { if (onButton) onButton(); });
    this.uiEl.appendChild(el);
    this._screenEl = el;
  }

  _hideScreen() {
    if (this._screenEl) {
      this._screenEl.remove();
      this._screenEl = null;
    }
  }

  _onContextLost() {
    this._showScreen({
      kind: 'ov-error',
      title: 'RENDERING LOST',
      sub: 'The graphics context was lost (often by the OS). It will resume automatically if the browser restores it.',
      button: '',
    });
  }

  _onContextRestored() {
    if (this._screenEl && this._screenEl.classList.contains('ov-error')) this._hideScreen();
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  _entOf(c) {
    if (!c) return null;
    if (c.isParty) {
      const i = this.party.indexOf(c);
      return i >= 0 ? this.charEnts[i] : null;
    }
    return this.enemyEnts.find((e) => e.data === c) || null;
  }

  combatPos(e) {
    return e.root.position.clone().add(new THREE.Vector3(0, 1.15, 0));
  }

  dmgNumber(target, amount, { crit = false, weakness = false, color = null } = {}) {
    if (!target) return;
    const mesh = this._entOf(target);
    if (!mesh) return;
    this.dmg.spawnAt(mesh, String(amount), {
      kind: weakness ? 'weak' : (crit ? 'crit' : 'dmg'),
      tag: weakness ? 'WEAK' : (crit ? 'CRIT' : null),
      color: color != null ? `#${new THREE.Color(color).getHexString()}` : undefined,
      life: 1.0,
    });
  }
}
