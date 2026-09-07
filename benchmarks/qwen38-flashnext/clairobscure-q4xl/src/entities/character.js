import * as THREE from 'three';
import { Fighter, POSE } from './fighter.js';
import { clothTexture, gildTexture, skinTexture, portraitTexture } from '../engine/textures.js';

// ---------------------------------------------------------------------------
// Playable character: procedural Belle-Époque humanoid with a coat, wide-brim
// hat, glowing accessory and poseable rig (head/torso/arms/legs + weapon).
// Visuals are parameterised from the definition so each member looks distinct.
// ---------------------------------------------------------------------------

function meshMat(tex, color, opts = {}) {
  return new THREE.MeshPhysicalMaterial({
    map: tex || null,
    color: new THREE.Color(color),
    roughness: opts.roughness ?? 0.62,
    metalness: opts.metalness ?? 0.05,
    sheen: opts.sheen ?? 0.4,
    sheenColor: new THREE.Color(opts.sheenColor || '#8fbcb6'),
    clearcoat: opts.clearcoat ?? 0.08,
    emissive: new THREE.Color(opts.emissive || '#000000'),
    emissiveIntensity: opts.emissiveIntensity ?? 1
  });
}

export class Character extends Fighter {
  constructor(def, bus, stage) {
    super(def, bus);
    this.skills = def.skills.slice();
    this.pictos = def.pictos ? def.pictos.slice() : [];
    this.xp = 0;
    this.xpToNext = 100;
    this.chargeContribution = 0;
    this._buildMesh(stage);
    this._attackDur = 0.7;
  }

  _buildMesh(stage) {
    const v = def2vis(this.def, 2700 + this.id * 17);
    // Painted portrait for the HUD roster cards.
    this.portrait = portraitTexture(4000 + this.id * 31, v.hue, v.accentHue ?? 42);
    const cloth = clothTexture(11 + this.id * 7, v.hue, v.sat, v.light);
    const gild = gildTexture(50 + this.id);
    const skin = skinTexture(90 + this.id * 5, v.skinHue);
    const coatMat = meshMat(cloth, '#ffffff', { sheen: 0.6, sheenColor: v.accentCss });
    const trimMat = meshMat(gild, v.trimCss, { metalness: 0.8, roughness: 0.3, clearcoat: 0.3 });
    const skinMat = meshMat(skin, '#ffffff', { sheen: 0.2, roughness: 0.75 });
    const darkMat = meshMat(null, v.hatCss, { roughness: 0.55, sheen: 0.3 });
    const glowMat = new THREE.MeshStandardMaterial({
      color: v.accentCss, emissive: v.accentCss, emissiveIntensity: 1.5, roughness: 0.4
    });

    const group = new THREE.Group();
    const root = new THREE.Group();
    group.add(root);

    // Legs
    const legGeo = new THREE.CapsuleGeometry(0.11, 0.55, 4, 10);
    const legL = new THREE.Mesh(legGeo, darkMat);
    legL.position.set(-0.16, 0.45, 0);
    const legR = new THREE.Mesh(legGeo, darkMat);
    legR.position.set(0.16, 0.45, 0);
    root.add(legL, legR);

    // Long coat / torso (tapered cylinder reads as a fitted jacket).
    const body = new THREE.Group();
    body.position.y = 0.92;
    root.add(body);
    const coat = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.42, 0.95, 14), coatMat);
    coat.position.y = 0.28;
    body.add(coat);
    // Gilded trim sash
    const sash = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.035, 8, 20), trimMat);
    sash.rotation.x = Math.PI / 2;
    sash.position.y = 0.15;
    body.add(sash);
    // Pauldrons
    for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2), trimMat);
      p.position.set(sx * 0.32, 0.7, 0);
      body.add(p);
    }

    // Arms
    const armGeo = new THREE.CapsuleGeometry(0.085, 0.62, 4, 10);
    const armL = new THREE.Group();
    armL.position.set(-0.36, 1.58, 0);
    const armLMesh = new THREE.Mesh(armGeo, coatMat);
    armLMesh.position.y = -0.36;
    armL.add(armLMesh);
    const armR = new THREE.Group();
    armR.position.set(0.36, 1.58, 0);
    const armRMesh = new THREE.Mesh(armGeo, coatMat);
    armRMesh.position.y = -0.36;
    armR.add(armRMesh);
    root.add(armL, armR);

    // Head + wide-brim hat
    const head = new THREE.Group();
    head.position.y = 1.86;
    root.add(head);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 14), skinMat);
    head.add(skull);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.035, 20), darkMat);
    brim.position.y = 0.16;
    head.add(brim);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.21, 0.22, 14), darkMat);
    crown.position.y = 0.28;
    head.add(crown);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.055, 14), trimMat);
    band.position.y = 0.2;
    head.add(band);
    // Glowing accessory (monocle / brooch / sigil depending on accent)
    const monocle = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.016, 6, 16), glowMat);
    monocle.position.set(0.1, 0.02, 0.19);
    head.add(monocle);

    const rig = { root, body, armL, armR, legL, legR, head };

    this._addWeapon(v.kind, rig, trimMat, glowMat, darkMat);

    group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    group.position.set(this.slots.x, 0, this.slots.z);
    group.rotation.y = this.facing;
    stage.group.add(group);
    this.group = group;
    this.mesh = group;
    group.userData.fighter = this;
    this.rig = rig;
    this.auraRing = stage.makeSlotMarker('party');
    this.auraRing.position.set(this.slots.x, 0.015, this.slots.z);
    this.updateWeakWorld();
    this.invalidateMaterialCache();

    // Weak point: the chest/brooch.
    this.weakPointLocal = { x: 0, y: 1.35, z: 0.32, r: 0.3 };
    this.weakPointLabel = 'Coeur';
  }

  _addWeapon(kind, rig, trimMat, glowMat, darkMat) {
    const hand = new THREE.Group();
    hand.position.set(0, -0.72, 0.05);
    rig.armR.add(hand);
    if (kind === 'rapier') {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.045, 1.35, 0.09), trimMat);
      blade.position.y = 0.72;
      hand.add(blade);
      const guard = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.022, 6, 14), glowMat);
      guard.rotation.x = Math.PI / 2;
      hand.add(guard);
      rig.weaponTipPos = new THREE.Vector3(0, 1.4, 0);
      rig.weaponTip = hand;
    } else if (kind === 'brush') {
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 0.85, 8), darkMat);
      stem.position.y = 0.38;
      hand.add(stem);
      const bristles = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 10), glowMat);
      bristles.position.y = 0.92;
      hand.add(bristles);
    } else if (kind === 'revolver') {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 10), trimMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0, 0.28);
      hand.add(barrel);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.24, 0.1), darkMat);
      grip.position.y = -0.08;
      hand.add(grip);
    } else if (kind === 'lantern') {
      const cage = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), glowMat);
      cage.position.y = 0.16;
      hand.add(cage);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.02, 6, 14), trimMat);
      rim.position.y = 0.16;
      hand.add(rim);
    } else if (kind === 'cleaver') {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.72, 0.05), trimMat);
      blade.position.y = 0.5;
      hand.add(blade);
    } else if (kind === 'staff') {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.5, 8), darkMat);
      shaft.position.y = 0.5;
      hand.add(shaft);
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 12), glowMat);
      orb.position.y = 1.32;
      hand.add(orb);
    }
    this.invalidateMaterialCache();
  }

  beginAttack(duration = 0.7) {
    this._attackDur = duration;
    this.setPose(POSE.ATTACK, duration);
  }
  beginCast(duration = 0.9) {
    this._attackDur = duration;
    this.setPose(POSE.CAST, duration);
  }

  addXp(n) {
    this.xp += n;
    let levels = 0;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level += 1;
      levels += 1;
      this.xpToNext = Math.round(this.xpToNext * 1.5);
      // Stat growth: +9% max HP, +8% attack, small speed.
      this.stats.maxHpBase = Math.round((this.stats.maxHpBase ?? this.maxHp) * 1.09);
      this.maxHp = this.stats.maxHpBase;
      this.hp = Math.min(this.maxHp, this.hp + Math.round(this.maxHp * 0.25));
      this.stats.atk = Math.round(this.stats.atk * 1.08);
      this.stats.spd += 1;
      this.maxStagger = Math.round(this.maxStagger * 1.05);
    }
    return levels;
  }
}

// Turn definition visual params into material-ready values.
function def2vis(def, seed) {
  const v = def.visual || {};
  return {
    kind: v.weapon || 'rapier',
    hue: v.hue ?? 200,
    sat: v.sat ?? 30,
    light: v.light ?? 40,
    skinHue: v.skinHue ?? 28,
    accentHue: v.accentHue ?? 42,
    accentCss: v.accent || '#f4d489',
    trimCss: v.trim || '#d8a94a',
    hatCss: v.hat || '#22313a'
  };
}
