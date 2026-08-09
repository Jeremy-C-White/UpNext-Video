import { describe, expect, it } from "vitest";
import { findEnglishAudioTrackIndex, hasOnlyKnownNonEnglishTracks } from "./audioTracks";

describe("English audio-track selection", () => {
  it("selects an English language tag", () => {
    expect(findEnglishAudioTrackIndex([
      { language: "es", label: "Español" },
      { language: "en-US", label: "English" },
    ])).toBe(1);
  });

  it("prefers standard English over audio description", () => {
    expect(findEnglishAudioTrackIndex([
      { language: "en", label: "English Audio Description" },
      { language: "eng", label: "English Main" },
    ])).toBe(1);
  });

  it("prefers browser-friendly English audio over TrueHD", () => {
    expect(findEnglishAudioTrackIndex([
      { language: "en", label: "English TrueHD Atmos" },
      { language: "eng", label: "English EAC3 5.1" },
    ])).toBe(1);
  });

  it("recognizes lists containing only non-English tracks", () => {
    expect(hasOnlyKnownNonEnglishTracks([
      { language: "ja", label: "Japanese" },
      { language: "es", label: "Spanish" },
    ])).toBe(true);
  });

  it("does not reject tracks with missing language metadata", () => {
    expect(hasOnlyKnownNonEnglishTracks([{ label: "Track 1" }])).toBe(false);
  });
});
