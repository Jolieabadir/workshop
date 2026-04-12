// ============================================================
// Workshop — Tripo API Proxy for 3D Mesh Generation
// ============================================================
//
// Endpoints:
// - POST /api/mesh — submit task (with cache check), return taskId or cached URL
// - GET /api/mesh?taskId=xxx — check task status (caches GLB on success)
// - GET /api/mesh?url=xxx — proxy GLB download (avoids CORS)
// - GET /api/mesh?cacheHash=xxx — serve cached GLB from disk
// - GET /api/mesh?imageUrl=xxx — proxy preview image (avoids CORS)
// ============================================================

import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

const TRIPO_API_URL = 'https://api.tripo3d.ai/v2/openapi/task';
const CACHE_DIR = path.join(process.cwd(), '.mesh-cache');

interface SubmitMeshRequest {
  prompt: string;
  style?: string;
}

// Normalize prompt for consistent hashing
function normalizePrompt(prompt: string): string {
  return prompt.toLowerCase().trim().replace(/\s+/g, ' ');
}

// Generate SHA-256 hash for cache key
function getCacheHash(prompt: string, style: string): string {
  const normalized = `${normalizePrompt(prompt)}|${style}`;
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

// Ensure cache directory exists
async function ensureCacheDir(): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  } catch {
    // Directory may already exist
  }
}

// Check if cached GLB exists
async function getCachedGlb(hash: string): Promise<string | null> {
  const glbPath = path.join(CACHE_DIR, `${hash}.glb`);
  try {
    await fs.access(glbPath);
    return glbPath;
  } catch {
    return null;
  }
}

// Save GLB to cache (fire-and-forget, doesn't block response)
async function cacheGlb(hash: string, prompt: string, style: string, modelUrl: string): Promise<void> {
  try {
    await ensureCacheDir();

    // Download GLB
    console.log('[MESH CACHE] Downloading GLB to cache:', hash);
    const response = await fetch(modelUrl);
    if (!response.ok) {
      console.error('[MESH CACHE] Failed to download GLB:', response.status);
      return;
    }

    const arrayBuffer = await response.arrayBuffer();
    const glbPath = path.join(CACHE_DIR, `${hash}.glb`);
    const metaPath = path.join(CACHE_DIR, `${hash}.json`);

    // Write GLB and metadata
    await fs.writeFile(glbPath, Buffer.from(arrayBuffer));
    await fs.writeFile(metaPath, JSON.stringify({
      prompt,
      style,
      cachedAt: new Date().toISOString(),
      originalUrl: modelUrl,
      sizeBytes: arrayBuffer.byteLength,
    }, null, 2));

    const sizeMB = (arrayBuffer.byteLength / (1024 * 1024)).toFixed(2);
    console.log(`[MESH CACHE] Cached ${hash}.glb (${sizeMB}MB)`);
  } catch (error) {
    console.error('[MESH CACHE] Failed to cache GLB:', error);
  }
}

// POST /api/mesh — Submit a new mesh generation task (with cache check)
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
    const { prompt, style = 'realistic' } = body;

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'Invalid request', message: 'prompt is required' },
        { status: 400 }
      );
    }

    // Check cache first
    const cacheHash = getCacheHash(prompt, style);
    const cachedPath = await getCachedGlb(cacheHash);

    if (cachedPath) {
      console.log('[MESH CACHE] Cache hit:', cacheHash);
      return NextResponse.json({
        cached: true,
        cacheHash,
        modelUrl: `/api/mesh?cacheHash=${cacheHash}`,
      });
    }

    console.log('[MESH CACHE] Cache miss:', cacheHash);

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
        texture: true,
        pbr: true,
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

    console.log('[MESH API] Task submitted:', taskId, 'cacheHash:', cacheHash);
    return NextResponse.json({ taskId, cacheHash });
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
// GET /api/mesh?cacheHash=xxx — Serve cached GLB from disk
// GET /api/mesh?imageUrl=xxx — Proxy preview image (avoids CORS)
export async function GET(request: Request): Promise<NextResponse | Response> {
  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get('taskId');
  const proxyUrl = searchParams.get('url');
  const cacheHash = searchParams.get('cacheHash');
  const imageUrl = searchParams.get('imageUrl');

  // Handle cached GLB request
  if (cacheHash) {
    return handleCachedGlb(cacheHash);
  }

  // Handle image proxy request (for preview images)
  if (imageUrl) {
    return handleImageProxy(imageUrl);
  }

  // Handle GLB proxy request
  if (proxyUrl) {
    return handleGlbProxy(proxyUrl);
  }

  // Handle task status request
  if (taskId) {
    // Get cache params for saving on completion
    const hash = searchParams.get('hash');
    const prompt = searchParams.get('prompt');
    const style = searchParams.get('style') || 'realistic';
    return handleTaskStatus(taskId, hash, prompt, style);
  }

  return NextResponse.json(
    { error: 'Invalid request', message: 'taskId, url, cacheHash, or imageUrl is required' },
    { status: 400 }
  );
}

// Serve cached GLB from disk
async function handleCachedGlb(hash: string): Promise<Response> {
  // Sanitize hash to prevent directory traversal
  const sanitizedHash = hash.replace(/[^a-f0-9]/gi, '').slice(0, 16);
  const glbPath = path.join(CACHE_DIR, `${sanitizedHash}.glb`);

  try {
    const data = await fs.readFile(glbPath);
    console.log(`[MESH CACHE] Serving cached GLB: ${sanitizedHash} (${(data.byteLength / (1024 * 1024)).toFixed(2)}MB)`);

    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': 'model/gltf-binary',
        'Access-Control-Allow-Origin': '*',
        'Content-Length': String(data.byteLength),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return NextResponse.json(
      { error: 'Not found', message: 'Cached mesh not found' },
      { status: 404 }
    );
  }
}

// Proxy preview image (avoids CORS)
async function handleImageProxy(url: string): Promise<Response> {
  // Allow Tripo URLs
  const allowedHosts = [
    'https://tripo-data',
    'https://cdn.tripo3d.ai/',
    'https://storage.googleapis.com/',
  ];

  const isAllowed = allowedHosts.some((host) => url.startsWith(host));
  if (!isAllowed) {
    console.error('[MESH API] Invalid image proxy URL:', url);
    return NextResponse.json(
      { error: 'Invalid URL', message: 'URL not from allowed hosts' },
      { status: 400 }
    );
  }

  try {
    console.log('[MESH API] Proxying preview image from:', url);
    const response = await fetch(url);

    if (!response.ok) {
      console.error('[MESH API] Failed to fetch image:', response.status);
      return NextResponse.json(
        { error: 'Failed to fetch image', message: `${response.status}` },
        { status: response.status }
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/png';

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Content-Length': String(arrayBuffer.byteLength),
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[MESH API] Image proxy error:', message);
    return NextResponse.json(
      { error: 'Failed to proxy image', message },
      { status: 500 }
    );
  }
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
async function handleTaskStatus(
  taskId: string,
  cacheHash: string | null,
  prompt: string | null,
  style: string
): Promise<NextResponse> {
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

    // Extract preview image URL if available (Tripo returns this during generation)
    let previewImageUrl: string | undefined;
    const renderedImage = taskData.rendered_image || taskData.output?.rendered_image;
    if (renderedImage && typeof renderedImage === 'string') {
      // Proxy through our API to avoid CORS
      previewImageUrl = `/api/mesh?imageUrl=${encodeURIComponent(renderedImage)}`;
      console.log('[MESH API] Preview image available:', renderedImage);
    }

    // Check for model URL first — it may be available before status changes to 'success'
    // Tripo uses pbr_model for textured models, base_model for untextured
    const modelUrl = taskData.output?.pbr_model || taskData.output?.base_model || taskData.result?.pbr_model?.url || taskData.result?.base_model?.url;
    if (modelUrl && typeof modelUrl === 'string' && modelUrl.length > 0) {
      console.log('[MESH API] Model URL from:', taskData.output?.pbr_model ? 'output.pbr_model' : taskData.output?.base_model ? 'output.base_model' : 'result fallback');
      console.log('[MESH API] Model URL available, treating as SUCCEEDED:', modelUrl);

      // Cache the GLB in the background (fire-and-forget)
      if (cacheHash && prompt) {
        cacheGlb(cacheHash, prompt, style, modelUrl).catch((err) => {
          console.error('[MESH CACHE] Background cache failed:', err);
        });
      }

      return NextResponse.json({ status: 'SUCCEEDED', progress: 100, modelUrl, previewImageUrl });
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
      previewImageUrl,
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
