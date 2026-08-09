import { useEffect, useRef } from "react";
import { BakeShadows } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";

RectAreaLightUniformsLib.init();

function StoreImageBasedLighting() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const previousEnvironment = scene.environment;
    const previousIntensity = scene.environmentIntensity;
    const room = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(gl);
    pmrem.compileCubemapShader();
    const target = pmrem.fromScene(room, 0.04);
    scene.environment = target.texture;
    scene.environmentIntensity = 0.35;
    return () => {
      scene.environment = previousEnvironment;
      scene.environmentIntensity = previousIntensity;
      target.dispose();
      pmrem.dispose();
      room.dispose();
    };
  }, [gl, scene]);
  return null;
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

export function StoreLighting() {
  return (
    <group name="store-lighting">
      <StoreImageBasedLighting />
      <hemisphereLight args={["#d8e7df", "#172036", 0.24]} />
      <ambientLight color="#bfd0c7" intensity={0.045} />
      <TrofferLight x={-8} z={-10} flicker />
      <TrofferLight x={8} z={-10} />
      <TrofferLight x={-8} z={10} />
      <TrofferLight x={8} z={10} />
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
