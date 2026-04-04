@echo off
echo ========================================
echo  VoiceToText - Setup Completo
echo ========================================
echo.

REM --- Python API ---
echo [1/3] Instalando dependencias Python...
cd /d "%~dp0api"
python -m pip install -r requirements.txt
if errorlevel 1 (
    echo ERROR: Fallo instalando dependencias Python.
    echo Asegurate de tener Python 3.9+ instalado.
    pause
    exit /b 1
)

echo.
echo [2/3] Descargando modelo Whisper tiny (~75MB, primera vez)...
echo       (El modelo se descarga automaticamente al ejecutar server.py)
echo.

REM --- Frontend ---
echo [3/3] Instalando dependencias del frontend...
cd /d "%~dp0frontend"
call npm install
if errorlevel 1 (
    echo ERROR: Fallo instalando dependencias Node.js.
    echo Asegurate de tener Node.js 18+ instalado.
    pause
    exit /b 1
)

echo.
echo ========================================
echo  Setup completado!
echo.
echo  Para ejecutar:
echo    1. Terminal 1: cd api ^& python server.py
echo    2. Terminal 2: cd frontend ^& npm run dev
echo    3. Abrir http://localhost:3000
echo ========================================
pause
