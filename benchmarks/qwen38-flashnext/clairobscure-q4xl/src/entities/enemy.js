import * as THREE from 'three';
import { Fighter, POSE } from './fighter.js';
import { plateTexture, gildTexture } from '../engine/textures.js';

// ---------------------------------------------------------------------------
// Enemy combatant. Visual + attack-pattern data live in the definition
// (entities/enemy-data.js); this class builds the mesh and exposes the
// telegraph animation poses used by the reaction system.
// ---------------------------------------------------------------------------

function plateMat(tex, color, emissive = '#000000', emiI = 1, metal = 0.35, rough = 0.6) {
  return new THREE.MeshPhysicalMaterial({
    map: tex, color: new THREE.Color(color),
    metalness: metal, roughness: rough,
    clearcoat: 0.12,
    emissive: new THREE.Color(emissive), emissiveIntensity: emiI
  });
}

export class Enemy extends Fighter {
  constructor(def, bus, stage, rng) {
    super(def, bus);
    this.patterns = def.patterns;       // array of attack pattern ids
    this.boss = !!def.boss;
    this.weakLabel = def.weakLabel || 'Point vital';
    this.phase = 1;
    this.phase2At = def.phase2At || null; // hp fraction that shifts the move set
    this.rng = rng;
    this.chargeOnDeath = def.chargeOnDeath || 12;
    this._buildMesh(stage);
    this._windupPart = this.rig.windup || this.rig.armR || this.rig.root;
  }

  get patternIds() {
    if (this.phase === 2 && this.patterns.phase2) return this.patterns.phase2;
    return this.patterns.base;
  }

  maybeEnterPhase2() {
    if (this.phase === 1 && this.phase2At && this.hpFrac <= this.phase2At) {
      this.phase = 2;
      // Phase-shift glow.
      if (this.rig.core) {
        this.rig.core.material.emissive.set('#ff5533');
        this.rig.core.material.emissiveIntensity = 4;
      }
      return true;
    }
    return false;
  }

  _buildMesh(stage) {
    const def = this.def;
    const v = def.visual;
    const plate = plateTexture(400 + this.id * 13, v.hue, v.sat ?? 14, v.light ?? 26);
    const gild = gildTexture(300 + this.id);
    // Body keeps only a whisper of the glow colour (full glowI here blows out bloom).
    const bodyMat = plateMat(plate, v.body || '#2a3b44', v.glow || '#000000',
      Math.min(0.35, (v.glowI || 0) * 0.12), 0.25, 0.7);
    const armorMat = plateMat(plate, v.armor || '#17252b', '#000000', 0, 0.55, 0.45);
    const edgeMat = plateMat(gild, v.edge || '#d8a94a', '#000000', 0, 0.85, 0.3);
    const glowMat = new THREE.MeshStandardMaterial({
      color: v.glow || '#f4d489', emissive: v.glow || '#f4d489',
      emissiveIntensity: Math.min(1.7, v.glowI || 1.6), roughness: 0.35
    });

    const kind = v.kind || 'slime';
    const s = v.scale || 1;
    const group = new THREE.Group();
    const root = new THREE.Group();
    group.add(root);
    const rig = { root };

    if (kind === 'slime') this._buildSlime(root, rig, bodyMat, glowMat);
    else if (kind === 'clock') this._buildClock(root, rig, armorMat, edgeMat, glowMat);
    else if (kind === 'paint') this._buildPaintFling(root, rig, bodyMat, edgeMat, glowMat);
    else if (kind === 'noir') this._buildNoir(root, rig, armorMat, edgeMat, glowMat);
    else if (kind === 'sister') this._buildSister(root, rig, bodyMat, armorMat, edgeMat, glowMat);
    else this._buildSlime(root, rig, bodyMat, glowMat);

    root.scale.setScalar(s);

    group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    group.position.set(this.slots.x, 0, this.slots.z);
    group.rotation.y = this.facing;
    stage.group.add(group);
    this.group = group;
    this.mesh = group;
    group.userData.fighter = this;
    this.rig = rig;
    this.auraRing = stage.makeSlotMarker('enemy');
    this.auraRing.position.set(this.slots.x, 0.015, this.slots.z);
    this.updateWeakWorld();
    this.invalidateMaterialCache();

    if (def.weakPoint) this.weakPointLocal = def.weakPoint;
    if (def.weakLabel) this.weakPointLabel = def.weakLabel;
  }

  // -- procedural silhouettes --------------------------------------------------

  _buildSlime(root, rig, bodyMat, glowMat) {
    // Paint-slime: wobbling blob with a glowing core + mask plate.
    const blob = new THREE.Mesh(new THREE.SphereGeometry(0.85, 22, 16), bodyMat);
    blob.scale.set(1.1, 0.85, 1);
    blob.position.y = 0.75;
    root.add(blob);
    rig.body = blob;
    rig.windup = blob;
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 1), glowMat);
    core.position.y = 0.85;
    root.add(core);
    rig.core = core;
    const mask = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.34, 0.1), glowMat.clone());
    mask.material.emissiveIntensity = 1.2;
    mask.position.set(0, 1.0, 0.68);
    root.add(mask);
    // two little arms of paint
    for (const sx of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.36, 4, 8), bodyMat);
      arm.position.set(sx * 0.8, 0.7, 0.1);
      arm.rotation.z = sx * 0.8;
      root.add(arm);
      const armPivot = new THREE.Group();
      armPivot.position.set(sx * 0.72, 0.85, 0.1);
      arm.position.set(sx * 0.14, -0.15, 0);
      root.add(armPivot);
      armPivot.add(arm);
      if (sx === 1) rig.armR = armPivot; else rig.armL = armPivot;
    }
  }

  _buildClock(root, rig, armorMat, edgeMat, glowMat) {
    // Clockwork sentry: gear torso, pendulum core, blade arms.
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.78, 1.5, 12), armorMat);
    torso.position.y = 1.35;
    root.add(torso);
    rig.body = torso;
    const gear = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.08, 8, 12), edgeMat);
    gear.position.set(0, 1.45, 0.6);
    root.add(gear);
    rig.windup = gear;
    rig.gear = gear;
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 12), glowMat);
    core.position.set(0, 1.45, 0.62);
    root.add(core);
    rig.core = core;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.5), armorMat);
    head.position.y = 2.4;
    root.add(head);
    rig.head = head;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), glowMat);
    eye.position.set(0, 2.45, 0.27);
    root.add(eye);
    for (const sx of [-1, 1]) {
      const armG = new THREE.Group();
      armG.position.set(sx * 0.78, 1.95, 0);
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.7, 4, 8), armorMat);
      upper.position.y = -0.4;
      armG.add(upper);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.95, 0.24), edgeMat);
      blade.position.y = -1.1;
      armG.add(blade);
      root.add(armG);
      if (sx === 1) rig.armR = armG; else rig.armL = armG;
    }
    const legGeo = new THREE.CylinderGeometry(0.12, 0.16, 0.7, 8);
    const legL = new THREE.Mesh(legGeo, armorMat); legL.position.set(-0.3, 0.35, 0);
    const legR = new THREE.Mesh(legGeo, armorMat); legR.position.set(0.3, 0.35, 0);
    root.add(legL, legR);
    rig.legL = legL; rig.legR = legR;
  }

  _buildPaintFling(root, rig, bodyMat, edgeMat, glowMat) {
    // Estampe: floating palette-wraith with bristle arms.
    const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.9, 10, 1, true), bodyMat);
    cloak.material = bodyMat;
    cloak.position.y = 1.15;
    root.add(cloak);
    rig.body = cloak;
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 12), bodyMat);
    hood.position.y = 2.1;
    root.add(hood);
    rig.head = hood;
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.2, 12), glowMat);
    face.position.set(0, 2.08, 0.34);
    root.add(face);
    rig.core = face;
    const palette = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.07, 16), edgeMat);
    palette.rotation.x = Math.PI / 2.4;
    palette.position.set(-0.55, 1.5, 0.35);
    root.add(palette);
    rig.windup = palette;
    for (const sx of [-1, 1]) {
      const armG = new THREE.Group();
      armG.position.set(sx * 0.55, 1.85, 0.05);
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.6, 4, 8), bodyMat);
      arm.position.y = -0.34;
      armG.add(arm);
      root.add(armG);
      if (sx === 1) rig.armR = armG; else rig.armL = armG;
    }
    // hovering: no legs
    rig.floats = true;
  }

  _buildNoir(root, rig, armorMat, edgeMat, glowMat) {
    // Garde Noire: tall dark duelist with a needle rapier.
    const coat = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.62, 1.7, 12), armorMat);
    coat.position.y = 1.25;
    root.add(coat);
    rig.body = coat;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 12), armorMat);
    head.position.y = 2.32;
    root.add(head);
    rig.head = head;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.09, 0.1), glowMat);
    visor.position.set(0, 2.34, 0.2);
    root.add(visor);
    rig.core = visor;
    const armR = new THREE.Group();
    armR.position.set(0.42, 1.9, 0);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.75, 4, 8), armorMat);
    arm.position.y = -0.42;
    armR.add(arm);
    const rapier = new THREE.Mesh(new THREE.BoxGeometry(0.035, 1.5, 0.07), edgeMat);
    rapier.position.y = -1.4;
    armR.add(rapier);
    root.add(armR);
    rig.armR = armR;
    rig.windup = armR;
    const armL = new THREE.Group();
    armL.position.set(-0.42, 1.9, 0);
    const armLm = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.7, 4, 8), armorMat);
    armLm.position.y = -0.38;
    armL.add(armLm);
    root.add(armL);
    rig.armL = armL;
  }

  _buildSister(root, rig, bodyMat, armorMat, edgeMat, glowMat) {
    // Boss: La Soeur de Givre — ice abbess, giant bell silhouette.
    const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.45, 2.6, 14), bodyMat);
    robe.position.y = 1.5;
    root.add(robe);
    rig.body = robe;
    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.9, 12), armorMat);
    hood.position.y = 3.2;
    root.add(hood);
    rig.head = hood;
    const faceGlow = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), glowMat);
    faceGlow.position.set(0, 3.0, 0.3);
    root.add(faceGlow);
    rig.core = faceGlow;
    // Halo crown of floating shards
    const halo = new THREE.Group();
    halo.position.y = 3.5;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.14), edgeMat);
      shard.position.set(Math.cos(a) * 0.85, Math.sin(a * 2) * 0.12, Math.sin(a) * 0.85);
      halo.add(shard);
    }
    root.add(halo);
    rig.halo = halo;
    // Big bell-sleeve arms
    for (const sx of [-1, 1]) {
      const armG = new THREE.Group();
      armG.position.set(sx * 0.85, 2.5, 0.05);
      const sleeve = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.25, 10), armorMat);
      sleeve.rotation.x = Math.PI;
      sleeve.position.y = -0.55;
      armG.add(sleeve);
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.5, 6), edgeMat);
      claw.position.y = -1.3;
      armG.add(claw);
      root.add(armG);
      if (sx === 1) rig.armR = armG; else rig.armL = armG;
    }
    rig.windup = rig.armR;
  }

  // -- telegraph poses -----------------------------------------------------------

  // Big readable wind-up. `big` = heavy attack. Duration purely cosmetic;
  // timing windows are driven by ReactionSystem wall-clock values.
  beginWindup(big = false) {
    this._windupBig = big;
    if (this.rig.windup) this._windupKick = big ? -2.4 : -1.5;
    if (this.rig.core) {
      this.rig.core.material.emissiveIntensity = (this.def.visual.glowI || 2.4) + (big ? 3.5 : 1.6);
    }
    this.setPose(big ? POSE.CAST : POSE.ATTACK, 1.0);
  }

  releaseStrike() {
    this._windupKick = 3.2;
    this.setPose(POSE.ATTACK, 0.45);
  }

  // Extend Fighter idle with species-specific motion.
  updateAnim(dt, time) {
    super.updateAnim(dt, time);
    if (!this.alive) {
      if (this.rig.halo) this.rig.halo.visible = false;
      return;
    }
    const r = this.rig;
    if (r.windup) {
      this._windupKick = (this._windupKick || 0) * Math.exp(-7 * dt);
      if (Math.abs(this._windupKick) > 0.001) {
        if (r.windup.isGroup || r.windup.type === 'Group') {
          r.windup.rotation.x = -0.3 + this._windupKick;
        } else {
          r.windup.rotation.z = this._windupKick * 0.3;
          r.windup.scale.setScalar(1 + Math.min(0.25, Math.abs(this._windupKick) * 0.06));
        }
      } else if (r.windup.isGroup || r.windup.type === 'Group') {
        r.windup.rotation.x = damp(r.windup.rotation.x, -0.1, 6, dt);
      }
    }
    if (r.gear) r.gear.rotation.z += dt * (this.pose === POSE.ATTACK ? 9 : 1.2);
    if (r.halo) { r.halo.rotation.y += dt * 0.7; r.halo.position.y = 3.5 + Math.sin(time * 1.3) * 0.08; }
    if (r.core && r.core.isMesh) {
      r.core.rotation.y += dt * 1.6;
      if (this.pose !== POSE.ATTACK && this.pose !== POSE.CAST) {
        const base = this.def.visual.glowI || 2.4;
        r.core.material.emissiveIntensity = base + Math.sin(time * 2.2 + this.id) * 0.5;
      }
    }
    if (r.body && r.floats) r.body.position.y = 1.4 + Math.sin(time * 1.1 + this.id) * 0.1;
    if (this.rig.body && this.def.visual.kind === 'slime' && r.body.isMesh) {
      const wob = 1 + Math.sin(time * 2.6 + this.id) * 0.05;
      r.body.scale.set(1.1 * (2 - wob), 0.85 * wob, 1);
    }
  }
}
