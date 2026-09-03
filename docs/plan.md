# benchmark.securesight.ai — Blueprint

**Planungsstand:** 02.09.2026
**Ziel:** benchmark.securesight.ai
**Quelle der Läufe:** `E:\Coding\benchmarks`
**Runner:** VS Code 1.135, Copilot Chat mit Custom Endpoint (llama.cpp @ `127.0.0.1:8080/v1`)
**Gestaltete Fassung (Stand 1):** https://claude.ai/code/artifact/b0f2084a-3ff6-4f83-9551-267754835c90
(Kopie in [docs/blueprint.html](docs/blueprint.html). **Dieses Dokument ist die maßgebliche Fassung**
und enthält Stand 2 mit Startseiten-Layout und Bild-Benchmark.)

Eine Benchmark-Subdomain, auf der jedes gemessene Modell **seine eigene Detailseite selbst
baut** — gleicher Inhalt, eigenes Design.

**Leitfrage der Seite:** Wie gut laufen Modelle auf AMD Ryzen AI Max+ 395 und Radeon AI PRO
R9700? Was kann man an Qualität, Geschwindigkeit und agentischer Laufzeit erwarten? Und wie
übernimmt man die Konfiguration, um dieselben Ergebnisse zu bekommen?

> Wichtige Abgrenzung: Es geht **nicht** darum, dass Leser den Benchmark nachstellen, sondern
> darum, dass sie dieselben Parameter übernehmen und dieselbe Leistung im Alltag erreichen. Der
> entsprechende Abschnitt heißt deshalb „Konfiguration übernehmen", nicht „Benchmark reproduzieren".

---

## 1. Entscheidungen

| Gegenstand | Festlegung | Status |
|---|---|---|
| Projektform | Eigenständiges Vite-Projekt in `benchmark.securesight.ai`, eigenes Cloudflare-Pages-Projekt. Kein Anfassen des Homepage-Monorepos. | entschieden |
| Wer baut die Detailseite | Das gebenchmarkte Modell selbst — sie ist ein Ergebnis-Artefakt, kein Marketingmaterial. | entschieden |
| Abgabeformat | Eine einzelne self-contained `index.html` pro Lauf. Kein Build, keine Abhängigkeiten, isoliert ausgeliefert. | entschieden |
| Gliederung | Drei Blöcke: AI Max+ 395 · Radeon AI PRO R9700 · Cloud-Referenz. | entschieden |
| Sprache | Zweisprachig DE/EN — beide Fassungen kommen fertig aus `run.json`, das Modell übersetzt nichts. | entschieden |
| Medien | Spielbare Live-Demo im iframe · MP4/WebM-Loop · Asciinema-Cast des Agentenlaufs. | entschieden |
| Bewertung | Objektive Metriken + Rubrik-Note + Community-Voting, getrennt ausgewiesen. | entschieden |
| Runner | VS Code 1.135, Copilot Chat. Harness als Custom Agent unter `.github/`. | entschieden |
| **Rahmen der Detailseite** | **Copy-exact Kopf- und Fußblock als Pflichtbaustein. Wir fassen die Modellausgabe nie an.** | entschieden |
| **Modell-Logo** | **Jedes Modell erzeugt eine eigene SVG-Marke; der Harness extrahiert sie für die Karten der Startseite.** | entschieden |
| **Bild-Benchmark** | **Zwei eigene Bilder. Aufgabe: strukturiert extrahieren + Diagramm als SVG nachbauen.** | entschieden |
| **Bild-Benchmark, Ort** | **Eigene Seite `/vision` mit Direktvergleich, plus Abschnitt `#vision` je Detailseite.** | entschieden |
| **Foto, Datenschutz** | **Gesichter werden vor der Festlegung weichgezeichnet.** | entschieden |
| **Konfigurations-Rezept** | **Kopierbare `llama-server`-Zeile + GGUF-Link + Treiber-/Build-Version je Lauf und je Hardware.** | entschieden |
| **Hintergrund** | **Alle vier WebGL-Hintergründe werden ausgeliefert: Kontexttiefe · Rechenfeld · Bandbreiten · Fluid mit Datenrelief. Beim Laden zufällig gewählt, Fluid als Rückfallebene, Besucherwahl in `localStorage` gespeichert.** | entschieden |
| **Technikpfad Hintergrund** | **React Three Fiber mit eigenen Shadern. Rauschen aus CPU-erzeugter Textur, nicht aus arithmetischem Hash.** | entschieden |
| **Einbindung securesight.ai** | **Eigener Abschnitt auf der Startseite plus Navigationspunkt „Benchmarks".** | entschieden |
| Öffentliches Repo | GitHub public — dort sitzt die Local-LLM-Szene. Homepage bleibt auf GitLab. | Vorschlag |
| Seite = Modell × Aufgabe | Ein Lauf ist eine Seite; Modellübersicht darüber verlinkt. | offen |
| Läufe pro Kombination | n = 1 ist statistisch nicht belastbar; ab n = 3 Median und Spanne. | offen |
| Hardware-Direktvergleich | Setzt mindestens eine identische Quant-Kombination auf beiden Maschinen voraus. | offen |

---

## 2. Seitenarchitektur

Die **Shell** ist eine React-App wie die Homepage (Vite, Tailwind, Recharts, i18next, dieselben
Farbtokens) und liefert Start-, Vergleichs-, Vision-, Methodik- und Modellübersichtsseiten. Die
**Detailseiten** liegen daneben als statische Ordner und werden vom Build nur eingesammelt, nie
kompiliert — ein Syntaxfehler eines Modells kann den Build damit nicht brechen.

```
benchmark.securesight.ai/
├── shell/                       # React + Vite, Marken-Design
│   ├── src/pages/               # Index · Hardware · Vergleich · Vision · Methodik · Modell
│   └── src/data/index.json      # aggregiert aus allen run.json (Build-Schritt)
├── runs/                        # Quelle der Wahrheit, versioniert
│   └── qwen38-27b-q4xl--moorhuhn--r9700--001/
│       ├── run.json             # validiertes Schema, einzige Zahlenquelle
│       ├── page/index.html      # ← vom Modell one-shot gebaut
│       ├── logo.svg             # ← vom Harness aus der Seite extrahiert
│       ├── vision/              # Antworten + Bewertung des Bild-Benchmarks
│       ├── demo/                # dist/ des gebauten Spiels (~1,5 MB)
│       ├── media/               # loop.webm · shots/*.avif · cast.cast
│       └── raw/                 # llama.cpp.log · timings.csv · prompt.txt
├── vision/                      # die zwei Referenzbilder + Lösungsschlüssel
├── harness/                     # .github/agents · prompt · schema · validator
└── dist/                        # Deploy-Artefakt
```

### Routing

| Pfad | Inhalt |
|---|---|
| `/` | Startseite, drei Hardware-Blöcke |
| `/hw/r9700` | Hardware-Profil + alle Läufe darauf |
| `/compare` | Modelle nebeneinander, filterbar |
| `/vision` | Bild-Benchmark, alle Modelle an denselben zwei Bildern |
| `/method` | Methodik, Rubrik, Glossar |
| `/m/<model>` | Modellübersicht (Shell-Design) |
| `/m/<model>/<task>-<hw>` | **Detailseite im Design des Modells** |
| `/m/<model>/<task>-<hw>/demo/` | spielbarer Build, sandboxed iframe |

**Warum isoliert:** Die Detailseite wird als eigenes Dokument ausgeliefert und in der Shell nur
über `<iframe sandbox="allow-scripts">` eingebettet, wenn sie in der Vergleichsansicht auftaucht.
Kein gemeinsames CSS, keine Kollisionen, kein Build-Risiko — und das Design des Modells wirkt
ungefiltert.

---

## 3. Startseite

**Leitfrage:** Wie schnell, wie gut, auf welcher Hardware — und wo liegt ein Lauf im Gesamtfeld?
Diese vier Antworten muss ein Besucher in fünf Sekunden bekommen.

### 3.0 Die Grundsatzentscheidung: ein Feld statt drei Blöcke

Hardware ist eine **Eigenschaft** eines Laufs, keine Gliederungsebene. Drei nach Maschine
getrennte Listen beantworten „welche Hardware" gut und machen „wo liegt das im Gesamtvergleich"
unmöglich — wer in drei Listen steht, steht in keiner Rangfolge. Bei fünfzig Läufen wären es
drei sehr lange Listen.

Stattdessen: **eine Rangliste über alle Läufe**, Hardware als Farbe und als Filterchip. Die
Maschinen bekommen weiter unten einen eigenen Abschnitt mit Steckbrief und Konfiguration —
ohne jeden Lauf ein zweites Mal aufzuführen.

Entwurf **lokal**: [docs/startseite.html](docs/startseite.html) · online:
https://claude.ai/code/artifact/88491064-cc97-49d8-8e6f-2582e90169c9

### 3.1 Aufbau

```
1  Kopfleiste          Wortmarke · DE/EN · Hintergrund-Wechsler · securesight.ai
2  Leitzeile           Zwei Sätze + Kennzahlenreihe
3  Das Feld            Streudiagramm Qualität × Geschwindigkeit mit Pareto-Front
4  Spitzenreiter       Drei Kacheln: schnellste · beste Qualität · bestes Verhältnis
5  Filterleiste        Hardware · Aufgabe · Suche          (klebt beim Scrollen)
6  Die Rangliste       Sortierbare Tabelle, Balken in den Zellen, Zeile aufklappbar
7  Hardware            Steckbriefe + „Konfiguration übernehmen"
8  Kontexttiefe        Warum die Spitzenzahl täuscht
9  Bild-Benchmark      Teaser → /vision
10 Methodik & Fairness
11 Fuß
```

### 3.2 Das Feld (Position 3)

Ein Streudiagramm beantwortet alle vier Fragen gleichzeitig: **Position** sagt wie schnell und
wie gut, **Farbe** sagt welche Hardware, **Lage im Feld** sagt wo im Gesamtvergleich.

- x = Decode-Median (t/s), y = Rubrik-Note
- Punktmarke = die vom Modell selbst gezeichnete SVG-Marke
- **Pareto-Front** als Linie durch alle Läufe, die von keinem anderen in *beiden* Dimensionen
  geschlagen werden. Damit ist „Einordnung" objektiv statt erfunden.
- **Cloud-Modelle haben keine lokale Geschwindigkeit** und werden deshalb nicht als Punkte
  gezeichnet, sondern als waagerechte gestrichelte Bezugslinien auf ihrer Qualitätshöhe.
  Ehrlicher als sie an eine erfundene x-Position zu setzen.
- Hover zeigt eine Sprechblase mit allen Kennzahlen, Klick öffnet die Detailseite.

**Kein Gesamtscore.** Jede Gewichtung von Geschwindigkeit gegen Qualität ist eine Meinung und
wird als solche angegriffen. Die Rangnummer in der Tabelle bezieht sich sichtbar auf die
gerade gewählte Sortierspalte, nicht auf eine universelle Wahrheit.

### 3.3 Die Rangliste (Position 6)

Eine Tabelle, alle Läufe, sortierbar nach jeder Spalte. Spalten: Rang · Marke · Modell + Quant ·
Hardware · Decode · Prefill @ 8 K · Wall-Clock · Selbstkorrekturen · Qualität.

**Balken in den Zellen** statt nackter Zahlen — die Rangfolge wird erfasst, ohne Zahlen zu
vergleichen. Balken sequenziell in einem Farbton, Zahl daneben in Textfarbe, nie in der
Serienfarbe.

**Auf dem Handy** wird die Tabelle *nicht* zu Karten umgebrochen, sondern bekommt eine klebende
Modellspalte und scrollt seitwärts. Kartenlisten zerstören genau die Vergleichbarkeit, für die
man eine Tabelle baut. Das Streudiagramm ist auf Mobilgeräten die primäre Ansicht.

### 3.4 Anmutung

Durchgehend dunkel. Der Shader bleibt über die ganze Seite sichtbar, Inhaltsblöcke liegen als
leicht durchscheinende Glasflächen darüber (`backdrop-filter`, feine Kante, weicher Schatten).
Bedingung: Zahlen und Achsen müssen scharf bleiben — Glas nur dort, wo darunter nichts
Kleinteiliges liegt, und Diagrammflächen bekommen einen ruhigeren, weniger transparenten Grund.

### 3.5 Diagrammpalette (validiert)

| Rolle | Hex | Prüfung |
|---|---|---|
| Radeon AI PRO R9700 | `#1c9ab8` | L 0,60 · im Band |
| Ryzen AI Max+ 395 (Evo X2) | `#cb7815` | L 0,62 · im Band |
| Cloud-Referenz | `#7b7796` | bewusst unbunt — Kontext, keine Serie |
| Fläche (Glas über Shader) | `#141130` | Bezugsfläche der Prüfung |
| Text primär / sekundär / gedämpft | `#ece9ff` / `#a9a2d6` / `#918dae` | 15,3 / 7,7 / 5,8 : 1 |
| Gitternetz | `#2a2450` | 1,27 : 1, bewusst zurückgenommen |

Geprüft mit dem Validator gegen `#141130`: Helligkeitsband bestanden, Chroma-Untergrenze
bestanden, Farbfehlsichtigkeits-ΔE 19,4 (Grenzwert 8), Normalsicht-ΔE 24,8 (Grenzwert 15),
Kontrast aller Marken über 3 : 1.

**Obergrenze:** In Streudiagrammen müssen alle Farbpaare gleichzeitig trennen; die belastbare
Grenze liegt bei drei Kategorien. Eine vierte Maschine bekommt Farbe × Form oder eine eigene
Facette — niemals eine erfundene vierte Farbe.

### 3.6 Regeln, die für jedes Diagramm der Seite gelten

- Nie zwei y-Achsen. Zwei Größen unterschiedlicher Skala werden zwei Diagramme.
- Farbe folgt dem Lauf, nie seinem Rang. Ein Filter darf die Überlebenden nicht umfärben.
- Sequenziell heißt ein Farbton hell → dunkel. Kein Regenbogen.
- Ab zwei Serien immer eine Legende; bis vier zusätzlich direkt beschriftet.
- Zahlen und Beschriftungen tragen Textfarben, nie die Serienfarbe.
- Jedes Diagramm hat eine Hover-Ebene und eine Tabellenansicht als Alternative.

### 3.7 Der Hintergrund

Entwürfe **lokal**: [docs/hintergruende.html](docs/hintergruende.html) — eigenständige Datei,
einfach im Browser öffnen.  
Entwürfe online: https://claude.ai/code/artifact/7a0676c4-fdca-4172-9c54-d32968ab0abd

Drei Hintergründe werden ausgeliefert, alle in WebGL mit eigenen Shadern, je ein Draw-Call:

| | Konzept | Datenanbindung |
|---|---|---|
| **01** | **Kontexttiefe** — 40 000 Punkte strömen in einen Korridor und werden mit der Tiefe langsamer | Verzögerung folgt der Prefill-Kurve; `z = 1-(1-u)^2.6` |
| **03** | **Bandbreiten** — neun Lichtströme, einer je Lauf | Tempo je Strom = gemessener Decode aus `run.json` |
| **04** | **Fluid mit Datenrelief** — Mesh-Gradient mit doppelter Domänenverzerrung | Prefill-Kurve als leuchtender Grat eingeprägt |

**Auswahl:** beim Laden zufällig einer der drei; **04 ist Rückfallebene** (erste Sitzung,
reduzierte Bewegung, schwache GPU). Der Besucher kann umschalten, die Wahl wird in
`localStorage` gespeichert und überschreibt danach die Zufallswahl.

**Farbrampe** (kalt → heiß), an die OKLCH-Familie der Hauptseite angelehnt, Richtung *plasma*
gezogen — der Farbverlauf des wissenschaftlichen Rechnens:
`#101334` → `#2b4bd8` → `#8b5cf6` → `#f0409c` → `#ffb347`, Cyan `#3ee8f0` als UI-Akzent.

#### Mobil zuerst — nicht als Nachgedanke

**Der überwiegende Teil der Besucher kommt über Mobilgeräte.** Jeder Hintergrund wird im
Hochformat entworfen und erst danach fürs Querformat erweitert, nicht umgekehrt.

- **Nicht stauchen.** Ein `sp.x /= u_asp` gerechneter Shader spreizt im Hochformat
  (Seitenverhältnis ~0,46) die x-Achse um Faktor 2,7 — die Komposition rutscht aus dem Bild.
  Divisor begrenzen (`max(u_asp*k, k')`) und zusätzlich die Komposition über einen
  Hochformat-Faktor `por` überblenden: Fluchtpunkt zur Mitte, Korridor schmaler und höher,
  Rauschzellen weniger breit gezogen.
- **Text nach unten.** Im Hochformat sitzt die Headline unten, der Hintergrund bekommt die
  obere Bildhälfte. Im Querformat steht der Text links.
- **Schleier statt Abdunkeln.** Lesbarkeit über einen Verlauf hinter dem Text lösen
  (unten hoch auf Mobil, links nach rechts auf Desktop), nicht durch Herunterregeln des
  Hintergrunds — sonst verliert man genau die Farbigkeit, für die man den Shader gebaut hat.
- **Volle Pixeldichte.** Kein harter DPR-Deckel bei 1,25; auf einem Gerät mit Faktor 3 rendert
  das mit einem Drittel der nativen Auflösung und sieht weich aus. Stattdessen volle Dichte bis
  zu einem Pixelbudget (~2,6 Mio. Pixel), darüber proportional herunterskalieren.

#### Verbindliche Regeln für alle Hintergrund-Shader

Teuer gelernt am 03.09.2026: Entwurf 04 war auf einem Android-Handy komplett schwarz, während
Entwurf 03 einwandfrei lief.

1. **Kein arithmetischer Rausch-Hash.** Weder `fract(sin(dot(p,…))*43758.5453)` noch der
   sinusfreie Hoskins-Hash `fract((q.x+q.y)*q.z)`. Beide brauchen fp32-Zwischenwerte im
   Tausenderbereich. Viele Mobil-GPUs (Mali, Adreno) rechnen im Fragment-Shader auch bei
   deklariertem `highp` gröber — dann ist der Abstand zweier darstellbarer Zahlen größer als 1
   und `fract()` liefert konstant 0. Das Rauschfeld kollabiert zu einer Fläche.
   **Stattdessen:** 256 × 256 Rauschtextur auf der CPU erzeugen, `REPEAT`/`LINEAR`, und
   `texture2D(u_noise, (floor(p)+smoothstep(fract(p))+0.5)/256.0)`. Alle Werte bleiben in
   [0,1], die Interpolation macht die Hardware — und es ist schneller als vier Hash-Aufrufe.
2. **`precision highp float` mit Fallback** über `#ifdef GL_FRAGMENT_PRECISION_HIGH` in jedem
   Fragment-Shader. Notwendig, aber nicht hinreichend — siehe Regel 1.
3. **Zeit umbrechen.** `u_t` darf nicht unbegrenzt wachsen, sonst frisst `sin(u_t*k)` auch auf
   dem Desktop nach Minuten die Präzision. Umbruch bei 3600 s.
4. **Nicht rechnen, was nicht sichtbar ist.** `IntersectionObserver` pausiert Canvas außerhalb
   des Sichtbereichs; pausiert wird mit 4 fps statt 60 gezeichnet; Tab im Hintergrund pausiert.
5. **Kontexte sparen.** iOS begrenzt gleichzeitige WebGL-Kontexte hart. Nie mehr als einer
   gleichzeitig aktiv, wenn eine Vollbildansicht offen ist.
6. **GPU-Diagnosezeile** einbauen (`getShaderPrecisionFormat`, `WEBGL_debug_renderer_info`).
   Auf einer Benchmark-Seite ist das inhaltlich passend und spart bei Fehlerberichten eine
   Rückfrage-Runde.
7. **`prefers-reduced-motion`** friert auf ein Standbild ein statt abzuschalten, plus
   sichtbarer Pause-Schalter (WCAG verlangt eine Abschaltmöglichkeit für Dauerbewegung).
8. **Fallback ohne WebGL:** exportiertes WebP-Standbild.

---

## 4. Detailseite

### 4.1 Rahmen

Wir liefern einen **Copy-exact Kopf- und Fußblock**, den das Modell wörtlich einfügt. Damit
bleibt die Seite ein einzelnes eigenständiges Dokument, die Navigation ist überall gleich, und
wir fassen die Modellausgabe nie an. Der Validator prüft, dass beide Blöcke unverändert
vorhanden sind.

```
← Alle Modelle    Qwen3.8-27B Q4_XL    DE/EN        ← Kopf, copy-exact
┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄

        alles dazwischen gehört dem Modell

┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
Validator 9/9 · run.json · Rohlog · CC-BY          ← Fuß, copy-exact
```

Der Kopf trägt außerdem den Hinweis **„Design und Layout dieser Seite wurden von diesem Modell
erzeugt"** — ohne den liest ein Besucher die Seite als unsere Gestaltung und die ganze Idee geht
verloren.

### 4.2 Die zehn Pflichtabschnitte

| # | `id` | Inhalt |
|---|---|---|
| 1 | `#head` | Selbstgenerierte Marke · Modell, Quant, Hardware, Datum · ein Satz Fazit aus `copy.verdict` |
| 2 | `#verdict` | Decode-Median, Prefill 8 K, Wall-Clock, Selbstkorrekturen, Tests, Build-Status |
| 3 | `#manifest` | Vollständiges Run-Manifest inkl. kopierbarer Startzeile und Sampler-Werten |
| 4 | `#perf` | Prefill- und Decode-Verlauf über die Kontexttiefe als Diagramm |
| 5 | `#cost` | Wh pro 1 000 Tokens, Tokens/Watt, €/MTok gegen Cloud-Referenz |
| 6 | `#artifact` | Spielbare Demo, Video-Loop, Screenshots, Asciinema-Cast |
| 7 | `#vision` | Bild-Benchmark: SVG-Nachbau des Diagramms + Trefferquoten beider Aufgaben |
| 8 | `#quality` | Objektive Metriken, Rubrik-Note, Voting-Widget |
| 9 | `#failures` | Fehler, Selbstkorrekturen, nicht Geschafftes — ungeschönt |
| 10 | `#repro` | Konfiguration übernehmen, Modelcard, Rohdaten-Download, externe Belege, Zitierhinweis |

### 4.3 Die selbstgenerierte Marke

Vertragsbestandteil, im Dokument als `<svg id="model-mark">`:

- `viewBox="0 0 64 64"`, quadratisch
- einfarbig über `currentColor`, damit sie in beiden Themes und auf den Karten funktioniert
- lesbar bei 24 px
- keine Rasterbilder, keine externen Referenzen, keine `<image>`-Tags
- höchstens ~4 KB

Briefing an das Modell, bewusst knapp: *„Entwirf eine Marke für dich selbst — deinen Namen,
deine Architektur oder deinen Charakter."* Mehr nicht, sonst misst man Anweisungsbefolgung statt
Gestaltung.

Der Harness extrahiert die Marke nach `runs/<slug>/logo.svg`, sanitisiert sie (kein `<script>`,
kein `href`) und die Shell zeigt sie auf den Modellkarten und als Punktmarke im
Vergleichsdiagramm. Das Modell schreibt weiterhin nur eine einzige Datei.

### 4.4 Frei ⟷ fix

| Das Modell entscheidet | Das Modell erbt |
|---|---|
| Farbpalette, Hell/Dunkel-Konzept | Alle Zahlen, wörtlich aus `run.json` |
| Typografie und Schriftpaarung | Reihenfolge und `id` der zehn Abschnitte |
| Layout, Raster, Dichte | Beide Sprachfassungen samt `data-i18n`-Schlüsseln |
| Diagrammform und -stil | Einbettungspfade für Demo, Loop, Cast |
| Bewegung, Mikrointeraktion, Illustration | Kopf- und Fußblock, wörtlich |
| **Die eigene Marke** | Marken-Spezifikation (viewBox, currentColor, Größe) |

### 4.5 Referenzdaten für den Pflicht-Chart

Prefill-Momentanrate, Qwen3.8-27B UD-Q6 auf der R9700, Build `bd9bd1b`, gemessen an Task 0 mit
180 396 Tokens (aus `qwen3.8-27b-rdna4-quant-eval/RESULTS.md`):

| Tiefe | 8 K | 16 K | 34 K | 67 K | 100 K | 132 K | 164 K |
|---|---:|---:|---:|---:|---:|---:|---:|
| t/s | **498,3** | 423,1 | 323,0 | 223,3 | 172,4 | 139,6 | **118,0** |

Faktor **4,2** von 8 K auf 164 K; der 180-K-Prompt allein brauchte 16,6 Minuten. Genau diese Kurve
erklärt, warum Kontextlänge und nicht Spitzen-t/s über die Alltagstauglichkeit entscheidet.

---

## 5. `run.json` als einzige Wahrheit

Vor jedem Seitenbau erzeugt Agent A aus Rohlog, CSV und Projektordner eine `run.json`. Diese Datei
wird **wörtlich in den Prompt des Modells eingesetzt**. Das Modell recherchiert nichts, rechnet
nichts und übersetzt nichts — es gestaltet nur. Das ist die Bedingung dafür, dass die Seiten
inhaltlich identisch sind und der Vergleich fair bleibt.

```jsonc
{
  "slug": "qwen38-27b-q4xl--moorhuhn--r9700--001",
  "model":    { "name": "Qwen3.8-27B", "quant": "UD-Q4_K_XL", "params_b": 27,
                "card_url": "https://huggingface.co/…", "license": "Apache-2.0" },
  "hardware": { "id": "r9700", "gpu": "Radeon AI PRO R9700", "vram_mib": 32624,
                "allocatable_gib": null, "arch": "gfx1201 (RDNA4)",
                "cpu": "Core Ultra 7 265KF", "ram_gib": 63.6,
                "driver": "Adrenalin 26.6.4", "vulkan_icd": "amdvlk64 9.2.10.395",
                "os": "Windows 11 Pro 26200" },
  "runtime":  { "engine": "llama.cpp", "build": "bd9bd1b", "backend": "Vulkan",
                "kv_cache": "q8_0 / turbo4", "ubatch": 128, "ctx": 262144,
                "speculative": "MTP2 + ngram-mod 24/48/64",
                "cmdline": "llama-server -m … -ngl 99 -c 262144 …",
                "gguf_url": "https://huggingface.co/…", "gguf_gb": 16.4,
                "sampler": { "temp": 0.7, "top_p": 0.8, "top_k": 20, "seed": 42 } },
  "perf": {
    "decode_tps":    { "min": 13.93, "median": 26.43, "max": 42.39, "n": 35 },
    "prefill_curve": [ {"ctx_k":   8, "tps": 498.3}, {"ctx_k":  16, "tps": 423.1},
                       {"ctx_k":  34, "tps": 323.0}, {"ctx_k":  67, "tps": 223.3},
                       {"ctx_k": 100, "tps": 172.4}, {"ctx_k": 132, "tps": 139.6},
                       {"ctx_k": 164, "tps": 118.0} ],
    "decode_by_depth": [ /* … */ ], "draft_acceptance": 0.553, "mean_len": 2.84,
    "prefill_with_image": { "img_tokens": null, "tps": null } },
  "effort":  { "wall_clock_min": 114.5, "tokens_generated": 119627,
               "tool_calls": 412, "self_repairs": 15, "ctx_peak": 180396,
               "energy_wh": null, "cost_eur": null },
  "quality": { "tests_passed": 104, "tests_failed": 0, "tsc_errors": 0,
               "lint": 0, "bundle_kb": 1432, "loc": 8214, "lighthouse": 96,
               "rubric": { "gameplay": 4, "visual": 5, "code": 4, "scope": 4, "total": 17 } },
  "vision":  { "a_extract": { "fields_total": 24, "correct": 19, "hallucinated": 1 },
               "a_redraw":  { "svg": "vision/dashboard.svg", "rubric": 3 },
               "b_pricetags": { "precision": 0.87, "recall": 0.73, "hallucinated": 2 } },
  "failures": [ { "de": "Hit-Test 15× nachgebessert",
                  "en": "Hit test patched 15 times" } ],
  "media":   { "demo": "demo/index.html", "loop": "media/loop.webm",
               "shots": [ /* … */ ], "cast": "media/cast.cast" },
  "links":   { "repo": "https://github.com/…", "raw_log": "raw/llama.cpp.log",
               "youtube": [ /* … */ ], "external_bench": [ /* … */ ] },
  "copy":    { "verdict": { "de": "…", "en": "…" }, "sections": { /* … */ } }
}
```

> **Präzisionsfalle.** Der Ryzen AI Max+ 395 hat **128 GB unified LPDDR5X, nicht 128 GB VRAM** —
> unter Windows sind typisch bis ~96 GB als GPU-Speicher zuweisbar. Das Schema trennt deshalb
> `ram_gib` von `vram_mib` und erzwingt bei Unified-Memory ein Feld `allocatable_gib`. Auf einer
> Benchmark-Seite prüft genau das jemand nach.

---

## 6. Bild-Benchmark

Zwei eigene Bilder, beide von Kai, beide **nicht in öffentlichen Trainingsdaten** — damit kein
Ablaufdatum durch Kontamination und kein Rechteproblem.

### 6.1 Die Bilder

**Bild A — Dashboard-Screenshot** (`Screenshot lokal ai diagram.png`, 1280 × 1119).
Eigenes interaktives Dashboard: Liniendiagramm „AA Intelligence Index" über Zeit, Filter-Chips,
Vergleichs-Tooltip mit 4 × 2 Zahlen, Serienbeschriftungen, Legende, drei KPI-Kacheln, winzige
Fußnoten. Verlangt Achsenlesen, OCR über fünf Schriftgrößen, Zuordnung Beschriftung → Datenpunkt
und Verständnis eines UI-Zustands. Deutlich anspruchsvoller als ein Blockdiagramm.

**Bild B — Convention-Stand** (`20260829_114402.jpg`, 4000 × 3000).
Cosplay-Masken auf einem Messestand: 40+ Objekte, Preisschilder in Doppelwährung, Produktnamen,
Kartonaufschriften, Banner, glänzende Reflexionen, starke Verdeckung, Tiefenstaffelung.

### 6.2 Vorbereitung — verbindlich, einmalig

1. **EXIF-Rotation einbacken.** Bild B trägt `Orientation = 6`. Browser drehen es aufrecht, viele
   Bildpipelines nicht — das Ergebnis hinge sonst davon ab, ob der Client EXIF beachtet. Drehung
   in die Pixel schreiben, EXIF-Block entfernen.
2. **Gesichter weichzeichnen.** Auf Bild B sind Standbesucher erkennbar. Weichzeichnen, bevor das
   Bild festgelegt wird — dann sind veröffentlichtes Bild, Modell-Eingabe und Lösungsschlüssel
   identisch.
3. **Auf 1568 px lange Kante skalieren**, beide Bilder. Macht den Bildtokenverbrauch über alle
   Runtimes vergleichbar.
4. **SHA-256 festhalten** und im Repo hinterlegen. Ohne Prüfsumme ist nicht belegbar, dass alle
   Modelle dasselbe Bild gesehen haben.

Erst danach wird der Lösungsschlüssel geschrieben — **aus dem vorbereiteten Bild in voller
Auflösung**, nicht aus einer verkleinerten Ansicht.

### 6.3 Aufgaben

**A1 — Extrahieren (Bild A).** JSON mit: den vier Tooltip-Zeilen samt beiden Spalten (8 Zahlen),
den drei KPI-Kacheln (Wert + Beschriftung), den aktiven Filter-Chips, der Achsenbeschriftung und
dem Fußnotentext.
*Gewertet wird ausschließlich, was im Bild steht* — keine Frage, die ein Modell aus Weltwissen
beantworten könnte. Sonst misst man Erinnerung statt Wahrnehmung.

**A2 — Nachbauen (Bild A).** Das Liniendiagramm als eigenständiges SVG rekonstruieren: Achsen,
Serien, Beschriftungen, Legende. Bewertet nach Rubrik plus strukturellen Prüfungen (Anzahl
Serien, Anzahl beschrifteter Punkte, Achsenbereich). Liefert nebenbei das sehenswerteste
Artefakt der ganzen Seite.

**B — Preisschilder (Bild B).** JSON-Liste aller Preisschilder: `{name, gbp, eur}`.
Eindeutig abzählbar, daraus fallen **Präzision, Recall und Halluzinationsrate** direkt heraus.
Eingebaute Falle: mindestens ein Schild führt die Währungen in vertauschter Reihenfolge
(`€45/£35` statt `£…/€…`).

> Der Lösungsschlüssel ist noch nicht geschrieben. Beim Sichten bei Anzeigeauflösung waren
> mehrere Schilder nur teilweise lesbar — er muss am vorbereiteten Bild in voller Auflösung
> entstehen, sonst wird die eigene Referenz zur Fehlerquelle.

### 6.4 Nebenmessung

Beide Bilder liefern kostenlos eine zusätzliche Größe: **Prefill-Rate mit Bildanteil** und die
Zahl der Bildtokens (`perf.prefill_with_image`). Optional dieselbe Aufgabe nochmal bei ~100 K
Kontext — dort bricht Vision bei lokalen Modellen erfahrungsgemäß zuerst weg.

### 6.5 Darstellung

- **`/vision`** — eigene Seite: beide Bilder oben, darunter alle Modelle nebeneinander.
  Die SVG-Nachbauten des Dashboards direkt untereinander ist der Direktvergleich, der geteilt
  wird. Dazu eine Tabelle mit Präzision/Recall/Halluzination je Modell.
- **`#vision`** — Abschnitt 7 jeder Detailseite: der eigene Nachbau plus die eigenen Trefferquoten.

---

## 7. Der Harness

Zwei getrennte Agenten. Vermischen wäre Ergebnisfälschung.

**Agent A — Vorbereitung** läuft mit einem starken Modell (Claude), einmal pro Lauf, *bevor* der
Kandidat drankommt: extrahiert Timings aus `llama.cpp.log`, zählt Tool-Calls und
Selbstkorrekturen, misst Bundle und Tests, nimmt Screenshots und den Video-Loop auf, wertet die
Bild-Benchmark-Antworten gegen den Lösungsschlüssel aus, schreibt `run.json` und validiert es
gegen das Schema.

**Agent B — Seitenbau** ist der Benchmark. Er bekommt exakt dieselben Prompt-Bytes für jedes
Modell, keinen Netzzugang und genau einen Versuch. Alles, was Agent A vorbereitet hat, liegt als
Datei bereit — der Kandidat gestaltet nur.

```
harness/
├── .github/
│   ├── agents/benchmark-page.agent.md    # Agent B — der Kandidat
│   ├── agents/run-prep.agent.md          # Agent A — Claude, Vorbereitung
│   ├── instructions/page.instructions.md # applyTo: runs/**/page/*.html
│   └── prompts/build-page.prompt.md      # /build-page <slug>
├── contract/
│   ├── sections.md            # die 10 Abschnitte, wörtlich
│   ├── mark.md                # Spezifikation der selbstgenerierten Marke
│   ├── copy-exact/            # fertige Bausteine zum Einfügen
│   │   ├── header.html        # Kopfleiste, Pflicht
│   │   ├── footer.html        # Fußblock, Pflicht
│   │   ├── i18n-toggle.html   # 14 Zeilen, getestet
│   │   ├── theme-tokens.css   # Hell/Dunkel-Gerüst
│   │   └── chart-helper.js    # optionaler SVG-Zeichner
│   └── anti-patterns.md
├── schema/run.schema.json
└── tools/
    ├── verify.mjs             # npm run verify -- <slug>
    ├── extract-mark.mjs       # zieht logo.svg aus der Seite, sanitisiert
    └── score-vision.mjs       # wertet gegen den Lösungsschlüssel aus
```

**Werkzeugumfang für Agent B** — bewusst schmal: Dateien lesen, **eine** Datei schreiben,
`npm run verify` ausführen. **Kein `fetch`, kein Web** — sonst hängt das Ergebnis davon ab, welches
Modell gerade Glück beim Suchen hat, und der Vergleich ist wertlos. Vision bleibt an, damit das
Modell die Screenshots seines eigenen Spiels sieht und die Seite farblich darauf abstimmen kann.

> In VS Code 1.135 ist Copilot Chat eingebaut. Ob die Agentendateien dort als
> `.github/chatmodes/*.chatmode.md` oder bereits als `.github/agents/*.agent.md` erwartet werden,
> ist gegen die laufende Installation zu prüfen, bevor sie geschrieben werden. Der Inhalt ist in
> beiden Fällen identisch.

---

## 8. Qualitätshebel

Ein One-Shot mit einem lokalen 27B scheitert selten am Geschmack und fast immer an Mechanik:
fehlende schließende Tags, halb erfundene Zahlen, ein Diagramm mit vertauschten Achsen, Text der
aus seinem Container läuft. Diese sechs Hebel adressieren genau das.

| Hebel | Warum er wirkt |
|---|---|
| **Copy-exact-Blöcke** | Kopf, Fuß, Sprachumschalter, Theme-Gerüst und optional der Diagramm-Zeichner liegen fertig und getestet bereit. Schwache Modelle scheitern am Erfinden, nicht am Kopieren. Größter Einzelhebel. |
| **Eine Datei, ein Write** | Reduziert die Werkzeug-Fehlerfläche auf einen einzigen Aufruf. Kein Build-Schritt, der schiefgehen kann. |
| **Zahlen nur zitieren** | „Jede Zahl muss wörtlich in `run.json` stehen. Erfinde nichts." Macht Halluzination mechanisch prüfbar statt zur Geschmacksfrage. |
| **Checkliste am Prompt-Ende** | Modelle gewichten das Prompt-Ende überproportional. Die zehn Abschnitte und die Verbotsliste stehen doppelt: einmal ausführlich, einmal als Kurzliste ganz zuletzt. |
| **Ausgabebudget** | Obergrenze ~1 400 Zeilen. Jenseits davon bricht bei lokalen Modellen die Kohärenz weg — und mit `ngram-mod` fällt der Decode ohnehin ab. |
| **Anti-Pattern-Liste** | Kein Lorem, keine Platzhalterbilder, keine externen CDNs außer der Schriftquelle, kein `alert()`, kein `position: fixed` über dem Inhalt, nichts bei `opacity: 0` auf einen Observer wartend. |

**Fairnessregel:** Ob ein Modell den mitgelieferten Diagramm-Helfer benutzt oder selbst gezeichnet
hat, steht auf der Seite. Das ist keine Schummelei, sondern eine Messgröße — der Helfer ist die
Untergrenze, alles darüber ist Verdienst des Modells.

---

## 9. Zweisprachig ohne Fehlerquelle

Zweisprachigkeit ist der riskanteste Teil des One-Shots. Die Lösung: `run.json` liefert jeden
Prosastring als `{de, en}`-Paar, das Modell setzt nur `data-i18n`-Attribute und fügt diesen
getesteten Block wörtlich ein. Damit kann kein Modell durch bessere Übersetzung punkten — was den
Vergleich sonst verzerren würde.

```html
<!-- contract/copy-exact/i18n-toggle.html — wörtlich einfügen -->
<button id="lang" type="button" aria-label="Sprache wechseln">DE / EN</button>
<script>
  const T = /* aus run.json.copy eingesetzt */;
  let L = (navigator.language || "de").startsWith("de") ? "de" : "en";
  function paint() {
    document.documentElement.lang = L;
    document.querySelectorAll("[data-i18n]").forEach(el => {
      const v = T[el.dataset.i18n]; if (v) el.textContent = v[L];
    });
    document.getElementById("lang").textContent = L === "de" ? "EN" : "DE";
  }
  document.getElementById("lang").addEventListener("click", () => {
    L = L === "de" ? "en" : "de"; paint();
  });
  paint();
</script>
```

---

## 10. Was gemessen wird

Fünf Gruppen, getrennt ausgewiesen, damit klar bleibt, was gemessen und was beurteilt ist.

| Gruppe | Größen | Quelle |
|---|---|---|
| **Geschwindigkeit** | Decode min/Median/max · Prefill-Kurve über Tiefe · Decode nach Tiefe · Draft-Akzeptanz · mean len · Prefill mit Bildanteil | `llama.cpp.log` |
| **Aufwand** | Wall-Clock · erzeugte Tokens · Tool-Calls · **Selbstkorrekturen** · Kontext-Peak · Wh/1 k Tok · €/MTok | Log + Wattmeter |
| **Objektive Qualität** | Tests grün/rot · `tsc`-Fehler · Lint · Bundle-KB · LOC · Coverage · Lighthouse | Agent A, automatisch |
| **Bildverstehen** | Feldgenauigkeit (Bild A) · Rubrik des SVG-Nachbaus · Präzision/Recall/Halluzination (Bild B) | Lösungsschlüssel |
| **Beurteilte Qualität** | Rubrik 4 × 0–5: Spielgefühl · Präsentation · Codequalität · Umfang. Plus Community-Voting, separat. | Kai + Besucher |

**Die Metrik, die diese Seite einzigartig macht.** In `Moorhuhn Qwen 3.6 27b Q6` liegen
**15 Reparaturskripte** — `fix_hit.cjs`, `fix_coords_final.cjs`, `fix_coords_proper.cjs`,
`fix_hitbox_big.cjs` … Kein Leaderboard der Welt zeigt, wie oft ein Modell sich selbst reparieren
musste, bis es saß. Genau das entscheidet aber, ob man mit einem Modell arbeiten will.
`self_repairs` ist deshalb Pflichtfeld und steht im Abschnitt „Was schiefging".

---

## 11. Validator

`npm run verify -- <slug>` prüft mechanisch und schreibt sein Ergebnis zurück nach `run.json`.
Eine Seite, die durchfällt, wird trotzdem veröffentlicht — mit sichtbarer Mängelliste. Das *ist*
das Benchmarkergebnis.

- HTML parst sauber, alle Nicht-Void-Elemente geschlossen
- Alle zehn Pflicht-`id`s vorhanden, in der richtigen Reihenfolge
- Kopf- und Fußblock unverändert vorhanden
- `<svg id="model-mark">` vorhanden, quadratischer viewBox, keine externen Referenzen, ≤ 4 KB
- Jede Zahl auf der Seite kommt in `run.json` vor *(Halluzinationsprüfung)*
- Beide Sprachen vollständig, keine fehlenden `data-i18n`-Schlüssel
- Keine externen Requests außer der erlaubten Schriftquelle
- Seitengewicht unter Budget, Demo-Ordner vorhanden und startbar
- `axe-core` ohne kritische Verstöße, Fokus sichtbar, beide Themes lesbar

---

## 12. Öffentliches Repo

Vorschlag: `github.com/securesight-ai/local-llm-benchmarks`, öffentlich. Hinein kommen alle
`run.json`, die Prompts, die Startzeilen und Server-Konfigurationen, die Modelcards mit
abweichenden Parametern, die Rohlogs, die vorbereiteten Referenzbilder samt Prüfsummen, der
Validator und die Rubrik. Die vom Modell gebauten Projekte kommen als eigenes Verzeichnis dazu —
sie sind das eigentliche Beweisstück.

Lizenz: Code MIT, Messdaten CC-BY-4.0. Das ist die Kombination, unter der Leute die Zahlen
zitieren dürfen und es dann auch tun.

---

## 13. Deployment, Budget & Recht

Eigenes Cloudflare-Pages-Projekt `benchmark-securesight`, CNAME auf `benchmark.securesight.ai`,
Deploy per `wrangler` wie bei der Homepage.

Die Größen sind entspannt: die gemessenen `dist/`-Builds liegen bei **1,4–1,6 MB mit 2–4 Dateien**,
vier spielbare Demos kosten zusammen etwa 6 MB. Cloudflares Grenzen (25 MiB je Datei, 20 000
Dateien je Deployment) sind weit entfernt. Erst Video-Loops über 25 MB müssten nach R2 ausweichen —
bei 5–15 s WebM unwahrscheinlich.

> **Drei Punkte mit Rechtsbezug.**
> **YouTube-Einbettungen** brauchen in Deutschland eine Zwei-Klick-Lösung: Vorschaubild lokal,
> iframe erst nach Zustimmung. Ohne das setzt Google beim Seitenaufruf Cookies.
> **Community-Voting** kommt als Cloudflare Pages Function mit KV — eine Stimme je Browser über
> `localStorage`, serverseitig gegen gesalzenen IP-Hash begrenzt, kein Cookie, keine Speicherung
> der IP. So bleibt es einwilligungsfrei.
> **Referenzbild B** zeigt Personen; Gesichter werden vor der Veröffentlichung weichgezeichnet
> (§ 6.2).

Zu „Artificial Analysis": ein offizielles Embed-Widget gibt es nicht. Sauber ist ein Deep-Link mit
zitiertem Wert und Abrufdatum — und der Hinweis, dass dort andere Bedingungen gemessen wurden.

---

## 14. Bauphasen

1. **Referenzbilder vorbereiten** — Rotation einbacken, Gesichter weichzeichnen, auf 1568 px skalieren, EXIF strippen, SHA-256 festhalten. Muss vor dem Lösungsschlüssel passieren.
2. **Lösungsschlüssel schreiben** — Bild A (Tooltip, KPI, Chips, Fußnote) und Bild B (alle Preisschilder), aus den vorbereiteten Bildern in voller Auflösung.
3. **Schema und Validator** — `run.schema.json` und `verify.mjs`; sie definieren, was eine gültige Seite überhaupt ist.
4. **Erste `run.json` von Hand** — für den Qwen3.8-Q4-XL-Lauf, aus `RESULTS.md` und `llama.cpp.log`. Deckt Lücken im Schema auf, bevor Automatik draufkommt.
5. **Referenzseite** — eine Detailseite, die den Vertrag vorbildlich erfüllt. Maßstab und Beispiel im Prompt, ohne dass Modelle sie abschreiben können.
6. **Harness schreiben** — Agent A, Agent B, Copy-exact-Blöcke, Markenspezifikation, Anti-Patterns, Prompt-Datei.
7. **Erster echter One-Shot** — Qwen3.8-27B Q4_XL baut seine eigene Seite. Was scheitert, wandert als Regel zurück in den Harness.
8. **Shell bauen** — Start-, Hardware-, Vergleichs-, Vision- und Methodikseite im Marken-Design.
9. **Agent A automatisieren** — Log-Parser, Screenshot- und Loop-Aufnahme, Metrikerhebung, Vision-Auswertung.
10. **Restliche Läufe durchziehen** — jedes Modell einmal, gleiche Prompt-Bytes, ein Versuch.
11. **Voting, Repo, Deploy** — Pages Function, GitHub-Repo öffentlich, CNAME scharf schalten.

---

## 15. Offene Punkte

1. **Eine Seite je Lauf oder je Modell?**
   Zwei Aufgabenfamilien existieren — Moorhuhn und Clair Obscure. Bekommt ein Modell, das beide
   gemacht hat, zwei Detailseiten mit einer Übersicht darüber, oder eine Seite mit zwei
   Aufgaben-Registern?
   *Vorschlag: zwei Seiten, eine Modellübersicht.*

2. **Wie viele Läufe je Kombination?**
   Bei n = 1 darf die Seite keine Streuung behaupten. Bei n = 3 werden Median und Spanne
   belastbar — kostet aber dreimal Laufzeit.
   *Vorschlag: n = 1 starten, Schema trägt `n` von Anfang an.*

3. **Gleiche Quant auf beiden Maschinen?**
   Ohne mindestens eine identische Modell-Quant-Kombination auf AI Max+ 395 und R9700 gibt es
   keinen echten Hardware-Vergleich, nur zwei getrennte Listen.

4. **Energiemessung vorhanden?**
   Wh pro 1 000 Tokens ist die stärkste Zahl gegenüber Cloud-APIs — braucht aber ein
   Steckdosen-Wattmeter oder mindestens `amdsmi`-Sampling während des Laufs.
   *Ohne Messung bleibt das Feld `null` und der Abschnitt zeigt nur Kosten.*

5. **Wer darf mitbenchmarken?**
   Soll das Repo Fremdläufe per Pull Request annehmen — jemand mit einer Strix Halo schickt seine
   `run.json`? Das macht aus der Seite eine Referenz statt einer Sammlung, verlangt aber
   Prüfregeln.

6. **Bekommen Cloud-Modelle den Bild-Benchmark auch?**
   Technisch ja, und der Vergleich wäre aussagekräftig. Dann steht auf `/vision` aber ein
   Cloud-Modell ganz oben — was die Aussage der Seite verschiebt.

---

## Das Testfeld (offen, wächst)

**Die Modellliste ist keine Festlegung.** Sie wächst laufend; weitere Benchmarks liegen auf
einem zweiten Rechner und kommen später dazu. Jede Ansicht muss von neun auf fünfzig und mehr
Läufe wachsen, ohne dass das Layout kippt — das ist eine harte Anforderung an Startseite,
Rangliste und Diagramme, keine Nettigkeit.

Stand heute geplant:

| Block | Hardware | Modelle |
|---|---|---|
| 1 | **AMD Radeon AI PRO R9700** · 32 GB | Qwen 3.6 27B Q6 · Qwen 3.8 27B Q4_XL |
| 2 | **Ecotech Evo X2 · Ryzen AI Max+ 395** · 128 GB unified | qwen3.5-122b-a10b · laguna-s-2.1 UD-Q4_K_XL · deepseek v4 flash 0731 UD-IQ3_XXS · Qwen 3.8 flash next UD-Q4_K_XL |
| 3 | **Cloud-Referenz** | Opus 5 · Sonnet 5 · GPT 5.6 Sol |

Damit ist **Qwen 3.8 27B Q4_XL vs. Qwen 3.8 flash next UD-Q4_K_XL** die naheliegendste
Brücke für den Hardware-Direktvergleich (offener Punkt 3) — sofern eine der beiden Quants auf
beiden Maschinen läuft.

**Folge für die Gestaltung:** Hardware ist eine *Eigenschaft* eines Laufs, keine Gliederungsebene.
Drei feste Blöcke funktionieren bei neun Läufen und zerfallen bei fünfzig — siehe §3.

**Folge für die Farben:** Hardware wird kategorial eingefärbt. Streudiagramme müssen alle
Farbpaare gleichzeitig trennen, und dafür liegt die belastbare Obergrenze bei **drei** Kategorien.
Mit R9700 · Evo X2 · Cloud ist die exakt ausgeschöpft. Kommt eine vierte Maschine dazu, wird
nicht eine vierte Farbe erfunden, sondern auf Farbe × Form umgestellt oder facettiert.

---

## Bestandsaufnahme (Stand 02.09.2026)

Vorhandene Läufe in `E:\Coding\benchmarks`:

| Ordner | dist/ | Bemerkung |
|---|---|---|
| `Moorhuhn Sonnet 5` | 1,6 MB / 3 Dateien | Cloud-Referenz |
| `Moorhuhn Qwen 3.8 27b Q4 XL` | 1,4 MB / 4 Dateien | `llama.cpp.log` 531 KB vorhanden |
| `Moorhuhn Qwen 3.8 27b Q4 XL Medium Reasoning` | 1,6 MB / 3 Dateien | Reasoning-Variante |
| `Moorhuhn Qwen 3.6 27b Q6` | 1,6 MB / 2 Dateien | **15 `fix_*.cjs`-Reparaturskripte** |
| `Moohrhun Opus 5 ULTRACODE` | — | nur `prompt.txt`, Lauf steht aus |
| `Clair Obscure Qwen 3.6 / 3.8 27b` | — | zweite Aufgabenfamilie |
| `qwen3.8-27b-rdna4-quant-eval` | — | Messdatenbasis, `RESULTS.md` + `results/*.csv` |

Referenzbilder (Original, noch unvorbereitet):

| Bild | Datei | Format | Hinweis |
|---|---|---|---|
| A | `C:\Users\KaiFe\Documents\Screenshot lokal ai diagram.png` | 1280 × 1119, PNG | eigenes Dashboard, keine EXIF |
| B | `C:\Users\KaiFe\Downloads\takeout-1-001\20260829_114402.jpg` | 4000 × 3000, JPEG | **EXIF Orientation = 6**, Gesichter sichtbar, 29.08.2026 11:44 |

Homepage-Stack zur Wiederverwendung (`E:\Coding\securesight.ai-homepage\frontend`): React 19,
Vite, Tailwind 4, shadcn/Radix, Recharts, framer-motion, i18next. Farbtokens: `primary #2563eb`,
`secondary #0891b2`, `accent #059669`, `dark.bg #0a0a0a`.
