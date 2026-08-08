import { useEffect, useMemo, useRef } from "react";
import { Sparkles } from "@react-three/drei";
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

function LabelPanel({ label, accent, subtitle, width = 5.8 }: { label: string; accent: string; subtitle?: string; width?: number }) {
  const texture = useMemo(() => createLabelTexture(label, accent, subtitle), [accent, label, subtitle]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh>
      <planeGeometry args={[width, width / 4]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}

function ShelfFixture({ section }: { section: StoreSectionDefinition }) {
  const width = sectionWidth(section);
  const height = sectionHeight(section);
  return (
    <group position={section.center} rotation={[0, section.rotationY, 0]} name={`fixture-${section.id}`}>
      <mesh position={[0, 0, -0.24]} castShadow receiveShadow>
        <boxGeometry args={[width, height, 0.34]} />
        <meshStandardMaterial color="#173c86" roughness={0.52} metalness={0.08} />
      </mesh>
      {Array.from({ length: section.rows + 1 }, (_, index) => {
        const y = (section.rows / 2 - index) * section.rowGap - 0.02;
        return (
          <mesh key={index} position={[0, y, 0.04]} castShadow receiveShadow>
            <boxGeometry args={[width + 0.16, 0.075, 0.62]} />
            <meshStandardMaterial color="#e7d8b5" roughness={0.45} />
          </mesh>
        );
      })}
      <mesh position={[-width / 2 - 0.07, 0, -0.02]} castShadow>
        <boxGeometry args={[0.13, height + 0.2, 0.58]} />
        <meshStandardMaterial color="#f0dfba" roughness={0.48} />
      </mesh>
      <mesh position={[width / 2 + 0.07, 0, -0.02]} castShadow>
        <boxGeometry args={[0.13, height + 0.2, 0.58]} />
        <meshStandardMaterial color="#f0dfba" roughness={0.48} />
      </mesh>
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

function FluorescentFixture({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[4.6, 0.08, 0.46]} />
        <meshStandardMaterial color="#d8e2ee" emissive="#fff6d5" emissiveIntensity={2.4} toneMapped={false} />
      </mesh>
      <mesh position={[0, -0.055, 0]}>
        <boxGeometry args={[4.2, 0.02, 0.28]} />
        <meshBasicMaterial color="#fffbe8" toneMapped={false} />
      </mesh>
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

function CheckoutArea() {
  const crtScreen = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    if (crtScreen.current) crtScreen.current.emissiveIntensity = 1.4 + Math.sin(clock.elapsedTime * 4.8) * 0.22;
  });
  return (
    <group name="checkout">
      <mesh position={[12.7, 0.72, 14.6]} castShadow receiveShadow>
        <boxGeometry args={[6.5, 1.35, 2.1]} />
        <meshStandardMaterial color="#e9d5a8" roughness={0.48} />
      </mesh>
      <mesh position={[12.7, 1.45, 14.25]} castShadow>
        <boxGeometry args={[6.65, 0.13, 2.3]} />
        <meshStandardMaterial color="#17469c" roughness={0.32} metalness={0.1} />
      </mesh>
      <group position={[14.2, 2.18, 14.55]} rotation={[0, -0.22, 0]}>
        <mesh castShadow>
          <boxGeometry args={[1.35, 1.05, 1.05]} />
          <meshStandardMaterial color="#242a32" roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.02, -0.54]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[1.08, 0.77]} />
          <meshStandardMaterial ref={crtScreen} color="#58bfff" emissive="#2f9cff" emissiveIntensity={1.5} toneMapped={false} />
        </mesh>
      </group>
      <group position={[11.5, 2.1, 14.65]}>
        <mesh position={[0, 0.58, 0]} castShadow>
          <sphereGeometry args={[0.27, 16, 12]} />
          <meshStandardMaterial color="#b9794e" roughness={0.68} />
        </mesh>
        <mesh castShadow>
          <boxGeometry args={[0.58, 0.9, 0.38]} />
          <meshStandardMaterial color="#3461ad" roughness={0.7} />
        </mesh>
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
      <mesh position={[-13.2, 1.05, 14.4]} castShadow>
        <boxGeometry args={[5.4, 2.05, 1.4]} />
        <meshStandardMaterial color="#d9c59c" roughness={0.58} />
      </mesh>
      {[-15, -14.1, -13.2, -12.3, -11.4].map((x, index) => (
        <mesh key={x} position={[x, 1.65, 13.63]} castShadow>
          <boxGeometry args={[0.56, 0.78, 0.12]} />
          <meshStandardMaterial color={["#ee4466", "#ffcd4c", "#4ed1a1", "#965bce", "#f28a3b"][index]} roughness={0.48} />
        </mesh>
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
      <mesh position={[0, 1.1, 0]} castShadow>
        <boxGeometry args={[2.6, 2.2, 0.75]} />
        <meshStandardMaterial color={color} roughness={0.52} />
      </mesh>
      <group position={[0, 2.55, 0.4]}>
        <LabelPanel label={label} accent="#ffe15a" width={2.8} />
      </group>
    </group>
  );
}

export function StoreEnvironment({ entered }: { entered: boolean }) {
  return (
    <group name="nextup-video-store">
      <color attach="background" args={["#071227"]} />
      <fog attach="fog" args={["#0c1830", 22, 58]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[36, 48]} />
        <meshStandardMaterial color="#17336b" roughness={0.48} metalness={0.06} />
      </mesh>
      <gridHelper args={[48, 48, "#274d97", "#122b5f"]} position={[0, 0.012, 0]} />
      <mesh position={[0, 5.7, 0]} receiveShadow>
        <boxGeometry args={[36, 0.24, 48]} />
        <meshStandardMaterial color="#d8d4c7" roughness={0.86} />
      </mesh>
      <mesh position={[0, 2.85, -23.25]} receiveShadow>
        <boxGeometry args={[36.5, 5.7, 0.42]} />
        <meshStandardMaterial color="#e8dfc9" roughness={0.78} />
      </mesh>
      <mesh position={[-17.85, 2.85, 0]} receiveShadow>
        <boxGeometry args={[0.42, 5.7, 46.5]} />
        <meshStandardMaterial color="#e8dfc9" roughness={0.78} />
      </mesh>
      <mesh position={[17.85, 2.85, 0]} receiveShadow>
        <boxGeometry args={[0.42, 5.7, 46.5]} />
        <meshStandardMaterial color="#e8dfc9" roughness={0.78} />
      </mesh>
      <mesh position={[-11.6, 2.85, 23.25]} receiveShadow>
        <boxGeometry args={[12.7, 5.7, 0.42]} />
        <meshStandardMaterial color="#e8dfc9" roughness={0.78} />
      </mesh>
      <mesh position={[11.6, 2.85, 23.25]} receiveShadow>
        <boxGeometry args={[12.7, 5.7, 0.42]} />
        <meshStandardMaterial color="#e8dfc9" roughness={0.78} />
      </mesh>
      <AutomaticDoors open={entered} />

      {STORE_SECTIONS.map((section) => <ShelfFixture key={section.id} section={section} />)}
      <group position={[0, 4.35, -23.01]}>
        <LabelPanel label="NEXTUP VIDEO" accent="#ffd84d" subtitle="MOVIES · TELEVISION · MORE" width={9.2} />
      </group>
      {[-12, -4, 4, 12].flatMap((x) => [-15, -5, 5, 15].map((z) => (
        <FluorescentFixture key={`${x}:${z}`} position={[x, 5.48, z]} />
      )))}
      <CheckoutArea />
      <SnackArea />
      <PromoDisplay position={[11.4, 0, 5.5]} color="#d43b3b" label="COMING SOON" />
      <PromoDisplay position={[0, 0, -13.1]} color="#224fa5" label="BE KIND, REWIND" />
      <Sparkles count={80} scale={[32, 4.6, 42]} position={[0, 2.8, -1]} size={1.3} speed={0.12} color="#fff1bd" opacity={0.22} />
    </group>
  );
}
