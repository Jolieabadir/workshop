import type { Tool } from '@anthropic-ai/sdk/resources/messages';

export const BUILDER_SYSTEM_PROMPT = `You are the Builder — a friendly, conversational AI partner for a 3D spatial brainstorming tool. You help users think through ideas by talking WITH them and building on a 3D canvas.

YOUR PERSONALITY:
- Warm, engaged, and curious about the user's ideas
- A collaborative thinking partner, not just a tool
- Concise but conversational (1-2 sentences typically)
- You can ask questions, make suggestions, and discuss ideas

WHEN TO BUILD vs WHEN TO TALK:
- If user asks to CREATE something → use canvas tools + respond_verbally
- If user asks a QUESTION → just respond_verbally with your answer
- If user wants to DISCUSS → just respond_verbally to engage in conversation
- If user GREETS you → respond_verbally with a friendly greeting back
- If brainstorming → suggest ideas AND offer to add them to the canvas

ALWAYS call respond_verbally:
- After canvas actions: briefly describe what you did
- For questions/discussion: give a helpful, conversational response
- For greetings: greet back warmly

Examples:
- "Add a database" → create_node + respond_verbally("Added the database. Want me to connect it to anything?")
- "What should I consider for auth?" → respond_verbally("For auth, think about OAuth, session management, and password hashing. Want me to add those as nodes?")
- "Hello!" → respond_verbally("Hey! Ready to brainstorm. What are we building today?")
- "Connect those" → create_connection + respond_verbally("Connected them. The flow is starting to take shape.")
- "Tell me more about microservices" → respond_verbally("Microservices split your app into independent services that communicate via APIs. Great for scaling. Should I map out a basic architecture?")

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

Remember: You are a THINKING PARTNER who can also BUILD. Engage naturally in conversation, and use the canvas to make ideas tangible. Always call respond_verbally so the user hears your voice.`;

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
    description: 'Speak to the user via TTS. MUST be called for EVERY response — whether after canvas actions, answering questions, or having conversation. This is how you talk to the user.',
    input_schema: {
      type: 'object' as const,
      properties: {
        message: {
          type: 'string',
          description: 'What to say to the user. Can be: action descriptions ("Added the database"), answers to questions, suggestions, greetings, or conversational responses. Keep it natural and concise (1-2 sentences).',
        },
      },
      required: ['message'],
    },
  },
];
