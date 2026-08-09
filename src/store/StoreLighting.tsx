import { useRef } from "react";
import { BakeShadows } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

function TrofferLight({ x, z, dead = false, flicker = false }: { x: number; z: number; dead?: boolean; flicker?: boolean }) {
  const light = useRef<THREE.RectAreaLight>(null);
  const nominalPower = dead ? 90 : 6800;
  useFrame(({ clock }) => {
    if (!light.current || !flicker || dead) return;
    const drop = Math.sin(clock.elapsedTime * 37) > 0.82 ? 0.2 : 1;
    light.current.power = THREE.MathUtils.lerp(light.current.power, nominalPower * drop, 0.24);
  });
  return (
    <rectAreaLight
      ref={light}
      position={[x, 5.34, z]}
      rotation={[-Math.PI / 2, 0, 0]}
      width={5.2}
      height={0.52}
      power={nominalPower}
      color={dead ? "#708078" : "#d9f1df"}
    />
  );
}

export function StoreLighting() {
  return (
    <group name="store-lighting">
      <hemisphereLight args={["#d8e7df", "#102142", 0.68]} />
      <ambientLight color="#bfd0c7" intensity={0.16} />
      {[-12, -4, 4, 12].map((x) =>
        [-15, -5, 15].map((z) => (
          <TrofferLight
            key={`${x}:${z}`}
            x={x}
            z={z}
            dead={x === 12 && z === 15}
            flicker={x === -4 && z === -5}
          />
        )),
      )}
      <directionalLight
        position={[3, 8, 12]}
        intensity={0.42}
        color="#b7ccbf"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={24}
        shadow-camera-bottom={-24}
        shadow-bias={-0.0004}
      />
      <BakeShadows />
    </group>
  );
}
