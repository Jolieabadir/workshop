import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { OWL_SYSTEM_PROMPT } from '@/agents/owl/prompt';
import { OWL_TOOLS } from '@/agents/owl/tools';
import type { OwlAnalysisResult, OwlBadge, OwlConnectionSuggestion } from '@/agents/owl/analyzer';
import type { CanvasState } from '@/core/types';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/** OpenCV analysis metrics for visual evaluation */
interface CVMetrics {
  parts?: Array<{
    nodeId: string;
    boundingBox: { x: number; y: number; width: number; height: number };
    areaRatio?: number;
    orientationDeg?: number;
  }>;
  gaps?: Array<{
    fromId: string;
    toId: string;
    gapPixels: number;
  }>;
  overallCoherence?: number;
}

interface OwlRequest {
  canvasState: CanvasState;
  recentTranscripts?: string[];
  /** Optional: base64 PNG images from multiple camera angles */
  frames?: string[];
  /** Optional: OpenCV analysis results */
  cvMetrics?: CVMetrics;
  /** Optional: Exact 3D geometry measurements from Three.js scene */
  geometryContext?: string;
}

function formatCanvasStateForOwl(state: CanvasState): string {
  const nodes = Object.values(state.nodes);
  const connections = Object.values(state.connections);
  const groups = Object.values(state.groups);

  let output = '## Canvas State for Analysis\n\n';

  if (nodes.length === 0) {
    output += 'The canvas is empty. Nothing to analyze.\n';
    return output;
  }

  output += '### Nodes:\n';
  for (const node of nodes) {
    output += `- ID: "${node.id}"\n`;
    output += `  Type: ${node.type} | Shape: ${node.shape || 'sphere'}\n`;
    output += `  Title: "${node.title || '(none)'}"\n`;
    output += `  Content: "${node.content}"\n`;
    if (node.badges && node.badges.length > 0) {
      output += `  Existing badges: ${node.badges.map((b) => `[${b.type}] ${b.message}`).join(', ')}\n`;
    }
    output += '\n';
  }

  if (connections.length > 0) {
    output += '### Connections:\n';
    for (const conn of connections) {
      const fromNode = state.nodes[conn.fromId];
      const toNode = state.nodes[conn.toId];
      const fromLabel = fromNode?.title || fromNode?.content.slice(0, 20) || conn.fromId;
      const toLabel = toNode?.title || toNode?.content.slice(0, 20) || conn.toId;
      output += `- "${fromLabel}" -> "${toLabel}"${conn.label ? ` [${conn.label}]` : ''}\n`;
      output += `  (IDs: ${conn.fromId} -> ${conn.toId})\n`;
    }
  } else {
    output += '\n### Connections:\nNo connections exist yet.\n';
  }

  if (groups.length > 0) {
    output += '\n### Groups:\n';
    for (const group of groups) {
      output += `- "${group.label}": [${group.nodeIds.join(', ')}]\n`;
    }
  }

  return output;
}

function parseOwlToolCalls(content: Anthropic.ContentBlock[]): OwlAnalysisResult {
  const badges: OwlBadge[] = [];
  const suggestedConnections: OwlConnectionSuggestion[] = [];

  for (const block of content) {
    if (block.type === 'tool_use') {
      const input = block.input as Record<string, unknown>;

      switch (block.name) {
        case 'add_badge':
          badges.push({
            nodeId: input.nodeId as string,
            badgeType: input.badgeType as 'warning' | 'info',
            message: input.message as string,
          });
          break;

        case 'suggest_connection':
          suggestedConnections.push({
            fromId: input.fromId as string,
            toId: input.toId as string,
            reason: input.reason as string,
          });
          break;

        case 'no_issues_found':
          // Explicit signal that Owl found nothing wrong
          break;
      }
    }
  }

  return { badges, suggestedConnections };
}

export async function POST(request: NextRequest) {
  try {
    const body: OwlRequest = await request.json();
    const { canvasState, recentTranscripts, frames, cvMetrics, geometryContext } = body;

    // Skip analysis if canvas is empty
    const nodeCount = Object.keys(canvasState.nodes).length;
    if (nodeCount === 0) {
      return NextResponse.json({ badges: [], suggestedConnections: [] });
    }

    const canvasContext = formatCanvasStateForOwl(canvasState);

    // Build text content
    let textContent = canvasContext;
    if (recentTranscripts && recentTranscripts.length > 0) {
      textContent += '\n\n---\n\n## Recent Conversation:\n';
      textContent += recentTranscripts.map((t) => `- "${t}"`).join('\n');
    }

    // Add CV metrics if provided
    if (cvMetrics) {
      textContent += '\n\n---\n\n## OpenCV Analysis:\n';
      textContent += JSON.stringify(cvMetrics, null, 2);
    }

    // Add exact 3D geometry measurements if provided
    if (geometryContext) {
      textContent += '\n\n---\n\n' + geometryContext;
    }

    // Different prompts for visual vs text-only mode
    if (frames && frames.length > 0) {
      textContent += '\n\n---\n\nYou have been provided rendered images of the 3D scene. Evaluate each part\'s orientation, scale, position, and style coherence. Use evaluate_part for each part, then evaluate_assembly with your final verdict.';
    } else {
      textContent += '\n\n---\n\nAnalyze this canvas for contradictions, missing connections, and completeness gaps. Be concise and only flag clear issues.';
    }

    // Build user message content - images first, then text
    const userContent: Array<
      | { type: 'image'; source: { type: 'base64'; media_type: 'image/png'; data: string } }
      | { type: 'text'; text: string }
    > = [];

    // Add image blocks if frames are provided
    if (frames && frames.length > 0) {
      for (const frame of frames) {
        // Strip data URL prefix if present
        const base64Data = frame.replace(/^data:image\/png;base64,/, '');
        userContent.push({
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: 'image/png' as const,
            data: base64Data,
          },
        });
      }
    }

    // Add text content
    userContent.push({
      type: 'text' as const,
      text: textContent,
    });

    // Wrap API call in try-catch to gracefully handle failures
    try {
      // Use Sonnet for visual evaluation (better at image analysis), Haiku for text-only
      const model = frames && frames.length > 0
        ? 'claude-sonnet-4-20250514'
        : 'claude-haiku-4-5-20251001';

      const response = await anthropic.messages.create({
        model,
        max_tokens: frames && frames.length > 0 ? 1024 : 512,
        system: OWL_SYSTEM_PROMPT,
        tools: OWL_TOOLS,
        tool_choice: { type: 'auto' },
        messages: [
          {
            role: 'user',
            content: userContent,
          },
        ],
      });

      const result = parseOwlToolCalls(response.content);

      // For visual evaluation, also extract part evaluations and assembly verdict
      const partEvaluations: Array<{
        nodeId: string;
        partName: string;
        issue: string;
        severity: string;
        details: string;
        suggestedFix?: string;
      }> = [];
      let assemblyVerdict: {
        verdict: 'APPROVED' | 'NOT_APPROVED';
        coherenceScore?: number;
        summary: string;
        issueCount: number;
      } | null = null;

      for (const block of response.content) {
        if (block.type === 'tool_use') {
          const input = block.input as Record<string, unknown>;
          if (block.name === 'evaluate_part') {
            partEvaluations.push({
              nodeId: input.nodeId as string,
              partName: input.partName as string,
              issue: input.issue as string,
              severity: input.severity as string,
              details: input.details as string,
              suggestedFix: input.suggestedFix as string | undefined,
            });
          } else if (block.name === 'evaluate_assembly') {
            assemblyVerdict = {
              verdict: input.verdict as 'APPROVED' | 'NOT_APPROVED',
              coherenceScore: input.coherenceScore as number | undefined,
              summary: input.summary as string,
              issueCount: input.issueCount as number,
            };
          }
        }
      }

      return NextResponse.json({
        ...result,
        partEvaluations,
        assemblyVerdict,
      });
    } catch (apiError) {
      console.error('Owl API call failed:', apiError);
      // Return empty result instead of crashing
      return NextResponse.json({ badges: [], suggestedConnections: [] });
    }
  } catch (error) {
    console.error('Owl agent error:', error);

    const errorMessage = error instanceof Error ? error.message : String(error);
    const isBillingError = errorMessage.includes('credit balance') || errorMessage.includes('billing');
    const isAuthError = errorMessage.includes('401') || errorMessage.includes('authentication');

    if (isBillingError) {
      return NextResponse.json(
        { error: 'API billing issue', details: 'Anthropic API credits exhausted.' },
        { status: 402 }
      );
    }

    if (isAuthError) {
      return NextResponse.json(
        { error: 'API authentication failed', details: 'Check ANTHROPIC_API_KEY in .env.local' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'Owl analysis failed', details: errorMessage },
      { status: 500 }
    );
  }
}
