# 🚀 VoiceToText — Guía de Despliegue

> **📖 [README](README.md)** · **🚀 [Despliegue](DEPLOY.md)**

---

## Requisitos previos

| Herramienta | Versión mínima | Notas |
|---|---|---|
| Docker | 24+ | Incluye Docker Compose v2 |
| Node.js | 18+ | Solo si se ejecuta sin Docker |
| npm | 9+ | Solo si se ejecuta sin Docker |

---

## 1. Despliegue con Docker (recomendado)

### 1.1 Inicio rápido

```bash
# Clonar el repositorio
git clone <url-del-repo>
cd DocTalkVoiceToText

# Levantar todo el stack
docker compose up -d
```

El frontend estará disponible en **http://localhost:3005** y el servidor Whisper en **http://localhost:8000**.

### 1.2 Estructura Docker

| Servicio | Imagen | Puerto | Descripción |
|---|---|---|---|
| `whisper` | `fedirz/faster-whisper-server:latest-cpu` | 8000 | Motor de transcripción |
| `frontend` | Build local (`Dockerfile`) | 3005 | Next.js + WS Proxy |

### 1.3 Verificar que funciona

```bash
# Ver logs de ambos servicios
docker compose logs -f

# Verificar que Whisper responde
curl http://localhost:8000/health
```

### 1.4 Detener el stack

```bash
docker compose down           # Detener servicios
docker compose down -v        # Detener y borrar volúmenes (modelos descargados)
```

---

## 2. GPU con NVIDIA

Para usar GPU y obtener transcripciones más rápidas, edita `docker-compose.yml`:

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

**Requisitos GPU:**
- Docker con [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html)
- Driver NVIDIA 525+
- CUDA 12.0+

---

## 3. Modelos disponibles

| Modelo | Tamaño | Calidad | VRAM mínima |
|---|---|---|---|
| `Systran/faster-whisper-tiny` | 75 MB | Baja | 1 GB |
| `Systran/faster-whisper-base` | 140 MB | Media | 1 GB |
| `Systran/faster-whisper-small` | 460 MB | Buena | 2 GB |
| `Systran/faster-whisper-medium` | 1.5 GB | Muy buena | 5 GB |
| `Systran/faster-whisper-large-v3` | 3 GB | Excelente | 10 GB |

Cambia el modelo en `docker-compose.yml` → `WHISPER__MODEL` o selecciónalo desde la UI del frontend.

---

## 4. Despliegue sin Docker

### 4.1 Backend — Faster-Whisper Server

```bash
pip install faster-whisper-server
faster-whisper-server --host 0.0.0.0 --port 8000
```

### 4.2 Frontend — Next.js

```bash
cd DocTalkVoiceToText

# Instalar dependencias
npm install

# Configurar variables
cp .env.example .env   # o crear .env manualmente (ver abajo)

# Build de producción
npm run build
npm run start
```

### 4.3 Con PM2 (producción)

```bash
npm install -g pm2

# Frontend
pm2 start "npm run start" --name voicetotext-frontend

# Ver logs
pm2 logs voicetotext-frontend
```

---

## 5. Variables de entorno

| Variable | Default | Descripción |
|---|---|---|
| `PORT` | `3000` | Puerto del servidor Node.js |
| `NODE_ENV` | `development` | `production` para builds optimizados |
| `NEXT_PUBLIC_WS_URL` | `/ws` | Ruta WebSocket del frontend |
| `NEXT_PUBLIC_DEFAULT_MODEL` | `base` | Modelo Whisper por defecto |
| `BACKEND_WS_URL` | `ws://localhost:9000` | URL WebSocket del backend Whisper |

En Docker, las variables se definen en `docker-compose.yml` → `environment`.
Sin Docker, crear un archivo `.env` en la raíz del proyecto.

---

## 6. Rebuild y actualización

```bash
# Actualizar imagen del backend
docker compose pull whisper

# Rebuild del frontend (tras cambios en el código)
docker compose build frontend

# Reiniciar todo
docker compose up -d
```

---

## 7. Troubleshooting

| Problema | Solución |
|---|---|
| "Error de conexión" en el frontend | Verificar que el servicio `whisper` está corriendo: `docker compose ps` |
| No se escucha audio / volumen en 0 | Dar permisos de micrófono al navegador |
| Transcripción lenta | Usar un modelo más pequeño o activar GPU |
| Puerto ocupado | Cambiar puertos en `docker-compose.yml` → `ports` |
| El modelo tarda en cargar | La primera vez se descarga; posteriores usan caché del volumen `whisper-models` |
