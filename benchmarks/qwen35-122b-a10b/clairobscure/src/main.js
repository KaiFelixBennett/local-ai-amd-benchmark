// Main entry point - bootstrap the game with error handling

import { game } from './game.js';

// Global error handler
window.addEventListener('error', (event) => {
  console.error('Uncaught error:', event.error);
  showError(event.error?.message || 'Unknown error occurred');
});

// Promise rejection handler
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  showError(event.reason?.message || 'Promise rejected');
});

function showError(message) {
  const errorOverlay = document.getElementById('error-overlay');
  const errorMessage = document.getElementById('error-message');
  
  if (errorOverlay && errorMessage) {
    errorMessage.textContent = message || 'An unexpected error occurred';
    errorOverlay.style.display = 'block';
  } else {
    alert(`Error: ${message}`);
  }
}

// Initialize the game
async function init() {
  try {
    console.log('Initializing Clair Obscur Battle Engine...');

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      await new Promise(resolve => {
        document.addEventListener('DOMContentLoaded', resolve);
      });
    }

    // Create game container
    const container = document.createElement('div');
    container.id = 'game-container';
    container.style.width = '100vw';
    container.style.height = '100vh';
    document.body.appendChild(container);

    // Initialize game
    await game.init(container);

    // Show start screen overlay
    showStartScreen();

    console.log('Game ready! Click "Start Battle" to begin.');
  } catch (error) {
    console.error('Initialization failed:', error);
    showError(error.message);
  }
}

function showStartScreen() {
  // Create start screen overlay
  const startScreen = document.createElement('div');
  startScreen.id = 'start-screen';
  startScreen.style.cssText = `
    position: fixed;
    top: 0; left: 0; width: 100%; height: 100%;
    background: linear-gradient(135deg, #1a1520 0%, #2d2342 100%);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    z-index: 50;
    color: #f8f4e8;
    font-family: 'Georgia', serif;
  `;

  // Title
  const title = document.createElement('h1');
  title.textContent = 'Clair Obscur: Battle Engine';
  title.style.cssText = `
    font-size: 48px;
    margin-bottom: 20px;
    text-shadow: 0 0 20px rgba(255, 215, 0, 0.5);
    color: #ffd700;
  `;

  // Subtitle
  const subtitle = document.createElement('p');
  subtitle.textContent = 'A turn-based RPG with real-time reactive defense';
  subtitle.style.cssText = `
    font-size: 18px;
    margin-bottom: 40px;
    color: #aaa;
  `;

  // Controls info
  const controls = document.createElement('div');
  controls.style.cssText = `
    background: rgba(0, 0, 0, 0.3);
    padding: 20px 40px;
    border-radius: 10px;
    margin-bottom: 40px;
    text-align: left;
    max-width: 500px;
  `;

  const controlsTitle = document.createElement('h3');
  controlsTitle.textContent = 'Controls';
  controlsTitle.style.cssText = 'color: #c9a; margin-bottom: 15px; font-size: 16px;';

  const controlsList = [
    { key: 'Arrow Keys / WASD', desc: 'Navigate menu' },
    { key: 'Enter / Space', desc: 'Select action' },
    { key: 'Space (during enemy turn)', desc: 'PARRY - Perfect timing negates damage + builds AP' },
    { key: 'Shift (during enemy turn)', desc: 'DODGE - Avoid damage with forgiving timing' },
    { key: 'Esc', desc: 'Cancel / Back' }
  ];

  controlsList.forEach(({ key, desc }) => {
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; justify-content: space-between; margin: 8px 0;';
    
    const keySpan = document.createElement('span');
    keySpan.textContent = key;
    keySpan.style.cssText = 'color: #ffd700; font-weight: bold;';
    
    const descSpan = document.createElement('span');
    descSpan.textContent = desc;
    descSpan.style.cssText = 'color: #ccc;';
    
    row.appendChild(keySpan);
    row.appendChild(descSpan);
    controls.appendChild(row);
  });

  controls.insertBefore(controlsTitle, controls.firstChild);

  // Start button
  const startButton = document.createElement('button');
  startButton.textContent = 'Start Battle';
  startButton.style.cssText = `
    padding: 15px 50px;
    font-size: 20px;
    font-family: 'Georgia', serif;
    background: linear-gradient(135deg, #c9a 0%, #864 100%);
    border: none;
    border-radius: 8px;
    color: #210;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
    font-weight: bold;
  `;

  startButton.addEventListener('mouseenter', () => {
    startButton.style.transform = 'scale(1.05)';
    startButton.style.boxShadow = '0 0 30px rgba(204, 153, 170, 0.5)';
  });

  startButton.addEventListener('mouseleave', () => {
    startButton.style.transform = 'scale(1)';
    startButton.style.boxShadow = 'none';
  });

  startButton.addEventListener('click', async () => {
    console.log('=== START BATTLE CLICKED ===');
    // Initialize audio on user interaction
    try {
      if (typeof Tone !== 'undefined' && Tone.context) {
        await Tone.context.resume();
      }
    } catch (e) {
      console.warn('Audio init warning:', e);
    }

    startScreen.style.opacity = '0';
    startScreen.style.transition = 'opacity 0.5s';
    
    setTimeout(() => {
      startScreen.remove();
      console.log('Calling game.startBattle()');
      game.startBattle();
    }, 500);
  });

  startScreen.appendChild(title);
  startScreen.appendChild(subtitle);
  startScreen.appendChild(controls);
  startScreen.appendChild(startButton);

  document.body.appendChild(startScreen);
}

// Handle restart functionality
window.restartGame = function() {
  game.restartBattle();
};

// Start initialization
init();
