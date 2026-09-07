/**
 * Top-level combat state machine.
 * States: PlayerTurn → ActionSelect → ExecuteAction → EnemyTurn → Reaction → Resolve
 *         → Victory / Defeat
 */

import { events } from '../core/events.js';
import { clamp } from '../core/rng.js';
import { ReactionSystem, TelegraphedAttack, AttackHit, TelegraphState } from './reaction-system.js';
import { TurnQueue } from './turn-queue.js';
import { ActionResolver } from './action-resolver.js';

/** Battle states */
export const BattleState = {
    IDLE: 'idle',
    PLAYER_TURN: 'player_turn',
    ACTION_SELECT: 'action_select',
    AIMING: 'aiming',
    EXECUTE_ACTION: 'execute_action',
    ENEMY_TURN: 'enemy_turn',
    REACTION_PHASE: 'reaction_phase',
    RESOLVE: 'resolve',
    VICTORY: 'victory',
    DEFEAT: 'defeat',
    ANIMATING: 'animating'
};

export class BattleSystem {
    constructor(options) {
        this.state = BattleState.IDLE;
        this.party = options.party || [];
        this.enemies = options.enemies || [];
        this.activeCharacter = null;
        this.activeEnemy = null;
        this.selectedTarget = null;

        this.rng = options.rng;
        this.turnQueue = new TurnQueue(this.rng);
        this.reactionSystem = new ReactionSystem();
        this.actionResolver = new ActionResolver(this.rng);

        this.animTimer = 0;
        this.animDuration = 0;
        this.pendingAction = null;
        this.pendingCallback = null;

        this.aimReticle = null;
        this.aimTarget = null;

        this.wave = 1;
        this.xp = 0;

        // Previous state for transitions
        this.previousState = null;
    }

    /** Initialize the battle with all combatants */
    init() {
        // Build turn queue from all living combatants
        this.turnQueue.clear();
        for (const ch of this.party) {
            if (ch.isAlive) this.turnQueue.add(ch);
        }
        for (const en of this.enemies) {
            if (en.isAlive) this.turnQueue.add(en);
        }
        this.turnQueue.sort();
        this.state = BattleState.PLAYER_TURN;
        this._advanceToNextTurn();
    }

    /** Advance to the next turn in the queue */
    _advanceToNextTurn() {
        // Check win/lose conditions first
        if (this._checkEndConditions()) return;

        const next = this.turnQueue.next();
        if (!next) {
            this.turnQueue.sort();
            this._advanceToNextTurn();
            return;
        }

        if (next.isEnemy) {
            this.activeEnemy = next;
            this.state = BattleState.ENEMY_TURN;
            events.emit('turn-started', { combatant: next, isEnemy: true });
            this._startEnemyTurn(next);
        } else {
            this.activeCharacter = next;
            this.state = BattleState.ACTION_SELECT;
            events.emit('turn-started', { combatant: next, isEnemy: false });
        }
    }

    /** Check victory/defeat conditions */
    _checkEndConditions() {
        const partyAlive = this.party.some(c => c.isAlive);
        const enemiesAlive = this.enemies.some(e => e.isAlive);

        if (!enemiesAlive) {
            this.state = BattleState.VICTORY;
            events.emit('victory', { wave: this.wave, xp: this.xp });
            return true;
        }
        if (!partyAlive) {
            this.state = BattleState.DEFEAT;
            events.emit('defeat', {});
            return true;
        }
        return false;
    }

    /** Player selects a basic attack */
    selectBasicAttack(target) {
        if (this.state !== BattleState.ACTION_SELECT) return;
        if (!this.activeCharacter || !target) return;

        this.pendingAction = {
            type: 'basic_attack',
            actor: this.activeCharacter,
            target: target
        };
        this.state = BattleState.EXECUTE_ACTION;
        this._executeAction();
    }

    /** Player selects a skill */
    selectSkill(skill, target) {
        if (this.state !== BattleState.ACTION_SELECT) return;
        if (!this.activeCharacter || !skill) return;

        if (this.activeCharacter.ap < skill.cost) return; // Not enough AP

        this.pendingAction = {
            type: 'skill',
            actor: this.activeCharacter,
            skill: skill,
            target: target
        };
        this.activeCharacter.ap -= skill.cost;
        this.state = BattleState.EXECUTE_ACTION;
        events.emit('skill-used', { skill: skill.name, actor: this.activeCharacter });
        this._executeAction();
    }

    /** Enter free-aim mode */
    enterAimMode() {
        if (this.state !== BattleState.ACTION_SELECT) return;
        this.state = BattleState.AIMING;
        events.emit('aim-mode-entered', { actor: this.activeCharacter });
    }

    /** Confirm aim at a target (possibly a weak point) */
    confirmAim(target, weakPoint) {
        if (this.state !== BattleState.AIMING) return;

        this.pendingAction = {
            type: 'ranged_attack',
            actor: this.activeCharacter,
            target: target,
            weakPoint: weakPoint || null
        };
        this.state = BattleState.EXECUTE_ACTION;
        this._executeAction();
    }

    /** Cancel aim mode */
    cancelAim() {
        if (this.state !== BattleState.AIMING) return;
        this.state = BattleState.ACTION_SELECT;
    }

    /** Use an item (heal, etc.) */
    useItem(item, target) {
        if (this.state !== BattleState.ACTION_SELECT) return;
        if (!this.activeCharacter) return;

        this.pendingAction = {
            type: 'item',
            actor: this.activeCharacter,
            item: item,
            target: target || this.activeCharacter
        };
        this.state = BattleState.EXECUTE_ACTION;
        this._executeAction();
    }

    /** Execute the pending action */
    _executeAction() {
        const action = this.pendingAction;
        if (!action) return;

        const { actor, target, type } = action;

        // Animate the attack
        this._playAttackAnimation(actor, target, () => {
            let result;

            switch (type) {
                case 'basic_attack':
                    result = this.actionResolver.resolveBasicAttack(actor, target);
                    // Basic attack builds AP
                    actor.ap = Math.min(actor.maxAp, actor.ap + 1);
                    break;

                case 'skill':
                    result = this.actionResolver.resolveSkill(actor, target, action.skill);
                    break;

                case 'ranged_attack':
                    result = this.actionResolver.resolveRangedAttack(actor, target, action.weakPoint);
                    if (action.weakPoint) {
                        actor.ap = Math.min(actor.maxAp, actor.ap + 2);
                    } else {
                        actor.ap = Math.min(actor.maxAp, actor.ap + 1);
                    }
                    break;

                case 'item':
                    result = this.actionResolver.resolveItem(actor, target, action.item);
                    break;

                default:
                    result = { damage: 0, message: 'Unknown action' };
            }

            // Apply the result
            this._applyActionResult(result, actor, target);

            // End this character's turn
            this.pendingAction = null;
            this._endTurn();
        });
    }

    /** Apply action result to target */
    _applyActionResult(result, actor, target) {
        if (result.damage) {
            target.takeDamage(result.damage, result.element, result.isCrit);
            target.staggerBar = Math.min(100, target.staggerBar + (result.stagger || 5));

            // Check for stagger break
            if (target.staggerBar >= 100 && !target.isStaggered) {
                target.isStaggered = true;
                target.staggerBar = 0;
                target.staggerTimer = 3; // 3 turns staggered
                events.emit('stagger-break', { target });
            }

            events.emit('damage-dealt', {
                amount: result.damage,
                target: target,
                isCrit: result.isCrit,
                element: result.element
            });
        }

        if (result.heal) {
            target.heal(result.heal);
            events.emit('heal-dealt', { amount: result.heal, target });
        }

        if (result.status) {
            target.addStatus(result.status);
            events.emit('status-applied', { status: result.status, target });
        }

        if (result.buff) {
            target.addBuff(result.buff);
        }

        if (result.debuff) {
            target.addDebuff(result.debuff);
        }

        // AP gain from result
        if (result.apGain) {
            actor.ap = Math.min(actor.maxAp, actor.ap + result.apGain);
        }

        // Check for death
        if (target.hp <= 0) {
            target.die();
            events.emit('character-died', { target });
        }
    }

    /** Play a simple attack animation then callback */
    _playAttackAnimation(actor, target, callback) {
        this.state = BattleState.ANIMATING;
        this.animTimer = 0;
        this.animDuration = 0.5;
        this.pendingCallback = callback;
        this.animActor = actor;
        this.animTarget = target;

        // Set attack animation on actor
        if (actor.mesh && actor.setAnimation) {
            actor.setAnimation('attack');
        }
    }

    /** Update animation timer */
    _updateAnimation(dt) {
        if (this.state !== BattleState.ANIMATING) return;

        this.animTimer += dt;
        const progress = clamp(this.animTimer / this.animDuration, 0, 1);

        // At midpoint, trigger the "hit" frame
        if (progress >= 0.4 && progress < 0.5 && this.animTarget?.setAnimation) {
            this.animTarget.setAnimation('hit');
        }

        if (progress >= 1) {
            // Reset actor animation
            if (this.animActor?.setAnimation) {
                this.animActor.setAnimation('idle');
            }
            if (this.animTarget?.setAnimation) {
                this.animTarget.setAnimation('idle');
            }

            const cb = this.pendingCallback;
            this.pendingCallback = null;
            if (cb) cb();
        }
    }

    /** End current character's turn */
    _endTurn() {
        // Process status effects at turn end
        if (this.activeCharacter) {
            this.activeCharacter.processTurnEndStatus();
        }

        this._advanceToNextTurn();
    }

    /** ===== ENEMY TURN LOGIC ===== */

    _startEnemyTurn(enemy) {
        this.activeEnemy = enemy;

        // Select target
        const aliveParty = this.party.filter(c => c.isAlive);
        if (aliveParty.length === 0) {
            this._endEnemyTurn();
            return;
        }

        // Target selection logic
        let target;
        if (enemy.targetPreference === 'lowest_hp') {
            target = aliveParty.reduce((min, c) => c.hp < min.hp ? c : min, aliveParty[0]);
        } else if (enemy.targetPreference === 'highest_ap') {
            target = aliveParty.reduce((max, c) => c.ap > max.ap ? c : max, aliveParty[0]);
        } else {
            target = this.rng.pick(aliveParty);
        }

        enemy.currentTarget = target;

        // Choose attack based on enemy AI
        setTimeout(() => {
            if (this.state !== BattleState.ENEMY_TURN) return;
            this._startEnemyAttack(enemy, target);
        }, 500);
    }

    _startEnemyAttack(enemy, target) {
        // Pick an attack pattern from the enemy's move set
        const attackPattern = this._chooseEnemyAttack(enemy, target);
        if (!attackPattern) {
            this._endEnemyTurn();
            return;
        }

        // Create telegraphed attack
        const hits = attackPattern.hits.map(h => new AttackHit(h));
        const totalDuration = hits[hits.length - 1].delay + hits[hits.length - 1].windupTime + hits[hits.length - 1].warningTime + 0.5;

        const telegraph = new TelegraphedAttack({
            enemy: enemy,
            target: target,
            hits: hits,
            totalDuration: totalDuration
        });

        // Set enemy to attack animation
        if (enemy.setAnimation) {
            enemy.setAnimation('attack');
        }

        // Start the reaction phase
        this.reactionSystem.startTelegraph(telegraph);
        this.state = BattleState.REACTION_PHASE;
    }

    _chooseEnemyAttack(enemy, target) {
        // Simple AI: choose based on available attacks and randomness
        const attacks = enemy.attackPatterns || [];
        if (attacks.length === 0) {
            // Default single hit
            return {
                name: 'Basic Attack',
                hits: [{ delay: 0, windupTime: 0.7, warningTime: 0.3, damage: enemy.atk, stagger: 5, type: 'normal' }]
            };
        }

        // Weighted selection
        let totalWeight = 0;
        for (const atk of attacks) {
            totalWeight += atk.weight || 1;
        }

        let roll = this.rng.next() * totalWeight;
        for (const atk of attacks) {
            roll -= (atk.weight || 1);
            if (roll <= 0) return atk;
        }
        return attacks[attacks.length - 1];
    }

    /** Handle player reaction input during enemy turn */
    handleReactionInput(inputType) {
        if (this.state !== BattleState.REACTION_PHASE) return null;
        return this.reactionSystem.processInput(inputType);
    }

    /** Update reaction system */
    _updateReaction(dt) {
        if (this.state !== BattleState.REACTION_PHASE) return;

        this.reactionSystem.update(dt);

        // Check if telegraph is complete
        if (this.reactionSystem.state === TelegraphState.RECOVERING ||
            (this.reactionSystem.activeTelegraph &&
             this.reactionSystem.activeTelegraph.state === TelegraphState.RECOVERING)) {

            // Resolve the reaction results
            setTimeout(() => {
                this._resolveEnemyAttack();
            }, 300);
        }
    }

    /** Resolve the enemy attack after reaction phase */
    _resolveEnemyAttack() {
        const telegraph = this.reactionSystem.activeTelegraph;
        if (!telegraph) {
            this._endEnemyTurn();
            return;
        }

        const target = telegraph.target;

        for (let i = 0; i < telegraph.results.length; i++) {
            const result = telegraph.results[i];
            const hit = telegraph.hits[i];

            if (result.result === 'parry') {
                // Parry: no damage, gain AP, trigger counter
                target.ap = Math.min(target.maxAp, target.ap + 1);
                this.actionResolver.resolveCounterAttack(target, this.activeEnemy);
            } else if (result.result === 'dodge') {
                // Dodge: no damage
                // Nothing to apply
            } else {
                // Miss: take damage
                let dmg = hit.damage;

                // Apply stagger bonus
                if (target.isStaggered) {
                    dmg = Math.floor(dmg * 0.7); // Reduced damage when staggered
                }

                // Apply status tick damage
                target.takeDamage(dmg, hit.element);
                target.staggerBar = Math.min(100, target.staggerBar + (hit.stagger || 5));

                if (target.staggerBar >= 100 && !target.isStaggered) {
                    target.isStaggered = true;
                    target.staggerBar = 0;
                    target.staggerTimer = 3;
                }

                if (target.hp <= 0) {
                    target.die();
                    events.emit('character-died', { target });
                }
            }
        }

        // Reset enemy animation
        if (this.activeEnemy?.setAnimation) {
            this.activeEnemy.setAnimation('idle');
        }

        this._endEnemyTurn();
    }

    _endEnemyTurn() {
        // Process stagger timer
        for (const ch of this.party) {
            if (ch.isStaggered) {
                ch.staggerTimer--;
                if (ch.staggerTimer <= 0) {
                    ch.isStaggered = false;
                }
            }
        }
        for (const en of this.enemies) {
            if (en.isStaggered) {
                en.staggerTimer--;
                if (en.staggerTimer <= 0) {
                    en.isStaggered = false;
                }
            }
        }

        this.reactionSystem.cancelTelegraph();
        this._advanceToNextTurn();
    }

    /** Update per frame */
    update(dt) {
        if (this.state === BattleState.ANIMATING) {
            this._updateAnimation(dt);
        }
        if (this.state === BattleState.REACTION_PHASE) {
            this._updateReaction(dt);
        }
    }

    /** Skip current turn (for end-turn button) */
    skipTurn() {
        if (this.state !== BattleState.ACTION_SELECT) return;
        this._endTurn();
    }

    /** Get the current state string */
    getState() {
        return this.state;
    }

    /** Get upcoming turns for display */
    getUpcomingTurns(count = 5) {
        return this.turnQueue.getUpcoming(count);
    }

    /** Restart battle (after victory/defeat) */
    restart() {
        // Reset all characters
        for (const ch of this.party) {
            ch.hp = ch.maxHp;
            ch.ap = ch.maxAp;
            ch.staggerBar = 0;
            ch.isStaggered = false;
            ch.statuses = [];
            ch.buffs = [];
            ch.debuffs = [];
            ch.isAlive = true;
            if (ch.mesh) {
                ch.mesh.visible = true;
            }
        }
        // Reset all enemies
        for (const en of this.enemies) {
            en.hp = en.maxHp;
            en.staggerBar = 0;
            en.isStaggered = false;
            en.statuses = [];
            en.isAlive = true;
            if (en.mesh) {
                en.mesh.visible = true;
            }
        }

        this.state = BattleState.IDLE;
        this.wave = 1;
        this.xp = 0;
        this.reactionSystem = new ReactionSystem();
        this.turnQueue = new TurnQueue(this.rng);
        this.init();
    }
}
