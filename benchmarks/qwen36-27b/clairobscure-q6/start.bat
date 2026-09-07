@echo off
setlocal
chcp 65001 >nul
title Static Server - Clair Obscur (http://127.0.0.1:8123/)
cd /d "%~dp0"
echo.
echo   Clair Obscur - statischer Server
echo   http://127.0.0.1:8123/
echo.
node serve.mjs
