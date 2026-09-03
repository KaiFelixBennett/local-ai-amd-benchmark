# M4 — Tiefenkurve und der Effekt von PR #27977

> **Nachtrag 01.09.2026:** Die Einschränkung „kein spekulatives Decoding“ galt
> für diese Messreihe vom 31.08. Ein separater kombinierter Build nutzt nun MTP
> und erreicht 202,22 t/s Prefill bei 30.903 Tokens. Siehe
> [`17_ERGEBNISSE_MTP_FAST_PREFILL_20260901.md`](17_ERGEBNISSE_MTP_FAST_PREFILL_20260901.md).

**Eigene Messungen**, 31.08.2026, alles **[G]**.

Prüfstand: GMKtec EVO-X2, Ryzen AI Max+ 395 (gfx1151), 128 GiB LPDDR5X,
BIOS-Aufteilung **64 GiB GPU / 64 GiB System**, Windows 11 Pro 26200,
Treiber 32.0.31041.1004, Vulkan.
Modell: `unsloth/Qwen3.8-Flash-Next-GGUF` **UD-Q4_K_XL**, Revision `c8b5954a`,
SHA-256 lokal verifiziert.
Konfiguration: `--load-mode mmap --lazy-mode on --fit off --gpu-layers all
--parallel 1 --flash-attn on -b 2048 -ub 512`, KV **q8_0**,
`n_predict 256`, `ignore_eos`, `cache_prompt=false`, Temperatur 0.

---

## 1. Die beiden Builds

| Schlüssel | Commit | Datum | Inhalt |
|---|---|---|---|
| **Basis** | `580e88d` (build 629) | 31.08. | master-Tip, **mit** `daef7b6` (Vulkan-`top_k`-Radix) und `2cdae80` (mat-vec-Tuning Strix Halo) |
| **PR** | `72c0bff` (build 636) | 31.08. | **Basis + [PR #27977](https://github.com/ggml-org/llama.cpp/pull/27977)** |

> **Methodisch wichtig:** Der PR wurde **auf unseren master gemergt**, nicht
> eigenständig gebaut. Seine eigene Basis (`3173a56`, 29.08.) enthält die beiden
> Vulkan-Fixes vom 31.08. **nicht** — ein Standalone-Build wäre aus einem
> völlig unabhängigen Grund langsamer gewesen. Der einzige Merge-Konflikt war
> ein Kommentar in `llama-kv-cells.h`. Die Builds unterscheiden sich damit in
> genau vier Dateien und 250 Zeilen.

Was PR #27977 ändert (laut PR-Text): Frühabbruch bei der n-Gramm-Vorgängersuche
statt vollständigem Cache-Scan; gezieltes Einsammeln der selektierten Zellen
statt Maskierung des ganzen Fensters; Strided Views statt Transposition im
Indexer; Bitmap statt `std::set` für die belegten Zellen.

---

## 2. Gegenüberstellung

### Decode (Token-Generierung), t/s

| Tiefe | Basis `580e88d` | PR `72c0bff` | Differenz | Basis vs. 512 | PR vs. 512 |
|---:|---:|---:|---:|---:|---:|
| 512 | 22,14 | – | – | 100 % | – |
| 1.024 | 22,50 | – | – | 102 % | – |
| 2.048 | 21,99 | – | – | 99 % | – |
| 4.096 | 21,66 | **22,22** | **+2,6 %** | 98 % | 100 % |
| 16.384 | 19,04 | **19,34** | **+1,6 %** | 86 % | 87 % |
| 32.768 | 16,65 | **18,16** | **+9,1 %** | 75 % | 82 % |
| 65.536 | 12,25 | **13,80** | **+12,7 %** | 55 % | 62 % |
| 131.072 | 8,84 | **10,50** | **+18,8 %** | 40 % | 47 % |
| 163.840 | 7,70 | **9,21** | **+19,6 %** | 35 % | 42 % |

### Prefill (Prompt-Verarbeitung), t/s

| Tiefe | Basis `580e88d` | PR `72c0bff` | Differenz |
|---:|---:|---:|---:|
| 512 | 176,9 | – | – |
| 1.024 | 185,2 | – | – |
| 2.048 | 222,7 | – | – |
| 4.096 | 244,9 | **253,6** | **+3,6 %** |
| 16.384 | 242,2 | **252,4** | **+4,2 %** |
| 32.768 | 217,8 | **250,7** | **+15,1 %** |
| 65.536 | 186,9 | **214,1** | **+14,6 %** |
| 131.072 | 157,6 | **182,6** | **+15,8 %** |
| 163.840 | 149,1 | **157,5** | **+5,7 %** |

### Kalte Füllzeit (Basis), Sekunden bis zum ersten Token

| Tiefe | Füllzeit |
|---:|---:|
| 4.096 | 16,7 s |
| 16.384 | 67,7 s |
| 32.768 | 150,4 s |
| 65.536 | 372,5 s |
| 131.072 | 860,6 s (14,3 min) |
| 163.840 | 1132,5 s (18,9 min) |

---

## 3. Befunde

### 3.1 Kein Einbruch bei 1024 Token — der Vulkan-Pfad ist gesund

Issue #27856 meldet auf **HIP/gfx1151** eine Klippe bei ~1K Kontext: Decode
fällt von ~19 auf 6,10 t/s, also Faktor 3,5–4. Ursache laut Melder ist ein
Rückfall der `ggml_top_k`-Kette auf unoptimierte Pfade, passend zum
`indexer_budget` von 2048.

**Unter Vulkan tritt das nicht auf.** Der Wert bei 1024 (22,50 t/s) ist der
**höchste der gesamten Reihe**. Das ist ein eigenständiger Befund: Auf
derselben Hardware verhält sich der Vulkan-Pfad an dieser Stelle korrekt, der
HIP-Pfad nicht.

### 3.2 Der Tiefenabfall ist überwiegend algorithmisch, nicht bandbreitenbedingt

Der Decode-Gewinn des PR **wächst monoton mit der Tiefe**:

```
  4.096  +2,6 %
 16.384  +1,6 %
 32.768  +9,1 %
 65.536  +12,7 %
131.072  +18,8 %
163.840  +19,6 %
```

Eine reine Bandbreitengrenze wäre von der Kontexttiefe unabhängig. Dass eine
Änderung an vier Quelldateien — ohne jede Änderung an Quantisierung, Modell
oder Treiber — bei 164K fast ein Fünftel mehr Durchsatz bringt, belegt: **Ein
erheblicher Teil des Abfalls ist unoptimierter Code.** Das ist die für den
Artikel wichtigste Einzelaussage.

### 3.3 Der Prefill-Gewinn hat sein Maximum in der Mitte

+15,1 % bei 32K und +14,6 % bei 65K, aber nur +5,7 % bei 164K. Plausible
Deutung: Bei sehr großer Tiefe dominieren wieder Kosten, die der PR nicht
adressiert. Bestätigt durch den Verlauf **innerhalb** einer Anfrage — bei
Tiefe 163.840 sinkt die Rate kontinuierlich:

| n_tokens | Basis | PR |
|---:|---:|---:|
| 141.312 | – | 163,1 t/s |
| 143.360 | – | 162,7 t/s |
| 145.408 | **155,3 t/s** | **162,2 t/s** |
| 147.456 | 154,7 t/s | – |
| 149.504 | 154,1 t/s | – |

Beim identischen Fortschrittspunkt (145.408 Token) ist der PR-Build **39,6 s
voraus**.

### 3.4 Korrektheit bleibt erhalten

M0 wurde auf **beiden** Builds und bei `ctx 65536` wie `ctx 262144` vollständig
bestanden: Einzelsegment, Zweisegment, Mehrturn, Tool-Call, Rechen-Kanarienvogel
5/5. Das ist bei einem PR, der Cache- und Attention-Code anfasst, nicht
selbstverständlich und war die Voraussetzung dafür, die Durchsatzzahlen
überhaupt zu bewerten.

### 3.5 Speicher ist bei Tiefe kein Thema

Bei `ctx 262144`: GPU-Spitze **86,12 GiB**, Reserve **25,5 GiB**. Der Cache
kostet bei 262144 Token nur 4,38 GiB (q8_0). **Die Grenze ist durchgehend die
Zeit, nie der Speicher** — anders als bei allen Vormodellen dieser Maschine.

---

## 4. Bewertung für den Praxiseinsatz

| Kontext | Decode Basis | Decode PR | kalter Prefill | Einschätzung |
|---:|---:|---:|---:|---|
| bis 4.096 | 21,7 | 22,2 | 17 s | flüssig |
| 16.384 | 19,0 | 19,3 | 68 s | gut |
| 32.768 | 16,7 | 18,2 | 2,5 min | brauchbar |
| 65.536 | 12,3 | 13,8 | 6,2 min | zäh |
| 131.072 | 8,8 | **10,5** | 14,3 min / **11,9 min (PR)** | grenzwertig |
| 163.840 | 7,7 | 9,2 | 18,9 min | nicht interaktiv |

**Für Coding-Sitzungen mit 100K+ Kontext ist das Modell auf dieser Hardware
heute nicht praktikabel** — 8,8 t/s bedeuten für eine 500-Token-Antwort knapp
eine Minute, und jede Cache-Invalidierung kostet eine Viertelstunde Prefill.

Der Grund ist ausdrücklich **nicht** die Hardware: 25,5 GiB Speicherreserve
bleiben ungenutzt. Es ist der Reifegrad der Implementierung, vier Tage nach dem
Merge der Architektur.

**Zum Einordnen:** Die Community meldet für MoE der A3B-Klasse (Qwen3.6-35B-A3B,
~3B aktiv) bei 153K rund 25 t/s [F]. Flash-Next hat mit ~6B doppelt so viele
aktive Parameter — der Faktor 2,7 gegenüber 9,2 t/s ist damit aber nicht
erklärbar. Die Differenz ist Optimierungsrückstand.

---

## 5. Einschränkungen

* **Die tiefen Punkte sind Einzelmessungen.** Die Tiefen bis 4096 stammen aus
  drei Wiederholungen (M4-Basislauf), 16K–164K aus je einer. Der Basislauf
  wurde nach der ersten Wiederholung bewusst abgebrochen, um Bauzeit für den
  PR-Vergleich freizugeben; sein JSON ist aus Konsolen- und Serverprotokoll
  rekonstruiert und als `TRUNCATED_AFTER_REP1` gekennzeichnet.
* **Ein Modell, kein Vergleich.** UD-IQ4_XS ist nicht geladen, Qwen3.8-27B nicht
  gegengemessen.
* **Synthetische Prompts.** Wiederholter Fülltext, exakt tokenisiert über
  `/tokenize`. Echte Codebasen haben andere Token-Verteilungen; die
  Prefix-Cache-Wirkung realer Sitzungen ist damit nicht abgebildet.
* **Stand dieser M4-Reihe am 31.08.: kein spekulatives Decoding.** Damals war
  MTP für `qwen4exp` in diesem Build nicht verfügbar und das Haupt-GGUF
  enthielt keine MTP-Tensoren. Seit 01.09. wird ein separater Sidecar mit einem
  experimentellen kombinierten Build gemessen; siehe den Nachtrag oben und
  Dokument `17`.
* **PR #27977 ist ein offener Entwurf** ohne Maintainer-Beteiligung. Die Zahlen
  beschreiben einen Zwischenstand, keine Release-Eigenschaft.

---

## 6. Rohdaten

| Lauf | Artefakte |
|---|---|
| M4 Basis, ctx 65536, 3 Wdh | `raw/runs/m4_20260831_135018*.{json,_server.log,_res.csv}` |
| M4 Basis tief, ctx 262144 | `raw/runs/m4deep_20260831_141149.json` (rekonstruiert), `m4_20260831_141149_server.log`, `_res.csv` |
| M4 PR, ctx 262144 | `raw/runs/m4_pr27977_20260831_150120*` |

Jedes JSON enthält Build-Commit, HF-Revision, wortgetreue Kommandozeile,
Ladeprotokoll-Auszüge, M0-Ergebnisse und die Ressourcenspur im 2-Sekunden-Takt.
