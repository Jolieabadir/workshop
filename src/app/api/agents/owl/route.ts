import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { OWL_SYSTEM_PROMPT } from '@/agents/owl/prompt';
import { OWL_TOOLS } from '@/agents/owl/tools';
import type { OwlAnalysisResult, OwlBadge, OwlConnectionSuggestion } from '@/agents/owl/analyzer';
import type { CanvasState } from '@/core/types';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface OwlRequest {
  canvasState: CanvasState;
  recentTranscripts?: string[];
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
    const { canvasState, recentTranscripts } = body;

    // Skip analysis if canvas is empty
    const nodeCount = Object.keys(canvasState.nodes).length;
    if (nodeCount === 0) {
      return NextResponse.json({ badges: [], suggestedConnections: [] });
    }

    const canvasContext = formatCanvasStateForOwl(canvasState);

    let userMessage = canvasContext;
    if (recentTranscripts && recentTranscripts.length > 0) {
      userMessage += '\n\n---\n\n## Recent Conversation:\n';
      userMessage += recentTranscripts.map((t) => `- "${t}"`).join('\n');
    }

    userMessage += '\n\n---\n\nAnalyze this canvas for contradictions, missing connections, and completeness gaps. Be concise and only flag clear issues.';

    // Wrap API call in try-catch to gracefully handle failures
    try {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: OWL_SYSTEM_PROMPT,
        tools: OWL_TOOLS,
        tool_choice: { type: 'auto' },
        messages: [
          {
            role: 'user',
            content: userMessage,
          },
        ],
      });

      const result = parseOwlToolCalls(response.content);
      return NextResponse.json(result);
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
