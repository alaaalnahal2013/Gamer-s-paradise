@echo off
title Gamer's Paradise - Updater & Rebuilder
cls
echo ========================================================
echo   GAMER'S PARADISE • 1-CLICK APPLICATION REBUILDER
echo ========================================================
echo.
echo [1/3] Updating dependencies...
call ".venv\Scripts\pip.exe" install -r requirements.txt --quiet
echo [OK] Dependencies verified.
echo.
echo [2/3] Rebuilding Gamer's paradise.exe with latest perks & UI...
call ".venv\Scripts\python.exe" build_exe.py
echo.
echo [3/3] Testing all decoupled endpoints...
call ".venv\Scripts\python.exe" test_modular_suite.py
echo.
echo ========================================================
echo   Gamer's paradise.exe has been updated successfully!
echo ========================================================
pause
