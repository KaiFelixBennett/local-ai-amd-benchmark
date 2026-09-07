/**
 * The battle stage: a gilded circular platform adrift in a painted void.
 *
 * Everything here is static set-dressing plus two cheap animated layers — the
 * drifting paint motes and the slowly turning canvas panels — which do most of
 * the work of making the scene feel hand-painted rather than modelled.
 */

import * as THREE from 'three';
import {
  stageFloorTexture, stageRoughnessTexture, backdropTexture, ornamentStripTexture,
  paintSprite, PALETTE,
} from './textures.js';
import { metalMaterial, lathe } from '../entities/rig.js';

const ARENA_RADIUS = 13.5;

export class Stage {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.radius = ARENA_RADIUS;

    this._buildBackdrop();
    this._buildPlatform();
    this._buildColonnade();
    this._buildPanels();
    this._buildMotes();
  }

  _buildBackdrop() {
    const geo = new THREE.CylinderGeometry(72, 72, 62, 40, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      map: backdropTexture(),
      side: THREE.BackSide,
      fog: false,
    });
    mat.map.repeat.set(1, 1);
    const dome = new THREE.Mesh(geo, mat);
    dome.position.y = 16;
    this.group.add(dome);
    this.backdrop = dome;

    // A dark floor far below so the platform reads as floating.
    const abyss = new THREE.Mesh(
      new THREE.CircleGeometry(70, 48),
      new THREE.MeshBasicMaterial({ color: 0x061417, fog: false }),
    );
    abyss.rotation.x = -Math.PI / 2;
    abyss.position.y = -22;
    this.group.add(abyss);
  }

  _buildPlatform() {
    const floorMat = new THREE.MeshPhysicalMaterial({
      map: stageFloorTexture(),
      roughnessMap: stageRoughnessTexture(),
      color: 0xffffff,
      roughness: 0.92,
      metalness: 0.34,
      sheen: 0.3,
      sheenColor: new THREE.Color(PALETTE.gold),
      clearcoat: 0.18,
      clearcoatRoughness: 0.7,
    });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(ARENA_RADIUS, 96), floorMat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.01;
    disc.receiveShadow = true;
    this.group.add(disc);
    this.floor = disc;

    const sideMat = new THREE.MeshStandardMaterial({
      map: ornamentStripTexture(PALETTE.gold),
      roughness: 0.72,
      metalness: 0.35,
      side: THREE.DoubleSide,
    });
    sideMat.map = sideMat.map.clone();
    sideMat.map.wrapS = THREE.RepeatWrapping;
    sideMat.map.repeat.set(22, 1);
    sideMat.map.needsUpdate = true;
    const side = new THREE.Mesh(
      new THREE.CylinderGeometry(ARENA_RADIUS, ARENA_RADIUS * 0.86, 1.5, 72, 1, true),
      sideMat,
    );
    side.position.y = -0.74;
    this.group.add(side);

    const goldMat = metalMaterial(PALETTE.gold, 'gold-shared', 0.22);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(ARENA_RADIUS, 0.11, 10, 120), goldMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.03;
    rim.castShadow = true;
    this.group.add(rim);

    const innerRim = new THREE.Mesh(new THREE.TorusGeometry(ARENA_RADIUS * 0.62, 0.045, 8, 96), goldMat);
    innerRim.rotation.x = Math.PI / 2;
    innerRim.position.y = 0.035;
    this.group.add(innerRim);

    // Under-lit shelf so the platform edge catches the rim light.
    const shelf = new THREE.Mesh(
      new THREE.RingGeometry(ARENA_RADIUS * 0.98, ARENA_RADIUS * 1.16, 96),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(PALETTE.gold), transparent: true, opacity: 0.14,
        side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    shelf.rotation.x = -Math.PI / 2;
    shelf.position.y = -0.02;
    this.group.add(shelf);
  }

  _buildColonnade() {
    const goldMat = metalMaterial(PALETTE.gold, 'gold-shared', 0.22);
    const shaftMat = new THREE.MeshStandardMaterial({
      map: ornamentStripTexture(PALETTE.gold),
      roughness: 0.8,
      metalness: 0.24,
    });
    this.lamps = [];

    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.PI / 10;
      // Leave the front of the arena open so the camera always has a clean view.
      if (Math.sin(a) > 0.55) continue;
      const r = ARENA_RADIUS - 0.9;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;

      const col = new THREE.Group();
      col.position.set(x, 0, z);
      col.rotation.y = -a;
      this.group.add(col);

      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.52, 0.3, 12), goldMat);
      base.position.y = 0.15;
      base.castShadow = true;
      col.add(base);

      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, 4.6, 14), shaftMat);
      shaft.position.y = 2.55;
      shaft.castShadow = true;
      col.add(shaft);

      const cap = lathe(col, [
        [0, 0.62], [0.2, 0.58], [0.42, 0.4], [0.5, 0.16], [0.34, 0], [0.26, -0.02],
      ], goldMat, 14);
      cap.position.y = 4.85;

      // A glowing lamp in each capital; these pulse with battle intensity.
      const lampMat = new THREE.MeshBasicMaterial({ color: 0xffd89a });
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), lampMat);
      lamp.position.y = 5.42;
      col.add(lamp);
      this.lamps.push(lamp);

      // Whiplash bracket connecting the column to the rim.
      const bracket = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.035, 6, 20, Math.PI), goldMat);
      bracket.position.set(0, 4.2, 0.3);
      bracket.rotation.set(Math.PI / 2, 0, 0);
      col.add(bracket);
    }
  }

  /**
   * Free-floating painted canvases drifting behind the fight.
   *
   * Deliberately placed well outside the arena and above head height: the
   * combat camera can swing out to roughly 14 units, and a decorative panel
   * must never end up between the lens and a combatant mid-telegraph.
   */
  _buildPanels() {
    this.panels = [];
    const goldMat = metalMaterial(PALETTE.gold, 'gold-shared', 0.28);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const r = 30 + (i % 3) * 7;
      const g = new THREE.Group();
      g.position.set(Math.cos(a) * r, 9.5 + (i % 4) * 3.6, Math.sin(a) * r - 4);
      g.rotation.y = -a + Math.PI;

      const canvasMat = new THREE.MeshStandardMaterial({
        map: backdropTexture(),
        roughness: 0.95,
        metalness: 0.05,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.34,
        depthWrite: false,
      });
      const w = 5 + (i % 3) * 2.2;
      const h = 3.4 + (i % 2) * 2;
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), canvasMat);
      g.add(panel);

      const frame = new THREE.Mesh(new THREE.TorusGeometry(Math.max(w, h) * 0.52, 0.07, 6, 30), goldMat);
      frame.scale.set(1, h / Math.max(w, h) * 1.1, 1);
      g.add(frame);

      this.group.add(g);
      this.panels.push({ node: g, phase: i * 1.3, baseY: g.position.y });
    }
  }

  _buildMotes() {
    const COUNT = 900;
    const positions = new Float32Array(COUNT * 3);
    const speeds = new Float32Array(COUNT);
    const phases = new Float32Array(COUNT);
    const colors = new Float32Array(COUNT * 3);
    const palette = [
      new THREE.Color(PALETTE.gold),
      new THREE.Color(PALETTE.goldBright),
      new THREE.Color(PALETTE.verdigris),
      new THREE.Color(PALETTE.parchment),
    ];
    for (let i = 0; i < COUNT; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 26;
      positions[i * 3] = Math.cos(a) * r;
      positions[i * 3 + 1] = Math.random() * 15 - 1.5;
      positions[i * 3 + 2] = Math.sin(a) * r;
      speeds[i] = 0.14 + Math.random() * 0.4;
      phases[i] = Math.random() * Math.PI * 2;
      const c = palette[i % palette.length];
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.14,
      map: paintSprite(),
      vertexColors: true,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    this.motes = new THREE.Points(geo, mat);
    this.motes.frustumCulled = false;
    this.group.add(this.motes);
    this._moteSpeeds = speeds;
    this._motePhases = phases;
  }

  /**
   * @param {number} intensity 0..1 battle intensity; brightens the lamps and
   *        speeds the motes as the fight gets desperate.
   */
  update(dt, elapsed, intensity = 0.4) {
    const pos = this.motes.geometry.attributes.position;
    const arr = pos.array;
    for (let i = 0; i < this._moteSpeeds.length; i++) {
      const i3 = i * 3;
      arr[i3 + 1] += this._moteSpeeds[i] * dt * (0.6 + intensity);
      arr[i3] += Math.sin(elapsed * 0.4 + this._motePhases[i]) * dt * 0.25;
      arr[i3 + 2] += Math.cos(elapsed * 0.33 + this._motePhases[i]) * dt * 0.22;
      if (arr[i3 + 1] > 14) {
        arr[i3 + 1] = -2;
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * 26;
        arr[i3] = Math.cos(a) * r;
        arr[i3 + 2] = Math.sin(a) * r;
      }
    }
    pos.needsUpdate = true;
    this.motes.material.opacity = 0.45 + intensity * 0.3;

    for (const p of this.panels) {
      p.node.position.y = p.baseY + Math.sin(elapsed * 0.32 + p.phase) * 0.7;
      p.node.rotation.z = Math.sin(elapsed * 0.21 + p.phase) * 0.05;
    }

    const lamp = 0.55 + Math.sin(elapsed * 2.3) * 0.06 + intensity * 0.4;
    for (let i = 0; i < this.lamps.length; i++) {
      const m = this.lamps[i].material;
      m.color.setRGB(lamp, lamp * 0.82, lamp * 0.55);
      this.lamps[i].scale.setScalar(0.9 + Math.sin(elapsed * 3 + i) * 0.06 + intensity * 0.18);
    }

    this.backdrop.rotation.y = elapsed * 0.004;
  }
}
