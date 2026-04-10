'use client';

import { useThree } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette, N8AO } from '@react-three/postprocessing';

interface PostProcessingProps {
  /** Set to false to disable all post-processing effects for performance */
  enabled?: boolean;
}

/**
 * Post-processing effects for the 3D scene.
 * Adds bloom (emissive glow), ambient occlusion (depth shadows), and vignette.
 */
export function PostProcessing({ enabled = true }: PostProcessingProps) {
  const { gl } = useThree();

  // Guard against WebGL context not being ready
  if (!enabled || !gl) return null;

  return (
    <EffectComposer>
      {/* Bloom - makes emissive materials glow */}
      <Bloom
        intensity={1.2}
        luminanceThreshold={0.2}
        luminanceSmoothing={0.9}
        mipmapBlur
      />

      {/* N8AO - fast ambient occlusion for depth */}
      <N8AO
        aoRadius={0.5}
        intensity={1.0}
        distanceFalloff={0.5}
        color="#000011"
      />

      {/* Vignette - subtle edge darkening */}
      <Vignette
        offset={0.3}
        darkness={0.6}
      />
    </EffectComposer>
  );
}
