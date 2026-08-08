import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { moveWithCollisions } from "./collisions";
import { PLAYER_SPAWN } from "./layout";
import type { PlayerPose } from "./types";

interface Props {
  paused: boolean;
  selectedId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  onReturnCase: () => void;
  onOpenFinder: () => void;
  onToggleMap: () => void;
  onLockChange: (locked: boolean) => void;
  onPoseChange: (pose: PlayerPose) => void;
}

export function StoreController({
  paused,
  selectedId,
  onHover,
  onSelect,
  onReturnCase,
  onOpenFinder,
  onToggleMap,
  onLockChange,
  onPoseChange,
}: Props) {
  const { camera, gl, scene } = useThree();
  const keys = useRef(new Set<string>());
  const velocity = useRef(new THREE.Vector3());
  const yaw = useRef(0);
  const pitch = useRef(0);
  const hoveredId = useRef<string | null>(null);
  const distanceWalked = useRef(0);
  const lastPoseReport = useRef(0);
  const raycastElapsed = useRef(0);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const center = useMemo(() => new THREE.Vector2(0, 0), []);
  const direction = useMemo(() => new THREE.Vector3(), []);
  const forward = useMemo(() => new THREE.Vector3(), []);
  const right = useMemo(() => new THREE.Vector3(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const rotation = useMemo(() => new THREE.Euler(0, 0, 0, "YXZ"), []);

  useEffect(() => {
    camera.position.set(...PLAYER_SPAWN);
    camera.rotation.order = "YXZ";
    camera.rotation.set(0, 0, 0);
    gl.domElement.dataset.nextupStoreCanvas = "true";
    gl.domElement.tabIndex = 0;
  }, [camera, gl]);

  useEffect(() => {
    const canvas = gl.domElement;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (["KeyW", "KeyA", "KeyS", "KeyD", "ShiftLeft", "ShiftRight"].includes(event.code)) {
        keys.current.add(event.code);
        event.preventDefault();
      }
      if (event.code === "KeyF" && !selectedId && !paused) {
        event.preventDefault();
        onOpenFinder();
      }
      if (event.code === "KeyM" && !selectedId && !paused) {
        event.preventDefault();
        onToggleMap();
      }
      if ((event.code === "KeyE" || event.code === "Enter") && hoveredId.current && !selectedId && !paused) {
        event.preventDefault();
        onSelect(hoveredId.current);
      }
      if ((event.code === "Escape" || event.code === "Backspace") && selectedId) {
        event.preventDefault();
        onReturnCase();
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => keys.current.delete(event.code);
    const handleMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement !== canvas || paused || selectedId) return;
      yaw.current -= event.movementX * 0.0018;
      pitch.current -= event.movementY * 0.00165;
      pitch.current = THREE.MathUtils.clamp(pitch.current, -1.38, 1.38);
    };
    const handleMouseDown = (event: MouseEvent) => {
      if (paused) return;
      if (event.button === 2 && selectedId) {
        event.preventDefault();
        onReturnCase();
        return;
      }
      if (event.button === 0 && document.pointerLockElement === canvas && hoveredId.current && !selectedId) {
        onSelect(hoveredId.current);
      }
    };
    const handleContextMenu = (event: MouseEvent) => event.preventDefault();
    const handlePointerLockChange = () => {
      const locked = document.pointerLockElement === canvas;
      if (!locked) keys.current.clear();
      onLockChange(locked);
    };

    window.addEventListener("keydown", handleKeyDown, { passive: false });
    window.addEventListener("keyup", handleKeyUp);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("pointerlockchange", handlePointerLockChange);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("pointerlockchange", handlePointerLockChange);
    };
  }, [gl, onLockChange, onOpenFinder, onReturnCase, onSelect, onToggleMap, paused, selectedId]);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    rotation.set(pitch.current, yaw.current, 0);
    camera.quaternion.setFromEuler(rotation);

    if (!paused && !selectedId && document.pointerLockElement === gl.domElement) {
      direction.set(0, 0, 0);
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      right.crossVectors(forward, up).normalize();

      if (keys.current.has("KeyW")) direction.add(forward);
      if (keys.current.has("KeyS")) direction.sub(forward);
      if (keys.current.has("KeyD")) direction.add(right);
      if (keys.current.has("KeyA")) direction.sub(right);
      if (direction.lengthSq() > 0) direction.normalize();

      const sprinting = keys.current.has("ShiftLeft") || keys.current.has("ShiftRight");
      const targetSpeed = sprinting ? 6.1 : 3.65;
      const responsiveness = direction.lengthSq() > 0 ? 10.5 : 8.5;
      velocity.current.x = THREE.MathUtils.damp(velocity.current.x, direction.x * targetSpeed, responsiveness, delta);
      velocity.current.z = THREE.MathUtils.damp(velocity.current.z, direction.z * targetSpeed, responsiveness, delta);

      const moveX = velocity.current.x * delta;
      const moveZ = velocity.current.z * delta;
      const moved = moveWithCollisions(camera.position.x, camera.position.z, moveX, moveZ);
      const actualDistance = Math.hypot(moved.x - camera.position.x, moved.z - camera.position.z);
      distanceWalked.current += actualDistance;
      camera.position.x = moved.x;
      camera.position.z = moved.z;
      const bob = actualDistance > 0.0001 ? Math.sin(distanceWalked.current * 8.4) * 0.018 : 0;
      camera.position.y = THREE.MathUtils.damp(camera.position.y, PLAYER_SPAWN[1] + bob, 14, delta);
    } else {
      velocity.current.multiplyScalar(Math.exp(-12 * delta));
    }

    raycastElapsed.current += delta;
    if (!paused && !selectedId && raycastElapsed.current >= 0.045) {
      raycastElapsed.current = 0;
      raycaster.far = 3.45;
      raycaster.setFromCamera(center, camera);
      const hit = raycaster.intersectObjects(scene.children, true).find((intersection) => {
        return typeof intersection.object.userData.storeItemId === "string";
      });
      const nextHover = hit?.object.userData.storeItemId || null;
      if (nextHover !== hoveredId.current) {
        hoveredId.current = nextHover;
        onHover(nextHover);
      }
    } else if ((paused || selectedId) && hoveredId.current) {
      hoveredId.current = null;
      onHover(null);
    }

    const now = performance.now();
    if (now - lastPoseReport.current > 120) {
      lastPoseReport.current = now;
      onPoseChange({ x: camera.position.x, y: camera.position.y, z: camera.position.z, yaw: yaw.current });
    }
  });

  return null;
}
