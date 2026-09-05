Build a turn-based reactive RPG battle game — a Clair Obscur: Expedition 33 style clone — as a
small multi-file browser project. You have file-write tools — use them. Do not hold the whole
project in one giant reasoning pass and dump it as a single output block; design the
architecture first, then write it file by file, one subsystem at a time, so each file gets
focused attention instead of being one slab of a 2000-line blob.

3D is strongly preferred. The whole game is a single combat encounter on a fixed battle stage
(party on one side, enemies on the other, dynamic combat camera) — you are NOT building an open
world, so spend the complexity budget on the combat system and its feel, not on traversal.

## The one mechanic that defines this genre — get it right or the run fails

This is turn-based combat with a REAL-TIME defensive layer on top. On the player's turn they
pick actions from a menu (classic turn-based). On the ENEMY's turn, attacks are not resolved
automatically — the player must physically react in real time:

- Every enemy attack has a visible, readable TELEGRAPH (wind-up animation + a timing cue) before
  the hit lands.
- PARRY: a tight timing window right as the hit lands. A perfect parry negates all damage, builds
  Action Points, and enables a counterattack.
- DODGE: a slightly more forgiving window that negates damage but grants no counter/AP bonus.
- FAIL: mistime or do nothing and the character takes damage.
- Multi-hit enemy combos require SEQUENTIAL reactions — parry hit 1, then hit 2, then hit 3, each
  with its own window and rhythm.

This reactive layer is the single most important, most differentiating, and hardest part.
Telegraph readability, window fairness, and the parry→counter loop must actually feel good. If
something has to be cut, cut breadth elsewhere and protect this.

## STACK: YOUR CHOICE
Use whatever libraries make the result best. Load them as ES modules from a pinned CDN URL.
Known-good, verified options:
three@0.160.0 3D rendering
cannon-es@0.20.0 3D physics
@dimforge/rapier3d-compat@0.11.2 3D physics (WASM, heavier, more accurate)
tone@14.7.77 audio synthesis
matter-js@0.19.0 2D physics
lil-gui@0.19.0, stats.js debug UI
You may use others if you are certain of the exact package name, version and CDN path.
Never invent a URL. If unsure, fall back to a library from the list or write it yourself.

If you use three.js, start with exactly this import map in index.html — do not improvise it:

  <script type="importmap">
  { "imports": {
      "three": "https://unpkg.com/three@0.160.0/build/three.module.js",
      "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/"
  } }
  </script>

and import with: import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
Import maps resolve for every module in the project, not just the entry file, so any of your
own files can `import * as THREE from 'three'` directly.

## Project structure — real files, real ES module boundaries

This is a genuine multi-file project, not a single-file deliverable. Use real `import`/`export`
between your own files (not a shared global namespace, not one script tag with everything
inline). Because browsers block cross-file ES module loading over `file://` (CORS), this
project is served, not double-clicked:

- Deliverable is a folder, `index.html` at its root plus a `src/` tree of ES modules.
- Runnable via any static file server, e.g. `npx serve .` or `python3 -m http.server`, then
  opening the printed `http://localhost:...` URL. State the exact run command in your final
  chat message.
- No bundler, no transpile step, no `node_modules` — just native ES modules the browser loads
  directly, same hard "no build step" spirit, just server instead of double-click.

Suggested layout (adapt names/boundaries to what actually fits, but keep the separation —
one file should not grow back into a monolith):

  index.html
  src/
    main.js                  — bootstrap: dynamic-import everything, construct Game, start loop,
                               top-level try/catch around init + module load
    core/
      rng.js                 — seedable RNG, shared math helpers
      easing.js              — easing + timing-window helpers (lerp, smoothstep, window checks),
                               pure functions, no THREE deps
      events.js              — tiny event bus (attack-telegraphed, parry-success, turn-ended…)
    engine/
      renderer.js            — scene/camera/renderer/lights/fog/tone-mapping setup
      postfx.js              — EffectComposer + bloom + OutputPass, or a no-op passthrough if
                               postprocessing is cut (game.js calls the same render() either way)
      textures.js            — procedural CanvasTexture/DataTexture generators (oil-paint stage,
                               character/enemy surface detail, UI ornament textures)
      audio.js               — Web Audio / Tone: layered battle bed, hit/parry/counter stingers,
                               menu blips, telegraph cue, victory/defeat themes
    battle/
      battle-system.js       — top-level combat state machine: PlayerTurn → ActionSelect →
                               EnemyTurn → Reaction → Resolve → Victory/Defeat
      turn-queue.js          — initiative/speed ordering, upcoming-turn preview
      action-resolver.js     — damage/heal/AP/crit/weakness/status math, pure and testable
      reaction-system.js     — THE signature: real-time parry/dodge windows, telegraph timing,
                               multi-hit combo sequencing, counter trigger
      targeting.js           — free-aim reticle + weak-point hit detection for ranged attacks
    entities/
      character.js           — party member: stats, AP, HP, skill list, procedural mesh, anims
      enemy.js               — enemy: stats, telegraphed attack patterns, procedural mesh, anims
      skill.js               — skill definitions (data) + apply-effect logic
    ui/
      hud.js                 — HP/AP bars, turn queue, character portraits, status icons
      battle-menu.js         — attack / skill / free-aim / item selection menu
      prompts.js             — parry/dodge timing prompts, hit flashes, combo counters
    fx/
      particles.js           — paint particles, impact bursts, the death "dissolve" effect
      damage-numbers.js      — floating damage/heal numbers, crit styling
    game.js                  — orchestrator: owns all systems, per-frame update(), routes input
                               to menu vs. reaction depending on battle state

Each file should be independently readable: a reviewer should be able to open
`reaction-system.js` alone and understand the parry/dodge timing without needing
`battle-system.js` open too. Keep functions under roughly 60 lines; if `game.js` or
`battle-system.js` starts accumulating logic that belongs to one system, move it into that
system's file instead of letting the orchestrator become a second monolith.

## Hard constraints

- Real multi-file project as described above. No external binary assets: no textures, no
  GLTF/FBX models, no image files, no audio files, no fonts. Every mesh, texture and sprite is
  generated procedurally in code (CanvasTexture, DataTexture, BufferGeometry, primitives).
- All sound synthesized at runtime (Web Audio API or Tone.js). No samples.
- Use only APIs you are certain exist in the pinned version. A hallucinated API call that
  throws counts as a total failure of the run.
- No TODOs, no placeholders, no "// ... rest omitted", no abbreviation of repeated blocks, in
  any file.
- Must not throw a single uncaught exception.
- Write files directly with your file tools as you finish each one. After all files are
  written, reply in chat with the mandatory first line below, the exact command to serve and
  open the project, and nothing else — no restating the code.

## MANDATORY FIRST LINE
The first line of your final chat reply must list, in "extras", ONLY what you implemented and
verified. Overclaiming scores as failure.

## Required features - all must actually work

1. Battle stage: 3D arena, party on one side, enemies on the other, framed combat camera that
   moves/cuts to the acting character.
2. Party: >= 3 playable characters with distinct stats and skill sets, each a procedurally
   built mesh with at least idle + attack motion.
3. Turn order: initiative/speed-based turn queue with a visible upcoming-turns preview.
4. Base attack + AP economy: a basic attack that costs no AP and BUILDS Action Points; a
   visible per-character AP gauge. Skills spend AP.
5. Skills: >= 2 distinct skills per character costing AP — a mix across the party of single-
   target damage, multi-hit, heal, and buff/debuff. Effects must actually apply and be visible.
6. Free-aim ranged attack: an aim reticle the player moves to hit enemy weak points for bonus
   damage and/or AP.
7. Reactive defense (signature, see top): telegraphed enemy attacks with real-time PARRY and
   DODGE timing windows; perfect parry negates damage, builds AP, and triggers a counter;
   multi-hit combos require sequential reactions.
8. Enemy AI: >= 2 enemy types with distinct, telegraphed, parryable/dodgeable attack patterns,
   plus target selection and skill/attack choice logic.
9. HUD: HP and AP bars for all combatants, turn queue, damage numbers, action menu, and clear
   real-time parry/dodge prompts.
10. Win/lose: victory and defeat resolution and a restart. Delta-time throughout.

## MAXIMIZE DETAIL - this is the main differentiator
Go as deep as you can while keeping everything above functional. Ideas, not a checklist:
Combat depth: elemental weaknesses and resistances, status effects (burn, stun, mark, poison)
with icons and per-turn ticks, a stagger/break meter that opens a bonus-damage window when
filled, critical hits, back-row/positioning bonuses.
Reactive richness: distinct parry vs. dodge rhythms per enemy, unblockable "grab" attacks that
must be dodged not parried, delayed/feint telegraphs that punish early input, perfect-parry
counter chains, a "flow"/streak meter that rewards consecutive clean parries.
Ultimate/gradient system: a charge meter built by parries and weak-point hits that unleashes a
cinematic party-wide or combined ultimate attack.
Progression & meta: equippable passive buffs (pictos/luminas-style modifiers), XP and level-up
with new skill unlocks after victory, an in-memory save, a small pre-battle loadout screen, a
multi-wave or overworld encounter node map between fights.
Characters & enemies: varied procedurally generated appearances, hit reactions and flinch,
death animations, boss enemy with phases and a shifting move set at low HP.
Audio: layered orchestral-style synthesized battle bed that intensifies at low HP, distinct
stingers for parry / counter / crit / weakness, a rising cue during telegraphs, victory fanfare.
Depth that works beats breadth that is broken. Cut what you cannot finish and remove it
from the manifest.

## Visual fidelity — everything stays procedural, but push how it looks

No external assets, so the graphics budget goes into lighting, materials, texture detail, and
post-processing. The target aesthetic is Belle Époque / French art nouveau by way of an
oil-painting: gilded ornament, muted teal-and-gold palette, soft painterly light, floating
motes of paint. Treat this as its own differentiator, not an afterthought:

- Post-processing pipeline via `three/addons/postprocessing/`: `EffectComposer` + `RenderPass`
  + `UnrealBloomPass`, finished with an `OutputPass` (renderer color management happens in the
  composer's final pass, not automatically — skipping OutputPass after adding a composer
  commonly washes out or darkens the whole scene). Keep bloom subtle; it is for gilded
  highlights, magic effects, and rim light, not for blowing out the frame. A vignette and a
  gentle warm color grade sell the painterly mood. If you are not fully sure of a pass's
  constructor signature or import path, skip postprocessing entirely and rely on
  `ACESFilmicToneMapping` + tuned exposure — a plain correct renderer beats a composer that
  throws.
- Material quality: `MeshPhysicalMaterial` where it counts (a soft sheen on fabric, subtle
  metalness on gilded/weapon surfaces), distinct roughness per surface, emissive accents driven
  by canvas textures for glowing runes/eyes/magic. Avoid flat single-color meshes.
- Procedural texture detail: push canvas textures past flat color blocks — visible brush-stroke
  streaks, canvas-weave noise, gilded art-nouveau border/ornament patterns on UI and stage
  elements, baked soft vignette/AO into stage textures. Noise-based color jitter so nothing
  reads as obviously tiled. Higher resolution (128–256px) where seen close-up.
- Lighting polish: one warm key light with a cool fill so shadows aren't pure black; a rim/back
  light to separate characters from the background; color-temperature that shifts with battle
  intensity (warmer and dimmer as HP drops, a cold flash on a parry).
- Screen-space polish drawn directly on the 2D HUD canvas overlay (zero WebGL risk, easy to get
  right): vignette, light film grain, a flash on hit/parry, a brief slow-motion + desaturate on
  a perfect parry, and a painterly "dissolve into drifting paint" effect when a combatant dies.
  These read as graphics quality without touching the 3D pipeline.
- If you attempt any of the above and are not confident an API exists exactly as you're calling
  it, cut it — a simpler scene that never throws outranks a richer one that crashes on load.

## Quality bar

- Stable 60 FPS during combat, telegraphs, and reactions. Delta-time throughout, never
  frame-count based — timing windows especially must be wall-clock based so they stay fair
  regardless of frame rate.
- Clean architecture: real module boundaries per the structure above, entity/system separation,
  no 500-line functions, no global soup, no circular imports. The battle state machine's states
  and transitions should be explicit, not implied by scattered booleans.
- Seedable RNG - the same seed produces the same encounter (enemy stats, crits, AI choices).
- Handle WebGL context loss and a failed module import gracefully with a visible message.

## Before you output
Plan the architecture first — decide the file list and what each owns, and sketch the battle
state machine's states and transitions — before writing any code. Then build it incrementally:
write one file, move to the next, rather than composing the entire project in your head before
the first file write. If you have shell access, sanity-check each file's syntax (e.g.
`node --check`) right after writing it rather than only at the very end, so mistakes get caught
near their source instead of compounding.

Once everything is written, step through mentally: does it load, does a turn resolve, can the
player attack, spend AP on a skill, free-aim a weak point, PARRY a telegraphed enemy hit and
land the counter, dodge a multi-hit combo, win, lose, and restart — with zero console errors
across the whole file set? Fix what fails, then send the final chat reply. Expect 2000+ lines
total, spread across the files above rather than in one block.
