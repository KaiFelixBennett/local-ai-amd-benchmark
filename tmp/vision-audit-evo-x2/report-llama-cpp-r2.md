# Prüfbericht Wiederholungslauf EVO-X2: llama-cpp-r2

| | |
|---|---|
| Slug | `qwen38-flash-next-llama-cpp-r2` |
| System | Linux (Omarchy/Arch, Kernel 7.2.3-arch1-3), VS Code 1.136.1 |
| Testdatum | 18.09.2026, Lauf 14:25:50 bis 14:53:03 |
| Endpunkt | `customendpoint/Lokal evox2/Qwen3.8-Flash-Next-UD-Q4_K_XL` = llama-server `127.0.0.1:8096` |
| Antwort | `evidence/vision/qwen38-flash-next-llama-cpp-r2-vision.json` (SHA-256 `6954d111…`, 10834 Bytes) |

Wiederholung des llama.cpp-Tests vom Vormittag. Die Prüfung hatte ergeben, dass dort Bild B
nur in der Webversion (675 × 900) vorlag und die Werkzeugbeschränkung wegen einer defekten
Agent-Datei nicht griff.

## Vorbereitung

- Die Webversionen in `harness/bilder` sind durch die Originale ersetzt.
- Die defekte Agent-Datei ist durch die Referenz ersetzt.
- Die Memory-Notiz des ersten Laufs ist entfernt, das alte Ergebnis archiviert.
- Der Server wurde mit derselben Startzeile und demselben Build wie beim ersten Lauf neu gestartet, ohne weiteren Modellserver.

## Testdateien

| Datei | SHA-256 | Bytes | Pixel | Entspricht |
|---|---|--:|---|---|
| `harness/bilder/bild-a-dashboard.jpg` | `eb4771a7…fdada494` | 70852 | 900 × 787 | Bild A (Referenz) |
| `harness/bilder/bild-b-stand.jpg` | `6d647d04…ffc9f6511` | 779505 | 1176 × 1568 | Bild B (Referenz) |
| `.github/agents/bilderkennung.agent.md` | `a6c4eb0b…ae03b1a2` | 6836 | – | Agent (Referenz) |

## Chat-Sitzung

- Sitzung: `~/.config/Code/User/workspaceStorage/124286191e01382022b1f5fad4452844/chatSessions/47233bda-7307-4203-9625-155e49212c48.jsonl`, angelegt 14:25:27, eine Anfrage um 14:25:50
- Modus: eigener Agent `bilderkennung`, Frontmatter wirksam (der Anweisungstext beginnt nach dem YAML-Kopf). `permissionLevel: autopilot`.

| Nr. | Werkzeug | Ziel |
|--:|---|---|
| 1 | `list_dir` | `harness/bilder` |
| 2 | `list_dir` | `harness/ergebnisse` |
| 3 | `view_image` | `harness/bilder/bild-a-dashboard.jpg` |
| 4–6 | `view_image` | `harness/bilder/bild-b-stand.jpg` (dreimal) |
| 7 | `create_file` | `harness/ergebnisse/qwen38-flash-next-llama-cpp-r2-vision.json` |
| 8–9 | `replace_string_in_file` | eigene Ergebnisdatei |
| 10 | `view_image` | `harness/bilder/bild-b-stand.jpg` |
| 11–12 | `replace_string_in_file` | eigene Ergebnisdatei |
| 13 | `read_file` | eigene Ergebnisdatei |
| 14–15 | `task_complete` | – |

- **Andere Dateien gelesen:** nein. Kein Terminal, kein Memory.
- **`loesung` im Verlauf:** nein. Es gibt nur das Wort „Lösungsschlüssel“ im Agent-Text und „Bildauflösung“ im Modelltext.
- **Antworten anderer Modelle im Verlauf:** nein.
- **Bildgröße laut Modell (Denkverlauf):** „Image B: 1176 × 1568 (displayed as roughly 1170×1560 in the output).“ Das entspricht der Datei.

## Server-Belege

- **Build:** `version: 0.3.0-dev (build 50, commit d1a9235)`, llama.cpp PR #28243, Vulkan. Startzeile identisch zum ersten Lauf, siehe `report-llama-cpp-r2.json`.
- **mmproj:** `mmproj-F16.gguf` (F16). `--image-min-tokens` und `--image-max-tokens` sind nicht gesetzt. Bild B wurde nicht verkleinert.
- **Kontext:** 262144. MTP mit dem Shared-Q8_0-Sidecar, Reasoning xhigh.

### Bild-Token

Jeder Bildblock steht zweimal im Log, einmal für das Hauptmodell und einmal für den MTP-Draft:

| Bild | Task | Block im Log | Token | Raster à 32 px | erster Lauf |
|---|---|---|--:|---|--:|
| A | 175 (14:27:00) | 512 + 188 | **700** | 28 × 25 | 700 |
| B | 210 (14:27:11) | 512 + 512 + 512 + 277 | **1813** | 37 × 49 | 588 (Webversion) |

Bild B wurde viermal angesehen und jedes Mal neu verarbeitet, in den Tasks 210, 1907, 5114 und
13189 mit je 1813 Token. Task 0 (14:24:16) ist die eigene Vision-Prüfung vor dem Lauf mit einem
synthetischen Bild (120 Token). Auszug: `log-excerpt-llama-cpp-r2.txt`, vollständiges Log:
`logs/llama-cpp-r2-2026-09-18.log`.

## Auffälligkeiten

1. Keine Abweichung vom vorgesehenen Ablauf: Referenzbilder, eigener Agent mit
   Werkzeugbeschränkung, nur die vorgesehenen Werkzeuge.
2. Bild B wurde viermal angesehen, jedes Mal die ganze Datei ohne Ausschnitt oder Vergrößerung.
3. Bild A liegt mit 700 Token unter den 1024, die der Server als Minimum für Grounding nennt;
   Bild B liegt darüber.
