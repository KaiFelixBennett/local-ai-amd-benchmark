import * as THREE from 'three';

// Procedural texture generation for all game assets

export function createCharacterTexture(baseColor, accentColor, hasPattern = true) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Base gradient with brush stroke texture
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, baseColor);
  gradient.addColorStop(1, adjustColor(baseColor, -40));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  // Add brush stroke texture
  if (hasPattern) {
    addBrushStrokes(ctx, size, baseColor);
  }

  // Add accent details
  if (accentColor) {
    addAccentDetails(ctx, size, accentColor);
  }

  return new THREE.CanvasTexture(canvas);
}

export function createEnemyTexture(baseColor, glowColor = null) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Darker, more menacing base
  const gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size);
  gradient.addColorStop(0, adjustColor(baseColor, 20));
  gradient.addColorStop(1, adjustColor(baseColor, -30));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  // Add noise texture
  addNoise(ctx, size, 0.15);

  // Glowing accents for enemy types
  if (glowColor) {
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 20;
    ctx.fillStyle = glowColor;
    ctx.beginPath();
    ctx.arc(size * 0.3, size * 0.4, 15, 0, Math.PI * 2);
    ctx.arc(size * 0.7, size * 0.4, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  return new THREE.CanvasTexture(canvas);
}

export function createUIBackgroundTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Deep purple base
  ctx.fillStyle = '#2d2342';
  ctx.fillRect(0, 0, size, size);

  // Art nouveau border pattern
  drawArtNouveauBorder(ctx, size);

  // Subtle texture overlay
  addBrushStrokes(ctx, size, '#3d325a', 0.3);

  return new THREE.CanvasTexture(canvas);
}

export function createPortraitTexture(characterColor, accentColor) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Circular portrait frame
  ctx.fillStyle = '#1a1520';
  ctx.fillRect(0, 0, size, size);

  // Inner circle
  ctx.beginPath();
  ctx.arc(size/2, size/2, size/2 - 4, 0, Math.PI * 2);
  ctx.fillStyle = adjustColor(characterColor, -20);
  ctx.fill();

  // Character silhouette (simplified)
  ctx.beginPath();
  ctx.arc(size/2, size/3, 25, 0, Math.PI * 2);
  ctx.fillStyle = characterColor;
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(size/2, size/2 + 10, 30, 35, 0, 0, Math.PI * 2);
  ctx.fill();

  // Accent glow
  ctx.shadowColor = accentColor;
  ctx.shadowBlur = 10;
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(size/2, size/2, size/2 - 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;

  return new THREE.CanvasTexture(canvas);
}

export function createStageFloorTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Stone floor base
  const gradient = ctx.createLinearGradient(0, 0, 0, size);
  gradient.addColorStop(0, '#4a3f5a');
  gradient.addColorStop(1, '#3a304a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  // Tile pattern
  ctx.strokeStyle = '#2d253a';
  ctx.lineWidth = 3;
  const tileSize = 64;
  for (let y = 0; y < size; y += tileSize) {
    for (let x = 0; x < size; x += tileSize) {
      ctx.strokeRect(x, y, tileSize, tileSize);
    }
  }

  // Subtle wear and noise
  addNoise(ctx, size, 0.1);

  return new THREE.CanvasTexture(canvas);
}

// Helper: adjust color brightness
function adjustColor(colorVal, amount) {
  let r, g, b;
  
  // Handle THREE.Color objects
  if (colorVal && typeof colorVal === 'object' && colorVal.r !== undefined) {
    r = Math.floor(colorVal.r * 255) + amount;
    g = Math.floor(colorVal.g * 255) + amount;
    b = Math.floor(colorVal.b * 255) + amount;
  } else if (typeof colorVal === 'number') {
    // Convert hex number to RGB
    r = ((colorVal >> 16) & 0xFF) + amount;
    g = ((colorVal >> 8) & 0xFF) + amount;
    b = (colorVal & 0xFF) + amount;
  } else if (typeof colorVal === 'string') {
    // Handle hex string
    const hex = colorVal.replace('#', '');
    r = parseInt(hex.substr(0, 2), 16) + amount;
    g = parseInt(hex.substr(2, 2), 16) + amount;
    b = parseInt(hex.substr(4, 2), 16) + amount;
  } else {
    // Default fallback
    r = 128 + amount;
    g = 128 + amount;
    b = 128 + amount;
  }
  
  return `rgb(${Math.max(0, Math.min(255, r))}, ${Math.max(0, Math.min(255, g))}, ${Math.max(0, Math.min(255, b))})`;
}

// Helper: add brush stroke texture
function addBrushStrokes(ctx, size, color, opacity = 0.2) {
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;

  for (let i = 0; i < 50; i++) {
    ctx.beginPath();
    const y = Math.random() * size;
    ctx.moveTo(0, y);
    
    let x = 0;
    while (x < size) {
      x += 20 + Math.random() * 30;
      ctx.lineTo(x, y + (Math.random() - 0.5) * 10);
    }
    ctx.stroke();
  }

  ctx.restore();
}

// Helper: add noise texture
function addNoise(ctx, size, intensity = 0.1) {
  const imageData = ctx.getImageData(0, 0, size, size);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * intensity * 255;
    data[i] = Math.max(0, Math.min(255, data[i] + noise));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
  }

  ctx.putImageData(imageData, 0, 0);
}

// Helper: add accent details to character texture
function addAccentDetails(ctx, size, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.4;

  // Decorative lines
  for (let i = 0; i < 5; i++) {
    const y = size * (0.2 + i * 0.15);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y + (Math.random() - 0.5) * 20);
    ctx.stroke();
  }

  ctx.restore();
}

// Helper: draw art nouveau border pattern
function drawArtNouveauBorder(ctx, size) {
  const margin = 15;
  const innerSize = size - margin * 2;

  ctx.strokeStyle = '#c9a';
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.6;

  // Outer border
  ctx.strokeRect(margin, margin, innerSize, innerSize);

  // Decorative corners
  const cornerSize = 25;
  ctx.fillStyle = '#d9a';
  
  // Top-left
  ctx.beginPath();
  ctx.arc(margin + cornerSize, margin + cornerSize, cornerSize, Math.PI, 1.5 * Math.PI);
  ctx.fill();

  // Top-right
  ctx.beginPath();
  ctx.arc(size - margin - cornerSize, margin + cornerSize, cornerSize, 1.5 * Math.PI, 0);
  ctx.fill();

  // Bottom-left
  ctx.beginPath();
  ctx.arc(margin + cornerSize, size - margin - cornerSize, cornerSize, 0.5 * Math.PI, Math.PI);
  ctx.fill();

  // Bottom-right
  ctx.beginPath();
  ctx.arc(size - margin - cornerSize, size - margin - cornerSize, cornerSize, 0, 0.5 * Math.PI);
  ctx.fill();

  ctx.globalAlpha = 1;
}
