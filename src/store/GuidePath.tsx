import { useMemo, useRef } from "react";
import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { buildGuidancePath } from "./layout";
import type { Vec3Tuple } from "./types";

export function GuidePath({ start, target }: { start: Vec3Tuple; target: Vec3Tuple | null }) {
  const marker = useRef<THREE.Mesh>(null);
  const points = useMemo(() => (target ? buildGuidancePath(start, target) : []), [start, target]);
  const curve = useMemo(() => (points.length > 1 ? new THREE.CatmullRomCurve3(points, false, "centripetal") : null), [points]);
  useFrame(({ clock }) => {
    if (!marker.current || !curve) return;
    marker.current.position.copy(curve.getPoint((clock.elapsedTime * 0.12) % 1));
  });
  if (!target || points.length < 2 || !curve) return null;
  return (
    <group name="store-directory-route">
      <Line points={points} color="#ffd84d" lineWidth={5} transparent opacity={0.78} depthTest={false} renderOrder={12} />
      <Line points={points} color="#fff5b2" lineWidth={1.5} transparent opacity={0.95} depthTest={false} renderOrder={13} />
      <mesh ref={marker} position={points[0]} renderOrder={14}>
        <sphereGeometry args={[0.12, 16, 12]} />
        <meshBasicMaterial color="#fff8c2" toneMapped={false} depthTest={false} />
        <pointLight color="#ffd84d" intensity={2.6} distance={3.2} />
      </mesh>
    </group>
  );
}

