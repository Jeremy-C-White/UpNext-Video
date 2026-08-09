import { useEffect, useMemo, useRef } from "react";
import { RoundedBox, Sparkles } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
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
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d")!;
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
    tileColor.repeat.set(9, 12);
    tileRoughness.repeat.set(9, 12);
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
        <RoundedBox key={index} args={piece.size} position={piece.position} radius={0.025} smoothness={2} receiveShadow>
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
    colorMap.repeat.set(9, 12);
    roughnessMap.repeat.set(9, 12);
    return () => {
      colorMap.dispose();
      roughnessMap.dispose();
    };
  }, [colorMap, roughnessMap]);
  return (
    <mesh position={[0, 5.7, 0]} receiveShadow>
      <boxGeometry args={[36, 0.24, 48]} />
      <meshStandardMaterial
        map={colorMap}
        roughnessMap={roughnessMap}
        roughness={0.86}
        color="#d8d2c5"
        emissive="#aaa392"
        emissiveIntensity={0.15}
      />
    </mesh>
  );
}

function StoreWalls() {
  const colorMap = useMemo(() => createSurfaceTexture("wall"), []);
  const roughnessMap = useMemo(() => createSurfaceTexture("wall", true), []);
  useEffect(() => {
    colorMap.repeat.set(5, 2);
    roughnessMap.repeat.set(5, 2);
    return () => {
      colorMap.dispose();
      roughnessMap.dispose();
    };
  }, [colorMap, roughnessMap]);
  const pieces: Array<{ position: [number, number, number]; size: [number, number, number] }> = [
    { position: [0, 2.85, -23.25], size: [36.5, 5.7, 0.42] },
    { position: [-17.85, 2.85, 0], size: [0.42, 5.7, 46.5] },
    { position: [17.85, 2.85, 0], size: [0.42, 5.7, 46.5] },
    { position: [-11.6, 2.85, 23.25], size: [12.7, 5.7, 0.42] },
    { position: [11.6, 2.85, 23.25], size: [12.7, 5.7, 0.42] },
  ];
  return (
    <group name="painted-store-walls">
      {pieces.map((piece, index) => (
        <mesh key={index} position={piece.position} receiveShadow>
          <boxGeometry args={piece.size} />
          <meshStandardMaterial map={colorMap} roughnessMap={roughnessMap} color="#d1c9b8" roughness={0.82} />
        </mesh>
      ))}
    </group>
  );
}

function ShelfTalker({ accent, width }: { accent: string; width: number }) {
  return (
    <group position={[Math.min(width * 0.2, 1.3), -0.37, 0.4]} rotation={[0.035, 0, -0.02]}>
      <mesh castShadow>
        <planeGeometry args={[0.78, 0.46, 4, 2]} />
        <meshStandardMaterial color="#eee4c8" roughness={0.86} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.04, 0.006]}>
        <planeGeometry args={[0.6, 0.07]} />
        <meshStandardMaterial color={accent} roughness={0.7} />
      </mesh>
    </group>
  );
}

function ShelfFixture({ section }: { section: StoreSectionDefinition }) {
  const width = sectionWidth(section);
  const height = sectionHeight(section);
  return (
    <group position={section.center} rotation={[0, section.rotationY, 0]} name={`fixture-${section.id}`}>
      <RoundedBox args={[width, height, 0.34]} position={[0, 0, -0.24]} radius={0.045} smoothness={2} castShadow receiveShadow>
        <meshStandardMaterial color="#173c86" roughness={0.52} metalness={0.08} />
      </RoundedBox>
      {Array.from({ length: section.rows + 1 }, (_, index) => {
        const y = (section.rows / 2 - index) * section.rowGap - 0.02;
        return (
          <RoundedBox
            key={index}
            args={[width + 0.16, 0.075, 0.62]}
            position={[0, y - (index % 2 ? 0.004 : 0), 0.04]}
            rotation={[0, 0, (index - section.rows / 2) * 0.0015]}
            radius={0.018}
            smoothness={2}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial color="#e7d8b5" roughness={0.45} />
          </RoundedBox>
        );
      })}
      <RoundedBox args={[0.13, height + 0.2, 0.58]} position={[-width / 2 - 0.07, 0, -0.02]} radius={0.025} smoothness={2} castShadow>
        <meshStandardMaterial color="#f0dfba" roughness={0.48} />
      </RoundedBox>
      <RoundedBox args={[0.13, height + 0.2, 0.58]} position={[width / 2 + 0.07, 0, -0.02]} radius={0.025} smoothness={2} castShadow>
        <meshStandardMaterial color="#f0dfba" roughness={0.48} />
      </RoundedBox>
      <ShelfTalker accent={section.accent} width={width} />
      <group position={[0, height / 2 + 0.72, 0.08]}>
        <LabelPanel
          label={section.label}
          accent={section.accent}
          subtitle={section.id === "staff-picks" ? "SELECTED JUST FOR YOU" : undefined}
          width={Math.min(width + 0.55, 6.8)}
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
      <RoundedBox args={[4.7, 0.1, 0.56]} radius={0.035} smoothness={2}>
        <meshStandardMaterial color="#c4c8c1" metalness={0.42} roughness={0.38} />
      </RoundedBox>
      {[-0.18, -0.06, 0.06, 0.18].map((z) => (
        <RoundedBox key={z} args={[4.25, 0.028, 0.055]} position={[0, -0.064, z]} radius={0.014} smoothness={2}>
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
    <group position={[0, 2.0, 22.9]}>
      <mesh ref={left} position={[-0.96, 0, 0]} castShadow>
        <boxGeometry args={[1.84, 3.7, 0.09]} />
        <meshPhysicalMaterial color="#94b8d6" transparent opacity={0.28} roughness={0.08} transmission={0.25} />
      </mesh>
      <mesh ref={right} position={[0.96, 0, 0]} castShadow>
        <boxGeometry args={[1.84, 3.7, 0.09]} />
        <meshPhysicalMaterial color="#94b8d6" transparent opacity={0.28} roughness={0.08} transmission={0.25} />
      </mesh>
      <mesh position={[0, 2.04, 0]}>
        <boxGeometry args={[5.6, 0.22, 0.3]} />
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
      <RoundedBox args={[6.5, 1.35, 2.1]} position={[12.7, 0.72, 14.6]} radius={0.08} smoothness={3} castShadow receiveShadow>
        <meshStandardMaterial color="#e9d5a8" roughness={0.48} />
      </RoundedBox>
      <RoundedBox args={[6.65, 0.13, 2.3]} position={[12.7, 1.45, 14.25]} radius={0.045} smoothness={3} castShadow>
        <meshStandardMaterial color="#17469c" roughness={0.32} metalness={0.1} />
      </RoundedBox>
      <group position={[14.2, 2.18, 14.55]} rotation={[0, -0.22, 0]}>
        <RoundedBox args={[1.35, 1.05, 1.05]} radius={0.12} smoothness={3} castShadow>
          <meshStandardMaterial color="#242a32" roughness={0.6} />
        </RoundedBox>
        <mesh position={[0, 0.02, -0.54]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[1.08, 0.77]} />
          <meshStandardMaterial ref={crtScreen} map={crtTexture} color="#dcecff" emissive="#58aee4" emissiveMap={crtTexture} emissiveIntensity={1.5} roughness={0.24} />
        </mesh>
        <pointLight position={[0, -0.05, -1.15]} color="#4fa6dc" intensity={1.15} distance={3.2} />
      </group>
      <group position={[11.5, 2.1, 14.65]}>
        <mesh position={[0, 0.58, 0]} castShadow>
          <sphereGeometry args={[0.27, 16, 12]} />
          <meshStandardMaterial color="#b9794e" roughness={0.68} />
        </mesh>
        <RoundedBox args={[0.58, 0.9, 0.38]} radius={0.08} smoothness={2} castShadow>
          <meshStandardMaterial color="#3461ad" roughness={0.7} />
        </RoundedBox>
      </group>
      <group position={[12.6, 3.5, 13.85]} rotation={[0, 0, 0]}>
        <LabelPanel label="CHECKOUT" accent="#ffd54c" width={4.8} />
      </group>
    </group>
  );
}

function SnackArea() {
  return (
    <group name="snacks">
      <RoundedBox args={[5.4, 2.05, 1.4]} position={[-13.2, 1.05, 14.4]} radius={0.07} smoothness={3} castShadow>
        <meshStandardMaterial color="#d9c59c" roughness={0.58} />
      </RoundedBox>
      {[-15, -14.1, -13.2, -12.3, -11.4].map((x, index) => (
        <RoundedBox key={x} args={[0.56, 0.78, 0.12]} position={[x, 1.65 + (index % 2) * 0.025, 13.63]} rotation={[0, 0, (index - 2) * 0.012]} radius={0.035} smoothness={2} castShadow>
          <meshStandardMaterial color={["#ee4466", "#ffcd4c", "#4ed1a1", "#965bce", "#f28a3b"][index]} roughness={0.48} />
        </RoundedBox>
      ))}
      <group position={[-13.2, 3.0, 13.68]}>
        <LabelPanel label="MOVIE NIGHT SNACKS" accent="#ffcf49" width={5.5} />
      </group>
    </group>
  );
}

function PromoDisplay({ position, color, label }: { position: [number, number, number]; color: string; label: string }) {
  return (
    <group position={position}>
      <RoundedBox args={[2.6, 2.2, 0.75]} position={[0, 1.1, 0]} radius={0.065} smoothness={3} castShadow>
        <meshStandardMaterial color={color} roughness={0.52} />
      </RoundedBox>
      <group position={[0, 2.55, 0.4]}>
        <LabelPanel label={label} accent="#ffe15a" width={2.8} />
      </group>
    </group>
  );
}

export function StoreEnvironment({ entered }: { entered: boolean }) {
  return (
    <group name="nextup-video-store">
      <color attach="background" args={["#07101d"]} />
      <fog attach="fog" args={["#0b1421", 24, 60]} />
      <FloorSurfaces />
      <CeilingSurface />
      <StoreWalls />
      <Baseboards />
      <AutomaticDoors open={entered} />

      {STORE_SECTIONS.map((section) => <ShelfFixture key={section.id} section={section} />)}
      <group position={[0, 4.35, -23.01]}>
        <LabelPanel label="NEXTUP VIDEO" accent="#ffd84d" subtitle="MOVIES · TELEVISION · MORE" width={9.2} />
      </group>
      {[-12, -4, 4, 12].flatMap((x) => [-15, -5, 5, 15].map((z) => (
        <FluorescentFixture
          key={`${x}:${z}`}
          position={[x, 5.48, z]}
          dead={x === 12 && z === 15}
          flicker={x === -4 && z === -5}
        />
      )))}
      <CheckoutArea />
      <SnackArea />
      <PromoDisplay position={[11.4, 0, 5.5]} color="#d43b3b" label="COMING SOON" />
      <PromoDisplay position={[0, 0, -13.1]} color="#224fa5" label="BE KIND, REWIND" />
      <Sparkles count={80} scale={[32, 4.6, 42]} position={[0, 2.8, -1]} size={1.3} speed={0.12} color="#fff1bd" opacity={0.22} />
    </group>
  );
}
