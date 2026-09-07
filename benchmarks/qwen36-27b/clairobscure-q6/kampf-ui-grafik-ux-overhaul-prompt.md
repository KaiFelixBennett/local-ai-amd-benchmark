# Prompt: Kampf-UI Grafik & UX Overhaul (Three.js/WebGL)

## Kontext
Ich arbeite an einem rundenbasierten Kampfsystem in Three.js/WebGL, visuell und strukturell inspiriert von *Clair Obscur: Expedition 33* (Turn-Order-Leiste, Charakter-/Gegner-Panels, Ziel-Auswahl per Tastatur). Aktueller Stand: Platzhalter-Geometrie (Sphere-Kopf + Cylinder-Rumpf pro Charakter), keine Post-Processing-Pipeline, dunkle/flache Beleuchtung, UI-Overlap-Bugs zwischen Namensschildern.

Ziel: Ein cinematisches, gut lesbares Kampf-UI. Arbeite die folgenden Phasen **sequenziell** ab, nicht parallel. Nach jeder Phase: kurzer Status (was wurde geändert, was ist noch offen), bevor die nächste Phase beginnt. Bestehende Kern-Logik (Turn-Order-Berechnung, AP-System, Tastatur-Navigation) darf sich funktional nicht ändern — nur Darstellung/Layout/Rendering.

---

## Phase 0 — Kritischer Bugfix: UI-Label-Overlap
**Problem:** Charakter-Namensschilder/HP-Bars werden aktuell offenbar per direkter World-to-Screen-Projektion positioniert. Bei enger Aufstellung überlappen sie mit dahinterliegenden Gegner-Panels (z. B. "Elara" über "Iron Golem"-Label, "Lucien" über "Shadow Weaver"-Bar).

**Aufgabe:**
- Refactore die Positionierung auf feste Screen-Space-Slots pro Kampfteilnehmer, statt reiner `Vector3.project()`-Projektion ohne Kollisionsschutz.
- Implementiere einen einfachen Layout-Pass: Labels nach Screen-X sortieren, bei Unterschreitung eines Mindestabstands horizontal auseinanderschieben (ähnlich Marker-Clustering auf Karten).
- Alternative/Ergänzung: Feste, garantierte Nicht-Overlap-Zonen für gegnerische vs. eigene Panels (z. B. Gegner-Infos ausschließlich oben, eigene ausschließlich unten — wie im bereits vorhandenen Party-Panel unten links, das korrekt funktioniert).
- Teste explizit den Fall "zwei Charaktere nah beieinander in der Tiefe" (genau der Fall, der aktuell bricht).

---

## Phase 1 — Rendering-Fundament: Licht & Post-Processing
**Ziel:** Aus flachem Unlit-Look einen definierten, cinematischen Look machen — größter visueller Hebel pro Aufwand.

- Renderer-Setup: `outputColorSpace = SRGBColorSpace`, `toneMapping = ACESFilmicToneMapping`, physically-correct Lights aktivieren.
- Post-Processing-Stack via `postprocessing` (pmndrs) statt three.js `EffectComposer` (bessere Performance/Qualität): Bloom, leichte Vignette, subtile Chromatic Aberration, optional Depth of Field mit Fokus auf dem aktiven Charakter (Hintergrundgegner leicht unscharf während Spieler-Zug).
- Pro-Charakter Rim-/Key-Light: Jeder Charakter erhält ein dediziertes `SpotLight` oder `DirectionalLight` (enger Cone), das ihn unabhängig vom dunklen Ambient-Licht von der Umgebung abhebt. Kein Charakter darf als reine Silhouette ohne Materialdefinition erscheinen.
- Contact Shadows/AO: `SSAOPass` oder einfacher — weicher Shadow-Blob (transparente Kreis-Textur) unter jedem Charakter-Fuß.
- Farbgrading: definiere eine feste Tonemapping-/Grading-Kurve (gedämpfte, leicht entsättigte Basis, warme Lichtakzente) statt Default-Rendering — das ist der Punkt, der am stärksten nach "Clair Obscur" statt "Unity-Blockout" aussieht.

---

## Phase 2 — UI/UX Overhaul
- Turn-Order-Leiste (oben rechts): Text durch runde Portrait-Icons ersetzen; aktueller Zug durch Scale-Up + Glow hervorheben statt nur Textfarbe.
- Gegner-HP-Leiste (oben Mitte): vergrößern, Portrait-Thumbnail ergänzen, Kontrastrahmen verstärken — aktuell auf Schwarz kaum lesbar.
- Action-Menü: AP-Kosten farbcodieren — grün wenn mit aktuellem AP-Stand leistbar, gedimmt/rot wenn nicht. Kein Kopfrechnen mehr nötig.
- Control-Hints (unten rechts): auf Icon-Basis umstellen (Tasten-Icons statt Fließtext) und größer, oder nur kontextuell einblenden, wenn die jeweilige Aktion verfügbar ist (z. B. Parry-Hinweis nur wenn parrybar).
- Targeting: Hover-/Fokus-Highlight (Outline-Shader oder Rim-Glow) auf aktuell anvisierbaren Gegnern, nicht erst nach Bestätigung sichtbar.
- Tooltip-System für Status-Icons (z. B. das rote Dreieck-Warnsymbol bei Elara) — jedes Icon braucht eine erklärende Bedeutung on-hover.

---

## Phase 3 — Environment & Atmosphäre
- Volumetrisches Licht/God-Rays von der vorhandenen Lichtquelle (Godrays-Shader-Ansatz oder einfache additive Kegel-Geometrie mit Noise).
- Hintergrund-Silhouetten/Architektur-Layer ergänzen (Parallax-Ebene oder simple Low-Poly-Kulisse) — aktuell wirkt der Void zu leer.
- Partikelsystem verdichten und Bewegungsvarianz hinzufügen (aktuell nur vereinzelte statische Punkte).
- Bodenmaterial: leichte Reflektion (`MeshReflectorMaterial` aus drei-Fiber/pmndrs, oder einfache gefakte Screen-Space-Reflection) statt Flat-Color.

---

## Phase 4 — Asset-Strategie & Charaktere
**Wichtige Entscheidung, bevor hier Zeit investiert wird:**
- Volles 3D-Charakter-Modelling + Rigging ist der teuerste Punkt im gesamten Projekt. Für Solo-Entwicklung empfehle ich einen Hybrid-Ansatz: 3D-Umgebung/Licht/VFX bleibt, Charaktere werden als hochwertige 2D-Illustrationen auf Billboard-Meshes (immer zur Kamera gedreht) dargestellt — Vorbild: Darkest Dungeon. Das erreicht einen beeindruckenden Look deutlich schneller als vollständig geriggte 3D-Modelle.
- Falls doch 3D gewünscht: glTF-Pipeline aus Blender, stilisiertes Low-Poly mit gebackenen Texturen (kein PBR-Fotorealismus nötig für den Look).
- Pro Skill dediziertes VFX (z. B. Lightning Storm: 3 sequenzielle Treffer mit Hit-Flash + Camera-Shake + Damage-Number-Popup).
- Hit-Feedback-Layer generell: kurzer Camera-Offset-Tween bei Treffern, kurzer Emissive-Boost auf dem getroffenen Charaktermaterial, Damage-Numbers als Sprite/HTML-Overlay mit Aufwärts-Tween + Fade-out.

---

## Output-Erwartung
Nach jeder Phase: kurze Zusammenfassung der Änderungen + Screenshot/Beschreibung des visuellen Ergebnisses, bevor die nächste Phase startet. Bei Unklarheiten zur bestehenden Codebasis (Dateistruktur, verwendete Bibliotheken wie R3F/drei vs. vanilla Three.js) vor Beginn kurz nachfragen statt zu raten.
