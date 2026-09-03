# Messwerte — Qwen3.8-27B auf Radeon AI PRO R9700

**Konsolidierte Datenbasis für den iX-Artikel.** Alle eigenen Messungen an
einer Stelle, mit vollständigen Bedingungen. Stand: 31.08.2026.

Regel für den Artikel: **Nur Zahlen aus diesem Dokument sind eigene Messwerte.**
Fremdmessungen stehen in [11-quellen.md](11-quellen.md) und sind dort als
solche gekennzeichnet. Gerechnete Größen stehen in
[03](03-kv-cache-modell.md) und [04](04-vram-budget.md) und sind keine
Messwerte.

---

## Testsystem

| Komponente | Wert |
|---|---|
| GPU | AMD Radeon AI PRO R9700, gfx1201 (RDNA4), 32.624 MiB, **headless** |
| Zweite GPU | NVIDIA GeForce RTX 5080 — treibt den Desktop |
| CPU | Intel Core Ultra 7 265KF |
| RAM | 63,60 GiB |
| Mainboard / BIOS | ASUS PRIME Z890-P WIFI, BIOS 2401 |
| AMD-Treiber | Adrenalin 26.6.4, Driver Store `32.0.31021.5001` |
| Vulkan-ICD | `amdvlk64.dll` 9.2.10.395, Manifest-API 1.4.349 |
| Betriebssystem | Windows 11 Pro 26200 |

**Ungeklärt und im Artikel nicht zu behaupten:** die effektive
PCIe-Upstream-Breite hinter dem Switch (Endpunkt meldet Gen5 x16), sowie der
ReBAR-Status (`pnputil` zeigt nur einen 256-MiB-BAR).

### Verwendete Builds

| Kürzel | Herkunft | Datum | Besonderheit |
|---|---|---|---|
| `bd9bd1b` | TheTom-Fork, Vulkan | 24.08.2026 | **turbo4-KV**, MTP; Produktivbuild |
| `b10516` | Upstream, Vulkan | 19.08.2026 | Commit `b95502ba` |
| `b10717` | Upstream, Vulkan | 31.08.2026 | Commit `a32af33d`, enthält PR #25494 |

---

## 1. Produktionslauf „Clair Obscure" — 35 Tasks, echte Agentenarbeit

Build `bd9bd1b`, UD-Q6_K_M, KV `q8_0`/`turbo4`, MTP2 **+ `ngram-mod` 24/48/64**,
Vision, Slot 262.144. 28.08.2026, 119.627 generierte Tokens in 114,5 min.
**[GEMESSEN-EIGEN]** — die belastbarste Reihe im Projekt, weil echte Last.

| Größe | min | Median | max |
|---|---:|---:|---:|
| Decode | 13,93 | **26,43** | 42,39 t/s |
| Prefill (Prompts > 500 Tok) | 93,77 | 167,98 | 350,83 t/s |
| Draft-Akzeptanz | 34,1 % | 55,3 % | 72,8 % |
| mean len | 2,04 | 2,84 | 5,56 |
| LCP-Similarity (n = 34) | 0,610 | 0,990 | — |

**9 von 35 Tasks (26 %) erreichten ≥ 30 t/s Decode. Bei über 150 K Kontext
kein einziger.**

### Decode nach Kontexttiefe

| Kontext | n | Decode Median | Spanne | mean len | Akzeptanz |
|---|---:|---:|---:|---:|---:|
| 50–100 K | 31 | **26,78 t/s** | 21,8–42,4 | 2,89 | 56,9 % |
| > 150 K | 4 | **15,37 t/s** | 13,9–18,0 | 2,09 | 50,3 % |

### Prefill-Momentanrate (Task 0, 180.396 Tokens)

| Tiefe | 8 K | 16 K | 34 K | 67 K | 100 K | 132 K | 164 K |
|---|---:|---:|---:|---:|---:|---:|---:|
| t/s | **498,3** | 423,1 | 323,0 | 223,3 | 172,4 | 139,6 | **118,0** |

Faktor **4,2** von 8 K auf 164 K. Der 180-K-Prompt brauchte **16,6 Minuten**.

### Spekulation: mean len schlägt Akzeptanz

| Korrelation mit dem Decode | Pearson r |
|---|---:|
| **mean len** | **+0,804** |
| Draft-Akzeptanz | +0,464 |

Mit `n-max 2` kann MTP allein höchstens mean len 3 erreichen — jeder Wert
darüber stammt von **`ngram-mod`**. Schnellster Task: mean len 5,56 bei
42,39 t/s. Langsamster: mean len 2,13 bei 13,93 t/s.

**Zerlegung des Tiefeneinbruchs:** Decode fällt um Faktor 1,74, mean len um
1,38. Rund vier Fünftel des Einbruchs gehen damit auf die wegbrechende
Spekulation zurück, nicht auf Bandbreite oder Attention.

Details: [results/20260828-produktionslauf-clair-obscure.md](results/20260828-produktionslauf-clair-obscure.md),
CSV: `results/20260828-clair-obscure-produktionslauf.csv`

---

## 2. Serverbetrieb — Einzelmessungen 24.08.

Build `bd9bd1b`, Modell **UD-Q6_K_M**, KV `q8_0`/`turbo4`, Vision geladen,
`--parallel 1`, Thinking-Preset. Gemessen 24.08.2026 aus den Server-Timings.
**[GEMESSEN-EIGEN]**

| Slot | `-ub` | Checkpoints | MTP | belegte Tokens | pp t/s | tg t/s | MTP-Akzeptanz |
|---:|---:|---:|---|---:|---:|---:|---:|
| 212.992 | 256 | 4 | n-max 2 | 199.935 | 189,20 | **18,86** | 85/122 = 69,7 % |
| 212.992 | 256 | 4 | n-max 5 | 199.935 | 187,60 | 13,17 | 183/359 = 51,0 % |
| 262.144 | 128 | 0 | n-max 2 | 39.879 | 366,52 | **32,88** | 296/428 = 69,2 % |
| 262.144 | 128 | 0 | n-max 2 | 3.164 (Bild) | 155,58 | 41,57 | 74/105 = 70,5 % |
| 262.144 | 128 | 0 | n-max 2 | kurz | — | 49,91 | — |

**MTP n-max 5 war rund 30 % langsamer als n-max 2** bei nahezu identischem
Prompt und brauchte 897,75 statt 448,88 MiB für den Draft-Zustand. n-max 4
wurde wegen des RAM-Zustands nicht getestet.

### Q4-Referenz im Serverbetrieb

Build `b10516`, Modell **Q4_0** (16,06 GB), MTP2, Medium Reasoning.
**[GEMESSEN-EIGEN]**

| KV | belegte Tokens | pp t/s | tg t/s |
|---|---:|---:|---:|
| `q4_0`/`q4_0` | gering | — | 51,92 / 51,99 / 54,17 → **52,69** |
| `q8_0`/`q8_0` | gering (Slot 262.144) | — | 51,42 |
| — | 126.172 | **396,6** | **35,99** |

---

## 3. llama-bench — ohne MTP, ohne Vision

Build **b10717**, KV `q8_0`/`q8_0`, `-b 2048 -ub 128`, `-fa 1`,
`-p 0 -n 64 -r 1 --no-warmup`. Gemessen 31.08.2026. **[GEMESSEN-EIGEN]**

| Tiefe | UD-Q6_K_M (23,08 GB) | UD-Q4_K_XL (17,55 GB) | Q4 schneller |
|---:|---:|---:|---:|
| 0 | 15,62 ⚠️ | 21,24 ⚠️ | — |
| **32.768** | **21,86** | **25,78** | **+17,9 %** |
| **131.072** | **18,73** | **21,80** | **+16,4 %** |

⚠️ **Beide Werte bei Tiefe 0 sind unbrauchbar** — sie liegen unter dem Wert
bei 32.768. Ursache: `--no-warmup` lässt den ersten Messpunkt die
Shader-Kompilierung zahlen. Für künftige Läufe: Warmup nicht abschalten.

### Ableitungen

| Größe | UD-Q6_K_M | UD-Q4_K_XL |
|---|---:|---:|
| Abfall 32.768 → 131.072 | −14,3 % | −15,4 % |
| erreichter Anteil am Bandbreitenmodell @32.768 | — | 91 % |
| erreichter Anteil am Bandbreitenmodell @131.072 | — | 93 % |

Der Tiefenabfall ist **quantunabhängig**. UD-Q4_K_XL bleibt durchgängig 7 bis
9 % unter dem, was seine Dateigröße verspricht.

Details: [results/20260831-decode-tiefe-q6-vs-q4.md](results/20260831-decode-tiefe-q6-vs-q4.md)

---

## 4. Parameter-A/B bei kurzen Prompts

Build `bd9bd1b`, UD-Q6_K_M, Slot 262.144 reserviert, tatsächlich 112–118
Prompt-Tokens, Vision geladen, KV `q8_0`/`turbo4`, MTP2, zwei feste
Coding-Prompts à 512 Ausgabetoken. 24.08.2026. **[GEMESSEN-EIGEN]**

| Variante | Mittel pp | Mittel tg | MTP | Dedicated / Shared |
|---|---:|---:|---:|---|
| `rm_kq=2`, `-ub 128` | 160,39 | 34,61 | 49,0 % | 30,666 / 0,270 GiB |
| `rm_kq=2`, `-ub 128` (Kontrolle) | 163,58 | 34,70 | 49,0 % | 30,666 / 0,271 GiB |
| `rm_kq=2`, `-ub 64` (1. Lauf) | 119,71 | 35,65 | 52,5 % | 30,617 / 0,211 GiB |
| `rm_kq=2`, `-ub 64` (Wdh.) | 145,66 | 35,60 | 52,5 % | 30,617 / 0,211 GiB |
| `rm_kq=2`, `-ub 256` | 152,60 | 34,62 | 49,0 % | 30,840 / 0,400 GiB |
| `rm_kq=1`, `-ub 128` | 150,21 | 33,06 | 49,0 % | 30,665 / 0,270 GiB |

**Wichtige Einschränkung:** Bei 118-Token-Prompts ist der pp-Wert von
Startaufwand dominiert. Diese Reihe sagt **nichts** über `-ub` beim Prefill
langer Prompts aus — genau dort wirkt der Parameter.

Belastbar daraus: `rm_kq=1` ist auf dieser Karte unter dem Windows-AMD-ICD
schlechter (Decode −4,5 %, Prefill −6,3 %). Der `ub 64`-Decodevorteil ist ein
Artefakt geänderter MTP-Akzeptanz (45,7 → 51,9 %), kein Kernelgewinn.

Details: [results/20260824-rmkq-ubatch-short-ab.md](results/20260824-rmkq-ubatch-short-ab.md)

---

## 5. Speicher- und Ladeverhalten

Build `bd9bd1b`, Vision, MTP2, `q8_0`/`turbo4`. 24.08.2026.
**[GEMESSEN-EIGEN]**

| Gewichte / Kontext / Parameter | Ergebnis | Bewertung |
|---|---|---|
| Q6_K_XL, 229.376, 4 CP | 31,06 GiB Dedicated + 2,07 GiB Shared | disqualifiziert |
| Q6_K_M, 262.144, vor `-ub 128`/`--load-mode none` | Commit 32,02 GiB | Ladeabbruch |
| Q6_K_M, 229.376, `-ub 256` | Commit 31,37 GiB | zu knapp |
| Q6_K_M, 212.992, `-ub 256` | 31,04–31,09 GiB Dedicated | resident, kaum Reserve |
| **Q6_K_M, 262.144, `-ub 128`, `--load-mode none`** | nach 40K: 30,665 GiB Dedicated, 0,29 GiB Shared | **aktueller Produktivpfad** |

**Leerlaufbudget:** `llama-bench --list-devices` meldet 32.624 MiB gesamt und
**31.757 MiB frei** (31,01 GiB) bei headless betriebener Karte. Das ist eine
Leerlaufangabe, **keine Laufzeitmessung** — dieser Punkt wurde in einer
früheren Fassung falsch verwendet.

**RAM-Nebenwirkung:** Beim 200K-Test mit Standard-Mapping lagen Working Set
bei ~50,9 GiB, nur 0,79 GiB RAM frei. Mit `--load-mode none` beim 40K-Lauf:
21,241 GiB Working Set, 32,597 GiB Private Bytes, 31,646 GiB RAM frei.

---

## 6. Übertragene Befunde — anderes Modell, gleiche Architektur

Qwen3.6-27B ist byte-identisch in allen KV-relevanten GGUF-Schlüsseln
(siehe [02](02-modellarchitektur.md)). Diese Werte sind **eigene Messungen an
Qwen3.6**, im Artikel entsprechend zu kennzeichnen. **[GEMESSEN-EIGEN]**

| Befund | Wert | Datum |
|---|---|---|
| Vulkan gegen HIP bei 124K Tiefe | 394 / 23 gegen 375 / 19 t/s (pp/tg) | 13.07.2026 |
| f16-KV gegen q8_0-KV im Decode bei Tiefe | f16 **18–26 % schneller** | 13.07.2026 |
| MTP n-max 2 gegen ohne MTP | 32,8 → 57,6 t/s (**+76 %**) | 23.07.2026 |
| `-ub 2048` statt 512 → Spill 2,62 GiB | Prefill 480 → 64 t/s (**Faktor 7,5**) | 23.07.2026 |
| Context-Checkpoints | **~7,5 KB je Token Tiefe je Stück** | 25.07.2026 |
| 4 CP bei 146K Tiefe → 3,9 GiB Spill | Decode 33 → 11, Prefill 460 → 71 t/s | 25.07.2026 |
| `GGML_VK_ALLOW_GRAPHICS_QUEUE=1` bei Dense | **−8 % Decode** | 07/2026 |

Aus der Gemma-4-31B-Reihe (**andere Architektur**, nur als Größenordnung für
die KV-Qualität): KL-Divergenz gegen f16/f16, `-c 512`, 09.06.2026 —
`q8_0`/`q8_0` Median 0,0147 bei 87,2 % Same-top-p; `q8_0`/`turbo4` 0,0996 bei
76,5 %; `turbo4`/`turbo4` 0,1338 bei 74,3 %.

---

## 7. Was ausdrücklich nicht gemessen ist

Diese Punkte dürfen im Artikel nicht als Ergebnis erscheinen:

1. **Der MTP-Faktor.** Der Produktionslauf zeigt, dass die früher
   geschätzten 1,6 bei großem Kontext zu hoch sind: Der spekulationsfreie
   llama-bench-Wert bei 131 K (18,73) liegt zwischen den beiden
   Produktionsbändern. Realistisch sind bei großem Kontext eher 1,1–1,3, bei
   kurzem Kontext mit greifendem `ngram-mod` 1,6 und mehr. Ein sauberes A/B
   mit und ohne Spekulation fehlt.
2. **Voller 262K-Decode.** Der tiefste belegte Prompt war 199.935 Tokens, und
   zwar auf einem 212.992er Slot mit `-ub 256`. Das aktuelle
   `-ub 128`-Profil wurde nie bei 250K+ belegt getestet.
3. **Build gegen KV-Typ.** Der Vorsprung von b10717 + `q8_0/q8_0` gegenüber
   der Produktion ist nicht in Build- und KV-Anteil zerlegt.
4. **Prefill über die Tiefe auf b10717.** Nur Decode gemessen.
5. **Ob die 7–9 % Rückstand von UD-Q4_K_XL an den I-Quants liegen.** Dafür
   fehlt ein Arm mit reinem Q4-Typ.
6. **PCIe-Upstream-Breite und ReBAR-Status.** Beides nur beobachtet, nicht
   verifiziert.
7. **Qualität.** Sämtliche Zahlen hier sind Durchsatz. Es gibt keine eigene
   Qualitätsmessung an Qwen3.8 — weder KLD noch Tool-Call-Erfolgsquote.

---

## 8. Rohdaten

| Datei | Inhalt |
|---|---|
| `results/20260828-produktionslauf-clair-obscure.md` | Produktionslauf 35 Tasks, Auswertung |
| `results/20260828-clair-obscure-produktionslauf.csv` | je Task: Prefill, Decode, MTP, Graphen |
| `scripts/parse_server_log.py` | Parser für `-lv 3`-Serverlogs, wiederverwendbar |
| `results/20260824-q6-256k-vulkan-turboquant.md` | Serverprotokoll 24.08. inkl. SHA-256 der Binaries |
| `results/20260824-rmkq-ubatch-short-ab.md` | Parameter-A/B mit sechs JSON-Rohdateien |
| `results/20260831-decode-tiefe-q6-vs-q4.md` | Tiefensweep 31.08. |
| `results/20260831-*-decode-depth-lauf1.csv` | llama-bench-CSV, maschinenlesbar |
| `data/tensortyp-verteilung.txt` | Tensorhistogramme aller UD-Dateien |
| `data/kv_budget_output.txt` | Ausgabe des Budgetmodells |
