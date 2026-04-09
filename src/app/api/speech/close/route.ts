/**
 * Session close endpoint
 *
 * Client POSTs here when stopping the microphone to clean up
 * the server-side Deepgram WebSocket connection.
 */

import { deepgramSessionManager } from '@/speech/deepgram-server';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const sessionId = request.headers.get('X-Session-Id');

  if (!sessionId) {
    return new Response('Missing X-Session-Id header', { status: 400 });
  }

  deepgramSessionManager.closeSession(sessionId);

  return new Response('OK', { status: 200 });
}
