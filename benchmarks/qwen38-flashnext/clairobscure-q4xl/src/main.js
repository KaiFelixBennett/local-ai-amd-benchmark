// Entry point. Loads the game behind a wall of error handling: if the three.js
// import map fails (offline / CDN blocked), WebGL is unavailable, or any module
// throws on load, the user sees a legible message instead of a black screen.

function showFatal(title, detail) {
  const el = document.getElementById('fatal');
  if (!el) { alert(`${title}\n\n${detail}`); return; }
  el.querySelector('h1').textContent = title;
  el.querySelector('p').textContent = detail;
  el.classList.add('show');
}

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (err) {
    return false;
  }
}

async function boot() {
  if (!webglAvailable()) {
    showFatal('WebGL unavailable',
      'This game needs WebGL. Enable hardware acceleration or try a different browser.');
    return;
  }
  let mod;
  try {
    mod = await import('./game.js');
  } catch (err) {
    console.error(err);
    showFatal('Failed to load the game',
      'Could not load game modules. If this is your first run, the three.js CDN ' +
      '(unpkg.com) may be unreachable — check your connection and reload. ' +
      '(Serve this folder over http, e.g. `npx serve .`)');
    return;
  }
  try {
    window.game = new mod.Game({
      glCanvas: document.getElementById('gl'),
      overlayCanvas: document.getElementById('overlay'),
      uiRoot: document.getElementById('ui'),
      banner: document.getElementById('hint')
    });
    document.getElementById('loading').classList.remove('show');
    // Seed is reproducible: show it, and support ?seed=123 URLs.
    const seedEl = document.getElementById('seed');
    if (seedEl) seedEl.textContent = 'seed ' + window.game.seed;
  } catch (err) {
    console.error(err);
    showFatal('Startup error', String(err && err.message ? err.message : err));
  }
}

// Catch module-load failures for THREE itself (import map resolution errors
// surface as unhandled rejections on the dynamic chain).
window.addEventListener('unhandledrejection', (e) => {
  if (!window.game) showFatal('Unexpected error', String(e.reason));
});
window.addEventListener('error', (e) => {
  if (!window.game && e.message) showFatal('Unexpected error', e.message);
});

// Restart button on the victory/defeat overlays.
document.addEventListener('click', (e) => {
  const btn = e.target.closest && e.target.closest('[data-restart]');
  if (btn && window.game) window.game.restart();
});

// Click-to-start gesture unlocks audio (autoplay policy) on the first click.
document.addEventListener('pointerdown', () => {
  if (window.game) window.game.audio.ensureStarted();
}, { once: false });

boot();
