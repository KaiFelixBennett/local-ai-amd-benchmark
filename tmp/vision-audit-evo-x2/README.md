# Temporäre Prüfdaten: Bilderkennungstests auf dem EVO-X2

Wird nach der Auswertung gelöscht. Auftrag: [`PROMPT.md`](PROMPT.md).

## Berichte

| Datei | Lauf |
|---|---|
| `report-llama-cpp.md` / `.json`, `log-excerpt-llama-cpp.txt` | llama.cpp, 18.09.2026 vormittags, Slug `qwen38-flash-next-llama-cpp` |
| `report-halogen.md` / `.json`, `log-excerpt-halogen.txt` | Halogen, 17.09.2026, Slug `qwen38-flash-next-halogen` |
| `report-halogen-r2.md` / `.json`, `log-excerpt-halogen-r2.txt` | Halogen-Wiederholung mit den Originalbildern, 18.09.2026, Slug `qwen38-flash-next-halogen-r2` |

Die Antwort des Wiederholungslaufs liegt unter
[`evidence/vision/qwen38-flash-next-halogen-r2-vision.json`](../../evidence/vision/qwen38-flash-next-halogen-r2-vision.json).
Sie ist noch nicht bewertet.

## Chatverläufe (`chats/`)

Aus den VS-Code-Sitzungen exportiert, mit Nachrichten, Denkschritten, Werkzeugaufrufen samt Argumenten und
Ergebnissen. Bilddaten sind durch Größe und SHA-256 ersetzt.

| Datei | Sitzung |
|---|---|
| `chat-llama-cpp-2026-09-18.md` | `0620129f-…`: der llama.cpp-Lauf mit der defekten Agent-Datei (Terminal benutzt) |
| `chat-halogen-2026-09-17.md` | `6e2ee919-…`: der Halogen-Lauf im eingebauten Agent-Modus |
| `chat-halogen-r2-2026-09-18.md` | `d9e7bddd-…`: die Wiederholung, eigener Agent, Originalbilder |
| `chat-halogen-verbindungstest-2026-09-17.md` | `9692e61d-…`: nur der Verbindungstest vor dem Lauf vom 17.09. |

## Serverlogs (`logs/`)

Vollständige Logs, nicht bereinigt. Sie liegen bewusst nicht unter `evidence/logs/`, denn
`scripts/parse_logs.py` liest dort jede Datei und prüft sie gegen `SHA256SUMS`.

| Datei | Inhalt |
|---|---|
| `llama-cpp-2026-09-18.log` | `llama-server` :8096, Start 09:59:55 bis Ende 11:34. 18 Anfragen: zuerst 4 Prüfanfragen beim Einrichten (Tasks 0, 79, 153, 187, 10:01 bis 10:04, davon 2 mit einem synthetischen Testbild), dann die 14 Testanfragen (Tasks 208 bis 8819, 10:06 bis 10:30). |
| `halogen-2026-09-17.log` | Proxy und Halogen ab 17.09. 08:50:14, 445 Anfragen bis 18.09. 01:22. Zum Test gehören #3 bis #9 (08:54 bis 09:10), der Rest ist andere Nutzung. |
| `halogen-2026-09-18_11-34.log` | Halogen ab 11:34:02 bis 13:53:47, 29 Anfragen. Ab 12:34 lief daneben ein zweiter Modellserver (aria-ministral3-14b). #42 (ab 13:41:37) ist die erste, hängende Anfrage des Wiederholungslaufs. |
| `halogen-2026-09-18_13-55.log` | Neustart um 13:55:10. Die KV-Reservierung hing wegen fragmentierten Speichers, deshalb abgebrochen. |
| `halogen-r2-2026-09-18_14-03.log` | Neustart um 14:03:06, der Wiederholungslauf #3 bis #6 (14:05:59 bis 14:20:26). |

## Archiv (`archiv/`)

Vor dem Wiederholungstest aus dem llama.cpp-Arbeitsordner entfernt:

- `qwen38-flash-next-llama-cpp-vision.json`: die Antwort des llama.cpp-Laufs vom 18.09. vormittags (Webversion von Bild B)
- `bilderkennung.agent.md.defekt-178d07b9`: die Agent-Datei mit der zusätzlichen ersten Zeile vor dem Frontmatter
- `memory-repo-bilderkennung-harness.md`: die Memory-Notiz, die der llama.cpp-Lauf im Workspace hinterlassen hat, mit seinen eigenen Antwortwerten

Home-Pfade sind überall durch `~` ersetzt. Die Lösungsschlüssel sind nicht enthalten.
