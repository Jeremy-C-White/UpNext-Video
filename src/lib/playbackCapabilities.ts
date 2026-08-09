import type { PlaybackCandidate } from "../types";

export type PlaybackDeviceClass = "desktop" | "ios" | "android";
export type PlaybackConfidence = "preferred" | "probe" | "fallback";

export interface PlaybackEnvironment {
  deviceClass: PlaybackDeviceClass;
  isIOS: boolean;
  isDesktop: boolean;
  isChromium: boolean;
  supportsMatroska: boolean;
  supportsNativeHls: boolean;
  supportsMediaSource: boolean;
}

export interface CandidatePlaybackDecision {
  route: "in-app" | "fallback";
  confidence: PlaybackConfidence;
  reason: string;
}

interface NavigatorLike {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
  userAgentData?: {
    platform?: string;
    mobile?: boolean;
    brands?: Array<{ brand: string; version: string }>;
  };
}

interface MediaProbeLike {
  canPlayType(type: string): CanPlayTypeResult | string;
}

const LEGACY_DESKTOP_CONTAINERS = new Set(["avi", "wmv", "flv", "vob", "m2ts"]);
const IOS_FALLBACK_CONTAINERS = new Set(["mkv", "avi", "wmv", "flv", "vob", "m2ts", "ts"]);
const RUNTIME_CODEC_PROBES = new Set(["hevc", "h265", "dts", "truehd", "ac3", "eac3"]);

function canPlay(probe: MediaProbeLike | undefined, mimeType: string): boolean {
  if (!probe) return false;
  try {
    return probe.canPlayType(mimeType) !== "";
  } catch {
    return false;
  }
}

export function detectPlaybackEnvironment(
  navigatorLike?: NavigatorLike,
  mediaProbe?: MediaProbeLike,
): PlaybackEnvironment {
  const activeNavigator: NavigatorLike | undefined = navigatorLike ?? (
    typeof navigator === "undefined" ? undefined : navigator as unknown as NavigatorLike
  );
  const userAgent = activeNavigator?.userAgent || "";
  const platform = activeNavigator?.userAgentData?.platform || activeNavigator?.platform || "";
  const maxTouchPoints = activeNavigator?.maxTouchPoints || 0;
  const brands = activeNavigator?.userAgentData?.brands?.map((entry) => entry.brand).join(" ") || "";

  const isIPadDesktopMode = /Mac/i.test(platform) && maxTouchPoints > 1;
  const isIOS = /iPad|iPhone|iPod/i.test(userAgent) || isIPadDesktopMode;
  const isAndroid = !isIOS && /Android/i.test(userAgent);
  const isChromium = !isIOS && /Chrome|Chromium|Edg/i.test(`${userAgent} ${brands}`);
  const deviceClass: PlaybackDeviceClass = isIOS ? "ios" : isAndroid ? "android" : "desktop";

  let probe = mediaProbe;
  if (!probe && typeof document !== "undefined") {
    probe = document.createElement("video");
  }

  return {
    deviceClass,
    isIOS,
    isDesktop: deviceClass === "desktop",
    isChromium,
    // Chromium can play Matroska even on builds where canPlayType is conservative.
    supportsMatroska:
      canPlay(probe, 'video/x-matroska; codecs="avc1.42E01E, mp4a.40.2"') ||
      canPlay(probe, "video/x-matroska") ||
      (deviceClass === "desktop" && isChromium),
    supportsNativeHls:
      canPlay(probe, "application/vnd.apple.mpegurl") ||
      canPlay(probe, "application/x-mpegURL"),
    supportsMediaSource:
      typeof window !== "undefined" && typeof window.MediaSource !== "undefined",
  };
}

export function inferCandidateContainer(candidate: PlaybackCandidate): string {
  const declared = candidate.mediaContainer?.trim().toLowerCase();
  if (declared) return declared === "matroska" ? "mkv" : declared;

  const text = `${candidate.title || ""} ${candidate.url || ""}`.toLowerCase();
  const match = text.match(/\.(mkv|mp4|m4v|mov|webm|m3u8|avi|wmv|flv|m2ts|ts|vob)(?:\b|\?|#)/i);
  if (match) return match[1].toLowerCase() === "m3u8" ? "hls" : match[1].toLowerCase();

  if (/\bmatroska\b/.test(text)) return "mkv";
  return "unknown";
}

function candidateCodecTokens(candidate: PlaybackCandidate): Set<string> {
  const text = `${candidate.videoCodec || ""} ${candidate.audioCodec || ""} ${candidate.title || ""}`.toLowerCase();
  const tokens = new Set<string>();

  if (/\bhevc\b|\bh[ ._-]?265\b|\bx265\b/.test(text)) tokens.add("hevc");
  if (/\bdts(?:-hd)?\b/.test(text)) tokens.add("dts");
  if (/\btruehd\b/.test(text)) tokens.add("truehd");
  if (/\be-?ac-?3\b|\bddp\b/.test(text)) tokens.add("eac3");
  if (/\bac-?3\b|\bdd\b/.test(text)) tokens.add("ac3");

  return tokens;
}

export function getCandidatePlaybackDecision(
  candidate: PlaybackCandidate,
  environment: PlaybackEnvironment,
): CandidatePlaybackDecision {
  if (candidate.requiresCustomHeaders) {
    return {
      route: "fallback",
      confidence: "fallback",
      reason: "This provider requires request headers that a browser video element cannot attach.",
    };
  }

  const container = inferCandidateContainer(candidate);
  const codecTokens = candidateCodecTokens(candidate);
  const needsRuntimeCodecProbe = [...codecTokens].some((codec) => RUNTIME_CODEC_PROBES.has(codec));

  if (environment.isIOS) {
    if (IOS_FALLBACK_CONTAINERS.has(container)) {
      return {
        route: "fallback",
        confidence: "fallback",
        reason: "This container is not a reliable inline Safari source.",
      };
    }

    if (codecTokens.has("dts") || codecTokens.has("truehd")) {
      return {
        route: "fallback",
        confidence: "fallback",
        reason: "This audio track is not supported by inline Safari playback.",
      };
    }

    if (container === "hls" || candidate.browserCompatibility === "compatible") {
      return {
        route: "in-app",
        confidence: "preferred",
        reason: "This source matches iPhone and iPad browser playback.",
      };
    }

    return {
      route: "fallback",
      confidence: "fallback",
      reason: "Safari could not confirm this source as an inline-compatible format.",
    };
  }

  if (LEGACY_DESKTOP_CONTAINERS.has(container)) {
    return {
      route: "fallback",
      confidence: "fallback",
      reason: "This legacy container needs a conversion service before browser playback.",
    };
  }

  if (container === "hls" && !environment.supportsNativeHls && !environment.supportsMediaSource) {
    return {
      route: "fallback",
      confidence: "fallback",
      reason: "This browser needs an HLS adapter for this source.",
    };
  }

  if (container === "mkv") {
    if (!environment.supportsMatroska) {
      return {
        route: "fallback",
        confidence: "fallback",
        reason: "This browser did not report Matroska support.",
      };
    }

    return {
      route: "in-app",
      confidence: "probe",
      reason: "Desktop Matroska support depends on the codecs inside, so NextUp will test it directly.",
    };
  }

  if (
    needsRuntimeCodecProbe ||
    candidate.browserCompatibility === "unknown" ||
    candidate.browserCompatibility === "external"
  ) {
    return {
      route: "in-app",
      confidence: "probe",
      reason: "Support depends on the desktop operating system and hardware decoder.",
    };
  }

  return {
    route: "in-app",
    confidence: "preferred",
    reason: "This source is suitable for native browser playback.",
  };
}

export function partitionPlaybackCandidates(
  candidates: PlaybackCandidate[],
  environment: PlaybackEnvironment,
): { inApp: PlaybackCandidate[]; fallback: PlaybackCandidate[] } {
  const preferred: PlaybackCandidate[] = [];
  const probe: PlaybackCandidate[] = [];
  const fallback: PlaybackCandidate[] = [];

  for (const candidate of candidates) {
    const decision = getCandidatePlaybackDecision(candidate, environment);
    if (decision.route === "fallback") fallback.push(candidate);
    else if (decision.confidence === "preferred") preferred.push(candidate);
    else probe.push(candidate);
  }

  return { inApp: [...preferred, ...probe], fallback };
}

export function getCandidateFormatLabel(candidate: PlaybackCandidate): string {
  const pieces = [
    inferCandidateContainer(candidate) === "unknown"
      ? undefined
      : inferCandidateContainer(candidate).toUpperCase(),
    candidate.videoCodec?.toUpperCase(),
    candidate.audioCodec?.toUpperCase(),
  ].filter(Boolean);

  return [...new Set(pieces)].join(" · ");
}

export function isIOSPlaybackEnvironment(): boolean {
  return detectPlaybackEnvironment().isIOS;
}
