@echo off
cd /d "%~dp0"
start "" "Deckadence.exe"
timeout /t 4 >nul
echo Please leave this window open while running the app. If you close this window Deckadence will not run. Close the window to shut down the app.
start "" "http://127.0.0.1:5000"