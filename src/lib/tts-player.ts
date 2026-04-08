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

      // Try Deepgram Aura TTS first
      let played = false;

      try {
        const response = await fetch('/api/speech/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            voice: this.options.voice || 'aura-asteria-en',
          }),
        });

        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          const audioBuffer = await this.decodeLinear16(arrayBuffer);
          await this.playAudioBuffer(audioBuffer);
          played = true;
        } else {
          console.warn('[TTS Player] Deepgram failed, falling back to Web Speech API');
        }
      } catch (deepgramError) {
        console.warn('[TTS Player] Deepgram error, falling back to Web Speech API:', deepgramError);
      }

      // Fallback to Web Speech API if Deepgram failed
      if (!played) {
        await this.speakWithWebSpeech(text);
      }

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
   * Fallback: use Web Speech API for TTS
   */
  private speakWithWebSpeech(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        reject(new Error('Web Speech API not supported'));
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      // Try to use a good voice if available
      const voices = window.speechSynthesis.getVoices();
      const preferredVoice = voices.find(
        (v) => v.lang.startsWith('en') && v.name.includes('Google')
      ) || voices.find((v) => v.lang.startsWith('en'));
      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }

      utterance.onend = () => resolve();
      utterance.onerror = (e) => reject(new Error(`Speech error: ${e.error}`));

      window.speechSynthesis.speak(utterance);
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
