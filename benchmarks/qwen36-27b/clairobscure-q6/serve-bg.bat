@echo off
REM Startet serve.mjs IM HINTERGRUND und kehrt SOFORT zurueck.
REM Grund: `node serve.mjs` direkt blockiert die aufrufende Shell ENDLOS
REM (der Server laeuft ewig). Agenten MUESSEN diesen Launcher nehmen, nicht
REM node serve.mjs im Vordergrund. Der Server laeuft danach in einem eigenen,
REM minimierten Fenster weiter (schliessen = Server stoppt).
cd /d "%~dp0"
start "Clair-Server 8123" /min node serve.mjs
echo Server im Hintergrund gestartet: http://127.0.0.1:8123/
