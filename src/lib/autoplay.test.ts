import { describe, expect, it } from "vitest";
import { UserEpisode } from "../types";
import {
  CREDITS_AUTOPLAY_COUNTDOWN_SECONDS,
  findNextReleasedEpisode,
  shouldOfferNextEpisodeShortcut,
  shouldStartCreditsAutoplay,
} from "./autoplay";

const episode = (id: string, season: number, number: number, overrides: Partial<UserEpisode> = {}): UserEpisode => ({
  id,
  showId: 1,
  season,
  number,
  name: `Episode ${number}`,
  airdate: "2020-01-01",
  airstamp: "2020-01-01T20:00:00Z",
  imageUrl: "",
  summary: "",
  watched: false,
  type: "regular",
  ...overrides,
});

describe("findNextReleasedEpisode", () => {
  it("finds the next episode even when input is unsorted", () => {
    const episodes = [episode("e3", 1, 3), episode("e1", 1, 1), episode("e2", 1, 2)];
    expect(findNextReleasedEpisode(episodes, { episodeId: "e1", season: 1, number: 1 })?.id).toBe("e2");
  });

  it("continues across a season boundary", () => {
    const episodes = [episode("s2e1", 2, 1), episode("s1e10", 1, 10)];
    expect(findNextReleasedEpisode(episodes, { episodeId: "s1e10", season: 1, number: 10 })?.id).toBe("s2e1");
  });

  it("ignores specials and future episodes", () => {
    const episodes = [
      episode("e1", 1, 1),
      episode("special", 1, 2, { type: "special" }),
      episode("future", 1, 3, { airdate: "2999-01-01", airstamp: "2999-01-01T20:00:00Z" }),
    ];
    expect(findNextReleasedEpisode(episodes, { episodeId: "e1", season: 1, number: 1 })).toBeNull();
  });
});

describe("next episode affordances", () => {
  it("offers the shortcut in the final five minutes", () => {
    expect(shouldOfferNextEpisodeShortcut(3000, 2701, true)).toBe(true);
    expect(shouldOfferNextEpisodeShortcut(3000, 2000, true)).toBe(false);
  });

  it("uses a five-second countdown and trusted outro timestamps", () => {
    expect(CREDITS_AUTOPLAY_COUNTDOWN_SECONDS).toBe(5);
    expect(shouldStartCreditsAutoplay(3000, 2100, true, true)).toBe(true);
    expect(shouldStartCreditsAutoplay(3000, 2910, true, false)).toBe(true);
    expect(shouldStartCreditsAutoplay(3000, 2950, false, true)).toBe(false);
  });
});
