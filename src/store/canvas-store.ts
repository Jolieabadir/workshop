import { create } from 'zustand';
import type { CanvasState, CanvasNode, CanvasConnection, CanvasGroup, BuilderAction, Vec3, NodeType, NodeShape, Badge, ComponentType, ComponentData, ComponentConnectorPoint } from '@/core/types';
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
  generateMesh: (prompt: string, title: string, position?: Vec3, style?: 'realistic' | 'cartoon', virtualPorts?: ComponentConnectorPoint[]) => string;
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

  // Mechanic avatar state
  mechanicActive: boolean;
  mechanicTarget: Vec3 | null;
  setMechanicActive: (active: boolean) => void;
  setMechanicTarget: (pos: Vec3 | null) => void;

  // Correction highlights (visual feedback rings)
  correctionHighlights: Array<{ id: string; nodeId: string; type: string; timestamp: number }>;
  addCorrectionHighlight: (nodeId: string, type: string) => void;
  removeCorrectionHighlight: (id: string) => void;
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

  // Mechanic avatar state
  mechanicActive: false,
  mechanicTarget: null,
  correctionHighlights: [],

  setTranscript: (t) => set({ transcript: t }),
  setListening: (v) => set({ isListening: v }),
  setLastAnalyzedAt: (t) => set({ lastAnalyzedAt: t }),

  // Mechanic state setters
  setMechanicActive: (active) => set({ mechanicActive: active }),
  setMechanicTarget: (pos) => set({ mechanicTarget: pos }),
  addCorrectionHighlight: (nodeId, type) => {
    const id = uid();
    set((s) => ({
      correctionHighlights: [
        ...s.correctionHighlights,
        { id, nodeId, type, timestamp: Date.now() },
      ],
    }));
  },
  removeCorrectionHighlight: (id) =>
    set((s) => ({
      correctionHighlights: s.correctionHighlights.filter((h) => h.id !== id),
    })),

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
        [id]: {
          id,
          type,
          shape,
          content,
          title,
          position: pos,
          createdAt: now,
          updatedAt: now,
          // Initialize metadata with defaults so Mechanic can read current state
          metadata: {
            rotation: { x: 0, y: 0, z: 0 },
            uniformScale: 1,
          },
        },
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

    // Use provided rotation or default to zero
    const initialRotation = rotation ?? { x: 0, y: 0, z: 0 };

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
          // Initialize metadata with defaults so Mechanic can read current state
          metadata: {
            rotation: initialRotation,
            uniformScale: 1,
          },
        },
      },
      focusStack: [id, ...s.focusStack.filter((x) => x !== id)].slice(0, 20),
    }));
    // Move builder avatar toward the new component
    get().setBuilderTarget(pos);
    return id;
  },

  generateMesh: (prompt, title, position, style = 'realistic', virtualPorts) => {
    const id = uid();
    const now = Date.now();
    const state = get();

    // Detect "don't care" position (Builder sends {0,0,0} for decomposed parts)
    const isDefaultPosition = !position ||
      (Math.abs(position.x) < 0.1 && Math.abs(position.y) < 0.1 && Math.abs(position.z) < 0.1);

    let pos: Vec3;
    if (isDefaultPosition) {
      // Count existing mesh/placeholder nodes to determine staging offset
      const meshNodeCount = Object.values(state.nodes).filter(
        n => n.meshUrl || n.meshLoading
      ).length;

      // Space parts along X axis with 3 unit gaps, centered around origin
      // Y at 1.5 so they're visible, Z at 0
      const STAGING_SPACING = 3.0;
      const stagingX = meshNodeCount * STAGING_SPACING; // 0, 3, 6, 9...
      pos = { x: stagingX, y: 1.5, z: 0 };

      console.log(`[MESH] Staging position for part #${meshNodeCount + 1}: x=${stagingX}`);
    } else {
      pos = position!;
    }

    // Create placeholder node with loading state
    set((s) => ({
      nodes: {
        ...s.nodes,
        [id]: {
          id,
          type: 'placeholder' as NodeType,
          shape: 'cube' as NodeShape,
          content: `Generating: ${prompt.slice(0, 50)}...`,
          title: `\u23F3 ${title} (0%)`, // Hourglass emoji prefix with progress
          position: pos,
          createdAt: now,
          updatedAt: now,
          meshLoading: true,
          color: '#888888',
          virtualPorts, // Store virtual ports for mesh connections
          // Initialize metadata with defaults so Mechanic can read current state
          metadata: {
            rotation: { x: 0, y: 0, z: 0 },
            uniformScale: 1,
          },
        },
      },
      focusStack: [id, ...s.focusStack.filter((x) => x !== id)].slice(0, 20),
    }));

    // Move builder avatar toward the placeholder
    get().setBuilderTarget(pos);

    // Start async mesh generation with client-side polling
    (async () => {
      const POLL_INTERVAL_MS = 2000; // Tripo is fast
      const MAX_POLL_TIME_MS = 180000; // 3 minutes safety net
      const startTime = Date.now();
      let pollInterval: ReturnType<typeof setInterval> | null = null;

      const cleanup = () => {
        if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
      };

      const updateProgress = (progress: number) => {
        set((s) => ({
          nodes: {
            ...s.nodes,
            [id]: s.nodes[id] ? {
              ...s.nodes[id],
              title: `\u23F3 ${title} (${Math.round(progress)}%)`,
              updatedAt: Date.now(),
            } : s.nodes[id],
          },
        }));
      };

      const markSuccess = (modelUrl: string) => {
        console.log('[MESH] markSuccess called, id:', id, 'meshUrl:', modelUrl);
        cleanup();
        set((s) => ({
          nodes: {
            ...s.nodes,
            [id]: s.nodes[id] ? {
              ...s.nodes[id],
              title,
              meshUrl: modelUrl,
              meshLoading: false,
              content: prompt,
              updatedAt: Date.now(),
              virtualPorts, // Preserve virtual ports after mesh loads
            } : s.nodes[id],
          },
        }));
        // Log node state after set
        const updatedNode = get().nodes[id];
        console.log('[MESH] Node state after markSuccess:', updatedNode?.id, 'meshUrl:', updatedNode?.meshUrl, 'meshLoading:', updatedNode?.meshLoading);
        console.log('[CANVAS] Mesh generated:', title, modelUrl);
      };

      const markError = (message: string) => {
        cleanup();
        set((s) => ({
          nodes: {
            ...s.nodes,
            [id]: s.nodes[id] ? {
              ...s.nodes[id],
              title: `\u274C ${title}`,
              meshLoading: false,
              meshError: message,
              content: `Failed: ${message}`,
              updatedAt: Date.now(),
            } : s.nodes[id],
          },
        }));
        console.error('[CANVAS] Mesh generation failed:', message);
      };

      try {
        // Step 1: Submit task (may return cached result)
        const submitResponse = await fetch('/api/mesh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, style }),
        });

        if (!submitResponse.ok) {
          const error = await submitResponse.json();
          throw new Error(error.message || 'Failed to submit mesh task');
        }

        const submitResult = await submitResponse.json();

        // Handle cache hit — instant success, no polling needed
        if (submitResult.cached && submitResult.modelUrl) {
          console.log('[CANVAS] Cache hit! Loading from:', submitResult.modelUrl);
          markSuccess(submitResult.modelUrl);
          return;
        }

        const { taskId, cacheHash } = submitResult;
        console.log('[CANVAS] Mesh task submitted:', taskId, 'cacheHash:', cacheHash);

        // Step 2: Poll for status (with cache params for server-side caching)
        const pollStatus = async () => {
          // Check timeout
          if (Date.now() - startTime > MAX_POLL_TIME_MS) {
            markError('Mesh generation timed out (>3 minutes). Try a simpler prompt.');
            return;
          }

          // Check if node still exists
          if (!get().nodes[id]) {
            cleanup();
            return;
          }

          try {
            // Include cache params so server can cache on completion
            const pollParams = new URLSearchParams({
              taskId,
              ...(cacheHash && { hash: cacheHash }),
              ...(prompt && { prompt }),
              ...(style && { style }),
            });
            const statusResponse = await fetch(`/api/mesh?${pollParams.toString()}`);
            if (!statusResponse.ok) {
              const error = await statusResponse.json();
              throw new Error(error.message || 'Failed to check task status');
            }

            const status = await statusResponse.json();

            // Update preview image if available (shown while 3D model generates)
            if (status.previewImageUrl) {
              set((s) => ({
                nodes: {
                  ...s.nodes,
                  [id]: s.nodes[id] ? {
                    ...s.nodes[id],
                    meshPreviewUrl: status.previewImageUrl,
                    updatedAt: Date.now(),
                  } : s.nodes[id],
                },
              }));
            }

            if (status.status === 'SUCCEEDED' && status.modelUrl) {
              // Proxy through our API to avoid CORS issues
              const proxiedUrl = `/api/mesh?url=${encodeURIComponent(status.modelUrl)}`;
              console.log('[CANVAS] Mesh ready, raw URL:', status.modelUrl);
              console.log('[CANVAS] Mesh ready, proxied URL:', proxiedUrl);
              markSuccess(proxiedUrl);
            } else if (status.status === 'FAILED') {
              markError(status.error || 'Mesh generation failed');
            } else if (status.status === 'EXPIRED') {
              markError('Mesh generation task expired');
            } else {
              // Still in progress — update progress
              updateProgress(status.progress || 0);
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.error('[CANVAS] Poll error:', message);
            // Don't fail on poll errors, just continue polling
          }
        };

        // Initial poll
        await pollStatus();

        // Set up interval for subsequent polls
        pollInterval = setInterval(pollStatus, POLL_INTERVAL_MS);

      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        markError(message);
      }
    })();

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
    set((s) => {
      const existingNode = s.nodes[id];
      if (!existingNode) return s;

      // Deep merge metadata to preserve rotation when setting scale and vice versa
      const mergedMetadata = changes.metadata
        ? { ...existingNode.metadata, ...changes.metadata }
        : existingNode.metadata;

      return {
        nodes: {
          ...s.nodes,
          [id]: {
            ...existingNode,
            ...changes,
            metadata: mergedMetadata,
            updatedAt: Date.now(),
          },
        },
        focusStack: [id, ...s.focusStack.filter((x) => x !== id)].slice(0, 20),
      };
    }),

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
    const state = get();

    // Resolve node references (titles or IDs) to actual node IDs
    function resolveNodeRef(ref: string): string | null {
      // Direct ID match
      if (state.nodes[ref]) return ref;
      // Title fallback
      const byTitle = Object.values(state.nodes).find(n => n.title === ref);
      if (byTitle) {
        console.warn(`[CANVAS] addConnection: resolved title "${ref}" to ID "${byTitle.id}" — Builder should pass IDs`);
        return byTitle.id;
      }
      return null;
    }

    const resolvedFromId = resolveNodeRef(fromId);
    const resolvedToId = resolveNodeRef(toId);

    if (!resolvedFromId || !resolvedToId) {
      console.error(`[CANVAS] addConnection: cannot resolve fromId="${fromId}" or toId="${toId}" — connection NOT created`);
      return id; // Return id to satisfy type, but connection is not created
    }

    const fromNode = state.nodes[resolvedFromId];
    const toNode = state.nodes[resolvedToId];

    // Auto-align: if both ports specified and both nodes have components, snap them together
    if (fromPort && toPort && fromNode?.component && toNode?.component) {
      const COMPONENT_SCALE = 10; // Must match ComponentGenerator.tsx

      // Find the connector points
      const fromConnector = fromNode.component.connectorPoints.find(cp => cp.id === fromPort);
      const toConnector = toNode.component.connectorPoints.find(cp => cp.id === toPort);

      if (fromConnector && toConnector) {
        // Compute world positions of each port
        const fromWorld = {
          x: fromNode.position.x + fromConnector.position.x * COMPONENT_SCALE,
          y: fromNode.position.y + fromConnector.position.y * COMPONENT_SCALE,
          z: fromNode.position.z + fromConnector.position.z * COMPONENT_SCALE,
        };
        const toWorld = {
          x: toNode.position.x + toConnector.position.x * COMPONENT_SCALE,
          y: toNode.position.y + toConnector.position.y * COMPONENT_SCALE,
          z: toNode.position.z + toConnector.position.z * COMPONENT_SCALE,
        };

        // Move toNode so its port aligns with fromNode's port
        const newPosition = {
          x: toNode.position.x + (fromWorld.x - toWorld.x),
          y: toNode.position.y + (fromWorld.y - toWorld.y),
          z: toNode.position.z + (fromWorld.z - toWorld.z),
        };

        console.log(`[AUTO-ALIGN] Snapping "${toNode.title}" port ${toPort} to "${fromNode.title}" port ${fromPort}`);
        console.log(`[AUTO-ALIGN]   From port world: (${fromWorld.x.toFixed(2)}, ${fromWorld.y.toFixed(2)}, ${fromWorld.z.toFixed(2)})`);
        console.log(`[AUTO-ALIGN]   Moving "${toNode.title}" from (${toNode.position.x.toFixed(2)}, ${toNode.position.y.toFixed(2)}, ${toNode.position.z.toFixed(2)}) to (${newPosition.x.toFixed(2)}, ${newPosition.y.toFixed(2)}, ${newPosition.z.toFixed(2)})`);

        // Update the target node's position (use resolved ID)
        set((s) => ({
          nodes: {
            ...s.nodes,
            [resolvedToId]: { ...s.nodes[resolvedToId], position: newPosition, updatedAt: Date.now() },
          },
        }));
      }
    }

    // Store the connection with resolved UUIDs
    set((s) => ({
      connections: { ...s.connections, [id]: { id, fromId: resolvedFromId, toId: resolvedToId, fromPort, toPort, label } },
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
        // Redirect to component creation (create_node is deprecated)
        store.addComponent(
          'housing',
          { width: 30, height: 20, depth: 15, wallThickness: 2, openFace: 'none' },
          action.title || action.content?.slice(0, 30) || 'Untitled',
          action.position
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
      case 'generate_mesh':
        store.generateMesh(
          action.prompt,
          action.title,
          action.position,
          action.style,
          (action as { virtualPorts?: ComponentConnectorPoint[] }).virtualPorts
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
        // Clamp uniformScale to minimum 0.01 to prevent objects from becoming invisible
        if (action.changes?.metadata?.uniformScale !== undefined && action.changes.metadata.uniformScale !== null) {
          const rawScale = action.changes.metadata.uniformScale as number;
          action.changes.metadata.uniformScale = Math.max(0.01, rawScale);
          if (rawScale < 0.01) {
            console.log(`[CANVAS] Scale clamped from ${rawScale} to minimum 0.01 for node ${action.nodeId}`);
          }
        }
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
