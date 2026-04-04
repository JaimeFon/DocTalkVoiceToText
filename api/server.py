"""
VoiceToText - Servidor WebSocket para transcripción en tiempo real.
Usa faster-whisper con modelos multilingües (soporta español).
Permite cambiar de modelo en caliente desde el frontend.
"""

import asyncio
import json
import logging

import numpy as np
import websockets
from faster_whisper import WhisperModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("voicetotext")

DEVICE = "cpu"            # "cuda" si tienes GPU NVIDIA
COMPUTE_TYPE = "int8"     # int8 para CPU, float16 para GPU

AVAILABLE_MODELS = {
    "tiny":     {"size": "75 MB",  "quality": "Baja"},
    "base":     {"size": "140 MB", "quality": "Media"},
    "small":    {"size": "460 MB", "quality": "Buena"},
    "medium":   {"size": "1.5 GB", "quality": "Muy buena"},
    "large-v3": {"size": "3 GB",   "quality": "Excelente"},
}

# Mínimo de audio (en segundos) antes de transcribir
MIN_AUDIO_SECONDS = 1.0
SAMPLE_RATE = 16000

# Cache de modelos cargados
_model_cache: dict[str, WhisperModel] = {}
_current_model_name = "tiny"


def get_model(name: str) -> WhisperModel:
    """Obtiene un modelo del cache o lo carga si no existe."""
    global _current_model_name
    if name not in AVAILABLE_MODELS:
        name = "tiny"
    if name not in _model_cache:
        logger.info("Cargando modelo '%s'...", name)
        _model_cache[name] = WhisperModel(name, device=DEVICE, compute_type=COMPUTE_TYPE)
        logger.info("Modelo '%s' cargado.", name)
    _current_model_name = name
    return _model_cache[name]


def _transcribe_sync(model, audio, **kwargs):
    """Ejecuta transcripción síncronamente (para asyncio.to_thread)."""
    segments, info = model.transcribe(audio, **kwargs)
    text_parts = [s.text for s in segments]
    return text_parts, info


# Pre-cargar el modelo por defecto
get_model("tiny")


async def handler(websocket):
    """Maneja una conexión WebSocket individual."""
    logger.info("Cliente conectado: %s", websocket.remote_address)
    buffer = np.array([], dtype=np.float32)
    client_model = _current_model_name
    connected = True

    try:
        async for message in websocket:
            # Mensajes de texto = comandos JSON del frontend
            if isinstance(message, str):
                try:
                    cmd = json.loads(message)
                    if cmd.get("type") == "set_model":
                        new_model = cmd.get("model", "tiny")
                        if new_model in AVAILABLE_MODELS:
                            client_model = new_model
                            await asyncio.to_thread(get_model, client_model)
                            await websocket.send(json.dumps({
                                "type": "model_changed",
                                "model": client_model,
                                "info": AVAILABLE_MODELS[client_model],
                            }))
                        continue
                    if cmd.get("type") == "get_models":
                        await websocket.send(json.dumps({
                            "type": "models_list",
                            "models": AVAILABLE_MODELS,
                            "current": client_model,
                        }))
                        continue
                except json.JSONDecodeError:
                    continue

            # Mensajes binarios = audio PCM float32
            audio_chunk = np.frombuffer(message, dtype=np.float32)
            buffer = np.concatenate((buffer, audio_chunk))

            # Solo transcribir cuando haya suficiente audio
            if len(buffer) < SAMPLE_RATE * MIN_AUDIO_SECONDS:
                continue

            model = get_model(client_model)
            text_parts, info = await asyncio.to_thread(
                _transcribe_sync, model, buffer,
                language="es", beam_size=1, vad_filter=True, without_timestamps=True,
            )
            text = " ".join(text_parts).strip()

            if text:
                await websocket.send(json.dumps({
                    "type": "transcription",
                    "text": text,
                    "language": info.language,
                    "probability": round(info.language_probability, 2),
                }))

            # Limpiar buffer después de transcribir
            buffer = np.array([], dtype=np.float32)

    except websockets.exceptions.ConnectionClosed:
        connected = False
        logger.info("Cliente desconectado: %s", websocket.remote_address)
    except Exception:
        connected = False
        logger.exception("Error procesando audio")
    finally:
        # Transcribir audio restante solo si la conexión sigue abierta
        if connected and len(buffer) > SAMPLE_RATE * 0.3:
            try:
                model = get_model(client_model)
                text_parts, info = await asyncio.to_thread(
                    _transcribe_sync, model, buffer,
                    language="es", beam_size=1, without_timestamps=True,
                )
                text = " ".join(text_parts).strip()
                if text:
                    await websocket.send(json.dumps({
                        "type": "transcription",
                        "text": text,
                        "language": info.language,
                        "probability": round(info.language_probability, 2),
                    }))
            except Exception:
                pass
        logger.info("Conexión cerrada: %s", websocket.remote_address)


async def main():
    host = "localhost"
    port = 9000
    logger.info("Servidor WebSocket en ws://%s:%d", host, port)
    async with websockets.serve(handler, host, port, max_size=2**20):
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
