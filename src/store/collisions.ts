import { STORE_BOUNDS } from "./layout";

export interface CollisionBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export const STATIC_COLLIDERS: CollisionBox[] = [
  // Back-to-back central shelving islands.
  { minX: -7.35, maxX: -5.75, minZ: -9.2, maxZ: -1.25 },
  { minX: 5.75, maxX: 7.35, minZ: -9.2, maxZ: -1.25 },
  // Checkout and snack fixtures.
  { minX: 9.2, maxX: 16.4, minZ: 11.1, maxZ: 17.8 },
  { minX: -16.2, maxX: -10.25, minZ: 11.6, maxZ: 17.3 },
  // Reserved-for-you hold shelf and two freestanding promo displays.
  { minX: -13.3, maxX: -9.0, minZ: 18.05, maxZ: 19.35 },
  { minX: -3.7, maxX: 3.7, minZ: 3.55, maxZ: 4.9 },
  { minX: 10.0, maxX: 12.8, minZ: 5.0, maxZ: 6.0 },
  { minX: -1.5, maxX: 1.5, minZ: -13.8, maxZ: -12.4 },
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
