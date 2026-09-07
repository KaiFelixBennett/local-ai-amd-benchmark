import * as THREE from 'three';

// Scene / renderer / lights. Post-processing is injected by postfx.js so the
// rest of the game calls renderer.render() without caring which pipeline is live.

export class GameRenderer {
  constructor(canvas, bus) {
    this.bus = bus;
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      failIfMajorPerformanceCaveat: false
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x1c2b30, 0.028);
    this.scene.background = new THREE.Color(0x14202b);

    this.camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.1, 220);
    this.camera.position.set(0, 4.6, 12.5);
    this.camera.lookAt(0, 1.4, -1);

    this.post = null; // set by attachPost()
    this._buildLights();
    this._hookContextLoss();

    this._vignetteSprites = [];
    window.addEventListener('resize', () => this.resize());
  }

  _buildLights() {
    const s = this.scene;
    // Warm key light (afternoon sun over the stage).
    this.key = new THREE.DirectionalLight(0xffd9a0, 2.6);
    this.key.position.set(7, 11, 6);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(1024, 1024);
    this.key.shadow.camera.left = -16;
    this.key.shadow.camera.right = 16;
    this.key.shadow.camera.top = 16;
    this.key.shadow.camera.bottom = -16;
    this.key.shadow.camera.far = 42;
    this.key.shadow.bias = -0.0006;
    s.add(this.key);

    // Cool fill so shadows are not pure black.
    this.fill = new THREE.DirectionalLight(0x6fa8c9, 0.7);
    this.fill.position.set(-9, 6, -4);
    s.add(this.fill);

    // Rim/back light to separate silhouettes from the backdrop.
    this.rim = new THREE.DirectionalLight(0xf4d489, 1.1);
    this.rim.position.set(-2, 6, -14);
    s.add(this.rim);

    // Gentle hemisphere ambient.
    this.hemi = new THREE.HemisphereLight(0x9fc4c0, 0x2a211a, 0.55);
    s.add(this.hemi);

    // A soft "stage" point over the centre.
    this.centerGlow = new THREE.PointLight(0xf4d489, 12, 26, 2);
    this.centerGlow.position.set(0, 6.4, -2);
    s.add(this.centerGlow);

    this._baseInt = {
      key: this.key.intensity, fill: this.fill.intensity,
      rim: this.rim.intensity, hemi: this.hemi.intensity,
      keyColor: this.key.color.clone(), fog: this.scene.fog.density
    };
  }

  // intensity 0..1 — 1 = calm, 0 = desperate (warm, dim, blooded fog).
  setIntensity(intensity) {
    const b = this._baseInt;
    const t = Math.max(0, Math.min(1, intensity));
    this.key.intensity = b.key * (0.55 + 0.45 * t);
    this.fill.intensity = b.fill * (0.5 + 0.5 * t);
    this.key.color.setHSL(0.09 - 0.035 * (1 - t), 0.65 + 0.2 * (1 - t), 0.62);
    this.hemi.intensity = b.hemi * (0.55 + 0.45 * t);
    this.scene.fog.density = b.fog * (1 + 0.5 * (1 - t));
    const fogCol = new THREE.Color(0x1c2b30).lerp(new THREE.Color(0x3a1512), 1 - t);
    this.scene.fog.color.copy(fogCol);
    this.scene.background.copy(fogCol).multiplyScalar(0.7);
  }

  // Cold flash punch on a perfect parry — brief rim/key shift toward ice blue.
  flashCold(strength = 1) {
    this._coldFlash = strength;
  }

  attachPost(post) {
    this.post = post;
    post.setSize(window.innerWidth, window.innerHeight);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.post) this.post.setSize(w, h);
  }

  update(dt) {
    // decay the cold parry flash
    if (this._coldFlash > 0) {
      this._coldFlash = Math.max(0, this._coldFlash - dt * 2.2);
      const c = this._coldFlash;
      this.rim.color.setRGB(1, 0.83 + 0.1 * (1 - c), 0.53 + 0.45 * c);
      this.rim.intensity = 1.1 + 3.4 * c;
    } else {
      this.rim.color.set(0xf4d489);
      this.rim.intensity = 1.1;
    }
  }

  render() {
    if (this.post) this.post.render();
    else this.renderer.render(this.scene, this.camera);
  }

  _hookContextLoss() {
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this._contextLost = true;
      this.bus.emit('sys:context-lost', {});
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      this._contextLost = false;
      this.bus.emit('sys:context-restored', {});
    });
  }

  get contextLost() { return !!this._contextLost; }

  dispose() {
    if (this.post) this.post.dispose();
    this.renderer.dispose();
  }
}
