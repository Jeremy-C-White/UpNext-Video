import { describe, expect, it } from "vitest";
import {
  coalesceLibraryDocuments,
  getLibraryDocumentIds,
  normalizeLibraryDocumentId,
} from "./libraryIdentity";

describe("library document identity", () => {
  it("uses the exact persisted document ID for writes", () => {
    expect(normalizeLibraryDocumentId("-1000123456")).toBe("-1000123456");
  });

  it("deduplicates a matching source and TVMaze ID", () => {
    expect(getLibraryDocumentIds({ id: "123", tvmazeId: 123 })).toEqual(["123"]);
  });

  it("includes the legacy TVMaze duplicate when IDs differ", () => {
    expect(getLibraryDocumentIds({ id: "-1000123456", tvmazeId: 9876 })).toEqual([
      "-1000123456",
      "9876",
    ]);
  });

  it("rejects an unsafe Firestore path segment", () => {
    expect(() => normalizeLibraryDocumentId("bad/id")).toThrow("Invalid library show ID");
  });

  it("merges watched state from a sparse legacy alias without displaying it", () => {
    const result = coalesceLibraryDocuments([
      {
        id: "-1000123456",
        tvmazeId: 9876,
        name: "Example Show",
        imageUrl: "poster.jpg",
        status: "Running",
        provider: "Example",
        addedAt: 1,
        summary: "Example",
        watchedEpisodes: { "10": 100 },
      },
      {
        id: "9876",
        watchedEpisodes: { "10": 200, "11": 300 },
      },
    ]);

    expect(result.shows).toHaveLength(1);
    expect(result.shows[0].id).toBe("-1000123456");
    expect(result.shows[0].watchedEpisodes).toEqual({ "10": 200, "11": 300 });
    expect(result.duplicateDocumentIds).toEqual(["9876"]);
    expect(result.orphanDocumentIds).toEqual([]);
  });

  it("quarantines an incomplete document that cannot be matched safely", () => {
    const result = coalesceLibraryDocuments([
      { id: "orphan", watchedEpisodes: { "1": 123 } },
    ]);

    expect(result.shows).toEqual([]);
    expect(result.orphanDocumentIds).toEqual(["orphan"]);
  });

  it("keeps an older named document by deriving its numeric identity", () => {
    const result = coalesceLibraryDocuments([
      {
        id: "321",
        name: "Legacy Show",
        imageUrl: "",
        status: "Unknown",
        provider: "",
        addedAt: 1,
        summary: "",
      },
    ]);

    expect(result.shows).toHaveLength(1);
    expect(result.shows[0].tvmazeId).toBe(321);
  });
});
