@echo off
cd /d "%~dp0"
if exist ".deckadence-update\transaction.json" (
    ".deckadence-update\runner.exe" recover --root "%CD%"
    if errorlevel 1 (
        echo Update recovery could not finish. Keep this folder intact and check .deckadence-update\helper-error.json.
        pause
        exit /b 1
    )
)
start "" "Deckadence.exe"
