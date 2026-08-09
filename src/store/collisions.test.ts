import { describe, expect, it } from "vitest";
import { canOccupy, moveWithCollisions } from "./collisions";
import { ISLAND_CENTERS } from "./layout";

describe("store collision movement", () => {
  it("keeps the player inside the authored store bounds", () => {
    expect(canOccupy(0, 0)).toBe(true);
    expect(canOccupy(7.5, 0)).toBe(false);
    expect(canOccupy(0, -11)).toBe(false);
  });

  it("slides along fixtures instead of moving through them", () => {
    const result = moveWithCollisions(-1.5, -3.2, -0.8, 0.8);
    expect(result.x).toBe(-1.5);
    expect(result.z).toBeCloseTo(-2.4);
  });

  it("keeps open walking lanes in the compact store", () => {
    expect(canOccupy(5.8, 5.8)).toBe(true);
    expect(canOccupy(-5.8, 4.2)).toBe(true);
    expect(canOccupy(0, -8.25)).toBe(true);
    expect(canOccupy(0, 2.55)).toBe(false);
  });

  it("treats each double-sided island as one solid gondola with open aisles", () => {
    expect(canOccupy(ISLAND_CENTERS.west, ISLAND_CENTERS.z)).toBe(false);
    expect(canOccupy(ISLAND_CENTERS.east, ISLAND_CENTERS.z)).toBe(false);
    expect(canOccupy(-1.5, ISLAND_CENTERS.z)).toBe(true);
    expect(canOccupy(1.5, ISLAND_CENTERS.z)).toBe(true);
  });
});
