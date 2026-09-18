# Prüfbericht Wiederholungslauf EVO-X2: halogen-r2

| | |
|---|---|
| Slug | `qwen38-flash-next-halogen-r2` |
| System | Linux (Omarchy/Arch, Kernel 7.2.3-arch1-3), VS Code 1.136.1 |
| Testdatum | 18.09.2026, Lauf 14:05:59 bis 14:20:26 |
| Endpunkt | `customendpoint/Lokal evox2/halogen-qwen3.8-flash-next-w4b-quality-overlay` = Live-Log-Proxy `127.0.0.1:8099` vor Halogen `127.0.0.1:18099` |
| Antwort | `evidence/vision/qwen38-flash-next-halogen-r2-vision.json` (SHA-256 `30aea43f…`, 11541 Bytes) |

Wiederholung des Halogen-Tests vom 17.09., nachdem die Prüfung ergeben hatte, dass dort Bild B
nur in der Webversion (675 × 900) vorlag und der eigene Agent nicht aktiv war.

## Vorbereitung

- Die Webversionen in `harness/bilder` sind durch die Originale aus `harness/bilder` des Repos ersetzt (`bild-a-dashboard.jpg`, `bild-b-stand.jpg`).
- Das Ergebnis vom 17.09. ist aus `harness/ergebnisse` in ein Archiv außerhalb des Arbeitsordners verschoben.
- Halogen wurde mit `halogen-starten.sh` neu gestartet, mit denselben Einstellungen wie am 17.09. und ohne weiteren Modellserver.

## Testdateien

| Datei | SHA-256 | Bytes | Pixel | Entspricht |
|---|---|--:|---|---|
| `harness/bilder/bild-a-dashboard.jpg` | `eb4771a7…fdada494` | 70852 | 900 × 787 | Bild A (Referenz) |
| `harness/bilder/bild-b-stand.jpg` | `6d647d04…ffc9f6511` | 779505 | 1176 × 1568 | Bild B (Referenz) |
| `.github/agents/bilderkennung.agent.md` | `a6c4eb0b…ae03b1a2` | 6836 | – | Agent (Referenz) |

## Chat-Sitzung

- Sitzung: `~/.config/Code/User/workspaceStorage/5a33e2c425abccf32e4a68a10ab3adb3/chatSessions/d9e7bddd-2234-47f1-bddf-a674b423e8b7.jsonl`
- Modus: eigener Agent `bilderkennung`. Das Frontmatter war wirksam: Der Anweisungstext beginnt erst nach dem YAML-Kopf, und der Proxy zählt 20 statt 73 Tool-Definitionen.
- Anfrage 1 (13:41:37, Nachricht `qwen38-flash-next-halogen-r2`) hing im Prefill und wurde durch den Neustart von Halogen abgebrochen. Anfrage 2 (14:05:59, „Try Again“) ist der eigentliche Lauf.

| Nr. | Werkzeug | Ziel |
|--:|---|---|
| 1 | `list_dir` | `harness/bilder` |
| 2 | `list_dir` | `harness/ergebnisse` |
| 3 | `view_image` | `harness/bilder/bild-a-dashboard.jpg` |
| 4 | `view_image` | `harness/bilder/bild-b-stand.jpg` |
| 5 | `create_file` | `harness/ergebnisse/qwen38-flash-next-halogen-r2-vision.json` |

- **Andere Dateien gelesen:** nein. Kein Terminal, kein Memory.
- **`loesung` im Verlauf:** nein. Es gibt nur das Wort „Lösungsschlüssel“ im Agent-Text.
- **Antworten anderer Modelle im Verlauf:** nein.
- **Bildgröße laut Modell (Denkverlauf):** „The provided image is displayed 1176×1568.“ Das entspricht der Datei.

## Server-Belege

- Image `ghcr.io/peonist-ai/halogen-flash-server:0.9.1`, gestartet am 18.09. um 14:03:06
- Einstellungen wie am 17.09.:
  - Kontext 216064, 2 Slots
  - Indexer-Budget 4096
  - Reasoning xhigh
  - temp 1.0, top_p 0.95, top_k 20
- **Vision:** `HALOGEN_VISION_TOWER=1`. `HALOGEN_VISION_MAX_PIXELS` ist nicht gesetzt (Vorgabe 2560 × 1440), Bild B wird also nicht verkleinert.

| Nr. | Zeit | Bilder (Proxy) | Tools | Prompt (davon Cache) | neu | Prefill laut Server |
|---|---|--:|--:|---|--:|--:|
| #3 | 14:05:59 | 0 | 20 | 11173 | 11173 | 13,42 s |
| #4 | 14:06:21 | 0 | 20 | 11306 (11168) | 138 | 1,20 s |
| #5 | 14:06:27 | 4 (= 2 Bilder) | 20 | 14343 (11301) | **3042** | 9,77 s |
| #6 | 14:19:59 | 4 (= 2 Bilder) | 20 | 19585 (14338) | 5247 | 6,14 s |

Die beiden Bilder kosteten zusammen mit den übrigen neuen Nachrichtenteilen 3042 Token. Am 17.09.
mit der Webversion von Bild B waren es 1817. Eine Aufteilung je Bild weist der Server nicht aus.
Auszug: `log-excerpt-halogen-r2.txt`.

## Auffälligkeiten

1. Keine Abweichung vom vorgesehenen Ablauf: Referenzbilder, eigener Agent mit Werkzeugbeschränkung,
   nur die vorgesehenen Werkzeuge.
2. Die erste Anfrage hing, weil neben Halogen ein zweiter Modellserver lief. Sie wurde abgebrochen und
   in derselben Sitzung wiederholt.
3. Halogen lief mit kaltem Seiten-Cache. Die Bild-Anfrage brauchte laut Proxy 137,5 s bis zum ersten
   Token, obwohl der Server nur 9,77 s Prefill meldet. Die Geschwindigkeiten dieses Laufs sind daher
   nicht mit dem 17.09. vergleichbar.
