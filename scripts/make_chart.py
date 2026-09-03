# -*- coding: utf-8 -*-
"""Draw the field chart in media/chart/ from data/runs.json.

    python scripts/make_chart.py

Speed on x, provisional quality on y, colour by machine, with the Pareto front over
the agent runs. Two files are written, one per GitHub theme; README.md picks between
them with <picture>. The chart is generated rather than hand-drawn so it cannot drift
away from the data it claims to show.

Why a Pareto front and no total score: any weighting of speed against quality is an
opinion, and a single ranked column reads as a verdict whether or not one was meant.
The front states what the data supports -- which runs nothing else beats on *both*
axes -- and leaves the trade-off visible.
"""
from __future__ import print_function
import io
import os
import json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "media", "chart")

W, H = 900, 562
X0, X1 = 64, 752            # plot area
Y0, Y1 = 44, 474
XMAX = 36.0                 # t/s
QMIN, QMAX = 12.0, 20.0     # provisional rubric

FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

THEMES = {
    "light": dict(bg="#ffffff", ink="#1f2328", mute="#656d76", grid="#d8dee4",
                  axis="#8c959f", r9700="#14748c", evox2="#a35f11", cloud="#5f5b75"),
    "dark":  dict(bg="#0d1117", ink="#e6edf3", mute="#8b949e", grid="#30363d",
                  axis="#6e7681", r9700="#2bb3d1", evox2="#e0912c", cloud="#9c98b5"),
}

# Where each point's label sits, so nothing collides. dx/dy in px, anchor for text.
LABELS = {
    "qwen38-27b-q4xl-moorhuhn-r9700":       (-12,  26, "end",    "Qwen3.8-27B Q4_XL"),
    "qwen36-27b-q6-moorhuhn-r9700":         (-12,   5, "end",    "Qwen3.6-27B Q6"),
    "qwen38-27b-q6-clairobscure-r9700":     (-12, -20, "end",    "Qwen3.8-27B Q6"),
    "qwen38-flashnext-moorhuhn-evox2":      (  0, -16, "middle", "Qwen3.8-Flash-Next"),
    "qwen38-flashnext-clairobscure-evox2":  (  0, -16, "middle", "Qwen3.8-Flash-Next"),
    "deepseek-v4-flash-clairobscure-evox2": ( 12,   5, "start",  "DeepSeek-V4-Flash-0731"),
    "qwen35-122b-a10b-evox2":               (-12,  -9, "end",    "Qwen3.5-122B-A10B"),
    "laguna-s21-evox2":                     ( 13, -11, "start",  "Laguna S 2.1"),
}

# Cloud rows are drawn as a horizontal reference line, never as a point: they have no
# local decode rate, and inventing an x position for them would be a lie. Only runs
# that actually shipped an artifact get a line -- Opus 5 and GPT 5.6 have neither an
# artifact nor a logged run, so their scores stay out of the picture entirely.
CLOUD_LINES = {"sonnet5": "Sonnet 5 · cloud"}

TASK_SHORT = {"Moorhuhn": "Moorhuhn", "Clair Obscure": "Clair Obscur"}


def px(v):
    return X0 + (float(v) / XMAX) * (X1 - X0)


def py(q):
    return Y1 - ((float(q) - QMIN) / (QMAX - QMIN)) * (Y1 - Y0)


def esc(s):
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def pareto(points):
    """Runs that nothing else beats on both axes. Ties count as beaten."""
    front = []
    for p in points:
        beaten = any(
            o is not p and o["x"] >= p["x"] and o["y"] >= p["y"]
            and (o["x"] > p["x"] or o["y"] > p["y"])
            for o in points
        )
        if not beaten:
            front.append(p)
    return sorted(front, key=lambda p: p["x"])


def collect():
    runs = json.load(io.open(os.path.join(ROOT, "data", "runs.json"), encoding="utf-8"))
    agent, synth, cloud, skipped = [], [], [], []
    for r in runs:
        q = r.get("quality")
        dec = (r.get("decode") or {}).get("median")
        if r["slug"] in CLOUD_LINES and q is not None:
            cloud.append({"q": q, "label": CLOUD_LINES[r["slug"]]})
            continue
        if r["hw"] == "cloud" or r["kind"] == "offen":
            continue
        if q is None or dec is None:
            if q is not None:
                skipped.append(r)
            continue
        p = {"slug": r["slug"], "x": dec, "y": q, "hw": r["hw"],
             "task": TASK_SHORT.get(r.get("task"), r.get("task") or "")}
        (synth if r["kind"] == "synth" else agent).append(p)
    return agent, synth, cloud, skipped


def draw(theme_name, agent, synth, cloud):
    c = THEMES[theme_name]
    s = []
    a = s.append
    a('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d" '
      'font-family="%s" role="img" aria-label="Decode speed against provisional quality '
      'for every measured run, coloured by machine">' % (W, H, W, H, FONT))
    a('<rect width="%d" height="%d" fill="%s"/>' % (W, H, c["bg"]))

    # grid + ticks
    for q in range(int(QMIN), int(QMAX) + 1):
        y = py(q)
        a('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="1"/>'
          % (X0, y, X1, y, c["grid"]))
        a('<text x="%.1f" y="%.1f" fill="%s" font-size="12" text-anchor="end">%d</text>'
          % (X0 - 10, y + 4, c["mute"], q))
    for v in range(0, int(XMAX) + 1, 5):
        x = px(v)
        a('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="1"/>'
          % (x, Y0, x, Y1, c["grid"]))
        a('<text x="%.1f" y="%.1f" fill="%s" font-size="12" text-anchor="middle">%d</text>'
          % (x, Y1 + 20, c["mute"], v))
    a('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="1.5"/>'
      % (X0, Y1, X1, Y1, c["axis"]))
    a('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="1.5"/>'
      % (X0, Y0, X0, Y1, c["axis"]))

    # axis titles
    a('<text x="%.1f" y="%.1f" fill="%s" font-size="13" text-anchor="middle">'
      'Decode · t/s</text>' % ((X0 + X1) / 2, Y1 + 44, c["ink"]))
    a('<text x="%.1f" y="%.1f" fill="%s" font-size="11.5" text-anchor="middle">'
      'filled = agent-run median over responses ≥ 200 tokens   ·   '
      'hollow = synthetic llama-bench sweep, a different measurement style</text>'
      % ((X0 + X1) / 2, Y1 + 64, c["mute"]))
    a('<text transform="translate(20,%.1f) rotate(-90)" fill="%s" font-size="13" '
      'text-anchor="middle">Quality · provisional rubric, 0–20</text>'
      % ((Y0 + Y1) / 2, c["ink"]))

    # cloud reference lines, under everything else
    for cl in cloud:
        y = py(cl["q"])
        a('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="1.5" '
          'stroke-dasharray="2 4" opacity="0.85"/>' % (X0, y, X1, y, c["cloud"]))
        a('<text x="%.1f" y="%.1f" fill="%s" font-size="11.5">%s</text>'
          % (X1 + 9, y + 4, c["cloud"], esc(cl["label"])))

    # Pareto front over the agent runs only -- synthetic sweeps are a different
    # measurement style and may not share a front with them.
    front = pareto(agent)
    if len(front) > 1:
        pts = " ".join("%.1f,%.1f" % (px(p["x"]), py(p["y"])) for p in front)
        a('<polyline points="%s" fill="none" stroke="%s" stroke-width="2" '
          'stroke-dasharray="7 5" opacity="0.75"/>' % (pts, c["ink"]))

    # points
    def marker(p, filled):
        col = c[p["hw"]]
        x, y = px(p["x"]), py(p["y"])
        if filled:
            a('<circle cx="%.1f" cy="%.1f" r="7.5" fill="%s" stroke="%s" stroke-width="2.5"/>'
              % (x, y, col, c["bg"]))
        else:
            a('<circle cx="%.1f" cy="%.1f" r="7" fill="%s" stroke="%s" stroke-width="2.5"/>'
              % (x, y, c["bg"], col))
        dx, dy, anchor, name = LABELS.get(p["slug"], (11, 5, "start", p["slug"]))
        a('<text x="%.1f" y="%.1f" fill="%s" font-size="12.5" font-weight="600" '
          'text-anchor="%s">%s</text>' % (x + dx, y + dy, c["ink"], anchor, esc(name)))
        if p["task"] and filled:
            a('<text x="%.1f" y="%.1f" fill="%s" font-size="11" text-anchor="%s">%s</text>'
              % (x + dx, y + dy + 13, c["mute"], anchor, esc(p["task"])))

    for p in synth:
        marker(p, False)
    for p in agent:
        marker(p, True)

    # legend
    lx, ly = X0 + 16, Y0 + 20
    rows = [
        ("dot", c["r9700"], True, "Radeon AI PRO R9700"),
        ("dot", c["evox2"], True, "AMD Ryzen AI Max+ 395"),
        ("dot", c["evox2"], False, "synthetic sweep — not comparable"),
        ("dash", c["ink"], True, "Pareto front — agent runs"),
        ("dot2", c["cloud"], True, "cloud reference"),
    ]
    for i, (kind, col, filled, text) in enumerate(rows):
        y = ly + i * 21
        if kind == "dot":
            if filled:
                a('<circle cx="%.1f" cy="%.1f" r="6" fill="%s"/>' % (lx, y - 4, col))
            else:
                a('<circle cx="%.1f" cy="%.1f" r="5.5" fill="%s" stroke="%s" '
                  'stroke-width="2.5"/>' % (lx, y - 4, c["bg"], col))
        elif kind == "dash":
            a('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="2" '
              'stroke-dasharray="7 5"/>' % (lx - 7, y - 4, lx + 7, y - 4, col))
        else:
            a('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="1.5" '
              'stroke-dasharray="2 4"/>' % (lx - 7, y - 4, lx + 7, y - 4, col))
        a('<text x="%.1f" y="%.1f" fill="%s" font-size="12">%s</text>'
          % (lx + 16, y, c["mute"], esc(text)))

    a('</svg>')
    return "\n".join(s)


def main():
    agent, synth, cloud, skipped = collect()
    if not os.path.isdir(OUT):
        os.makedirs(OUT)
    for name in THEMES:
        path = os.path.join(OUT, "field-%s.svg" % name)
        io.open(path, "w", encoding="utf-8").write(draw(name, agent, synth, cloud))
        print("wrote %s" % os.path.relpath(path, ROOT))

    front = pareto(agent)
    print("\n%d agent runs plotted, %d synthetic, %d cloud reference line(s)"
          % (len(agent), len(synth), len(cloud)))
    print("Pareto front over the agent runs:")
    for p in front:
        print("  %-38s %6.2f t/s   quality %d" % (p["slug"], p["x"], p["y"]))
    for r in skipped:
        print("not plotted (quality but no decode median): %s" % r["slug"])


if __name__ == "__main__":
    main()
