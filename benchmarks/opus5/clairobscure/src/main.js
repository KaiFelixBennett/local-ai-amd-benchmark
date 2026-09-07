/**
 * Entry point.
 *
 * Dynamically imports the app so a failure anywhere in the module graph — a bad
 * CDN response, a missing asset, an unsupported browser — surfaces as a
 * readable panel instead of a blank screen. Global error and rejection handlers
 * catch anything that escapes later.
 */

const bootEl = document.getElementById('boot');
const bootMsg = document.getElementById('boot-msg');
const bootBar = document.getElementById('boot-bar');
const fatalEl = document.getElementById('fatal');
const fatalMsg = document.getElementById('fatal-msg');
const fatalDetail = document.getElementById('fatal-detail');

let fatalShown = false;

function showFatal(message, error) {
  if (fatalShown) return;
  fatalShown = true;
  if (bootEl) bootEl.classList.add('gone');
  if (fatalMsg) fatalMsg.textContent = message;
  if (fatalDetail) {
    fatalDetail.textContent = error && error.stack ? error.stack : String(error || 'no further detail');
  }
  if (fatalEl) fatalEl.classList.add('show');
  console.error(message, error);
}

window.addEventListener('error', (e) => {
  showFatal('An unexpected error occurred while running the expedition.', e.error || e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  showFatal('An unexpected error occurred while loading the expedition.', e.reason);
});

function setBoot(text, frac) {
  if (bootMsg) bootMsg.textContent = text;
  if (bootBar && frac !== undefined) bootBar.style.width = `${Math.round(frac * 100)}%`;
}

function supportsWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext
      && (c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl')));
  } catch (err) {
    return false;
  }
}

const LABELS = {
  systems: 'WAKING THE EXPEDITION',
  environment: 'UNROLLING THE SKY',
  cobble: 'LAYING THE PARVIS',
  blocks: 'SETTING THE STONE',
  ground: 'FLOODING THE PARKLAND',
  rock: 'RAISING THE RIDGE',
  streetLamp: 'LIGHTING THE LAMPS',
  ironGate: 'HANGING THE GATE',
  chandelier: 'SUSPENDING THE CHANDELIERS',
  whaleStatue: 'GILDING THE MONUMENT',
  soldier: 'MUSTERING THE EXPEDITION',
  michelle: 'MUSTERING THE EXPEDITION',
  xbot: 'MUSTERING THE EXPEDITION',
  world: 'PLACING THE FALLEN',
  ready: 'READY',
};

async function boot() {
  if (!supportsWebGL()) {
    showFatal(
      'This browser does not expose a WebGL context, which the expedition requires.',
      'WebGL unavailable',
    );
    return;
  }

  setBoot('LOADING MODULES…', 0.02);
  let App;
  try {
    ({ App } = await import('./app.js'));
  } catch (err) {
    showFatal(
      'A module failed to load. Serve the project over HTTP (node serve.mjs) rather than '
      + 'opening it from the file system, and make sure unpkg.com is reachable for three.js.',
      err,
    );
    return;
  }

  const glCanvas = document.getElementById('gl');
  const hudCanvas = document.getElementById('hud');
  let app;
  try {
    app = new App(glCanvas, hudCanvas);
    await app.init((frac, label) => {
      setBoot(LABELS[label] || String(label).toUpperCase(), frac);
    });
  } catch (err) {
    showFatal('The expedition failed to make landfall.', err);
    return;
  }

  app.bus.on('fatal', (err) => showFatal('The expedition stopped unexpectedly.', err));

  if (app.assetFailures.length) {
    console.warn('[assets] some assets were unavailable:', app.assetFailures);
  }

  setBoot('READY', 1);
  app.start();

  window.setTimeout(() => {
    if (bootEl) bootEl.classList.add('gone');
  }, 500);

  window.__gildedRequiem = app;
}

boot();
