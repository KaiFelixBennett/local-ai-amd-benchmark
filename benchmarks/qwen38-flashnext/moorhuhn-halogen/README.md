# Moorland Mayhem – Federsturm

A complete, arcade-style 2D marsh-shooter inspired by the classic Moorhuhn games, rebuilt from scratch with modern web technology. Shoot birds across three hand-crafted maps, chain combos, survive dynamic weather events, and hunt down three bosses — all deterministic and replayable from a seed.

> _"Ein rundes, umfangreiches Spiel" — full round loop, persistent progression, and no placeholder content._

## Stack

- **[Vite 5](https://vitejs.dev/)** – dev server & bundler (`base: './'` so the build is portable)
- **[TypeScript 5.9](https://www.typescriptlang.org/)** – strict mode, ES2022
- **[Phaser 3.80](https://phaser.io/)** – canvas rendering (1920×1080, FIT scaling)
- **DOM overlay UI** – menus, HUD, results are HTML/CSS on top of the Phaser canvas
- **[Vitest 2](https://vitest.dev/)** + jsdom – unit tests for all pure game logic
- **ESLint 9 + typescript-eslint 8** – flat-config linting
- **Prettier 3** – formatting

Art, audio, and all textures are **fully procedural** — no binary assets in the repo.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production bundle in dist/
npm run preview    # serve the production build
npm test           # run the test suite (vitest run)
npm run lint       # eslint
npm run format     # prettier --write
npm run typecheck  # tsc --noEmit
```

## Controls

| Input | Action |
| --- | --- |
| **Left click** / **Space** | Fire |
| **Right click** / **R** | Reload |
| **Right click release** (after grace) | Cancel reload |
| **Esc** | Pause (Resume / Restart / Settings / Quit) |
| **F3** | Debug overlay (FPS, seed, spawn state) |

All bindings live in `Settings → Tasten` and are stored in the save file.

## Game modes (6)

| Mode | Duration | Twist |
| --- | --- | --- |
| **Classic** | 120 s | The full round: phases, events, 55 % boss chance |
| **Blitz** | 60 s | Fast spawns, 1.6× score, tight combo window |
| **Precision** | 90 s | Manual reload only, 36 total bullets |
| **Endless** | ∞ | Phases loop in 3-min cycles until you quit |
| **Daily** | 120 s | Seeded from the calendar date — identical for every player that day |
| **Zen** | ∞ | No pressure: 8-round mag, forgiving combos, calm events |

Modes and maps unlock progressively with your level (see `src/config/unlocks.ts`).

## Maps (3)

- **Nebelmoor** (Misty Marsh) – fog-drenched home marsh, chain reactions via buckets, bells and scarecrows
- **Sturmklippen** (Storm Cliffs) – windy coast, storm-only birds (Sturmvögel), wave riders
- **Mondbruch** (Moon Rift) – night map with rare moon gliders and the Nachtschatten boss

## Bestiary

13 target types with distinct behaviors (`src/config/targets.ts`): the common Moorflatterer, lightning-fast Schnellfeder, corkscrewing Korkenzieher, armored Panzerpelz (3 plates), rare Goldschnabel, fog-hidden Nebelflüsterer, combo-breaking **Täuscher** decoys, flock-forming Schwarmvögel (swarm bonus), depth-scaling Kurvensegler, weather-only Sturmvogel, plus map-exclusive Schilfgeist, Wellenreiter and Mondglider.

### Bosses (3)

| Boss | Behavior | Maps | Min phase |
| --- | --- | --- | --- |
| **Eisenmoor** | Armored (2 armor layers, 12 HP) | Nebelmoor, Sturmklippen | mid |
| **Blitzschnabel** | Acrobat (9 HP, 520–700 px/s) | all | intense |
| **Nachtschatten** | Phantom (10 HP, flickers) | Mondbruch, Nebelmoor | finale |

## Dynamic events (13)

Fog, crosswind, thunderstorm, golden swarm, full moon, mass start, balloons, rain front, frog concert, fireflies, time rift (slow-mo + 2.5× score), featherstorm, and the boss event. The `RoundDirector` schedules them per map pool, phase gates, and weight history so rounds vary but never break.

## Scoring

Every hit is pure math (`src/logic/scoring.ts`, all knobs in `src/config/balance.ts`):

```
total = base × speedMult × depthMult × precisionMult × comboMult × timeMult × eventMult
```

- **Precision**: dead-center ≤ 0.3 distance ⇒ up to **1.5×**; perfect inner ellipse adds **×1.15**
- **Combo**: +0.1 per hit (cap 9.9), hot-zone bonus past 10, threshold bonuses (250 × threshold)
- **Perfect streaks**: `200 × (n-1) × (1 + 0.1n)` bonus points
- **Longshot ×1.4 / Trickshot ×1.8**, swarm clears add `30% + 200`
- **Ranks**: D → C (4k) → B (9k) → A (16k) → S (26k) → SS (40k) → SSS (60k), scaled by mode score multiplier

Runs award XP (level curve `800 × n^1.35`, max level 50) and Feather Coins used in the cosmetic shop (crosshairs, HUD skins, weapon skins), plus lifetime achievements and daily challenges with coin rewards.

## Determinism & dailies

- All randomness flows through a seeded **mulberry32** RNG (`src/core/rng.ts`)
- `dailySeed("2026-09-15")` = FNV-1a hash of `mmf:daily:<iso>` → every player gets the *same* spawns, events, and boss that day
- Seeds are displayed as friendly labels (`MMF-4K9-ZQ3`, ambiguity-free alphabet) and stored with high scores for replay
- The full round is reproducible: same seed + same mode + same map ⇒ identical spawn plan (covered by tests)

## Save system & migrations

`src/core/storage.ts` — versioned save (`v3`) in `localStorage` under `mmf_save_v1`:

- Migrations `v1 → v2 → v3` keep stats/progress and add daily records, achievements, challenges
- Unknown future versions fall back to a **fresh** save rather than corrupting
- Field-by-field validation clamps every setting (volumes 0–1, particle density 0.25–1, crosshair size 0.6–1.8, hex-color regex, enums) and re-adds guaranteed starter content
- Graceful in-memory fallback when `localStorage` is unavailable (private mode)
- Debounced writes + `beforeunload` flush

## Project layout

```
src/
  main.ts            # bootstrap: Phaser game, DOM router, audio, core API wiring
  types.ts           # shared type contracts (no Phaser/DOM deps)
  core/              # bus, settings, storage, i18n, rng, GameClient, context
  config/            # balance, modes, maps, targets, events, cosmetics, unlocks, names, schema
  logic/             # pure game logic: weapon, combo, scoring, spawnDirector,
                     # roundDirector, difficulty, achievements  ← fully unit-tested
  engine/            # Phaser scene, procedural art/textures, FX, trajectories, weapon rig
  audio/             # procedural WebAudio engine (music, sfx, ambient)
  ui/                # DOM overlay: router, HUD, components, screens (boot, main,
                     # mode/map select, tutorial, pause, settings, results,
                     # highscores, achievements, progress, stats, credits), styles
tests/               # 169 Vitest unit tests for every logic module
```

### Architecture notes

- **The DOM UI layer never touches Phaser internals** — it talks to the game through a small `GameCoreAPI` and the typed `EventBus` (`src/core/bus.ts`)
- **Pure logic is isolated** from Phaser and the DOM (`src/logic`, `src/core`) so the entire rule set is unit-testable in jsdom without a canvas
- i18n (`de` default, `en`) with German fallback; target/event/boss names registered via `addTranslations`

## Accessibility

Settings include colorblind mode, high contrast, reduced motion, reduced flash, configurable crosshair size/color, per-channel volume sliders (master/music/SFX/ambient), and quality presets (low/medium/high) that scale particles and effects.

## Testing

```bash
npm test          # 169 tests: rng determinism, weapon state machine, combo decay,
                  # scoring/ranks, spawn & round directors, difficulty steering,
                  # save migration, i18n fallback, achievements, GameClient profile
```

Tests cover the pure modules only — no Phaser/canvas imports — so they run in milliseconds.

## License

Made for the model-benchmark exercise. All art and audio are generated at runtime; no external assets included.
