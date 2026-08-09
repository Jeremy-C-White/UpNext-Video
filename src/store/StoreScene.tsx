import { useEffect, useRef } from "react";
import { AdaptiveDpr, ContactShadows } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import * as THREE from "three";
import type { StoreMedia, PlayerPose, Vec3Tuple } from "./types";
import { GuidePath } from "./GuidePath";
import { HeldCase, MovieCases } from "./MovieCases";
import { StoreController } from "./StoreController";
import { StoreEnvironment } from "./StoreEnvironment";
import { StoreLighting } from "./StoreLighting";
import { setPosterTextureAnisotropy } from "./posterTextures";

interface Props {
  entered: boolean;
  items: StoreMedia[];
  hoveredId: string | null;
  selected: StoreMedia | null;
  flipped: boolean;
  paused: boolean;
  playerPose: PlayerPose;
  guideTarget: Vec3Tuple | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  onReturnCase: () => void;
  onOpenFinder: () => void;
  onToggleMap: () => void;
  onLockChange: (locked: boolean) => void;
  onPoseChange: (pose: PlayerPose) => void;
  prewarm: boolean;
  onReady: () => void;
}

function RendererWarmup({ enabled, onReady }: { enabled: boolean; onReady: () => void }) {
  const { gl, scene, camera } = useThree();
  const completed = useRef(false);

  useEffect(() => {
    if (!enabled || completed.current) return;
    let active = true;
    const frame = window.requestAnimationFrame(() => {
      const renderer = gl as THREE.WebGLRenderer;
      const compilation = typeof renderer.compileAsync === "function"
        ? renderer.compileAsync(scene, camera)
        : Promise.resolve(renderer.compile(scene, camera));
      void compilation
        .catch((error) => console.warn("Store shader prewarm was incomplete.", error))
        .finally(() => {
          if (!active) return;
          completed.current = true;
          onReady();
        });
    });
    return () => {
      active = false;
      window.cancelAnimationFrame(frame);
    };
  }, [camera, enabled, gl, onReady, scene]);

  return null;
}

function TextureQualityController() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const maxAnisotropy = Math.min(16, gl.capabilities.getMaxAnisotropy());
    setPosterTextureAnisotropy(maxAnisotropy);
    const textureProperties = ["map", "normalMap", "roughnessMap", "bumpMap", "metalnessMap", "clearcoatNormalMap"];
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      materials.forEach((material) => {
        const values = material as THREE.Material & Record<string, unknown>;
        textureProperties.forEach((property) => {
          const texture = values[property];
          if (!(texture instanceof THREE.Texture)) return;
          texture.anisotropy = maxAnisotropy;
          texture.needsUpdate = true;
        });
      });
    });
  }, [gl, scene]);
  return null;
}

export function StorePostProcessing() {
  return (
    <EffectComposer multisampling={0} resolutionScale={0.75}>
      <N8AO
        halfRes
        quality="performance"
        aoRadius={0.35}
        distanceFalloff={0.7}
        intensity={1.05}
        aoSamples={8}
        denoiseSamples={4}
        denoiseRadius={8}
      />
      <Bloom
        mipmapBlur
        intensity={0.22}
        luminanceThreshold={1.7}
        luminanceSmoothing={0.18}
        radius={0.55}
      />
      <Vignette eskil={false} offset={0.2} darkness={0.22} />
      <SMAA />
      <ToneMapping mode={ToneMappingMode.AGX} />
    </EffectComposer>
  );
}

export function StoreScene(props: Props) {
  const { selected, guideTarget, playerPose } = props;
  return (
    <>
      <StoreLighting />
      <StoreEnvironment entered={props.entered} />
      <MovieCases items={props.items} hoveredId={props.hoveredId} selectedId={selected?.id || null} />
      <HeldCase item={selected} flipped={props.flipped} />
      <GuidePath start={[playerPose.x, 0.035, playerPose.z]} target={guideTarget} />
      <ContactShadows position={[0, 0.025, 0]} scale={38} opacity={0.24} blur={2.7} far={6.5} resolution={512} frames={1} />
      <StorePostProcessing />
      <AdaptiveDpr />
      <TextureQualityController />
      <RendererWarmup enabled={props.prewarm} onReady={props.onReady} />
      <StoreController
        paused={props.paused}
        selectedId={selected?.id || null}
        onHover={props.onHover}
        onSelect={props.onSelect}
        onReturnCase={props.onReturnCase}
        onOpenFinder={props.onOpenFinder}
        onToggleMap={props.onToggleMap}
        onLockChange={props.onLockChange}
        onPoseChange={props.onPoseChange}
      />
    </>
  );
}
