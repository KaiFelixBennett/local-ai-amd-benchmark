# Bilderkennungs-Harness (Workspace-Fakten)

- Workspace: /srv/securesight.ai/securesight.ai/model-benchmark/qwen38_flash_next_bilderkennung
- Bilder: `harness/bilder/vision-dashboard.jpg` (= Bild A, Dashboard) und
  `harness/bilder/vision-foto.jpg` (= Bild B, Messestand Masken/Helme).
  Agent-Text nennt abweichend bild-a-dashboard.jpg / bild-b-stand.jpg — nicht vorhanden.
- Ergebnisse: `harness/ergebnisse/<slug>-vision.json` (Ordner wurde am 2026-09-18 angelegt).
- Bisher ausgefüllt: slug `qwen38-flash-next-llama-cpp` (2026-09-18).
  Ergebnis Bild B: alle Preise null — Etiketten bei Auslieferungsaflösung nicht lesbar;
  sichtbar_gesamt=8, nicht_lesbar=8 im Bewertungsbereich (x≤700, y≥950).
- Bild A Kernwerte (falls später gebraucht): Tooltip Claude Opus 4.5 vs Qwen3.6 27B
  (40.8/37.1, 87/84, 29/22, 50/61 — letzte Zeile Qwen vorn); Kacheln 37.1 / 91% / 59.9;
  Filter aktiv: FRONTER, QWEN, GEMMA, MISTRAL; inaktiv: KIMI 2, META, DEEPSEEK, GLM.
- Regel des Agents: kein Bild-Cropping/Zoom via Terminal (Misst das Modell, nicht die Lupe).
