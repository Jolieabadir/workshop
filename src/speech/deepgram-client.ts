/**
 * Deepgram STT Client
 *
 * Captures microphone audio via getUserMedia and streams it to the
 * server-side proxy which connects to Deepgram's WebSocket STT API.
 * Transcripts are received back via Server-Sent Events.
 */

export type TranscriptCallback = (transcript: string, isFinal: boolean, speechFinal?: boolean) => void;
export type StatusCallback = (status: 'connecting' | 'connected' | 'disconnected' | 'error', error?: string) => void;

interface DeepgramClientOptions {
  onTranscript: TranscriptCallback;
  onStatus?: StatusCallback;
  /** Interim results for real-time feedback (default: true) */
  interimResults?: boolean;
}

export class DeepgramClient {
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private eventSource: EventSource | null = null;
  private sessionId: string | null = null;
  private isRunning = false;

  private onTranscript: TranscriptCallback;
  private onStatus: StatusCallback;
  private interimResults: boolean;

  constructor(options: DeepgramClientOptions) {
    this.onTranscript = options.onTranscript;
    this.onStatus = options.onStatus ?? (() => {});
    this.interimResults = options.interimResults ?? true;
  }

  /** Check if microphone is currently active */
  get isListening(): boolean {
    return this.isRunning;
  }

  /** Start capturing and streaming audio */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn('[Deepgram] Already running');
      return;
    }

    try {
      this.onStatus('connecting');

      // Generate a unique session ID
      this.sessionId = crypto.randomUUID();

      // Request microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      });

      // Set up audio context for processing
      this.audioContext = new AudioContext({ sampleRate: 16000 });
      this.source = this.audioContext.createMediaStreamSource(this.mediaStream);

      // Use ScriptProcessor for raw audio access (deprecated but widely supported)
      // Buffer size of 4096 gives ~256ms chunks at 16kHz
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

      // Connect SSE for receiving transcripts
      this.connectSSE();

      // Set up audio processing
      this.processor.onaudioprocess = (event) => {
        if (!this.isRunning) return;

        const inputData = event.inputBuffer.getChannelData(0);
        // Convert Float32 to Int16 PCM
        const pcmData = this.float32ToInt16(inputData);
        this.sendAudioChunk(pcmData);
      };

      this.source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      this.isRunning = true;
      this.onStatus('connected');

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start microphone';
      this.onStatus('error', message);
      this.cleanup();
      throw error;
    }
  }

  /** Stop capturing and clean up */
  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    this.cleanup();
    this.onStatus('disconnected');
  }

  /** Toggle listening state */
  async toggle(): Promise<boolean> {
    if (this.isRunning) {
      this.stop();
      return false;
    } else {
      await this.start();
      return true;
    }
  }

  private connectSSE(): void {
    if (!this.sessionId) return;

    const url = `/api/speech/stream?sessionId=${this.sessionId}&interim=${this.interimResults}`;
    this.eventSource = new EventSource(url);

    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.transcript !== undefined) {
          this.onTranscript(data.transcript, data.is_final ?? false, data.speech_final ?? false);
        }
      } catch (e) {
        console.error('[Deepgram] Failed to parse SSE message:', e);
      }
    };

    this.eventSource.onerror = (error) => {
      console.error('[Deepgram] SSE error:', error);
      // EventSource will auto-reconnect, but we track the error
    };
  }

  private async sendAudioChunk(pcmData: Int16Array): Promise<void> {
    if (!this.sessionId) return;

    try {
      // Copy data to a new ArrayBuffer to ensure proper typing
      const copy = new ArrayBuffer(pcmData.byteLength);
      new Uint8Array(copy).set(new Uint8Array(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength));

      // Send audio chunk to the server
      await fetch('/api/speech/audio', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Session-Id': this.sessionId,
        },
        body: copy,
      });
    } catch (error) {
      // Don't spam console on network hiccups
      console.debug('[Deepgram] Failed to send audio chunk:', error);
    }
  }

  private float32ToInt16(float32Array: Float32Array): Int16Array {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      // Clamp to [-1, 1] and convert to Int16 range
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return int16Array;
  }

  private cleanup(): void {
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }

    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    // Notify server to close the session
    if (this.sessionId) {
      fetch('/api/speech/close', {
        method: 'POST',
        headers: { 'X-Session-Id': this.sessionId },
      }).catch(() => {});
      this.sessionId = null;
    }
  }
}

/** Singleton instance for easy access */
let clientInstance: DeepgramClient | null = null;

export function getDeepgramClient(options: DeepgramClientOptions): DeepgramClient {
  if (!clientInstance) {
    clientInstance = new DeepgramClient(options);
  }
  return clientInstance;
}

export function resetDeepgramClient(): void {
  if (clientInstance) {
    clientInstance.stop();
    clientInstance = null;
  }
}
