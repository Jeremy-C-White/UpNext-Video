import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { usePosterTexture } from "./posterTextures";
import type { StoreMedia } from "./types";

const posterGeometry = new THREE.PlaneGeometry(0.61, 0.88);
const caseGeometry = new RoundedBoxGeometry(0.68, 0.96, 0.1, 2, 0.018);
const heldCaseGeometry = new RoundedBoxGeometry(0.72, 1.04, 0.075, 3, 0.025);

function createScratchNormalTexture() {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  for (let index = 0; index < size * size; index += 1) {
    const x = index % size;
    const y = Math.floor(index / size);
    const scratch = Math.sin(x * 0.71 + y * 0.19) * Math.sin(x * 0.07 - y * 0.83);
    const grain = Math.sin((index + 17) * 12.9898) * 0.5;
    data[index * 4] = 128 + Math.round(scratch * 10 + grain * 3);
    data[index * 4 + 1] = 128 + Math.round(scratch * 3 - grain * 3);
    data[index * 4 + 2] = 250;
    data[index * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.5, 4);
  texture.needsUpdate = true;
  return texture;
}

const scratchNormalTexture = createScratchNormalTexture();

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
      rotation={[0, item.placement.rotationY, item.placement.rotationZ]}
      scale={item.placement.scale * (hovered ? 1.065 : 1)}
      userData={{ storeItemId: item.id }}
      frustumCulled
      renderOrder={hovered ? 3 : 1}
    >
      <primitive object={posterGeometry} attach="geometry" dispose={null} />
      <meshPhysicalMaterial
        map={texture}
        color={hovered ? "#fff4c9" : "#f5f0e8"}
        roughness={0.52}
        metalness={0}
        clearcoat={0.82}
        clearcoatRoughness={0.16}
        clearcoatNormalMap={scratchNormalTexture}
        clearcoatNormalScale={[0.1, 0.1]}
        side={THREE.FrontSide}
      />
      {hovered && <pointLight position={[0, 0, 0.22]} color="#f7df9a" intensity={0.85} distance={1.8} />}
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
      euler.set(0, item.placement.rotationY, item.placement.rotationZ, "YXZ");
      quaternion.setFromEuler(euler);
      scale.setScalar(item.id === selectedId ? 0.001 : item.placement.scale);
      matrix.compose(position, quaternion, scale);
      ref.current!.setMatrixAt(index, matrix);
    });
    ref.current.count = items.length;
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [euler, items, matrix, position, quaternion, scale, selectedId]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, items.length]} castShadow receiveShadow>
      <primitive object={caseGeometry} attach="geometry" dispose={null} />
      <meshStandardMaterial color="#10151e" roughness={0.46} metalness={0.04} />
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

function createRentalStickerTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 112;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#eee8d4";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#173d82";
  context.font = "bold 18px Arial";
  context.fillText("NEXTUP VIDEO", 13, 24);
  let x = 14;
  for (let index = 0; index < 42; index += 1) {
    const width = index % 5 === 0 ? 5 : index % 3 === 0 ? 3 : 2;
    context.fillRect(x, 37, width, 46);
    x += width + (index % 2 ? 3 : 2);
  }
  context.font = "12px monospace";
  context.fillText("7 DAY RENTAL", 14, 102);
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
  const rentalSticker = useMemo(() => createRentalStickerTexture(), []);
  const targetPosition = useMemo(() => new THREE.Vector3(), []);
  const targetQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const flipQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const yAxis = useMemo(() => new THREE.Vector3(0, 1, 0), []);

  useEffect(() => () => backTexture?.dispose(), [backTexture]);
  useEffect(() => () => rentalSticker.dispose(), [rentalSticker]);

  useFrame((_, delta) => {
    if (!group.current || !item) return;
    targetPosition.set(-0.58, -0.08, -1.68).applyQuaternion(camera.quaternion).add(camera.position);
    targetQuaternion.copy(camera.quaternion);
    flipQuaternion.setFromAxisAngle(yAxis, flipped ? Math.PI : 0);
    targetQuaternion.multiply(flipQuaternion);
    group.current.position.lerp(targetPosition, 1 - Math.exp(-10 * delta));
    group.current.quaternion.slerp(targetQuaternion, 1 - Math.exp(-9 * delta));
    const targetScale = 0.9;
    const nextScale = THREE.MathUtils.damp(group.current.scale.x, targetScale, 9, delta);
    group.current.scale.setScalar(nextScale);
  });

  if (!item) return null;
  return (
    <group ref={group} scale={0.08} renderOrder={20}>
      <pointLight position={[0.65, 0.78, 0.8]} color="#e8f3e6" intensity={1.25} distance={2.4} />
      <mesh castShadow>
        <primitive object={heldCaseGeometry} attach="geometry" dispose={null} />
        <meshStandardMaterial color="#0d131c" roughness={0.3} metalness={0.03} />
      </mesh>
      <mesh position={[-0.355, 0, 0]} castShadow>
        <cylinderGeometry args={[0.034, 0.034, 0.88, 12]} />
        <meshStandardMaterial color="#171e29" roughness={0.36} />
      </mesh>
      <mesh position={[0, 0, 0.039]} renderOrder={21}>
        <planeGeometry args={[0.65, 0.96]} />
        <meshStandardMaterial map={texture} color="#f4efe7" roughness={0.72} metalness={0} />
      </mesh>
      <mesh position={[0, 0, 0.042]} renderOrder={22}>
        <planeGeometry args={[0.662, 0.972]} />
        <meshPhysicalMaterial
          color="#ffffff"
          transparent
          opacity={0.13}
          depthWrite={false}
          roughness={0.12}
          metalness={0}
          clearcoat={1}
          clearcoatRoughness={0.08}
          clearcoatNormalMap={scratchNormalTexture}
          clearcoatNormalScale={[0.18, 0.18]}
        />
      </mesh>
      <mesh position={[0, 0, -0.039]} rotation={[0, Math.PI, 0]} renderOrder={21}>
        <planeGeometry args={[0.65, 0.96]} />
        <meshStandardMaterial map={backTexture || undefined} color={backTexture ? "#f5f0e8" : "#163b88"} roughness={0.66} />
      </mesh>
      <mesh position={[0, 0, -0.042]} rotation={[0, Math.PI, 0]} renderOrder={22}>
        <planeGeometry args={[0.662, 0.972]} />
        <meshPhysicalMaterial
          color="#ffffff"
          transparent
          opacity={0.1}
          depthWrite={false}
          roughness={0.13}
          clearcoat={1}
          clearcoatRoughness={0.1}
          clearcoatNormalMap={scratchNormalTexture}
          clearcoatNormalScale={[0.15, 0.15]}
        />
      </mesh>
      <mesh position={[0.13, -0.31, -0.044]} rotation={[0, Math.PI, -0.018]} renderOrder={23}>
        <planeGeometry args={[0.31, 0.135]} />
        <meshStandardMaterial map={rentalSticker} roughness={0.78} polygonOffset polygonOffsetFactor={-2} />
      </mesh>
      <mesh position={[-0.19, 0.28, -0.044]} rotation={[0, Math.PI, 0.025]} renderOrder={23}>
        <planeGeometry args={[0.14, 0.29]} />
        <meshStandardMaterial color="#aeb7bf" metalness={0.42} roughness={0.5} polygonOffset polygonOffsetFactor={-2} />
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
