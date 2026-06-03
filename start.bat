@echo off
echo Demarrage formation-sav.fr...
cd /d C:\formation
pm2 start ecosystem.config.js
timeout /t 2 /nobreak >nul
pm2 list
echo.
echo Serveurs demarres.
pause
