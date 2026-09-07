# Moorland Mayhem – Featherstorm

Ein eigenständiger, Moorhuhn-inspirierter 2D-Arcade-Schießbuden-Shooter für den Browser. Vollständig
eigene Figuren, Grafiken (prozedural erzeugt), Sounds (prozedural synthetisiert via Web Audio API),
Level und Texte — keine Original-Assets, keine externen Laufzeit-Abhängigkeiten.

## Installation

```bash
npm install
```

## Entwicklung

```bash
npm run dev
```

Startet Vite auf `http://localhost:5173`. Hot Module Reload ist aktiv.

## Produktionsbuild

```bash
npm run build
```

Typprüft (`tsc -b`) und baut anschließend mit Vite nach `dist/`. Mit `npm run preview` kann der
Build lokal ausgeliefert werden.

## Tests

```bash
npm run test        # einmaliger Lauf (Vitest)
npm run test:watch  # Watch-Modus
npm run lint         # ESLint
npm run format        # Prettier (schreibt src/**/*.{ts,css,html})
```

Über 100 Unit-Tests decken die deterministische Spiellogik ab: Punkteberechnung, Rangberechnung,
Combo-System, Munitions-/Nachladesystem, Seed-RNG (inkl. Daily-Seed-Reproduzierbarkeit),
Schwierigkeitsbegrenzung, Spawnregeln, Kettenreaktionen, Savegame-Migration,
Achievement-/Challenge-Bedingungen und Lokalisierungs-Fallbacks.

## Steuerung

| Aktion | Eingabe |
|---|---|
| Zielen | Maus bewegen |
| Schießen | Linksklick |
| Nachladen | Rechtsklick oder `R` |
| Pause | `Escape` |
| Vollbild | `F` (im Einstellungsmenü konfigurierbar) |

Tasten für Nachladen/Pause/Vollbild sind in den Einstellungen frei belegbar. Touch- und
Gamepad-Eingaben werden über den Browser/Phaser generisch unterstützt (Zeigereingaben), ein
dediziertes Gamepad-Mapping-UI ist nicht enthalten (siehe „Bekannte Einschränkungen“).

## Spielmodi

- **Classic Hunt** — 120 Sekunden, ausgewogene Standardrunde mit dynamischem Difficulty Director.
- **Blitz** — 60 Sekunden, hohe Spawnrate, kurze Combo-Fenster, schnell wachsender Multiplikator.
- **Precision** — begrenzte Munition (12 Magazine), kein Autoreload, Fokus auf Trefferquote.
- **Endless** — endlos, mit wiederkehrenden Dramaturgie-Zyklen steigender Intensität.
- **Daily Challenge** — täglich identischer, reproduzierbarer Seed (`YYYY-MM-DD`-basiert) für alle
  Spieler; eigener Tagesrekord wird gespeichert.
- **Zen Hunt** — entspannt, kein harter Zeitdruck, reduzierte Fehlschuss-Strafe.

## Zielarten

Moorflatterer, Schnellfeder, Korkenzieher, Panzerpelz (mehrstufige Rüstung), Goldschnabel (selten,
hochwertig), Nebelflüsterer (nebelgebunden), Täuscher (Trick-Ziel), Schwarmvogel (Formationsflug),
Kurvensegler (Vorder-/Hintergrundwechsel) und Sturmvogel (nur während Gewitter). Jede Art hat eigene
Silhouette, Flugmuster, Hitbox, Punktewert und mindestens eine humorvolle Reaktion — vollständig
konfigurierbar in `src/config/targets.ts`.

Zusätzlich: drei Mini-Bosse (Eisenfeder, Blitzflügel, Schattenschnabel mit Illusions-Doppelgängern)
mit mehreren Phasen, sichtbarer Lebens-/Rüstungsanzeige und garantiert fairen (keine unvermeidbaren)
Begegnungen.

## Schauplätze

- **Nebelmoor** — klassisches Moor, warmes Abendlicht, Nebel-Event, exklusiv: Nebelflüsterer.
- **Sturmklippen** — windige Küste, Leuchtturm, Gewitter-Event, exklusiv: Sturmvogel.
- **Mondbruch** — nächtliches Moor, Vollmond, Glühwürmchen, exklusiv: Täuscher.

Jede Karte hat mehrere Parallax-Ebenen, eigenes Wetter-Set, exklusive interaktive Objekte und
mindestens eine geheime, mehrstufige Kettenreaktion (z. B. Sturmklippen: Wetterfahne → Laterne →
Wagen → Dosenzaun → verstecktes Fundstück, fünf Stationen).

## Architektur

```
src/
  core/        RNG (seeded, mulberry32), EventBus, zentrale Typen
  config/      Alle Balancing-/Inhaltsdaten (Ziele, Karten, Modi, Events, Bosse, Achievements, …)
  systems/     Reine, testbare Logik: Scoring, Combo, Weapon, DifficultyDirector, SpawnDirector,
               EventSystem, ChainReactionSystem, Achievement-/ProgressionManager, SaveManager,
               Localization, AudioManager (Web Audio, prozedural), ParticleManager
  entities/    Phaser-GameObjects: Target (gepoolt), TargetPool, EnvironmentObject, Boss
  scenes/      BootScene (Texturgenerierung), MenuBackgroundScene (Ambient-Hintergrund), GameScene
  gfx/         TextureFactory — erzeugt alle Sprites prozedural über Phaser.Graphics
  ui/          Vollständige HTML/CSS-Menüebene (Screens, HUD, Pause-Overlay) + GameBridge
               (entkoppelte Event-Kommunikation zwischen Phaser und DOM)
  locales/     de.ts (Quelle der Wahrheit) / en.ts (Partial, fällt auf Deutsch zurück)
tests/         Vitest-Suiten für alle Systeme in src/systems + src/core
```

Design-Prinzipien: strikt typisierte Konfigurationsobjekte, Entity-Pooling für Ziele, klare Trennung
von Logik (systems/, core/) und Darstellung (scenes/, entities/, ui/), Kommunikation über einen
typisierten EventBus statt globaler Zustände, deterministische und separat testbare Berechnungen,
versioniertes Savegame-Schema mit Migrationspfad.

## Asset-Herkunft

Es werden keine externen Bild-, Sound- oder Schriftdateien geladen. Sämtliche Grafiken werden beim
Boot prozedural mit Phasers `Graphics`-API gezeichnet und als Texturen gebacken
(`src/gfx/TextureFactory.ts`). Sämtliche Sounds werden zur Laufzeit mit der Web Audio API
synthetisiert (Oszillatoren/Noise, `src/systems/AudioManager.ts`) — inklusive
Autoplay-policy-konformer Initialisierung nach der ersten Nutzerinteraktion. UI-Text kommt aus den
lokalen Locale-Dictionaries.

## Debug-Modus

In der Entwicklungsumgebung (`import.meta.env.DEV`) kann ein Debug-Overlay ergänzt werden, das FPS,
aktive Ziele/Partikel, Spawnphase, Difficulty-Faktor, Seed und Pool-Informationen anzeigt. Die dafür
nötigen Werte werden bereits in `GameScene` und den Direktoren berechnet (`difficultyDirector.getFactor()`,
`targetPool.activeCount()`, `spawnDirector`-Seed usw.); ein sichtbares Overlay ist als
Erweiterungspunkt vorgesehen und im Produktionsbuild nie sichtbar.

## Erweiterungsmöglichkeiten

- Weitere Zielarten/Karten/Modi lassen sich rein datengetrieben in `src/config/*` ergänzen.
- Das Kettenreaktionssystem (`src/config/chainReactions.ts`) ist deklarativ — neue Ketten sind neue
  Einträge mit Trigger-Objekt, Stationen und Belohnungstyp.
- Zusätzliche Sprachen: neue Datei in `src/locales/`, in `Localization.ts` registrieren.
- Weitere Mini-Bosse: neuer Eintrag in `src/config/bosses.ts` + Textur in `TextureFactory`.

## Bekannte, tatsächlich verbleibende Einschränkungen

- Die Grafik ist bewusst in einem flachen, geometrischen Prozedural-Stil gehalten (Kreise, Ellipsen,
  Polygone statt handgemalter Bitmap-Illustration) — das erfüllt die Vorgabe „keine externen
  Assets“, erreicht aber nicht die Detailtiefe handgezeichneter Concept-Art.
  Einzelne Objekt-Silhouetten (z. B. Pilz, Windrad) sind dadurch abstrakter lesbar als ein
  gemaltes Äquivalent.
  Als Erweiterung liesse sich `TextureFactory` 1:1 durch importierte SVG/PNG-Sprites ersetzen, ohne
  den Rest der Architektur (Konfiguration, Systeme, Entities) anzufassen.
- Es gibt kein dediziertes On-Screen-Gamepad-Mapping-UI; Phaser/Browser-Gamepad-Events werden nicht
  aktiv verdrahtet (nur Maus/Touch-Zeigereingabe ist verkabelt).
- Der Debug-Modus ist als Datenquelle vollständig vorhanden, aber ohne eigenes On-Screen-Overlay
  ausgeliefert (siehe oben).
- Die Audiokulisse ist rein synthetisch (Oszillatoren/Noise) statt aufgenommener Instrumente/Foley —
  bewusst, um ohne jegliche Binärassets auszukommen.

## Rechtlicher Hinweis

„Moorland Mayhem – Featherstorm“ ist eine eigenständige Neuschöpfung. Namen, Figuren, Grafiken,
Sounds und Level sind Originalarbeiten und stehen in keiner Verbindung zu bestehenden Marken oder
Werken.
