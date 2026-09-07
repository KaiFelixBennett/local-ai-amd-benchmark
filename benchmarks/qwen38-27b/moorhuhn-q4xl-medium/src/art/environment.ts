/**
 * Environment painter: builds the layered background, water, foreground props,
 * and interactive objects for a map. Returns handles the scene animates.
 * All visuals are procedural — no image files.
 */

import Phaser from 'phaser';
import type { MapConfig } from '../core/maps';

export interface EnvHandle {
  layers: Phaser.GameObjects.Image[];
  water: Phaser.GameObjects.Graphics | null;
  props: Phaser.GameObjects.GameObject[];
  fog: Phaser.GameObjects.Rectangle;
  tint: Phaser.GameObjects.Rectangle;
  stars: Phaser.GameObjects.Particles.ParticleEmitter | null;
  interactive: InteractiveProp[];
  updatables: { update: (t: number, dt: number) => void; destroy?: () => void }[];
  update: (t: number, dt: number) => void;
  destroy: () => void;
}

export interface InteractiveProp {
  id: string;
  x: number;
  y: number;
  radius: number;
  obj: Phaser.GameObjects.GameObject;
  /** effect id the prop triggers */
  effect: 'points' | 'chain' | 'time' | 'bonus' | 'scare' | 'multiplier' | 'reveal';
  points: number;
  used: boolean;
  label: string;
}

/** Paint the full environment for a map into the scene. */
export function buildEnvironment(scene: Phaser.Scene, map: MapConfig, W: number, H: number): EnvHandle {
  const layers: Phaser.GameObjects.Image[] = [];
  const props: Phaser.GameObjects.GameObject[] = [];
  const interactive: InteractiveProp[] = [];

  // Sky gradient
  const sky = scene.add.graphics();
  drawSky(sky, W, H, map.skyTop, map.skyBottom);
  const skyTex = skyTexture(scene, 'sky_' + map.id, W, H, map.skyTop, map.skyBottom);
  sky.destroy();
  scene.add.image(0, 0, skyTex).setOrigin(0, 0).setDepth(-200);

  // Sun / moon
  if (map.sun) {
    const sunGlow = scene.add.circle(map.sun.x * W, map.sun.y * H, map.sun.r * 2.2, hex(map.sun.glow), 0.25).setDepth(-198);
    const sun = scene.add.circle(map.sun.x * W, map.sun.y * H, map.sun.r, hex(map.sun.color), 1).setDepth(-197);
    props.push(sunGlow, sun);
  }
  if (map.moon) {
    const glow = scene.add.circle(map.moon.x * W, map.moon.y * H, map.moon.r * 2.4, hex(map.moon.color), 0.15).setDepth(-198);
    const moon = scene.add.circle(map.moon.x * W, map.moon.y * H, map.moon.r, hex(map.moon.color), 1).setDepth(-197);
    props.push(glow, moon);
  }

  // Stars for night maps
  let stars: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  if (map.weather === 'stars' || map.moon) {
    makeGlow(scene, 'star', 0xffffff, 12);
    stars = scene.add
      .particles(0, 0, 'star', {
        x: { min: 0, max: W },
        y: { min: 0, max: H * 0.6 },
        scale: { start: 0.8, end: 0.2 },
        alpha: { start: 0.9, end: 0.3 },
        lifespan: 2000,
        frequency: 120,
        quantity: 1,
        blendMode: 'ADD'
      })
      .setDepth(-196);
  }

  // Parallax layers
  map.layers.forEach((layer, i) => {
    const texKey = `layer_${map.id}_${i}`;
    drawParallaxLayer(scene, texKey, W, H, layer);
    const img = scene.add
      .image(W / 2, layer.yBase * H, texKey)
      .setOrigin(0.5, 1)
      .setDepth(-100 + i * 10);
    layers.push(img);
  });

  // Water
  let water: Phaser.GameObjects.Graphics | null = null;
  if (map.water) {
    water = scene.add.graphics().setDepth(-20);
  }

  // Foreground + interactive props
  const updatables: { update: (t: number, dt: number) => void; destroy?: () => void }[] = [];
  buildProps(scene, map, W, H, props, interactive, updatables);

  // Fog + tint overlays
  const fog = scene.add.rectangle(W / 2, H / 2, W, H, 0xffffff, map.fog).setDepth(900);
  const tint = scene.add.rectangle(W / 2, H / 2, W, H, hex(map.tint), 0).setBlendMode('MULTIPLY').setDepth(901);

  const update = (t: number, dt: number): void => {
    void dt;
    for (const u of updatables) u.update(t, dt);
    // gentle parallax drift
    layers.forEach((img, i) => {
      const f = map.layers[i].factor;
      img.x = W / 2 + Math.sin(t * 0.0001 * (i + 1)) * f * 20;
    });
    // water shimmer
    if (water && map.water) {
      water.clear();
      const wy = map.water.y * H;
      water.fillStyle(hex(map.water.color), map.water.opacity);
      water.fillRect(0, wy, W, H - wy);
      water.lineStyle(2, 0xffffff, 0.15);
      for (let x = 0; x < W; x += 40) {
        const off = Math.sin(t * 0.002 + x * 0.05) * 3;
        water.lineBetween(x, wy + 6 + off, x + 20, wy + 6 + off);
      }
    }
    // fog breathing
    fog.alpha = map.fog * (0.8 + Math.sin(t * 0.0006) * 0.2);
  };

  const destroy = (): void => {
    layers.forEach((l) => l.destroy());
    props.forEach((p) => p.destroy());
    updatables.forEach((u) => u.destroy?.());
    water?.destroy();
    fog.destroy();
    tint.destroy();
    stars?.destroy();
  };

  return { layers, water, props, fog, tint, stars, interactive, updatables, update, destroy };
}

function drawSky(g: Phaser.GameObjects.Graphics, W: number, H: number, top: string, bottom: string): void {
  const hTop = hex(top);
  const hBottom = hex(bottom);
  const steps = 24;
  for (let i = 0; i < steps; i++) {
    const f = i / steps;
    g.fillStyle(lerpColor(hTop, hBottom, f), 1);
    g.fillRect(0, (H / steps) * i, W, H / steps + 1);
  }
}

function skyTexture(scene: Phaser.Scene, key: string, W: number, H: number, top: string, bottom: string): string {
  const g = scene.add.graphics();
  drawSky(g, W, H, top, bottom);
  g.generateTexture(key, W, H);
  g.destroy();
  return key;
}

function drawParallaxLayer(scene: Phaser.Scene, key: string, W: number, H: number, layer: { color: string; color2: string; kind: string; height: number; yBase: number }): void {
  const g = scene.add.graphics();
  const baseY = layer.yBase * H;
  const c1 = hex(layer.color);
  const c2 = hex(layer.color2);
  if (layer.kind === 'hills' || layer.kind === 'mid') {
    g.fillStyle(c1, 1);
    g.beginPath();
    g.moveTo(0, baseY + layer.height);
    const segs = 8;
    for (let i = 0; i <= segs; i++) {
      const x = (W / segs) * i;
      const y = baseY + Math.sin(i * 1.7) * layer.height * 0.3 - (i % 2) * layer.height * 0.15;
      g.lineTo(x, y);
    }
    g.lineTo(W, baseY + layer.height);
    g.closePath();
    g.fillPath();
    g.fillStyle(c2, 0.4);
    g.beginPath();
    g.moveTo(0, baseY + layer.height);
    for (let i = 0; i <= segs; i++) {
      const x = (W / segs) * i;
      const y = baseY + layer.height * 0.5 + Math.sin(i * 1.3 + 1) * layer.height * 0.2;
      g.lineTo(x, y);
    }
    g.lineTo(W, baseY + layer.height);
    g.closePath();
    g.fillPath();
  } else if (layer.kind === 'reeds') {
    g.fillStyle(c1, 1);
    g.fillRect(0, baseY + layer.height * 0.6, W, layer.height * 0.4);
    // reed blades
    for (let x = 0; x < W; x += 14) {
      const h = layer.height * (0.5 + ((x * 7) % 50) / 100);
      g.fillStyle(c2, 0.8);
      g.fillRect(x, baseY + layer.height * 0.6 - h, 4, h);
    }
  } else {
    // foreground silhouette
    g.fillStyle(c1, 1);
    g.fillRect(0, baseY + layer.height * 0.5, W, layer.height * 0.5);
    g.fillStyle(c2, 0.6);
    for (let x = 20; x < W; x += 60) {
      g.fillTriangle(x, baseY + layer.height, x + 30, baseY + layer.height - 40, x + 60, baseY + layer.height);
    }
  }
  g.generateTexture(key, W, H);
  g.destroy();
}

function makeGlow(scene: Phaser.Scene, key: string, color: number, size: number): void {
  if (scene.textures.exists(key)) return;
  const g = scene.add.graphics();
  for (let i = 6; i > 0; i--) {
    g.fillStyle(color, 0.1);
    g.fillCircle(size / 2, size / 2, (size / 2) * (i / 6));
  }
  g.fillStyle(color, 0.8);
  g.fillCircle(size / 2, size / 2, size * 0.15);
  g.generateTexture(key, size, size);
  g.destroy();
}

function buildProps(
  scene: Phaser.Scene,
  map: MapConfig,
  W: number,
  H: number,
  props: Phaser.GameObjects.GameObject[],
  interactive: InteractiveProp[],
  updatables: { update: (t: number, dt: number) => void; destroy?: () => void }[]
): void {
  const groundY = H * 0.86;
  // Windmill (creaking) — nebelmoor
  if (map.id === 'nebelmoor') {
    const wm = makeWindmill(scene, W * 0.15, groundY);
    props.push(wm.body, wm.blades);
    updatables.push(wm);
    interactive.push({
      id: 'windmill',
      x: W * 0.15,
      y: groundY - 120,
      radius: 60,
      obj: wm.blades,
      effect: 'chain',
      points: 150,
      used: false,
      label: 'Windrad'
    });
    // Fence cans
    for (let i = 0; i < 4; i++) {
      const x = W * 0.62 + i * 26;
      const can = scene.add.circle(x, groundY - 6, 8, 0xc0c8d2, 1).setDepth(50);
      props.push(can);
      interactive.push({ id: `can_${i}`, x, y: groundY - 6, radius: 12, obj: can, effect: 'points', points: 40, used: false, label: 'Dose' });
    }
    // Pumpkins
    for (let i = 0; i < 3; i++) {
      const x = W * 0.4 + i * 34;
      const p = scene.add.circle(x, groundY - 4, 12, 0xe87a20, 1).setDepth(50);
      scene.add.circle(x, groundY - 4, 12, 0xb85a10, 0.5).setDepth(51);
      props.push(p);
      interactive.push({ id: `pumpkin_${i}`, x, y: groundY - 4, radius: 16, obj: p, effect: 'points', points: 60, used: false, label: 'Kürbis' });
    }
  }
  // Lighthouse (sturmklippen)
  if (map.id === 'sturmklippen') {
    const lh = makeLighthouse(scene, W * 0.85, groundY);
    props.push(lh.tower, lh.light, lh.roof);
    interactive.push({
      id: 'lighthouse',
      x: W * 0.85,
      y: groundY - 150,
      radius: 46,
      obj: lh.light,
      effect: 'multiplier',
      points: 200,
      used: false,
      label: 'Leuchtturm'
    });
    // Bell on a post
    const bell = scene.add.circle(W * 0.1, groundY - 40, 12, 0xd8b84a, 1).setDepth(50);
    props.push(bell);
    interactive.push({ id: 'bell', x: W * 0.1, y: groundY - 40, radius: 16, obj: bell, effect: 'chain', points: 180, used: false, label: 'Glocke' });
  }
  // Lantern + ghost light (mondbruch)
  if (map.id === 'mondbruch') {
    for (let i = 0; i < 3; i++) {
      const x = W * (0.2 + i * 0.3);
      const g = scene.add.circle(x, groundY - 30 - i * 20, 10, 0xb0e0ff, 0.7).setDepth(52);
      props.push(g);
      interactive.push({ id: `ghost_${i}`, x, y: groundY - 30 - i * 20, radius: 18, obj: g, effect: 'reveal', points: 120, used: false, label: 'Geisterlicht' });
    }
    const lantern = scene.add.circle(W * 0.5, groundY - 50, 12, 0xffd870, 0.8).setDepth(52);
    props.push(lantern);
    interactive.push({ id: 'lantern', x: W * 0.5, y: groundY - 50, radius: 16, obj: lantern, effect: 'bonus', points: 150, used: false, label: 'Laterne' });
  }
  // Hanging bucket (all maps) — chain start
  const bucketX = W * 0.5;
  const bucket = scene.add.circle(bucketX, groundY - 90, 12, 0x8a6a3a, 1).setDepth(52);
  props.push(bucket);
  interactive.push({ id: 'bucket', x: bucketX, y: groundY - 90, radius: 16, obj: bucket, effect: 'chain', points: 120, used: false, label: 'Eimer' });
  // Scarecrow (nebelmoor + sturmklippen)
  if (map.id !== 'mondbruch') {
    const sc = makeScarecrow(scene, W * 0.3, groundY);
    props.push(...sc.parts);
    interactive.push({ id: 'scarecrow', x: W * 0.3, y: groundY - 60, radius: 40, obj: sc.head, effect: 'scare', points: 100, used: false, label: 'Vogelscheuche' });
  }
  // Mushrooms (nebelmoor)
  if (map.id === 'nebelmoor') {
    for (let i = 0; i < 3; i++) {
      const x = W * 0.75 + i * 24;
      const stem = scene.add.rectangle(x, groundY - 4, 5, 10, 0xe8d8b0, 1).setDepth(49);
      const cap = scene.add.circle(x, groundY - 8, 11, 0xd05030, 1).setDepth(50);
      scene.add.circle(x - 3, groundY - 10, 2, 0xf0e0c0, 0.8).setDepth(51);
      props.push(stem, cap);
      interactive.push({ id: `mushroom_${i}`, x, y: groundY - 8, radius: 14, obj: cap, effect: 'time', points: 80, used: false, label: 'Pilz' });
    }
  }
}

function makeWindmill(
  scene: Phaser.Scene,
  x: number,
  groundY: number
): { body: Phaser.GameObjects.Rectangle; blades: Phaser.GameObjects.Graphics; update: (t: number, dt: number) => void } {
  const body = scene.add.rectangle(x, groundY - 90, 40, 150, 0x7a5a3a, 1).setDepth(40);
  scene.add.rectangle(x, groundY - 90, 40, 150, 0x5a4028, 0.3).setDepth(41);
  scene.add.circle(x, groundY - 150, 10, 0x4a3526, 1).setDepth(42);
  const bladesG = scene.add.graphics().setDepth(43);
  return {
    body,
    blades: bladesG,
    update(t: number): void {
      bladesG.clear();
      const a = t * 0.001;
      bladesG.lineStyle(6, 0x6a4a2a, 1);
      for (let i = 0; i < 4; i++) {
        const ang = a + (i * Math.PI) / 2;
        bladesG.lineBetween(x, groundY - 150, x + Math.cos(ang) * 70, groundY - 150 + Math.sin(ang) * 70);
      }
    }
  };
}

function makeLighthouse(scene: Phaser.Scene, x: number, groundY: number) {
  // Tower: stacked rectangles to fake a trapezoid
  const tower = scene.add.rectangle(x, groundY - 70, 52, 140, 0xf0f0f0, 1).setDepth(40);
  for (let i = 0; i < 3; i++) {
    scene.add.rectangle(x, groundY - 40 - i * 46, 48 - i * 4, 18, 0xd04030, 0.7).setDepth(41);
  }
  const light = scene.add.circle(x, groundY - 150, 14, 0xfff0a0, 1).setDepth(43);
  const roof = scene.add.triangle(x - 20, groundY - 165, x + 20, groundY - 165, x, groundY - 195, 0x404858, 1).setDepth(44);
  return { tower, light, roof };
}

function makeScarecrow(
  scene: Phaser.Scene,
  x: number,
  groundY: number
): { body: Phaser.GameObjects.Rectangle; head: Phaser.GameObjects.GameObject; parts: Phaser.GameObjects.GameObject[] } {
  const post = scene.add.rectangle(x, groundY - 40, 8, 90, 0x6a4a2a, 1).setDepth(40);
  const arms = scene.add.rectangle(x, groundY - 60, 70, 6, 0x6a4a2a, 1).setDepth(41);
  const body = scene.add.rectangle(x, groundY - 55, 40, 46, 0x5a7a4a, 1).setDepth(42);
  const head = scene.add.circle(x, groundY - 90, 16, 0xe8d0a0, 1).setDepth(43);
  const hat = scene.add.triangle(x - 20, groundY - 96, x + 20, groundY - 96, x, groundY - 116, 0x6a5a3a, 1).setDepth(44);
  return { body, head, parts: [post, arms, body, head, hat] };
}

// ---------- color helpers ----------
function hex(str: string): number {
  return Number('0x' + str.replace('#', ''));
}
function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}
