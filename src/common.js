/* Gemeinsam: Hintergrundwahl, Bewegungsschalter, Kopierknoepfe. */
(function () {
  "use strict";
  var KEYS = ["depth", "field", "bands", "fluid"], inst = null, saved = null;
  try { saved = localStorage.getItem("bench.bg"); } catch (e) {}

  function setBg(k, remember) {
    if (typeof SCENES === "undefined" || !SCENES[k]) k = "fluid";
    if (inst) { inst.stop(); inst = null; }
    var old = document.getElementById("bgc");
    if (!old) return;
    var fresh = old.cloneNode(false);
    old.parentNode.replaceChild(fresh, old);
    fresh.id = "bgc";
    inst = mount(fresh, SCENES[k], 2);
    if (remember) { try { localStorage.setItem("bench.bg", k); } catch (e) {} }
    Array.prototype.forEach.call(document.querySelectorAll("[data-bg]"), function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.bg === k));
    });
  }
  Array.prototype.forEach.call(document.querySelectorAll("[data-bg]"), function (b) {
    b.addEventListener("click", function () { setBg(b.dataset.bg, true); });
  });
  if (typeof SCENES !== "undefined") {
    setBg((saved && SCENES[saved]) ? saved : KEYS[Math.floor(Math.random() * KEYS.length)], false);
  }

  var mb = document.getElementById("motion");
  function syncMotion() { if (mb) mb.textContent = paused ? "Bewegung an" : "Bewegung aus"; }
  if (mb) mb.addEventListener("click", function () { paused = !paused; syncMotion(); });
  syncMotion();
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { paused = true; syncMotion(); }
  });

  // Kopierknoepfe: entweder ein Element per id, oder eine Konfiguration per Index
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-copy],[data-cfg]");
    if (!b) return;
    var text = null;
    if (b.dataset.copy) {
      var el = document.getElementById(b.dataset.copy);
      if (el) text = el.textContent;
    } else if (window.CFG) {
      var c = window.CFG[+b.dataset.cfg];
      if (c) text = c.cmd;
    }
    if (!text) return;
    var label = b.textContent;
    function done() { b.textContent = "kopiert"; setTimeout(function () { b.textContent = label; }, 1600); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () {});
    } else {
      var ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); done(); } catch (err) {}
      document.body.removeChild(ta);
    }
  });
})();
