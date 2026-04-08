import { create } from 'zustand';
import type { CanvasState, CanvasNode, CanvasConnection, CanvasGroup, BuilderAction, Vec3, NodeType } from '@/types/canvas';

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Place new nodes near the camera with a random offset */
function defaultPosition(): Vec3 {
  return {
    x: (Math.random() - 0.5) * 4,
    y: (Math.random() - 0.5) * 2 + 1,
    z: (Math.random() - 0.5) * 4,
  };
}

interface CanvasStore extends CanvasState {
  // Direct mutations
  addNode: (type: NodeType, content: string, title?: string, position?: Vec3) => string;
  removeNode: (id: string) => void;
  updateNode: (id: string, changes: Partial<CanvasNode>) => void;
  moveNode: (id: string, position: Vec3) => void;
  addConnection: (fromId: string, toId: string, label?: string) => string;
  removeConnection: (id: string) => void;
  addGroup: (nodeIds: string[], label: string) => string;

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

  setTranscript: (t) => set({ transcript: t }),
  setListening: (v) => set({ isListening: v }),

  addNode: (type, content, title, position) => {
    const id = uid();
    const now = Date.now();
    const pos = position ?? defaultPosition();
    set((s) => ({
      nodes: {
        ...s.nodes,
        [id]: { id, type, content, title, position: pos, createdAt: now, updatedAt: now },
      },
      focusStack: [id, ...s.focusStack.filter((x) => x !== id)].slice(0, 20),
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
    const store = get();
    switch (action.type) {
      case 'create_node':
        store.addNode(action.nodeType, action.content, action.title, action.position);
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
