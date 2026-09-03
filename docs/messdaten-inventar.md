# Messdaten-Inventar

Was an belastbaren Eigenmessungen vorliegt, wo es liegt, und was noch fehlt.
Stand 03.09.2026. Grundlage für `run.json` je Lauf (PLAN.md §5).

---

## Prüfstand A — GMKtec EVO-X2 · Ryzen AI Max+ 395 „Strix Halo"

| Komponente | Wert |
|---|---|
| APU | AMD Ryzen AI Max+ 395 (Strix Halo) |
| iGPU | AMD Radeon 8060S, **gfx1151**, Treiber `32.0.31021.5001` |
| Speicher | 128 GiB LPDDR5X-8533, 8 × 16 GiB Micron, 8 Kanäle |
| Bandbreite (theoretisch) | ~256 GB/s (256 Bit @ 8533 MT/s) |
| Windows sichtbar | 63,6 GiB · **BIOS-UMA-Reservierung 64,4 GiB** |
| Vulkan-Heap | 98.123 MiB gesamt / 93.217 MiB frei |
| Betriebssystem | Windows 11 Pro 10.0.26200 |
| Vulkan SDK | 1.4.350.0 (LunarG) · MSVC 19.44.35228.0 |

Quelle: `benchmarks_amd_halo/laguna_s21_strix_halo_results/…BENCHMARK.md` §2.1

### Gemessene Läufe

| Modell | Quant | Gewichte | Prefill | Decode ohne Spek. | Decode getunt | Akzeptanz |
|---|---|---:|---:|---:|---:|---:|
| **Laguna S 2.1** 118B-A8B | Q4_K_M | 70,01 GiB | **309,64** t/s (pp512) | 20,55 t/s | **27,90** t/s (DFlash `n_max 3`, 1,36×) | 0,53 |
| **Qwen3.5-122B-A10B** | UD-Q4_K_XL | 73,23 GiB | **245,71** t/s (pp512)<br>232,68 t/s (pp4096) | 20,52 t/s | **31,80** t/s (MTP `n_max 2`, 1,55×) | **0,866** |
| **Qwen3.8-Flash-Next** 177B/6B aktiv | UD-Q4_K_XL | — | 176,9 → 149,1 t/s | — | 22,14 → 7,70 t/s | — |
| **DeepSeek-V4-Flash-0731** | UD-IQ3_XXS | ~99 GB (4 Shards) | keine synthetische Messung | — | keine synthetische Messung | — |

### Agentenläufe — aus den llama.cpp-Serverlogs ausgewertet

**Das sind die belastbaren Zahlen für den Vergleich**, weil sie alle dieselbe Messart haben:
echte Arbeit über viele Aufgaben statt `pp512`/`tg128` im Labor. Ausgewertet mit
`scripts/parse_logs.py` über `prompt eval time` und `eval time`.

| Lauf | Hardware | Aufgabe | n | Decode Median | Spanne | Prefill Median (≥500 Tok) | erzeugte Tokens | Generierzeit |
|---|---|---|---:|---:|---|---:|---:|---:|
| Qwen3.8-27B UD-Q4_K_XL | R9700 | Moorhuhn | 108 | **34,36** t/s | 22,9–84,9 | 266,95 t/s | 336.107 | 162,1 min |
| Qwen3.8-27B UD-Q6 | R9700 | Clair Obscure | 35 | **26,43** t/s | 13,9–42,4 | 167,98 t/s | 119.627 | 88,8 min |
| Qwen3.8-Flash-Next UD-Q4_K_XL | AI MAX 395 | Clair Obscure | 106 | **10,98** t/s | 9,0–17,0 | 123,65 t/s | 238.371 | 337,8 min |
| DeepSeek-V4-Flash-0731 UD-IQ3_XXS | AI MAX 395 | Clair Obscure | 152 | **6,32** t/s | 2,8–10,8 | 17,59 t/s | 158.469 | 328,8 min |

Zusammen **852.574 erzeugte Tokens** und rund **15,3 Stunden** reine Generierzeit.

> **Korrektur vom 03.09.2026.** In einer früheren Fassung stand für DeepSeek-V4-Flash
> **35,73 t/s**. Dieser Wert stammt aus dem Kopf von `start-deepseek-v4-flash-0731-DSPARK.bat`
> und ist dort ausdrücklich als **fremder, veröffentlichter Strix-Halo-Lauf mit
> Greedy-Sampling** gekennzeichnet — keine Eigenmessung. Der echte Wert aus dem eigenen
> Agentenlauf liegt bei **6,32 t/s**, also 5,6-fach niedriger. Lehre daraus: Werte aus
> Skript-Kommentaren nie ohne Prüfung übernehmen; nur Logs und Messprotokolle zählen.

### Der Unterschied zwischen den Messarten

| Modell | synthetisch (tg128) | Agentenlauf | Verhältnis |
|---|---:|---:|---:|
| Qwen3.8-Flash-Next | 22,14 t/s (@512) | 10,98 t/s | **0,50×** |
| Qwen3.5-122B-A10B | 31,80 t/s | noch kein Lauf | — |
| Laguna S 2.1 | 27,90 t/s | noch kein Lauf | — |

Ein Laborwert ist rund **doppelt so hoch** wie das, was im Agentenbetrieb ankommt. Deshalb steht
die Messart auf der Seite in einer eigenen Spalte, und deshalb dürfen die beiden Arten nicht
gemeinsam sortiert werden, ohne das auszuweisen.

### Tiefenkurve Qwen3.8-Flash-Next (Build `580e88d`, ctx 262144, KV `q8_0`)

| Tiefe | Prefill t/s | Decode t/s | vs. 512 | kalte Füllzeit |
|---:|---:|---:|---:|---:|
| 512 | 176,9 | 22,14 | 100 % | 2,9 s |
| 1.024 | 185,2 | **22,50** | 102 % | 5,5 s |
| 2.048 | 222,7 | 21,99 | 99 % | 9,2 s |
| 4.096 | 244,9 | 21,66 | 98 % | 16,7 s |
| 16.384 | 242,2 | 19,04 | 86 % | 67,7 s |
| 32.768 | 217,8 | 16,65 | 75 % | 150,4 s |
| 65.536 | 186,9 | 12,25 | 55 % | 372,5 s |
| 131.072 | 157,6 | 8,84 | 40 % | 860,6 s |
| 163.840 | 149,1 | 7,70 | 35 % | 1132,5 s |

Tiefen ≤ 4.096 sind Mediane aus 3 Wiederholungen, tiefere Punkte Einzelläufe.
GPU-Spitze bei ctx 262144: **86,09 GiB**, Reserve 25,56 GiB — Speicher ist hier nie die Grenze,
sondern Zeit.

### Speicher

| Kontext | GPU-Spitze | Reserve (von 111,65 GiB) |
|---:|---:|---:|
| 65.536 | 80,52 GiB | 31,13 GiB |
| 262.144 | 86,09 GiB | 25,56 GiB |

---

## Prüfstand B — Radeon AI PRO R9700

| Komponente | Wert |
|---|---|
| GPU | AMD Radeon AI PRO R9700, **gfx1201** (RDNA4), 32.624 MiB, headless |
| Zweite GPU | NVIDIA RTX 5080 (treibt den Desktop) |
| CPU / RAM | Intel Core Ultra 7 265KF · 63,60 GiB |
| Mainboard | ASUS PRIME Z890-P WIFI, BIOS 2401 |
| Treiber | Adrenalin 26.6.4, Driver Store `32.0.31021.5001` |
| Vulkan-ICD | `amdvlk64.dll` 9.2.10.395, Manifest-API 1.4.349 |
| Betriebssystem | Windows 11 Pro 26200 |

Quelle: `qwen3.8-27b-rdna4-quant-eval/RESULTS.md`

### Produktionslauf Qwen3.8-27B UD-Q6, Build `bd9bd1b`

35 Aufgaben echte Agentenarbeit, 119.627 Tokens in 114,5 min.

| Größe | min | Median | max |
|---|---:|---:|---:|
| Decode | 13,93 | **26,43** t/s | 42,39 |
| Prefill (Prompts > 500 Tok) | 93,77 | 167,98 | 350,83 |
| Draft-Akzeptanz | 34,1 % | 55,3 % | 72,8 % |

### Prefill-Momentanrate (Task 0, 180.396 Tokens)

| Tiefe | 8 K | 16 K | 34 K | 67 K | 100 K | 132 K | 164 K |
|---|---:|---:|---:|---:|---:|---:|---:|
| t/s | **498,3** | 423,1 | 323,0 | 223,3 | 172,4 | 139,6 | **118,0** |

### Decode nach Kontexttiefe

| Kontext | n | Median | Spanne |
|---|---:|---:|---|
| 50–100 K | 31 | **26,78** t/s | 21,8–42,4 |
| > 150 K | 4 | **15,37** t/s | 13,9–18,0 |

---

## Befunde, die auf die Seite gehören

Diese drei sind eigenständige Erkenntnisse, keine bloßen Messwerte — und sie sind der Grund,
warum die Seite mehr wert ist als ein Leaderboard.

**1. Die vom Hersteller empfohlene Spekulationstiefe ist zweimal falsch.**
Laguna: die Modelcard nennt `--spec-draft-n-max 15`, das ist auf bandbreitenbegrenzter Hardware
ein **2,5-facher Einbruch** (8,1 statt 20,55 t/s). Mit `n_max 3` wird daraus ein 1,36-facher
Gewinn. Bei Qwen3.5 liegt Unsloths Beispielwert `6` immer noch 13 % unter dem Optimum (`2`).
Das Optimum ist scharf.

**2. Beide Sampling-Voreinstellungen von Unsloth sind für Thinking-Coding falsch.**
Das „precise coding"-Preset (`presence_penalty 0.0`) erzeugte **32.768 Tokens ohne je zu
terminieren** bei einer Aufgabe, die Laguna in 201 Tokens löst. Richtig ist eine Mischung, die
kein veröffentlichtes Preset anbietet: Coding-Temperatur 0,6 mit `presence_penalty 1.5`.

**3. Mehr VRAM-Reservierung bringt auf Unified-Memory nichts.**
Die UMA-Reservierung zu vergrößern hat den Durchsatz nicht verbessert und hätte das
Betriebssystem ausgehungert.

Dazu aus dem R9700-Projekt: **Rund vier Fünftel des Tiefeneinbruchs** gehen auf wegbrechende
Spekulation zurück, nicht auf Bandbreite oder Attention (Korrelation Decode ↔ mean len r = +0,804
gegen Draft-Akzeptanz r = +0,464).

---

## Startskripte

`E:\Coding\AMD Halo Sicherung\Model Inference\` — dreizehn `.bat`-Dateien, die faktisch schon
Run-Manifeste sind: Modellrevision mit SHA-256, Build-Commit, vollständige Startzeile,
Begründung jeder Abweichung, und die gemessenen Zahlen im Kopf.

| Datei | Modell | Port | Build |
|---|---|---|---|
| `start-qwen35-122b-A10B-MTP.bat` | Qwen3.5-122B-A10B UD-Q4_K_XL | 8098 | poolside-Fork `04b2b72` |
| `start-laguna-QUALITY-Q4XL.bat` | Laguna S 2.1 UD-Q4_K_XL (68,35 GiB) | — | — |
| `start-qwen38-flash-next.bat` | Qwen3.8-Flash-Next UD-Q4_K_XL | 8099 | `580e88d` |
| `start-deepseek-v4-flash-0731-DSPARK.bat` | DeepSeek-V4-Flash-0731 UD-IQ3_XXS | 8100 | `580e88d` |
| + neun weitere | Qwen3.6-27B, Qwen3.8-27B, Vision-Varianten | | |

Gemeinsame Flags der Halo-Läufe: `-ngl 999 -fa on -b 2048 -ub 512`, KV `q8_0`,
`--spec-type draft-mtp` bzw. `draft-dflash` mit getuntem `--spec-draft-n-max`.

---

## Was noch fehlt

| Lücke | Betrifft | Anmerkung |
|---|---|---|
| **Rubrik-Noten** | alle Läufe | Die Qualitätsachse ist noch ungefüllt. Laguna und Qwen3.5 haben je 5/5 auf einem Coding-Eval — andere Skala, nicht direkt übertragbar. |
| Wall-Clock je Aufgabe | Halo-Läufe | Die Clair-Obscure-Läufe haben `llama.cpp.log`, daraus extrahierbar. |
| Selbstkorrekturen | Halo-Läufe | Aus den Projektordnern zählbar. |
| Prefill DeepSeek V4 | Prüfstand A | offener Punkt |
| Energiemessung | beide | nirgends vorhanden |
| Treiber-/OS-Stand Halo aktuell | Prüfstand A | Messungen sind von Juli/August 2026 |

**Wichtig für die Vergleichbarkeit:** Die Halo-Zahlen stammen aus *synthetischen* Läufen
(`pp512`, `tg128`, Tiefensweeps), die R9700-Zahlen aus einem *echten Agentenlauf* über 35
Aufgaben. Das ist nicht dasselbe und darf auf der Seite nicht stillschweigend nebeneinander
stehen — entweder als getrennte Messarten kennzeichnen oder eine gemeinsame Messart nachholen.

## Nachtrag 03.09.2026 — Belegpflicht

Ab diesem Stand gilt: **keine Zahl ohne Rohdatei.** Alle Serverprotokolle und
Messtabellen liegen unter `logs/` im Repo, `scripts/verify_runs.py` rechnet jeden
veroeffentlichten Wert daraus nach.

Was sich dabei geaendert hat:

| Lauf | vorher | jetzt | Grund |
|---|---|---|---|
| Qwen3.8-Flash-Next · Moorhuhn | 23,84 t/s aus 42 Antworten | **21,82 t/s aus 98** | Die Sitzung lief weiter. Der alte Wert war ein Zwischenstand. |
| Qwen3.8-Flash-Next · Clair Obscure | nur als Vergleichszahl im Text | **eigener Lauf, 10,93 t/s aus 92** | Das Protokoll lag vor, war aber nicht als Lauf gefuehrt. |
| Qwen3.8-27B Q6 · Clair Obscure | 26,3 t/s, Beleg unauffindbar | **26,30 t/s aus der Messtabelle** | Quelle war eine CSV des Produktionslaufs, nicht das Serverprotokoll. |
| DeepSeek-V4-Flash | p10 5,0 / p90 9,75 | **4,85 / 9,89** | Perzentile jetzt einheitlich nach Rangplatz statt interpoliert. |
| Qwen3.6-27B · Clair Obscure | — | **bleibt ohne Geschwindigkeit** | Kein Protokoll erhalten. Das Artefakt gibt es, die Messung nicht. |

Zwei Regeln bestimmen jede Zahl: Antworten ab 200 Tokens (kuerzere erzeugen
Ausreisser bis 1 000 000 t/s), Perzentile nach Rangplatz ohne Interpolation.
