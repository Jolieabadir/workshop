/**
 * TTS Player — Web Audio API based playback for Deepgram Aura
 *
 * Fetches audio from the TTS API route and plays it using Web Audio API.
 * Supports queuing multiple phrases and plays them sequentially.
 */

type TTSPlayerOptions = {
  voice?: string;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: Error) => void;
};

class TTSPlayer {
  private audioContext: AudioContext | null = null;
  private queue: string[] = [];
  private isPlaying = false;
  private options: TTSPlayerOptions;

  constructor(options: TTSPlayerOptions = {}) {
    this.options = options;
  }

  private getAudioContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new AudioContext({ sampleRate: 24000 });
    }
    return this.audioContext;
  }

  /**
   * Speak text using TTS. Queues if already speaking.
   */
  async speak(text: string): Promise<void> {
    if (!text || text.trim() === '') return;

    this.queue.push(text);

    if (!this.isPlaying) {
      await this.processQueue();
    }
  }

  private async processQueue(): Promise<void> {
    if (this.queue.length === 0) {
      this.isPlaying = false;
      return;
    }

    this.isPlaying = true;
    const text = this.queue.shift()!;

    try {
      this.options.onStart?.();

      // Fetch audio from TTS API
      const response = await fetch('/api/speech/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voice: this.options.voice || 'aura-asteria-en',
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || error.error || 'TTS failed');
      }

      // Get audio data
      const arrayBuffer = await response.arrayBuffer();

      // Convert linear16 PCM to playable audio
      const audioBuffer = await this.decodeLinear16(arrayBuffer);

      // Play the audio
      await this.playAudioBuffer(audioBuffer);

      this.options.onEnd?.();
    } catch (error) {
      console.error('[TTS Player] Error:', error);
      this.options.onError?.(error instanceof Error ? error : new Error(String(error)));
    }

    // Process next item in queue
    await this.processQueue();
  }

  /**
   * Decode linear16 PCM audio to AudioBuffer
   */
  private async decodeLinear16(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    const ctx = this.getAudioContext();

    // Linear16 is 16-bit signed PCM at 24kHz
    const int16Array = new Int16Array(arrayBuffer);
    const float32Array = new Float32Array(int16Array.length);

    // Convert int16 to float32 (-1.0 to 1.0)
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768;
    }

    // Create audio buffer
    const audioBuffer = ctx.createBuffer(1, float32Array.length, 24000);
    audioBuffer.copyToChannel(float32Array, 0);

    return audioBuffer;
  }

  /**
   * Play an AudioBuffer using Web Audio API
   */
  private playAudioBuffer(audioBuffer: AudioBuffer): Promise<void> {
    return new Promise((resolve) => {
      const ctx = this.getAudioContext();

      // Resume context if suspended (browser autoplay policy)
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      source.onended = () => {
        resolve();
      };

      source.start(0);
    });
  }

  /**
   * Stop all playback and clear queue
   */
  stop(): void {
    this.queue = [];
    this.isPlaying = false;

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  /**
   * Check if currently speaking
   */
  get isSpeaking(): boolean {
    return this.isPlaying;
  }
}

// Singleton instance
let ttsPlayer: TTSPlayer | null = null;

/**
 * Get or create the TTS player instance
 */
export function getTTSPlayer(options?: TTSPlayerOptions): TTSPlayer {
  if (!ttsPlayer) {
    ttsPlayer = new TTSPlayer(options);
  }
  return ttsPlayer;
}

/**
 * Convenience function to speak text
 */
export async function speak(text: string): Promise<void> {
  const player = getTTSPlayer();
  await player.speak(text);
}

/**
 * Stop TTS playback
 */
export function stopSpeaking(): void {
  if (ttsPlayer) {
    ttsPlayer.stop();
  }
}

export { TTSPlayer };
