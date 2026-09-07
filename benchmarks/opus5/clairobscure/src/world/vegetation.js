/**
 * Instanced ground cover and drifting motes.
 *
 * Grass is a single InstancedMesh of crossed alpha-tested quads with a
 * procedurally painted blade texture — one draw call for several thousand
 * tufts. Wind is applied in a small onBeforeCompile shader injection that only
 * bends vertices above the root, which is enough to sell movement without any
 * per-frame CPU work.
 */

import * as THREE from 'three';
import { heightAt, slopeAt, isDeepWater, WATER_LEVEL, PLAZA_RADIUS } from './terrain.js';
import { RNG } from '../core/rng.js';
import { clamp01 } from '../core/easing.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** A tuft of blades painted into an alpha texture. */
function grassTexture(size = 256) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  const rng = new RNG('grass-blades');

  // More blades, each much thinner. The old tuft was fourteen blades painted
  // at ~4 px wide on a 128 px canvas, which alpha-testing then cut into a
  // handful of hard triangles — the single most obvious "not real grass" tell
  // in a wide shot.
  for (let i = 0; i < 34; i++) {
    const baseX = size * (0.1 + rng.next() * 0.8);
    const h = size * (0.5 + rng.next() * 0.48);
    const lean = (rng.next() - 0.5) * size * 0.38;
    const w = size * (0.008 + rng.next() * 0.013);
    const g = ctx.createLinearGradient(baseX, size, baseX + lean, size - h);
    const tint = rng.next();
    g.addColorStop(0, `rgb(${46 + tint * 22}, ${58 + tint * 20}, ${34 + tint * 14})`);
    g.addColorStop(0.6, `rgb(${86 + tint * 34}, ${98 + tint * 30}, ${52 + tint * 20})`);
    g.addColorStop(1, `rgb(${140 + tint * 50}, ${146 + tint * 42}, ${86 + tint * 30})`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(baseX - w, size);
    ctx.quadraticCurveTo(baseX - w * 0.5 + lean * 0.5, size - h * 0.55, baseX + lean, size - h);
    ctx.quadraticCurveTo(baseX + w * 0.5 + lean * 0.5, size - h * 0.5, baseX + w, size);
    ctx.closePath();
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Two crossed quads, pivoted at the ground. */
function bladeGeometry() {
  const a = new THREE.PlaneGeometry(1, 1);
  a.translate(0, 0.5, 0);
  const b = a.clone();
  b.rotateY(Math.PI / 2);
  const merged = mergeTwo(a, b);
  a.dispose();
  b.dispose();
  return merged;
}

/** Minimal two-geometry merge — avoids pulling in BufferGeometryUtils. */
function mergeTwo(a, b) {
  const geo = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const aa = a.attributes[name];
    const bb = b.attributes[name];
    const arr = new Float32Array(aa.array.length + bb.array.length);
    arr.set(aa.array, 0);
    arr.set(bb.array, aa.array.length);
    geo.setAttribute(name, new THREE.BufferAttribute(arr, aa.itemSize));
  }
  const ai = a.index.array;
  const bi = b.index.array;
  const off = a.attributes.position.count;
  const idx = new Uint16Array(ai.length + bi.length);
  idx.set(ai, 0);
  for (let i = 0; i < bi.length; i++) idx[ai.length + i] = bi[i] + off;
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  return geo;
}

/**
 * @param {number} count how many tufts to attempt
 * @returns {{mesh:THREE.InstancedMesh, material:THREE.Material}}
 */
export function buildGrass(count = 9000) {
  const geo = bladeGeometry();
  const map = grassTexture();
  const material = new THREE.MeshStandardMaterial({
    map,
    alphaTest: 0.3,
    transparent: false,
    side: THREE.DoubleSide,
    roughness: 0.92,
    metalness: 0,
    color: 0xffffff,
  });

  // Wind: bend proportionally to height above the instance root.
  material.userData.time = { value: 0 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = material.userData.time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec4 wpos = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float sway = sin(uTime * 1.6 + wpos.x * 0.35 + wpos.z * 0.27);
          float gust = sin(uTime * 0.45 + wpos.x * 0.06) * 0.5 + 0.5;
          float bend = transformed.y * transformed.y * (0.16 + gust * 0.2);
          transformed.x += sway * bend;
          transformed.z += cos(uTime * 1.25 + wpos.z * 0.31) * bend * 0.6;
        }`);
  };

  const mesh = new THREE.InstancedMesh(geo, material, count);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.name = 'grass';

  const rng = new RNG('parvis-grass');
  // Per-instance tint. A field where every tuft is the same green reads as a
  // texture; real ground cover is a spread from dry straw to damp olive.
  const tint = new THREE.Color();
  let placed = 0;
  let guard = 0;
  while (placed < count && guard++ < count * 30) {
    const a = rng.next() * Math.PI * 2;
    const r = Math.sqrt(rng.range(PLAZA_RADIUS * PLAZA_RADIUS, 82 * 82));
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const y = heightAt(x, z);
    if (y < WATER_LEVEL + 0.15) continue;
    if (isDeepWater(x, z)) continue;
    if (slopeAt(x, z) > 0.62) continue;

    _p.set(x, y - 0.06, z);
    _e.set(0, rng.next() * Math.PI, 0);
    _q.setFromEuler(_e);
    // Both crossed quads must take the same width. Leaving Z at 1 scaled the
    // second quad to a full metre across while the first was a third of that,
    // so every tuft carried one oversized flat card — clearly visible as
    // sheets of green lying in the field.
    const h = rng.range(0.34, 0.82);
    const w = rng.range(0.2, 0.4);
    _s.set(w, h, w);
    _m.compose(_p, _q, _s);
    mesh.setMatrixAt(placed, _m);

    const dry = rng.next();
    const damp = clamp01((y - WATER_LEVEL) / 6);
    tint.setHSL(
      0.16 - damp * 0.06 + dry * 0.02,
      0.2 + damp * 0.16,
      0.34 + dry * 0.2 - damp * 0.06,
    );
    mesh.setColorAt(placed, tint);
    placed++;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  return {
    mesh,
    material,
    update(t) { material.userData.time.value = t; },
  };
}

/**
 * Gilded dust drifting over the parvis. Additive points, recycled when they
 * rise out of the volume — the same trick the battle stage uses, scaled up.
 */
export function buildMotes(count = 1400, radius = 78) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  const phases = new Float32Array(count);
  const rng = new RNG('parvis-motes');
  const palette = [
    new THREE.Color('#d9b262'), new THREE.Color('#f5dda2'),
    new THREE.Color('#8fd4e8'), new THREE.Color('#e8ddc4'),
  ];

  for (let i = 0; i < count; i++) {
    const a = rng.next() * Math.PI * 2;
    const r = Math.sqrt(rng.next()) * radius;
    positions[i * 3] = Math.cos(a) * r;
    positions[i * 3 + 1] = rng.range(-1, 26);
    positions[i * 3 + 2] = Math.sin(a) * r;
    speeds[i] = rng.range(0.25, 1.1);
    phases[i] = rng.next() * Math.PI * 2;
    const c = palette[i % palette.length];
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const sprite = moteSprite();
  // Small and faint on purpose. With size-attenuated additive points, anything
  // that drifts within a couple of metres of the lens is drawn enormous, and a
  // few dozen of those overlap into an opaque golden wall across the view.
  const material = new THREE.PointsMaterial({
    size: 0.11,
    map: sprite,
    vertexColors: true,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  points.name = 'motes';

  return {
    points,
    update(dt, t) {
      const arr = geo.attributes.position.array;
      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        arr[i3 + 1] += speeds[i] * dt;
        arr[i3] += Math.sin(t * 0.3 + phases[i]) * dt * 0.5;
        arr[i3 + 2] += Math.cos(t * 0.26 + phases[i]) * dt * 0.45;
        if (arr[i3 + 1] > 28) {
          arr[i3 + 1] = -1.5;
          const a = Math.random() * Math.PI * 2;
          const r = Math.sqrt(Math.random()) * radius;
          arr[i3] = Math.cos(a) * r;
          arr[i3 + 2] = Math.sin(a) * r;
        }
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}

function moteSprite(size = 64) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}
