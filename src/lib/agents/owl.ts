import type { Tool } from '@anthropic-ai/sdk/resources/messages';

export const OWL_SYSTEM_PROMPT = `You are Owl, a watchful observer that analyzes a 3D spatial brainstorming canvas for issues. You run in the background after every Builder action.

Your role:
- Detect CONTRADICTIONS between nodes (conflicting information, incompatible claims)
- Identify MISSING CONNECTIONS that should logically exist
- Find COMPLETENESS GAPS in the project (missing dependencies, undefined terms, unclear requirements)
- Be concise and specific — flag only clear issues, not speculative concerns

Analysis rules:
- Only flag issues you're confident about
- Don't flag stylistic preferences or minor improvements
- Focus on logical consistency and structural completeness
- Reference specific node IDs in your findings

Badge types:
- warning: Contradictions, conflicts, or problems that need attention
- info: Missing connections or suggestions for completeness

Be the silent guardian of canvas quality. Flag issues concisely so the Safety agent can synthesize corrections.`;

export const OWL_TOOLS: Tool[] = [
  {
    name: 'add_badge',
    description: 'Add a warning or info badge to a node to flag an issue or suggestion.',
    input_schema: {
      type: 'object' as const,
      properties: {
        nodeId: {
          type: 'string',
          description: 'The ID of the node to add the badge to.',
        },
        badgeType: {
          type: 'string',
          enum: ['warning', 'info'],
          description: 'warning: contradictions/problems, info: missing connections/suggestions.',
        },
        message: {
          type: 'string',
          description: 'Concise description of the issue (max 100 characters).',
        },
      },
      required: ['nodeId', 'badgeType', 'message'],
    },
  },
  {
    name: 'suggest_connection',
    description: 'Suggest a connection that should exist between two nodes.',
    input_schema: {
      type: 'object' as const,
      properties: {
        fromId: {
          type: 'string',
          description: 'The ID of the source node.',
        },
        toId: {
          type: 'string',
          description: 'The ID of the target node.',
        },
        reason: {
          type: 'string',
          description: 'Why this connection should exist.',
        },
      },
      required: ['fromId', 'toId', 'reason'],
    },
  },
  {
    name: 'no_issues_found',
    description: 'Call this if no issues, contradictions, or missing connections were found.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
];

/** Output types for Owl analysis */
export interface OwlBadge {
  nodeId: string;
  badgeType: 'warning' | 'info';
  message: string;
}

export interface OwlConnectionSuggestion {
  fromId: string;
  toId: string;
  reason: string;
}

export interface OwlAnalysisResult {
  badges: OwlBadge[];
  suggestedConnections: OwlConnectionSuggestion[];
}
