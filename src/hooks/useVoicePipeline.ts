// ============================================================
// Workshop — Voice Pipeline Hook
// Manages Deepgram STT lifecycle and transcript state
// ============================================================

'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useCanvasStore } from '@/store/canvas-store';
import { DeepgramClient } from '@/lib/deepgram';
import type { UnifiedIntent } from '@/core/types';

interface UseVoicePipelineOptions {
  onUtteranceComplete?: (utterance: string, intent: UnifiedIntent | null) => void;
}

interface VoicePipelineState {
  isListening: boolean;
  isSpeaking: boolean;
  micError: string | null;
  transcript: string;
}

export function useVoicePipeline(options: UseVoicePipelineOptions = {}) {
  const { onUtteranceComplete } = options;

  const setTranscript = useCanvasStore((s) => s.setTranscript);
  const setListening = useCanvasStore((s) => s.setListening);
  const transcript = useCanvasStore((s) => s.transcript);
  const isListening = useCanvasStore((s) => s.isListening);

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  const deepgramRef = useRef<DeepgramClient | null>(null);
  const interimTranscriptRef = useRef<string>('');
  const finalTranscriptRef = useRef<string>('');
  const onUtteranceCompleteRef = useRef(onUtteranceComplete);

  // Keep callback ref updated
  useEffect(() => {
    onUtteranceCompleteRef.current = onUtteranceComplete;
  }, [onUtteranceComplete]);

  // Initialize Deepgram client
  useEffect(() => {
    deepgramRef.current = new DeepgramClient({
      onTranscript: (text, isFinal, speechFinal) => {
        if (isFinal) {
          // Append finalized segment to accumulated transcript
          finalTranscriptRef.current = finalTranscriptRef.current
            ? `${finalTranscriptRef.current} ${text}`
            : text;
          interimTranscriptRef.current = '';
          setTranscript(finalTranscriptRef.current);
        } else {
          // Show interim transcript (real-time feedback)
          interimTranscriptRef.current = text;
          setTranscript(
            finalTranscriptRef.current
              ? `${finalTranscriptRef.current} ${text}`
              : text
          );
        }

        // speech_final = user paused speaking (utterance complete)
        if (speechFinal && finalTranscriptRef.current.trim()) {
          const utterance = finalTranscriptRef.current.trim();
          console.log('[VOICE] Speech final:', utterance);

          // Clear immediately to prevent double-sends
          finalTranscriptRef.current = '';

          // Fire callback
          onUtteranceCompleteRef.current?.(utterance, null);
        }
      },
      onStatus: (status, error) => {
        if (status === 'connected') {
          setListening(true);
          setMicError(null);
        } else if (status === 'disconnected') {
          setListening(false);
        } else if (status === 'error') {
          setListening(false);
          setMicError(error || 'Microphone error');
        }
      },
    });

    return () => {
      deepgramRef.current?.stop();
    };
  }, [setTranscript, setListening]);

  // Toggle microphone
  const toggleMic = useCallback(async () => {
    if (!deepgramRef.current) return;

    try {
      setMicError(null);
      if (isListening) {
        deepgramRef.current.stop();
        interimTranscriptRef.current = '';
      } else {
        // Clear transcripts when starting fresh
        finalTranscriptRef.current = '';
        interimTranscriptRef.current = '';
        setTranscript('');
        await deepgramRef.current.start();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to access microphone';
      setMicError(message);
    }
  }, [isListening, setTranscript]);

  // Play TTS via Deepgram Aura
  const speak = useCallback(async (text: string) => {
    try {
      console.log('[TTS] Calling Deepgram Aura:', text);
      const ttsResponse = await fetch('/api/speech/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: 'aura-asteria-en' }),
      });

      if (!ttsResponse.ok) {
        throw new Error(`TTS API error: ${ttsResponse.status}`);
      }

      const audioBlob = await ttsResponse.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        setIsSpeaking(false);
      };
      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        setIsSpeaking(false);
      };

      setIsSpeaking(true);
      await audio.play();
    } catch (err) {
      console.error('[TTS] Deepgram failed, falling back to Web Speech:', err);
      // Fallback to Web Speech API
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.0;
      window.speechSynthesis.speak(u);
    }
  }, []);

  const state: VoicePipelineState = {
    isListening,
    isSpeaking,
    micError,
    transcript,
  };

  return {
    ...state,
    toggleMic,
    speak,
    setTranscript,
  };
}
