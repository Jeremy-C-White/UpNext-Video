import { describe, expect, test } from "vitest";
import type { PlaybackCandidate } from "../types";
import {
  detectPlaybackEnvironment,
  getCandidatePlaybackDecision,
  inferCandidateContainer,
  partitionPlaybackCandidates,
} from "./playbackCapabilities";

const candidate = (overrides: Partial<PlaybackCandidate>): PlaybackCandidate => ({
  id: "source",
  url: "https://media.example/video",
  title: "Example source",
  score: 100,
  ...overrides,
});

const playableProbe = {
  canPlayType: (type: string) => type.includes("matroska") ? "maybe" : "",
};

describe("playback environment detection", () => {
  test("detects an iPhone without treating CriOS as desktop Chromium", () => {
    const environment = detectPlaybackEnvironment({
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) AppleWebKit/605.1.15 CriOS/140.0 Mobile/15E148",
      platform: "iPhone",
      maxTouchPoints: 5,
    }, playableProbe);

    expect(environment.deviceClass).toBe("ios");
    expect(environment.isChromium).toBe(false);
  });

  test("detects iPadOS when Safari reports a Mac platform", () => {
    const environment = detectPlaybackEnvironment({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)",
      platform: "MacIntel",
      maxTouchPoints: 5,
    });

    expect(environment.deviceClass).toBe("ios");
  });

  test("enables Matroska probing for desktop Chrome", () => {
    const environment = detectPlaybackEnvironment({
      userAgent: "Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36",
      platform: "Win32",
      maxTouchPoints: 0,
    }, { canPlayType: () => "" });

    expect(environment.deviceClass).toBe("desktop");
    expect(environment.supportsMatroska).toBe(true);
  });
});

describe("adaptive candidate planning", () => {
  const desktop = detectPlaybackEnvironment({
    userAgent: "Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36",
    platform: "Win32",
  }, playableProbe);
  const ios = detectPlaybackEnvironment({
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
    platform: "iPhone",
    maxTouchPoints: 5,
  });

  test("infers MKV from a provider title even when the URL has no extension", () => {
    expect(inferCandidateContainer(candidate({ title: "Movie.2026.1080p.mkv" }))).toBe("mkv");
  });

  test("probes MKV inside NextUp on desktop Chrome", () => {
    const decision = getCandidatePlaybackDecision(candidate({
      title: "Movie.2026.1080p.mkv",
      mediaContainer: "mkv",
      browserCompatibility: "unknown",
    }), desktop);

    expect(decision.route).toBe("in-app");
    expect(decision.confidence).toBe("probe");
  });

  test("keeps MKV out of inline playback on iPhone", () => {
    const decision = getCandidatePlaybackDecision(candidate({
      title: "Movie.2026.1080p.mkv",
      mediaContainer: "mkv",
      browserCompatibility: "unknown",
    }), ios);

    expect(decision.route).toBe("fallback");
  });

  test("never sends custom-header streams directly to a video element", () => {
    expect(getCandidatePlaybackDecision(candidate({ requiresCustomHeaders: true }), desktop).route).toBe("fallback");
  });

  test("keeps HLS inside NextUp when Media Source Extensions are available", () => {
    const decision = getCandidatePlaybackDecision(candidate({
      mediaContainer: "hls",
      browserCompatibility: "compatible",
    }), { ...desktop, supportsMediaSource: true });

    expect(decision.route).toBe("in-app");
  });

  test("ranks known browser sources before runtime probes", () => {
    const mkv = candidate({ id: "mkv", mediaContainer: "mkv", browserCompatibility: "unknown" });
    const mp4 = candidate({ id: "mp4", mediaContainer: "mp4", browserCompatibility: "compatible" });
    const result = partitionPlaybackCandidates([mkv, mp4], desktop);

    expect(result.inApp.map((item) => item.id)).toEqual(["mp4", "mkv"]);
    expect(result.fallback).toEqual([]);
  });
});
