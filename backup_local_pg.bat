@echo off
set PGPASSWORD=MullerNC2026!
set BACKUP_DIR=D:\backups_local_pg
set DATE_STR=%date:~6,4%%date:~3,2%%date:~0,2%
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"
"C:\Program Files\PostgreSQL\16\bin\pg_dump.exe" -U postgres -d nc_muller -F c -f "%BACKUP_DIR%\nc_muller_local_%DATE_STR%.dump"
echo Backup local PG termine : nc_muller_local_%DATE_STR%.dump
