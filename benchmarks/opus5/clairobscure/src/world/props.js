/**
 * Prop placement and the ruined architecture.
 *
 * Repeated natural scatter (boulders, stumps, dead trees) goes through
 * InstancedMesh so a hundred rocks cost one draw call. Hero props with several
 * materials — the lamps, the gate, the statue — are cloned, because there are
 * few of them and their silhouettes carry the art direction.
 *
 * Everything registers its own collider, so the world layout and the collision
 * layout can never drift apart.
 */

import * as THREE from 'three';
import { heightAt, slopeAt, isDeepWater, PLAZA_RADIUS, MOAT_OUTER, PLAZA_HEIGHT } from './terrain.js';
import { RNG } from '../core/rng.js';
import { AssetManager } from './asset-manager.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

/**
 * Scatter one instanced prop type across an annulus.
 * @returns {THREE.InstancedMesh|null}
 */
function scatterInstanced(source, opts) {
  if (!source) return null;
  const {
    count, rng, rMin, rMax, scaleMin = 1, scaleMax = 1, collision,
    colliderScale = 0.55, maxSlope = 0.55, sink = 0.1, avoid = [], tiltMax = 0.09,
  } = opts;

  const mesh = new THREE.InstancedMesh(source.geometry, source.material, count);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);

  // Measure the source so colliders match the real footprint.
  source.geometry.computeBoundingBox();
  const bb = source.geometry.boundingBox;
  const radius = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) * 0.5;

  let placed = 0;
  let guard = 0;
  while (placed < count && guard++ < count * 60) {
    const a = rng.next() * Math.PI * 2;
    const r = Math.sqrt(rng.range(rMin * rMin, rMax * rMax));
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (isDeepWater(x, z)) continue;
    if (slopeAt(x, z) > maxSlope) continue;
    if (avoid.some((p) => Math.hypot(x - p.x, z - p.z) < p.r)) continue;

    const scale = rng.range(scaleMin, scaleMax);
    _v.set(x, heightAt(x, z) - sink * scale, z);
    _e.set(rng.jitter(tiltMax), rng.next() * Math.PI * 2, rng.jitter(tiltMax));
    _q.setFromEuler(_e);
    _s.setScalar(scale);
    _m.compose(_v, _q, _s);
    mesh.setMatrixAt(placed, _m);

    if (collision) {
      const top = heightAt(x, z) + (bb.max.y - bb.min.y) * scale;
      collision.addCircle(x, z, radius * scale * colliderScale, top);
    }
    placed++;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = true;
  return mesh;
}

/**
 * Build the whole prop layer.
 * @param {import('./asset-manager.js').AssetManager} assets
 * @param {import('./collision.js').CollisionWorld} collision
 * @param {object[]} landmarks positions to keep clear (seals, gate, spawn)
 */
export function buildProps(assets, collision, landmarks) {
  const group = new THREE.Group();
  group.name = 'props';
  const rng = new RNG('parvis-props-v3');
  const avoid = landmarks.map((l) => ({ x: l.x, z: l.z, r: l.clear || 9 }));
  const lamps = [];

  // --- Natural scatter -----------------------------------------------------
  // Counts and decimation grids are a triangle budget, not decoration:
  // these scans are ~40-98k triangles each at full detail.
  const scatters = [
    { key: 'boulderA', count: 34, grid: 20, rMin: 40, rMax: 80, scaleMin: 0.8, scaleMax: 2.4, sink: 0.28 },
    { key: 'boulderB', count: 30, grid: 20, rMin: 38, rMax: 82, scaleMin: 0.7, scaleMax: 2.0, sink: 0.28 },
    { key: 'stump', count: 22, grid: 20, rMin: 40, rMax: 78, scaleMin: 0.9, scaleMax: 1.7, sink: 0.12 },
    { key: 'deadTree', count: 18, grid: 34, rMin: 42, rMax: 80, scaleMin: 1.1, scaleMax: 2.2, sink: 0.15, tiltMax: 0.05 },
  ];
  for (const s of scatters) {
    const src = assets.instanceSource(s.key, s.grid);
    const mesh = scatterInstanced(src, { ...s, rng, collision, avoid });
    if (mesh) {
      mesh.name = `scatter-${s.key}`;
      group.add(mesh);
    }
  }

  // --- Gas lamps ring the plaza (Belle Epoque signature) -------------------
  const lampTemplate = assets.model('streetLamp');
  if (lampTemplate) {
    const LAMP_COUNT = 10;
    const LAMP_HEIGHT = 4.4;
    for (let i = 0; i < LAMP_COUNT; i++) {
      const a = (i / LAMP_COUNT) * Math.PI * 2 + 0.22;
      const r = PLAZA_RADIUS - 2.4;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const lamp = i === 0 ? lampTemplate : lampTemplate.clone(true);
      AssetManager.fitTo(lamp, LAMP_HEIGHT);
      lamp.position.set(x, heightAt(x, z) + AssetManager.groundOffset(lamp), z);
      lamp.rotation.y = -a + Math.PI / 2;
      lamp.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      group.add(lamp);
      collision.addCircle(x, z, 0.42, heightAt(x, z) + LAMP_HEIGHT);
      lamps.push({ x, y: heightAt(x, z) + LAMP_HEIGHT * 0.92, z });
    }
  }

  // --- Bronze monument at the plaza centre ---------------------------------
  const statue = assets.model('whaleStatue');
  if (statue) {
    const plinthMat = assets.material('blocks', { repeat: 2, roughness: 0.9, metalness: 1, color: 0x8f8878 });
    const plinthGeo = new THREE.CylinderGeometry(4.2, 5.0, 2.2, 12);
    plinthGeo.setAttribute('uv1', plinthGeo.attributes.uv);
    const plinth = new THREE.Mesh(plinthGeo, plinthMat);
    plinth.position.set(0, PLAZA_HEIGHT + 1.1, 0);
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    group.add(plinth);

    AssetManager.fitTo(statue, 3.4);
    statue.position.set(0, PLAZA_HEIGHT + 2.2 + AssetManager.groundOffset(statue), 0);
    statue.rotation.y = -0.6;
    statue.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      // Gild it: this monument is what the Curator does to the living.
      if (o.material) {
        o.material = o.material.clone();
        o.material.metalness = 0.9;
        o.material.roughness = 0.45;
        o.material.color = new THREE.Color(0xa8853c);
        o.material.envMapIntensity = 0.8;
      }
    });
    group.add(statue);
    // Top of the plinth: the camera is allowed to fly over it.
    collision.addCircle(0, 0, 5.2, PLAZA_HEIGHT + 2.2);
  }

  // --- The Curator's gate, opposite the spawn causeway ---------------------
  const gate = assets.model('ironGate');
  let gateNode = null;
  if (gate) {
    const ga = Math.PI / 6;
    const gr = PLAZA_RADIUS - 1;
    const gx = Math.cos(ga) * gr;
    const gz = Math.sin(ga) * gr;
    AssetManager.fitTo(gate, 7.6);
    gate.position.set(gx, heightAt(gx, gz) + AssetManager.groundOffset(gate), gz);
    gate.rotation.y = -ga + Math.PI / 2;
    gate.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    group.add(gate);
    collision.addCircle(gx, gz, 3.4, heightAt(gx, gz) + 7.6);
    gateNode = gate;
  }

  // --- Ruined colonnade around the plaza rim -------------------------------
  const ruinMat = assets.material('rock', { repeat: 2.2, roughness: 1, metalness: 1, color: 0x8d8778 });
  const COLUMNS = 22;
  for (let i = 0; i < COLUMNS; i++) {
    const a = (i / COLUMNS) * Math.PI * 2 + 0.08;
    // Leave the causeway mouths open.
    const blocked = [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6].some((ca) => {
      let d = Math.abs(a - ca);
      while (d > Math.PI) d = Math.PI * 2 - d;
      return d < 0.34;
    });
    if (blocked) continue;
    const r = PLAZA_RADIUS + 1.6;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = 3.2 + rng.next() * 5.4;
    const geo = new THREE.CylinderGeometry(0.62, 0.78, h, 10);
    geo.setAttribute('uv1', geo.attributes.uv);
    const col = new THREE.Mesh(geo, ruinMat);
    col.position.set(x, heightAt(x, z) + h / 2 - 0.2, z);
    col.rotation.set(rng.jitter(0.05), rng.next() * Math.PI, rng.jitter(0.05));
    col.castShadow = true;
    col.receiveShadow = true;
    group.add(col);
    collision.addCircle(x, z, 0.85, heightAt(x, z) + h);

    // Broken lintels bridging some of the gaps.
    if (rng.chance(0.42)) {
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.7, 1.4), ruinMat);
      lintel.geometry.setAttribute('uv1', lintel.geometry.attributes.uv);
      lintel.position.set(x * 1.005, heightAt(x, z) + h - 0.1, z * 1.005);
      lintel.rotation.y = -a;
      lintel.rotation.z = rng.jitter(0.16);
      lintel.castShadow = true;
      lintel.receiveShadow = true;
      group.add(lintel);
    }
  }

  // --- Ruined facades out in the field -------------------------------------
  const facadeMat = assets.material('blocks', { repeat: 3.5, roughness: 1, metalness: 1, color: 0x8a8479 });
  for (let i = 0; i < 16; i++) {
    const a = rng.next() * Math.PI * 2;
    const r = rng.range(44, 74);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (isDeepWater(x, z) || slopeAt(x, z) > 0.5) continue;
    if (avoid.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + 4)) continue;

    const w = rng.range(5, 13);
    const h = rng.range(4, 11);
    const d = rng.range(0.7, 1.3);
    const geo = new THREE.BoxGeometry(w, h, d);
    geo.setAttribute('uv1', geo.attributes.uv);
    const wall = new THREE.Mesh(geo, facadeMat);
    const y = heightAt(x, z);
    wall.position.set(x, y + h / 2 - 0.6, z);
    wall.rotation.y = rng.next() * Math.PI;
    wall.rotation.z = rng.jitter(0.05);
    wall.castShadow = true;
    wall.receiveShadow = true;
    group.add(wall);

    // Window openings punched as dark recesses read better than flat walls.
    const holes = 1 + Math.floor(rng.next() * 3);
    for (let k = 0; k < holes; k++) {
      const hw = rng.range(0.9, 1.8);
      const hh = rng.range(1.4, 2.6);
      const hole = new THREE.Mesh(
        new THREE.BoxGeometry(hw, hh, d + 0.12),
        new THREE.MeshStandardMaterial({ color: 0x0a1215, roughness: 1, metalness: 0 }),
      );
      hole.position.set(
        rng.range(-w * 0.32, w * 0.32),
        rng.range(-h * 0.2, h * 0.28),
        0,
      );
      wall.add(hole);
    }

    const cs = Math.abs(Math.cos(wall.rotation.y));
    const sn = Math.abs(Math.sin(wall.rotation.y));
    collision.addBoxAt(x, z, w * cs + d * sn, w * sn + d * cs, y + h);
  }

  // --- A camp on the western causeway: the expedition's rest point ---------
  const camp = { x: 0, z: 0 };
  {
    const a = (5 * Math.PI) / 6;
    const r = MOAT_OUTER + 8;
    camp.x = Math.cos(a) * r;
    camp.z = Math.sin(a) * r;
    const pit = assets.model('firePit');
    if (pit) {
      AssetManager.fitTo(pit, 0.55);
      pit.position.set(camp.x, heightAt(camp.x, camp.z) - 0.06, camp.z);
      pit.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      group.add(pit);
      collision.addCircle(camp.x, camp.z, 1.5, heightAt(camp.x, camp.z) + 0.6);
    }
    const table = assets.model('table');
    if (table) {
      const tx = camp.x + 3.2;
      const tz = camp.z + 1.6;
      AssetManager.fitTo(table, 0.8);
      table.position.set(tx, heightAt(tx, tz), tz);
      table.rotation.y = 0.8;
      table.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      group.add(table);
      collision.addCircle(tx, tz, 1.3, heightAt(tx, tz) + 0.9);
    }
  }

  return { group, lamps, gate: gateNode, camp };
}

/**
 * Chandeliers hanging over the plaza on invisible chains — the Curator's
 * gallery lighting, still burning over a drowned square.
 */
export function buildChandeliers(assets) {
  const group = new THREE.Group();
  group.name = 'chandeliers';
  const template = assets.model('chandelier');
  if (!template) return { group, nodes: [] };

  const nodes = [];
  const spots = [
    { x: -9, z: -9, y: 11.5 }, { x: 10, z: -7, y: 13.0 },
    { x: -7, z: 11, y: 12.2 }, { x: 12, z: 10, y: 10.8 },
  ];
  spots.forEach((s, i) => {
    const node = i === 0 ? template : template.clone(true);
    AssetManager.fitTo(node, 1.9);
    node.position.set(s.x, s.y, s.z);
    node.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = false;   // twelve metres up; its shadow is never read
      if (o.material) {
        o.material = o.material.clone();
        o.material.emissive = new THREE.Color(0xffb968);
        o.material.emissiveIntensity = 0.35;
        o.material.metalness = 0.95;
        o.material.roughness = 0.4;
        o.material.envMapIntensity = 0.7;
      }
    });
    // A thin chain up into the dark keeps them from reading as floating.
    const chain = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 14, 5),
      new THREE.MeshStandardMaterial({ color: 0x21201c, roughness: 0.7, metalness: 0.9 }),
    );
    chain.position.set(s.x, s.y + 7, s.z);
    group.add(chain);
    group.add(node);
    nodes.push({ node, base: s.y, phase: i * 1.7 });
  });
  return { group, nodes };
}
