/**
 * Procedural humanoid construction + the pose/clip animation machinery shared
 * by every combatant in the game.
 *
 * A rig is a tree of empty THREE.Group "joints" with geometry hung off them, so
 * rotating a joint swings everything below it. Animation is keyframed poses
 * (sparse maps of jointName -> [rx, ry, rz]) sampled and cross-faded by
 * `Animator`, plus an additive procedural layer for breathing and weapon sway.
 *
 * No skinning, no external models — capsules, cylinders, boxes and lathes only.
 */

import * as THREE from 'three';
import {
  fabricTexture, skinTexture, metalTexture, runeTexture, PALETTE,
} from '../engine/textures.js';
import { clamp01, lerp, easeInOutCubic, easeOutCubic } from '../core/easing.js';

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

export function clothMaterial(color, accent, key) {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    map: fabricTexture(color, accent, key),
    roughness: 0.86,
    metalness: 0.03,
    sheen: 0.55,
    sheenColor: new THREE.Color(accent),
    sheenRoughness: 0.5,
  });
}

export function skinMaterial(color, key) {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    map: skinTexture(color, key),
    roughness: 0.72,
    metalness: 0.0,
    sheen: 0.2,
    sheenColor: new THREE.Color('#ffd8c0'),
    clearcoat: 0.12,
    clearcoatRoughness: 0.8,
  });
}

export function metalMaterial(color, key, rough = 0.28) {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    map: metalTexture(color, key),
    roughness: rough,
    metalness: 0.94,
    clearcoat: 0.35,
    clearcoatRoughness: 0.32,
  });
}

export function emissiveMaterial(color, intensity = 2.2, key = 'default') {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    emissive: new THREE.Color(color),
    emissiveIntensity: intensity,
    emissiveMap: runeTexture(color, key),
    roughness: 0.4,
    metalness: 0.1,
  });
}

export function glassMaterial(color) {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    roughness: 0.12,
    metalness: 0,
    transmission: 0.72,
    thickness: 0.4,
    ior: 1.4,
    transparent: true,
    opacity: 0.85,
  });
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/** A joint pivot: an empty group at a local offset from its parent. */
export function joint(parent, name, x, y, z) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

/**
 * A capsule limb hanging downward from a joint pivot.
 * @returns {THREE.Mesh}
 */
export function limb(parent, length, radius, material, taper = 1) {
  const body = Math.max(0.01, length - radius * 2);
  const geo = new THREE.CapsuleGeometry(radius, body, 4, 10);
  if (taper !== 1) {
    // Squash the lower half so limbs narrow toward hand/foot.
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const f = y < 0 ? lerp(1, taper, Math.min(1, -y / (length * 0.5))) : 1;
      pos.setX(i, pos.getX(i) * f);
      pos.setZ(i, pos.getZ(i) * f);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }
  const m = new THREE.Mesh(geo, material);
  m.position.y = -length / 2;
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

export function box(parent, w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

export function tube(parent, rTop, rBot, h, material, segments = 12, open = false) {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(rTop, rBot, h, segments, 1, open),
    material,
  );
  m.castShadow = true;
  m.receiveShadow = true;
  if (open) m.material.side = THREE.DoubleSide;
  parent.add(m);
  return m;
}

export function sphere(parent, r, material, widthSeg = 16, heightSeg = 12) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, widthSeg, heightSeg), material);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/** Lathe-turned silhouette, used for hats, finials and ornament. */
export function lathe(parent, profile, material, segments = 16) {
  const pts = profile.map((p) => new THREE.Vector2(p[0], p[1]));
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts, segments), material);
  m.castShadow = true;
  m.material.side = THREE.DoubleSide;
  parent.add(m);
  return m;
}

// ---------------------------------------------------------------------------
// Pose sampling
// ---------------------------------------------------------------------------

/**
 * Neutral A-pose every humanoid clip is layered over.
 * Sign conventions (character faces +Z):
 *   shoulder/hip  rotation.x < 0 swings the limb forward
 *   knee/elbow    rotation.x > 0 folds the joint backward
 *   shoulderL     rotation.z > 0 abducts outward; shoulderR is mirrored
 */
export const REST_POSE = {
  hips: [0, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], neck: [0, 0, 0], head: [0, 0, 0],
  shoulderL: [0, 0, 0.16], elbowL: [-0.18, 0, -0.08], wristL: [0, 0, 0],
  shoulderR: [0, 0, -0.16], elbowR: [-0.18, 0, 0.08], wristR: [0, 0, 0],
  hipL: [0, 0, 0.05], kneeL: [0.06, 0, 0], ankleL: [0, 0, 0],
  hipR: [0, 0, -0.05], kneeR: [0.06, 0, 0], ankleR: [0, 0, 0],
  rootPos: [0, 0, 0], rootRot: [0, 0, 0],
};

function blendTriple(a, b, t, out) {
  out[0] = lerp(a[0], b[0], t);
  out[1] = lerp(a[1], b[1], t);
  out[2] = lerp(a[2], b[2], t);
  return out;
}

/**
 * Sample a clip (array of `{t, pose}` keys, t in 0..1) at normalised time `u`.
 * Any joint a keyframe omits falls back to the supplied rest pose.
 */
export function sampleClip(clip, u, out, rest = REST_POSE) {
  const keys = clip.keys;
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1].t <= u) i++;
  const a = keys[i];
  const b = keys[Math.min(i + 1, keys.length - 1)];
  const span = Math.max(1e-5, b.t - a.t);
  let f = clamp01((u - a.t) / span);
  f = clip.linear ? f : easeInOutCubic(f);

  for (const name in rest) {
    const av = a.pose[name] || rest[name];
    const bv = b.pose[name] || rest[name];
    if (!out[name]) out[name] = [0, 0, 0];
    blendTriple(av, bv, f, out[name]);
  }
  return out;
}

function newPoseBuffer(rest) {
  const p = {};
  for (const k in rest) p[k] = rest[k].slice();
  return p;
}

// ---------------------------------------------------------------------------
// Animator
// ---------------------------------------------------------------------------

export class Animator {
  /**
   * @param {object} rig      { joints, root, offsetNode }
   * @param {object} clipTable name -> { dur, loop, keys, linear }
   * @param {object} rest     rest pose whose keys define the animated joint set
   */
  constructor(rig, clipTable, rest = REST_POSE) {
    this.rig = rig;
    this.clips = clipTable;
    this.rest = rest;
    this.currentName = 'idle';
    this.current = clipTable.idle;
    this.time = 0;
    this.speed = 1;
    this.prev = null;
    this.prevTime = 0;
    this.fade = 1;
    this.fadeDur = 0.18;
    this.finished = false;
    this.pinned = false;
    this._a = newPoseBuffer(rest);
    this._b = newPoseBuffer(rest);
    this._out = newPoseBuffer(rest);
    this.onComplete = null;
  }

  has(name) {
    return !!this.clips[name];
  }

  /** Start a clip, cross-fading from whatever is playing. */
  play(name, opts = {}) {
    const clip = this.clips[name];
    if (!clip) return false;
    if (name === this.currentName && clip.loop && !opts.restart) return true;
    this.prev = this.current;
    this.prevTime = this.time;
    this.fade = 0;
    this.fadeDur = opts.fade === undefined ? (clip.fade || 0.16) : opts.fade;
    this.current = clip;
    this.currentName = name;
    this.time = 0;
    this.speed = opts.speed || 1;
    this.finished = false;
    this.pinned = false;
    this.onComplete = opts.onComplete || null;
    return true;
  }

  /**
   * Pin the playhead to an externally driven phase. Used so the enemy's swing
   * is locked to the reaction system's wall-clock timing rather than to the
   * clip's authored duration — the weapon meets the target on the exact frame
   * the hit resolves, whatever the wind-up length happens to be.
   */
  setPhase(u) {
    if (!this.current) return;
    this.time = clamp01(u) * this.current.dur;
    this.pinned = true;
  }

  unpin() {
    this.pinned = false;
  }

  update(dt) {
    if (!this.current) return;
    if (!this.pinned) this.time += dt * this.speed;
    if (this.fade < 1) this.fade = Math.min(1, this.fade + dt / Math.max(0.001, this.fadeDur));

    let u;
    if (this.current.loop) {
      u = (this.time / this.current.dur) % 1;
    } else {
      u = clamp01(this.time / this.current.dur);
      if (u >= 1 && !this.finished) {
        this.finished = true;
        if (this.onComplete) {
          const cb = this.onComplete;
          this.onComplete = null;
          cb();
        }
      }
    }

    sampleClip(this.current, u, this._a, this.rest);
    let pose = this._a;
    if (this.prev && this.fade < 1) {
      const pu = this.prev.loop
        ? (this.prevTime / this.prev.dur) % 1
        : clamp01(this.prevTime / this.prev.dur);
      sampleClip(this.prev, pu, this._b, this.rest);
      const f = easeOutCubic(this.fade);
      for (const k in this._out) blendTriple(this._b[k], this._a[k], f, this._out[k]);
      pose = this._out;
    }
    this.applyPose(pose);
  }

  applyPose(pose) {
    const j = this.rig.joints;
    for (const name in j) {
      const p = pose[name];
      if (!p) continue;
      j[name].rotation.set(p[0], p[1], p[2]);
    }
    if (this.rig.offsetNode) {
      const rp = pose.rootPos, rr = pose.rootRot;
      this.rig.offsetNode.position.set(rp[0], rp[1], rp[2]);
      this.rig.offsetNode.rotation.set(rr[0], rr[1], rr[2]);
    }
  }
}

// ---------------------------------------------------------------------------
// Humanoid construction
// ---------------------------------------------------------------------------

/**
 * Build a stylised Belle-Epoque expeditioner.
 *
 * @param {object} spec {
 *   palette:{coat, trim, skin, metal, accent, hair},
 *   build:{height, bulk, coatLength},
 *   features:{hat:'tricorn'|'wide'|'hood'|null, cape:boolean, prosthetic:boolean,
 *             collar:boolean, skirt:boolean},
 *   weapon:'rapier'|'staff'|'pistol'
 * }
 * @returns {{root, offsetNode, joints, parts, weapon}}
 */
export function buildHumanoid(spec) {
  const p = spec.palette;
  const b = spec.build || {};
  const f = spec.features || {};
  const key = spec.key || 'gen';
  const bulk = b.bulk === undefined ? 1 : b.bulk;

  const root = new THREE.Group();
  const offsetNode = new THREE.Group();  // animated root motion lives here
  root.add(offsetNode);

  const matCoat = clothMaterial(p.coat, p.trim, `${key}-coat`);
  const matTrim = clothMaterial(p.trim, p.accent, `${key}-trim`);
  const matSkin = skinMaterial(p.skin, `${key}-skin`);
  const matMetal = metalMaterial(p.metal, `${key}-metal`);
  const matGold = metalMaterial(PALETTE.gold, 'gold-shared', 0.24);
  const matAccent = emissiveMaterial(p.accent, 1.6, `${key}-accent`);

  const joints = {};
  const parts = { emissive: [matAccent] };

  joints.hips = joint(offsetNode, 'hips', 0, 0.94 * (b.height || 1), 0);
  joints.spine = joint(joints.hips, 'spine', 0, 0.15, 0);
  joints.chest = joint(joints.spine, 'chest', 0, 0.22, 0);
  joints.neck = joint(joints.chest, 'neck', 0, 0.25, 0);
  joints.head = joint(joints.neck, 'head', 0, 0.07, 0);

  joints.shoulderL = joint(joints.chest, 'shoulderL', 0.21 * bulk, 0.17, 0);
  joints.elbowL = joint(joints.shoulderL, 'elbowL', 0, -0.3, 0);
  joints.wristL = joint(joints.elbowL, 'wristL', 0, -0.28, 0);

  joints.shoulderR = joint(joints.chest, 'shoulderR', -0.21 * bulk, 0.17, 0);
  joints.elbowR = joint(joints.shoulderR, 'elbowR', 0, -0.3, 0);
  joints.wristR = joint(joints.elbowR, 'wristR', 0, -0.28, 0);

  joints.hipL = joint(joints.hips, 'hipL', 0.115, -0.06, 0);
  joints.kneeL = joint(joints.hipL, 'kneeL', 0, -0.44, 0);
  joints.ankleL = joint(joints.kneeL, 'ankleL', 0, -0.42, 0);

  joints.hipR = joint(joints.hips, 'hipR', -0.115, -0.06, 0);
  joints.kneeR = joint(joints.hipR, 'kneeR', 0, -0.44, 0);
  joints.ankleR = joint(joints.kneeR, 'ankleR', 0, -0.42, 0);

  // --- Torso ---------------------------------------------------------------
  const pelvis = tube(joints.hips, 0.19 * bulk, 0.17 * bulk, 0.2, matTrim, 10);
  pelvis.position.y = 0.02;
  const torso = tube(joints.spine, 0.21 * bulk, 0.2 * bulk, 0.3, matCoat, 12);
  torso.position.y = 0.12;
  const ribs = tube(joints.chest, 0.17 * bulk, 0.235 * bulk, 0.32, matCoat, 12);
  ribs.position.y = 0.12;

  // Gilded chest ornament.
  const brooch = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.019, 8, 14), matGold);
  brooch.position.set(0, 0.14, 0.2 * bulk);
  brooch.castShadow = true;
  joints.chest.add(brooch);
  const gem = sphere(joints.chest, 0.035, matAccent, 12, 10);
  gem.position.set(0, 0.14, 0.215 * bulk);
  parts.gem = gem;

  if (f.collar) {
    const collar = lathe(joints.chest, [
      [0.09, 0], [0.2, 0.1], [0.26, 0.21], [0.24, 0.23], [0.16, 0.11], [0.08, 0.02],
    ], matTrim, 14);
    collar.position.y = 0.2;
  }

  // --- Head ----------------------------------------------------------------
  const skull = sphere(joints.head, 0.125, matSkin, 18, 14);
  skull.scale.set(1, 1.14, 1.02);
  const jaw = box(joints.head, 0.13, 0.07, 0.11, matSkin, 0, -0.09, 0.03);
  jaw.scale.set(1, 1, 1);
  const hair = lathe(joints.head, [
    [0.0, 0.16], [0.09, 0.15], [0.135, 0.08], [0.14, -0.02], [0.125, -0.06], [0, -0.06],
  ], clothMaterial(p.hair || '#2a1c18', p.trim, `${key}-hair`), 16);
  hair.position.y = 0.02;
  hair.scale.set(1.02, 1, 1.04);

  // Eyes as faint emissive dots keep the face readable at distance.
  const eyeMat = emissiveMaterial(p.accent, 2.6, `${key}-eye`);
  parts.emissive.push(eyeMat);
  const eyeL = sphere(joints.head, 0.018, eyeMat, 8, 6);
  eyeL.position.set(0.045, 0.012, 0.113);
  const eyeR = sphere(joints.head, 0.018, eyeMat, 8, 6);
  eyeR.position.set(-0.045, 0.012, 0.113);
  parts.eyes = [eyeL, eyeR];

  if (f.hat === 'tricorn') {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.29, 0.028, 3), matCoat);
    brim.position.y = 0.15;
    brim.rotation.y = Math.PI / 6;
    brim.castShadow = true;
    joints.head.add(brim);
    const crown = lathe(joints.head, [[0, 0.24], [0.1, 0.23], [0.14, 0.16], [0.15, 0.14]], matCoat, 12);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.016, 6, 16), matGold);
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.16;
    joints.head.add(band);
    crown.position.y = 0;
  } else if (f.hat === 'wide') {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.022, 18), matCoat);
    brim.position.y = 0.14;
    brim.castShadow = true;
    brim.rotation.z = 0.09;
    joints.head.add(brim);
    lathe(joints.head, [[0, 0.3], [0.09, 0.29], [0.13, 0.2], [0.14, 0.14]], matCoat, 14);
    const feather = box(joints.head, 0.012, 0.19, 0.05, matAccent, 0.12, 0.24, -0.06);
    feather.rotation.z = -0.5;
    feather.rotation.x = 0.3;
  } else if (f.hat === 'hood') {
    const hood = lathe(joints.head, [
      [0.02, 0.28], [0.13, 0.24], [0.19, 0.1], [0.2, -0.06], [0.185, -0.12], [0.16, -0.13],
    ], matCoat, 16);
    hood.position.z = -0.02;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.018, 6, 18), matGold);
    rim.rotation.x = Math.PI / 2.1;
    rim.position.set(0, 0.02, 0.03);
    joints.head.add(rim);
  }

  // --- Arms ----------------------------------------------------------------
  const armMat = f.prosthetic ? matMetal : matCoat;
  limb(joints.shoulderL, 0.3, 0.072 * bulk, matCoat, 0.9);
  limb(joints.elbowL, 0.28, 0.058 * bulk, matCoat, 0.88);
  const handL = sphere(joints.wristL, 0.055, matSkin, 10, 8);
  handL.position.y = -0.04;

  limb(joints.shoulderR, 0.3, 0.076 * bulk, armMat, 0.9);
  limb(joints.elbowR, 0.28, 0.06 * bulk, armMat, 0.88);
  const handR = sphere(joints.wristR, 0.058, f.prosthetic ? matMetal : matSkin, 10, 8);
  handR.position.y = -0.04;

  // Pauldrons.
  const pauldronGeo = new THREE.SphereGeometry(0.11 * bulk, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62);
  const paulL = new THREE.Mesh(pauldronGeo, matTrim);
  paulL.position.y = 0.01;
  paulL.castShadow = true;
  joints.shoulderL.add(paulL);
  const paulR = new THREE.Mesh(pauldronGeo, f.prosthetic ? matGold : matTrim);
  paulR.position.y = 0.01;
  paulR.castShadow = true;
  joints.shoulderR.add(paulR);

  if (f.prosthetic) {
    const coilA = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.014, 6, 14), matGold);
    coilA.rotation.x = Math.PI / 2;
    coilA.position.y = -0.14;
    joints.shoulderR.add(coilA);
    const coilB = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.016, 6, 14), matAccent);
    coilB.rotation.x = Math.PI / 2;
    coilB.position.y = -0.15;
    joints.elbowR.add(coilB);
  }

  // --- Legs ----------------------------------------------------------------
  limb(joints.hipL, 0.44, 0.085 * bulk, matTrim, 0.82);
  limb(joints.kneeL, 0.42, 0.065 * bulk, matTrim, 0.9);
  const bootL = box(joints.ankleL, 0.11, 0.07, 0.22, matCoat, 0, -0.03, 0.04);
  limb(joints.hipR, 0.44, 0.085 * bulk, matTrim, 0.82);
  limb(joints.kneeR, 0.42, 0.065 * bulk, matTrim, 0.9);
  const bootR = box(joints.ankleR, 0.11, 0.07, 0.22, matCoat, 0, -0.03, 0.04);
  parts.boots = [bootL, bootR];

  // --- Coat / skirt --------------------------------------------------------
  const coatLen = b.coatLength === undefined ? 0.62 : b.coatLength;
  if (coatLen > 0) {
    const coat = tube(joints.hips, 0.21 * bulk, (f.skirt ? 0.44 : 0.3) * bulk, coatLen, matCoat, 16, true);
    coat.position.y = -coatLen / 2 + 0.04;
    coat.receiveShadow = true;
    parts.coat = coat;
    const hem = new THREE.Mesh(
      new THREE.TorusGeometry((f.skirt ? 0.44 : 0.3) * bulk, 0.014, 6, 22), matGold,
    );
    hem.rotation.x = Math.PI / 2;
    hem.position.y = -coatLen + 0.04;
    joints.hips.add(hem);
  }

  if (f.cape) {
    const cape = tube(joints.chest, 0.2 * bulk, 0.42 * bulk, 0.85, matTrim, 14, true);
    cape.position.set(0, -0.18, -0.08);
    cape.rotation.x = -0.12;
    cape.material.side = THREE.DoubleSide;
    parts.cape = cape;
  }

  const weapon = buildWeapon(spec.weapon, { matMetal, matGold, matCoat, matAccent, matTrim });
  if (weapon) {
    weapon.group.position.set(0, -0.08, 0.02);
    joints.wristR.add(weapon.group);
    parts.weapon = weapon;
    if (weapon.emissive) parts.emissive.push(weapon.emissive);
  }

  root.traverse((o) => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
  });

  return { root, offsetNode, joints, parts, weapon };
}

// ---------------------------------------------------------------------------
// Weapons
// ---------------------------------------------------------------------------

function buildWeapon(kind, mats) {
  const group = new THREE.Group();
  let emissive = null;

  if (kind === 'rapier') {
    const grip = tube(group, 0.02, 0.024, 0.17, mats.matCoat, 8);
    grip.position.y = -0.05;
    const pommel = sphere(group, 0.028, mats.matGold, 10, 8);
    pommel.position.y = -0.14;
    const guard = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.011, 6, 16), mats.matGold);
    guard.rotation.x = Math.PI / 2;
    guard.position.y = 0.04;
    group.add(guard);
    const bladeGeo = new THREE.CylinderGeometry(0.012, 0.004, 1.05, 4);
    const blade = new THREE.Mesh(bladeGeo, mats.matMetal);
    blade.position.y = 0.58;
    blade.rotation.y = Math.PI / 4;
    blade.castShadow = true;
    group.add(blade);
    const edgeMat = mats.matAccent.clone();
    edgeMat.emissiveIntensity = 1.1;
    emissive = edgeMat;
    const edge = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.002, 1.0, 4), edgeMat);
    edge.position.y = 0.6;
    edge.rotation.y = Math.PI / 4;
    group.add(edge);
    group.rotation.x = -0.15;
    return { group, kind, tipLocal: new THREE.Vector3(0, 1.1, 0), emissive };
  }

  if (kind === 'staff') {
    const shaft = tube(group, 0.018, 0.022, 1.5, mats.matCoat, 8);
    shaft.position.y = 0.42;
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.012, 6, 14), mats.matGold);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 1.02;
    group.add(collar);
    const ringMat = mats.matAccent.clone();
    ringMat.emissiveIntensity = 2.4;
    emissive = ringMat;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.02, 8, 26), mats.matGold);
    ring.position.y = 1.28;
    group.add(ring);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.012, 6, 20), ringMat);
    inner.position.y = 1.28;
    group.add(inner);
    const core = sphere(group, 0.05, ringMat, 12, 10);
    core.position.y = 1.28;
    group.rotation.x = -0.1;
    return { group, kind, tipLocal: new THREE.Vector3(0, 1.3, 0), emissive, spinner: inner, core };
  }

  if (kind === 'pistol') {
    const body = box(group, 0.05, 0.09, 0.26, mats.matMetal, 0, 0, 0.06);
    const barrel = tube(group, 0.021, 0.024, 0.34, mats.matMetal, 10);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.035, 0.26);
    const stock = box(group, 0.042, 0.13, 0.06, mats.matCoat, 0, -0.08, -0.03);
    stock.rotation.x = 0.3;
    const scroll = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 6, 14), mats.matGold);
    scroll.rotation.y = Math.PI / 2;
    scroll.position.set(0, 0.01, 0.04);
    group.add(scroll);
    const muzzleMat = mats.matAccent.clone();
    muzzleMat.emissiveIntensity = 0.4;
    emissive = muzzleMat;
    const muzzle = sphere(group, 0.026, muzzleMat, 10, 8);
    muzzle.position.set(0, 0.035, 0.43);
    group.rotation.x = -0.1;
    return { group, kind, tipLocal: new THREE.Vector3(0, 0.035, 0.46), emissive, muzzle };
  }

  return null;
}

/**
 * Additive procedural motion layered on top of the sampled clip: breathing,
 * weight shift and weapon sway. Called after `Animator.update`.
 */
export function proceduralLayer(rig, t, amount = 1) {
  const j = rig.joints;
  if (!j.chest) return;
  const breath = Math.sin(t * 1.9) * 0.026 * amount;
  j.chest.rotation.x += breath;
  j.spine.rotation.x -= breath * 0.4;
  if (j.head) {
    j.head.rotation.y += Math.sin(t * 0.63) * 0.07 * amount;
    j.head.rotation.x += Math.sin(t * 1.1 + 1) * 0.028 * amount;
  }
  if (j.shoulderL) j.shoulderL.rotation.z += Math.sin(t * 1.5) * 0.02 * amount;
  if (j.shoulderR) j.shoulderR.rotation.z -= Math.sin(t * 1.5 + 0.6) * 0.02 * amount;
  if (rig.parts && rig.parts.cape) {
    rig.parts.cape.rotation.x = -0.12 + Math.sin(t * 1.3) * 0.05 * amount;
    rig.parts.cape.rotation.z = Math.sin(t * 0.9) * 0.04 * amount;
  }
  if (rig.weapon && rig.weapon.spinner) {
    rig.weapon.spinner.rotation.z = t * 1.2;
    rig.weapon.spinner.rotation.x = Math.sin(t * 0.7) * 0.4;
  }
}
