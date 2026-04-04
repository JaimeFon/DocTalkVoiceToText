"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const WS_URL = "ws://localhost:9000";
const TARGET_SAMPLE_RATE = 16000;

interface TranscriptionEntry {
  text: string;
  timestamp: string;
}

const MODELS = [
  { id: "tiny", label: "Tiny (75 MB)", quality: "Baja" },
  { id: "base", label: "Base (140 MB)", quality: "Media" },
  { id: "small", label: "Small (460 MB)", quality: "Buena" },
  { id: "medium", label: "Medium (1.5 GB)", quality: "Muy buena" },
  { id: "large-v3", label: "Large V3 (3 GB)", quality: "Excelente" },
];

function formatTime(): string {
  const now = new Date();
  return now.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function Home() {
  const [transcription, setTranscription] = useState<TranscriptionEntry[]>([]);
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState("Listo");
  const [volume, setVolume] = useState(0);
  const [selectedModel, setSelectedModel] = useState("tiny");
  const [modelLoading, setModelLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const volumeRafRef = useRef<number>(0);
  const transcriptionEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll al final cuando llega nueva transcripción
  useEffect(() => {
    transcriptionEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcription]);

  const downsample = useCallback(
    (buffer: Float32Array, fromRate: number, toRate: number): Float32Array => {
      if (fromRate === toRate) return buffer;
      const ratio = fromRate / toRate;
      const newLength = Math.round(buffer.length / ratio);
      const result = new Float32Array(newLength);
      for (let i = 0; i < newLength; i++) {
        const index = Math.round(i * ratio);
        result[i] = buffer[Math.min(index, buffer.length - 1)];
      }
      return result;
    },
    []
  );

  // Indicador de volumen con AnalyserNode
  const startVolumeMonitor = useCallback((analyser: AnalyserNode) => {
    const dataArray = new Uint8Array(analyser.fftSize);
    const tick = () => {
      analyser.getByteTimeDomainData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const v = (dataArray[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      setVolume(Math.min(1, rms * 4)); // Normalizar a 0-1
      volumeRafRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, []);

  const startRecording = useCallback(async () => {
    try {
      setStatus("Conectando...");

      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;
      ws.binaryType = "arraybuffer";

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "transcription" && data.text) {
          setTranscription((prev) => [
            ...prev,
            { text: data.text, timestamp: formatTime() },
          ]);
        }
        if (data.type === "model_changed") {
          setModelLoading(false);
          setSelectedModel(data.model);
        }
      };

      ws.onerror = () => setStatus("Error de conexión");
      ws.onclose = () => {
        if (recording) setStatus("Conexión perdida");
      };

      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => {
          setStatus("Grabando...");
          // Informar modelo seleccionado al servidor
          ws.send(JSON.stringify({ type: "set_model", model: selectedModel }));
          resolve();
        };
        ws.onerror = () => reject(new Error("No se pudo conectar al servidor"));
      });

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: { ideal: TARGET_SAMPLE_RATE },
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      const audioCtx = new AudioContext({
        sampleRate: stream.getAudioTracks()[0].getSettings().sampleRate || 44100,
      });
      audioCtxRef.current = audioCtx;

      await audioCtx.audioWorklet.addModule("/pcm-processor.js");

      const source = audioCtx.createMediaStreamSource(stream);
      sourceRef.current = source;

      // AnalyserNode para volumen
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      source.connect(analyser);
      startVolumeMonitor(analyser);

      const worklet = new AudioWorkletNode(audioCtx, "pcm-processor");
      workletRef.current = worklet;

      worklet.port.onmessage = (e: MessageEvent<Float32Array>) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const pcm = downsample(e.data, audioCtx.sampleRate, TARGET_SAMPLE_RATE);
        ws.send(pcm.buffer);
      };

      source.connect(worklet);
      worklet.connect(audioCtx.destination);

      setRecording(true);
    } catch (err) {
      setStatus(
        `Error: ${err instanceof Error ? err.message : "No se pudo iniciar"}`
      );
      cleanup();
    }
  }, [downsample, recording, selectedModel, startVolumeMonitor]);

  const cleanup = useCallback(() => {
    cancelAnimationFrame(volumeRafRef.current);
    setVolume(0);

    workletRef.current?.disconnect();
    analyserRef.current?.disconnect();
    sourceRef.current?.disconnect();
    audioCtxRef.current?.close();
    streamRef.current?.getTracks().forEach((t) => t.stop());

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.close();
    }

    wsRef.current = null;
    audioCtxRef.current = null;
    sourceRef.current = null;
    workletRef.current = null;
    analyserRef.current = null;
    streamRef.current = null;
  }, []);

  const stopRecording = useCallback(() => {
    cleanup();
    setRecording(false);
    setStatus("Detenido");
  }, [cleanup]);

  const clearTranscription = useCallback(() => {
    setTranscription([]);
  }, []);

  // Copiar al portapapeles
  const copyToClipboard = useCallback(async () => {
    const fullText = transcription.map((e) => `[${e.timestamp}] ${e.text}`).join("\n");
    await navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [transcription]);

  // Cambiar modelo en caliente
  const changeModel = useCallback(
    (modelId: string) => {
      setSelectedModel(modelId);
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        setModelLoading(true);
        wsRef.current.send(JSON.stringify({ type: "set_model", model: modelId }));
      }
    },
    []
  );

  return (
    <div className="min-h-screen p-6 md:p-10 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">🎤 VoiceToText</h1>
      <p className="text-gray-400 mb-6">
        Transcripción de voz a texto en español • Whisper {selectedModel}
      </p>

      {/* Selector de modelo */}
      <div className="flex items-center gap-3 mb-4">
        <label className="text-sm text-gray-400">Modelo:</label>
        <select
          aria-label="Seleccionar modelo de Whisper"
          value={selectedModel}
          onChange={(e) => changeModel(e.target.value)}
          disabled={modelLoading}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50"
        >
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label} — {m.quality}
            </option>
          ))}
        </select>
        {modelLoading && (
          <span className="text-xs text-yellow-400 animate-pulse">
            Cargando modelo...
          </span>
        )}
      </div>

      {/* Indicador de volumen */}
      <div className="mb-4 flex items-center gap-3">
        <span className="text-xs text-gray-500 w-12">Volumen</span>
        <div className="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-75"
            style={{
              width: `${Math.round(volume * 100)}%`,
              backgroundColor:
                volume > 0.7
                  ? "#ef4444"
                  : volume > 0.3
                    ? "#eab308"
                    : "#22c55e",
            }}
          />
        </div>
      </div>

      {/* Controles */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        {!recording ? (
          <button
            onClick={startRecording}
            className="px-6 py-3 bg-green-600 hover:bg-green-700 rounded-lg font-medium transition-colors cursor-pointer"
          >
            ▶ Iniciar
          </button>
        ) : (
          <button
            onClick={stopRecording}
            className="px-6 py-3 bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-colors cursor-pointer"
          >
            ⏹ Detener
          </button>
        )}

        <button
          onClick={clearTranscription}
          className="px-4 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors cursor-pointer"
        >
          Limpiar
        </button>

        <button
          onClick={copyToClipboard}
          disabled={transcription.length === 0}
          className="px-4 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {copied ? "✓ Copiado" : "📋 Copiar"}
        </button>

        <span className="text-sm text-gray-400 flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              recording ? "bg-red-500 animate-pulse" : "bg-gray-500"
            }`}
          />
          {status}
        </span>
      </div>

      {/* Área de transcripción con timestamps */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 min-h-[300px] max-h-[500px] overflow-y-auto">
        {transcription.length === 0 ? (
          <p className="text-gray-500 italic">
            Presiona &quot;Iniciar&quot; y comienza a hablar...
          </p>
        ) : (
          <div className="space-y-2">
            {transcription.map((entry, i) => (
              <div key={i} className="flex gap-3">
                <span className="text-xs text-gray-500 font-mono mt-1 shrink-0">
                  {entry.timestamp}
                </span>
                <p className="leading-relaxed text-lg">{entry.text}</p>
              </div>
            ))}
            <div ref={transcriptionEndRef} />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="mt-4 text-xs text-gray-600">
        Modelo: whisper-{selectedModel} • Idioma: español • Procesamiento local
      </div>
    </div>
  );
}
