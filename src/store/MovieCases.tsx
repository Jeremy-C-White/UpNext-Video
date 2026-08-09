import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { DVD_CASE_DEPTH, DVD_CASE_HEIGHT, DVD_CASE_WIDTH } from "./layout";
import { usePosterTexture, usePosterTextureArray } from "./posterTextures";
import type { InspectControls, StoreMedia } from "./types";

const caseGeometry = new RoundedBoxGeometry(DVD_CASE_WIDTH, DVD_CASE_HEIGHT, DVD_CASE_DEPTH, 4, 0.0015);
const heldCaseGeometry = new RoundedBoxGeometry(0.142, 0.202, 0.017, 4, 0.0018);
const MAX_POSTERS_PER_BATCH = 128;

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

const applyHeldPosterPrintCorrection: THREE.Material["onBeforeCompile"] = (shader) => {
  shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  float printGray = dot(sampledDiffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  float printGrain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, vec3(printGray), 0.04) * 0.96 + 0.008 + printGrain * 0.006;
  diffuseColor *= sampledDiffuseColor;
#endif
  `);
};

function createPosterArrayMaterial(texture: THREE.DataArrayTexture) {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: { posterMap: { value: texture } },
    vertexColors: true,
    side: THREE.FrontSide,
    toneMapped: false,
    vertexShader: `
      out vec2 vPosterUv;
      out vec3 vPosterColor;
      out float vPosterLayer;

      void main() {
        vPosterUv = uv;
        vPosterLayer = float(gl_InstanceID);
        #ifdef USE_INSTANCING_COLOR
          vPosterColor = instanceColor;
        #else
          vPosterColor = vec3(1.0);
        #endif
        vec4 localPosition = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          localPosition = instanceMatrix * localPosition;
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * localPosition;
      }
    `,
    fragmentShader: `
      precision highp sampler2DArray;
      uniform sampler2DArray posterMap;
      in vec2 vPosterUv;
      in vec3 vPosterColor;
      in float vPosterLayer;
      out vec4 posterOutput;

      vec3 srgbToLinear(vec3 color) {
        vec3 low = color / 12.92;
        vec3 high = pow((color + 0.055) / 1.055, vec3(2.4));
        return mix(low, high, step(vec3(0.04045), color));
      }

      void main() {
        vec4 poster = texture(posterMap, vec3(vPosterUv, floor(vPosterLayer + 0.5)));
        vec3 printedColor = srgbToLinear(poster.rgb) * vec3(0.82, 0.78, 0.72) * vPosterColor;
        posterOutput = vec4(printedColor, poster.a);
      }
    `,
  });
}

function PosterBatch({ items, hoveredId, selectedId }: { items: StoreMedia[]; hoveredId: string | null; selectedId: string | null }) {
  const urls = useMemo(() => items.map((item) => item.posterUrl), [items]);
  const textureArray = usePosterTextureArray(urls);
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => {
    return new THREE.PlaneGeometry(DVD_CASE_WIDTH * 0.94, DVD_CASE_HEIGHT * 0.955);
  }, []);
  const material = useMemo(() => createPosterArrayMaterial(textureArray), [textureArray]);
  const itemIds = useMemo(() => items.map((item) => item.id), [items]);

  useLayoutEffect(() => {
    if (!ref.current) return;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const euler = new THREE.Euler();
    items.forEach((item, index) => {
      const hovered = item.id === hoveredId;
      const selected = item.id === selectedId;
      const normalX = Math.sin(item.placement.rotationY);
      const normalZ = Math.cos(item.placement.rotationY);
      const faceOffset = DVD_CASE_DEPTH / 2 + 0.00025 + (hovered ? 0.004 : 0);
      position.set(
        item.placement.position[0] + normalX * faceOffset,
        item.placement.position[1],
        item.placement.position[2] + normalZ * faceOffset,
      );
      euler.set(0, item.placement.rotationY, item.placement.rotationZ, "YXZ");
      quaternion.setFromEuler(euler);
      scale.setScalar(selected ? 0.001 : item.placement.scale * (hovered ? 1.08 : 1));
      matrix.compose(position, quaternion, scale);
      ref.current!.setMatrixAt(index, matrix);
      ref.current!.setColorAt(index, new THREE.Color(hovered ? "#fff0bd" : "#ffffff"));
    });
    ref.current.count = items.length;
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [hoveredId, items, selectedId]);

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  return (
    <instancedMesh ref={ref} args={[geometry, material, items.length]} userData={{ storeItemIds: itemIds }} renderOrder={2} />
  );
}

function HoverCaseLight({ item }: { item: StoreMedia | null }) {
  const ref = useRef<THREE.PointLight>(null);
  useFrame((_, delta) => {
    if (!ref.current) return;
    const targetIntensity = item ? 0.32 : 0;
    ref.current.intensity = THREE.MathUtils.damp(ref.current.intensity, targetIntensity, 14, delta);
    if (!item) return;
    const normalX = Math.sin(item.placement.rotationY);
    const normalZ = Math.cos(item.placement.rotationY);
    ref.current.position.set(
      item.placement.position[0] + normalX * 0.18,
      item.placement.position[1] + 0.03,
      item.placement.position[2] + normalZ * 0.18,
    );
  });
  return <pointLight ref={ref} color="#f7df9a" intensity={0} distance={0.85} decay={2} />;
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

function CaseClearSleeves({ items, hoveredId, selectedId }: { items: StoreMedia[]; hoveredId: string | null; selectedId: string | null }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new THREE.PlaneGeometry(DVD_CASE_WIDTH * 0.975, DVD_CASE_HEIGHT * 0.985), []);

  useLayoutEffect(() => {
    if (!ref.current) return;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const euler = new THREE.Euler();
    items.forEach((item, index) => {
      const hovered = item.id === hoveredId;
      const selected = item.id === selectedId;
      const normalX = Math.sin(item.placement.rotationY);
      const normalZ = Math.cos(item.placement.rotationY);
      const faceOffset = DVD_CASE_DEPTH / 2 + 0.00075 + (hovered ? 0.004 : 0);
      position.set(
        item.placement.position[0] + normalX * faceOffset,
        item.placement.position[1],
        item.placement.position[2] + normalZ * faceOffset,
      );
      euler.set(0, item.placement.rotationY, item.placement.rotationZ, "YXZ");
      quaternion.setFromEuler(euler);
      scale.setScalar(selected ? 0.001 : item.placement.scale * (hovered ? 1.08 : 1));
      matrix.compose(position, quaternion, scale);
      ref.current!.setMatrixAt(index, matrix);
    });
    ref.current.count = items.length;
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [hoveredId, items, selectedId]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, items.length]} renderOrder={3}>
      <meshPhysicalMaterial
        color="#eaf5ff"
        transparent
        opacity={0.115}
        depthWrite={false}
        roughness={0.12}
        metalness={0}
        clearcoat={1}
        clearcoatRoughness={0.075}
        envMapIntensity={1.15}
      />
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
  context.fillStyle = "#0d2c6b";
  context.fillRect(0, 0, 512, 768);
  let seed = item.id.split("").reduce((sum, character) => sum + character.charCodeAt(0), 0) || 1;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let index = 0; index < 6200; index += 1) {
    const value = 30 + Math.round(random() * 34);
    context.fillStyle = `rgba(${value},${value + 18},${value + 58},${0.025 + random() * 0.045})`;
    const size = 0.5 + random() * 1.5;
    context.fillRect(random() * 512, random() * 768, size, size);
  }
  context.fillStyle = "rgba(3,12,31,.18)";
  context.fillRect(0, 332, 512, 208);
  context.strokeStyle = "#f5d64f";
  context.lineWidth = 12;
  context.strokeRect(18, 18, 476, 732);
  context.fillStyle = "#f5d64f";
  context.fillRect(36, 38, 440, 106);
  context.fillStyle = "#082050";
  context.font = "700 35px 'Arial Narrow', 'Franklin Gothic Medium', sans-serif";
  context.textAlign = "center";
  context.fillText(item.name.slice(0, 28), 256, 103);
  context.fillStyle = "#ffffff";
  context.font = "700 19px 'Arial Narrow', 'Franklin Gothic Medium', sans-serif";
  context.textAlign = "left";
  context.fillText("THE STORY", 54, 196);
  context.font = "17px 'Arial Narrow', sans-serif";
  context.fillStyle = "#e8eefc";
  wrapText(context, item.summary, 54, 235, 404, 27, 11);
  context.fillStyle = "#f5d64f";
  context.fillRect(54, 565, 404, 3);
  context.fillStyle = "#ffffff";
  context.font = "700 17px 'Arial Narrow', sans-serif";
  const metadata = [item.year, item.runtime ? `${item.runtime} MIN` : undefined, item.rating ? `★ ${item.rating.toFixed(1)}` : undefined]
    .filter(Boolean)
    .join("  ·  ");
  context.fillText(metadata || "NEXTUP VIDEO EXCLUSIVE", 54, 610);
  context.font = "15px 'Arial Narrow', sans-serif";
  context.fillStyle = "#c9d7fa";
  wrapText(context, item.genres.join(" · ") || item.department, 54, 648, 404, 23, 2);
  context.fillStyle = "#f5d64f";
  context.font = "700 16px 'Arial Narrow', sans-serif";
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

export function HeldCase({
  item,
  flipped,
  inspectControls,
}: {
  item: StoreMedia | null;
  flipped: boolean;
  inspectControls: { current: InspectControls };
}) {
  const group = useRef<THREE.Group>(null);
  const heldLight = useRef<THREE.PointLight>(null);
  const { camera, gl } = useThree();
  const posterUrl = item?.posterUrl || "";
  // Reuse the shelf artwork immediately, then swap in the inspection-sized
  // image once it is ready. This prevents a picked-up case from briefly showing
  // a blank rental sleeve while the larger poster downloads.
  const shelfTexture = usePosterTexture(posterUrl, "shelf");
  const inspectTexture = usePosterTexture(posterUrl, "inspect");
  const texture = inspectTexture.userData.nextupPosterPlaceholder ? shelfTexture : inspectTexture;
  const backTexture = useMemo(() => (item ? createBackTexture(item) : null), [item]);
  const rentalSticker = useMemo(() => createRentalStickerTexture(), []);
  const targetPosition = useMemo(() => new THREE.Vector3(), []);
  const lightTarget = useMemo(() => new THREE.Vector3(), []);
  const targetQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const flipQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const inspectQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const inspectEuler = useMemo(() => new THREE.Euler(0, 0, 0, "YXZ"), []);

  useEffect(() => () => backTexture?.dispose(), [backTexture]);
  useEffect(() => () => rentalSticker.dispose(), [rentalSticker]);
  useEffect(() => {
    const anisotropy = Math.min(16, gl.capabilities.getMaxAnisotropy());
    [shelfTexture, inspectTexture, backTexture, rentalSticker].forEach((surface) => {
      if (!surface) return;
      surface.anisotropy = anisotropy;
      surface.needsUpdate = true;
    });
  }, [backTexture, gl, inspectTexture, rentalSticker, shelfTexture]);

  useFrame((_, delta) => {
    if (!group.current || !heldLight.current) return;
    heldLight.current.intensity = THREE.MathUtils.damp(heldLight.current.intensity, item ? 2.4 : 0, 12, delta);
    if (!item) return;
    const controls = inspectControls.current;
    targetPosition.set(-0.22, -0.1, -controls.distance).applyQuaternion(camera.quaternion).add(camera.position);
    lightTarget.set(-0.08, 0.11, -0.34).applyQuaternion(camera.quaternion).add(camera.position);
    heldLight.current.position.lerp(lightTarget, 1 - Math.exp(-12 * delta));
    targetQuaternion.copy(camera.quaternion);
    inspectEuler.set(controls.pitch, controls.yaw, controls.roll, "YXZ");
    inspectQuaternion.setFromEuler(inspectEuler);
    flipQuaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, flipped ? Math.PI : 0);
    targetQuaternion.multiply(inspectQuaternion).multiply(flipQuaternion);
    group.current.position.lerp(targetPosition, 1 - Math.exp(-10 * delta));
    group.current.quaternion.slerp(targetQuaternion, 1 - Math.exp(-9 * delta));
    const targetScale = 1.1;
    const nextScale = THREE.MathUtils.damp(group.current.scale.x, targetScale, 9, delta);
    group.current.scale.setScalar(nextScale);
  });

  return (
    <>
      <pointLight ref={heldLight} color="#e8f3e6" intensity={0} distance={1.4} decay={2} />
      <group ref={group} visible={Boolean(item)} scale={0.08} renderOrder={20}>
      <mesh castShadow>
        <primitive object={heldCaseGeometry} attach="geometry" dispose={null} />
        <meshStandardMaterial color="#0d131c" roughness={0.3} metalness={0.03} />
      </mesh>
      <mesh position={[-0.069, 0, 0]} castShadow>
        <cylinderGeometry args={[0.004, 0.004, 0.176, 12]} />
        <meshStandardMaterial color="#171e29" roughness={0.36} />
      </mesh>
      <mesh position={[0, 0, 0.0086]} renderOrder={21}>
        <planeGeometry args={[0.128, 0.188]} />
        <meshStandardMaterial
          map={texture}
          color="#fffdf7"
          roughness={0.72}
          metalness={0}
          emissive="#ffffff"
          emissiveMap={texture}
          emissiveIntensity={0.08}
          onBeforeCompile={applyHeldPosterPrintCorrection}
          customProgramCacheKey={() => "nextup-held-poster-print-v1"}
        />
      </mesh>
      <mesh position={[0, 0, 0.0091]} renderOrder={22}>
        <planeGeometry args={[0.132, 0.192]} />
        <meshPhysicalMaterial
          color="#ffffff"
          transparent
          opacity={0.075}
          depthWrite={false}
          roughness={0.12}
          metalness={0}
          clearcoat={1}
          clearcoatRoughness={0.08}
          clearcoatNormalMap={scratchNormalTexture}
          clearcoatNormalScale={[0.18, 0.18]}
        />
      </mesh>
      <mesh position={[0, 0, -0.0086]} rotation={[0, Math.PI, 0]} renderOrder={21}>
        <planeGeometry args={[0.128, 0.188]} />
        <meshStandardMaterial map={backTexture || undefined} color={backTexture ? "#f5f0e8" : "#163b88"} roughness={0.66} />
      </mesh>
      <mesh position={[0, 0, -0.0091]} rotation={[0, Math.PI, 0]} renderOrder={22}>
        <planeGeometry args={[0.132, 0.192]} />
        <meshPhysicalMaterial
          color="#ffffff"
          transparent
          opacity={0.065}
          depthWrite={false}
          roughness={0.13}
          clearcoat={1}
          clearcoatRoughness={0.1}
          clearcoatNormalMap={scratchNormalTexture}
          clearcoatNormalScale={[0.15, 0.15]}
        />
      </mesh>
      <mesh position={[0.026, -0.06, -0.0093]} rotation={[0, Math.PI, -0.018]} renderOrder={23}>
        <planeGeometry args={[0.06, 0.026]} />
        <meshStandardMaterial map={rentalSticker} roughness={0.78} polygonOffset polygonOffsetFactor={-2} />
      </mesh>
      <mesh position={[-0.038, 0.052, -0.0093]} rotation={[0, Math.PI, 0.025]} renderOrder={23}>
        <planeGeometry args={[0.026, 0.055]} />
        <meshStandardMaterial color="#aeb7bf" metalness={0.42} roughness={0.5} polygonOffset polygonOffsetFactor={-2} />
      </mesh>
      </group>
    </>
  );
}

export function MovieCases({ items, hoveredId, selectedId }: { items: StoreMedia[]; hoveredId: string | null; selectedId: string | null }) {
  const batches = useMemo(() => {
    const next: StoreMedia[][] = [];
    for (let index = 0; index < items.length; index += MAX_POSTERS_PER_BATCH) next.push(items.slice(index, index + MAX_POSTERS_PER_BATCH));
    return next;
  }, [items]);
  const hoveredItem = useMemo(() => items.find((item) => item.id === hoveredId) || null, [hoveredId, items]);
  return (
    <group name="poster-cases">
      <CaseBodies items={items} selectedId={selectedId} />
      {batches.map((batch, index) => (
        <PosterBatch key={`${index}:${batch[0]?.id || "empty"}`} items={batch} hoveredId={hoveredId} selectedId={selectedId} />
      ))}
      <CaseClearSleeves items={items} hoveredId={hoveredId} selectedId={selectedId} />
      <HoverCaseLight item={hoveredItem} />
    </group>
  );
}
