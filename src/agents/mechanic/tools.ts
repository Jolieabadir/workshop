// ============================================================
// Workshop — Mechanic Agent Tools
// ============================================================

import type { Tool } from '@anthropic-ai/sdk/resources/messages';

export const MECHANIC_TOOLS: Tool[] = [
  {
    name: 'rotate_node',
    description: 'Rotate a node in 3D space. Use this to fix mesh orientation (e.g. a nose cone generated sideways). Rotation is in degrees on each axis.',
    input_schema: {
      type: 'object' as const,
      properties: {
        nodeId: {
          type: 'string',
          description: 'ID of the node to rotate',
        },
        rotation: {
          type: 'object',
          properties: {
            x: { type: 'number', description: 'Rotation in degrees around X axis' },
            y: { type: 'number', description: 'Rotation in degrees around Y axis' },
            z: { type: 'number', description: 'Rotation in degrees around Z axis' },
          },
          description: 'Rotation in degrees on each axis. Only specify axes that need rotation.',
        },
      },
      required: ['nodeId', 'rotation'],
    },
  },
  {
    name: 'scale_node',
    description: 'Scale a node uniformly. Use to resize parts that are too large or too small relative to other parts in an assembly.',
    input_schema: {
      type: 'object' as const,
      properties: {
        nodeId: {
          type: 'string',
          description: 'ID of the node to scale',
        },
        scale: {
          type: 'number',
          description: 'Uniform scale factor. 1.0 = original size, 0.5 = half size, 2.0 = double size.',
        },
      },
      required: ['nodeId', 'scale'],
    },
  },
  {
    name: 'move_node',
    description: 'Move a node to a new position in 3D space. Use to close gaps or fix alignment between parts.',
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
    name: 'create_connection',
    description: 'Create a connection/edge between two existing nodes. For components with ports, use fromPort/toPort to connect at specific connector points.',
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
        fromPort: {
          type: 'string',
          description: 'Optional connector point ID on the source component.',
        },
        toPort: {
          type: 'string',
          description: 'Optional connector point ID on the target component.',
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
    name: 'delete_node',
    description: 'Delete a node from the canvas. Use to remove broken or unusable parts before regenerating. Also removes any connections to/from it.',
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
    name: 'generate_mesh',
    description: 'Regenerate a 3D model using AI (Tripo API). Use this to replace a part that has style inconsistencies or is broken. Include style hints in the prompt to match existing parts.',
    input_schema: {
      type: 'object' as const,
      properties: {
        prompt: {
          type: 'string',
          description: 'SHORT description of the 3D model (under 20 words). Include style hints to match other parts, e.g. "realistic red rocket fin matching low-poly style"',
        },
        title: {
          type: 'string',
          description: 'Display name for the model in the scene',
        },
        position: {
          type: 'object',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            z: { type: 'number' },
          },
          description: '3D position. Place near the part being replaced.',
        },
        style: {
          type: 'string',
          enum: ['realistic', 'cartoon'],
          description: 'Art style for the generated model. Match the style of other parts in the assembly.',
        },
        virtualPorts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Port identifier (e.g. "top", "bottom", "engine_mount")' },
              position: {
                type: 'object',
                properties: {
                  x: { type: 'number' },
                  y: { type: 'number' },
                  z: { type: 'number' },
                },
                description: 'Position offset from node center in world units',
              },
              direction: {
                type: 'object',
                properties: {
                  x: { type: 'number' },
                  y: { type: 'number' },
                  z: { type: 'number' },
                },
                description: 'Direction vector the port faces (normalized)',
              },
            },
            required: ['id', 'position', 'direction'],
          },
          description: 'Optional virtual connector points for mesh connections. Positions are in world units relative to node center.',
        },
      },
      required: ['prompt', 'title'],
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
    name: 'respond_verbally',
    description: 'Tell the user what corrections you are making. Always call this to explain your fixes.',
    input_schema: {
      type: 'object' as const,
      properties: {
        message: {
          type: 'string',
          description: 'What to say to the user. Describe the corrections being made, e.g. "Rotating the nose cone 90 degrees and closing a gap in the fuselage connection."',
        },
      },
      required: ['message'],
    },
  },
  {
    name: 'group_nodes',
    description: 'Group multiple nodes together under a label. Use after fixes to regroup an assembly.',
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
];
