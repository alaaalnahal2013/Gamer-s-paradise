@echo off
set "DIR=%~dp0"
if exist "%DIR%.venv\Scripts\pythonw.exe" (
    start "" "%DIR%.venv\Scripts\pythonw.exe" "%DIR%app_desktop.py" %*
) else if exist "%DIR%dist\Gamer's paradise\Gamer's paradise.exe" (
    start "" "%DIR%dist\Gamer's paradise\Gamer's paradise.exe" %*
) else (
    start http://127.0.0.1:8000
)
