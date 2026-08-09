import * as THREE from "three";
import type { StorePlacement, StoreSectionDefinition, Vec3Tuple } from "./types";

export const STORE_BOUNDS = {
  minX: -6.9,
  maxX: 6.9,
  minZ: -10.3,
  maxZ: 10.35,
};

export const PLAYER_SPAWN: Vec3Tuple = [0, 1.68, 9.45];

// One Three.js unit is one metre. Keep these dimensions tied to a standard
// Amaray-style DVD case so the entire room reads correctly against eye height.
export const DVD_CASE_WIDTH = 0.135;
export const DVD_CASE_HEIGHT = 0.19;
export const DVD_CASE_DEPTH = 0.014;

// A double-sided gondola. Each fixture face sits this far from the island
// centerline with its back toward the core and its artwork toward an aisle.
export const ISLAND_HALF_DEPTH = 0.3;
export const ISLAND_CENTERS = { west: -2.5, east: 2.5, z: -3.2 } as const;

const EMPTY_SLOTS: Record<string, number[]> = {
  reserved: [7],
  "new-releases": [5, 18],
  action: [6, 20],
  comedy: [3, 17],
  horror: [10, 22],
  "sci-fi": [4, 19],
  television: [8, 21],
  "staff-picks": [2, 16],
};

function placementNoise(sectionId: string, index: number, salt: number) {
  const sectionSeed = Array.from(sectionId).reduce((sum, character) => sum + character.charCodeAt(0), 0);
  const value = Math.sin((sectionSeed * 97 + index * 131 + salt * 53) * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

export const STORE_SECTIONS: StoreSectionDefinition[] = [
  {
    id: "reserved",
    department: "Reserved for You",
    label: "RESERVED FOR YOU",
    aisle: "Front desk · Holds",
    center: [-4.7, 1.08, 8.15],
    rotationY: 0,
    columns: 4,
    rows: 3,
    columnGap: 0.36,
    rowGap: 0.28,
    accent: "#ffd34e",
  },
  {
    id: "new-releases",
    department: "New Releases",
    label: "★ NEW RELEASES ★",
    aisle: "Front feature · Center",
    center: [0, 1.17, 2.55],
    rotationY: 0,
    columns: 8,
    rows: 6,
    columnGap: 0.62,
    rowGap: 0.28,
    accent: "#ffe45c",
  },
  {
    id: "action",
    department: "Action",
    label: "ACTION",
    aisle: "Aisle 1 · West wall",
    center: [-6.75, 1.17, -3.2],
    rotationY: Math.PI / 2,
    columns: 8,
    rows: 6,
    columnGap: 0.62,
    rowGap: 0.28,
    accent: "#ff5f46",
  },
  {
    id: "comedy",
    department: "Comedy",
    label: "COMEDY",
    aisle: "Aisle 2 · West island",
    center: [ISLAND_CENTERS.west - ISLAND_HALF_DEPTH, 1.17, ISLAND_CENTERS.z],
    rotationY: -Math.PI / 2,
    columns: 8,
    rows: 6,
    columnGap: 0.62,
    rowGap: 0.28,
    accent: "#ffcf4a",
  },
  {
    id: "horror",
    department: "Horror",
    label: "HORROR",
    aisle: "Aisle 3 · West island",
    center: [ISLAND_CENTERS.west + ISLAND_HALF_DEPTH, 1.17, ISLAND_CENTERS.z],
    rotationY: Math.PI / 2,
    columns: 8,
    rows: 6,
    columnGap: 0.62,
    rowGap: 0.28,
    accent: "#f0528d",
  },
  {
    id: "sci-fi",
    department: "Science Fiction",
    label: "SCIENCE FICTION",
    aisle: "Aisle 4 · East island",
    center: [ISLAND_CENTERS.east - ISLAND_HALF_DEPTH, 1.17, ISLAND_CENTERS.z],
    rotationY: -Math.PI / 2,
    columns: 8,
    rows: 6,
    columnGap: 0.62,
    rowGap: 0.28,
    accent: "#51d6ff",
  },
  {
    id: "television",
    department: "Television",
    label: "TELEVISION",
    aisle: "Aisle 5 · East island",
    center: [ISLAND_CENTERS.east + ISLAND_HALF_DEPTH, 1.17, ISLAND_CENTERS.z],
    rotationY: Math.PI / 2,
    columns: 8,
    rows: 6,
    columnGap: 0.62,
    rowGap: 0.28,
    accent: "#62e5b6",
  },
  {
    id: "staff-picks",
    department: "Staff Picks",
    label: "NEXTUP STAFF PICKS",
    aisle: "Aisle 6 · East wall",
    center: [6.75, 1.17, -3.2],
    rotationY: -Math.PI / 2,
    columns: 8,
    rows: 6,
    columnGap: 0.62,
    rowGap: 0.28,
    accent: "#8ea7ff",
  },
];

export function sectionCapacity(section: StoreSectionDefinition) {
  return section.columns * section.rows - (EMPTY_SLOTS[section.id]?.length || 0);
}

export function createPlacement(section: StoreSectionDefinition, index: number): StorePlacement {
  const emptySlots = new Set(EMPTY_SLOTS[section.id] || []);
  const availableSlots = Array.from(
    { length: section.columns * section.rows },
    (_, slot) => slot,
  ).filter((slot) => !emptySlots.has(slot));
  const physicalSlot = availableSlots[index] ?? index;
  const row = Math.floor(physicalSlot / section.columns);
  const column = physicalSlot % section.columns;
  const localX = (column - (section.columns - 1) / 2) * section.columnGap;
  const localY = ((section.rows - 1) / 2 - row) * section.rowGap;
  const cos = Math.cos(section.rotationY);
  const sin = Math.sin(section.rotationY);
  const localZ = 0.06 + (placementNoise(section.id, physicalSlot, 1) - 0.5) * 0.008;
  const yawVariation = (placementNoise(section.id, physicalSlot, 2) - 0.5) * 0.014;
  const lean = (placementNoise(section.id, physicalSlot, 3) - 0.5) * 0.026;
  const caseScale = 0.98 + placementNoise(section.id, physicalSlot, 4) * 0.035;

  return {
    position: [
      section.center[0] + localX * cos + localZ * sin,
      section.center[1] + localY,
      section.center[2] - localX * sin + localZ * cos,
    ],
    rotationY: section.rotationY + yawVariation,
    rotationZ: lean,
    scale: caseScale,
    sectionId: section.id,
    aisle: section.aisle,
    shelf: `Shelf ${String.fromCharCode(65 + row)}`,
    row,
    column,
  };
}

export function sectionWidth(section: StoreSectionDefinition) {
  return (section.columns - 1) * section.columnGap + 0.24;
}

export function sectionHeight(section: StoreSectionDefinition) {
  return (section.rows - 1) * section.rowGap + 0.35;
}

export function buildGuidancePath(start: Vec3Tuple, target: Vec3Tuple): THREE.Vector3[] {
  const startPoint = new THREE.Vector3(start[0], 0.035, start[2]);
  const endPoint = new THREE.Vector3(target[0], 0.035, target[2]);
  const points = [startPoint];

  // The center of the store is an authored clear corridor. Route there first,
  // then toward the target aisle so the finder never sends people through a shelf.
  const corridorZ = target[2] < 6 ? 4.05 : 7.15;
  if (Math.abs(startPoint.z - corridorZ) > 0.8) {
    points.push(new THREE.Vector3(startPoint.x, 0.035, corridorZ));
  }
  if (Math.abs(startPoint.x - endPoint.x) > 0.8) {
    points.push(new THREE.Vector3(endPoint.x, 0.035, corridorZ));
  }
  points.push(endPoint);
  return points;
}
