import * as THREE from 'three';
import { stageFloorTexture, backdropTexture, gildTexture } from './textures.js';
import { ELEM_COLORS } from '../core/palette.js';

// Static battle arena: painted-marble disc stage, floating paint motes,
// a curved oil-painting backdrop and gilded proscenium arch.

const FLOATER_COUNT = 140;

export class Stage {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this._time = 0;
    this._build();
    this._motes = this._buildMotes();
    this._runeRings = [];
  }

  _build() {
    const g = this.group;

    // Floor disc — painted marble.
    const floorTex = stageFloorTexture();
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(16, 72),
      new THREE.MeshPhysicalMaterial({
        map: floorTex, roughness: 0.62, metalness: 0.08,
        sheen: 0.35, sheenColor: new THREE.Color('#8fbcb6'), clearcoat: 0.15
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    g.add(floor);

    // Darker ground plane far beyond to catch shadow continuity.
    const outer = new THREE.Mesh(
      new THREE.RingGeometry(16, 60, 48),
      new THREE.MeshStandardMaterial({ color: '#101a1c', roughness: 1 })
    );
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.02;
    outer.receiveShadow = true;
    g.add(outer);

    // Gilded rim ring.
    const gild = new THREE.MeshPhysicalMaterial({
      map: gildTexture(31), color: '#d8a94a', metalness: 0.85, roughness: 0.32
    });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(16.15, 0.14, 10, 96), gild);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.02;
    g.add(rim);

    // Curved backdrop cyclorama painted with the dusk sky.
    const curve = new THREE.CylinderGeometry(46, 46, 34, 48, 1, true, Math.PI * 0.75, Math.PI * 1.5);
    const sky = new THREE.Mesh(curve, new THREE.MeshBasicMaterial({
      map: backdropTexture(), side: THREE.BackSide, fog: false,
      color: '#cfc4ae'
    }));
    sky.position.y = 11.5;
    g.add(sky);

    // Proscenium: two gilded columns + arch flourish framing the combat view.
    for (const side of [-1, 1]) {
      const col = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.52, 8.6, 18), gild);
      shaft.position.y = 4.3;
      col.add(shaft);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.9, 0.7, 18), gild);
      base.position.y = 0.35;
      col.add(base);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.5, 0.9, 18), gild);
      cap.position.y = 8.9;
      col.add(cap);
      // Hanging lantern light glow sphere
      const lantern = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 16, 12),
        new THREE.MeshStandardMaterial({ color: '#f4d489', emissive: '#f4d489', emissiveIntensity: 2.4 })
      );
      lantern.position.set(-side * 0.9, 7.4, 0);
      col.add(lantern);
      col.position.set(side * 12.4, 0, -3.5);
      g.add(col);
    }

    // Distant paint-swirl monolith behind the enemy line (expedition 33 vibe).
    const swirlMat = new THREE.MeshStandardMaterial({
      color: '#274045', roughness: 0.7, emissive: '#12333a', emissiveIntensity: 0.5
    });
    const monolith = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 5.2, 16, 10, 1, false), swirlMat);
    monolith.position.set(-14, 8, -26);
    monolith.rotation.z = 0.12;
    g.add(monolith);
    const swirl = new THREE.Mesh(new THREE.TorusKnotGeometry(2.4, 0.28, 90, 10, 2, 5),
      new THREE.MeshStandardMaterial({ color: '#d8a94a', emissive: '#8a6524', emissiveIntensity: 0.8, metalness: 0.6, roughness: 0.4 }));
    swirl.position.set(-14, 15.6, -26);
    this._swirl = swirl;
    g.add(swirl);

    // Marker discs under each combatant slot (created empty, added by entities).
    this._slotMarkerMat = {
      party: new THREE.MeshStandardMaterial({ color: '#3f6b6d', transparent: true, opacity: 0.34, roughness: 0.8 }),
      enemy: new THREE.MeshStandardMaterial({ color: '#7b2a2e', transparent: true, opacity: 0.34, roughness: 0.8 })
    };
  }

  makeSlotMarker(side, radius = 1.15) {
    const m = new THREE.Mesh(new THREE.RingGeometry(radius * 0.82, radius, 40),
      this._slotMarkerMat[side].clone());
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.015;
    this.group.add(m);
    return m;
  }

  // A soft glowing ring used to telegraph AoE / break state beneath a fighter.
  makeAuraRing(color = '#f4d489', radius = 1.3) {
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.86, radius, 42), mat);
    ring.rotation.x = -Math.PI / 2;
    this.group.add(ring);
    return ring;
  }

  _buildMotes() {
    // Floating motes of luminous paint drifting over the stage.
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(FLOATER_COUNT * 3);
    const seedArr = new Float32Array(FLOATER_COUNT);
    const col = new Float32Array(FLOATER_COUNT * 3);
    const cA = new THREE.Color(ELEM_COLORS.light);
    const cB = new THREE.Color(ELEM_COLORS.ice);
    for (let i = 0; i < FLOATER_COUNT; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 30;
      pos[i * 3 + 1] = Math.random() * 9 + 0.5;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 26 - 4;
      seedArr[i] = Math.random() * 100;
      const c = Math.random() < 0.5 ? cA : cB;
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.16, vertexColors: true, transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false,
      map: this._moteSoftDot(), sizeAttenuation: true
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.group.add(pts);
    return { pts, pos, seedArr, count: FLOATER_COUNT };
  }

  _moteSoftDot() {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(c);
  }

  // Register a rune ring that spins under a combatant while they act.
  addRuneRing(ring) { this._runeRings.push(ring); }

  update(dt, gameT) {
    this._time += dt;
    const { pts, pos, seedArr, count } = this._motes;
    const arr = pts.geometry.attributes.position.array;
    for (let i = 0; i < count; i++) {
      const s = seedArr[i];
      arr[i * 3] = pos[i * 3] + Math.sin(gameT * 0.35 + s) * 1.6;
      arr[i * 3 + 1] = pos[i * 3 + 1] + Math.sin(gameT * 0.22 + s * 2.1) * 0.8;
      arr[i * 3 + 2] = pos[i * 3 + 2] + Math.cos(gameT * 0.3 + s * 1.7) * 1.4;
    }
    pts.geometry.attributes.position.needsUpdate = true;
    if (this._swirl) {
      this._swirl.rotation.y += dt * 0.35;
      this._swirl.rotation.x = Math.sin(gameT * 0.2) * 0.3;
    }
    for (const ring of this._runeRings) {
      ring.rotation.z += dt * (ring.userData.spin ?? 1.2);
    }
  }
}
