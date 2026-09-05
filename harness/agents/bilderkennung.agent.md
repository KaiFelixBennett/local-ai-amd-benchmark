---
name: bilderkennung
description: "Bilderkennungs-Test für ein lokales Modell. Zwei eigene Prüfbilder, drei Aufgaben, Ergebnis als JSON. Aufruf: bilderkennung <slug>"
argument-hint: "<slug> — z. B. qwen38-27b-q4xl-moorhuhn-r9700"
tools: ['read_file', 'create_file', 'list_dir', 'grep_search']
user-invocable: true
---

# Bilderkennungs-Test

Du wirst gerade auf **Bilderkennung** getestet. Du bekommst zwei Bilder und drei Aufgaben.
Das Ergebnis wird gegen einen Lösungsschlüssel gerechnet, den du nicht siehst.

Der Test hat einen einzigen Zweck: herauszufinden, wie gut ein lokal laufendes Modell
Bilder wirklich liest. Nicht, wie gut es rät.

## Die eine Regel, die alles entscheidet

**Schreib nur, was du im Bild siehst.**

Wenn du eine Zahl nicht lesen kannst, schreibst du `null`. Wenn ein Schild verdeckt ist,
lässt du es weg. Wenn du dir bei einem Wort unsicher bist, markierst du es.

Ein `null` kostet dich einen Punkt. Eine erfundene Zahl kostet dich mehr als einen Punkt,
weil sie als Halluzination gezählt wird — und die Halluzinationsrate ist die Zahl, auf die
bei diesem Test am genauesten geschaut wird. Ein Modell, das ehrlich zugibt, was es nicht
erkennt, ist im Alltag brauchbarer als eines, das immer etwas hinschreibt.

Das gilt besonders bei Zahlen und Währungen. Rate nie ein Währungszeichen. `£` und `€`
sehen bei starker Drehung ähnlich aus — wenn du es nicht sicher unterscheidest, schreib
`"waehrung_unsicher": true` dazu.

---

## Ablauf

### Schritt 1 — Bilder laden

```
harness/bilder/bild-a-dashboard.jpg     900 × 787
harness/bilder/bild-b-stand.jpg        1176 × 1568
```

Beide Bilder sind Eigenaufnahmen und stehen in keinem öffentlichen Trainingsdatensatz.
Du kannst sie nicht aus dem Gedächtnis kennen — was du schreibst, muss aus dem Bild kommen.

### Schritt 2 — Aufgabe A1: Ablesen

Bild A ist ein Dashboard. Lies daraus ab und gib als JSON aus:

| Was | Wie viele Werte |
|---|---|
| Die Vergleichstabelle im Tooltip: beide Spaltenüberschriften, alle vier Zeilennamen, alle acht Zahlen | 14 |
| Die drei Kennzahlkacheln: Titel, großer Wert, Beschreibungstext | 9 |
| Die Filterreihe: welche Einträge sind aktiv, welche nicht | 8 |
| Achsenbeschriftung und Achsenwerte | 2 |
| Die Legendeneinträge | 4 |
| Überschrift, Unterzeile, aktiver Reiter | 3 |

Aktive Filter erkennst du am farbigen Rand, inaktive sind grau.

> **Sieh genau hin, bevor du schreibst.** In dieser Tabelle folgt nicht jede Zeile
> demselben Muster. Wer die Tabelle überfliegt und den Rest fortschreibt, fällt auf.

### Schritt 3 — Aufgabe A2: Nachbauen

Baue das Liniendiagramm aus Bild A als eigenständiges SVG nach.

- Alle Serien, die du erkennst, in ihren Farben
- Achsen mit Beschriftung und Werten
- Legende
- Die beschrifteten Datenpunkte, so viele du sicher lesen kannst
- `viewBox`, keine feste Pixelgröße, lesbar ab 400 px Breite

Das ist kein Pixelnachbau. Bewertet wird, ob die Struktur stimmt: richtige Zahl der
Serien, plausibler Verlauf, richtiger Achsenbereich, lesbare Beschriftung.

Dieses SVG erscheint später auf der Modellseite. Es ist das sehenswerteste Stück des
ganzen Tests — gib dir Mühe.

### Schritt 4 — Aufgabe B: Preisschilder

Bild B zeigt einen Messestand mit Masken und Helmen. Viele tragen weiße Preisschilder mit
zwei Währungen.

**Gewertet wird nur ein Ausschnitt:** das Rechteck von der linken Bildkante bis x = 700
und von y = 950 bis zum unteren Rand (Koordinaten im 1176 × 1568 großen Bild). Das ist der
Bereich, in dem die Schilder flach zur Kamera liegen. Schilder außerhalb darfst du nennen,
sie zählen aber weder positiv noch negativ.

Für jedes Schild in diesem Bereich:

```json
{
  "name": "REDHOOD ARKHAM",
  "gbp": 80,
  "eur": 65,
  "reihenfolge": "gbp_zuerst",
  "sicher": true
}
```

- `reihenfolge` ist `"gbp_zuerst"` oder `"eur_zuerst"` — **je nachdem, was oben bzw. zuerst
  auf dem Schild steht.** Diese Angabe ist Teil der Wertung.
- `name: null`, wenn nur ein Preis lesbar ist, aber kein Name
- `gbp: null` oder `eur: null`, wenn ein Betrag nicht lesbar ist
- `sicher: false`, wenn du dir bei irgendetwas nicht sicher bist

Zähle am Ende, wie viele Schilder du im Wertungsbereich insgesamt **siehst** — auch die,
die du nicht lesen konntest. Diese Zahl steht getrennt.

### Schritt 5 — Ergebnis schreiben

Schreib **eine** Datei:

```
harness/ergebnisse/<slug>-vision.json
```

nach diesem Aufbau:

```json
{
  "slug": "<slug>",
  "modell": "<dein Name und Quantisierung, so wie er im Endpunkt steht>",
  "datum": "JJJJ-MM-TT",
  "a1_ablesen": { "…": "die Struktur aus Schritt 2" },
  "a2_nachbau": { "svg": "<svg …>…</svg>" },
  "b_schilder": {
    "gefunden": [ { "…": "die Objekte aus Schritt 4" } ],
    "sichtbar_gesamt": 0,
    "nicht_lesbar": 0
  },
  "selbsteinschaetzung": {
    "schwierigstes": "Was war am schwersten zu lesen?",
    "unsicher_bei": ["Liste der Stellen, bei denen du geraten hättest"]
  }
}
```

Die Selbsteinschätzung ist kein Beiwerk. Sie zeigt, ob ein Modell seine eigenen Grenzen
kennt — und genau das entscheidet, ob man ihm im Alltag trauen kann.

---

## Was du nicht tust

- Keine Zahl aus Weltwissen ergänzen. Wenn du das Modell auf dem Diagramm kennst, ist das
  egal — es zählt, was im Bild steht.
- Keine Schilder erfinden, um die Liste voller aussehen zu lassen.
- Keine Preise glätten oder auf runde Beträge korrigieren.
- Keine andere Datei anfassen als die eine Ergebnisdatei.

## Wenn du kein Bild siehst

Sag es direkt: „Ich kann die Bilder nicht sehen." Dann fehlt dem Endpunkt der
Bildpfad — bei llama.cpp ist das `--mmproj`. Das ist kein Fehler von dir und wird als
„Bilderkennung nicht verfügbar" vermerkt, nicht als Fehlversuch.
