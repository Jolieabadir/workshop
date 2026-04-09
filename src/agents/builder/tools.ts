// ============================================================
// Workshop — Builder Agent Tools
// ============================================================

import type { Tool } from '@anthropic-ai/sdk/resources/messages';

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
          enum: ['sphere', 'cube', 'hexagon', 'cylinder', 'torus', 'cone', 'octahedron', 'dodecahedron', 'knot', 'icosahedron'],
          description: 'The 3D shape based on semantic meaning: sphere=concepts/abstract ideas, cube=components/concrete things, hexagon=categories/groups, cylinder=processes/flows, torus=questions/unknowns, cone=decisions/direction/funneling, octahedron=constraints/boundaries/rules, dodecahedron=complex/multifaceted concepts, knot=dependencies/entanglements/problems, icosahedron=data points/metrics/measurements.',
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
    name: 'create_component',
    description: 'Create a realistic 3D electronic component on the canvas. Use this instead of create_node when building circuits or hardware systems.',
    input_schema: {
      type: 'object' as const,
      properties: {
        componentType: {
          type: 'string',
          enum: ['resistor', 'capacitor', 'ic', 'led', 'connector'],
          description: 'The type of electronic component to create.',
        },
        params: {
          type: 'object',
          description: 'Component-specific parameters. Resistor: { value: "470Ω", colorBands: ["yellow","violet","brown"] }. Capacitor: { value: "100μF", type: "electrolytic" }. IC: { pinCount: 8, label: "LM7805" }. LED: { color: "#ff0000" }. Connector: { pinCount: 8, rows: 2 }.',
        },
        title: {
          type: 'string',
          description: 'Label for the component, e.g. "100μF Filter Cap"',
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
        rotation: {
          type: 'object',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            z: { type: 'number' },
          },
          description: 'Rotation in radians. Use to orient components correctly in the circuit layout.',
        },
      },
      required: ['componentType', 'title'],
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
