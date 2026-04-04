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
┌─────────────────────────────────────────────────────────────────┐
│  NAVEGADOR                                                      │
│                                                                 │
│  ┌──────────────┐   AudioWorklet    ┌──────────────────┐       │
│  │  Micrófono   │ ───── PCM 16kHz ──▶  WebSocket /ws   │       │
│  └──────────────┘                   └───────┬──────────┘       │
│                                             │                   │
│  ┌──────────────┐    JSON (texto)   ┌───────┴──────────┐       │
│  │  UI React    │ ◀────────────────│  onmessage       │       │
│  └──────────────┘                   └──────────────────┘       │
└──────────────────────────────────────┬──────────────────────────┘
                                       │ WebSocket
                                       ▼
┌──────────────────────────────────────────────────────────────────┐
│  SERVIDOR NODE.JS (server.js)                   Puerto 3005     │
│                                                                  │
│  ┌──────────────────┐        ┌──────────────────────────┐       │
│  │  Next.js SSR     │        │  WS Proxy (/ws)          │       │
│  │  (páginas, API)  │        │  cliente ←→ backend      │       │
│  └──────────────────┘        └───────────┬──────────────┘       │
└──────────────────────────────────────────┬──────────────────────┘
                                           │ WebSocket
                                           ▼
┌──────────────────────────────────────────────────────────────────┐
│  FASTER-WHISPER SERVER                          Puerto 8000     │
│                                                                  │
│  ┌────────────────┐    ┌─────────────┐    ┌────────────────┐   │
│  │  Recibe PCM    │───▶│ faster-     │───▶│ Devuelve JSON  │   │
│  │  (audio raw)   │    │ whisper     │    │ { text: "..." }│   │
│  └────────────────┘    └─────────────┘    └────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

### Flujo de datos

1. **Captura de audio** — El navegador accede al micrófono vía `getUserMedia` y procesa el audio con un `AudioWorkletProcessor` (`pcm-processor.js`) que emite buffers PCM float32.
2. **Downsampling** — Los buffers se remuestrean a **16 kHz** (frecuencia que espera Whisper) y se envían por **WebSocket** a `/ws`.
3. **Proxy WS** — El servidor Node.js (`server.js`) recibe la conexión WebSocket del navegador y la reenvía de forma transparente al backend Faster-Whisper.
4. **Transcripción** — Faster-Whisper procesa los fragmentos de audio y devuelve texto transcrito en JSON.
5. **Renderizado** — El frontend recibe los mensajes JSON y renderiza el texto con timestamps en tiempo real.

### Componentes clave

| Archivo | Función |
|---|---|
| `server.js` | Servidor custom Node.js: sirve Next.js + proxy WebSocket |
| `src/app/page.tsx` | UI principal: grabación, transcripción, controles |
| `public/pcm-processor.js` | AudioWorklet que captura y emite PCM raw |
| `docker-compose.yml` | Orquestación de todo el stack con Docker |

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
PORT=3005                          # Puerto del servidor Node.js
NODE_ENV=production                # production | development
NEXT_PUBLIC_WS_URL=/ws             # Ruta WebSocket (relativa al frontend)
NEXT_PUBLIC_DEFAULT_MODEL=base     # Modelo inicial: tiny|base|small|medium|large-v3
BACKEND_WS_URL=ws://localhost:9000 # URL WebSocket del backend Whisper
```

---

## 📚 Documentación

- **[DEPLOY.md](DEPLOY.md)** — Guía completa de despliegue (Docker, producción, GPU)
