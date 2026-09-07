import * as THREE from 'three';
import { RNG, makeSeed, normalizeSeed } from './core/rng.js';
import { Clock, Timers } from './core/clock.js';
import { EventBus, EV } from './core/events.js';
import { GameRenderer } from './engine/renderer.js';
import { createPostFX } from './engine/postfx.js';
import { Stage } from './engine/stage.js';
import { CameraDirector } from './engine/camera.js';
import { AudioEngine } from './engine/audio.js';
import { Character } from './entities/character.js';
import { Enemy } from './entities/enemy.js';
import { ENEMY_DEFS, BOSS_DEF, WAVES } from './entities/enemy-data.js';
import { TurnQueue } from './battle/turn-queue.js';
import { ReactionSystem } from './battle/reaction-system.js';
import { AimController } from './battle/targeting.js';
import { BattleSystem, STATES } from './battle/battle-system.js';
import { HUD } from './ui/hud.js';
import { Prompts } from './ui/prompts.js';
import { Menu } from './ui/menu.js';
import { FX } from './fx/particles.js';
import { clamp01 } from './core/easing.js';

// ---------------------------------------------------------------------------
// Top-level orchestrator: owns the render loop, wave progression, input
// routing (menu / target / aim / reaction keys) and the restart flow.
// The battle state machine itself lives in battle/battle-system.js.
// ---------------------------------------------------------------------------

const PARTY_DEFS = [
  {
    name: 'Gustave', side: 'party', level: 1, row: 'front', maxAp: 6,
    stats: { hp: 148, atk: 17, def: 8, spd: 12, crit: 0.08 }, stagger: 55,
    skills: ['riposte', 'lanceLight'],
    visual: { weapon: 'rapier', hue: 205, sat: 26, light: 34, accent: '#f4d489', accentHue: 45, trim: '#d8a94a', hat: '#22313a', skinHue: 28 }
  },
  {
    name: 'Maelle', side: 'party', level: 1, row: 'front', maxAp: 6,
    stats: { hp: 132, atk: 19, def: 6, spd: 15, crit: 0.11 }, stagger: 50,
    skills: ['flurry', 'crimsonStep', 'shatterChord'],
    visual: { weapon: 'brush', hue: 350, sat: 30, light: 36, accent: '#e07a7f', accentHue: 8, trim: '#c98f4a', hat: '#3a2226', skinHue: 26 }
  },
  {
    name: 'Lune', side: 'party', level: 1, row: 'back', maxAp: 6,
    stats: { hp: 120, atk: 15, def: 7, spd: 10, crit: 0.06 }, stagger: 48,
    skills: ['chromaBurst', 'pigmentShield', 'restoreHue'],
    visual: { weapon: 'lantern', hue: 172, sat: 28, light: 32, accent: '#7fe0a8', accentHue: 150, trim: '#d8a94a', hat: '#1f3a35', skinHue: 30 }
  },
  {
    name: 'Sciel', side: 'party', level: 1, row: 'back', maxAp: 6,
    stats: { hp: 126, atk: 16, def: 7, spd: 13, crit: 0.09 }, stagger: 52,
    skills: ['duskMark', 'reaperStance', 'weaveSlow'],
    visual: { weapon: 'staff', hue: 268, sat: 20, light: 33, accent: '#b79cff', accentHue: 265, trim: '#9a8ab8', hat: '#2a2340', skinHue: 24 }
  }
];

const PARTY_SLOTS = [
  { x: -1.9, z: 3.15 }, { x: 1.9, z: 3.15 },
  { x: -4.6, z: 4.5 }, { x: 4.6, z: 4.5 }
];

const _ndc = new THREE.Vector3();

export class Game {
  constructor({ glCanvas, overlayCanvas, uiRoot, banner }) {
    this.glCanvas = glCanvas;
    this.overlay = overlayCanvas;
    this.octx = overlayCanvas.getContext('2d');
    this.banner = banner;

    const params = new URLSearchParams(window.location.search);
    this.seed = normalizeSeed(params.get('seed') || makeSeed());

    this.bus = new EventBus();
    this.clock = new Clock();
    this.timers = new Timers(this.clock);

    this.renderer = new GameRenderer(glCanvas, this.bus);
    this.scene = this.renderer.scene;
    this.camera = this.renderer.camera;
    this.stage = new Stage(this.scene);
    this.cameraDir = new CameraDirector(this.camera);
    this.audio = new AudioEngine(this.bus);
    this.fx = new FX(this.scene, this.bus);

    this.aim = new AimController(this.bus);
    this.raycaster = new THREE.Raycaster();

    this.hud = new HUD(overlayCanvas, this.bus, {
      party: () => this.party,
      enemies: () => this.enemies,
      state: () => this._uiState()
    });
    this.hud.setProjector((v) => this.projectPoint(v));
    this.prompts = new Prompts(this.bus);
    this.menu = new Menu(uiRoot, this.bus, () => this.battle);
    this.menu.connectClicks();

    this.overlays = {
      victory: uiRoot.querySelector('#end-victory'),
      defeat: uiRoot.querySelector('#end-defeat'),
      wave: uiRoot.querySelector('#wave-banner'),
      context: uiRoot.querySelector('#context-lost')
    };

    this.party = [];
    this.enemies = [];
    this.wave = 0;
    this.battle = null;
    this.finished = false;
    this._targetIndex = 0;
    this._keysDown = new Set();

    this._bindBus();
    this._bindInput();

    this.hud.resize(window.innerWidth, window.innerHeight);
    window.addEventListener('resize', () => this.hud.resize(window.innerWidth, window.innerHeight));

    // Post-processing is async (dynamic import) — start the loop immediately
    // in passthrough mode and swap the composer in when it resolves.
    createPostFX(this.renderer).then((post) => {
      this.renderer.attachPost(post);
      this.post = post;
    });

    this._buildRun();
    this._lastT = performance.now();
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  // ==========================================================================
  // Run / wave construction
  // ==========================================================================

  _buildRun() {
    const seed = this.seed;
    this.rng = new RNG(seed);
    this._buildParty();
    this.wave = 0;
    this.finished = false;
    this._startWave();
  }

  _buildParty() {
    this.party = PARTY_DEFS.map((def, i) => {
      const c = new Character(def, this.bus, this.stage);
      const s = PARTY_SLOTS[i] || PARTY_SLOTS[PARTY_SLOTS.length - 1];
      c.place(s.x, s.z);
      return c;
    });
  }

  _spawnWaveEnemies() {
    const spec = WAVES[Math.min(this.wave, WAVES.length - 1)];
    const list = [];
    const add = (kind) => {
      const def = kind === 'boss' ? BOSS_DEF : ENEMY_DEFS.find((d) => d.kind === kind);
      if (!def) return;
      const e = new Enemy(def, this.bus, this.stage, this.rng);
      list.push(e);
    };
    for (let i = 0; i < (spec.count || 1); i++) add(spec.kind);
    for (const k of spec.plus || []) add(k);
    const n = list.length;
    list.forEach((e, i) => {
      const spread = n === 1 ? 0 : -4.4 + (8.8 * i) / (n - 1);
      const x = n === 1 ? 0 : spread;
      const z = e.boss ? -4.4 : -3.4 - (i % 2) * 0.9;
      e.place(x, z);
    });
    return list;
  }

  _startWave() {
    this.enemies = this._spawnWaveEnemies();
    this.hud.setCombatants(this.party, this.enemies);
    this.bus.emit(EV.LOG, { text: `WAVE ${this.wave + 1} — ${this.enemies.map((e) => e.name).join(', ')}` });

    const next = new BattleSystem({
      clock: this.clock, timers: this.timers, bus: this.bus, rng: this.rng,
      party: this.party, enemies: this.enemies,
      queue: new TurnQueue(this.bus),
      reaction: new ReactionSystem(this.clock, this.bus),
      aim: this.aim,
      camera: this.camera
    });
    // Carry the gradient charge + items across waves.
    if (this.battle) { next.charge = this.battle.charge; next.items = this.battle.items; }
    this.reaction = next.reaction;
    this.battle = next;
    this._waveClearing = false;

    this.bus.emit(EV.WAVE_START, { wave: this.wave });
    this.battle.runBattle().then((result) => {
      if (this.battle !== next) return; // cancelled / superseded
      if (result === 'clear') this._onWaveClear(next);
      else if (result === 'defeat') this._showEnd(false);
    }).catch((err) => {
      console.error('[battle]', err);
    });
  }

  async _onWaveClear(battle) {
    if (this._waveClearing) return;
    this._waveClearing = true;
    const gained = this.enemies.reduce((s, e) => s + (e.chargeOnDeath || 12) * 5, 30);
    for (const p of this.party) {
      if (!p.alive) continue;
      const lv = p.addXp(gained);
      if (lv > 0) this.bus.emit(EV.LOG, { text: `${p.name} reaches level ${p.level}!` });
    }
    this.cameraDir.victory(this.party.filter((p) => p.alive));
    if (this.wave >= WAVES.length - 1) {
      this.timers.wait(1.2).then(() => this._showEnd(true));
      return;
    }
    this._flashWaveBanner(`WAVE ${this.wave + 1} CLEARED — +${gained} XP`);
    await this.timers.wait(2.2);
    if (this.battle !== battle || this.finished) return;
    this._disposeEnemies();
    this.wave += 1;
    this._startWave();
  }

  _flashWaveBanner(text) {
    const el = this.overlays.wave;
    if (!el) return;
    el.textContent = text;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2100);
  }

  _showEnd(victory) {
    if (this.finished) return;
    this.finished = true;
    if (victory) {
      this.bus.emit(EV.VICTORY, {});
      this.cameraDir.victory(this.party.filter((p) => p.alive));
      this.overlays.victory.classList.add('show');
    } else {
      this.overlays.defeat.classList.add('show');
    }
  }

  // Full restart with the SAME seed — the encounter replays identically.
  restart() {
    const keepSeed = this.seed;
    if (this.battle) { this.battle.cancel(); this.battle = null; }
    this.reaction && (this.reaction.active.length = 0);
    this.aim.cancel();
    this.timers.flush();
    this.clock.reset();
    this.bus.emit(EV.RESTART, {});
    this.prompts.combo = null;
    this.prompts.stamps.length = 0;
    this.overlays.victory.classList.remove('show');
    this.overlays.defeat.classList.remove('show');
    this._disposeEnemies();
    this._disposeParty();
    this.seed = keepSeed;
    this.finished = false;
    this._buildRun();
  }

  _disposeFighters(list) {
    for (const f of list) {
      if (f.group) this.stage.group.remove(f.group);
      if (f.auraRing && f.auraRing.parent) f.auraRing.parent.remove(f.auraRing);
    }
  }
  _disposeEnemies() { this._disposeFighters(this.enemies); this.enemies = []; }
  _disposeParty() { this._disposeFighters(this.party); this.party = []; }

  // ==========================================================================
  // Projection / picking helpers
  // ==========================================================================

  projectPoint(v) {
    _ndc.copy(v).project(this.camera);
    return {
      x: (_ndc.x * 0.5 + 0.5) * window.innerWidth,
      y: (-_ndc.y * 0.5 + 0.5) * window.innerHeight,
      ok: _ndc.z < 1
    };
  }

  _pickFighter(clientX, clientY) {
    const ndc = new THREE.Vector2(
      (clientX / window.innerWidth) * 2 - 1,
      -(clientY / window.innerHeight) * 2 + 1
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const groups = [...this.enemies, ...this.party].filter((f) => f.group).map((f) => f.group);
    const hits = this.raycaster.intersectObjects(groups, true);
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.fighter) o = o.parent;
      if (o && o.userData.fighter.alive) return o.userData.fighter;
    }
    return null;
  }

  _hoverTarget(x, y) {
    const f = this._pickFighter(x, y);
    for (const u of [...this.enemies, ...this.party]) u.isTargeted = (u === f);
    return f;
  }

  _targetList() {
    if (!this.battle) return [];
    // Mirror the battle system's awaiting list (team + heal-ness tracked via
    // the last ui:target payload).
    const opts = this._awaitedTargetOpts || { team: 'enemy' };
    return (opts.team === 'enemy' ? this.enemies : this.party).filter((u) => u.alive);
  }

  // ==========================================================================
  // Bus wiring
  // ==========================================================================

  _bindBus() {
    const b = this.bus, cam = this.cameraDir, r = this.renderer;
    b.on(EV.CAM_FOCUS, (p) => cam.focus(p.actor, p.subject));
    b.on(EV.CAM_SHAKE, (p) => cam.shake(p.amp || 0.3));
    b.on(EV.PERFECT, () => r.flashCold(1));
    b.on(EV.TELEGRAPH, (p) => cam.defend(p.defender, p.attacker));
    b.on(EV.LOG, (p) => { if (p && p.text) this.hud.addLog(p.text); });
    b.on(EV.BATTLE_START, () => cam.introSweep());
    b.on('battle:danger', (p) => {
      const intensity = clamp01(1 - p.intensity); // 1 = healthy/calm
      r.setIntensity(intensity);
      this.audio.setIntensity(intensity);
      if (this.post && this.post.setMood) this.post.setMood(intensity);
    });
    b.on('ui:target', (p) => {
      this._awaitedTargetOpts = { team: p.team, heal: p.heal };
      this._targetIndex = 0;
    });
    b.on(EV.GRADIENT_FIRE, () => { cam.punch(0.9); cam.shake(0.5); });

    b.on('sys:context-lost', () => this.overlays.context.classList.add('show'));
    b.on('sys:context-restored', () => this.overlays.context.classList.remove('show'));
  }

  _uiState() {
    if (this.finished) return 'end';
    if (!this.battle) return null;
    switch (this.battle.state) {
      case STATES.MENU: return 'menu';
      case STATES.TARGET: return 'target';
      case STATES.AIM: return 'aim';
      case STATES.REACTION: return 'reaction';
      case STATES.COUNTER: return 'reaction';
      default: return 'busy';
    }
  }

  // ==========================================================================
  // Input
  // ==========================================================================

  _bindInput() {
    window.addEventListener('keydown', (e) => this._onKeyDown(e));
    window.addEventListener('keyup', (e) => this._onKeyUp(e));
    window.addEventListener('pointermove', (e) => this._onPointerMove(e));
    window.addEventListener('pointerdown', (e) => { this.audio.ensureStarted(); this._onPointerDown(e); });
    window.addEventListener('pointerup', (e) => this._onPointerUp(e));
  }

  _onKeyDown(e) {
    this.audio.ensureStarted();
    const st = this._uiState();

    // Universal keys first.
    if (e.code === 'KeyM') { this.audio.toggleMute(); return; }
    if (this.finished && (e.code === 'KeyR' || e.code === 'Enter')) { this.restart(); return; }

    // Menu owns digits/G while the command menu is up.
    if (st === 'menu' && this.menu.key(e)) { e.preventDefault(); return; }

    // Reaction inputs: ONE pressed key per hit, judged at press time.
    if (st === 'reaction') {
      if (e.code === 'KeyA' || e.code === 'KeyJ') { this._press('parry'); e.preventDefault(); return; }
      if (e.code === 'Space') { this._press('dodge'); e.preventDefault(); return; }
    }

    if (st === 'aim') {
      const map = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
      if (map[e.code]) { this.aim.setKey(map[e.code], true); this._keysDown.add(map[e.code]); e.preventDefault(); return; }
      if (e.code === 'KeyF' && !e.repeat) { this.aim.beginCharge(); return; }
      if (e.code === 'Escape') { this.battle && this.battle.cancelAim(); return; }
      return;
    }

    if (st === 'target') {
      const list = this._targetList();
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        const dir = e.code === 'ArrowRight' ? 1 : -1;
        this._targetIndex = (this._targetIndex + dir + list.length) % Math.max(1, list.length);
        this._setTargetFromIndex(list);
        e.preventDefault();
        return;
      }
      if (e.code === 'Enter' || e.code === 'KeyF') {
        const t = list[this._targetIndex];
        if (t) this.battle.selectTarget(t);
        e.preventDefault();
      }
    }
  }

  _press(key) {
    for (const c of this.reaction.active) {
      if (this.reaction.press(c.group ? null : c.defender, key)) break;
    }
  }

  _onKeyUp(e) {
    if (this._uiState() !== 'aim') return;
    const map = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
    if (map[e.code]) { this.aim.setKey(map[e.code], false); this._keysDown.delete(map[e.code]); }
    if (e.code === 'KeyF' && this.aim.active && this.aim.charging) {
      this._finishAim();
    }
  }

  _setTargetFromIndex(list) {
    for (const u of [...this.enemies, ...this.party]) u.isTargeted = false;
    const t = list[this._targetIndex];
    if (t) t.isTargeted = true;
  }

  _onPointerMove(e) {
    const st = this._uiState();
    if (st === 'aim' && this.aim.active) this.aim.moveTo(e.clientX, e.clientY);
    else if (st === 'target') this._hoverTarget(e.clientX, e.clientY);
    else for (const u of [...this.enemies, ...this.party]) u.isTargeted = false;
  }

  _onPointerDown(e) {
    const st = this._uiState();
    if (st === 'aim' && this.aim.active) { this.aim.beginCharge(); return; }
    if (st === 'target' && this.battle) {
      const f = this._pickFighter(e.clientX, e.clientY);
      if (f) this.battle.selectTarget(f);
    }
  }

  _onPointerUp() {
    if (this._uiState() === 'aim' && this.aim.active && this.aim.charging) this._finishAim();
  }

  _finishAim() {
    const res = this.aim.resolve();
    this.aim.charging = false;
    if (res && this.battle) this.battle.finishAim(res);
  }

  // ==========================================================================
  // Frame loop
  // ==========================================================================

  _loop(now) {
    requestAnimationFrame(this._loop);
    const realDt = Math.min(0.1, (now - this._lastT) / 1000);
    this._lastT = now;
    const dt = this.clock.update(realDt);
    this.timers.update();

    // Aim reticle keyboard motion wants real-time responsiveness.
    this.aim.update(realDt);
    this.fx.update(dt || realDt * 0.2);
    this.stage.update(dt, this.clock.t);
    this.cameraDir.update(realDt, this.clock.t, this.renderer.contextLost);
    this.renderer.update(dt);
    this.hud.update(realDt);
    this.prompts.update(realDt);

    if (this.reaction) this.prompts.sync(this.reaction.active, this.clock.t, this.clock.scale);
    if (this.reaction && this.hud) this.hud.flow = this.reaction.streak;

    this._drawOverlay();

    if (!this.renderer.contextLost) this.renderer.render();
  }

  _drawOverlay() {
    const ctx = this.octx;
    const W = window.innerWidth, H = window.innerHeight;
    this.hud.draw();
    ctx.setTransform(this.hud.dpr, 0, 0, this.hud.dpr, 0, 0);
    if (this._uiState() === 'aim' && this.aim.active) this._drawAim(ctx);
    this.prompts.draw(ctx, W, H, (v) => this.projectPoint(v), this.clock.t, this.clock.scale);
  }

  _drawAim(ctx) {
    const a = this.aim;
    const R = 26 + 10 * (1 - a.charge);
    const col = a.hover ? (a.hover.weak ? '#f4d489' : '#8fbcb6') : 'rgba(232,226,210,0.85)';
    // Weak/body markers.
    for (const m of a.weakMarkers()) {
      ctx.save();
      ctx.strokeStyle = 'rgba(143,188,182,0.5)';
      ctx.setLineDash([5, 6]);
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(m.body.sx, m.body.sy, m.body.r, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      const pulse = 3 + 2.4 * Math.sin(this.clock.t * 7);
      const wr = Math.max(10, m.weak.r);
      ctx.strokeStyle = '#f4d489';
      ctx.beginPath(); ctx.arc(m.weak.sx, m.weak.sy, wr + pulse, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(244,212,137,0.9)';
      ctx.font = 'italic 10px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText(m.label, m.weak.sx, m.weak.sy - wr - 10);
      ctx.restore();
    }
    // Reticle.
    ctx.save();
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(a.x, a.y, R, 0, Math.PI * 2); ctx.stroke();
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      ctx.beginPath();
      ctx.moveTo(a.x + dx * (R - 8), a.y + dy * (R - 8));
      ctx.lineTo(a.x + dx * (R + 8), a.y + dy * (R + 8));
      ctx.stroke();
    }
    // Charge arc (power 0.6x..1.4x).
    if (a.charge > 0.01) {
      ctx.strokeStyle = '#f4d489';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(a.x, a.y, R + 7, -Math.PI / 2, -Math.PI / 2 + a.charge * Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(232,226,210,0.7)';
    ctx.font = 'italic 11px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('hold to charge — release to fire', a.x, a.y + R + 26);
    ctx.restore();
  }
}
