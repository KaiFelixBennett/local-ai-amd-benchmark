/**
 * Asset loading for the overworld.
 *
 * Loads the real downloaded assets under /assets: an HDRI (via RGBELoader,
 * converted to a prefiltered environment map with PMREMGenerator), Poly Haven
 * PBR texture sets, and glTF props.
 *
 * Every load is reported through an `onProgress` callback so the boot screen
 * can show real progress, and a failure of any single asset is contained: the
 * area falls back to a procedural substitute rather than refusing to start.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { decimateGeometry, triangleCount } from './decimate.js';

/** Poly Haven ships AO/Roughness/Metalness packed into one "arm" image. */
const TEXTURE_SETS = {
  cobble: 'assets/textures/cobblestone_floor_08',
  blocks: 'assets/textures/medieval_blocks_05',
  ground: 'assets/textures/forest_ground_04',
  rock: 'assets/textures/rock_wall_09',
};

const MODELS = {
  streetLamp: 'assets/models/street_lamp_01/street_lamp_01_1k.gltf',
  ironGate: 'assets/models/large_iron_gate/large_iron_gate_1k.gltf',
  chandelier: 'assets/models/Chandelier_01/Chandelier_01_1k.gltf',
  whaleStatue: 'assets/models/bronze_whale_statue/bronze_whale_statue_1k.gltf',
  deadTree: 'assets/models/dead_tree_trunk_02/dead_tree_trunk_02_1k.gltf',
  stump: 'assets/models/tree_stump_01/tree_stump_01_1k.gltf',
  boulderA: 'assets/models/namaqualand_boulder_02/namaqualand_boulder_02_1k.gltf',
  boulderB: 'assets/models/namaqualand_boulder_03/namaqualand_boulder_03_1k.gltf',
  table: 'assets/models/wooden_picnic_table/wooden_picnic_table_1k.gltf',
  firePit: 'assets/models/stone_fire_pit/stone_fire_pit_1k.gltf',
};

const HDRI = 'assets/hdri/table_mountain_2_puresky_4k.hdr';

/** Mixamo rigs from the three.js examples; all share one skeleton. */
const CHARACTERS = {
  soldier: 'assets/characters/Soldier.glb',
  michelle: 'assets/characters/Michelle.glb',
  xbot: 'assets/characters/Xbot.glb',
};

export class AssetManager {
  constructor(renderer) {
    this.renderer = renderer;
    this.gltfLoader = new GLTFLoader();
    this.rgbeLoader = new RGBELoader();
    this.texLoader = new THREE.TextureLoader();

    this.textures = new Map();   // key -> { map, normalMap, armMap }
    this.models = new Map();     // key -> THREE.Group (template, cloned per use)
    this.characters = new Map(); // key -> { scene, animations }
    this.environment = null;     // PMREM render target texture
    this.skyTexture = null;      // equirect for scene.background
    this.failures = [];
    this.loaded = 0;
    this.total = 0;
    this.budget = [];   // decimation log, surfaced for the triangle budget
  }

  _tick(onProgress, label) {
    this.loaded++;
    if (onProgress) onProgress(Math.min(1, this.loaded / Math.max(1, this.total)), label);
  }

  /**
   * @param {(frac:number, label:string)=>void} onProgress
   * @returns {Promise<{failures:string[]}>} resolves even when assets are missing
   */
  async loadAll(onProgress) {
    const texKeys = Object.keys(TEXTURE_SETS);
    const modelKeys = Object.keys(MODELS);
    const charKeys = Object.keys(CHARACTERS);
    this.total = 1 + texKeys.length + modelKeys.length + charKeys.length;
    this.loaded = 0;

    await this._loadEnvironment(onProgress);
    await Promise.all(texKeys.map((k) => this._loadTextureSet(k, TEXTURE_SETS[k], onProgress)));
    // Models are loaded sequentially: ten parallel glTF parses on the main
    // thread stalls the boot screen's own animation.
    for (const k of modelKeys) await this._loadModel(k, MODELS[k], onProgress);
    for (const k of charKeys) await this._loadCharacter(k, CHARACTERS[k], onProgress);

    return { failures: this.failures };
  }

  async _loadEnvironment(onProgress) {
    try {
      const hdr = await this.rgbeLoader.loadAsync(HDRI);
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      pmrem.compileEquirectangularShader();
      this.environment = pmrem.fromEquirectangular(hdr).texture;
      pmrem.dispose();
      this.skyTexture = hdr;
    } catch (err) {
      this.failures.push(`HDRI ${HDRI}: ${err.message || err}`);
      console.warn('[assets] HDRI failed, falling back to gradient sky:', err);
    }
    this._tick(onProgress, 'environment');
  }

  async _loadTextureSet(key, base, onProgress) {
    try {
      const [map, normalMap, armMap] = await Promise.all([
        this.texLoader.loadAsync(`${base}/diff.jpg`),
        this.texLoader.loadAsync(`${base}/nor.jpg`),
        this.texLoader.loadAsync(`${base}/arm.jpg`),
      ]);
      map.colorSpace = THREE.SRGBColorSpace;
      // Ask the GPU for its real limit instead of assuming 8. Ground planes are
      // seen almost edge-on for most of a walk, which is exactly the case
      // where anisotropic filtering is the difference between visible surface
      // detail and a smeared grey band.
      const aniso = this.renderer.capabilities.getMaxAnisotropy();
      for (const t of [map, normalMap, armMap]) {
        t.wrapS = THREE.RepeatWrapping;
        t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = aniso;
      }
      this.textures.set(key, { map, normalMap, armMap });
    } catch (err) {
      this.failures.push(`texture ${key}: ${err.message || err}`);
      console.warn(`[assets] texture set "${key}" failed:`, err);
    }
    this._tick(onProgress, key);
  }

  async _loadModel(key, url, onProgress) {
    try {
      const gltf = await this.gltfLoader.loadAsync(url);
      const root = gltf.scene;
      root.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true;
        o.receiveShadow = true;
        if (o.material) o.material.envMapIntensity = 1.0;
      });
      this.models.set(key, { scene: root, animations: gltf.animations || [] });
    } catch (err) {
      this.failures.push(`model ${key}: ${err.message || err}`);
      console.warn(`[assets] model "${key}" failed:`, err);
    }
    this._tick(onProgress, key);
  }

  async _loadCharacter(key, url, onProgress) {
    try {
      const gltf = await this.gltfLoader.loadAsync(url);
      this.characters.set(key, { scene: gltf.scene, animations: gltf.animations || [] });
    } catch (err) {
      this.failures.push(`character ${key}: ${err.message || err}`);
      console.warn(`[assets] character "${key}" failed:`, err);
    }
    this._tick(onProgress, key);
  }

  /** @returns {{scene:THREE.Object3D, animations:THREE.AnimationClip[]}|null} */
  character(key) {
    return this.characters.get(key) || null;
  }

  // -------------------------------------------------------------------------
  // Accessors
  // -------------------------------------------------------------------------

  /**
   * A PBR material from a loaded Poly Haven texture set.
   * The ARM map feeds aoMap/roughnessMap/metalnessMap at once — three.js reads
   * R, G and B from those slots respectively, which is exactly how the map is
   * packed.
   */
  material(key, { repeat = 1, color = 0xffffff, roughness = 1, metalness = 1, extra = {} } = {}) {
    const set = this.textures.get(key);
    if (!set) {
      return new THREE.MeshStandardMaterial({ color: 0x6b6f63, roughness: 0.9, metalness: 0.05, ...extra });
    }
    const clone = (t) => {
      const c = t.clone();
      c.needsUpdate = true;
      c.wrapS = THREE.RepeatWrapping;
      c.wrapT = THREE.RepeatWrapping;
      c.repeat.set(repeat, repeat);
      return c;
    };
    const map = clone(set.map);
    map.colorSpace = THREE.SRGBColorSpace;
    const arm = clone(set.armMap);
    return new THREE.MeshStandardMaterial({
      map,
      normalMap: clone(set.normalMap),
      aoMap: arm,
      roughnessMap: arm,
      metalnessMap: arm,
      roughness,
      metalness,
      color: new THREE.Color(color),
      ...extra,
    });
  }

  /** A fresh clone of a loaded model, or null when that asset failed. */
  model(key) {
    const entry = this.models.get(key);
    if (!entry) return null;
    return entry.scene.clone(true);
  }

  /**
   * Scale a model so its tallest axis measures `metres`.
   *
   * Downloaded assets do not agree on units — Chandelier_01 is authored in
   * centimetres (81 units tall), the boulders in metres. Multiplying by a
   * guessed factor produced a 178-metre chandelier standing over the plaza.
   * Every hero prop is therefore fitted to an explicit real-world size instead.
   *
   * @param {THREE.Object3D} node
   * @param {number} metres target height
   * @param {'height'|'width'} axis which dimension to fit
   * @returns {THREE.Object3D} the same node, scaled
   */
  static fitTo(node, metres, axis = 'height') {
    if (!node) return node;
    const box = AssetManager.measure(node);
    const size = new THREE.Vector3();
    box.getSize(size);
    const current = axis === 'width' ? Math.max(size.x, size.z) : size.y;
    if (!(current > 1e-6)) return node;
    node.scale.multiplyScalar(metres / current);
    return node;
  }

  /** Vertical offset needed to sit the model on the ground. */
  static groundOffset(node) {
    return -AssetManager.measure(node).min.y;
  }

  /**
   * World bounding box of a model.
   *
   * Only rigid props are measured this way. Skinned characters deliberately are
   * not used as static scenery: a SkinnedMesh's bounds come from live bone
   * matrices that only exist during a render, so measuring one at load time
   * returns garbage — an attempt to place the downloaded rigged character as a
   * statue scaled it 5x into a building before this was cut.
   */
  static measure(node) {
    node.updateWorldMatrix(true, true);
    return new THREE.Box3().setFromObject(node);
  }

  has(key) {
    return this.models.has(key);
  }

  /**
   * Extract the single largest mesh of a model as {geometry, material}, ready
   * for an InstancedMesh.
   *
   * These are photogrammetry scans — a boulder is ~98k triangles, which is
   * indefensible multiplied by forty instances. `gridSize` decimates it down;
   * the normal map keeps the surface detail that the geometry loses.
   *
   * @param {string} key
   * @param {number|null} gridSize null to keep full detail
   */
  instanceSource(key, gridSize = 22) {
    const entry = this.models.get(key);
    if (!entry) return null;
    let best = null;
    entry.scene.updateWorldMatrix(true, true);
    entry.scene.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      const count = o.geometry.attributes.position ? o.geometry.attributes.position.count : 0;
      if (!best || count > best.count) best = { mesh: o, count };
    });
    if (!best) return null;

    let geometry = best.mesh.geometry.clone();
    // Bake the mesh's own transform so instances only carry placement.
    geometry.applyMatrix4(best.mesh.matrixWorld);
    const before = triangleCount(geometry);
    if (gridSize) {
      geometry = decimateGeometry(geometry, gridSize);
      this.budget.push({ key, before, after: triangleCount(geometry) });
    }
    if (geometry.attributes.uv && !geometry.attributes.uv1) {
      geometry.setAttribute('uv1', geometry.attributes.uv);
    }
    return { geometry, material: best.mesh.material };
  }

  /** Decimate every mesh inside a cloned prop in place. */
  decimateClone(node, gridSize) {
    node.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      const before = triangleCount(o.geometry);
      o.geometry = decimateGeometry(o.geometry, gridSize);
      this.budget.push({ key: node.name || 'clone', before, after: triangleCount(o.geometry) });
    });
    return node;
  }
}
