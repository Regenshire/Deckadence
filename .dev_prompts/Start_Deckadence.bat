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
timeout /t 4 >nul
echo Please leave this window open while running the app. If you close this window Deckadence will not run. Close the window to shut down the app.
start "" "http://127.0.0.1:5050"
