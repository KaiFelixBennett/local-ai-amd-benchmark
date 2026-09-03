/* Startseite: Modellsuche, Filter, Rangliste, Diagramme. */
(function () {
  "use strict";
  var HW = window.HW, RUNS = window.RUNS, CFG = window.CFG;
  var INK = "#f2f0ff", INK3 = "#8b86ab", GRID = "rgba(236,233,255,.09)", PLOT = "#0b0820";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c];
    });
  }
  function de(n, d) {
    return (n === null || n === undefined) ? "—"
      : Number(n).toFixed(d === undefined ? 1 : d).replace(".", ",");
  }
  function href(r) { return "m/" + r.slug + "/index.html"; }

  /* ========================= Modellsuche ========================= */
  var q = document.getElementById("q");
  var list = document.getElementById("qlist");
  var sel = -1, hits = [];

  function score(r, needle) {
    if (!needle) return 1;
    var hay = (r.model + " " + r.quant + " " + r.task + " " + HW[r.hw].name + " " +
               HW[r.hw].short + " " + (r.spec || "")).toLowerCase();
    var words = needle.toLowerCase().split(/\s+/).filter(Boolean);
    for (var i = 0; i < words.length; i++) if (hay.indexOf(words[i]) < 0) return 0;
    // frueher Treffer im Modellnamen zaehlt mehr
    return 10 - Math.min(9, r.model.toLowerCase().indexOf(words[0]) < 0 ? 9
      : r.model.toLowerCase().indexOf(words[0]));
  }

  function render(needle) {
    hits = RUNS.map(function (r) { return { r: r, s: score(r, needle) }; })
               .filter(function (x) { return x.s > 0; })
               .sort(function (a, b) {
                 if (b.s !== a.s) return b.s - a.s;
                 var am = a.r.decode ? a.r.decode.median : -1, bm = b.r.decode ? b.r.decode.median : -1;
                 return bm - am;
               })
               .map(function (x) { return x.r; });
    if (!hits.length) {
      list.innerHTML = '<p class="fi-empty">Kein Modell gefunden.</p>';
    } else {
      list.innerHTML = hits.map(function (r, i) {
        var d = r.decode;
        return '<a class="fi' + (i === sel ? " sel" : "") + '" href="' + href(r) +
          '" role="option" data-i="' + i + '">' +
          '<span class="dot" style="background:' + HW[r.hw].color + '"></span>' +
          '<span class="nm"><b>' + esc(r.model) + '</b><span>' + esc(r.quant) + " · " +
          esc(HW[r.hw].short) + " · " + esc(r.task) + '</span></span>' +
          '<span class="sp">' + (d ? de(d.median, 2) + ' <em>t/s</em>' : '<em>kein Wert</em>') +
          '</span></a>';
      }).join("");
    }
    list.hidden = false;
    q.setAttribute("aria-expanded", "true");
  }
  function close() { list.hidden = true; sel = -1; q.setAttribute("aria-expanded", "false"); }
  function move(d) {
    if (list.hidden) render(q.value);
    sel = Math.max(0, Math.min(hits.length - 1, sel + d));
    Array.prototype.forEach.call(list.children, function (el, i) {
      el.classList.toggle("sel", i === sel);
      if (i === sel && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
    });
  }
  if (q) {
    q.addEventListener("input", function () { sel = -1; render(q.value); });
    q.addEventListener("focus", function () { render(q.value); });
    q.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
      else if (e.key === "Enter") {
        var r = hits[sel < 0 ? 0 : sel];
        if (r) { e.preventDefault(); location.href = href(r); }
      } else if (e.key === "Escape") { close(); q.blur(); }
    });
    document.addEventListener("click", function (e) {
      if (!e.target.closest(".finder")) close();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "/" && document.activeElement !== q) { e.preventDefault(); q.focus(); }
    });
  }

  /* ========================= Rangliste ========================= */
  var COLS = [
    { k: "rank", t: "#" },
    { k: "m", t: "Modell", sort: true },
    { k: "hw", t: "Hardware", sort: true },
    { k: "kind", t: "Messart", sort: true },
    { k: "dec", t: "Decode t/s", sort: true, num: true, bar: true, dec: 2 },
    { k: "rng", t: "p10 – p90" },
    { k: "peak", t: "Spitze", sort: true, num: true, dec: 2 },
    { k: "pre", t: "Prefill Median", sort: true, num: true, bar: true, dec: 0 },
    { k: "wall", t: "Laufzeit min ↓", sort: true, num: true, bar: true, dec: 0, low: true },
    { k: "fix", t: "Selbstkorr. ↓", sort: true, num: true, bar: true, dec: 0, low: true },
    { k: "qual", t: "Qualität vorl.", sort: true, num: true, bar: true, dec: 0, prov: true }
  ];
  var active = { r9700: true, evox2: true, cloud: false };
  var sortKey = "dec", sortDir = -1, view = "table";

  function flat(r) {
    return {
      raw: r, m: r.model, hw: r.hw, kind: r.kind,
      dec: r.decode ? r.decode.median : null,
      peak: r.decode ? r.decode.peak : null,
      rng: r.decode && r.decode.p10 ? de(r.decode.p10, 1) + " – " + de(r.decode.p90, 1) : "—",
      pre: r.prefill ? r.prefill.median : null,
      wall: r.minutes, fix: r.fixes, qual: r.quality
    };
  }
  function rows() { return RUNS.filter(function (r) { return active[r.hw]; }).map(flat); }
  function maxOf(k, rs) {
    return rs.reduce(function (m, x) { return x[k] === null || x[k] === undefined ? m : Math.max(m, x[k]); }, 0);
  }

  function renderTable() {
    var rs = rows();
    rs.sort(function (a, b) {
      var x = a[sortKey], y = b[sortKey];
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      if (typeof x === "string") return sortDir * x.localeCompare(y);
      return sortDir * (x - y);
    });
    document.getElementById("thead").innerHTML = COLS.map(function (c) {
      var on = c.sort && c.k === sortKey;
      return '<th class="' + (c.num ? "num" : "") + '"' + (c.sort ? ' tabindex="0" data-k="' + c.k + '"' : "") +
        (on ? ' aria-sort="' + (sortDir < 0 ? "descending" : "ascending") + '"' : "") + ">" +
        esc(c.t) + (on ? (sortDir < 0 ? " ▼" : " ▲") : "") + "</th>";
    }).join("");

    var mx = {}; COLS.forEach(function (c) { if (c.bar) mx[c.k] = maxOf(c.k, rs); });
    document.getElementById("tbody").innerHTML = rs.map(function (x, i) {
      var r = x.raw;
      return '<tr style="cursor:pointer" data-go="' + href(r) + '">' + COLS.map(function (c) {
        if (c.k === "rank") return '<td class="rank">' + (i + 1) + "</td>";
        if (c.k === "m") return '<td class="model"><div class="mname">' +
          '<span class="mtxt"><b>' + esc(r.model) + "</b><span>" + esc(r.quant) +
          (r.task ? " · " + esc(r.task) : "") + "</span></span></div></td>";
        if (c.k === "hw") return '<td><span class="hwchip"><i style="background:' + HW[r.hw].color +
          '"></i>' + esc(HW[r.hw].short) + "</span></td>";
        if (c.k === "kind") {
          var kl = { agent: ["Agentenlauf", "k-a"], synth: ["synthetisch", "k-s"], offen: ["offen", "k-o"] }[r.kind];
          return '<td><span class="kind ' + kl[1] + '">' + kl[0] + "</span></td>";
        }
        if (c.k === "rng") return '<td><span class="rngtxt">' + esc(x.rng) + "</span></td>";
        var v = x[c.k];
        if (v === null || v === undefined) return '<td class="num"><span class="v dim">—</span></td>';
        if (!c.bar) return '<td class="num"><span class="v dim">' + de(v, c.dec) + "</span></td>";
        var f = mx[c.k] ? v / mx[c.k] : 0;
        if (c.low) f = mx[c.k] ? 1 - (v / mx[c.k]) * 0.82 : 0;
        return '<td class="num"><div class="cell"><span class="barwrap"><i style="width:' +
          Math.max(4, f * 100).toFixed(1) + '%"></i></span><span class="v' + (c.prov ? " dim" : "") +
          '">' + de(v, c.dec) + "</span></div></td>";
      }).join("") + "</tr>";
    }).join("");
    document.getElementById("count").textContent = rs.length + " von " + RUNS.length + " Läufen";

    Array.prototype.forEach.call(document.querySelectorAll("#thead th[data-k]"), function (el) {
      function go() {
        var k = el.dataset.k;
        if (k === sortKey) sortDir = -sortDir; else { sortKey = k; sortDir = -1; }
        renderTable();
      }
      el.addEventListener("click", go);
      el.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); }
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll("#tbody tr[data-go]"), function (tr) {
      tr.addEventListener("click", function () { location.href = tr.dataset.go; });
    });
  }

  /* ========================= Streudiagramm ========================= */
  var W = 800, H = 360, L = 54, RR = 176, T = 24, B = 48;
  function pareto(l) {
    var s = l.slice().sort(function (a, b) { return b.decode.median - a.decode.median; });
    var out = [], best = -Infinity;
    s.forEach(function (r) { if (r.quality > best) { out.push(r); best = r.quality; } });
    return out.reverse();
  }
  function drawScatter() {
    var vis = RUNS.filter(function (r) { return active[r.hw]; });
    var loc = vis.filter(function (r) { return r.decode; });
    var cld = vis.filter(function (r) { return !r.decode && r.hw === "cloud"; });
    var px0 = L, px1 = W - RR, py0 = T, py1 = H - B, xMax = 40, yMin = 12, yMax = 20;
    function X(v) { return px0 + (v / xMax) * (px1 - px0); }
    function Y(v) { return py1 - ((v - yMin) / (yMax - yMin)) * (py1 - py0); }
    var s = [];
    for (var qq = 12; qq <= 20; qq += 2) {
      s.push('<line x1="' + px0 + '" y1="' + Y(qq) + '" x2="' + px1 + '" y2="' + Y(qq) + '" stroke="' + GRID + '"/>');
      s.push('<text x="' + (px0 - 10) + '" y="' + (Y(qq) + 4) + '" fill="' + INK3 + '" font-family="IBM Plex Mono,monospace" font-size="11" text-anchor="end">' + qq + "</text>");
    }
    for (var t = 0; t <= 40; t += 8) {
      s.push('<line x1="' + X(t) + '" y1="' + py1 + '" x2="' + X(t) + '" y2="' + (py1 + 5) + '" stroke="' + GRID + '"/>');
      s.push('<text x="' + X(t) + '" y="' + (py1 + 20) + '" fill="' + INK3 + '" font-family="IBM Plex Mono,monospace" font-size="11" text-anchor="middle">' + t + "</text>");
    }
    s.push('<text x="' + px0 + '" y="' + (H - 8) + '" fill="' + INK3 + '" font-family="IBM Plex Mono,monospace" font-size="11">Decode t/s →</text>');
    cld.forEach(function (r) {
      s.push('<line x1="' + px0 + '" y1="' + Y(r.quality) + '" x2="' + (px1 + 8) + '" y2="' + Y(r.quality) + '" stroke="' + HW.cloud.color + '" stroke-width="1.5" stroke-dasharray="5 5" opacity=".8"/>');
      s.push('<text x="' + (px1 + 16) + '" y="' + (Y(r.quality) + 4) + '" fill="#a9a2d6" font-family="IBM Plex Mono,monospace" font-size="11">' + esc(r.model) + "</text>");
    });
    var pf = pareto(loc), on = {};
    pf.forEach(function (r) { on[r.slug] = 1; });
    if (pf.length > 1) {
      s.push('<path d="' + pf.map(function (r, i) { return (i ? "L" : "M") + X(r.decode.median) + " " + Y(r.quality); }).join(" ") +
        '" fill="none" stroke="#a9a2d6" stroke-width="2" stroke-linejoin="round" opacity=".5"/>');
    }
    loc.forEach(function (r) {
      var c = HW[r.hw].color, x = X(r.decode.median), y = Y(r.quality);
      s.push('<a href="' + href(r) + '"><circle class="pt" data-slug="' + r.slug + '" cx="' + x + '" cy="' + y +
        '" r="8" fill="' + c + '" stroke="' + PLOT + '" stroke-width="2" style="cursor:pointer"/></a>');
      s.push('<text x="' + (x + 13) + '" y="' + (y - 9) + '" fill="' + (on[r.slug] ? INK : "#a9a2d6") +
        '" font-family="IBM Plex Sans,sans-serif" font-size="12" font-weight="' + (on[r.slug] ? 600 : 400) + '">' + esc(r.model) + "</text>");
    });
    var sv = document.getElementById("scatter");
    sv.setAttribute("viewBox", "0 0 " + W + " " + H);
    sv.innerHTML = s.join("");
    Array.prototype.forEach.call(sv.querySelectorAll(".pt"), function (el) {
      var r = RUNS.filter(function (x) { return x.slug === el.dataset.slug; })[0];
      el.addEventListener("pointerenter", function (e) { showTip(e, r); });
      el.addEventListener("pointermove", moveTip);
      el.addEventListener("pointerleave", hideTip);
    });
  }
  var tip = document.getElementById("tip");
  function showTip(e, r) {
    var d = r.decode;
    tip.innerHTML = "<b>" + esc(r.model) + "</b><table>" +
      "<tr><td>Quant</td><td>" + esc(r.quant) + "</td></tr>" +
      "<tr><td>Hardware</td><td>" + esc(HW[r.hw].short) + "</td></tr>" +
      "<tr><td>Decode</td><td>" + (d ? de(d.median, 2) + " t/s" : "—") + "</td></tr>" +
      "<tr><td>Spitze</td><td>" + (d && d.peak ? de(d.peak, 2) + " t/s" : "—") + "</td></tr>" +
      "<tr><td>Spekulation</td><td>" + esc(r.spec) + "</td></tr></table>" +
      "<div style='margin-top:7px;padding-top:6px;border-top:1px solid rgba(236,233,255,.12);color:#4fd4a0'>Klicken für Details</div>";
    tip.style.opacity = "1"; moveTip(e);
  }
  function moveTip(e) {
    var x = e.clientX + 16, y = e.clientY + 16, b = tip.getBoundingClientRect();
    if (x + b.width > innerWidth - 10) x = e.clientX - b.width - 16;
    if (y + b.height > innerHeight - 10) y = e.clientY - b.height - 16;
    tip.style.left = x + "px"; tip.style.top = y + "px";
  }
  function hideTip() { tip.style.opacity = "0"; }

  /* ========================= Tiefenkurven ========================= */
  window.drawDepth = function (id, P, xMaxV, yMaxV, unit, col, ticks) {
    var w = 620, h = 290, l = 50, r = 18, t = 20, b = 44;
    function X(v) { return l + (v / xMaxV) * (w - l - r); }
    function Y(v) { return (h - b) - (v / yMaxV) * ((h - b) - t); }
    var s = [];
    ticks.forEach(function (g) {
      s.push('<line x1="' + l + '" y1="' + Y(g) + '" x2="' + (w - r) + '" y2="' + Y(g) + '" stroke="' + GRID + '"/>');
      s.push('<text x="' + (l - 9) + '" y="' + (Y(g) + 4) + '" fill="' + INK3 + '" font-family="IBM Plex Mono,monospace" font-size="10.5" text-anchor="end">' + g + "</text>");
    });
    var d = P.map(function (p, i) { return (i ? "L" : "M") + X(p[0]) + " " + Y(p[1]); }).join(" ");
    s.push('<path d="' + d + " L" + X(P[P.length - 1][0]) + " " + Y(0) + " L" + X(P[0][0]) + " " + Y(0) + '" fill="' + col + '" opacity=".15"/>');
    s.push('<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="2.5" stroke-linejoin="round"/>');
    P.forEach(function (p, i) {
      var last = i === P.length - 1;
      s.push('<circle cx="' + X(p[0]) + '" cy="' + Y(p[1]) + '" r="' + ((i === 0 || last) ? 4.5 : 3) + '" fill="' + col + '" stroke="' + PLOT + '" stroke-width="2"/>');
      if (p[2] !== false) s.push('<text x="' + X(p[0]) + '" y="' + (h - 22) + '" fill="' + INK3 + '" font-family="IBM Plex Mono,monospace" font-size="10.5" text-anchor="middle">' + (p[3] || (p[0] + "K")) + "</text>");
    });
    s.push('<text x="' + (X(P[0][0]) + 12) + '" y="' + (Y(P[0][1]) + 5) + '" fill="' + INK + '" font-family="IBM Plex Mono,monospace" font-size="12" font-weight="600">' + de(P[0][1], 1) + " " + unit + "</text>");
    var lp = P[P.length - 1];
    s.push('<text x="' + (X(lp[0]) - 8) + '" y="' + (Y(lp[1]) - 12) + '" fill="' + INK + '" font-family="IBM Plex Mono,monospace" font-size="12" font-weight="600" text-anchor="end">' + de(lp[1], 1) + " " + unit + "</text>");
    s.push('<text x="' + l + '" y="' + (h - 5) + '" fill="' + INK3 + '" font-family="IBM Plex Mono,monospace" font-size="10.5">Kontexttiefe →</text>');
    var sv = document.getElementById(id);
    if (!sv) return;
    sv.setAttribute("viewBox", "0 0 " + w + " " + h);
    sv.innerHTML = s.join("");
  };

  /* ========================= Steuerung ========================= */
  function syncChips() {
    var all = active.r9700 && active.evox2 && active.cloud;
    Array.prototype.forEach.call(document.querySelectorAll(".chip"), function (el) {
      var f = el.dataset.f;
      el.setAttribute("aria-pressed", f === "all" ? String(all) : String(!all && active[f]));
    });
  }
  Array.prototype.forEach.call(document.querySelectorAll(".chip"), function (el) {
    el.addEventListener("click", function () {
      var f = el.dataset.f;
      if (f === "all") active = { r9700: true, evox2: true, cloud: true };
      else {
        var only = Object.keys(active).every(function (k) { return k === f ? active[k] : !active[k]; });
        if (only) active = { r9700: true, evox2: true, cloud: true };
        else { active = { r9700: false, evox2: false, cloud: false }; active[f] = true; }
      }
      syncChips(); renderTable(); if (view === "chart") drawScatter();
    });
  });
  Array.prototype.forEach.call(document.querySelectorAll("[data-v]"), function (b) {
    b.addEventListener("click", function () {
      view = b.dataset.v;
      Array.prototype.forEach.call(document.querySelectorAll("[data-v]"), function (x) {
        x.setAttribute("aria-pressed", String(x.dataset.v === view));
      });
      document.getElementById("viewTable").hidden = view !== "table";
      document.getElementById("viewChart").hidden = view !== "chart";
      if (view === "chart") drawScatter();
    });
  });

  syncChips(); renderTable();
  window.drawDepth("depth",
    [[8, 498.3, 1, "8K"], [16, 423.1, 0], [34, 323.0, 1, "34K"], [67, 223.3, 1, "67K"],
     [100, 172.4, 1, "100K"], [132, 139.6, 0], [164, 118.0, 1, "164K"]],
    170, 520, "t/s", "#1c9ab8", [0, 130, 260, 390, 520]);
  window.drawDepth("depth2",
    [[0.5, 22.14, 1, "0,5K"], [2, 21.99, 0], [4, 21.66, 1, "4K"], [16, 19.04, 1, "16K"],
     [32, 16.65, 1, "32K"], [65, 12.25, 1, "65K"], [131, 8.84, 0], [164, 7.70, 1, "164K"]],
    170, 24, "t/s", "#cb7815", [0, 6, 12, 18, 24]);
})();
