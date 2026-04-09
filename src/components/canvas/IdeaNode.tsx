'use client';

import { Html, RoundedBox } from '@react-three/drei';
import { useRef, useState, useMemo, useEffect } from 'react';
import { useFrame, ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { CanvasNode, NodeType } from '@/core/types';
import { useCanvasStore } from '@/store/canvas-store';
import { useHandStore } from '@/store/hand-store';

interface IdeaNodeProps {
  node: CanvasNode;
}

// Default colors for each node type
const TYPE_COLORS: Record<NodeType, string> = {
  text_card: '#6C63FF',    // Purple-blue
  diagram: '#FF6B9D',      // Pink
  table: '#4ECDC4',        // Teal
  code_block: '#FFE66D',   // Yellow
  image: '#95E1D3',        // Mint
  placeholder: '#A8A8A8',  // Gray
};

// Parse color string to THREE.Color
function parseColor(color: string | undefined, fallback: string): THREE.Color {
  try {
    return new THREE.Color(color || fallback);
  } catch {
    return new THREE.Color(fallback);
  }
}

// Hexagonal prism geometry for diagram nodes
function createHexagonalPrismGeometry(radius: number, height: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  const sides = 6;
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();

  return new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.05,
    bevelSegments: 2,
  });
}

export function IdeaNode({ node }: IdeaNodeProps) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const [hovered, setHovered] = useState(false);
  const [selected, setSelected] = useState(false);

  const pushFocus = useCanvasStore((s) => s.pushFocus);
  const focusStack = useCanvasStore((s) => s.focusStack);
  const isTopFocus = focusStack[0] === node.id;

  // Hand tracking hover state
  const hoveredNodeId = useHandStore((s) => s.hoveredNodeId);
  const grabbedNodeId = useHandStore((s) => s.grabbedNodeId);
  const isHandHovered = hoveredNodeId === node.id;
  const isHandGrabbed = grabbedNodeId === node.id;

  // Set userData for raycaster detection
  // Propagate nodeId UP the hierarchy so raycasting always finds it
  useEffect(() => {
    if (meshRef.current) {
      meshRef.current.userData = { nodeId: node.id };
      // Walk up parent chain and set nodeId on each
      let parent = meshRef.current.parent;
      while (parent) {
        parent.userData = { nodeId: node.id };
        // Stop at Scene level
        if (parent.type === 'Scene') break;
        parent = parent.parent;
      }
    }
    // Also set on the group ref directly
    if (groupRef.current) {
      groupRef.current.userData = { nodeId: node.id };
      // And traverse DOWN to all children
      groupRef.current.traverse((child) => {
        child.userData = { ...child.userData, nodeId: node.id };
      });
    }
  }, [node.id]);

  // Get color based on node type or custom color
  const baseColor = useMemo(() => {
    return parseColor(node.color, TYPE_COLORS[node.type] || TYPE_COLORS.placeholder);
  }, [node.color, node.type]);

  // Create hexagonal geometry for diagram type
  const hexGeometry = useMemo(() => {
    if (node.type === 'diagram') {
      const geo = createHexagonalPrismGeometry(0.5, 0.3);
      geo.center();
      geo.rotateX(Math.PI / 2);
      return geo;
    }
    return null;
  }, [node.type]);

  // Animation: gentle float + hover pulse
  useFrame((_, delta) => {
    if (meshRef.current) {
      // Gentle floating animation
      const floatOffset = Math.sin(Date.now() * 0.001 + node.position.x * 2) * 0.02;
      meshRef.current.position.y = node.position.y + floatOffset;

      // Slow rotation
      meshRef.current.rotation.y += delta * 0.1;
    }

    if (materialRef.current) {
      // Pulse emissive intensity based on state
      // Hand interaction takes priority over mouse
      const targetIntensity = isHandGrabbed ? 1.2 : isHandHovered ? 1.0 : hovered ? 0.8 : isTopFocus ? 0.5 : 0.3;
      materialRef.current.emissiveIntensity = THREE.MathUtils.lerp(
        materialRef.current.emissiveIntensity,
        targetIntensity,
        delta * 8
      );
    }

    // Scale up slightly when grabbed by hand
    if (meshRef.current) {
      const targetScale = isHandGrabbed ? 1.15 : 1.0;
      meshRef.current.scale.lerp(
        new THREE.Vector3(targetScale, targetScale, targetScale),
        delta * 10
      );
    }
  });

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    pushFocus(node.id);
    setSelected(!selected);
  };

  const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHovered(true);
    document.body.style.cursor = 'pointer';
  };

  const handlePointerOut = () => {
    setHovered(false);
    document.body.style.cursor = 'auto';
  };

  // Render the appropriate 3D shape based on node type
  const renderShape = () => {
    const material = (
      <meshStandardMaterial
        ref={materialRef}
        color={baseColor}
        emissive={baseColor}
        emissiveIntensity={0.3}
        transparent
        opacity={0.85}
        roughness={0.2}
        metalness={0.1}
      />
    );

    switch (node.type) {
      case 'text_card':
        // Rounded box
        return (
          <RoundedBox args={[1.2, 0.8, 0.3]} radius={0.08} smoothness={4}>
            {material}
          </RoundedBox>
        );

      case 'diagram':
        // Hexagonal prism
        return hexGeometry ? (
          <mesh geometry={hexGeometry}>
            {material}
          </mesh>
        ) : null;

      case 'table':
        // Flat wide box
        return (
          <mesh>
            <boxGeometry args={[1.5, 0.15, 1]} />
            {material}
          </mesh>
        );

      case 'code_block':
        // Cube
        return (
          <mesh>
            <boxGeometry args={[0.8, 0.8, 0.8]} />
            {material}
          </mesh>
        );

      case 'image':
        // Sphere
        return (
          <mesh>
            <sphereGeometry args={[0.5, 32, 32]} />
            {material}
          </mesh>
        );

      case 'placeholder':
      default:
        // Small sphere
        return (
          <mesh>
            <sphereGeometry args={[0.4, 24, 24]} />
            {material}
          </mesh>
        );
    }
  };

  // Combined hover state (mouse or hand)
  const isAnyHover = hovered || isHandHovered;

  return (
    <group
      ref={groupRef}
      position={[node.position.x, node.position.y, node.position.z]}
    >
      {/* The 3D shape */}
      <mesh
        ref={meshRef}
        onClick={handleClick}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
      >
        {renderShape()}
      </mesh>

      {/* Glow effect ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
        <ringGeometry args={[0.6, 0.8, 32]} />
        <meshBasicMaterial
          color={isHandGrabbed ? '#ff6b9d' : baseColor}
          transparent
          opacity={isHandGrabbed ? 0.6 : isAnyHover ? 0.4 : 0.15}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Title label floating above */}
      {node.title && (
        <Html
          position={[0, 1, 0]}
          center
          distanceFactor={8}
          style={{ pointerEvents: 'none' }}
        >
          <div
            style={{
              background: 'rgba(0, 0, 0, 0.7)',
              backdropFilter: 'blur(8px)',
              color: '#fff',
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              letterSpacing: '0.02em',
              border: `1px solid ${node.color || TYPE_COLORS[node.type]}`,
              boxShadow: `0 0 12px ${node.color || TYPE_COLORS[node.type]}40`,
            }}
          >
            {node.title}
          </div>
        </Html>
      )}

      {/* Content popup on select */}
      {(selected || isTopFocus) && node.content && (
        <Html
          position={[0, -1.2, 0]}
          center
          distanceFactor={8}
          style={{ pointerEvents: 'auto' }}
        >
          <div
            style={{
              background: 'rgba(20, 20, 30, 0.95)',
              backdropFilter: 'blur(12px)',
              color: '#e0e0e0',
              padding: '12px 16px',
              borderRadius: '10px',
              fontSize: '11px',
              lineHeight: 1.6,
              maxWidth: '240px',
              minWidth: '140px',
              border: `1px solid ${node.color || TYPE_COLORS[node.type]}50`,
              boxShadow: `0 4px 20px rgba(0,0,0,0.4), 0 0 15px ${node.color || TYPE_COLORS[node.type]}30`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ marginBottom: '8px', color: '#fff', fontWeight: 500 }}>
              {node.content}
            </div>
            {node.badges && node.badges.length > 0 && (
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '8px' }}>
                {node.badges.map((b) => (
                  <span
                    key={b.id}
                    style={{
                      fontSize: '9px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background:
                        b.type === 'warning' ? '#fff3cd' :
                        b.type === 'error' ? '#f8d7da' :
                        b.type === 'success' ? '#d4edda' : '#d1ecf1',
                      color:
                        b.type === 'warning' ? '#856404' :
                        b.type === 'error' ? '#721c24' :
                        b.type === 'success' ? '#155724' : '#0c5460',
                    }}
                  >
                    {b.message}
                  </span>
                ))}
              </div>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSelected(false);
              }}
              style={{
                position: 'absolute',
                top: '4px',
                right: '6px',
                background: 'none',
                border: 'none',
                color: '#888',
                cursor: 'pointer',
                fontSize: '14px',
                padding: '2px',
              }}
            >
              ×
            </button>
          </div>
        </Html>
      )}
    </group>
  );
}
