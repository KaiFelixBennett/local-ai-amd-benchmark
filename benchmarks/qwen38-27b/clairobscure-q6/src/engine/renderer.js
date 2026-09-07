/**
 * engine/renderer.js — WebGL renderer, scene, lights, fog, and the physical
 * battle stage (floor, gilded arch backdrop, columns). All geometry is
 * procedural primitives; all surface art comes from engine/textures.js.
 *
 * Camera framing/cuts are owned by fx/camera.js (CameraRig) — this module
 * only creates the camera and exposes the scene graph.
 *
 * Handles: resize, WebGL context loss (visible overlay via callback), and
 * battle-intensity lighting shifts (warm key dims as the fight heats; a
 * cold rim flash fires on perfect parries).
 */
import * as THREE from 'three';
import {
  PALETTE,
  makeStageFloorTexture,
  makeBackdropTexture,
  makeGoldTexture,
  makeClothTexture,
} from './textures.js';

export class Renderer {
  /**
   * @param {HTMLElement} dom canvas mount
   * @param {{onContextLost?: Function, onContextRestored?: Function}} hooks
   */
  constructor(dom, hooks = {}) {
    this.dom = dom;
    this.hooks = hooks;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x0d1a22, 0.028);

    // far=600: the overworld's sky dome (r=240) and the mountain ring
    // (r~190-220) must be inside the frustum or the horizon vanishes and
    // every scene reads as "an empty field with a tower in it".
    this.camera = new THREE.PerspectiveCamera(
      38,
      window.innerWidth / Math.max(1, window.innerHeight),
      0.1,
      600
    );
    this.camera.position.set(0, 3.2, 12);

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch (err) {
      throw new Error('WebGL is not available in this browser: ' + err.message);
    }
    this.renderer = renderer;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    dom.appendChild(renderer.domElement);

    this._buildLights();
    this._buildStage();
    this._buildEnvironment();

    // Context loss/restore -> visible message, no crash.
    this._onLost = (e) => {
      e.preventDefault();
      this._contextLost = true;
      if (this.hooks.onContextLost) this.hooks.onContextLost();
    };
    this._onRestored = () => {
      this._contextLost = false;
      if (this.hooks.onContextRestored) this.hooks.onContextRestored();
    };
    renderer.domElement.addEventListener('webglcontextlost', this._onLost);
    renderer.domElement.addEventListener('webglcontextrestored', this._onRestored);

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);

    this._flash = 0;
  }

  _buildLights() {
    // Warm key: main shadow caster, from upper-left of the party.
    this.keyLight = new THREE.DirectionalLight(0xffd9a0, 2.6);
    this.keyLight.position.set(-6, 9, 6);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    this.keyLight.shadow.camera.left = -12;
    this.keyLight.shadow.camera.right = 12;
    this.keyLight.shadow.camera.top = 10;
    this.keyLight.shadow.camera.bottom = -10;
    this.keyLight.shadow.camera.near = 1;
    this.keyLight.shadow.camera.far = 40;
    this.keyLight.shadow.bias = -0.0004;
    this.scene.add(this.keyLight);

    // Cool fill: keeps shadows from going black.
    this.fillLight = new THREE.DirectionalLight(0x6f9fb8, 0.7);
    this.fillLight.position.set(7, 5, 3);
    this.scene.add(this.fillLight);

    // Rim / back light: separates silhouettes from the backdrop.
    this.rimLight = new THREE.DirectionalLight(0x9fd8cf, 0.9);
    this.rimLight.position.set(2, 6, -9);
    this.scene.add(this.rimLight);

    // Ambient wash from the "moon".
    this.hemi = new THREE.HemisphereLight(0x8fb4c4, 0x1c2a26, 0.55);
    this.scene.add(this.hemi);

    // Parry flash: cold point light at stage center, fired on demand.
    this.flashLight = new THREE.PointLight(0xbfefff, 0, 24, 2);
    this.flashLight.position.set(0, 2.2, 0);
    this.scene.add(this.flashLight);
  }

  _buildStage() {
    const stage = new THREE.Group();
    stage.name = 'stage';

    // Floor
    const floorTex = makeStageFloorTexture();
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(11, 64),
      new THREE.MeshPhysicalMaterial({
        map: floorTex,
        roughness: 0.55,
        metalness: 0.12,
        clearcoat: 0.35,
        clearcoatRoughness: 0.5,
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    stage.add(floor);

    // Subtle raised dais rings (torus) at party & enemy sides
    const goldTex = makeGoldTexture(11);
    const ringMat = new THREE.MeshPhysicalMaterial({
      map: goldTex,
      color: 0xc9a24b,
      metalness: 0.9,
      roughness: 0.35,
    });
    for (const z of [4.2, -4.2]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.07, 10, 90), ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(0, 0.02, z);
      ring.receiveShadow = true;
      stage.add(ring);
    }

    // Backdrop: tall painted plane behind the enemies
    const backTex = makeBackdropTexture();
    const backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(34, 18),
      new THREE.MeshBasicMaterial({ map: backTex, fog: true })
    );
    backdrop.position.set(0, 7.4, -11);
    stage.add(backdrop);

    // Side columns with gilded capitals
    const colMat = new THREE.MeshPhysicalMaterial({
      color: 0x274a48,
      roughness: 0.7,
      metalness: 0.05,
      map: makeClothTexture(PALETTE.tealDeep, 41),
    });
    const capMat = new THREE.MeshPhysicalMaterial({
      map: goldTex,
      color: 0xd8b45e,
      metalness: 0.92,
      roughness: 0.3,
    });
    for (const x of [-8.5, 8.5]) {
      for (const z of [-10, -6.5]) {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 11, 18), colMat);
        col.position.set(x, 5.5, z);
        col.castShadow = true;
        stage.add(col);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.5, 0.7, 18), capMat);
        cap.position.set(x, 11.1, z);
        cap.castShadow = true;
        stage.add(cap);
      }
    }
    // Gilded lintel beam across the back
    const beam = new THREE.Mesh(new THREE.BoxGeometry(17.6, 0.5, 0.6), capMat);
    beam.position.set(0, 11.3, -8.25);
    stage.add(beam);

    this.scene.add(stage);
    this.stage = stage;
  }

  // Show/hide the battle set (floor, backdrop wall, columns, lintel) and
  // the battle-only lights. The overworld must NOT see the painted stage
  // wall floating behind the Spire — that was the "weird tower + empty
  // field" look. The overworld brings its own sun + hemi inside
  // overworld.world; hiding the battle lights prevents double-lighting.
  setStageVisible(v) {
    this.stage.visible = !!v;
    this.keyLight.visible = !!v;
    this.fillLight.visible = !!v;
    this.rimLight.visible = !!v;
    this.hemi.visible = !!v;
  }

  // Image-based lighting: a tiny procedural "dusk sky + sun" scene rendered
  // into a PMREM cubemap and assigned to scene.environment. Every PBR
  // material in the shared scene (gold spire, gilded trim, clearcoat floor,
  // armor) then picks up real sky reflections instead of a flat hemisphere
  // fill — a large part of the "real graphics" look, zero asset cost.
  // HDR panel colors (values > 1) give metals their bright speculars.
  // Failure is non-fatal: the verified direct lighting stands on its own.
  _buildEnvironment() {
    try {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      pmrem.compileEquirectangularShader();

      const env = new THREE.Scene();
      // Gradient sky: deep dusk blue above, warm band at the horizon.
      const c = document.createElement('canvas');
      c.width = 4; c.height = 256;
      const ctx = c.getContext('2d');
      const g = ctx.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, '#232c46');
      g.addColorStop(0.5, '#3c4a5e');
      g.addColorStop(0.72, '#7a6a58');
      g.addColorStop(1, '#1a222e');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 4, 256);
      const skyTex = new THREE.CanvasTexture(c);
      skyTex.colorSpace = THREE.SRGBColorSpace;
      const sky = new THREE.Mesh(
        new THREE.SphereGeometry(50, 16, 12),
        new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide })
      );
      env.add(sky);
      // Warm "sun" panel — the main highlight source for metals.
      const sunPanel = new THREE.Mesh(
        new THREE.PlaneGeometry(14, 10),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc87a).multiplyScalar(4) })
      );
      sunPanel.position.set(18, 26, 12);
      sunPanel.lookAt(0, 0, 0);
      env.add(sunPanel);
      // Cool fill panel (sky bounce) on the opposite side.
      const fillPanel = new THREE.Mesh(
        new THREE.PlaneGeometry(20, 14),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(0x4a7a8c).multiplyScalar(1.2) })
      );
      fillPanel.position.set(-22, 10, -18);
      fillPanel.lookAt(0, 0, 0);
      env.add(fillPanel);
      // A faint gilded rim from behind (matches the battle rim light).
      const rimPanel = new THREE.Mesh(
        new THREE.PlaneGeometry(16, 6),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(0xbfe8de).multiplyScalar(2) })
      );
      rimPanel.position.set(0, 14, -30);
      rimPanel.lookAt(0, 0, 0);
      env.add(rimPanel);

      const rt = pmrem.fromScene(env, 0.04);
      this.scene.environment = rt.texture;
      this._envRT = rt;
      pmrem.dispose();
      // Free the scratch scene.
      env.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (o.material.map) o.material.map.dispose();
          o.material.dispose();
        }
      });
    } catch (err) {
      console.warn('IBL environment unavailable:', err && err.message);
    }
  }

  resize() {
    const w = window.innerWidth;
    const h = Math.max(1, window.innerHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.hooks.onResize) this.hooks.onResize(w, h, this.renderer.getPixelRatio());
  }

  /**
   * Battle intensity 0..1 (1 = desperate, party near death): the key light
   * dims and cools toward amber, fog thickens slightly.
   */
  setIntensity(v) {
    const t = Math.min(1, Math.max(0, v));
    this.keyLight.intensity = 2.6 - t * 0.9;
    this.keyLight.color.setHSL(0.08 - t * 0.03, 0.55, 0.72 - t * 0.12);
    this.hemi.intensity = 0.55 - t * 0.2;
    this.scene.fog.density = 0.028 + t * 0.012;
  }

  /** Cold parry flash, strength 0..1 (decays in update). */
  flash(strength = 1) {
    this._flash = Math.max(this._flash, strength);
  }

  update(dt) {
    if (this._flash > 0.001) {
      this._flash = Math.max(0, this._flash - dt * 3.5);
      this.flashLight.intensity = this._flash * 26;
      // nudge the fill cooler during the flash
      this.fillLight.color.setHSL(0.55, 0.6, 0.6 + this._flash * 0.3);
    } else {
      this.flashLight.intensity = 0;
      this.fillLight.color.setHex(0x6f9fb8);
    }
  }

  get contextLost() {
    return this._contextLost;
  }

  render() {
    if (!this._contextLost) this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.renderer.domElement.removeEventListener('webglcontextlost', this._onLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this._onRestored);
    if (this._envRT) { this._envRT.dispose(); this._envRT = null; }
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.dom) {
      this.dom.removeChild(this.renderer.domElement);
    }
  }
}
