/**
 * CV-Analyze API Route
 *
 * Accepts captured scene frames and runs OpenCV analysis via a Python subprocess.
 * Returns structured spatial metrics: gaps between parts, orientation errors, scale ratios.
 *
 * POST /api/cv-analyze
 * Body: { frames: [{ name: string, image: string }] }
 *
 * Returns: { results: AnalysisResult[] } or { error: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** Gap between two detected parts */
interface GapInfo {
  between_indices: [number, number];
  gap_px: number;
  direction: 'horizontal' | 'vertical' | 'diagonal';
}

/** Orientation of a detected part */
interface OrientationInfo {
  contour_index: number;
  principal_axis_deg: number;
  area_px: number;
}

/** Scale ratio between two parts */
interface ScaleRatioInfo {
  indices: [number, number];
  area_ratio: number;
}

/** Analysis result for a single frame */
export interface FrameAnalysisResult {
  frame_name: string;
  parts_detected: number;
  gaps: GapInfo[];
  orientations: OrientationInfo[];
  scale_ratios: ScaleRatioInfo[];
  visual_coherence: number;
  error?: string;
}

/** Input frame format */
interface InputFrame {
  name: string;
  image: string; // base64 PNG data URL or raw base64
}

/** Request body format */
interface AnalyzeRequest {
  frames: InputFrame[];
}

// Path to the Python analysis script (relative to project root)
const PYTHON_SCRIPT_PATH = path.join(process.cwd(), 'src/app/api/cv-analyze/analyze.py');

// Timeout for Python subprocess (30 seconds)
const SUBPROCESS_TIMEOUT_MS = 30000;

/**
 * Run the Python OpenCV analysis script
 */
async function runPythonAnalysis(frames: InputFrame[]): Promise<FrameAnalysisResult[]> {
  return new Promise((resolve, reject) => {
    // Create a temp file to pass the frames data
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `cv-analyze-${Date.now()}.json`);

    // Strip data URL prefix if present
    const cleanedFrames = frames.map((f) => ({
      name: f.name,
      image: f.image.replace(/^data:image\/\w+;base64,/, ''),
    }));

    // Write frames to temp file
    fs.writeFileSync(tempFile, JSON.stringify(cleanedFrames), 'utf-8');

    // Spawn Python process
    const pythonProcess = spawn('python3', [PYTHON_SCRIPT_PATH, tempFile], {
      timeout: SUBPROCESS_TIMEOUT_MS,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Set up timeout
    const timeoutId = setTimeout(() => {
      pythonProcess.kill('SIGTERM');
      reject(new Error('Python analysis timed out (>30 seconds)'));
    }, SUBPROCESS_TIMEOUT_MS);

    pythonProcess.on('close', (code) => {
      clearTimeout(timeoutId);

      // Clean up temp file
      try {
        fs.unlinkSync(tempFile);
      } catch {
        // Ignore cleanup errors
      }

      if (code !== 0) {
        console.error('[CV-ANALYZE] Python stderr:', stderr);
        reject(new Error(`Python process exited with code ${code}: ${stderr}`));
        return;
      }

      try {
        const results = JSON.parse(stdout) as FrameAnalysisResult[];
        resolve(results);
      } catch (parseError) {
        console.error('[CV-ANALYZE] Failed to parse Python output:', stdout);
        reject(new Error('Failed to parse Python analysis output'));
      }
    });

    pythonProcess.on('error', (err) => {
      clearTimeout(timeoutId);

      // Clean up temp file
      try {
        fs.unlinkSync(tempFile);
      } catch {
        // Ignore cleanup errors
      }

      // Check if Python/OpenCV is not installed
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new Error('Python3 not found. Install Python 3 and opencv-python-headless: pip install opencv-python-headless numpy'));
      } else {
        reject(err);
      }
    });
  });
}

/**
 * Check if the Python script and dependencies exist
 */
function checkPythonSetup(): { ok: boolean; error?: string } {
  // Check if script exists
  if (!fs.existsSync(PYTHON_SCRIPT_PATH)) {
    return {
      ok: false,
      error: `Python script not found at ${PYTHON_SCRIPT_PATH}`,
    };
  }

  return { ok: true };
}

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json();

    if (!body.frames || !Array.isArray(body.frames) || body.frames.length === 0) {
      console.error('[CV-ANALYZE] Invalid request: frames missing or empty');
      return NextResponse.json(
        { error: 'Request must include frames array with at least one frame' },
        { status: 400 }
      );
    }

    // Normalize frames - accept either string[] or {name, image}[]
    let normalizedFrames: InputFrame[];

    if (typeof body.frames[0] === 'string') {
      // Frames are just base64 strings - wrap with generated names
      console.log('[CV-ANALYZE] Received string[] frames, normalizing...');
      normalizedFrames = (body.frames as string[]).map((image, i) => ({
        name: `frame_${i}`,
        image,
      }));
    } else {
      // Frames are already {name, image} objects
      normalizedFrames = body.frames as InputFrame[];

      // Validate object format
      for (const frame of normalizedFrames) {
        if (!frame.name || typeof frame.name !== 'string') {
          console.error('[CV-ANALYZE] Invalid frame: missing name');
          return NextResponse.json(
            { error: 'Each frame must have a name string' },
            { status: 400 }
          );
        }
        if (!frame.image || typeof frame.image !== 'string') {
          console.error('[CV-ANALYZE] Invalid frame: missing image');
          return NextResponse.json(
            { error: 'Each frame must have an image string (base64 PNG)' },
            { status: 400 }
          );
        }
      }
    }

    // Check Python setup
    const setupCheck = checkPythonSetup();
    if (!setupCheck.ok) {
      return NextResponse.json(
        { error: setupCheck.error },
        { status: 501 }
      );
    }

    console.log(`[CV-ANALYZE] Processing ${normalizedFrames.length} frames...`);
    const startTime = Date.now();

    // Run Python analysis
    const results = await runPythonAnalysis(normalizedFrames);

    const elapsed = Date.now() - startTime;
    console.log(`[CV-ANALYZE] Analysis complete in ${elapsed}ms`);

    return NextResponse.json({ results });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[CV-ANALYZE] Error:', message);

    // Check for common setup issues
    if (message.includes('Python3 not found') || message.includes('opencv')) {
      return NextResponse.json(
        {
          error: message,
          setup_hint: 'Install opencv-python-headless: pip install opencv-python-headless numpy',
        },
        { status: 501 }
      );
    }

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

// Also support GET for health check
export async function GET() {
  const setupCheck = checkPythonSetup();

  if (!setupCheck.ok) {
    return NextResponse.json(
      {
        status: 'not_ready',
        error: setupCheck.error,
        setup_hint: 'Install opencv-python-headless: pip install opencv-python-headless numpy',
      },
      { status: 501 }
    );
  }

  return NextResponse.json({
    status: 'ready',
    script_path: PYTHON_SCRIPT_PATH,
  });
}
