# 🎤 VoiceToText

> **📖 [README](README.md)** · **🚀 [Despliegue](DEPLOY.md)**

Transcripción de voz a texto **en tiempo real** usando Whisper, con procesamiento 100% local.

![Next.js](https://img.shields.io/badge/Next.js-15-black)
![Docker](https://img.shields.io/badge/Docker-ready-2496ED)
![Whisper](https://img.shields.io/badge/faster--whisper-1.1-green)

---

## ✨ Características

- **Transcripción en tiempo real** — el texto aparece mientras hablas
- **100% local** — sin enviar audio a la nube, privacidad total
- **Soporte español** — optimizado para transcripción en español
- **Selector de modelos** — cambia entre tiny, base, small, medium y large-v3 en caliente
- **Indicador de volumen** — barra visual de nivel de audio
- **Timestamps** — cada fragmento transcrito lleva marca de hora
- **Copiar al portapapeles** — exporta toda la transcripción con un clic
- **Docker ready** — levanta todo el stack con un solo comando

---

## 🧠 Arquitectura

```
┌──────────────────────────────────────────────────────────────────┐
│  NAVEGADOR (Chrome, Edge, Firefox)                               │
│                                                                  │
│  ┌──────────────┐  AudioWorklet   ┌───────────────────┐        │
│  │  Micrófono   │── PCM 16 kHz ──▶│  WebSocket /ws    │        │
│  └──────────────┘                 └────────┬──────────┘        │
│                                            │                    │
│  ┌──────────────┐   JSON (texto)  ┌────────┴──────────┐        │
│  │  UI React    │◀───────────────│  onmessage        │        │
│  └──────────────┘                 └───────────────────┘        │
└───────────────────────────────────┬──────────────────────────────┘
          WebSocket (ws / wss)      │
                                    ▼
┌──────────────────────────────────────────────────────────────────┐
│  IIS  (reverse proxy — solo en producción)                       │
│  URL Rewrite + ARR  ·  WebSocket upgrade                        │
│  Puerto :80 / :443 ─────────rewrite──────▶ localhost:3005        │
└──────────────────────────────────┬───────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────┐
│  SERVIDOR NODE.JS  (server.js)                  Puerto 3005     │
│                                                                  │
│  ┌──────────────────┐       ┌─────────────────────────────┐    │
│  │  Next.js SSR     │       │  WS Bridge (/ws)            │    │
│  │  (páginas, API)  │       │  Recibe PCM → WAV → POST    │    │
│  └──────────────────┘       │  Devuelve JSON al browser    │    │
│                             └──────────────┬──────────────┘    │
│  ┌──────────────────────────┐              │                    │
│  │  /api/transcribe (REST)  │              │                    │
│  │  Subida de archivos      │──────────┐   │                    │
│  └──────────────────────────┘          │   │                    │
└────────────────────────────────────────┼───┼────────────────────┘
                              HTTP POST  │   │  HTTP POST
                                         ▼   ▼
┌──────────────────────────────────────────────────────────────────┐
│  FASTER-WHISPER SERVER (Docker)                 Puerto 8000     │
│                                                                  │
│  POST /v1/audio/transcriptions  (OpenAI-compatible)             │
│                                                                  │
│  ┌────────────────┐   ┌──────────────┐   ┌─────────────────┐  │
│  │  Recibe WAV    │──▶│ faster-      │──▶│ Devuelve JSON   │  │
│  │  (audio file)  │   │ whisper      │   │ { text: "..." } │  │
│  └────────────────┘   └──────────────┘   └─────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### Flujo de datos (tiempo real)

1. **Captura** — El navegador accede al micrófono vía `getUserMedia` y un `AudioWorkletProcessor` emite buffers PCM float32.
2. **Downsampling** — Los buffers se remuestrean a **16 kHz** y se envían por **WebSocket** a `/ws`.
3. **Bridge WS→REST** — `server.js` acumula los chunks PCM, cada ~3 s los convierte a WAV y hace `POST` al REST API de Faster-Whisper (`/v1/audio/transcriptions`).
4. **Transcripción** — Faster-Whisper procesa el WAV y devuelve texto en JSON.
5. **Renderizado** — El texto vuelve al browser vía WebSocket y se muestra con timestamps.

### Flujo alternativo (subida de archivo)

El endpoint `POST /api/transcribe` permite subir un archivo `.wav`/`.mp3` directamente. Reenvía el archivo a Faster-Whisper y devuelve el texto.

### Componentes clave

| Archivo | Función |
|---|---|
| `server.js` | Servidor Node.js: Next.js SSR + bridge WS→REST a Whisper |
| `src/app/page.tsx` | UI principal: grabación, controles, transcripción |
| `src/app/api/transcribe/route.ts` | API REST para transcribir archivos subidos |
| `public/pcm-processor.js` | AudioWorklet que captura y emite PCM raw |
| `docker-compose.yml` | Orquestación Docker (Whisper + frontend opcional) |
| `web.config` | Configuración IIS: reverse proxy + WebSocket |

---

## 🚀 Inicio rápido

### Con Docker (recomendado)

```bash
docker compose up -d
```

Abre [http://localhost:3005](http://localhost:3005) — listo para transcribir.

### Sin Docker

**Requisitos:** Node.js 18+, un servidor Faster-Whisper corriendo.

```bash
npm install
npm run dev          # desarrollo (Turbopack)
```

Para producción:

```bash
npm run build
npm run start        # sirve en el puerto definido en .env
```

---

## ⚙️ Variables de entorno

Crea un archivo `.env` en la raíz:

```env
PORT=3005                              # Puerto del servidor Node.js
NODE_ENV=production                    # production | development
NEXT_PUBLIC_WS_URL=/ws                 # Ruta WebSocket (relativa al dominio)
NEXT_PUBLIC_DEFAULT_MODEL=base         # Modelo: tiny|base|small|medium|large-v3
WHISPER_API_URL=http://localhost:8000   # REST API de Faster-Whisper (Docker)
```

---

## 📚 Documentación

- **[DEPLOY.md](DEPLOY.md)** — Guía completa de despliegue (Docker, producción, GPU)
