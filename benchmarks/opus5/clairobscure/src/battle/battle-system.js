/**
 * The combat state machine and rules engine.
 *
 * States and legal transitions:
 *
 *   INTRO ──▶ TURN_START
 *   TURN_START ──▶ PLAYER_MENU        (party member, awake)
 *              ──▶ ENEMY_INTENT       (enemy, awake)
 *              ──▶ TURN_END           (stunned / staggered / dead)
 *   PLAYER_MENU ──▶ PLAYER_TARGET | PLAYER_AIM | PLAYER_ACTION
 *   PLAYER_TARGET ──▶ PLAYER_ACTION | PLAYER_MENU (cancel)
 *   PLAYER_AIM ──▶ PLAYER_ACTION | PLAYER_MENU (cancel)
 *   PLAYER_ACTION ──▶ TURN_END
 *   ENEMY_INTENT ──▶ ENEMY_ATTACK
 *   ENEMY_ATTACK ──▶ COUNTER (parries banked) | TURN_END
 *   COUNTER ──▶ TURN_END
 *   TURN_END ──▶ WAVE_CLEAR | DEFEAT | TURN_START
 *   WAVE_CLEAR ──▶ INTRO (next wave) | VICTORY
 *
 * This file owns transitions and rules only. It never touches THREE, the DOM or
 * audio — presentation subscribes to the event bus.
 */

import { EV } from '../core/events.js';
import { TurnQueue } from './turn-queue.js';
import { ReactionSystem } from './reaction-system.js';
import { EnemyAI } from './enemy-ai.js';
import {
  ECONOMY, computeDamage, applyDamage, applyHeal, addStatus, tickStatuses,
  addAP, spendAP, addBreak, decayBreak, isStunned, clearDebuffs, revive, healPower,
} from './action-resolver.js';
import { buildPlan, ULTIMATE, ITEMS } from '../entities/skill.js';
import { clamp01 } from '../core/easing.js';

export const STATE = {
  IDLE: 'idle',
  INTRO: 'intro',
  TURN_START: 'turn-start',
  PLAYER_MENU: 'player-menu',
  PLAYER_TARGET: 'player-target',
  PLAYER_AIM: 'player-aim',
  PLAYER_ACTION: 'player-action',
  ENEMY_INTENT: 'enemy-intent',
  ENEMY_ATTACK: 'enemy-attack',
  COUNTER: 'counter',
  TURN_END: 'turn-end',
  WAVE_CLEAR: 'wave-clear',
  VICTORY: 'victory',
  DEFEAT: 'defeat',
};

const INTRO_TIME = 3.2;
const INTENT_TIME = 0.95;
const TURN_END_TIME = 0.42;
const COUNTER_STEP = 0.72;

export class BattleSystem {
  constructor(bus, rng, opts = {}) {
    this.bus = bus;
    this.rng = rng;
    this.luminas = opts.luminas || {};
    this.queue = new TurnQueue(rng);
    this.reaction = new ReactionSystem(bus, opts.difficulty || 'expedition');
    this.ai = new EnemyAI(rng);

    this.party = [];
    this.enemies = [];
    this.state = STATE.IDLE;
    this.stateTime = 0;
    this.actor = null;
    this.plan = null;
    this.pendingAction = null;
    this.counterQueue = [];
    this.counterTimer = 0;
    this.gradient = 0;
    this.waveIndex = 0;
    this.waveCount = 1;
    this.totalXp = 0;
    this.stats = { parries: 0, dodges: 0, hitsTaken: 0, bestFlow: 0, weakPoints: 0, crits: 0 };
    this.items = {};
    for (const id in ITEMS) this.items[id] = ITEMS[id].uses;

    this.reaction.retarget = (hit) => this.party.find((p) => p.alive) || null;
    this._wire();
  }

  _wire() {
    this.bus.on(EV.HIT_LANDED, (e) => this._onHitLanded(e));
    this.bus.on(EV.PARRY_PERFECT, (e) => this._onParry(e));
    this.bus.on(EV.DODGE_SUCCESS, (e) => this._onDodge(e));
    this.bus.on(EV.COMBO_COMPLETE, (e) => this._onComboComplete(e));
  }

  // -------------------------------------------------------------------------
  // Setup
  // -------------------------------------------------------------------------

  setParty(party) {
    this.party = party;
  }

  beginWave(enemies, waveIndex, waveCount) {
    this.enemies = enemies;
    this.waveIndex = waveIndex;
    this.waveCount = waveCount;
    this.ai.reset();
    this.queue.reset([...this.party, ...this.enemies]);
    this.counterQueue = [];
    this.plan = null;
    this.actor = null;
    this._setState(STATE.INTRO);
    this.bus.emit(EV.WAVE_START, { waveIndex, waveCount, enemies });
  }

  get combatants() {
    return [...this.party, ...this.enemies];
  }

  get livingParty() {
    return this.party.filter((p) => p.alive);
  }

  get livingEnemies() {
    return this.enemies.filter((e) => e.alive);
  }

  get ultimateReady() {
    return this.gradient >= ECONOMY.GRADIENT_MAX;
  }

  /** 0..1 — drives music layers, light temperature and stage intensity. */
  get intensity() {
    const hp = this.livingParty.reduce((a, c) => a + c.hpFrac, 0) / Math.max(1, this.party.length);
    const wave = this.waveIndex / Math.max(1, this.waveCount - 1 || 1);
    return clamp01(0.25 + (1 - hp) * 0.55 + wave * 0.25);
  }

  // -------------------------------------------------------------------------
  // State machine
  // -------------------------------------------------------------------------

  _setState(next, payload = {}) {
    const from = this.state;
    this.state = next;
    this.stateTime = 0;
    this.bus.emit(EV.STATE_CHANGE, { from, to: next, actor: this.actor, ...payload });
  }

  update(dt, rawDt) {
    this.stateTime += dt;
    switch (this.state) {
      case STATE.INTRO:
        if (this.stateTime >= INTRO_TIME) this._beginTurn();
        break;
      case STATE.PLAYER_ACTION:
        this._updatePlan(dt);
        break;
      case STATE.ENEMY_INTENT:
        if (this.stateTime >= INTENT_TIME) this._launchEnemyAttack();
        break;
      case STATE.ENEMY_ATTACK:
        this.reaction.update(rawDt);
        break;
      case STATE.COUNTER:
        this._updateCounters(dt);
        break;
      case STATE.TURN_END:
        if (this.stateTime >= TURN_END_TIME) this._afterTurn();
        break;
      default:
        break;
    }
  }

  // -------------------------------------------------------------------------
  // Turn lifecycle
  // -------------------------------------------------------------------------

  _beginTurn() {
    for (const e of this.enemies) decayBreak(e, 5);

    let actor = null;
    let guard = 0;
    while (guard++ < 40) {
      actor = this.queue.next();
      if (!actor) break;
      if (actor.alive) break;
    }
    if (!actor) { this._setState(STATE.TURN_END); return; }

    this.actor = actor;
    this._setState(STATE.TURN_START, { actor });
    this.bus.emit(EV.TURN_START, { actor, turn: this.queue.turnNumber });

    const ticks = tickStatuses(actor);
    for (const t of ticks) this.bus.emit(EV.STATUS_TICK, { target: actor, ...t });
    if (!actor.alive) { this._kill(actor, null); this._setState(STATE.TURN_END); return; }

    if (actor.side === 'party') {
      addAP(actor, ECONOMY.AP_TURN_TICK);
      if (this.luminas.turnRegen > 0) {
        const res = applyHeal(actor, Math.round(actor.maxHp * this.luminas.turnRegen));
        if (res.healed > 0) this.bus.emit(EV.HEAL_DEALT, { target: actor, amount: res.healed, source: 'lumina' });
      }
    }

    if (actor.staggered) {
      actor.staggerTurns--;
      if (actor.staggerTurns <= 0) {
        actor.staggered = false;
        if (actor.setStaggered) actor.setStaggered(false);
      }
      this.bus.emit(EV.BREAK_STAGGER, { target: actor, phase: 'recover' });
      this._setState(STATE.TURN_END);
      return;
    }

    if (isStunned(actor)) {
      this.bus.emit(EV.STATUS_TICK, { target: actor, type: 'stunned', id: 'stun', amount: 0 });
      this._setState(STATE.TURN_END);
      return;
    }

    if (actor.side === 'party') this._setState(STATE.PLAYER_MENU, { actor });
    else this._beginEnemyTurn(actor);
  }

  _afterTurn() {
    if (this.livingParty.length === 0) {
      this._setState(STATE.DEFEAT);
      this.bus.emit(EV.DEFEAT, { wave: this.waveIndex });
      return;
    }
    if (this.livingEnemies.length === 0) {
      if (this.waveIndex >= this.waveCount - 1) {
        this._setState(STATE.VICTORY);
        this.bus.emit(EV.VICTORY, { xp: this.totalXp, stats: this.stats });
      } else {
        this._setState(STATE.WAVE_CLEAR);
        this.bus.emit(EV.WAVE_CLEAR, { waveIndex: this.waveIndex, xp: this.totalXp, stats: this.stats });
      }
      return;
    }
    this._beginTurn();
  }

  endTurn() {
    this.actor = null;
    this.plan = null;
    this._setState(STATE.TURN_END);
  }

  // -------------------------------------------------------------------------
  // Player actions
  // -------------------------------------------------------------------------

  /**
   * @param {{type:string, skill?:object, item?:object}} action
   * @returns {'need-target'|'started'|'rejected'|'aim'}
   */
  chooseAction(action) {
    if (this.state !== STATE.PLAYER_MENU) return 'rejected';
    const actor = this.actor;
    if (!actor) return 'rejected';

    if (action.type === 'attack') {
      this.pendingAction = action;
      this._setState(STATE.PLAYER_TARGET, { targets: this.livingEnemies });
      return 'need-target';
    }
    if (action.type === 'guard') {
      addStatus(actor, 'guard', { turns: 2 });
      addAP(actor, 2);
      this.bus.emit(EV.STATUS_APPLIED, { target: actor, id: 'guard', turns: 2 });
      this.bus.emit(EV.ACTION_CHOSEN, { actor, action, targets: [actor] });
      this._startPlan(actor, { steps: [], duration: 0.8, anim: 'cast' }, action);
      return 'started';
    }
    if (action.type === 'aim') {
      this.pendingAction = action;
      this._setState(STATE.PLAYER_AIM, { shooter: actor });
      return 'aim';
    }
    if (action.type === 'ultimate') {
      if (!this.ultimateReady) return 'rejected';
      this.gradient = 0;
      this.bus.emit(EV.GRADIENT_CHANGED, { value: 0 });
      const targets = this.livingEnemies;
      this.bus.emit(EV.ACTION_CHOSEN, { actor, action, targets, ultimate: true });
      const plan = buildPlan(ULTIMATE, actor, targets);
      // The ultimate also mends the party once the passes land.
      for (const ally of this.livingParty) {
        plan.steps.push({ kind: 'heal', target: ally, power: ULTIMATE.healPower, delay: plan.duration - 0.35 });
        plan.steps.push({ kind: 'cleanse', target: ally, delay: plan.duration - 0.3 });
      }
      this._startPlan(actor, plan, action);
      return 'started';
    }
    if (action.type === 'skill') {
      const skill = action.skill;
      if (!skill || actor.ap < skill.cost) return 'rejected';
      this.pendingAction = action;
      const auto = this._autoTargets(skill, actor);
      if (auto) {
        this._commitSkill(skill, auto);
        return 'started';
      }
      this._setState(STATE.PLAYER_TARGET, { targets: this._legalTargets(skill.targeting) });
      return 'need-target';
    }
    if (action.type === 'item') {
      const item = action.item;
      if (!item || this.items[item.id] <= 0) return 'rejected';
      this.pendingAction = action;
      const legal = this._legalTargets(item.targeting);
      if (legal.length === 0) return 'rejected';
      this._setState(STATE.PLAYER_TARGET, { targets: legal });
      return 'need-target';
    }
    return 'rejected';
  }

  _legalTargets(targeting) {
    switch (targeting) {
      case 'enemy': return this.livingEnemies;
      case 'all-enemies': return this.livingEnemies;
      case 'ally': return this.livingParty;
      case 'all-allies': return this.livingParty;
      case 'dead-ally': return this.party.filter((p) => !p.alive);
      case 'self': return [this.actor];
      default: return this.livingEnemies;
    }
  }

  /** Skills that need no cursor (self / whole-side) resolve immediately. */
  _autoTargets(skill, actor) {
    if (skill.targeting === 'self') return [actor];
    if (skill.targeting === 'all-enemies') return this.livingEnemies;
    if (skill.targeting === 'all-allies') return this.livingParty;
    return null;
  }

  chooseTarget(target) {
    if (this.state !== STATE.PLAYER_TARGET || !this.pendingAction) return false;
    const action = this.pendingAction;
    const actor = this.actor;

    if (action.type === 'attack') {
      const basic = actor.basic;
      const skillLike = {
        name: basic.name, element: basic.element, anim: basic.anim,
        hits: basic.hits || 1, power: basic.power, breakPower: basic.breakPower,
        critBonus: basic.critBonus || 0, targeting: 'enemy',
      };
      this.bus.emit(EV.ACTION_CHOSEN, { actor, action, targets: [target], name: basic.name });
      const plan = buildPlan(skillLike, actor, [target]);
      this._startPlan(actor, plan, action);
      return true;
    }
    if (action.type === 'skill') {
      this._commitSkill(action.skill, [target]);
      return true;
    }
    if (action.type === 'item') {
      const item = action.item;
      this.items[item.id]--;
      this.bus.emit(EV.ACTION_CHOSEN, { actor, action, targets: [target], name: item.name });
      const plan = buildPlan({ ...item, anim: 'item', hits: 0 }, actor, [target]);
      this._startPlan(actor, plan, action);
      return true;
    }
    return false;
  }

  _commitSkill(skill, targets) {
    const actor = this.actor;
    if (!spendAP(actor, skill.cost)) return;
    this.bus.emit(EV.AP_CHANGED, { actor, delta: -skill.cost });
    this.bus.emit(EV.ACTION_CHOSEN, { actor, action: { type: 'skill', skill }, targets, name: skill.name });
    this._startPlan(actor, buildPlan(skill, actor, targets), { type: 'skill', skill });
  }

  cancel() {
    if (this.state === STATE.PLAYER_TARGET || this.state === STATE.PLAYER_AIM) {
      this.pendingAction = null;
      this._setState(STATE.PLAYER_MENU, { actor: this.actor });
      this.bus.emit(EV.MENU_CANCEL, {});
      return true;
    }
    return false;
  }

  /**
   * Resolve a free-aim shot.
   * @param {{hit:boolean, enemy:object, weakPoint:object|null, point:object}} result
   */
  resolveAimShot(result) {
    if (this.state !== STATE.PLAYER_AIM) return;
    const actor = this.actor;
    const shot = actor.aimShot;
    this.bus.emit(EV.AIM_SHOT, { actor, result });

    if (result.hit && result.enemy) {
      const mult = result.weakPoint
        ? result.weakPoint.multiplier * (this.luminas.weakPointMul || 1)
        : 0.8;
      const move = {
        power: shot.power, element: shot.element,
        breakPower: shot.breakPower * (result.weakPoint ? 2.2 : 1),
        critBonus: result.weakPoint ? 0.3 : 0,
      };
      const dmg = computeDamage(actor, result.enemy, move, this.rng, { multiplier: mult });
      this._landDamage(actor, result.enemy, dmg, { source: 'aim', weakPoint: !!result.weakPoint, point: result.point });
      addAP(actor, result.weakPoint ? ECONOMY.AP_WEAKPOINT : ECONOMY.AP_BODYSHOT);
      this._addGradient(result.weakPoint ? ECONOMY.GRADIENT_WEAKPOINT : 2);
      if (result.weakPoint) this.stats.weakPoints++;
    }

    this._startPlan(actor, { steps: [], duration: 0.85, anim: 'shot' }, { type: 'aim' });
  }

  // -------------------------------------------------------------------------
  // Plan execution
  // -------------------------------------------------------------------------

  _startPlan(actor, plan, action) {
    this.pendingAction = null;
    plan.steps.sort((a, b) => a.delay - b.delay);
    this.plan = { ...plan, index: 0, t: 0, actor, action };
    this._setState(STATE.PLAYER_ACTION, { actor, anim: plan.anim, action });
  }

  _updatePlan(dt) {
    const plan = this.plan;
    if (!plan) { this.endTurn(); return; }
    plan.t += dt;
    while (plan.index < plan.steps.length && plan.steps[plan.index].delay <= plan.t) {
      this._execStep(plan.steps[plan.index], plan.actor, plan);
      plan.index++;
    }
    if (plan.t >= plan.duration && plan.index >= plan.steps.length) {
      if (plan.action && plan.action.type === 'attack') {
        addAP(plan.actor, ECONOMY.AP_BASIC_ATTACK);
        this.bus.emit(EV.AP_CHANGED, { actor: plan.actor, delta: ECONOMY.AP_BASIC_ATTACK });
      }
      this.endTurn();
    }
  }

  _execStep(step, actor, plan) {
    if (step.kind === 'swing') {
      this.bus.emit(EV.ATTACK_SWING, {
        actor, anim: step.anim, hitIndex: step.hitIndex, hitCount: step.hitCount,
        target: step.target,
      });
      return;
    }
    const target = step.target;
    if (!target) return;

    switch (step.kind) {
      case 'hit': {
        if (!target.alive) return;
        const dmg = computeDamage(actor, target, step.move, this.rng);
        this._landDamage(actor, target, dmg, {
          source: 'skill', hitIndex: step.hitIndex, hitCount: step.hitCount,
          anim: step.anim, last: step.last,
        });
        if (this.luminas.burnChance > 0 && this.rng.chance(this.luminas.burnChance)) {
          if (addStatus(target, 'burn', { turns: 2 })) {
            this.bus.emit(EV.STATUS_APPLIED, { target, id: 'burn', turns: 2, source: 'lumina' });
          }
        }
        break;
      }
      case 'heal': {
        if (!target.alive) return;
        const amount = step.flat || healPower(actor, { power: step.power });
        const res = applyHeal(target, amount);
        if (res.healed > 0) this.bus.emit(EV.HEAL_DEALT, { target, amount: res.healed, source: 'skill' });
        break;
      }
      case 'status': {
        if (!target.alive) return;
        if (!this.rng.chance(step.chance)) {
          this.bus.emit(EV.STATUS_APPLIED, { target, id: step.id, resisted: true });
          return;
        }
        const inst = addStatus(target, step.id, {
          turns: step.turns, power: step.power, shield: step.shield, source: actor,
        });
        if (inst) this.bus.emit(EV.STATUS_APPLIED, { target, id: step.id, turns: step.turns });
        break;
      }
      case 'cleanse': {
        const removed = clearDebuffs(target);
        if (removed.length) this.bus.emit(EV.STATUS_APPLIED, { target, id: 'cleanse', removed });
        break;
      }
      case 'revive': {
        const res = revive(target, step.fraction);
        if (res.revived) this.bus.emit(EV.HEAL_DEALT, { target, amount: res.healed, source: 'revive', revived: true });
        break;
      }
      case 'ap': {
        const gained = addAP(target, step.amount);
        if (gained) this.bus.emit(EV.AP_CHANGED, { actor: target, delta: gained });
        break;
      }
      default:
        break;
    }
  }

  /** Common path for every source of damage against any combatant. */
  _landDamage(attacker, target, dmg, meta = {}) {
    const res = applyDamage(target, dmg.amount);
    const brk = addBreak(target, dmg.breakDamage);
    if (dmg.crit) this.stats.crits++;

    this.bus.emit(EV.DAMAGE_DEALT, {
      attacker, target, amount: res.dealt, absorbed: res.absorbed,
      crit: dmg.crit, eff: dmg.eff, element: dmg.element, immune: dmg.immune,
      killed: res.killed, ...meta,
    });

    if (dmg.crit) this._addGradient(ECONOMY.GRADIENT_CRIT);
    if (brk.broke) {
      target.staggered = true;
      target.staggerTurns = 1;
      if (target.setStaggered) target.setStaggered(true);
      this._addGradient(ECONOMY.GRADIENT_BREAK);
      this.bus.emit(EV.BREAK_STAGGER, { target, phase: 'break', attacker });
    }
    if (target.checkPhase) {
      const phase = target.checkPhase();
      if (phase) this.bus.emit(EV.BREAK_STAGGER, { target, phase: 'phase2', info: phase });
    }
    if (res.killed) this._kill(target, attacker);
  }

  _kill(target, attacker) {
    target.beginDeath();
    if (target.side === 'enemy') this.totalXp += target.xpValue || 0;
    this.bus.emit(EV.COMBATANT_DIED, { target, attacker });
  }

  _addGradient(amount) {
    const before = this.gradient;
    this.gradient = Math.min(ECONOMY.GRADIENT_MAX, this.gradient + amount * (this.luminas.gradientMul || 1));
    if (this.gradient !== before) this.bus.emit(EV.GRADIENT_CHANGED, { value: this.gradient });
  }

  // -------------------------------------------------------------------------
  // Enemy turn + reactive defence
  // -------------------------------------------------------------------------

  _beginEnemyTurn(enemy) {
    const { pattern, targets } = this.ai.chooseAction(enemy, this.party);
    if (!pattern || targets.length === 0) { this._setState(STATE.TURN_END); return; }
    this._pendingSequence = this.ai.buildSequence(enemy, pattern, targets);
    this._setState(STATE.ENEMY_INTENT, { actor: enemy, pattern, targets, name: pattern.name });
  }

  _launchEnemyAttack() {
    const seq = this._pendingSequence;
    if (!seq) { this._setState(STATE.TURN_END); return; }
    this._setState(STATE.ENEMY_ATTACK, { actor: seq.attacker, name: seq.name });
    this.reaction.begin(seq);
    this._pendingSequence = null;
  }

  /** Routed from game.js when the player presses parry or dodge. */
  reactionInput(type) {
    if (this.state !== STATE.ENEMY_ATTACK) return 'ignored';
    return this.reaction.input(type);
  }

  _onHitLanded(e) {
    const { defender, attacker, move, splash, status, drain } = e;
    if (!defender || !defender.alive) return;
    this.stats.hitsTaken++;

    const dmg = computeDamage(attacker, defender, move, this.rng);
    this._landDamage(attacker, defender, dmg, { source: 'enemy-hit', hitIndex: e.hit.index });

    if (splash > 0) {
      for (const ally of this.livingParty) {
        if (ally === defender) continue;
        const sd = computeDamage(attacker, ally, move, this.rng, { multiplier: splash, noCrit: true });
        this._landDamage(attacker, ally, sd, { source: 'splash' });
      }
    }
    if (status && this.rng.chance(status.chance === undefined ? 1 : status.chance)) {
      if (addStatus(defender, status.id, { turns: status.turns })) {
        this.bus.emit(EV.STATUS_APPLIED, { target: defender, id: status.id, turns: status.turns });
      }
    }
    if (drain > 0 && attacker.alive) {
      const res = applyHeal(attacker, Math.round(dmg.amount * drain));
      if (res.healed) this.bus.emit(EV.HEAL_DEALT, { target: attacker, amount: res.healed, source: 'drain' });
    }

    addAP(defender, ECONOMY.AP_TOOK_HIT);
    this._addGradient(ECONOMY.GRADIENT_HURT);
  }

  _onParry(e) {
    const { defender, attacker, quality, flow } = e;
    this.stats.parries++;
    this.stats.bestFlow = Math.max(this.stats.bestFlow, flow);
    const gained = addAP(defender, ECONOMY.AP_PARRY + (this.luminas.parryApBonus || 0));
    if (gained) this.bus.emit(EV.AP_CHANGED, { actor: defender, delta: gained });
    this._addGradient(ECONOMY.GRADIENT_PARRY);
    const brk = addBreak(attacker, Math.round(20 + quality * 22));
    if (brk.broke) {
      attacker.staggered = true;
      attacker.staggerTurns = 1;
      if (attacker.setStaggered) attacker.setStaggered(true);
      this.bus.emit(EV.BREAK_STAGGER, { target: attacker, phase: 'break', attacker: defender });
    }
  }

  _onDodge(e) {
    this.stats.dodges++;
    const gained = addAP(e.defender, ECONOMY.AP_DODGE);
    if (gained) this.bus.emit(EV.AP_CHANGED, { actor: e.defender, delta: gained });
    this._addGradient(ECONOMY.GRADIENT_DODGE);
  }

  _onComboComplete(summary) {
    if (this.state !== STATE.ENEMY_ATTACK) return;
    if (summary.counters.length > 0 && this.livingParty.length > 0) {
      this.counterQueue = summary.counters.filter((c) => c.defender && c.defender.alive);
      this.counterTimer = 0;
      this._counterIndex = 0;
      this._comboClean = summary.clean;
      if (this.counterQueue.length > 0) {
        this._setState(STATE.COUNTER, { attacker: summary.attacker, clean: summary.clean });
        return;
      }
    }
    this.endTurn();
  }

  _updateCounters(dt) {
    this.counterTimer -= dt;
    if (this.counterTimer > 0) return;
    if (this._counterIndex >= this.counterQueue.length) {
      this.counterQueue = [];
      this.endTurn();
      return;
    }
    const entry = this.counterQueue[this._counterIndex++];
    this.counterTimer = COUNTER_STEP;
    this._executeCounter(entry);
  }

  _executeCounter(entry) {
    const defender = entry.defender;
    const target = this.livingEnemies.find((e) => e === this.actor) || this.livingEnemies[0];
    if (!defender || !defender.alive || !target) return;

    const move = defender.counterMove;
    // Flow streak and the clean-combo bonus both feed the counter's damage.
    const flowBonus = 1 + this.reaction.bestFlow * 0.11 * (this.luminas.flowMul || 1);
    const cleanBonus = this._comboClean ? 1.35 : 1;
    const dmg = computeDamage(defender, target, move, this.rng, {
      multiplier: flowBonus * cleanBonus * (this.luminas.counterMul || 1),
      precision: 0.1 + entry.quality * 0.2,
    });
    this.bus.emit(EV.COUNTER_TRIGGERED, {
      defender, target, index: this._counterIndex - 1,
      total: this.counterQueue.length, clean: this._comboClean, quality: entry.quality,
    });
    this._landDamage(defender, target, dmg, { source: 'counter', counter: true });
    addAP(defender, ECONOMY.AP_COUNTER);
    this._addGradient(ECONOMY.GRADIENT_COUNTER);
  }

  // -------------------------------------------------------------------------
  // Wave / run flow
  // -------------------------------------------------------------------------

  /** Called by game.js once the between-wave screen is dismissed. */
  acknowledgeWaveClear() {
    if (this.state !== STATE.WAVE_CLEAR) return false;
    this._setState(STATE.IDLE);
    return true;
  }

  hardReset() {
    this.gradient = 0;
    this.totalXp = 0;
    this.counterQueue = [];
    this.plan = null;
    this.actor = null;
    this.stats = { parries: 0, dodges: 0, hitsTaken: 0, bestFlow: 0, weakPoints: 0, crits: 0 };
    for (const id in ITEMS) this.items[id] = ITEMS[id].uses;
    this.reaction.abort();
    this.reaction.flow = 0;
    this.reaction.bestFlow = 0;
    this.ai.reset();
    this._setState(STATE.IDLE);
  }
}
