'use client';

import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars, Grid } from '@react-three/drei';
import { useCanvasStore } from '@/store/canvas-store';
import { IdeaNode } from './IdeaNode';
import { ConnectionLine } from './ConnectionLine';
import { BuilderAvatar } from './BuilderAvatar';
import { HandCursor } from './HandCursor';

function SceneContent() {
  const nodes = useCanvasStore((s) => s.nodes);
  const connections = useCanvasStore((s) => s.connections);

  return (
    <>
      {/* Environment */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 10, 5]} intensity={0.8} />
      <Stars radius={100} depth={50} count={2000} factor={4} fade speed={1} />
      <Grid
        position={[0, -1, 0]}
        args={[40, 40]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#1a1a2e"
        sectionSize={4}
        sectionThickness={1}
        sectionColor="#2a2a4e"
        fadeDistance={30}
        infiniteGrid
      />

      {/* Idea nodes */}
      {Object.values(nodes).map((node) => (
        <IdeaNode key={node.id} node={node} />
      ))}

      {/* Connections */}
      {Object.values(connections).map((conn) => (
        <ConnectionLine key={conn.id} connection={conn} />
      ))}

      {/* Builder avatar */}
      <BuilderAvatar />

      {/* Hand cursor (follows hand tracking) */}
      <HandCursor />

      {/* Camera controls */}
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.1}
        minDistance={2}
        maxDistance={50}
        enablePan
      />
    </>
  );
}

export function Workshop3DCanvas() {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0a0a1a' }}>
      <Canvas
        camera={{ position: [0, 3, 8], fov: 60 }}
        gl={{ antialias: true, alpha: false }}
        style={{ background: '#0a0a1a' }}
      >
        <SceneContent />
      </Canvas>
    </div>
  );
}
