/**
 * Terrain for "Le Parvis Noyé" — the drowned parvis.
 *
 * Layout, all radial from the origin:
 *   r <  26   the flooded plaza floor, flat, cobbled — the Curator's forecourt
 *   26 - 36   the moat, below water level, crossed by three causeways
 *   36 - 72   the outer ground: broken parkland where the three seals stand
 *   r >  72   the rim, rising steeply into an impassable ridge
 *
 * `heightAt` is the single source of truth for elevation: the mesh, the prop
 * placement, the player and the camera all sample it, so nothing can ever end
 * up floating or buried.
 */

import * as THREE from 'three';
import { clamp01, lerp, smoothstep } from '../core/easing.js';

export const PLAZA_RADIUS = 26;
export const MOAT_OUTER = 36;
export const FIELD_OUTER = 72;
export const RIM_RADIUS = 86;
export const WATER_LEVEL = -1.15;
export const PLAZA_HEIGHT = 0.6;

/** The three causeways, in radians, plus their half-width in radians. */
export const CAUSEWAYS = [
  { angle: -Math.PI / 2, half: 0.115 },
  { angle: Math.PI / 6, half: 0.115 },
  { angle: (5 * Math.PI) / 6, half: 0.115 },
];

// ---------------------------------------------------------------------------
// Deterministic value noise
// ---------------------------------------------------------------------------

function hash2(x, y) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function valueNoise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

function fbm(x, y, octaves = 4) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * freq, y * freq) * amp;
    freq *= 2.03;
    amp *= 0.5;
  }
  return sum;
}

/** Angular distance to the nearest causeway centre line, in radians. */
function causewayInfluence(angle) {
  let best = 0;
  for (const c of CAUSEWAYS) {
    let d = Math.abs(angle - c.angle);
    while (d > Math.PI) d = Math.PI * 2 - d;
    // 1 on the centre line, fading to 0 at the edge of the deck.
    const t = 1 - clamp01((d - c.half) / 0.075);
    if (t > best) best = t;
  }
  return best;
}

/**
 * Ground elevation at a world position.
 * @returns {number} y in world units
 */
export function heightAt(x, z) {
  const r = Math.hypot(x, z);
  const angle = Math.atan2(z, x);
  const detail = (fbm(x * 0.035, z * 0.035, 4) - 0.5) * 2;
  const coarse = (fbm(x * 0.011 + 31.7, z * 0.011 - 12.3, 3) - 0.5) * 2;

  // Plaza: flat, with only a whisper of unevenness so it reads as laid stone.
  if (r <= PLAZA_RADIUS) {
    return PLAZA_HEIGHT + detail * 0.06;
  }

  // Outer field, rising away from the water.
  const fieldT = clamp01((r - MOAT_OUTER) / (FIELD_OUTER - MOAT_OUTER));
  const field = lerp(-0.35, 6.2, smoothstep(fieldT)) + coarse * 2.6 * fieldT + detail * 0.55;

  // The rim ridge that closes the area off. Kept low and smooth: raised high
  // with strong noise it reads as a wall of angular facets on the horizon
  // rather than as distant hills.
  const rimT = clamp01((r - FIELD_OUTER) / (RIM_RADIUS - FIELD_OUTER));
  const rim = field + smoothstep(rimT) * 8.5 + coarse * 1.1 * rimT;

  // Moat: a trench between plaza and field.
  const moatT = clamp01((r - PLAZA_RADIUS) / (MOAT_OUTER - PLAZA_RADIUS));
  const trough = lerp(PLAZA_HEIGHT, rim, smoothstep(moatT));
  const dip = Math.sin(clamp01(moatT) * Math.PI) * 3.4;
  const moat = trough - dip;

  const base = r <= MOAT_OUTER ? moat : rim;

  // Causeways bridge the trench at plaza height.
  const cw = causewayInfluence(angle);
  if (cw > 0 && r < MOAT_OUTER + 4) {
    const deck = PLAZA_HEIGHT + detail * 0.05;
    const blend = cw * (1 - clamp01((r - MOAT_OUTER) / 4));
    return lerp(base, Math.max(base, deck), blend);
  }
  return base;
}

/** Steepness at a point, 0 = flat. Used to reject prop placements on cliffs. */
export function slopeAt(x, z, eps = 1.2) {
  const hx = heightAt(x + eps, z) - heightAt(x - eps, z);
  const hz = heightAt(x, z + eps) - heightAt(x, z - eps);
  return Math.hypot(hx, hz) / (2 * eps);
}

/** True where the ground is under water deep enough to be impassable. */
export function isDeepWater(x, z) {
  return heightAt(x, z) < WATER_LEVEL - 0.25;
}

// ---------------------------------------------------------------------------
// Meshes
// ---------------------------------------------------------------------------

function displacePlane(geo, rotateFlat = true) {
  if (rotateFlat) geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * Build the ground, the cobbled plaza inlay and the water surface.
 * @param {import('./asset-manager.js').AssetManager} assets
 */
export function buildTerrain(assets) {
  const group = new THREE.Group();
  const size = RIM_RADIUS * 2 + 24;

  // --- Ground --------------------------------------------------------------
  const groundGeo = displacePlane(new THREE.PlaneGeometry(size, size, 210, 210));
  // aoMap needs a second UV set; reuse the first.
  groundGeo.setAttribute('uv1', groundGeo.attributes.uv);
  const groundMat = assets.material('ground', {
    repeat: 46, roughness: 1, metalness: 1, color: 0x9aa08c,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.receiveShadow = true;
  ground.name = 'terrain-ground';
  group.add(ground);

  // --- Plaza inlay ---------------------------------------------------------
  const plazaGeo = new THREE.CircleGeometry(PLAZA_RADIUS + 1.2, 96);
  plazaGeo.rotateX(-Math.PI / 2);
  const ppos = plazaGeo.attributes.position;
  for (let i = 0; i < ppos.count; i++) {
    ppos.setY(i, heightAt(ppos.getX(i), ppos.getZ(i)) + 0.02);
  }
  ppos.needsUpdate = true;
  plazaGeo.computeVertexNormals();
  plazaGeo.setAttribute('uv1', plazaGeo.attributes.uv);
  const plazaMat = assets.material('cobble', {
    repeat: 15, roughness: 1, metalness: 1, color: 0xa9a293,
  });
  const plaza = new THREE.Mesh(plazaGeo, plazaMat);
  plaza.receiveShadow = true;
  plaza.name = 'terrain-plaza';
  group.add(plaza);

  // --- Causeway decks ------------------------------------------------------
  const deckMat = assets.material('blocks', {
    repeat: 6, roughness: 1, metalness: 1, color: 0x9d968a,
  });
  for (const c of CAUSEWAYS) {
    const len = MOAT_OUTER - PLAZA_RADIUS + 6;
    const deckGeo = new THREE.BoxGeometry(len, 1.6, 7.4);
    deckGeo.setAttribute('uv1', deckGeo.attributes.uv);
    const deck = new THREE.Mesh(deckGeo, deckMat);
    const mid = (PLAZA_RADIUS + MOAT_OUTER) / 2 + 1;
    deck.position.set(Math.cos(c.angle) * mid, PLAZA_HEIGHT - 0.78, Math.sin(c.angle) * mid);
    deck.rotation.y = -c.angle;
    deck.castShadow = true;
    deck.receiveShadow = true;
    group.add(deck);
  }

  // --- Water ---------------------------------------------------------------
  const water = buildWater();
  group.add(water.mesh);

  return { group, ground, plaza, water };
}

/**
 * Water surface: two scrolling normal maps on a physical material. Not a
 * simulation — but with the HDRI reflecting off it, a slow counter-scroll and
 * a little transmission it reads convincingly and costs almost nothing.
 */
function buildWater() {
  const geo = new THREE.PlaneGeometry(RIM_RADIUS * 2 + 20, RIM_RADIUS * 2 + 20, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const normalMap = waterNormalTexture();
  // Deliberately not a transmissive material: transmission across a plane this
  // large is expensive and washed the pool out into a flat grey sheet. A dark,
  // smooth, part-metallic surface reflecting the HDRI reads as water far better.
  const mat = new THREE.MeshStandardMaterial({
    color: 0x06171d,
    roughness: 0.09,
    metalness: 0.7,
    transparent: true,
    opacity: 0.95,
    normalMap,
    normalScale: new THREE.Vector2(0.75, 0.75),
    envMapIntensity: 1.15,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = WATER_LEVEL;
  mesh.renderOrder = 1;
  mesh.name = 'water';
  return {
    mesh,
    normalMap,
    update(t) {
      normalMap.offset.set((t * 0.012) % 1, (t * 0.017) % 1);
      mat.normalScale.set(0.7 + Math.sin(t * 0.4) * 0.12, 0.7 + Math.cos(t * 0.33) * 0.12);
    },
  };
}

/** Procedural ripple normal map — small, tiling, and cheap to generate. */
function waterNormalTexture(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const height = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * Math.PI * 2;
      const v = (y / size) * Math.PI * 2;
      // Sum of a few tiling sine waves keeps the texture seamless.
      height[y * size + x] =
        Math.sin(u * 3 + Math.cos(v * 2) * 0.8) * 0.5 +
        Math.sin(v * 5 - Math.sin(u * 3) * 0.6) * 0.3 +
        Math.sin((u + v) * 7) * 0.15;
    }
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = height[y * size + ((x - 1 + size) % size)];
      const r = height[y * size + ((x + 1) % size)];
      const u = height[((y - 1 + size) % size) * size + x];
      const dn = height[((y + 1) % size) * size + x];
      const nx = (l - r) * 0.5;
      const nz = (u - dn) * 0.5;
      const len = Math.hypot(nx, nz, 1);
      const i = (y * size + x) * 4;
      d[i] = ((nx / len) * 0.5 + 0.5) * 255;
      d[i + 1] = ((nz / len) * 0.5 + 0.5) * 255;
      d[i + 2] = (1 / len) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(52, 52);
  return tex;
}
