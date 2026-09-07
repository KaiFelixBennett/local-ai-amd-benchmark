# CLAIR OBSCURE — "The Unwritten" · Design & Research Notes

A narrative, cinematic, explorable overworld expansion built **on top of** the
existing, browser-verified 2-wave reactive combat core. This file is the
research synthesis: what the real *Clair Obscure: Expedition 33* is, what makes
games feel good, the honest graphics/tooling findings, and the original story +
world + build plan this project now follows.

---

## 0. One honest caveat (kept from scope-setting)

A *true AAA open world* (Unreal-5, hundreds of artists, years) cannot ship from
a static-serve `three.js` page. What **can** ship — and what this project
delivers — is the *feeling* of that, within the browser and 60 FPS:

- a real explorable overworld (open terrain, sky, fog, weather, instanced
  vegetation, landmarks) with first/third-person traversal;
- genuine **cinematics**: a directed, letterboxed, camera-choreographed intro
  with dialogue, that blends seamlessly into gameplay (the signature COE33 move);
- "really impressive" graphics via the full post-processing chain (bloom,
  depth-of-field, colour grade, god-rays style light shafts, atmospheric fog),
  HDR + ACES tone-mapping, PBR materials, and a procedural hand-authored art
  direction (Art-Nouveau / Belle Époque, **no AI placeholder assets**).

Everything is procedural (geometry + canvas textures + Web Audio), so there are
no binary assets to license or to disqualify the work, and it stays verifiable
in the browser.

---

## 1. Research: what the real Clair Obscure: Expedition 33 is

Source: the full Wikipedia article (lore, rules, mechanics, cast, plot,
development, reception) plus the game-feel literature. Key facts to mirror.

### Identity
- 2025 dark-fantasy turn-based RPG, Sandfall Interactive (pub. Kepler).
- UE5 (started on UE4). Single-player, stylised **Belle Époque / Art-Deco**.
- Title = French for **chiaroscuro** (light/dark contrast).
- Core emotional theme: **grief, loss of loved ones**.
- Praised for: "feels like watching a movie" (cutscene ↔ gameplay blending),
  deeply-satisfying reactive parry/counter, a *new system to learn per
  character*, operatic adaptive music, intoxicating art direction.

### Lore (the source, used as inspiration only — we write an ORIGINAL story)
- 67 yrs ago the **Fracture** isolated the city of Lumière.
- Each year the **Paintress** paints a number on the **Monolith**; the
  **Gommage** erases everyone at/above that age (an ever-decreasing number).
- Lumière sends **expeditions** to kill the Paintress; #33 is the latest.
- The world is a **canvas**; the villain turns out to be the curator who
  paints the erasures; the Paintress was actually *stalling* him. Two endings.

### Mechanics to keep/expand (the "rules")
- **Player turn:** item · melee (builds AP) · spend AP on ranged (free-aim) or
  **Skill** (QTE for a better effect).
- **Enemy turn = real-time** dodge / parry / (jump). **Parry** is precise →
  grants AP + a counter; **dodge** is easier. This is the heart of the game
  and it already exists in our core (`reaction-system.js`).
- **Stagger "Break"** stuns enemies (exists as the stagger meter).
- **Gradient Attacks / Counters / Skills**: big shared-party gauge (ultimate)
  that fills from skill use (exists as Lumina/ultimate).
- **Status effects** both ways; **weak points** + elemental vulnerability
  (exists).
- **Pictos** (equip 3; master → Luminas party passives) — we have a PICTOS
  loadout; we will make them *story items*.
- **Chroma Catalysts** upgrade weapons at camp.
- Overworld "The Continent" + **Esquie** traversal (swim/fly/dive);
  **Expedition Flags** (heal/fast-travel/restock/allocate).
- 5 core stats (Vit/Might/Agi/Def/Luck), 3 pts/level.

### Criticisms to AVOID in our design
- World "mechanically uninteresting to explore" (GameSpot) → our overworld must
  reward exploration (POIs, secrets, encounters, a real map of landmarks).
- No mini-map → disorientation → we provide a **compass/objective marker +
  landmarks + fog that hides distance** (atmospheric, but legible).
- Overlevelling from side quests → we gate progression by **story gates**,
  not by grinding.
- **Cautionary:** disqualified from Indie Game Awards GOTY over placeholder
  gen-AI textures → we keep **100% procedural / hand-authored** assets.

---

## 2. Research: what makes a game fun (game-feel + design)

Synthesised from *Game Feel* (Swink), the *GameFlow* model, "Juice it or lose
it", and COE33's reception. The design rules this project is built to:

1. **Input → Response, low latency.** Every action answers instantly. Our
   parry/dodge already does; the overworld traversal must too (tight, weighty
   movement, no rubber-banding).
2. **Context = situations.** A straight track is boring; slopes, bends, and
   hazards create *scenarios* to react to. → the overworld has cliffs,
   fords, ruins, and ambush points.
3. **Aesthetic = polish (juice).** Particles on impact, camera shake, flashes,
   screen-space grade, and *sound* that matches the weight of the event. →
   parry = cold flash + dolly + slow-mo + a bright impact sting (already in core).
4. **Metaphor.** Mechanics should *mean* the theme. The theme is **grief and a
   world being erased**; so the parry/erase motif becomes literal: a perfect
   parry *erases* the blow, and the world itself is slowly being "painted out".
5. **Flow / difficulty ramp.** Start legible, add one idea at a time, then a
   spike of mastery (the Nameless boss: feints → unblockable grab → faster).
   The overworld mirrors this: the first act is calm traversal + one fight;
   each act adds a new enemy behaviour and a new traversal ability.
6. **Reward pacing.** A small reward every few minutes (a find, a level, a
   memory), a big one each act (a cinematic, a story beat, a new area).
7. **Player agency + choice.** The COE33 two-ending structure → our game ends
   with a **real choice** with two distinct endings.

**The signature move we are copying:** *the cutscene and the game are the same
engine, so the camera never leaves the world.* A cinematic shot and a battle
shot are the **same `CameraRig`** — that's what makes it "feel like a movie".

---

## 3. Research: three.js (0.160) graphics/cinematics/world — what to use

Confirmed available in three@0.160.0 (import map already pinned):
- **Post-processing chain** (`three/addons/postprocessing/`): `EffectComposer`,
  `RenderPass`, `UnrealBloomPass`, `OutputPass` (already in `postfx.js`), plus
  `BokehPass` (depth of field), `ShaderPass` + `VignetteShader` / `FilmShader`
  / `RGBShiftShader` / `ColorCorrectionShader` (cinematic grade + letterbox),
  `GTAOPass` (contact shading). **Tool decision: extend the existing composer
  with Bokeh + a vignette/grade `ShaderPass` for cinematics; guard every pass
  so a failure degrades to the current working chain** (same pattern as today).
- **Sky / atmosphere:** `three/addons/objects/Sky.js` (procedural atmosphere),
  or a hand-built gradient dome + `FogExp2` (already used). For a stylised
  Belle Époque look we build a **custom gradient sky dome + volumetric-ish fog**
  rather than realistic sky — cheaper and on-art.
- **Terrain:** `ParametricGeometry` / `PlaneGeometry` displaced by a seeded
  noise heightfield; `SimplexNoise` from `three/addons/math/SimplexNoise.js`.
  Vertex-colour by altitude for a painted look. Keep it a **single chunked
  heightfield** (the map is a curated region, not infinite).
- **Instancing for vegetation/rocks/columns:** `InstancedMesh` (thousands of
  instances, one draw call) — the standard large-scene win.
- **Cinematics = keyframed camera:** drive the **existing `CameraRig`** with a
  small **Director** that plays **shots** (position/lookAt/fov over time,
  eased). This is the same object the battle uses → the "same engine" feel.
- **LOD / perf:** `THREE.LOD` for landmarks; frustum culling is automatic;
  keep pixel-ratio capped at 2 (already done); draw-call budget by instancing.

### Tooling decision (the user said "use whatever helps")
I evaluated adding a heavy toolchain (a bundler, a DCC engine, downloaded
asset packs, AI texture generation). **Decision: stay in-browser, no new
runtime dependencies, no AI assets.** Rationale:
- The existing no-build ES-modules + static-serve setup is the *verifiable*
  constraint that already proved the core runs; a bundler only adds a failure
  mode (build breakage) for zero visual gain on procedural art.
- Downloaded model/texture packs risk licensing and the exact "placeholder AI
  asset" failure that cost COE33 an award — the project's own constraint says
  avoid that.
- three@0.160.0 already ships the post-processing, sky, noise, instancing, and
  LOD primitives needed for the "impressive graphics" goal. Adding them is
  import-only, verified in the browser.
So the one "tool" I adopt is **the existing three.js addon set + the browser
verification loop** (serve → Playwright → screenshots → console).

---

## 4. The original story — "The Unwritten"

Original, but thematically in COE33's lane: **grief, a world being erased, and
a choice at the end.** Not a copy of the plot.

### Logline
In a city that repaints itself to forget, a **painter's apprentice** is
summoned to the **Expedition** to climb the **Chiaroscuro Spire** and kill the
**Eraser** — the being who paints the world's memories white. What the party
finds up the Spire is not a monster: it is the city's grief, made into a
brush, and the only way to stop the erasure is to choose *who* gets to be
remembered.

### The world (the motif)
- **The Fracture** (ours: **the Veil**) fell a generation ago and froze the
  city of **Clair-Obscur** in a perpetual, beautiful, *wrong* dusk.
- Every dawn, the **Eraser** — a robed figure at the top of the Spire —
  **paints the Veil a shade brighter**. Each dawn, something small is *gone*:
  a street, a face, a name. No one remembers what left, because the Veil took
  the memory too. This is the **Gommage**, re-skinned.
- The city responds the same way as in COE33: it sends **Expeditions** up the
  Spire to stop it. The party is **Expedition 33**.

### The party (three, matching the verified battle core exactly)
The combat core ships three characters — **Mae (ranger/arcane, front)**,
**Lune (mage/fire, back)**, **Gustave (knight/gold, front)**. The story gives
each a real reason to be on the expedition, and each a distinct "thing to
learn" (the COE33 praise):

- **Mae — the scout.** Youngest, fastest on her feet. *Motif: she is the one
  who keeps noticing what the Veil takes, because she refuses to forget.*
  Skill system: **Salvo / Precision** (ranged, back-row bonus already in data).
  Player learns: **ranged free-aim + AP economy**.
- **Lune — the scholar.** Carries the expedition's map of what the city *used
  to be*. *Motif: she has been painting the same lost street for years,
  trying to keep it in one place.* Skill system: **Cinder / Frost / Lance**
  (the fire/frost duality is her grief vs her resolve). Player learns:
  **elemental weakness + stagger**.
- **Gustave — the wall.** Big sword, big heart. *Motif: he joined the
  expedition to protect the two of them and never says why; the reveal is that
  he is the last one the Eraser cannot paint away, because he keeps choosing
  to remember out loud.* Skill system: **Ward / Rend / Judgement**. Player
  learns: **parry/counter and the stagger "Break"**.

### The acts (the flow / difficulty ramp)

**Act I — The Dusk City (tutorial, calm).**
Cinematic: a dawn, the Veil brightens, a street *vanishes*. Mae points at the
empty gap; no one else can see it. The three are sworn in. The overworld opens
on the city's edge — gentle terrain, the Spire on the horizon. One light
ambush teaches parry/dodge. *Reward: first Picto, a memory recovered.*

**Act II — The Veiled Hills (new idea: feints + traversal).**
Cross open hills to a ford (a **traversal** beat). Enemies start **feinting**
(the core already has feints — now it's a *story* mechanic: "the Veil lies").
Lune's map shows the Spire's lower gate. A mid-boss (a **Painted Knight**,
gold, the core's cindervane_knight) guards the gate. *Reward: new area + a
second memory, Gustave's name spoken aloud.*

**Act III — The Spire (the spike: the boss).**
Climb the Spire (vertical, dramatic, fog, light shafts). The **Nameless /
Eraser** boss: Phase 1 → **feints** (2) → **unblockable grab** (3) → faster
(4) (the core already has 3 phases + grab; we dress it). The Eraser does not
just fight — it *narrates*, painting pieces of the party's shared past white
as it wins, so every lost HP is also a lost memory.

**Act IV — The Choice (two endings).**
At the top: the Eraser is **not** a villain. It is the city's **grief**,
made into a brush, and it has been *delaying* a worse force (a **Curator**
who would erase the *whole* canvas, i.e. everyone, to end the pain). The
Eraser offers the player a **choice** — the COE33 two-endings re-skinned:

- **End A — "Remember everything" (side with the party):** keep the pain,
  keep the memories. The Veil holds, but the erasure stops; the party comes
  home as heroes and the city slowly *chooses* to remember. Bittersweet:
  some are already gone, and Mae carries the weight of what was lost.
- **End B — "Let them rest" (side with the Eraser):** the canvas is released,
  the Veil lifts, the grief ends — and with it the memories, so gently that
  no one even notices. A quiet, beautiful, devastating ending.

Both endings are reachable and both are "correct"; the game never tells you
which is right. That ambiguity *is* the theme.

### Pictos = story items (tying the loadout to the narrative)
The three loadout Pictos become **recovered memories** the party found:
- **Gilded Picto** — *the wedding ring, still warm.* +15% attack.
- **Tide Picto** — *a page of Lune's map, salt-stained.* +18% max HP.
- **Bone Picto** — *Gustave's last word, said before the fall.* +1 AP to start.
(Keeps the exact existing values — no combat change — only the meaning.)

---

## 5. Open-world design (the "perfectly designed" bar, honestly scoped)

A **curated region**, not infinite: one large hand-shaped overworld with
distinct, legible areas that ramp in difficulty (mirroring the acts).

- **Scale:** a single heightfield plateau (~200×200 units) with a river ford,
  rolling hills, a ruined gate, and the **Spire** as the central landmark.
- **Areas:** The Dusk City edge (Act I) → The Veiled Hills (Act II) → The Ford
  → The Gate → The Spire base (Act III). Each is a distinct visual palette
  (fog colour + light + vegetation density) so the player always knows where
  they are (fixes the "disorientation" critique).
- **Traversal:** third-person character controller (WASD/arrows + mouse-look
  orbit, jump on fords/cliffs). The COE33 "Esquie" beat is re-skinned as a
  **short scripted glide over the ford** when you first cross it (a small,
  free, cinematic traversal moment — not a full fly system).
- **POIs (make exploration reward, not grind):** 3 **memory shards**
  (the Pictos), the **Painted Knight** optional boss, **2 ambush points**
  (encounters trigger our verified battle core), a **camp flag** (heal/allocate
  — the Expedition Flag, re-skinned), and 1 **secret** (Gustave's name, behind
  the gate).
- **Encounter model (the key integration):** the overworld is *exploration*;
  when the player walks into an ambush point or reaches the gate, we **fade to
  the existing battle core** (same party, same parry/counter, same boss).
  Win → return to the overworld, world advances (the gate opens, the Spire
  becomes climbable). This is exactly COE33's "linear story + off-path" loop.
- **Legibility (fixing the mini-map critique):** an **objective marker**
  (a gilded arrow + a distant landmark silhouette) and **strong fog** that
  hides true distance but the Spire is always on the horizon as the anchor.

---

## 6. Cinematic system

- **Director** (`src/fx/director.js`): a small timeline of **shots**. Each shot
  = `{ pos, look, fov, dur, ease, fade, subtitle? }`. It drives the **same
  `CameraRig` camera** used by battle (same engine → the "movie" feel) by
  exposing a `playShot()` that the rig's `update()` can honour when a shot is
  active, then returns control to the battle/overworld rig.
- **Letterbox + grade** for cinematics: toggle the Bokeh + vignette/grade pass
  and add 2.39:1 letterbox bars (DOM) so it reads as film, then remove them
  for gameplay (seamless blend — the signature move).
- **Subtitles / title cards** (`src/ui/subtitles.js`): a gilded, fading text
  layer on the existing `#ui` DOM layer (no new layer needed), with speaker
  names and a per-line reveal timed by the Director.
- **Reused, not rewritten:** the intro reuses `Audio` (a somber bed that swells
  into the battle bed — the "adaptive operatic" praise), `ScreenFX` (flash/
  desaturate), `ParticleSystem` (paint motes), and `PostFX` (bloom pulse on
  the Spire). The intro is **skippable** (press to skip) and **deterministic**
  (seed-independent; it is narrative, not a battle).

---

## 7. Build plan (phased, lowest-risk first; core preserved)

The 2-wave battle core is a **stable, 0-error foundation** — every phase below
wraps it without re-opening it.

- **P0 — Design (this doc).** ✅
- **P1 — Story data** (`src/story/story.js`): acts, characters, dialogue
  lines, POIs, encounter defs, the two endings. Pure data, no THREE.
- **P2 — Cinematic** (`src/fx/director.js`, `src/ui/subtitles.js`, extend
  `src/fx/camera.js` with a shot hook, extend `src/engine/postfx.js` with a
  guarded letterbox/grade/DoF toggle).
- **P3 — Overworld** (`src/world/overworld.js`): procedural heightfield + sky
  dome + fog + instanced vegetation/rocks/columns + POIs + character
  controller + objective marker + encounter triggers.
- **P4 — Wire the phases in `src/game.js`**: `intro cinematic → overworld →
  (ambush/gate →) verified battle → return/advance → … → choice → ending`.
  The battle path (`_beginWave`, `_spawnWave`, `battle.begin`) is reused as-is.
- **P5 — Verify**: `node tools/check-syntax.mjs` → `npx serve` → browser
  (Playwright + screenshots) click-through of the *whole* flow, console clean.

**Non-negotiable constraints carried forward:** zero uncaught exceptions,
seedable battles (`?seed=` + HUD watermark), delta-time timing, graceful
WebGL/context-loss handling, 60 FPS, procedural-only assets.
