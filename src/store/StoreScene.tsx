import { useEffect, useRef } from "react";
import { AdaptiveDpr, ContactShadows } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { StoreMedia, PlayerPose, Vec3Tuple } from "./types";
import { GuidePath } from "./GuidePath";
import { HeldCase, MovieCases } from "./MovieCases";
import { StoreController } from "./StoreController";
import { StoreEnvironment } from "./StoreEnvironment";
import { StoreLighting } from "./StoreLighting";

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
      <AdaptiveDpr />
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
