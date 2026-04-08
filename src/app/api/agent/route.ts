import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { BUILDER_SYSTEM_PROMPT, BUILDER_TOOLS } from '@/lib/builder-prompt';
import type { BuilderAction, CanvasState, NodeType, Vec3 } from '@/types/canvas';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface AgentRequest {
  transcript: string;
  canvasState: CanvasState;
}

function formatCanvasStateForLLM(state: CanvasState): string {
  const nodes = Object.values(state.nodes);
  const connections = Object.values(state.connections);
  const groups = Object.values(state.groups);

  let output = '## Current Canvas State\n\n';

  if (nodes.length === 0) {
    output += 'The canvas is empty.\n';
  } else {
    output += '### Nodes:\n';
    for (const node of nodes) {
      output += `- ID: "${node.id}" | Type: ${node.type} | Title: "${node.title || '(none)'}" | Content: "${node.content.slice(0, 100)}"\n`;
      output += `  Position: (${node.position.x.toFixed(1)}, ${node.position.y.toFixed(1)}, ${node.position.z.toFixed(1)})\n`;
    }
  }

  if (connections.length > 0) {
    output += '\n### Connections:\n';
    for (const conn of connections) {
      output += `- "${conn.fromId}" -> "${conn.toId}"${conn.label ? ` [${conn.label}]` : ''}\n`;
    }
  }

  if (groups.length > 0) {
    output += '\n### Groups:\n';
    for (const group of groups) {
      output += `- "${group.label}": [${group.nodeIds.join(', ')}]\n`;
    }
  }

  if (state.focusStack.length > 0) {
    output += `\n### Focus Stack (most recent first):\n`;
    output += state.focusStack.slice(0, 5).map((id) => `"${id}"`).join(', ') + '\n';
    output += `(Use the first ID when user says "this" or "that")\n`;
  }

  return output;
}

function parseToolCallToAction(toolName: string, toolInput: Record<string, unknown>): BuilderAction | null {
  switch (toolName) {
    case 'create_node':
      return {
        type: 'create_node',
        nodeType: (toolInput.nodeType as NodeType) || 'text_card',
        content: toolInput.content as string,
        title: toolInput.title as string | undefined,
        position: toolInput.position as Vec3 | undefined,
      };

    case 'create_connection':
      return {
        type: 'create_connection',
        fromId: toolInput.fromId as string,
        toId: toolInput.toId as string,
        label: toolInput.label as string | undefined,
      };

    case 'group_nodes':
      return {
        type: 'group_nodes',
        nodeIds: toolInput.nodeIds as string[],
        label: toolInput.label as string,
      };

    case 'move_node':
      return {
        type: 'move_node',
        nodeId: toolInput.nodeId as string,
        position: toolInput.position as Vec3,
      };

    case 'update_node':
      return {
        type: 'update_node',
        nodeId: toolInput.nodeId as string,
        changes: toolInput.changes as Partial<{ content: string; title: string; color: string }>,
      };

    case 'delete_node':
      return {
        type: 'delete_node',
        nodeId: toolInput.nodeId as string,
      };

    case 'respond_verbally':
      return {
        type: 'respond_verbally',
        message: toolInput.message as string,
      };

    default:
      console.warn(`Unknown tool: ${toolName}`);
      return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: AgentRequest = await request.json();
    const { transcript, canvasState } = body;

    if (!transcript || transcript.trim() === '') {
      return NextResponse.json({ actions: [] });
    }

    const canvasContext = formatCanvasStateForLLM(canvasState);

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: BUILDER_SYSTEM_PROMPT,
      tools: BUILDER_TOOLS,
      tool_choice: { type: 'auto' },
      messages: [
        {
          role: 'user',
          content: `${canvasContext}\n\n---\n\nUser says: "${transcript}"`,
        },
      ],
    });

    const actions: BuilderAction[] = [];

    for (const block of response.content) {
      if (block.type === 'tool_use') {
        const action = parseToolCallToAction(block.name, block.input as Record<string, unknown>);
        if (action) {
          actions.push(action);
        }
      }
    }

    return NextResponse.json({ actions });
  } catch (error) {
    console.error('Builder agent error:', error);

    // Extract useful error info for client
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isBillingError = errorMessage.includes('credit balance') || errorMessage.includes('billing');
    const isAuthError = errorMessage.includes('401') || errorMessage.includes('authentication');

    if (isBillingError) {
      return NextResponse.json(
        { error: 'API billing issue', details: 'Anthropic API credits exhausted. Please add credits.' },
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
      { error: 'Failed to process request', details: errorMessage },
      { status: 500 }
    );
  }
}
