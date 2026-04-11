// ============================================================
// Workshop — Meshy API Proxy for 3D Mesh Generation
// ============================================================

import { NextResponse } from 'next/server';

const MESHY_API_URL = 'https://api.meshy.ai/openapi/v2/text-to-3d';
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_TIME_MS = 90000;

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

interface GenerateMeshRequest {
  prompt: string;
  style?: 'realistic' | 'cartoon';
}

interface GenerateMeshResponse {
  modelUrl: string;
  thumbnailUrl?: string;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createMeshyTask(
  prompt: string,
  style: string,
  apiKey: string
): Promise<string> {
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
    throw new Error('RATE_LIMITED');
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Meshy API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.result;
}

async function pollMeshyTask(
  taskId: string,
  apiKey: string
): Promise<MeshyTaskResponse> {
  const startTime = Date.now();

  while (Date.now() - startTime < MAX_POLL_TIME_MS) {
    const response = await fetch(`${MESHY_API_URL}/${taskId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (response.status === 429) {
      // Rate limited - wait longer and retry
      await sleep(POLL_INTERVAL_MS * 2);
      continue;
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Meshy API poll error: ${response.status} - ${errorText}`);
    }

    const task: MeshyTaskResponse = await response.json();

    if (task.status === 'SUCCEEDED') {
      return task;
    }

    if (task.status === 'FAILED') {
      throw new Error(`Mesh generation failed: ${task.task_error?.message || 'Unknown error'}`);
    }

    if (task.status === 'EXPIRED') {
      throw new Error('Mesh generation task expired');
    }

    // Still pending or in progress - wait and poll again
    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error('TIMEOUT');
}

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
    const body: GenerateMeshRequest = await request.json();
    const { prompt, style = 'realistic' } = body;

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'Invalid request', message: 'prompt is required' },
        { status: 400 }
      );
    }

    // Create the mesh generation task
    const taskId = await createMeshyTask(prompt, style, apiKey);

    // Poll until complete
    const result = await pollMeshyTask(taskId, apiKey);

    if (!result.model_urls?.glb) {
      return NextResponse.json(
        { error: 'No GLB model generated', message: 'Meshy API did not return a GLB model URL' },
        { status: 500 }
      );
    }

    const response: GenerateMeshResponse = {
      modelUrl: result.model_urls.glb,
      thumbnailUrl: result.thumbnail_url,
    };

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message === 'RATE_LIMITED') {
      return NextResponse.json(
        { error: 'Rate limited', message: 'Meshy API rate limit reached. Please wait and try again.' },
        { status: 429 }
      );
    }

    if (message === 'TIMEOUT') {
      return NextResponse.json(
        { error: 'Timeout', message: 'Mesh generation took too long (>90 seconds). Try a simpler prompt.' },
        { status: 504 }
      );
    }

    console.error('[MESH API] Error:', message);
    return NextResponse.json(
      { error: 'Mesh generation failed', message },
      { status: 500 }
    );
  }
}
