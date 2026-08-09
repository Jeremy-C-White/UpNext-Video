import { ISLAND_CENTERS, ISLAND_HALF_DEPTH, sectionWidth, STORE_BOUNDS, STORE_SECTIONS } from "./layout";

export interface CollisionBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function boxFromCenter(x: number, z: number, width: number, depth: number): CollisionBox {
  return { minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2 };
}

function sectionCollider(id: string) {
  const section = STORE_SECTIONS.find((candidate) => candidate.id === id)!;
  const width = sectionWidth(section) + 0.08;
  const depth = 0.28;
  const cos = Math.abs(Math.cos(section.rotationY));
  const sin = Math.abs(Math.sin(section.rotationY));
  return boxFromCenter(
    section.center[0],
    section.center[2],
    width * cos + depth * sin,
    width * sin + depth * cos,
  );
}

function islandCollider(centerX: number): CollisionBox {
  const reference = STORE_SECTIONS.find((section) => section.id === "comedy")!;
  return boxFromCenter(
    centerX,
    ISLAND_CENTERS.z,
    ISLAND_HALF_DEPTH * 2 + 0.3,
    sectionWidth(reference) + 0.12,
  );
}

export const STATIC_COLLIDERS: CollisionBox[] = [
  islandCollider(ISLAND_CENTERS.west),
  islandCollider(ISLAND_CENTERS.east),
  sectionCollider("reserved"),
  sectionCollider("new-releases"),
  boxFromCenter(4.7, 8.1, 4.3, 1.08),
  boxFromCenter(-4.8, 8.1, 3.5, 0.72),
  boxFromCenter(4.85, 2.7, 1.1, 0.38),
];

export function circleIntersectsBox(x: number, z: number, radius: number, box: CollisionBox) {
  const nearestX = Math.max(box.minX, Math.min(x, box.maxX));
  const nearestZ = Math.max(box.minZ, Math.min(z, box.maxZ));
  const dx = x - nearestX;
  const dz = z - nearestZ;
  return dx * dx + dz * dz < radius * radius;
}

export function canOccupy(x: number, z: number, radius = 0.42) {
  if (
    x - radius < STORE_BOUNDS.minX ||
    x + radius > STORE_BOUNDS.maxX ||
    z - radius < STORE_BOUNDS.minZ ||
    z + radius > STORE_BOUNDS.maxZ
  ) {
    return false;
  }
  return !STATIC_COLLIDERS.some((box) => circleIntersectsBox(x, z, radius, box));
}

export function moveWithCollisions(
  currentX: number,
  currentZ: number,
  deltaX: number,
  deltaZ: number,
  radius = 0.42,
) {
  let x = currentX;
  let z = currentZ;
  if (canOccupy(currentX + deltaX, z, radius)) x += deltaX;
  if (canOccupy(x, currentZ + deltaZ, radius)) z += deltaZ;
  return { x, z };
}
