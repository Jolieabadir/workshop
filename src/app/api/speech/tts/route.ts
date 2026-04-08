/**
 * Text-to-Speech endpoint using Deepgram Aura
 *
 * Accepts text and returns streaming audio via Deepgram's TTS API.
 * Uses Aura voice model for natural-sounding speech.
 */

import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

interface TTSRequest {
  text: string;
  voice?: string;
}

export async function POST(request: NextRequest): Promise<Response> {
  const apiKey = process.env.DEEPGRAM_API_KEY;

  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'DEEPGRAM_API_KEY not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body: TTSRequest = await request.json();
    const { text, voice = 'aura-asteria-en' } = body;

    if (!text || text.trim() === '') {
      return new Response(
        JSON.stringify({ error: 'Text is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Call Deepgram Aura TTS API
    const deepgramResponse = await fetch(
      `https://api.deepgram.com/v1/speak?model=${voice}&encoding=linear16&sample_rate=24000`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Token ${apiKey}`,
          'Content-Type': 'text/plain',
        },
        body: text,
      }
    );

    if (!deepgramResponse.ok) {
      const errorText = await deepgramResponse.text();
      console.error('[TTS] Deepgram error:', deepgramResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: 'TTS generation failed', details: errorText }),
        { status: deepgramResponse.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Stream the audio response back to the client
    const audioStream = deepgramResponse.body;

    if (!audioStream) {
      return new Response(
        JSON.stringify({ error: 'No audio stream received' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Return the audio stream with appropriate headers
    return new Response(audioStream, {
      status: 200,
      headers: {
        'Content-Type': 'audio/wav',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('[TTS] Error:', error);
    return new Response(
      JSON.stringify({ error: 'TTS request failed', details: String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
