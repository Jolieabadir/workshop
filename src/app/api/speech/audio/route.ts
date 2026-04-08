/**
 * Audio upload endpoint for Deepgram streaming
 *
 * Client POSTs audio chunks here, which are forwarded to the
 * active Deepgram WebSocket connection for the session.
 */

import { deepgramSessionManager } from '@/lib/deepgram-server';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const sessionId = request.headers.get('X-Session-Id');

  if (!sessionId) {
    return new Response('Missing X-Session-Id header', { status: 400 });
  }

  try {
    // Read the raw audio data
    const audioData = await request.arrayBuffer();

    if (audioData.byteLength === 0) {
      return new Response('Empty audio data', { status: 400 });
    }

    // Forward to Deepgram
    deepgramSessionManager.sendAudio(sessionId, audioData);

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('[Audio] Error processing audio:', error);
    return new Response('Error processing audio', { status: 500 });
  }
}
