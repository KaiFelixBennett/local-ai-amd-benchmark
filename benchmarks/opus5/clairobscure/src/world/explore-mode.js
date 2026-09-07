/**
 * The overworld: "Le Parvis Noyé".
 *
 * Owns its own scene, camera and post-processing chain, so switching to the
 * battle is a matter of pointing the shared renderer at a different pair. Holds
 * the terrain, props, vegetation, seals, the player and the cutscene director,
 * and reports interactions upward through callbacks rather than reaching into
 * the app.
 */

import * as THREE from 'three';
import { PostFX } from '../engine/postfx.js';
import { AssetManager } from './asset-manager.js';
import { CollisionWorld } from './collision.js';
import { buildTerrain, heightAt, slopeAt, RIM_RADIUS } from './terrain.js';
import { buildProps, buildChandeliers } from './props.js';
import { buildGrass, buildMotes } from './vegetation.js';
import { Seal, GateMarker } from './interactables.js';
import { Player, Follower } from './player.js';
import { Actor, rotationOnlyClip, locomotionFor } from './actor.js';
import { ExploreCamera } from './explore-camera.js';
import { CutsceneDirector } from './cutscene.js';
import { SEALS, GATE_ENCOUNTER, SPAWN, CAMP } from './story.js';
import { clamp01 } from '../core/easing.js';

const LAMP_LIGHT_POOL = 5;
const INTERACT_RANGE = 7.0;

/**
 * Offset from the shadow focus to the key light, in metres.
 *
 * Azimuth 42° is the measured bearing of the sun in the loaded HDRI; the
 * elevation is 16° rather than the measured ~0° so that shadows stay finite.
 * Derived once here so the initial placement and the per-frame follow cannot
 * drift apart.
 */
const SUN_OFFSET = (() => {
  const az = 42 * (Math.PI / 180);
  const el = 16 * (Math.PI / 180);
  const d = 78;
  const ce = Math.cos(el);
  return new THREE.Vector3(Math.sin(az) * ce * d, Math.sin(el) * d, Math.cos(az) * ce * d);
})();

export class ExploreMode {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {import('./asset-manager.js').AssetManager} assets
   */
  constructor(renderer, assets) {
    this.renderer = renderer;
    this.assets = assets;
    this.elapsed = 0;
    this.active = false;
    this.interactTarget = null;
    this.onInteract = null;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.2, 620);
    this.collision = new CollisionWorld();
    this.collision.setBounds(0, 0, RIM_RADIUS - 4);

    this._v = new THREE.Vector3();
    this._buildEnvironment();
    this._buildWorld();
    this._buildLighting();

    this.exploreCamera = new ExploreCamera(this.camera, this.collision);
    this.cutscene = new CutsceneDirector(this.camera);

    this.postfx = new PostFX({ renderer, scene: this.scene, camera: this.camera });
  }

  async initPost() {
    await this.postfx.init();
    // The world is lit by a real HDRI whose sun peaks around 60,000 nits. At a
    // wide bloom radius that single texel smeared into a white blob covering
    // half the frame — the sky read as milk and everything in front of it lost
    // contrast. A high threshold and a tight radius keep the glow on the disc
    // where a camera would put it, and leave bloom free to do its real job on
    // the seals, the water highlights and the lamp flames.
    this.postfx.baseStrength = 0.19;
    if (this.postfx.bloom) {
      this.postfx.bloom.threshold = 1.7;
      this.postfx.bloom.radius = 0.28;
    }
  }

  // -------------------------------------------------------------------------
  // Construction
  // -------------------------------------------------------------------------

  _buildEnvironment() {
    const env = this.assets.environment;
    if (env) {
      this.scene.environment = env;
      this.scene.background = env;
      // Shown sharp: this is a 4k sky with real cloud structure, and blurring
      // it throws away the only thing that makes a backdrop read as a
      // photograph rather than a gradient.
      this.scene.backgroundBlurriness = 0;
      this.scene.backgroundIntensity = 1.0;
    } else {
      this.scene.background = new THREE.Color(0x14313a);
    }
    // Distance haze, in the colour of the HDRI's horizon rather than of the
    // water. A dark fog colour under a bright sky *darkens* far geometry
    // instead of dissolving it, which left the rim ridge standing against the
    // horizon as a hard ochre wall instead of fading into it.
    //
    // Density is set from what aerial perspective actually does: a little
    // under 10% veiling at 90 m, about a third at the far rim. The previous
    // value was four times that and dissolved the middle distance into haze.
    this.scene.fog = new THREE.FogExp2(0xb9ae9c, 0.0034);
  }

  _buildWorld() {
    const landmarks = [
      { x: SPAWN.x, z: SPAWN.z, clear: 12 },
      { x: CAMP.x, z: CAMP.z, clear: 10 },
      ...SEALS.map((s) => ({ x: s.x, z: s.z, clear: 13 })),
      { x: GATE_ENCOUNTER.x, z: GATE_ENCOUNTER.z, clear: 10 },
    ];

    this.terrain = buildTerrain(this.assets);
    this.scene.add(this.terrain.group);

    this.props = buildProps(this.assets, this.collision, landmarks);
    this.scene.add(this.props.group);

    this.chandeliers = buildChandeliers(this.assets);
    this.scene.add(this.chandeliers.group);

    this.grass = buildGrass(9000);
    this.scene.add(this.grass.mesh);

    this.motes = buildMotes(650, RIM_RADIUS - 6);
    this.scene.add(this.motes.points);

    this.seals = SEALS.map((def) => {
      const seal = new Seal(def, this.assets);
      this.scene.add(seal.group);
      this.collision.addCircle(def.x, def.z, 3.4, heightAt(def.x, def.z) + 8);
      return seal;
    });

    this.gate = new GateMarker(GATE_ENCOUNTER, this.props.gate);
    this.scene.add(this.gate.group);

    this._buildLampGlows();
    this._buildGildedFallen();
  }

  /**
   * Additive cones under each lamp head: cheap, convincing volumetrics.
   *
   * Kept small and very faint, and faded out with distance. Additive layers
   * composite in linear space and are then sRGB-encoded, which roughly
   * quadruples their apparent brightness — ten large cones at "subtle" opacity
   * stacked into an opaque ochre wall across the whole plaza.
   */
  _buildLampGlows() {
    const group = new THREE.Group();
    group.name = 'lamp-glows';
    this.lampGlows = [];
    for (const l of this.props.lamps) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffc27a,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.15, 3.2, 14, 1, true), mat);
      cone.position.set(l.x, l.y - 1.5, l.z);
      group.add(cone);
      this.lampGlows.push({ cone, mat, lamp: l });

      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.19, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xffd9a0 }),
      );
      bulb.position.set(l.x, l.y, l.z);
      group.add(bulb);
    }
    this.scene.add(group);
  }

  /**
   * The thirty-two previous expeditions, gilded where they stood in the moat,
   * all facing the gate. This is the story told without a single line of text.
   */
  _buildGildedFallen() {
    const group = new THREE.Group();
    group.name = 'gilded-fallen';
    // Tarnished, not mirror-bright. At metalness 1 / roughness 0.34 against a
    // sunset HDRI these blew past the bloom threshold, and thirty-two of them
    // merged into a single white mass hanging over the plaza.
    const gold = new THREE.MeshStandardMaterial({
      color: 0x8a6d33, metalness: 0.85, roughness: 0.62, envMapIntensity: 0.55,
    });
    const gateAngle = Math.PI / 6;
    const count = 32;
    // Spread across the whole approach rather than a tight ring in the moat:
    // packed at one radius, thirty-two figures stack into an unreadable wall
    // from outside the plaza. Strung out from the far field to the water they
    // read as an army frozen mid-advance on the gate — which is the story.
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      // Converge on the gate as they get closer to it.
      const spread = 1.35 - t * 0.95;
      const a = gateAngle + Math.PI + Math.sin(i * 2.399) * spread;
      const r = 62 - t * 33 + ((i * 11) % 7) * 1.1;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = heightAt(x, z);

      if (slopeAt(x, z) > 0.5) continue;
      const figure = new THREE.Group();
      const scale = 0.88 + ((i * 13) % 7) * 0.035;
      // Deliberately crude: a silhouette, not a character. Reads as a statue.
      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.62, 4, 8), gold);
      torso.position.y = 1.16;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), gold);
      head.position.y = 1.76;
      const legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.5, 3, 6), gold);
      legL.position.set(0.13, 0.45, 0);
      const legR = legL.clone();
      legR.position.x = -0.13;
      const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.46, 3, 6), gold);
      armL.position.set(0.34, 1.2, 0.02);
      armL.rotation.z = 0.24;
      const armR = armL.clone();
      armR.position.x = -0.34;
      armR.rotation.z = -0.24;
      figure.add(torso, head, legL, legR, armL, armR);
      figure.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

      figure.position.set(x, y, z);
      figure.scale.setScalar(scale);
      // Every one of them turned to face the gate.
      figure.rotation.y = Math.atan2(
        Math.cos(gateAngle) * 25 - x,
        Math.sin(gateAngle) * 25 - z,
      );
      group.add(figure);
    }
    this.scene.add(group);
    this.gildedFallen = group;
  }

  _buildLighting() {
    // The key light is aimed at the sun that is actually in the sky.
    //
    // Its direction was measured, not guessed: a pinhole camera was swept over
    // the loaded background at crushed exposure and the brightest direction
    // recorded — azimuth 42°, sitting on the horizon. The light used to come
    // from (-58, 34, -46), which is 189° away, so every shadow in the world
    // fell towards the sun instead of away from it. Nothing else on this list
    // mattered as much: mismatched shadows read as wrong even to someone who
    // could not say why.
    //
    // The one deliberate departure is elevation. The real disc sits at ~0°,
    // which throws shadows to infinity and leaves the ground unreadable, so
    // the light is lifted to 16° — long, raking, still legible.
    this.sun = new THREE.DirectionalLight(0xffc48a, 3.1);
    this.sun.position.copy(SUN_OFFSET);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const cam = this.sun.shadow.camera;
    cam.near = 1;
    cam.far = 190;
    cam.left = -34;
    cam.right = 34;
    cam.top = 34;
    cam.bottom = -34;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.035;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // Cool bounce out of the water so shadows are never dead black. Kept low
    // on purpose: the HDRI environment already supplies sky-and-ground ambient
    // through the PMREM, and stacking a bright hemisphere on top of it
    // double-counts the fill and flattens every surface in the scene.
    this.fill = new THREE.HemisphereLight(0x8fc4d8, 0x2c2418, 0.16);
    this.scene.add(this.fill);

    // Pool of lamp lights, reassigned to whichever lamps are nearest.
    this.lampLights = [];
    for (let i = 0; i < LAMP_LIGHT_POOL; i++) {
      const l = new THREE.PointLight(0xffb267, 0, 22, 2);
      this.scene.add(l);
      this.lampLights.push(l);
    }
  }

  // -------------------------------------------------------------------------
  // Population
  // -------------------------------------------------------------------------

  /**
   * Move the battle party into the world. The same Character instances are used
   * in both modes, so health, level and appearance carry across untouched.
   * @param {object[]} partyCharacters
   */
  attachParty(partyCharacters) {
    this.party = partyCharacters;

    // Each character animates from its own file where it can. The soldier's
    // reduced clips are the fallback for the one rig that ships no locomotion.
    const soldier = this.assets.character('soldier');
    const borrowed = soldier
      ? soldier.animations
        .filter((c) => /^(idle|walk|run)$/i.test(c.name))
        .map(rotationOnlyClip)
      : [];

    const looks = [
      { key: 'soldier', height: 1.84, tint: 0x8a7f66, grade: 0.55, roughness: 0.72, envMapIntensity: 1.0 },
      { key: 'michelle', height: 1.72, tint: 0x9a8f7c, grade: 0.22, roughness: 0.8, envMapIntensity: 0.95 },
      { key: 'xbot', height: 1.78, tint: 0x3a3128, roughness: 0.55, metalness: 0.35, envMapIntensity: 1.1 },
    ];

    this.actors = [];
    for (const look of looks) {
      const entry = this.assets.character(look.key);
      if (!entry) continue;
      const loco = locomotionFor(entry.animations, borrowed);
      const actor = new Actor(entry.scene, loco.clips, look);
      actor.clipSource = loco.source;
      // Heights as loaded were 1.73 / 1.54 / 0.68 m — normalise or the party
      // looks like an adult walking two children.
      actor.normalizeHeight(look.height || 1.8);
      this.scene.add(actor.root);
      this.actors.push(actor);
    }
    if (this.actors.length === 0) {
      // Nothing to drive; the world is still walkable via an invisible proxy.
      const proxy = new THREE.Group();
      this.scene.add(proxy);
      this.actors.push({
        root: proxy,
        setPosition: (x, y, z) => proxy.position.set(x, y, z),
        setFacing: (y) => { proxy.rotation.y = y; },
        update: () => {},
        measureHeight: () => 1.8,
      });
    }

    this.player = new Player(this.actors[0], this.collision);
    this.player.spawnAt(SPAWN.x, SPAWN.z, SPAWN.facing);

    // Wide flanking angles: at a narrow offset the followers stand exactly
    // where the chase camera sits and fill the entire frame.
    this.followers = this.actors.slice(1).map((actor, i) => {
      const f = new Follower(actor, i === 0 ? -0.95 : 0.95, 3.0 + i * 0.6, this.collision);
      f.teleportBehind(this.player);
      return f;
    });

    this.exploreCamera.snapBehind(this.player);
  }

  /** Restore the camera after a battle; the actors never left this scene. */
  reattachParty() {
    this.player.spawnAt(this.player.position.x, this.player.position.z, this.player.facing);
    for (const f of this.followers) f.teleportBehind(this.player);
    this.exploreCamera.snapBehind(this.player);
  }

  // -------------------------------------------------------------------------
  // Frame
  // -------------------------------------------------------------------------

  /**
   * @param {number} dt
   * @param {object} input { move:{x,y}, look:{dx,dy}, keyYaw, keyPitch, sprint, interact, zoom }
   */
  update(dt, input) {
    this.elapsed += dt;
    const cine = this.cutscene.active;

    if (cine) {
      this.cutscene.update(dt);
      this.player.update(dt, { x: 0, y: 0 }, 0, false);
    } else {
      this.exploreCamera.applyLook(input.look, input.keyYaw, input.keyPitch, dt);
      if (input.zoom) this.exploreCamera.zoom(input.zoom);
      this.player.update(dt, input.move, this.exploreCamera.yaw, input.sprint);
      this.exploreCamera.update(dt, this.player);
    }

    for (const f of this.followers) f.update(dt, this.player);

    this.terrain.water.update(this.elapsed);
    this.grass.update(this.elapsed);
    this.motes.update(dt, this.elapsed);
    for (const s of this.seals) s.update(dt, this.elapsed);
    this.gate.update(dt, this.elapsed);

    for (const c of this.chandeliers.nodes) {
      c.node.position.y = c.base + Math.sin(this.elapsed * 0.5 + c.phase) * 0.16;
      c.node.rotation.y += dt * 0.06;
    }
    this._updateLampGlows();

    this._updateShadowFollow();
    this._updateLampLights();
    if (!cine) this._updateInteraction(input);

    this.postfx.update(dt);
  }

  /** Keep the shadow frustum tight around the player for crisp contact shadows. */
  _updateShadowFollow() {
    const p = this.player.position;
    this.sun.target.position.set(p.x, p.y, p.z);
    this.sun.position.set(p.x + SUN_OFFSET.x, p.y + SUN_OFFSET.y, p.z + SUN_OFFSET.z);
    this.sun.target.updateMatrixWorld();
    this.sun.shadow.camera.updateProjectionMatrix();
  }

  /**
   * Lamp haloes are only shown close up. Seen from across the parvis, ten of
   * them overlap into a solid wall of light; within a few metres they read as
   * gaslight in damp air, which is the point.
   */
  _updateLampGlows() {
    const p = this.player.position;
    const flicker = 0.9 + Math.sin(this.elapsed * 2.1) * 0.1;
    for (const g of this.lampGlows) {
      const d = Math.hypot(g.lamp.x - p.x, g.lamp.z - p.z);
      const near = clamp01(1 - (d - 6) / 18);
      g.mat.opacity = 0.05 * near * flicker;
      g.cone.visible = near > 0.02;
    }
  }

  /** Assign the light pool to the nearest lamps. */
  _updateLampLights() {
    const p = this.player.position;
    const lamps = this.props.lamps;
    if (lamps.length === 0) return;
    const sorted = lamps
      .map((l) => ({ l, d: (l.x - p.x) ** 2 + (l.z - p.z) ** 2 }))
      .sort((a, b) => a.d - b.d)
      .slice(0, LAMP_LIGHT_POOL);
    for (let i = 0; i < this.lampLights.length; i++) {
      const light = this.lampLights[i];
      const near = sorted[i];
      if (!near || near.d > 46 * 46) {
        light.intensity = 0;
        continue;
      }
      light.position.set(near.l.x, near.l.y, near.l.z);
      const flicker = 0.9 + Math.sin(this.elapsed * 7 + i * 2.3) * 0.06;
      light.intensity = 16 * flicker * clamp01(1 - Math.sqrt(near.d) / 46);
    }
  }

  _updateInteraction(input) {
    const p = this.player.position;
    let best = null;
    let bestD = Infinity;

    for (const s of this.seals) {
      if (s.broken) continue;
      const d = s.distanceTo(p);
      if (d < INTERACT_RANGE && d < bestD) {
        bestD = d;
        best = {
          kind: 'seal', ref: s, id: s.id,
          title: s.def.name, lore: s.def.lore, color: s.def.color,
          action: '[E]  BREAK THE SEAL',
          waveIndex: s.def.waveIndex,
        };
      }
    }
    if (this.gate.open) {
      const d = this.gate.distanceTo(p);
      if (d < INTERACT_RANGE + 2 && d < bestD) {
        bestD = d;
        best = {
          kind: 'gate', ref: this.gate, id: this.gate.id,
          title: this.gate.def.name,
          lore: 'It has been waiting behind this gate for thirty-two years.',
          color: this.gate.def.color,
          action: '[E]  FACE THE CURATOR',
          waveIndex: this.gate.def.waveIndex,
        };
      }
    }

    this.interactTarget = best;
    if (best && input.interact && this.onInteract) this.onInteract(best);
  }

  render() {
    this.postfx.render();
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.postfx.resize(w, h);
    this.exploreCamera.baseFov = this.camera.fov;
  }

  // -------------------------------------------------------------------------
  // Story hooks
  // -------------------------------------------------------------------------

  sealById(id) {
    return this.seals.find((s) => s.id === id) || null;
  }

  get sealsBroken() {
    return this.seals.filter((s) => s.broken).length;
  }

  playCutscene(scene, onComplete) {
    this.exploreCamera.enabled = false;
    this.cutscene.play(scene, { player: this.player, world: this }, () => {
      this.exploreCamera.enabled = true;
      this.exploreCamera.snapBehind(this.player);
      if (onComplete) onComplete();
    });
  }
}
