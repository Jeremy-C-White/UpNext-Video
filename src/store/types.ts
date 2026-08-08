import type { Show, UserEpisode, UserShow } from "../types";

export type StoreDepartment =
  | "Reserved for You"
  | "New Releases"
  | "Action"
  | "Comedy"
  | "Horror"
  | "Science Fiction"
  | "Television"
  | "Staff Picks";

export type Vec3Tuple = [number, number, number];

export interface StorePlacement {
  position: Vec3Tuple;
  rotationY: number;
  sectionId: string;
  aisle: string;
  shelf: string;
  row: number;
  column: number;
}

export interface StoreMedia {
  id: string;
  mediaKey: string;
  source: Show;
  libraryShow?: UserShow;
  name: string;
  summary: string;
  posterUrl: string;
  backdropUrl: string;
  genres: string[];
  department: StoreDepartment;
  year?: number;
  runtime?: number;
  rating?: number;
  isMovie: boolean;
  watched: boolean;
  progress: number;
  nextEpisode?: UserEpisode;
  personalizedReason?: string;
  placement: StorePlacement;
}

export interface PlayerPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface StoreSectionDefinition {
  id: string;
  department: StoreDepartment;
  label: string;
  aisle: string;
  center: Vec3Tuple;
  rotationY: number;
  columns: number;
  rows: number;
  columnGap: number;
  rowGap: number;
  accent: string;
}

