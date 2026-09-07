/**
 * Bootstrap: dynamic-import everything, construct Game, start loop.
 * Top-level try/catch around init + module load.
 */

import { Game } from './game.js';

let game = null;

async function init() {
    try {
        // Check WebGL support
        const testCanvas = document.createElement('canvas');
        const gl = testCanvas.getContext('webgl2') || testCanvas.getContext('webgl');
        if (!gl) {
            showError('WebGL is not supported by your browser. Please use a modern browser.');
            return;
        }

        // Create and start game
        game = new Game();
        game.start();

        // Setup restart buttons
        document.getElementById('restart-btn').addEventListener('click', () => {
            if (game) game.restart();
        });
        document.getElementById('retry-btn').addEventListener('click', () => {
            if (game) game.restart();
        });

        // Handle WebGL context loss
        const glCanvas = document.querySelector('canvas');
        if (glCanvas) {
            glCanvas.addEventListener('webglcontextlost', (e) => {
                e.preventDefault();
                showError('WebGL context lost. Please refresh the page.');
            });
            glCanvas.addEventListener('webglcontextrestored', () => {
                document.getElementById('error-msg').style.display = 'none';
            });
        }

        console.log('Game initialized successfully.');
    } catch (error) {
        console.error('Failed to initialize game:', error);
        showError(`Initialization failed: ${error.message}`);
    }
}

function showError(message) {
    const errorEl = document.getElementById('error-msg');
    errorEl.textContent = message;
    errorEl.style.display = 'block';
}

// Start initialization
init().catch((error) => {
    console.error('Fatal error during init:', error);
    showError(`Fatal error: ${error.message}`);
});
