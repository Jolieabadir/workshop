// ============================================================
// Workshop — Owl Analysis Types
// ============================================================

/** A badge to add to a node */
export interface OwlBadge {
  nodeId: string;
  badgeType: 'warning' | 'info';
  message: string;
}

/** A suggested connection between nodes */
export interface OwlConnectionSuggestion {
  fromId: string;
  toId: string;
  reason: string;
}

/** Complete result from Owl analysis */
export interface OwlAnalysisResult {
  badges: OwlBadge[];
  suggestedConnections: OwlConnectionSuggestion[];
}

/** Parse Owl tool calls into an analysis result */
export function parseOwlToolCalls(
  toolCalls: Array<{ name: string; input: Record<string, unknown> }>
): OwlAnalysisResult {
  const result: OwlAnalysisResult = {
    badges: [],
    suggestedConnections: [],
  };

  for (const call of toolCalls) {
    switch (call.name) {
      case 'add_badge':
        result.badges.push({
          nodeId: call.input.nodeId as string,
          badgeType: call.input.badgeType as 'warning' | 'info',
          message: call.input.message as string,
        });
        break;

      case 'suggest_connection':
        result.suggestedConnections.push({
          fromId: call.input.fromId as string,
          toId: call.input.toId as string,
          reason: call.input.reason as string,
        });
        break;

      case 'no_issues_found':
        // No action needed
        break;
    }
  }

  return result;
}
