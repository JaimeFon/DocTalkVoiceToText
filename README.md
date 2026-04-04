# 🎤 DocTalk — VoiceToText

> **📖 [README](README.md)** · **🚀 [Despliegue](DEPLOY.md)**

Plataforma de **transcripción médica en tiempo real** para consultas clínicas.
Captura la conversación entre doctor y paciente, transcribe con vocabulario médico especializado e identifica quién habla. Procesamiento **100% local**, sin enviar datos a la nube.

![Next.js](https://img.shields.io/badge/Next.js-15-black)
![Docker](https://img.shields.io/badge/Docker-ready-2496ED)
![Whisper](https://img.shields.io/badge/faster--whisper-1.1-green)
![pyannote](https://img.shields.io/badge/pyannote-3.1-purple)

---

## 💼 Caso de negocio

### Problema

Los médicos dedican entre un **30% y un 50%** de su tiempo a documentación clínica. Tomar apuntes durante la consulta reduce la atención al paciente, genera errores y agota al profesional.

### Solución

DocTalk transcribe automáticamente la consulta médica mientras ocurre:

| Sin DocTalk | Con DocTalk |
|---|---|
| El médico escribe a mano o dicta después | La transcripción ocurre en tiempo real |
| Pierde contacto visual con el paciente | Mantiene la conversación natural |
| Puede olvidar detalles del diálogo | Todo queda registrado con timestamps |
| No sabe quién dijo qué | Identifica Doctor vs Paciente |
| Términos médicos mal transcritos | Vocabulario clínico optimizado |

### Diferenciadores

- **Privacidad total** — El audio nunca sale del servidor del hospital/consulta. Cumple con regulaciones de protección de datos sanitarios.
- **Sin costos recurrentes** — No depende de APIs externas de pago (OpenAI, Google, etc.). Una vez desplegado, costo operativo = electricidad.
- **Vocabulario médico** — Prompt especializado con cientos de términos clínicos: fármacos, diagnósticos, pruebas, posología.
- **Identificación de hablantes** — Distingue doctor de paciente automáticamente con colores.
- **Despliegue on-premise** — Funciona en un servidor Windows con IIS, ideal para infraestructura hospitalaria existente.

### Público objetivo

| Segmento | Uso |
|---|---|
| Consultorios privados | Transcripción de consultas 1 a 1 |
| Clínicas y policlínicos | Múltiples consultorios simultáneos |
| Hospitales | Integración con HIS/HCE existentes |
| Telemedicina | Transcripción de videoconsultas |

---

## ✨ Características

- **Transcripción en tiempo real** — el texto aparece mientras hablas
- **Vocabulario médico** — optimizado para terminología clínica española
- **Diarización** — identifica quién habla: 🔵 Doctor / 🟢 Paciente
- **100% local** — sin enviar audio a la nube, privacidad total
- **Selector de modelos** — tiny, base, small, medium, large-v3 en caliente
- **Indicador de volumen** — barra visual de nivel de audio
- **Timestamps** — cada fragmento lleva marca de hora
- **Copiar al portapapeles** — exporta la transcripción con hablantes identificados
- **REST API** — endpoint `/api/transcribe` para integrar con otros sistemas
- **Docker ready** — levanta todo el stack con un solo comando

---

## 🧠 Arquitectura

### Diagrama general

```
┌──────────────────────────────────────────────────────────────────┐
│  NAVEGADOR (Chrome, Edge, Firefox)                               │
│                                                                  │
│  ┌──────────────┐  AudioWorklet   ┌───────────────────┐        │
│  │  Micrófono   │── PCM 16 kHz ──▶│  WebSocket /ws    │        │
│  └──────────────┘                 └────────┬──────────┘        │
│                                            │                    │
│  ┌──────────────┐   JSON (texto   ┌────────┴──────────┐        │
│  │  UI React    │◀── + hablante)─│  onmessage        │        │
│  │  🔵 Doctor   │                 └───────────────────┘        │
│  │  🟢 Paciente │                                              │
│  └──────────────┘                                              │
└───────────────────────────────────┬──────────────────────────────┘
          WebSocket (ws / wss)      │
                                    ▼
┌──────────────────────────────────────────────────────────────────┐
│  IIS  (reverse proxy — producción)          Puerto :80 / :443   │
│  URL Rewrite + ARR + WebSocket                                   │
└──────────────────────────────────┬───────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────┐
│  SERVIDOR NODE.JS  (server.js)                  Puerto 3005     │
│                                                                  │
│  ┌──────────────────┐       ┌─────────────────────────────┐    │
│  │  Next.js SSR     │       │  WS Bridge (/ws)            │    │
│  │  (páginas, API)  │       │  PCM → WAV → POST ~3s       │    │
│  └──────────────────┘       │  + Prompt médico             │    │
│                             └───────┬────────┬────────────┘    │
│  ┌──────────────────────────┐       │        │                  │
│  │  /api/transcribe (REST)  │───┐   │        │                  │
│  └──────────────────────────┘   │   │        │                  │
└─────────────────────────────────┼───┼────────┼──────────────────┘
                                  │   │        │
                      HTTP POST   │   │        │ HTTP POST
                                  ▼   ▼        ▼
                ┌─────────────────────┐  ┌──────────────────────┐
                │  FASTER-WHISPER     │  │  DIARIZE SERVER      │
                │  (Docker :8000)     │  │  (Docker :8001)      │
                │                     │  │                      │
                │  Transcripción      │  │  WhisperX + pyannote │
                │  rápida ~3s chunks  │  │  Ventana ~15s        │
                │  + vocabulario med. │  │  Doctor / Paciente   │
                └─────────────────────┘  └──────────────────────┘
```

### Diseño: tres capas independientes

| Capa | Tecnología | Función | Escala |
|---|---|---|---|
| **Presentación** | Next.js 15 + React 19 + Tailwind 4 | UI, captura de audio, WebSocket cliente | Ligero, < 105 KB JS |
| **Orquestación** | Node.js + server.js custom | Sirve SSR, bridge WS→REST, prompt médico | 1 proceso, ~50 MB RAM |
| **IA** | Faster-Whisper + WhisperX + pyannote | Transcripción + diarización | Docker, 1-10 GB RAM según modelo |

Cada capa se puede **escalar, reemplazar o desactivar** independientemente. Si no necesitas diarización, no la levantas. Si quieres cambiar el frontend, el backend no se toca.

---

## 🔬 Lógica de funcionamiento

### 1. Captura de audio (navegador)

```
Micrófono → getUserMedia (mono, 16kHz ideal)
         → AudioContext + AudioWorkletProcessor
         → Buffers Float32 de 4096 muestras
         → Downsampling a 16 kHz
         → Envío binario por WebSocket
```

El `AudioWorkletProcessor` ([pcm-processor.js](public/pcm-processor.js)) corre en un hilo separado del navegador, garantizando captura sin glitches aunque la UI esté ocupada.

### 2. Transcripción rápida (~3 segundos)

```
server.js recibe chunks PCM por WebSocket
    ↓
Acumula en buffer hasta ~3s de audio (48,000 muestras)
    ↓
Convierte Float32 → WAV 16-bit mono (header + data)
    ↓
POST multipart/form-data → Faster-Whisper /v1/audio/transcriptions
    + model: base (configurable)
    + language: es
    + prompt: "Consulta médica... hipertensión... paracetamol..."
    ↓
Respuesta JSON { text: "el paciente refiere cefalea..." }
    ↓
Envía al navegador por WebSocket → renderiza con timestamp
```

El **prompt médico** es clave: contiene ~100 términos clínicos que condicionan al modelo. Whisper usa este prompt como contexto para desambiguar fonemas similares (ej: "enalapril" vs "una la pril").

### 3. Diarización (~15 segundos, opcional)

```
server.js acumula un buffer más largo (~15s)
    ↓
Convierte a WAV → POST → Diarize Server (:8001)
    ↓
WhisperX: transcribir → alinear por palabra → diarizar
    ↓
pyannote asigna SPEAKER_00 / SPEAKER_01
    (min_speakers=2, max_speakers=2 → consulta médica)
    ↓
Respuesta: [{ speaker: "SPEAKER_00", text: "¿Cómo se siente?" }]
    ↓
Frontend: SPEAKER_00 = 🔵 Doctor, SPEAKER_01 = 🟢 Paciente
```

La diarización necesita más audio para distinguir voces (mínimo 10-15s), por eso opera en una ventana más larga que la transcripción rápida. Ambos procesos corren en **paralelo**: ves texto rápido y luego se actualizan los hablantes.

### 4. API REST (para integraciones)

```
POST /api/transcribe
    Content-Type: multipart/form-data
    Body: file=audio.wav, model=base, language=es
    ↓
Reenvía a Faster-Whisper con prompt médico
    ↓
Respuesta: { text: "..." }
```

Permite integrar con HIS, HCE o cualquier sistema que envíe archivos de audio.

---

## 📁 Estructura del proyecto

```
DocTalkVoiceToText/
├── server.js                    # Servidor Node.js: SSR + WS bridge + prompt médico
├── src/
│   └── app/
│       ├── page.tsx             # UI: grabación, transcripción, diarización
│       ├── layout.tsx           # Layout HTML + metadata
│       ├── globals.css          # Estilos base (Tailwind)
│       └── api/
│           └── transcribe/
│               └── route.ts     # REST API: subida de archivos
├── public/
│   ├── pcm-processor.js        # AudioWorklet: captura PCM
│   └── icon.svg                # Favicon
├── diarize-server/              # Microservicio Python
│   ├── main.py                  # FastAPI: WhisperX + pyannote
│   ├── Dockerfile               # Imagen Docker
│   └── requirements.txt         # Dependencias Python
├── docker-compose.yml           # Orquestación: whisper + diarize + frontend
├── Dockerfile                   # Build del frontend Next.js
├── web.config                   # IIS: reverse proxy + WebSocket
├── .env                         # Variables de entorno (no se sube a Git)
├── .env.example                 # Plantilla documentada de variables
├── package.json                 # Dependencias Node.js
└── DEPLOY.md                    # Guía completa de despliegue
```

---

## 🚀 Inicio rápido

### Opción 1: Solo transcripción médica (sin diarización)

```powershell
# 1. Levantar Whisper
docker compose up whisper -d

# 2. Frontend
npm install
npm run build
npm run start
```

### Opción 2: Con diarización doctor/paciente

```powershell
# 1. Configurar token HuggingFace en .env
#    HF_TOKEN=hf_xxxxx

# 2. Levantar ambos backends
docker compose up whisper diarize -d

# 3. Frontend
npm install
npm run build
npm run start
```

Abre **http://localhost:3005** — listo.

---

## ⚙️ Variables de entorno

Copia `.env.example` → `.env` y ajusta:

```env
PORT=3005                                # Puerto del servidor Node.js
NODE_ENV=production                      # production | development
NEXT_PUBLIC_WS_URL=/ws                   # Ruta WebSocket
NEXT_PUBLIC_DEFAULT_MODEL=base           # Modelo Whisper por defecto
WHISPER_API_URL=http://localhost:8000     # REST API de Faster-Whisper
DIARIZE_API_URL=http://localhost:8001    # Microservicio de diarización (opcional)
HF_TOKEN=                                # Token HuggingFace (para diarización)
```

Ver [.env.example](.env.example) para documentación detallada de cada variable.

---

## 🩺 Vocabulario médico incluido

El prompt médico cubre:

| Categoría | Ejemplos |
|---|---|
| **Diagnósticos** | Hipertensión arterial, diabetes mellitus, EPOC, cardiopatía isquémica |
| **Fármacos** | Paracetamol, omeprazol, metformina, enalapril, atorvastatina |
| **Antibióticos** | Amoxicilina, azitromicina, ciprofloxacino |
| **Pruebas** | Hemograma, TAC, electrocardiograma, espirometría, ecografía |
| **Signos vitales** | Tensión arterial, saturación de oxígeno, frecuencia cardíaca |
| **Posología** | Miligramos, comprimidos, cada 8 horas, en ayunas |
| **Procedimientos** | Anamnesis, auscultación, palpación, exploración física |
| **Antecedentes** | Alergias medicamentosas, intervenciones quirúrgicas, hábitos tóxicos |

---

## 📚 Documentación

- **[DEPLOY.md](DEPLOY.md)** — Guía completa de despliegue (Windows + IIS + Docker, GPU, PM2, troubleshooting)
- **[.env.example](.env.example)** — Todas las variables de entorno documentadas
