"""
Microservicio de transcripción con diarización (WhisperX + pyannote).
Recibe audio y devuelve segmentos con hablante identificado.
Uso: uvicorn main:app --host 0.0.0.0 --port 8001
"""

import io
import os
import tempfile
from contextlib import asynccontextmanager

import torch
import whisperx
from whisperx.diarize import DiarizationPipeline
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse

# ── Configuración ────────────────────────────────────────────
DEVICE = os.getenv("DEVICE", "cuda" if torch.cuda.is_available() else "cpu")
COMPUTE_TYPE = "float16" if DEVICE == "cuda" else "int8"
DEFAULT_MODEL = os.getenv("WHISPER_MODEL", "base")
HF_TOKEN = os.getenv("HF_TOKEN", "")
NUM_SPEAKERS = int(os.getenv("NUM_SPEAKERS", "2"))

# ── Modelos globales (se cargan una vez) ─────────────────────
whisper_model = None
diarize_pipeline = None
align_model = None
align_metadata = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Carga modelos al iniciar el servidor."""
    global whisper_model, diarize_pipeline, align_model, align_metadata

    print(f"[init] Cargando modelo Whisper '{DEFAULT_MODEL}' en {DEVICE} ({COMPUTE_TYPE})...")
    whisper_model = whisperx.load_model(
        DEFAULT_MODEL, DEVICE, compute_type=COMPUTE_TYPE, language="es"
    )

    print("[init] Cargando modelo de alineación...")
    align_model, align_metadata = whisperx.load_align_model(
        language_code="es", device=DEVICE
    )

    if HF_TOKEN:
        print("[init] Cargando pipeline de diarización (pyannote)...")
        diarize_pipeline = DiarizationPipeline(
            model_name="pyannote/speaker-diarization-3.1",
            token=HF_TOKEN, device=DEVICE
        )
    else:
        print("[init] AVISO: Sin HF_TOKEN → diarización deshabilitada.")

    print("[init] Servidor listo.")
    yield
    print("[shutdown] Cerrando...")


app = FastAPI(title="DocTalk Diarization Service", lifespan=lifespan)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "device": DEVICE,
        "model": DEFAULT_MODEL,
        "diarization": diarize_pipeline is not None,
    }


@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    num_speakers: int = Form(NUM_SPEAKERS),
    language: str = Form("es"),
    model: str = Form(DEFAULT_MODEL),
    prompt: str = Form(""),
):
    """
    Recibe un archivo de audio y devuelve segmentos transcritos con hablante.
    Respuesta: { segments: [{ speaker, start, end, text }] }
    """
    # Guardar archivo temporal
    suffix = os.path.splitext(file.filename or "audio.wav")[1] or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        # 1. Cargar audio
        audio = whisperx.load_audio(tmp_path)

        # 2. Transcribir
        result = whisper_model.transcribe(
            audio,
            batch_size=8 if DEVICE == "cuda" else 4,
            language=language,
        )

        # 3. Alinear palabras (necesario para asignar hablantes)
        result = whisperx.align(
            result["segments"], align_model, align_metadata, audio, DEVICE,
            return_char_alignments=False,
        )

        # 4. Diarizar (identificar hablantes)
        if diarize_pipeline is not None:
            diarize_segments = diarize_pipeline(
                audio,
                min_speakers=1,
                max_speakers=num_speakers,
            )
            result = whisperx.assign_word_speakers(diarize_segments, result)

        # 5. Construir respuesta con etiquetas de hablante
        segments = []
        for seg in result.get("segments", []):
            segments.append({
                "speaker": seg.get("speaker", None),
                "start": round(seg.get("start", 0), 2),
                "end": round(seg.get("end", 0), 2),
                "text": seg.get("text", "").strip(),
            })

        return JSONResponse({"segments": segments})

    finally:
        os.unlink(tmp_path)
