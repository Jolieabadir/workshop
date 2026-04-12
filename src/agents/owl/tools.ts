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
  // Visual evaluation tools for the Owl ↔ Mechanic feedback loop
  {
    name: 'evaluate_part',
    description: 'Assess a specific part in the assembly. Use for orientation, scale, or style issues.',
    input_schema: {
      type: 'object' as const,
      properties: {
        nodeId: {
          type: 'string',
          description: 'ID of the node being evaluated',
        },
        partName: {
          type: 'string',
          description: 'Human-readable name of the part',
        },
        issue: {
          type: 'string',
          enum: ['orientation', 'scale', 'style', 'position', 'missing_connection', 'none'],
          description: 'Type of issue detected',
        },
        severity: {
          type: 'string',
          enum: ['critical', 'minor', 'none'],
          description: 'How bad the issue is',
        },
        details: {
          type: 'string',
          description: 'Specific description: "rotated 87° on Z axis", "2x too large", etc.',
        },
        suggestedFix: {
          type: 'string',
          description: 'What the Mechanic should do: "rotate -87° on Z", "scale to 0.5x", etc.',
        },
      },
      required: ['nodeId', 'partName', 'issue', 'severity', 'details'],
    },
  },
  {
    name: 'evaluate_assembly',
    description: 'Overall assessment of the assembly. Call this LAST after evaluating individual parts.',
    input_schema: {
      type: 'object' as const,
      properties: {
        verdict: {
          type: 'string',
          enum: ['APPROVED', 'NOT_APPROVED'],
          description: 'Whether the assembly passes visual inspection',
        },
        coherenceScore: {
          type: 'number',
          description: 'Visual coherence from 0 to 1. Above 0.7 is acceptable.',
        },
        summary: {
          type: 'string',
          description: 'Brief summary of issues found or confirmation that assembly looks good',
        },
        issueCount: {
          type: 'number',
          description: 'Number of issues flagged via evaluate_part',
        },
      },
      required: ['verdict', 'summary', 'issueCount'],
    },
  },
];
