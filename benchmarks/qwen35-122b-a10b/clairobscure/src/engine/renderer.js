import * as THREE from 'three';

// Battle stage renderer setup
let scene, camera, renderer, clock;
let ambientLight, keyLight, fillLight, rimLight;
let targetEntity = null;
const cameraOffset = new THREE.Vector3(8, 6, 10);
const cameraLookAt = new THREE.Vector3(0, 1, 0);

export function initRenderer(container) {
  clock = new THREE.Clock();
  
  // Scene with fog for painterly depth
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1520);
  scene.fog = new THREE.FogExp2(0x1a1520, 0.08);

  // Camera setup
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
  updateCombatCamera();

  // Renderer with proper color management
  renderer = new THREE.WebGLRenderer({ 
    antialias: true, 
    powerPreference: 'high-performance'
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  
  container.appendChild(renderer.domElement);

  // Lighting setup for Belle Époque aesthetic
  setupLights();

  // Create battle stage
  createBattleStage();

  // Handle resize
  window.addEventListener('resize', onWindowResize);

  return { scene, camera, renderer, clock };
}

function setupLights() {
  // Ambient fill - cool tone for base illumination
  ambientLight = new THREE.AmbientLight(0x4a5568, 0.4);
  scene.add(ambientLight);

  // Warm key light (sun-like from upper right)
  keyLight = new THREE.DirectionalLight(0xffeebb, 1.2);
  keyLight.position.set(10, 15, 8);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 2048;
  keyLight.shadow.mapSize.height = 2048;
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 50;
  keyLight.shadow.camera.left = -15;
  keyLight.shadow.camera.right = 15;
  keyLight.shadow.camera.top = 15;
  keyLight.shadow.camera.bottom = -15;
  scene.add(keyLight);

  // Cool fill light (from opposite side)
  fillLight = new THREE.DirectionalLight(0x6b8cff, 0.3);
  fillLight.position.set(-8, 5, -5);
  scene.add(fillLight);

  // Rim/back light for character separation
  rimLight = new THREE.SpotLight(0xffd700, 0.8);
  rimLight.position.set(0, 10, -10);
  rimLight.angle = Math.PI / 4;
  rimLight.penumbra = 0.3;
  scene.add(rimLight);
}

function createBattleStage() {
  // Ground plane with procedural texture (created in textures.js)
  const groundGeometry = new THREE.PlaneGeometry(40, 20);
  
  // Simple gradient ground color for now
  const groundMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x3d324a,
    roughness: 0.9,
    metalness: 0.1,
    side: THREE.DoubleSide
  });
  
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.name = 'battleStage';
  scene.add(ground);

  // Decorative pillars on sides (art nouveau style)
  createPillars();

  // Floating paint motes environment
  createPaintMotes();
}

function createPillars() {
  const pillarMaterial = new THREE.MeshStandardMaterial({
    color: 0x5c4d7d,
    roughness: 0.6,
    metalness: 0.3
  });

  for (let i = -1; i <= 1; i++) {
    // Left side pillars
    const leftPillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.5, 8, 16),
      pillarMaterial
    );
    leftPillar.position.set(-9 + i * 4, 4, -3);
    leftPillar.castShadow = true;
    leftPillar.receiveShadow = true;
    scene.add(leftPillar);

    // Right side pillars
    const rightPillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.5, 8, 16),
      pillarMaterial
    );
    rightPillar.position.set(9 - i * 4, 4, -3);
    rightPillar.castShadow = true;
    rightPillar.receiveShadow = true;
    scene.add(rightPillar);
  }
}

function createPaintMotes() {
  const moteCount = 100;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(moteCount * 3);
  const colors = new Float32Array(moteCount * 3);

  for (let i = 0; i < moteCount; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 30;
    positions[i * 3 + 1] = Math.random() * 10;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 15;

    const color = new THREE.Color();
    color.setHSL(0.6 + Math.random() * 0.2, 0.6, 0.5);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 0.15,
    vertexColors: true,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending
  });

  const motes = new THREE.Points(geometry, material);
  motes.name = 'paintMotes';
  scene.add(motes);
}

export function updateCombatCamera() {
  if (targetEntity) {
    // Dynamic combat camera focused on target
    const targetPos = targetEntity.position.clone();
    camera.position.copy(targetPos).add(cameraOffset);
    camera.lookAt(targetPos.x, targetPos.y + 1, targetPos.z);
  } else {
    // Default view showing both sides
    camera.position.set(0, 8, 15);
    camera.lookAt(0, 1, 0);
  }
}

export function setCameraTarget(entity) {
  targetEntity = entity;
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

export function render() {
  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

export function getScene() { return scene; }
export function getCamera() { return camera; }
export function getRenderer() { return renderer; }
export function getClock() { return clock; }

// Get battle stage bounds for positioning
export function getStageBounds() {
  return { x: 18, y: 10, z: 8 };
}
