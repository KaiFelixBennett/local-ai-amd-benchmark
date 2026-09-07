/**
 * Party member: stats, AP, HP, skill list, procedural mesh, animations.
 */

import * as THREE from 'three';
import { getSkillsForCharacter } from './skill.js';

/** Character class definitions */
export const CHARACTER_CLASSES = {
    warden: {
        name: 'Warden',
        title: 'The Iron Shield',
        maxHp: 180,
        maxAp: 5,
        atk: 22,
        mat: 10,
        def: 18,
        speed: 6,
        critRate: 0.05,
        color: '#4466aa',
        accentColor: '#c4a35a',
        skinColor: '#c4956a',
        weakness: ['dark'],
        resistance: ['physical']
    },
    arcanist: {
        name: 'Arcanist',
        title: 'The Spell Weaver',
        maxHp: 110,
        maxAp: 6,
        atk: 28,
        mat: 25,
        def: 8,
        speed: 9,
        critRate: 0.1,
        color: '#6644aa',
        accentColor: '#88ccff',
        skinColor: '#d4a87a',
        weakness: ['physical'],
        resistance: ['lightning', 'ice']
    },
    chronos: {
        name: 'Chronos',
        title: 'The Light Bearer',
        maxHp: 130,
        maxAp: 5,
        atk: 15,
        mat: 22,
        def: 12,
        speed: 8,
        critRate: 0.06,
        color: '#ccaa44',
        accentColor: '#ffdd88',
        skinColor: '#b8875a',
        weakness: ['dark'],
        resistance: ['light']
    },
    phantom: {
        name: 'Phantom',
        title: 'The Shadow Blade',
        maxHp: 100,
        maxAp: 6,
        atk: 32,
        mat: 12,
        def: 6,
        speed: 12,
        critRate: 0.15,
        color: '#884488',
        accentColor: '#cc66cc',
        skinColor: '#c49a6c',
        weakness: ['light'],
        resistance: ['dark']
    }
};

export class Character {
    constructor(characterClass, position) {
        const cls = CHARACTER_CLASSES[characterClass];
        this.id = characterClass;
        this.name = cls.name;
        this.title = cls.title;
        this.characterClass = characterClass;

        // Stats
        this.maxHp = cls.maxHp;
        this.hp = cls.maxHp;
        this.maxAp = cls.maxAp;
        this.ap = cls.maxAp;
        this.atk = cls.atk;
        this.mat = cls.mat;
        this.def = cls.def;
        this.speed = cls.speed;
        this.critRate = cls.critRate;

        // Appearance
        this.color = cls.color;
        this.accentColor = cls.accentColor;
        this.skinColor = cls.skinColor;

        // Combat state
        this.isAlive = true;
        this.isEnemy = false;
        this.staggerBar = 0;
        this.isStaggered = false;
        this.staggerTimer = 0;
        this.statuses = [];
        this.buffs = [];
        this.debuffs = [];

        // Skills
        this.skills = getSkillsForCharacter(characterClass);

        // Weaknesses/resistances
        this.weaknesses = cls.weakness || [];
        this.resistances = cls.resistance || [];

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

        // Body (torso)
        const bodyGeo = new THREE.CylinderGeometry(0.35, 0.3, 1.0, 8);
        const bodyMat = new THREE.MeshPhysicalMaterial({
            color: new THREE.Color(this.color),
            roughness: 0.6,
            metalness: 0.1,
            sheen: 0.3,
            sheenRoughness: 0.5
        });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 1.2;
        body.castShadow = true;
        group.add(body);

        // Head
        const headGeo = new THREE.SphereGeometry(0.22, 12, 10);
        const headMat = new THREE.MeshPhysicalMaterial({
            color: new THREE.Color(this.skinColor),
            roughness: 0.7,
            metalness: 0.0
        });
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.y = 1.95;
        head.castShadow = true;
        group.add(head);

        // Eyes (emissive)
        const eyeGeo = new THREE.SphereGeometry(0.04, 6, 6);
        const eyeMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: new THREE.Color(this.accentColor),
            emissiveIntensity: 1.5
        });
        const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
        leftEye.position.set(-0.08, 1.98, 0.18);
        group.add(leftEye);
        const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
        rightEye.position.set(0.08, 1.98, 0.18);
        group.add(rightEye);

        // Arms
        const armGeo = new THREE.CylinderGeometry(0.08, 0.07, 0.7, 6);
        const armMat = new THREE.MeshPhysicalMaterial({
            color: new THREE.Color(this.color),
            roughness: 0.6,
            metalness: 0.1
        });
        this.leftArm = new THREE.Mesh(armGeo, armMat);
        this.leftArm.position.set(-0.45, 1.2, 0);
        this.leftArm.rotation.z = 0.2;
        this.leftArm.castShadow = true;
        group.add(this.leftArm);

        this.rightArm = new THREE.Mesh(armGeo, armMat);
        this.rightArm.position.set(0.45, 1.2, 0);
        this.rightArm.rotation.z = -0.2;
        this.rightArm.castShadow = true;
        group.add(this.rightArm);

        // Legs
        const legGeo = new THREE.CylinderGeometry(0.1, 0.08, 0.7, 6);
        const legMat = new THREE.MeshPhysicalMaterial({
            color: new THREE.Color(this.color),
            roughness: 0.7,
            metalness: 0.05
        });
        this.leftLeg = new THREE.Mesh(legGeo, legMat);
        this.leftLeg.position.set(-0.15, 0.35, 0);
        this.leftLeg.castShadow = true;
        group.add(this.leftLeg);

        this.rightLeg = new THREE.Mesh(legGeo, legMat);
        this.rightLeg.position.set(0.15, 0.35, 0);
        this.rightLeg.castShadow = true;
        group.add(this.rightLeg);

        // Weapon (class-specific)
        this.weapon = this.buildWeapon();
        if (this.weapon) {
            this.rightArm.add(this.weapon);
            this.weapon.position.set(0, -0.3, 0.2);
        }

        // Accent trim (gilded belt)
        const beltGeo = new THREE.TorusGeometry(0.32, 0.03, 6, 12);
        const beltMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(this.accentColor),
            roughness: 0.2,
            metalness: 0.9,
            emissive: new THREE.Color(this.accentColor),
            emissiveIntensity: 0.15
        });
        const belt = new THREE.Mesh(beltGeo, beltMat);
        belt.position.y = 0.8;
        belt.rotation.x = Math.PI / 2;
        group.add(belt);

        group.position.copy(this.position);
        this.mesh = group;
        this.bodyMesh = body;
        this.headMesh = head;
    }

    buildWeapon() {
        switch (this.characterClass) {
            case 'warden': {
                // Shield
                const shieldGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.05, 8);
                const shieldMat = new THREE.MeshStandardMaterial({
                    color: new THREE.Color(this.accentColor),
                    roughness: 0.3,
                    metalness: 0.8
                });
                const shield = new THREE.Mesh(shieldGeo, shieldMat);
                shield.position.set(0, 0, 0.15);
                // Shield emblem
                const emblemGeo = new THREE.CircleGeometry(0.1, 6);
                const emblemMat = new THREE.MeshStandardMaterial({
                    color: 0xffdd44,
                    emissive: 0xffaa00,
                    emissiveIntensity: 0.5,
                    side: THREE.DoubleSide
                });
                const emblem = new THREE.Mesh(emblemGeo, emblemMat);
                emblem.position.z = 0.03;
                shield.add(emblem);
                return shield;
            }
            case 'arcanist': {
                // Staff
                const staffGeo = new THREE.CylinderGeometry(0.03, 0.04, 1.2, 6);
                const staffMat = new THREE.MeshPhysicalMaterial({
                    color: 0x4a3520,
                    roughness: 0.8,
                    metalness: 0.05
                });
                const staff = new THREE.Mesh(staffGeo, staffMat);
                staff.position.y = 0.3;
                // Crystal tip
                const crystalGeo = new THREE.OctahedronGeometry(0.08);
                const crystalMat = new THREE.MeshStandardMaterial({
                    color: new THREE.Color(this.accentColor),
                    emissive: new THREE.Color(this.accentColor),
                    emissiveIntensity: 2,
                    roughness: 0.1,
                    metalness: 0.3
                });
                const crystal = new THREE.Mesh(crystalGeo, crystalMat);
                crystal.position.y = 0.65;
                staff.add(crystal);
                return staff;
            }
            case 'chronos': {
                // Scepter
                const scepterGeo = new THREE.CylinderGeometry(0.025, 0.03, 0.9, 6);
                const scepterMat = new THREE.MeshStandardMaterial({
                    color: new THREE.Color(this.accentColor),
                    roughness: 0.2,
                    metalness: 0.9
                });
                const scepter = new THREE.Mesh(scepterGeo, scepterMat);
                scepter.position.y = 0.2;
                // Orb
                const orbGeo = new THREE.SphereGeometry(0.07, 8, 8);
                const orbMat = new THREE.MeshStandardMaterial({
                    color: 0xffeeaa,
                    emissive: 0xffcc44,
                    emissiveIntensity: 2,
                    roughness: 0.0,
                    metalness: 0.2
                });
                const orb = new THREE.Mesh(orbGeo, orbMat);
                orb.position.y = 0.55;
                scepter.add(orb);
                return scepter;
            }
            case 'phantom': {
                // Dagger
                const bladeGeo = new THREE.BoxGeometry(0.04, 0.4, 0.02);
                const bladeMat = new THREE.MeshPhysicalMaterial({
                    color: 0x888899,
                    roughness: 0.1,
                    metalness: 0.95
                });
                const blade = new THREE.Mesh(bladeGeo, bladeMat);
                blade.position.y = 0.2;
                // Handle
                const handleGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.15, 6);
                const handleMat = new THREE.MeshStandardMaterial({
                    color: 0x3a2a1a,
                    roughness: 0.8
                });
                const handle = new THREE.Mesh(handleGeo, handleMat);
                handle.position.y = -0.05;
                blade.add(handle);
                return blade;
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

        // Reset rotations
        if (this.leftArm) this.leftArm.rotation.z = 0.2;
        if (this.rightArm) this.rightArm.rotation.z = -0.2;
        if (this.leftLeg) this.leftLeg.rotation.x = 0;
        if (this.rightLeg) this.rightLeg.rotation.x = 0;
        if (this.mesh) this.mesh.position.y = this.position.y;

        switch (this.animation) {
            case 'idle': {
                // Gentle bob
                const bob = Math.sin(t * 2) * 0.02;
                if (this.mesh) this.mesh.position.y = this.position.y + bob;
                // Subtle arm sway
                if (this.leftArm) this.leftArm.rotation.z = 0.2 + Math.sin(t * 1.5) * 0.03;
                if (this.rightArm) this.rightArm.rotation.z = -0.2 - Math.sin(t * 1.5) * 0.03;
                break;
            }
            case 'attack': {
                const progress = Math.min(t / 0.5, 1);
                // Swing right arm forward
                if (this.rightArm) {
                    this.rightArm.rotation.x = -Math.sin(progress * Math.PI) * 1.2;
                    this.rightArm.rotation.z = -0.2 - Math.sin(progress * Math.PI) * 0.5;
                }
                // Body lunge
                if (this.mesh) {
                    this.mesh.position.z = this.position.z + Math.sin(progress * Math.PI) * 0.3;
                }
                break;
            }
            case 'hit': {
                const progress = Math.min(t / 0.3, 1);
                // Flinch back
                if (this.mesh) {
                    this.mesh.position.z = this.position.z - Math.sin(progress * Math.PI) * 0.2;
                    this.mesh.rotation.y = Math.sin(progress * Math.PI) * 0.15;
                }
                // Flash material
                if (this.bodyMesh && this.bodyMesh.material) {
                    if (progress < 0.3) {
                        this.bodyMesh.material.emissive = new THREE.Color(0xff4444);
                        this.bodyMesh.material.emissiveIntensity = 0.5 * (1 - progress / 0.3);
                    } else {
                        this.bodyMesh.material.emissive = new THREE.Color(0x000000);
                        this.bodyMesh.material.emissiveIntensity = 0;
                    }
                }
                break;
            }
            case 'death': {
                const progress = Math.min(t / 1.5, 1);
                // Fall backward
                if (this.mesh) {
                    this.mesh.rotation.x = -progress * Math.PI / 2;
                    this.mesh.position.y = this.position.y * (1 - progress);
                }
                break;
            }
        }
    }

    /** Take damage */
    takeDamage(amount, element, isCrit) {
        // Apply resistance
        let finalDmg = amount;
        if (element && this.resistances && this.resistances.includes(element)) {
            finalDmg = Math.floor(amount * 0.5);
        }
        if (element && this.weaknesses && this.weaknesses.includes(element)) {
            finalDmg = Math.floor(amount * 1.3);
        }

        // Apply buff/debuff
        let defMult = 1.0;
        for (const b of this.buffs) {
            if (b.type === 'def_up') defMult += b.value || 0.2;
        }
        for (const d of this.debuffs) {
            if (d.type === 'def_down') defMult -= d.value || 0.2;
        }
        finalDmg = Math.max(1, Math.floor(finalDmg / Math.max(0.5, defMult)));

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
        if (this.mesh) {
            // Fade out
            for (const child of this.mesh.children) {
                if (child.material) {
                    child.material.transparent = true;
                    child.material.opacity = 0.3;
                }
            }
        }
    }

    /** Add a status effect */
    addStatus(status) {
        // Check for existing status of same type
        const existing = this.statuses.find(s => s.type === status.type);
        if (existing) {
            existing.duration = Math.max(existing.duration, status.duration);
            existing.value = status.value;
        } else {
            this.statuses.push({ ...status });
        }
    }

    /** Add a buff */
    addBuff(buff) {
        this.buffs.push({ ...buff });
    }

    /** Add a debuff */
    addDebuff(debuff) {
        this.debuffs.push({ ...debuff });
    }

    /** Process status effects at turn end */
    processTurnEndStatus() {
        // Tick statuses
        for (let i = this.statuses.length - 1; i >= 0; i--) {
            const status = this.statuses[i];
            status.duration--;

            // Apply tick damage for burn/poison
            if (status.type === 'burn' || status.type === 'poison') {
                this.takeDamage(status.value || 5, null);
            }

            if (status.duration <= 0) {
                this.statuses.splice(i, 1);
            }
        }

        // Tick buffs/debuffs
        for (let i = this.buffs.length - 1; i >= 0; i--) {
            this.buffs[i].duration--;
            if (this.buffs[i].duration <= 0) {
                this.buffs.splice(i, 1);
            }
        }
        for (let i = this.debuffs.length - 1; i >= 0; i--) {
            this.debuffs[i].duration--;
            if (this.debuffs[i].duration <= 0) {
                this.debuffs.splice(i, 1);
            }
        }

        // Stagger timer
        if (this.isStaggered) {
            this.staggerTimer--;
            if (this.staggerTimer <= 0) {
                this.isStaggered = false;
                this.staggerBar = 0;
            }
        }

        // Decay hit flash
        if (this.hitFlashTimer > 0) {
            this.hitFlashTimer -= 1;
        }
    }

    /** Get HP ratio (0-1) */
    getHpRatio() {
        return this.hp / this.maxHp;
    }

    /** Get AP ratio (0-1) */
    getApRatio() {
        return this.ap / this.maxAp;
    }
}
