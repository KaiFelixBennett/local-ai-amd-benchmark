/**
 * world/overworld.js — the explorable region of "The Unwritten".
 *
 * Self-contained: it builds ONE `THREE.Group` (`this.world`) in the shared
 * scene and manages the shared camera + player ONLY while `active`. The
 * verified battle core (renderer.stage + combatant roots) is left untouched;
 * game.js toggles visibility between the two so they never fight.
 *
 * Everything is procedural: a seeded value-noise heightfield (with a flat
 * central clearing where battles happen, at the foot of the Spire), a
 * gradient sky dome, area-tinted fog + ACES exposure, InstancedMesh
 * vegetation/rocks (one draw call each), hand-built landmarks, and a gilded
 * objective marker. No binary assets, no new runtime deps.
 *
 * POIs are reported through callbacks (onMemory/onEncounter/onCamp/onSecret/
 * onChoice); the module never mutates the battle core directly.
 */
import * as THREE from 'three';
import { Rng, clamp, damp, lerp } from '../core/rng.js';

// --- Deterministic hash-based value noise (independent of the battle RNG) ---
function hash2(ix, iz, seed) {
  let n = (ix * 374761393 + iz * 668265263 + seed * 974634211) | 0;
  n = (n ^ (n >> 13)) | 0;
  n = Math.imul(n, 1274126177);
  return ((n ^ (n >> 16)) >>> 0) / 4294967295;
}
function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
function valueNoise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  const u = smoothstep(0, 1, fx), v = smoothstep(0, 1, fz);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}
function fbm(x, z, seed, oct) {
  let f = 0, amp = 1, freq = 1, sum = 0;
  for (let o = 0; o < oct; o++) {
    f += amp * valueNoise(x * freq, z * freq, seed + o * 131);
    sum += amp; amp *= 0.5; freq *= 2;
  }
  return f / sum;
}

const SIZE = 220;        // world extent (units)
const SEG = 128;         // terrain resolution
const CLEAR_R = 16;      // flat clearing radius at the Spire base (battles)

export class Overworld {
  /**
   * @param {THREE.Scene} scene  the shared scene (renderer.scene)
   * @param {object} opts {
   *   camera, input, timeline,
   *   areas, pois, characters,
   *   onMemory(poi), onEncounter(poi), onCamp(poi), onSecret(poi), onChoice()
   * }
   */
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.camera = opts.camera;
    this.renderer = opts.renderer || null; // THREE.WebGLRenderer (for exposure)
    this.input = opts.input;
    this.timeline = opts.timeline;
    this.areas = opts.areas || [];
    this.pois = opts.pois || [];
    this.characters = opts.characters || {};
    this.cb = {
      onMemory: opts.onMemory || (() => {}),
      onEncounter: opts.onEncounter || (() => {}),
      onCamp: opts.onCamp || (() => {}),
      onSecret: opts.onSecret || (() => {}),
      onChoice: opts.onChoice || (() => {}),
    };

    // World-gen RNG: fixed seed so the region is identical every run and the
    // battle RNG (used for combat draws) is never touched.
    this.rng = new Rng(0x0b17c0de);

    // Ford water level (the player wades just below it, see _updatePlayer).
    this.WATER_Y = -6.4;

    this.active = false;
    this.objectiveId = null;
    this.collected = new Set();
    this.openedGates = new Set();

    // Camera orbit state
    this.yaw = Math.PI * 0.25;
    this.pitch = -0.16;
    this._dragging = false;
    this._lastX = 0;
    this._lastY = 0;

    // Player
    this._velY = 0;
    this._onGround = true;
    this._startPos = this._poiPos(this._firstMemoryPoi() || this.pois[0]) || new THREE.Vector3(26, 0, 20);

    this._buildWorld();
    this._buildLandmarks();
    this._buildPOIMarkers();
    this._buildPlayer();
    this._bindMouse();

    this.player.position.set(this._startPos.x, this.heightAt(this._startPos.x, this._startPos.z) + 1.4, this._startPos.z);
  }

  // ------------------------------------------------------------------
  // Terrain height (shared by mesh + player + director)
  // ------------------------------------------------------------------
  heightAt(x, z) {
    const base = fbm(x * 0.028, z * 0.028, 17, 4) - 0.5;
    let h = base * 2 * 9; // rolling hills, roughly -9..+9
    // Carve a gentle ford valley running through the hills (along x ~ -6)
    const ford = Math.exp(-Math.pow((z + 6) / 7, 2)) * Math.exp(-Math.pow((x + 6) / 22, 2));
    h -= ford * 6;
    // Flatten the central clearing (Spire base / battle clearing)
    const d = Math.hypot(x, z);
    const flat = smoothstep(CLEAR_R - 7, CLEAR_R + 3, d); // 0 near centre, 1 outside
    h = h * flat;
    return h;
  }

  // ------------------------------------------------------------------
  // World build
  // ------------------------------------------------------------------
  _buildWorld() {
    this.world = new THREE.Group();
    this.world.name = 'overworld';

    // Terrain
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const low = new THREE.Color(0x213029);   // valley / ford (teal-tinged)
    const mid = new THREE.Color(0x2c3a33);   // rolling ground
    const high = new THREE.Color(0x3a4a44);  // high ground (pale, "erased")
    const pale = new THREE.Color(0x5a6a66);  // near-white crest (the Veil bleaching)
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = this.heightAt(x, z);
      pos.setY(i, h);
      const t = clamp((h + 3) / 12, 0, 1);
      const c = new THREE.Color();
      if (t < 0.4) c.lerpColors(low, mid, t / 0.4);
      else if (t < 0.75) c.lerpColors(mid, high, (t - 0.4) / 0.35);
      else c.lerpColors(high, pale, (t - 0.75) / 0.25);
      // subtle per-vertex variation so the ground reads painted, not flat
      const v = 0.92 + hash2(i, 1, 3) * 0.16;
      colors[i * 3] = c.r * v; colors[i * 3 + 1] = c.g * v; colors[i * 3 + 2] = c.b * v;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0.0 }));
    terrain.receiveShadow = true;
    this.world.add(terrain);

    // Sky dome (gradient, un-fogged, no depth write). r=420 must stay inside
    // the camera's far plane (600) even at the map edge (camera r≈106):
    // 420 + 106 = 526 < 600. It also has to enclose the mountain ring and
    // the ground skirt.
    const skyTex = this._makeSkyTexture();
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(420, 32, 16),
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false })
    );
    this.sky.position.y = -10;
    // Draw the dome first among opaques (it writes no depth) so the sun disc
    // and clouds, rendered later, composite over it cleanly.
    this.sky.renderOrder = -1;
    this.world.add(this.sky);
    this._skyTex = skyTex;

    // Atmospheric motes (the "paint" drifting in the air)
    this.motes = this._makeMotes();
    this.world.add(this.motes);

    // Overworld lights (in the group -> toggle with group visibility).
    // The key light comes from the same direction as the sun disc so its
    // shadows agree with what the player sees on the horizon.
    this.sun = new THREE.DirectionalLight(0xffd9a0, 2.2);
    this.sun.position.set(84, 40, 52);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 120;
    sc.updateProjectionMatrix();
    this.sun.shadow.bias = -0.0006;
    this.world.add(this.sun);
    this.world.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0x8fb4c4, 0x1c2a26, 0.6);
    this.world.add(this.hemi);

    this.scene.add(this.world);

    // Vegetation + rocks (InstancedMesh)
    this._buildVegetation();

    // The world around the Spire — what turns "a field with a tower" into
    // "the city of the expedition at dusk". All procedural, all in
    // this.world, all deterministic.
    this._buildHorizon();   // mountain ring + sun disc + drifting clouds
    this._buildCity();      // the dusk city: instanced haussmann blocks, lamps, spires
    this._buildGate();      // the Painted Gate arch at the gate POI
    this._buildWater();     // animated ford water + wade bridge
    this._buildPlaza();     // Spire plaza: steps, colonnade, guardian statues
    this._buildRuneShards(); // orbiting rune fragments on the Spire

    this.setAtmosphere(this.areas[0] ? this.areas[0].id : 'dusk_city');
  }

  _makeSkyTexture() {
    const c = document.createElement('canvas');
    c.width = 4; c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#2a3550');
    g.addColorStop(0.55, '#3a4a5a');
    g.addColorStop(1, '#5a4a52');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _makeMotes() {
    const N = 320;
    const g = new THREE.BufferGeometry();
    const a = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      a[i * 3] = this.rng.range(-70, 70);
      a[i * 3 + 1] = this.rng.range(1, 22);
      a[i * 3 + 2] = this.rng.range(-70, 70);
    }
    g.setAttribute('position', new THREE.BufferAttribute(a, 3));
    const m = new THREE.Points(g, new THREE.PointsMaterial({
      color: 0xcfe8e6, size: 0.12, transparent: true, opacity: 0.5, sizeAttenuation: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    return m;
  }

  _buildVegetation() {
    // Trees: a gilded-cedar cone (stylised, matches the art direction).
    const treeGeo = new THREE.ConeGeometry(1.1, 3.4, 7);
    treeGeo.translate(0, 1.7, 0);
    const trunkGeo = new THREE.CylinderGeometry(0.14, 0.2, 1.0, 6);
    trunkGeo.translate(0, 0.5, 0);
    const treeMat = new THREE.MeshStandardMaterial({ color: 0x2f6b5e, roughness: 0.9, metalness: 0.05, flatShading: true });
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3a2e22, roughness: 0.95, flatShading: true });
    const TREES = 360, ROCKS = 240;
    this.trees = new THREE.InstancedMesh(treeGeo, treeMat, TREES);
    this.trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, TREES);
    const rockGeo = new THREE.IcosahedronGeometry(0.7, 0);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x54605c, roughness: 0.95, metalness: 0.02, flatShading: true });
    this.rocks = new THREE.InstancedMesh(rockGeo, rockMat, ROCKS);
    this.trees.castShadow = true;
    this.trunks.castShadow = true;
    this.rocks.castShadow = true;

    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    let ti = 0, ri = 0, guard = 0;
    while ((ti < TREES || ri < ROCKS) && guard < 40000) {
      guard++;
      const x = this.rng.range(-SIZE / 2 + 6, SIZE / 2 - 6);
      const z = this.rng.range(-SIZE / 2 + 6, SIZE / 2 - 6);
      const d = Math.hypot(x, z);
      if (d < CLEAR_R + 6) continue;                 // keep the clearing clear
      const h = this.heightAt(x, z);
      if (h < -3.5 || h > 7.5) continue;             // not in the ford, not on high crests
      Q.setFromAxisAngle(up, this.rng.range(0, Math.PI * 2));
      if (ti < TREES && h > 0.2) {
        const s = this.rng.range(0.8, 1.8);
        P.set(x, h, z); S.set(s, s, s);
        M.compose(P, Q, S);
        this.trees.setMatrixAt(ti, M);
        this.trunks.setMatrixAt(ti, M);
        ti++;
      } else if (ri < ROCKS) {
        const s = this.rng.range(0.6, 2.4);
        P.set(x, h - 0.2, z); S.set(s, s * 0.8, s);
        M.compose(P, Q, S);
        this.rocks.setMatrixAt(ri, M);
        ri++;
      }
    }
    this.trees.count = ti; this.trunks.count = ti; this.rocks.count = ri;
    this.trees.instanceMatrix.needsUpdate = true;
    this.trunks.instanceMatrix.needsUpdate = true;
    this.rocks.instanceMatrix.needsUpdate = true;
    this.world.add(this.trees, this.trunks, this.rocks);
  }

  // ------------------------------------------------------------------
  // Horizon: mountain rings, the sun disc, drifting clouds.
  // These live OUTSIDE the terrain (r > 110) and rely on the camera's
  // far=600 + fog to read as painted silhouettes on the horizon.
  // ------------------------------------------------------------------
  _buildHorizon() {
    const M = new THREE.Matrix4(), P = new THREE.Vector3(), S = new THREE.Vector3(), Q = new THREE.Quaternion();

    // Two parallax rings of "erased" mountains (pale, washed by the Veil).
    // fog:false on purpose: FogExp2(0.014) at r>150 would erase 99% of them
    // into the fog colour. The Veil *is* the fog — distant things should read
    // as flat painted silhouettes against the sky, not vanish.
    const cone = new THREE.ConeGeometry(1, 1, 5);
    const farMat = new THREE.MeshStandardMaterial({ color: 0x7c85a0, roughness: 1.0, flatShading: true, fog: false });
    const nearMat = new THREE.MeshStandardMaterial({ color: 0x4a5570, roughness: 1.0, flatShading: true, fog: false });
    const FAR_N = 22, NEAR_N = 10;
    const farMtns = new THREE.InstancedMesh(cone, farMat, FAR_N);
    const nearMtns = new THREE.InstancedMesh(cone, nearMat, NEAR_N);
    for (let i = 0; i < FAR_N; i++) {
      const a = (i / FAR_N) * Math.PI * 2 + this.rng.range(-0.12, 0.12);
      const r = this.rng.range(165, 235);
      const w = this.rng.range(30, 70), h = this.rng.range(45, 115);
      P.set(Math.cos(a) * r, -42 + h / 2, Math.sin(a) * r);
      S.set(w, h, w);
      M.compose(P, Q, S);
      farMtns.setMatrixAt(i, M);
    }
    for (let i = 0; i < NEAR_N; i++) {
      const a = (i / NEAR_N) * Math.PI * 2 + this.rng.range(-0.2, 0.2);
      const r = this.rng.range(125, 160);
      const w = this.rng.range(22, 44), h = this.rng.range(24, 55);
      P.set(Math.cos(a) * r, -42 + h / 2, Math.sin(a) * r);
      S.set(w, h, w);
      M.compose(P, Q, S);
      nearMtns.setMatrixAt(i, M);
    }
    this.world.add(farMtns, nearMtns);

    // The setting sun: an HDR disc (bloom picks it up) + soft glow sprite.
    // Placed far along the key-light direction so shadows match the light.
    const sunDir = new THREE.Vector3(84, 40, 52).normalize();
    const sunPos = sunDir.clone().multiplyScalar(300);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(11, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd9a0).multiplyScalar(3.2), fog: false, depthWrite: false })
    );
    disc.position.copy(sunPos);
    disc.lookAt(0, 0, 0);
    this.world.add(disc);

    const gc = document.createElement('canvas');
    gc.width = gc.height = 128;
    const g2 = gc.getContext('2d');
    const rad = g2.createRadialGradient(64, 64, 4, 64, 64, 64);
    rad.addColorStop(0, 'rgba(255,214,150,0.85)');
    rad.addColorStop(0.35, 'rgba(255,190,120,0.28)');
    rad.addColorStop(1, 'rgba(255,180,110,0)');
    g2.fillStyle = rad;
    g2.fillRect(0, 0, 128, 128);
    const glowTex = new THREE.CanvasTexture(gc);
    glowTex.colorSpace = THREE.SRGBColorSpace;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, transparent: true, opacity: 0.9, fog: false, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    glow.position.copy(sunPos);
    glow.scale.setScalar(95);
    this.world.add(glow);
    this._sunAnchor = sunPos.clone().multiplyScalar(0.55); // closer anchor for god rays

    // Drifting clouds: instanced planes with a soft procedural cloud sprite.
    const cc = document.createElement('canvas');
    cc.width = 128; cc.height = 64;
    const c3 = cc.getContext('2d');
    for (let i = 0; i < 14; i++) {
      const x = this.rng.range(20, 108), y = this.rng.range(22, 44), r = this.rng.range(9, 22);
      const cg = c3.createRadialGradient(x, y, 1, x, y, r);
      cg.addColorStop(0, 'rgba(232,220,210,0.55)');
      cg.addColorStop(1, 'rgba(232,220,210,0)');
      c3.fillStyle = cg;
      c3.beginPath(); c3.arc(x, y, r, 0, Math.PI * 2); c3.fill();
    }
    const cloudTex = new THREE.CanvasTexture(cc);
    cloudTex.colorSpace = THREE.SRGBColorSpace;
    const CLOUDS = 16;
    const clouds = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide, fog: false }),
      CLOUDS
    );
    this._clouds = clouds;
    this._cloudData = [];
    for (let i = 0; i < CLOUDS; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const r = this.rng.range(70, 210);
      const s = this.rng.range(26, 60);
      this._cloudData.push({ x: Math.cos(a) * r, y: this.rng.range(34, 72), z: Math.sin(a) * r, s, v: this.rng.range(0.25, 0.7) });
    }
    this._updateClouds(0);
    this.world.add(clouds);

    // Ground skirt: hides the seam between the terrain edge (r=110) and the
    // painted horizon ring; also a safety net if the camera dips below the
    // terrain. Dark and un-fogged so it reads as the shadowed ground plane.
    const skirt = new THREE.Mesh(
      new THREE.PlaneGeometry(700, 700),
      new THREE.MeshBasicMaterial({ color: 0x10151c, fog: false })
    );
    skirt.rotation.x = -Math.PI / 2;
    skirt.position.y = -14;
    skirt.renderOrder = -2;
    this.world.add(skirt);
  }

  _updateClouds(dt) {
    if (!this._clouds) return;
    const M = new THREE.Matrix4(), P = new THREE.Vector3(), S = new THREE.Vector3();
    const QY = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < this._cloudData.length; i++) {
      const d = this._cloudData[i];
      d.x += dt * d.v;
      if (d.x > 230) d.x = -230;
      // Billboard toward the origin (cheap: yaw-only).
      P.set(d.x, d.y, d.z);
      QY.setFromAxisAngle(up, Math.atan2(-d.x, -d.z));
      S.set(d.s, d.s * 0.42, 1);
      M.compose(P, QY, S);
      this._clouds.setMatrixAt(i, M);
    }
    this._clouds.instanceMatrix.needsUpdate = true;
  }

  // Slowly scroll the ripple texture and shimmer the emissive: the ford
  // reads as moving water even with a single static mesh.
  _updateWater(worldT) {
    if (!this._waterTex) return;
    this._waterTex.offset.x = worldT * 0.012;
    this._waterTex.offset.y = worldT * 0.02;
    if (this.water && this.water.material) {
      this.water.material.emissiveIntensity = 0.42 + Math.sin(worldT * 0.8) * 0.14;
    }
  }

  // ------------------------------------------------------------------
  // The dusk city — a haussmann district of instanced stone blocks with
  // lit windows, street lamps along the processional road, and a few
  // gilded spires. Deterministic; every block also registers a circular
  // collider so the player walks AROUND buildings, not through them.
  // ------------------------------------------------------------------
  _buildCity() {
    this.cityBlocks = [];
    const M = new THREE.Matrix4(), P = new THREE.Vector3(), S = new THREE.Vector3();
    const Q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);

    // Procedural lit-window texture (emissiveMap): a dark stone field with a
    // grid of warm windows, some lit, some dark — two variants so instanced
    // buildings don't all share one pattern.
    const makeWindowTex = (seedOffset) => {
      const c = document.createElement('canvas');
      c.width = 64; c.height = 128;
      const x = c.getContext('2d');
      x.fillStyle = '#0b0e14';
      x.fillRect(0, 0, 64, 128);
      let s = 1234 + seedOffset;
      const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
      for (let row = 0; row < 14; row++) {
        for (let col = 0; col < 7; col++) {
          const wx = 4 + col * 8, wy = 6 + row * 8;
          if (row > 11) continue; // roof band stays dark
          const lit = rnd() < 0.42;
          x.fillStyle = lit ? (rnd() < 0.5 ? '#ffcf8a' : '#ffd9a8') : '#141a22';
          x.fillRect(wx, wy, 5, 6);
        }
      }
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.magFilter = THREE.NearestFilter;
      return t;
    };
    const texA = makeWindowTex(0), texB = makeWindowTex(99);

    const baseMat = (tex) => new THREE.MeshStandardMaterial({
      color: 0x3d3a4e, roughness: 0.92, metalness: 0.04,
      emissive: 0xffc87a, emissiveIntensity: 1.1, emissiveMap: tex,
    });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x2a2c3a, roughness: 0.95, flatShading: true });
    const capMat = new THREE.MeshPhysicalMaterial({ color: 0xc9a24b, metalness: 0.85, roughness: 0.4, emissive: 0x2a1e06, emissiveIntensity: 0.3 });

    // District grid: the road runs from the clearing (2,1.5) to the city
    // heart (26,20); blocks line both sides of it.
    const CX = 26, CZ = 20;
    const roadA = new THREE.Vector2(2, 1.5), roadB = new THREE.Vector2(CX, CZ);
    const roadDir = roadB.clone().sub(roadA).normalize();
    const perp = new THREE.Vector2(-roadDir.y, roadDir.x);
    // Keep a clear pocket around every POI (memories, camps, encounters, the
    // gate) so the player, the interact markers and the chase camera never
    // end up inside a facade.
    const poiPts = this.pois.map((p) => new THREE.Vector2(p.pos[0], p.pos[2]));

    const N = 200; // instance budget (two body variants split the count)
    const bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), baseMat(texA), N);
    const bodiesB = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), baseMat(texB), N);
    const roofs = new THREE.InstancedMesh(new THREE.ConeGeometry(0.75, 0.6, 4), roofMat, N);
    const caps = new THREE.InstancedMesh(new THREE.BoxGeometry(1.06, 0.22, 1.06), capMat, N);

    let iA = 0, iB = 0, iR = 0, iC = 0, guard = 0;
    for (let gx = -4; gx <= 4 && guard < 800; gx++) {
      for (let gz = -4; gz <= 4; gz++) {
        guard++;
        const cx = CX + gx * 5.2 + this.rng.range(-1.3, 1.3);
        const cz = CZ + gz * 5.2 + this.rng.range(-1.3, 1.3);
        if (Math.hypot(cx, cz) < 15) continue; // keep the Spire clearing open
        let inPocket = false;
        for (const pp of poiPts) {
          const ddx = cx - pp.x, ddz = cz - pp.y;
          if (ddx * ddx + ddz * ddz < 64) { inPocket = true; break; } // 8u pocket
        }
        if (inPocket) continue;
        // Distance of the block centre to the road line.
        const rel = new THREE.Vector2(cx - roadA.x, cz - roadA.y);
        const along = rel.dot(roadDir);
        const side = rel.dot(perp);
        if (along < -4 || along > roadA.distanceTo(roadB) + 6) continue;
        // Wide enough that even the largest block (incl. jitter) can never
        // touch the street the party walks on.
        if (Math.abs(side) < 4.6) continue;
        if (this.rng.chance(0.2)) continue; // ~80% fill
        // Buildings get taller toward the city heart (downtown skyline).
        // Sizes leave ~1.4u gaps between blocks so the side streets stay
        // walkable.
        const heart = clamp(1 - Math.hypot(cx - CX, cz - CZ) / 26, 0, 1);
        const w = this.rng.range(2.4, 3.9);
        const d = this.rng.range(2.4, 3.9);
        const h = this.rng.range(4.5, 11) * (0.75 + heart * 0.8) * (Math.abs(side) < 8 ? 1.1 : 0.85);
        const gy = this.heightAt(cx, cz) + 0.2;
        const rot = this.rng.range(0, Math.PI * 2);
        // Alternate between the two window-texture variants.
        const useA = iA < iB;
        const body = useA ? bodies : bodiesB;
        const bi = useA ? iA : iB;
        if (bi >= N) break;
        P.set(cx, gy + h / 2, cz); S.set(w, h, d);
        Q.setFromAxisAngle(up, rot);
        M.compose(P, Q, S);
        body.setMatrixAt(bi, M);
        if (useA) iA++; else iB++;
        // Gilded roof cap (hides the roof UVs) + occasional mansard pyramid.
        if (iC < N) {
          P.set(cx, gy + h + 0.11, cz); S.set(w, 1, d);
          M.compose(P, Q, S); caps.setMatrixAt(iC, M); iC++;
        }
        if (iR < N && this.rng.chance(0.55)) {
          P.set(cx, gy + h + 0.55, cz);
          S.set(Math.max(w, d) * 1.02, this.rng.range(1.4, 2.6), Math.max(w, d) * 1.02);
          Q.setFromAxisAngle(up, rot + Math.PI / 4);
          M.compose(P, Q, S); roofs.setMatrixAt(iR, M); iR++;
          Q.setFromAxisAngle(up, rot);
        }
        // Collider (circle around the footprint).
        this.cityBlocks.push({ x: cx, z: cz, r: Math.max(w, d) / 2 + 0.7 });
      }
    }
    bodies.count = iA; bodiesB.count = iB; roofs.count = iR; caps.count = iC;
    for (const m of [bodies, bodiesB, roofs, caps]) m.instanceMatrix.needsUpdate = true;
    this.world.add(bodies, bodiesB, roofs, caps);

    // Street lamps: warm glowing heads lining the processional road.
    const LAMPS = 22;
    const poleGeo = new THREE.CylinderGeometry(0.05, 0.08, 2.6, 6);
    poleGeo.translate(0, 1.3, 0);
    const headGeo = new THREE.SphereGeometry(0.16, 10, 8);
    headGeo.translate(0, 2.72, 0);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x1c2026, roughness: 0.7, metalness: 0.5 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffc87a, emissiveIntensity: 3.4 });
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, LAMPS);
    const heads = new THREE.InstancedMesh(headGeo, headMat, LAMPS);
    const rodLen = roadA.distanceTo(roadB);
    for (let i = 0; i < LAMPS; i++) {
      const t = (i + 0.5) / LAMPS;
      const px = roadA.x + roadDir.x * rodLen * t + perp.x * (i % 2 ? 2.6 : -2.6);
      const pz = roadA.y + roadDir.y * rodLen * t + perp.y * (i % 2 ? 2.6 : -2.6);
      const gy = this.heightAt(px, pz);
      P.set(px, gy, pz); S.set(1, 1, 1); Q.identity();
      M.compose(P, Q, S);
      poles.setMatrixAt(i, M);
      heads.setMatrixAt(i, M);
    }
    poles.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    this.world.add(poles, heads);
  }

  // ------------------------------------------------------------------
  // The Painted Gate — a monumental arch the party must pass. Two monolith
  // piers, a lintel wrapped in a procedural "painted" mural, a gilded arch
  // span, and an emissive rune ring that turns green when it is opened.
  // ------------------------------------------------------------------
  _buildGate() {
    const poi = this.pois.find((p) => p.id === 'gate');
    const px = poi ? poi.pos[0] : -16, pz = poi ? poi.pos[2] : -10;
    const gy = this.heightAt(px, pz);
    const gate = new THREE.Group();
    gate.position.set(px, gy, pz);

    const stone = new THREE.MeshStandardMaterial({ color: 0x2e3a46, roughness: 0.85, metalness: 0.05 });
    const gold = new THREE.MeshPhysicalMaterial({ color: 0xc9a24b, metalness: 0.88, roughness: 0.32, emissive: 0x2a1e06, emissiveIntensity: 0.45 });

    for (const sx of [-3.4, 3.4]) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(1.7, 9.5, 1.7), stone);
      pier.position.set(sx, 4.75, 0);
      pier.castShadow = true;
      gate.add(pier);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.7, 2.3), gold);
      cap.position.set(sx, 9.8, 0);
      gate.add(cap);
    }
    // Lintel with a procedural painted mural (broad brush bands + gold trim).
    const mc = document.createElement('canvas');
    mc.width = 256; mc.height = 48;
    const mx = mc.getContext('2d');
    mx.fillStyle = '#1a2030';
    mx.fillRect(0, 0, 256, 48);
    const bands = ['#7a3b4a', '#2f6b5e', '#3c4a5e', '#8a5a6a', '#2a3550'];
    let s = 777;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < 26; i++) {
      mx.fillStyle = bands[(rnd() * bands.length) | 0];
      const bx = rnd() * 256, by = rnd() * 40, bw = rnd() * 60 + 14, bh = rnd() * 12 + 5;
      mx.globalAlpha = 0.5 + rnd() * 0.4;
      mx.fillRect(bx, by, bw, bh);
    }
    mx.globalAlpha = 1;
    mx.fillStyle = '#e8c979';
    mx.fillRect(0, 0, 256, 3);
    mx.fillRect(0, 45, 256, 3);
    const muralTex = new THREE.CanvasTexture(mc);
    muralTex.colorSpace = THREE.SRGBColorSpace;
    const mural = new THREE.Mesh(
      new THREE.BoxGeometry(8.8, 1.9, 2.0),
      [stone, stone,
        new THREE.MeshStandardMaterial({ map: muralTex, emissiveMap: muralTex, emissive: 0xffffff, emissiveIntensity: 0.32, roughness: 0.8 }),
        stone,
        new THREE.MeshStandardMaterial({ map: muralTex, emissiveMap: muralTex, emissive: 0xffffff, emissiveIntensity: 0.32, roughness: 0.8 }),
        stone]
    );
    mural.position.set(0, 10.9, 0);
    gate.add(mural);
    // Gilded arch spanning between the piers.
    const arch = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.42, 10, 40, Math.PI), gold);
    arch.position.set(0, 5.4, 0);
    arch.castShadow = true;
    gate.add(arch);
    // The rune ring (emissive; markGateOpen recolors it green).
    this.gateRing = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.14, 8, 48),
      new THREE.MeshStandardMaterial({ color: 0xb48aff, emissive: 0xb48aff, emissiveIntensity: 2.2, metalness: 0.6, roughness: 0.4 }));
    this.gateRing.position.set(0, 5.6, 0);
    gate.add(this.gateRing);
    // Base platform.
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.5, 5.5), stone);
    plinth.position.y = 0.25;
    plinth.receiveShadow = true;
    gate.add(plinth);

    this.world.add(gate);
    this.gate = gate;
    // Colliders for the two piers.
    this.cityBlocks.push({ x: px - 3.4, z: pz, r: 1.6 });
    this.cityBlocks.push({ x: px + 3.4, z: pz, r: 1.6 });
  }

  // ------------------------------------------------------------------
  // The ford: an animated water sheet that fills the carved valley, plus a
  // small plank bridge where the road crosses it. The waterline is derived
  // from the actual terrain minimum so it always reads as a riverbed.
  // ------------------------------------------------------------------
  _buildWater() {
    // Sample the valley band to find its true floor, then sit the water just
    // above the deepest point.
    let minH = Infinity;
    for (let x = -34; x <= 10; x += 2) {
      for (let z = -26; z <= 14; z += 2) {
        const h = this.heightAt(x, z);
        if (h < minH) minH = h;
      }
    }
    const waterY = clamp(minH + 0.55, -9, -3);
    this.WATER_Y = waterY;

    // Procedural ripple texture, scrolled in _updateWater.
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = '#12262e';
    x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 60; i++) {
      const yy = this.rng.range(0, 128);
      const amp = this.rng.range(1, 3), ph = this.rng.range(0, 6.28);
      x.strokeStyle = `rgba(127,216,207,${this.rng.range(0.05, 0.22)})`;
      x.lineWidth = this.rng.range(0.6, 1.6);
      x.beginPath();
      for (let px = 0; px <= 128; px += 4) {
        const y2 = yy + Math.sin(px * 0.09 + ph) * amp;
        if (px === 0) x.moveTo(px, y2); else x.lineTo(px, y2);
      }
      x.stroke();
    }
    const waterTex = new THREE.CanvasTexture(c);
    waterTex.colorSpace = THREE.SRGBColorSpace;
    waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping;
    waterTex.repeat.set(3, 3);

    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(64, 46),
      new THREE.MeshPhysicalMaterial({
        map: waterTex, color: 0x2a5a64,
        transparent: true, opacity: 0.82,
        roughness: 0.12, metalness: 0.05,
        emissive: 0x0e2a30, emissiveIntensity: 0.5,
      })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(-6, waterY, -6);
    water.receiveShadow = true;
    this.water = water;
    this._waterTex = waterTex;
    this.world.add(water);

    // A plank bridge where the road (clearing → gate) crosses the ford.
    const bridge = new THREE.Group();
    const bx = -8, bz = -5;
    const plankMat = new THREE.MeshStandardMaterial({ color: 0x4a3a28, roughness: 0.9 });
    for (let i = 0; i < 7; i++) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.14, 0.7), plankMat);
      plank.position.set(bx + (i - 3) * 0.85, waterY + 0.25, bz);
      plank.rotation.y = 0.32;
      bridge.add(plank);
    }
    for (const side of [-1.25, 1.25]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.5, 0.08), plankMat);
      rail.position.set(bx, waterY + 0.6, bz + side);
      rail.rotation.y = 0.32;
      bridge.add(rail);
    }
    this.world.add(bridge);
  }

  // ------------------------------------------------------------------
  // The Spire plaza: a stepped gilded dais, a low colonnade, and four
  // bronze guardian statues. Purely visual — it frames the Spire from the
  // player's low angle and from the cinematic top shots.
  // ------------------------------------------------------------------
  _buildPlaza() {
    const stone = new THREE.MeshStandardMaterial({ color: 0x3a4450, roughness: 0.9, metalness: 0.05 });
    const gold = new THREE.MeshPhysicalMaterial({ color: 0xc9a24b, metalness: 0.85, roughness: 0.35, emissive: 0x2a1e06, emissiveIntensity: 0.35 });
    const plaza = new THREE.Group();

    // Stepped dais (the clearing is already flat, so low steps only).
    const steps = [
      { r: 15.5, y: 0.22 },
      { r: 13.0, y: 0.62 },
      { r: 10.5, y: 1.0 },
    ];
    for (const s of steps) {
      const step = new THREE.Mesh(new THREE.CylinderGeometry(s.r, s.r + 0.3, 0.42, 48), stone);
      step.position.y = s.y - 0.2;
      step.receiveShadow = true;
      plaza.add(step);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(s.r - 0.15, 0.07, 6, 64), gold);
      rim.rotation.x = -Math.PI / 2;
      rim.position.y = s.y + 0.02;
      plaza.add(rim);
    }
    // Low colonnade ring.
    const colGeo = new THREE.CylinderGeometry(0.34, 0.42, 6.4, 12);
    const capGeo = new THREE.CylinderGeometry(0.62, 0.4, 0.5, 12);
    const COLS = 12;
    for (let i = 0; i < COLS; i++) {
      const a = (i / COLS) * Math.PI * 2;
      const x = Math.cos(a) * 14.2, z = Math.sin(a) * 14.2;
      const col = new THREE.Mesh(colGeo, stone);
      col.position.set(x, 1.0 + 3.2, z);
      col.castShadow = true;
      plaza.add(col);
      const cap = new THREE.Mesh(capGeo, gold);
      cap.position.set(x, 1.0 + 6.65, z);
      plaza.add(cap);
    }
    // Four bronze guardian statues at the diagonals.
    const bronze = new THREE.MeshStandardMaterial({ color: 0x6a7484, metalness: 0.8, roughness: 0.42 });
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i / 4) * Math.PI * 2;
      const x = Math.cos(a) * 11.8, z = Math.sin(a) * 11.8;
      const g = new THREE.Group();
      const robe = new THREE.Mesh(new THREE.ConeGeometry(0.8, 3.0, 10), bronze);
      robe.position.y = 1.5;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), bronze);
      head.position.y = 3.3;
      const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4.2, 6), bronze);
      staff.position.set(0.7, 2.1, 0);
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0xe8c979, emissive: 0xe8c979, emissiveIntensity: 1.6 }));
      orb.position.set(0.7, 4.3, 0);
      robe.castShadow = true;
      g.add(robe, head, staff, orb);
      g.position.set(x, 1.0, z);
      g.rotation.y = -a + Math.PI / 2;
      plaza.add(g);
    }
    this.world.add(plaza);
    this.plaza = plaza;
  }

  // ------------------------------------------------------------------
  // Orbiting rune shards: two counter-rotating rings of glowing octahedra
  // around the Spire — the "painted energy" that makes the Spire read as a
  // machine, not a dead tower.
  // ------------------------------------------------------------------
  _buildRuneShards() {
    const group = new THREE.Group();
    const makeRing = (count, radius, y, size, color, speed, dir) => {
      const geo = new THREE.OctahedronGeometry(size, 0);
      const mat = new THREE.MeshStandardMaterial({
        color, emissive: color, emissiveIntensity: 2.4, metalness: 0.5, roughness: 0.3,
      });
      const ring = new THREE.InstancedMesh(geo, mat, count);
      const M = new THREE.Matrix4(), P = new THREE.Vector3(), S = new THREE.Vector3(), Q = new THREE.Quaternion();
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        P.set(Math.cos(a) * radius, Math.sin(a * 3) * 0.6, Math.sin(a) * radius);
        Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
        S.set(1, 1.5, 1);
        M.compose(P, Q, S);
        ring.setMatrixAt(i, M);
      }
      ring.instanceMatrix.needsUpdate = true;
      ring.position.y = y;
      group.add(ring);
      return { ring, speed, dir, baseY: y };
    };
    // Three counter-rotating rings of glowing shards around the Spire body.
    this._shardRings = [
      makeRing(9, 8.5, 26, 0.55, 0xe8c979, 0.35, 1),
      makeRing(7, 10.5, 40, 0.7, 0x7fd8cf, 0.24, -1),
      makeRing(5, 6.8, 54, 0.45, 0xb48aff, 0.5, 1),
    ];
    this.runeGroup = group;
    this.world.add(group);
  }

  _updateShards(worldT) {
    if (!this._shardRings) return;
    for (const s of this._shardRings) {
      s.ring.rotation.y += s.speed * s.dir * 0.016; // ~fixed step; visual only
      // Bounded breathing offset (baseY + sine), never drifts.
      s.ring.position.y = s.baseY + Math.sin(worldT * 0.5 + s.speed * 9) * 0.5;
    }
  }

  _buildLandmarks() {
    // The Spire — the anchor landmark, always on the horizon.
    const spire = new THREE.Group();
    const gold = new THREE.MeshPhysicalMaterial({ color: 0xc9a24b, metalness: 0.85, roughness: 0.35, emissive: 0x2a1e06, emissiveIntensity: 0.4 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 6, 62, 24, 1, true), gold);
    body.position.y = 31;
    body.castShadow = true;
    spire.add(body);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(2.4, 6, 24), gold);
    cap.position.y = 65;
    spire.add(cap);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.4, 18, 14),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xb48aff, emissiveIntensity: 3.2 }));
    beacon.position.y = 69;
    this.beacon = beacon;
    spire.add(beacon);
    for (let i = 0; i < 6; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(5.4 - i * 0.5, 0.12, 8, 60),
        new THREE.MeshStandardMaterial({ color: 0xe8c979, emissive: 0xe8c979, emissiveIntensity: 1.6, metalness: 0.8, roughness: 0.4 }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 8 + i * 9;
      spire.add(ring);
    }
    this.world.add(spire);
    this.spire = spire;

    // A few distant ruined columns (the city's edge) to give scale + orientation.
    const colGeo = new THREE.CylinderGeometry(1.1, 1.3, 12, 14);
    const colMat = new THREE.MeshStandardMaterial({ color: 0x2a3a44, roughness: 0.85, metalness: 0.05 });
    const capMat = new THREE.MeshStandardMaterial({ color: 0x9fb4c4, roughness: 0.6 });
    const COLS = 40;
    this.columns = new THREE.InstancedMesh(colGeo, colMat, COLS);
    const caps = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.5, 1.2, 0.8, 14), capMat, COLS);
    const M = new THREE.Matrix4(), P = new THREE.Vector3(), S = new THREE.Vector3(1, 1, 1), Q = new THREE.Quaternion();
    let ci = 0;
    for (let i = 0; i < COLS && ci < COLS; i++) {
      const ang = this.rng.range(0, Math.PI * 2);
      const rad = this.rng.range(34, 90);
      const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
      const h = this.heightAt(x, z);
      const s = this.rng.range(0.8, 1.6);
      P.set(x, h + 6 * s, z); S.set(s, s, s);
      M.compose(P, Q, S);
      this.columns.setMatrixAt(ci, M);
      P.y = h + 12 * s; caps.setMatrixAt(ci, M);
      ci++;
    }
    this.columns.count = ci; caps.count = ci;
    this.columns.castShadow = true;
    this.world.add(this.columns, caps);
    this._caps = caps;
  }

  _poiPos(poi) {
    if (!poi) return null;
    return new THREE.Vector3(poi.pos[0], this.heightAt(poi.pos[0], poi.pos[2]), poi.pos[2]);
  }
  _firstMemoryPoi() { return this.pois.find((p) => p.kind === 'memory'); }

  _buildPOIMarkers() {
    this.poiMeshes = new Map();
    const markerGeo = new THREE.OctahedronGeometry(0.7, 0);
    for (const poi of this.pois) {
      if (poi.kind === 'secret') continue; // secrets stay hidden until found
      const mat = new THREE.MeshStandardMaterial({
        color: poi.kind === 'memory' ? 0xe8c979 : poi.kind === 'camp' ? 0x7fd8cf : poi.kind === 'ambush' ? 0xff8a4a : 0xb48aff,
        emissive: poi.kind === 'memory' ? 0xe8c979 : poi.kind === 'camp' ? 0x7fd8cf : poi.kind === 'ambush' ? 0xff8a4a : 0xb48aff,
        emissiveIntensity: 1.4, metalness: 0.6, roughness: 0.35,
      });
      const m = new THREE.Mesh(markerGeo, mat);
      const base = this._poiPos(poi);
      m.position.set(base.x, base.y + 3.2, base.z);
      m.userData = { poi, baseY: base.y + 3.2, phase: this.rng.range(0, 6.28) };
      this.world.add(m);
      this.poiMeshes.set(poi.id, m);
    }
  }

  _buildPlayer() {
    const p = this.characters.mae || { color: '#3f8f83', accent: '#7fd8cf' };
    this.player = new THREE.Group();
    const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.6, 12),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(p.color), roughness: 0.8, metalness: 0.05 }));
    cloak.position.y = 0.8;
    cloak.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 12),
      new THREE.MeshStandardMaterial({ color: 0xe9c9a5, roughness: 0.7 }));
    head.position.y = 1.85;
    head.castShadow = true;
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.09, 8, 18),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(p.accent), roughness: 0.6, emissive: new THREE.Color(p.accent), emissiveIntensity: 0.25 }));
    scarf.position.y = 1.5;
    scarf.rotation.x = Math.PI / 2;
    // soft contact shadow blob
    const blob = new THREE.Mesh(new THREE.CircleGeometry(0.7, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.03;
    this.player.add(cloak, head, scarf, blob);
    this._blob = blob;
    this.world.add(this.player);
  }

  // ------------------------------------------------------------------
  // Atmosphere per area (fog + exposure + sun + sky)
  // ------------------------------------------------------------------
  setAtmosphere(areaId) {
    const area = this.areas.find((a) => a.id === areaId) || this.areas[0];
    if (!area) return;
    this.scene.fog = new THREE.FogExp2(area.palette.fog, 0.014);
    const sun = this.sun;
    if (sun) { sun.color.setHex(area.palette.light); sun.intensity = area.id === 'spire' ? 1.7 : 2.3; }
    if (this.hemi) { this.hemi.color.setHex(area.palette.skyTop); }
    const exposure = area.id === 'spire' ? 1.0 : area.id === 'dusk_city' ? 1.18 : 1.08;
    if (this.renderer && this.renderer.toneMappingExposure !== undefined) this.renderer.toneMappingExposure = exposure;
    // rebuild sky gradient for the area
    if (this._skyTex) {
      const g = this._skyTex.image.getContext('2d');
      const grad = g.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, '#' + area.palette.skyTop.toString(16).padStart(6, '0'));
      grad.addColorStop(0.6, '#' + area.palette.skyBot.toString(16).padStart(6, '0'));
      grad.addColorStop(1, '#' + area.palette.fog.toString(16).padStart(6, '0'));
      g.fillStyle = grad;
      g.fillRect(0, 0, 4, 256);
      this._skyTex.needsUpdate = true;
    }
    this.currentArea = area;
  }

  // ------------------------------------------------------------------
  // Objective + POI state
  // ------------------------------------------------------------------
  setObjective(poiId) {
    this.objectiveId = poiId;
    for (const [id, m] of this.poiMeshes) {
      const isObj = id === poiId;
      m.scale.setScalar(isObj ? 1.6 : 1.0);
      m.material.emissiveIntensity = isObj ? 2.6 : 1.2;
    }
  }

  markCollected(poiId) {
    this.collected.add(poiId);
    const m = this.poiMeshes.get(poiId);
    if (m) m.visible = false;
  }
  markGateOpen(gateId) {
    this.openedGates.add(gateId);
    const m = this.poiMeshes.get(gateId);
    if (m) { m.material.emissive.setHex(0x8fe3a8); m.material.color.setHex(0x8fe3a8); }
  }

  // ------------------------------------------------------------------
  // Life cycle
  // ------------------------------------------------------------------
  start() {
    this.active = true;
    this.world.visible = true;
  }
  stop() {
    this.active = false;
  }
  setVisible(v) { this.world.visible = v; }

  // Teleport the player (used to bring the party to a story location, e.g.
  // the Spire base for the final choice). Snaps to the true ground height.
  movePlayerTo(x, z) {
    const p = this.player;
    p.position.x = x;
    p.position.z = z;
    p.position.y = this.heightAt(x, z) + 1.4;
    this._velY = 0;
    this._onGround = true;
  }

  _bindMouse() {
    this._onDown = (e) => { this._dragging = true; this._lastX = e.clientX; this._lastY = e.clientY; };
    this._onUp = () => { this._dragging = false; };
    this._onMove = (e) => {
      if (!this._dragging || !this.active) return;
      const dx = e.clientX - this._lastX, dy = e.clientY - this._lastY;
      this._lastX = e.clientX; this._lastY = e.clientY;
      this.yaw -= dx * 0.005;
      this.pitch = clamp(this.pitch - dy * 0.004, -0.5, 0.55);
    };
    window.addEventListener('mousedown', this._onDown);
    window.addEventListener('mouseup', this._onUp);
    window.addEventListener('mousemove', this._onMove);
  }

  dispose() {
    if (this._onDown) window.removeEventListener('mousedown', this._onDown);
    if (this._onUp) window.removeEventListener('mouseup', this._onUp);
    if (this._onMove) window.removeEventListener('mousemove', this._onMove);
  }

  // ------------------------------------------------------------------
  // Per-frame. `update` (full: player+camera+POIs) runs only while active;
  // `renderAmbient` (markers+motes+beacon) runs whenever the world is
  // visible so the intro cinematic and ending can animate it while the
  // Director owns the camera.
  // ------------------------------------------------------------------
  update(dt, worldT) {
    if (!this.active) return;
    this._updatePlayer(dt);
    this._updateCamera(dt, worldT);
    this._updateMarkers(dt, worldT);
    this._updatePOIProximity(dt, worldT);
  }

  renderAmbient(dt, worldT) {
    if (!this.world.visible) return;
    this._updateMarkers(dt, worldT);
    this._driftMotes(dt);
    this._updateShards(worldT);
    this._updateWater(worldT);
    this._updateClouds(dt);
  }

  _driftMotes(dt) {
    if (!this.motes) return;
    const a = this.motes.geometry.attributes.position;
    const arr = a.array;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i] += Math.sin(i * 0.7) * dt * 0.15;
      arr[i + 1] += dt * 0.12;
      if (arr[i + 1] > 24) arr[i + 1] = 0.5;
    }
    a.needsUpdate = true;
  }

  _updatePlayer(dt) {
    const p = this.player;
    const fwd = (this.input.down('up') ? 1 : 0) - (this.input.down('down') ? 1 : 0);
    const strafe = (this.input.down('right') ? 1 : 0) - (this.input.down('left') ? 1 : 0);
    const speed = 9.5;
    // Movement relative to camera yaw (ignore pitch for ground move)
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let mx = (sin * -fwd + cos * strafe);
    let mz = (cos * -fwd + -sin * strafe);
    const len = Math.hypot(mx, mz);
    if (len > 0.001) { mx = (mx / len) * speed; mz = (mz / len) * speed; }
    let nx = p.position.x + mx * dt;
    let nz = p.position.z + mz * dt;
    const limit = SIZE / 2 - 4;
    nx = clamp(nx, -limit, limit);
    nz = clamp(nz, -limit, limit);
    // Circular colliders: city blocks + gate piers. Slide along the closest
    // axis rather than fully stopping so the streets feel walkable.
    if (this.cityBlocks) {
      for (const b of this.cityBlocks) {
        const dx = nx - b.x, dz = nz - b.z;
        const d = Math.hypot(dx, dz);
        if (d < b.r && d > 0.0001) {
          const push = (b.r - d);
          if (Math.abs(dx) > Math.abs(dz)) nx += (dx / d) * push; else nz += (dz / d) * push;
        }
      }
    }
    p.position.x = nx;
    p.position.z = nz;
    const groundY = this.heightAt(p.position.x, p.position.z);
    // Wading: in the ford the water resists movement.
    if (this.WATER_Y !== undefined && groundY < this.WATER_Y + 0.15 && len > 0.001) {
      const wet = clamp(1 - (this.WATER_Y + 0.15 - groundY) * 0.55, 0.35, 1);
      p.position.x -= mx * dt * (1 - wet);
      p.position.z -= mz * dt * (1 - wet);
    }

    // Jump (space / parry key reused for the overworld)
    if (this.input.pressed('parry') && this._onGround) { this._velY = 6.5; this._onGround = false; }
    this._velY -= 16 * dt;
    p.position.y += this._velY * dt;
    const surfaceY = groundY + 1.4;
    if (p.position.y <= surfaceY) { p.position.y = surfaceY; this._velY = 0; this._onGround = true; }
    else this._onGround = false;

    // Face movement direction (only when moving + grounded)
    if (len > 0.001 && this._onGround) {
      const targetRot = Math.atan2(mx, mz);
      p.rotation.y = damp(p.rotation.y, targetRot, 12, dt);
    }
    // Contact shadow follows the true ground even mid-air
    this._blob.position.y = (groundY - p.position.y + 1.4) + 0.03;
    this._blob.scale.setScalar(clamp(1.4 - (p.position.y - surfaceY) * 0.12, 0.5, 1.4));
  }

  _updateCamera(dt, worldT) {
    const p = this.player;
    const dist = 7.2;
    const px = p.position.x + Math.sin(this.yaw) * Math.cos(this.pitch) * dist;
    const py = p.position.y + 1.6 + Math.sin(-this.pitch) * dist;
    const pz = p.position.z + Math.cos(this.yaw) * Math.cos(this.pitch) * dist;
    // Don't let the camera clip under the terrain
    const minY = this.heightAt(px, pz) + 0.6;
    const targetY = Math.max(py, minY);
    const L = 8;
    this.camera.position.x = damp(this.camera.position.x, px, L, dt);
    this.camera.position.y = damp(this.camera.position.y, targetY, L, dt);
    this.camera.position.z = damp(this.camera.position.z, pz, L, dt);
    this.camera.lookAt(p.position.x, p.position.y + 1.2, p.position.z);
  }

  _updateMarkers(dt, worldT) {
    // Bob + spin the markers; pulse the objective.
    for (const [, m] of this.poiMeshes) {
      if (!m.visible) continue;
      const u = m.userData;
      m.rotation.y += dt * 1.4;
      m.position.y = u.baseY + Math.sin(worldT * 1.8 + u.phase) * 0.28;
      const obj = u.poi.id === this.objectiveId;
      m.scale.setScalar((obj ? 1.6 : 1.0) * (1 + Math.sin(worldT * 3 + u.phase) * 0.06));
    }
    // Beacon pulse on the Spire
    if (this.beacon) this.beacon.material.emissiveIntensity = 2.6 + Math.sin(worldT * 2.2) * 0.8;
    // The gate's rune ring slowly spins (and shimmers brighter if unopened).
    if (this.gateRing) {
      this.gateRing.rotation.z += dt * 0.6;
      this.gateRing.material.emissiveIntensity = (this.openedGates.has('gate') ? 1.6 : 2.2) + Math.sin(worldT * 1.6) * 0.5;
    }
  }

  _updatePOIProximity(dt, worldT) {
    // Proximity: highlight nearest POI + allow interaction on 'confirm'
    this._nearestPoi = null;
    let best = 3.6;
    for (const poi of this.pois) {
      if (poi.kind === 'secret') {
        if (!this.collected.has(poi.id) && this._distTo(poi) < 2.2) {
          this.cb.onSecret(poi); this.collected.add(poi.id);
        }
        continue;
      }
      // Cleared POIs don't re-trigger. Camps are deliberately reusable
      // (rest points), so they stay interactable even after being visited.
      if (this.collected.has(poi.id) && (poi.kind === 'memory' || poi.kind === 'ambush')) continue;
      if (this.openedGates.has(poi.id) && poi.kind === 'gate') continue;
      const d = this._distTo(poi);
      if (d < best) { best = d; this._nearestPoi = poi; }
    }
    if (this._nearestPoi && this.input.pressed('confirm')) this._notifyPoi(this._nearestPoi);
    this._pendingInteract = this._nearestPoi; // game.js can read for a hint
  }

  _distTo(poi) {
    const p = this.player.position;
    return Math.hypot(p.x - poi.pos[0], p.z - poi.pos[2]);
  }

  _notifyPoi(poi) {
    switch (poi.kind) {
      case 'memory': this.collected.add(poi.id); this.cb.onMemory(poi); break;
      case 'ambush': this.cb.onEncounter(poi); break;
      case 'gate': this.cb.onEncounter(poi); break;
      case 'boss': this.cb.onEncounter(poi); break;
      case 'camp': this.cb.onCamp(poi); break;
      case 'secret': this.cb.onSecret(poi); break;
      default: break;
    }
  }
}

export default Overworld;
