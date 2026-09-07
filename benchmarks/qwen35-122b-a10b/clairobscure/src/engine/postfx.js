import * as THREE from 'three';

let composer = null;
let usePostprocessing = true;

// Try to initialize postprocessing, fall back gracefully if unavailable
export async function initPostProcessing(renderer, scene, camera) {
  try {
    const { EffectComposer } = await import('three/addons/postprocessing/EffectComposer.js');
    const { RenderPass } = await import('three/addons/postprocessing/RenderPass.js');
    const { UnrealBloomPass } = await import('three/addons/postprocessing/UnrealBloomPass.js');
    const { OutputPass } = await import('three/addons/postprocessing/OutputPass.js');

    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));

    // Subtle bloom for gilded highlights and magic effects
    const bloomPass = new UnrealBloomPass(
      1.0,   // resolution
      0.4,   // strength
      0.8,   // radius
      0.0    // threshold
    );
    composer.addPass(bloomPass);

    // Output pass for proper color management
    const outputPass = new OutputPass();
    composer.addPass(outputPass);

    console.log('Post-processing initialized with bloom');
  } catch (err) {
    console.warn('Post-processing unavailable, using direct render:', err.message);
    usePostprocessing = false;
  }
}

export function renderWithPostProcessing() {
  if (composer) {
    composer.render();
  }
}

export function hasComposer() {
  return composer !== null;
}

// Screen-space FX applied via canvas overlay (safer than WebGL post-processing)
let overlayCanvas = null;
let ctx = null;
let hitFlashOpacity = 0;
let parryFlashOpacity = 0;
let vignetteIntensity = 0.3;

export function initOverlay() {
  overlayCanvas = document.getElementById('overlay');
  if (overlayCanvas) {
    ctx = overlayCanvas.getContext('2d');
    resizeOverlay();
  }
}

export function resizeOverlay() {
  if (overlayCanvas) {
    overlayCanvas.width = window.innerWidth;
    overlayCanvas.height = window.innerHeight;
  }
}

export function triggerHitFlash(intensity = 0.5) {
  hitFlashOpacity = intensity;
}

export function triggerParryFlash(intensity = 0.7) {
  parryFlashOpacity = intensity;
}

export function setVignetteIntensity(value) {
  vignetteIntensity = Math.max(0, Math.min(1, value));
}

// Import Tone for audio integration (lazy loaded)
let toneInitialized = false;

export function drawOverlay(deltaTime) {
  if (!ctx) return;

  // Hit flash (red tint on damage)
  if (hitFlashOpacity > 0.01) {
    ctx.fillStyle = `rgba(255, 50, 50, ${hitFlashOpacity})`;
    ctx.fillRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    hitFlashOpacity -= deltaTime * 2;
  }

  // Parry flash (gold/white burst)
  if (parryFlashOpacity > 0.01) {
    ctx.fillStyle = `rgba(255, 220, 100, ${parryFlashOpacity})`;
    ctx.fillRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    parryFlashOpacity -= deltaTime * 3;
  }

  // Vignette (darkened corners) - DO NOT CLEAR first, just draw on top
  if (vignetteIntensity > 0.01) {
    const gradient = ctx.createRadialGradient(
      overlayCanvas.width / 2,
      overlayCanvas.height / 2,
      overlayCanvas.height * 0.3,
      overlayCanvas.width / 2,
      overlayCanvas.height / 2,
      overlayCanvas.height * 0.8
    );
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(1, `rgba(0, 0, 0, ${vignetteIntensity})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  }

  // Film grain (subtle texture) - skip this for performance
  // drawFilmGrain();
}

function drawFilmGrain() {
  const imageData = ctx.getImageData(0, 0, overlayCanvas.width, overlayCanvas.height);
  const data = imageData.data;
  
  for (let i = 0; i < data.length; i += 4) {
    const grain = (Math.random() - 0.5) * 15;
    data[i] = Math.max(0, Math.min(255, data[i] + grain));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + grain));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + grain));
  }
  
  ctx.putImageData(imageData, 0, 0);
}

export function getOverlayCanvas() {
  return overlayCanvas;
}
