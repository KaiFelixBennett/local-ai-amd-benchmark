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

   Die Schwelle gilt fuer ANTWORTEN, nicht fuer Prompts. Ein kurzer Prompt
   erzeugt kein solches Artefakt, seine Rate ist eine gueltige Messung. Die
   Schwelle wurde frueher auch auf den Prefill angewandt und hat dessen Median
   in jedem Lauf zu hoch ausgewiesen - beim Moorhuhn-Lauf von Qwen3.6-27B um
   22 t/s.

2. Perzentile nach Rangplatz (nearest-rank) auf der sortierten Liste, nicht
   interpoliert. p10 ist der ceil(0,10 * n)-te Wert, einsbasiert gezaehlt.

   Hier stand frueher floor(0,10 * n) auf einem nullbasierten Feld. Das ist um
   einen Platz daneben, sobald n * anteil glatt aufgeht - bei 30 gewerteten
   Antworten und p10 also genau dann, wenn es zaehlt. Nachgemessen beim
   Clair-Obscure-Lauf von Qwen3.8-27B: p10 stand bei 18,03 statt 15,55, p90
   bei 35,31 statt 34,22.

3. Beim Lauf mit Halogen steht neben dem Median des Prefill ueber alle
   Anfragen der Median ab GROSS neuen Tokens. Im Agentenbetrieb bringt eine
   Anfrage meist nur wenige hundert neue Tokens mit, und Anfragen mit 32 bis
   511 neuen Tokens brauchten dort im Median 1,46 s; der Median ueber alle
   beschreibt diese kleinen Schritte. Geprueft werden hier ausserdem Median
   und Maximum des Prefill jedes Laufs.

4. Beim Lauf mit Halogen schreibt ein Proxy zwischen VS Code und Server jede
   Anfrage mit Uhrzeit ins Protokoll. Daraus kommen die gesendeten Anfragen und
   das Arbeitsfenster: erste Anfrage bis letzte Antwort, ohne die Pausen ueber
   60 Sekunden, in denen keine Anfrage offen war.
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

# Halogen schreibt je Antwort genau eine Zeile, Decode und Prefill zusammen:
#   serve_api: mtp 1312 tok in 38.08s = 34.45 t/s | 827 rounds, commit 1.59/round
#     | prompt 127986 (127215 cached), prefill 1.99s | detok 47us/tok
# Die Rundenangabe fehlt, wenn die Antwort ohne Spekulation lief. Eine
# Prefill-Rate steht nicht darin; sie ist hier die Zahl der neuen Prompt-Tokens
# (prompt minus cached) geteilt durch die gemeldete Prefill-Zeit.
HALOGEN = re.compile(
    r"^serve_api: mtp (\d+) tok in [\d.]+s = ([\d.]+) t/s"
    r"(?: \| \d+ rounds, commit [\d.]+/round)?"
    r" \| prompt (\d+)(?: \((\d+) cached\))?, prefill ([\d.]+)s", re.M)

MINDEST = 200
GROSS = 8192        # Regel 3, nur Halogen
PAUSE = 60          # Regel 4, Sekunden

STARTZEILE = re.compile(r"^===== Start \d{4}-\d\d-\d\d (\d\d):(\d\d):(\d\d) =====", re.M)
PROXYZEILE = re.compile(r"^(\d\d):(\d\d):(\d\d) (?:\[#(\d+)\] )?(.*)$", re.M)


def proxy(text):
    """Regel 4: gesendete Anfragen und Arbeitsfenster aus den Zeilen des Proxys."""
    s = STARTZEILE.search(text)
    if not s:
        return None
    vorher = int(s.group(1)) * 3600 + int(s.group(2)) * 60 + int(s.group(3))
    tage = 0
    marken = []
    for m in PROXYZEILE.finditer(text):
        sek = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + int(m.group(3)) + tage * 86400
        if sek < vorher - 3600:          # Mitternacht
            tage += 1
            sek += 86400
        vorher = sek
        was = m.group(5)
        if was.startswith("Anfrage /v1/chat/completions:"):
            marken.append((sek, 0, m.group(4) or ""))
        elif was.startswith("fertig:") or "FEHLER" in was or "getrennt" in was:
            marken.append((sek, 1, m.group(4) or ""))
    anfragen = [x for x in marken if x[1] == 0]
    if not anfragen:
        return None
    marken.sort()
    offen, pausen, ende = set(), 0.0, None
    for sek, art, nr in marken:
        if art == 0:
            if not offen and ende is not None and sek - ende > PAUSE:
                pausen += sek - ende
            offen.add(nr)
        else:
            offen.discard(nr)
            ende = sek
    return {"anfragen": len(anfragen),
            "arbeitsfenster_min": (marken[-1][0] - anfragen[0][0] - pausen) / 60.0}

# Welcher Lauf haengt an welchem Rohprotokoll
BELEGE = {
    "qwen36-27b-q6-moorhuhn-r9700":         "evidence/logs/qwen36-27b-q6-moorhuhn-r9700.log",
    "qwen38-27b-q4xl-moorhuhn-r9700":       "evidence/logs/qwen38-27b-q4xl-moorhuhn-r9700.log",
    "qwen38-27b-q6-clairobscure-r9700":     "evidence/logs/qwen38-27b-q6-clairobscur-r9700.log",
    "qwen38-flashnext-moorhuhn-evox2":      "evidence/logs/qwen38-flashnext-moorhuhn-evox2.log",
    "qwen38-flashnext-moorhuhn-halogen-evox2": "evidence/logs/qwen38-flashnext-moorhuhn-halogen-evox2.log",
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
    """Perzentil nach Rangplatz - kein Interpolieren zwischen Nachbarn.

    Einsbasiert: der ceil(anteil * n)-te Wert. Gleichlautend mit percentile()
    in scripts/parse_logs.py; die beiden muessen im Gleichschritt bleiben.
    """
    import math
    n = len(sortiert)
    platz = int(math.ceil(n * anteil))
    return sortiert[min(n - 1, max(0, platz - 1))]


def aus_tabelle(pfad):
    """Messtabelle: eine Zeile je Aufgabe, Spalten wie im Serverprotokoll."""
    zeilen = list(csv.DictReader(io.open(pfad, encoding="utf-8-sig")))
    dec = [(int(z["gen_tokens"]), float(z["decode_ts"])) for z in zeilen if z.get("decode_ts")]
    pre = [(int(z["prompt_tokens"]), float(z["prefill_ts"])) for z in zeilen if z.get("prefill_ts")]
    return dec, pre


def messwerte(pfad):
    halogen = []
    if pfad.lower().endswith(".csv"):
        dec, pre = aus_tabelle(pfad)
    else:
        text = io.open(pfad, encoding="utf-8", errors="replace").read()
        halogen = list(HALOGEN.finditer(text))
        if halogen:
            dec = [(int(m.group(1)), float(m.group(2))) for m in halogen]
            pre = []
            for m in halogen:
                neu, sek = int(m.group(3)) - int(m.group(4) or 0), float(m.group(5))
                if neu > 0 and sek > 0:
                    pre.append((neu, neu / sek))
        else:
            dec = [(int(m.group(1)), float(m.group(2))) for m in DECODE.finditer(text)]
            pre = [(int(m.group(1)), float(m.group(2))) for m in PREFILL.finditer(text)]

    dg = sorted(v for n, v in dec if n >= MINDEST)
    # Kein MINDEST beim Prefill - siehe Regel 1 im Kopf dieser Datei.
    pg = sorted(v for _, v in pre)
    if not dg:
        return None
    # Regel 3: bei Halogen zaehlt pre die NEUEN Tokens je Anfrage.
    gross = sorted(v for n, v in pre if n >= GROSS) if halogen else None

    ergebnis = {
        "decode": {
            "median": r2(st.median(dg)),
            "p10": r2(rang(dg, 0.10)),
            "p90": r2(rang(dg, 0.90)),
            "peak": r2(dg[-1]),
            "n": len(dg),
        },
        "prefill": dict({
            "median": r2(st.median(pg)) if pg else None,
            "max": r2(pg[-1]) if pg else None,
        }, **({"large_prompts": {"min_new_tokens": GROSS, "median": r2(st.median(gross)),
                                 "n": len(gross)}} if gross else {})),
        # Tokens nur aus den gewerteten Antworten - dieselbe Grundmenge wie oben
        "tokens": sum(n for n, _ in dec if n >= MINDEST),
        "antworten_gesamt": len(dec),
    }
    if halogen:
        ergebnis["proxy"] = proxy(text)
    return ergebnis


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
        for feld in ("median", "max"):
            alt, neu = (r.get("prefill") or {}).get(feld), m["prefill"][feld]
            gleich = alt == neu
            if not gleich:
                abweichungen += 1
            print("    prefill.%-6s %-10s %s %s" % (feld, alt, neu, "ok" if gleich else "<- neu"))
        # Regel 3: steht ein Wert ab GROSS neuen Tokens in runs.json oder ergibt ihn
        # das Protokoll, muessen beide uebereinstimmen.
        alt = (r.get("prefill") or {}).get("large_prompts")
        neu = m["prefill"].get("large_prompts")
        if alt is not None or neu is not None:
            gleich = alt == neu
            if not gleich:
                abweichungen += 1
            print("    prefill ab %d  %s  %s %s" % (GROSS, json.dumps(alt), json.dumps(neu),
                                                    "ok" if gleich else "<- neu"))
        # Regel 4: Anfragen und Arbeitsfenster, soweit das Protokoll einen Proxy hat.
        px = m.get("proxy")
        if px:
            for feld, neu in (("requests", px["anfragen"]), ("wall_minutes", int(round(px["arbeitsfenster_min"])))):
                alt = r.get(feld)
                gleich = alt == neu
                if not gleich:
                    abweichungen += 1
                print("    %-15s %-10s %s %s" % (feld, alt, neu, "ok" if gleich else "<- neu"))

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
