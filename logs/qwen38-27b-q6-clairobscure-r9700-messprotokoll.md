# Messprotokoll: Produktionslauf „Clair Obscure", 35 Tasks

**Datum:** 28.08.2026
**Quelle:** `E:\Coding\benchmarks\Clair Obscure Qwen 3.8 27b\llama.cpp.log.txt`
(255 KB, 2.187 Zeilen, Serverlog mit `-lv 3`)
**Auswertung:** `scripts/parse_server_log.py`, CSV in
`results/20260828-clair-obscure-produktionslauf.csv`
**Klasse:** **[GEMESSEN-EIGEN]** — echte Agentenarbeit, kein synthetischer
Benchmark. Damit die belastbarste Datenreihe im gesamten Projekt.

## Konfiguration

Aus dem Logkopf und dem BAT:

| Parameter | Wert |
|---|---|
| Modell | Qwen3.8-27B **UD-Q6_K_M** |
| Build | TheTom-Fork `bd9bd1b`, Vulkan |
| Kontextslot | 262.144, `kv_unified = true`, `n_slots = 1` |
| KV-Cache | `q8_0` / `turbo4` |
| Spekulation | `draft-mtp` n-max 2 **+ `ngram-mod` 24/48/64** |
| Vision | mmproj-F16 geladen |
| Umfang | 35 Tasks, 119.627 generierte Tokens, 114,5 min Serverzeit |

## Gesamtbild

| Größe | min | Median | max |
|---|---:|---:|---:|
| Decode | 13,93 | **26,43** | 42,39 t/s |
| Prefill (Prompts > 500 Tok) | 93,77 | 167,98 | 350,83 t/s |
| Draft-Akzeptanz | 34,1 % | 55,3 % | 72,8 % |
| mean len | 2,04 | 2,84 | 5,56 |
| LCP-Similarity (n = 34) | 0,610 | 0,990 | — |

**Nur 9 von 35 Tasks (26 %) erreichten 30 t/s oder mehr im Decode.**

---

## 1. Decode nach Kontexttiefe

| Kontext bei Task-Ende | n | Decode Median | Spanne | mean len | Akzeptanz |
|---|---:|---:|---:|---:|---:|
| 50–100 K | 31 | **26,78 t/s** | 21,8–42,4 | 2,89 | 56,9 % |
| **> 150 K** | 4 | **15,37 t/s** | 13,9–18,0 | 2,09 | 50,3 % |

Der Abfall von rund 85 K auf rund 190 K Kontext beträgt **−43 %**.

## 2. Der Einbruch hat zwei Ursachen, nicht eine

Das ist der wichtigste Befund dieses Laufs.

Zwischen den beiden Bändern fällt nicht nur der Durchsatz, sondern auch die
**mean len** — die Zahl der Tokens, die je Modelldurchlauf tatsächlich
durchgehen: von 2,89 auf 2,09, also um Faktor 1,38.

Der Decode fällt um Faktor 1,74 (26,78 → 15,37). Von diesen 1,74 entfallen
rechnerisch **1,38 auf den weggebrochenen Spekulationsgewinn**, nur der Rest
von 1,26 auf gestiegene Attention- und Bandbreitenarbeit.

**Rund vier Fünftel des Einbruchs bei großem Kontext sind also kein
Hardwareproblem, sondern das Versagen der Spekulation.** Bei 190 K Kontext
trifft `ngram-mod` praktisch nichts mehr, und MTP allein liefert bei `n-max 2`
kaum mehr als mean len 2.

Die Zerlegung ist eine Rechnung auf zwei Bändern mit n = 31 und n = 4, kein
kontrolliertes Experiment. Sie ist stark genug, um die Richtung zu setzen,
aber nicht, um eine Prozentzahl zu zitieren.

## 3. ngram-mod trägt mehr als die MTP-Akzeptanz

| Korrelation mit dem Decode | Pearson r |
|---|---:|
| **mean len** | **+0,804** |
| Draft-Akzeptanz | +0,464 |

Mit `n-max 2` kann MTP allein höchstens mean len 3 erreichen (ein Zieltoken
plus zwei Draft-Token). Jeder Wert darüber stammt zwangsläufig von
**`ngram-mod`**. Die Extremwerte zeigen es deutlich:

| Task | Prompt | generiert | Decode | mean len | Akzeptanz | Kontext |
|---:|---:|---:|---:|---:|---:|---:|
| **42012** | 8.572 | 1.549 | **42,39** | **5,56** | 70,4 % | 85.731 |
| 44878 | 1.096 | 609 | 36,43 | 5,08 | 60,9 % | 92.561 |
| 25771 | 790 | 736 | 35,31 | 3,72 | 69,8 % | 72.221 |
| … | | | | | | |
| 0 | 180.396 | 7.518 | 15,55 | 2,06 | 51,0 % | 187.915 |
| 3742 | 3.612 | 3.607 | 15,18 | 2,04 | 49,6 % | 187.611 |
| 5517 | 11.646 | 1.160 | **13,93** | 2,13 | 36,4 % | 192.779 |

Der schnellste Task ist nicht der mit der höchsten Akzeptanz, sondern der mit
der höchsten mean len. **Auf Code, wo sich Strukturen wiederholen, ist
`ngram-mod` der eigentliche Beschleuniger** — es liefert dort mehr als der
MTP-Kopf.

Praktische Folge: Wer den Decode bei großem Kontext heben will, sollte
zuerst an den `ngram-mod`-Parametern drehen (`n-match 24 / n-min 48 /
n-max 64`), nicht an `--spec-draft-n-max`. Ungetestet, aber die Datenlage
zeigt eindeutig dorthin.

## 4. Prefill bricht um Faktor 4,2 ein

Momentanrate aus den Differenzen der kumulativen Fortschrittszeilen von
Task 0 (180.396 Tokens):

| Tiefe | Momentanrate | kumuliert |
|---:|---:|---:|
| 8.192 | **498,3 t/s** | 346,7 |
| 16.384 | 423,1 | 391,0 |
| 34.075 | 323,0 | 373,3 |
| 66.843 | 223,3 | 308,4 |
| 99.611 | 172,4 | 257,6 |
| 132.379 | 139,6 | 220,4 |
| 163.842 | **118,0** | 193,1 |
| 180.264 | 87,5 | 181,2 |

Von 8 K auf 164 K sinkt die Momentanrate um **Faktor 4,2**. Ein Prompt von
180.396 Tokens brauchte **16,6 Minuten** reine Prefill-Zeit.

Für agentisches Arbeiten ist das die härtere Grenze als der Decode: Ein
Kontextabriss bei großer Tiefe kostet eine Viertelstunde, bevor überhaupt ein
Token zurückkommt.

## 5. Prompt-Caching funktioniert

Die LCP-Similarity lag bei 34 Slot-Zuweisungen im Median bei **0,990**, im
Minimum bei 0,610. Der Präfix bleibt also über die Agentenschleife hinweg
stabil, volle Reprefills sind die Ausnahme. Die Zahl der wiederverwendeten
Graphen stieg monoton auf 48.966.

Vier `create_check: erasing`-Ereignisse im Log zeigen, dass Checkpoints
tatsächlich verdrängt wurden.

## 6. Einordnung gegen die llama-bench-Messung vom 31.08.

| Quelle | Konfiguration | Kontext | Decode |
|---|---|---:|---:|
| dieser Lauf | Fork `bd9bd1b`, `q8_0/turbo4`, MTP2 + ngram | ~85 K | 26,78 |
| dieser Lauf | dito | ~190 K | 15,37 |
| llama-bench 31.08. | b10717, `q8_0/q8_0`, **ohne** Spekulation | 131 K | 18,73 |

Der llama-bench-Wert liegt **ohne jede Spekulation** zwischen den beiden
Produktionsbändern. Das relativiert den zuvor geschätzten MTP-Faktor von
1,6 deutlich: Bei 131 K und einer mean len um 2,1 wäre der reale Faktor eher
bei 1,1 bis 1,3.

**Konsequenz: Die Umrechnung „roh × 1,6" aus
[results/20260831-decode-tiefe-q6-vs-q4.md](20260831-decode-tiefe-q6-vs-q4.md)
ist bei großem Kontext zu optimistisch** und dort auf etwa 1,2 zu korrigieren.
Bei kurzem Kontext, wo `ngram-mod` greift, ist 1,6 dagegen plausibel.

## 7. Was dieser Lauf nicht hergibt

1. Kein A/B: `ngram-mod` war durchgehend an, es gibt keinen Vergleichslauf
   ohne.
2. Die Bänder sind unausgewogen (31 gegen 4 Tasks), und die Tasks
   unterscheiden sich in Inhalt und Länge.
3. Prompt- und Generierungslängen sind nicht kontrolliert — es war echte
   Arbeit, kein Messplan.
4. Keine Qualitätsbewertung der Ausgaben.

## 8. Was daraus folgt

- **Die 30-t/s-Marke hielt in 26 % der Tasks.** Bei über 150 K Kontext in
  keinem einzigen.
- **Der Hebel bei großem Kontext ist die Spekulation, nicht das
  Gewichtsquant.** Ein Quantwechsel bringt gemessen 16–18 %
  ([31.08.](20260831-decode-tiefe-q6-vs-q4.md)); der weggebrochene
  Spekulationsgewinn kostet ein Vielfaches davon.
- **Prefill ist die eigentliche Grenze für 200 K+.** 16,6 Minuten für einen
  vollen Prompt sind für einen Agentenzyklus zu viel, unabhängig vom Decode.
