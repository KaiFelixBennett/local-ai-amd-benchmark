# -*- coding: utf-8 -*-
"""Rechnet jede veroeffentlichte Zahl aus dem Rohprotokoll nach.

Aufruf:
    python -X utf8 scripts/verify_runs.py            # pruefen
    python -X utf8 scripts/verify_runs.py --write    # data/runs.json neu schreiben

Der Sinn: wer den Zahlen auf benchmark.securesight.ai nicht glaubt, laedt dieses
Repo, laesst das Skript laufen und bekommt dieselben Werte - oder eben nicht.

Zwei Regeln, die jede Zahl hier bestimmen:

1. Nur Antworten ab 200 Tokens zaehlen. Kurze Antworten erzeugen im Protokoll
   Ausreisser bis zu 1 000 000 t/s (ein Token in nahezu null Millisekunden).
   Solche Zeilen sind keine Messung, sondern ein Rundungsartefakt.

2. Perzentile nach Rangplatz (nearest-rank) auf der sortierten Liste, nicht
   interpoliert. p10 ist der Wert an Position floor(0,10 * n).
"""
import io
import os
import re
import csv
import sys
import json
import hashlib
import statistics as st

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# "prompt eval time" enthaelt ebenfalls "eval time" - der Lookbehind trennt beide.
DECODE = re.compile(
    r"(?<!prompt )eval time\s*=\s*[\d.]+ ms /\s*(\d+) tokens.*?([\d.]+) tokens per second")
PREFILL = re.compile(
    r"prompt eval time\s*=\s*[\d.]+ ms /\s*(\d+) tokens.*?([\d.]+) tokens per second")

MINDEST = 200

# Welcher Lauf haengt an welchem Rohprotokoll
BELEGE = {
    "qwen36-27b-q6-moorhuhn-r9700":         "evidence/logs/qwen36-27b-q6-moorhuhn-r9700.log",
    "qwen38-27b-q4xl-moorhuhn-r9700":       "evidence/logs/qwen38-27b-q4xl-moorhuhn-r9700.log",
    "qwen38-27b-q6-clairobscure-r9700":     "evidence/logs/qwen38-27b-q6-clairobscur-r9700.log",
    "qwen38-flashnext-moorhuhn-evox2":      "evidence/logs/qwen38-flashnext-moorhuhn-evox2.log",
    "qwen38-flashnext-clairobscure-evox2":  "evidence/logs/qwen38-flashnext-clairobscur-halo.log",
    "deepseek-v4-flash-clairobscure-evox2": "evidence/logs/deepseek-v4-flash-clairobscur-halo.log",
}

# Laeufe aus llama-bench: eine Kennzahl je Einstellung, keine Verteilung. Die
# Zahlen stehen im Messbericht, es gibt kein Serverprotokoll dazu.
BERICHTE = {
    "laguna-s21-evox2":       "evidence/reports/laguna-s21-strix-halo-vulkan-benchmark.md",
    "qwen35-122b-a10b-evox2": "evidence/reports/qwen35-122b-a10b-strix-halo-vulkan-benchmark.md",
}


def r2(x):
    """Auf zwei Stellen, halbe Werte aufwaerts.

    Pythons eingebautes round() rundet zur geraden Zahl: round(21.755, 2)
    ergibt 21.75, JavaScript ergibt 21.76. Ohne feste Regel widersprechen sich
    verify_runs.py und harness/werkzeuge/lauf.mjs bei denselben Daten - und
    dann ist die ganze Nachrechnung wertlos.
    """
    from decimal import Decimal, ROUND_HALF_UP
    return float(Decimal(repr(x)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def rang(sortiert, anteil):
    """Perzentil nach Rangplatz - kein Interpolieren zwischen Nachbarn."""
    return sortiert[min(len(sortiert) - 1, int(len(sortiert) * anteil))]


def aus_tabelle(pfad):
    """Messtabelle: eine Zeile je Aufgabe, Spalten wie im Serverprotokoll."""
    zeilen = list(csv.DictReader(io.open(pfad, encoding="utf-8-sig")))
    dec = [(int(z["gen_tokens"]), float(z["decode_ts"])) for z in zeilen if z.get("decode_ts")]
    pre = [(int(z["prompt_tokens"]), float(z["prefill_ts"])) for z in zeilen if z.get("prefill_ts")]
    return dec, pre


def messwerte(pfad):
    if pfad.lower().endswith(".csv"):
        dec, pre = aus_tabelle(pfad)
    else:
        text = io.open(pfad, encoding="utf-8", errors="replace").read()
        dec = [(int(m.group(1)), float(m.group(2))) for m in DECODE.finditer(text)]
        pre = [(int(m.group(1)), float(m.group(2))) for m in PREFILL.finditer(text)]

    dg = sorted(v for n, v in dec if n >= MINDEST)
    pg = sorted(v for n, v in pre if n >= MINDEST)
    if not dg:
        return None

    return {
        "decode": {
            "median": r2(st.median(dg)),
            "p10": r2(rang(dg, 0.10)),
            "p90": r2(rang(dg, 0.90)),
            "peak": r2(dg[-1]),
            "n": len(dg),
        },
        "prefill": {
            "median": r2(st.median(pg)) if pg else None,
            "max": r2(pg[-1]) if pg else None,
        },
        # Tokens nur aus den gewerteten Antworten - dieselbe Grundmenge wie oben
        "tokens": sum(n for n, _ in dec if n >= MINDEST),
        "antworten_gesamt": len(dec),
    }


def pruefsumme(pfad):
    h = hashlib.sha256()
    with open(pfad, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def main():
    schreiben = "--write" in sys.argv
    pfad = os.path.join(REPO, "data", "runs.json")
    runs = json.load(io.open(pfad, encoding="utf-8"))

    abweichungen = 0
    for r in runs:
        rel = BELEGE.get(r["slug"])
        if not rel:
            continue
        voll = os.path.join(REPO, rel.replace("/", os.sep))
        if not os.path.exists(voll):
            print("FEHLT: %s" % rel)
            abweichungen += 1
            continue

        m = messwerte(voll)
        if not m:
            print("KEINE MESSWERTE: %s" % rel)
            abweichungen += 1
            continue

        print("\n%s" % r["slug"])
        print("  Beleg: %s" % rel)
        for feld in ("median", "p10", "p90", "peak", "n"):
            alt, neu = (r.get("decode") or {}).get(feld), m["decode"][feld]
            gleich = alt == neu
            if not gleich:
                abweichungen += 1
            print("    decode.%-7s %-10s %s %s" % (feld, alt, neu, "ok" if gleich else "<- neu"))
        gleich = r.get("tokens") == m["tokens"]
        if not gleich:
            abweichungen += 1
        print("    %-15s %-10s %s %s" % ("tokens", r.get("tokens"), m["tokens"],
                                         "ok" if gleich else "<- neu"))

        if schreiben:
            r["decode"] = m["decode"]
            r["prefill"] = m["prefill"]
            r["tokens"] = m["tokens"]
            r["evidence"] = {
                "log": rel,
                "sha256": pruefsumme(voll),
                "bytes": os.path.getsize(voll),
                "antworten_gesamt": m["antworten_gesamt"],
                "gewertet": m["decode"]["n"],
                "regel": "Antworten ab %d Tokens; Perzentile nach Rangplatz" % MINDEST,
            }

    # Die llama-bench-Laeufe bekommen ihren Messbericht als Beleg
    if schreiben:
        for r in runs:
            rel = BERICHTE.get(r["slug"])
            if not rel:
                continue
            voll = os.path.join(REPO, rel.replace("/", os.sep))
            if not os.path.exists(voll):
                print("FEHLT: %s" % rel)
                continue
            r["evidence"] = {
                "log": rel,
                "sha256": pruefsumme(voll),
                "bytes": os.path.getsize(voll),
                "regel": "Messbericht llama-bench pp512/tg128 mit allen Rohwerten",
            }

    if schreiben:
        io.open(pfad, "w", encoding="utf-8").write(
            json.dumps(runs, ensure_ascii=False, indent=1) + "\n")
        print("\ndata/runs.json neu geschrieben.")
    else:
        print("\n%d Abweichungen." % abweichungen)
        print("Mit --write werden die gemessenen Werte uebernommen.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
