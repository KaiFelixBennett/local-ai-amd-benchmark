# Prüfbericht Bilderkennungstest EVO-X2: llama-cpp

| | |
|---|---|
| Slug | `qwen38-flash-next-llama-cpp` |
| System | Linux (Omarchy/Arch, Kernel 7.2.3-arch1-3), VS Code 1.136.1 |
| Testdatum | 18.09.2026, Anfragen laut Serverlog 10:06:09 bis 10:30:24 |
| Endpunkt | `customendpoint/Lokal evox2/Qwen3.8-Flash-Next-UD-Q4_K_XL` = llama-server `127.0.0.1:8096` |

**Hinweis zur Zuordnung:** Die Aufgabe ordnet diesen Test Windows zu. Er lief aber auf diesem
Linux-System. Linux ist seit dem 15.09.2026 20:50 ohne Neustart in Betrieb, die Sitzung liegt im
Linux-VS-Code, und die Anfragen stehen im Log des Linux-Servers auf Port 8096.

## 1. Chat-Sitzung und Arbeitsordner

- Sitzung: `~/.config/Code/User/workspaceStorage/124286191e01382022b1f5fad4452844/chatSessions/0620129f-a3b0-4a2c-8393-d35d3a9a281b.jsonl`, angelegt 09:46:39
- Anfrage 1 um 10:06:08, nach 16 s ohne Antwort beendet. Anfrage 2 um 10:07:48, Dauer 1356 s. Die Nachricht lautete beide Male „Qwen3.8-Flash-Next llama.cpp“.
- Modus: eigener Agent `bilderkennung` aus `.github/agents/bilderkennung.agent.md`
- Arbeitsordner laut `workspace.json`: `/srv/securesight.ai/securesight.ai/model-benchmark/qwen38_flash_next_bilderkennung`
- Weitere Sitzungen mit diesem Slug: keine

## 2. Arbeitsordner

| Datei | Bytes |
|---|--:|
| `.github/agents/bilderkennung.agent.md` | 6711 |
| `harness/bilder/vision-dashboard.jpg` | 70852 |
| `harness/bilder/vision-foto.jpg` | 217963 |
| `harness/ergebnisse/qwen38-flash-next-llama-cpp-vision.json` | 15226 |

- Dateien mit `loesung` im Namen: keine
- Antworten anderer Modelle: keine, nur die eigene Ergebnisdatei

## 3. Testdateien

| Datei | SHA-256 | Bytes | Pixel | Entspricht |
|---|---|--:|---|---|
| `vision-dashboard.jpg` | `eb4771a7…fdada494` | 70852 | 900 × 787 | Bild A (Referenz) |
| `vision-foto.jpg` | `99d51d60…ec5c2ec5` | 217963 | 675 × 900 | **Webversion von Bild B, nicht die Referenz** |
| `bilderkennung.agent.md` | `178d07b9…9518a1` | 6711 | – | **nein** |

Die Agent-Datei ist die Referenz mit LF statt CRLF und mit einer zusätzlichen ersten Zeile
vor dem YAML-Frontmatter. Diese Zeile ist das Ende der letzten Zeile
(` nicht verfügbar" vermerkt, nicht als Fehlversuch.`). Angelegt wurde die Datei am 18.09. um
09:45:54, geändert um 09:46:19, also vor dem Test.

## 4. Chat-Sitzung: Werkzeugaufrufe

Pfade relativ zum Arbeitsordner, in zeitlicher Reihenfolge:

| Nr. | Werkzeug | Ziel oder Befehl |
|--:|---|---|
| 1 | `run_in_terminal` | `pwd && ls -la && find . -iname "*.jpg" -o -iname "*.png" 2>/dev/null \| head -50` |
| 2 | `run_in_terminal` | `ls -la harness/ harness/bilder/ 2>/dev/null; ls -la harness/ergebnisse/ 2>/dev/null \|\| echo "KEIN ergebnisse-Ordner"` |
| 3 | `memory` (create) | `/memories/session/bilderkennung.md` |
| 4 | `view_image` | `harness/bilder/vision-dashboard.jpg` |
| 5 | `view_image` | `harness/bilder/vision-foto.jpg` |
| 6 | `create_file` | `harness/ergebnisse/qwen38-flash-next-llama-cpp-vision.json` |
| 7 | `read_file` | eigene Ergebnisdatei, Zeilen 1–40 |
| 8 | `memory` (create) | `/memories/repo/bilderkennung-harness.md` |
| 9 | `run_in_terminal` | `ls -la harness/ergebnisse/ && python3 -c "…json.load(open('harness/ergebnisse/qwen38-flash-next-llama-cpp-vision.json'))…"` (JSON-Prüfung) |
| 10 | `read_file` | eigene Ergebnisdatei, Zeilen 55–80 |
| 11 | `replace_string_in_file` | eigene Ergebnisdatei |
| 12 | `run_in_terminal` | `python3 -c "…json.load(open('harness/ergebnisse/qwen38-flash-next-llama-cpp-vision.json'))…"` (erneute JSON-Prüfung) |
| 13 | `memory` (str_replace) | `/memories/session/bilderkennung.md` |

- **Andere Dateien gelesen:** nein. Dazu kamen nur Verzeichnislisten per Terminal, die eigene Ergebnisdatei und die eigenen Memory-Notizen.
- **`loesung` im Verlauf:** nein. Es gibt nur das Wort „Lösungsschlüssel“ im Agent-Text und „Auflösung“ im Modelltext.
- **Antworten anderer Modelle im Verlauf:** nein.
- **Bildgröße laut Modell (Denkverlauf):** „I'm noticing the image dimensions don't match the task description—the photo appears to be 784x1045 rather than the stated 1176x1568.“ Die Datei hat 675 × 900.

## 5. Server-Belege

- **Build:** `version: 0.3.0-dev (build 50, commit d1a9235)`, llama.cpp PR #28243, Vulkan
- **mmproj:** `mmproj-F16.gguf` (Unsloth, F16, 904004000 Bytes)
- **`--image-min-tokens` / `--image-max-tokens`:** nicht gesetzt. Beim Start warnt der Server: „Qwen-VL models require at minimum 1024 image tokens to function correctly on grounding tasks … try adding --image-min-tokens 1024“
- **Kontext:** `--ctx-size 262144`, dazu MTP (`--spec-type draft-mtp`) und Reasoning xhigh
- **Startzeile (Pfade gekürzt):**

```
llama-server -m …/UD-Q4_K_XL/Qwen3.8-Flash-Next-UD-Q4_K_XL-00001-of-00004.gguf
  -md …/MTP/mtp-Qwen3.8-Flash-Next-shared-Q8_0.gguf --spec-type draft-mtp --spec-draft-n-max 2
  --mmproj …/mmproj-F16.gguf --alias Qwen3.8-Flash-Next-UD-Q4_K_XL --host 127.0.0.1 --port 8096
  --device Vulkan0 --gpu-layers all --n-cpu-moe 0 --fit off -fa on --load-mode mmap --lazy-mode on
  --ctx-size 262144 --parallel 1 --kv-unified -ctk q8_0 -ctv q8_0 -b 2048 -ub 512
  --ctx-checkpoints 4 --checkpoint-min-step 4096 --jinja --reasoning on --reasoning-format deepseek
  --reasoning-effort xhigh --reasoning-budget -1 --no-reasoning-preserve
  --temp 1.0 --top-p 0.95 --top-k 20 --min-p 0.0 --presence-penalty 0.0 --repeat-penalty 1.0
```

### Bild-Token

Nur eine der 14 Testanfragen enthielt Bilder: Task 861, Start 10:14:31, direkt nach den beiden
`view_image`-Aufrufen. Ihre Werte laut Log: `prompt eval time = 11262.07 ms / 1854 tokens` und
`stop processing: n_tokens = 50959`. Die M-RoPE-Warnungen `find_slot: non-consecutive token position`
markieren zwei Bildblöcke:

| Bild | Block im Log | Token | Raster à 32 px | passt zu |
|---|---|--:|---|---|
| A | ab Position 33783: 512 + 188 | **700** | 28 × 25 | 900 × 787 |
| B | ab Position 34012: 512 + 76 | **588** | 21 × 28 | 675 × 900 (Webversion) |

Auszug: `log-excerpt-llama-cpp.txt`.

## Auffälligkeiten

1. **Bild B war die verkleinerte Webversion** (675 × 900). Die Token-Zahl des Servers (588 = 21 × 28)
   bestätigt, dass das Modell genau dieses Bild bekam. Der Wertungsbereich der Aufgabe (y ab 950)
   liegt außerhalb eines 900 px hohen Bildes.
2. **Die Werkzeugbeschränkung war nicht wirksam.** Wegen der zusätzlichen ersten Zeile hat VS Code
   das Frontmatter nicht ausgewertet. Die ganze Datei ging samt YAML-Kopf (`tools: [...]`) als
   Anweisungstext an das Modell (6612 Zeichen). Zum Vergleich: Im Wiederholungslauf mit der
   Referenzdatei (Halogen, 18.09.) beginnt der Anweisungstext erst nach dem Frontmatter, und der
   Proxy zählt 20 statt 73 Tool-Definitionen. Das Modell nutzte hier viermal `run_in_terminal`,
   ein Werkzeug, das die Agent-Datei nicht vorsieht. Verwendet wurde es für Verzeichnislisten und
   zur JSON-Prüfung der eigenen Ergebnisdatei; die Bilder wurden damit nicht bearbeitet.
3. **Bleibende Memory-Notiz:** Das Modell legte drei Memory-Notizen an bzw. änderte sie, außerhalb der
   einen erlaubten Ergebnisdatei. Die Notiz `/memories/repo/bilderkennung-harness.md` bleibt für diesen
   Arbeitsordner bestehen und enthält eigene Antwortwerte des Modells. Ein späterer Lauf im selben
   Ordner könnte sie lesen.
4. Der erste Terminal-Aufruf (`find`) zeigte beide Bilder in der Sitzung als Anhang des
   Tool-Ergebnisses. Laut Serverlog erreichten diese das Modell nicht als Bildblöcke.
5. Die Aufgabe nennt Windows als System. Der Test lief jedoch auf diesem Linux-System.
6. Das Modell schätzt Bild B auf 784 × 1045 und schreibt in der Ergebnisdatei „im 1176×1568-Bild“.
   Tatsächlich hat die Datei 675 × 900.
7. Beide Bilder lagen unter den 1024 Bild-Token, die der Server als Minimum für Grounding nennt.
8. Die erste Anfrage (10:06:08) endete nach 16 s ohne Antwort und wurde um 10:07:48 wiederholt.
