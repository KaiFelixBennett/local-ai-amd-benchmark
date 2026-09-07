# Moorland Mayhem – Featherstorm

A self-contained, Moorhuhn-inspired 2D arcade shooter that runs entirely in the browser.
Every visual (sprites, parallax maps, particles) and every sound (music, SFX, ambience) is
**generated procedurally at runtime** with Canvas + the Web Audio API — the project ships
**zero external assets**.

- **Engine:** Phaser 3.90
- **Language:** TypeScript (strict)
- **Bundler:** Vite 5
- **Tests:** Vitest (unit tests for all pure game logic)
- **Quality:** ESLint (`--max-warnings=0`) + Prettier
- **i18n:** German (default) & English

---

## Quick start

```bash
npm install     # install dependencies
npm run dev     # start the Vite dev server (http://localhost:5173)
```

Other scripts:

```bash
npm run build   # type-check + production build into dist/
npm run preview # serve the production build locally
npm run test    # run the unit test suite once (Vitest)
npm run test:watch
npm run lint    # ESLint with zero-warning policy
npm run check   # tsc --noEmit (type check only)
npm run format  # Prettier over src + configs
```

---

## How to play

| Input | Action |
| --- | --- |
| Mouse | Aim the crosshair |
| Left click | Fire |
| `R` / Right click | Reload |
| `Esc` | Pause / resume |
| `M` | Mute / unmute |
| `F1` | Toggle the developer overlay (hitboxes, debug stats) |

Shoot the birds that drift across the moor before they leave the screen. Keep your combo
alive for score multipliers, aim for "perfect" (center) hits for bonus points, and **avoid the
Tricksters (Täuscher)** — hitting them costs you points. Dynamic events, mini-bosses and chain
reactions keep every round different.

---

## Game modes

| Mode | Description |
| --- | --- |
| **Classic** | The standard timed round (2 minutes). |
| **Blitz** | Short, fast, high-pressure round. |
| **Precision** | Fewer, harder targets — rewards accuracy. |
| **Endless** | No timer — survive as long as you can. |
| **Daily** | A seeded round that is identical for everyone on the same date. |
| **Zen** | Relaxed mode, no pressure. |

## Maps

| Map | Vibe |
| --- | --- |
| **Nebelmoor** | Classic foggy moorland. |
| **Sturmklippen** | Windy storm cliffs. |
| **Mondbruch** | Night / full-moon break. |

## Targets (10 kinds + 3 mini-bosses)

- **Moorflatterer** – slow, common, easy points.
- **Schnellfeder** – small, fast, zig-zags.
- **Korkenzieher** – tight spirals, worth more.
- **Panzerpelz** – armored, needs multiple hits.
- **Goldschnabel** – rare, high-value.
- **Nebelflüsterer** – fades in the mist, hard to track.
- **Täuscher** – the Trickster; **negative points** if you shoot it.
- **Schwarmvogel** – part of swarms; hitting several triggers a chain bonus.
- **Kurvensegler** – long Bezier glide paths.
- **Sturmvogel** – hard-hitting in windy weather.
- **Boss Moorer** / **Boss Akrobat** / **Boss Nacht** – three mini-bosses with their own HP
  bar, movement patterns and rewards.

## Dynamic events

Mist, strong side-wind, storms, golden swarms, full moon, mass launch, bonus balloons, frog
concerts, fireflies, time slip, featherstorm — each one changes spawning, difficulty, weather
or scoring while it is active.

---

## Architecture

The code is split into a small number of layers so that the game logic is **pure, deterministic
and fully unit-testable**, and only the thin edge (Phaser rendering + DOM UI) is impure.

```
src/
├─ core/          # Pure game logic — no Phaser, no DOM. Unit-tested.
│  ├─ targets.ts        # Data-driven target configs (10 kinds + 3 bosses)
│  ├─ modes.ts          # Mode definitions
│  ├─ maps.ts           # Map definitions + palettes
│  ├─ spawner.ts        # Weighted, difficulty-aware spawn logic
│  ├─ difficulty.ts / difficultyParams.ts
│  ├─ scoring.ts / scoreParams.ts / rank.ts   # Scoring, combos, ranks
│  ├─ combo.ts          # Combo / multiplier state machine
│  ├─ trajectory.ts     # Flight-path math (linear/sine/bezier/spiral/…)
│  ├─ weapon.ts         # Magazine / reload model
│  ├─ events.ts         # Dynamic-event definitions + roll logic
│  ├─ rng.ts            # Seedable PRNG (daily mode)
│  ├─ save.ts           # Save/load (LocalStorage) + defaults
│  ├─ achievements.ts   # Achievements
│  ├─ i18n.ts           # DE / EN dictionaries + t()
│  └─ types.ts          # Shared types
├─ game/          # Phaser side — orchestration only.
│  ├─ context.ts        # AppContext (typed event buses + services)
│  ├─ GameScene.ts      # The round: spawning, shooting, HUD, end-of-round
│  ├─ MenuScene.ts      # Boot / menu scene
│  ├─ Target.ts         # A single target GameObject (procedural sprite)
│  └─ ParticleManager.ts
├─ art/           # Procedural rendering (no assets).
│  ├─ generator.ts      # Draws each target + map into textures
│  ├─ palettes.ts       # Color palettes per target / map
│  ├─ environment.ts    # Parallax backdrop + weather
│  └─ boot.ts           # Pre-generates textures before the first frame
├─ audio/         # Procedural Web Audio (music loop, SFX, ambience).
│  └─ AudioManager.ts
├─ ui/            # DOM UI layer (menus, HUD, settings, results).
│  ├─ UI.ts             # Builds every screen; owns the i18n registry
│  └─ EventBus.ts       # Typed game↔UI event contracts
├─ styles/main.css
└─ main.ts        # Phaser bootstrap (scene registration, config)
```

### Key design points

- **Typed event buses.** `AppContext` wires two typed event emitters between the game and the
  UI (`GameToUiEvents` / `UiToGameEvents` in `ui/EventBus.ts`). The UI never touches the scene
  and the scene never touches the DOM directly.
- **Pure core.** Everything in `src/core` is free of Phaser/DOM imports, so it runs in Node and
  is covered by Vitest (seeded RNG keeps the spawn/scoring tests deterministic).
- **Data-driven tuning.** Target, mode, map, difficulty and score values are plain data objects,
  not hard-coded into behaviour — easy to balance.
- **i18n registry.** Static UI text is registered once with an i18n key; switching language
  re-renders every registered node (including labels that embed live values).
- **Persistence.** Progress, stats, achievements, highscores and settings are stored in
  LocalStorage under a versioned key.

---

## Tests

`npm run test` runs 10 test files / 60 tests covering the pure core (RNG determinism, spawner
weighting, scoring & combos, ranks, trajectories, weapon/reload, difficulty, save round-trip,
i18n coverage, achievements, etc.).

## Quality gates

All of these are expected to pass before shipping:

```bash
npm run check    # tsc --noEmit
npm run lint     # ESLint, zero warnings
npm run test     # 60/60 unit tests
npm run build    # production build
```
