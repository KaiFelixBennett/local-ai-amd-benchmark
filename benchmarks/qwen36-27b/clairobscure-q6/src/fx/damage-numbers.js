/**
 * Floating damage/heal numbers projected from 3D to 2D screen space.
 * Delegates rendering to the HUD canvas.
 */

export class DamageNumbers {
  constructor(hud, camera) {
    this.hud = hud;
    this.camera = camera;
  }

  /** Show a damage number at a 3D world position. */
  show(worldPos, value, options = {}) {
    const screenPos = this._worldToScreen(worldPos);
    if (!screenPos) return;

    const color = options.color || (options.isHeal ? '#44ff44' : '#ff4444');
    const dn = {
      x: screenPos.x,
      y: screenPos.y,
      value: String(value),
      color,
      isCrit: options.isCrit || false,
      isHeal: options.isHeal || false,
      life: 1.2,
      vy: -70,
      vx: (Math.random() - 0.5) * 20,
    };
    this.hud._damageNumbers.push(dn);
  }

  _worldToScreen(worldPos) {
    const v = worldPos.clone();
    v.project(this.camera);

    const x = (v.x * 0.5 + 0.5) * this.hud.canvas.clientWidth;
    const y = (-v.y * 0.5 + 0.5) * this.hud.canvas.clientHeight;

    // Check if behind camera
    if (v.z > 1) return null;
    return { x, y };
  }
}
