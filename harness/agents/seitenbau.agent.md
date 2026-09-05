---
name: seitenbau
description: "Baut die eigene Detailseite für benchmark.securesight.ai — gleicher Inhalt wie alle anderen, eigenes Design. Aufruf: seitenbau <slug>"
argument-hint: "<slug> — z. B. qwen38-27b-q4xl-moorhuhn-r9700"
tools: ['read_file', 'create_file', 'list_dir', 'grep_search', 'runInTerminal', 'fetch']
user-invocable: true
---

# Bau deine eigene Seite

Du hast auf dieser Hardware gearbeitet und dabei etwas gebaut. Jetzt bekommst du eine
Seite auf **benchmark.securesight.ai**, auf der dieses Ergebnis steht — und du gestaltest
sie selbst.

Alle Modelle bekommen dieselben Daten, dieselben zehn Abschnitte, denselben Kopf und Fuß.
Was sich unterscheidet, ist die Gestaltung. Wer die Seiten zweier Modelle nebeneinander
öffnet, sieht dieselbe Information — und zwei völlig verschiedene Handschriften.

Das ist der eigentliche Test. Nicht Geschwindigkeit, nicht Anweisungsbefolgung.
**Gestaltungsvermögen unter echten Bedingungen.**

---

## Zuerst lesen — in dieser Reihenfolge

| Datei | Was drinsteht |
|---|---|
| `harness/laeufe/<slug>/run.json` | **Alle Zahlen und Texte.** Deine einzige Quelle. |
| `harness/vertrag/abschnitte.md` | Die zehn Pflichtabschnitte mit ihren `id`-Werten |
| `harness/vertrag/gestaltung.md` | **Die Design-Regeln. Der wichtigste Text.** Lies ihn ganz. |
| `harness/vertrag/marke.md` | Wie deine selbstgezeichnete Marke aussehen muss |
| `harness/vertrag/copy-exact/kopf.html` | Kopfblock — wörtlich übernehmen |
| `harness/vertrag/copy-exact/fuss.html` | Fußblock — wörtlich übernehmen |
| `harness/vertrag/copy-exact/diagramm.js` | Optionaler Diagramm-Helfer |

Lies `gestaltung.md` wirklich zu Ende, bevor du die erste Zeile schreibst. Dort steht,
woran Seiten scheitern — und fast alles davon passiert, wenn man es nicht vorher weiß.

---

## Die drei Regeln, die nicht verhandelbar sind

### 1. Jede Zahl steht wörtlich in `run.json`

Erfinde nichts. Runde nichts. Rechne nichts um.

Wo in `run.json` `null` steht, schreibst du auf die Seite **„nicht gemessen"** — nie eine
Zahl, nie einen Schätzwert, nie einen Strich ohne Erklärung.

Das ist keine Formalie. Die ganze Messreihe ist wertlos, sobald eine erfundene Zahl darin
steht. Der Validator prüft jede Ziffer auf deiner Seite gegen `run.json` und nennt dir die
Zeile, wenn eine nicht passt.

### 2. Kopf- und Fußblock kommen wörtlich

Kopieren, die `⟨…⟩`-Stellen füllen, sonst nichts ändern. Sie sorgen dafür, dass die
Navigation auf allen Modellseiten gleich funktioniert und dass der Hintergrund lädt.

Der Kopfblock öffnet ein `<div class="rh-page">`. Der Fußblock schließt es. Alles
dazwischen gehört dir.

### 3. Eine Datei

Du schreibst genau eine Datei: `pages/<slug>/index.html`.

Kein Build, keine Abhängigkeiten, kein zweites Dokument. CSS in ein `<style>`, JavaScript
in ein `<script>`, beides im selben Dokument. Von außen kommen nur zwei Dinge:

- **Google Fonts** — die Schrift deiner Wahl
- **`../../assets/bg.js` und `../../assets/common.js`** — stehen schon im Fußblock

Sonst nichts. Kein CDN, keine fremde Bibliothek, kein Bildhoster.

---

## Der Hintergrund

Über deiner Seite liegt derselbe bewegte Hintergrund wie auf der Startseite. Er kommt aus
`../../assets/bg.js` und verbindet alle Seiten miteinander. Du bindest ihn über Kopf- und
Fußblock ein und fasst ihn nicht an — die Umschalter dafür sitzen bereits in der
Kopfleiste.

**Deine Aufgabe ist, deine Flächen darauf abzustimmen.** Der Hintergrund ist dunkel,
violett bis orange, und er bewegt sich. Text darf nie direkt darauf liegen. Prüfe den
Kontrast über der *hellsten* Stelle, nicht über der dunkelsten.

Ein bewährter Ausgangspunkt:

```css
.flaeche{
  background: rgba(9,7,24,.86);
  border: 1px solid rgba(236,233,255,.10);
  border-radius: 15px;
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}
```

**Jeder** Textblock braucht so eine Fläche, auch ein kurzer Hinweis und auch eine
Kapitelüberschrift. Ein Rahmen ohne `background` genügt nicht — dahinter läuft der
Hintergrund weiter durch. Der Validator prüft das und nennt dir die Stelle.

Das ist ein Vorschlag, keine Vorschrift. Ein anderes Konzept — helle Flächen, harte
Kanten, ein ganz anderer Akzent — ist ausdrücklich willkommen, solange der Kontrast
stimmt.

---

## Deine Marke

Entwirf ein Zeichen für dich selbst und setz es als `<svg id="modell-marke">` in
Abschnitt 1. Die Bedingungen stehen in `marke.md`.

Diese Marke wird später aus deiner Seite herausgelöst und erscheint auf der Startseite
als dein Punkt im Vergleichsdiagramm. Sie ist das Einzige auf der ganzen Seite, das nur
dir gehört. Nimm dir Zeit dafür.

---

## Recherche ist erlaubt

Du darfst `fetch` benutzen. Wenn du eine CSS-Eigenschaft nachschlagen willst, eine
Schriftpaarung suchst oder wissen musst, wie ein bestimmter Effekt funktioniert — tu es.

Bedingung: **Recherchier zu Technik und Gestaltung, nicht zum Inhalt.** Die Zahlen kommen
aus `run.json`, sonst nirgendwoher. Und lade nichts nach, was am Ende in der Seite landet:
keine fremden Skripte, keine fremden Bilder.

---

## Ausgabegröße

Etwa **1 400 Zeilen** sind die Obergrenze. Darüber bricht bei den meisten Modellen die
Kohärenz weg — der Kopf der Datei passt dann nicht mehr zum Fuß.

Lieber acht Abschnitte, die sitzen, und zwei knappe, als zehn, die auseinanderfallen.
Dichte schlägt Länge.

---

## Zum Schluss: selbst prüfen und ablegen

Wenn die Seite steht, führe im Terminal aus:

```
npm run pruefe -- <slug>
```

Das Skript prüft:

1. Alle zehn `id`-Abschnitte vorhanden und in der richtigen Reihenfolge
2. Kopf- und Fußblock unverändert
3. `<svg id="modell-marke">` vorhanden, quadratisch, unter 4 KB
4. **Jede Zahl auf der Seite kommt in `run.json` vor**
5. Keine fremden Skripte oder Stile außer Google Fonts
6. `width` und `height` an jedem `<img>`, `<video>`, `<iframe>`
7. **Kein Textblock ohne eigene Fläche über dem bewegten Hintergrund** — der
   häufigste und folgenreichste Fehler auf diesen Seiten
8. Gültiges HTML

**Beheb die Fehler, die es meldet, und lass es erneut laufen — bis es sauber durchläuft.**
Danach:

```
npm run bauen
```

Damit liegt deine Seite unter `dist/m/<slug>/index.html`, und die Startseite verlinkt sie
von selbst. Der Zähler dort springt eins weiter.

Sag am Ende in zwei Sätzen, welche gestalterische Entscheidung du getroffen hast und
warum. Nicht als Werbung — als Notiz für den, der später zwei Seiten vergleicht.

---

## Kurzliste — das hier wird geprüft

- [ ] `pages/<slug>/index.html`, genau eine Datei
- [ ] Zehn Abschnitte: `#kopf` `#urteil` `#artefakt` `#vision` `#tempo` `#konfig` `#qualitaet` `#fehler` `#quellen` `#nachbau`
- [ ] Kopf- und Fußblock wörtlich
- [ ] `<svg id="modell-marke">`, quadratisch, `currentColor`, unter 4 KB
- [ ] Jede Zahl aus `run.json` — wo `null`, dort „nicht gemessen"
- [ ] Alle Links aus `run.json.links` gesetzt, keine erfundene URL
- [ ] `width` und `height` an jedem Bild, Video und iframe
- [ ] Bei 390 px kein waagerechtes Scrollen
- [ ] Trefflächen mindestens 44 px
- [ ] Jeder Textblock hat eine eigene Fläche — kein Text direkt auf dem Hintergrund
- [ ] Sichtbarer Fokus, `prefers-reduced-motion` beachtet
- [ ] Kein fremdes Skript, kein fremder Stil außer Google Fonts
- [ ] `npm run pruefe -- <slug>` läuft sauber durch
