// AudioWorklet processor: captura audio PCM float32 a 16kHz y lo envía al main thread
class PcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._bufferSize = 4096;
    this._buffer = new Float32Array(this._bufferSize);
    this._writeIndex = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channelData = input[0]; // mono

    for (let i = 0; i < channelData.length; i++) {
      this._buffer[this._writeIndex++] = channelData[i];

      if (this._writeIndex >= this._bufferSize) {
        // Enviar buffer completo al main thread
        this.port.postMessage(this._buffer.slice());
        this._writeIndex = 0;
      }
    }

    return true;
  }
}

registerProcessor("pcm-processor", PcmProcessor);
