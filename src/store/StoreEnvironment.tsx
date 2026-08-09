import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { sectionHeight, sectionWidth, STORE_SECTIONS } from "./layout";
import type { StoreSectionDefinition } from "./types";

function createLabelTexture(label: string, accent: string, subtitle?: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const context = canvas.getContext("2d")!;
  const gradient = context.createLinearGradient(0, 0, 1024, 256);
  gradient.addColorStop(0, "#0b2e77");
  gradient.addColorStop(0.5, "#174fae");
  gradient.addColorStop(1, "#071d4f");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 1024, 256);
  context.strokeStyle = accent;
  context.lineWidth = 18;
  context.strokeRect(12, 12, 1000, 232);
  context.fillStyle = "rgba(255,255,255,.09)";
  context.fillRect(30, 30, 964, 38);
  context.fillStyle = accent;
  context.textAlign = "center";
  context.font = label.length > 20 ? "bold 68px Arial" : "bold 88px Arial";
  context.fillText(label, 512, subtitle ? 142 : 165);
  if (subtitle) {
    context.fillStyle = "#ffffff";
    context.font = "bold 28px Arial";
    context.fillText(subtitle, 512, 202);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function createSurfaceTexture(kind: "tile" | "carpet" | "ceiling" | "wall", roughness = false) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const context = canvas.getContext("2d")!;
  context.scale(2, 2);
  let seed = 9187;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  if (kind === "tile") {
    context.fillStyle = roughness ? "#777777" : "#b8b2a5";
    context.fillRect(0, 0, 512, 512);
    for (let row = 0; row < 8; row += 1) {
      for (let column = 0; column < 8; column += 1) {
        const variation = Math.round((random() - 0.5) * (roughness ? 24 : 18));
        const base = roughness ? 112 : 183;
        context.fillStyle = `rgb(${base + variation},${base + variation},${roughness ? base + variation : base + variation - 8})`;
        context.fillRect(column * 64 + 2, row * 64 + 2, 60, 60);
      }
    }
    context.strokeStyle = roughness ? "rgba(255,255,255,.08)" : "rgba(52,45,36,.18)";
    for (let index = 0; index < 34; index += 1) {
      context.beginPath();
      context.arc(random() * 512, random() * 512, 8 + random() * 62, 0.2, 1.7);
      context.stroke();
    }
  } else if (kind === "carpet") {
    context.fillStyle = roughness ? "#e2e2e2" : "#142e63";
    context.fillRect(0, 0, 512, 512);
    for (let index = 0; index < 6200; index += 1) {
      const shade = Math.round(38 + random() * 42);
      context.fillStyle = roughness ? `rgb(${150 + shade},${150 + shade},${150 + shade})` : `rgba(${18 + shade / 3},${42 + shade / 2},${82 + shade},.32)`;
      const x = random() * 512;
      const y = random() * 512;
      context.fillRect(x, y, 1 + random() * 2, 2 + random() * 5);
    }
  } else if (kind === "ceiling") {
    context.fillStyle = roughness ? "#d5d5d5" : "#d8d4c8";
    context.fillRect(0, 0, 512, 512);
    context.strokeStyle = roughness ? "#c5c5c5" : "#bbb5a8";
    context.lineWidth = 4;
    for (let line = 0; line <= 4; line += 1) {
      context.beginPath();
      context.moveTo(line * 128, 0);
      context.lineTo(line * 128, 512);
      context.stroke();
      context.beginPath();
      context.moveTo(0, line * 128);
      context.lineTo(512, line * 128);
      context.stroke();
    }
    if (!roughness) {
      context.fillStyle = "rgba(105,89,61,.09)";
      context.beginPath();
      context.ellipse(384, 128, 68, 42, 0.3, 0, Math.PI * 2);
      context.fill();
    }
  } else {
    context.fillStyle = roughness ? "#c9c9c9" : "#c4bdad";
    context.fillRect(0, 0, 512, 512);
    for (let index = 0; index < 4200; index += 1) {
      const value = roughness ? 184 + Math.round(random() * 34) : 174 + Math.round(random() * 28);
      const alpha = 0.035 + random() * 0.08;
      context.fillStyle = roughness
        ? `rgba(${value},${value},${value},${alpha})`
        : `rgba(${value + 11},${value + 7},${value - 3},${alpha})`;
      const size = 0.5 + random() * 1.8;
      context.fillRect(random() * 512, random() * 512, size, size);
    }
    if (!roughness) {
      context.fillStyle = "rgba(86,67,45,.035)";
      for (let index = 0; index < 18; index += 1) {
        context.beginPath();
        context.ellipse(random() * 512, random() * 512, 4 + random() * 20, 1 + random() * 5, random(), 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = roughness ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

function createShelfBackTexture(roughness = false) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext("2d")!;
  let seed = 7717;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  context.fillStyle = roughness ? "#a9a9a9" : "#17356f";
  context.fillRect(0, 0, canvas.width, canvas.height);

  if (!roughness) {
    const wash = context.createLinearGradient(0, 0, 0, canvas.height);
    wash.addColorStop(0, "rgba(255,255,255,.09)");
    wash.addColorStop(0.45, "rgba(255,255,255,.015)");
    wash.addColorStop(1, "rgba(0,7,28,.18)");
    context.fillStyle = wash;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  for (let y = 14; y < canvas.height; y += 24) {
    for (let x = 14; x < canvas.width; x += 24) {
      const jitterX = (random() - 0.5) * 0.7;
      const jitterY = (random() - 0.5) * 0.7;
      context.beginPath();
      context.arc(x + jitterX, y + jitterY, roughness ? 3.1 : 3.6, 0, Math.PI * 2);
      context.fillStyle = roughness ? "#444" : "#06132e";
      context.fill();
      if (!roughness) {
        context.beginPath();
        context.arc(x - 0.8, y - 0.8, 1.1, 0, Math.PI * 2);
        context.fillStyle = "rgba(205,224,255,.36)";
        context.fill();
      }
    }
  }

  for (let index = 0; index < 240; index += 1) {
    const value = roughness ? 90 + Math.round(random() * 90) : 100 + Math.round(random() * 95);
    context.fillStyle = roughness
      ? `rgba(${value},${value},${value},.16)`
      : `rgba(${value},${value + 18},${Math.min(255, value + 48)},.055)`;
    context.fillRect(random() * 1024, random() * 512, 1 + random() * 12, 0.5 + random());
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = roughness ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function LabelPanel({ label, accent, subtitle, width = 5.8 }: { label: string; accent: string; subtitle?: string; width?: number }) {
  const texture = useMemo(() => createLabelTexture(label, accent, subtitle), [accent, label, subtitle]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh>
      <planeGeometry args={[width, width / 4]} />
      <meshStandardMaterial map={texture} color="#f4f0e8" roughness={0.63} emissive="#0a1c42" emissiveIntensity={0.12} />
    </mesh>
  );
}

function FloorSurfaces() {
  const tileColor = useMemo(() => createSurfaceTexture("tile"), []);
  const tileRoughness = useMemo(() => createSurfaceTexture("tile", true), []);
  const carpetColor = useMemo(() => createSurfaceTexture("carpet"), []);
  const carpetBump = useMemo(() => createSurfaceTexture("carpet", true), []);
  useEffect(() => {
    tileColor.repeat.set(18, 24);
    tileRoughness.repeat.set(18, 24);
    carpetColor.repeat.set(4, 12);
    carpetBump.repeat.set(4, 12);
    return () => {
      tileColor.dispose();
      tileRoughness.dispose();
      carpetColor.dispose();
      carpetBump.dispose();
    };
  }, [carpetBump, carpetColor, tileColor, tileRoughness]);

  return (
    <group name="period-floor-surfaces">
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[36, 48]} />
        <meshPhysicalMaterial
          map={tileColor}
          roughnessMap={tileRoughness}
          bumpMap={tileRoughness}
          bumpScale={0.0035}
          roughness={0.34}
          metalness={0.02}
          clearcoat={0.34}
          clearcoatRoughness={0.28}
        />
      </mesh>
      {[-11.1, 11.1].map((x) => (
        <mesh key={x} position={[x, 0.012, -5.6]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[10.7, 31.2]} />
          <meshStandardMaterial map={carpetColor} bumpMap={carpetBump} bumpScale={0.026} roughness={0.93} color="#d9e1f0" />
        </mesh>
      ))}
    </group>
  );
}

function Baseboards() {
  const pieces: Array<{ position: [number, number, number]; size: [number, number, number] }> = [
    { position: [0, 0.16, -23.01], size: [35.7, 0.3, 0.12] },
    { position: [-17.62, 0.16, 0], size: [0.12, 0.3, 46] },
    { position: [17.62, 0.16, 0], size: [0.12, 0.3, 46] },
  ];
  return (
    <group name="baseboards">
      {pieces.map((piece, index) => (
        <RoundedBox key={index} args={piece.size} position={piece.position} radius={0.002} smoothness={4} receiveShadow>
          <meshStandardMaterial color="#173b73" roughness={0.42} metalness={0.06} />
        </RoundedBox>
      ))}
    </group>
  );
}

function CeilingSurface() {
  const colorMap = useMemo(() => createSurfaceTexture("ceiling"), []);
  const roughnessMap = useMemo(() => createSurfaceTexture("ceiling", true), []);
  useEffect(() => {
    colorMap.repeat.set(18, 24);
    roughnessMap.repeat.set(18, 24);
    return () => {
      colorMap.dispose();
      roughnessMap.dispose();
    };
  }, [colorMap, roughnessMap]);
  return (
    <mesh position={[0, 3.55, 0]} receiveShadow>
      <boxGeometry args={[36, 0.24, 48]} />
      <meshStandardMaterial
        map={colorMap}
        roughnessMap={roughnessMap}
        bumpMap={roughnessMap}
        bumpScale={0.0012}
        roughness={0.86}
        color="#d8d2c5"
      />
    </mesh>
  );
}

function StoreWalls() {
  const colorMap = useMemo(() => createSurfaceTexture("wall"), []);
  const roughnessMap = useMemo(() => createSurfaceTexture("wall", true), []);
  useEffect(() => {
    colorMap.repeat.set(10, 4);
    roughnessMap.repeat.set(10, 4);
    return () => {
      colorMap.dispose();
      roughnessMap.dispose();
    };
  }, [colorMap, roughnessMap]);
  const pieces: Array<{ position: [number, number, number]; size: [number, number, number] }> = [
    { position: [0, 1.75, -23.25], size: [36.5, 3.5, 0.42] },
    { position: [-17.85, 1.75, 0], size: [0.42, 3.5, 46.5] },
    { position: [17.85, 1.75, 0], size: [0.42, 3.5, 46.5] },
    { position: [-11.6, 1.75, 23.25], size: [12.7, 3.5, 0.42] },
    { position: [11.6, 1.75, 23.25], size: [12.7, 3.5, 0.42] },
  ];
  return (
    <group name="painted-store-walls">
      {pieces.map((piece, index) => (
        <mesh key={index} position={piece.position} receiveShadow>
          <boxGeometry args={piece.size} />
          <meshStandardMaterial map={colorMap} roughnessMap={roughnessMap} bumpMap={roughnessMap} bumpScale={0.0008} color="#d1c9b8" roughness={0.82} />
        </mesh>
      ))}
    </group>
  );
}

function ShelfTalker({ accent, width }: { accent: string; width: number }) {
  return (
    <group position={[Math.min(width * 0.2, 1.3), -0.13, 0.145]} rotation={[0.035, 0, -0.02]}>
      <mesh castShadow>
        <planeGeometry args={[0.16, 0.09, 4, 2]} />
        <meshStandardMaterial color="#eee4c8" roughness={0.86} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.01, 0.001]}>
        <planeGeometry args={[0.125, 0.014]} />
        <meshStandardMaterial color={accent} roughness={0.7} />
      </mesh>
    </group>
  );
}

function createSpinePrintTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 512;
  const context = canvas.getContext("2d")!;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(244,236,213,.92)";
  context.fillRect(14, 18, 16, 466);
  context.fillStyle = "rgba(255,255,255,.78)";
  context.fillRect(92, 24, 19, 112);
  context.fillStyle = "rgba(245,238,218,.94)";
  const marks = [
    [43, 28, 34, 7], [43, 41, 46, 6], [43, 54, 30, 6],
    [43, 93, 39, 8], [43, 109, 52, 6], [43, 122, 42, 6],
    [43, 173, 49, 7], [43, 187, 33, 6], [43, 200, 44, 6],
    [43, 266, 39, 7], [43, 280, 51, 6], [43, 294, 29, 6],
    [43, 352, 47, 7], [43, 367, 34, 6], [43, 380, 52, 6],
  ];
  marks.forEach(([x, y, width, height]) => context.fillRect(x, y, width, height));
  context.strokeStyle = "rgba(246,238,213,.82)";
  context.lineWidth = 5;
  context.strokeRect(88, 424, 25, 52);
  context.fillStyle = "rgba(235,222,190,.68)";
  context.fillRect(40, 451, 36, 25);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return texture;
}

function ShelfSpines({ section, width }: { section: StoreSectionDefinition; width: number }) {
  const countPerRow = Math.max(1, Math.floor((width - 0.12) / 0.022));
  const count = countPerRow * section.rows;
  const ref = useRef<THREE.InstancedMesh>(null);
  const printRef = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new RoundedBoxGeometry(0.016, 0.184, 0.013, 2, 0.00075), []);
  const printGeometry = useMemo(() => new THREE.PlaneGeometry(0.014, 0.17), []);
  const printTexture = useMemo(() => createSpinePrintTexture(), []);
  const palette = useMemo(() => ["#102442", "#842a32", "#b9ae8c", "#263c2b", "#a67932", "#493754", "#171a20", "#d4d0bd", "#4b6179"].map((color) => new THREE.Color(color)), []);
  useLayoutEffect(() => {
    if (!ref.current || !printRef.current) return;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);
    const euler = new THREE.Euler();
    for (let row = 0; row < section.rows; row += 1) {
      for (let column = 0; column < countPerRow; column += 1) {
        const index = row * countPerRow + column;
        const hash = (salt: number) => {
          const value = Math.sin((index * 117.37 + row * 53.11 + salt * 19.73) * 12.9898) * 43758.5453;
          return value - Math.floor(value);
        };
        const x = -width / 2 + 0.07 + column * ((width - 0.14) / Math.max(1, countPerRow - 1));
        const baseY = ((section.rows - 1) / 2 - row) * section.rowGap;
        const isGap = hash(1) < 0.035 || (column + row * 7) % 89 === 0;
        const heightScale = 0.91 + hash(2) * 0.105;
        const widthScale = isGap ? 0.035 : 0.72 + hash(3) * 0.78;
        const depthScale = isGap ? 0.05 : 0.78 + hash(4) * 0.62;
        const clusterLean = Math.sin(Math.floor(column / 7) * 1.71 + row) * 0.018;
        const lean = isGap ? 0 : clusterLean + (hash(5) - 0.5) * 0.055;
        scale.set(widthScale, isGap ? 0.035 : heightScale, depthScale);
        position.set(
          x + (hash(6) - 0.5) * 0.0035,
          baseY - (1 - heightScale) * 0.092,
          0.043 + hash(7) * 0.007,
        );
        euler.set(0, (hash(8) - 0.5) * 0.035, lean);
        quaternion.setFromEuler(euler);
        matrix.compose(position, quaternion, scale);
        ref.current.setMatrixAt(index, matrix);
        ref.current.setColorAt(index, palette[Math.floor(hash(9) * palette.length) % palette.length]);
        position.z += 0.0068 * depthScale + 0.00035;
        scale.set(isGap ? 0.001 : widthScale, isGap ? 0.001 : heightScale, 1);
        matrix.compose(position, quaternion, scale);
        printRef.current.setMatrixAt(index, matrix);
        const ink = 0.72 + hash(10) * 0.28;
        printRef.current.setColorAt(index, new THREE.Color(ink, ink * (0.96 + hash(11) * 0.04), ink * 0.9));
      }
    }
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
    ref.current.computeBoundingSphere();
    printRef.current.instanceMatrix.needsUpdate = true;
    if (printRef.current.instanceColor) printRef.current.instanceColor.needsUpdate = true;
    printRef.current.computeBoundingSphere();
  }, [countPerRow, palette, section, width]);
  useEffect(() => () => {
    geometry.dispose();
    printGeometry.dispose();
    printTexture.dispose();
  }, [geometry, printGeometry, printTexture]);
  return (
    <group>
      <instancedMesh ref={ref} args={[geometry, undefined, count]} castShadow receiveShadow>
        <meshPhysicalMaterial
          vertexColors
          roughness={0.39}
          metalness={0.015}
          clearcoat={0.82}
          clearcoatRoughness={0.22}
          envMapIntensity={0.82}
        />
      </instancedMesh>
      <instancedMesh ref={printRef} args={[printGeometry, undefined, count]} renderOrder={2}>
        <meshStandardMaterial
          map={printTexture}
          vertexColors
          transparent
          alphaTest={0.12}
          roughness={0.62}
          metalness={0}
          polygonOffset
          polygonOffsetFactor={-1}
        />
      </instancedMesh>
    </group>
  );
}

function ShelfFixture({ section }: { section: StoreSectionDefinition }) {
  const width = sectionWidth(section);
  const height = sectionHeight(section);
  const backColor = useMemo(() => createShelfBackTexture(false), []);
  const backRoughness = useMemo(() => createShelfBackTexture(true), []);
  useEffect(() => () => {
    backColor.dispose();
    backRoughness.dispose();
  }, [backColor, backRoughness]);
  return (
    <group position={section.center} rotation={[0, section.rotationY, 0]} name={`fixture-${section.id}`}>
      <RoundedBox args={[width, height, 0.055]} position={[0, 0, -0.045]} radius={0.003} smoothness={4} castShadow receiveShadow>
        <meshStandardMaterial
          map={backColor}
          roughnessMap={backRoughness}
          bumpMap={backRoughness}
          bumpScale={-0.0014}
          color="#d8e1f2"
          roughness={0.48}
          metalness={0.1}
        />
      </RoundedBox>
      <ShelfSpines section={section} width={width} />
      {Array.from({ length: section.rows + 1 }, (_, index) => {
        const y = (section.rows / 2 - index) * section.rowGap + 0.035;
        return (
          <RoundedBox
            key={index}
            args={[width + 0.08, 0.025, 0.24]}
            position={[0, y - (index % 2 ? 0.001 : 0), 0.035]}
            rotation={[0, 0, (index - section.rows / 2) * 0.0015]}
            radius={0.002}
            smoothness={4}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial color="#e7d8b5" roughness={0.45} />
          </RoundedBox>
        );
      })}
      <RoundedBox args={[0.045, height + 0.06, 0.23]} position={[-width / 2 - 0.025, 0, 0.03]} radius={0.0025} smoothness={4} castShadow>
        <meshStandardMaterial color="#f0dfba" roughness={0.48} />
      </RoundedBox>
      <RoundedBox args={[0.045, height + 0.06, 0.23]} position={[width / 2 + 0.025, 0, 0.03]} radius={0.0025} smoothness={4} castShadow>
        <meshStandardMaterial color="#f0dfba" roughness={0.48} />
      </RoundedBox>
      <ShelfTalker accent={section.accent} width={width} />
      <group position={[0, height / 2 + 0.27, 0.035]}>
        <LabelPanel
          label={section.label}
          accent={section.accent}
          subtitle={section.id === "staff-picks" ? "SELECTED JUST FOR YOU" : undefined}
          width={Math.min(Math.max(width * 0.48, 1.05), 1.8)}
        />
      </group>
    </group>
  );
}

function FluorescentFixture({ position, dead = false, flicker = false }: { position: [number, number, number]; dead?: boolean; flicker?: boolean }) {
  const tubeMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: dead ? "#7f8580" : "#e6f1e5",
    emissive: dead ? "#111512" : "#d9f3df",
    emissiveIntensity: dead ? 0.04 : 5.8,
    roughness: 0.26,
  }), [dead]);
  useEffect(() => () => tubeMaterial.dispose(), [tubeMaterial]);
  useFrame(({ clock }) => {
    if (!flicker || dead) return;
    const pulse = Math.sin(clock.elapsedTime * 37) > 0.82 ? 0.22 : 1;
    tubeMaterial.emissiveIntensity = THREE.MathUtils.lerp(tubeMaterial.emissiveIntensity, 5.8 * pulse, 0.24);
  });
  return (
    <group position={position}>
      <RoundedBox args={[1.2, 0.05, 0.58]} radius={0.003} smoothness={4}>
        <meshStandardMaterial color="#c4c8c1" metalness={0.42} roughness={0.38} />
      </RoundedBox>
      {[-0.18, -0.06, 0.06, 0.18].map((z) => (
        <RoundedBox key={z} args={[1.05, 0.02, 0.035]} position={[0, -0.034, z]} radius={0.009} smoothness={4}>
          <primitive object={tubeMaterial} attach="material" dispose={null} />
        </RoundedBox>
      ))}
    </group>
  );
}

function AutomaticDoors({ open }: { open: boolean }) {
  const left = useRef<THREE.Mesh>(null);
  const right = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (!left.current || !right.current) return;
    left.current.position.x = THREE.MathUtils.damp(left.current.position.x, open ? -2.05 : -0.96, 5.5, delta);
    right.current.position.x = THREE.MathUtils.damp(right.current.position.x, open ? 2.05 : 0.96, 5.5, delta);
  });
  return (
    <group position={[0, 1.48, 22.9]}>
      <mesh ref={left} position={[-0.96, 0, 0]} castShadow>
        <boxGeometry args={[1.84, 2.9, 0.04]} />
        <meshPhysicalMaterial color="#94b8d6" transparent opacity={0.28} roughness={0.08} transmission={0.25} />
      </mesh>
      <mesh ref={right} position={[0.96, 0, 0]} castShadow>
        <boxGeometry args={[1.84, 2.9, 0.04]} />
        <meshPhysicalMaterial color="#94b8d6" transparent opacity={0.28} roughness={0.08} transmission={0.25} />
      </mesh>
      <mesh position={[0, 1.52, 0]}>
        <boxGeometry args={[5.6, 0.12, 0.16]} />
        <meshStandardMaterial color="#123b8d" metalness={0.35} roughness={0.35} />
      </mesh>
    </group>
  );
}

function createCrtTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 192;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  return texture;
}

function CheckoutArea() {
  const crtScreen = useRef<THREE.MeshStandardMaterial>(null);
  const lastCrtFrame = useRef(0);
  const crtTexture = useMemo(() => createCrtTexture(), []);
  useEffect(() => () => crtTexture.dispose(), [crtTexture]);
  useFrame(({ clock }) => {
    if (crtScreen.current) crtScreen.current.emissiveIntensity = 1.4 + Math.sin(clock.elapsedTime * 4.8) * 0.22;
    if (clock.elapsedTime - lastCrtFrame.current < 1 / 12) return;
    lastCrtFrame.current = clock.elapsedTime;
    const canvas = crtTexture.image as HTMLCanvasElement;
    const context = canvas.getContext("2d")!;
    const pulse = 0.5 + Math.sin(clock.elapsedTime * 1.7) * 0.5;
    context.fillStyle = pulse > 0.45 ? "#143a78" : "#531d4f";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = pulse > 0.45 ? "#f3d34e" : "#62d5d0";
    context.fillRect(20, 26, 216, 62);
    context.fillStyle = "#061632";
    context.font = "bold 28px Arial";
    context.textAlign = "center";
    context.fillText("NEXTUP", 128, 66);
    context.fillStyle = "rgba(255,255,255,.14)";
    for (let y = 2; y < 192; y += 4) context.fillRect(0, y, 256, 1);
    context.fillStyle = "#e7edf8";
    context.font = "bold 13px monospace";
    context.fillText("PREVIEWS STARTING SOON", 128, 135);
    crtTexture.needsUpdate = true;
  });
  return (
    <group name="checkout">
      <RoundedBox args={[4.2, 1.05, 1]} position={[13.1, 0.53, 14.6]} radius={0.004} smoothness={4} castShadow receiveShadow>
        <meshStandardMaterial color="#e9d5a8" roughness={0.48} />
      </RoundedBox>
      <RoundedBox args={[4.3, 0.055, 1.08]} position={[13.1, 1.08, 14.55]} radius={0.003} smoothness={4} castShadow>
        <meshStandardMaterial color="#17469c" roughness={0.32} metalness={0.1} />
      </RoundedBox>
      <group position={[14.25, 1.38, 14.55]} rotation={[0, -0.22, 0]}>
        <RoundedBox args={[0.56, 0.42, 0.38]} radius={0.008} smoothness={4} castShadow>
          <meshStandardMaterial color="#242a32" roughness={0.6} />
        </RoundedBox>
        <mesh position={[0, 0.01, -0.195]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[0.43, 0.31]} />
          <meshStandardMaterial ref={crtScreen} map={crtTexture} color="#dcecff" emissive="#58aee4" emissiveMap={crtTexture} emissiveIntensity={1.5} roughness={0.24} />
        </mesh>
        <pointLight position={[0, -0.02, -0.45]} color="#4fa6dc" intensity={0.65} distance={1.4} />
      </group>
      <group position={[11.8, 1.5, 14.65]}>
        <mesh position={[0, 0.36, 0]} castShadow>
          <sphereGeometry args={[0.11, 16, 12]} />
          <meshStandardMaterial color="#b9794e" roughness={0.68} />
        </mesh>
        <RoundedBox args={[0.24, 0.52, 0.18]} radius={0.01} smoothness={4} castShadow>
          <meshStandardMaterial color="#3461ad" roughness={0.7} />
        </RoundedBox>
      </group>
      <group position={[13.1, 2.35, 14.02]} rotation={[0, 0, 0]}>
        <LabelPanel label="CHECKOUT" accent="#ffd54c" width={1.8} />
      </group>
    </group>
  );
}

function SnackArea() {
  return (
    <group name="snacks">
      <RoundedBox args={[3.5, 1.05, 0.72]} position={[-13.2, 0.53, 14.4]} radius={0.004} smoothness={4} castShadow>
        <meshStandardMaterial color="#d9c59c" roughness={0.58} />
      </RoundedBox>
      {[-14.4, -13.8, -13.2, -12.6, -12].map((x, index) => (
        <RoundedBox key={x} args={[0.22, 0.35, 0.05]} position={[x, 1.25 + (index % 2) * 0.012, 14.01]} rotation={[0, 0, (index - 2) * 0.012]} radius={0.002} smoothness={4} castShadow>
          <meshStandardMaterial color={["#ee4466", "#ffcd4c", "#4ed1a1", "#965bce", "#f28a3b"][index]} roughness={0.48} />
        </RoundedBox>
      ))}
      <group position={[-13.2, 2.05, 14.01]}>
        <LabelPanel label="MOVIE NIGHT SNACKS" accent="#ffcf49" width={1.8} />
      </group>
    </group>
  );
}

function PromoDisplay({ position, color, label }: { position: [number, number, number]; color: string; label: string }) {
  return (
    <group position={position}>
      <RoundedBox args={[1.1, 1.5, 0.38]} position={[0, 0.75, 0]} radius={0.003} smoothness={4} castShadow>
        <meshStandardMaterial color={color} roughness={0.52} />
      </RoundedBox>
      <group position={[0, 1.72, 0.2]}>
        <LabelPanel label={label} accent="#ffe15a" width={1.2} />
      </group>
    </group>
  );
}

export function StoreEnvironment({ entered }: { entered: boolean }) {
  return (
    <group name="nextup-video-store">
      <color attach="background" args={["#10171b"]} />
      <fog attach="fog" args={["#c8d6cc", 38, 68]} />
      <FloorSurfaces />
      <CeilingSurface />
      <StoreWalls />
      <Baseboards />
      <AutomaticDoors open={entered} />

      {STORE_SECTIONS.map((section) => <ShelfFixture key={section.id} section={section} />)}
      <group position={[0, 2.85, -23.01]}>
        <LabelPanel label="NEXTUP VIDEO" accent="#ffd84d" subtitle="MOVIES · TELEVISION · MORE" width={3.4} />
      </group>
      {[-12, -4, 4, 12].flatMap((x) => [-15, -5, 5, 15].map((z) => (
        <FluorescentFixture
          key={`${x}:${z}`}
          position={[x, 3.38, z]}
          dead={x === 12 && z === 15}
          flicker={x === -4 && z === -5}
        />
      )))}
      <CheckoutArea />
      <SnackArea />
      <PromoDisplay position={[11.4, 0, 5.5]} color="#d43b3b" label="COMING SOON" />
      <PromoDisplay position={[0, 0, -13.1]} color="#224fa5" label="BE KIND, REWIND" />
    </group>
  );
}
