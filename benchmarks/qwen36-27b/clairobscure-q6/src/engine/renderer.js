/**
 * Three.js scene, camera, renderer, lights, fog setup.
 */

import * as THREE from 'three';

export class Renderer {
  constructor(container) {
    this.container = container;
    this._stageTextures = []; // tracked for disposal

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0e0e1a);
    this.scene.fog = new THREE.FogExp2(0x0e0e1a, 0.015);

    this.camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 200);
    this.camera.position.set(0, 5, 14);
    this.camera.lookAt(0, 1.5, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;  // balanced — readable shadows, controlled highlights
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    
    // Canvas sits behind UI overlays; input is handled by keyboard events on window
    this.renderer.domElement.style.position = 'relative';
    this.renderer.domElement.style.zIndex = '1';
    this.renderer.domElement.style.pointerEvents = 'none';
    this.renderer.domElement.style.outline = 'none';
    
    container.appendChild(this.renderer.domElement);

    this._setupLights();
    this._setupStage();
    this._setupFallbackEnvironment();
    this._loadBattleDecorations();

    window.addEventListener('resize', () => this.onResize());

    // Graceful context loss handling
    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      const msg = document.createElement('div');
      msg.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);color:#fff;font-size:24px;background:rgba(0,0,0,0.8);padding:20px;border-radius:8px;z-index:9999;';
      msg.textContent = 'WebGL context lost. Please refresh the page.';
      document.body.appendChild(msg);
    });
  }

  _setupLights() {
    // ── FILL: weiches Ambient — Figuren lesbar, keine schwarzen Blobs ──
    const ambient = new THREE.AmbientLight(0x7788bb, 0.7);
    this.scene.add(ambient);

    // Hemisphere: kühler Himmel oben, warmes Erdbounce unten
    const hemi = new THREE.HemisphereLight(0x8899bb, 0x5a4a3a, 0.8);
    this.scene.add(hemi);

    // ── KEY: warmes Hauptlicht — Cinematic Three-Point-Lighting ──
    this.keyLight = new THREE.DirectionalLight(0xffeedd, 3.0);
    this.keyLight.position.set(5, 14, 8);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    this.keyLight.shadow.camera.near = 0.5;
    this.keyLight.shadow.camera.far = 50;
    this.keyLight.shadow.camera.left = -15;
    this.keyLight.shadow.camera.right = 15;
    this.keyLight.shadow.camera.top = 15;
    this.keyLight.shadow.camera.bottom = -15;
    this.keyLight.shadow.bias = -0.0008;
    this.keyLight.shadow.normalBias = 0.02;
    this.scene.add(this.keyLight);

    // ── RIM: kühles Rücklicht — Teal/Orange Cinematic Look ──
    this.rimLight = new THREE.DirectionalLight(0x8899cc, 1.5);
    this.rimLight.position.set(0, 5, -12);
    this.scene.add(this.rimLight);

    // ── WALL WASH: Hintergrundwand beleuchten ──
    const wallWash = new THREE.SpotLight(0x6677aa, 4.0, 25, Math.PI / 5, 0.5, 1.5);
    wallWash.position.set(0, 8, -2);
    wallWash.target.position.set(0, 5, -12);
    this.scene.add(wallWash);
    this.scene.add(wallWash.target);

    // ── FRONT FILL: Schatten auf Kameraseite aufhellen ──
    const frontFill = new THREE.DirectionalLight(0xffddbb, 0.6);
    frontFill.position.set(0, 3, 10);
    this.scene.add(frontFill);

    // ── DRAMATIC ACCENTS: seitliche Farbakzente ──
    const accent1 = new THREE.PointLight(0x4466aa, 1.5, 20);
    accent1.position.set(-8, 3, 2);
    this.scene.add(accent1);

    const accent2 = new THREE.PointLight(0x8866aa, 1.2, 20);
    accent2.position.set(8, 3, 2);
    this.scene.add(accent2);

    // ── GROUND ACCENTS: Bodenbeleuchtung für Tiefe ──
    const groundAccent1 = new THREE.PointLight(0x3a2a1a, 0.8, 12);
    groundAccent1.position.set(-5, 0.3, 3);
    this.scene.add(groundAccent1);

    const groundAccent2 = new THREE.PointLight(0x3a2a1a, 0.8, 12);
    groundAccent2.position.set(5, 0.3, 3);
    this.scene.add(groundAccent2);

    // ── MAGIC GLOW: Parry/Counter/Ultimate ──
    this.magicLight = new THREE.PointLight(0xffd700, 0, 12);
    this.magicLight.position.set(0, 3, 0);
    this.scene.add(this.magicLight);
  }

  _setupStage() {
    // Battle stage group — can be hidden in open world
    this._battleStage = new THREE.Group();
    this.scene.add(this._battleStage);

    // Battle floor — detailed stone with PBR-like procedural texture
    const floorCanvas = document.createElement('canvas');
    floorCanvas.width = 1024;
    floorCanvas.height = 1024;
    const fctx = floorCanvas.getContext('2d');

    // Dark stone base — warm grey with subtle color variation
    fctx.fillStyle = '#1a1a24';
    fctx.fillRect(0, 0, 1024, 1024);

    // Stone tile grid (visible but not overwhelming)
    const tileSize = 128;
    for (let ty = 0; ty < 1024; ty += tileSize) {
      for (let tx = 0; tx < 1024; tx += tileSize) {
        // Each tile has slight color variation
        const variation = Math.random() * 15 - 7;
        const r = 26 + variation, g = 26 + variation, b = 36 + variation;
        fctx.fillStyle = `rgb(${r},${g},${b})`;
        fctx.fillRect(tx + 1, ty + 1, tileSize - 2, tileSize - 2);
      }
    }

    // Tile cracks (darker lines between tiles)
    fctx.strokeStyle = 'rgba(10, 10, 18, 0.8)';
    fctx.lineWidth = 2;
    for (let i = 0; i <= 1024; i += tileSize) {
      fctx.beginPath(); fctx.moveTo(i, 0); fctx.lineTo(i, 1024); fctx.stroke();
      fctx.beginPath(); fctx.moveTo(0, i); fctx.lineTo(1024, i); fctx.stroke();
    }

    // Stone grain — fine noise for realism
    for (let i = 0; i < 15000; i++) {
      const x = Math.random() * 1024;
      const y = Math.random() * 1024;
      const brightness = 15 + Math.random() * 25;
      fctx.fillStyle = `rgba(${brightness}, ${brightness}, ${brightness + 5}, ${0.08 + Math.random() * 0.12})`;
      fctx.fillRect(x, y, 1 + Math.random() * 3, 1 + Math.random() * 2);
    }

    // Wear marks and scratches
    for (let i = 0; i < 400; i++) {
      const x = Math.random() * 1024;
      const y = Math.random() * 1024;
      fctx.strokeStyle = `rgba(50, 45, 40, ${0.05 + Math.random() * 0.1})`;
      fctx.lineWidth = 0.5 + Math.random();
      fctx.beginPath();
      fctx.moveTo(x, y);
      fctx.lineTo(x + (Math.random() - 0.5) * 30, y + (Math.random() - 0.5) * 30);
      fctx.stroke();
    }

    // Moss/lichen patches in corners
    for (let i = 0; i < 30; i++) {
      const x = Math.random() * 1024;
      const y = Math.random() * 1024;
      const radius = 5 + Math.random() * 15;
      const grad = fctx.createRadialGradient(x, y, 0, x, y, radius);
      grad.addColorStop(0, 'rgba(40, 60, 30, 0.15)');
      grad.addColorStop(1, 'rgba(40, 60, 30, 0)');
      fctx.fillStyle = grad;
      fctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }

    const floorTex = new THREE.CanvasTexture(floorCanvas);
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(4, 3);
    floorTex.colorSpace = THREE.SRGBColorSpace;
    this._stageTextures.push(floorTex);

    // Normal map — detailed stone texture
    const normalCanvas = document.createElement('canvas');
    normalCanvas.width = 1024;
    normalCanvas.height = 1024;
    const nctx = normalCanvas.getContext('2d');
    nctx.fillStyle = 'rgb(128, 128, 255)';
    nctx.fillRect(0, 0, 1024, 1024);

    // Tile edge normals (recessed cracks)
    nctx.strokeStyle = 'rgb(115, 115, 190)';
    nctx.lineWidth = 3;
    for (let i = 0; i <= 1024; i += tileSize) {
      nctx.beginPath(); nctx.moveTo(i, 0); nctx.lineTo(i, 1024); nctx.stroke();
      nctx.beginPath(); nctx.moveTo(0, i); nctx.lineTo(1024, i); nctx.stroke();
    }

    // Random bump noise
    for (let i = 0; i < 20000; i++) {
      const x = Math.random() * 1024;
      const y = Math.random() * 1024;
      const r = 120 + Math.floor(Math.random() * 16);
      const g = 120 + Math.floor(Math.random() * 16);
      nctx.fillStyle = `rgb(${r}, ${g}, 255)`;
      nctx.fillRect(x, y, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }

    const normalTex = new THREE.CanvasTexture(normalCanvas);
    normalTex.wrapS = normalTex.wrapT = THREE.RepeatWrapping;
    normalTex.repeat.set(4, 3);
    this._stageTextures.push(normalTex);

    // Roughness map — worn tiles are smoother
    const roughCanvas = document.createElement('canvas');
    roughCanvas.width = 512; roughCanvas.height = 512;
    const rctx = roughCanvas.getContext('2d');
    rctx.fillStyle = 'rgb(180, 180, 180)';
    rctx.fillRect(0, 0, 512, 512);
    // Tile edges are rougher
    rctx.strokeStyle = 'rgb(220, 220, 220)';
    rctx.lineWidth = 3;
    for (let i = 0; i <= 512; i += 64) {
      rctx.beginPath(); rctx.moveTo(i, 0); rctx.lineTo(i, 512); rctx.stroke();
      rctx.beginPath(); rctx.moveTo(0, i); rctx.lineTo(512, i); rctx.stroke();
    }
    const roughTex = new THREE.CanvasTexture(roughCanvas);
    roughTex.wrapS = roughTex.wrapT = THREE.RepeatWrapping;
    roughTex.repeat.set(4, 3);
    this._stageTextures.push(roughTex);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 20),
      new THREE.MeshStandardMaterial({
        map: floorTex,
        normalMap: normalTex,
        normalScale: new THREE.Vector2(0.4, 0.4),
        roughnessMap: roughTex,
        roughness: 0.7,
        metalness: 0.08,
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this._battleStage.add(floor);
    this._battleFloor = floor;

    // Back wall — dark atmospheric with subtle arch pattern
    const wallCanvas = document.createElement('canvas');
    wallCanvas.width = 512;
    wallCanvas.height = 512;
    const wctx = wallCanvas.getContext('2d');

    // Dark gradient background — visible but atmospheric
    const wallGrad = wctx.createLinearGradient(0, 0, 0, 512);
    wallGrad.addColorStop(0, '#12122a');
    wallGrad.addColorStop(0.5, '#1a1a38');
    wallGrad.addColorStop(1, '#222248');
    wctx.fillStyle = wallGrad;
    wctx.fillRect(0, 0, 512, 512);

    // Art nouveau arch pattern — subtle gold glow
    wctx.strokeStyle = 'rgba(180, 150, 80, 0.08)';
    wctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const cx = 43 + i * 86;
      wctx.beginPath();
      wctx.arc(cx, 512, 45, Math.PI, 0);
      wctx.stroke();
      // Inner arch
      wctx.strokeStyle = 'rgba(180, 150, 80, 0.04)';
      wctx.beginPath();
      wctx.arc(cx, 512, 33, Math.PI, 0);
      wctx.stroke();
      wctx.strokeStyle = 'rgba(180, 150, 80, 0.08)';
    }

    // Subtle star/dust particles on wall
    for (let i = 0; i < 100; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 300;
      wctx.fillStyle = `rgba(150, 160, 200, ${0.05 + Math.random() * 0.1})`;
      wctx.fillRect(x, y, 1, 1);
    }

    const wallTex = new THREE.CanvasTexture(wallCanvas);
    wallTex.colorSpace = THREE.SRGBColorSpace;
    this._stageTextures.push(wallTex);
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 15),
      new THREE.MeshStandardMaterial({
        map: wallTex,
        roughness: 0.95,
        metalness: 0.0,
        emissive: new THREE.Color(0x080810),
        emissiveIntensity: 0.03,
      })
    );
    wall.position.set(0, 7.5, -12);
    wall.receiveShadow = true;
    this._battleStage.add(wall);

    // Side pillars
    for (const side of [-1, 1]) {
      const pillarGeo = new THREE.CylinderGeometry(0.3, 0.35, 8, 8);
      const pillarMat = new THREE.MeshStandardMaterial({
        color: 0x3a3a52, roughness: 0.6, metalness: 0.3
      });
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.set(side * 12, 4, -5);
      pillar.castShadow = true;
      pillar.receiveShadow = true;
      this._battleStage.add(pillar);

      // Gilded cap
      const capGeo = new THREE.CylinderGeometry(0.4, 0.3, 0.5, 8);
      const capMat = new THREE.MeshStandardMaterial({
        color: 0xc8a84e, roughness: 0.3, metalness: 0.8, emissive: 0x3a2a0a, emissiveIntensity: 0.2
      });
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.set(side * 12, 8.2, -5);
      cap.castShadow = true;
      this._battleStage.add(cap);
    }
  }

  /**
   * Load real CC0 glTF models as battle decorations (rocks, barrels, fire pit).
   * Falls back silently if models fail to load.
   */
  async _loadBattleDecorations() {
    try {
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      const loader = new GLTFLoader();

      // Helper: load and place a model
      const place = (path, pos, scale, rotY = 0) => {
        loader.load(path,
          (gltf) => {
            const model = gltf.scene;
            model.position.set(pos.x, pos.y, pos.z);
            model.scale.setScalar(scale);
            model.rotation.y = rotY;
            model.traverse(child => {
              if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
              }
            });
            this._battleStage.add(model);
          },
          undefined,
          (err) => console.warn(`[Renderer] Model load failed: ${path}`, err.message)
        );
      };

      // Rocks around the edges
      place('assets/models/rock_moss_set_01/rock_moss_set_01_1k.gltf',
        { x: -10, y: 0, z: -2 }, 1.5, 0.3);
      place('assets/models/rock_moss_set_01/rock_moss_set_01_1k.gltf',
        { x: 11, y: 0, z: 1 }, 1.2, -0.5);

      // Wine barrels as cover
      place('assets/models/wine_barrel_01/wine_barrel_01_1k.gltf',
        { x: -8, y: 0, z: 3 }, 0.8, 0.8);
      place('assets/models/wine_barrel_01/wine_barrel_01_1k.gltf',
        { x: 9, y: 0, z: -1 }, 0.8, -0.3);

      // Stone fire pit (center back, atmospheric)
      place('assets/models/stone_fire_pit/stone_fire_pit_1k.gltf',
        { x: 0, y: 0, z: -8 }, 1.0, 0);

      // Shrubs
      place('assets/models/shrub_03/shrub_03_1k.gltf',
        { x: -12, y: 0, z: 4 }, 1.0, 0);
      place('assets/models/shrub_03/shrub_03_1k.gltf',
        { x: 12, y: 0, z: 5 }, 0.8, Math.PI);

    } catch (e) {
      console.warn('[Renderer] GLTFLoader unavailable:', e.message);
    }
  }

  /**
   * Create a procedural PMREM environment so metallic materials have
   * something to reflect even when the HDRI fails to load.
   */
  _setupFallbackEnvironment() {
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    pmremGenerator.compileEquirectangularShader();

    // Simple studio-style env: dark room with warm key light
    const envScene = new THREE.Scene();

    // Gradient background — bright enough for PBR reflections
    const bgCanvas = document.createElement('canvas');
    bgCanvas.width = 1024; bgCanvas.height = 512;
    const bgCtx = bgCanvas.getContext('2d');
    const bgGrad = bgCtx.createLinearGradient(0, 0, 0, 512);
    bgGrad.addColorStop(0, '#1a1a2e');
    bgGrad.addColorStop(0.3, '#2a2a44');
    bgGrad.addColorStop(0.6, '#3a3a55');
    bgGrad.addColorStop(1, '#2a2a3e');
    bgCtx.fillStyle = bgGrad;
    bgCtx.fillRect(0, 0, 1024, 512);

    // Warm key light panel (right side) — bright for reflections
    bgCtx.fillStyle = 'rgba(255, 240, 210, 0.7)';
    bgCtx.fillRect(650, 80, 250, 350);

    // Cool fill panel (left side)
    bgCtx.fillStyle = 'rgba(180, 200, 255, 0.5)';
    bgCtx.fillRect(30, 120, 200, 280);

    // Rim light strip (top center)
    bgCtx.fillStyle = 'rgba(200, 200, 255, 0.4)';
    bgCtx.fillRect(350, 20, 300, 80);

    // Ground reflection — warm bounce
    bgCtx.fillStyle = 'rgba(60, 50, 40, 0.5)';
    bgCtx.fillRect(0, 380, 1024, 132);

    const bgTex = new THREE.CanvasTexture(bgCanvas);
    bgTex.mapping = THREE.EquirectangularReflectionMapping;
    bgTex.colorSpace = THREE.SRGBColorSpace;

    const envMap = pmremGenerator.fromEquirectangular(bgTex).texture;
    this.scene.environment = envMap;

    bgTex.dispose();
    pmremGenerator.dispose();
  }

  onResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  /**
   * Load an HDRI file and apply it as scene.environment (PBR reflections + lighting)
   * and optionally as background. Returns a Promise that resolves when loaded.
   * Uses PMREMGenerator for proper irradiance/reflection maps.
   */
  async loadHDRI(path, asBackground = false) {
    try {
      const { RGBELoader } = await import('three/addons/loaders/RGBELoader.js');
      return new Promise((resolve, reject) => {
        const loader = new RGBELoader();
        loader.load(path,
          (texture) => {
            const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
            const envMap = pmremGenerator.fromEquirectangular(texture).texture;
            // Dispose old environment map (fallback or previous HDRI)
            if (this.scene.environment) this.scene.environment.dispose();
            this.scene.environment = envMap;
            if (asBackground) {
              this.scene.background = texture;
            }
            texture.dispose();
            pmremGenerator.dispose();
            resolve(envMap);
          },
          undefined,
          (err) => reject(err)
        );
      });
    } catch (e) {
      console.warn('HDRI loader unavailable:', e.message);
      return null;
    }
  }

  /** Shift lighting based on battle intensity (0 = calm, 1 = desperate). */
  setIntensity(t) {
    // Warm key shifts redder as battle intensifies — keep intensity stable
    const r = 1.0;
    const g = 0.93 - t * 0.35;   // 0.93 → 0.58
    const b = 0.87 - t * 0.37;   // 0.87 → 0.50
    this.keyLight.color.setRGB(r, g, b);
    this.keyLight.intensity = 2.5 - t * 0.3;  // 2.5 → 2.2, never drops below
    this.scene.fog.density = 0.015 + t * 0.01;
  }

  /** Flash the magic light for parry/counter effects. */
  flashMagic(color, duration) {
    this.magicLight.color.set(color);
    this.magicLight.intensity = 3;
    const start = performance.now();
    const tick = () => {
      const elapsed = (performance.now() - start) / 1000;
      const progress = elapsed / duration;
      if (progress < 1) {
        this.magicLight.intensity = 3 * (1 - progress);
        requestAnimationFrame(tick);
      } else {
        this.magicLight.intensity = 0;
      }
    };
    requestAnimationFrame(tick);
  }

  render(composer) {
    if (composer) {
      composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  /** Dispose tracked stage textures (floor, normal, wall). */
  disposeStageTextures() {
    for (const tex of this._stageTextures) tex.dispose();
    this._stageTextures.length = 0;
  }

  /** Full teardown: renderer, scene graph, textures, environment. */
  dispose() {
    // Environment map
    if (this.scene.environment) this.scene.environment.dispose();
    // Stage textures
    this.disposeStageTextures();
    // Fog
    if (this.scene.fog) this.scene.fog.dispose();
    // Shadow map from key light
    if (this.keyLight?.shadow?.map) this.keyLight.shadow.map.dispose();
    // WebGL renderer (frees all GPU resources)
    this.renderer.dispose();
    if (this.container.contains(this.renderer.domElement)) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
