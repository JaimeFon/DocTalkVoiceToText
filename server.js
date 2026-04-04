const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { WebSocketServer } = require("ws");

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "3000", 10);
const whisperUrl = process.env.WHISPER_API_URL || "http://localhost:8000";

const app = next({ dev });
const handle = app.getRequestHandler();

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
function buildMultipart(wavBuf, model, language) {
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
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

  return {
    body: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
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
    const CHUNK_SECONDS = 3;
    const CHUNK_SAMPLES = CHUNK_SECONDS * SAMPLE_RATE;

    let currentModel = process.env.NEXT_PUBLIC_DEFAULT_MODEL || "base";
    let pcmChunks = [];      // Float32Array[]
    let bufferSamples = 0;
    let sending = false;

    // Envía el buffer acumulado al REST API de Whisper
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

      try {
        const wav = pcmToWav(combined, SAMPLE_RATE);
        const { body, contentType } = buildMultipart(wav, currentModel, "es");

        const resp = await fetch(`${whisperUrl}/v1/audio/transcriptions`, {
          method: "POST",
          headers: { "Content-Type": contentType },
          body,
        });

        if (resp.ok) {
          const data = await resp.json();
          const text = (data.text || "").trim();
          if (text && clientWs.readyState === 1) {
            clientWs.send(JSON.stringify({ type: "transcription", text }));
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

    // Timer periódico para no esperar solo al llenado del buffer
    const interval = setInterval(() => flushBuffer(), CHUNK_SECONDS * 1000);

    clientWs.on("message", (data, isBinary) => {
      if (isBinary) {
        // data es Buffer con Float32 raw
        const f32 = new Float32Array(
          data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
        );
        pcmChunks.push(f32);
        bufferSamples += f32.length;

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
      flushBuffer(); // enviar audio restante
      console.log("[ws] Cliente desconectado");
    });

    clientWs.on("error", (err) => {
      clearInterval(interval);
      console.error("[ws] Error cliente:", err.message);
    });
  });

  server.listen(port, () => {
    console.log(`> VoiceToText listo en http://localhost:${port}`);
    console.log(`> Whisper API: ${whisperUrl}`);
    console.log(`> Entorno: ${dev ? "desarrollo" : "producción"}`);
  });
});
