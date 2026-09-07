/**
 * Top-level combat state machine.
 * States: Init → PlayerTurn → ActionSelect → PlayerAction → EnemyTurn → Telegraph → Reaction → Resolve → loop
 *         → Victory / Defeat
 */

import { EventBus } from '../core/events.js';
import { TurnQueue } from './turn-queue.js';
import { ReactionSystem, ReactionResult } from './reaction-system.js';
import { resolveAttack, addStatusEffect, hasStatusEffect, StatusEffects, Elements } from './action-resolver.js';
import { RNG } from '../core/rng.js';

export const BattleState = {
  INIT: 'init',
  PLAYER_TURN: 'player_turn',
  ACTION_SELECT: 'action_select',
  PLAYER_ACTION: 'player_action',
  ENEMY_TURN: 'enemy_turn',
  TELEGRAPH: 'telegraph',
  REACTION: 'reaction',
  RESOLVE: 'resolve',
  VICTORY: 'victory',
  DEFEAT: 'defeat',
  AIM_MODE: 'aim_mode',
};

export class BattleSystem {
  constructor() {
    this.events = new EventBus();
    this.state = BattleState.INIT;
    this.turnQueue = new TurnQueue();
    this.reactionSystem = new ReactionSystem();
    this.rng = new RNG(42);

    this.party = [];
    this.enemies = [];
    this.currentActor = null;
    this.currentTarget = null;
    this.currentSkill = null;

    // Ultimate meter (0..100)
    this.ultimateMeter = 0;

    // Previous state for transitions
    this._pendingState = null;
    this._enemyAttackData = null;
    this._actionCallback = null;

    // Setup reaction callbacks
    this.reactionSystem._onHitResult = (result, hitIdx) => {
      this.events.emit('reaction-hit', { result, hitIndex: hitIdx });
    };
    this.reactionSystem._onResult = (results) => {
      this.events.emit('reaction-complete', { results });
      this._afterReaction(results);
    };
    this.reactionSystem._onTelegraphStart = (hitCount, attackType) => {
      this.events.emit('telegraph-start', { hitCount, attackType });
    };
    this.reactionSystem._onComboUpdate = (combo) => {
      this.events.emit('combo-update', { combo });
    };
  }

  init(party, enemies) {
    this.party = party;
    this.enemies = enemies;
    this.turnQueue.clear();
    for (const c of party) this.turnQueue.add(c);
    for (const e of enemies) this.turnQueue.add(e);
    this.ultimateMeter = 0;
    this.reactionSystem.reset();
    this.state = BattleState.INIT;
    this.events.emit('battle-start', { party, enemies });
    // Start the first turn
    this._nextTurn();
  }

  _transitionTo(newState) {
    this.state = newState;
    this.events.emit('state-change', { state: newState });
  }

  /** Called when it's a player character's turn. Accepts the actor whose turn it is. */
  startPlayerTurn(actor) {
    if (!actor || !this.party.includes(actor)) {
      this._nextTurn();
      return;
    }
    this.currentActor = actor;
    // Restore AP each turn (partial)
    actor.ap = Math.min(actor.maxAp, actor.ap + 2);
    this._transitionTo(BattleState.ACTION_SELECT);
    this.events.emit('player-turn-start', { character: actor });
  }

  /** Called when it's an enemy's turn. Accepts the actor whose turn it is. */
  startEnemyTurn(actor) {
    if (!actor || this.party.includes(actor)) {
      this._nextTurn();
      return;
    }
    this.currentActor = actor;

    // Enemy AI: pick target and attack
    const target = this.rng.pick(this.party.filter(c => c.hp > 0));
    if (!target) { this._nextTurn(); return; }
    this.currentTarget = target;

    const attack = actor.chooseAttack(this.rng, target);
    this.currentSkill = attack;

    // Start telegraph
    this._startEnemyTelegraph(actor, target, attack);
  }

  _startEnemyTelegraph(attacker, target, attack) {
    const telegraphDuration = attack.telegraphTime || 1.2;
    const hitDelays = attack.hitDelays || [];
    const attackType = attack.attackType || 'normal';

    this._enemyAttackData = { attacker, target, attack };

    this._transitionTo(BattleState.TELEGRAPH);
    this.events.emit('enemy-telegraph', {
      attacker,
      target,
      attack,
      telegraphDuration,
      hitCount: 1 + hitDelays.length,
      attackType,
    });

    // Start the reaction system
    this.reactionSystem.startTelegraph(telegraphDuration, hitDelays, attackType);
    this._transitionTo(BattleState.REACTION);
  }

  _afterReaction(results) {
    const { attacker, target, attack } = this._enemyAttackData;
    let totalDamage = 0;
    let parryCount = 0;
    let dodgeCount = 0;

    for (const result of results) {
      if (result === ReactionResult.PARRY) {
        parryCount++;
        // Parry: no damage, gain AP, trigger counter
        target.ap = Math.min(target.maxAp, target.ap + 2);
        this.ultimateMeter = Math.min(100, this.ultimateMeter + 5);
        this.events.emit('parry-success', { character: target });
      } else if (result === ReactionResult.DODGE) {
        dodgeCount++;
        // Dodge: no damage
        this.events.emit('dodge-success', { character: target });
      } else {
        // Miss or blocked — take damage
        const hitDmg = Math.max(1, Math.round(
          (attack.damage || attacker.atk) * this.rng.range(0.9, 1.1) - (target.def || 0) * 0.5
        ));
        totalDamage += hitDmg;
        this.ultimateMeter = Math.min(100, this.ultimateMeter + 2);
      }
    }

    if (totalDamage > 0) {
      target.hp = Math.max(0, target.hp - totalDamage);
      target.stagger = Math.min(100, target.stagger + totalDamage * 0.3);
      this.events.emit('damage-dealt', { target, damage: totalDamage, attacker });
    }

    // Apply status from enemy attack
    if (attack.statusEffect && results.some(r => r === ReactionResult.MISS)) {
      addStatusEffect(target, {
        type: attack.statusEffect,
        duration: attack.statusDuration || 2,
        value: attack.statusValue || 5,
      });
      this.events.emit('status-applied', { entity: target, effect: attack.statusEffect });
    }

    // Counterattack on parry
    if (parryCount > 0) {
      const counterDmg = Math.round(target.atk * 0.6 * parryCount);
      attacker.hp = Math.max(0, attacker.hp - counterDmg);
      attacker.stagger = Math.min(100, attacker.stagger + counterDmg * 0.4);
      this.events.emit('counter-attack', { attacker: target, target: attacker, damage: counterDmg });
    }

    this.events.emit('enemy-turn-resolved', {
      attacker, target, attack, results, totalDamage, parryCount, dodgeCount,
    });

    // Check for stagger break
    if (attacker.stagger >= 100) {
      attacker.stagger = 0;
      addStatusEffect(attacker, { type: StatusEffects.STUN, duration: 1, value: 0 });
      this.events.emit('stagger-break', { entity: attacker });
    }

    this._enemyAttackData = null;
    this._checkBattleEnd();
    if (this.state !== BattleState.VICTORY && this.state !== BattleState.DEFEAT) {
      this._transitionTo(BattleState.RESOLVE);
      this._nextTurn();
    }
  }

  /** Player executes an attack action. */
  executePlayerAttack(skill, target) {
    if (!this.currentActor || !target) return;
    const actor = this.currentActor;

    this._transitionTo(BattleState.PLAYER_ACTION);
    const result = resolveAttack(actor, target, skill, this.rng);

    // Apply results
    if (result.damage > 0) {
      target.hp = Math.max(0, target.hp - result.damage);
      target.stagger = Math.min(100, target.stagger + result.staggerDamage);
    }
    if (result.heal > 0) {
      target.hp = Math.min(target.maxHp, target.hp + result.heal);
    }

    // AP economy
    actor.ap = Math.max(0, actor.ap - result.apSpent);
    actor.ap = Math.min(actor.maxAp, actor.ap + result.apGained);

    // Status effects
    for (const se of result.statusEffects) {
      addStatusEffect(target, se);
    }

    // Ultimate meter
    if (result.isWeakness) this.ultimateMeter = Math.min(100, this.ultimateMeter + 8);
    if (result.isCrit) this.ultimateMeter = Math.min(100, this.ultimateMeter + 3);

    this.events.emit('action-resolved', { actor, target, result, skill });

    // Check stagger break
    if (target.stagger >= 100) {
      target.stagger = 0;
      addStatusEffect(target, { type: StatusEffects.STUN, duration: 1, value: 0 });
      this.events.emit('stagger-break', { entity: target });
    }

    this._checkBattleEnd();
    if (this.state !== BattleState.VICTORY && this.state !== BattleState.DEFEAT) {
      this._nextTurn();
    }
  }

  /** Free-aim ranged attack with weak point targeting. */
  executeAimedAttack(aimData) {
    if (!this.currentActor) return;
    const actor = this.currentActor;
    const { target, hitWeakPoint } = aimData;

    this._transitionTo(BattleState.PLAYER_ACTION);

    let baseDmg = Math.round(actor.atk * 1.2); // aimed shots do more base
    let multiplier = 1;
    let isCrit = this.rng.chance(0.15);
    let isWeakness = false;

    if (hitWeakPoint) {
      multiplier *= 2;
      isWeakness = true;
      this.ultimateMeter = Math.min(100, this.ultimateMeter + 10);
    }
    if (isCrit) multiplier *= 1.8;

    const damage = Math.max(1, Math.round(baseDmg * multiplier * this.rng.range(0.9, 1.1)));
    target.hp = Math.max(0, target.hp - damage);
    target.stagger = Math.min(100, target.stagger + damage * 0.5);

    actor.ap = Math.min(actor.maxAp, actor.ap + (hitWeakPoint ? 3 : 1));

    this.events.emit('action-resolved', {
      actor, target,
      result: { damage, heal: 0, isCrit, isWeakness, apGained: hitWeakPoint ? 3 : 1, apSpent: 0, messages: [] },
      skill: { name: 'Aimed Shot', type: 'damage' },
    });

    this._checkBattleEnd();
    if (this.state !== BattleState.VICTORY && this.state !== BattleState.DEFEAT) {
      this._nextTurn();
    }
  }

  /** Execute ultimate attack. */
  executeUltimate() {
    if (this.ultimateMeter < 100) return;
    this.ultimateMeter = 0;
    this._transitionTo(BattleState.PLAYER_ACTION);

    const livingEnemies = this.enemies.filter(e => e.hp > 0);
    let totalDmg = 0;

    for (const enemy of livingEnemies) {
      const dmg = Math.round(this.currentActor.atk * 2.5);
      enemy.hp = Math.max(0, enemy.hp - dmg);
      enemy.stagger = 100; // guaranteed stagger
      totalDmg += dmg;
      this.events.emit('action-resolved', {
        actor: this.currentActor, target: enemy,
        result: { damage: dmg, heal: 0, isCrit: true, isWeakness: false, apGained: 0, apSpent: 0, messages: ['Ultimate!'] },
        skill: { name: 'Ultimate', type: 'ultimate' },
      });
    }

    this.events.emit('ultimate-executed', { totalDamage: totalDmg });
    this._checkBattleEnd();
    if (this.state !== BattleState.VICTORY && this.state !== BattleState.DEFEAT) {
      this._nextTurn();
    }
  }

  _nextTurn() {
    console.log('[BattleSystem] _nextTurn called, current state:', this.state);
    // Don't advance if we're still in REACTION or TELEGRAPH state
    if (this.state === BattleState.REACTION || this.state === BattleState.TELEGRAPH) {
      console.log('[BattleSystem] skipping _nextTurn, still in reaction/telegraph');
      return;
    }
    // Don't advance if the battle is already over
    if (this.state === BattleState.VICTORY || this.state === BattleState.DEFEAT) {
      console.log('[BattleSystem] skipping _nextTurn, battle already over:', this.state);
      return;
    }
    // Remove dead combatants
    for (const c of [...this.party]) {
      if (c.hp <= 0) this.turnQueue.remove(c);
    }
    for (const e of [...this.enemies]) {
      if (e.hp <= 0) this.turnQueue.remove(e);
    }

    const next = this.turnQueue.advance();
    console.log('[BattleSystem] next actor:', next?.name || 'none');
    if (!next) {
      console.log('[BattleSystem] no next actor, returning');
      return;
    }

    // Check if stunned — skip turn
    if (hasStatusEffect(next, StatusEffects.STUN)) {
      this.events.emit('turn-skipped', { entity: next, reason: 'stunned' });
      this._nextTurn();
      return;
    }

    if (this.party.includes(next)) {
      console.log('[BattleSystem] starting player turn for', next.name);
      this.startPlayerTurn(next);
    } else {
      console.log('[BattleSystem] starting enemy turn for', next.name);
      this.startEnemyTurn(next);
    }
  }

  _checkBattleEnd() {
    const partyAlive = this.party.some(c => c.hp > 0);
    const enemiesAlive = this.enemies.some(e => e.hp > 0);

    if (!enemiesAlive) {
      this._transitionTo(BattleState.VICTORY);
      this.events.emit('battle-victory', { party: this.party });
    } else if (!partyAlive) {
      this._transitionTo(BattleState.DEFEAT);
      this.events.emit('battle-defeat', { party: this.party });
    }
  }

  /** Get living enemies for targeting. */
  getLivingEnemies() {
    return this.enemies.filter(e => e.hp > 0);
  }

  getLivingParty() {
    return this.party.filter(c => c.hp > 0);
  }
}
