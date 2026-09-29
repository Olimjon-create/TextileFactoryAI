@echo off
chcp 65001 >nul
cd /d "%~dp0backend"
echo.
echo  TextileCore: bazaning zaxira nusxasi olinmoqda (backend\backups\)...
echo.
venv\Scripts\python -m scripts.backup_db
echo.
pause
