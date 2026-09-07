// main.js — bootstrap: renderer, postfx, audio; builds Game; starts loop.
// Handles WebGL context loss/restore + failed module import with visible message.
import * as THREE from 'three';
import { Renderer } from './engine/renderer.js';
import { setupPostfx } from './engine/postfx.js';
import { AudioEngine } from './engine/audio.js';
import { EventBus } from './core/events.js';
import { Game } from './game.js';

const canvas = document.getElementById('game');
const overlay = document.getElementById('overlay');
const loader = document.getElementById('loader');
const errorBanner = document.getElementById('error-banner');

function fail(msg) {
    if (errorBanner) {
        errorBanner.style.display = 'block';
        errorBanner.textContent = msg;
    }
    if (loader) loader.style.display = 'none';
    console.error('[bootstrap]', msg);
}

async function init() {
    try {
        const renderer = new Renderer(canvas);
        const events = new EventBus();
        const audio = new AudioEngine();

        // post-processing (graceful fallback if addons fail)
        let postfxReady = false;
        try {
            const ok = await setupPostfx(renderer);
            postfxReady = !!ok;
        } catch (e) {
            console.warn('[postfx] falling back to plain renderer', e);
            postfxReady = false;
        }

        const game = new Game({
            container: document.getElementById('stage'),
            renderer,
            events,
            audio,
            hudCanvas: canvas,
            overlayCanvas: overlay,
        });
        game.postfxReady = postfxReady;

        // hide loader
        if (loader) loader.style.display = 'none';

        // context loss handling
        const gl = renderer.renderer.getContext();
        canvas.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            fail('WebGL context lost — click to restore.');
        });
        canvas.addEventListener('webglcontextrestored', () => {
            errorBanner.style.display = 'none';
            game.running = true;
            requestAnimationFrame(game._tick);
        });

        // start game loop
        game.start();

        // expose for debugging
        window.__GAME = game;
        return game;
    } catch (e) {
        fail('Failed to start the battle stage: ' + (e && e.message ? e.message : String(e)));
        throw e;
    }
}

init().catch((e) => {
    fail('Module import or initialization failed: ' + (e && e.message ? e.message : String(e)));
    console.error(e);
});
