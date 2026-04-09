// ============================================================
// Workshop — Owl Agent Tools
// ============================================================

import type { Tool } from '@anthropic-ai/sdk/resources/messages';

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
