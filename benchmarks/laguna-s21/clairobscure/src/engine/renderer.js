/**
 * Three.js scene setup: scene, camera, renderer, lights, fog, tone-mapping.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0a18);
        this.scene.fog = new THREE.FogExp2(0x0a0a18, 0.025);

        this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
        this.camera.position.set(0, 6, 16);
        this.camera.lookAt(0, 2, 0);

        this.renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            antialias: true,
            powerPreference: 'high-performance'
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.1;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;

        // Post-processing
        try {
            this.composer = new EffectComposer(this.renderer);
            this.composer.addPass(new RenderPass(this.scene, this.camera));

            const bloomPass = new UnrealBloomPass(
                new THREE.Vector2(window.innerWidth, window.innerHeight),
                0.35,   // strength
                0.6,    // radius
                0.72    // threshold
            );
            this.composer.addPass(bloomPass);
            this.composer.addPass(new OutputPass());
            this.useComposer = true;
        } catch (e) {
            console.warn('Post-processing unavailable, falling back to direct render:', e);
            this.useComposer = false;
        }

        this.setupLights();
        this.setupStage();
        this.setupResize();

        // Camera animation state
        this.cameraTarget = new THREE.Vector3(0, 2, 0);
        this.cameraPositionTarget = new THREE.Vector3(0, 6, 16);
        this.cameraAnimating = false;
    }

    setupLights() {
        // Ambient - brighter for visibility
        const ambient = new THREE.AmbientLight(0x4a4a6c, 0.8);
        this.scene.add(ambient);

        // Hemisphere light for natural fill
        const hemi = new THREE.HemisphereLight(0xffe4c4, 0x3a3a5c, 0.5);
        this.scene.add(hemi);

        // Warm key light - stronger
        this.keyLight = new THREE.DirectionalLight(0xffe4c4, 1.8);
        this.keyLight.position.set(8, 12, 6);
        this.keyLight.castShadow = true;
        this.keyLight.shadow.mapSize.set(2048, 2048);
        this.keyLight.shadow.camera.near = 0.5;
        this.keyLight.shadow.camera.far = 50;
        this.keyLight.shadow.camera.left = -15;
        this.keyLight.shadow.camera.right = 15;
        this.keyLight.shadow.camera.top = 10;
        this.keyLight.shadow.camera.bottom = -10;
        this.keyLight.shadow.bias = -0.001;
        this.scene.add(this.keyLight);

        // Cool fill - brighter
        const fillLight = new THREE.DirectionalLight(0x8899cc, 0.6);
        fillLight.position.set(-6, 8, -4);
        this.scene.add(fillLight);

        // Rim/back light
        this.rimLight = new THREE.DirectionalLight(0xc4a35a, 0.8);
        this.rimLight.position.set(0, 4, -10);
        this.scene.add(this.rimLight);

        // Point lights for atmosphere
        const point1 = new THREE.PointLight(0xc4a35a, 1.2, 25);
        point1.position.set(-5, 5, 3);
        this.scene.add(point1);

        const point2 = new THREE.PointLight(0x5588cc, 0.8, 25);
        point2.position.set(5, 5, 3);
        this.scene.add(point2);

        // Center spotlight for battle focus
        const spot = new THREE.SpotLight(0xffeedd, 1.0, 30, Math.PI / 4, 0.5);
        spot.position.set(0, 10, 0);
        spot.target.position.set(0, 0, 0);
        this.scene.add(spot);
        this.scene.add(spot.target);
    }

    setupStage() {
        // Ground plane - oil painting style
        const groundGeo = new THREE.PlaneGeometry(60, 40);
        const groundTex = this.createGroundTexture();
        const groundMat = new THREE.MeshStandardMaterial({
            map: groundTex,
            roughness: 0.85,
            metalness: 0.05
        });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);

        // Background pillars
        this.createPillars();

        // Floating particles (motes of paint)
        this.createMotes();
    }

    createGroundTexture() {
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Base dark color
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, size, size);

        // Brush stroke noise
        for (let i = 0; i < 3000; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const w = Math.random() * 40 + 5;
            const h = Math.random() * 2 + 0.5;
            const angle = Math.random() * Math.PI;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(angle);
            const alpha = Math.random() * 0.08 + 0.02;
            const r = Math.floor(30 + Math.random() * 20);
            const g = Math.floor(25 + Math.random() * 15);
            const b = Math.floor(40 + Math.random() * 20);
            ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
            ctx.fillRect(-w / 2, -h / 2, w, h);
            ctx.restore();
        }

        // Subtle grid lines (tile pattern)
        ctx.strokeStyle = 'rgba(100, 90, 70, 0.06)';
        ctx.lineWidth = 1;
        for (let x = 0; x < size; x += 64) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, size);
            ctx.stroke();
        }
        for (let y = 0; y < size; y += 64) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(size, y);
            ctx.stroke();
        }

        // Vignette
        const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.2, size / 2, size / 2, size * 0.7);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0,0,0,0.4)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);

        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(4, 3);
        return tex;
    }

    createPillars() {
        const pillarGeo = new THREE.CylinderGeometry(0.3, 0.35, 10, 8);
        const pillarMat = new THREE.MeshStandardMaterial({
            color: 0x2a2a3e,
            roughness: 0.7,
            metalness: 0.1
        });

        const positions = [
            [-12, 5, -8], [12, 5, -8],
            [-12, 5, -3], [12, 5, -3],
            [-12, 5, 2], [12, 5, 2]
        ];

        for (const [x, y, z] of positions) {
            const pillar = new THREE.Mesh(pillarGeo, pillarMat);
            pillar.position.set(x, y, z);
            pillar.castShadow = true;
            pillar.receiveShadow = true;
            this.scene.add(pillar);

            // Gilded capital
            const capGeo = new THREE.CylinderGeometry(0.5, 0.3, 0.5, 8);
            const capMat = new THREE.MeshStandardMaterial({
                color: 0xc4a35a,
                roughness: 0.3,
                metalness: 0.8,
                emissive: 0x3a2a0a,
                emissiveIntensity: 0.2
            });
            const cap = new THREE.Mesh(capGeo, capMat);
            cap.position.set(x, y + 5.2, z);
            cap.castShadow = true;
            this.scene.add(cap);
        }
    }

    createMotes() {
        const count = 80;
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const sizes = new Float32Array(count);

        for (let i = 0; i < count; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 30;
            positions[i * 3 + 1] = Math.random() * 8 + 1;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 20;
            sizes[i] = Math.random() * 3 + 1;
        }

        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        // Create a soft circle texture
        const cvs = document.createElement('canvas');
        cvs.width = 32;
        cvs.height = 32;
        const ctx = cvs.getContext('2d');
        const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
        grad.addColorStop(0, 'rgba(200, 180, 120, 1)');
        grad.addColorStop(0.5, 'rgba(200, 180, 120, 0.4)');
        grad.addColorStop(1, 'rgba(200, 180, 120, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 32, 32);

        const mat = new THREE.PointsMaterial({
            map: new THREE.CanvasTexture(cvs),
            size: 0.3,
            transparent: true,
            opacity: 0.6,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            color: 0xc4a35a,
            sizeAttenuation: true
        });

        this.motes = new THREE.Points(geo, mat);
        this.scene.add(this.motes);
    }

    setupResize() {
        window.addEventListener('resize', () => {
            const w = window.innerWidth;
            const h = window.innerHeight;
            this.camera.aspect = w / h;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(w, h);
            if (this.useComposer) {
                this.composer.setSize(w, h);
            }
        });
    }

    /** Animate camera to look at a target position */
    setCameraTarget(position, lookAt, duration = 0.5) {
        this.cameraPositionTarget.copy(position);
        this.cameraTarget.copy(lookAt);
        this.cameraAnimating = true;
        this.cameraAnimStart = performance.now();
        this.cameraAnimDuration = duration;
        this.cameraPositionStart = this.camera.position.clone();
        this.cameraLookAtStart = this.cameraTarget.clone();
    }

    /** Reset camera to default position */
    resetCamera(duration = 0.5) {
        this.setCameraTarget(
            new THREE.Vector3(0, 6, 16),
            new THREE.Vector3(0, 2, 0),
            duration
        );
    }

    update(dt) {
        // Update camera animation
        if (this.cameraAnimating) {
            const elapsed = (performance.now() - this.cameraAnimStart) / 1000;
            const t = Math.min(elapsed / this.cameraAnimDuration, 1);
            const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

            this.camera.position.lerpVectors(this.cameraPositionStart, this.cameraPositionTarget, eased);
            const currentLook = new THREE.Vector3().lerpVectors(
                this.cameraLookAtStart, this.cameraTarget, eased
            );
            this.camera.lookAt(currentLook);

            if (t >= 1) {
                this.cameraAnimating = false;
            }
        }

        // Animate motes
        if (this.motes) {
            const pos = this.motes.geometry.attributes.position.array;
            for (let i = 0; i < pos.length; i += 3) {
                pos[i] += Math.sin(performance.now() * 0.0003 + i) * 0.002;
                pos[i + 1] += Math.cos(performance.now() * 0.0005 + i) * 0.001;
                if (pos[i + 1] > 9) pos[i + 1] = 1;
            }
            this.motes.geometry.attributes.position.needsUpdate = true;
        }
    }

    render() {
        if (this.useComposer) {
            this.composer.render();
        } else {
            this.renderer.render(this.scene, this.camera);
        }
    }

    /** Adjust lighting based on battle intensity */
    setBattleIntensity(intensity) {
        // intensity: 0 (calm) to 1 (intense)
        const keyIntensity = 1.2 - intensity * 0.4;
        this.keyLight.intensity = keyIntensity;
        const warmth = 0xffe4c4;
        const cold = 0xff4422;
        const r = Math.floor(lerpColor(0xff, 0xff, intensity));
        const g = Math.floor(lerpColor(0xe4, 0x22, intensity));
        const b = Math.floor(lerpColor(0xc4, 0x11, intensity));
        this.keyLight.color.setHex((r << 16) | (g << 8) | b);
    }

    dispose() {
        this.renderer.dispose();
        if (this.composer) this.composer.dispose();
    }
}

function lerpColor(a, b, t) {
    return a + (b - a) * t;
}
