import * as THREE from 'three';
import { events, Events } from '../core/events.js';
import { turnQueue } from './turn-queue.js';
import { reactionSystem } from './reaction-system.js';
import { executeAttack, calculateAPGain, canUseSkill, calculateActionCost } from './action-resolver.js';
import { combatAnimations } from './combat-animations.js';
import { getCamera } from '../engine/renderer.js';

// Main battle state machine

export const BattleState = {
  IDLE: 'IDLE',
  PLAYER_TURN: 'PLAYER_TURN',
  ACTION_SELECT: 'ACTION_SELECT',
  ACTION_RESOLVE: 'ACTION_RESOLVE',
  ENEMY_TURN: 'ENEMY_TURN',
  TELEGRAPH: 'TELEGRAPH',
  REACTION: 'REACTION',
  RESOLVE: 'RESOLVE',
  VICTORY: 'VICTORY',
  DEFEAT: 'DEFEAT'
};

export class BattleSystem {
  constructor() {
    this.state = BattleState.IDLE;
    this.party = [];
    this.enemies = [];
    this.activeEntity = null;
    this.rng = null;
    
    // Victory/defeat conditions
    this.victoryCondition = 'all_enemies_defeated';
    this.defeatCondition = 'all_party_defeated';
  }

  init(party, enemies) {
    this.party = party.filter(c => c.hp > 0);
    this.enemies = enemies.filter(e => e.hp > 0);
    this.rng = getCombatRNG();

    // Initialize turn queue
    turnQueue.initialize(this.party, this.enemies);

    // Set up event listeners
    this.setupEventListeners();

    // Start first turn
    this.startTurn();
  }

  setupEventListeners() {
    events.on(Events.PARRY_SUCCESS, (data) => {
      // Handle parry success - may trigger counter
    });

    events.on(Events.COUNTER_TRIGGERED, (data) => {
      // Execute counterattack
      this.executeCounter(data.defender, data.target);
    });

    events.on(Events.VICTORY, () => {
      this.state = BattleState.VICTORY;
    });

    events.on(Events.DEFEAT, () => {
      this.state = BattleState.DEFEAT;
    });
  }

  update(deltaTime) {
    // Update reaction system (handles real-time parry/dodge)
    if (this.state === BattleState.REACTION || this.state === BattleState.TELEGRAPH) {
      reactionSystem.update(deltaTime);
    }

    // Check victory/defeat conditions
    this.checkBattleEnd();
  }

  checkBattleEnd() {
    const aliveParty = this.party && this.party.filter ? this.party.filter(c => c.hp > 0) : [];
    const aliveEnemies = this.enemies && this.enemies.filter ? this.enemies.filter(e => e.hp > 0) : [];

    console.log('checkBattleEnd:', aliveParty.length, 'alive party,', aliveEnemies.length, 'alive enemies');

    if (aliveEnemies.length === 0) {
      console.log('VICTORY!');
      events.emit(Events.VICTORY, { party: aliveParty });
      return true;
    }

    if (aliveParty.length === 0) {
      console.log('DEFEAT!');
      events.emit(Events.DEFEAT, { enemies: aliveEnemies });
      return true;
    }

    return false;
  }

  startTurn() {
    const entity = turnQueue.getNextEntity();
    
    if (!entity) {
      console.error('No entity available for turn');
      return;
    }

    this.activeEntity = entity;
    
    // Set active entity for reaction system
    if (entity.side === 'player') {
      window.__activeCharacter = entity;
    } else {
      window.__activeEnemy = entity;
    }

    if (entity.side === 'player') {
      this.state = BattleState.PLAYER_TURN;
      events.emit(Events.TURN_STARTED, { entity, side: 'player' });
      
      // Auto-transition to action select after brief delay
      setTimeout(() => {
        if (this.state === BattleState.PLAYER_TURN) {
          this.state = BattleState.ACTION_SELECT;
          // Open the battle menu for player input
          if (window.__battleMenu) {
            window.__battleMenu.open(entity);
          }
          events.emit(Events.ACTION_SELECTED, { mode: 'select' });
        }
      }, 500);
    } else {
      this.state = BattleState.ENEMY_TURN;
      events.emit(Events.TURN_STARTED, { entity, side: 'enemy' });
      
      // Enemy AI acts after delay
      setTimeout(() => {
        if (this.state === BattleState.ENEMY_TURN) {
          this.executeEnemyAction();
        }
      }, 1000);
    }

    events.emit(Events.HUD_UPDATE, { 
      turnQueue: turnQueue.getUpcomingTurns(),
      activeEntity: entity 
    });
  }

  selectAction(actionType, skill = null) {
    if (this.state !== BattleState.ACTION_SELECT) return false;

    const character = this.activeEntity;

    if (actionType === 'attack') {
      // Basic attack builds AP
      this.executeBasicAttack(character);
    } else if (actionType === 'skill' && skill) {
      if (canUseSkill(character, skill)) {
        this.executeSkill(character, skill);
      }
    } else if (actionType === 'dodge') {
      // Defensive stance - skip turn but gain AP
      character.ap = Math.min(character.stats.maxAP, character.ap + 1);
      events.emit(Events.ACTION_RESOLVED, { 
        action: 'dodge', 
        apGain: 1 
      });
      this.endTurn();
    }

    return true;
  }

  executeBasicAttack(character) {
    this.state = BattleState.ACTION_RESOLVE;

    // Select random enemy target
    const target = this.selectRandomTarget(this.enemies);
    
    if (!target) {
      this.endTurn();
      return;
    }

    // Execute attack with visual feedback
    const result = executeAttack(character, target, {
      baseDamage: character.stats.attack * 0.8,
      isCrit: Math.random() < 0.1 // 10% crit chance for basic attacks
    });

    // Trigger visual effects
    if (character.mesh && target.mesh && window.__combatAnimations) {
      const anims = window.__combatAnimations;
      
      // Attack animation
      anims.animateAttack(character.mesh, target.mesh, () => {
        console.log('Attack animation complete');
      });
      
      // Hit spark effect
      const hitPos = target.mesh.position.clone();
      hitPos.y += 1.5;
      const sparks = anims.createHitSpark(hitPos, result.isCrit ? 0xff0000 : 0xffff00);
      window.__hitSparks = window.__hitSparks || [];
      window.__hitSparks.push(...sparks);
      
      // Damage number
      const damageNum = anims.createDamageNumber(
        target.mesh.position.clone().add(new THREE.Vector3(0, 2.5, 0)),
        result.damage,
        result.isCrit
      );
      window.__damageNumbers = window.__damageNumbers || [];
      window.__damageNumbers.push(damageNum);
      
      // Screen shake on hit
      const camera = getCamera();
      if (camera) {
        anims.shakeCamera(camera, result.isCrit ? 1.0 : 0.5, 200);
      }
    }

    // Emit results
    events.emit(Events.ACTION_RESOLVED, {
      action: 'attack',
      attacker: character,
      target,
      damage: result.damage,
      isCrit: result.isCrit,
      weaknessResist: result.weaknessResist
    });

    // Grant AP for basic attack
    const apGain = calculateAPGain('basicAttack');
    character.ap = Math.min(character.stats.maxAP, character.ap + apGain);

    this.endTurn();
  }

  executeSkill(character, skill) {
    this.state = BattleState.ACTION_RESOLVE;

    // Deduct AP cost
    const cost = calculateActionCost(skill);
    character.ap -= cost;

    // Select target (may be ally for heals)
    let target;
    if (skill.targetType === 'enemy') {
      target = this.selectRandomTarget(this.enemies);
    } else if (skill.targetType === 'ally') {
      target = this.selectRandomTarget(this.party);
    } else if (skill.targetType === 'self') {
      target = character;
    }

    if (!target) {
      this.endTurn();
      return;
    }

    // Apply skill effect
    const result = this.applySkillEffect(character, target, skill);

    events.emit(Events.ACTION_RESOLVED, {
      action: 'skill',
      skill: skill.name,
      attacker: character,
      target,
      ...result
    });

    this.endTurn();
  }

  applySkillEffect(caster, target, skill) {
    if (skill.effect === 'damage') {
      const result = executeAttack(caster, target, {
        baseDamage: skill.power || caster.stats.attack,
        element: skill.element,
        isCrit: false
      });
      return { damage: result.damage, isCrit: result.isCrit };
    } else if (skill.effect === 'heal') {
      const healAmount = this.calculateHeal(caster, skill.power);
      target.hp = Math.min(target.stats.maxHP, target.hp + healAmount);
      return { heal: healAmount };
    } else if (skill.effect === 'buff') {
      // Apply status effect
      target.buffs.push({ type: skill.status, duration: 3 });
      return { buff: skill.status };
    }

    return {};
  }

  calculateHeal(caster, baseHeal) {
    return Math.round(baseHeal * (caster.stats.magic / 20));
  }

  selectRandomTarget(targets) {
    if (!targets || !Array.isArray(targets)) return null;
    const alive = targets.filter(t => t && t.hp > 0);
    if (alive.length === 0) return null;
    return alive[Math.floor(Math.random() * alive.length)];
  }

  endTurn() {
    // Check for victory/defeat
    if (!this.checkBattleEnd()) {
      this.startTurn();
    }
  }

  executeEnemyAction() {
    const enemy = this.activeEntity;
    if (!enemy) {
      console.error('No active enemy for action');
      this.endTurn();
      return;
    }
    
    // Advanced AI: select attack based on situation
    const aliveParty = this.party && this.party.filter ? this.party.filter(p => p.hp > 0) : [];
    if (aliveParty.length === 0) {
      this.endTurn();
      return;
    }

    // Choose target (focus lowest HP or random)
    let target;
    if (Math.random() < 0.3 && aliveParty.length > 1) {
      // Target lowest HP party member 30% of the time
      target = aliveParty.reduce((lowest, p) => p.hp < lowest.hp ? p : lowest);
    } else {
      target = this.selectRandomTarget(aliveParty);
    }

    if (!target) {
      this.endTurn();
      return;
    }

    // Execute attack with visual feedback
    const isCrit = Math.random() < 0.12; // 12% crit chance for enemies
    const damageResult = executeAttack(enemy, target, {
      baseDamage: enemy.stats.attack * 1.1,
      isCrit: isCrit
    });

    // Trigger visual effects
    if (enemy.mesh && target.mesh && window.__combatAnimations) {
      const anims = window.__combatAnimations;
      
      anims.animateAttack(enemy.mesh, target.mesh, () => {
        console.log('Enemy attack complete');
      });
      
      const hitPos = target.mesh.position.clone();
      hitPos.y += 1.0;
      const sparks = anims.createHitSpark(hitPos, isCrit ? 0xff0000 : 0xffff55);
      window.__hitSparks = window.__hitSparks || [];
      window.__hitSparks.push(...sparks);
      
      const damageNum = anims.createDamageNumber(
        target.mesh.position.clone().add(new THREE.Vector3(0, 2.5, 0)),
        damageResult.damage,
        isCrit
      );
      window.__damageNumbers = window.__damageNumbers || [];
      window.__damageNumbers.push(damageNum);
      
      const camera = getCamera();
      if (camera) {
        anims.shakeCamera(camera, isCrit ? 1.2 : 0.6, 250);
      }
    }

    events.emit(Events.ACTION_RESOLVED, {
      action: 'enemy-attack',
      attacker: enemy,
      target,
      damage: damageResult.damage,
      isCrit: isCrit
    });

    this.endTurn();
  }

  executeCounter(character, enemy) {
    // Quick counterattack after perfect parry
    const result = executeAttack(character, enemy, {
      baseDamage: character.stats.attack * 0.6,
      isCrit: false
    });

    events.emit(Events.ACTION_RESOLVED, {
      action: 'counter',
      attacker: character,
      target: enemy,
      damage: result.damage,
      isCounter: true
    });
  }

  selectLowestHP(targets) {
    const alive = targets.filter(t => t.hp > 0);
    if (alive.length === 0) return null;
    
    return alive.reduce((lowest, t) => 
      t.hp < lowest.hp ? t : lowest
    );
  }

  getParty() { return this.party; }
  getEnemies() { return this.enemies; }
  getState() { return this.state; }
  getActiveEntity() { return this.activeEntity; }
}

export const battleSystem = new BattleSystem();

// Import required dependencies
import { getCombatRNG } from '../core/rng.js';
