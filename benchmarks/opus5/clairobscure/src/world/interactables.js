/**
 * Chroma Seals and the Curator's gate marker.
 *
 * Each seal is a monument with a floating gilded ring, a vertical light shaft
 * and a slow orbit of embers — bright enough to be read as an objective from
 * across the parkland, which is what makes the area navigable without a
 * minimap. Breaking one kills its shaft and drops the ring.
 */

import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { damp, easeOutCubic } from '../core/easing.js';

/** Soft radial sprite reused by shafts and embers. */
function glowTexture(size = 128) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

let SHARED_GLOW = null;
function sharedGlow() {
  if (!SHARED_GLOW) SHARED_GLOW = glowTexture();
  return SHARED_GLOW;
}

/**
 * Alpha ramp for the light shafts.
 *
 * A bare additive cylinder reads as a hard-edged translucent box — you see the
 * tube, not the light. This fades the shaft out towards the top and towards its
 * own silhouette edges (the cylinder's UVs run around the circumference), which
 * is what makes it look like light rather than geometry.
 */
let SHARED_SHAFT = null;
function shaftGradient(w = 64, h = 128) {
  if (SHARED_SHAFT) return SHARED_SHAFT;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    const vertical = Math.pow(1 - y / h, 1.9);
    for (let x = 0; x < w; x++) {
      const edge = Math.sin((x / w) * Math.PI);
      const a = vertical * (0.22 + edge * 0.78);
      const i = (y * w + x) * 4;
      d[i] = 255;
      d[i + 1] = 255;
      d[i + 2] = 255;
      d[i + 3] = Math.round(Math.min(1, a) * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  SHARED_SHAFT = new THREE.CanvasTexture(c);
  SHARED_SHAFT.wrapS = THREE.RepeatWrapping;
  return SHARED_SHAFT;
}

export class Seal {
  /**
   * @param {object} def entry from story.js SEALS
   * @param {import('./asset-manager.js').AssetManager} assets
   */
  constructor(def, assets) {
    this.def = def;
    this.id = def.id;
    this.broken = false;
    this.active = true;
    this.pulse = 0;
    this.breakT = 0;
    this.color = new THREE.Color(def.color);

    const y = heightAt(def.x, def.z);
    this.position = new THREE.Vector3(def.x, y, def.z);

    this.group = new THREE.Group();
    this.group.position.copy(this.position);
    this.group.name = `seal-${def.id}`;

    const stoneMat = assets.material('blocks', {
      repeat: 1.6, roughness: 1, metalness: 1, color: 0x8b8478,
    });

    // Stepped plinth.
    const baseGeo = new THREE.CylinderGeometry(3.0, 3.6, 0.7, 10);
    baseGeo.setAttribute('uv1', baseGeo.attributes.uv);
    const base = new THREE.Mesh(baseGeo, stoneMat);
    base.position.y = 0.35;
    base.castShadow = true;
    base.receiveShadow = true;
    this.group.add(base);

    const stepGeo = new THREE.CylinderGeometry(2.1, 2.6, 0.55, 10);
    stepGeo.setAttribute('uv1', stepGeo.attributes.uv);
    const step = new THREE.Mesh(stepGeo, stoneMat);
    step.position.y = 0.95;
    step.castShadow = true;
    step.receiveShadow = true;
    this.group.add(step);

    // Obelisk.
    const obGeo = new THREE.CylinderGeometry(0.45, 0.95, 5.6, 6);
    obGeo.setAttribute('uv1', obGeo.attributes.uv);
    this.obelisk = new THREE.Mesh(obGeo, stoneMat);
    this.obelisk.position.y = 4.0;
    this.obelisk.castShadow = true;
    this.obelisk.receiveShadow = true;
    this.group.add(this.obelisk);

    // The seal itself: a gilded ring holding a chroma core.
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xd9b262, metalness: 1, roughness: 0.24, envMapIntensity: 1.5,
    });
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.13, 10, 40), goldMat);
    this.ring.position.y = 7.6;
    this.ring.castShadow = true;
    this.group.add(this.ring);

    this.ringInner = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.06, 8, 32), goldMat);
    this.ringInner.position.y = 7.6;
    this.ringInner.rotation.x = Math.PI / 2;
    this.group.add(this.ringInner);

    this.coreMat = new THREE.MeshStandardMaterial({
      color: this.color,
      emissive: this.color,
      emissiveIntensity: 3.2,
      roughness: 0.3,
      metalness: 0,
    });
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 1), this.coreMat);
    this.core.position.y = 7.6;
    this.group.add(this.core);

    // Vertical shaft of light. Additive, open-ended, no depth write.
    this.shaftMat = new THREE.MeshBasicMaterial({
      map: shaftGradient(),
      color: this.color,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 1.7, 34, 24, 1, true),
      this.shaftMat,
    );
    this.shaft.position.y = 17;
    this.group.add(this.shaft);

    // Ground decal so the objective reads from directly above too.
    this.decalMat = new THREE.MeshBasicMaterial({
      map: sharedGlow(),
      color: this.color,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.decal = new THREE.Mesh(new THREE.PlaneGeometry(11, 11), this.decalMat);
    this.decal.rotation.x = -Math.PI / 2;
    this.decal.position.y = 0.08;
    this.group.add(this.decal);

    this.light = new THREE.PointLight(this.color.getHex(), 26, 30, 2);
    this.light.position.y = 7.6;
    this.group.add(this.light);

    this.embers = buildEmbers(this.color, 46);
    this.embers.points.position.y = 0;
    this.group.add(this.embers.points);
  }

  /** Distance from a world position to the seal's base. */
  distanceTo(v) {
    return Math.hypot(v.x - this.position.x, v.z - this.position.z);
  }

  break_() {
    if (this.broken) return;
    this.broken = true;
    this.breakT = 0;
  }

  update(dt, t) {
    this.pulse = 0.5 + Math.sin(t * 1.7) * 0.5;

    if (this.broken) {
      this.breakT = Math.min(1, this.breakT + dt * 0.55);
      const k = 1 - easeOutCubic(this.breakT);
      this.shaftMat.opacity = 0.16 * k;
      this.decalMat.opacity = 0.4 * k;
      this.coreMat.emissiveIntensity = 3.2 * k;
      this.light.intensity = 26 * k;
      this.core.scale.setScalar(Math.max(0.02, k));
      // The ring drops onto the obelisk and stops turning.
      this.ring.position.y = damp(this.ring.position.y, 6.4, 2.2, dt);
      this.ringInner.position.y = this.ring.position.y;
      this.ring.rotation.z += dt * 0.4 * k;
      this.embers.update(dt, t, k);
      if (this.breakT >= 1) {
        this.shaft.visible = false;
        this.decal.visible = false;
        this.core.visible = false;
      }
      return;
    }

    this.ring.rotation.z += dt * 0.55;
    this.ring.rotation.x = Math.sin(t * 0.4) * 0.22;
    this.ringInner.rotation.z -= dt * 0.9;
    this.core.rotation.y += dt * 1.3;
    this.core.rotation.x += dt * 0.7;
    this.core.position.y = 7.6 + Math.sin(t * 1.1) * 0.18;
    this.coreMat.emissiveIntensity = 2.6 + this.pulse * 1.6;
    this.light.intensity = 20 + this.pulse * 14;
    this.shaftMat.opacity = 0.12 + this.pulse * 0.07;
    this.decalMat.opacity = 0.32 + this.pulse * 0.18;
    this.decal.rotation.z += dt * 0.15;
    this.embers.update(dt, t, 1);
  }
}

/** Slowly rising embers around a seal. */
function buildEmbers(color, count) {
  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  const radii = new Float32Array(count);
  const angles = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    radii[i] = 1.2 + Math.random() * 3.4;
    angles[i] = Math.random() * Math.PI * 2;
    positions[i * 3 + 1] = Math.random() * 9;
    speeds[i] = 0.4 + Math.random() * 1.0;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.22,
    map: sharedGlow(),
    color,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;

  return {
    points,
    update(dt, t, k) {
      const arr = geo.attributes.position.array;
      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        arr[i3 + 1] += speeds[i] * dt;
        if (arr[i3 + 1] > 9.5) arr[i3 + 1] = 0.2;
        const a = angles[i] + t * 0.28 * (i % 2 ? 1 : -1);
        arr[i3] = Math.cos(a) * radii[i];
        arr[i3 + 2] = Math.sin(a) * radii[i];
      }
      geo.attributes.position.needsUpdate = true;
      mat.opacity = 0.9 * k;
    },
  };
}

/**
 * The Curator's gate: sealed until both seals are broken, then it rises and a
 * column of light marks the final encounter.
 */
export class GateMarker {
  constructor(def, gateNode) {
    this.def = def;
    this.id = def.id;
    this.open = false;
    this.openT = 0;
    this.node = gateNode || null;
    this.baseY = gateNode ? gateNode.position.y : heightAt(def.x, def.z);
    this.position = new THREE.Vector3(def.x, heightAt(def.x, def.z), def.z);

    this.group = new THREE.Group();
    this.group.position.copy(this.position);
    this.group.name = 'gate-marker';

    const color = new THREE.Color(def.color);
    this.shaftMat = new THREE.MeshBasicMaterial({
      map: shaftGradient(),
      color,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 2.6, 44, 26, 1, true),
      this.shaftMat,
    );
    this.shaft.position.y = 22;
    this.group.add(this.shaft);

    this.light = new THREE.PointLight(color.getHex(), 0, 42, 2);
    this.light.position.y = 6;
    this.group.add(this.light);

    this.embers = buildEmbers(color, 70);
    this.group.add(this.embers.points);
    this.embers.points.visible = false;
  }

  distanceTo(v) {
    return Math.hypot(v.x - this.position.x, v.z - this.position.z);
  }

  openGate() {
    if (this.open) return;
    this.open = true;
    this.openT = 0;
    this.embers.points.visible = true;
  }

  update(dt, t) {
    if (!this.open) return;
    this.openT = Math.min(1, this.openT + dt * 0.32);
    const k = easeOutCubic(this.openT);
    // Physically raise the iron gate out of the ground.
    if (this.node) this.node.position.y = this.baseY + k * 7.4;
    const pulse = 0.5 + Math.sin(t * 1.3) * 0.5;
    this.shaftMat.opacity = k * (0.14 + pulse * 0.08);
    this.light.intensity = k * (30 + pulse * 22);
    this.embers.update(dt, t, k);
  }
}
