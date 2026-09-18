# Auftrag: Prüfbericht zu einem Bilderkennungstest auf diesem Rechner (EVO-X2)

Temporäre Datei, wird nach der Auswertung wieder gelöscht.

Auf diesem Rechner liefen zwei Bilderkennungstests mit Qwen3.8-Flash-Next, jeweils über
VS Code Copilot Chat mit dem Agenten `bilderkennung`:

1. **llama-cpp**: unter Windows, lokaler Endpunkt auf Port 8096, am 18.09.2026,
   Ergebnis-Slug `qwen38-flash-next-llama-cpp`
2. **halogen**: unter Linux, halogen-flash-server 0.6.3 im Container hinter einem
   Live-Log-Proxy, am 17.09.2026, Ergebnis-Slug `qwen38-flash-next-halogen`

Bearbeite den Test, der im gerade laufenden Betriebssystem stattfand. Für den anderen
schreibst du nur „nicht auf diesem System".

Ziel ist herauszufinden, ob bei dem Test etwas anders lief als vorgesehen. Du **sammelst
nur Belege** und schreibst einen bereinigten Bericht. Du startest keine Modelle, änderst
keine Testdateien und bewertest keine Ergebnisse. Findest du etwas nicht, schreib
„nicht gefunden" statt zu raten.

## Referenzwerte der offiziellen Testdateien

| Datei | SHA-256 | Bytes | Pixel |
|---|---|--:|---|
| bild-a-dashboard.jpg | eb4771a7858d3309f4c45d78d3f232dac79b8f46693e235b128c4a52fdada494 | 70852 | 900 × 787 |
| bild-b-stand.jpg | 6d647d0466e34ef07123f608291d157875599b660055dac839e0b87ffc9f6511 | 779505 | 1176 × 1568 |
| bilderkennung.agent.md | a6c4eb0b9ff71952df02d4c86d426992c3e60075e38a9333ba44b5aade03b1a2 | 6836 | – |

Bekannte falsche Variante von Bild B, eine verkleinerte Webversion:
SHA-256 99d51d60688ce4f265b82d0dedf7e7a2b46548a3a6a00229ae4e4c8edc5c2ec5, 217963 Bytes,
675 × 900. Im Arbeitsordner können die Bilder auch `vision-dashboard.jpg` und
`vision-foto.jpg` heißen.

## Schritt 1: Chat-Sitzung und Arbeitsordner finden

VS Code speichert Sitzungen unter
`%APPDATA%\Code\User\workspaceStorage\<id>\chatSessions\*.jsonl`
(Linux: `~/.config/Code/User/workspaceStorage/<id>/chatSessions/`), bei Profilen auch unter
`...\User\profiles\<profil>\workspaceStorage\...`. Suche die Sitzung, die den Slug des Tests
enthält. Die `workspace.json` im selben `<id>`-Ordner nennt den Arbeitsordner. Gibt es
mehrere Treffer, nimm die vom Testdatum und liste die anderen auf.

## Schritt 2: Arbeitsordner prüfen

- Alle Dateien mit relativem Pfad und Größe auflisten, ohne `node_modules` und `.git`.
- Ausdrücklich vermerken: Gibt es Dateien mit `loesung` im Namen? Gibt es Antworten anderer
  Modelle (`*-vision.json`, `*-wertung.json`)? **Den Inhalt einer `loesung`-Datei niemals
  lesen, kopieren oder zitieren**, nur Name und Pfad nennen.
- Für die Bilder, die der Agent tatsächlich angesehen hat, und für die Agent-Datei:
  SHA-256, Bytes und Pixelmaße, verglichen mit den Referenzwerten.

## Schritt 3: Chat-Sitzung auswerten, nicht kopieren

In zeitlicher Reihenfolge:
- jeder Werkzeugaufruf mit Namen und Zielpfad, bei Terminalaufrufen der Befehl selbst,
- ob der Agent eine Datei gelesen hat außer den beiden Bildern, der Agent-Datei und
  seiner eigenen Ergebnisdatei,
- ob `loesung` oder Inhalte anderer Modellantworten im Verlauf vorkommen (nur ja oder nein
  und die Stelle, kein Inhalt),
- welches Modell bzw. welcher Endpunkt ausgewählt war,
- ob das Modell selbst eine Bildgröße nennt (Zitat, höchstens ein Satz).

## Schritt 4: Server-Belege

**llama-cpp:** Die vollständige Startzeile des Servers auf Port 8096 (Pfade dürfen gekürzt
sein), vor allem `--mmproj` (Datei und Präzision), `--image-min-tokens`,
`--image-max-tokens`, `-c` und der Build (`llama-server --version`). Aus dem Serverlog des
Testlaufs, falls vorhanden, die Zeilen `prompt eval time … tokens` und
`stop processing: n_tokens = …` rund um die Anfragen mit angehängten Bildern. Daraus: Wie
viele Token kamen durch die Bilder hinzu?

**halogen:** Aus dem Proxy- bzw. Serverlog vom 17.09. die Zeilen `Anfrage … Bilder N` und
die zugehörigen `fertig … Prompt N Tokens` oder `serve_api: mtp … prompt N (M cached)`.
Daraus die Bild-Token. Außerdem die Startzeilen mit den Vision-Einstellungen
(`HALOGEN_VISION_*`).

Wurde kein Log gespeichert, vermerke das.

## Schritt 5: Bericht veröffentlichen

Dieses Repository ist **öffentlich**. Lege deine Dateien **ausschließlich** in diesem Ordner
`tmp/vision-audit-evo-x2/` ab:
- `report-<test>.md` (lesbar, auf Deutsch),
- `report-<test>.json` nach dem Schema unten,
- optional `log-excerpt-<test>.txt` mit höchstens 30 Zeilen.

`<test>` ist `llama-cpp` oder `halogen`. Diese `PROMPT.md` nicht verändern.

**Nicht veröffentlichen:** rohe Chat-Sitzungen, vollständige Logs, `loesung`-Dateien oder
ihren Inhalt, Zugangsdaten und Tokens, Inhalte anderer Unterhaltungen. Benutzerverzeichnisse
in Pfaden durch `~` ersetzen. Keine anderen Dateien im Repo ändern.

Danach `git pull --rebase`, committen mit der Nachricht
`Temporary vision audit data from the EVO-X2 (<test>), to be removed` und pushen.
Keine Co-Authored-By-Zeile.

Schema für `report-<test>.json`:

```json
{
  "test": "llama-cpp | halogen",
  "system": "Windows oder Linux, Version",
  "sitzung": {"datei": "", "datum": "", "modell_endpunkt": "", "arbeitsordner": ""},
  "weitere_passende_sitzungen": [],
  "arbeitsordner": {
    "dateien": [{"pfad": "", "bytes": 0}],
    "loesung_dateien": [],
    "fremde_antworten": []
  },
  "testdateien": [{"pfad": "", "sha256": "", "bytes": 0, "pixel": "BxH", "entspricht_referenz": "bild-a | bild-b | agent | webversion-b | nein"}],
  "werkzeugaufrufe": [{"nr": 1, "werkzeug": "", "ziel_oder_befehl": ""}],
  "andere_dateien_gelesen": false,
  "loesung_im_verlauf": false,
  "fremde_antworten_im_verlauf": false,
  "modell_nennt_bildgroesse": "",
  "server": {
    "startzeile": "", "build": "", "mmproj": "",
    "image_min_tokens": null, "image_max_tokens": null,
    "vision_einstellungen": "", "log_vorhanden": false,
    "bild_token_je_bild": {"bild_a": null, "bild_b": null}, "herleitung": ""
  },
  "auffaelligkeiten": []
}
```

Nenne am Ende den Commit-Hash und fasse in drei Sätzen zusammen, was auffällig ist.
