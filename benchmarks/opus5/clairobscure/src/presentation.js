/**
 * Presentation bridge.
 *
 * Everything the player sees and hears in response to a rule change happens
 * here. The battle systems emit facts; this module turns them into camera cuts,
 * animation clips, particles, screen effects, floating numbers and audio.
 *
 * Keeping it in one place means battle logic stays free of rendering, and the
 * feel of the game can be tuned without touching a single rule.
 */

import * as THREE from 'three';
import { EV } from './core/events.js';
import { STATE } from './battle/battle-system.js';
import { STATUS_DEFS } from './battle/action-resolver.js';
import { clamp01, lerp } from './core/easing.js';

const ELEMENT_COLOR = {
  physical: '#e8dcc0', fire: '#e2803a', ice: '#8fd4e8',
  lightning: '#f0d060', void: '#a988e0', light: '#fff0c8',
};

export class Presentation {
  constructor(game) {
    this.game = game;
    this.bus = game.bus;
    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
    this._c = new THREE.Vector3();
    this._wire();
  }

  _wire() {
    const on = (type, fn) => this.bus.on(type, fn.bind(this));
    on(EV.STATE_CHANGE, this._onState);
    on(EV.WAVE_START, this._onWaveStart);
    on(EV.ACTION_CHOSEN, this._onActionChosen);
    on(EV.ATTACK_SWING, this._onSwing);
    on(EV.DAMAGE_DEALT, this._onDamage);
    on(EV.HEAL_DEALT, this._onHeal);
    on(EV.STATUS_APPLIED, this._onStatus);
    on(EV.STATUS_TICK, this._onStatusTick);
    on(EV.BREAK_STAGGER, this._onBreak);
    on(EV.COMBATANT_DIED, this._onDeath);
    on(EV.TELEGRAPH_START, this._onTelegraph);
    on(EV.TELEGRAPH_TICK, this._onArmed);
    on(EV.PARRY_PERFECT, this._onParry);
    on(EV.DODGE_SUCCESS, this._onDodge);
    on(EV.HIT_LANDED, this._onHitLanded);
    on(EV.REACTION_WHIFF, this._onWhiff);
    on(EV.COMBO_COMPLETE, this._onComboComplete);
    on(EV.COUNTER_TRIGGERED, this._onCounter);
    on(EV.AIM_SHOT, this._onAimShot);
    on(EV.AP_CHANGED, this._onAp);
    on(EV.GRADIENT_CHANGED, this._onGradient);
    on(EV.VICTORY, this._onVictory);
    on(EV.DEFEAT, this._onDefeat);
  }

  // -------------------------------------------------------------------------
  // Flow
  // -------------------------------------------------------------------------

  _onState(e) {
    const g = this.game;
    const cam = g.cameraDirector;
    switch (e.to) {
      case STATE.INTRO:
        cam.set('intro', {}, { snap: true });
        g.screenFx.setLetterbox(0.55);
        g.menu.close();
        break;
      case STATE.TURN_START:
        g.screenFx.setLetterbox(0);
        break;
      case STATE.PLAYER_MENU:
        g.menu.openFor(e.actor, g.battle);
        g.menu.endTargeting();
        cam.set('actor', { actor: e.actor, focus: this._enemyCentroid() });
        for (const c of g.party) if (c.alive) c.play(c === e.actor ? 'guard' : 'idle');
        if (e.actor) e.actor.faceToward(6, e.actor.root.position.z);
        break;
      case STATE.PLAYER_TARGET:
        g.menu.beginTargeting(e.targets || []);
        break;
      case STATE.PLAYER_AIM:
        g.menu.close();
        g.targeting.enter(e.shooter, g.enemies, 1);
        cam.set('aim', { shooter: e.shooter, focus: this._enemyCentroid() });
        g.screenFx.setLetterbox(0.28);
        if (e.shooter) e.shooter.play('aim');
        g.audio.aimLock();
        break;
      case STATE.PLAYER_ACTION:
        g.menu.close();
        g.targeting.exit();
        g.screenFx.setLetterbox(0.18);
        break;
      case STATE.ENEMY_INTENT:
        g.menu.close();
        g.screenFx.setLetterbox(0.34);
        this._setReactionShot(e.actor, (e.targets && e.targets[0]) || g.party[0]);
        for (const c of g.party) if (c.alive) c.play('guard');
        if (e.actor) {
          e.actor.faceToward(
            (e.targets && e.targets[0]) ? e.targets[0].root.position.x : -6,
            (e.targets && e.targets[0]) ? e.targets[0].root.position.z : 0,
          );
        }
        g.hud.showToast(`${e.actor ? e.actor.name : 'Enemy'} — ${e.name || 'attacks'}`, 1.5);
        break;
      case STATE.COUNTER:
        g.screenFx.setLetterbox(0.42);
        break;
      case STATE.TURN_END:
        g.screenFx.setLetterbox(0.12);
        this._returnEveryone();
        break;
      case STATE.WAVE_CLEAR:
      case STATE.VICTORY:
        cam.set('victory', { centre: this._partyCentroid() });
        g.screenFx.setLetterbox(0.5);
        for (const c of g.party) if (c.alive) c.play('victory');
        break;
      case STATE.DEFEAT:
        cam.set('defeat', { centre: this._partyCentroid() });
        g.screenFx.setLetterbox(0.6);
        break;
      default:
        break;
    }
  }

  _onWaveStart(e) {
    const g = this.game;
    const wave = g.waveData[e.waveIndex];
    g.hud.showBanner(wave.banner, wave.subtitle, 3.0);
    const boss = e.enemies.find((x) => x.isBoss);
    if (boss) {
      g.cameraDirector.set('boss', { boss }, { snap: true });
      g.audio.setIntensity(0.8);
    }
  }

  _onActionChosen(e) {
    const g = this.game;
    const actor = e.actor;
    if (!actor) return;
    const targets = e.targets || [];
    const primary = targets[0];

    if (primary && primary !== actor) {
      actor.faceToward(primary.root.position.x, primary.root.position.z);
      const melee = actor.basic.anim === 'slash' || (e.action.skill && e.action.skill.anim === 'flurry');
      if (melee && primary.side === 'enemy') {
        this._a.copy(primary.root.position);
        this._b.copy(actor.root.position).sub(this._a).setY(0).normalize().multiplyScalar(2.4);
        this._a.add(this._b);
        this._a.y = 0;
        actor.moveTo(this._a, 0.36);
      }
    }
    if (e.ultimate) {
      g.audio.ultimate();
      g.screenFx.burstSpeedLines(1);
      g.screenFx.flash('#fff3d0', 0.55, 0.7);
      g.postfx.pulseBloom(1.5);
      g.hud.showBanner('REQUIEM OF THE GILDED DAWN', '', 2.4);
      g.hitStop(0.25, 0.5);
      actor.play('ultimate', { restart: true });
    }
    if (primary) {
      g.cameraDirector.set('strike', { attacker: actor, target: primary.side === 'enemy' ? primary : actor });
    }
  }

  _onSwing(e) {
    const g = this.game;
    const actor = e.actor;
    if (!actor || !actor.alive) return;
    actor.play(e.anim, { restart: true, fade: 0.07 });
    g.audio.swing(e.anim === 'flurry' ? 0.7 : 1);
    if (e.anim === 'shot' || e.anim === 'aim') return;
    actor.weaponTip(this._a);
    g.particles.burst(this._a, {
      count: 8, color: ELEMENT_COLOR[actor.element] || '#f0d060',
      speed: 3, life: 0.3, gravity: 3, field: 'paint',
    });
  }

  // -------------------------------------------------------------------------
  // Damage / healing
  // -------------------------------------------------------------------------

  _onDamage(e) {
    const g = this.game;
    const { target, attacker, amount, crit, eff, element, counter, weakPoint, immune } = e;
    if (!target) return;
    const color = ELEMENT_COLOR[element] || '#e8dcc0';
    const at = target.anchor(this._a).clone();

    let kind = 'damage';
    if (immune) kind = 'resist';
    else if (counter) kind = 'counter';
    else if (crit) kind = 'crit';
    else if (eff > 1.2) kind = 'weak';
    else if (eff < 0.9) kind = 'resist';

    let label = String(amount);
    if (immune) label = 'IMMUNE';
    else if (weakPoint) label = `${amount}  WEAK POINT`;
    else if (eff > 1.2) label = `${amount}  ▲`;
    else if (eff < 0.9) label = `${amount}  ▼`;
    g.numbers.spawn(at, label, kind, { pop: crit || counter });

    if (!immune) {
      target.hitFlash(crit ? '#ffd772' : color, crit ? 1.3 : 0.9);
      target.flinch();
      g.particles.burst(at, {
        count: crit ? 34 : 20, color, speed: crit ? 8 : 5.5,
        life: 0.55, gravity: 8, field: 'paint',
      });
      g.particles.burst(at, { count: 12, color: '#fff0c8', speed: 7, life: 0.35, gravity: 5 });
      g.particles.flash(at, color, crit ? 3.4 : 2.1, 0.28);
      if (crit || counter) g.particles.star(at, '#ffd772', 4.2, 0.5);
    }

    const power = clamp01(amount / Math.max(60, target.maxHp * 0.22));
    g.cameraDirector.shake(0.07 + power * 0.16 + (crit ? 0.12 : 0));
    g.hitStop(crit ? 0.28 : 0.55, crit ? 0.09 : 0.045);
    g.audio.hit(element, 0.7 + power * 0.5);
    if (crit) g.audio.crit();
    if (eff > 1.2) g.audio.weakness();
    if (weakPoint) g.postfx.pulseBloom(0.7);

    if (target.side === 'party') {
      g.screenFx.hurt(0.4 + power * 0.6);
      g.screenFx.flash('#a01a10', 0.18, 0.24);
    } else {
      g.postfx.pulseBloom(0.25 + power * 0.4);
    }
    if (attacker && attacker.side === 'party' && !counter) g.hud.pulseAp(attacker);
  }

  _onHeal(e) {
    const g = this.game;
    const at = e.target.anchor(this._a).clone();
    g.numbers.spawn(at, `+${e.amount}`, 'heal');
    g.particles.aura(at, '#a8e07a', e.revived ? 40 : 18, 0.9);
    g.particles.flash(at, '#a8e07a', 1.8, 0.35);
    e.target.hitFlash('#a8e07a', 0.5);
    if (e.source !== 'lumina') g.audio.heal();
    if (e.revived) {
      e.target.dissolving = false;
      e.target.dissolve = 0;
      e.target.play('idle', { restart: true });
      g.hud.showToast(`${e.target.name} returns to the expedition`, 2.2);
    }
  }

  _onStatus(e) {
    const g = this.game;
    const def = STATUS_DEFS[e.id];
    const at = e.target.anchor(this._a).clone();
    if (e.id === 'cleanse') {
      g.numbers.spawn(at, 'CLEANSED', 'ap');
      g.particles.aura(at, '#fff0c8', 22, 1);
      g.audio.buff();
      return;
    }
    if (!def) return;
    if (e.resisted) {
      g.numbers.spawn(at, `${def.name} RESISTED`, 'resist');
      return;
    }
    g.numbers.spawn(at, `${def.glyph} ${def.name}`, 'status');
    g.particles.aura(at, def.color, 14, 0.8);
    if (def.kind === 'buff' || def.kind === 'heal') g.audio.buff();
    else g.audio.debuff();
  }

  _onStatusTick(e) {
    const g = this.game;
    const at = e.target.anchor(this._a).clone();
    if (e.type === 'dot') {
      g.numbers.spawn(at, String(e.amount), 'damage');
      e.target.hitFlash(e.color || '#e2803a', 0.6);
      g.particles.burst(at, { count: 10, color: e.color || '#e2803a', speed: 3, life: 0.4, field: 'paint' });
    } else if (e.type === 'regen') {
      g.numbers.spawn(at, `+${e.amount}`, 'heal');
      g.particles.aura(at, e.color || '#a8e07a', 10, 0.7);
    } else if (e.type === 'stunned') {
      g.numbers.spawn(at, 'STUNNED', 'miss');
    }
  }

  _onBreak(e) {
    const g = this.game;
    const at = e.target.anchor(this._a).clone();
    if (e.phase === 'break') {
      g.numbers.spawn(at, 'BREAK!', 'break', { pop: true });
      g.particles.ring(at, { count: 46, color: '#ffb04a', speed: 9, life: 0.7 });
      g.particles.shockwave(e.target.root.position, '#ffb04a', 7, 0.7);
      g.particles.star(at, '#ffd772', 6, 0.6);
      g.cameraDirector.shake(0.4);
      g.screenFx.flash('#ffca70', 0.3, 0.4);
      g.postfx.pulseBloom(1.2);
      g.audio.stagger();
      g.hitStop(0.2, 0.22);
      g.hud.showToast(`${e.target.name} is BROKEN — take the opening`, 2.4);
    } else if (e.phase === 'phase2') {
      g.hud.showBanner(e.info.announce || 'THE FOE CHANGES', '', 2.6);
      e.target.play('roar', { restart: true });
      g.particles.ring(at, { count: 60, color: '#ffd772', speed: 11, life: 0.9 });
      g.cameraDirector.set('boss', { boss: e.target });
      g.cameraDirector.shake(0.55);
      g.screenFx.flash('#ffe3a0', 0.4, 0.6);
      g.postfx.pulseBloom(1.6);
      g.audio.ultimate();
      g.audio.setIntensity(1);
    }
  }

  _onDeath(e) {
    const g = this.game;
    g.particles.dissolve(e.target, e.target.tint || '#d9b262');
    g.particles.shockwave(e.target.root.position, e.target.tint || '#d9b262', 5, 0.8);
    g.audio.death();
    g.cameraDirector.shake(0.26);
    if (e.target.side === 'party') {
      g.screenFx.flash('#601008', 0.3, 0.5);
      g.hud.showToast(`${e.target.name} has fallen`, 2.4);
    } else {
      g.postfx.pulseBloom(0.8);
    }
    g.targeting.invalidateCache();
  }

  // -------------------------------------------------------------------------
  // Reactive defence
  // -------------------------------------------------------------------------

  _onTelegraph(e) {
    const g = this.game;
    const hit = e.hit;
    g.audio.telegraph(hit.windup, hit.kind === 'grab' ? 'grab' : 'parry');
    this._setReactionShot(e.attacker, hit.target);
    if (hit.kind === 'grab') g.screenFx.flash('#7a1408', 0.16, 0.3);
    if (hit.target) hit.target.play('guard');
  }

  _onArmed(e) {
    const g = this.game;
    if (e.phase !== 'armed') return;
    const d = e.defender;
    if (d) {
      d.play(e.type === 'parry' ? 'parry' : 'dodge', { restart: true, fade: 0.05 });
      d.hitFlash(e.type === 'parry' ? '#bff2ff' : '#9ee8b0', 0.5);
    }
    g.audio.aimLock();
  }

  _onParry(e) {
    const g = this.game;
    const d = e.defender;
    const at = d.anchor(this._a).clone();
    at.y += 0.2;

    g.hitStop(0.22, 0.16);
    g.cameraDirector.shake(0.22);
    g.screenFx.drain(1);
    g.screenFx.flash('#dff4ff', 0.4, 0.3);
    g.renderCore.flash(0x9fd8ff, 1.1);
    g.postfx.pulseBloom(1.1);

    g.particles.ring(at, { count: 42, color: '#bff2ff', speed: 9, life: 0.55, axis: 'z' });
    g.particles.star(at, '#ffffff', 4.6, 0.42);
    g.particles.flash(at, '#bff2ff', 3.2, 0.3);
    g.particles.burst(at, { count: 22, color: '#f5dda2', speed: 7, life: 0.45, gravity: 6 });

    g.audio.parry();
    g.prompts.flash('parry', e.flow > 1 ? `FLOW ×${e.flow}` : '');
    g.numbers.spawn(at, 'PARRY', 'parry', { pop: true });
    g.hud.pulseAp(d);
    d.play('parry', { restart: true, fade: 0.04 });
  }

  _onDodge(e) {
    const g = this.game;
    const d = e.defender;
    const at = d.anchor(this._a).clone();
    g.particles.burst(at, {
      count: 20, color: '#9ee8b0', speed: 5, life: 0.5, gravity: 2, field: 'paint',
    });
    g.particles.shockwave(d.root.position, '#9ee8b0', 3.2, 0.45);
    g.audio.dodge();
    g.prompts.flash('dodge');
    g.numbers.spawn(at, 'DODGE', 'dodge');
    g.cameraDirector.shake(0.08);
    d.play('dodge', { restart: true, fade: 0.04 });
  }

  _onHitLanded(e) {
    const g = this.game;
    g.prompts.flash('hit');
    g.cameraDirector.shake(0.2);
    if (e.defender) {
      this._a.copy(e.defender.root.position);
      g.particles.shockwave(this._a, '#c9583f', 3.4, 0.5);
    }
  }

  _onWhiff(e) {
    const g = this.game;
    g.audio.whiff();
    g.prompts.flash(e.reason === 'unblockable' ? 'unblockable' : 'miss');
    if (e.reason === 'unblockable') g.screenFx.flash('#a01a10', 0.2, 0.3);
  }

  _onComboComplete(e) {
    const g = this.game;
    if (e.clean && e.total > 1) {
      g.hud.showToast(`FLAWLESS — ${e.total} PARRIES`, 2.2);
      g.postfx.pulseBloom(1.0);
      g.screenFx.burstSpeedLines(0.8);
    }
    g.audio.cancelTelegraph();
    g.telegraphFx.clear();
  }

  _onCounter(e) {
    const g = this.game;
    const d = e.defender;
    const t = e.target;
    if (!d || !t) return;

    this._a.copy(t.root.position);
    this._b.copy(d.root.position).sub(this._a).setY(0).normalize().multiplyScalar(2.2);
    this._a.add(this._b);
    this._a.y = 0;
    d.moveTo(this._a, 0.18);
    d.faceToward(t.root.position.x, t.root.position.z);
    d.play('counter', { restart: true, fade: 0.04 });

    g.cameraDirector.set('strike', { attacker: d, target: t }, { speed: 11 });
    g.screenFx.burstSpeedLines(0.9);
    g.screenFx.flash('#ffe3a0', 0.28, 0.3);
    g.postfx.pulseBloom(0.9);
    g.audio.counter();
    g.prompts.flash('counter', e.clean ? 'FLAWLESS RIPOSTE' : '');
    d.weaponTip(this._c);
    g.particles.streak(this._c, t.anchor(this._b), '#ffd772', 22);
    g.hitStop(0.3, 0.12);
  }

  _onAimShot(e) {
    const g = this.game;
    const shooter = e.actor;
    shooter.play('shot', { restart: true, fade: 0.05 });
    shooter.weaponTip(this._a);
    g.audio.shot();
    g.particles.burst(this._a, { count: 16, color: '#ffd08a', speed: 6, life: 0.28, gravity: 2 });
    g.particles.flash(this._a, '#ffe3a0', 1.4, 0.16);
    g.cameraDirector.shake(0.12);
    if (e.result.hit && e.result.point) {
      g.particles.streak(this._a, e.result.point, '#ffd772', 26);
      if (e.result.weakPoint) {
        g.particles.star(e.result.point, '#ffffff', 4, 0.5);
        g.screenFx.flash('#ffefc0', 0.25, 0.3);
      }
    }
  }

  _onAp(e) {
    if (e.delta > 0 && e.actor) this.game.hud.pulseAp(e.actor);
  }

  _onGradient(e) {
    const g = this.game;
    if (e.value >= 100 && !this._gradientAnnounced) {
      this._gradientAnnounced = true;
      g.hud.showToast('GRADIENT FULL — OVERTURE AVAILABLE [U]', 2.6);
      g.audio.levelUp();
      g.postfx.pulseBloom(1.0);
    }
    if (e.value < 100) this._gradientAnnounced = false;
  }

  _onVictory() {
    this.game.audio.victory();
  }

  _onDefeat() {
    this.game.audio.defeat();
  }

  // -------------------------------------------------------------------------
  // Per-frame
  // -------------------------------------------------------------------------

  update(dt, elapsed) {
    const g = this.game;
    const battle = g.battle;

    // Drive the acting enemy's swing straight from reaction timing.
    if (battle.state === STATE.ENEMY_ATTACK) {
      const swing = battle.reaction.attackerSwing();
      const attacker = battle.actor;
      if (attacker && attacker.driveAttack) attacker.driveAttack(swing);
      g.telegraphFx.sync(battle.reaction.liveTelegraphs());
    } else {
      for (const e of g.enemies) if (e.driveAttack) e.driveAttack(null);
      g.telegraphFx.sync([]);
    }

    // Mood: warm and bright when healthy, cold and dim when the party is dying.
    const health = g.party.length
      ? g.party.reduce((a, c) => a + (c.alive ? c.hpFrac : 0), 0) / g.party.length
      : 1;
    g.renderCore.setMood(lerp(0.15, 0.85, health));
    g.audio.setIntensity(clamp01(battle.intensity));
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  _setReactionShot(attacker, defender) {
    if (!attacker || !defender) return;
    this.game.cameraDirector.set('reaction', { attacker, defender });
  }

  _enemyCentroid() {
    const list = this.game.enemies.filter((e) => e.alive);
    if (list.length === 0) return new THREE.Vector3(6, 1.2, 0);
    const v = new THREE.Vector3();
    for (const e of list) v.add(e.root.position);
    return v.multiplyScalar(1 / list.length).setY(1.2);
  }

  _partyCentroid() {
    const list = this.game.party.filter((c) => c.alive);
    const src = list.length ? list : this.game.party;
    const v = new THREE.Vector3();
    for (const c of src) v.add(c.root.position);
    return v.multiplyScalar(1 / Math.max(1, src.length)).setY(1);
  }

  _returnEveryone() {
    for (const c of [...this.game.party, ...this.game.enemies]) {
      if (!c.alive) continue;
      if (c.root.position.distanceToSquared(c.home) > 0.001) c.moveTo(null, 0.45);
      c.faceHome(c.side === 'party' ? Math.PI / 2 : -Math.PI / 2);
      if (c.currentAnim !== 'idle' && c.animator && !c.animator.pinned) {
        c.play(c.side === 'party' ? 'idle' : 'idle', { fade: 0.25 });
      }
    }
  }
}
