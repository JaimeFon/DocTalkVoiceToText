# 🖥️ Guía de Despliegue — Windows Server (sin Docker)

> Despliegue completo de DocTalk VoiceToText en Windows Server con Python nativo.
> Ruta base: `C:\Users\alejandro\Desktop\`

---

## Requisitos previos

| Herramienta | Versión mínima | Instalador |
|---|---|---|
| Windows Server | 2019+ | — |
| Node.js | 18+ | https://nodejs.org |
| Python | 3.10+ | https://www.python.org/downloads/ |
| Git | 2.40+ | https://git-scm.com/download/win |
| IIS | 10+ | Rol de Windows Server |

---

## Paso 1 — Instalar FFmpeg

```powershell
# Descargar FFmpeg
Invoke-WebRequest -Uri "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip" -OutFile "$env:TEMP\ffmpeg.zip"

# Extraer a C:\tools\ffmpeg
Expand-Archive -Path "$env:TEMP\ffmpeg.zip" -DestinationPath "C:\tools" -Force

# Renombrar la carpeta (el nombre incluye la versión)
Get-ChildItem "C:\tools\ffmpeg-*-essentials_build" | Rename-Item -NewName "ffmpeg"

# Agregar al PATH del sistema
[Environment]::SetEnvironmentVariable("Path", $env:Path + ";C:\tools\ffmpeg\bin", "Machine")

# Recargar PATH en esta sesión
$env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine")

# Verificar
ffmpeg -version
```

---

## Paso 2 — Crear entorno virtual de Whisper

```powershell
cd C:\Users\alejandro\Desktop
python -m venv whisper-env
.\whisper-env\Scripts\Activate.ps1
pip install faster-whisper-server
deactivate
```

---

## Paso 3 — Crear entorno virtual de diarización

```powershell
cd C:\Users\alejandro\Desktop
python -m venv diarize-env
.\diarize-env\Scripts\Activate.ps1
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
pip install faster-whisper "whisperx @ git+https://github.com/m-bain/whisperx.git"
pip install "pyannote.audio>=3.1" fastapi "uvicorn[standard]" python-multipart
deactivate
```

> **Requisito previo:** Aceptar las licencias de pyannote en HuggingFace (logueado):
> - https://huggingface.co/pyannote/segmentation-3.0
> - https://huggingface.co/pyannote/speaker-diarization-3.1

---

## Paso 4 — Compilar el frontend

```powershell
cd C:\Users\alejandro\Desktop\DocTalkVoiceToText
npm install
npm run build
```

---

## Paso 5 — Crear carpeta de logs

```powershell
mkdir C:\Users\alejandro\Desktop\logs
```

---

## Paso 6 — Probar manualmente (3 terminales)

### Terminal 1 — Whisper (puerto 8000)

```powershell
cd C:\Users\alejandro\Desktop
.\whisper-env\Scripts\Activate.ps1
$env:WHISPER__MODEL = "Systran/faster-whisper-small"
$env:WHISPER__INFERENCE_DEVICE = "cpu"
$env:WHISPER__COMPUTE_TYPE = "int8"
faster-whisper-server --host 0.0.0.0 --port 8000
```

Esperar hasta ver: `Uvicorn running on 0.0.0.0:8000`

### Terminal 2 — Diarización (puerto 8001)

```powershell
cd C:\Users\alejandro\Desktop
.\diarize-env\Scripts\Activate.ps1
$env:HF_TOKEN = "hf_TU_TOKEN_AQUI"
cd C:\Users\alejandro\Desktop\DocTalkVoiceToText\diarize-server
uvicorn main:app --host 0.0.0.0 --port 8001
```

Esperar hasta ver: `Uvicorn running on 0.0.0.0:8001`

### Terminal 3 — Frontend (puerto 3005)

```powershell
cd C:\Users\alejandro\Desktop\DocTalkVoiceToText
npm run start
```

Esperar hasta ver: `Server listening on http://localhost:3005`

### Verificar

```powershell
curl http://localhost:8000/health
curl http://localhost:8001/health
curl http://localhost:3005
```

Abrir **http://localhost:3005** en el navegador.

---

## Paso 7 — Configurar IIS como reverse proxy

### 7.1 Instalar URL Rewrite

Descargar e instalar desde: https://www.iis.net/downloads/microsoft/url-rewrite

O por PowerShell (como Administrador):

```powershell
# Descargar URL Rewrite
Invoke-WebRequest -Uri "https://download.microsoft.com/download/1/2/8/128E2E22-C1B9-44A4-BE2A-5859ED1D4592/rewrite_amd64_en-US.msi" -OutFile "$env:TEMP\urlrewrite.msi"

# Instalar silenciosamente
Start-Process msiexec.exe -ArgumentList "/i $env:TEMP\urlrewrite.msi /quiet /norestart" -Wait

# Verificar instalación
Get-WebGlobalModule | Where-Object { $_.Name -like "*Rewrite*" }
```

### 7.2 Instalar Application Request Routing (ARR)

Descargar e instalar desde: https://www.iis.net/downloads/microsoft/application-request-routing

O por PowerShell (como Administrador):

```powershell
# Descargar ARR
Invoke-WebRequest -Uri "https://download.microsoft.com/download/E/9/8/E9849D6A-020E-47E4-9FD0-A023E99B54EB/requestRouter_amd64.msi" -OutFile "$env:TEMP\arr.msi"

# Instalar silenciosamente
Start-Process msiexec.exe -ArgumentList "/i $env:TEMP\arr.msi /quiet /norestart" -Wait

# Verificar instalación
Get-WebGlobalModule | Where-Object { $_.Name -like "*Routing*" -or $_.Name -like "*ARR*" }
```

### 7.3 Instalar WebSocket Protocol

**Esto es obligatorio** — sin WebSocket Protocol, IIS devuelve error 500.

```powershell
# Instalar WebSocket Protocol (como Administrador)
Install-WindowsFeature Web-WebSockets

# Verificar (debe decir "Installed")
Get-WindowsFeature Web-WebSockets

# Reiniciar IIS
iisreset
```

### 7.4 Habilitar ARR Proxy

**Opción A — Por PowerShell (recomendado):**

```powershell
# Habilitar proxy en ARR
Set-WebConfigurationProperty -pspath 'MACHINE/WEBROOT/APPHOST' -filter "system.webServer/proxy" -name "enabled" -value "true"

# Verificar (debe decir "True")
(Get-WebConfigurationProperty -pspath 'MACHINE/WEBROOT/APPHOST' -filter "system.webServer/proxy" -name "enabled").Value
```

**Opción B — Por IIS Manager (gráfico):**

1. Abrir **IIS Manager**
2. Click en el **nombre del servidor** (raíz)
3. Doble click en **Application Request Routing Cache**
4. Click en **Server Proxy Settings** (panel derecho)
5. Marcar **✅ Enable proxy**
6. Click en **Apply**

### 7.5 Verificar que todo está instalado

```powershell
Write-Host "=== URL Rewrite ===" -ForegroundColor Green
Get-WebGlobalModule | Where-Object { $_.Name -like "*Rewrite*" }

Write-Host "=== ARR ===" -ForegroundColor Green
Get-WebGlobalModule | Where-Object { $_.Name -like "*Routing*" -or $_.Name -like "*ARR*" }

Write-Host "=== ARR Proxy habilitado ===" -ForegroundColor Green
(Get-WebConfigurationProperty -pspath 'MACHINE/WEBROOT/APPHOST' -filter "system.webServer/proxy" -name "enabled").Value

Write-Host "=== WebSocket Protocol ===" -ForegroundColor Green
Get-WindowsFeature Web-WebSockets
```

Los 4 deben mostrar resultados positivos antes de continuar.

### 7.6 Crear el sitio IIS

1. En IIS Manager → click derecho en **Sites** → **Add Website**
2. Configurar:
   - **Site name:** `DocTalk`
   - **Physical path:** `C:\Users\alejandro\Desktop\DocTalkVoiceToText`
   - **Binding:** Puerto `80` (o `443` con certificado SSL)
   - **Host name:** tu dominio o dejar vacío para IP directa
3. Click **OK**

### 7.7 web.config

El archivo `web.config` ya está en el proyecto. IIS lo lee automáticamente si la carpeta física apunta al proyecto.

Si la carpeta del sitio IIS es distinta, copia el web.config:

```powershell
Copy-Item C:\Users\alejandro\Desktop\DocTalkVoiceToText\web.config C:\inetpub\DocTalk\web.config
```

### 7.8 Verificar

Abrir en el navegador: `http://tu-servidor` — debería mostrar la UI de DocTalk.

---

## Paso 8 — Configurar servicios permanentes (NSSM)

Instala NSSM para que los 3 procesos arranquen automáticamente con Windows:

```powershell
# Descargar NSSM desde https://nssm.cc y extraer a C:\tools\
# O si tienes Chocolatey:
choco install nssm -y
```

### 8.1 Whisper como servicio

```powershell
nssm install WhisperServer "C:\Users\alejandro\Desktop\whisper-env\Scripts\faster-whisper-server.exe"
nssm set WhisperServer AppParameters "--host 0.0.0.0 --port 8000"
nssm set WhisperServer AppEnvironmentExtra "WHISPER__MODEL=Systran/faster-whisper-small" "WHISPER__INFERENCE_DEVICE=cpu" "WHISPER__COMPUTE_TYPE=int8"
nssm set WhisperServer AppStdout "C:\Users\alejandro\Desktop\logs\whisper.log"
nssm set WhisperServer AppStderr "C:\Users\alejandro\Desktop\logs\whisper-error.log"
nssm start WhisperServer
```

### 8.2 Diarización como servicio

```powershell
nssm install DiarizeServer "C:\Users\alejandro\Desktop\diarize-env\Scripts\uvicorn.exe"
nssm set DiarizeServer AppParameters "main:app --host 0.0.0.0 --port 8001"
nssm set DiarizeServer AppDirectory "C:\Users\alejandro\Desktop\DocTalkVoiceToText\diarize-server"
nssm set DiarizeServer AppEnvironmentExtra "HF_TOKEN=hf_TU_TOKEN_AQUI"
nssm set DiarizeServer AppStdout "C:\Users\alejandro\Desktop\logs\diarize.log"
nssm set DiarizeServer AppStderr "C:\Users\alejandro\Desktop\logs\diarize-error.log"
nssm start DiarizeServer
```

### 8.3 Frontend como servicio

```powershell
nssm install DocTalkFrontend "C:\Program Files\nodejs\node.exe"
nssm set DocTalkFrontend AppParameters "server.js"
nssm set DocTalkFrontend AppDirectory "C:\Users\alejandro\Desktop\DocTalkVoiceToText"
nssm set DocTalkFrontend AppEnvironmentExtra "PORT=3005" "NODE_ENV=production" "WHISPER_API_URL=http://localhost:8000" "DIARIZE_API_URL=http://localhost:8001"
nssm set DocTalkFrontend AppStdout "C:\Users\alejandro\Desktop\logs\frontend.log"
nssm set DocTalkFrontend AppStderr "C:\Users\alejandro\Desktop\logs\frontend-error.log"
nssm start DocTalkFrontend
```

---

## Paso 9 — Verificación final

```powershell
# Servicios corriendo?
nssm status WhisperServer
nssm status DiarizeServer
nssm status DocTalkFrontend

# Puertos escuchando?
netstat -an | Select-String "8000|8001|3005"

# Health checks
curl http://localhost:8000/health
curl http://localhost:8001/health
curl http://localhost:3005

# IIS proxy funciona?
curl http://localhost
```

---

## Estructura final

```
C:\Users\alejandro\Desktop\
├── DocTalkVoiceToText\        ← proyecto
│   ├── .env
│   ├── server.js
│   ├── web.config
│   ├── package.json
│   ├── diarize-server\
│   │   └── main.py
│   ├── src\
│   ├── public\
│   └── .next\
├── whisper-env\               ← Python: Whisper
├── diarize-env\               ← Python: diarización
└── logs\                      ← logs de servicios
    ├── whisper.log
    ├── whisper-error.log
    ├── diarize.log
    ├── diarize-error.log
    ├── frontend.log
    └── frontend-error.log
```

## Resumen de puertos

```
Internet → IIS (:80/:443)
              ↓ reverse proxy (web.config)
           Node.js (:3005)  ← frontend + WebSocket bridge
              ↓ REST POST
           Whisper (:8000)  ← transcripción
           Diarize (:8001)  ← identificación de hablantes
```

| Servicio | Puerto | Servicio Windows |
|---|---|---|
| IIS | 80/443 | w3svc (ya existe) |
| Frontend | 3005 | DocTalkFrontend |
| Whisper | 8000 | WhisperServer |
| Diarización | 8001 | DiarizeServer |

---

## Comandos útiles

```powershell
# Reiniciar un servicio
nssm restart WhisperServer

# Ver logs en tiempo real
Get-Content C:\Users\alejandro\Desktop\logs\whisper.log -Wait

# Detener todos los servicios
nssm stop WhisperServer; nssm stop DiarizeServer; nssm stop DocTalkFrontend

# Eliminar un servicio
nssm remove WhisperServer confirm
```
