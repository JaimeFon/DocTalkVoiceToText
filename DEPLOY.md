# 🚀 VoiceToText - Guía de Despliegue

> **📖 [README](README.md)** · **🚀 [Despliegue](DEPLOY.md)**

## Requisitos previos

| Herramienta | Versión mínima |
|-------------|---------------|
| Python | 3.9+ |
| Node.js | 18+ |
| npm | 9+ |

---

## 1. Setup rápido (Windows)

```bat
setup.bat
```

Esto instala todas las dependencias de Python y Node.js automáticamente.

---

## 2. Setup manual

### API Python

```bash
cd api
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Linux/Mac
pip install -r requirements.txt
```

### Frontend Next.js

```bash
cd frontend
npm install
```

---

## 3. Ejecución en desarrollo

### Terminal 1 — API (WebSocket en `ws://localhost:9000`)

```bash
cd api
python server.py
```

> La primera vez descarga automáticamente el modelo Whisper tiny (~75 MB).

### Terminal 2 — Frontend (`http://localhost:3000`)

```bash
cd frontend
npm run dev
```

### Alternativa con .bat (Windows)

```bat
start-api.bat          # Terminal 1
start-frontend.bat     # Terminal 2
```

---

## 4. Modelos disponibles

Se puede cambiar el modelo desde el dropdown en la UI sin reiniciar.

| Modelo | Tamaño | Calidad español | Requiere GPU |
|--------|--------|-----------------|-------------|
| tiny | 75 MB | Baja | No |
| base | 140 MB | Media | No |
| small | 460 MB | Buena | Recomendado |
| medium | 1.5 GB | Muy buena | Sí |
| large-v3 | 3 GB | Excelente | Sí |

Para CPU usa `tiny` o `base`. Para GPU NVIDIA, edita en `server.py`:

```python
DEVICE = "cuda"
COMPUTE_TYPE = "float16"
```

---

## 5. Despliegue en producción

### Opción A — Servidor directo

#### API Python

```bash
cd api
pip install uvicorn
# Envolver el WebSocket server con un process manager:
python server.py
```

Usa un process manager como **PM2** o **systemd** para mantenerlo activo:

```bash
# Con PM2 (requiere Node.js)
pm2 start "python server.py" --name voicetotext-api
```

#### Frontend Next.js

```bash
cd frontend
npm run build
npm run start    # Sirve en :3000
```

Con PM2:

```bash
pm2 start "npm run start" --name voicetotext-frontend --cwd ./frontend
```

### Opción B — Docker

Crear `docker-compose.yml` en la raíz:

```yaml
services:
  api:
    build: ./api
    ports:
      - "9000:9000"
    volumes:
      - whisper-models:/root/.cache/huggingface
    restart: unless-stopped

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    depends_on:
      - api
    restart: unless-stopped

volumes:
  whisper-models:
```

`api/Dockerfile`:

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py .
EXPOSE 9000
CMD ["python", "server.py"]
```

`frontend/Dockerfile`:

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json .
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3000
CMD ["npm", "run", "start"]
```

Ejecutar:

```bash
docker compose up -d
```

---

## 6. Configuración de red

| Servicio | Puerto | Protocolo |
|----------|--------|-----------|
| Frontend | 3000 | HTTP |
| API | 9000 | WebSocket |

### HTTPS en producción

Usa un reverse proxy como **Nginx** o **Caddy**:

```nginx
# nginx.conf
server {
    listen 443 ssl;
    server_name voicetotext.tudominio.com;

    ssl_certificate     /etc/ssl/cert.pem;
    ssl_certificate_key /etc/ssl/key.pem;

    location / {
        proxy_pass http://localhost:3000;
    }

    location /ws {
        proxy_pass http://localhost:9000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Con este setup, cambiar `WS_URL` en el frontend a:

```typescript
const WS_URL = "wss://voicetotext.tudominio.com/ws";
```

---

## 7. Variables de entorno (opcionales)

Puedes configurar el API con variables de entorno en lugar de editar `server.py`:

| Variable | Default | Descripción |
|----------|---------|-------------|
| `WHISPER_MODEL` | `tiny` | Modelo inicial |
| `WHISPER_DEVICE` | `cpu` | `cpu` o `cuda` |
| `WHISPER_COMPUTE` | `int8` | `int8`, `float16`, `float32` |
| `WS_HOST` | `localhost` | Host del WebSocket |
| `WS_PORT` | `9000` | Puerto del WebSocket |

---

## 8. Troubleshooting

| Problema | Solución |
|----------|----------|
| `No se pudo conectar al servidor` | Verificar que `server.py` esté corriendo en puerto 9000 |
| Modelo no descarga | Verificar conexión a internet (descarga de HuggingFace) |
| Audio no se captura | Permitir acceso al micrófono en el navegador |
| Error CUDA | Instalar `pip install nvidia-cublas-cu12 nvidia-cudnn-cu12` |
| Transcripción lenta | Usar modelo `tiny` o `base` en CPU |
| Puerto ocupado | Cambiar puerto en `server.py` y `WS_URL` en `page.tsx` |
