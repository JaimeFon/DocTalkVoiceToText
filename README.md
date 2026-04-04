# 🎤 VoiceToText

Transcripción de voz a texto **en tiempo real** usando Whisper, con procesamiento 100% local.

![Next.js](https://img.shields.io/badge/Next.js-15-black)
![Python](https://img.shields.io/badge/Python-3.9+-blue)
![Whisper](https://img.shields.io/badge/faster--whisper-1.1-green)

---

## ✨ Características

- **Transcripción en tiempo real** — el texto aparece mientras hablas
- **100% local** — sin enviar audio a la nube, privacidad total
- **Soporte español** — optimizado para transcripción en español
- **Cambio de modelo en caliente** — selecciona tiny → large-v3 desde la UI sin reiniciar
- **Indicador de volumen** — barra visual de nivel de audio
- **Timestamps** — cada fragmento transcrito lleva marca de hora
- **Copiar al portapapeles** — exporta toda la transcripción con un clic

---

## 🧠 Arquitectura

```
┌─────────────────────┐     WebSocket (audio PCM)     ┌──────────────────────┐
│   Next.js Frontend  │ ──────────────────────────────▶│   Python API         │
│   (localhost:3000)  │◀────────────────────────────── │   (localhost:9000)   │
│                     │     WebSocket (texto JSON)     │                      │
│  • AudioWorklet     │                                │  • faster-whisper    │
│  • Downsampling     │                                │  • VAD filter        │
│  • Volume meter     │                                │  • Model cache       │
└─────────────────────┘                                └──────────────────────┘
```

1. El navegador captura audio del micrófono vía `AudioWorklet`
2. El audio PCM float32 se hace downsample a 16 kHz y se envía por WebSocket
3. El servidor acumula el buffer y transcribe con `faster-whisper`
4. El texto resultante se devuelve al frontend en tiempo real

---

## 📋 Requisitos

| Herramienta | Versión mínima |
|-------------|---------------|
| Python      | 3.9+          |
| Node.js     | 18+           |
| npm         | 9+            |

---

## 🚀 Inicio rápido (Windows)

### 1. Instalar dependencias

```bat
setup.bat
```

### 2. Iniciar el servidor API

```bat
start-api.bat
```

> La primera vez descarga automáticamente el modelo Whisper tiny (~75 MB).

### 3. Iniciar el frontend

```bat
start-frontend.bat
```

### 4. Abrir en el navegador

```
http://localhost:3000
```

---

## 🔧 Setup manual

### API Python

```bash
cd api
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Linux/Mac
pip install -r requirements.txt
python server.py
```

### Frontend Next.js

```bash
cd frontend
npm install
npm run dev
```

---

## 🗂 Estructura del proyecto

```
DocTalkVoiceToText/
├── api/
│   ├── server.py            # Servidor WebSocket + transcripción Whisper
│   └── requirements.txt     # Dependencias Python
├── frontend/
│   ├── src/app/
│   │   ├── page.tsx         # UI principal (grabación, transcripción)
│   │   ├── layout.tsx       # Layout raíz
│   │   └── globals.css      # Estilos globales (Tailwind)
│   ├── public/
│   │   └── pcm-processor.js # AudioWorklet para captura de audio PCM
│   ├── package.json
│   ├── next.config.ts
│   ├── tsconfig.json
│   └── postcss.config.mjs
├── setup.bat                # Instalación automática
├── start-api.bat            # Lanzar API
├── start-frontend.bat       # Lanzar frontend
├── DEPLOY.md                # Guía completa de despliegue
└── README.md
```

---

## 🎛 Modelos disponibles

Se cambian desde el dropdown de la UI sin reiniciar el servidor.

| Modelo    | Tamaño  | Calidad español | CPU | GPU |
|-----------|---------|-----------------|-----|-----|
| tiny      | 75 MB   | Baja            | ✅  | ✅  |
| base      | 140 MB  | Media           | ✅  | ✅  |
| small     | 460 MB  | Buena           | ⚠️  | ✅  |
| medium    | 1.5 GB  | Muy buena       | ❌  | ✅  |
| large-v3  | 3 GB    | Excelente       | ❌  | ✅  |

> **Recomendación:** `tiny` o `base` para CPU. `small` o superior con GPU NVIDIA.

### Usar GPU

Editar en `api/server.py`:

```python
DEVICE = "cuda"
COMPUTE_TYPE = "float16"
```

---

## 🌐 Puertos

| Servicio  | Puerto | Protocolo |
|-----------|--------|-----------|
| Frontend  | 3000   | HTTP      |
| API       | 9000   | WebSocket |

---

## ❓ Troubleshooting

| Problema | Solución |
|----------|----------|
| No se pudo conectar al servidor | Verificar que `server.py` esté corriendo en puerto 9000 |
| Modelo no descarga | Verificar conexión a internet (descarga de HuggingFace) |
| Audio no se captura | Permitir acceso al micrófono en el navegador |
| Transcripción lenta | Usar modelo `tiny` o `base` en CPU |
| Puerto ocupado | Cambiar puerto en `server.py` y `WS_URL` en `page.tsx` |

---

## 📦 Despliegue en producción

Consulta [DEPLOY.md](DEPLOY.md) para instrucciones completas de despliegue con Docker, Nginx y PM2.

---

## 📄 Licencia

Uso privado.
