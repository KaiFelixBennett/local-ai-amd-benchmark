import { makeCanvas } from '../engine/textures.js';

// ---------------------------------------------------------------------------
// Status-effect registry. Each status has a label, colour, and a small icon
// painter that draws into a canvas (no image files).
// Semantics consumed by Fighter.tickStatuses / action-resolver:
//   burn/poison -> per-turn damage (potency = damage)
//   stun        -> skip the turn
//   atkUp/defUp/atkDown/defDown -> potency = fraction modifier
//   slow        -> acted twice per round instead of once
//   mark        -> takes +15% damage (icon + aura)
// ---------------------------------------------------------------------------

export const STATUSES = {
  burn: { label: 'Burn', color: '#e2793a', kind: 'debuff', tick: true, icon: iconBurn },
  poison: { label: 'Poison', color: '#6b7a4a', kind: 'debuff', tick: true, icon: iconPoison },
  stun: { label: 'Stun', color: '#f4d489', kind: 'debuff', icon: iconStun },
  slow: { label: 'Slow', color: '#7fc7d4', kind: 'debuff', icon: iconSlow },
  atkUp: { label: 'Focus', color: '#d8a94a', kind: 'buff', icon: iconAtkUp },
  defUp: { label: 'Guard', color: '#3f6b6d', kind: 'buff', icon: iconDefUp },
  atkDown: { label: 'Weakened', color: '#7b6a9a', kind: 'debuff', icon: iconAtkDown },
  defDown: { label: 'Sundered', color: '#a12d33', kind: 'debuff', icon: iconDefDown },
  mark: { label: 'Marked', color: '#a12d33', kind: 'debuff', icon: iconMark },
  broken: { label: 'Broken', color: '#f4d489', kind: 'debuff', icon: iconBroken }
};

function iconCanvas(paintFn, color) {
  const c = makeCanvas(40, 40);
  const ctx = c.getContext('2d');
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  paintFn(ctx, color);
  return c;
}

function iconBurn(ctx, col) {
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(20, 4);
  ctx.bezierCurveTo(30, 14, 32, 20, 28, 28);
  ctx.bezierCurveTo(26, 34, 14, 34, 12, 28);
  ctx.bezierCurveTo(9, 20, 14, 16, 20, 4);
  ctx.fill();
  ctx.fillStyle = '#f4d489';
  ctx.beginPath();
  ctx.moveTo(20, 16);
  ctx.bezierCurveTo(25, 22, 25, 27, 20, 30);
  ctx.bezierCurveTo(16, 27, 16, 22, 20, 16);
  ctx.fill();
}

function iconPoison(ctx, col) {
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(20, 24, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(230,255,210,0.85)';
  for (const [x, y, r] of [[16, 21, 3], [24, 26, 2.4], [21, 18, 1.8]]) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = col; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(20, 13); ctx.quadraticCurveTo(26, 7, 30, 10); ctx.stroke();
}

function iconStun(ctx, col) {
  ctx.strokeStyle = col; ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(22, 4); ctx.lineTo(12, 21); ctx.lineTo(19, 21); ctx.lineTo(14, 36);
  ctx.lineTo(28, 17); ctx.lineTo(21, 17); ctx.lineTo(27, 4);
  ctx.closePath();
  ctx.fillStyle = col; ctx.fill();
}

function iconSlow(ctx, col) {
  ctx.strokeStyle = col; ctx.lineWidth = 3.4;
  ctx.beginPath(); ctx.arc(20, 20, 12, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(20, 12); ctx.lineTo(20, 20); ctx.lineTo(26, 24); ctx.stroke();
}

function iconAtkUp(ctx, col) {
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.moveTo(20, 4); ctx.lineTo(31, 22); ctx.lineTo(24, 22); ctx.lineTo(24, 36);
  ctx.lineTo(16, 36); ctx.lineTo(16, 22); ctx.lineTo(9, 22); ctx.closePath(); ctx.fill();
}

function iconDefUp(ctx, col) {
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(20, 4); ctx.lineTo(33, 9); ctx.lineTo(33, 21);
  ctx.quadraticCurveTo(33, 31, 20, 37);
  ctx.quadraticCurveTo(7, 31, 7, 21);
  ctx.lineTo(7, 9); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(216,232,230,0.5)';
  ctx.beginPath();
  ctx.moveTo(20, 9); ctx.lineTo(28, 12); ctx.lineTo(28, 21);
  ctx.quadraticCurveTo(28, 27, 20, 31); ctx.closePath(); ctx.fill();
}

function iconAtkDown(ctx, col) {
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.moveTo(20, 36); ctx.lineTo(31, 18); ctx.lineTo(24, 18); ctx.lineTo(24, 4);
  ctx.lineTo(16, 4); ctx.lineTo(16, 18); ctx.lineTo(9, 18); ctx.closePath(); ctx.fill();
}

function iconDefDown(ctx, col) {
  iconDefUp(ctx, col);
  ctx.strokeStyle = '#e8e2d2'; ctx.lineWidth = 3.4;
  ctx.beginPath(); ctx.moveTo(8, 8); ctx.lineTo(32, 33); ctx.stroke();
}

function iconMark(ctx, col) {
  ctx.strokeStyle = col; ctx.lineWidth = 3.2;
  ctx.beginPath(); ctx.arc(20, 22, 11, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(20, 5); ctx.lineTo(20, 13); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(20, 31); ctx.lineTo(20, 38); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(4, 22); ctx.lineTo(11, 22); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(29, 22); ctx.lineTo(36, 22); ctx.stroke();
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.arc(20, 22, 3.4, 0, Math.PI * 2); ctx.fill();
}

function iconBroken(ctx, col) {
  ctx.strokeStyle = col; ctx.lineWidth = 3.6;
  ctx.beginPath(); ctx.arc(20, 20, 12, 0.4, Math.PI * 2 - 0.4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(20, 6); ctx.lineTo(14, 26); ctx.moveTo(14, 26); ctx.lineTo(26, 22); ctx.stroke();
}
