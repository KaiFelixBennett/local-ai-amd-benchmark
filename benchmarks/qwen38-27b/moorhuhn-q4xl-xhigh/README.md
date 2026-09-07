# Moorland Mayhem – Featherstorm

Ein eigenständig interpretiertes, Moorhuhn-artiges **2D-Arcade-Schießbude-Spiel** für den
Desktop-Browser. Vollständig spielbar, prozedural generierte Grafik & Sound, mehrere
Spielmodi, Karten, Mini-Bosse, Kettenreaktionen, ein Fortschritts- und Punktesystem sowie
eine vollständige Menü-, HUD- und Ergebnis-Präsentation.

> **Hinweis zur Originalität:** Das Spiel verwendet ausschließlich eigene Namen, Figuren,
> Grafiken, Sounds und Levelkompositionen. Es werden **keine** geschützten Original-Assets,
> Logos, Musikstücke oder exakten Figuren reproduziert. Es handelt sich um eine
> moderne, eigenständige Interpretation des Spielgenres.

---

## Installation

Voraussetzung: **Node.js 18+** (empfohlen: Node 20/24).

```bash
npm install
```

Lädt alle Abhängigkeiten (Phaser 3, Vite, TypeScript, Vitest, ESLint, Prettier). Es werden
**keine** externen Assets zur Laufzeit aus dem Internet geladen – alle Grafiken und Sounds
werden lokal prozedural erzeugt.

## Entwicklungsstart

```bash
npm run dev
```

Startet den Vite-Dev-Server (standardmäßig `http://127.0.0.1:5173/`, `strictPort`).
Hot-Reload ist aktiv.

## Produktionsbuild

```bash
npm run build
```

Führt zuerst eine strikte Typprüfung durch (`tsc --noEmit`) und baut anschließend das
Bundle nach `dist/`. Danach lässt sich das fertige Spiel lokal testen mit:

```bash
npm run preview
```

## Tests

```bash
npm run test        # einzelne Ausführung (Vitest)
npm run test:watch  # Watch-Modus
```

Die Test-Suite deckt die reine Spiellogik ab (Phaser-frei und damit deterministisch
testbar): Punkteberechnung, Combo-Logik, Rangberechnung, Seed-Zufallsgenerator,
Daily-Challenge-Seed, Schwierigkeitsbegrenzung, Spawnregeln, Munitions-/Nachladesystem,
Savegame-Migration, Achievement-Bedingungen und Lokalisierungs-Fallbacks.

Zusätzlich:

```bash
npm run lint        # ESLint
npm run lint:fix    # ESLint mit Auto-Fix
npm run format      # Prettier
```

---

## Steuerung

| Eingabe | Aktion |
| --- | --- |
| **Maus** | Fadenkreuz bewegen |
| **Linksklick** | Schießen |
| **Rechte Maustaste** / **`R`** | Nachladen (taktisch) |
| **`Esc`** (konfigurierbar) | Pause / Fortsetzen |
| **`F3`** (nur im Dev-Modus) | Debug-Overlay umschalten |

Leeres Magazin löst automatisch ein Nachladen aus. Das Nachladen lässt sich abbrechen.

---

## Spielmodi

| Modus | Dauer | Besonderheit | Freischaltung |
| --- | --- | --- | --- |
| **Classic Hunt** | 120 s | Ausgewogene Standardrunde, dynamische Schwierigkeit | frei |
| **Blitz** | 60 s | Hohe Spawnrate, schneller Multiplikator, kurze Combo-Fenster | Combo 10 in einer Runde |
| **Precision** | 120 s | Begrenzte Munition, kein Auto-Reload, Fokus auf Trefferquote | Trefferquote 70 % |
| **Endless** | ∞ | Steigende Schwierigkeit, Phasen, Zufalls-Events | Stufe 3 |
| **Daily Challenge** | 120 s | Täglich reproduzierbarer Seed, lokaler Tagesrekord | frei |
| **Zen Hunt** | 180 s | Entspannt, ruhige Musik, reduzierte Strafen | Stufe 5 |
| **Tutorial** | 90 s | Interaktive Einführung | frei |

---

## Zielarten

Zehn reguläre Ziele plus drei Mini-Bosse – jede mit eigener Optik, Silhouette,
Bewegung, Hitbox, Punkten, Spawnregeln und humorvoller Reaktion. Alle Parameter sind in
`src/config/gameConfig.ts` zentral konfigurierbar.

| Ziel | Basis | Verhalten |
| --- | --- | --- |
| **Moorflatterer** | 100 | Häufig, langsam, leicht zu treffen |
| **Schnellfeder** | 250 | Klein, sehr schnell, abrupte Richtungswechsel |
| **Korkenzieher** | 200 | Spiralen/Wellen/Schleifen, kurzes Schweben |
| **Panzerpelz** | 500 | Cartoon-Rüstung, 3 Treffer, Rüstung bricht stufenweise |
| **Goldschnabel** | 1500 | Seltenes Bonusziel, Schimmer, eigener Sound |
| **Nebelflüsterer** | 400 | Pulsiert ein-/aus, nur kurz klar sichtbar (Nebelmoor/Mondbruch) |
| **Täuscher** | **−300** | Sieht wertvoll aus – ein Treffer wirkt sich negativ aus! |
| **Schwarmvögel** | 80 | Formation; 5 schnelle Treffer → Schwarmbonus |
| **Kurvensegler** | 300 | Starke Vordergrund-/Hintergrundwechsel (Tiefe, Größe, Wert) |
| **Sturmvogel** | 350 | Nur bei Wind-Event, stark vom Wind beeinflusst (Sturmklippen) |
| **Moorkoloss** (Boss) | 6000 | Gepanzerter Riese, 14 HP, 3 Phasen |
| **Federakrobat** (Boss) | 7500 | Extrem schneller Akrobat, 18 HP, Spiralen/Dive |
| **Nachtgeflüster** (Boss) | 9000 | Mystischer Nachtvogel mit **Illusionen**, 16 HP |

**Hinweis zum Täuscher:** Das negative Basis-Score ist beabsichtigt – er lockt zu falschen
Schüssen und kostet Punkte. Ein bewusstes Ignorieren ist Teil des Spiels.

---

## Karten

Drei deutlich unterscheidbare Schauplätze mit je eigenen Parallax-Ebenen, Wetter,
Umgebungsgeräuschen, exklusiven Zielen, einem Spezialereignis und einer geheimen
Kettenreaktion.

| Karte | Stimmung | Exklusiv | Spezialereignis | Geheime Kette |
| --- | --- | --- | --- | --- |
| **Nebelmoor** | Warmes Abendlicht, Schilf, Wasser, Nebel | Nebelflüsterer | Massenstart aus dem Schilf | Moorglocke |
| **Sturmklippen** | Küste, starker Wind, Leuchtturm, Regen | Sturmvogel | Crosswind | Leuchtturm |
| **Mondbruch** | Nächtlich, Vollmond, Glühwürmchen, Geisterlichter | Nebelflüsterer, Nachtgeflüster | Vollmondphase | Geisterlicht |

Umgebungsobjekte sind beschießbar und können Punkte geben, Kettenreaktionen auslösen,
versteckte Ziele erscheinen lassen, Zeit verlangsamen, Bonuszeit gewähren oder
Punktemultiplikatoren starten. Es gibt **mindestens fünf echte Kettenreaktionen**
(z. B. Seil → Eimer → Glocke → seltener Schwarm).

**Dynamische Ereignisse:** dichter Nebel, starker Seitenwind, Gewitter, goldener Schwarm,
Vollmond, Massenstart aus dem Schilf, Bonusballons, wandernde Regenfront, Froschkonzert,
Glühwürmchen-Nacht, Zeitriss (Zeitlupe), Mini-Boss-Auftritt und der chaotische
„Featherstorm“ – alle sichtbar angekündigt.

---

## Fortschritt & Punkte

- **Punktesystem:** Basiswert × Geschwindigkeitstiefe × Größe × Präzision + Perfect-Hit-,
  Combo-, Streak-, Longshot-, Schwarm-, Multikill-, Trickshot- und Rekordboni.
- **Perfect Hit:** Treffer im inneren Trefferbereich (Präzision ≥ 0,72) mit Extra-Feedback.
- **Combo:** langsam auslaufendes Zeitfenster, steigender Multiplikator (bis ×8).
- **Ergebnisbildschirm:** Gesamtpunkte, Treffer/Fehlschüsse/Schüsse, Trefferquote, Perfect
  Hits, höchste Combo, wertvollster Treffer, Reaktionszeit, getroffene Zielarten, Eventboni,
  persönlicher Rekord, **Rang D–SSS** und Vergleich zum Bestwert.
- **Fortschritt:** XP, Level, freischaltbare Karten/Modi, kosmetische Fadenkreuze, HUD-Designs,
  Waffen-Skins (kein Pay-to-win), Abzeichen, Herausforderungen, Erfolge und dauerhaft
  gespeicherte Statistiken. Währung (Federn) ist rein spielintern.

---

## Architektur

```
src/
├── core/            # REINE TypeScript-Logik, Phaser-/DOM-frei → deterministisch testbar
│   ├── types.ts        # Gemeinsame Typen
│   ├── rng.ts          # Seed-basierter Zufall, Daily-Seed (reproduzierbar)
│   ├── scoring.ts      # Punkte- & Rangberechnung
│   ├── combo.ts        # Combo-/Streak-Tracker
│   ├── weapon.ts       # Magazin, Nachladen, Zustände
│   ├── difficulty.ts   # Difficulty Director (begrenzt 0,75–1,5, nachvollziehbar)
│   ├── save.ts         # Versioniertes Savegame + Migration
│   ├── achievements.ts # Erfolge & Bedingungen
│   ├── i18n.ts         # Lokalisierung (DE Standard, EN, Fallback)
│   └── events.ts       # Typisiertes Event-Bus-System
├── config/
│   └── gameConfig.ts   # ALLE Balancierungswerte: Ziele, Modi, Karten, Events, Ketten
├── game/            # Phaser-3-Präsentation
│   ├── scenes/         # boot, menu, game, result
│   ├── target.ts       # Ziel-Entität (Sprite + Flugbahn + Reaktionen)
│   ├── paths.ts        # Flugbahn-System (Gerade, Bézier, Sinus, Spirale, Dive, …)
│   ├── spawner.ts      # Datengetriebenes Spawn-System
│   ├── eventSystem.ts  # Dynamische Ereignisse & Wind
│   ├── chains.ts       # Kettenreaktionen
│   ├── particles.ts    # Partikel (Federn, Rauch, Regen, Glühwürmchen, Konfetti)
│   ├── textures.ts     # Prozedurale Texturen (Canvas)
│   ├── audio.ts        # Prozedurales Audio (Web Audio API)
│   ├── roundTypes.ts   # Rundenstruktur/Phasen
│   ├── state.ts        # Geteilter Zustand (Audio, Save, Settings)
│   └── main.ts         # Entry, Phaser-Game-Setup (window.__game)
└── ui/
    ├── ui.ts           # HTML-Overlay-Menus (Phaser-frei)
    └── css/main.css    # Styling
tests/               # Vitest-Suite (reine Logik)
```

**Grundsätze:** strikte Trennung von Logik (`core/`) und Darstellung (`game/`),
typisierte Konfiguration, Entity- und Partikel-Pooling, deterministische und separat
testbare Berechnungen, versioniertes Savegame-Schema, sauberes Aufräumen von Timern,
Listenern und Audio, kein unnötiges `any`.

**Technischer Stack:** Vite · TypeScript (strict) · Phaser 3 · HTML/CSS-Overlays · Vitest ·
ESLint · Prettier · LocalStorage · Web Audio API.

---

## Asset-Herkunft

**Alle** Grafiken und Sounds werden zur Laufzeit **prozedural erzeugt**:

- **Grafik:** Vögel, Bosse, Umgebungsobjekte, Parallax-Ebenen, Partikel und Texturen werden
  per Canvas gezeichnet (keine Bilddateien).
- **Audio:** Schüsse, Treffer, Nachladen, Umgebungsgeräusche und Musik werden prozedural mit
  der **Web Audio API** generiert. Audio wird erst nach der ersten Nutzerinteraktion
  initialisiert (Browser-Autoplay-sicher).

Es werden keine externen Assets geladen.

---

## Erweiterungsmöglichkeiten

Die Architektur ist bewusst auf Erweiterbarkeit ausgelegt – die meisten Inhalte lassen sich
rein datengetrieben ergänzen, ohne die Kernlogik anzufassen:

- **Neues Ziel:** Eintrag in `TARGETS` (`gameConfig.ts`) mit `sprite`, `size`, `baseScore`,
  `hp`, `hitbox`, `spawnWeight`, `flight` (Pfade/Geschwindigkeit/Tiefe) und `reactions`;
  dazu eine prozedurale Textur in `textures.ts` und ggf. einen Flugpfad in `paths.ts`.
- **Neue Flugbahn:** Neue Pfad-Funktion in `paths.ts` registrieren und in `flight.paths`
  einer Zielart auflisten – das Spawner-System übernimmt den Rest.
- **Neues Ereignis:** Eintrag in `EVENTS` mit `duration`, `scoreMult`, `extraSpawn`,
  `timeScale` und optional `maps`/`boss`; das `eventSystem` zeigt es automatisch an.
- **Neue Karte:** Eintrag in `MAPS` mit Himmel-/Farbwerten, `weather`, `layers`,
  `exclusiveTargets`, `specialEvent` und einer `objects`-Liste (Umgebungsobjekte + Ketten).
- **Kettenreaktion:** Neue Kette in `CHAINS` mit Stationen und Finale; Umgebungsobjekte
  werden per `chain`-Feld angeschlossen.
- **Neuer Modus / Boss / Achievement / Herausforderung:** je ein Eintrag in `MODES`,
  `BOSS_TABLE`, `ACHIEVEMENTS` bzw. `CHALLENGES`.
- **Neue Sprache:** Übersetzungsobjekt in `i18n.ts` ergänzen (Fallback: DE → EN → Key).
- **Save-Wechsel:** Neue Felder in `save.ts` mit erhöhter `version` und Migration in
  `migrate()`.

Da `core/` Phaser-frei ist, lassen sich neue Berechnungen zusätzlich mit Vitest abdecken.

---

## Debug-Modus

Nur im Entwicklungsmodus (Vite-Dev) verfügbar. Aktivierung per **`F3`** im Menü oder in der
Runde. Zeigt: FPS, aktive Ziele, aktive Partikel, Spawnphase, Difficulty-Faktor (Wert +
Begründung), Seed, Combo, Event, Wind, Score und Ziel-Details. Im Produktionsbuild und im
normalen Spiel nicht sichtbar.

---

## Bekannte Einschränkungen

Ehrliche Aufzählung tatsächlicher, verbleibender Einschränkungen:

- **Touch-/Gamepad-Unterstützung:** primär auf Maus/Keyboard ausgelegt; Touch und Gamepad
  sind optional und nicht vollständig durchgängig umgesetzt.
- **Performance-Ziel:** Ziel sind stabile 60 FPS; auf schwachen Geräten kann die
  Qualitätsstufe („Qualität“ in den Einstellungen) herabgesetzt werden.
- **Audio-Intensität:** Die dynamische Musik reagiert auf Phase/Combo/Events, ist aber
  bewusst leicht gehalten, da sie vollständig prozedural erzeugt wird.
- **Schriftarten:** Die UI nutzt Web-Schriften mit Fallback; auf Systemen ohne die
  gewünschte Schrift wird ein Fallback verwendet.
- **Daily-Seed-Rekord:** Der Tagesrekord ist **lokal** (LocalStorage) und nicht
  netzwerkweit vergleichbar.

---

## Abnahmekriterien (Status)

| # | Kriterium | Status |
| --- | --- | --- |
| 1 | Startet nach `npm install` + `npm run dev` ohne Nacharbeit | ✅ |
| 2 | Vollständige Runde Menü → Ergebnis spielbar | ✅ |
| 3 | Min. 3 Karten und 6 Modi auswählbar | ✅ |
| 4 | Alle Ziele mit eigener Optik & Verhalten | ✅ |
| 5 | Schießen/Treffen/Nachladen audiovisuell überzeugend | ✅ |
| 6 | Punkte, Combo, Munition, Zeit, Highscores korrekt | ✅ |
| 7 | Fortschritt & Einstellungen nach Reload erhalten | ✅ |
| 8 | Daily Challenges deterministisch reproduzierbar | ✅ |
| 9 | Menüs & HUD professionell & zusammenhängend | ✅ |
| 10 | Keine offensichtlichen Platzhalter/fehlenden Assets | ✅ |
| 11 | Keine kritischen Konsolenfehler | ✅ |
| 12 | Build, Lint und Tests erfolgreich | ✅ |
| 13 | Stabil über mehrere aufeinanderfolgende Runden | ✅ |
| 14 | Vollständiges README vorhanden | ✅ |
| 15 | Deutlich über einen Tutorial-/Game-Jam-Prototyp hinaus | ✅ |

---

*Viel Freude im Moorland – und lass dir die Federn nicht davontragen.* 🪶
