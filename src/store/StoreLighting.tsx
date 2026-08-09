import { useMemo, useRef } from "react";
import { BakeShadows, Environment, Lightformer, SoftShadows } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";

RectAreaLightUniformsLib.init();

function StoreImageBasedLighting() {
  return (
    <Environment resolution={256} background={false} environmentIntensity={0.46}>
      <color attach="background" args={["#11191b"]} />
      {[-8, 0, 8].map((x) => (
        <Lightformer
          key={x}
          form="rect"
          color="#e5f5e8"
          intensity={4.2}
          position={[x, 5.2, -1]}
          rotation={[Math.PI / 2, 0, 0]}
          scale={[5.8, 0.42, 1]}
        />
      ))}
      <Lightformer form="rect" color="#90b9df" intensity={1.4} position={[0, 1.2, 8]} scale={[10, 3.2, 1]} />
      <Lightformer form="rect" color="#edc88d" intensity={0.8} position={[0, 1.6, -8]} rotation={[0, Math.PI, 0]} scale={[8, 2.5, 1]} />
    </Environment>
  );
}

function TrofferLight({ x, z, flicker = false }: { x: number; z: number; flicker?: boolean }) {
  const light = useRef<THREE.RectAreaLight>(null);
  const nominalPower = 1450;
  useFrame(({ clock }) => {
    if (!light.current || !flicker) return;
    const drop = Math.sin(clock.elapsedTime * 37) > 0.82 ? 0.2 : 1;
    light.current.power = THREE.MathUtils.lerp(light.current.power, nominalPower * drop, 0.24);
  });
  return (
    <rectAreaLight
      ref={light}
      position={[x, 3.28, z]}
      rotation={[-Math.PI / 2, 0, 0]}
      width={8.5}
      height={9}
      power={nominalPower}
      color="#d9f1df"
    />
  );
}

function AisleShadowLight({ x, z }: { x: number; z: number }) {
  const target = useMemo(() => {
    const object = new THREE.Object3D();
    object.position.set(x, 0, z - 0.7);
    return object;
  }, [x, z]);
  return (
    <>
      <primitive object={target} />
      <spotLight
        position={[x, 3.34, z]}
        target={target}
        angle={0.92}
        penumbra={0.92}
        intensity={72}
        distance={12.5}
        decay={2}
        color="#d9f1df"
        castShadow
        shadow-mapSize={[1536, 1536]}
        shadow-bias={-0.0007}
        shadow-normalBias={0.018}
      />
    </>
  );
}

export function StoreLighting() {
  return (
    <group name="store-lighting">
      <SoftShadows size={22} samples={8} focus={0.78} />
      <StoreImageBasedLighting />
      <hemisphereLight args={["#d8e7df", "#172036", 0.24]} />
      <ambientLight color="#bfd0c7" intensity={0.045} />
      <TrofferLight x={-8} z={-10} flicker />
      <TrofferLight x={8} z={-10} />
      <TrofferLight x={-8} z={10} />
      <TrofferLight x={8} z={10} />
      <AisleShadowLight x={-6.55} z={-4.7} />
      <AisleShadowLight x={6.55} z={-4.7} />
      <directionalLight
        position={[3, 6, 12]}
        intensity={0.38}
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
