const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { WebSocketServer } = require("ws");

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "3000", 10);
const whisperUrl = process.env.WHISPER_API_URL || "http://localhost:8000";
const diarizeUrl = process.env.DIARIZE_API_URL || "";

const app = next({ dev });
const handle = app.getRequestHandler();

/* ── Prompt médico ───────────────────────────────────────── */
// Condiciona a Whisper para que reconozca terminología médica española.
const MEDICAL_PROMPT = [
  "Consulta médica entre doctor y paciente.",
  "Diagnóstico, pronóstico, anamnesis, exploración física, auscultación, palpación, percusión.",
  "Hemograma, bioquímica, hemoglobina, hematocrito, leucocitos, plaquetas, creatinina, transaminasas, colesterol, triglicéridos, glucemia.",
  "Radiografía, ecografía, resonancia magnética, TAC, tomografía, electrocardiograma, espirometría, endoscopia.",
  "Hipertensión arterial, diabetes mellitus tipo 2, dislipemia, cardiopatía isquémica, insuficiencia cardíaca.",
  "Neumonía, bronquitis, EPOC, asma, enfisema, broncoespasmo.",
  "Gastritis, reflujo gastroesofágico, úlcera péptica, síndrome de intestino irritable, colitis.",
  "Cefalea, migraña, lumbalgia, cervicalgia, artrosis, artritis, fibromialgia, neuropatía.",
  "Hipotiroidismo, hipertiroidismo, anemia ferropénica, insuficiencia renal.",
  "Paracetamol, ibuprofeno, naproxeno, omeprazol, pantoprazol, metformina, insulina.",
  "Enalapril, losartán, amlodipino, atorvastatina, simvastatina, ácido acetilsalicílico.",
  "Amoxicilina, azitromicina, ciprofloxacino, dexametasona, prednisona.",
  "Miligramos, comprimidos, cápsulas, posología, cada 8 horas, cada 12 horas, en ayunas.",
  "Tensión arterial, presión sistólica, presión diastólica, frecuencia cardíaca, saturación de oxígeno.",
  "Antecedentes familiares, alergias medicamentosas, intervenciones quirúrgicas, hábitos tóxicos.",
  "Receta médica, derivación, interconsulta, seguimiento, control, revisión.",
].join(" ");

/* ── Helpers ─────────────────────────────────────────────── */

// Convierte Float32 PCM a WAV 16-bit mono (lo que espera Whisper)
function pcmToWav(pcmFloat32, sampleRate) {
  const numSamples = pcmFloat32.length;
  const bytesPerSample = 2; // 16-bit
  const dataSize = numSamples * bytesPerSample;
  const buf = Buffer.alloc(44 + dataSize);

  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);           // fmt chunk size
  buf.writeUInt16LE(1, 20);            // PCM
  buf.writeUInt16LE(1, 22);            // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * bytesPerSample, 28);
  buf.writeUInt16LE(bytesPerSample, 32);
  buf.writeUInt16LE(16, 34);           // bits per sample
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, pcmFloat32[i]));
    buf.writeInt16LE(Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), 44 + i * 2);
  }
  return buf;
}

// Construye body multipart/form-data manualmente (sin dependencias)
function buildMultipart(wavBuf, model, language, prompt) {
  const boundary = "----WavBoundary" + Date.now().toString(36);
  const parts = [];

  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="chunk.wav"\r\nContent-Type: audio/wav\r\n\r\n`
  ));
  parts.push(wavBuf);
  parts.push(Buffer.from(
    `\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${model}`
  ));
  parts.push(Buffer.from(
    `\r\n--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\n${language}`
  ));
  if (prompt) {
    parts.push(Buffer.from(
      `\r\n--${boundary}\r\nContent-Disposition: form-data; name="prompt"\r\n\r\n${prompt}`
    ));
  }
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

  return {
    body: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

/* ── Post-procesado de puntuación ────────────────────────── */

// Capitaliza primera letra, añade punto final si falta, limpia espacios repetidos.
function addPunctuation(text) {
  if (!text) return text;
  let t = text.trim();
  // Limpiar espacios múltiples
  t = t.replace(/\s{2,}/g, " ");
  // Capitalizar primera letra
  t = t.charAt(0).toUpperCase() + t.slice(1);
  // Capitalizar después de . ! ?
  t = t.replace(/([.!?])\s+([a-záéíóúñ])/gi, (_, p, c) => `${p} ${c.toUpperCase()}`);
  // Añadir punto final si no termina en signo de puntuación
  if (!/[.!?…]$/.test(t)) {
    t += ".";
  }
  return t;
}

/* ── Servidor ────────────────────────────────────────────── */

app.prepare().then(() => {
  const server = createServer((req, res) => {
    handle(req, res, parse(req.url, true));
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const { pathname } = parse(req.url, true);
    if (pathname === "/ws") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  /* ── Cada conexión WebSocket = una sesión de grabación ── */
  wss.on("connection", (clientWs) => {
    console.log("[ws] Cliente conectado");

    const SAMPLE_RATE = 16000;
    const CHUNK_SECONDS = 6;  // 6s da mejor contexto a Whisper que 3s
    const DIARIZE_SECONDS = 30; // ventana para diarización
    const DIARIZE_OVERLAP = 0.5; // 50% overlap entre ventanas
    const CHUNK_SAMPLES = CHUNK_SECONDS * SAMPLE_RATE;
    const DIARIZE_SAMPLES = DIARIZE_SECONDS * SAMPLE_RATE;

    let currentModel = process.env.NEXT_PUBLIC_DEFAULT_MODEL || "base";
    let pcmChunks = [];      // Float32Array[] — buffer para transcripción rápida
    let bufferSamples = 0;
    let diarizeChunks = [];  // Float32Array[] — buffer para diarización
    let diarizeSamples = 0;
    let prevDiarizeChunks = []; // Float32Array[] — overlap de la ventana anterior
    let prevDiarizeSamples = 0;
    let lastTranscription = ""; // último texto para contexto entre chunks
    let sending = false;
    let diarizing = false;
    const useDiarize = !!diarizeUrl;

    // Detecta si el audio tiene contenido relevante (no silencio)
    function hasVoice(pcmFloat32, threshold = 0.01) {
      let sum = 0;
      for (let i = 0; i < pcmFloat32.length; i++) {
        sum += pcmFloat32[i] * pcmFloat32[i];
      }
      return Math.sqrt(sum / pcmFloat32.length) > threshold;
    }

    // Envía el buffer acumulado al REST API de Whisper (transcripción rápida)
    async function flushBuffer() {
      if (sending || bufferSamples === 0) return;
      sending = true;

      // Concatenar todos los chunks en un solo Float32Array
      const combined = new Float32Array(bufferSamples);
      let offset = 0;
      for (const chunk of pcmChunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }
      pcmChunks = [];
      bufferSamples = 0;

      // Filtrar silencio para evitar alucinaciones de Whisper
      if (!hasVoice(combined)) {
        sending = false;
        return;
      }

      try {
        const wav = pcmToWav(combined, SAMPLE_RATE);
        // Condicionar con texto previo + vocabulario médico para coherencia
        const contextPrompt = lastTranscription
          ? lastTranscription.slice(-200) + " " + MEDICAL_PROMPT
          : MEDICAL_PROMPT;
        const { body, contentType } = buildMultipart(wav, currentModel, "es", contextPrompt);

        const resp = await fetch(`${whisperUrl}/v1/audio/transcriptions`, {
          method: "POST",
          headers: { "Content-Type": contentType },
          body,
        });

        if (resp.ok) {
          const data = await resp.json();
          const text = (data.text || "").trim();
          // Filtrar respuestas vacías o repetitivas de Whisper
          if (text && text.length > 1 && clientWs.readyState === 1) {
            lastTranscription = text; // guardar para contexto del próximo chunk
            clientWs.send(JSON.stringify({ type: "transcription", text: addPunctuation(text), speaker: null }));
          }
        } else {
          console.error("[whisper]", resp.status, await resp.text());
        }
      } catch (err) {
        console.error("[whisper] Error:", err.message);
      } finally {
        sending = false;
      }
    }

    // Envía ventana larga al servicio de diarización (con overlap 50%)
    async function flushDiarize() {
      if (diarizing || diarizeSamples === 0 || !useDiarize) return;
      diarizing = true;

      // Construir ventana con overlap: audio anterior + audio actual
      const overlapSamples = prevDiarizeSamples + diarizeSamples;
      const combined = new Float32Array(overlapSamples);
      let offset = 0;
      for (const chunk of prevDiarizeChunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }
      for (const chunk of diarizeChunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }

      // Guardar 50% final como overlap para la próxima ventana
      const halfSamples = Math.floor(diarizeSamples * DIARIZE_OVERLAP);
      const halfIdx = diarizeChunks.length - Math.ceil(diarizeChunks.length * DIARIZE_OVERLAP);
      prevDiarizeChunks = diarizeChunks.slice(Math.max(0, halfIdx));
      prevDiarizeSamples = prevDiarizeChunks.reduce((acc, c) => acc + c.length, 0);
      diarizeChunks = [];
      diarizeSamples = 0;

      // Filtrar silencio
      if (!hasVoice(combined)) {
        diarizing = false;
        return;
      }

      try {
        const wav = pcmToWav(combined, SAMPLE_RATE);
        const formData = new FormData();
        formData.append("file", new Blob([wav], { type: "audio/wav" }), "chunk.wav");
        formData.append("num_speakers", "2");
        formData.append("language", "es");

        const resp = await fetch(`${diarizeUrl}/transcribe`, {
          method: "POST",
          body: formData,
        });

        if (resp.ok) {
          const data = await resp.json();
          // data.segments: [{ speaker, start, end, text }]
          if (data.segments && clientWs.readyState === 1) {
            const segments = data.segments.map(s => ({
              ...s,
              text: addPunctuation(s.text),
            }));
            clientWs.send(JSON.stringify({ type: "diarization", segments }));
          }
        } else {
          console.error("[diarize]", resp.status, await resp.text());
        }
      } catch (err) {
        console.error("[diarize] Error:", err.message);
      } finally {
        diarizing = false;
      }
    }

    // Timer periódico para no esperar solo al llenado del buffer
    const interval = setInterval(() => flushBuffer(), CHUNK_SECONDS * 1000);
    const diarizeInterval = useDiarize
      ? setInterval(() => flushDiarize(), DIARIZE_SECONDS * 1000)
      : null;

    clientWs.on("message", (data, isBinary) => {
      if (isBinary) {
        // data es Buffer con Float32 raw
        const f32 = new Float32Array(
          data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
        );

        // Buffer para transcripción rápida
        pcmChunks.push(f32);
        bufferSamples += f32.length;

        // Buffer para diarización (ventana más larga)
        if (useDiarize) {
          diarizeChunks.push(f32);
          diarizeSamples += f32.length;
          if (diarizeSamples >= DIARIZE_SAMPLES) {
            flushDiarize();
          }
        }

        // Si hay suficiente audio, enviar ya
        if (bufferSamples >= CHUNK_SAMPLES) {
          flushBuffer();
        }
      } else {
        // Mensajes de control (JSON)
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === "set_model") {
            currentModel = msg.model;
            console.log("[ws] Modelo cambiado a:", currentModel);
            clientWs.send(JSON.stringify({ type: "model_changed", model: currentModel }));
          }
        } catch { /* ignorar JSON inválido */ }
      }
    });

    clientWs.on("close", () => {
      clearInterval(interval);
      if (diarizeInterval) clearInterval(diarizeInterval);
      flushBuffer(); // enviar audio restante
      if (useDiarize) flushDiarize();
      console.log("[ws] Cliente desconectado");
    });

    clientWs.on("error", (err) => {
      clearInterval(interval);
      if (diarizeInterval) clearInterval(diarizeInterval);
      console.error("[ws] Error cliente:", err.message);
    });
  });

  server.listen(port, () => {
    console.log(`> VoiceToText listo en http://localhost:${port}`);
    console.log(`> Whisper API: ${whisperUrl}`);
    console.log(`> Entorno: ${dev ? "desarrollo" : "producción"}`);
  });
});
