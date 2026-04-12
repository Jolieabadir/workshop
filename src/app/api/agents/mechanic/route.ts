// ============================================================
// Workshop — Mechanic Agent API Route
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { MECHANIC_SYSTEM_PROMPT } from '@/agents/mechanic/prompt';
import { MECHANIC_TOOLS } from '@/agents/mechanic/tools';
import { parseToolCallToAction } from '@/agents/builder/action-parser';
import { AGENT_MODELS, AGENT_MAX_TOKENS } from '@/core/config/agent-models';
import type { BuilderAction, CanvasState } from '@/core/types';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface CVMetrics {
  gap_px?: number;
  orientation_error_deg?: number;
  scale_ratio?: number;
  [key: string]: unknown;
}

interface MechanicRequest {
  owlEvaluation: string;
  cvMetrics: CVMetrics;
  canvasState: CanvasState;
  frames: string[]; // base64 PNG images of the rendered scene
}

function formatCanvasStateForMechanic(state: CanvasState): string {
  const nodes = Object.values(state.nodes);
  const connections = Object.values(state.connections);
  const groups = Object.values(state.groups);

  let output = '## Current Canvas State\n\n';

  if (nodes.length === 0) {
    output += 'The canvas is empty.\n';
    return output;
  }

  output += '### Nodes:\n';
  for (const node of nodes) {
    output += `- ID: "${node.id}"\n`;
    output += `  Title: "${node.title || '(none)'}"\n`;
    output += `  Type: ${node.type} | Shape: ${node.shape || 'sphere'}\n`;
    output += `  Position: (${node.position.x.toFixed(2)}, ${node.position.y.toFixed(2)}, ${node.position.z.toFixed(2)})\n`;
    if (node.scale) {
      output += `  Scale: (${node.scale.x.toFixed(2)}, ${node.scale.y.toFixed(2)}, ${node.scale.z.toFixed(2)})\n`;
    }
    if (node.meshUrl) {
      output += `  Mesh: loaded (${node.meshUrl.slice(0, 50)}...)\n`;
    }
    if (node.meshLoading) {
      output += `  Mesh: loading...\n`;
    }
    if (node.component) {
      output += `  Component: ${node.component.componentType}\n`;
    }
    if (node.virtualPorts && node.virtualPorts.length > 0) {
      output += `  Virtual ports: ${node.virtualPorts.map(p => p.id).join(', ')}\n`;
    }
    output += '\n';
  }

  if (connections.length > 0) {
    output += '### Connections:\n';
    for (const conn of connections) {
      const fromNode = state.nodes[conn.fromId];
      const toNode = state.nodes[conn.toId];
      const fromLabel = fromNode?.title || conn.fromId;
      const toLabel = toNode?.title || conn.toId;
      let portInfo = '';
      if (conn.fromPort || conn.toPort) {
        portInfo = ` [${conn.fromPort || '*'} -> ${conn.toPort || '*'}]`;
      }
      output += `- "${fromLabel}" -> "${toLabel}"${portInfo}\n`;
    }
  }

  if (groups.length > 0) {
    output += '\n### Groups:\n';
    for (const group of groups) {
      output += `- "${group.label}": [${group.nodeIds.join(', ')}]\n`;
    }
  }

  return output;
}

function formatCVMetrics(metrics: CVMetrics): string {
  const lines: string[] = ['## OpenCV Analysis Metrics'];

  if (metrics.gap_px !== undefined) {
    lines.push(`- Gap: ${metrics.gap_px}px (≈${(metrics.gap_px * 0.01).toFixed(2)} world units)`);
  }
  if (metrics.orientation_error_deg !== undefined) {
    lines.push(`- Orientation error: ${metrics.orientation_error_deg}°`);
  }
  if (metrics.scale_ratio !== undefined) {
    lines.push(`- Scale ratio: ${metrics.scale_ratio.toFixed(2)}`);
  }

  // Include any other metrics
  for (const [key, value] of Object.entries(metrics)) {
    if (!['gap_px', 'orientation_error_deg', 'scale_ratio'].includes(key)) {
      lines.push(`- ${key}: ${JSON.stringify(value)}`);
    }
  }

  return lines.join('\n');
}

export async function POST(request: NextRequest) {
  try {
    const body: MechanicRequest = await request.json();
    const { owlEvaluation, cvMetrics, canvasState, frames } = body;

    // Skip if no evaluation to process
    if (!owlEvaluation || owlEvaluation.trim() === '') {
      return NextResponse.json({ actions: [] });
    }

    // Format canvas state for the mechanic
    const canvasContext = formatCanvasStateForMechanic(canvasState);
    const metricsContext = formatCVMetrics(cvMetrics || {});

    // Build user message with all context
    let userMessage = `${canvasContext}\n\n${metricsContext}\n\n`;
    userMessage += `## Owl's Visual Evaluation\n${owlEvaluation}\n\n`;
    userMessage += `---\n\nBased on the Owl's evaluation and CV metrics above, apply the necessary spatial corrections to fix the assembly issues.`;

    // Build image content blocks from frames
    const imageBlocks: Anthropic.ImageBlockParam[] = frames
      .filter((frame) => frame && frame.length > 0)
      .map((frame) => ({
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: 'image/png' as const,
          data: frame.replace(/^data:image\/png;base64,/, ''),
        },
      }));

    // Combine text and images into user content
    const userContent: Anthropic.ContentBlockParam[] = [
      ...imageBlocks,
      { type: 'text' as const, text: userMessage },
    ];

    // Multi-round tool calling loop
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: userContent },
    ];

    const allActions: BuilderAction[] = [];
    let continueLoop = true;
    let iterations = 0;
    const MAX_ITERATIONS = 5;
    const MAX_RETRIES = 2;

    while (continueLoop && iterations < MAX_ITERATIONS) {
      iterations++;

      let response: Anthropic.Message | undefined;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          response = await anthropic.messages.create({
            model: AGENT_MODELS.mechanic,
            max_tokens: AGENT_MAX_TOKENS.mechanic,
            system: MECHANIC_SYSTEM_PROMPT,
            tools: MECHANIC_TOOLS,
            tool_choice: { type: 'auto' },
            messages,
          });
          break;
        } catch (err: unknown) {
          const isOverloaded =
            err instanceof Error &&
            (err.message.includes('529') || err.message.includes('Overloaded'));
          if (isOverloaded && attempt < MAX_RETRIES) {
            console.warn(`[MECHANIC API] Overloaded, retrying in ${(attempt + 1) * 2}s...`);
            await new Promise((r) => setTimeout(r, (attempt + 1) * 2000));
            continue;
          }
          throw err;
        }
      }
      if (!response) throw new Error('Failed after retries');

      console.log(
        `[MECHANIC API] Round ${iterations} - blocks: ${response.content.length}, stop_reason: ${response.stop_reason}`
      );

      // Collect tool calls from this round
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
      );

      for (const block of response.content) {
        if (block.type === 'tool_use') {
          console.log('[MECHANIC API] Tool call:', block.name, JSON.stringify(block.input));
          const action = parseToolCallToAction(block.name, block.input as Record<string, unknown>);
          if (action) {
            allActions.push(action);
          }
        }
      }

      // Continue if Claude wants more tool calls
      if (response.stop_reason === 'tool_use' && toolUseBlocks.length > 0) {
        messages.push({ role: 'assistant', content: response.content });

        const toolResults: Anthropic.ToolResultBlockParam[] = toolUseBlocks.map((block) => ({
          type: 'tool_result' as const,
          tool_use_id: block.id,
          content: 'OK — correction applied successfully',
        }));

        messages.push({ role: 'user', content: toolResults });
      } else {
        continueLoop = false;
      }
    }

    console.log(`[MECHANIC API] Completed in ${iterations} rounds, total actions: ${allActions.length}`);
    return NextResponse.json({ actions: allActions });
  } catch (error) {
    console.error('Mechanic agent error:', error);

    const errorMessage = error instanceof Error ? error.message : String(error);
    const isBillingError =
      errorMessage.includes('credit balance') || errorMessage.includes('billing');
    const isAuthError =
      errorMessage.includes('401') || errorMessage.includes('authentication');

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
      { error: 'Mechanic correction failed', details: errorMessage },
      { status: 500 }
    );
  }
}
