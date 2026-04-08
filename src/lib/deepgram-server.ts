/**
 * Deepgram Server-Side Session Manager
 *
 * Manages WebSocket connections to Deepgram STT API.
 * Each client session gets its own WebSocket connection.
 * Transcripts are pushed to registered SSE callbacks.
 */

import WebSocket from 'ws';

interface TranscriptData {
  transcript: string;
  is_final: boolean;
  confidence?: number;
  words?: Array<{ word: string; start: number; end: number }>;
}

type TranscriptCallback = (data: TranscriptData) => void;

interface Session {
  ws: WebSocket | null;
  callbacks: Set<TranscriptCallback>;
  interimResults: boolean;
  lastActivity: number;
  buffer: ArrayBuffer[];
}

const DEEPGRAM_WS_URL = 'wss://api.deepgram.com/v1/listen';
const SESSION_TIMEOUT_MS = 60000; // 1 minute

class DeepgramSessionManager {
  private sessions: Map<string, Session> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => this.cleanupStaleSessions(), 30000);
  }

  /** Create or get an existing session */
  getOrCreateSession(sessionId: string, interimResults = true): Session {
    let session = this.sessions.get(sessionId);

    if (!session) {
      session = {
        ws: null,
        callbacks: new Set(),
        interimResults,
        lastActivity: Date.now(),
        buffer: [],
      };
      this.sessions.set(sessionId, session);
    }

    session.lastActivity = Date.now();
    return session;
  }

  /** Register a callback for transcript updates */
  subscribe(sessionId: string, callback: TranscriptCallback, interimResults = true): () => void {
    const session = this.getOrCreateSession(sessionId, interimResults);
    session.callbacks.add(callback);

    // Start WebSocket if not already connected
    if (!session.ws) {
      this.connectWebSocket(sessionId, session);
    }

    // Return unsubscribe function
    return () => {
      session.callbacks.delete(callback);
      if (session.callbacks.size === 0) {
        this.closeSession(sessionId);
      }
    };
  }

  /** Send audio data to Deepgram */
  sendAudio(sessionId: string, audioData: ArrayBuffer): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.lastActivity = Date.now();

    if (session.ws?.readyState === WebSocket.OPEN) {
      session.ws.send(audioData);
    } else {
      // Buffer audio until WebSocket is ready
      session.buffer.push(audioData);
    }
  }

  /** Close a session and its WebSocket */
  closeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (session.ws) {
      // Send close message to Deepgram
      if (session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(JSON.stringify({ type: 'CloseStream' }));
      }
      session.ws.close();
    }

    session.callbacks.clear();
    this.sessions.delete(sessionId);
  }

  private connectWebSocket(sessionId: string, session: Session): void {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      console.error('[Deepgram] DEEPGRAM_API_KEY not set');
      this.notifyCallbacks(session, {
        transcript: '',
        is_final: true,
      });
      return;
    }

    // Build query parameters for Deepgram
    const params = new URLSearchParams({
      model: 'nova-2',
      language: 'en-US',
      smart_format: 'true',
      punctuate: 'true',
      interim_results: session.interimResults.toString(),
      endpointing: '300', // 300ms silence detection
      encoding: 'linear16',
      sample_rate: '16000',
      channels: '1',
    });

    const url = `${DEEPGRAM_WS_URL}?${params.toString()}`;

    const ws = new WebSocket(url, {
      headers: {
        Authorization: `Token ${apiKey}`,
      },
    });

    session.ws = ws;

    ws.on('open', () => {
      console.log(`[Deepgram] WebSocket connected for session ${sessionId}`);

      // Flush buffered audio
      for (const chunk of session.buffer) {
        ws.send(chunk);
      }
      session.buffer = [];
    });

    ws.on('message', (data: Buffer) => {
      try {
        const response = JSON.parse(data.toString());

        // Handle transcript results
        if (response.type === 'Results') {
          const channel = response.channel;
          const alternatives = channel?.alternatives;

          if (alternatives && alternatives.length > 0) {
            const best = alternatives[0];
            const transcript = best.transcript || '';
            const isFinal = response.is_final || false;

            if (transcript || isFinal) {
              this.notifyCallbacks(session, {
                transcript,
                is_final: isFinal,
                confidence: best.confidence,
                words: best.words,
              });
            }
          }
        } else if (response.type === 'Metadata') {
          console.log('[Deepgram] Metadata:', response);
        } else if (response.type === 'Error') {
          console.error('[Deepgram] Error:', response);
        }
      } catch (error) {
        console.error('[Deepgram] Failed to parse message:', error);
      }
    });

    ws.on('error', (error) => {
      console.error(`[Deepgram] WebSocket error for session ${sessionId}:`, error);
    });

    ws.on('close', (code, reason) => {
      console.log(`[Deepgram] WebSocket closed for session ${sessionId}: ${code} ${reason}`);
      session.ws = null;
    });
  }

  private notifyCallbacks(session: Session, data: TranscriptData): void {
    for (const callback of session.callbacks) {
      try {
        callback(data);
      } catch (error) {
        console.error('[Deepgram] Callback error:', error);
      }
    }
  }

  private cleanupStaleSessions(): void {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions) {
      if (now - session.lastActivity > SESSION_TIMEOUT_MS) {
        console.log(`[Deepgram] Cleaning up stale session ${sessionId}`);
        this.closeSession(sessionId);
      }
    }
  }

  /** Shutdown the manager */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    for (const sessionId of this.sessions.keys()) {
      this.closeSession(sessionId);
    }
  }
}

// Singleton instance
export const deepgramSessionManager = new DeepgramSessionManager();
