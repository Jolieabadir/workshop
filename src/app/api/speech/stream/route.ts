/**
 * SSE endpoint for receiving Deepgram transcripts
 *
 * Client connects to this endpoint and receives transcript updates
 * as Server-Sent Events.
 */

import { deepgramSessionManager } from '@/speech/deepgram-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get('sessionId');
  const interimResults = url.searchParams.get('interim') !== 'false';

  if (!sessionId) {
    return new Response('Missing sessionId', { status: 400 });
  }

  // Create a ReadableStream for SSE
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // Send initial connection message
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ connected: true })}\n\n`));

      // Subscribe to transcripts
      const unsubscribe = deepgramSessionManager.subscribe(
        sessionId,
        (data) => {
          try {
            const message = `data: ${JSON.stringify(data)}\n\n`;
            controller.enqueue(encoder.encode(message));
          } catch {
            // Stream might be closed
          }
        },
        interimResults
      );

      // Handle client disconnect
      request.signal.addEventListener('abort', () => {
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
}
