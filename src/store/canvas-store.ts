import { create } from 'zustand';
import type { CanvasState, CanvasNode, CanvasConnection, CanvasGroup, BuilderAction, Vec3, NodeType, NodeShape, Badge } from '@/types/canvas';

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

const MIN_NODE_SPACING = 2.5;

/** Calculate distance between two 3D points */
function distance(a: Vec3, b: Vec3): number {
  return Math.sqrt(
    Math.pow(a.x - b.x, 2) +
    Math.pow(a.y - b.y, 2) +
    Math.pow(a.z - b.z, 2)
  );
}

/** Generate a random position in 3D space */
function randomPosition(spread: number, yOffset: number): Vec3 {
  return {
    x: (Math.random() - 0.5) * spread,
    y: (Math.random() - 0.5) * 3 + yOffset,
    z: (Math.random() - 0.5) * spread,
  };
}

/** Find a position that maintains minimum spacing from existing nodes */
function findSpacedPosition(existingNodes: Record<string, CanvasNode>): Vec3 {
  const nodeList = Object.values(existingNodes);

  // If no existing nodes, place near center
  if (nodeList.length === 0) {
    return randomPosition(4, 1.5);
  }

  // Try to find a valid position with minimum spacing
  const maxAttempts = 50;
  let spread = 6; // Start with a reasonable spread

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = randomPosition(spread, 1.5);

    // Check distance from all existing nodes
    const isFarEnough = nodeList.every(
      (node) => distance(candidate, node.position) >= MIN_NODE_SPACING
    );

    if (isFarEnough) {
      return candidate;
    }

    // Gradually increase spread if we can't find space
    if (attempt % 10 === 9) {
      spread += 2;
    }
  }

  // Fallback: place in a spiral pattern outward from center
  const angle = nodeList.length * 0.8; // Golden angle approximation
  const radius = MIN_NODE_SPACING * (1 + nodeList.length * 0.3);
  return {
    x: Math.cos(angle) * radius,
    y: 1.5 + (Math.random() - 0.5) * 2,
    z: Math.sin(angle) * radius,
  };
}

interface CanvasStore extends CanvasState {
  // Direct mutations
  addNode: (type: NodeType, content: string, title?: string, position?: Vec3, shape?: NodeShape) => string;
  removeNode: (id: string) => void;
  updateNode: (id: string, changes: Partial<CanvasNode>) => void;
  moveNode: (id: string, position: Vec3) => void;
  addConnection: (fromId: string, toId: string, label?: string) => string;
  removeConnection: (id: string) => void;
  addGroup: (nodeIds: string[], label: string) => string;

  // Badge management (for Owl and other background agents)
  addBadge: (nodeId: string, badge: Omit<Badge, 'id'>) => void;
  removeBadge: (nodeId: string, badgeId: string) => void;
  clearBadgesBySource: (source: Badge['source']) => void;

  // Focus stack
  pushFocus: (nodeId: string) => void;
  getFocusedNode: () => CanvasNode | null;

  // Builder action dispatcher
  executeAction: (action: BuilderAction) => void;

  // Builder avatar
  builderPosition: Vec3;
  builderTarget: Vec3 | null;
  setBuilderTarget: (pos: Vec3) => void;

  // Next placement position (set by right hand open palm gesture at empty space)
  nextPlacementPosition: Vec3 | null;
  setNextPlacementPosition: (pos: Vec3 | null) => void;

  // Transcript
  transcript: string;
  setTranscript: (t: string) => void;
  isListening: boolean;
  setListening: (v: boolean) => void;

  // Owl analysis tracking
  lastAnalyzedAt: number;
  setLastAnalyzedAt: (t: number) => void;
}

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  nodes: {},
  connections: {},
  groups: {},
  focusStack: [],

  builderPosition: { x: 0, y: 2, z: 2 },
  builderTarget: null,
  nextPlacementPosition: null,
  transcript: '',
  isListening: false,
  lastAnalyzedAt: 0,

  setTranscript: (t) => set({ transcript: t }),
  setListening: (v) => set({ isListening: v }),
  setLastAnalyzedAt: (t) => set({ lastAnalyzedAt: t }),
  setNextPlacementPosition: (pos) => set({ nextPlacementPosition: pos }),

  addNode: (type, content, title, position, shape = 'sphere') => {
    const id = uid();
    const now = Date.now();
    // Priority: explicit position > nextPlacementPosition (from hand gesture) > auto-spaced
    const state = get();
    const pos = position ?? state.nextPlacementPosition ?? findSpacedPosition(state.nodes);
    set((s) => ({
      nodes: {
        ...s.nodes,
        [id]: { id, type, shape, content, title, position: pos, createdAt: now, updatedAt: now },
      },
      focusStack: [id, ...s.focusStack.filter((x) => x !== id)].slice(0, 20),
      // Clear nextPlacementPosition after using it
      nextPlacementPosition: null,
    }));
    // Move builder avatar toward the new node
    get().setBuilderTarget(pos);
    return id;
  },

  removeNode: (id) =>
    set((s) => {
      const { [id]: _, ...rest } = s.nodes;
      // Also remove connections involving this node
      const conns = Object.fromEntries(
        Object.entries(s.connections).filter(([, c]) => c.fromId !== id && c.toId !== id)
      );
      return { nodes: rest, connections: conns, focusStack: s.focusStack.filter((x) => x !== id) };
    }),

  updateNode: (id, changes) =>
    set((s) => ({
      nodes: {
        ...s.nodes,
        [id]: s.nodes[id] ? { ...s.nodes[id], ...changes, updatedAt: Date.now() } : s.nodes[id],
      },
      focusStack: [id, ...s.focusStack.filter((x) => x !== id)].slice(0, 20),
    })),

  moveNode: (id, position) => {
    set((s) => ({
      nodes: {
        ...s.nodes,
        [id]: s.nodes[id] ? { ...s.nodes[id], position, updatedAt: Date.now() } : s.nodes[id],
      },
    }));
    get().setBuilderTarget(position);
  },

  addConnection: (fromId, toId, label) => {
    const id = uid();
    set((s) => ({
      connections: { ...s.connections, [id]: { id, fromId, toId, label } },
    }));
    return id;
  },

  removeConnection: (id) =>
    set((s) => {
      const { [id]: _, ...rest } = s.connections;
      return { connections: rest };
    }),

  addGroup: (nodeIds, label) => {
    const id = uid();
    // Compute center position from member nodes
    const state = get();
    const positions = nodeIds.map((nid) => state.nodes[nid]?.position).filter(Boolean) as Vec3[];
    const center: Vec3 = positions.length
      ? {
          x: positions.reduce((a, p) => a + p.x, 0) / positions.length,
          y: positions.reduce((a, p) => a + p.y, 0) / positions.length,
          z: positions.reduce((a, p) => a + p.z, 0) / positions.length,
        }
      : { x: 0, y: 0, z: 0 };
    set((s) => ({
      groups: { ...s.groups, [id]: { id, label, nodeIds, position: center } },
    }));
    return id;
  },

  addBadge: (nodeId, badge) => {
    const badgeId = uid();
    set((s) => {
      const node = s.nodes[nodeId];
      if (!node) return s;
      const existingBadges = node.badges || [];
      return {
        nodes: {
          ...s.nodes,
          [nodeId]: {
            ...node,
            badges: [...existingBadges, { ...badge, id: badgeId }],
          },
        },
      };
    });
  },

  removeBadge: (nodeId, badgeId) => {
    set((s) => {
      const node = s.nodes[nodeId];
      if (!node || !node.badges) return s;
      return {
        nodes: {
          ...s.nodes,
          [nodeId]: {
            ...node,
            badges: node.badges.filter((b) => b.id !== badgeId),
          },
        },
      };
    });
  },

  clearBadgesBySource: (source) => {
    set((s) => {
      const updatedNodes: Record<string, CanvasNode> = {};
      for (const [id, node] of Object.entries(s.nodes)) {
        if (node.badges && node.badges.some((b) => b.source === source)) {
          updatedNodes[id] = {
            ...node,
            badges: node.badges.filter((b) => b.source !== source),
          };
        } else {
          updatedNodes[id] = node;
        }
      }
      return { nodes: updatedNodes };
    });
  },

  pushFocus: (nodeId) =>
    set((s) => ({
      focusStack: [nodeId, ...s.focusStack.filter((x) => x !== nodeId)].slice(0, 20),
    })),

  getFocusedNode: () => {
    const s = get();
    const topId = s.focusStack[0];
    return topId ? s.nodes[topId] ?? null : null;
  },

  setBuilderTarget: (pos) => set({ builderTarget: pos }),

  executeAction: (action) => {
    console.log('[CANVAS] executeAction:', action.type, action);
    const store = get();
    switch (action.type) {
      case 'create_node':
        store.addNode(action.nodeType, action.content, action.title, action.position, action.shape);
        break;
      case 'create_connection':
        store.addConnection(action.fromId, action.toId, action.label);
        break;
      case 'group_nodes':
        store.addGroup(action.nodeIds, action.label);
        break;
      case 'move_node':
        store.moveNode(action.nodeId, action.position);
        break;
      case 'update_node':
        store.updateNode(action.nodeId, action.changes);
        break;
      case 'delete_node':
        store.removeNode(action.nodeId);
        break;
      case 'respond_verbally':
        // TODO: pipe to TTS
        console.log('[Builder says]:', action.message);
        break;
    }
  },
}));
