# Moorland Mayhem – Featherstorm

An original, fully playable **cartoon arcade shooter** in the *Moorhuhn / Duck Hunt*
genre — built from scratch with **Vite + TypeScript (strict) + Phaser 3**. Everything
you see and hear is generated **procedurally at runtime**: no images, no audio files,
no external assets, and no internet access at runtime.

> Ein originales, komplett spielbares **Cartoon-Arcade-Shooter** im Stil von
> *Moorhuhn* — gebaut mit **Vite + TypeScript (strict) + Phaser 3**. Alle Grafiken
> und Sounds werden **prozedural zur Laufzeit erzeugt**: keine Bilder, keine Audio-Dateien,
> keine externen Assets, kein Internet zur Laufzeit.

---

## Quick start / Schnellstart

```bash
npm install      # Abhängigkeiten installieren
npm run dev      # Dev-Server → http://localhost:5173
npm run build    # tsc --noEmit + Produktions-Build (dist/)
npm run test     # Vitest-Unit-Tests
npm run preview  # gebauten Stand lokal serven
npm run lint     # ESLint
```

Requires **Node 18+** (developed on Node 24). After `npm install` the game runs
completely offline.

---

## Controls / Steuerung

| Action / Aktion | Input |
| --- | --- |
| Aim crosshair / Fadenkreuz bewegen | Mouse / Maus |
| Fire (6-shot) / Feuern (6-Schuss) | Left click / Linksklick |
| Reload (tactical or full) / Nachladen | `R`, right-click, or mouse wheel / Rechtsklick · Scrollrad |
| Pause / Pause | `Esc` |

The shotgun holds **6 shells**. Reloading mid-round is *tactical*: shells already
chambered are kept and the magazine tops up from reserve; when you fire the last
shell it auto-reloads. Reload can also be cancelled mid-animation (tactical cancel).
Rebind the reload and pause keys in **Settings**. Disable *Left click fires* if you
prefer click-to-reload.

---

## Game modes / Spielmodi

| Mode | Description |
| --- | --- |
| **Classic Hunt** | Balanced 120-second marsh hunt with dynamic difficulty. |
| **Blitz** | 60 seconds of mayhem: fast spawns, quick multiplier, tiny combo window. |
| **Precision** | Limited ammo, no auto-reload. Accuracy & perfect hits count. *(level 4)* |
| **Endless** | Endless waves with rising difficulty, phases and random events. *(level 5)* |
| **Daily Challenge** | One shared seed each day — identical spawns for everyone, local daily record. |
| **Zen Hunt** | No time pressure, calm music, gentle penalties. Just enjoy. |
| **Tutorial** | Learn to shoot, reload and score in one guided round. |

## Locations / Schauplätze

- **Nebelmoor** — classic marsh: reeds, water, drifting fog, warm evening light.
- **Sturmklippen** — wind-whipped coast with a lighthouse, waves and fast flight paths. *(level 3)*
- **Mondbruch** — mystical nightly marsh: full moon, fireflies, glowing plants. *(level 6)*

---

## Features / Funktionen

- **13 target types** (flatterer, swift, corkscrew, armored, gold, mist, decoy, swarm,
  glider, storm, balloon) plus **3 mini-bosses** (Armored Kolossus, Acrobat, Night).
- **6-shot shotgun** with reserve ammo, tactical reload, tactical cancel and auto-reload.
- **Difficulty Director** — continuous, seeded difficulty curve with phase-gated events.
- **13 round events** (crosswind, dense fog, reed eruption, thunderstorm, …) that change
  spawn behaviour and reward clever play.
- **Interactive environment objects** and **chain reactions** (≥5 kinds) for bonus points.
- **Full score formula** — base score × depth × perfect × combo multiplier, multikill
  bonus, longshot bonus, event/environment/chain bonuses. D → SSS ranks.
- **Seeded RNG** (`mulberry32` + FNV-1a `dailySeed`) → **reproducible Daily Challenge**.
- **Progression** — XP, level, Feathers currency, cosmetics shop (crosshairs, HUD themes,
  weapon skins), achievements and claimable challenges.
- **Highscores** per mode/map, per-day daily_records, and lifetime statistics.
- **i18n** — German (canonical) & English, with a robust fallback chain
  (`en.<key>` → `de.<key>` → `de.<key>` placeholder). Live language switch.
- **Procedural Web Audio** — ambient beds, shots, hits, splashes, crickets, UI — all
  synthesised, no files.
- **Accessibility settings** — colour-blind palettes, high contrast, reduce motion,
  reduce flashes, quality/particle density, key rebinding.
- **Object pooling** and design-space rendering (1280×720) for a steady frame rate.
- **LocalStorage saves** with versioned migration (`SAVE_VERSION`).
- **Dev-only debug overlay** via `window.__mmDebug` (FPS, targets, pool, phase, seed …).

---

## Architecture / Aufbau

```
src/
├─ core/      Pure, deterministic, framework-free logic:
│             types, EventBus (typed pub/sub), Rng (seeded), Save (versioned),
│             Storage (LS + memory fallback), i18n (de/en translate), Progress (XP),
│             GameSettings helpers
├─ config/    Declarative data: modes, maps, targets, events, cosmetics, achievements
├─ game/      Pure game rules (unit-tested, no Phaser): scoring, ComboSystem, Weapon,
│             DifficultyDirector, SpawnDirector, Achievements, paths, env objects
├─ scenes/    Phaser view layer: Boot, Backdrop, GameScene, Flock, Fx, EnvView,
│             RoundController (the round orchestrator), tex (procedural textures)
├─ ui/        DOM overlays & HUD: dom helpers, Hud, overlays (menus/modals)
├─ audio/     AudioManager — procedural Web Audio synthesis
├─ app/       bootstrap + RunConfig (mode/map/seed wiring)
└─ main.ts    Entry: Phaser game, boot wiring, a11y classes
```

The **pure logic** (`core`, `config`, `game`) is deliberately free of Phaser and the DOM
so it can be unit-tested deterministically in Node/jsdom. The **view layer** (`scenes`,
`ui`) consumes that logic through a typed **EventBus** and a small registry, keeping the
sim and the presentation decoupled.

### Scoring model

```
total = base × depthFactor × perfectMult × comboMult + multikillBonus + longshotBonus
        + eventBonus + envBonus + chainBonus + timeBonus
```

Combo raises the multiplier every 5 hits; misses cut it. Ranks: **D, C, B, A, S, SS, SSS**
against a per-round par score.

---

## Testing / Tests

`npm run test` runs the Vitest suite covering the deterministic core:

- scoring, combo multiplier & penalties, ranks and par score
- weapon reload/fire timing and reserve accounting
- seeded RNG, `dailySeed` reproducibility, spawn-plan rules and cadence
- difficulty-director clamping
- save migration across versions (including equipped cosmetics)
- achievements & challenge claim rules
- i18n fallback chain and interpolation

The full build gate is `tsc --noEmit` → `vitest run` → `eslint .` → `vite build`,
all clean.

---

## Notes

- **100 % procedural.** Art (targets, birds, props, backdrop) is generated into Phaser
  textures at boot; audio is synthesised on the fly. Nothing is fetched over the network.
- All text is bilingual; **German is canonical**, English falls back to German keys.
- No `any` in the TypeScript source; no single monolith file — logic is split by concern.
- Save data lives in `localStorage` under the game's namespaced key and is versioned so
  old saves migrate safely.

*Ein komplett originales Spiel – sämtliche Grafik, Audio und Texte werden prozedural erzeugt.*
