// AudioWorklet processor: captura audio PCM float32 con VAD integrado
// Solo envía buffers que contienen voz, descartando silencio para ahorrar CPU y red.
class PcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._bufferSize = 4096;
    this._buffer = new Float32Array(this._bufferSize);
    this._writeIndex = 0;

    // VAD (Voice Activity Detection) por energía RMS
    this._vadThreshold = 0.008;  // umbral mínimo de RMS para considerar "voz"
    this._silenceFrames = 0;     // frames consecutivos en silencio
    this._maxSilenceFrames = 20; // ~0.5s de silencio antes de dejar de enviar
    this._speaking = false;
  }

  _rms(buffer) {
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      sum += buffer[i] * buffer[i];
    }
    return Math.sqrt(sum / buffer.length);
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channelData = input[0]; // mono

    for (let i = 0; i < channelData.length; i++) {
      this._buffer[this._writeIndex++] = channelData[i];

      if (this._writeIndex >= this._bufferSize) {
        const rms = this._rms(this._buffer);

        if (rms > this._vadThreshold) {
          // Voz detectada
          this._speaking = true;
          this._silenceFrames = 0;
          this.port.postMessage(this._buffer.slice());
        } else if (this._speaking) {
          // Era voz, ahora silencio — enviar unos frames más para no cortar
          this._silenceFrames++;
          this.port.postMessage(this._buffer.slice());
          if (this._silenceFrames >= this._maxSilenceFrames) {
            this._speaking = false;
          }
        }
        // Si no estaba hablando y sigue en silencio, NO enviar

        this._writeIndex = 0;
      }
    }

    return true;
  }
}

registerProcessor("pcm-processor", PcmProcessor);
