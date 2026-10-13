@echo off
rem Avvia Gambetto dentro Docker (in Ubuntu/WSL), come girera sulla VPS, e apre il browser.
rem Lascia aperta questa finestra: chiudendola WSL si spegne e con lui il contenitore.
wsl --cd "%~dp0." -d Ubuntu -u root -- docker compose up -d --build
start "" http://localhost:8787
wsl --cd "%~dp0." -d Ubuntu -u root -- docker compose logs -f --tail 20
pause
