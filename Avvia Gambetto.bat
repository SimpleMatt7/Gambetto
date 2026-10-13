@echo off
rem Avvia Gambetto (app + server per account e partite online) e apre il browser.
rem Chiudi questa finestra per fermarlo.
cd /d "%~dp0"
call npm run build
start "" http://localhost:8787
call npm run server
pause
