@echo off
echo Arret des serveurs formation-sav...
pm2 stop formation-sav
pm2 stop certificat-conformite
pm2 list
pause
