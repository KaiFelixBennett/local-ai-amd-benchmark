# -*- coding: utf-8 -*-
"""Re-derive every published throughput figure from the raw llama.cpp server logs.

Run it from the repository root with no arguments:

    python scripts/parse_logs.py

It reads every log in evidence/logs/, prints the table published in README.md, and
verifies each log against the checksum recorded in evidence/SHA256SUMS. Nothing in
this repository is hand-typed: if a number in the README disagrees with this script,
the script is right.

    python scripts/parse_logs.py --json   emit machine-readable output
    python scripts/parse_logs.py <file>   analyse one log of your own
"""
from __future__ import print_function
import io
import os
import re
import sys
import json
import glob
import hashlib
import math
import statistics

PROMPT = re.compile(r"prompt eval time\s*=\s*([\d.]+) ms /\s*(\d+) tokens.*?([\d.]+) tokens per second")
EVAL = re.compile(r"(?<!prompt )eval time\s*=\s*([\d.]+) ms /\s*(\d+) (?:tokens|runs).*?([\d.]+) tokens per second")

# Two conventions govern every number in this repository. They are shared verbatim
# with scripts/verify_runs.py, which cross-checks data/runs.json against these same
# logs -- the two scripts must never disagree.
#
# 1. Only RESPONSES of 200 tokens or more count. Shorter ones produce outliers up to
#    1,000,000 t/s in the log (one token in near-zero milliseconds); those lines are
#    a rounding artefact, not a measurement.
#
#    The floor does NOT apply to prompts. A short prompt has no such artefact -- its
#    rate is a perfectly good measurement -- and filtering prompts biased the prefill
#    median upward in every single run: 241.47 instead of 234.86 t/s on the Qwen3.8-27B
#    Moorhuhn log, 174.92 instead of 152.71 on Qwen3.6-27B, 87.22 instead of 77.63 on
#    Flash-Next. The filter used to be shared with the decode side; that was the bug.
# 2. Percentiles are nearest-rank on the sorted list, not interpolated: p10 is the
#    ceil(0.10 * n)-th value, counting from 1.
#
#    This used to read floor(0.10 * n) as a 0-based index, which is one place too high
#    whenever n * fraction lands on a whole number. With 30 scored responses -- the
#    Qwen3.8-27B Clair Obscur run -- that is exactly when it bites: p10 read 18.03
#    instead of 15.55 and p90 35.31 instead of 34.22.
# 3. Halves round up. Python's round() rounds to even (21.755 -> 21.75) while the
#    JavaScript side of the project rounds up (21.76). Without a fixed rule the two
#    disagree on the same data, which is how you lose an afternoon.
MIN_TOKENS = 200
DECODE_MIN_TOKENS = MIN_TOKENS
PREFILL_MIN_TOKENS = 0          # see note 1: prompts are not filtered


def r2(x):
    """Round to two places, halves upward -- matches the JavaScript harness."""
    if x is None:
        return None
    return math.floor(x * 100 + 0.5) / 100.0

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOG_DIR = os.path.join(ROOT, "evidence", "logs")
SUMS = os.path.join(ROOT, "evidence", "SHA256SUMS")


def percentile(sorted_values, fraction):
    """Nearest-rank percentile -- no interpolation between neighbours.

    The rank is 1-based: the ceil(fraction * n)-th value. Identical to rang() in
    scripts/verify_runs.py; keep the two in step.
    """
    if not sorted_values:
        return None
    n = len(sorted_values)
    rank = int(math.ceil(n * fraction))
    return sorted_values[min(n - 1, max(0, rank - 1))]


def analyse(path):
    """Return every published figure for one llama.cpp server log."""
    raw = io.open(path, "rb").read()
    txt = raw.decode("utf-8", "replace")

    prefill = [(float(m.group(3)), int(m.group(2)), float(m.group(1))) for m in PROMPT.finditer(txt)]
    decode = [(float(m.group(3)), int(m.group(2)), float(m.group(1))) for m in EVAL.finditer(txt)]

    dc = [d for d in decode if d[1] >= DECODE_MIN_TOKENS]
    pf = [p for p in prefill if p[1] >= PREFILL_MIN_TOKENS]
    rates = sorted(d[0] for d in dc)
    pf_rates = sorted(p[0] for p in pf)

    return {
        "log": os.path.basename(path),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "bytes": len(raw),
        "decode": {
            "n": len(dc),
            "median": r2(statistics.median(rates)) if rates else None,
            "p10": r2(percentile(rates, .10)) if rates else None,
            "p90": r2(percentile(rates, .90)) if rates else None,
            "min": r2(rates[0]) if rates else None,
            "peak": r2(rates[-1]) if rates else None,
        },
        "prefill": {
            "n": len(pf),
            "median": r2(statistics.median(pf_rates)) if pf_rates else None,
            "max": r2(pf_rates[-1]) if pf_rates else None,
            "largest_prompt_tokens": max([p[1] for p in prefill]) if prefill else None,
        },
        "tokens_filtered": sum(d[1] for d in dc),
        "tokens_all": sum(d[1] for d in decode),
        "responses_all": len(decode),
        "decode_minutes": round(sum(d[2] for d in decode) / 60000.0, 1),
        "prefill_minutes": round(sum(p[2] for p in prefill) / 60000.0, 1),
    }


def expected_sums():
    """The checksums recorded in evidence/SHA256SUMS, keyed by basename."""
    out = {}
    if not os.path.exists(SUMS):
        return out
    for line in io.open(SUMS, encoding="utf-8"):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split(None, 1)
        if len(parts) == 2:
            out[os.path.basename(parts[1].strip().lstrip("*"))] = parts[0]
    return out


def main(argv):
    as_json = "--json" in argv
    argv = [a for a in argv if a != "--json"]

    if argv:
        paths = argv
        sums = {}
    else:
        paths = sorted(glob.glob(os.path.join(LOG_DIR, "*.log")))
        sums = expected_sums()
        if not paths:
            print("No logs in %s" % LOG_DIR)
            return 1

    results = [analyse(p) for p in paths]

    if as_json:
        json.dump(results, sys.stdout, indent=1)
        print()
        return 0

    bad = 0
    for r in results:
        d, p = r["decode"], r["prefill"]
        want = sums.get(r["log"])
        if want is None:
            mark = "not in SHA256SUMS"
        elif want == r["sha256"]:
            mark = "checksum OK"
        else:
            mark = "CHECKSUM MISMATCH"
            bad += 1
        print("")
        print("=== %s" % r["log"])
        print("    %d KB   sha256 %s   (%s)" % (r["bytes"] / 1024, r["sha256"][:16], mark))
        print("    decode   n=%-4d median %-7s p10 %-7s p90 %-7s min %-7s peak %s   [>=%d tokens]"
              % (d["n"], d["median"], d["p10"], d["p90"], d["min"], d["peak"], DECODE_MIN_TOKENS))
        print("    prefill  n=%-4d median %-7s max %-7s   largest prompt %s tokens   [%s]"
              % (p["n"], p["median"], p["max"], p["largest_prompt_tokens"],
                 "all prompts" if PREFILL_MIN_TOKENS <= 0
                 else ">=%d tokens" % PREFILL_MIN_TOKENS))
        print("    tokens   %d in the filter, %d over all %d responses"
              % (r["tokens_filtered"], r["tokens_all"], r["responses_all"]))
        print("    GPU time %.1f min decoding + %.1f min prefill = %.1f min"
              % (r["decode_minutes"], r["prefill_minutes"], r["decode_minutes"] + r["prefill_minutes"]))

    if len(results) > 1:
        gpu = sum(r["decode_minutes"] + r["prefill_minutes"] for r in results)
        print("")
        print("=" * 72)
        print("TOTALS over %d logs" % len(results))
        print("  responses >=%d tokens : %d" % (DECODE_MIN_TOKENS, sum(r["decode"]["n"] for r in results)))
        print("  tokens in the filter  : %d" % sum(r["tokens_filtered"] for r in results))
        print("  tokens over all       : %d" % sum(r["tokens_all"] for r in results))
        print("  GPU time              : %.1f h  (%.1f h decode + %.1f h prefill)"
              % (gpu / 60, sum(r["decode_minutes"] for r in results) / 60,
                 sum(r["prefill_minutes"] for r in results) / 60))

    if bad:
        print("\n%d log(s) do not match evidence/SHA256SUMS." % bad)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
