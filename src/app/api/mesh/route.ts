// ============================================================
// Workshop — Meshy API Proxy for 3D Mesh Generation
// ============================================================
//
// Two endpoints:
// - POST /api/mesh — submit task, return taskId immediately
// - GET /api/mesh?taskId=xxx — check task status
// ============================================================

import { NextResponse } from 'next/server';

const MESHY_API_URL = 'https://api.meshy.ai/openapi/v2/text-to-3d';

interface MeshyTaskResponse {
  id: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED';
  model_urls?: {
    glb?: string;
    fbx?: string;
    usdz?: string;
    obj?: string;
  };
  thumbnail_url?: string;
  progress?: number;
  task_error?: {
    message: string;
  };
}

interface SubmitMeshRequest {
  prompt: string;
  style?: 'realistic' | 'cartoon';
}

// POST /api/mesh — Submit a new mesh generation task
export async function POST(request: Request): Promise<NextResponse> {
  const apiKey = process.env.MESHY_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        error: 'MESHY_API_KEY not configured',
        message: 'To enable AI mesh generation, add MESHY_API_KEY to your .env.local file. Get a free API key at https://meshy.ai',
      },
      { status: 501 }
    );
  }

  try {
    const body: SubmitMeshRequest = await request.json();
    const { prompt, style = 'realistic' } = body;

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'Invalid request', message: 'prompt is required' },
        { status: 400 }
      );
    }

    // Submit to Meshy API
    const response = await fetch(MESHY_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mode: 'preview',
        prompt,
        art_style: style,
        should_remesh: true,
      }),
    });

    if (response.status === 429) {
      return NextResponse.json(
        { error: 'Rate limited', message: 'Meshy API rate limit reached. Please wait and try again.' },
        { status: 429 }
      );
    }

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: 'Meshy API error', message: `${response.status} - ${errorText}` },
        { status: 500 }
      );
    }

    const data = await response.json();
    const taskId = data.result;

    // Return task ID immediately — client will poll
    return NextResponse.json({ taskId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[MESH API] POST error:', message);
    return NextResponse.json(
      { error: 'Failed to submit mesh task', message },
      { status: 500 }
    );
  }
}

// GET /api/mesh?taskId=xxx — Check task status
// GET /api/mesh?url=xxx — Proxy GLB download (avoids CORS)
export async function GET(request: Request): Promise<NextResponse | Response> {
  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get('taskId');
  const proxyUrl = searchParams.get('url');

  // Handle GLB proxy request
  if (proxyUrl) {
    return handleGlbProxy(proxyUrl);
  }

  // Handle task status request
  if (taskId) {
    return handleTaskStatus(taskId);
  }

  return NextResponse.json(
    { error: 'Invalid request', message: 'taskId or url is required' },
    { status: 400 }
  );
}

// Proxy GLB download from Meshy assets (avoids CORS)
async function handleGlbProxy(url: string): Promise<Response> {
  // Validate URL is from Meshy assets
  if (!url.startsWith('https://assets.meshy.ai/')) {
    console.error('[MESH API] Invalid proxy URL:', url);
    return NextResponse.json(
      { error: 'Invalid URL', message: 'Only Meshy asset URLs are allowed' },
      { status: 400 }
    );
  }

  try {
    console.log('[MESH API] Proxying GLB from:', url);
    const response = await fetch(url);

    if (!response.ok) {
      console.error('[MESH API] Failed to fetch GLB:', response.status);
      return NextResponse.json(
        { error: 'Failed to fetch GLB', message: `${response.status}` },
        { status: response.status }
      );
    }

    // Read the full binary data (more reliable than streaming in Next.js)
    const arrayBuffer = await response.arrayBuffer();
    console.log('[MESH API] GLB fetched, size:', arrayBuffer.byteLength);

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'model/gltf-binary',
        'Access-Control-Allow-Origin': '*',
        'Content-Length': String(arrayBuffer.byteLength),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[MESH API] GLB proxy error:', message);
    return NextResponse.json(
      { error: 'Failed to proxy GLB', message },
      { status: 500 }
    );
  }
}

// Check task status
async function handleTaskStatus(taskId: string): Promise<NextResponse> {
  const apiKey = process.env.MESHY_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: 'MESHY_API_KEY not configured' },
      { status: 501 }
    );
  }

  try {
    const response = await fetch(`${MESHY_API_URL}/${taskId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (response.status === 429) {
      return NextResponse.json(
        { error: 'Rate limited', message: 'Meshy API rate limit reached.' },
        { status: 429 }
      );
    }

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: 'Meshy API error', message: `${response.status} - ${errorText}` },
        { status: 500 }
      );
    }

    const task: MeshyTaskResponse = await response.json();

    // Return status info for client
    return NextResponse.json({
      status: task.status,
      progress: task.progress ?? 0,
      modelUrl: task.status === 'SUCCEEDED' ? task.model_urls?.glb : undefined,
      thumbnailUrl: task.status === 'SUCCEEDED' ? task.thumbnail_url : undefined,
      error: task.status === 'FAILED' ? task.task_error?.message : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[MESH API] GET error:', message);
    return NextResponse.json(
      { error: 'Failed to check task status', message },
      { status: 500 }
    );
  }
}
