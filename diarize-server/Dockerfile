# ── Build WhisperX + pyannote diarization server ────────
FROM python:3.11-slim AS base

# Dependencias del sistema para audio processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg git \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .

# Instalar PyTorch CPU (más ligero) — para GPU cambiar el index-url
RUN pip install --no-cache-dir \
    torch torchaudio --index-url https://download.pytorch.org/whl/cpu \
 && pip install --no-cache-dir -r requirements.txt

COPY main.py .

EXPOSE 8001

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
