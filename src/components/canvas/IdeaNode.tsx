'use client';

import React, { Suspense } from 'react';
import { Html, RoundedBox, useGLTF } from '@react-three/drei';
import { useRef, useState, useMemo, useEffect } from 'react';
import { useFrame, ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { CanvasNode, NodeType, NodeShape, Vec3 } from '@/core/types';
import { useCanvasStore } from '@/store/canvas-store';
import { useHandStore } from '@/store/hand-store';
import { ComponentGenerator } from './generators';

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

// Target size for loaded meshes (fits in roughly 2x2x2 units)
const TARGET_MESH_SIZE = 2;

// Extract color from material, falling back to gray
function extractMaterialColor(material: THREE.Material): THREE.Color {
  if (material instanceof THREE.MeshStandardMaterial ||
      material instanceof THREE.MeshPhysicalMaterial ||
      material instanceof THREE.MeshBasicMaterial ||
      material instanceof THREE.MeshLambertMaterial ||
      material instanceof THREE.MeshPhongMaterial) {
    return material.color.clone();
  }
  return new THREE.Color(0x888888);
}

// Scale a loaded GLB scene to fit within TARGET_MESH_SIZE, preserving materials and textures
function optimizeAndScaleScene(scene: THREE.Object3D): { scene: THREE.Object3D; scale: number } {
  let totalTriangles = 0;
  let textureCount = 0;
  let meshCount = 0;

  // Count triangles and textures for logging (don't modify anything)
  scene.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      meshCount++;
      const geometry = child.geometry;

      if (geometry.index) {
        totalTriangles += geometry.index.count / 3;
      } else if (geometry.attributes.position) {
        totalTriangles += geometry.attributes.position.count / 3;
      }

      // Count textures
      if (child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((mat) => {
          if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
            if (mat.map) textureCount++;
            if (mat.normalMap) textureCount++;
            if (mat.roughnessMap) textureCount++;
            if (mat.metalnessMap) textureCount++;
            if (mat.aoMap) textureCount++;
            if (mat.emissiveMap) textureCount++;
          }
        });
      }
    }
  });

  // Compute bounding box and scale to fit target size
  const box = new THREE.Box3().setFromObject(scene);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDimension = Math.max(size.x, size.y, size.z);
  const scale = maxDimension > 0 ? TARGET_MESH_SIZE / maxDimension : 1;

  // Center the scene
  const center = new THREE.Vector3();
  box.getCenter(center);
  scene.position.sub(center.multiplyScalar(scale));

  console.log(`[MESH] Loaded: ${totalTriangles.toLocaleString()} triangles, ${meshCount} meshes, ${textureCount} textures, scale: ${scale.toFixed(3)}`);

  return { scene, scale };
}

// Error fallback box for failed mesh loads
function MeshErrorFallback({ color }: { color: string }) {
  return (
    <mesh>
      <boxGeometry args={[1.5, 1.5, 1.5]} />
      <meshStandardMaterial color={color} opacity={0.7} transparent />
    </mesh>
  );
}

// React Error Boundary for catching render crashes
interface MeshErrorBoundaryProps {
  children: React.ReactNode;
  fallbackColor: string;
}

interface MeshErrorBoundaryState {
  hasError: boolean;
}

class MeshErrorBoundary extends React.Component<MeshErrorBoundaryProps, MeshErrorBoundaryState> {
  constructor(props: MeshErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): MeshErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.warn('[MESH] Render crashed, using fallback:', error.message, errorInfo);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <mesh>
          <boxGeometry args={[1.5, 1.5, 1.5]} />
          <meshStandardMaterial color={this.props.fallbackColor} opacity={0.7} transparent />
        </mesh>
      );
    }
    return this.props.children;
  }
}

// Component to render a loaded GLB mesh with aggressive optimization
function LoadedMesh({ url, color, nodeId }: { url: string; color: string; nodeId: string }) {
  const [error, setError] = useState(false);
  const [optimizedScene, setOptimizedScene] = useState<{ scene: THREE.Object3D; scale: number } | null>(null);

  // Load the GLB
  const gltf = useGLTF(url);

  // Optimize on load
  useEffect(() => {
    if (gltf.scene && !error) {
      try {
        const cloned = gltf.scene.clone();
        const result = optimizeAndScaleScene(cloned);
        // Stamp nodeId on all children so geometryAnalyzer can find this mesh
        result.scene.traverse((child) => {
          child.userData = { ...child.userData, nodeId };
        });
        setOptimizedScene(result);
      } catch (e) {
        console.error('[MESH] Optimization failed:', e);
        setError(true);
      }
    }
  }, [gltf.scene, error, nodeId]);

  // Handle loading errors
  if (error) {
    return <MeshErrorFallback color={color} />;
  }

  if (!optimizedScene) {
    return <MeshLoadingPlaceholder />;
  }

  return (
    <primitive
      object={optimizedScene.scene}
      scale={[optimizedScene.scale, optimizedScene.scale, optimizedScene.scale]}
    />
  );
}

// Wrapper with error boundary
function SafeLoadedMesh({ url, color, nodeId }: { url: string; color: string; nodeId: string }) {
  return (
    <MeshErrorBoundary fallbackColor={color}>
      <LoadedMesh url={url} color={color} nodeId={nodeId} />
    </MeshErrorBoundary>
  );
}

// Wireframe placeholder for loading meshes (with pulsing animation)
function MeshLoadingPlaceholder() {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.5;
      // Pulse scale
      const pulse = 1 + Math.sin(Date.now() * 0.003) * 0.1;
      meshRef.current.scale.setScalar(pulse);
    }
  });

  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color="#888888" wireframe />
    </mesh>
  );
}

// 2D preview billboard placeholder (shown while 3D mesh generates)
function MeshPreviewPlaceholder({ previewUrl }: { previewUrl: string }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  // Load the preview image as a texture
  useEffect(() => {
    const loader = new THREE.TextureLoader();
    loader.load(
      previewUrl,
      (loadedTexture) => {
        loadedTexture.colorSpace = THREE.SRGBColorSpace;
        setTexture(loadedTexture);
      },
      undefined,
      (error) => {
        console.warn('[MESH PREVIEW] Failed to load preview image:', error);
      }
    );

    return () => {
      if (texture) {
        texture.dispose();
      }
    };
  }, [previewUrl]);

  // Gentle floating animation
  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.2;
    }
  });

  if (!texture) {
    // Fall back to wireframe while texture loads
    return <MeshLoadingPlaceholder />;
  }

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[2, 2]} />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={0.9}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
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

  // Create hexagonal geometry for hexagon shape
  const hexGeometry = useMemo(() => {
    if (node.shape === 'hexagon') {
      const geo = createHexagonalPrismGeometry(0.5, 0.3);
      geo.center();
      geo.rotateX(Math.PI / 2);
      return geo;
    }
    return null;
  }, [node.shape]);

  // Compute rotation from metadata (degrees to radians)
  const nodeRotation = useMemo(() => {
    const rot = (node.metadata?.rotation as Vec3) || { x: 0, y: 0, z: 0 };
    return [
      (rot.x * Math.PI) / 180,
      (rot.y * Math.PI) / 180,
      (rot.z * Math.PI) / 180,
    ] as [number, number, number];
  }, [node.metadata?.rotation]);

  // Compute scale from node.scale or metadata.uniformScale
  const nodeScale = useMemo(() => {
    if (node.scale) return [node.scale.x, node.scale.y, node.scale.z] as [number, number, number];
    const s = (node.metadata?.uniformScale as number) || 1;
    return [s, s, s] as [number, number, number];
  }, [node.scale, node.metadata?.uniformScale]);

  // Animation: gentle float + hover pulse
  useFrame((_, delta) => {
    if (meshRef.current) {
      // Only apply floating and rotation to primitive shape nodes (not components or GLB meshes)
      // Components and meshes need to stay oriented correctly for Mechanic rotations to work
      if (!node.component && !node.meshUrl) {
        // Gentle floating animation
        const floatOffset = Math.sin(Date.now() * 0.001 + node.position.x * 2) * 0.02;
        meshRef.current.position.y = node.position.y + floatOffset;

        // Slow rotation
        meshRef.current.rotation.y += delta * 0.1;
      }
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

  // Render the appropriate 3D shape based on node.shape (type determines color, shape determines geometry)
  const renderShape = () => {
    // If node has a loaded GLB mesh, render it with error handling
    if (node.meshUrl) {
      return (
        <Suspense fallback={<MeshLoadingPlaceholder />}>
          <SafeLoadedMesh url={node.meshUrl} color={node.color || TYPE_COLORS[node.type]} nodeId={node.id} />
        </Suspense>
      );
    }

    // If mesh is loading, show preview billboard or wireframe placeholder
    if (node.meshLoading) {
      // If we have a preview image, show it as a billboard
      if (node.meshPreviewUrl) {
        return <MeshPreviewPlaceholder previewUrl={node.meshPreviewUrl} />;
      }
      // Otherwise show wireframe cube
      return <MeshLoadingPlaceholder />;
    }

    // If node has component data, render the electronic component instead of primitive shape
    if (node.component) {
      const rotation = node.component.rotation;
      return (
        <group rotation={rotation ? [rotation.x, rotation.y, rotation.z] : [0, 0, 0]}>
          <ComponentGenerator
            componentType={node.component.componentType}
            params={node.component.params}
            color={node.color}
          />
        </group>
      );
    }

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

    // Use node.shape for geometry, fallback to sphere for backward compatibility
    const shape: NodeShape = node.shape || 'sphere';

    switch (shape) {
      case 'sphere':
        // Smooth, medium-sized sphere for concepts and abstract ideas
        return (
          <mesh>
            <sphereGeometry args={[0.5, 32, 32]} />
            {material}
          </mesh>
        );

      case 'cube':
        // Solid, blocky shape for components and concrete things
        return (
          <RoundedBox args={[0.9, 0.9, 0.9]} radius={0.06} smoothness={4}>
            {material}
          </RoundedBox>
        );

      case 'hexagon':
        // Hexagonal prism for categories and groups
        return hexGeometry ? (
          <mesh geometry={hexGeometry}>
            {material}
          </mesh>
        ) : null;

      case 'cylinder':
        // Tall pillar shape for processes and flows
        return (
          <mesh>
            <cylinderGeometry args={[0.35, 0.35, 1.0, 24]} />
            {material}
          </mesh>
        );

      case 'torus':
        // Clear ring shape for questions and unknowns
        return (
          <mesh>
            <torusGeometry args={[0.4, 0.15, 16, 32]} />
            {material}
          </mesh>
        );

      case 'cone':
        // Pointed shape for decisions and direction
        return (
          <mesh>
            <coneGeometry args={[0.45, 0.9, 24]} />
            {material}
          </mesh>
        );

      case 'octahedron':
        // Diamond-like shape for constraints and rules
        return (
          <mesh>
            <octahedronGeometry args={[0.55]} />
            {material}
          </mesh>
        );

      case 'dodecahedron':
        // Complex polyhedron for multifaceted concepts
        return (
          <mesh>
            <dodecahedronGeometry args={[0.5]} />
            {material}
          </mesh>
        );

      case 'knot':
        // Torus knot for dependencies and entanglements
        return (
          <mesh>
            <torusKnotGeometry args={[0.3, 0.1, 64, 8]} />
            {material}
          </mesh>
        );

      case 'icosahedron':
        // Faceted sphere for data points and metrics
        return (
          <mesh>
            <icosahedronGeometry args={[0.5]} />
            {material}
          </mesh>
        );

      default:
        // Fallback to sphere
        return (
          <mesh>
            <sphereGeometry args={[0.5, 32, 32]} />
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
      {/* Inner group for rotation and scale - node rotates in place, not around origin */}
      <group rotation={nodeRotation} scale={nodeScale}>
        {/* The 3D shape */}
        <mesh
          ref={meshRef}
          onClick={handleClick}
          onPointerOver={handlePointerOver}
          onPointerOut={handlePointerOut}
        >
          {renderShape()}
        </mesh>
      </group>

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
