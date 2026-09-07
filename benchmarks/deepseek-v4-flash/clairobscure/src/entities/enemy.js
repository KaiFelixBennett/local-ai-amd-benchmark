// enemy.js — enemy: stats, telegraphed attack patterns, procedural mesh, animations; boss phases.
import * as THREE from 'three';
import { createClothTexture, createRuneTexture } from '../engine/textures.js';
import { makeCombatantStats } from './character.js';

// Attack pattern descriptor (shared by enemies + boss)
export function buildPattern(id, opts) {
    return {
        id,
        name: opts.name || 'Attack',
        element: opts.element || 'physical',
        type: opts.type || 'single',        // 'single' | 'combo' | 'grab' | 'cleave' | 'buff'
        hits: opts.hits || 1,                // combo hit count for multi-hit
        damageMult: opts.damageMult || 1.0,
        telegraphTime: opts.telegraphTime || 0.9,  // seconds from telegraph start to hit
        window: opts.window || { perfect: 0.14, loose: 0.28 },
        feintDelay: opts.feintDelay || 0,     // >0 means it's a feint (early input punished)
        counterable: opts.counterable !== undefined ? opts.counterable : true,
        unblockable: opts.unblockable || false, // must dodge, not parry
        canBuff: opts.canBuff || false,
        interruptible: opts.interruptible !== undefined ? opts.interruptible : true,
    };
}

// Enemy tier templates
export const ENEMY_TEMPLATES = {
    revenantCrawler: {
        name: 'Revenant Crawler',
        side: 'enemy',
        affinity: { physical: 'resist', ice: 'weak' },
        maxHp: 210, atk: 22, def: 10, spd: 9, crit: 0.06,
        patterns: [
            buildPattern('sweep', { name: 'Sweep', element: 'physical', type: 'single', damageMult: 1.0, telegraphTime: 1.1 }),
            buildPattern('rake', { name: 'Rake Combo', element: 'physical', type: 'combo', hits: 3, damageMult: 0.8, telegraphTime: 0.7 }),
            buildPattern('grab', { name: 'Bite', element: 'physical', type: 'grab', damageMult: 1.4, unblockable: true, counterable: false, telegraphTime: 1.0 }),
        ],
    },
    gildedPraetor: {
        name: 'Gilded Praetor',
        side: 'enemy',
        affinity: { fire: 'weak', void: 'resist' },
        maxHp: 320, atk: 26, def: 14, spd: 6, crit: 0.1,
        patterns: [
            buildPattern('gildedBolt', { name: 'Gilded Bolt', element: 'fire', type: 'single', damageMult: 1.2, telegraphTime: 1.4 }),
            buildPattern('sunRally', { name: 'Sun Rally', element: 'fire', type: 'buff', canBuff: true, damageMult: 0, telegraphTime: 0.8 }),
            buildPattern('colossusTread', { name: 'Colossus Tread', element: 'physical', type: 'cleave', damageMult: 1.2, hits: 2, telegraphTime: 1.3 }),
            buildPattern('sunFeint', { name: 'Sun Feint', element: 'fire', type: 'single', damageMult: 1.15, feintDelay: 0.5, telegraphTime: 1.6 }),
        ],
    },
    // Boss: phase-shifting
    bossOfTheVault: {
        name: 'The Vaulted Aureate',
        side: 'enemy',
        boss: true,
        affinity: { fire: 'resist', void: 'weak', ice: 'weak' },
        maxHp: 900, atk: 30, def: 15, spd: 12, crit: 0.12,
        patterns: [
            buildPattern('gildedSword', { name: 'Gilded Swords', element: 'physical', type: 'single', damageMult: 1.3, telegraphTime: 1.2 }),
            buildPattern('goldenRain', { name: 'Golden Rain', element: 'fire', type: 'combo', hits: 4, damageMult: 0.6, telegraphTime: 0.8 }),
            buildPattern('crownUnravel', { name: 'Crown Unravel', element: 'void', type: 'cleave', damageMult: 1.6, hits: 3, telegraphTime: 1.5, unblockable: false }),
        ],
    },
};

export function buildEnemyMesh(templateId, rng) {
    const cfg = ENEMY_TEMPLATES[templateId] || ENEMY_TEMPLATES.revenantCrawler;
    const group = new THREE.Group();
    const clothTex = createClothTexture(rng.range('hue', 0.4, 0.8), 128);
    const metalMat = new THREE.MeshPhysicalMaterial({
        color: 0x8a6f3c, roughness: 0.5, metalness: 0.8, map: createClothTexture(0.12, 128),
    });
    const eyeTex = createRuneTexture('#ffd792');
    const eyeMat = new THREE.MeshPhysicalMaterial({
        map: eyeTex, emissive: 0xffd792, emissiveIntensity: 1.4, roughness: 0.2,
    });

    const baseColor = rng.pick('body', [0x3f4a33, 0x4a3636, 0x2e3f4a, 0x443826]);
    const bodyMat = new THREE.MeshPhysicalMaterial({ color: baseColor, roughness: 0.75, metalness: 0.05, sheen: 0.35 });

    // main torso lump
    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 12), bodyMat);
    torso.scale.set(1, 1.3, 0.9);
    torso.position.y = 1.0;
    torso.castShadow = true;
    group.add(torso);

    // shoulders/arms
    const shoulderMat = metalMat;
    const shL = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10), shoulderMat);
    shL.position.set(-1.0, 1.35, 0);
    const shR = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10), shoulderMat);
    shR.position.set(1.0, 1.35, 0);
    group.add(shL, shR);

    // claw arms (two small boxes pointing forward)
    const clawMat = new THREE.MeshPhysicalMaterial({ color: 0x6a5232, roughness: 0.6, metalness: 0.3 });
    const clawL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.8), clawMat);
    clawL.position.set(-1.0, 1.1, 0.5);
    clawL.rotation.x = 0.4;
    const clawR = clawL.clone();
    clawR.position.x = 1.0;
    group.add(clawL, clawR);

    // head cluster
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 12), bodyMat);
    head.position.set(0, 2.1, 0.4);
    head.castShadow = true;
    group.add(head);

    // eyes (two emissive orbs)
    const eye1 = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), eyeMat);
    eye1.position.set(-0.2, 2.15, 0.85);
    const eye2 = eye1.clone();
    eye2.position.x = 0.2;
    group.add(eye1, eye2);

    // crown ornament (boss only, or sometimes minion)
    if (cfg.boss || rng.next('crown') < 0.35) {
        const crownMat = new THREE.MeshPhysicalMaterial({ color: 0xd9b25c, roughness: 0.3, metalness: 0.9, emissive: 0xd9b25c, emissiveIntensity: 0.25 });
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.5, 4), crownMat);
        spike.position.set(0, 2.7, 0.3);
        group.add(spike);
        const spike2 = spike.clone();
        spike2.position.set(-0.35, 2.55, 0.2);
        spike2.rotation.z = 0.6;
        const spike3 = spike.clone();
        spike3.position.set(0.35, 2.55, 0.2);
        spike3.rotation.z = -0.6;
        group.add(spike2, spike3);
        group._crown = [spike, spike2, spike3];
    }

    group._torso = torso;
    group._head = head;
    group._clawL = clawL;
    group._clawR = clawR;
    group._eye1 = eye1;
    group._eye2 = eye2;

    group.traverse((o) => {
        if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
    });
    return group;
}

// Enemy wrapper: stat block + pattern selection stored on the actor
export function makeEnemy(templateId, rng, level = 1) {
    const cfg = ENEMY_TEMPLATES[templateId] || ENEMY_TEMPLATES.revenantCrawler;
    const stats = makeCombatantStats({
        name: cfg.name,
        archetype: templateId,
        side: 'enemy',
        team: 'enemy',
        maxHp: Math.round((cfg.maxHp || 200) * (1 + (level - 1) * 0.2)),
        atk: cfg.atk || 20,
        def: cfg.def || 10,
        spd: cfg.spd || 8,
        crit: cfg.crit || 0.07,
        affinity: cfg.affinity || {},
        maxStagger: cfg.boss ? 120 : 60,
    });
    stats.boss = !!cfg.boss;
    stats.templateId = templateId;
    stats.patterns = cfg.patterns;
    stats.hp = stats.maxHp;
    stats.id = templateId;
    stats.mesh = buildEnemyMesh(templateId, rng);
    return stats;
}
