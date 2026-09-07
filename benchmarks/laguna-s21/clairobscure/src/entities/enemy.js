/**
 * Enemy: stats, telegraphed attack patterns, procedural mesh, animations.
 */

import * as THREE from 'three';

/** Enemy type definitions */
export const ENEMY_TYPES = {
    iron_hound: {
        id: 'iron_hound',
        name: 'Iron Hound',
        maxHp: 120,
        atk: 18,
        def: 10,
        speed: 7,
        color: '#664433',
        accentColor: '#cc6644',
        weakness: ['lightning'],
        resistance: ['physical'],
        targetPreference: 'lowest_hp',
        scale: 1.0,
        attackPatterns: [
            {
                name: 'Claw Swipe',
                weight: 3,
                hits: [
                    { delay: 0, windupTime: 0.6, warningTime: 0.3, damage: 16, stagger: 5, type: 'normal' }
                ]
            },
            {
                name: 'Triple Claw',
                weight: 2,
                hits: [
                    { delay: 0, windupTime: 0.5, warningTime: 0.25, damage: 10, stagger: 4, type: 'normal' },
                    { delay: 0.5, windupTime: 0.4, warningTime: 0.2, damage: 10, stagger: 4, type: 'normal' },
                    { delay: 1.0, windupTime: 0.4, warningTime: 0.2, damage: 12, stagger: 6, type: 'normal' }
                ]
            },
            {
                name: 'Grapple',
                weight: 1,
                hits: [
                    { delay: 0, windupTime: 0.8, warningTime: 0.4, damage: 25, stagger: 15, type: 'grab' }
                ]
            }
        ]
    },
    shadow_weaver: {
        id: 'shadow_weaver',
        name: 'Shadow Weaver',
        maxHp: 90,
        atk: 24,
        def: 6,
        speed: 10,
        color: '#332244',
        accentColor: '#8844cc',
        weakness: ['light'],
        resistance: ['dark'],
        targetPreference: 'highest_ap',
        scale: 0.9,
        attackPatterns: [
            {
                name: 'Shadow Bolt',
                weight: 3,
                hits: [
                    { delay: 0, windupTime: 0.7, warningTime: 0.3, damage: 22, stagger: 6, type: 'normal', element: 'dark' }
                ]
            },
            {
                name: 'Feint Strike',
                weight: 2,
                hits: [
                    { delay: 0, windupTime: 0.5, warningTime: 0.25, damage: 18, stagger: 8, type: 'feint' },
                    { delay: 0.6, windupTime: 0.4, warningTime: 0.2, damage: 20, stagger: 10, type: 'normal' }
                ]
            },
            {
                name: 'Dark Barrage',
                weight: 1,
                hits: [
                    { delay: 0, windupTime: 0.5, warningTime: 0.2, damage: 12, stagger: 4, type: 'normal', element: 'dark' },
                    { delay: 0.4, windupTime: 0.4, warningTime: 0.2, damage: 12, stagger: 4, type: 'normal', element: 'dark' },
                    { delay: 0.8, windupTime: 0.4, warningTime: 0.2, damage: 12, stagger: 4, type: 'normal', element: 'dark' },
                    { delay: 1.2, windupTime: 0.5, warningTime: 0.3, damage: 18, stagger: 10, type: 'heavy', element: 'dark' }
                ]
            }
        ]
    },
    obsidian_golem: {
        id: 'obsidian_golem',
        name: 'Obsidian Golem',
        maxHp: 250,
        atk: 30,
        def: 20,
        speed: 4,
        color: '#2a2a2a',
        accentColor: '#ff4422',
        weakness: ['lightning', 'ice'],
        resistance: ['physical', 'dark'],
        targetPreference: 'lowest_hp',
        scale: 1.5,
        isBoss: true,
        attackPatterns: [
            {
                name: 'Ground Slam',
                weight: 3,
                hits: [
                    { delay: 0, windupTime: 1.0, warningTime: 0.5, damage: 28, stagger: 15, type: 'heavy' }
                ]
            },
            {
                name: 'Rock Throw',
                weight: 2,
                hits: [
                    { delay: 0, windupTime: 0.8, warningTime: 0.4, damage: 20, stagger: 8, type: 'normal' },
                    { delay: 0.7, windupTime: 0.6, warningTime: 0.3, damage: 20, stagger: 8, type: 'normal' }
                ]
            },
            {
                name: 'Crushing Grab',
                weight: 1,
                hits: [
                    { delay: 0, windupTime: 1.2, warningTime: 0.6, damage: 35, stagger: 20, type: 'grab' }
                ]
            },
            {
                name: 'Magma Eruption',
                weight: 1,
                hits: [
                    { delay: 0, windupTime: 0.7, warningTime: 0.3, damage: 15, stagger: 5, type: 'normal', element: 'fire' },
                    { delay: 0.5, windupTime: 0.6, warningTime: 0.3, damage: 15, stagger: 5, type: 'normal', element: 'fire' },
                    { delay: 1.0, windupTime: 0.8, warningTime: 0.4, damage: 25, stagger: 12, type: 'heavy', element: 'fire' }
                ]
            }
        ]
    }
};

export class Enemy {
    constructor(enemyType, position) {
        const type = ENEMY_TYPES[enemyType];
        this.id = type.id;
        this.name = type.name;
        this.enemyType = enemyType;

        // Stats
        this.maxHp = type.maxHp;
        this.hp = type.maxHp;
        this.atk = type.atk;
        this.def = type.def;
        this.speed = type.speed;
        this.isBoss = type.isBoss || false;

        // Appearance
        this.color = type.color;
        this.accentColor = type.accentColor;
        this.scale = type.scale || 1.0;

        // Combat state
        this.isAlive = true;
        this.isEnemy = true;
        this.staggerBar = 0;
        this.isStaggered = false;
        this.staggerTimer = 0;
        this.statuses = [];
        this.targetPreference = type.targetPreference || 'random';
        this.currentTarget = null;

        // Attack patterns
        this.attackPatterns = type.attackPatterns || [];

        // Weaknesses/resistances
        this.weaknesses = type.weakness || [];
        this.resistances = type.resistance || [];

        // 3D mesh
        this.mesh = null;
        this.position = position || new THREE.Vector3();
        this.animation = 'idle';
        this.animTimer = 0;
        this.hitFlashTimer = 0;

        // Build procedural mesh
        this.buildMesh();
    }

    buildMesh() {
        const group = new THREE.Group();
        const s = this.scale;

        // Body
        const bodyGeo = new THREE.CylinderGeometry(0.4 * s, 0.35 * s, 1.2 * s, 8);
        const bodyMat = new THREE.MeshPhysicalMaterial({
            color: new THREE.Color(this.color),
            roughness: 0.75,
            metalness: 0.2,
            sheen: 0.1
        });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 1.3 * s;
        body.castShadow = true;
        group.add(body);
        this.bodyMesh = body;

        // Head
        const headGeo = new THREE.SphereGeometry(0.25 * s, 10, 8);
        const headMat = new THREE.MeshPhysicalMaterial({
            color: new THREE.Color(this.color),
            roughness: 0.7,
            metalness: 0.15
        });
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.y = 2.1 * s;
        head.castShadow = true;
        group.add(head);
        this.headMesh = head;

        // Eyes (menacing glow)
        const eyeGeo = new THREE.SphereGeometry(0.05 * s, 6, 6);
        const eyeMat = new THREE.MeshStandardMaterial({
            color: this.accentColor,
            emissive: new THREE.Color(this.accentColor),
            emissiveIntensity: 2.5
        });
        const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
        leftEye.position.set(-0.09 * s, 2.15 * s, 0.2 * s);
        group.add(leftEye);
        const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
        rightEye.position.set(0.09 * s, 2.15 * s, 0.2 * s);
        group.add(rightEye);

        // Arms (thicker for enemies)
        const armGeo = new THREE.CylinderGeometry(0.1 * s, 0.08 * s, 0.8 * s, 6);
        const armMat = new THREE.MeshPhysicalMaterial({
            color: new THREE.Color(this.color),
            roughness: 0.7,
            metalness: 0.15
        });
        this.leftArm = new THREE.Mesh(armGeo, armMat);
        this.leftArm.position.set(-0.55 * s, 1.3 * s, 0);
        this.leftArm.rotation.z = 0.25;
        this.leftArm.castShadow = true;
        group.add(this.leftArm);

        this.rightArm = new THREE.Mesh(armGeo, armMat);
        this.rightArm.position.set(0.55 * s, 1.3 * s, 0);
        this.rightArm.rotation.z = -0.25;
        this.rightArm.castShadow = true;
        group.add(this.rightArm);

        // Legs
        const legGeo = new THREE.CylinderGeometry(0.12 * s, 0.1 * s, 0.8 * s, 6);
        const legMat = new THREE.MeshPhysicalMaterial({
            color: new THREE.Color(this.color),
            roughness: 0.8,
            metalness: 0.1
        });
        this.leftLeg = new THREE.Mesh(legGeo, legMat);
        this.leftLeg.position.set(-0.18 * s, 0.4 * s, 0);
        this.leftLeg.castShadow = true;
        group.add(this.leftLeg);

        this.rightLeg = new THREE.Mesh(legGeo, legMat);
        this.rightLeg.position.set(0.18 * s, 0.4 * s, 0);
        this.rightLeg.castShadow = true;
        group.add(this.rightLeg);

        // Weapon/claws
        this.weapon = this.buildWeapon(s);
        if (this.weapon) {
            this.rightArm.add(this.weapon);
            this.weapon.position.set(0, -0.4 * s, 0);
        }

        // Boss aura (emissive ring)
        if (this.isBoss) {
            const auraGeo = new THREE.TorusGeometry(0.6 * s, 0.05, 8, 24);
            const auraMat = new THREE.MeshStandardMaterial({
                color: this.accentColor,
                emissive: new THREE.Color(this.accentColor),
                emissiveIntensity: 1.5,
                transparent: true,
                opacity: 0.6
            });
            this.aura = new THREE.Mesh(auraGeo, auraMat);
            this.aura.position.y = 0.8 * s;
            this.aura.rotation.x = Math.PI / 2;
            group.add(this.aura);
        }

        group.position.copy(this.position);
        this.mesh = group;
    }

    buildWeapon(s) {
        switch (this.enemyType) {
            case 'iron_hound': {
                // Claws
                const clawGeo = new THREE.ConeGeometry(0.06 * s, 0.25 * s, 4);
                const clawMat = new THREE.MeshStandardMaterial({
                    color: 0x888888,
                    roughness: 0.2,
                    metalness: 0.9
                });
                const claw = new THREE.Mesh(clawGeo, clawMat);
                claw.rotation.x = Math.PI / 2;
                return claw;
            }
            case 'shadow_weaver': {
                // Dark orb
                const orbGeo = new THREE.SphereGeometry(0.12 * s, 8, 8);
                const orbMat = new THREE.MeshStandardMaterial({
                    color: 0x440066,
                    emissive: new THREE.Color(this.accentColor),
                    emissiveIntensity: 2,
                    transparent: true,
                    opacity: 0.8
                });
                return new THREE.Mesh(orbGeo, orbMat);
            }
            case 'obsidian_golem': {
                // Massive fist
                const fistGeo = new THREE.SphereGeometry(0.2 * s, 8, 8);
                const fistMat = new THREE.MeshPhysicalMaterial({
                    color: 0x1a1a1a,
                    roughness: 0.9,
                    metalness: 0.3
                });
                return new THREE.Mesh(fistGeo, fistMat);
            }
            default:
                return null;
        }
    }

    /** Set animation state */
    setAnimation(type) {
        this.animation = type;
        this.animTimer = 0;
    }

    /** Update animation per frame */
    updateAnimation(dt) {
        this.animTimer += dt;
        const t = this.animTimer;
        const s = this.scale;

        // Reset
        if (this.leftArm) this.leftArm.rotation.z = 0.25;
        if (this.rightArm) this.rightArm.rotation.z = -0.25;
        if (this.leftLeg) this.leftLeg.rotation.x = 0;
        if (this.rightLeg) this.rightLeg.rotation.x = 0;
        if (this.mesh) this.mesh.position.y = this.position.y;
        if (this.mesh) this.mesh.rotation.y = 0;

        switch (this.animation) {
            case 'idle': {
                const bob = Math.sin(t * 1.8) * 0.02 * s;
                if (this.mesh) this.mesh.position.y = this.position.y + bob;
                if (this.leftArm) this.leftArm.rotation.z = 0.25 + Math.sin(t * 1.2) * 0.04;
                if (this.rightArm) this.rightArm.rotation.z = -0.25 - Math.sin(t * 1.2) * 0.04;

                // Boss aura rotation
                if (this.aura) {
                    this.aura.rotation.z = t * 0.5;
                    this.aura.material.opacity = 0.4 + Math.sin(t * 2) * 0.2;
                }
                break;
            }
            case 'attack': {
                const progress = Math.min(t / 0.6, 1);
                if (this.rightArm) {
                    this.rightArm.rotation.x = -Math.sin(progress * Math.PI) * 1.5;
                }
                if (this.leftArm) {
                    this.leftArm.rotation.x = -Math.sin(progress * Math.PI) * 1.0;
                }
                if (this.mesh) {
                    this.mesh.position.z = this.position.z - Math.sin(progress * Math.PI) * 0.4 * s;
                }
                break;
            }
            case 'hit': {
                const progress = Math.min(t / 0.3, 1);
                if (this.mesh) {
                    this.mesh.position.z = this.position.z + Math.sin(progress * Math.PI) * 0.25 * s;
                    this.mesh.rotation.y = -Math.sin(progress * Math.PI) * 0.2;
                }
                if (this.bodyMesh && this.bodyMesh.material) {
                    if (progress < 0.4) {
                        this.bodyMesh.material.emissive = new THREE.Color(0xff2222);
                        this.bodyMesh.material.emissiveIntensity = 0.6 * (1 - progress / 0.4);
                    } else {
                        this.bodyMesh.material.emissive = new THREE.Color(0x000000);
                        this.bodyMesh.material.emissiveIntensity = 0;
                    }
                }
                break;
            }
            case 'death': {
                const progress = Math.min(t / 2, 1);
                if (this.mesh) {
                    this.mesh.rotation.x = progress * Math.PI / 2;
                    this.mesh.position.y = this.position.y * (1 - progress * 0.5);
                    // Dissolve effect
                    for (const child of this.mesh.children) {
                        if (child.material) {
                            child.material.transparent = true;
                            child.material.opacity = 1 - progress;
                        }
                    }
                }
                break;
            }
        }
    }

    /** Take damage */
    takeDamage(amount, element, isCrit) {
        let finalDmg = amount;

        // Apply resistance/weakness
        if (element && this.resistances && this.resistances.includes(element)) {
            finalDmg = Math.floor(amount * 0.5);
        }
        if (element && this.weaknesses && this.weaknesses.includes(element)) {
            finalDmg = Math.floor(amount * 1.5);
        }

        this.hp = Math.max(0, this.hp - finalDmg);
        this.hitFlashTimer = 0.2;

        if (this.hp <= 0) {
            this.die();
        } else {
            this.setAnimation('hit');
        }
    }

    /** Heal */
    heal(amount) {
        this.hp = Math.min(this.maxHp, this.hp + amount);
    }

    /** Die */
    die() {
        this.isAlive = false;
        this.hp = 0;
        this.setAnimation('death');
    }

    /** Add a status effect */
    addStatus(status) {
        const existing = this.statuses.find(s => s.type === status.type);
        if (existing) {
            existing.duration = Math.max(existing.duration, status.duration);
            existing.value = status.value;
        } else {
            this.statuses.push({ ...status });
        }
    }

    /** Get HP ratio (0-1) */
    getHpRatio() {
        return this.hp / this.maxHp;
    }
}
