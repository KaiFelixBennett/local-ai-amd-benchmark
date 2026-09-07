# Agent-Regeln — Clair Obscur: Expedition 33 (Battle Clone)

> Inhaltsgleich mit `.github/copilot-instructions.md` (die liest VS Code Copilot,
> diese hier lesen Codex / Qwen Code / OpenCode). Aenderungen in BEIDEN nachziehen.

Einstieg: `index.html` + `src/main.js`.

---

## 1. Ausdauer — die wichtigste Regel

**Arbeite eine Aufgabe vollständig zu Ende, bevor du das Wort zurückgibst.**

- **Eine leere, kurze oder unklare Nutzernachricht ist KEIN Stoppsignal.** Wenn du den
  Eindruck hast, der Nutzer habe nichts oder etwas Leeres geschickt: **arbeite an der
  laufenden Aufgabe weiter.** Warte nicht, frage nicht nach, kommentiere es nicht — mach
  den nächsten offenen Punkt. Nur eine ausdrückliche Anweisung wie "stopp" oder "warte"
  beendet die Arbeit.
- **Stelle KEINE Rückfragen mitten in einer Aufgabe.** Bei Mehrdeutigkeit die plausibelste
  Annahme treffen, umsetzen, am Ende in einem Satz nennen. Nur fragen, wenn wirklich nur
  der Nutzer entscheiden kann (z.B. Designrichtung) — nie bei technischen Details.
- **Beende deinen Zug nicht mit "Teste es mal und sag mir, ob es läuft."** Testen ist *dein*
  Job (Abschnitt 2). Gib erst zurück, wenn du selbst verifiziert hast.
- **Hast du eine Liste von Punkten angekündigt, arbeite ALLE ab.** Wenn du schreibst "ich
  behebe Issue 1, 2 und 3" und dann nur 1 und 2 machst, ist der Zug nicht fertig. Ein
  erledigter Teilschritt ist **kein** Grund aufzuhören.
- **Ein gefundener Fehler ist kein Endpunkt, sondern der nächste Arbeitsschritt.**
- Kündige Arbeit nicht an — führe sie aus. *"Als Nächstes werde ich X öffnen…"* ohne
  folgenden Tool-Call im selben Zug ist wertlos. **Erst handeln, dann berichten.**

## 2. Verifikation — behaupte nichts Ungeprüftes

Vor jedem "fertig"/"behoben":

1. **Syntax:** `node --check <datei>` auf jeder geänderten `.js`-Datei. Genau diese
   Fehlerklasse ist hier schon aufgetreten (doppelte geschweifte Klammer in
   `_onStateChange`).
2. **Server — LÄUFT im HINTERGRUND, NIE im Vordergrund starten!** Der Server ist ein
   Langläufer; `node serve.mjs` direkt kehrt **nie** zurück und blockiert deine Shell bis zum
   Timeout (genau das ist passiert: 108 s blockiert). Richtiger Ablauf:
   1. **Erst prüfen, ob schon einer läuft** (der User oder eine frühere Runde hat ihn evtl.
      gestartet):
      `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8123/`  → `200` = läuft,
      direkt weiter zu Schritt 3. `000` = läuft nicht.
   2. **Nur wenn nicht: im Hintergrund starten** — `./serve-bg.bat` (kehrt sofort zurück,
      Server läuft in eigenem minimierten Fenster). **NIEMALS `node serve.mjs` direkt.**
      Danach kurz warten und den Health-Check aus Schritt 1 wiederholen, bis `200` kommt.
   - **NIEMALS `python -m http.server`**: single-threaded, Chromium öffnet parallele
     Verbindungen → `net::ERR_EMPTY_RESPONSE`. `serve.mjs` ist nebenläufig, bindet `0.0.0.0`.
   - **Health-Check immer mit `127.0.0.1`, NIE `0.0.0.0`** (`0.0.0.0` ist kein Verbindungsziel
     → Fehlalarm).
3. **Browser:** `agent_browser open http://127.0.0.1:8123/`, dann `agent_browser screenshot`
   (ohne `-i` — `-i` ist eine *snapshot*-Option, kein screenshot-Flag). Screenshot **ansehen
   UND die Konsole auf Fehler prüfen.** "Die Seite lädt" ist kein Beweis — der Canvas kann
   leer bleiben oder in `Preparing the canvas…` hängen.
4. **Ablauf END-TO-END durchspielen — Pflicht, nicht optional.** Nicht nur den
   Startbildschirm ansehen, sondern den Kampf tatsächlich spielen und die Wirkung BEWEISEN:
   a) **Erst die Canvas anklicken** (`agent_browser click` auf die Spielfläche) — sonst
      erreichen die Tasten die `keydown`-Listener NICHT (Canvas-Fokus-Falle).
   b) Dann die echten Tasten: `press ArrowDown`/`ArrowUp` (Menü), `press Enter` (Angriff),
      `press Space` (Parry), `press Shift` (Dodge), `press KeyU` (Ultimate).
   c) **Zustand per `eval` prüfen, nicht per Auge** — das HUD ist Canvas-Pixel, ein
      `snapshot` sieht die HP-Zahlen nicht. Dazu muss der Game-State auf `window` liegen:
      falls `window.__game` fehlt, in `main.js`/`game.js` `window.__game = game` (bzw. die
      Game-Instanz) ergänzen. Dann z.B.:
      - vor dem Angriff: `agent_browser eval "window.__game.enemies[0].hp"`
      - Enter drücken, kurz warten
      - danach erneut lesen → **HP MUSS gesunken sein**, sonst ist der Angriff kaputt.
      Ebenso: Zug gewechselt? AP verbraucht? Parry/Dodge reagiert? Alles per `eval` belegen.
   Ein Turn, den du nicht durchgespielt und dessen Wirkung du nicht per State bewiesen hast,
   gilt als NICHT verifiziert.

Konntest du einen Schritt nicht ausführen: ausdrücklich sagen **welchen** und **warum**.
Niemals implizieren, etwas sei geprüft, wenn es das nicht ist.

## 3. Was ein abgeschlossener Zug enthält

- Alle Änderungen geschrieben — keine TODOs, keine Platzhalter, kein "// Rest analog"
- `node --check` grün auf allen geänderten Dateien
- Spiel geladen, Browser-Konsole fehlerfrei, betroffener Ablauf durchgespielt
- Kurzbericht: **was** geändert, **warum**, **wie verifiziert** + getroffene Annahmen

## 4. Projekt-Konventionen

- **three.js ausschließlich über die Importmap** in `index.html`
  (`three@0.160.0`, `three/addons/`). Keine anderen CDN-URLs erfinden.
- **Keine externen Assets.** Jede Textur, jeder Sound, jedes Mesh wird zur Laufzeit
  prozedural erzeugt (CanvasTexture/DataTexture, BufferGeometry, Web Audio).
  Keine Bild-, Audio- oder Font-Dateien.
- **Echte Modulgrenzen** via `import`/`export`, kein globaler Namespace. Subsysteme:
  `src/battle/` (Kampflogik), `src/engine/` (Renderer/Audio/PostFX), `src/entities/`,
  `src/fx/`, `src/ui/`, `src/core/`.
- **`src/game.js` ist Orchestrator**, keine zweite Halde. Logik, die einem System gehört,
  wandert in dessen Datei.
- **Keine erfundenen APIs.** Nur Aufrufe, deren Existenz in three.js 0.160.0 sicher ist.
  Ein halluzinierter Aufruf, der wirft, ist ein Totalausfall.
- Wenn du den Typ eines Objekts änderst (z.B. `Mesh` → `Sprite`), **prüfe alle Stellen**,
  die es anfassen — Sprites nutzen `scale` anders als Meshes, `position`-Offsets müssen
  nachgezogen werden.
- **Delta-Zeit überall**, nie framecount-basiert. Seedbares RNG über `src/core/rng.js`.
- Funktionen möglichst unter ~60 Zeilen.

## 5. Kommunikation

- Antworte auf Deutsch.
- Fasse dich kurz, wiederhole keinen geschriebenen Code im Chat.
- Keine Erfolgsmeldung ohne Beleg. Offenes klar benennen, statt es hinter "✅ Fertig!"
  verschwinden zu lassen.
