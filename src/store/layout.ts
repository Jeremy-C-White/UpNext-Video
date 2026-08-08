import * as THREE from "three";
import type { StorePlacement, StoreSectionDefinition, Vec3Tuple } from "./types";

export const STORE_BOUNDS = {
  minX: -17.1,
  maxX: 17.1,
  minZ: -22.1,
  maxZ: 22.7,
};

export const PLAYER_SPAWN: Vec3Tuple = [0, 1.68, 20.4];

export const STORE_SECTIONS: StoreSectionDefinition[] = [
  {
    id: "reserved",
    department: "Reserved for You",
    label: "RESERVED FOR YOU",
    aisle: "Front desk · Holds",
    center: [-11.2, 2.05, 18.7],
    rotationY: 0,
    columns: 4,
    rows: 3,
    columnGap: 0.76,
    rowGap: 1.02,
    accent: "#ffd34e",
  },
  {
    id: "new-releases",
    department: "New Releases",
    label: "★ NEW RELEASES ★",
    aisle: "Front feature · Center",
    center: [0, 2.25, 4.2],
    rotationY: 0,
    columns: 8,
    rows: 3,
    columnGap: 0.77,
    rowGap: 1.04,
    accent: "#ffe45c",
  },
  {
    id: "action",
    department: "Action",
    label: "ACTION",
    aisle: "Aisle 1 · West wall",
    center: [-16.5, 2.25, -7.1],
    rotationY: Math.PI / 2,
    columns: 8,
    rows: 3,
    columnGap: 0.77,
    rowGap: 1.04,
    accent: "#ff5f46",
  },
  {
    id: "comedy",
    department: "Comedy",
    label: "COMEDY",
    aisle: "Aisle 2 · West island",
    center: [-6.75, 2.25, -5.3],
    rotationY: Math.PI / 2,
    columns: 8,
    rows: 3,
    columnGap: 0.77,
    rowGap: 1.04,
    accent: "#ffcf4a",
  },
  {
    id: "horror",
    department: "Horror",
    label: "HORROR",
    aisle: "Aisle 3 · West island",
    center: [-6.35, 2.25, -5.3],
    rotationY: -Math.PI / 2,
    columns: 8,
    rows: 3,
    columnGap: 0.77,
    rowGap: 1.04,
    accent: "#f0528d",
  },
  {
    id: "sci-fi",
    department: "Science Fiction",
    label: "SCIENCE FICTION",
    aisle: "Aisle 4 · East island",
    center: [6.35, 2.25, -5.3],
    rotationY: Math.PI / 2,
    columns: 8,
    rows: 3,
    columnGap: 0.77,
    rowGap: 1.04,
    accent: "#51d6ff",
  },
  {
    id: "television",
    department: "Television",
    label: "TELEVISION",
    aisle: "Aisle 5 · East island",
    center: [6.75, 2.25, -5.3],
    rotationY: -Math.PI / 2,
    columns: 8,
    rows: 3,
    columnGap: 0.77,
    rowGap: 1.04,
    accent: "#62e5b6",
  },
  {
    id: "staff-picks",
    department: "Staff Picks",
    label: "NEXTUP STAFF PICKS",
    aisle: "Aisle 6 · East wall",
    center: [16.5, 2.25, -7.1],
    rotationY: -Math.PI / 2,
    columns: 8,
    rows: 3,
    columnGap: 0.77,
    rowGap: 1.04,
    accent: "#8ea7ff",
  },
];

export function sectionCapacity(section: StoreSectionDefinition) {
  return section.columns * section.rows;
}

export function createPlacement(section: StoreSectionDefinition, index: number): StorePlacement {
  const row = Math.floor(index / section.columns);
  const column = index % section.columns;
  const localX = (column - (section.columns - 1) / 2) * section.columnGap;
  const localY = ((section.rows - 1) / 2 - row) * section.rowGap;
  const cos = Math.cos(section.rotationY);
  const sin = Math.sin(section.rotationY);
  const localZ = 0.25;

  return {
    position: [
      section.center[0] + localX * cos + localZ * sin,
      section.center[1] + localY,
      section.center[2] - localX * sin + localZ * cos,
    ],
    rotationY: section.rotationY,
    sectionId: section.id,
    aisle: section.aisle,
    shelf: `Shelf ${String.fromCharCode(65 + row)}`,
    row,
    column,
  };
}

export function sectionWidth(section: StoreSectionDefinition) {
  return (section.columns - 1) * section.columnGap + 0.92;
}

export function sectionHeight(section: StoreSectionDefinition) {
  return (section.rows - 1) * section.rowGap + 1.25;
}

export function buildGuidancePath(start: Vec3Tuple, target: Vec3Tuple): THREE.Vector3[] {
  const startPoint = new THREE.Vector3(start[0], 0.035, start[2]);
  const endPoint = new THREE.Vector3(target[0], 0.035, target[2]);
  const points = [startPoint];

  // The center of the store is an authored clear corridor. Route there first,
  // then toward the target aisle so the finder never sends people through a shelf.
  const corridorZ = target[2] < 10 ? 5.2 : 14.4;
  if (Math.abs(startPoint.z - corridorZ) > 0.8) {
    points.push(new THREE.Vector3(startPoint.x, 0.035, corridorZ));
  }
  if (Math.abs(startPoint.x - endPoint.x) > 0.8) {
    points.push(new THREE.Vector3(endPoint.x, 0.035, corridorZ));
  }
  points.push(endPoint);
  return points;
}
