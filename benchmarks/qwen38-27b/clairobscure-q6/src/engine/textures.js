/**
 * engine/textures.js — All procedural CanvasTexture / Canvas2D art.
 *
 * Everything the game draws — stage floor, painted backdrop, gilded UI
 * ornament, cloth/metal surfaces, glowing runes, paint motes, character
 * portraits — is generated on <canvas> at boot. No image files.
 *
 * The palette is Belle Epoque: muted teal, deep indigo, gilded gold,
 * oxblood and bone-white, with visible brush-stroke texture so nothing
 * reads as flat vector art.
 */
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Palette (single source of truth for all procedural art)
// ---------------------------------------------------------------------------
export const PALETTE = {
  teal: '#2e6f6c',
  tealDeep: '#17403f',
  tealDark: '#0c2424',
  indigo: '#1a2140',
  indigoDeep: '#0c0f22',
  gold: '#c9a24b',
  goldBright: '#e8c979',
  goldDim: '#8a6d2f',
  oxblood: '#7c2d3a',
  oxbloodDeep: '#4a1620',
  bone: '#e9e2cf',
  ink: '#12141c',
  skin: '#e8c9a8',
  crimson: '#a33243',
  emerald: '#2f8f6f',
  amber: '#d98e32',
  violet: '#5b4a8a',
  slate: '#3d4b57',
};

/** Tiny deterministic LCG so texture detail is stable between loads. */
function makeLcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  return [c, ctx];
}

/**
 * Overlay many short, soft, direction-biased brush strokes. This is what
 * makes the surfaces read as painted rather than filled.
 */
function brushStrokes(ctx, w, h, {
  count = 220,
  colors = [PALETTE.teal, PALETTE.tealDeep],
  alpha = 0.06,
  lenMin = 8,
  lenMax = 40,
  widthMin = 1,
  widthMax = 4,
  angle = 0,
  rand,
} = {}) {
  const r = rand || makeLcg(1234);
  for (let i = 0; i < count; i++) {
    const x = r() * w;
    const y = r() * h;
    const len = lenMin + r() * (lenMax - lenMin);
    const a = angle + (r() - 0.5) * 0.9;
    ctx.strokeStyle = colors[Math.floor(r() * colors.length)];
    ctx.globalAlpha = alpha * (0.5 + r());
    ctx.lineWidth = widthMin + r() * (widthMax - widthMin);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(
      x + Math.cos(a) * len * 0.5 + (r() - 0.5) * 6,
      y + Math.sin(a) * len * 0.5 + (r() - 0.5) * 6,
      x + Math.cos(a) * len,
      y + Math.sin(a) * len
    );
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Fine canvas-weave noise over a region. */
function weaveNoise(ctx, w, h, alpha = 0.05, rand) {
  const r = rand || makeLcg(777);
  for (let i = 0; i < w * h * 0.02; i++) {
    ctx.fillStyle = r() > 0.5 ? PALETTE.bone : PALETTE.ink;
    ctx.globalAlpha = alpha * r();
    ctx.fillRect(r() * w, r() * h, 1, 1);
  }
  ctx.globalAlpha = 1;
}

/** Radial dark vignette baked into the texture edges. */
function vignette(ctx, w, h, strength = 0.5) {
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.72);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(4,6,10,${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** Gilded Art Nouveau corner flourish (curl + leaf), drawn at (x,y) scaled. */
function cornerFlourish(ctx, x, y, s, flipX = 1, flipY = 1, color = PALETTE.goldBright) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(flipX * s, flipY * s);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(2, 30);
  ctx.bezierCurveTo(4, 10, 10, 4, 30, 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(8, 26);
  ctx.bezierCurveTo(10, 14, 14, 10, 26, 8);
  ctx.stroke();
  // leaf curl
  ctx.beginPath();
  ctx.moveTo(30, 2);
  ctx.bezierCurveTo(40, 6, 40, 14, 32, 16);
  ctx.bezierCurveTo(28, 17, 26, 12, 30, 10);
  ctx.stroke();
  // dot
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(6, 30, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Gilded diamond accent. */
function gildDiamond(ctx, x, y, r, color = PALETTE.goldBright) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r * 0.7, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r * 0.7, y);
  ctx.closePath();
  ctx.fill();
}

// ---------------------------------------------------------------------------
// Textured surfaces (THREE.CanvasTexture)
// ---------------------------------------------------------------------------

/**
 * The battle stage floor: gilded marble painted in teal, a central ornate
 * ring, and a baked vignette so the corners fall into shadow.
 */
export function makeStageFloorTexture() {
  const [c, ctx] = makeCanvas(1024, 1024);
  const rand = makeLcg(20260824);

  const base = ctx.createRadialGradient(512, 512, 80, 512, 512, 720);
  base.addColorStop(0, PALETTE.teal);
  base.addColorStop(0.55, PALETTE.tealDeep);
  base.addColorStop(1, PALETTE.tealDark);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 1024, 1024);

  // Stone "slab" seams
  ctx.strokeStyle = 'rgba(10,20,20,0.35)';
  ctx.lineWidth = 3;
  for (let i = 1; i < 8; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 128, 0);
    ctx.lineTo(i * 128, 1024);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * 128);
    ctx.lineTo(1024, i * 128);
    ctx.stroke();
  }

  // Central gilded ring (art nouveau)
  ctx.strokeStyle = PALETTE.gold;
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(512, 512, 300, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = PALETTE.goldDim;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(512, 512, 272, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(512, 512, 328, 0, Math.PI * 2);
  ctx.stroke();

  // Petal ornaments on the ring
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const px = 512 + Math.cos(a) * 300;
    const py = 512 + Math.sin(a) * 300;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillStyle = PALETTE.goldBright;
    ctx.beginPath();
    ctx.moveTo(0, -26);
    ctx.quadraticCurveTo(16, -6, 0, 14);
    ctx.quadraticCurveTo(-16, -6, 0, -26);
    ctx.fill();
    ctx.restore();
  }

  // Center medallion
  ctx.fillStyle = 'rgba(201,162,75,0.25)';
  ctx.beginPath();
  ctx.arc(512, 512, 60, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PALETTE.goldBright;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(512, 512, 60, 0, Math.PI * 2);
  ctx.stroke();
  gildDiamond(ctx, 512, 512, 26);

  // Brush paint + weave + vignette
  brushStrokes(ctx, 1024, 1024, {
    count: 900,
    colors: [PALETTE.teal, PALETTE.tealDeep, '#3a8a7e', '#123534'],
    alpha: 0.05,
    lenMin: 12,
    lenMax: 60,
    widthMin: 1,
    widthMax: 5,
    rand,
  });
  weaveNoise(ctx, 1024, 1024, 0.04, rand);
  vignette(ctx, 1024, 1024, 0.55);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * The painted backdrop: a towering art-nouveau arch gallery receding into
 * indigo mist, with a pale moon and floating motes. Drawn onto a tall plane
 * behind the enemies; fog handles the distance fade.
 */
export function makeBackdropTexture() {
  const [c, ctx] = makeCanvas(1024, 1024);
  const rand = makeLcg(77112);

  const sky = ctx.createLinearGradient(0, 0, 0, 1024);
  sky.addColorStop(0, PALETTE.indigoDeep);
  sky.addColorStop(0.45, PALETTE.indigo);
  sky.addColorStop(0.78, '#22404a');
  sky.addColorStop(1, '#143135');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 1024, 1024);

  // Moon / pale light source, upper left
  const moon = ctx.createRadialGradient(260, 220, 10, 260, 220, 190);
  moon.addColorStop(0, 'rgba(233,226,207,0.95)');
  moon.addColorStop(0.18, 'rgba(233,226,207,0.45)');
  moon.addColorStop(1, 'rgba(233,226,207,0)');
  ctx.fillStyle = moon;
  ctx.fillRect(0, 0, 1024, 1024);
  ctx.fillStyle = PALETTE.bone;
  ctx.beginPath();
  ctx.arc(260, 220, 46, 0, Math.PI * 2);
  ctx.fill();

  // Stars
  for (let i = 0; i < 90; i++) {
    const x = rand() * 1024;
    const y = rand() * 620;
    ctx.fillStyle = `rgba(233,226,207,${0.25 + rand() * 0.6})`;
    ctx.fillRect(x, y, rand() > 0.85 ? 2 : 1, rand() > 0.85 ? 2 : 1);
  }

  // Three tiers of gilded arches, receding
  const tiers = [
    { y0: 640, h: 560, w: 210, gap: 30, alpha: 0.55, color: '#20423f' },
    { y0: 560, h: 470, w: 170, gap: 26, alpha: 0.75, color: '#182f33' },
    { y0: 500, h: 390, w: 132, gap: 22, alpha: 1.0, color: '#101d22' },
  ];
  for (const t of tiers) {
    const n = Math.floor(1024 / (t.w + t.gap));
    const x0 = (1024 - (n * (t.w + t.gap) - t.gap)) / 2;
    ctx.globalAlpha = t.alpha;
    for (let i = 0; i < n; i++) {
      const x = x0 + i * (t.w + t.gap);
      // pointed arch silhouette
      ctx.fillStyle = t.color;
      ctx.beginPath();
      ctx.moveTo(x, t.y0);
      ctx.lineTo(x, t.y0 - t.h * 0.55);
      ctx.quadraticCurveTo(x + t.w * 0.5, t.y0 - t.h * 1.12, x + t.w, t.y0 - t.h * 0.55);
      ctx.lineTo(x + t.w, t.y0);
      ctx.closePath();
      ctx.fill();
      // gilded keystone
      ctx.fillStyle = PALETTE.gold;
      ctx.fillRect(x + t.w / 2 - 5, t.y0 - t.h * 1.02, 10, t.h * 0.22);
      // inner glow through the arch
      const glow = ctx.createRadialGradient(
        x + t.w / 2, t.y0 - t.h * 0.35, 4,
        x + t.w / 2, t.y0 - t.h * 0.35, t.w * 0.55
      );
      glow.addColorStop(0, 'rgba(201,162,75,0.16)');
      glow.addColorStop(1, 'rgba(201,162,75,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(x, t.y0 - t.h, t.w, t.h);
    }
    ctx.globalAlpha = 1;
  }

  brushStrokes(ctx, 1024, 1024, {
    count: 500,
    colors: [PALETTE.indigo, PALETTE.indigoDeep, '#28456a', '#101a33'],
    alpha: 0.05,
    lenMin: 16,
    lenMax: 80,
    widthMin: 2,
    widthMax: 6,
    angle: 0.15,
    rand,
  });
  weaveNoise(ctx, 1024, 1024, 0.03, rand);
  vignette(ctx, 1024, 1024, 0.4);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Cloth surface with woven texture and directional brush, tinted. */
export function makeClothTexture(hex, seed = 1) {
  const [c, ctx] = makeCanvas(256, 256);
  const rand = makeLcg(seed * 991 + 5);
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, 256, 256);
  // weave
  ctx.globalAlpha = 0.12;
  for (let y = 0; y < 256; y += 4) {
    ctx.fillStyle = y % 8 === 0 ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)';
    ctx.fillRect(0, y, 256, 2);
  }
  ctx.globalAlpha = 1;
  brushStrokes(ctx, 256, 256, {
    count: 260,
    colors: [hex, 'rgba(255,255,255,0.28)', 'rgba(0,0,0,0.3)'],
    alpha: 0.05,
    lenMin: 6,
    lenMax: 26,
    widthMin: 1,
    widthMax: 3,
    angle: Math.PI / 2,
    rand,
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Gilded metal surface with streaks — for weapons, trim, gauntlets. */
export function makeGoldTexture(seed = 2) {
  const [c, ctx] = makeCanvas(256, 256);
  const rand = makeLcg(seed * 373 + 9);
  const base = ctx.createLinearGradient(0, 0, 256, 256);
  base.addColorStop(0, PALETTE.goldBright);
  base.addColorStop(0.5, PALETTE.gold);
  base.addColorStop(1, PALETTE.goldDim);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  // hammered streaks
  for (let i = 0; i < 60; i++) {
    ctx.strokeStyle = rand() > 0.5 ? 'rgba(255,244,214,0.25)' : 'rgba(80,55,15,0.25)';
    ctx.lineWidth = 1 + rand() * 2;
    const x = rand() * 256;
    const y = rand() * 256;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 60, y + (rand() - 0.5) * 60);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Dark scaled hide / leather for the brutes, tinted. */
export function makeScaleTexture(hex, seed = 3) {
  const [c, ctx] = makeCanvas(256, 256);
  const rand = makeLcg(seed * 613 + 13);
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, 256, 256);
  const rows = 8;
  for (let ry = 0; ry < rows; ry++) {
    const off = (ry % 2) * 16;
    for (let rx = -1; rx < 9; rx++) {
      const x = rx * 32 + off;
      const y = ry * 32;
      const g = ctx.createRadialGradient(x + 16, y + 8, 2, x + 16, y + 16, 20);
      g.addColorStop(0, 'rgba(255,255,255,0.14)');
      g.addColorStop(0.7, 'rgba(0,0,0,0.10)');
      g.addColorStop(1, 'rgba(0,0,0,0.35)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x + 16, y + 16, 18, 20, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  weaveNoise(ctx, 256, 256, 0.05, rand);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * Emissive rune circle — used on weak-point markers, staves and magical
 * accents. Pure glow art on a transparent canvas.
 */
export function makeRuneTexture(seed = 4) {
  const [c, ctx] = makeCanvas(256, 256);
  const rand = makeLcg(seed * 271 + 17);
  const cx = 128, cy = 128;
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#fff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, 86, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 66, 0, Math.PI * 2);
  ctx.stroke();
  // runes: short glyph strokes around the ring
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + rand() * 0.3;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * 76, cy + Math.sin(a) * 76);
    ctx.rotate(a + Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(0, 10);
    ctx.moveTo(-6, -4);
    ctx.lineTo(6, rand() > 0.5 ? 2 : -8);
    if (rand() > 0.5) {
      ctx.moveTo(-5, 6);
      ctx.lineTo(5, 6);
    }
    ctx.stroke();
    ctx.restore();
  }
  // center sigil
  ctx.beginPath();
  ctx.moveTo(cx, cy - 40);
  ctx.lineTo(cx + 34, cy + 26);
  ctx.lineTo(cx - 34, cy + 26);
  ctx.closePath();
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Soft radial paint blob — the basic particle sprite, tinted at draw time. */
export function makePaintMoteTexture() {
  const [c, ctx] = makeCanvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.7)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  // a couple of darker dabs to make it read as paint, not a light
  ctx.fillStyle = 'rgba(120,120,140,0.25)';
  ctx.beginPath();
  ctx.arc(26, 38, 6, 0, Math.PI * 2);
  ctx.arc(40, 26, 4, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Sharp spark/star for impact flashes. */
export function makeSparkTexture() {
  const [c, ctx] = makeCanvas(64, 64);
  ctx.strokeStyle = '#fff';
  ctx.lineCap = 'round';
  ctx.shadowColor = '#fff';
  ctx.shadowBlur = 6;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(32, 4);
  ctx.lineTo(32, 60);
  ctx.moveTo(4, 32);
  ctx.lineTo(60, 32);
  ctx.stroke();
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(14, 14);
  ctx.lineTo(50, 50);
  ctx.moveTo(50, 14);
  ctx.lineTo(14, 50);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Film grain tile, tiled at random offsets on the HUD canvas. */
export function makeGrainTexture() {
  const [c, ctx] = makeCanvas(256, 256);
  const rand = makeLcg(424242);
  const img = ctx.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 200 + Math.floor(rand() * 55);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = Math.floor(rand() * 26);
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------------------
// UI ornament (plain Canvas2D — drawn directly into the HUD canvas)
// ---------------------------------------------------------------------------

/**
 * Paint a gilded art-nouveau panel frame into an existing 2D context.
 * Used by the HUD for menus, banners and the loadout screen.
 */
export function drawGildedFrame(ctx, x, y, w, h, { fill = 'rgba(14,20,26,0.86)', border = PALETTE.gold, lineWidth = 3 } = {}) {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = border;
  ctx.lineWidth = lineWidth;
  ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
  ctx.strokeStyle = PALETTE.goldDim;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 8, y + 8, w - 16, h - 16);
  cornerFlourish(ctx, x + 8, y + 8, 1, 1, 1);
  cornerFlourish(ctx, x + w - 8, y + 8, 1, -1, 1);
  cornerFlourish(ctx, x + 8, y + h - 8, 1, 1, -1);
  cornerFlourish(ctx, x + w - 8, y + h - 8, 1, -1, -1);
  gildDiamond(ctx, x + w / 2, y + 6, 6);
  gildDiamond(ctx, x + w / 2, y + h - 6, 6);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Portraits — stylized Belle Epoque faces, one per look
// ---------------------------------------------------------------------------

/**
 * Draw a small painterly portrait into a fresh canvas. `look` selects the
 * silhouette: { skin, hair, hairStyle: 'long'|'bun'|'short'|'horned',
 * eye, accent, mood: 'calm'|'fierce'|'melancholy'|'void' }.
 */
export function makePortraitCanvas(look) {
  const size = 96;
  const [c, ctx] = makeCanvas(size, size);
  const rand = makeLcg(look.seed || 1);

  // backdrop wash
  const bg = ctx.createLinearGradient(0, 0, 0, size);
  bg.addColorStop(0, look.backdrop || PALETTE.indigo);
  bg.addColorStop(1, look.backdropDeep || PALETTE.indigoDeep);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);
  // halo
  const halo = ctx.createRadialGradient(size / 2, size * 0.46, 6, size / 2, size * 0.46, 46);
  halo.addColorStop(0, 'rgba(201,162,75,0.30)');
  halo.addColorStop(1, 'rgba(201,162,75,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, size, size);

  const cx = size / 2;

  // hair behind head
  ctx.fillStyle = look.hair;
  if (look.hairStyle === 'long') {
    ctx.beginPath();
    ctx.ellipse(cx, size * 0.62, 30, 40, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx - 30, size * 0.42, 60, size * 0.5);
  } else if (look.hairStyle === 'bun') {
    ctx.beginPath();
    ctx.ellipse(cx, size * 0.5, 26, 30, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, size * 0.2, 12, 0, Math.PI * 2);
    ctx.fill();
  } else if (look.hairStyle === 'horned') {
    // swept-back void hair + horns
    ctx.beginPath();
    ctx.ellipse(cx, size * 0.46, 27, 26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - 22, size * 0.4);
    ctx.quadraticCurveTo(cx - 34, size * 0.18, cx - 20, size * 0.12);
    ctx.quadraticCurveTo(cx - 26, size * 0.3, cx - 16, size * 0.34);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + 22, size * 0.4);
    ctx.quadraticCurveTo(cx + 34, size * 0.18, cx + 20, size * 0.12);
    ctx.quadraticCurveTo(cx + 26, size * 0.3, cx + 16, size * 0.34);
    ctx.closePath();
    ctx.fill();
  }

  // neck + shoulders
  ctx.fillStyle = look.skin;
  ctx.fillRect(cx - 8, size * 0.66, 16, 12);
  ctx.fillStyle = look.accent;
  ctx.beginPath();
  ctx.moveTo(cx - 34, size);
  ctx.quadraticCurveTo(cx, size * 0.66, cx + 34, size);
  ctx.closePath();
  ctx.fill();

  // face
  ctx.fillStyle = look.skin;
  ctx.beginPath();
  ctx.ellipse(cx, size * 0.46, 20, 24, 0, 0, Math.PI * 2);
  ctx.fill();

  // hair over forehead
  ctx.fillStyle = look.hair;
  if (look.hairStyle === 'short') {
    ctx.beginPath();
    ctx.ellipse(cx, size * 0.34, 21, 12, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx - 21, size * 0.3, 8, 14);
    ctx.fillRect(cx + 13, size * 0.3, 8, 14);
  } else if (look.hairStyle === 'long' || look.hairStyle === 'bun') {
    ctx.beginPath();
    ctx.ellipse(cx, size * 0.33, 22, 14, 0, Math.PI * 0.95, Math.PI * 2.05);
    ctx.fill();
  } else if (look.hairStyle === 'horned') {
    ctx.beginPath();
    ctx.moveTo(cx - 20, size * 0.4);
    ctx.quadraticCurveTo(cx, size * 0.2, cx + 20, size * 0.4);
    ctx.quadraticCurveTo(cx, size * 0.3, cx - 20, size * 0.4);
    ctx.fill();
  }

  // eyes
  const eyeY = size * 0.46;
  const dx = 8;
  ctx.fillStyle = look.mood === 'void' ? '#e8c979' : look.eye;
  if (look.mood === 'void') {
    // hollow glowing sockets
    ctx.beginPath();
    ctx.ellipse(cx - dx, eyeY, 4, 5, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + dx, eyeY, 4, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(cx - dx, eyeY, 1.6, 0, Math.PI * 2);
    ctx.arc(cx + dx, eyeY, 1.6, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.ellipse(cx - dx, eyeY, 3.2, look.mood === 'fierce' ? 2 : 3.2, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + dx, eyeY, 3.2, look.mood === 'fierce' ? 2 : 3.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // brows
  ctx.strokeStyle = look.hair;
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (look.mood === 'fierce') {
    ctx.moveTo(cx - 12, eyeY - 7);
    ctx.lineTo(cx - 4, eyeY - 4);
    ctx.moveTo(cx + 12, eyeY - 7);
    ctx.lineTo(cx + 4, eyeY - 4);
  } else {
    ctx.moveTo(cx - 12, eyeY - 5);
    ctx.lineTo(cx - 4, eyeY - 6);
    ctx.moveTo(cx + 12, eyeY - 5);
    ctx.lineTo(cx + 4, eyeY - 6);
  }
  ctx.stroke();

  // mouth
  ctx.strokeStyle = look.mood === 'void' ? 'rgba(0,0,0,0.5)' : PALETTE.oxblood;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  if (look.mood === 'melancholy') {
    ctx.arc(cx, eyeY + 16, 5, Math.PI * 1.15, Math.PI * 1.85);
  } else if (look.mood === 'fierce') {
    ctx.moveTo(cx - 6, eyeY + 13);
    ctx.lineTo(cx + 6, eyeY + 13);
  } else {
    ctx.arc(cx, eyeY + 9, 5, Math.PI * 0.15, Math.PI * 0.85);
  }
  ctx.stroke();

  // gilded earring
  ctx.fillStyle = PALETTE.goldBright;
  ctx.beginPath();
  ctx.arc(cx + 19, size * 0.54, 2.2, 0, Math.PI * 2);
  ctx.fill();

  // painterly strokes + frame
  brushStrokes(ctx, size, size, {
    count: 60,
    colors: [look.accent, look.hair, 'rgba(255,255,255,0.2)'],
    alpha: 0.04,
    lenMin: 6,
    lenMax: 20,
    widthMin: 1,
    widthMax: 2,
    rand,
  });
  drawGildedFrame(ctx, 0, 0, size, size, { fill: 'rgba(0,0,0,0)' });
  return c;
}
