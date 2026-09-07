/**
 * Shared Canvas2D drawing vocabulary for the HUD.
 *
 * Everything the interface is made of — gilded panels, art-nouveau corner
 * ornament, segmented bars, AP pips, letter-spaced small caps — lives here so
 * the individual UI modules stay short and consistent.
 *
 * All coordinates are CSS pixels; game.js scales the context by devicePixelRatio.
 */

export const UI = {
  gold: '#d9b262',
  goldBright: '#f5dda2',
  goldDim: '#8a6a2f',
  ink: '#07171a',
  parchment: '#e8ddc4',
  teal: '#12333a',
  tealDeep: 'rgba(7,23,26,0.82)',
  hp: '#c9583f',
  hpLow: '#e0703c',
  hpBack: 'rgba(60,20,18,0.7)',
  ap: '#6fc5d8',
  apEmpty: 'rgba(30,64,72,0.75)',
  breakBar: '#e2a03a',
  gradient: '#f0d060',
  enemy: '#c96a5a',
  danger: '#e04a3a',
  good: '#9ee8b0',
  serif: 'Georgia, "Times New Roman", "Palatino Linotype", serif',
};

/** Cut-corner plate, the base shape of every panel in the game. */
export function bevelRect(ctx, x, y, w, h, cut = 10) {
  ctx.beginPath();
  ctx.moveTo(x + cut, y);
  ctx.lineTo(x + w - cut, y);
  ctx.lineTo(x + w, y + cut);
  ctx.lineTo(x + w, y + h - cut);
  ctx.lineTo(x + w - cut, y + h);
  ctx.lineTo(x + cut, y + h);
  ctx.lineTo(x, y + h - cut);
  ctx.lineTo(x, y + cut);
  ctx.closePath();
}

/**
 * A gilded panel: dark painted ground, double gold rule, corner flourishes.
 */
export function panel(ctx, x, y, w, h, opts = {}) {
  const {
    alpha = 1, cut = 10, fill = true, border = true, corners = true,
    tint = 'rgba(8,26,29,0.86)', accent = UI.gold, lineWidth = 1.4,
  } = opts;
  ctx.save();
  ctx.globalAlpha *= alpha;
  if (fill) {
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, tint);
    g.addColorStop(1, 'rgba(4,14,16,0.92)');
    bevelRect(ctx, x, y, w, h, cut);
    ctx.fillStyle = g;
    ctx.fill();
  }
  if (border) {
    bevelRect(ctx, x, y, w, h, cut);
    ctx.strokeStyle = accent;
    ctx.lineWidth = lineWidth;
    ctx.globalAlpha *= 0.85;
    ctx.stroke();
    ctx.globalAlpha /= 0.85;
    bevelRect(ctx, x + 3.5, y + 3.5, w - 7, h - 7, Math.max(2, cut - 3));
    ctx.strokeStyle = UI.goldDim;
    ctx.lineWidth = 0.8;
    ctx.globalAlpha *= 0.6;
    ctx.stroke();
  }
  if (corners) drawCorners(ctx, x, y, w, h, accent);
  ctx.restore();
}

/** Small whiplash flourishes at each corner of a panel. */
function drawCorners(ctx, x, y, w, h, color) {
  const s = 11;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.globalAlpha *= 0.75;
  const pts = [
    [x + 2, y + 2, 1, 1], [x + w - 2, y + 2, -1, 1],
    [x + 2, y + h - 2, 1, -1], [x + w - 2, y + h - 2, -1, -1],
  ];
  for (const [px, py, sx, sy] of pts) {
    ctx.beginPath();
    ctx.moveTo(px, py + sy * s);
    ctx.quadraticCurveTo(px, py, px + sx * s, py);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px + sx * s * 0.42, py + sy * s * 0.42, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Letter-spaced text — the small-caps look used for every label.
 * Returns the drawn width.
 */
export function spacedText(ctx, str, x, y, opts = {}) {
  const {
    size = 13, weight = '400', color = UI.parchment, spacing = 2.4,
    align = 'left', font = UI.serif, alpha = 1, shadow = null, baseline = 'alphabetic',
  } = opts;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.textBaseline = baseline;
  const chars = String(str).split('');
  let total = 0;
  for (const c of chars) total += ctx.measureText(c).width + spacing;
  total -= spacing;
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  for (const c of chars) {
    if (shadow) {
      ctx.fillStyle = shadow;
      ctx.fillText(c, cx + 1.4, y + 1.4);
    }
    ctx.fillStyle = color;
    ctx.fillText(c, cx, y);
    cx += ctx.measureText(c).width + spacing;
  }
  ctx.restore();
  return total;
}

export function text(ctx, str, x, y, opts = {}) {
  const {
    size = 14, weight = '400', color = UI.parchment, align = 'left',
    baseline = 'alphabetic', font = UI.serif, alpha = 1, stroke = null, strokeWidth = 3,
  } = opts;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  if (stroke) {
    ctx.lineWidth = strokeWidth;
    ctx.strokeStyle = stroke;
    ctx.strokeText(str, x, y);
  }
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
  ctx.restore();
}

/**
 * A stat bar with an optional lagging "damage ghost" and segment ticks.
 */
export function bar(ctx, x, y, w, h, frac, opts = {}) {
  const {
    fill = UI.hp, back = 'rgba(0,0,0,0.55)', ghost = null, ghostColor = 'rgba(240,180,120,0.45)',
    border = UI.goldDim, segments = 0, glow = 0, skew = 5,
  } = opts;
  const f = Math.max(0, Math.min(1, frac));

  const path = (ww) => {
    ctx.beginPath();
    ctx.moveTo(x + skew, y);
    ctx.lineTo(x + ww, y);
    ctx.lineTo(x + ww - skew, y + h);
    ctx.lineTo(x, y + h);
    ctx.closePath();
  };

  ctx.save();
  path(w);
  ctx.fillStyle = back;
  ctx.fill();

  if (ghost !== null && ghost > f) {
    ctx.save();
    path(w);
    ctx.clip();
    path(Math.max(skew, w * ghost));
    ctx.fillStyle = ghostColor;
    ctx.fill();
    ctx.restore();
  }

  if (f > 0) {
    ctx.save();
    path(w);
    ctx.clip();
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, fill);
    g.addColorStop(0.5, fill);
    g.addColorStop(1, shade(fill, -0.35));
    ctx.fillStyle = g;
    path(Math.max(skew, w * f));
    ctx.fill();
    // Specular sheen along the top edge.
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y + 1, w * f, Math.max(1, h * 0.22));
    ctx.restore();
  }

  if (glow > 0) {
    ctx.save();
    ctx.globalAlpha = glow * 0.6;
    ctx.shadowColor = fill;
    ctx.shadowBlur = 14;
    path(Math.max(skew, w * f));
    ctx.strokeStyle = fill;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  if (segments > 1) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#04100f';
    ctx.lineWidth = 1;
    for (let i = 1; i < segments; i++) {
      const px = x + (w * i) / segments;
      ctx.beginPath();
      ctx.moveTo(px + skew * (1 - i / segments), y);
      ctx.lineTo(px - skew * (i / segments), y + h);
      ctx.stroke();
    }
    ctx.restore();
  }

  if (border) {
    path(w);
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.85;
    ctx.stroke();
  }
  ctx.restore();
}

/** Diamond pips representing discrete Action Points. */
export function pips(ctx, x, y, count, max, opts = {}) {
  const { size = 7, gap = 4.5, color = UI.ap, empty = UI.apEmpty, glowIndex = -1 } = opts;
  for (let i = 0; i < max; i++) {
    const cx = x + i * (size * 2 + gap) + size;
    const filled = i < count;
    ctx.save();
    ctx.translate(cx, y);
    ctx.rotate(Math.PI / 4);
    ctx.beginPath();
    ctx.rect(-size * 0.62, -size * 0.62, size * 1.24, size * 1.24);
    if (filled) {
      ctx.fillStyle = color;
      if (i === glowIndex) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
      }
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    } else {
      ctx.fillStyle = empty;
      ctx.fill();
      ctx.strokeStyle = 'rgba(160,190,200,0.3)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    ctx.restore();
  }
  return max * (size * 2 + gap);
}

/** Circular status badge with a glyph. */
export function badge(ctx, x, y, r, glyph, color, opts = {}) {
  const { alpha = 1, count = 0, ring = true } = opts;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(6,18,20,0.9)';
  ctx.fill();
  if (ring) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
  ctx.fillStyle = color;
  ctx.font = `${Math.round(r * 1.25)}px ${UI.serif}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(glyph, x, y + 0.5);
  if (count > 1) {
    ctx.font = `700 ${Math.round(r * 0.85)}px ${UI.serif}`;
    ctx.fillStyle = UI.parchment;
    ctx.fillText(String(count), x + r * 0.85, y + r * 0.85);
  }
  ctx.restore();
}

/** Horizontal rule with a central lozenge — the section divider motif. */
export function divider(ctx, x, y, w, opts = {}) {
  const { color = UI.goldDim, alpha = 0.75 } = opts;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w / 2 - 9, y);
  ctx.moveTo(x + w / 2 + 9, y);
  ctx.lineTo(x + w, y);
  ctx.stroke();
  ctx.save();
  ctx.translate(x + w / 2, y);
  ctx.rotate(Math.PI / 4);
  ctx.strokeRect(-3.2, -3.2, 6.4, 6.4);
  ctx.restore();
  ctx.restore();
}

/** Lighten (+) or darken (-) a hex colour. */
export function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(((n >> 16) & 255) * (1 + amount));
  const g = clamp(((n >> 8) & 255) * (1 + amount));
  const b = clamp((n & 255) * (1 + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export function rgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** Portrait medallion: an initial inside a gilded ring, tinted per character. */
export function portrait(ctx, x, y, r, initial, tint, opts = {}) {
  const { active = false, dead = false, alpha = 1 } = opts;
  ctx.save();
  ctx.globalAlpha *= alpha;
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
  g.addColorStop(0, rgba(tint, dead ? 0.18 : 0.6));
  g.addColorStop(1, 'rgba(6,20,22,0.95)');
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = active ? UI.goldBright : UI.goldDim;
  ctx.lineWidth = active ? 2.4 : 1.4;
  ctx.stroke();
  if (active) {
    ctx.beginPath();
    ctx.arc(x, y, r + 3.5, 0, Math.PI * 2);
    ctx.strokeStyle = rgba(UI.gold, 0.5);
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.fillStyle = dead ? 'rgba(200,190,170,0.35)' : UI.parchment;
  ctx.font = `600 ${Math.round(r * 1.05)}px ${UI.serif}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(dead ? '✝' : initial, x, y + 1);
  ctx.restore();
}
