import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { usePosterTexture } from "./posterTextures";
import type { StoreMedia } from "./types";

const posterGeometry = new THREE.PlaneGeometry(0.61, 0.88);

function PosterFace({ item, hovered, selected }: { item: StoreMedia; hovered: boolean; selected: boolean }) {
  const texture = usePosterTexture(item.posterUrl, "shelf");
  const [x, y, z] = item.placement.position;
  const normalX = Math.sin(item.placement.rotationY);
  const normalZ = Math.cos(item.placement.rotationY);
  const faceOffset = 0.056 + (hovered ? 0.065 : 0);

  if (selected) return null;
  return (
    <mesh
      position={[x + normalX * faceOffset, y, z + normalZ * faceOffset]}
      rotation={[0, item.placement.rotationY, 0]}
      scale={hovered ? 1.075 : 1}
      userData={{ storeItemId: item.id }}
      frustumCulled
      renderOrder={hovered ? 3 : 1}
    >
      <primitive object={posterGeometry} attach="geometry" dispose={null} />
      <meshBasicMaterial
        map={texture}
        color={hovered ? "#fff4c4" : "#ffffff"}
        toneMapped={false}
        side={THREE.FrontSide}
      />
      {hovered && <pointLight position={[0, 0, 0.22]} color="#ffd84f" intensity={1.8} distance={2.1} />}
    </mesh>
  );
}

function CaseBodies({ items, selectedId }: { items: StoreMedia[]; selectedId: string | null }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const quaternion = useMemo(() => new THREE.Quaternion(), []);
  const position = useMemo(() => new THREE.Vector3(), []);
  const scale = useMemo(() => new THREE.Vector3(), []);
  const euler = useMemo(() => new THREE.Euler(), []);

  useLayoutEffect(() => {
    if (!ref.current) return;
    items.forEach((item, index) => {
      position.set(...item.placement.position);
      euler.set(0, item.placement.rotationY, 0);
      quaternion.setFromEuler(euler);
      scale.setScalar(item.id === selectedId ? 0.001 : 1);
      matrix.compose(position, quaternion, scale);
      ref.current!.setMatrixAt(index, matrix);
    });
    ref.current.count = items.length;
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [euler, items, matrix, position, quaternion, scale, selectedId]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, items.length]} castShadow receiveShadow>
      <boxGeometry args={[0.68, 0.96, 0.1]} />
      <meshStandardMaterial color="#10151e" roughness={0.38} metalness={0.08} />
    </instancedMesh>
  );
}

function wrapText(context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines: number) {
  const words = text.split(/\s+/);
  let line = "";
  let lineNumber = 0;
  for (const word of words) {
    const test = `${line}${word} `;
    if (context.measureText(test).width > maxWidth && line) {
      context.fillText(line.trim(), x, y + lineNumber * lineHeight);
      line = `${word} `;
      lineNumber += 1;
      if (lineNumber >= maxLines) break;
    } else {
      line = test;
    }
  }
  if (lineNumber < maxLines) context.fillText(line.trim(), x, y + lineNumber * lineHeight);
}

function createBackTexture(item: StoreMedia) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 768;
  const context = canvas.getContext("2d")!;
  const gradient = context.createLinearGradient(0, 0, 512, 768);
  gradient.addColorStop(0, "#173d91");
  gradient.addColorStop(0.48, "#0c2b68");
  gradient.addColorStop(1, "#071738");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 512, 768);
  context.strokeStyle = "#f5d64f";
  context.lineWidth = 12;
  context.strokeRect(18, 18, 476, 732);
  context.fillStyle = "#f5d64f";
  context.fillRect(36, 38, 440, 106);
  context.fillStyle = "#082050";
  context.font = "bold 35px Arial";
  context.textAlign = "center";
  context.fillText(item.name.slice(0, 28), 256, 103);
  context.fillStyle = "#ffffff";
  context.font = "bold 19px Arial";
  context.textAlign = "left";
  context.fillText("THE STORY", 54, 196);
  context.font = "17px Arial";
  context.fillStyle = "#e8eefc";
  wrapText(context, item.summary, 54, 235, 404, 27, 11);
  context.fillStyle = "#f5d64f";
  context.fillRect(54, 565, 404, 3);
  context.fillStyle = "#ffffff";
  context.font = "bold 17px Arial";
  const metadata = [item.year, item.runtime ? `${item.runtime} MIN` : undefined, item.rating ? `★ ${item.rating.toFixed(1)}` : undefined]
    .filter(Boolean)
    .join("  ·  ");
  context.fillText(metadata || "NEXTUP VIDEO EXCLUSIVE", 54, 610);
  context.font = "15px Arial";
  context.fillStyle = "#c9d7fa";
  wrapText(context, item.genres.join(" · ") || item.department, 54, 648, 404, 23, 2);
  context.fillStyle = "#f5d64f";
  context.font = "bold 16px Arial";
  context.fillText("THIS PRODUCT USES THE TMDB API.", 54, 711);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function HeldCase({ item, flipped }: { item: StoreMedia | null; flipped: boolean }) {
  const group = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const texture = usePosterTexture(item?.posterUrl || "", "inspect");
  const backTexture = useMemo(() => (item ? createBackTexture(item) : null), [item]);
  const targetPosition = useMemo(() => new THREE.Vector3(), []);
  const targetQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const flipQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const yAxis = useMemo(() => new THREE.Vector3(0, 1, 0), []);

  useEffect(() => () => backTexture?.dispose(), [backTexture]);

  useFrame((_, delta) => {
    if (!group.current || !item) return;
    targetPosition.set(0.52, -0.16, -1.28).applyQuaternion(camera.quaternion).add(camera.position);
    targetQuaternion.copy(camera.quaternion);
    flipQuaternion.setFromAxisAngle(yAxis, flipped ? Math.PI : 0);
    targetQuaternion.multiply(flipQuaternion);
    group.current.position.lerp(targetPosition, 1 - Math.exp(-10 * delta));
    group.current.quaternion.slerp(targetQuaternion, 1 - Math.exp(-9 * delta));
    const targetScale = 1;
    const nextScale = THREE.MathUtils.damp(group.current.scale.x, targetScale, 9, delta);
    group.current.scale.setScalar(nextScale);
  });

  if (!item) return null;
  return (
    <group ref={group} scale={0.08} renderOrder={20}>
      <mesh castShadow>
        <boxGeometry args={[0.72, 1.04, 0.075]} />
        <meshStandardMaterial color="#101722" roughness={0.22} metalness={0.05} />
      </mesh>
      <mesh position={[0, 0, 0.039]} renderOrder={21}>
        <planeGeometry args={[0.65, 0.96]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, -0.039]} rotation={[0, Math.PI, 0]} renderOrder={21}>
        <planeGeometry args={[0.65, 0.96]} />
        <meshBasicMaterial map={backTexture || undefined} color={backTexture ? "#ffffff" : "#163b88"} toneMapped={false} />
      </mesh>
    </group>
  );
}

export function MovieCases({ items, hoveredId, selectedId }: { items: StoreMedia[]; hoveredId: string | null; selectedId: string | null }) {
  return (
    <group name="poster-cases">
      <CaseBodies items={items} selectedId={selectedId} />
      {items.map((item) => (
        <PosterFace key={item.id} item={item} hovered={item.id === hoveredId} selected={item.id === selectedId} />
      ))}
    </group>
  );
}
