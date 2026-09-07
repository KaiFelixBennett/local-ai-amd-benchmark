/**
 * Game orchestrator: owns all systems, per-frame update(), routes input
 * to menu vs. reaction depending on battle state.
 */

import * as THREE from 'three';
import { Renderer } from './engine/renderer.js';
import { AudioSystem } from './engine/audio.js';
import { BattleSystem, BattleState } from './battle/battle-system.js';
import { Character } from './entities/character.js';
import { Enemy } from './entities/enemy.js';
import { HUD } from './ui/hud.js';
import { BattleMenu } from './ui/battle-menu.js';
import { ReactionPrompts } from './ui/prompts.js';
import { ParticleSystem } from './fx/particles.js';
import { DamageNumbers3D } from './fx/damage-numbers.js';
import { events } from './core/events.js';
import { RNG } from './core/rng.js';
import { clamp } from './core/rng.js';

export class Game {
    constructor() {
        // WebGL canvas (hidden behind UI canvas)
        this.glCanvas = document.createElement('canvas');
        this.glCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100vw;height:100vh;z-index:1;';
        document.body.appendChild(this.glCanvas);

        // UI canvas
        this.uiCanvas = document.getElementById('ui-canvas');

        // Systems
        this.renderer = null;
        this.audio = new AudioSystem();
        this.hud = new HUD(this.uiCanvas);
        this.battleMenu = new BattleMenu(this.uiCanvas);
        this.reactionPrompts = new ReactionPrompts(this.uiCanvas);
        this.particles = null;
        this.damageNumbers = null;
        this.battle = null;

        // State
        this.running = false;
        this.lastTime = 0;
        this.keysDown = {};
        this.keysJustPressed = {};
        this.mousePos = new THREE.Vector2();
        this.aimRaycaster = new THREE.Raycaster();
        this.aimPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
        this.aimReticle = null;

        // Pending skill/target selection
        this.pendingSkill = null;
        this.pendingActionType = null;

        // Setup
        this.setupRenderer();
        this.setupBattle();
        this.setupInput();
        this.setupEventListeners();
        this.setupAimReticle();
    }

    setupRenderer() {
        this.renderer = new Renderer(this.glCanvas);
        this.particles = new ParticleSystem(this.renderer.scene);
        this.damageNumbers = new DamageNumbers3D(this.renderer.scene);
    }

    setupBattle() {
        const rng = new RNG(42); // Seedable

        // Create party
        this.party = [
            new Character('warden', new THREE.Vector3(-3, 0, 6)),
            new Character('arcanist', new THREE.Vector3(0, 0, 6)),
            new Character('chronos', new THREE.Vector3(3, 0, 6)),
            new Character('phantom', new THREE.Vector3(-1.5, 0, 4))
        ];

        // Create enemies
        this.enemies = [
            new Enemy('iron_hound', new THREE.Vector3(-3, 0, -4)),
            new Enemy('shadow_weaver', new THREE.Vector3(2, 0, -5)),
            new Enemy('obsidian_golem', new THREE.Vector3(0, 0, -7))
        ];

        // Add meshes to scene
        for (const ch of this.party) {
            this.renderer.scene.add(ch.mesh);
        }
        for (const en of this.enemies) {
            this.renderer.scene.add(en.mesh);
        }

        // Create battle system
        this.battle = new BattleSystem({
            party: this.party,
            enemies: this.enemies,
            rng: rng
        });

        // Items
        this.items = [
            { name: 'Health Tonic', type: 'heal', value: 60 },
            { name: 'Ether', type: 'ap_restore', value: 3 },
            { name: 'Bomb', type: 'damage', value: 40 }
        ];
        this.itemCounts = [2, 2, 1];
    }

    setupAimReticle() {
        const geo = new THREE.RingGeometry(0.15, 0.25, 24);
        const mat = new THREE.MeshBasicMaterial({
            color: 0xff4444,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        this.aimReticle = new THREE.Mesh(geo, mat);
        this.aimReticle.visible = false;
        this.renderer.scene.add(this.aimReticle);
    }

    setupInput() {
        // Keyboard
        window.addEventListener('keydown', (e) => {
            if (this.keysDown[e.code]) return;
            this.keysDown[e.code] = true;
            this.keysJustPressed[e.code] = true;

            // Initialize audio on first input
            this.audio.init();
            this.audio.resume();

            this.handleKeyPress(e.code);
        });

        window.addEventListener('keyup', (e) => {
            this.keysDown[e.code] = false;
        });

        // Mouse
        window.addEventListener('mousemove', (e) => {
            this.mousePos.x = (e.clientX / window.innerWidth) * 2 - 1;
            this.mousePos.y = -(e.clientY / window.innerHeight) * 2 + 1;
        });

        window.addEventListener('click', (e) => {
            this.audio.init();
            this.audio.resume();
            this.handleMouseClick(e);
        });
    }

    setupEventListeners() {
        // Battle events
        events.on('turn-started', (data) => {
            if (!data.isEnemy && data.combatant) {
                // Camera to active character
                const pos = data.combatant.mesh.position;
                this.renderer.setCameraTarget(
                    new THREE.Vector3(pos.x, pos.y + 3, pos.z + 8),
                    new THREE.Vector3(pos.x, pos.y + 1, pos.z - 2),
                    0.4
                );
            }
        });

        events.on('damage-dealt', (data) => {
            // 3D damage number
            if (data.target && data.target.mesh) {
                this.damageNumbers.spawn(
                    data.target.mesh.position.clone(),
                    data.amount.toString(),
                    'damage',
                    data.isCrit
                );
                // HUD damage number
                this.hud.addDamageNumber(
                    window.innerWidth / 2 + (Math.random() - 0.5) * 100,
                    window.innerHeight / 2,
                    data.amount,
                    'damage',
                    data.isCrit
                );
            }
            // SFX
            if (data.isCrit) this.audio.playCrit();
            else this.audio.playHit(data.amount > 25);

            // Particles
            if (data.target && data.target.mesh) {
                this.particles.spawnImpact(data.target.mesh.position.clone(), 0xff6644, 15);
            }

            // Screen flash
            this.hud.flash(data.isCrit ? '#ff4422' : '#ff8866', 0.15, 0.1);
        });

        events.on('heal-dealt', (data) => {
            if (data.target && data.target.mesh) {
                this.damageNumbers.spawn(
                    data.target.mesh.position.clone(),
                    `+${data.amount}`,
                    'heal'
                );
                this.particles.spawnSkillEffect(data.target.mesh.position.clone(), 0x44ff88, 'heal');
            }
            this.audio.playHeal();
            this.hud.flash('#44ff88', 0.1, 0.1);
        });

        events.on('parry-success', (data) => {
            this.audio.playParry();
            this.hud.flash('#ffd700', 0.3, 0.2);
            this.hud.slowMo(0.15);

            // Parry particles
            if (data.target && data.target.mesh) {
                this.particles.spawnParryFlash(data.target.mesh.position.clone());
            }

            this.reactionPrompts.setResult('parry', data.combo, data.flow);
        });

        events.on('dodge-success', () => {
            this.audio.playDodge();
            this.hud.flash('#66ccff', 0.15, 0.15);
            this.reactionPrompts.setResult('dodge');
        });

        events.on('hit-landed', () => {
            this.reactionPrompts.setResult('miss');
        });

        events.on('attack-telegraphed', () => {
            this.audio.playTelegraph();
        });

        events.on('counter-triggered', () => {
            this.audio.playCounter();
        });

        events.on('stagger-break', () => {
            this.audio.playStatus();
            this.hud.flash('#ffcc00', 0.2, 0.2);
        });

        events.on('skill-used', () => {
            this.audio.playSkill();
        });

        events.on('status-applied', () => {
            this.audio.playStatus();
        });

        events.on('character-died', (data) => {
            if (data.target && data.target.mesh) {
                this.particles.spawnDeathDissolve(
                    data.target.mesh.position.clone(),
                    data.target.isEnemy ? 0x442222 : 0x224466,
                    50
                );
            }
        });

        events.on('victory', () => {
            this.audio.stopBattleMusic();
            this.audio.playVictory();
            this.battleMenu.hide();
            document.getElementById('overlay').classList.add('active');
            document.getElementById('victory-panel').style.display = 'block';
            document.getElementById('defeat-panel').style.display = 'none';
        });

        events.on('defeat', () => {
            this.audio.stopBattleMusic();
            this.audio.playDefeat();
            this.battleMenu.hide();
            document.getElementById('overlay').classList.add('active');
            document.getElementById('defeat-panel').style.display = 'block';
            document.getElementById('victory-panel').style.display = 'none';
        });
    }

    handleKeyPress(code) {
        const state = this.battle.getState();

        // Reaction inputs (during enemy turn)
        if (state === BattleState.REACTION_PHASE) {
            if (code === 'Space') {
                const result = this.battle.handleReactionInput('parry');
                if (result) {
                    this.battle.reactionSystem.results[result.hitIndex] = result;
                    this.battle.reactionSystem.onHitResult(result);

                    if (result.result === 'parry') {
                        // Trigger counter
                        const counterResult = this.battle.actionResolver.resolveCounterAttack(
                            this.battle.reactionSystem.activeTelegraph.target,
                            this.battle.activeEnemy
                        );
                        this.battle.activeEnemy.takeDamage(counterResult.damage, null, false);
                        this.battle.activeEnemy.staggerBar = Math.min(100, this.battle.activeEnemy.staggerBar + counterResult.stagger);
                        events.emit('counter-triggered', {});
                        events.emit('damage-dealt', {
                            amount: counterResult.damage,
                            target: this.battle.activeEnemy,
                            isCrit: false
                        });
                    }
                }
            }
            if (code === 'ShiftLeft' || code === 'ShiftRight') {
                const result = this.battle.handleReactionInput('dodge');
                if (result) {
                    this.battle.reactionSystem.results[result.hitIndex] = result;
                    this.battle.reactionSystem.onHitResult(result);
                }
            }
            return;
        }

        // Aim mode inputs
        if (state === BattleState.AIMING) {
            if (code === 'Enter' || code === 'NumpadEnter') {
                this.confirmAim();
            }
            if (code === 'Escape') {
                this.battle.cancelAim();
                this.aimReticle.visible = false;
                this.showBattleMenu();
            }
            return;
        }

        // Menu navigation
        if (state === BattleState.ACTION_SELECT) {
            if (this.battleMenu.visible) {
                if (code === 'ArrowUp' || code === 'KeyW') {
                    this.battleMenu.moveUp();
                    this.audio.playMenuBlip();
                }
                if (code === 'ArrowDown' || code === 'KeyS') {
                    this.battleMenu.moveDown();
                    this.audio.playMenuBlip();
                }
                if (code === 'Enter' || code === 'NumpadEnter') {
                    this.battleMenu.confirm();
                }
                if (code === 'Escape') {
                    this.battleMenu.cancel();
                }
            } else if (!this.battleMenu.visible) {
                // Show menu if not visible
                if (this.battle.activeCharacter) {
                    this.showBattleMenu();
                }
            }
        }

        // Item menu navigation
        if (this.itemMenuVisible) {
            if (code === 'ArrowUp' || code === 'KeyW') {
                this.itemMenuIndex = Math.max(0, this.itemMenuIndex - 1);
                this.audio.playMenuBlip();
            }
            if (code === 'ArrowDown' || code === 'KeyS') {
                this.itemMenuIndex = Math.min(this.items.length - 1, this.itemMenuIndex + 1);
                this.audio.playMenuBlip();
            }
            if (code === 'Enter' || code === 'NumpadEnter') {
                this.useSelectedItem();
            }
            if (code === 'Escape') {
                this.itemMenuVisible = false;
                this.battleMenu.visible = true;
            }
        }

        // Ultimate
        if (code === 'KeyU') {
            this.tryUltimate();
        }
    }

    handleMouseClick(e) {
        const state = this.battle.getState();

        if (state === BattleState.AIMING) {
            this.confirmAim();
        }
    }

    confirmAim() {
        // Find which enemy the reticle is closest to
        let closest = null;
        let closestDist = Infinity;
        let weakPoint = false;

        const screenPos = new THREE.Vector3(
            this.mousePos.x, this.mousePos.y, 0.5
        );
        this.aimRaycaster.setFromCamera(screenPos, this.renderer.camera);

        for (const en of this.enemies) {
            if (!en.isAlive) continue;
            const worldPos = en.mesh.position.clone();
            worldPos.y += 1.5;

            const projected = worldPos.clone().project(this.renderer.camera);
            const dist = Math.sqrt(
                Math.pow(projected.x - this.mousePos.x, 2) +
                Math.pow(projected.y - this.mousePos.y, 2)
            );

            if (dist < closestDist) {
                closestDist = dist;
                closest = en;
                // Weak point if aiming at head area
                weakPoint = dist < 0.05;
            }
        }

        if (closest) {
            this.battle.confirmAim(closest, weakPoint);
            this.aimReticle.visible = false;
        }
    }

    showBattleMenu() {
        if (!this.battle.activeCharacter) return;
        this.battleMenu.showMain(this.battle.activeCharacter);
        this.battleMenu.onSelect = (item) => this.onMenuSelect(item);
        this.battleMenu.onCancel = () => {
            this.battleMenu.hide();
        };
    }

    onMenuSelect(item) {
        this.battleMenu.hide();

        switch (item.action) {
            case 'attack':
                this.selectTargetForAction('attack');
                break;
            case 'skill':
                this.pendingSkill = item.skill;
                // Self/party/all_enemies skills don't need target selection
                if (item.skill.target === 'self') {
                    this.battle.selectSkill(item.skill, this.battle.activeCharacter);
                    this.pendingSkill = null;
                } else if (item.skill.target === 'party') {
                    for (const ch of this.party) {
                        if (ch.isAlive) {
                            this.battle.selectSkill(item.skill, ch);
                        }
                    }
                    this.pendingSkill = null;
                } else if (item.skill.target === 'all_enemies') {
                    const aliveEnemies = this.enemies.filter(e => e.isAlive);
                    for (const en of aliveEnemies) {
                        this.battle.selectSkill(item.skill, en);
                    }
                    this.pendingSkill = null;
                } else {
                    this.selectTargetForAction('skill');
                }
                break;
            case 'aim':
                this.battle.enterAimMode();
                this.aimReticle.visible = true;
                this.uiCanvas.classList.add('interactive');
                break;
            case 'item':
                this.showItemMenu();
                break;
            case 'wait':
                this.battle.skipTurn();
                break;
        }
    }

    selectTargetForAction(actionType) {
        const aliveEnemies = this.enemies.filter(e => e.isAlive);
        if (aliveEnemies.length === 0) return;

        this.pendingActionType = actionType;
        this.battleMenu.showTargetSelect(aliveEnemies, 'enemy');
        this.battleMenu.onSelect = (item) => {
            this.battleMenu.hide();
            this.executePendingAction(item.target);
        };
        this.battleMenu.onCancel = () => {
            this.showBattleMenu();
        };
    }

    executePendingAction(target) {
        if (!this.battle.activeCharacter || !target) return;

        switch (this.pendingActionType) {
            case 'attack':
                this.battle.selectBasicAttack(target);
                break;
            case 'skill':
                if (this.pendingSkill) {
                    this.battle.selectSkill(this.pendingSkill, target);
                    this.pendingSkill = null;
                }
                break;
        }
        this.pendingActionType = null;
    }

    showItemMenu() {
        this.itemMenuVisible = true;
        this.itemMenuIndex = 0;
        this.battleMenu.visible = false;

        // Show item selection in battle menu
        const itemItems = this.items.map((item, i) => ({
            id: `item_${i}`,
            label: `⚕  ${item.name}`,
            desc: `${item.type === 'heal' ? 'Heal' : item.type === 'ap_restore' ? 'Restore AP' : 'Damage'}: ${item.value} (x${this.itemCounts[i]})`,
            action: 'use_item',
            itemIndex: i,
            disabled: this.itemCounts[i] <= 0
        }));

        this.battleMenu.items = itemItems;
        this.battleMenu.visible = true;
        this.battleMenu.selectedIndex = 0;
        this.battleMenu.mode = 'items';

        this.battleMenu.onSelect = (item) => {
            if (item.disabled) return;
            this.battleMenu.hide();
            this.itemMenuVisible = false;

            const idx = item.itemIndex;
            this.itemCounts[idx]--;

            // Show target selection for heal items
            if (this.items[idx].type === 'heal') {
                const aliveParty = this.party.filter(c => c.isAlive);
                this.battleMenu.showTargetSelect(aliveParty, 'ally');
                this.battleMenu.onSelect = (targetItem) => {
                    this.battleMenu.hide();
                    this.battle.useItem(this.items[idx], targetItem.target);
                };
                this.battleMenu.onCancel = () => {
                    this.itemCounts[idx]++; // Refund
                    this.showBattleMenu();
                };
            } else if (this.items[idx].type === 'damage') {
                const aliveEnemies = this.enemies.filter(e => e.isAlive);
                this.battleMenu.showTargetSelect(aliveEnemies, 'enemy');
                this.battleMenu.onSelect = (targetItem) => {
                    this.battleMenu.hide();
                    this.battle.useItem(this.items[idx], targetItem.target);
                };
                this.battleMenu.onCancel = () => {
                    this.itemCounts[idx]++;
                    this.showBattleMenu();
                };
            } else {
                // AP restore - self target
                this.battle.useItem(this.items[idx], this.battle.activeCharacter);
            }
        };
        this.battleMenu.onCancel = () => {
            this.battleMenu.hide();
            this.itemMenuVisible = false;
            this.showBattleMenu();
        };
    }

    useSelectedItem() {
        if (this.itemMenuIndex < 0 || this.itemMenuIndex >= this.items.length) return;
        if (this.itemCounts[this.itemMenuIndex] <= 0) return;

        const item = this.items[this.itemMenuIndex];
        this.itemCounts[this.itemMenuIndex]--;
        this.itemMenuVisible = false;

        if (item.type === 'heal') {
            this.battle.useItem(item, this.battle.activeCharacter);
        } else if (item.type === 'ap_restore') {
            this.battle.useItem(item, this.battle.activeCharacter);
        } else {
            const aliveEnemies = this.enemies.filter(e => e.isAlive);
            if (aliveEnemies.length > 0) {
                this.battle.useItem(item, aliveEnemies[0]);
            }
        }
    }

    tryUltimate() {
        const flow = this.battle.reactionSystem.flowMeter;
        if (flow < 100) return;

        this.battle.reactionSystem.flowMeter = 0;
        this.audio.playUltimate();
        this.hud.flash('#ffcc00', 0.4, 0.5);
        this.hud.slowMo(0.5);

        // Damage all enemies
        const actor = this.battle.activeCharacter || this.party.find(c => c.isAlive);
        if (!actor) return;

        const dmg = this.battle.actionResolver.calculateUltimateDamage(flow, actor);

        for (const en of this.enemies) {
            if (!en.isAlive) continue;
            en.takeDamage(dmg, null, true);
            en.staggerBar = Math.min(100, en.staggerBar + 30);
            this.damageNumbers.spawn(en.mesh.position.clone(), dmg.toString(), 'damage', true);
            this.particles.spawnImpact(en.mesh.position.clone(), 0xffcc00, 40);

            if (en.hp <= 0) {
                events.emit('character-died', { target: en });
            }
        }

        events.emit('damage-dealt', {
            amount: dmg,
            target: this.enemies.find(e => e.isAlive),
            isCrit: true
        });
    }

    /** Update aim reticle position */
    updateAimReticle() {
        if (!this.aimReticle || !this.aimReticle.visible) return;

        const screenPos = new THREE.Vector3(this.mousePos.x, this.mousePos.y, 0.5);
        this.aimRaycaster.setFromCamera(screenPos, this.renderer.camera);

        // Project onto a plane at enemy depth
        const target = new THREE.Vector3();
        this.aimRaycaster.ray.intersectPlane(
            new THREE.Plane(new THREE.Vector3(0, 0, 1), 4),
            target
        );

        if (target) {
            this.aimReticle.position.copy(target);
            this.aimReticle.lookAt(this.renderer.camera.position);
        }

        // Highlight weak points
        for (const en of this.enemies) {
            if (!en.isAlive) continue;
            const headPos = en.mesh.position.clone();
            headPos.y += 2.1 * en.scale;
            const dist = this.aimReticle.position.distanceTo(headPos);

            if (dist < 0.5) {
                this.aimReticle.material.color.setHex(0xff0000);
                this.aimReticle.scale.set(1.5, 1.5, 1.5);
            } else {
                this.aimReticle.material.color.setHex(0xff4444);
                this.aimReticle.scale.set(1, 1, 1);
            }
        }
    }

    /** Main update loop */
    update(dt) {
        if (!this.running) return;

        // Slow motion
        let effectiveDt = dt;
        if (this.hud.slowMoTimer > 0) {
            effectiveDt = dt * 0.3;
        }

        // Update battle system
        this.battle.update(effectiveDt);

        // Update character animations
        for (const ch of this.party) {
            ch.updateAnimation(dt);
        }
        for (const en of this.enemies) {
            en.updateAnimation(dt);
        }

        // Update renderer
        this.renderer.update(dt);

        // Update particles
        this.particles.update(dt);
        this.damageNumbers.update(dt);

        // Update HUD
        this.hud.party = this.party;
        this.hud.enemies = this.enemies;
        this.hud.turnQueue = this.battle.getUpcomingTurns(5);
        this.hud.activeCharacter = this.battle.activeCharacter;
        this.hud.activeEnemy = this.battle.activeEnemy;
        this.hud.battleState = this.battle.getState();
        this.hud.update(dt);

        // Update reaction prompts
        const reactionProgress = this.battle.reactionSystem.getProgress();
        this.reactionPrompts.updateFromReactionSystem(reactionProgress);
        this.reactionPrompts.update(dt);

        // Update aim reticle
        this.updateAimReticle();

        // Reset just-pressed keys
        this.keysJustPressed = {};

        // Reset camera if battle ends
        const state = this.battle.getState();
        if (state === BattleState.VICTORY || state === BattleState.DEFEAT) {
            // Already handled by events
        }

        // Adjust battle intensity based on party HP
        const avgHp = this.party.reduce((sum, c) => sum + c.getHpRatio(), 0) / this.party.length;
        this.renderer.setBattleIntensity(1 - avgHp);
    }

    /** Render frame */
    render() {
        this.renderer.render();

        // Draw HUD on top
        this.hud.render();

        // Draw battle menu
        this.battleMenu.render();

        // Draw reaction prompts
        this.reactionPrompts.render();
    }

    /** Start the game */
    start() {
        this.running = true;
        this.battle.init();
        this.audio.init();
        this.audio.startBattleMusic();
        this.showBattleMenu();

        // Start game loop
        this.lastTime = performance.now();
        this.loop();
    }

    /** Game loop */
    loop() {
        if (!this.running) return;

        const now = performance.now();
        const dt = Math.min((now - this.lastTime) / 1000, 0.05); // Cap at 50ms
        this.lastTime = now;

        this.update(dt);
        this.render();

        requestAnimationFrame(() => this.loop());
    }

    /** Restart after victory/defeat */
    restart() {
        document.getElementById('overlay').classList.remove('active');
        document.getElementById('victory-panel').style.display = 'none';
        document.getElementById('defeat-panel').style.display = 'none';

        // Remove old meshes
        for (const ch of this.party) {
            this.renderer.scene.remove(ch.mesh);
        }
        for (const en of this.enemies) {
            this.renderer.scene.remove(en.mesh);
        }

        // Clear FX
        this.particles.clear();
        this.damageNumbers.clear();

        // Reset items
        this.itemCounts = [2, 2, 1];
        this.itemMenuVisible = false;

        // Restart battle
        this.battle.restart();
        this.audio.startBattleMusic();
        this.showBattleMenu();

        // Re-add meshes
        for (const ch of this.party) {
            this.renderer.scene.add(ch.mesh);
        }
        for (const en of this.enemies) {
            this.renderer.scene.add(en.mesh);
        }
    }
}
