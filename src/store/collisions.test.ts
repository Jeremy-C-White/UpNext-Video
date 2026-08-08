import { describe, expect, it } from "vitest";
import { canOccupy, moveWithCollisions } from "./collisions";

describe("store collision movement", () => {
  it("keeps the player inside the authored store bounds", () => {
    expect(canOccupy(0, 0)).toBe(true);
    expect(canOccupy(18, 0)).toBe(false);
    expect(canOccupy(0, -23)).toBe(false);
  });

  it("slides along fixtures instead of moving through them", () => {
    const result = moveWithCollisions(-5.2, -5, -1.2, 0.8);
    expect(result.x).toBe(-5.2);
    expect(result.z).toBe(-4.2);
  });
});

