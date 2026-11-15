@echo off
cd /d "%~dp0"
echo ======================================================
echo   Wish _ Action Cockpit - Launcher
echo ======================================================

echo Starting server and browser...
:: 1. 先に規定のブラウザでURLを開く
start http://localhost:8000/index.html

:: 2. ローカルサーバーを起動する（Python）
python -m http.server 8000