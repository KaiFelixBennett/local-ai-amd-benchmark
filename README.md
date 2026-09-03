# local-ai-amd-benchmark

**Nutzbarkeitstest lokaler KI auf AMD-Hardware.** Kein Fragenkatalog, kein Multiple Choice —
die Modelle bauen in VS Code stundenlang echte Software, und was dabei herauskommt, ist spielbar.

Gemessen wird nicht der Laborwert, sondern der Median über hunderte echte Antworten aus dem
`llama.cpp`-Serverlog. Zusammen **1 014 327 erzeugte Tokens** über fünf Agentenläufe.

---

## Was hier drin ist

| Ordner | Inhalt |
|---|---|
| `data/` | `runs.json` (alle Läufe), `configs.json` (19 Startkonfigurationen), `hardware.json` |
| `src/` | Stylesheet, Hintergrund-Shader, Startseiten- und Detailseiten-Logik |
| `media/` | Aufnahmen aus den ausgelieferten Builds, Screenshots, Prüfbilder |
| `docs/` | Messdaten-Inventar mit allen Rohwerten, Plan der Seite |
| `scripts/` | Log-Auswerter, Aufnahmeskript |
| `build.mjs` | Erzeugt `dist/` — eine Startseite und eine Detailseite je Lauf |

## Bauen

```bash
node build.mjs      # erzeugt dist/
npm run serve       # baut und liefert auf http://127.0.0.1:4321
```

Keine Abhängigkeiten, kein Framework. Node 20 oder neuer.

---

## Der Prüfstand

| | Radeon AI PRO R9700 | Ecotech Evo X2 · Ryzen AI Max+ 395 |
|---|---|---|
| Architektur | gfx1201 · RDNA4 | Strix Halo · Radeon 8060S · gfx1151 |
| Speicher | 32 GB dediziert (32 624 MiB) | 128 GiB unified LPDDR5X-8533 |
| Bandbreite | — | ~256 GB/s theoretisch |
| Preis | ab ~1 500 € | ab ~1 800 € |

**Zum Speicher des Ryzen AI Max+ 395:** 128 GiB *unified*, keine 128 GB VRAM. Windows sieht
63,6 GiB, die BIOS-Reservierung beträgt 64,4 GiB, Vulkan meldet einen Heap von 98 123 MiB.
Wer nur eine dieser Zahlen nennt, sagt etwas Falsches.

---

## Gemessene Agentenläufe

Decode-Median über Antworten ab 200 Tokens, aus dem Serverlog. Der Filter entfernt
1-Token-Artefakte — im Qwen3.6-Log stehen Einträge mit 1 000 000 t/s.

| Modell | Quant | Hardware | Aufgabe | n | Median | p10 – p90 | Tokens |
|---|---|---|---|---:|---:|---|---:|
| Qwen3.8-27B | UD-Q4_K_XL | R9700 | Moorhuhn | 82 | **33,69** t/s | 27,8 – 45,3 | 332 405 |
| Qwen3.6-27B | UD-Q6_K_XL | R9700 | Moorhuhn | 221 | **33,45** t/s | 29,0 – 38,3 | 175 743 |
| Qwen3.8-Flash-Next | UD-Q4_K_XL | Evo X2 | Moorhuhn | 42 | **23,84** t/s | 18,9 – 27,4 | 98 871 |
| Qwen3.8-27B | UD-Q6_K_M | R9700 | Clair Obscure | 30 | **26,30** t/s | 17,8 – 34,3 | 118 919 |
| DeepSeek-V4-Flash-0731 | UD-IQ3_XXS | Evo X2 | Clair Obscure | 98 | **7,02** t/s | 5,0 – 9,8 | 150 800 |

Dazu zwei synthetische Labormessungen (Qwen3.5-122B-A10B 31,80 t/s, Laguna S 2.1 27,90 t/s),
die in der Tabelle ausdrücklich als solche gekennzeichnet sind: **ein Laborwert liegt rund
doppelt so hoch wie das, was im Agentenbetrieb ankommt.**

---

## Drei Befunde

**Die empfohlene Entwurfstiefe kostet Durchsatz.** Lagunas Modelcard nennt
`--spec-draft-n-max 15`. Damit fällt der Decode auf 8,1 t/s — unter die 20,55 ohne jede
Spekulation. Mit `3` steigt er auf 27,9. Das Optimum ist auf bandbreitenbegrenzter Hardware
sehr scharf.

**Ohne Präsenzstrafe endet die Antwort nicht.** Unsloths „precise coding"-Voreinstellung mit
`presence_penalty 0.0` lief bei einer Aufgabe bis ans Kontextende — 32 768 Tokens ohne Abschluss.
Dieselbe Aufgabe braucht 201 Tokens.

**Mehr Grafikspeicher zu reservieren bringt nichts.** Eine größere UMA-Reservierung verbesserte
den Durchsatz nicht und hätte dem Betriebssystem Speicher entzogen. Selbst bei 262 144 Kontext
blieben 25,6 GiB frei. Nicht der Speicher begrenzt diese Maschine, sondern die Zeit.

---

## Kontexttiefe

Fast jede Angabe zu lokalen Modellen misst bei kurzem Kontext. Agenten arbeiten bei 50 K bis
180 K.

| Tiefe | 8 K | 16 K | 34 K | 67 K | 100 K | 132 K | 164 K |
|---|---:|---:|---:|---:|---:|---:|---:|
| Prefill R9700 | **498,3** | 423,1 | 323,0 | 223,3 | 172,4 | 139,6 | **118,0** t/s |

Faktor 4,2. Ein Prompt mit 180 396 Tokens brauchte 16,6 Minuten bis zum ersten Zeichen.

---

## Was noch fehlt

- **Rubrik-Noten.** Die Qualitätsachse ist überall vorläufig; auf der Seite entsprechend markiert.
- **Energiemessung.** Wh pro 1 000 Tokens fehlt für beide Maschinen.
- **Ein Mangel als Befund:** Der Moorhuhn-Build von Qwen3.8-27B Q4_XL startet nicht — „Spiel
  starten" bleibt in fünf getesteten Anläufen wirkungslos, Untermenüs funktionieren.

---

## Verwandte Projekte

- [hermes-claude-code-local](https://github.com/KaiFelixBennett/hermes-claude-code-local) — Hermes Agent und Claude Code lokal über llama.cpp
- [gemma4-turboquant-rdna4](https://github.com/KaiFelixBennett/gemma4-turboquant-rdna4) — Gemma-4-31B mit 256 K Kontext auf RDNA4
- [RadeonForge](https://github.com/KaiFelixBennett/RadeonForge) — Fine-Tuning auf Radeon per QLoRA über ROCm
- [llama-cpp-turboquant](https://github.com/KaiFelixBennett/llama-cpp-turboquant) — llama.cpp-Fork mit TurboQuant-KV-Cache

## Lizenz

Code MIT, Messdaten CC-BY-4.0.
