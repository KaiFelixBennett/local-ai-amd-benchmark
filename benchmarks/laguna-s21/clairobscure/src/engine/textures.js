/**
 * Procedural texture generators using Canvas/DataTexture.
 * Character surfaces, UI ornaments, status icons, etc.
 */

import * as THREE from 'three';

/** Create a canvas texture for character body material with brush strokes */
export function createCharacterTexture(baseColor, accentColor, detail = 128) {
    const canvas = document.createElement('canvas');
    canvas.width = detail;
    canvas.height = detail * 2;
    const ctx = canvas.getContext('2d');

    // Base fill
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Brush stroke texture
    for (let i = 0; i < 200; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const w = Math.random() * 20 + 2;
        const h = Math.random() * 3 + 0.5;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.random() * 0.5 - 0.25);
        ctx.fillStyle = `rgba(${Math.random() > 0.5 ? '255,255,255' : '0,0,0'}, ${Math.random() * 0.08})`;
        ctx.fillRect(-w / 2, -h / 2, w, h);
        ctx.restore();
    }

    // Accent lines (gilded trim)
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.6;
    for (let y = 20; y < canvas.height; y += 30) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(
            canvas.width * 0.3, y - 5,
            canvas.width * 0.7, y + 5,
            canvas.width, y
        );
        ctx.stroke();
    }
    ctx.globalAlpha = 1;

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

/** Create a gilded UI ornament border texture */
export function createOrnamentTexture(width = 256, height = 64) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, width, height);

    // Gold gradient
    const grad = ctx.createLinearGradient(0, 0, width, 0);
    grad.addColorStop(0, '#8b7340');
    grad.addColorStop(0.3, '#c4a35a');
    grad.addColorStop(0.5, '#e8dcc8');
    grad.addColorStop(0.7, '#c4a35a');
    grad.addColorStop(1, '#8b7340');

    // Top border
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(10, 4);
    ctx.lineTo(width - 10, 4);
    ctx.stroke();

    // Bottom border
    ctx.beginPath();
    ctx.moveTo(10, height - 4);
    ctx.lineTo(width - 10, height - 4);
    ctx.stroke();

    // Corner ornaments
    const corners = [[8, 8], [width - 8, 8], [8, height - 8], [width - 8, height - 8]];
    for (const [cx, cy] of corners) {
        ctx.fillStyle = '#c4a35a';
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e8dcc8';
        ctx.beginPath();
        ctx.arc(cx, cy, 2, 0, Math.PI * 2);
        ctx.fill();
    }

    // Center diamond
    ctx.fillStyle = '#c4a35a';
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-5, -5, 10, 10);
    ctx.restore();

    return new THREE.CanvasTexture(canvas);
}

/** Create a status effect icon texture */
export function createStatusIcon(type, size = 32) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, size, size);

    const colors = {
        burn: '#ff4422',
        stun: '#ffcc00',
        poison: '#44cc44',
        mark: '#cc44cc',
        shield: '#4488ff',
        buff: '#44ff88',
        debuff: '#ff4488'
    };

    const color = colors[type] || '#ffffff';

    // Background circle
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
    ctx.stroke();

    // Icon symbol
    ctx.fillStyle = color;
    ctx.font = `bold ${size * 0.5}px Georgia`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const symbols = {
        burn: '🔥',
        stun: '⚡',
        poison: '☠',
        mark: '✦',
        shield: '🛡',
        buff: '↑',
        debuff: '↓'
    };
    ctx.fillText(symbols[type] || '?', size / 2, size / 2 + 1);

    return canvas;
}

/** Create a portrait frame for a character */
export function createPortraitFrame(baseColor, accentColor, size = 64) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = 'rgba(10, 10, 20, 0.8)';
    ctx.fillRect(0, 0, size, size);

    // Gold border
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, size - 4, size - 4);

    // Inner corner decorations
    const cornerSize = 8;
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 1.5;
    const corners = [
        [4, 4 + cornerSize, 4, 4, 4 + cornerSize, 4],
        [size - 4 - cornerSize, 4, size - 4, 4, size - 4, 4 + cornerSize],
        [4, size - 4 - cornerSize, 4, size - 4, 4 + cornerSize, size - 4],
        [size - 4, size - 4 - cornerSize, size - 4, size - 4, size - 4 - cornerSize, size - 4]
    ];
    for (const [x1, y1, x2, y2, x3, y3] of corners) {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineTo(x3, y3);
        ctx.stroke();
    }

    return canvas;
}

/** Create a HP bar texture with gradient */
export function createHPBarTexture(width, height, ratio, isCrit = false) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = 'rgba(20, 15, 10, 0.8)';
    ctx.fillRect(0, 0, width, height);

    // HP fill
    const fillWidth = width * ratio;
    let r, g, b;
    if (isCrit) {
        r = 255; g = 68; b = 34;
    } else if (ratio > 0.5) {
        r = 68; g = 180; b = 68;
    } else if (ratio > 0.25) {
        r = 200; g = 180; b = 34;
    } else {
        r = 200; g = 50; b = 34;
    }

    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, `rgba(${r + 40}, ${g + 40}, ${b + 40}, 0.9)`);
    grad.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, 0.9)`);
    grad.addColorStop(1, `rgba(${r - 30}, ${g - 30}, ${b - 30}, 0.9)`);
    ctx.fillStyle = grad;
    ctx.fillRect(1, 1, fillWidth - 2, height - 2);

    // Shine
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.fillRect(1, 1, fillWidth - 2, height / 3);

    // Border
    ctx.strokeStyle = '#c4a35a';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, width, height);

    return canvas;
}

/** Create an AP bar texture */
export function createAPBarTexture(width, height, ratio) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(15, 10, 25, 0.8)';
    ctx.fillRect(0, 0, width, height);

    const fillWidth = width * ratio;
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, 'rgba(180, 140, 255, 0.9)');
    grad.addColorStop(0.5, 'rgba(120, 80, 220, 0.9)');
    grad.addColorStop(1, 'rgba(80, 40, 180, 0.9)');
    ctx.fillStyle = grad;
    ctx.fillRect(1, 1, fillWidth - 2, height - 2);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.fillRect(1, 1, fillWidth - 2, height / 3);

    ctx.strokeStyle = '#8866cc';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, width, height);

    return canvas;
}

/** Create a stagger/break bar texture */
export function createStaggerBarTexture(width, height, ratio) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(15, 15, 15, 0.7)';
    ctx.fillRect(0, 0, width, height);

    const fillWidth = width * ratio;
    const isFull = ratio >= 1.0;
    const grad = ctx.createLinearGradient(0, 0, fillWidth, 0);
    if (isFull) {
        grad.addColorStop(0, 'rgba(255, 200, 50, 1)');
        grad.addColorStop(1, 'rgba(255, 100, 30, 1)');
    } else {
        grad.addColorStop(0, 'rgba(255, 160, 50, 0.8)');
        grad.addColorStop(1, 'rgba(200, 80, 20, 0.8)');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(1, 1, fillWidth - 2, height - 2);

    ctx.strokeStyle = isFull ? '#ffcc44' : '#aa6622';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, width, height);

    return canvas;
}

/** Create an elemental weakness indicator texture */
export function createElementIcon(element, size = 24) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const colors = {
        fire: '#ff4422',
        ice: '#44aaff',
        lightning: '#ffcc00',
        dark: '#8844cc',
        light: '#ffdd44',
        physical: '#aaaaaa'
    };

    const color = colors[element] || '#ffffff';

    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = color;
    ctx.font = `bold ${size * 0.55}px Georgia`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const icons = {
        fire: '🔥',
        ice: '❄',
        lightning: '⚡',
        dark: '🌑',
        light: '☀',
        physical: '⚔'
    };
    ctx.fillText(icons[element] || '•', size / 2, size / 2 + 1);

    return canvas;
}

/** Create a damage number texture */
export function createDamageNumberTexture(value, type = 'damage', isCrit = false) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 48;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, 128, 48);

    let color, prefix;
    switch (type) {
        case 'damage':
            color = isCrit ? '#ff4422' : '#ff8866';
            prefix = '';
            break;
        case 'heal':
            color = '#44ff88';
            prefix = '+';
            break;
        case 'ap':
            color = '#aa88ff';
            prefix = '+';
            break;
        case 'stagger':
            color = '#ffaa22';
            prefix = '';
            break;
        case 'miss':
            color = '#888888';
            prefix = '';
            break;
        default:
            color = '#ffffff';
            prefix = '';
    }

    const fontSize = isCrit ? 32 : 24;
    ctx.font = `bold ${fontSize}px Georgia`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillText(`${prefix}${value}`, 65, 26);

    // Main text
    ctx.fillStyle = color;
    ctx.fillText(`${prefix}${value}`, 64, 24);

    if (isCrit) {
        ctx.font = 'bold 14px Georgia';
        ctx.fillStyle = '#ffcc00';
        ctx.fillText('CRIT!', 64, 42);
    }

    return canvas;
}
