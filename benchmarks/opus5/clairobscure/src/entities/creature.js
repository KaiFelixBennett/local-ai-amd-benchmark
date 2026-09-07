/**
 * Procedural Nevron (enemy) construction.
 *
 * Every creature exposes the same simplified skeleton so one clip table drives
 * all of them: core -> torso -> head/arms, plus legs and an optional tail.
 * Silhouettes are deliberately distinct — a lithe blade duellist, a heavy
 * flowering brute, a legless floating wisp, and a tall gilded boss — so the
 * player can identify a threat and its attack rhythm at a glance.
 */

import * as THREE from 'three';
import {
  joint, limb, box, sphere, lathe,
  clothMaterial, metalMaterial, emissiveMaterial, skinMaterial, glassMaterial,
} from './rig.js';
import { PALETTE } from '../engine/textures.js';

/** Marks a spot on the creature that grants bonus damage when free-aimed. */
function weakPoint(parent, radius, color, name, x, y, z) {
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color), transparent: true, opacity: 0.55,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 14, 10), mat);
  m.position.set(x, y, z);
  m.visible = false;
  m.userData.weakPoint = { name, radius, multiplier: 2.4 };
  parent.add(m);
  return m;
}

function shell(color, key, rough = 0.55) {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    roughness: rough,
    metalness: 0.18,
    sheen: 0.4,
    sheenColor: new THREE.Color(PALETTE.gold),
    clearcoat: 0.4,
    clearcoatRoughness: 0.45,
  });
}

// ---------------------------------------------------------------------------
// Bladeling — fast, thin, two blade arms, quick two-beat combos
// ---------------------------------------------------------------------------

function buildBladeling(p, out) {
  const { offsetNode, joints, parts } = out;
  const matShell = shell(p.body, 'bl', 0.42);
  const matDark = clothMaterial(p.dark, p.accent, 'bladeling-dark');
  const matBlade = metalMaterial(p.metal, 'bladeling-blade', 0.22);
  const matGlow = emissiveMaterial(p.accent, 2.8, 'bladeling-glow');
  parts.emissive.push(matGlow);

  joints.core = joint(offsetNode, 'core', 0, 1.28, 0);
  joints.torso = joint(joints.core, 'torso', 0, 0.2, 0);
  joints.head = joint(joints.torso, 'head', 0, 0.34, 0);
  joints.armL = joint(joints.torso, 'armL', 0.28, 0.16, 0);
  joints.foreL = joint(joints.armL, 'foreL', 0, -0.42, 0);
  joints.armR = joint(joints.torso, 'armR', -0.28, 0.16, 0);
  joints.foreR = joint(joints.armR, 'foreR', 0, -0.42, 0);
  joints.legL = joint(joints.core, 'legL', 0.16, -0.1, 0);
  joints.legR = joint(joints.core, 'legR', -0.16, -0.1, 0);
  joints.tail = joint(joints.core, 'tail', 0, 0.02, -0.16);

  const abdomen = lathe(joints.core, [
    [0.02, 0.2], [0.19, 0.14], [0.22, -0.02], [0.16, -0.2], [0.05, -0.3], [0, -0.31],
  ], matDark, 12);
  const ribcage = lathe(joints.torso, [
    [0.03, 0.3], [0.17, 0.24], [0.24, 0.06], [0.2, -0.14], [0.08, -0.2], [0, -0.2],
  ], matShell, 12);
  ribcage.scale.z = 0.7;
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 6, 18), matBlade);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.24;
  joints.torso.add(collar);

  // Head: a porcelain mask with a single slit of light.
  const mask = lathe(joints.head, [
    [0, 0.2], [0.1, 0.17], [0.14, 0.04], [0.12, -0.1], [0.05, -0.16], [0, -0.16],
  ], matShell, 14);
  mask.scale.z = 0.86;
  const slit = box(joints.head, 0.17, 0.028, 0.02, matGlow, 0, 0.03, 0.125);
  parts.eyes = [slit];
  const crest = box(joints.head, 0.02, 0.24, 0.1, matBlade, 0, 0.22, -0.02);
  crest.rotation.x = -0.34;

  // Arms terminating in long blades.
  limb(joints.armL, 0.42, 0.055, matShell, 0.7);
  limb(joints.armR, 0.42, 0.055, matShell, 0.7);
  for (const side of ['L', 'R']) {
    const j = joints[`fore${side}`];
    limb(j, 0.3, 0.045, matDark, 0.8);
    const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.075, 0.86, 3), matBlade);
    blade.position.y = -0.72;
    blade.rotation.y = side === 'L' ? 0.4 : -0.4;
    blade.castShadow = true;
    j.add(blade);
    const edge = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.02, 0.8, 3), matGlow);
    edge.position.y = -0.72;
    edge.rotation.y = side === 'L' ? 0.4 : -0.4;
    j.add(edge);
  }

  // Digitigrade legs.
  for (const side of ['L', 'R']) {
    const j = joints[`leg${side}`];
    limb(j, 0.5, 0.055, matShell, 0.6);
    const shin = joint(j, `shin${side}`, 0, -0.5, 0);
    shin.rotation.x = -0.5;
    limb(shin, 0.52, 0.038, matDark, 0.7);
    const foot = box(shin, 0.09, 0.05, 0.24, matBlade, 0, -0.52, 0.07);
    foot.rotation.x = 0.5;
  }

  const tail = limb(joints.tail, 0.62, 0.045, matDark, 0.3);
  tail.rotation.x = -0.9;

  parts.weakPoints = [
    weakPoint(joints.torso, 0.17, p.accent, 'Thorax Core', 0, 0.06, 0.16),
    weakPoint(joints.head, 0.13, p.accent, 'Mask Seam', 0, 0.04, 0.1),
  ];
  out.height = 2.15;
}

// ---------------------------------------------------------------------------
// Bourgeon Hulk — slow, enormous, unblockable grabs
// ---------------------------------------------------------------------------

function buildHulk(p, out) {
  const { offsetNode, joints, parts } = out;
  const matHide = skinMaterial(p.body, 'hulk-hide');
  const matBark = clothMaterial(p.dark, p.accent, 'hulk-bark');
  const matGold = metalMaterial(PALETTE.gold, 'gold-shared', 0.24);
  const matGlow = emissiveMaterial(p.accent, 2.2, 'hulk-glow');
  parts.emissive.push(matGlow);

  joints.core = joint(offsetNode, 'core', 0, 1.18, 0);
  joints.torso = joint(joints.core, 'torso', 0, 0.32, 0);
  joints.head = joint(joints.torso, 'head', 0, 0.48, 0);
  joints.armL = joint(joints.torso, 'armL', 0.56, 0.28, 0);
  joints.foreL = joint(joints.armL, 'foreL', 0, -0.6, 0);
  joints.armR = joint(joints.torso, 'armR', -0.56, 0.28, 0);
  joints.foreR = joint(joints.armR, 'foreR', 0, -0.6, 0);
  joints.legL = joint(joints.core, 'legL', 0.3, -0.22, 0);
  joints.legR = joint(joints.core, 'legR', -0.3, -0.22, 0);
  joints.tail = joint(joints.core, 'tail', 0, -0.1, -0.4);

  const gut = sphere(joints.core, 0.56, matHide, 18, 14);
  gut.scale.set(1.05, 0.9, 0.92);
  gut.position.y = -0.06;
  const chest = lathe(joints.torso, [
    [0.06, 0.46], [0.34, 0.4], [0.5, 0.16], [0.52, -0.1], [0.4, -0.3], [0.1, -0.36], [0, -0.36],
  ], matBark, 16);

  // Bark plating over the shoulders.
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const plate = box(joints.torso, 0.2, 0.1, 0.16, matBark,
      Math.cos(a) * 0.44, 0.26 + Math.sin(a * 2) * 0.05, Math.sin(a) * 0.34);
    plate.rotation.set(0.3, a, 0.2);
  }

  // Head: a closed flower bud with a glowing throat.
  const budOuter = lathe(joints.head, [
    [0, -0.14], [0.2, -0.1], [0.28, 0.08], [0.2, 0.3], [0.08, 0.42], [0, 0.44],
  ], matBark, 14);
  const throat = sphere(joints.head, 0.14, matGlow, 12, 10);
  throat.position.y = 0.1;
  parts.eyes = [throat];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const petal = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.42, 5), matHide);
    petal.position.set(Math.cos(a) * 0.21, 0.28, Math.sin(a) * 0.21);
    petal.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7);
    petal.castShadow = true;
    joints.head.add(petal);
  }

  // Slab arms ending in club fists.
  for (const side of ['L', 'R']) {
    const arm = joints[`arm${side}`];
    const fore = joints[`fore${side}`];
    limb(arm, 0.6, 0.17, matHide, 0.9);
    limb(fore, 0.56, 0.15, matHide, 0.95);
    const fist = sphere(fore, 0.24, matBark, 12, 10);
    fist.position.y = -0.6;
    const knuckle = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 6, 14), matGold);
    knuckle.rotation.x = Math.PI / 2;
    knuckle.position.y = -0.6;
    fore.add(knuckle);
  }

  for (const side of ['L', 'R']) {
    const j = joints[`leg${side}`];
    limb(j, 0.44, 0.16, matHide, 0.85);
    const shin = joint(j, `shin${side}`, 0, -0.44, 0);
    limb(shin, 0.4, 0.14, matBark, 0.9);
    box(shin, 0.3, 0.12, 0.4, matBark, 0, -0.42, 0.08);
  }

  const stub = limb(joints.tail, 0.5, 0.1, matHide, 0.4);
  stub.rotation.x = -1.1;

  parts.weakPoints = [
    weakPoint(joints.head, 0.2, p.accent, 'Open Throat', 0, 0.12, 0.02),
    weakPoint(joints.core, 0.24, p.accent, 'Swollen Gut', 0, -0.04, 0.5),
  ];
  out.height = 2.9;
}

// ---------------------------------------------------------------------------
// Chroma Wisp — legless caster with long feint telegraphs
// ---------------------------------------------------------------------------

function buildWisp(p, out) {
  const { offsetNode, joints, parts } = out;
  const matVeil = clothMaterial(p.dark, p.accent, 'wisp-veil');
  matVeil.transparent = true;
  matVeil.opacity = 0.82;
  matVeil.side = THREE.DoubleSide;
  const matGold = metalMaterial(PALETTE.gold, 'gold-shared', 0.24);
  const matGlow = emissiveMaterial(p.accent, 3.2, 'wisp-glow');
  const matCore = glassMaterial(p.body);
  parts.emissive.push(matGlow);

  joints.core = joint(offsetNode, 'core', 0, 1.65, 0);
  joints.torso = joint(joints.core, 'torso', 0, 0.16, 0);
  joints.head = joint(joints.torso, 'head', 0, 0.3, 0);
  joints.armL = joint(joints.torso, 'armL', 0.3, 0.06, 0);
  joints.foreL = joint(joints.armL, 'foreL', 0, -0.34, 0);
  joints.armR = joint(joints.torso, 'armR', -0.3, 0.06, 0);
  joints.foreR = joint(joints.armR, 'foreR', 0, -0.34, 0);
  joints.legL = joint(joints.core, 'legL', 0.1, -0.2, 0);
  joints.legR = joint(joints.core, 'legR', -0.1, -0.2, 0);
  joints.tail = joint(joints.core, 'tail', 0, -0.3, 0);

  const heart = sphere(joints.core, 0.26, matCore, 18, 14);
  const halo = sphere(joints.core, 0.14, matGlow, 14, 12);
  parts.eyes = [halo];

  // Three gilded rings orbiting the core; animated in `proceduralCreature`.
  parts.rings = [];
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.38 + i * 0.1, 0.016, 6, 30), matGold);
    r.rotation.set(Math.PI / 2 + i * 0.7, i * 0.9, 0);
    joints.core.add(r);
    parts.rings.push(r);
  }

  const shroud = lathe(joints.torso, [
    [0.06, 0.26], [0.26, 0.08], [0.34, -0.3], [0.4, -0.9], [0.3, -1.05], [0, -1.05],
  ], matVeil, 16);
  const hood = lathe(joints.head, [
    [0.02, 0.24], [0.14, 0.18], [0.2, 0.0], [0.19, -0.14], [0.1, -0.2], [0, -0.2],
  ], matVeil, 14);
  const face = sphere(joints.head, 0.1, matGlow, 12, 10);
  face.position.set(0, 0, 0.05);
  face.scale.set(1, 1.2, 0.5);

  // Ribbon arms — thin trailing streamers rather than limbs.
  for (const side of ['L', 'R']) {
    const arm = joints[`arm${side}`];
    const fore = joints[`fore${side}`];
    limb(arm, 0.34, 0.035, matVeil, 0.6);
    limb(fore, 0.3, 0.028, matVeil, 0.4);
    const spark = sphere(fore, 0.06, matGlow, 10, 8);
    spark.position.y = -0.32;
  }
  // Legs stay tucked and hidden inside the shroud.
  joints.legL.visible = false;
  joints.legR.visible = false;

  const trail = lathe(joints.tail, [
    [0.28, 0], [0.2, -0.4], [0.1, -0.85], [0.02, -1.2], [0, -1.25],
  ], matVeil, 12);
  parts.trail = trail;

  parts.weakPoints = [
    weakPoint(joints.core, 0.19, p.accent, 'Chroma Heart', 0, 0, 0.1),
    weakPoint(joints.head, 0.12, p.accent, 'Veiled Face', 0, 0, 0.08),
  ];
  out.height = 2.6;
  out.floats = true;
}

// ---------------------------------------------------------------------------
// The Gilded Curator — boss, two phases
// ---------------------------------------------------------------------------

function buildCurator(p, out) {
  const { offsetNode, joints, parts } = out;
  const matCoat = clothMaterial(p.dark, PALETTE.gold, 'curator-coat');
  const matGold = metalMaterial(PALETTE.gold, 'gold-shared', 0.22);
  const matPorcelain = shell(p.body, 'curator-porcelain', 0.24);
  const matGlow = emissiveMaterial(p.accent, 2.6, 'curator-glow');
  parts.emissive.push(matGlow);

  joints.core = joint(offsetNode, 'core', 0, 1.72, 0);
  joints.torso = joint(joints.core, 'torso', 0, 0.34, 0);
  joints.head = joint(joints.torso, 'head', 0, 0.5, 0);
  joints.armL = joint(joints.torso, 'armL', 0.36, 0.3, 0);
  joints.foreL = joint(joints.armL, 'foreL', 0, -0.62, 0);
  joints.armR = joint(joints.torso, 'armR', -0.36, 0.3, 0);
  joints.foreR = joint(joints.armR, 'foreR', 0, -0.62, 0);
  joints.legL = joint(joints.core, 'legL', 0.2, -0.24, 0);
  joints.legR = joint(joints.core, 'legR', -0.2, -0.24, 0);
  joints.tail = joint(joints.core, 'tail', 0, 0.1, -0.24);

  lathe(joints.core, [
    [0.04, 0.3], [0.26, 0.22], [0.3, 0], [0.34, -0.4], [0.46, -1.0], [0.5, -1.25], [0, -1.28],
  ], matCoat, 18);
  const chest = lathe(joints.torso, [
    [0.05, 0.48], [0.24, 0.4], [0.34, 0.12], [0.3, -0.2], [0.1, -0.3], [0, -0.3],
  ], matPorcelain, 16);
  const sash = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 6, 20), matGold);
  sash.rotation.set(Math.PI / 2, 0, 0.4);
  sash.position.y = 0.06;
  joints.torso.add(sash);
  const heartGem = sphere(joints.torso, 0.08, matGlow, 12, 10);
  heartGem.position.set(0, 0.18, 0.29);
  parts.heartGem = heartGem;

  // Porcelain mask with a laurel crown.
  const mask = lathe(joints.head, [
    [0, 0.26], [0.12, 0.23], [0.17, 0.06], [0.15, -0.12], [0.06, -0.2], [0, -0.2],
  ], matPorcelain, 16);
  mask.scale.z = 0.9;
  const eyeL = box(joints.head, 0.055, 0.02, 0.02, matGlow, 0.06, 0.05, 0.152);
  const eyeR = box(joints.head, 0.055, 0.02, 0.02, matGlow, -0.06, 0.05, 0.152);
  parts.eyes = [eyeL, eyeR];
  const crown = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.022, 6, 22), matGold);
  crown.rotation.x = Math.PI / 2;
  crown.position.y = 0.18;
  joints.head.add(crown);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.2, 4), matGold);
    spike.position.set(Math.cos(a) * 0.17, 0.27, Math.sin(a) * 0.17);
    spike.rotation.set(Math.cos(a) * 0.4, 0, -Math.sin(a) * 0.4);
    joints.head.add(spike);
  }

  // Long arms with fan blades on the forearms.
  for (const side of ['L', 'R']) {
    const arm = joints[`arm${side}`];
    const fore = joints[`fore${side}`];
    limb(arm, 0.62, 0.085, matCoat, 0.85);
    limb(fore, 0.58, 0.07, matPorcelain, 0.9);
    const hand = sphere(fore, 0.08, matPorcelain, 10, 8);
    hand.position.y = -0.6;
    for (let i = 0; i < 3; i++) {
      const bl = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.05, 0.72, 3), matGold);
      bl.position.set(0, -0.5, 0);
      bl.rotation.z = (i - 1) * 0.24;
      bl.rotation.y = 0.4;
      bl.castShadow = true;
      fore.add(bl);
    }
  }

  for (const side of ['L', 'R']) {
    const j = joints[`leg${side}`];
    limb(j, 0.5, 0.1, matCoat, 0.85);
    const shin = joint(j, `shin${side}`, 0, -0.5, 0);
    limb(shin, 0.48, 0.075, matCoat, 0.9);
    box(shin, 0.14, 0.08, 0.3, matPorcelain, 0, -0.5, 0.07);
  }

  // Floating halo of blades — the boss's signature silhouette.
  parts.halo = new THREE.Group();
  joints.tail.add(parts.halo);
  parts.haloBlades = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.055, 0.78, 3), matGold);
    b.position.set(Math.cos(a) * 0.95, Math.sin(a) * 0.95, 0);
    b.rotation.z = a - Math.PI / 2;
    b.castShadow = true;
    parts.halo.add(b);
    parts.haloBlades.push(b);
  }
  const haloRing = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.02, 6, 40), matGlow);
  parts.halo.add(haloRing);
  parts.halo.position.set(0, 0.4, -0.35);

  parts.weakPoints = [
    weakPoint(joints.torso, 0.16, p.accent, 'Heart Gem', 0, 0.18, 0.3),
    weakPoint(joints.head, 0.15, p.accent, 'Mask Fissure', 0, 0.04, 0.13),
  ];
  out.height = 3.5;
}

const BUILDERS = {
  bladeling: buildBladeling,
  hulk: buildHulk,
  wisp: buildWisp,
  curator: buildCurator,
};

/**
 * @param {string} kind one of bladeling | hulk | wisp | curator
 * @param {object} palette { body, dark, metal, accent }
 * @returns {{root, offsetNode, joints, parts, height, floats}}
 */
export function buildCreature(kind, palette) {
  const root = new THREE.Group();
  const offsetNode = new THREE.Group();
  root.add(offsetNode);
  const out = {
    root, offsetNode, joints: {}, parts: { emissive: [] },
    height: 2.4, floats: false, kind,
  };
  const build = BUILDERS[kind] || buildBladeling;
  build(palette, out);
  root.traverse((o) => {
    if (o.isMesh && !o.userData.weakPoint) { o.castShadow = true; o.receiveShadow = true; }
  });
  return out;
}

/** Additive idle motion for creatures: hover, ring spin, halo rotation. */
export function proceduralCreature(rig, t, amount = 1) {
  const j = rig.joints;
  if (j.head) {
    j.head.rotation.y += Math.sin(t * 0.72) * 0.11 * amount;
    j.head.rotation.x += Math.sin(t * 1.3) * 0.04 * amount;
  }
  if (j.tail) j.tail.rotation.y += Math.sin(t * 0.9) * 0.16 * amount;
  if (rig.floats && rig.offsetNode) {
    rig.offsetNode.position.y += Math.sin(t * 1.15) * 0.16 * amount;
  }
  const parts = rig.parts;
  if (parts.rings) {
    parts.rings[0].rotation.z = t * 0.8;
    parts.rings[1].rotation.x = Math.PI / 2 + t * -0.5;
    parts.rings[2].rotation.y = t * 0.65;
  }
  if (parts.halo) {
    parts.halo.rotation.z = t * 0.35;
    parts.halo.rotation.x = Math.sin(t * 0.4) * 0.2;
  }
  if (parts.trail) parts.trail.rotation.y = t * 0.4;
}
