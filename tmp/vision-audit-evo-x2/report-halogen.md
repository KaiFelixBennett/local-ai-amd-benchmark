# Prüfbericht Bilderkennungstest EVO-X2: halogen

| | |
|---|---|
| Slug | `qwen38-flash-next-halogen` |
| System | Linux (Omarchy/Arch, Kernel 7.2.3-arch1-3), VS Code 1.136.1 |
| Testdatum | 17.09.2026, Testanfragen laut Proxy-Log 09:00:14 bis 09:10:57 |
| Endpunkt | `customendpoint/Lokal evox2/halogen-qwen3.8-flash-next-w4b-quality-overlay` = Live-Log-Proxy `127.0.0.1:8099` vor Halogen `127.0.0.1:18099` |

## 1. Chat-Sitzung und Arbeitsordner

- Sitzung: `~/.config/Code/User/workspaceStorage/5a33e2c425abccf32e4a68a10ab3adb3/chatSessions/6e2ee919-b674-47f1-9ef4-c8f12c053d27.jsonl`, angelegt 08:58:42, eine Anfrage um 09:00:13, Dauer 644 s
- **Modus: eingebauter Agent-Modus, nicht der eigene Agent `bilderkennung`.** Der Agent-Text wurde als Nachricht eingefügt, `bilderkennung.agent.md` war als Datei angehängt.
- Arbeitsordner laut `workspace.json`: `/srv/securesight.ai/securesight.ai/model-benchmark/qwen38_flash_next_halogen`
- Weitere Sitzung vom Testtag, nicht mit dem Slug: `…/chatSessions/9692e61d-e60d-481f-b389-37cc9cfe0d37.jsonl`, 08:46 bis 08:55. Das war nur ein Verbindungstest („Hallo?“, „Try Again“), ohne Werkzeuge und ohne Bilder; im Proxy-Log entspricht er Anfrage #3.

## 2. Arbeitsordner

84 Dateien, vollständige Liste mit Größen in `report-halogen.json`. Der Ordner enthält außer dem
Test ein vollständiges anderes Projekt (Spiel-Quellcode unter `src/`, `tests/`, `dist/`,
`prompt.md`, `README.md`) sowie ältere Halogen-Logs vom 14./15.09.2026.

- Dateien mit `loesung` im Namen: keine
- Antworten anderer Modelle: keine, nur die eigene Ergebnisdatei `harness/ergebnisse/qwen38-flash-next-halogen-vision.json` (11821 Bytes)

## 3. Testdateien

| Datei | SHA-256 | Bytes | Pixel | Entspricht |
|---|---|--:|---|---|
| `harness/bilder/vision-dashboard.jpg` | `eb4771a7…fdada494` | 70852 | 900 × 787 | Bild A (Referenz) |
| `harness/bilder/vision-foto.jpg` | `99d51d60…ec5c2ec5` | 217963 | 675 × 900 | **Webversion von Bild B, nicht die Referenz** |
| `.github/agents/bilderkennung.agent.md` | `a6c4eb0b…ae03b1a2` | 6836 | – | Agent (Referenz) |

## 4. Chat-Sitzung: Werkzeugaufrufe

Pfade relativ zum Arbeitsordner, in zeitlicher Reihenfolge:

| Nr. | Werkzeug | Ziel oder Befehl |
|--:|---|---|
| 1 | `list_dir` | `harness` |
| 2 | `memory` (view) | `/memories`, Ergebnis „No memories found.“ |
| 3 | `list_dir` | `harness/bilder` |
| 4 | `view_image` | `harness/bilder/vision-dashboard.jpg` |
| 5 | `view_image` | `harness/bilder/vision-foto.jpg` |
| 6 | `create_directory` | `harness/ergebnisse`, Fehler: ungültige Eingabe (Pflichtfeld `dirPath` fehlte) |
| 7 | `create_file` | `harness/ergebnisse/qwen38-flash-next-halogen-vision.json` |

- **Andere Dateien gelesen:** nein, nur Verzeichnislisten.
- **`loesung` im Verlauf:** nein. Es gibt nur das Wort „Lösungsschlüssel“ im eingefügten Agent-Text und „Auflösung“ im Modelltext.
- **Antworten anderer Modelle im Verlauf:** nein. Das Memory war leer.
- **Terminal:** nicht benutzt.
- **Bildgröße laut Modell (in der Ergebnisdatei, aus dem Agent-Text übernommen):** „Die Dateien heißen in diesem Repo 'vision-dashboard.jpg' (900×787) und 'vision-foto.jpg' (1176×1568) statt 'bild-a/bild-b'.“ Die Datei hat 675 × 900.

## 5. Server-Belege

- **Image:** `ghcr.io/peonist-ai/halogen-flash-server:0.9.1`, im Startlog `halogen-flash-server 0.9.1, mode all`
- **Start:** `halogen-starten.sh` → `start-halogen-flash-next.sh --ohne-pruefung` (docker run). Werte laut Startlog vom 17.09.2026 08:50:14:
  - Kontext 216064 je Request, KV-Pool 216064, 2 Slots, YaRN aus
  - Indexer-Budget 4096, max_tokens-Default 65536
  - Reasoning xhigh
  - temp 1.0, top_p 0.95, top_k 20, min_p 0.0, presence 0.0
- **Vision:** `HALOGEN_VISION_TOWER=1`, im Log als „vision ON, tower /models/qwen38-flash-next-vision.hgn“. Weitere `HALOGEN_VISION_*`-Werte sind nicht gesetzt. Der Server gibt dazu zwei Hinweise aus:
  - „HALOGEN_VISION_MAX_PIXELS caps it (default 2560x1440; larger is downscaled)“
  - „an image costs ~1,000 tokens at 1280x800 and ~2,040 at 1080p“

### Anfragen und Bild-Token

| Nr. | Zeit | Nachrichten | Bilder (Proxy) | Tools | Prompt (davon Cache) | neu verarbeitet |
|---|---|--:|--:|--:|---|--:|
| #4 | 09:00:14 | 3 | 0 | 73 | 34659 | – |
| #5 | 09:01:04 | 6 | 0 | 73 | 34773 (34654) | 119 |
| #6 | 09:01:07 | 8 | 0 | 73 | 34847 (34768) | 79 |
| #7 | 09:01:12 | 11 | 4 (= 2 Bilder) | 73 | 36659 (34842) | **1817** |
| #8 | 09:04:14 | 13 | 4 (= 2 Bilder) | 73 | 36806 (36654) | 152 |
| #9 | 09:10:28 | 15 | 4 (= 2 Bilder) | 73 | 41737 (36801) | 4936 |

Der Proxy meldet „Bilder 4“, weil `live-log-proxy.py` das Vorkommen des Strings `"image_url"` zählt,
und der steht je Bild zweimal im Request. Der gespeicherte Request #7 enthält genau zwei Bildteile,
beide als Tool-Ergebnis: Bild A (`eb4771a7…`) und die Webversion von B (`99d51d60…`).

In #7 kamen 1817 Token für die beiden Bilder und die übrigen neuen Nachrichtenteile hinzu. Der
Server weist keine Token je Bild aus. Eine Aufteilung auf Bild A und B ist aus dem Log daher
**nicht möglich**. Auszug: `log-excerpt-halogen.txt`.

## Auffälligkeiten

1. **Bild B war die verkleinerte Webversion** (675 × 900). Der Wertungsbereich der Aufgabe
   (y ab 950) liegt außerhalb eines 900 px hohen Bildes.
2. **Der eigene Agent war nicht aktiv.** Der Test lief im eingebauten Agent-Modus mit eingefügtem
   Agent-Text. Damit galt keine Werkzeugbeschränkung (73 Tool-Definitionen je Anfrage). Das Terminal
   wurde nicht benutzt.
3. Die Aufgabe nennt Image 0.6.3. Laut Startlog lief 0.9.1.
4. „Bilder 4“ im Proxy-Log ist ein Zählfehler des Proxys. Tatsächlich wurden 2 Bilder gesendet.
5. Das Modell nennt in der Ergebnisdatei 1176 × 1568 als Größe von `vision-foto.jpg`. Die Datei hat
   675 × 900.
6. Der Arbeitsordner war kein reiner Testordner, sondern enthielt ein anderes Projekt.
