# Prüfbilder für den Bildtest

Die beiden Bilder in Originalauflösung, so wie der Agent `bilderkennung` sie unter diesen
Pfaden erwartet. Nur mit genau diesen Dateien sind Ergebnisse mit den veröffentlichten
vergleichbar.

| Datei | Pixel | Bytes | SHA-256 |
|---|---|--:|---|
| `bild-a-dashboard.jpg` | 900 × 787 | 70852 | `eb4771a7858d3309f4c45d78d3f232dac79b8f46693e235b128c4a52fdada494` |
| `bild-b-stand.jpg` | 1176 × 1568 | 772131 | `1ed1982685865d5dba9c52823656c3a0d6361e9ba9969d9bf6e8157245db587d` |

Seit dem 25.09.2026 sind auf Bild B die Gesichter der Standbesucher stärker unkenntlich gemacht.
Ersetzt sind nur die 8 × 8 Pixel großen JPEG-Blöcke um die Gesichter, 3,9 Prozent des Bildes. Alle
anderen Blöcke sind unverändert, die Preisschilder also pixelgleich. Die bis dahin veröffentlichten
Bildtests liefen mit der vorigen Fassung (779505 Bytes, SHA-256 `6d647d04…`) und bleiben vergleichbar.

Nicht verwenden: die verkleinerte Fassung von Bild B für die Webseite mit 675 × 900 Pixeln.
Auf ihr sind die Preisschilder kaum lesbar, und die Ergebnisse sind nicht vergleichbar.

Die Lösungsschlüssel werden nicht veröffentlicht, damit der Test auch für künftige Modelle
funktioniert. Sie gehören auch nicht in den Arbeitsordner eines Testlaufs: Ein Agent mit
Lesezugriff findet sie dort.
