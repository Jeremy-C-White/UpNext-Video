import { describe, expect, it } from "vitest";
import {
  clearPlaybackProgress,
  getResumePosition,
  PlaybackProgressStorage,
  readPlaybackProgress,
  writePlaybackProgress,
} from "./playbackProgress";

class MemoryStorage implements PlaybackProgressStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

describe("playback progress", () => {
  const now = Date.UTC(2026, 6, 28, 22, 0, 0);

  it("stores progress separately per user and episode", () => {
    const storage = new MemoryStorage();
    expect(writePlaybackProgress(storage, "user one", "show/1", "episode:2", 615.9, 2700.7, now)).toBe(true);
    expect(readPlaybackProgress(storage, "user one", "show/1", "episode:2", now)).toEqual({ position: 615, duration: 2700, updatedAt: now });
    expect(readPlaybackProgress(storage, "user two", "show/1", "episode:2", now)).toBeNull();
  });

  it("resumes only after a meaningful start and before the ending", () => {
    expect(getResumePosition({ position: 615, duration: 2700, updatedAt: now })).toBe(615);
    expect(getResumePosition({ position: 20, duration: 2700, updatedAt: now })).toBeNull();
    expect(getResumePosition({ position: 2650, duration: 2700, updatedAt: now })).toBeNull();
  });

  it("clears completed progress", () => {
    const storage = new MemoryStorage();
    writePlaybackProgress(storage, "user", "show", "episode", 600, 1800, now);
    clearPlaybackProgress(storage, "user", "show", "episode");
    expect(readPlaybackProgress(storage, "user", "show", "episode", now)).toBeNull();
  });
});
