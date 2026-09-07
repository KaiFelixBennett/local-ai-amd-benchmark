// character.js — party member: stats, AP, HP, skill list, procedural mesh, animations.
import * as THREE from 'three';
import { createClothTexture, createRuneTexture } from '../engine/textures.js';
import { StatusType } from './skill.js';

// Class archetype config: palette + build.
const ARCHETYPES = {
    duelist: { hue: 0.55, name: 'Duelist', colorAccent: 0xc0a050, primary: 0x214a5a },
    mage: { hue: 0.62, name: 'Mage', colorAccent: 0x9db8ff, primary: 0x1d3f5a },
    guardian: { hue: 0.05, name: 'Guardian', colorAccent: 0xb8b0a0, primary: 0x31262a },
};

// Procedural low-poly character: body + head + arms + weapon. Returns group with refs.
export function buildPartyMemberMesh(archetype, rng) {
    const cfg = ARCHETYPES[archetype] || ARCHETYPES.duelist;
    const group = new THREE.Group();
    const clothTex = createClothTexture(cfg.hue, 128);

    const bodyMat = new THREE.MeshPhysicalMaterial({
        map: clothTex,
        roughness: 0.7, metalness: 0.05, sheen: 0.4,
    });
    const accentMat = new THREE.MeshPhysicalMaterial({
        color: cfg.colorAccent, roughness: 0.35, metalness: 0.55, emissive: cfg.colorAccent, emissiveIntensity: 0.25,
    });
    const skinMat = new THREE.MeshPhysicalMaterial({
        color: 0xcfb09b, roughness: 0.6, metalness: 0.0,
    });

    function limb(w, h, d, mat) {
        const geo = new THREE.BoxGeometry(w, h, d);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        return mesh;
    }

    // torso
    const torsoH = 1.15 + rng.range('torso', -0.08, 0.1);
    const torso = limb(0.68, torsoH, 0.42, bodyMat);
    torso.position.y = 1.25;
    group.add(torso);

    // pelvis
    const pelvis = limb(0.58, 0.3, 0.4, bodyMat);
    pelvis.position.y = 0.6;
    group.add(pelvis);

    // shoulders (two small spheres on top of torso)
    const shMat = bodyMat;
    const shL = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), shMat);
    shL.position.set(-0.4, torsoH + 1.25 - 0.15, 0);
    const shR = shL.clone();
    shR.position.x = 0.4;
    group.add(shL, shR);

    // head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 12), skinMat);
    head.position.y = 1.25 + torsoH;
    head.castShadow = true;
    group.add(head);

    // hair/hat — distinctive blob
    const hat = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), accentMat);
    hat.position.set(0, 1.25 + torsoH - 0.05, -0.08);
    hat.scale.set(1, 0.7, 1.1);
    group.add(hat);

    // arms (2 boxes hanging)
    const armMat = bodyMat;
    const armArmour = new THREE.MeshPhysicalMaterial({ color: cfg.colorAccent, roughness: 0.5, metalness: 0.4 });
    const armL = new THREE.Group();
    armL.position.set(-0.5, 1.1 + torsoH * 0.4, 0);
    const upL = limb(0.16, 0.6, 0.16, armMat);
    upL.position.y = -0.2;
    const foreL = limb(0.16, 0.55, 0.16, armMat);
    foreL.position.y = -0.6;
    const handL = limb(0.13, 0.13, 0.13, skinMat);
    handL.position.y = -0.85;
    armL.add(upL, foreL, handL);
    armL.rotation.z = 0.1;
    const armR = armL.clone();
    armR.position.x = 0.5;
    armR.scale.x = 1;
    group.add(armL, armR);

    // weapon (depends on archetype)
    let weapon;
    if (archetype === 'mage') {
        weapon = new THREE.Group();
        const staffMat = new THREE.MeshPhysicalMaterial({ color: 0x222a30, roughness: 0.9 });
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.8, 8), staffMat);
        shaft.position.y = 0.9;
        weapon.add(shaft);
        const orbMat = new THREE.MeshPhysicalMaterial({
            color: 0xa8ccff, emissive: 0x9db8ff, emissiveIntensity: 1.6, roughness: 0.2, transparent: true, opacity: 0.9,
        });
        const orb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), orbMat);
        orb.position.y = 1.85;
        weapon.add(orb);
        weapon.position.set(0.15, 1.1, 0.1);
        weapon.rotation.z = -0.25;
    } else {
        // sword / rapier
        const bladeMat = new THREE.MeshPhysicalMaterial({ color: 0xd8e0e8, roughness: 0.18, metalness: 0.9 });
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.95, 0.03), bladeMat);
        blade.position.y = 0.5;
        const guard = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.05), accentMat);
        guard.position.y = 0.06;
        const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.24, 0.05), new THREE.MeshPhysicalMaterial({
            color: 0x3a2a20, roughness: 0.6,
        }));
        hilt.position.y = -0.18;
        weapon = new THREE.Group();
        weapon.add(blade, guard, hilt);
        weapon.position.set(0.35, 1.05, -0.05);
        weapon.rotation.z = -0.5;
        weapon.rotation.x = 0.2;
    }
    group.add(weapon);
    group._weapon = weapon;
    group._armL = armL;
    group._armR = armR;
    group._torso = torso;
    group._pelvis = pelvis;
    group._head = head;

    group.traverse((o) => {
        if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
    });
    return group;
}

// General actor: shared stats/status on a lightweight plain object.
export function makeCombatantStats(overrides) {
    return {
        name: overrides.name || 'Actor',
        archetype: overrides.archetype || 'duelist',
        maxHp: overrides.maxHp || 100,
        hp: overrides.hp ?? (overrides.maxHp || 100),
        atk: overrides.atk ?? 20,
        def: overrides.def ?? 10,
        spd: overrides.spd ?? 10,
        crit: overrides.crit ?? 0.08,
        critMult: overrides.critMult ?? 1.7,
        ap: overrides.ap ?? 0,
        apMax: overrides.apMax ?? 6,
        level: overrides.level ?? 1,
        xp: overrides.xp ?? 0,
        affinity: overrides.affinity || {},
        statuses: [],
        buffs: {},
        stagger: 0,
        maxStagger: overrides.maxStagger ?? 50,
        staggerBreak: false,
        breakWindow: 0,
        dead: false,
        side: overrides.side || 'party',
        team: overrides.team || 'party',
        pos: overrides.pos || { x: 0, y: 0, z: 0 },
        // extra passthrough fields (skills, id, color, tieId, mesh …)
        skills: overrides.skills || [],
        id: overrides.id,
        color: overrides.color,
        tieId: overrides.tieId,
        mesh: overrides.mesh || null,
    };
}
