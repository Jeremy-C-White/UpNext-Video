import { describe, expect, it } from "vitest";
import type { Show, UserEpisode, UserShow } from "../types";
import { buildStoreCatalog } from "./catalog";
import { createPlacement, DVD_CASE_DEPTH, DVD_CASE_HEIGHT, DVD_CASE_WIDTH, ISLAND_CENTERS, sectionCapacity, sectionHeight, STORE_SECTIONS } from "./layout";

const makeShow = (id: number, name: string, genres: string[], isMovie = true): Show => ({
  id,
  name,
  genres,
  isMovie,
  premiered: "2025-01-01",
  image: { medium: `https://image.tmdb.org/t/p/w342/${Math.abs(id)}.jpg`, original: "" },
  vote_average: 8,
  _tmdbId: Math.abs(id),
});

describe("NEXTUP VIDEO catalog", () => {
  it("turns watched state into a personalized physical hold", () => {
    const library: UserShow[] = [{
      id: "42",
      tvmazeId: 42,
      name: "Night Shift",
      imageUrl: "poster.jpg",
      status: "Running",
      provider: "",
      addedAt: 1,
      summary: "A late-night mystery.",
      genres: ["Drama"],
      watchedEpisodes: { "1": 1 },
    }];
    const episodes: UserEpisode[] = [
      { id: "1", showId: 42, season: 1, number: 1, name: "Pilot", airdate: "2025-01-01", airstamp: "2025-01-01T00:00:00Z", imageUrl: "", summary: "", watched: true },
      { id: "2", showId: 42, season: 1, number: 2, name: "After Hours", airdate: "2025-01-02", airstamp: "2025-01-02T00:00:00Z", imageUrl: "", summary: "", watched: false },
    ];
    const supplemental = Array.from({ length: 80 }, (_, index) => makeShow(-1000 - index, `Title ${index}`, [index % 2 ? "Action" : "Comedy"], index % 5 !== 0));
    const catalog = buildStoreCatalog({ library, episodesMap: { "42": episodes }, discovery: [], staffPicks: [], supplemental, userName: "Alex" });
    const hold = catalog.find((item) => item.department === "Reserved for You" && item.name === "Night Shift");
    expect(hold?.nextEpisode?.name).toBe("After Hours");
    expect(hold?.progress).toBe(50);
    expect(hold?.placement.aisle).toContain("Holds");
  });

  it("assigns unique physical ids and shelf directions", () => {
    const supplemental: Show[] = Array.from({ length: 120 }, (_, index) => {
      const genres = [["Action"], ["Comedy"], ["Horror"], ["Science Fiction"]][index % 4];
      return makeShow(-2000 - index, `Catalog ${index}`, genres, index % 6 !== 0);
    });
    const catalog = buildStoreCatalog({ library: [], episodesMap: {}, discovery: [], staffPicks: supplemental.slice(0, 20), supplemental });
    expect(new Set(catalog.map((item) => item.id)).size).toBe(catalog.length);
    expect(catalog.length).toBeGreaterThan(100);
    expect(catalog.every((item) => Number.isFinite(item.placement.rotationY))).toBe(true);
    expect(catalog.some((item) => Math.abs(item.placement.rotationZ) > 0.005)).toBe(true);
    expect(catalog.every((item) => item.placement.scale >= 0.98 && item.placement.scale <= 1.015)).toBe(true);
  });

  it("stocks the front hold fixture for a new user without claiming titles are in their library", () => {
    const supplemental = Array.from({ length: 80 }, (_, index) => makeShow(-3000 - index, `Walk-in Pick ${index}`, ["Action"]));
    const catalog = buildStoreCatalog({ library: [], episodesMap: {}, discovery: [], staffPicks: [], supplemental });
    const reserved = catalog.filter((item) => item.department === "Reserved for You");
    const section = STORE_SECTIONS.find((candidate) => candidate.id === "reserved")!;

    expect(reserved).toHaveLength(sectionCapacity(section));
    expect(reserved.every((item) => !item.libraryShow)).toBe(true);
    expect(reserved.every((item) => item.personalizedReason === "A popular pick held for your next visit.")).toBe(true);
  });

  it("faces both sides of each gondola outward toward their aisles", () => {
    const islandSections = STORE_SECTIONS.filter((section) => ["comedy", "horror", "sci-fi", "television"].includes(section.id));
    for (const section of islandSections) {
      const centerX = section.center[0] < 0 ? ISLAND_CENTERS.west : ISLAND_CENTERS.east;
      const offsetFromCore = section.center[0] - centerX;
      const frontNormalX = Math.sin(section.rotationY);
      expect(offsetFromCore * frontNormalX).toBeGreaterThan(0);
    }
  });

  it("uses human-scale cases and six-row rental fixtures", () => {
    const section = STORE_SECTIONS.find((candidate) => candidate.id === "new-releases")!;
    expect([DVD_CASE_WIDTH, DVD_CASE_HEIGHT, DVD_CASE_DEPTH]).toEqual([0.135, 0.19, 0.014]);
    expect(section.rows).toBe(6);
    expect(section.rowGap).toBeCloseTo(0.28);
    expect(sectionHeight(section)).toBeLessThan(1.9);
  });

  it("leaves believable rented-out gaps without overlapping physical slots", () => {
    const section = STORE_SECTIONS.find((candidate) => candidate.id === "new-releases")!;
    const placements = Array.from({ length: sectionCapacity(section) }, (_, index) => createPlacement(section, index));
    const occupiedSlots = placements.map((placement) => `${placement.row}:${placement.column}`);

    expect(new Set(occupiedSlots).size).toBe(occupiedSlots.length);
    expect(occupiedSlots).not.toContain("0:5");
    expect(occupiedSlots).not.toContain("2:2");
  });
});
