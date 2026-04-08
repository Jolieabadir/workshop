import type { Tool } from '@anthropic-ai/sdk/resources/messages';

export const BUILDER_SYSTEM_PROMPT = `You are the Builder agent for a 3D spatial brainstorming tool. You receive voice transcripts and execute actions on a 3D canvas.

CRITICAL RULES:
1. ALWAYS execute canvas tool calls for what the user asks. Never just talk — take action.
2. If the user mentions ANY concept, idea, or thing, create a node for it immediately.
3. NEVER greet. NEVER say "hey", "hi", "hello", "hey there", "sure thing", or ANY conversational filler.
4. After EVERY action, call respond_verbally with a 3-8 word description of what you did.
5. Never ask clarifying questions. Interpret the user's intent and act.

Action-first examples:
- "Add a database" → create_node (cube shape, "Database" title) + respond_verbally("placed the database node")
- "Connect those" → create_connection between recent nodes + respond_verbally("connected those two")
- "What about authentication?" → create_node (torus shape) + respond_verbally("added authentication as a question")
- "Hello" → create_node with "Welcome" + respond_verbally("created a welcome node") OR do nothing silently
- "Let's brainstorm IoT sensors" → create multiple nodes + respond_verbally("added five sensor types")

respond_verbally rules — MANDATORY after every canvas action:
- ALWAYS describe the action in 3-8 words: "placed the sensor node", "connected those two", "moved it over here"
- NEVER greet or use filler: no "hey", "hi there", "sure thing", "alright", "okay"
- NEVER use respond_verbally alone without a canvas tool call
- If user greets you, either create a node OR stay silent — NEVER just greet back

Node types:
- text_card: General ideas, concepts, notes (default)
- diagram: Visual diagrams or flowcharts
- table: Tabular data
- code_block: Code snippets
- image: Image placeholders
- placeholder: Temporary placeholder nodes

Node shapes — ALWAYS specify a shape based on the idea's nature:
- cube: Components, hardware, physical things, concrete items (e.g., "MCU", "battery", "server")
- sphere: Concepts, abstract ideas, theories, principles (e.g., "efficiency", "user experience", "scalability")
- cylinder: Processes, flows, actions, pipelines (e.g., "data processing", "authentication flow", "deployment")
- hexagon: Categories, groups, classifications, containers (e.g., "frontend", "phase 1", "requirements")
- torus: Questions, unknowns, decisions to make, uncertainties (e.g., "which database?", "TBD", "needs research")

Spatial conventions:
- Positions use {x, y, z} coordinates
- Typical range: x and z from -5 to 5, y from 0 to 4
- Place related nodes near each other
- Spread unrelated nodes apart

Focus resolution:
- "this" or "that" refers to the most recently touched node (top of focus stack)
- "the [title]" refers to a node by its title
- Node IDs are provided in the canvas state

Remember: You are a BUILDER, not a chatbot. Your job is to construct the user's ideas in 3D space. Every utterance should result in canvas manipulation, not conversation.`;

export const BUILDER_TOOLS: Tool[] = [
  {
    name: 'create_node',
    description: 'Create a new node/card in the 3D canvas to represent an idea, concept, or piece of information.',
    input_schema: {
      type: 'object' as const,
      properties: {
        nodeType: {
          type: 'string',
          enum: ['text_card', 'diagram', 'table', 'code_block', 'image', 'placeholder'],
          description: 'The type of node to create. Default to text_card for most ideas.',
        },
        shape: {
          type: 'string',
          enum: ['sphere', 'cube', 'hexagon', 'cylinder', 'torus'],
          description: 'The 3D shape for the node. cube=components/hardware, sphere=concepts/abstract, cylinder=processes/flows, hexagon=categories/groups, torus=questions/unknowns.',
        },
        content: {
          type: 'string',
          description: 'The main content/body of the node.',
        },
        title: {
          type: 'string',
          description: 'Optional short title for the node.',
        },
        position: {
          type: 'object',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            z: { type: 'number' },
          },
          description: 'Optional 3D position. If omitted, placed near camera with random offset.',
        },
      },
      required: ['nodeType', 'shape', 'content'],
    },
  },
  {
    name: 'create_connection',
    description: 'Create a connection/edge between two existing nodes to show a relationship.',
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
        label: {
          type: 'string',
          description: 'Optional label describing the relationship.',
        },
      },
      required: ['fromId', 'toId'],
    },
  },
  {
    name: 'group_nodes',
    description: 'Group multiple nodes together under a label to show they belong to a category or cluster.',
    input_schema: {
      type: 'object' as const,
      properties: {
        nodeIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of node IDs to group together.',
        },
        label: {
          type: 'string',
          description: 'Label for the group.',
        },
      },
      required: ['nodeIds', 'label'],
    },
  },
  {
    name: 'move_node',
    description: 'Move a node to a new position in 3D space.',
    input_schema: {
      type: 'object' as const,
      properties: {
        nodeId: {
          type: 'string',
          description: 'The ID of the node to move.',
        },
        position: {
          type: 'object',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            z: { type: 'number' },
          },
          required: ['x', 'y', 'z'],
          description: 'The new 3D position.',
        },
      },
      required: ['nodeId', 'position'],
    },
  },
  {
    name: 'update_node',
    description: 'Update properties of an existing node (content, title, color, etc.).',
    input_schema: {
      type: 'object' as const,
      properties: {
        nodeId: {
          type: 'string',
          description: 'The ID of the node to update.',
        },
        changes: {
          type: 'object',
          properties: {
            content: { type: 'string' },
            title: { type: 'string' },
            color: { type: 'string' },
          },
          description: 'Object containing the properties to update.',
        },
      },
      required: ['nodeId', 'changes'],
    },
  },
  {
    name: 'delete_node',
    description: 'Delete a node from the canvas. Also removes any connections to/from it.',
    input_schema: {
      type: 'object' as const,
      properties: {
        nodeId: {
          type: 'string',
          description: 'The ID of the node to delete.',
        },
      },
      required: ['nodeId'],
    },
  },
  {
    name: 'respond_verbally',
    description: 'Describe what you just did in 3-8 words via TTS. MUST be called after every canvas action. NEVER greet or use filler words.',
    input_schema: {
      type: 'object' as const,
      properties: {
        message: {
          type: 'string',
          description: 'A 3-8 word description of the action taken. Examples: "placed the database node", "connected those two", "moved it over here". NEVER greet.',
        },
      },
      required: ['message'],
    },
  },
];
