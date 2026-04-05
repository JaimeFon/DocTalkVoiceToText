# 🚀 VoiceToText — Guía de Despliegue

> **📖 [README](README.md)** · **🚀 [Despliegue](DEPLOY.md)**

---

## Requisitos previos

| Herramienta | Versión mínima | Notas |
|---|---|---|
| Docker Desktop | 4.x+ | Para correr Faster-Whisper |
| Node.js | 18+ | Para el frontend Next.js |
| npm | 9+ | |
| IIS | 10+ | Con URL Rewrite + ARR |

---

## 1. Despliegue en Windows con IIS + Docker (recomendado)

Esta es la arquitectura de producción: **IIS** como reverse proxy público, **Node.js** sirviendo el frontend, y **Docker** corriendo Faster-Whisper.

```
Internet → IIS (:80/:443) → Node.js (:3005) → Docker Whisper (:8000)
```

### 1.1 Levantar Faster-Whisper en Docker

```powershell
# Solo el servicio whisper (el frontend corre nativo)
docker compose up whisper -d
```

Verificar que responde:

```powershell
curl http://localhost:8000/health
```

### 1.2 Configurar el frontend

```powershell
# Instalar dependencias
npm install

# Ajustar .env (el puerto debe coincidir con el rewrite de IIS)
# PORT=3005
# WHISPER_API_URL=http://localhost:8000

# Build de producción
npm run build

# Iniciar el servidor
npm run start
```

El frontend queda escuchando en `http://localhost:3005`.

### 1.3 Configurar IIS como reverse proxy

**Requisitos de IIS:**

1. **URL Rewrite Module** — [Descargar](https://www.iis.net/downloads/microsoft/url-rewrite)
2. **Application Request Routing (ARR)** — [Descargar](https://www.iis.net/downloads/microsoft/application-request-routing)
3. **WebSocket Protocol** — Activar en *Panel de control → Programas → Características de Windows → IIS → WebSocket Protocol*

**Pasos:**

1. En **IIS Manager → ARR → Server Proxy Settings** → Marcar *Enable proxy*
2. Crear un sitio en IIS apuntando a una carpeta vacía (o la carpeta del proyecto)
3. Copiar el archivo `web.config` incluido en el repo a la carpeta raíz del sitio IIS
4. Ajustar el puerto en `web.config` si no es 3005:

```xml
<!-- web.config — las dos reglas apuntan al mismo puerto -->
<action type="Rewrite" url="http://localhost:3005/{R:1}" />
```

5. Reiniciar el sitio en IIS

> **Importante:** El `web.config` incluye una regla para WebSocket upgrade (`WS-Proxy`) que detecta el header `Upgrade: websocket` y lo reenvía correctamente a Node.js. Sin esto, la transcripción en tiempo real no funciona.

### 1.4 Ejecutar como servicio Windows

Para que Node.js no dependa de una ventana de terminal abierta:

**Opción A — PM2 (recomendado):**

```powershell
npm install -g pm2
pm2 start "npm run start" --name voicetotext
pm2 save
pm2 startup     # Seguir instrucciones para que arranque con Windows
```

**Opción B — NSSM (Non-Sucking Service Manager):**

```powershell
# Descargar nssm de https://nssm.cc
nssm install VoiceToText "C:\Program Files\nodejs\node.exe" "D:\path\to\server.js"
nssm set VoiceToText AppDirectory "D:\path\to\DocTalkVoiceToText"
nssm set VoiceToText AppEnvironmentExtra "PORT=3005" "NODE_ENV=production" "WHISPER_API_URL=http://localhost:8000"
nssm start VoiceToText
```

---

## 2. Despliegue con Docker Compose (todo en contenedores)

Si prefieres no instalar Node.js en el host:

```powershell
docker compose up -d
```

| Servicio | Puerto | Descripción |
|---|---|---|
| `whisper` | 8000 | Faster-Whisper Server (CPU) |
| `frontend` | 3005 | Next.js + WS Bridge |

**IIS** apunta su rewrite a `localhost:3005` igual que en la opción nativa.

---

## 3. Despliegue sin Docker (Python nativo)

Si tu PC **no soporta virtualización** o no quieres usar Docker, puedes correr Whisper y la diarización directamente con Python.

### 3.1 Requisitos

| Herramienta | Versión mínima |
|---|---|
| Python | 3.10+ |
| pip | 22+ |
| ffmpeg | 6+ |
| Node.js | 18+ |

**Instalar ffmpeg** (necesario para procesar audio):

```powershell
# Opción A — con winget
winget install Gyan.FFmpeg

# Opción B — con choco
choco install ffmpeg

# Verificar
ffmpeg -version
```

### 3.2 Instalar y ejecutar Faster-Whisper Server

```powershell
# Crear entorno virtual (recomendado)
python -m venv whisper-env
.\whisper-env\Scripts\Activate.ps1

# Instalar faster-whisper-server
pip install faster-whisper-server

# Ejecutar (descarga el modelo la primera vez)
faster-whisper-server --host 0.0.0.0 --port 8000
```

Para configurar el modelo y dispositivo, usa variables de entorno:

```powershell
# PowerShell — modelo medium con CPU (int8 para ahorrar RAM)
$env:WHISPER__MODEL = "Systran/faster-whisper-small"
$env:WHISPER__INFERENCE_DEVICE = "cpu"
$env:WHISPER__COMPUTE_TYPE = "int8"

faster-whisper-server --host 0.0.0.0 --port 8000
```

Verificar:

```powershell
curl http://localhost:8000/health
```

### 3.3 Instalar y ejecutar la diarización (opcional)

```powershell
# Crear otro entorno virtual
python -m venv diarize-env
.\diarize-env\Scripts\Activate.ps1

# Instalar PyTorch CPU
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu

# Instalar dependencias de diarización
pip install faster-whisper "whisperx @ git+https://github.com/m-bain/whisperx.git"
pip install "pyannote.audio>=3.1" fastapi "uvicorn[standard]" python-multipart

# Configurar token de HuggingFace (necesario para pyannote)
$env:HF_TOKEN = "hf_TU_TOKEN_AQUI"

# Ejecutar el servidor de diarización
cd diarize-server
uvicorn main:app --host 0.0.0.0 --port 8001
```

> **Nota:** Antes de ejecutar, acepta las licencias de pyannote en:
> - https://huggingface.co/pyannote/segmentation-3.0
> - https://huggingface.co/pyannote/speaker-diarization-3.1

### 3.4 Ejecutar el frontend

```powershell
# En otra terminal
npm install
npm run build
npm run start
```

Abre **http://localhost:3005** en el navegador.

### 3.5 Ejecutar como servicios permanentes

Para que Whisper y la diarización no dependan de una terminal abierta, usa **NSSM**:

```powershell
# Whisper como servicio Windows
nssm install WhisperServer "C:\ruta\whisper-env\Scripts\faster-whisper-server.exe"
nssm set WhisperServer AppParameters "--host 0.0.0.0 --port 8000"
nssm set WhisperServer AppEnvironmentExtra ^
    "WHISPER__MODEL=Systran/faster-whisper-small" ^
    "WHISPER__INFERENCE_DEVICE=cpu" ^
    "WHISPER__COMPUTE_TYPE=int8"
nssm start WhisperServer

# Diarización como servicio Windows
nssm install DiarizeServer "C:\ruta\diarize-env\Scripts\uvicorn.exe"
nssm set DiarizeServer AppParameters "main:app --host 0.0.0.0 --port 8001"
nssm set DiarizeServer AppDirectory "D:\ruta\DocTalkVoiceToText\diarize-server"
nssm set DiarizeServer AppEnvironmentExtra "HF_TOKEN=hf_TU_TOKEN"
nssm start DiarizeServer
```

> El `.env` del frontend no cambia — `WHISPER_API_URL=http://localhost:8000` y `DIARIZE_API_URL=http://localhost:8001` apuntan igual con o sin Docker.

---

## 4. GPU con NVIDIA

Edita `docker-compose.yml`:

```yaml
services:
  whisper:
    image: fedirz/faster-whisper-server:latest-cuda
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    environment:
      - WHISPER__MODEL=Systran/faster-whisper-large-v3
      - WHISPER__INFERENCE_DEVICE=cuda
```

**Requisitos:**
- Docker Desktop con WSL2 backend
- [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html)
- Driver NVIDIA 525+

---

## 5. Modelos disponibles

| Modelo | Tamaño | Calidad | RAM mínima |
|---|---|---|---|
| `Systran/faster-whisper-tiny` | 75 MB | Baja | 1 GB |
| `Systran/faster-whisper-base` | 140 MB | Media | 1 GB |
| `Systran/faster-whisper-small` | 460 MB | Buena | 2 GB |
| `Systran/faster-whisper-medium` | 1.5 GB | Muy buena | 5 GB |
| `Systran/faster-whisper-large-v3` | 3 GB | Excelente | 10 GB |

Cambia el modelo en `docker-compose.yml` → `WHISPER__MODEL` o desde la UI del frontend.

---

## 6. Variables de entorno

| Variable | Default | Descripción |
|---|---|---|
| `PORT` | `3000` | Puerto del servidor Node.js |
| `NODE_ENV` | `production` | `production` para builds optimizados |
| `NEXT_PUBLIC_WS_URL` | `/ws` | Ruta WebSocket (relativa al dominio) |
| `NEXT_PUBLIC_DEFAULT_MODEL` | `base` | Modelo Whisper por defecto en la UI |
| `WHISPER_API_URL` | `http://localhost:8000` | URL del REST API de Faster-Whisper |

En Docker `compose`, las variables van en `environment:`.
Sin Docker, crear un archivo `.env` en la raíz del proyecto.

---

## 7. Endpoints disponibles

| Ruta | Método | Descripción |
|---|---|---|
| `/` | GET | UI de transcripción en tiempo real |
| `/ws` | WebSocket | Streaming PCM → transcripción (vía `server.js`) |
| `/api/transcribe` | POST | Subir archivo de audio → transcripción (REST) |

### Ejemplo: transcribir un archivo por REST

```powershell
curl -X POST http://localhost:3005/api/transcribe `
  -F "file=@audio.wav" `
  -F "model=base" `
  -F "language=es"
```

---

## 8. Rebuild y actualización

```powershell
# Actualizar imagen de Whisper
docker compose pull whisper
docker compose up whisper -d

# Rebuild del frontend (tras cambios en el código)
npm run build
pm2 restart voicetotext   # o reiniciar el servicio

# Si usas Docker para el frontend también
docker compose build frontend
docker compose up -d
```

---

## 9. Troubleshooting

| Problema | Solución |
|---|---|
| "Error de conexión" en el frontend | Verificar Whisper: `docker compose ps` y `curl http://localhost:8000/health` |
| WebSocket no conecta a través de IIS | Verificar que WebSocket Protocol está activado en IIS y ARR proxy habilitado |
| No se escucha audio / volumen en 0 | Dar permisos de micrófono en el navegador (requiere HTTPS o localhost) |
| Transcripción lenta | Usar modelo más pequeño (`tiny` o `base`) o activar GPU |
| Puerto ocupado | Cambiar `PORT` en `.env` y actualizar `web.config` |
| El modelo tarda en cargar | Primera vez descarga el modelo; posteriores usan caché del volumen Docker |
| IIS devuelve 502 Bad Gateway | Node.js no está corriendo en el puerto configurado |
