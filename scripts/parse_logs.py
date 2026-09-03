# -*- coding: utf-8 -*-
"""Zieht Prefill- und Decode-Raten aus llama.cpp-Serverlogs."""
import io, re, os, statistics, glob

PROMPT = re.compile(r"prompt eval time\s*=\s*([\d.]+) ms /\s*(\d+) tokens.*?([\d.]+) tokens per second")
EVAL   = re.compile(r"(?<!prompt )eval time\s*=\s*([\d.]+) ms /\s*(\d+) (?:tokens|runs).*?([\d.]+) tokens per second")

def q(vals, p):
    if not vals: return None
    vals = sorted(vals)
    k = (len(vals)-1)*p
    f, c = int(k), min(int(k)+1, len(vals)-1)
    return vals[f] + (vals[c]-vals[f])*(k-f)

def summarise(path, label):
    try:
        txt = io.open(path, encoding="utf-8", errors="replace").read()
    except Exception as e:
        print("  ! %s: %s" % (label, e)); return
    pf = [(float(m.group(3)), int(m.group(2))) for m in PROMPT.finditer(txt)]
    dc = [(float(m.group(3)), int(m.group(2))) for m in EVAL.finditer(txt)]
    print("\n=== %s" % label)
    print("  Datei: %s (%.0f KB)" % (os.path.basename(path), os.path.getsize(path)/1024))
    if pf:
        big = [r for r, n in pf if n >= 500]
        r = [x[0] for x in pf]
        print("  Prefill : n=%d  min %.2f  Median %.2f  max %.2f t/s" % (len(r), min(r), statistics.median(r), max(r)))
        if big:
            print("            nur Prompts >=500 Tok: n=%d  Median %.2f  max %.2f" % (len(big), statistics.median(big), max(big)))
        print("            groesster Prompt: %d Tokens" % max(n for _, n in pf))
    if dc:
        r = [x[0] for x in dc]
        toks = sum(n for _, n in dc)
        print("  Decode  : n=%d  min %.2f  p25 %.2f  Median %.2f  p75 %.2f  max %.2f t/s"
              % (len(r), min(r), q(r,.25), statistics.median(r), q(r,.75), max(r)))
        print("            erzeugte Tokens gesamt: %d" % toks)
        ms = sum(float(m.group(1)) for m in EVAL.finditer(txt))
        print("            reine Generierzeit: %.1f min" % (ms/60000.0))

BASE = r"E:\Coding\benchmarks"
targets = [
    (BASE + r"\benchmarks_amd_halo\deepseek_v4_flash_0731_clairobscure_benchmark\llama.cpp.log", "DeepSeek-V4-Flash-0731 UD-IQ3_XXS - Evo X2 - Clair Obscure"),
    (BASE + r"\benchmarks_amd_halo\qwen38_flash_next_clairobscure_benchmark\llama.cpp.log",      "Qwen3.8-Flash-Next UD-Q4_K_XL - Evo X2 - Clair Obscure"),
    (BASE + r"\Moorhuhn Qwen 3.8 27b Q4 XL\llama.cpp.log",                                        "Qwen3.8-27B UD-Q4_K_XL - R9700 - Moorhuhn"),
    (BASE + r"\Clair Obscure Qwen 3.8 27b\llama.cpp.log.txt",                                     "Qwen3.8-27B - R9700 - Clair Obscure"),
]
for p, l in targets:
    if os.path.exists(p): summarise(p, l)
    else: print("\n=== %s\n  ! nicht gefunden" % l)

print("\n=== weitere Logs im Halo-Ordner ===")
for f in glob.glob(BASE + r"\benchmarks_amd_halo\**\*.log", recursive=True) + \
         glob.glob(BASE + r"\benchmarks_amd_halo\**\log_*.txt", recursive=True):
    print("  %s  (%.0f KB)" % (f.replace(BASE+"\\benchmarks_amd_halo\\",""), os.path.getsize(f)/1024))
