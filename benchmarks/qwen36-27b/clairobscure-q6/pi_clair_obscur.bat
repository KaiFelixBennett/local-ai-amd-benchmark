@echo off
setlocal
chcp 65001 >nul
title Pi Coding Agent - Clair Obscur (Qwen3.6-27B-MTP @ :8080)

REM ============================================================
REM  Pi Coding Agent gegen den lokalen llama.cpp-Server (:8080).
REM  Voraussetzung: der MTP-Server laeuft schon
REM  (start_qwen36_27b_q6_mtp_coding.bat) UND VS Code Copilot
REM  benutzt das lokale Modell NICHT gleichzeitig - sonst
REM  konkurrieren beide um den einen Slot (--parallel 1).
REM
REM  Provider/Model sind in ~/.pi/agent/models.json definiert
REM  (llama-cpp-local -> Qwen3.6-27B, Vision an, 131072 ctx).
REM  Extensions: pi-agent-browser-native (+ agent-browser CLI),
REM  pi-image-tools. AGENTS.md liegt im Projekt.
REM ============================================================

REM ============================================================
REM  VRAM & agent-browser (25.07.): Chromium hielt gemessen 4,8 GB VRAM +
REM  1,75 GB Shared - Speicher, der llama-server fehlte (Spill).
REM
REM  BEWUSST KEINE Chromium-Drossel-Flags via AGENT_BROWSER_ARGS:
REM   - --force-gpu-mem-available-mb wirkt unzuverlaessig (Chromium-Issue
REM     418173496) und kann bei knappem Budget Texturen verdraengen ->
REM     Artefakte in der 3D-Szene, die der Agent ja BEURTEILEN soll.
REM   - --disable-gpu-program-cache erzwingt Shader-Neukompilierung (langsamer).
REM   - --disable-gpu-shader-disk-cache betrifft die Platte, NICHT das VRAM.
REM  Das Rendering muss intakt bleiben - sonst bewertet der Agent Artefakte
REM  statt des echten Spiels.
REM
REM  Die wirksamen Hebel stehen stattdessen in den AGENTS.md/Skill-Regeln:
REM   1. Nach JEDER Verifikation: agent_browser close --all   (zuverlaessigster)
REM   2. viewport 1280 720 statt Vollbild (Render-Targets skalieren mit Flaeche)
REM   3. Keine Tabs anhaeufen
REM   4. Ursache pruefen: dispose() fuer Texturen/Render-Targets/PMREM im Spiel
REM ============================================================

cd /d "C:\Users\KaiFe\Desktop\Clair Obscure Qwen 3.6 27b"
pi --provider llama-cpp-local

endlocal
