@echo off
echo.
echo  ============================================
echo   MULLER AUTOMOTIVE - Certificat Conformite
echo  ============================================
echo.
echo  Demarrage du serveur...
cd /d "%~dp0"
start "" "http://localhost:3003"
node server.js
pause
