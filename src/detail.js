/* Detailseite: Tiefenkurve zeichnen, falls der Lauf eine hat. */
(function () {
  "use strict";
  var r = window.__RUN__;
  if (!r || !r.depth) return;
  var INK = "#f2f0ff", INK3 = "#8b86ab", GRID = "rgba(236,233,255,.09)", PLOT = "#0b0820";
  var P = r.depth.points, col = r.hw === "r9700" ? "#1c9ab8" : "#cb7815";
  var yMax = Math.ceil(Math.max.apply(null, P.map(function (p) { return p[1]; })) / 20) * 20;
  var xMax = Math.max.apply(null, P.map(function (p) { return p[0]; })) * 1.04;
  var ticks = [0, yMax * 0.25, yMax * 0.5, yMax * 0.75, yMax].map(function (v) { return Math.round(v); });

  var w = 760, h = 320, l = 54, rr = 20, t = 22, b = 46;
  function X(v) { return l + (v / xMax) * (w - l - rr); }
  function Y(v) { return (h - b) - (v / yMax) * ((h - b) - t); }
  function de(n, d) { return Number(n).toFixed(d).replace(".", ","); }
  var s = [];
  ticks.forEach(function (g) {
    s.push('<line x1="' + l + '" y1="' + Y(g) + '" x2="' + (w - rr) + '" y2="' + Y(g) + '" stroke="' + GRID + '"/>');
    s.push('<text x="' + (l - 9) + '" y="' + (Y(g) + 4) + '" fill="' + INK3 + '" font-family="IBM Plex Mono,monospace" font-size="10.5" text-anchor="end">' + g + '</text>');
  });
  var d = P.map(function (p, i) { return (i ? "L" : "M") + X(p[0]) + " " + Y(p[1]); }).join(" ");
  s.push('<path d="' + d + " L" + X(P[P.length - 1][0]) + " " + Y(0) + " L" + X(P[0][0]) + " " + Y(0) + '" fill="' + col + '" opacity=".15"/>');
  s.push('<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="2.5" stroke-linejoin="round"/>');
  P.forEach(function (p, i) {
    var last = i === P.length - 1;
    s.push('<circle cx="' + X(p[0]) + '" cy="' + Y(p[1]) + '" r="' + ((i === 0 || last) ? 4.5 : 3) + '" fill="' + col + '" stroke="' + PLOT + '" stroke-width="2"/>');
    if (i === 0 || last || i % 2 === 0)
      s.push('<text x="' + X(p[0]) + '" y="' + (h - 22) + '" fill="' + INK3 + '" font-family="IBM Plex Mono,monospace" font-size="10.5" text-anchor="middle">' + (p[0] < 1 ? "0,5K" : p[0] + "K") + '</text>');
  });
  s.push('<text x="' + (X(P[0][0]) + 12) + '" y="' + (Y(P[0][1]) + 5) + '" fill="' + INK + '" font-family="IBM Plex Mono,monospace" font-size="12" font-weight="600">' + de(P[0][1], 1) + ' ' + r.depth.unit + '</text>');
  var lp = P[P.length - 1];
  s.push('<text x="' + (X(lp[0]) - 8) + '" y="' + (Y(lp[1]) - 12) + '" fill="' + INK + '" font-family="IBM Plex Mono,monospace" font-size="12" font-weight="600" text-anchor="end">' + de(lp[1], 1) + ' ' + r.depth.unit + '</text>');
  s.push('<text x="' + l + '" y="' + (h - 5) + '" fill="' + INK3 + '" font-family="IBM Plex Mono,monospace" font-size="10.5">Kontexttiefe →</text>');
  var sv = document.getElementById("ddepth");
  if (sv) { sv.setAttribute("viewBox", "0 0 " + w + " " + h); sv.innerHTML = s.join(""); }
})();
