---
name: benchmark
description: "Der ganze Benchmark in einem Durchgang: Messwerte einlesen, Bilderkennung, eigene Detailseite bauen und veröffentlichen. Einfach 'benchmark' eingeben."
argument-hint: "<slug> für einen bereits gemessenen Lauf, sonst leer lassen"
tools: ['read_file', 'create_file', 'list_dir', 'grep_search', 'runInTerminal', 'fetch']
user-invocable: true
---

# Der Benchmark

Du wirst gerade getestet. Am Ende steht deine eigene Detailseite auf
**benchmark.securesight.ai** — gleicher Inhalt wie bei allen anderen Modellen, aber von
dir gestaltet.

Es gibt zwei Fälle:

| Aufruf | Bedeutung |
|---|---|
| `benchmark <slug>` | Der Lauf ist schon gemessen. Du baust nur Bilderkennung und Seite. |
| `benchmark` | Frischer Lauf. Du liest zuerst das Protokoll ein. |

**Ohne Rückfrage zwischendurch** — außer der einen Frage, falls es ein frischer Lauf ist.

---

## Schritt 0 · Gibt es den Lauf schon?

Sieh zuerst in `harness/laeufe/` nach.

**Wurde dir ein Slug genannt** (z. B. `benchmark qwen38-27b-q4xl-moorhuhn-r9700`) und es
gibt `harness/laeufe/<slug>/run.json`, dann ist dieser Lauf bereits gemessen. Die Zahlen
stehen fest, das Protokoll liegt im öffentlichen Repo.

→ **Überspring Schritt 1 vollständig.** Nichts einlesen, nichts fragen, kein
`npm run lauf`. Geh direkt zu Schritt 2.

Das ist der Normalfall: die Messungen sind gemacht, gebaut werden die Seiten.

**Wurde kein Slug genannt**, ist es ein frischer Lauf und du machst Schritt 1.

---

## Schritt 1 · Nur bei einem frischen Lauf

Frag **einmal**, kurz und in einer Nachricht:

> Drei Dinge brauche ich noch:
> 1. Welche Hardware? (`r9700` oder `evox2`)
> 2. Welche Aufgabe? (z. B. Moorhuhn oder Clair Obscure)
> 3. Wie lange lief der Auftrag, in Minuten?
>
> Und falls du es weißt: Wie oft habe ich einen eigenen Fehler selbst behoben?

Mehr fragst du nicht. Alles andere steht im Protokoll oder ergibt sich.

Dann führ aus:

```
npm run lauf -- --hw <antwort1> --aufgabe "<antwort2>" --minuten <antwort3> --korrekturen <antwort4>
```

Das Skript liest `harness/aktuell/llama.cpp.log`, erkennt Modell, Quantisierung, Build,
Kontext, KV-Cache, Micro-Batch und spekulatives Dekodieren, misst Decode und Prefill,
übernimmt die Medien aus `harness/aktuell/` und schreibt alle Daten.

**Es nennt dir am Ende den Slug.** Den brauchst du für alles Weitere.

Wenn es meldet, dass etwas offen ist — fehlende Bildunterschriften, fehlende Startzeile —
trag das in `data/runs.json` beim neuen Eintrag nach und führ danach
`npm run laufdaten -- <slug>` aus. Die Bildunterschriften kannst du selbst schreiben: du
hast das Ergebnis gebaut und weißt, was auf den Bildern zu sehen ist.

---

## Schritt 2 · Bilderkennung

Zwei Bilder, drei Aufgaben. Beide sind Eigenaufnahmen und stehen in keinem öffentlichen
Trainingsdatensatz — was du schreibst, muss aus dem Bild kommen.

```
harness/bilder/bild-a-dashboard.jpg     900 × 787
harness/bilder/bild-b-stand.jpg        1176 × 1568
```

### Die eine Regel

**Schreib nur, was du siehst.** Kannst du eine Zahl nicht lesen, schreib `null`. Ist ein
Schild verdeckt, lass es weg.

Ein `null` kostet einen Punkt. Eine erfundene Zahl kostet mehr — sie zählt als
Halluzination, und das ist die Zahl, auf die hier am genauesten geschaut wird. Ein Modell,
das seine Grenzen kennt, ist im Alltag brauchbarer als eines, das immer etwas hinschreibt.

Rate nie ein Währungszeichen. `£` und `€` sehen bei starker Drehung ähnlich aus.

### A1 · Ablesen (Bild A)

| Was | Werte |
|---|---|
| Vergleichstabelle im Tooltip: zwei Spaltenüberschriften, vier Zeilennamen, acht Zahlen | 14 |
| Drei Kennzahlkacheln: Titel, großer Wert, Beschreibungstext | 9 |
| Filterreihe: welche aktiv (farbiger Rand), welche grau | 8 |
| Achsenbeschriftung und Achsenwerte | 2 |
| Legendeneinträge | 4 |
| Überschrift, Unterzeile, aktiver Reiter | 3 |

> **Sieh genau hin.** Nicht jede Zeile der Tabelle folgt demselben Muster. Wer überfliegt
> und den Rest fortschreibt, fällt auf.

### A2 · Nachbauen (Bild A)

Das Liniendiagramm als eigenständiges SVG: alle Serien in ihren Farben, Achsen mit
Beschriftung, Legende, die beschrifteten Punkte, die du sicher liest. `viewBox`, keine
feste Pixelgröße, lesbar ab 400 px Breite.

Kein Pixelnachbau — bewertet wird die Struktur. **Dieses SVG kommt gleich auf deine
Seite.** Gib dir Mühe.

### B · Preisschilder (Bild B)

Ein Messestand. **Gewertet wird nur der Ausschnitt** von der linken Bildkante bis x = 700,
von y = 950 bis zum unteren Rand. Dort liegen die Schilder flach zur Kamera. Außerhalb
darfst du nennen, es zählt nicht.

```json
{ "name": "REDHOOD ARKHAM", "gbp": 80, "eur": 65, "reihenfolge": "gbp_zuerst", "sicher": true }
```

`reihenfolge` ist `"gbp_zuerst"` oder `"eur_zuerst"` — je nachdem, was **oben bzw. zuerst**
auf dem Schild steht. Das ist Teil der Wertung. `null` für alles Unlesbare,
`sicher: false` bei Zweifeln.

Zähl am Ende, wie viele Schilder du im Wertungsbereich **siehst** — auch die unlesbaren.

### Ergebnis ablegen

Schreib `harness/ergebnisse/<slug>-vision.json`:

```json
{
  "slug": "<slug>", "modell": "<dein Name und Quantisierung>", "datum": "JJJJ-MM-TT",
  "a1_ablesen": { "…": "die Struktur aus A1" },
  "a2_nachbau": { "svg": "<svg …>…</svg>" },
  "b_schilder": { "gefunden": [], "sichtbar_gesamt": 0, "nicht_lesbar": 0 },
  "selbsteinschaetzung": { "schwierigstes": "…", "unsicher_bei": ["…"] }
}
```

Die Selbsteinschätzung ist kein Beiwerk. Sie zeigt, ob du deine eigenen Grenzen kennst.

**Siehst du keine Bilder?** Sag es direkt und mach mit Schritt 3 weiter. Dann fehlt dem
Endpunkt `--mmproj`; das ist kein Fehler von dir. In `#vision` steht dann, dass für diesen
Lauf keine Bilderkennung verfügbar war.

---

## Schritt 3 · Deine Seite

Jetzt baust du `pages/<slug>/index.html` — genau eine Datei.

Alle Modelle bekommen dieselben Daten, dieselben zehn Abschnitte, denselben Kopf und Fuß.
Was sich unterscheidet, ist die Gestaltung. Wer zwei Modellseiten nebeneinander öffnet,
sieht dieselbe Information — und zwei völlig verschiedene Handschriften.

Das ist der eigentliche Test. Nicht Geschwindigkeit, nicht Anweisungsbefolgung.
**Gestaltungsvermögen unter echten Bedingungen.**

### Zuerst lesen

| Datei | Was drinsteht |
|---|---|
| `harness/laeufe/<slug>/run.json` | **Alle Zahlen und Texte.** Deine einzige Quelle. |
| `harness/vertrag/gestaltung.md` | **Die Design-Regeln. Lies sie ganz.** |
| `harness/vertrag/abschnitte.md` | Die zehn Pflichtabschnitte mit ihren `id`-Werten |
| `harness/vertrag/marke.md` | Wie deine selbstgezeichnete Marke aussehen muss |
| `harness/vertrag/copy-exact/kopf.html` | Kopfblock — wörtlich übernehmen |
| `harness/vertrag/copy-exact/fuss.html` | Fußblock — wörtlich übernehmen |
| `harness/vertrag/copy-exact/diagramm.js` | Optionaler Diagramm-Helfer |

In `#vision` kommt, was du in Schritt 2 herausgefunden hast — dein SVG-Nachbau und deine
eigenen Zahlen.

### Der spielbare Build

Sieh in `run.json` unter `medien.demo` nach.

**Ist `medien.demo` null** — kein Rahmen, kein Startknopf. Schreib einen Satz, warum
nicht gespielt werden kann, und lass Video und Bilder stehen. Ein Knopf, der ins Leere
führt, lässt die Seite kaputt aussehen statt ehrlich.

**Ist `medien.demo` gefüllt**, liegt dein Build unter `demo/` neben dieser Seite. Der
Rahmen sieht **genau so** aus — jede Abweichung meldet `npm run pruefe`:

```html
<figure>
  <div class="deckel" id="deckel">
    <img src="../../media/DEIN_STANDBILD" width="…" height="…" alt="…">
    <button type="button" id="starten">Spiel starten · 0,3 MB</button>
  </div>
  <iframe id="demo" src="about:blank" data-src="demo/index.html"
          title="TITEL, spielbar im Browser" width="1280" height="720"
          sandbox="allow-scripts" allow="fullscreen" hidden></iframe>
  <button type="button" id="demo-halt" hidden>Spiel beenden</button>
  <figcaption>… Steuerung und Grenzen aus medien.demo …</figcaption>
</figure>

<script>
(function () {
  var r = document.getElementById('demo'),
      deckel = document.getElementById('deckel'),
      halt = document.getElementById('demo-halt');

  document.getElementById('starten').addEventListener('click', function () {
    r.src = r.dataset.src;            // erst jetzt lädt das Spiel
    r.hidden = false; halt.hidden = false; deckel.hidden = true;
    // Zwei WebGL-Kontexte sind auf einem Telefon einer zu viel
    if (window.bewegungPausieren) window.bewegungPausieren(true);
  });

  halt.addEventListener('click', function () {
    r.src = 'about:blank';            // nimmt Ton, Zeitgeber und WebGL zurück
    r.hidden = true; halt.hidden = true; deckel.hidden = false;
    if (window.bewegungPausieren) window.bewegungPausieren(false);
  });
})();
</script>
```

**Vier Regeln, jede aus einem geprüften Grund:**

- **`src="about:blank"`, das Ziel in `data-src`.** Das Spiel lädt erst beim Klick.
  `loading="lazy"` genügt nicht — das lädt, sobald der Abschnitt in Sicht kommt.
- **`sandbox="allow-scripts"`, sonst nichts.** Vor allem **kein** `allow-same-origin`.
  Nachgemessen: das Spiel läuft damit einwandfrei, und der Rahmen kommt weder an
  `parent` noch an `localStorage` noch an die Cookies dieser Seite — alles wirft
  `SecurityError`. Mit `allow-same-origin` dürfte er sein eigenes `sandbox`-Attribut
  entfernen und danach diese Seite umschreiben.
- **Kein `autoplay` in `allow`.** Ein Spiel, das im Bus von selbst Ton macht, ist ein
  Fehler. Der Ton beginnt nach der ersten Berührung im Rahmen.
- **`width` und `height` am Rahmen**, aus `medien.demo`. Ohne sie springt das Layout.
- **Ein Knopf `id="demo-halt"`**, der `src` wieder auf `about:blank` setzt. Ein Rahmen,
  den man nicht schließen kann, läuft weiter — mit Ton, GPU und Akku. Ein leeres `src`
  genügt dafür nicht; nur `about:blank` gibt die Ressourcen wirklich frei.

Die Größe auf dem Knopf ist `medien.demo.uebertragung_mb` — was über die Leitung geht,
nicht was auf der Platte liegt. Schreib `medien.demo.steuerung` und `medien.demo.grenze`
in die Bildunterschrift: wie man spielt, und wo es nicht geht.

### Vier Regeln, die nicht verhandelbar sind

**1 · Jede Zahl steht wörtlich in `run.json`.** Erfinde nichts, runde nichts, rechne
nichts um. Wo `null` steht, schreibst du **„nicht gemessen"**. Die ganze Messreihe ist
wertlos, sobald eine erfundene Zahl darin steht.

**2 · Kopf- und Fußblock kommen wörtlich.** Kopieren, die `⟨…⟩`-Stellen füllen, sonst
nichts ändern. Der Kopfblock öffnet ein `<div class="rh-page">`, der Fußblock schließt es.
Alles dazwischen gehört dir.

**3 · Eine Datei.** CSS in ein `<style>`, JavaScript in ein `<script>`, alles im selben
Dokument. Von außen kommen nur Google Fonts und die beiden Skripte aus dem Fußblock.

**4 · Jeder Textblock braucht eine eigene Fläche.** Über deiner Seite liegt ein bewegter
Hintergrund mit hellen Stellen. Ein Rahmen ohne `background` genügt nicht — dahinter läuft
der Hintergrund weiter durch, und der Text verschwindet. Häufigster Fehler auf diesen
Seiten; der Validator prüft ihn.

### Der Hintergrund

Derselbe wie auf der Startseite, aus `../../assets/bg.js`. Über Kopf- und Fußblock
eingebunden, nicht anfassen. **Deine Aufgabe ist, deine Flächen darauf abzustimmen** —
prüfe den Kontrast über der *hellsten* Stelle, nicht über der dunkelsten.

```css
.flaeche{ background: rgba(9,7,24,.86);
          border: 1px solid rgba(236,233,255,.10); border-radius: 15px;
          backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); }
```

Ein Ausgangspunkt, kein Zwang. Ein ganz anderes Konzept — helle Flächen, harte Kanten, ein
anderer Akzent — ist ausdrücklich willkommen, solange der Kontrast stimmt.

### Deine Marke

Entwirf ein Zeichen für dich selbst, als `<svg id="modell-marke">` in Abschnitt 1.
Bedingungen in `marke.md`. Es erscheint später auf der Startseite als dein Punkt im
Vergleichsdiagramm — das Einzige auf der Seite, das nur dir gehört.

### Recherche und Größe

`fetch` ist erlaubt: CSS nachschlagen, Schriftpaarungen suchen, Effekte verstehen.
**Zu Technik und Gestaltung, nicht zum Inhalt.** Die Zahlen kommen aus `run.json`.

Etwa **1 400 Zeilen** sind die Obergrenze. Darüber bricht die Kohärenz weg. Lieber acht
Abschnitte, die sitzen, und zwei knappe, als zehn, die auseinanderfallen.

---

## Schritt 4 · Prüfen und veröffentlichen

```
npm run pruefe -- <slug>
```

Geprüft werden: die zehn Abschnitte und ihre Reihenfolge, der unveränderte Rahmen, deine
Marke, **jede Zahl gegen `run.json`**, fremde Skripte, `width`/`height` an Bildern — und ob
irgendwo Text ohne eigene Fläche steht.

**Beheb jede Meldung und lass es erneut laufen, bis es sauber durchläuft.** Das gehört zum
Durchgang, nicht zur Nachbesserung. Danach:

```
npm run bauen
```

Fertig. Die Seite liegt unter `dist/m/<slug>/index.html`, die Startseite verlinkt sie, der
Zähler dort springt eins weiter.

Sag zum Schluss in zwei Sätzen, welche gestalterische Entscheidung du getroffen hast und
warum — als Notiz für den, der später zwei Seiten vergleicht. Und nenn den Pfad, unter dem
die Seite jetzt liegt.

---

## Kurzliste

- [ ] Bei frischem Lauf: `npm run lauf` ausgeführt. Bei bestehendem Slug: übersprungen.
- [ ] `harness/ergebnisse/<slug>-vision.json` geschrieben
- [ ] `pages/<slug>/index.html`, genau eine Datei
- [ ] Zehn Abschnitte: `#kopf` `#urteil` `#artefakt` `#vision` `#tempo` `#konfig` `#qualitaet` `#fehler` `#quellen` `#nachbau`
- [ ] Kopf- und Fußblock wörtlich, `<svg id="modell-marke">` vorhanden
- [ ] Jede Zahl aus `run.json` — wo `null`, dort „nicht gemessen"
- [ ] Bei `medien.demo`: der Rahmen genau nach Vorlage, `sandbox="allow-scripts"`,
      `src="about:blank"` mit `data-src` — sonst gar kein Rahmen
- [ ] **Jeder Textblock hat eine eigene Fläche**
- [ ] `width` und `height` an jedem Bild, Video, iframe
- [ ] Bei 390 px kein waagerechtes Scrollen, Trefflächen ab 44 px
- [ ] `npm run pruefe -- <slug>` läuft sauber durch, dann `npm run bauen`
