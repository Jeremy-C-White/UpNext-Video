import { useMemo, useRef } from "react";
import { Environment, Lightformer } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import { ISLAND_CENTERS } from "./layout";

RectAreaLightUniformsLib.init();

function StoreImageBasedLighting() {
  return (
    <Environment resolution={256} background={false} environmentIntensity={0.72}>
      <color attach="background" args={["#26343a"]} />
      {[-5, 0, 5].map((x) => (
        <Lightformer
          key={x}
          form="rect"
          color="#e5f5e8"
          intensity={4.2}
          position={[x, 4.6, -1]}
          rotation={[Math.PI / 2, 0, 0]}
          scale={[4.3, 0.42, 1]}
        />
      ))}
      <Lightformer form="rect" color="#90b9df" intensity={1.4} position={[0, 1.2, 7]} scale={[7, 3.2, 1]} />
      <Lightformer form="rect" color="#edc88d" intensity={0.8} position={[0, 1.6, -7]} rotation={[0, Math.PI, 0]} scale={[7, 2.5, 1]} />
    </Environment>
  );
}

function TrofferLight({ x, z, flicker = false }: { x: number; z: number; flicker?: boolean }) {
  const light = useRef<THREE.RectAreaLight>(null);
  const width = 5.8;
  const height = 5.6;
  // Match the pre-shrink brightness without coupling the result to R3F's prop
  // assignment order for RectAreaLight.power, width, and height.
  const nominalIntensity = 720 / (width * height * Math.PI);
  useFrame(({ clock }) => {
    if (!light.current || !flicker) return;
    const drop = Math.sin(clock.elapsedTime * 37) > 0.82 ? 0.2 : 1;
    light.current.intensity = THREE.MathUtils.lerp(light.current.intensity, nominalIntensity * drop, 0.24);
  });
  return (
    <rectAreaLight
      ref={light}
      position={[x, 3.28, z]}
      rotation={[-Math.PI / 2, 0, 0]}
      width={width}
      height={height}
      intensity={nominalIntensity}
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
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0007}
        shadow-normalBias={0.018}
      />
    </>
  );
}

export function StoreLighting() {
  // Drei 10.7's SoftShadows mutates a Three.js shader chunk using an obsolete
  // r185 layout and makes every Standard/Physical material fail compilation.
  // StoreView's native PCFSoftShadowMap is the compatible soft-shadow path.
  return (
    <group name="store-lighting">
      <StoreImageBasedLighting />
      <hemisphereLight args={["#d8e7df", "#172036", 0.24]} />
      <ambientLight color="#bfd0c7" intensity={0.075} />
      <TrofferLight x={-4.2} z={-5.8} flicker />
      <TrofferLight x={4.2} z={-5.8} />
      <TrofferLight x={-4.2} z={5.8} />
      <TrofferLight x={4.2} z={5.8} />
      <AisleShadowLight x={ISLAND_CENTERS.west} z={ISLAND_CENTERS.z + 0.6} />
      <AisleShadowLight x={ISLAND_CENTERS.east} z={ISLAND_CENTERS.z + 0.6} />
      <directionalLight
        position={[3, 6, 12]}
        intensity={0.38}
        color="#b7ccbf"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-bias={-0.0004}
      />
    </group>
  );
}
