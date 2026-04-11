// ============================================================
// Workshop — Tripo API Proxy for 3D Mesh Generation
// ============================================================
//
// Three endpoints:
// - POST /api/mesh — submit task, return taskId immediately
// - GET /api/mesh?taskId=xxx — check task status
// - GET /api/mesh?url=xxx — proxy GLB download (avoids CORS)
// ============================================================

import { NextResponse } from 'next/server';

const TRIPO_API_URL = 'https://api.tripo3d.ai/v2/openapi/task';

interface SubmitMeshRequest {
  prompt: string;
  style?: string;
}

// POST /api/mesh — Submit a new mesh generation task
export async function POST(request: Request): Promise<NextResponse> {
  const apiKey = process.env.TRIPO_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        error: 'TRIPO_API_KEY not configured',
        message: 'To enable AI mesh generation, add TRIPO_API_KEY to your .env.local file. Get a free API key at https://tripo3d.ai',
      },
      { status: 501 }
    );
  }

  try {
    const body: SubmitMeshRequest = await request.json();
    const { prompt } = body;

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'Invalid request', message: 'prompt is required' },
        { status: 400 }
      );
    }

    // Submit to Tripo API
    const response = await fetch(TRIPO_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'text_to_model',
        prompt,
        face_limit: 8000,
        texture: false,
        pbr: false,
      }),
    });

    if (response.status === 429) {
      return NextResponse.json(
        { error: 'Rate limited', message: 'Tripo API rate limit reached. Please wait and try again.' },
        { status: 429 }
      );
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[MESH API] Tripo POST error:', response.status, errorText);
      return NextResponse.json(
        { error: 'Tripo API error', message: `${response.status} - ${errorText}` },
        { status: 500 }
      );
    }

    const result = await response.json();
    console.log('[MESH API] Tripo submit response:', JSON.stringify(result));

    const taskId = result.data?.task_id;

    if (!taskId) {
      console.error('[MESH API] No task_id in response:', result);
      return NextResponse.json(
        { error: 'Invalid response', message: 'No task_id returned from Tripo API' },
        { status: 500 }
      );
    }

    console.log('[MESH API] Task submitted:', taskId);
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

// Proxy GLB download (avoids CORS)
async function handleGlbProxy(url: string): Promise<Response> {
  // Allow Tripo URLs and other common 3D asset hosts
  const allowedHosts = [
    'https://tripo-data',
    'https://assets.meshy.ai/',
    'https://cdn.tripo3d.ai/',
  ];

  const isAllowed = allowedHosts.some((host) => url.startsWith(host));
  if (!isAllowed) {
    console.error('[MESH API] Invalid proxy URL:', url);
    return NextResponse.json(
      { error: 'Invalid URL', message: 'URL not from allowed hosts' },
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

    // Read the full binary data
    const arrayBuffer = await response.arrayBuffer();
    const sizeMB = (arrayBuffer.byteLength / (1024 * 1024)).toFixed(2);
    console.log(`[MESH API] GLB fetched, size: ${sizeMB}MB (${arrayBuffer.byteLength.toLocaleString()} bytes)`);

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

// Check task status from Tripo API
async function handleTaskStatus(taskId: string): Promise<NextResponse> {
  const apiKey = process.env.TRIPO_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: 'TRIPO_API_KEY not configured' },
      { status: 501 }
    );
  }

  try {
    const response = await fetch(`${TRIPO_API_URL}/${taskId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (response.status === 429) {
      return NextResponse.json(
        { error: 'Rate limited', message: 'Tripo API rate limit reached.' },
        { status: 429 }
      );
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[MESH API] Tripo GET error:', response.status, errorText);
      return NextResponse.json(
        { error: 'Tripo API error', message: `${response.status} - ${errorText}` },
        { status: 500 }
      );
    }

    const result = await response.json();
    console.log('[MESH API] Tripo status response:', JSON.stringify(result));

    const taskData = result.data;

    if (!taskData) {
      console.error('[MESH API] No data in Tripo response:', result);
      return NextResponse.json(
        { error: 'Invalid response', message: 'No data in Tripo response' },
        { status: 500 }
      );
    }

    // Check for model URL first — it may be available before status changes to 'success'
    // Tripo uses pbr_model for textured models, base_model for untextured
    const modelUrl = taskData.output?.pbr_model || taskData.output?.base_model || taskData.result?.pbr_model?.url || taskData.result?.base_model?.url;
    if (modelUrl && typeof modelUrl === 'string' && modelUrl.length > 0) {
      console.log('[MESH API] Model URL from:', taskData.output?.pbr_model ? 'output.pbr_model' : taskData.output?.base_model ? 'output.base_model' : 'result fallback');
      console.log('[MESH API] Model URL available, treating as SUCCEEDED:', modelUrl);
      return NextResponse.json({ status: 'SUCCEEDED', progress: 100, modelUrl });
    }

    // Map Tripo status (lowercase) to our normalized status (uppercase)
    const tripoStatus = taskData.status;
    let status: 'PENDING' | 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED';
    let progress = 0;
    let error: string | undefined;

    switch (tripoStatus) {
      case 'queued':
        status = 'IN_PROGRESS';
        progress = 10;
        break;
      case 'running':
        status = 'IN_PROGRESS';
        progress = taskData.progress ?? 50;
        break;
      case 'success':
        // Model URL already checked above, but status is success with no URL (edge case)
        status = 'SUCCEEDED';
        progress = 100;
        break;
      case 'failed':
      case 'cancelled':
        status = 'FAILED';
        error = taskData.output?.error || 'Generation failed';
        break;
      default:
        status = 'IN_PROGRESS';
        progress = 25;
    }

    console.log('[MESH API] Task status:', taskId, status, progress);

    return NextResponse.json({
      status,
      progress,
      error,
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
