@echo off
setlocal ENABLEDELAYEDEXPANSION
chcp 65001 >nul
title Redemarrage serveur NC

:: Auto-élévation UAC
net session >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    powershell -Command "Start-Process cmd.exe -ArgumentList '/c \"%~f0\"' -Verb RunAs -Wait"
    exit /b
)

echo ========================================
echo  Redemarrage serveur NC - Muller Auto
echo ========================================
echo.

:: Chercher PM2
set PM2=%APPDATA%\npm\pm2.cmd
if exist "%PM2%" (
    echo [1] Tentative PM2 reload...
    call "%PM2%" reload formation-sav 2>&1
    if !ERRORLEVEL! EQU 0 (
        echo [OK] Serveur rechargé via PM2.
        timeout /t 3 /nobreak >nul
        call "%PM2%" list 2>&1
        goto :fin
    )
    echo [!] PM2 reload échoué - passage au mode manuel.
)

:: Mode manuel
echo [2] Arret du processus sur port 3001...
set PID_FOUND=
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3001 " ^| findstr "LISTENING" 2^>nul') do (
    set PID_FOUND=%%p
)

if "!PID_FOUND!"=="" (
    echo    Aucun processus trouvé sur le port 3001.
) else (
    echo    Arret PID !PID_FOUND!...
    taskkill /F /PID !PID_FOUND! 2>&1
    if !ERRORLEVEL! NEQ 0 (
        echo    ECHEC taskkill - essayons avec PowerShell...
        powershell -Command "Stop-Process -Id !PID_FOUND! -Force" 2>&1
    )
)

echo.
echo [3] Attente 3 secondes (PM2 redémarre automatiquement)...
timeout /t 3 /nobreak >nul

:: Vérifier si PM2 a redémarré
netstat -ano | findstr ":3001 " | findstr "LISTENING" >nul 2>&1
if !ERRORLEVEL! EQU 0 (
    echo [OK] Serveur actif sur http://localhost:3001
    goto :fin
)

:: PM2 n'a pas redémarré - démarrer manuellement
echo [4] PM2 n'a pas redémarré - démarrage manuel...
cd /d C:\formation
start "" /B cmd /c "node server.js >> C:\formation\server.log 2>&1"
timeout /t 3 /nobreak >nul

netstat -ano | findstr ":3001 " | findstr "LISTENING" >nul 2>&1
if !ERRORLEVEL! EQU 0 (
    echo [OK] Serveur démarré manuellement sur http://localhost:3001
) else (
    echo [ERREUR] Le serveur ne répond pas. Consultez C:\formation\server.log
    echo.
    if exist "C:\formation\server.log" type C:\formation\server.log
)

:fin
echo.
echo ========================================
echo Appuyez sur une touche pour fermer.
echo ========================================
pause >nul
