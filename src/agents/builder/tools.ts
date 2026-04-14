// ============================================================
// Workshop — Builder Agent Tools
// ============================================================

import type { Tool } from '@anthropic-ai/sdk/resources/messages';

export const BUILDER_TOOLS: Tool[] = [
  {
    name: 'generate_mesh',
    description: 'Generate a complex 3D model using AI (Tripo API). Use this for realistic objects that would need 10+ create_component calls: full vehicles (cars, motorcycles, aircraft), characters/creatures, buildings, furniture, organic shapes (trees, rocks), or any detailed prop. Takes about 10 seconds to generate. Returns a GLB model loaded into the scene. For mechanical assemblies where connector ports matter (robot joints, circuits, gearboxes), use create_component instead.',
    input_schema: {
      type: 'object' as const,
      properties: {
        prompt: {
          type: 'string',
          description: 'SHORT description of the 3D model (under 20 words). Simple prompts work best. Examples: "red rocket ship with fins", "wooden chair with armrests", "medieval stone castle tower"',
        },
        title: {
          type: 'string',
          description: 'Display name for the model in the scene (e.g. "Sports Car", "Office Chair", "Oak Tree")',
        },
        position: {
          type: 'object',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            z: { type: 'number' },
          },
          description: '3D position. Defaults to center of scene.',
        },
        style: {
          type: 'string',
          enum: ['realistic', 'cartoon'],
          description: 'Art style for the generated model. Default: realistic',
        },
      },
      required: ['prompt', 'title'],
    },
  },
  {
    name: 'create_component',
    description: 'Create a parametric 3D component (electronic or mechanical) on the canvas. Use this for building physical objects like rockets, circuits, machines, robots, etc. Components have proper 3D geometry and connector points for wiring/assembly.',
    input_schema: {
      type: 'object' as const,
      properties: {
        componentType: {
          type: 'string',
          enum: ['resistor', 'capacitor', 'ic', 'led', 'connector', 'plate', 'shaft', 'bearing', 'bracket', 'link', 'joint', 'housing', 'gear', 'cone', 'sphere', 'hemisphere', 'cylinder', 'torus', 'wedge', 'tube', 'fin', 'nozzle', 'dome'],
          description: 'Type of component. Electronic: resistor, capacitor, ic (integrated circuit chip), led, connector. Mechanical: housing (box/enclosure with optional open face), plate (flat panel/fin/shield), shaft (cylindrical rod), bearing (ring with inner/outer race), gear (toothed wheel), bracket (L-shaped support), link (connecting bar), joint (pivot point). Geometric: cone (nose cones, funnels), sphere (balls, tanks), hemisphere (dome caps), cylinder (tubes, columns), torus (rings, seals), wedge (ramps, supports), tube (hollow cylinder/pipe), fin (rocket fins, blades), nozzle (engine nozzles, bells), dome (capsules, tanks).',
        },
        title: {
          type: 'string',
          description: 'Display name for the component (e.g. "Nose Cone", "Main Engine", "Flight Computer")',
        },
        params: {
          type: 'object',
          description: 'Component-specific parameters in mm. Housing: {width, height, depth, wallThickness, openFace: "none"|"top"|"front"}. Plate: {width, height, thickness, material}. Shaft: {length, diameter, type: "smooth"|"splined"|"threaded"}. Bearing: {outerDiameter, innerDiameter, width}. Gear: {toothCount, module, thickness, boreDiameter}. IC: {pinCount, label}. Connector: {pinCount, rows, type: "header"|"terminal"|"socket"}. LED: {size, color}. Resistor: {length, diameter}. Capacitor: {diameter, height, type: "electrolytic"|"ceramic"}. Cone: {radiusBottom, radiusTop (0=pointed), height}. Sphere: {radius}. Hemisphere: {radius}. Cylinder: {radius, height}. Torus: {radius, tubeRadius}. Wedge: {width, height, depth}. Tube: {radius, height, wallThickness}. Fin: {rootChord, tipChord, span, thickness, sweepAngle}. Nozzle: {radiusTop, radiusBottom, height, wallThickness}. Dome: {radius, cylinderHeight}.',
        },
        position: {
          type: 'object',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            z: { type: 'number' },
          },
          description: '3D position. Stack vertically (y-axis) for assemblies.',
        },
        rotation: {
          type: 'object',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            z: { type: 'number' },
          },
          description: 'Optional rotation in radians.',
        },
      },
      required: ['componentType', 'title', 'params'],
    },
  },
  {
    name: 'create_connection',
    description: 'Create a connection/edge between two existing nodes to show a relationship. For electronic components, use fromPort/toPort to connect at specific connector points. MANDATORY after multi-part builds. Every generate_mesh decomposition MUST be followed by create_connection calls between adjacent parts and a group_nodes call. An assembly without connections is broken.',
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
          description: 'Optional connector point ID on the source component. Valid port IDs by component type: housing: "top", "bottom", "front", "back", "left", "right", "interior" | plate: "top", "bottom", plus "hole1", "hole2"... for hole positions | shaft: "end1", "end2" | bearing: "inner" (shaft side), "outer" (housing side), "face1", "face2" | gear: "bore" (center, for shaft), "teeth" (pitch circle, for meshing), "face1", "face2" | bracket: "base", "arm", "corner" | link: "start", "end", "pin1", "pin2" | joint: "shaft", "base" | resistor: "lead1", "lead2" | capacitor: "positive", "negative" (electrolytic) or "lead1", "lead2" (ceramic) | ic: "pin1" through "pinN" (left side first, then right) | led: "anode", "cathode" | connector: "pin1" through "pinN". ALWAYS use these exact IDs — do not invent port names.',
        },
        toPort: {
          type: 'string',
          description: 'Optional connector point ID on the target component. Valid port IDs by component type: housing: "top", "bottom", "front", "back", "left", "right", "interior" | plate: "top", "bottom", plus "hole1", "hole2"... for hole positions | shaft: "end1", "end2" | bearing: "inner" (shaft side), "outer" (housing side), "face1", "face2" | gear: "bore" (center, for shaft), "teeth" (pitch circle, for meshing), "face1", "face2" | bracket: "base", "arm", "corner" | link: "start", "end", "pin1", "pin2" | joint: "shaft", "base" | resistor: "lead1", "lead2" | capacitor: "positive", "negative" (electrolytic) or "lead1", "lead2" (ceramic) | ic: "pin1" through "pinN" (left side first, then right) | led: "anode", "cathode" | connector: "pin1" through "pinN". ALWAYS use these exact IDs — do not invent port names.',
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
    description: 'Group multiple nodes together under a label to show they belong to a category or cluster. MANDATORY after multi-part builds. Always call this after connecting all parts to make the assembly grabbable as one unit.',
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
