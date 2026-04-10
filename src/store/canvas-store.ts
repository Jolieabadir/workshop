import { create } from 'zustand';
import type { CanvasState, CanvasNode, CanvasConnection, CanvasGroup, BuilderAction, Vec3, NodeType, NodeShape, Badge, ComponentType, ComponentData } from '@/core/types';
import { getConnectorPointsForComponent } from '@/components/canvas/generators';

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

const MIN_NODE_SPACING = 2.0;
const PLACEMENT_OFFSET = 2.5; // Distance from reference node when placing nearby

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

/**
 * Find a position near a reference point with slight offset.
 * The spatial engine will handle settling into equilibrium.
 */
function findPositionNear(
  reference: Vec3,
  existingNodes: Record<string, CanvasNode>,
  offset: number = PLACEMENT_OFFSET
): Vec3 {
  // Try to find a position at offset distance in a random direction
  const maxAttempts = 12;
  const angleStep = (Math.PI * 2) / maxAttempts;

  for (let i = 0; i < maxAttempts; i++) {
    const angle = i * angleStep + Math.random() * 0.5;
    const candidate: Vec3 = {
      x: reference.x + Math.cos(angle) * offset,
      y: reference.y + (Math.random() - 0.5) * 0.5, // Slight Y variation
      z: reference.z + Math.sin(angle) * offset,
    };

    // Check if this position is far enough from other nodes
    const isFarEnough = Object.values(existingNodes).every(
      (node) => distance(candidate, node.position) >= MIN_NODE_SPACING * 0.8
    );

    if (isFarEnough) {
      return candidate;
    }
  }

  // Fallback: just place with offset, let spatial engine sort it out
  const fallbackAngle = Math.random() * Math.PI * 2;
  return {
    x: reference.x + Math.cos(fallbackAngle) * offset,
    y: reference.y,
    z: reference.z + Math.sin(fallbackAngle) * offset,
  };
}

/**
 * Context-aware node placement.
 * Priority: explicit position > near connected node > near group > fallback to spaced position
 */
function findContextAwarePosition(
  existingNodes: Record<string, CanvasNode>,
  groups: Record<string, CanvasGroup>,
  connectedToId?: string,
  groupId?: string
): Vec3 {
  // If connecting to an existing node, place near it
  if (connectedToId && existingNodes[connectedToId]) {
    return findPositionNear(existingNodes[connectedToId].position, existingNodes);
  }

  // If part of a group, place near the group centroid
  if (groupId && groups[groupId]) {
    return findPositionNear(groups[groupId].position, existingNodes, PLACEMENT_OFFSET * 0.8);
  }

  // Fallback to finding a spaced position
  const nodeList = Object.values(existingNodes);

  // If no existing nodes, place near center
  if (nodeList.length === 0) {
    return { x: 0, y: 1.5, z: 0 };
  }

  // If few nodes, place near the most recent one (likely related)
  if (nodeList.length <= 3) {
    const mostRecent = nodeList.reduce((latest, node) =>
      node.updatedAt > latest.updatedAt ? node : latest
    );
    return findPositionNear(mostRecent.position, existingNodes);
  }

  // Find center of mass of all nodes
  const centerOfMass: Vec3 = {
    x: nodeList.reduce((sum, n) => sum + n.position.x, 0) / nodeList.length,
    y: nodeList.reduce((sum, n) => sum + n.position.y, 0) / nodeList.length,
    z: nodeList.reduce((sum, n) => sum + n.position.z, 0) / nodeList.length,
  };

  // Place at edge of the cluster
  return findPositionNear(centerOfMass, existingNodes, PLACEMENT_OFFSET * 1.5);
}

interface PlacementContext {
  connectedToId?: string;  // Place near this node (for connections)
  groupId?: string;        // Place near this group's centroid
}

interface CanvasStore extends CanvasState {
  // Direct mutations
  addNode: (type: NodeType, content: string, title?: string, position?: Vec3, shape?: NodeShape, context?: PlacementContext) => string;
  addComponent: (componentType: ComponentType, params: Record<string, unknown>, title: string, position?: Vec3, rotation?: Vec3) => string;
  removeNode: (id: string) => void;
  updateNode: (id: string, changes: Partial<CanvasNode>) => void;
  moveNode: (id: string, position: Vec3) => void;
  addConnection: (fromId: string, toId: string, label?: string, fromPort?: string, toPort?: string) => string;
  removeConnection: (id: string) => void;
  addGroup: (nodeIds: string[], label: string) => string;
  moveGroup: (groupId: string, delta: Vec3) => void;
  getGroupForNode: (nodeId: string) => CanvasGroup | null;

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
  transcript: '',
  isListening: false,
  lastAnalyzedAt: 0,

  setTranscript: (t) => set({ transcript: t }),
  setListening: (v) => set({ isListening: v }),
  setLastAnalyzedAt: (t) => set({ lastAnalyzedAt: t }),

  addNode: (type, content, title, position, shape = 'sphere', context) => {
    const id = uid();
    const now = Date.now();
    // Use explicit position or find context-aware position
    const state = get();
    const pos = position ?? findContextAwarePosition(
      state.nodes,
      state.groups,
      context?.connectedToId,
      context?.groupId
    );
    set((s) => ({
      nodes: {
        ...s.nodes,
        [id]: { id, type, shape, content, title, position: pos, createdAt: now, updatedAt: now },
      },
      focusStack: [id, ...s.focusStack.filter((x) => x !== id)].slice(0, 20),
    }));
    // Move builder avatar toward the new node
    get().setBuilderTarget(pos);
    return id;
  },

  addComponent: (componentType, params, title, position, rotation) => {
    const id = uid();
    const now = Date.now();
    // Use explicit position or find context-aware position
    const state = get();
    const pos = position ?? findContextAwarePosition(state.nodes, state.groups);

    // Get connector points for this component type
    const connectorPoints = getConnectorPointsForComponent(componentType, params);

    // Create component data
    const componentData: ComponentData = {
      componentType,
      params,
      connectorPoints,
      rotation,
    };

    set((s) => ({
      nodes: {
        ...s.nodes,
        [id]: {
          id,
          type: 'text_card' as NodeType,
          shape: 'cube' as NodeShape, // Use cube as base shape for components
          content: `${componentType}: ${title}`,
          title,
          position: pos,
          createdAt: now,
          updatedAt: now,
          component: componentData,
        },
      },
      focusStack: [id, ...s.focusStack.filter((x) => x !== id)].slice(0, 20),
    }));
    // Move builder avatar toward the new component
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

  addConnection: (fromId, toId, label, fromPort, toPort) => {
    const id = uid();
    set((s) => ({
      connections: { ...s.connections, [id]: { id, fromId, toId, fromPort, toPort, label } },
    }));
    return id;
  },

  removeConnection: (id) =>
    set((s) => {
      const { [id]: _, ...rest } = s.connections;
      return { connections: rest };
    }),

  addGroup: (nodeIds, label) => {
    // Guard against empty/invalid nodeIds
    if (!nodeIds || !Array.isArray(nodeIds) || nodeIds.length === 0) {
      console.warn('[CANVAS] addGroup called with empty/invalid nodeIds');
      return uid();
    }
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

  moveGroup: (groupId, delta) => {
    const group = get().groups[groupId];
    if (!group) return;
    for (const nodeId of group.nodeIds) {
      const node = get().nodes[nodeId];
      if (node) {
        get().moveNode(nodeId, {
          x: node.position.x + delta.x,
          y: Math.max(0.5, node.position.y + delta.y),
          z: node.position.z + delta.z,
        });
      }
    }
    // Update the group's center position
    set((s) => ({
      groups: {
        ...s.groups,
        [groupId]: {
          ...s.groups[groupId],
          position: {
            x: s.groups[groupId].position.x + delta.x,
            y: Math.max(0.5, s.groups[groupId].position.y + delta.y),
            z: s.groups[groupId].position.z + delta.z,
          },
        },
      },
    }));
  },

  getGroupForNode: (nodeId) => {
    const groups = get().groups;
    for (const group of Object.values(groups)) {
      if (group.nodeIds.includes(nodeId)) {
        return group;
      }
    }
    return null;
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
        // Pass placement context if available (e.g., connected node ID)
        store.addNode(
          action.nodeType,
          action.content,
          action.title,
          action.position,
          action.shape,
          action.connectedToId ? { connectedToId: action.connectedToId } : undefined
        );
        break;
      case 'create_component':
        store.addComponent(
          action.componentType,
          action.params,
          action.title,
          action.position,
          action.rotation
        );
        break;
      case 'create_connection':
        store.addConnection(action.fromId, action.toId, action.label, action.fromPort, action.toPort);
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
        // TTS handled in page.tsx
        console.log('[Builder says]:', action.message);
        break;
    }
  },
}));
