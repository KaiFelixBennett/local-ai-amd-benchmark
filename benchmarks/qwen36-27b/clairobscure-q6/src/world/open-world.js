/**
 * Open World: explorable forest area with real GLTF assets.
 * Terrain heightmap, trees, volumetric fog, dynamic lighting.
 * WASD movement, third-person camera, encounter zones, interactables.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class OpenWorld {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this._group = new THREE.Group();
    this.scene.add(this._group);
    this._playerPos = new THREE.Vector3(0, 0, 0);
    this._playerAngle = 0;
    this._encounterZones = [];
    this._interactables = [];
    this._onEncounter = null;
    this._onInteract = null;
    this._visible = false;
    this._group.visible = false;
    this._loaded = false;
    this._modelsLoaded = 0;
    this._totalModels = 0;
    this._trees = [];
    this._fogParticles = null;
  }

  async init(onProgress) {
    if (this._loaded) return;

    // Build terrain with heightmap first
    this._buildTerrain();

    // Load all GLTF models in parallel
    const modelPaths = [
      { path: 'assets/models/dead_tree_trunk/dead_tree_trunk_1k.gltf', type: 'dead_tree' },
      { path: 'assets/models/shrub_03/shrub_03_1k.gltf', type: 'shrub' },
      { path: 'assets/models/rock_moss_set_01/rock_moss_set_01_1k.gltf', type: 'rock' },
      { path: 'assets/models/stone_fire_pit/stone_fire_pit_1k.gltf', type: 'firepit' },
      { path: 'assets/models/wine_barrel_01/wine_barrel_01_1k.gltf', type: 'barrel' },
    ];

    this._totalModels = modelPaths.length;
    const loader = new GLTFLoader();

    const loadPromises = modelPaths.map(async (m, i) => {
      try {
        const gltf = await new Promise((resolve, reject) => {
          loader.load(m.path, resolve, undefined, reject);
        });
        if (onProgress) onProgress(++this._modelsLoaded, this._totalModels, m.type);
        return { gltf, type: m.type };
      } catch (e) {
        console.warn(`[OpenWorld] Failed to load ${m.path}:`, e.message);
        return null;
      }
    });

    const results = await Promise.all(loadPromises);

    // Place loaded models
    for (const result of results) {
      if (!result) continue;
      switch (result.type) {
        case 'dead_tree': this._placeDeadTrees(result.gltf); break;
        case 'shrub': this._placeShrubs(result.gltf); break;
        case 'rock': this._placeRocks(result.gltf); break;
        case 'firepit': this._placeFirePit(result.gltf); break;
        case 'barrel': this._placeBarrels(result.gltf); break;
      }
    }

    // Procedural trees (fallback for Fir/Pine that failed to load)
    this._placeProceduralTrees();

    // Build lighting, sky, fog, god rays, encounter zones
    this._buildLighting();
    this._buildSky();
    this._buildVolumetricFog();
    this._buildGodRays();
    this._buildEncounterZones();
    this._buildRoamingEnemies();
    this._buildInteractables();
    this._buildPlayerIndicator();

    this._loaded = true;
    console.log('[OpenWorld] Loaded', this._modelsLoaded, 'of', this._totalModels, 'model types');
  }

  /** Get terrain height at a given x,z position. */
  _getTerrainHeight(x, z) {
    // Multi-octave noise for natural terrain
    let h = 0;
    h += Math.sin(x * 0.08) * Math.cos(z * 0.06) * 2.0;
    h += Math.sin(x * 0.15 + 1.3) * Math.cos(z * 0.12 + 0.7) * 1.0;
    h += Math.sin(x * 0.3 + 2.1) * Math.cos(z * 0.25 + 1.5) * 0.4;
    // Valley in center (path area)
    const distFromCenter = Math.sqrt(x * x + z * z);
    const valleyFactor = Math.max(0, 1 - distFromCenter / 25);
    h *= (1 - valleyFactor * 0.6);
    return h;
  }

  _buildTerrain() {
    // High-res terrain with vertex displacement - much larger world
    const size = 220;
    const segments = 128;
    const groundGeo = new THREE.PlaneGeometry(size, size, segments, segments);
    const pos = groundGeo.attributes.position;

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const h = this._getTerrainHeight(x, y);
      pos.setZ(i, h);
    }
    groundGeo.computeVertexNormals();

    // Load forest ground PBR textures
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x3a4a2a,
      roughness: 0.9,
      metalness: 0.0,
    });

    const texLoader = new THREE.TextureLoader();

    texLoader.load('assets/textures/forest_ground_01/albedo.jpg', (tex) => {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(12, 12);
      tex.colorSpace = THREE.SRGBColorSpace;
      groundMat.map = tex;
      groundMat.needsUpdate = true;
    });

    texLoader.load('assets/textures/forest_ground_01/normal.jpg', (tex) => {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(12, 12);
      groundMat.normalMap = tex;
      groundMat.normalScale.set(0.8, 0.8);
      groundMat.needsUpdate = true;
    });

    texLoader.load('assets/textures/forest_ground_01/roughness.jpg', (tex) => {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(6, 6);
      groundMat.roughnessMap = tex;
      groundMat.needsUpdate = true;
    });

    texLoader.load('assets/textures/forest_ground_01/ao.jpg', (tex) => {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(6, 6);
      groundMat.aoMap = tex;
      groundMat.needsUpdate = true;
    });

    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this._group.add(ground);

    // Dirt path — follows terrain
    const pathPoints = [];
    for (let z = 10; z > -35; z -= 0.5) {
      const x = Math.sin(z * 0.15) * 2;
      const h = this._getTerrainHeight(x, z);
      pathPoints.push(new THREE.Vector3(x, h + 0.05, z));
    }

    const pathCurve = new THREE.CatmullRomCurve3(pathPoints);
    const pathGeo = new THREE.TubeGeometry(pathCurve, 100, 1.5, 3, false);
    const pathMat = new THREE.MeshStandardMaterial({
      color: 0x5a4a3a,
      roughness: 0.95,
      metalness: 0.0,
    });
    const pathMesh = new THREE.Mesh(pathGeo, pathMat);
    pathMesh.receiveShadow = true;
    this._group.add(pathMesh);
  }

  _placeProceduralTrees() {
    // Dense forest across the entire world
    for (let i = 0; i < 120; i++) {
      let x, z;
      do {
        x = (Math.random() - 0.5) * 180; // spread across 180x180
        z = (Math.random() - 0.5) * 180 - 10;
      } while (Math.abs(x) < 4 && Math.abs(z) < 5); // avoid path center

      const h = this._getTerrainHeight(x, z);
      const tree = this._createProceduralTree();
      tree.position.set(x, h, z);
      tree.scale.setScalar(0.9 + Math.random() * 0.8);
      tree.rotation.y = Math.random() * Math.PI * 2;
      this._group.add(tree);
      this._trees.push(tree);
    }
  }

  _createProceduralTree() {
    const tree = new THREE.Group();
    const variation = Math.random();
    const treeType = variation < 0.4 ? 'pine' : (variation < 0.75 ? 'oak' : 'birch');

    // ── TRUNK with bark detail ──
    const trunkHeight = 6 + Math.random() * 6;
    const trunkBotR = 0.35 + Math.random() * 0.3;
    const trunkTopR = trunkBotR * (0.3 + Math.random() * 0.2);

    // Create bark texture procedurally
    const barkCanvas = document.createElement('canvas');
    barkCanvas.width = 128; barkCanvas.height = 256;
    const bctx = barkCanvas.getContext('2d');
    const barkBase = treeType === 'birch' ? '#d4c8a8' : (treeType === 'pine' ? '#3a2a1a' : '#4a3a2a');
    bctx.fillStyle = barkBase;
    bctx.fillRect(0, 0, 128, 256);
    // Bark lines
    for (let i = 0; i < 60; i++) {
      bctx.strokeStyle = `rgba(${treeType === 'birch' ? '40,30,20' : '20,15,10'}, ${0.2 + Math.random() * 0.3})`;
      bctx.lineWidth = 1 + Math.random() * 3;
      bctx.beginPath();
      const x = Math.random() * 128;
      bctx.moveTo(x, 0);
      bctx.bezierCurveTo(x + (Math.random() - 0.5) * 20, 85, x + (Math.random() - 0.5) * 20, 170, x + (Math.random() - 0.5) * 10, 256);
      bctx.stroke();
    }
    // Bark knots
    for (let i = 0; i < 5; i++) {
      bctx.fillStyle = `rgba(${treeType === 'birch' ? '30,20,10' : '15,10,5'}, 0.4)`;
      bctx.beginPath();
      bctx.ellipse(Math.random() * 128, Math.random() * 256, 3 + Math.random() * 5, 2 + Math.random() * 3, Math.random() * Math.PI, 0, Math.PI * 2);
      bctx.fill();
    }
    const barkTex = new THREE.CanvasTexture(barkCanvas);
    barkTex.wrapS = barkTex.wrapT = THREE.RepeatWrapping;

    const trunkGeo = new THREE.CylinderGeometry(trunkTopR, trunkBotR, trunkHeight, 12, 4);
    const trunkMat = new THREE.MeshStandardMaterial({
      map: barkTex,
      roughness: 0.95,
      metalness: 0.0,
      bumpMap: barkTex,
      bumpScale: 0.02,
    });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = trunkHeight / 2;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    tree.add(trunk);

    // ── BRANCHES (for oak and birch) ──
    if (treeType !== 'pine') {
      const branchCount = 3 + Math.floor(Math.random() * 4);
      for (let i = 0; i < branchCount; i++) {
        const branchHeight = trunkHeight * (0.5 + Math.random() * 0.4);
        const branchLen = 1.5 + Math.random() * 2;
        const branchR = 0.05 + Math.random() * 0.08;
        const angle = (i / branchCount) * Math.PI * 2 + Math.random() * 0.5;

        const branchGeo = new THREE.CylinderGeometry(branchR * 0.4, branchR, branchLen, 6);
        const branch = new THREE.Mesh(branchGeo, trunkMat.clone());
        branch.position.set(
          Math.cos(angle) * branchLen * 0.4,
          branchHeight,
          Math.sin(angle) * branchLen * 0.4
        );
        branch.rotation.z = Math.cos(angle) * 0.8;
        branch.rotation.x = -Math.sin(angle) * 0.8;
        branch.castShadow = true;
        tree.add(branch);
      }
    }

    // ── FOLIAGE - multi-layer, realistic ──
    if (treeType === 'pine') {
      // Pine: multiple cone layers with needle clusters
      const layers = 6 + Math.floor(Math.random() * 4);
      for (let i = 0; i < layers; i++) {
        const t = i / layers;
        const radius = (2.5 + Math.random() * 1.5) * (1 - t * 0.7);
        const height = (1.5 + Math.random() * 0.5) * (1 - t * 0.3);

        // Main cone
        const coneGeo = new THREE.ConeGeometry(radius, height, 10);
        const green = new THREE.Color(
          0.05 + Math.random() * 0.1,
          0.2 + Math.random() * 0.15,
          0.02 + Math.random() * 0.08
        );
        const coneMat = new THREE.MeshStandardMaterial({
          color: green,
          roughness: 0.8,
          metalness: 0.0,
          emissive: green.clone().multiplyScalar(0.1),
          emissiveIntensity: 0.03,
        });
        const cone = new THREE.Mesh(coneGeo, coneMat);
        cone.position.y = trunkHeight * 0.6 + i * 1.2;
        cone.rotation.y = Math.random() * Math.PI;
        cone.castShadow = true;
        cone.receiveShadow = true;
        tree.add(cone);

        // Needle clusters (small spheres around cone)
        const clusterCount = 4 + Math.floor(Math.random() * 4);
        for (let j = 0; j < clusterCount; j++) {
          const clusterR = 0.3 + Math.random() * 0.5;
          const clusterGeo = new THREE.SphereGeometry(clusterR, 6, 5);
          const cluster = new THREE.Mesh(clusterGeo, coneMat.clone());
          const ca = (j / clusterCount) * Math.PI * 2;
          cluster.position.set(
            Math.cos(ca) * radius * 0.8,
            cone.position.y + (Math.random() - 0.5) * 0.5,
            Math.sin(ca) * radius * 0.8
          );
          cluster.castShadow = true;
          tree.add(cluster);
        }
      }
    } else if (treeType === 'oak') {
      // Oak: dense canopy with multiple overlapping spheres
      const canopyLayers = 3 + Math.floor(Math.random() * 3);
      for (let l = 0; l < canopyLayers; l++) {
        const sphereCount = 5 + Math.floor(Math.random() * 5);
        for (let i = 0; i < sphereCount; i++) {
          const radius = 1.2 + Math.random() * 2.0;
          const sphereGeo = new THREE.SphereGeometry(radius, 10, 8);

          // Leaf color variation (natural greens)
          const r = 0.08 + Math.random() * 0.12;
          const g = 0.22 + Math.random() * 0.18;
          const b = 0.03 + Math.random() * 0.07;
          const leafMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(r, g, b),
            roughness: 0.85 + Math.random() * 0.1,
            metalness: 0.0,
            emissive: new THREE.Color(r * 0.1, g * 0.1, b * 0.1),
            emissiveIntensity: 0.02,
          });

          const sphere = new THREE.Mesh(sphereGeo, leafMat);
          sphere.position.set(
            (Math.random() - 0.5) * 4,
            trunkHeight + l * 1.5 + Math.random() * 1.5,
            (Math.random() - 0.5) * 4
          );
          sphere.scale.set(
            0.8 + Math.random() * 0.4,
            0.7 + Math.random() * 0.3,
            0.8 + Math.random() * 0.4
          );
          sphere.castShadow = true;
          sphere.receiveShadow = true;
          tree.add(sphere);
        }
      }
    } else {
      // Birch: elegant, sparse canopy with light green
      const canopyLayers = 2 + Math.floor(Math.random() * 2);
      for (let l = 0; l < canopyLayers; l++) {
        const sphereCount = 3 + Math.floor(Math.random() * 4);
        for (let i = 0; i < sphereCount; i++) {
          const radius = 1.0 + Math.random() * 1.5;
          const sphereGeo = new THREE.SphereGeometry(radius, 8, 6);
          const leafMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(0.15 + Math.random() * 0.1, 0.35 + Math.random() * 0.15, 0.08 + Math.random() * 0.05),
            roughness: 0.8,
            metalness: 0.0,
            transparent: true,
            opacity: 0.85 + Math.random() * 0.1,
          });
          const sphere = new THREE.Mesh(sphereGeo, leafMat);
          sphere.position.set(
            (Math.random() - 0.5) * 3,
            trunkHeight + l * 2 + Math.random(),
            (Math.random() - 0.5) * 3
          );
          sphere.castShadow = true;
          sphere.receiveShadow = true;
          tree.add(sphere);
        }
      }
    }

    // Store wind data for animation
    tree.userData.windPhase = Math.random() * Math.PI * 2;
    tree.userData.windSpeed = 0.3 + Math.random() * 0.7;
    tree.userData.windStrength = 0.01 + Math.random() * 0.02;

    return tree;
  }

  _placeDeadTrees(gltf) {
    const positions = [
      { x: -12, z: -8 }, { x: 15, z: -18 }, { x: -18, z: -22 },
      { x: 8, z: -28 }, { x: -6, z: -32 },
    ];

    for (const p of positions) {
      const h = this._getTerrainHeight(p.x, p.z);
      const clone = gltf.scene.clone(true);
      clone.position.set(p.x, h, p.z);
      clone.scale.setScalar(0.9 + Math.random() * 0.3);
      clone.rotation.y = Math.random() * Math.PI * 2;
      clone.traverse(child => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          if (child.material) {
            child.material = child.material.clone();
            child.material.emissive = new THREE.Color(0x1a0a0a);
            child.material.emissiveIntensity = 0.05;
          }
        }
      });
      this._group.add(clone);
    }
  }

  _placeShrubs(gltf) {
    const variants = gltf.scene.children;
    if (variants.length === 0) return;

    for (let i = 0; i < 20; i++) {
      const x = (Math.random() - 0.5) * 60;
      const z = (Math.random() - 0.5) * 50 - 5;
      const h = this._getTerrainHeight(x, z);
      const variant = variants[Math.floor(Math.random() * variants.length)];
      const clone = variant.clone(true);
      clone.position.set(x, h, z);
      clone.scale.setScalar(0.8 + Math.random() * 0.8);
      clone.rotation.y = Math.random() * Math.PI * 2;
      clone.traverse(child => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          if (child.material) {
            child.material = child.material.clone();
            child.material.emissive = new THREE.Color(0x1a2a0a);
            child.material.emissiveIntensity = 0.12;
          }
        }
      });
      this._group.add(clone);
    }
  }

  _placeRocks(gltf) {
    const variants = gltf.scene.children;
    if (variants.length === 0) return;

    for (let i = 0; i < 12; i++) {
      const x = (Math.random() - 0.5) * 50;
      const z = (Math.random() - 0.5) * 40 - 5;
      const h = this._getTerrainHeight(x, z);
      const variant = variants[Math.floor(Math.random() * variants.length)];
      const clone = variant.clone(true);
      clone.position.set(x, h, z);
      clone.scale.setScalar(0.6 + Math.random() * 1.0);
      clone.rotation.y = Math.random() * Math.PI * 2;
      clone.traverse(child => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          if (child.material) {
            child.material = child.material.clone();
            child.material.emissive = new THREE.Color(0x1a1a1a);
            child.material.emissiveIntensity = 0.08;
          }
        }
      });
      this._group.add(clone);
    }
  }

  _placeFirePit(gltf) {
    const x = -3, z = -5;
    const h = this._getTerrainHeight(x, z);
    const clone = gltf.scene.clone(true);
    clone.position.set(x, h, z);
    clone.scale.setScalar(1.2);
    clone.rotation.y = Math.PI * 0.25;
    clone.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material) {
          child.material = child.material.clone();
          child.material.emissive = new THREE.Color(0x1a1a1a);
          child.material.emissiveIntensity = 0.1;
        }
      }
    });
    this._group.add(clone);

    // Fire light with flicker
    const fireLight = new THREE.PointLight(0xff6622, 4.0, 20);
    fireLight.position.set(x, h + 1.5, z);
    fireLight.castShadow = true;
    fireLight.shadow.mapSize.set(512, 512);
    this._group.add(fireLight);
    this._fireLight = fireLight;

    this._interactables.push({
      pos: new THREE.Vector3(x, h, z),
      type: 'campfire',
      label: 'Lagerfeuer (R)',
    });
  }

  _placeBarrels(gltf) {
    const positions = [
      { x: 3, z: -3 }, { x: 4, z: -3.5 }, { x: -7, z: -14 },
    ];

    for (const p of positions) {
      const h = this._getTerrainHeight(p.x, p.z);
      const clone = gltf.scene.clone(true);
      clone.position.set(p.x, h, p.z);
      clone.rotation.y = Math.random() * Math.PI * 2;
      clone.scale.setScalar(0.9 + Math.random() * 0.2);
      clone.traverse(child => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          if (child.material) {
            child.material = child.material.clone();
            child.material.emissive = new THREE.Color(0x1a1008);
            child.material.emissiveIntensity = 0.08;
          }
        }
      });
      this._group.add(clone);
    }
  }

  _buildLighting() {
    // Ambient — soft fill for visibility
    const ambient = new THREE.AmbientLight(0x4a4a6a, 0.5);
    this._group.add(ambient);

    // Hemisphere — sky/ground bounce
    const hemi = new THREE.HemisphereLight(0x6688aa, 0x2a2a1a, 0.6);
    this._group.add(hemi);

    // Moon light — directional, cool blue
    const moonLight = new THREE.DirectionalLight(0x8899bb, 1.8);
    moonLight.position.set(15, 25, 10);
    moonLight.castShadow = true;
    moonLight.shadow.mapSize.set(2048, 2048);
    moonLight.shadow.camera.near = 0.5;
    moonLight.shadow.camera.far = 60;
    moonLight.shadow.camera.left = -30;
    moonLight.shadow.camera.right = 30;
    moonLight.shadow.camera.top = 30;
    moonLight.shadow.camera.bottom = -30;
    moonLight.shadow.bias = -0.001;
    moonLight.shadow.normalBias = 0.02;
    this._group.add(moonLight);

    // Warm fill from opposite side
    const fillLight = new THREE.DirectionalLight(0x665544, 0.5);
    fillLight.position.set(-10, 8, -5);
    this._group.add(fillLight);

    // Rim light — back light for tree silhouettes
    const rimLight = new THREE.DirectionalLight(0x554466, 0.7);
    rimLight.position.set(0, 5, -20);
    this._group.add(rimLight);

    // Ground fog light — subtle blue glow near ground
    const fogLight = new THREE.PointLight(0x4455aa, 0.8, 30);
    fogLight.position.set(0, 0.5, -10);
    this._group.add(fogLight);
  }

  _buildSky() {
    // Sky dome — dark fantasy atmosphere
    const skyGeo = new THREE.SphereGeometry(200, 32, 20);
    const skyCanvas = document.createElement('canvas');
    skyCanvas.width = 2048;
    skyCanvas.height = 1024;
    const sctx = skyCanvas.getContext('2d');

    // Gradient — deep night sky
    const skyGrad = sctx.createLinearGradient(0, 0, 0, 1024);
    skyGrad.addColorStop(0, '#050510');
    skyGrad.addColorStop(0.2, '#0a0a1a');
    skyGrad.addColorStop(0.4, '#121228');
    skyGrad.addColorStop(0.6, '#1a1530');
    skyGrad.addColorStop(0.8, '#2a1a28');
    skyGrad.addColorStop(0.95, '#3a2520');
    skyGrad.addColorStop(1, '#4a3525');
    sctx.fillStyle = skyGrad;
    sctx.fillRect(0, 0, 2048, 1024);

    // Moon — large and detailed
    const moonX = 1600, moonY = 120;
    // Moon glow (large)
    const glowGrad = sctx.createRadialGradient(moonX, moonY, 0, moonX, moonY, 150);
    glowGrad.addColorStop(0, 'rgba(255, 250, 230, 0.2)');
    glowGrad.addColorStop(0.3, 'rgba(255, 240, 200, 0.08)');
    glowGrad.addColorStop(1, 'rgba(255, 230, 180, 0)');
    sctx.fillStyle = glowGrad;
    sctx.fillRect(moonX - 150, moonY - 150, 300, 300);

    // Moon body
    const moonGrad = sctx.createRadialGradient(moonX - 10, moonY - 10, 0, moonX, moonY, 40);
    moonGrad.addColorStop(0, 'rgba(255, 255, 245, 1)');
    moonGrad.addColorStop(0.7, 'rgba(255, 245, 220, 0.9)');
    moonGrad.addColorStop(1, 'rgba(255, 230, 180, 0.6)');
    sctx.beginPath();
    sctx.arc(moonX, moonY, 40, 0, Math.PI * 2);
    sctx.fillStyle = moonGrad;
    sctx.fill();

    // Moon craters
    sctx.fillStyle = 'rgba(200, 195, 180, 0.3)';
    sctx.beginPath(); sctx.arc(moonX - 10, moonY - 5, 8, 0, Math.PI * 2); sctx.fill();
    sctx.beginPath(); sctx.arc(moonX + 12, moonY + 8, 5, 0, Math.PI * 2); sctx.fill();
    sctx.beginPath(); sctx.arc(moonX + 5, moonY - 15, 6, 0, Math.PI * 2); sctx.fill();

    // Stars — many, varying brightness
    for (let i = 0; i < 1500; i++) {
      const brightness = 0.2 + Math.random() * 0.8;
      const size = Math.random() < 0.02 ? 3 : (Math.random() < 0.1 ? 2 : 1);
      sctx.fillStyle = `rgba(255, 255, 240, ${brightness})`;
      sctx.fillRect(Math.random() * 2048, Math.random() * 600, size, size);
    }

    // Milky way band
    sctx.globalAlpha = 0.03;
    for (let i = 0; i < 3000; i++) {
      const x = Math.random() * 2048;
      const y = 100 + Math.random() * 400;
      sctx.fillStyle = Math.random() > 0.5 ? '#aabbcc' : '#8899aa';
      sctx.fillRect(x, y, 1, 1);
    }
    sctx.globalAlpha = 1;

    const skyTex = new THREE.CanvasTexture(skyCanvas);
    const sky = new THREE.Mesh(
      skyGeo,
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, depthWrite: false })
    );
    this._group.add(sky);
  }

  _buildVolumetricFog() {
    // Particle-based fog layers - much more for larger world
    const fogCount = 600;
    const fogGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(fogCount * 3);
    const sizes = new Float32Array(fogCount);

    for (let i = 0; i < fogCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 180;
      positions[i * 3 + 1] = 0.2 + Math.random() * 1.5;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 180 - 10;
      sizes[i] = 3 + Math.random() * 8;
    }

    fogGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    fogGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    // Soft fog sprite
    const fogCanvas = document.createElement('canvas');
    fogCanvas.width = 64; fogCanvas.height = 64;
    const fctx = fogCanvas.getContext('2d');
    const fogGrad = fctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    fogGrad.addColorStop(0, 'rgba(150, 160, 180, 0.15)');
    fogGrad.addColorStop(0.5, 'rgba(120, 130, 160, 0.08)');
    fogGrad.addColorStop(1, 'rgba(100, 110, 140, 0)');
    fctx.fillStyle = fogGrad;
    fctx.fillRect(0, 0, 64, 64);

    const fogTex = new THREE.CanvasTexture(fogCanvas);
    const fogMat = new THREE.PointsMaterial({
      map: fogTex,
      size: 6,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

    this._fogParticles = new THREE.Points(fogGeo, fogMat);
    this._group.add(this._fogParticles);
  }

  _buildGodRays() {
    // Volumetric light rays from moon through trees
    this._godRays = [];
    const rayCount = 8;

    for (let i = 0; i < rayCount; i++) {
      const x = (Math.random() - 0.5) * 40;
      const z = (Math.random() - 0.5) * 30 - 5;
      const h = this._getTerrainHeight(x, z);

      // Light ray — cone shape pointing down
      const rayHeight = 8 + Math.random() * 6;
      const rayRadius = 0.3 + Math.random() * 0.5;
      const rayGeo = new THREE.ConeGeometry(rayRadius, rayHeight, 6);
      const rayMat = new THREE.MeshBasicMaterial({
        color: 0x8899bb,
        transparent: true,
        opacity: 0.04 + Math.random() * 0.04,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const ray = new THREE.Mesh(rayGeo, rayMat);
      ray.position.set(x, h + rayHeight / 2, z);
      ray.rotation.z = (Math.random() - 0.5) * 0.3; // slight angle
      ray.rotation.x = (Math.random() - 0.5) * 0.3;
      this._group.add(ray);
      this._godRays.push({ mesh: ray, baseOpacity: rayMat.opacity, phase: Math.random() * Math.PI * 2 });
    }
  }

  _buildEncounterZones() {
    this._encounterZones = [
      { pos: new THREE.Vector3(6, 0, -12), radius: 3.5, label: 'Dunkler Wald' },
      { pos: new THREE.Vector3(-8, 0, -16), radius: 3.5, label: 'Verfallene Ruinen' },
      { pos: new THREE.Vector3(10, 0, -10), radius: 3.5, label: 'Schattenhöhle' },
      { pos: new THREE.Vector3(-20, 0, -30), radius: 3.5, label: 'Dunkler Wald' },
      { pos: new THREE.Vector3(25, 0, -25), radius: 3.5, label: 'Schattenhöhle' },
      { pos: new THREE.Vector3(-30, 0, -40), radius: 3.5, label: 'Verfallene Ruinen' },
    ];

    // Roaming enemies that attack on approach
    this._roamingEnemies = [
      { pos: new THREE.Vector3(15, 0, -20), type: 'dark_wolf', hp: 80, maxHp: 80, attackRange: 4, attackCooldown: 0, state: 'patrol', patrolTarget: null, alertRange: 15 },
      { pos: new THREE.Vector3(-20, 0, -15), type: 'shadow_stalker', hp: 70, maxHp: 70, attackRange: 3.5, attackCooldown: 0, state: 'patrol', patrolTarget: null, alertRange: 18 },
      { pos: new THREE.Vector3(30, 0, -30), type: 'dark_wolf', hp: 80, maxHp: 80, attackRange: 4, attackCooldown: 0, state: 'patrol', patrolTarget: null, alertRange: 15 },
      { pos: new THREE.Vector3(-35, 0, -35), type: 'skeleton_warrior', hp: 100, maxHp: 100, attackRange: 4.5, attackCooldown: 0, state: 'patrol', patrolTarget: null, alertRange: 12 },
      { pos: new THREE.Vector3(40, 0, -40), type: 'cave_spider', hp: 60, maxHp: 60, attackRange: 3, attackCooldown: 0, state: 'patrol', patrolTarget: null, alertRange: 20 },
      { pos: new THREE.Vector3(-15, 0, -45), type: 'dark_mage', hp: 65, maxHp: 65, attackRange: 8, attackCooldown: 0, state: 'patrol', patrolTarget: null, alertRange: 16 },
    ];
    this._roamingMeshes = []; // store mesh references for animation

    for (const zone of this._encounterZones) {
      const h = this._getTerrainHeight(zone.pos.x, zone.pos.z);
      zone.pos.y = h;

      // Glowing marker cone
      const markerGeo = new THREE.ConeGeometry(0.4, 1.5, 8);
      const markerMat = new THREE.MeshStandardMaterial({
        color: 0xff4444, emissive: 0xff2222, emissiveIntensity: 2.0,
        transparent: true, opacity: 0.8,
      });
      const marker = new THREE.Mesh(markerGeo, markerMat);
      marker.position.set(zone.pos.x, h + 2.0, zone.pos.z);
      this._group.add(marker);
      zone.marker = marker;

      // Point light
      const zoneLight = new THREE.PointLight(0xff4444, 1.0, 10);
      zoneLight.position.set(zone.pos.x, h + 2.0, zone.pos.z);
      this._group.add(zoneLight);

      // Label sprite
      const labelCanvas = document.createElement('canvas');
      labelCanvas.width = 1024; labelCanvas.height = 256;
      const lctx = labelCanvas.getContext('2d');
      lctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      lctx.roundRect(100, 40, 824, 176, 20);
      lctx.fill();
      lctx.fillStyle = '#ff6644';
      lctx.font = 'bold 56px serif';
      lctx.textAlign = 'center';
      lctx.textBaseline = 'middle';
      lctx.shadowColor = '#ff2222';
      lctx.shadowBlur = 10;
      lctx.fillText(zone.label, 512, 128);
      const labelTex = new THREE.CanvasTexture(labelCanvas);
      const labelSprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: labelTex, transparent: true, depthWrite: false })
      );
      labelSprite.position.set(zone.pos.x, h + 4.0, zone.pos.z);
      labelSprite.scale.set(6, 1.5, 1);
      this._group.add(labelSprite);
      zone.labelSprite = labelSprite;

      // Danger ring
      const ringGeo = new THREE.RingGeometry(zone.radius - 0.15, zone.radius, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xff4444, transparent: true, opacity: 0.35, side: THREE.DoubleSide,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(zone.pos.x, h + 0.05, zone.pos.z);
      this._group.add(ring);
    }
  }

  _buildRoamingEnemies() {
    const enemyColors = {
      dark_wolf: 0x2a2a3a,
      shadow_stalker: 0x1a1a2a,
      skeleton_warrior: 0x8a8a7a,
      dark_mage: 0x2a1a3a,
      cave_spider: 0x3a1a1a,
    };

    for (const enemy of this._roamingEnemies) {
      const h = this._getTerrainHeight(enemy.pos.x, enemy.pos.z);
      enemy.pos.y = h;
      enemy.patrolTarget = new THREE.Vector3(
        enemy.pos.x + (Math.random() - 0.5) * 20,
        h,
        enemy.pos.z + (Math.random() - 0.5) * 20
      );

      // Create simple enemy mesh
      const mesh = new THREE.Group();
      const color = enemyColors[enemy.type] || 0x2a2a3a;
      const mat = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.8,
        emissive: color,
        emissiveIntensity: 0.1,
      });

      // Body
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 1.0, 8), mat);
      body.position.y = 0.8;
      body.castShadow = true;
      mesh.add(body);

      // Head
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), mat);
      head.position.y = 1.5;
      head.castShadow = true;
      mesh.add(head);

      // Eyes (glowing)
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff4444 });
      for (const side of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 4, 4), eyeMat);
        eye.position.set(0, 1.55, side * 0.1);
        mesh.add(eye);
      }

      // HP bar
      const hpCanvas = document.createElement('canvas');
      hpCanvas.width = 128; hpCanvas.height = 16;
      const hctx = hpCanvas.getContext('2d');
      hctx.fillStyle = '#222';
      hctx.fillRect(0, 0, 128, 16);
      hctx.fillStyle = '#ff4444';
      hctx.fillRect(2, 2, 124, 12);
      const hpTex = new THREE.CanvasTexture(hpCanvas);
      const hpMat = new THREE.SpriteMaterial({ map: hpTex, transparent: true, depthWrite: false });
      const hpBar = new THREE.Sprite(hpMat);
      hpBar.scale.set(1.5, 0.18, 1);
      hpBar.position.y = 2.0;
      mesh.add(hpBar);
      enemy.hpBar = hpBar;

      mesh.position.copy(enemy.pos);
      this._group.add(mesh);
      enemy.mesh = mesh;
      this._roamingMeshes.push(mesh);
    }
  }

  _buildInteractables() {
    // Well
    const wellX = 0, wellZ = -15;
    const wellH = this._getTerrainHeight(wellX, wellZ);
    this._interactables.push({
      pos: new THREE.Vector3(wellX, wellH, wellZ),
      type: 'well',
      label: 'Brunnen (R)',
    });

    // Build well structure
    const well = new THREE.Group();
    const stoneMat = new THREE.MeshStandardMaterial({
      color: 0x6a6a6a, roughness: 0.7, metalness: 0.1,
    });

    const baseGeo = new THREE.CylinderGeometry(0.8, 0.9, 1.0, 12);
    const base = new THREE.Mesh(baseGeo, stoneMat);
    base.position.y = 0.5;
    base.castShadow = true;
    base.receiveShadow = true;
    well.add(base);

    const waterGeo = new THREE.CircleGeometry(0.7, 12);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x2a4a6a, emissive: 0x1a2a3a, emissiveIntensity: 0.3,
      transparent: true, opacity: 0.8,
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.8;
    well.add(water);

    const postGeo = new THREE.CylinderGeometry(0.06, 0.06, 2.0, 6);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.7 });
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(side * 0.7, 1.5, 0);
      post.castShadow = true;
      well.add(post);
    }

    const beamGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6);
    const beam = new THREE.Mesh(beamGeo, postMat);
    beam.position.set(0, 2.5, 0);
    beam.rotation.z = Math.PI / 2;
    beam.castShadow = true;
    well.add(beam);

    well.position.set(wellX, wellH, wellZ);
    this._group.add(well);

    // Treasure chest
    const chestX = -10, chestZ = -20;
    const chestH = this._getTerrainHeight(chestX, chestZ);
    this._interactables.push({
      pos: new THREE.Vector3(chestX, chestH, chestZ),
      type: 'chest',
      label: 'Schatztruhe (R)',
    });
    this._buildChest(chestX, chestH, chestZ);

    // Supply crate
    const crateX = 12, crateZ = -8;
    const crateH = this._getTerrainHeight(crateX, crateZ);
    this._interactables.push({
      pos: new THREE.Vector3(crateX, crateH, crateZ),
      type: 'crate',
      label: 'Vorratskiste (R)',
    });
    this._buildCrate(crateX, crateH, crateZ);

    // Ancient book
    const bookX = -5, bookZ = -25;
    const bookH = this._getTerrainHeight(bookX, bookZ);
    this._interactables.push({
      pos: new THREE.Vector3(bookX, bookH, bookZ),
      type: 'book',
      label: 'Altes Buch (R)',
    });
    this._buildBook(bookX, bookH, bookZ);
  }

  _buildChest(x, y, z) {
    const chest = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x5a3a1a, roughness: 0.8 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: 0.3, metalness: 0.8 });

    // Box
    const boxGeo = new THREE.BoxGeometry(0.8, 0.5, 0.4);
    const box = new THREE.Mesh(boxGeo, woodMat);
    box.position.y = 0.25;
    box.castShadow = true;
    chest.add(box);

    // Lid
    const lidGeo = new THREE.BoxGeometry(0.8, 0.15, 0.4);
    const lid = new THREE.Mesh(lidGeo, woodMat);
    lid.position.y = 0.55;
    lid.castShadow = true;
    chest.add(lid);

    // Metal bands
    const bandGeo = new THREE.BoxGeometry(0.82, 0.05, 0.42);
    for (const yy of [0.15, 0.35]) {
      const band = new THREE.Mesh(bandGeo, metalMat);
      band.position.y = yy;
      chest.add(band);
    }

    // Lock
    const lockGeo = new THREE.BoxGeometry(0.1, 0.1, 0.05);
    const lock = new THREE.Mesh(lockGeo, metalMat);
    lock.position.set(0, 0.35, 0.22);
    chest.add(lock);

    chest.position.set(x, y, z);
    chest.rotation.y = Math.random() * Math.PI * 2;
    this._group.add(chest);
  }

  _buildCrate(x, y, z) {
    const crate = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x6a5a3a, roughness: 0.9 });

    // Box
    const boxGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
    const box = new THREE.Mesh(boxGeo, woodMat);
    box.position.y = 0.3;
    box.castShadow = true;
    crate.add(box);

    // Cross planks
    const plankGeo = new THREE.BoxGeometry(0.62, 0.08, 0.08);
    for (const side of [-1, 1]) {
      const plank = new THREE.Mesh(plankGeo, woodMat);
      plank.position.set(0, 0.3, side * 0.3);
      crate.add(plank);
    }

    crate.position.set(x, y, z);
    crate.rotation.y = Math.random() * Math.PI * 2;
    this._group.add(crate);
  }

  _buildBook(x, y, z) {
    const book = new THREE.Group();
    const coverMat = new THREE.MeshStandardMaterial({ color: 0x3a1a1a, roughness: 0.7 });
    const pageMat = new THREE.MeshStandardMaterial({ color: 0xd4c8a8, roughness: 0.9 });

    // Cover
    const coverGeo = new THREE.BoxGeometry(0.3, 0.04, 0.4);
    const cover = new THREE.Mesh(coverGeo, coverMat);
    cover.position.y = 0.02;
    cover.castShadow = true;
    book.add(cover);

    // Pages
    const pageGeo = new THREE.BoxGeometry(0.28, 0.03, 0.38);
    const page = new THREE.Mesh(pageGeo, pageMat);
    page.position.y = 0.04;
    book.add(page);

    // Glow effect
    const glowGeo = new THREE.PlaneGeometry(0.5, 0.5);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x4488ff, transparent: true, opacity: 0.15,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.08;
    book.add(glow);

    // Light
    const bookLight = new THREE.PointLight(0x4488ff, 0.5, 5);
    bookLight.position.y = 0.5;
    book.add(bookLight);

    book.position.set(x, y + 0.1, z);
    book.rotation.y = Math.random() * Math.PI * 2;
    this._group.add(book);
  }

  _buildPlayerIndicator() {
    // Player body — detailed humanoid adventurer
    this._playerBody = new THREE.Group();

    // ── TORSO with armor ──
    const armorMat = new THREE.MeshStandardMaterial({
      color: 0x3a5a7a, roughness: 0.5, metalness: 0.3,
    });
    const torsoGeo = new THREE.CylinderGeometry(0.22, 0.28, 0.65, 8);
    const torso = new THREE.Mesh(torsoGeo, armorMat);
    torso.position.y = 1.15;
    torso.castShadow = true;
    this._playerBody.add(torso);

    // Chest plate
    const chestGeo = new THREE.BoxGeometry(0.35, 0.25, 0.15);
    const chestPlate = new THREE.Mesh(chestGeo, armorMat);
    chestPlate.position.set(0, 1.2, 0.12);
    chestPlate.castShadow = true;
    this._playerBody.add(chestPlate);

    // Belt
    const beltGeo = new THREE.CylinderGeometry(0.29, 0.29, 0.08, 8);
    const beltMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.8 });
    const belt = new THREE.Mesh(beltGeo, beltMat);
    belt.position.y = 0.85;
    this._playerBody.add(belt);

    // ── HEAD with helmet ──
    const headGeo = new THREE.SphereGeometry(0.17, 8, 8);
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xd4a574, roughness: 0.7,
    });
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.y = 1.62;
    head.castShadow = true;
    this._playerBody.add(head);

    // Helmet
    const helmetGeo = new THREE.SphereGeometry(0.2, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.6);
    const helmetMat = new THREE.MeshStandardMaterial({
      color: 0x4a6a8a, roughness: 0.4, metalness: 0.5,
    });
    const helmet = new THREE.Mesh(helmetGeo, helmetMat);
    helmet.position.y = 1.65;
    helmet.castShadow = true;
    this._playerBody.add(helmet);

    // ── LEGS with boots ──
    const legMat = new THREE.MeshStandardMaterial({ color: 0x3a3a4a, roughness: 0.8 });
    const bootMat = new THREE.MeshStandardMaterial({ color: 0x2a2a1a, roughness: 0.9 });
    for (const side of [-1, 1]) {
      // Thigh
      const thighGeo = new THREE.CylinderGeometry(0.09, 0.1, 0.3, 6);
      const thigh = new THREE.Mesh(thighGeo, legMat);
      thigh.position.set(side * 0.13, 0.65, 0);
      thigh.castShadow = true;
      this._playerBody.add(thigh);

      // Shin
      const shinGeo = new THREE.CylinderGeometry(0.08, 0.09, 0.3, 6);
      const shin = new THREE.Mesh(shinGeo, legMat);
      shin.position.set(side * 0.13, 0.35, 0);
      shin.castShadow = true;
      this._playerBody.add(shin);

      // Boot
      const bootGeo = new THREE.BoxGeometry(0.14, 0.12, 0.2);
      const boot = new THREE.Mesh(bootGeo, bootMat);
      boot.position.set(side * 0.13, 0.15, 0.03);
      boot.castShadow = true;
      this._playerBody.add(boot);
    }

    // ── ARMS with gauntlets ──
    for (const side of [-1, 1]) {
      // Upper arm
      const upperArmGeo = new THREE.CylinderGeometry(0.07, 0.08, 0.3, 6);
      const upperArm = new THREE.Mesh(upperArmGeo, armorMat);
      upperArm.position.set(side * 0.32, 1.1, 0);
      upperArm.castShadow = true;
      this._playerBody.add(upperArm);

      // Forearm
      const forearmGeo = new THREE.CylinderGeometry(0.06, 0.07, 0.3, 6);
      const forearm = new THREE.Mesh(forearmGeo, armorMat);
      forearm.position.set(side * 0.32, 0.85, 0);
      forearm.castShadow = true;
      this._playerBody.add(forearm);

      // Hand/gauntlet
      const handGeo = new THREE.SphereGeometry(0.06, 6, 6);
      const hand = new THREE.Mesh(handGeo, bootMat);
      hand.position.set(side * 0.32, 0.7, 0);
      this._playerBody.add(hand);
    }

    // ── WEAPON (sword on back) ──
    const swordMat = new THREE.MeshStandardMaterial({
      color: 0x8a8a9a, roughness: 0.2, metalness: 0.8,
    });
    const bladeGeo = new THREE.BoxGeometry(0.04, 0.7, 0.02);
    const blade = new THREE.Mesh(bladeGeo, swordMat);
    blade.position.set(0.15, 1.3, -0.2);
    blade.rotation.x = 0.2;
    blade.castShadow = true;
    this._playerBody.add(blade);

    // Sword guard
    const guardGeo = new THREE.BoxGeometry(0.15, 0.03, 0.04);
    const guard = new THREE.Mesh(guardGeo, bootMat);
    guard.position.set(0.15, 0.95, -0.2);
    this._playerBody.add(guard);

    // Sword handle
    const handleGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.15, 6);
    const handle = new THREE.Mesh(handleGeo, bootMat);
    handle.position.set(0.15, 0.87, -0.2);
    this._playerBody.add(handle);

    this._group.add(this._playerBody);

    // Ground indicator ring
    const indicatorGeo = new THREE.RingGeometry(0.2, 0.3, 16);
    const indicatorMat = new THREE.MeshBasicMaterial({
      color: 0x44aaff, emissive: 0x2288ff, emissiveIntensity: 0.8,
      transparent: true, opacity: 0.6, side: THREE.DoubleSide,
    });
    this._playerIndicator = new THREE.Mesh(indicatorGeo, indicatorMat);
    this._playerIndicator.rotation.x = -Math.PI / 2;
    this._playerIndicator.position.y = 0.05;
    this._group.add(this._playerIndicator);
  }

  show() {
    this._group.traverse(c => { c.visible = true; });
    this._group.visible = true;
    this._visible = true;
    this.camera.position.set(0, 8, 12);
    this.camera.lookAt(0, 1, 0);
  }

  hide() {
    this._group.traverse(c => { c.visible = false; });
    this._group.visible = false;
    this._visible = false;
  }

  get visible() { return this._visible; }

  update(deltaTime, keys, mouseAngleX = 0, mouseAngleY = 0, cameraDistance = 10) {
    if (!this._visible) return;

    // Mouse controls camera angle (yaw), WASD moves relative to camera
    this._playerAngle = mouseAngleX;

    const speed = 10 * deltaTime;
    let moved = false;

    if (keys['KeyW'] || keys['ArrowUp']) {
      this._playerPos.x += Math.sin(this._playerAngle) * speed;
      this._playerPos.z += Math.cos(this._playerAngle) * speed;
      moved = true;
    }
    if (keys['KeyS'] || keys['ArrowDown']) {
      this._playerPos.x -= Math.sin(this._playerAngle) * speed * 0.6;
      this._playerPos.z -= Math.cos(this._playerAngle) * speed * 0.6;
      moved = true;
    }
    if (keys['KeyA'] || keys['ArrowLeft']) {
      this._playerPos.x += Math.cos(this._playerAngle) * speed * 0.6;
      this._playerPos.z -= Math.sin(this._playerAngle) * speed * 0.6;
      moved = true;
    }
    if (keys['KeyD'] || keys['ArrowRight']) {
      this._playerPos.x -= Math.cos(this._playerAngle) * speed * 0.6;
      this._playerPos.z += Math.sin(this._playerAngle) * speed * 0.6;
      moved = true;
    }

    // Clamp to world bounds (much larger world)
    this._playerPos.x = Math.max(-100, Math.min(100, this._playerPos.x));
    this._playerPos.z = Math.max(-100, Math.min(100, this._playerPos.z));

    // Get terrain height for player
    const playerH = this._getTerrainHeight(this._playerPos.x, this._playerPos.z);

    // Update player body (foot offset: boots bottom at Y=0.09 in local coords)
    if (this._playerBody) {
      this._playerBody.position.x = this._playerPos.x;
      this._playerBody.position.z = this._playerPos.z;
      this._playerBody.position.y = playerH - 0.09;
      this._playerBody.rotation.y = this._playerAngle;
    }

    // Update player indicator
    if (this._playerIndicator) {
      this._playerIndicator.position.x = this._playerPos.x;
      this._playerIndicator.position.z = this._playerPos.z;
      this._playerIndicator.position.y = playerH + 0.05;
    }

    // ── ROAMING ENEMY AI ──
    for (const enemy of this._roamingEnemies) {
      if (enemy.hp <= 0) continue;

      const distToPlayer = new THREE.Vector2(
        this._playerPos.x - enemy.pos.x,
        this._playerPos.z - enemy.pos.z
      ).length();

      // State machine
      if (distToPlayer < enemy.alertRange) {
        // CHASE state
        enemy.state = 'chase';
        const dir = new THREE.Vector2(
          this._playerPos.x - enemy.pos.x,
          this._playerPos.z - enemy.pos.z
        ).normalize();

        if (distToPlayer > enemy.attackRange) {
          // Move toward player
          const moveSpeed = 3 * deltaTime;
          enemy.pos.x += dir.x * moveSpeed;
          enemy.pos.z += dir.y * moveSpeed;
        } else {
          // Attack!
          enemy.attackCooldown -= deltaTime;
          if (enemy.attackCooldown <= 0) {
            enemy.attackCooldown = 2.0;
            // Trigger battle encounter
            if (this._onEncounter) {
              this._onEncounter({
                label: 'Rovernder Angriff!',
                name: 'roaming_' + enemy.type,
                roamingEnemy: enemy,
              });
            }
          }
        }

        // Face player
        enemy.mesh.rotation.y = Math.atan2(dir.x, dir.y);
      } else {
        // PATROL state
        enemy.state = 'patrol';
        const distToPatrol = new THREE.Vector2(
          enemy.patrolTarget.x - enemy.pos.x,
          enemy.patrolTarget.z - enemy.pos.z
        ).length();

        if (distToPatrol < 2) {
          // New patrol target
          enemy.patrolTarget.set(
            enemy.pos.x + (Math.random() - 0.5) * 30,
            enemy.pos.y,
            enemy.pos.z + (Math.random() - 0.5) * 30
          );
        } else {
          // Move toward patrol target
          const pdir = new THREE.Vector2(
            enemy.patrolTarget.x - enemy.pos.x,
            enemy.patrolTarget.z - enemy.pos.z
          ).normalize();
          const moveSpeed = 1.5 * deltaTime;
          enemy.pos.x += pdir.x * moveSpeed;
          enemy.pos.z += pdir.y * moveSpeed;
          enemy.mesh.rotation.y = Math.atan2(pdir.x, pdir.y);
        }
      }

      // Update mesh position
      const eh = this._getTerrainHeight(enemy.pos.x, enemy.pos.z);
      enemy.mesh.position.set(enemy.pos.x, eh, enemy.pos.z);

      // Idle bob animation
      enemy.mesh.children[0].position.y = 0.8 + Math.sin(performance.now() / 500) * 0.05;
    }

    // Camera follows player (third-person) with mouse control
    const camOffset = new THREE.Vector3(
      -Math.sin(this._playerAngle) * cameraDistance,
      cameraDistance * 0.5 + Math.sin(mouseAngleY) * cameraDistance * 0.5,
      -Math.cos(this._playerAngle) * cameraDistance
    );
    const targetCamPos = this._playerPos.clone().add(camOffset);
    targetCamPos.y = Math.max(targetCamPos.y, playerH + 3); // stay above terrain
    this.camera.position.lerp(targetCamPos, Math.min(deltaTime * 8, 1));
    const lookTarget = this._playerPos.clone().add(new THREE.Vector3(0, 2, 0));
    this.camera.lookAt(lookTarget);

    // Animate encounter markers
    const time = performance.now() / 1000;
    for (const zone of this._encounterZones) {
      if (zone.marker) {
        zone.marker.rotation.y = time * 2;
        zone.marker.position.y = zone.pos.y + 1.5 + Math.sin(time * 3) * 0.3;
      }
    }

    // Wind animation for trees
    for (const tree of this._trees) {
      if (!tree.userData.windPhase) continue;
      const wind = Math.sin(time * tree.userData.windSpeed + tree.userData.windPhase) * tree.userData.windStrength;
      tree.rotation.z = wind;
      tree.rotation.x = wind * 0.5;
    }

    // God rays animation — subtle pulsing
    for (const ray of this._godRays) {
      ray.mesh.material.opacity = ray.baseOpacity * (0.7 + Math.sin(time * 0.5 + ray.phase) * 0.3);
    }

    // Fire light flicker
    if (this._fireLight) {
      this._fireLight.intensity = 2.5 + Math.sin(time * 8) * 0.8 + Math.sin(time * 13) * 0.5;
    }

    // Animate fog particles
    if (this._fogParticles) {
      const fogPos = this._fogParticles.geometry.attributes.position;
      for (let i = 0; i < fogPos.count; i++) {
        let x = fogPos.getX(i);
        let y = fogPos.getY(i);
        x += Math.sin(time * 0.3 + i) * 0.01;
        y += Math.sin(time * 0.5 + i * 0.7) * 0.002;
        fogPos.setX(i, x);
        fogPos.setY(i, y);
      }
      fogPos.needsUpdate = true;
    }

    // Check encounter zones
    for (const zone of this._encounterZones) {
      const dist = new THREE.Vector2(
        this._playerPos.x - zone.pos.x,
        this._playerPos.z - zone.pos.z
      ).length();
      if (dist < zone.radius && keys['KeyR']) {
        if (this._onEncounter) this._onEncounter(zone);
      }
    }

    // Check interactables
    for (const item of this._interactables) {
      const dist = new THREE.Vector2(
        this._playerPos.x - item.pos.x,
        this._playerPos.z - item.pos.z
      ).length();
      if (dist < 3 && keys['KeyR']) {
        if (this._onInteract) this._onInteract(item);
      }
    }
  }

  setOnEncounter(callback) { this._onEncounter = callback; }
  setOnInteract(callback) { this._onInteract = callback; }

  dispose() {
    if (!this._group.parent) return;
    this._group.traverse(child => {
      if (child.isMesh || child.isSprite || child.isPoints) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            for (const m of child.material) m.dispose();
          } else {
            for (const key of ['map', 'normalMap', 'roughnessMap', 'emissiveMap', 'envMap', 'aoMap']) {
              if (child.material[key]) child.material[key].dispose();
            }
            child.material.dispose();
          }
        }
      }
      if (child.isLight && child.shadow?.map) child.shadow.map.dispose();
    });
    this._group.parent.remove(this._group);
  }
}
