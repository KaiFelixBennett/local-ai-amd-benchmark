# Der Code, den die Modelle geschrieben haben

Hier liegt der Quelltext jedes Laufs, so wie das Modell ihn abgeliefert hat.
Nichts davon ist nachträglich aufgeräumt oder korrigiert worden.

Sortiert ist nach **Modell**, darunter nach **Lauf**. Ein Modell kann mehrmals
vorkommen, mit verschiedenen Aufgaben, Quantisierungen oder Reasoning-Stufen.

| Ordner | Modell | Quantisierung | Aufgabe | Reasoning |
|---|---|---|---|---|
| [`qwen38-27b/moorhuhn-q4xl-xhigh`](qwen38-27b/moorhuhn-q4xl-xhigh/) | Qwen3.8-27B | UD-Q4_K_XL | Moorhuhn | xhigh |
| [`qwen38-27b/moorhuhn-q4xl-medium`](qwen38-27b/moorhuhn-q4xl-medium/) | Qwen3.8-27B | UD-Q4_K_XL | Moorhuhn | medium |
| [`qwen36-27b/moorhuhn-q6`](qwen36-27b/moorhuhn-q6/) | Qwen3.6-27B | UD-Q6_K_XL | Moorhuhn | — |
| [`qwen38-flashnext/moorhuhn-q4xl`](qwen38-flashnext/moorhuhn-q4xl/) | Qwen3.8-Flash-Next | UD-Q4_K_XL | Moorhuhn | — |
| [`qwen38-flashnext/moorhuhn-halogen`](qwen38-flashnext/moorhuhn-halogen/) | Qwen3.8-Flash-Next | W4B, Server Halogen | Moorhuhn | — |
| [`qwen38-flashnext/clairobscure-q4xl`](qwen38-flashnext/clairobscure-q4xl/) | Qwen3.8-Flash-Next | UD-Q4_K_XL | Clair Obscure | — |
| [`qwen38-27b/clairobscure-q6`](qwen38-27b/clairobscure-q6/) | Qwen3.8-27B | UD-Q6_K_M | Clair Obscure | — |
| [`qwen36-27b/clairobscure-q6`](qwen36-27b/clairobscure-q6/) | Qwen3.6-27B | UD-Q6_K_XL | Clair Obscure | — |
| [`qwen35-122b-a10b/clairobscure`](qwen35-122b-a10b/clairobscure/) | Qwen3.5-122B-A10B | UD-Q4_K_XL | Labortest | — |
| [`laguna-s21/clairobscure`](laguna-s21/clairobscure/) | Laguna S 2.1 | Q4_K_M | Clair Obscure | — |
| [`deepseek-v4-flash/clairobscure`](deepseek-v4-flash/clairobscure/) | DeepSeek-V4-Flash-0731 | UD-IQ3_XXS | Clair Obscure | — |
| [`opus5/clairobscure`](opus5/clairobscure/) | Opus 5 ULTRACODE | — | Clair Obscure | — |
| [`sonnet5/moorhuhn`](sonnet5/moorhuhn/) | Sonnet 5 | — | Moorhuhn | — |

Jeder Ordner trägt eine `LAUF.md` mit Slug, Hardware, Datum und dem Verweis auf
das Rohprotokoll.

## Was hier nicht liegt

**Gebaute Fassungen.** `dist/` ist ausgeschlossen, denn der Build entsteht aus
dem Quelltext daneben. Wer spielen will, findet die fertigen Builds auf
benchmark.securesight.ai.

**Abhängigkeiten.** `node_modules/` ist ausgeschlossen. Die Sperrdateien liegen
dabei, ein `npm ci` stellt denselben Stand her.

**Große Bilddateien.** Die beiden 3D-Spiele benutzen Texturen, HDRIs und Modelle
von Poly Haven und Kenney, alles CC0. Zusammen sind das rund 145 MB, und erzeugt
hat sie kein Modell. Woher jede Datei stammt, steht in der `ASSETS.md` des
jeweiligen Projekts. Ohne sie startet das Spiel nicht; der Code ist trotzdem
vollständig lesbar.

**Protokolle.** Sie liegen dort, wo sie hingehören: unter `evidence/logs/`.

## Was du damit machen kannst

```bash
cd qwen38-27b/moorhuhn-q4xl-xhigh
npm ci
npm run dev
```

Die Aufträge, aus denen diese Projekte entstanden sind, liegen unter
`evidence/prompts/`. Zwei Aufträge, dreizehn Läufe: derselbe Text ging an jedes
Modell.
