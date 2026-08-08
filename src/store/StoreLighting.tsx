import { BakeShadows } from "@react-three/drei";

export function StoreLighting() {
  return (
    <group name="store-lighting">
      <hemisphereLight args={["#dbe8ff", "#071127", 1.45]} />
      <ambientLight color="#d8e3ff" intensity={0.52} />
      {[-12, -4, 4, 12].map((x) =>
        [-15, -5, 5, 15].map((z) => (
          <rectAreaLight
            key={`${x}:${z}`}
            position={[x, 5.35, z]}
            rotation={[-Math.PI / 2, 0, 0]}
            width={5.2}
            height={0.45}
            intensity={2.15}
            color={z < -10 ? "#dce8ff" : "#fff7dd"}
          />
        )),
      )}
      <directionalLight
        position={[3, 8, 12]}
        intensity={0.48}
        color="#b8d4ff"
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

