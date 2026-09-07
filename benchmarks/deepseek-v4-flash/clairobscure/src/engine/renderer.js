// renderer.js — scene/camera/renderer/lights/fog/tone-mapping setup + shared render path.
// The postfx module attaches a composer; renderer.render() delegates to it when present.
import * as THREE from 'three';

export class Renderer {
    constructor(container) {
        this.container = container;
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0d1f26);
        this.scene.fog = new THREE.Fog(0x0d1f26, 30, 90);

        // Camera: framed combat look — slight FOV, near/far sane for a battle stage.
        this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
        this.camera.position.set(0, 9, 22);
        this.camera.lookAt(0, 2.2, 0);

        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            powerPreference: 'high-performance',
        });
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.1;
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(this.renderer.domElement);

        // expose the underlying WebGL canvas for input binding & projection math
        this.domElement = this.renderer.domElement;

        // Lights: warm key, cool fill, rim/back, plus an ambient.
        this._buildLights();

        this.composer = null; // set by postfx
        this._desat = 0;      // 0..1 desaturation (perfect parry moment)
        this._slowmo = 0;
        this._warm = 0;       // 0..1 battle-intensity warmth
        this._flash = 0;      // white/color flash overlay handled in HUD (2D) — kept here for API symmetry

        this._onResize = this._handleResize.bind(this);
        window.addEventListener('resize', this._onResize);
    }

    _buildLights() {
        // Warm key (sun through window): directional.
        this.key = new THREE.DirectionalLight(0xffe0b0, 2.6);
        this.key.position.set(-10, 14, 12);
        this.key.castShadow = true;
        this.key.shadow.mapSize.set(1024, 1024);
        this.key.shadow.camera.near = 2;
        this.key.shadow.camera.far = 60;
        this.key.shadow.camera.left = -20;
        this.key.shadow.camera.right = 20;
        this.key.shadow.camera.top = 20;
        this.key.shadow.camera.bottom = -20;
        this.scene.add(this.key);

        // Cool fill: soft large bounce.
        this.fill = new THREE.DirectionalLight(0x9fc0d0, 1.1);
        this.fill.position.set(14, 6, -8);
        this.scene.add(this.fill);

        // Rim/back: cooler teal to separate silhouettes.
        this.rim = new THREE.DirectionalLight(0x7fd0c8, 1.8);
        this.rim.position.set(2, 8, -14);
        this.scene.add(this.rim);

        // Ambient low.
        this.ambient = new THREE.AmbientLight(0x31434c, 0.5);
        this.scene.add(this.ambient);

        // Subtle warm point "candle" center stage.
        this.centerPoint = new THREE.PointLight(0xffc06a, 0.9, 30, 2);
        this.centerPoint.position.set(0, 5, 0);
        this.scene.add(this.centerPoint);
    }

    // Called by postfx to install the composer in place of straight render.
    setComposer(composer) {
        this.composer = composer;
    }

    // Set battle-intensity tuning: warmth color shift + dimming as HP drops.
    updateBattleFeel(intensity) {
        this._warm += (intensity - this._warm) * 0.06;
        const warm = this._warm;
        this.key.color.setRGB(1, 0.88 + warm * 0.1, 0.69 - warm * 0.05);
        this.centerPoint.color.setRGB(1, 0.75 - warm * 0.15, 0.4);
        this.centerPoint.intensity = 0.9 + warm * 0.8;
        this.renderer.toneMappingExposure = 1.1 - warm * 0.35;
        this.scene.fog.color.setRGB(0.05, 0.12, 0.15 - warm * 0.04);
    }

    // Perfect-parry flash: brief desaturation + cold tinge (applied via scene override).
    triggerParryFlash() {
        this._desat = 1;
    }

    update(dt, t) {
        // ease the flash back to zero
        this._desat *= Math.max(0, 1 - dt * 6);
        this._slowmo *= Math.max(0, 1 - dt * 2.5);
        // gentle framed-camera drift (dynamic combat camera feel)
        if (t !== undefined) {
            const sway = Math.sin(t * 0.25) * 0.6;
            this.camera.position.x = sway;
            this.camera.position.y = 9 + Math.sin(t * 0.17) * 0.35;
            this.camera.lookAt(0, 2.2, 0);
        }
    }

    // The render entry point — used by game.js for BOTH composer and plain paths.
    render() {
        if (this.composer) {
            this.composer.render();
        } else {
            this.renderer.render(this.scene, this.camera);
        }
    }

    setSlowmo(active) {
        this._slowmo = active;
    }

    get slowmoFactor() {
        // exposed for game loop time scaling
        return this._slowmo > 0.01 ? 0.35 : 1;
    }

    _handleResize() {
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
        if (this.composer) this.composer.setSize(w, h);
    }

    // Desaturation is handled in the HUD overlay (2D canvas) to keep WebGL risk low.
    get desaturation() { return this._desat; }
}
