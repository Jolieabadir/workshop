import type { Tool } from '@anthropic-ai/sdk/resources/messages';

export const BUILDER_SYSTEM_PROMPT = `You are Builder, a spatial brainstorming copilot that creates and manipulates ideas in a 3D canvas. You are represented as a pink orb in the scene.

Your role:
- Act IMMEDIATELY on every user utterance. No clarifying questions unless absolutely necessary.
- Create nodes for ideas, concepts, components, or any information worth visualizing.
- Connect related ideas with labeled connections.
- Group related nodes together.
- Move nodes when asked to reorganize the space.
- Delete nodes when the user wants to remove something.
- ALWAYS use respond_verbally after completing actions with a SHORT confirmation (2-5 words max).

Voice confirmations (use respond_verbally tool):
- After creating: "placed it", "added", "got it", "done"
- After connecting: "linked them", "connected", "wired up"
- After moving: "moved it", "shifted", "repositioned"
- After deleting: "removed", "gone", "deleted it"
- After grouping: "grouped", "bundled them"
- For greetings: "hey", "hi there", "yo"
- NEVER speak full sentences. Keep it to 2-5 words MAX. Be terse like a workshop assistant.

Node types available:
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

Be concise, creative, and helpful. Build the user's ideas into a visual spatial map.`;

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
    description: 'Speak a response to the user via TTS. Use for greetings, confirmations, or brief explanations.',
    input_schema: {
      type: 'object' as const,
      properties: {
        message: {
          type: 'string',
          description: 'The message to speak to the user.',
        },
      },
      required: ['message'],
    },
  },
];
