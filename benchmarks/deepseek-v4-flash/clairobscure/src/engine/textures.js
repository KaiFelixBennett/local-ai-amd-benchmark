// textures.js — procedural CanvasTexture generators (oil-paint stage, brush streaks,
// art-nouveau gilt border, weak-point glow). Pure Canvas2D — no external assets.
import * as THREE from 'three';

// Shared helper: make a canvas of size s. Never allocates per call.
function makeCanvas(s) {
    const c = document.createElement('canvas');
    c.width = s; c.height = s;
    const ctx = c.getContext('2d');
    return { c, ctx };
}

function canvasTexture(c, wrap = THREE.RepeatWrapping) {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = wrap;
    t.wrapT = wrap;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
}

// --- Oil-paint stage floor: deep teal base, scattered brush strokes, soft vignette/AO.
export function createOilStageTexture(size = 512) {
    const { c, ctx } = makeCanvas(size);
    // Base gradient: dark teal to near-black teal.
    const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size * 0.75);
    g.addColorStop(0, '#16313a');
    g.addColorStop(0.6, '#0e242b');
    g.addColorStop(1, '#08151a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);

    // Large soft brush strokes (painterly streaks), warm gilt + teal accents.
    ctx.globalAlpha = 0.5;
    const cols = ['#1c4350', '#244f5e', '#3a5f6b', '#162e38', '#273f4a'];
    for (let i = 0; i < 80; i++) {
        ctx.strokeStyle = cols[i % cols.length];
        ctx.lineWidth = 6 + Math.random() * 18;
        ctx.lineCap = 'round';
        const y = Math.random() * size;
        ctx.beginPath();
        ctx.moveTo(-20, y);
        // Wavy stroke
        ctx.bezierCurveTo(
            size * 0.25, y + (Math.random() - 0.5) * 40,
            size * 0.6, y + (Math.random() - 0.5) * 40,
            size + 20, y + (Math.random() - 0.5) * 20,
        );
        ctx.stroke();
    }

    // Gilt gold marbling flecks (tiny broad strokes with warm color).
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#c8a05a';
    for (let i = 0; i < 16; i++) {
        ctx.lineWidth = 1.5 + Math.random() * 3;
        ctx.beginPath();
        const x = Math.random() * size, y = Math.random() * size;
        ctx.moveTo(x, y);
        ctx.lineTo(x + 30 + Math.random() * 60, y + (Math.random() - 0.5) * 30);
        ctx.stroke();
    }

    // Stipple noise (canvas weave) — fine speckles.
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = '#060c10';
    for (let i = 0; i < 1400; i++) {
        const x = Math.random() * size, y = Math.random() * size;
        ctx.fillRect(x, y, 1.2, 1.2);
    }
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#c8c8d8';
    for (let i = 0; i < 600; i++) {
        const x = Math.random() * size, y = Math.random() * size;
        ctx.fillRect(x, y, 1, 1);
    }

    // Baked vignette / AO around edges.
    const vig = ctx.createRadialGradient(size / 2, size / 2, size * 0.3, size / 2, size / 2, size * 0.72);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(2,6,8,0.85)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, size, size);

    ctx.globalAlpha = 1;
    return canvasTexture(c, THREE.RepeatWrapping);
}

// --- Backdrop wall canvas: painterly teal wall with faint gold ornament verticals.
export function createBackdropTexture(size = 256) {
    const { c, ctx } = makeCanvas(size);
    const g = ctx.createLinearGradient(0, 0, 0, size);
    g.addColorStop(0, '#2a4d5a');
    g.addColorStop(1, '#0f232b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);

    ctx.globalAlpha = 0.2;
    ctx.strokeStyle = '#9d7b3e';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
        const x = (i / 5) * size + size * 0.05;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x - size * 0.03, size);
        ctx.stroke();
    }
    // Fleur-de-lis-ish dots
    ctx.fillStyle = '#9d7b3e';
    for (let i = 0; i < 30; i++) {
        ctx.beginPath();
        ctx.arc(Math.random() * size, Math.random() * size, 1.4, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = '#e8e4d8';
    for (let i = 0; i < 120; i++) {
        ctx.fillRect(Math.random() * size, Math.random() * size, 1, 1);
    }
    ctx.globalAlpha = 1;
    return canvasTexture(c);
}

// --- Character surface cloth: muted teal fabric with visible weave streaks.
export function createClothTexture(hue = 0.55, size = 128) {
    const { c, ctx } = makeCanvas(size);
    ctx.fillStyle = `hsl(${hue * 360}, 45%, ${25 + Math.random() * 8}%)`;
    ctx.fillRect(0, 0, size, size);

    ctx.globalAlpha = 0.3;
    for (let i = 0; i < 60; i++) {
        ctx.strokeStyle = `hsl(${hue * 360}, 55%, ${30 + Math.random() * 14}%)`;
        ctx.lineWidth = 1 + Math.random() * 2;
        ctx.beginPath();
        ctx.moveTo(Math.random() * size, -5);
        ctx.lineTo(-5, Math.random() * size * 0.4 + size * 0.1);
        ctx.stroke();
        ctx.strokeStyle = `hsl(${hue * 360}, 55%, ${12 + Math.random() * 8}%)`;
        ctx.beginPath();
        ctx.moveTo(-5, Math.random() * size);
        ctx.lineTo(Math.random() * size, -5);
        ctx.stroke();
    }
    // Weave speckle
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#000';
    for (let i = 0; i < 500; i++) {
        ctx.fillRect(Math.random() * size, Math.random() * size, 1, 1);
    }
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 300; i++) {
        ctx.fillRect(Math.random() * size, Math.random() * size, 1, 1);
    }
    ctx.globalAlpha = 1;
    return canvasTexture(c);
}

// --- Art-nouveau gilded border (UI / stage ring texture): filigree corners.
export function createGiltBorderTexture(size = 256, edge = 28) {
    const { c, ctx } = makeCanvas(size);
    ctx.clearRect(0, 0, size, size);

    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = '#caa34f';
    ctx.lineWidth = 3;
    // Outer rounded square
    ctx.beginPath();
    ctx.rect(edge, edge, size - edge * 2, size - edge * 2);
    ctx.stroke();

    ctx.lineWidth = 1.2;
    ctx.strokeStyle = '#e2c37c';
    ctx.beginPath();
    ctx.rect(edge + 5, edge + 5, size - (edge + 5) * 2, size - (edge + 5) * 2);
    ctx.stroke();

    // Corner flourish: stylized curl
    ctx.strokeStyle = '#e8c463';
    ctx.lineWidth = 2;
    const corners = [
        [edge + 8, edge + 8], [size - edge - 8, edge + 8],
        [edge + 8, size - edge - 8], [size - edge - 8, size - edge - 8],
    ];
    for (const [cx, cy] of corners) {
        ctx.beginPath();
        ctx.arc(cx, cy, 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
        ctx.strokeStyle = '#f2d99a';
        ctx.stroke();
    }
    // Dot grid inside
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#cfae63';
    for (let x = edge + 14; x < size - edge; x += 14) {
        for (let y = edge + 14; y < size - edge; y += 14) {
            ctx.beginPath();
            ctx.arc(x, y, 1, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.globalAlpha = 1;
    return canvasTexture(c);
}

// --- Neon weak-point texture: glowing ring for free-aim reticle targets.
export function createWeakPointTexture(size = 64) {
    const { c, ctx } = makeCanvas(size);
    ctx.clearRect(0, 0, size, size);
    const cx = size / 2, cy = size / 2;
    const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, size / 2);
    grad.addColorStop(0, 'rgba(255, 210, 90, 0.95)');
    grad.addColorStop(0.35, 'rgba(255, 180, 50, 0.55)');
    grad.addColorStop(1, 'rgba(255, 150, 30, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 235, 180, 0.95)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2 - 4, 0, Math.PI * 2);
    ctx.stroke();
    return canvasTexture(c);
}

// --- DataTexture noise tile (used for grain or procedural detail): grayscale random.
export function createNoiseDataTexture(size = 128) {
    const data = new Uint8Array(size * size * 4);
    for (let i = 0; i < size * size; i++) {
        const v = Math.floor(Math.random() * 255);
        data[i * 4] = v; data[i * 4 + 1] = v; data[i * 4 + 2] = v; data[i * 4 + 3] = 255;
    }
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.needsUpdate = true;
    return t;
}

// --- Emissive rune canvas for glowing eyes / magic glyphs.
export function createRuneTexture(color = '#ffd792', size = 64) {
    const { c, ctx } = makeCanvas(size);
    ctx.clearRect(0, 0, size, size);
    const cx = size / 2, cy = size / 2;
    const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, size / 2);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.2, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    // glyph cross
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy); ctx.lineTo(cx + 10, cy);
    ctx.moveTo(cx, cy - 10); ctx.lineTo(cx, cy + 10);
    ctx.stroke();
    return canvasTexture(c);
}
