// ============================================================
// Workshop — Agent Model Configuration
// ============================================================

// Claude models used by each agent
export const AGENT_MODELS = {
  // User-facing agents (need high quality)
  builder: 'claude-sonnet-4-20250514',
  cat: 'claude-sonnet-4-20250514',
  safety: 'claude-sonnet-4-20250514',
  mechanic: 'claude-opus-4-20250514', // Spatial correction specialist - needs strong spatial reasoning

  // Background agents (speed-optimized)
  owl: 'claude-haiku-4-20250514',
  manager: 'claude-haiku-4-20250514',
} as const;

// Token limits per agent
export const AGENT_MAX_TOKENS = {
  builder: 4096,  // Higher limit to allow multiple tool calls for compound structures
  mechanic: 4096, // Needs room for multiple spatial corrections
  owl: 512,
  cat: 1024,
  safety: 512,
  manager: 256,
} as const;

// Agent descriptions (for logging/debugging)
export const AGENT_DESCRIPTIONS = {
  builder: 'Primary canvas agent - creates, modifies, connects nodes',
  mechanic: 'Spatial correction specialist - fixes orientation, scale, gaps in assemblies',
  owl: 'Background watcher - detects contradictions and gaps',
  cat: 'Research agent - validates claims and finds information',
  safety: 'Supervisor - logs actions and synthesizes corrections',
  manager: 'Orchestrator - queues corrections during natural pauses',
} as const;

export type AgentName = keyof typeof AGENT_MODELS;
