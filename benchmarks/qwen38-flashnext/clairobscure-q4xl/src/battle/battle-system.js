import { EV } from '../core/events.js';
import { PATTERNS } from '../entities/enemy-data.js';
import { SKILLS, GRADIENT } from '../entities/skill.js';
import { STATUSES } from '../entities/status.js';
import { computeDamage, computeHeal, computeStagger, AP, CHARGE, FLOW } from './action-resolver.js';

// ---------------------------------------------------------------------------
// Top-level combat state machine for ONE wave. Explicit states:
//
//   intro -> roundStart -> turnBegin -> (player)    menu -> target/aim -> action -> turnEnd
//                              \-> (enemy)     enemyIntent -> reaction -> counter -> turnEnd
//   roundOver -> roundStart ...   |  allEnemiesDead -> waveClear   allPartyDead -> defeat
//
// Async flows are token-guarded: `generation` bumps on restart so dangling
// awaits from a previous battle resolve silently instead of mutating state.
// ---------------------------------------------------------------------------

export const STATES = {
  INTRO: 'intro',
  ROUND_START: 'round-start',
  TURN_BEGIN: 'turn-begin',
  MENU: 'menu',
  TARGET: 'target',
  AIM: 'aim',
  ACTION: 'action',
  ENEMY_INTENT: 'enemy-intent',
  REACTION: 'reaction',
  COUNTER: 'counter',
  TURN_END: 'turn-end',
  WAVE_CLEAR: 'wave-clear',
  DEFEAT: 'defeat',
  IDLE: 'idle'
};

export class BattleSystem {
  constructor(deps) {
    this.clock = deps.clock;
    this.timers = deps.timers;
    this.bus = deps.bus;
    this.rng = deps.rng;
    this.party = deps.party;
    this.enemies = deps.enemies;
    this.queue = deps.queue;
    this.reaction = deps.reaction;
    this.aim = deps.aim;
    this.cameraRef = deps.camera || null;

    this.state = STATES.INTRO;
    this.activeUnit = null;
    this.charge = 0;
    this.over = false;         // battle (wave) finished
    this.result = null;        // 'clear' | 'defeat'
    this.generation = 0;
    this.items = 3;            // shared Tonics
    this._choiceResolve = null;
    this._aimResolve = null;
    this._pending = null;      // {kind:'attack'|'skill'|'aim', skill}
    this.lastEnemyPattern = null;
  }

  setState(s) {
    this.state = s;
    this.bus.emit('battle:state', { state: s });
  }

  _wait(sec) { return this.timers.wait(sec); }
  _valid(gen) { return gen === this.generation && !this._cancelled; }
  cancel() {
    this._cancelled = true;
    this.generation++;
    this.timers.flush();
    // Silence live reaction combos so they cannot resolve stale hits on restart.
    if (this.reaction) for (const c of this.reaction.active) c.dead = true;
    // Release any awaited UI promise so no async chain is left dangling.
    for (const key of ['_choiceResolve', '_targetResolve', '_aimResolve']) {
      if (this[key]) { const r = this[key]; this[key] = null; r(null); }
    }
  }

  get aliveParty() { return this.party.filter((p) => p.alive); }
  get aliveEnemies() { return this.enemies.filter((e) => e.alive); }
  get flowLevel() { return this.reaction.streak; }
  get flowDamageBonus() { return 1 + Math.min(this.reaction.streak, FLOW.max) * FLOW.perLevelDamage; }
  get gradientReady() { return this.charge >= GRADIENT.chargeNeeded; }

  // ==========================================================================
  // Main loop
  // ==========================================================================

  async runBattle() {
    const gen = this.generation;
    this.setState(STATES.INTRO);
    this.bus.emit(EV.BATTLE_START, { party: this.party, enemies: this.enemies });
    await this._wait(1.6);
    while (!this.over && this._valid(gen)) {
      this.queue.buildRound(this.party, this.enemies);
      this.bus.emit('battle:round', { round: this.queue.round, preview: this.queue.preview });
      while (!this.queue.roundOver && !this.over && this._valid(gen)) {
        const unit = this.queue.shift();
        if (!unit || !unit.alive) continue;
        await this._takeTurn(unit, gen);
        if (!this._valid(gen)) return this.result;
        await this._checkEnd(gen);
      }
      if (this._valid(gen)) await this._wait(0.35);
    }
    if (this._valid(gen)) {
      this.setState(this.result === 'clear' ? STATES.WAVE_CLEAR : STATES.DEFEAT);
    }
    return this.result;
  }

  async _takeTurn(unit, gen) {
    this.activeUnit = unit;
    this.setState(STATES.TURN_BEGIN);
    this.bus.emit(EV.TURN_START, { unit, partyTurn: unit.side === 'party' });

    // Status ticks at the start of your turn (burn/poison damage, expiry).
    const expired = [];
    const ticks = unit.tickStatuses(expired);
    for (const t of ticks) {
      this.bus.emit(t.type === 'poison' ? EV.STATUS : EV.STATUS, {
        target: unit, kind: t.type, amount: t.amount
      });
      this.bus.emit(EV.DAMAGE, { target: unit, amount: t.amount, kind: t.type, crit: false });
    }
    for (const id of expired) this.bus.emit(EV.STATUS, { target: unit, kind: 'expire', id });
    if (!unit.alive) { await this._death(unit, gen); return; }
    this._checkPartyDanger();

    if (unit.stunned) {
      unit.consumeStun();
      this.bus.emit(EV.LOG, { text: `${unit.name} is stunned and cannot act!` });
      this.bus.emit(EV.STATUS, { target: unit, kind: 'stun', amount: 0 });
      await this._wait(0.8);
      return;
    }

    if (unit.side === 'party') await this._playerTurn(unit, gen);
    else await this._enemyTurn(unit, gen);
    if (!this._valid(gen) || this.over) return;
    this.setState(STATES.TURN_END);
    await this._wait(0.25);
    this.activeUnit = null;
  }

  // ==========================================================================
  // Player turn: menu -> (target | aim) -> action
  // ==========================================================================

  async _playerTurn(unit, gen) {
    if (unit.isBroken) {
      this.bus.emit(EV.LOG, { text: `${unit.name} is Broken and can only recover…` });
      this.setState(STATES.MENU);
      this.bus.emit(EV.MENU_OPEN, { unit, options: this._menuOptions(unit), broken: true });
      await this._wait(1.0);
      if (!this._valid(gen)) return;
      this.bus.emit(EV.MENU_CHOICE, { type: 'recover' });
      return;
    }
    this.setState(STATES.MENU);
    const options = this._menuOptions(unit);
    this.bus.emit(EV.MENU_OPEN, { unit, options });
    const choice = await this._awaitChoice(gen);
    if (!this._valid(gen) || this.over) return;
    await this._handleChoice(unit, choice, gen);
  }

  _menuOptions(unit) {
    return {
      canAttack: this.aliveEnemies.length > 0,
      canAim: this.aliveEnemies.length > 0,
      skills: unit.skills.map((id) => ({
        id,
        skill: SKILLS[id],
        enabled: unit.canAfford(SKILLS[id].cost)
      })),
      canDefend: true,
      items: this.items,
      gradient: this.gradientReady
    };
  }

  // UI resolves this promise via choose(). `{type:'skill', skillId}` etc.
  choose(choice) {
    if (this._choiceResolve) {
      const r = this._choiceResolve;
      this._choiceResolve = null;
      this.bus.emit(EV.MENU_CHOICE, choice);
      r(choice);
    }
  }

  _awaitChoice(gen) {
    return new Promise((resolve) => {
      this._choiceResolve = (choice) => {
        if (gen !== this.generation) { return; }
        resolve(choice);
      };
    });
  }

  async _handleChoice(unit, choice, gen) {
    switch (choice.type) {
      case 'attack': {
        const target = await this._awaitTarget(unit, { team: 'enemy' }, gen);
        if (!target || !this._valid(gen)) return;
        await this._playerAttack(unit, target, { power: 1, stagger: 10, type: 'melee', apGain: AP.gainAttack }, gen);
        break;
      }
      case 'aim': {
        const res = await this._aimFlow(null, gen);
        if (!res || !this._valid(gen)) return;
        await this._resolvedAim(unit, null, res, gen);
        break;
      }
      case 'skill': {
        const skill = SKILLS[choice.skillId];
        if (!skill || !unit.canAfford(skill.cost)) return;
        let target = null;
        if (skill.target === 'enemy' || skill.target === 'ally') {
          target = await this._awaitTarget(unit, { team: skill.target === 'enemy' ? 'enemy' : 'party', heal: !!skill.heal }, gen);
          if (!target || !this._valid(gen)) return;
        }
        unit.ap = Math.max(0, unit.ap - skill.cost);
        this.bus.emit(EV.STATUS, { target: unit, kind: 'spend', amount: skill.cost });
        await this._useSkill(unit, skill, target, gen);
        break;
      }
      case 'defend': {
        this.setState(STATES.ACTION);
        unit.addStatus('defUp', { turns: 1, potency: 0.4, label: 'Guard', kind: 'buff', color: '#3f6b6d' });
        unit.addAp(AP.gainAttack);
        this.bus.emit(EV.STATUS, { target: unit, kind: 'guard', amount: 0 });
        this.bus.emit(EV.LOG, { text: `${unit.name} takes a guard stance.` });
        unit.flashGuard();
        this.timers.slowTo?.(1);
        await this._wait(0.5);
        break;
      }
      case 'item': {
        if (this.items <= 0) return;
        const target = await this._awaitTarget(unit, { team: 'party', heal: true }, gen);
        if (!target || !this._valid(gen)) return;
        this.items -= 1;
        const heal = Math.round(target.maxHp * 0.35);
        const got = target.heal(heal);
        this.bus.emit(EV.HEAL, { target, amount: got });
        this.bus.emit(EV.LOG, { text: `Tincture dorée restores ${got} HP to ${target.name}.` });
        await this._wait(0.6);
        break;
      }
      case 'gradient': {
        await this._gradient(gen);
        break;
      }
      case 'recover': break;
      default: break;
    }
  }

  // -- targeting ---------------------------------------------------------------

  _awaitTarget(unit, opts, gen) {
    const list = opts.team === 'enemy' ? this.aliveEnemies : this.aliveParty;
    this.setState(STATES.TARGET);
    this.bus.emit('ui:target', { unit, team: opts.team, heal: !!opts.heal, count: list.length });
    return new Promise((resolve) => {
      this._targetResolve = (fighter) => {
        if (gen !== this.generation) return;
        this._targetResolve = null;
        this.bus.emit('ui:target-end', {});
        resolve(fighter || null);
      };
      if (list.length === 1) {
        // single option: auto-select for pacing
        this._targetResolve(list[0]);
      }
    });
  }

  selectTarget(fighter) {
    if (this.state !== STATES.TARGET || !this._targetResolve) return;
    if (fighter && fighter.alive) this._targetResolve(fighter);
  }

  // ==========================================================================
  // Free aim
  // ==========================================================================

  async _aimFlow(skill, gen) {
    this.setState(STATES.AIM);
    const focus = skill && skill.target === 'ally' ? null : null;
    this.aim.start(this.aliveEnemies, this.cameraRef, window.innerWidth, window.innerHeight);
    const res = await new Promise((resolve) => {
      this._aimResolve = (r) => {
        if (gen !== this.generation) return;
        this._aimResolve = null;
        resolve(r);
      };
    });
    return res;
  }

  finishAim(res) {
    if (this._aimResolve) {
      const r = this._aimResolve;
      this._aimResolve = null;
      r(res);
    }
  }

  cancelAim() {
    if (this._aimResolve) {
      const r = this._aimResolve;
      this._aimResolve = null;
      r(null);
    }
  }

  async _resolvedAim(unit, skill, res, gen) {
    this.setState(STATES.ACTION);
    unit.beginAttack(0.55);
    this.bus.emit(EV.ATTACK_START, { attacker: unit, target: res.enemy, aim: true });
    this.bus.emit(EV.FX, { kind: 'shot', from: unit.position, to: res.enemy ? res.enemy.center : null, aimX: res.aimX, aimY: res.aimY, color: '#f4d489' });
    await this._wait(0.3);
    if (!this._valid(gen)) return;
    if (res.enemy && res.enemy.alive) {
      const power = (skill ? skill.power : 0.85);
      const res2 = computeDamage({
        attacker: unit, target: res.enemy, rng: this.rng, power,
        element: skill ? skill.element : 'physical',
        type: 'ranged', isAim: true, aimHit: res.hit, aimPower: res.power,
        critBonus: res.hit === 'weak' ? 0.15 : 0
      });
      // flow streak boosts outgoing damage
      res2.amount = Math.round(res2.amount * this.flowDamageBonus);
      const dealt = res.enemy.damage(res2.amount);
      const stag = computeStagger({ stagger: skill ? skill.stagger : 7, isAim: true, aimHit: res.hit, weakState: res2.weakState });
      this._applyDamageToEnemy(unit, res.enemy, dealt, res2, stag, {
        aimHit: res.hit, chargeOnWeak: skill ? skill.chargeOnWeak : 6
      });
      if (skill && skill.effects && res.hit !== 'miss' && res.enemy.alive) {
        await this._applyEffects(unit, res.enemy, skill.effects, skill, gen);
      }
    } else {
      this.bus.emit(EV.LOG, { text: 'The shot whistles through empty air.' });
    }
    unit.addAp(AP.gainAim);
    await this._wait(0.35);
  }

  // ==========================================================================
  // Player attacks / skills
  // ==========================================================================

  async _playerAttack(unit, target, opts, gen) {
    this.setState(STATES.ACTION);
    this.bus.emit(EV.CAM_FOCUS, { actor: unit, subject: target });
    unit.beginAttack(0.7);
    this.bus.emit(EV.ATTACK_START, { attacker: unit, target });
    await this._wait(0.3);
    if (!this._valid(gen)) return;
    if (!target.alive) target = this.aliveEnemies[0];
    if (!target) return;
    const res = computeDamage({ attacker: unit, target, rng: this.rng, power: opts.power, element: opts.element || 'physical', type: 'melee' });
    res.amount = Math.round(res.amount * this.flowDamageBonus);
    const dealt = target.damage(res.amount);
    const stag = computeStagger({ stagger: opts.stagger, weakState: res.weakState });
    this._applyDamageToEnemy(unit, target, dealt, res, stag, {});
    unit.addAp(opts.apGain || 0);
    await this._wait(0.45);
  }

  async _useSkill(unit, skill, target, gen) {
    this.setState(STATES.ACTION);
    const targets = this._skillTargets(skill, unit, target);
    this.bus.emit(EV.CAM_FOCUS, { actor: unit, subject: targets[0] || unit });
    unit.beginCast(skill.windup || 0.9);
    this.bus.emit(EV.ATTACK_START, { attacker: unit, target: targets[0], skill, swing: skill.power > 0 });
    await this._wait((skill.windup || 0.9) * 0.45);
    if (!this._valid(gen)) return;

    const hits = skill.hits || 1;
    for (let h = 0; h < hits; h++) {
      for (const t of targets) {
        if (!t || !t.alive) continue;
        if (skill.heal != null) {
          const amt = computeHeal(unit, skill.heal, this.rng);
          if (skill.cleanse) for (const cid of skill.cleanse) t.statuses.delete(cid);
          const got = t.heal(amt);
          this.bus.emit(EV.HEAL, { target: t, amount: got });
          this.bus.emit(EV.FX, { kind: 'heal', at: t.center });
        } else if (skill.power > 0) {
          const res = computeDamage({
            attacker: unit, target: t, rng: this.rng, power: skill.power,
            element: skill.element, type: 'melee',
            bonusMult: (skill.bonusVsBroken && t.isBroken) ? 1 + skill.bonusVsBroken : 0
          });
          res.amount = Math.round(res.amount * this.flowDamageBonus);
          const dealt = t.damage(res.amount);
          if (skill.lifesteal) {
            const got = unit.heal(Math.round(dealt * skill.lifesteal));
            if (got > 0) this.bus.emit(EV.HEAL, { target: unit, amount: got });
          }
          const stag = computeStagger({ stagger: skill.stagger || 0, weakState: res.weakState, hitIndex: h });
          if (t.side === 'enemy') this._applyDamageToEnemy(unit, t, dealt, res, stag, skill);
          else this._applyDamageToParty(t, dealt, res, stag);
          if (skill.effects) await this._applyEffects(unit, t, skill.effects, skill, gen, res);
        } else if (!skill.heal && !(skill.power > 0)) {
          // pure buff/debuff skill - applied after the loop
        }
      }
      if (hits > 1) await this._wait(0.22);
    }
    if (skill.selfEffects) {
      for (const e of skill.selfEffects) this._applyStatus(unit, e);
      this.bus.emit(EV.STATUS, { target: unit, kind: 'buff', amount: 0 });
      this.bus.emit(EV.FX, { kind: 'buff', at: unit.center });
    }
    if (skill.allyEffects) {
      for (const ally of this.aliveParty) {
        for (const e of skill.allyEffects) this._applyStatus(ally, e);
        this.bus.emit(EV.FX, { kind: 'buff', at: ally.center });
      }
    }
    await this._wait(0.35);
  }

  _skillTargets(skill, unit, chosen) {
    switch (skill.target) {
      case 'enemy': return chosen ? [chosen] : [];
      case 'allEnemies': return this.aliveEnemies.slice();
      case 'ally': return chosen ? [chosen] : [];
      case 'allAllies': return this.aliveParty.slice();
      case 'self': return [unit];
      default: return [];
    }
  }

  async _applyEffects(caster, target, effects, skill, gen, res) {
    if (!target.alive) return;
    for (const e of effects) {
      if (e.chance != null && !this.rng.chance(e.chance)) continue;
      if (target.side === caster.side) continue; // don't debuff allies
      this._applyStatus(target, e);
    }
  }

  _applyStatus(target, e) {
    const meta = STATUSES[e.id] || {};
    target.addStatus(e.id, {
      turns: e.turns, potency: e.potency || 0,
      label: meta.label || e.label || e.id,
      kind: meta.kind || e.kind || 'debuff',
      color: meta.color || e.color || '#e2793a'
    });
    this.bus.emit(EV.STATUS, { target, kind: e.id, amount: 0, source: 'skill' });
    if (meta.kind !== 'buff') {
      this.bus.emit(EV.LOG, { text: `${target.name} suffers ${meta.label || e.id}.` });
    } else {
      this.bus.emit(EV.LOG, { text: `${target.name} gains ${meta.label || e.id}.` });
    }
  }

  // -- damage application to enemies -----------------------------------------

  _applyDamageToEnemy(attacker, enemy, dealt, res, stag, opts) {
    this.bus.emit(EV.DAMAGE, {
      target: enemy, amount: dealt, crit: res.crit, weakState: res.weakState,
      element: opts.element, kind: 'attack'
    });
    this.bus.emit(EV.FX, { kind: 'impact', at: enemy.center, color: res.weakState === 'weakness' ? '#f4d489' : '#e2793a', big: res.crit });
    this.bus.emit(EV.CAM_SHAKE, { amp: res.crit ? 0.5 : 0.25 });
    if (res.weakState === 'weakness') {
      this.bus.emit(EV.LOG, { text: `${attacker.name} strikes a WEAKNESS!` });
      if (dealt > 0) this.addCharge(CHARGE.weaknessHit);
    }
    if (res.crit && dealt > 0) this.addCharge(CHARGE.crit);
    if (opts.aimHit === 'weak' && dealt > 0) this.onWeakPointHit(opts.chargeOnWeak || CHARGE.weakHit);
    if (dealt > 0 && enemy.alive && stag > 0) {
      enemy.addStagger(stag);
      this.bus.emit(EV.STAGGER, { target: enemy, frac: enemy.staggerFrac });
      if (enemy.isBroken) this._onBreak(enemy);
    }
    if (!enemy.alive) this._onEnemyDeath(enemy);
  }

  _applyDamageToParty(target, dealt, res, stag) {
    this.bus.emit(EV.DAMAGE, { target, amount: dealt, crit: res.crit || false, kind: 'friendly' });
  }

  _onBreak(enemy) {
    this.bus.emit(EV.BREAK, { target: enemy });
    this.bus.emit(EV.LOG, { text: `${enemy.name} is BROKEN! Punish it!` });
    this.bus.emit(EV.CAM_SHAKE, { amp: 0.6 });
    this.addCharge(6);
    for (const m of this.aliveParty) m.addAp(AP.gainBreak);
  }

  _onEnemyDeath(enemy) {
    if (enemy._deathHandled) return;
    enemy._deathHandled = true;
    this.queue.remove(enemy);
    this.reaction.invalidate(enemy);
    this.bus.emit(EV.DEATH, { unit: enemy, side: 'enemy' });
    this.addCharge(enemy.chargeOnDeath || 12);
    this.bus.emit(EV.LOG, { text: `${enemy.name} dissolves into drifting paint.` });
  }

  async _death(unit, gen) {
    if (unit._deathHandled) return;
    unit._deathHandled = true;
    this.queue.remove(unit);
    this.reaction.invalidate(unit);
    this.bus.emit(EV.DEATH, { unit, side: unit.side });
    if (unit.side === 'party') this.bus.emit(EV.LOG, { text: `${unit.name} falls…` });
    await this._wait(0.3);
  }

  addCharge(n) {
    if (this.over) return;
    const before = this.charge;
    this.charge = Math.min(GRADIENT.chargeNeeded, this.charge + n);
    if (this.charge !== before) {
      this.bus.emit(EV.CHARGE, { charge: this.charge, needed: GRADIENT.chargeNeeded });
      if (before < GRADIENT.chargeNeeded && this.charge >= GRADIENT.chargeNeeded) {
        this.bus.emit(EV.GRADIENT_READY, {});
        this.bus.emit(EV.LOG, { text: 'ATTAQUE PALETTE ready!' });
      }
    }
  }

  onWeakPointHit(n) {
    this.addCharge(n);
    this.bus.emit(EV.LOG, { text: 'WEAK POINT struck!' });
  }

  // ==========================================================================
  // Enemy turn: AI choice -> telegraph/reaction -> counter
  // ==========================================================================

  _choosePattern(enemy) {
    const ids = enemy.patternIds;
    // Seeded AI: avoid immediate repeats; phase-2 pattern 0 is the big mover.
    if (enemy.phase === 2 && this.rng.chance(0.5)) return ids[0];
    let pick = this.rng.pick(ids);
    if (pick === this.lastEnemyPattern && ids.length > 1) {
      pick = ids[(ids.indexOf(pick) + this.rng.int(1, ids.length - 1)) % ids.length];
    }
    this.lastEnemyPattern = pick;
    return pick;
  }

  _chooseTarget(enemy, pattern) {
    const alive = this.aliveParty;
    if (alive.length === 0) return null;
    if (pattern && pattern.aoe) return alive[0];
    // Finisher instinct: 45% chance to focus the weakest link.
    if (this.rng.chance(0.45)) {
      let low = alive[0];
      for (const p of alive) if (p.hpFrac < low.hpFrac) low = p;
      return low;
    }
    return this.rng.pick(alive);
  }

  async _enemyTurn(enemy, gen) {
    if (this.aliveParty.length === 0) { this.over = true; this.result = 'defeat'; this.bus.emit(EV.DEFEAT, {}); return; }
    this.setState(STATES.ENEMY_INTENT);
    const patternId = this._choosePattern(enemy);
    const pattern = PATTERNS[patternId];
    enemy.maybeEnterPhase2();
    if (enemy.phase === 2 && !enemy._phaseAnnounced) {
      enemy._phaseAnnounced = true;
      this.bus.emit(EV.LOG, { text: `${enemy.name} enters a furious second movement!` });
      this.bus.emit(EV.FLASH, { color: 'rgba(90,74,122,0.4)', ms: 400 });
    }
    const defender = this._chooseTarget(enemy, pattern);
    if (!defender) return;
    this.bus.emit(EV.CAM_FOCUS, { actor: enemy, subject: defender });
    enemy.beginWindup(!!(pattern.hits.length > 2 || pattern.unparryable));
    // Pre-telegraph beat so the intent chip is readable before the cue starts.
    await this._wait(0.12);
    if (!this._valid(gen) || this.over) return;

    this.setState(STATES.REACTION);
    const defenders = pattern.aoe ? this.aliveParty.slice() : [defender];
    const hooks = {
      onVerdict: (i, verdict, hit) => this._enemyHitResolve(enemy, pattern, hit, verdict, defenders, i)
    };
    const result = pattern.aoe
      ? await this.reaction.runGroupCombo(defenders, pattern, enemy, hooks)
      : await this.reaction.runCombo(defender, pattern, enemy, hooks);
    if (!this._valid(gen)) return result;

    // Counter exchange: successful parries in the combo unlock one counter.
    if (result && result.counter && defender.alive && enemy.alive && !this.over) {
      await this._counter(defender, enemy, gen);
    }
    this._checkPartyDanger();
    return result;
  }

  // Damage/reward application at the exact hit-landing instant.
  _enemyHitResolve(enemy, pattern, hit, verdict, defenders, hitIndex) {
    const parriedStyle = verdict === 'perfect' || verdict === 'parry';
    if (parriedStyle) {
      const savior = defenders[Math.min(hitIndex, defenders.length - 1)] || defenders[0];
      savior.addAp(verdict === 'perfect' ? AP.gainPerfect : AP.gainParry);
      this.addCharge(verdict === 'perfect' ? CHARGE.perfect + CHARGE.streakBonus : CHARGE.parry);
      this.bus.emit(EV.LOG, {
        text: verdict === 'perfect'
          ? `PERFECT PARRY — ${savior.name}!`
          : `${savior.name} parries the ${pattern.name}!`
      });
    } else if (verdict === 'dodge') {
      this.addCharge(CHARGE.dodge);
      for (const d of defenders) if (d.alive) d.setPose('dodge', 0.4);
    }
    for (const d of defenders) {
      if (!d.alive) continue;
      if (parriedStyle || verdict === 'dodge') continue; // mitigated - already animated
      // Hit lands (fail): damage + stagger + status.
      const whiffBonus = hit.press && hit.press.whiffedEarly ? 1.1 : 1;
      const slowCut = enemy.hasStatus('slow') ? 0.75 : 1;
      const res = computeDamage({
        attacker: enemy, target: d, rng: this.rng,
        power: hit.dmg * whiffBonus * slowCut,
        element: 'physical', type: 'melee', noCrit: false
      });
      const dealt = d.damage(res.amount);
      this.bus.emit(EV.DAMAGE, {
        target: d, amount: dealt, crit: res.crit, kind: 'enemy',
        enemyAttackName: pattern.name, index: hitIndex, from: enemy
      });
      this.bus.emit(EV.FX, { kind: 'impact', at: d.center, color: '#a12d33', big: res.crit });
      this.bus.emit(EV.CAM_SHAKE, { amp: res.crit ? 0.55 : 0.35 });
      d.addAp(AP.gainHitTaken);
      if (dealt > 0) this._breakFlowIfStreak();
      if (d.alive && hit.stagger) {
        d.addStagger(hit.stagger);
        this.bus.emit(EV.STAGGER, { target: d, frac: d.staggerFrac });
        if (d.isBroken) {
          this.bus.emit(EV.BREAK, { target: d });
          this.bus.emit(EV.LOG, { text: `${d.name} is Broken!` });
        }
      }
      if (hit.status && d.alive && this.rng.chance(hit.status.chance ?? 1)) {
        d.addStatus(hit.status.id, { ...hit.status, kind: 'debuff' });
        this.bus.emit(EV.STATUS, { target: d, kind: hit.status.id, amount: 0 });
      }
      if (!d.alive) { this._death(d); }
    }
    // Streak reset happens in reaction system; extra reset on any failed hit:
    if (!(parriedStyle || verdict === 'dodge')) this.reaction.streak = Math.min(this.reaction.streak, this.reaction.streak);
  }

  _breakFlowIfStreak() {
    if (this.reaction.streak > 0) {
      this.bus.emit(EV.LOG, { text: 'Flow broken.' });
    }
    this.reaction.streak = 0;
  }

  async _counter(defender, enemy, gen) {
    this.setState(STATES.COUNTER);
    this.bus.emit(EV.COUNTER_WINDOW, { defender });
    this.bus.emit(EV.CAM_FOCUS, { actor: defender, subject: enemy });
    this.bus.emit(EV.FLASH, { color: 'rgba(244,212,137,0.22)', ms: 180 });
    defender.beginAttack(0.5);
    this.bus.emit(EV.COUNTER, {});
    this.bus.emit(EV.LOG, { text: `${defender.name} counters!` });
    await this._wait(0.2);
    if (!this._valid(gen) || !enemy.alive) return;
    const res = computeDamage({ attacker: defender, target: enemy, rng: this.rng, power: 1.15, element: 'physical', type: 'counter', critBonus: 0.1 });
    res.amount = Math.round(res.amount * this.flowDamageBonus);
    const dealt = enemy.damage(res.amount);
    const stag = computeStagger({ stagger: 12, weakState: res.weakState });
    this._applyDamageToEnemy(defender, enemy, dealt, res, stag, {});
    defender.addAp(AP.gainCounter);
    await this._wait(0.4);
  }

  async _gradient(gen) {
    this.setState(STATES.ACTION);
    this.charge = 0;
    this.bus.emit(EV.GRADIENT_FIRE, { name: GRADIENT.name });
    this.bus.emit(EV.FLASH, { color: 'rgba(253,250,242,0.75)', ms: 550 });
    this.clock.slowTo(0.45);
    this.bus.emit(EV.CAM_FOCUS, { actor: this.aliveParty[0], subject: this.aliveEnemies[0] });
    await this._wait(0.7);
    const attackers = this.aliveParty.slice();
    for (let h = 0; h < GRADIENT.hitsEach; h++) {
      for (const a of attackers) {
        if (!a.alive) continue;
        a.beginAttack(0.5);
        this.bus.emit(EV.ATTACK_START, { attacker: a, target: this.aliveEnemies[0], gradient: true });
      }
      for (const e of this.aliveEnemies.slice()) {
        if (!e.alive) continue;
        const a = attackers[(h + this.aliveEnemies.indexOf(e)) % attackers.length] || attackers[0];
        if (!a) continue;
        const res = computeDamage({ attacker: a, target: e, rng: this.rng, power: GRADIENT.perHitDamage, element: 'light', type: 'gradient', noCrit: true });
        const dealt = e.damage(res.amount);
        this._applyDamageToEnemy(a, e, dealt, { crit: false, weakState: 'weakness' }, 40, { element: 'light' });
      }
      await this._wait(0.28);
      if (!this._valid(gen)) return;
    }
    // The salvo shatters focus entirely.
    for (const e of this.aliveEnemies) {
      if (e.alive && !e.isBroken) {
        e.stagger = 0; e.brokenTurns = 2; e.setPose('broken', 0.9);
        this.bus.emit(EV.BREAK, { target: e });
      }
    }
    this.clock.restore();
    await this._wait(0.5);
    this.bus.emit(EV.LOG, { text: `${GRADIENT.name}!` });
  }

  // ==========================================================================
  // End checks
  // ==========================================================================

  async _checkEnd(gen) {
    if (this.over) return;
    if (this.aliveEnemies.length === 0) {
      this.over = true;
      this.result = 'clear';
      // slow-mo victory beat
      this.clock.slowTo(0.5);
      await this._wait(0.4);
      this.clock.restore();
      for (const p of this.aliveParty) p.setPose('victory', 1.2);
      this.bus.emit(EV.WAVE_START, {}); // reused channel: bus consumers see wave clear via name
      this.bus.emit('battle:wave-clear', {});
    } else if (this.aliveParty.length === 0) {
      this.over = true;
      this.result = 'defeat';
      this.reaction.invalidate(null);
      this.aim.cancel();
      this.bus.emit(EV.DEFEAT, {});
    }
  }

  _checkPartyDanger() {
    let danger = 1;
    for (const p of this.aliveParty) danger = Math.min(danger, p.hpFrac);
    this.bus.emit('battle:danger', { intensity: 1 - danger });
    return danger;
  }
}
