@echo off
echo Iniciando API Python (WebSocket en ws://localhost:9000)...
cd /d "%~dp0api"
python server.py
pause
