# Messprotokoll: Decode über die Kontexttiefe, UD-Q6_K_M gegen UD-Q4_K_XL

**Datum:** 31.08.2026
**Frage:** Wie fällt der Decode mit der Kontexttiefe, und wie viel bringt ein
kleineres Gewichtsquant dabei tatsächlich?
**Charakter:** Richtungstest. `-r 1`, keine Wiederholungen, kein Median.

## Aufbau

| Feld | Wert |
|---|---|
| GPU | AMD Radeon AI PRO R9700, gfx1201, Vulkan0 (per ICD-Manifest erzwungen) |
| Build | **b10717**, Commit `a32af33de`, Upstream, kein Fork |
| Backend | Vulkan, AMDVLK, `matrix cores: KHR_coopmat` |
| CPU | Intel Core Ultra 7 265KF |
| KV-Cache | `q8_0` / `q8_0` |
| Batch | `-b 2048 -ub 128` |
| Flash Attention | `-fa 1` |
| Messung | `-p 0 -n 64 -r 1 --no-warmup` |
| MTP | **aus** — `llama-bench` kann es nicht |
| Vision | nicht geladen |

Kommandozeile je Arm:

```
llama-bench -m <MODELL> -ngl 99 -fa 1 -ctk q8_0 -ctv q8_0 \
            -b 2048 -ub 128 -d 0,32768,131072 -p 0 -n 64 \
            -r 1 --no-warmup --progress -o csv
```

Der Q6-Arm stammt aus einem unmittelbar vorausgegangenen Aufruf desselben
Skripts mit identischen Parametern und identischem Build; er lief vollständig
durch, bevor der Aufruf wegen einer Änderung an der Armliste beendet wurde.

## Ergebnisse

| Tiefe | UD-Q6_K_M (23,08 GB) | UD-Q4_K_XL (17,55 GB) | Verhältnis |
|---:|---:|---:|---:|
| 0 | 15,62 ⚠️ | 21,24 ⚠️ | — |
| **32.768** | **21,86** | **25,78** | **1,179×** |
| **131.072** | **18,73** | **21,80** | **1,164×** |

⚠️ **Der Messpunkt bei Tiefe 0 ist für beide Arme unbrauchbar.** Er liegt
unter dem Wert bei 32.768, was physikalisch nicht sein kann. Ursache ist
`--no-warmup`: Der erste gemessene Lauf zahlt die Shader-Kompilierung. Der
Q6-Arm traf einen kalten Treiber-Cache (15,62), der Q4-Arm einen bereits
teilweise gefüllten (21,24). **Konsequenz für künftige Läufe: Warmup nicht
abschalten, oder einen Wegwerf-Messpunkt voranstellen.**

### Gegen das reine Bandbreitenmodell

Gelesene Bytes je Token = Gewichte + gefüllter KV-Cache. Bei identischer
KV-Konfiguration ist der KV-Anteil für beide Arme gleich.

| Tiefe | gemessen | Modell erwartet | Q4 liefert davon |
|---:|---:|---:|---:|
| 32.768 | 1,179× | 1,295× | **91 %** |
| 131.072 | 1,164× | 1,247× | **93 %** |

UD-Q4_K_XL bleibt durchgängig **7 bis 9 Prozent unter dem, was seine Größe
verspricht**. Das passt zur Tensoranalyse aus
[06b](../06b-tensorzusammensetzung.md): Die Datei enthält nur 19,9 % Q4_K,
dafür 23,6 % I-Quants und 1,0 % Q3_K. Ein Beweis ist es nicht — dafür fehlt
der Kontrollarm mit einem reinen Q4-Typ.

### Abfall über die Tiefe

| Modell | 32.768 → 131.072 |
|---|---:|
| UD-Q6_K_M | −14,3 % |
| UD-Q4_K_XL | −15,4 % |

**Der Tiefenabfall ist praktisch quantunabhängig.** Beide verlieren gleich
viel. Was die Tiefe kostet, ist Attention- und KV-Arbeit — und die ist für
beide Arme identisch. Ein kleineres Gewichtsquant hilft dagegen nicht.

## Umrechnung auf den Serverbetrieb

`llama-bench` kennt kein MTP. Aus der Produktivmessung vom 24.08. lässt sich
der MTP2-Faktor auf rund **1,6×** schätzen (32,88 t/s Server bei rechnerisch
~20,5 t/s roh). Damit:

| Tiefe | UD-Q6_K_M | UD-Q4_K_XL |
|---:|---:|---:|
| 32.768 | ~35,0 t/s | ~41,2 t/s |
| **131.072** | **~30,0 t/s** | **~34,9 t/s** |

Der Faktor 1,6 ist **abgeleitet, nicht gemessen**. Er muss am Server
verifiziert werden, bevor diese Spalte zitierfähig ist.

## Einordnung gegen die Produktion

| Konfiguration | Tiefe | Decode |
|---|---:|---:|
| Produktion 24.08.: Fork `bd9bd1b`, `q8_0/turbo4`, `-ub 256`, 4 Checkpoints, MTP2 | 199.935 | 18,86 t/s |
| Produktion 24.08.: Fork `bd9bd1b`, `q8_0/turbo4`, `-ub 128`, MTP2 | 39.879 | 32,88 t/s |
| **hier: b10717, `q8_0/q8_0`, `-ub 128`, ohne MTP** | **131.072** | **18,73 t/s** |

Die dritte Zeile erreicht **ohne MTP** bei 131 K denselben Wert, den die
Produktion **mit MTP** bei 200 K liefert. Die Tiefen unterscheiden sich, ein
direkter Faktor lässt sich daraus nicht bilden. Der Hinweis ist aber deutlich:
Zwischen den beiden Konfigurationen liegt mehr als der Quantunterschied.

Vier Kandidaten für die Differenz, in dieser Reihenfolge zu prüfen:

1. **Build**: b10717 gegen Fork `bd9bd1b` — dazwischen liegen unter anderem
   PR #25494 und sieben weitere Vulkan-Commits
2. **KV-Typ**: `q8_0/q8_0` gegen `q8_0/turbo4`
3. **Checkpoints**: 0 gegen 4 (bei 200 K je Stück rund 1,4 GiB)
4. **`-ub`**: 128 gegen 256

## Schlussfolgerung

**Der Quantwechsel ist nicht der Hebel.** Er bringt gemessen 16 bis 18 Prozent
und wirkt bei jeder Tiefe gleich — er verschiebt die Kurve, ohne sie flacher
zu machen. Wer bei großem Kontext einbricht, gewinnt damit keine
Größenordnung zurück.

Für die 30-t/s-Marke heißt das: Sie ist mit **UD-Q6_K_M bei 131 K erreichbar**
(~30,0 t/s hochgerechnet), mit UD-Q4_K_XL mit Reserve (~34,9). Entscheidend
war in dieser Messung aber nicht das Quant, sondern dass Build und
KV-Konfiguration andere waren als in der Produktion.

## Offen

1. MTP-Faktor am Server messen statt ableiten.
2. Build und KV trennen: derselbe Test auf dem Fork mit `q8_0/turbo4`.
3. Tiefe 0 sauber nachmessen, mit Warmup.
4. Ob die 7–9 % Rückstand von UD-Q4_K_XL an den I-Quants liegen — bräuchte
   einen Arm mit reinem Q4-Typ.
