import { PlaybackCandidate } from "../types";

export interface StreamOption {
  name?: string;
  title?: string;
  description?: string;

  url?: string;
  externalUrl?: string;
  ytId?: string;

  infoHash?: string;
  fileIdx?: number;
  sources?: string[];

  subtitles?: Array<{
    id?: string;
    url: string;
    lang?: string;
  }>;

  behaviorHints?: {
    videoSize?: number;
    filename?: string;
    notWebReady?: boolean;
    bingeGroup?: string;

    proxyHeaders?: {
      request?: Record<string, string>;
      response?: Record<string, string>;
    };
  };
  streamData?: {
    id?: string;
    type?: string;
    filename?: string;
    folderName?: string;
    size?: number;
    folderSize?: number;
    addon?: string;
    indexer?: string;
    library?: boolean;
    proxied?: boolean;
    service?: {
      id?: string;
      cached?: boolean;
    };
    torrent?: {
      infoHash?: string;
      fileIdx?: number;
      seeders?: number;
      sources?: string[];
    };
    parsedFile?: {
      resolution?: string;
      quality?: string;
      encode?: string;
      container?: string;
      season?: number;
      episodes?: number[];
    };
  };
}

type PlaybackType = "series" | "movie";

type ImportMetaWithEnv = ImportMeta & { env?: { VITE_AIOSTREAMS_BASE_URL?: string; }; };

const REQUEST_TIMEOUT_MS = 55_000;
const PROVIDER_VALIDATION_TIMEOUT_MS = 20_000;
const BYTES_PER_GB = 1024 ** 3;

const INLINE_AIOSTREAMS_BASE_URL = "";

export function normalizeAioStreamsBaseUrl(configuredUrl: string): string {
  const normalizedUrl = configuredUrl
    .trim()
    .replace(/\/(?:manifest\.json|configure)(?:\?.*)?$/i, "")
    .replace(/\/+$/, "");
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(normalizedUrl);
  } catch {
    throw new Error("The configured AIOStreams URL is invalid.");
  }
  if (parsedUrl.protocol !== "https:" && parsedUrl.hostname !== "localhost" && parsedUrl.hostname !== "127.0.0.1") {
    throw new Error("The configured AIOStreams URL must use HTTPS.");
  }
  return normalizedUrl;
}

export function getAioStreamsManifestUrl(configuredUrl: string): string {
  return `${normalizeAioStreamsBaseUrl(configuredUrl)}/manifest.json`;
}

export async function validateAioStreamsProvider(configuredUrl: string): Promise<string> {
  const normalizedUrl = normalizeAioStreamsBaseUrl(configuredUrl);
  const manifestUrl = `${normalizedUrl}/manifest.json`;
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), PROVIDER_VALIDATION_TIMEOUT_MS);
  const requestInit: RequestInit = {
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal: controller.signal,
  };
  let response: Response;

  try {
    try {
      // Configured Stremio manifests normally allow CORS. Going direct first
      // avoids a static host's missing /api route being mistaken for a bad addon.
      response = await fetch(manifestUrl, requestInit);
    } catch (directError) {
      if (controller.signal.aborted) throw directError;
      const proxyUrl = `/api/debrid/stream?url=${encodeURIComponent(manifestUrl)}`;
      response = await fetch(proxyUrl, requestInit);
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Provider validation timed out. Please try again.");
    }
    throw new Error("Unable to reach the provider manifest from this browser.");
  } finally {
    globalThis.clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(`Provider manifest unreachable (HTTP ${response.status})`);
  }

  let manifest: unknown;
  try {
    manifest = await response.json();
  } catch {
    throw new Error("The provider returned a response that was not a valid Stremio manifest.");
  }
  if (
    !manifest ||
    typeof manifest !== "object" ||
    typeof (manifest as { id?: unknown }).id !== "string" ||
    typeof (manifest as { name?: unknown }).name !== "string" ||
    !Array.isArray((manifest as { resources?: unknown }).resources)
  ) {
    throw new Error("The provider returned an invalid Stremio manifest.");
  }

  return normalizedUrl;
}

export function getAioStreamsBaseUrl(): string {
  const localUrl = typeof window !== "undefined" ? localStorage.getItem("aiostreams_base_url")?.trim() : null;
  const environmentUrl = (import.meta as ImportMetaWithEnv).env?.VITE_AIOSTREAMS_BASE_URL?.trim();
  const configuredUrl = localUrl || environmentUrl || INLINE_AIOSTREAMS_BASE_URL.trim();
  if (!configuredUrl) {
    throw new Error("AIOStreams is not configured. Set VITE_AIOSTREAMS_BASE_URL or configure it in Settings.");
  }
  return normalizeAioStreamsBaseUrl(configuredUrl);
}

function compactText(value?: string): string {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim()
    : "";
}

function getCombinedStreamText(stream: StreamOption): string {
  return [
    stream.streamData?.filename,
    stream.behaviorHints?.filename,
    stream.description,
    stream.title,
    stream.name
  ]
    .map(compactText)
    .filter(Boolean)
    .join(" ");
}

function getStreamSizeGB(stream: StreamOption): number | null {
  const byteSize = stream.streamData?.size ?? stream.behaviorHints?.videoSize;

  if (
    typeof byteSize === "number" &&
    Number.isFinite(byteSize) &&
    byteSize > 0
  ) {
    return byteSize / BYTES_PER_GB;
  }

  const text = getCombinedStreamText(stream);

  const match = text.match(
    /(\d+(?:\.\d+)?)\s*(TB|TiB|GB|GiB|MB|MiB)\b/i
  );

  if (!match) {
    return null;
  }

  const amount = Number.parseFloat(match[1]);
  const unit = match[2].toUpperCase();

  if (!Number.isFinite(amount)) {
    return null;
  }

  if (unit === "TB" || unit === "TIB") {
    return amount * 1024;
  }

  if (unit === "MB" || unit === "MIB") {
    return amount / 1024;
  }

  return amount;
}

function getStreamSizeBytes(stream: StreamOption): number | undefined {
  const providedSize = stream.streamData?.size ?? stream.behaviorHints?.videoSize;

  if (
    typeof providedSize === "number" &&
    Number.isFinite(providedSize) &&
    providedSize > 0
  ) {
    return providedSize;
  }

  const sizeGB = getStreamSizeGB(stream);

  if (sizeGB === null) {
    return undefined;
  }

  return Math.round(sizeGB * BYTES_PER_GB);
}

function getStreamSeeders(stream: StreamOption): number | undefined {
  if (typeof stream.streamData?.torrent?.seeders === "number") {
    return stream.streamData.torrent.seeders;
  }

  const text = getCombinedStreamText(stream);

  const patterns = [
    /(?:👤|👥)\s*(\d[\d,]*)/i,
    /(?:seeders|seeds|seed)\s*[:=]?\s*(\d[\d,]*)/i,
    /\bS\s*[:=]\s*(\d[\d,]*)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (!match) {
      continue;
    }

    const parsed = Number.parseInt(
      match[1].replace(/,/g, ""),
      10
    );

    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  return undefined;
}

function getQualityLabel(stream: StreamOption): string {
  if (stream.streamData?.parsedFile?.resolution) {
    return stream.streamData.parsedFile.resolution;
  }

  const text = getCombinedStreamText(stream).toLowerCase();

  if (
    text.includes("2160p") ||
    text.includes("4k") ||
    text.includes("uhd")
  ) {
    return "2160p";
  }

  if (text.includes("1440p")) {
    return "1440p";
  }

  if (text.includes("1080p")) {
    return "1080p";
  }

  if (text.includes("720p")) {
    return "720p";
  }

  if (text.includes("480p")) {
    return "480p";
  }

  if (
    text.includes("360p") ||
    text.includes("sd")
  ) {
    return "SD";
  }

  const name = compactText(stream.name);

  return name || "Unknown";
}

function getDisplayTitle(
  stream: StreamOption,
  index: number
): string {
  const description = compactText(stream.description);
  const title = compactText(stream.title);
  const filename = compactText(
    stream.behaviorHints?.filename
  );
  const name = compactText(stream.name);

  return (
    description ||
    title ||
    filename ||
    name ||
    `Source ${index + 1}`
  );
}

function getDirectStreamUrl(
  stream: StreamOption
): string | null {
  const candidate = stream.url || stream.externalUrl;
  if (typeof candidate !== "string") {
    return null;
  }

  const value = candidate.trim();

  if (!value) {
    return null;
  }

  try {
    const parsedUrl = new URL(value);

    if (
      parsedUrl.protocol !== "https:" &&
      parsedUrl.protocol !== "http:"
    ) {
      return null;
    }

    return parsedUrl.toString();
  } catch {
    return null;
  }
}

export type BrowserCompatibility = 'compatible' | 'external' | 'unknown';

export function getBrowserCompatibility(
  stream: StreamOption
): BrowserCompatibility {
  const directUrl = getDirectStreamUrl(stream);

  if (!directUrl) {
    return 'external';
  }

  if (stream.behaviorHints?.notWebReady === true) {
    return 'external';
  }

  /*
   * Streams requiring custom proxy headers usually cannot be mounted
   * directly into a normal browser video element.
   */
  if (stream.behaviorHints?.proxyHeaders) {
    return 'external';
  }

  const parsedFile = stream.streamData?.parsedFile;
  let container = parsedFile?.container?.toLowerCase();
  const encode = parsedFile?.encode?.toLowerCase();
  const audio = Array.isArray((parsedFile as any)?.audio) ? (parsedFile as any).audio.map((a: string) => a.toLowerCase()) : [];

  const text = (getCombinedStreamText(stream) + " " + directUrl).toLowerCase();

  if (!container) {
    if (/\bmkv\b|\.mkv\b/.test(text)) container = 'mkv';
    else if (/\bavi\b|\.avi\b/.test(text)) container = 'avi';
    else if (/\bwmv\b|\.wmv\b/.test(text)) container = 'wmv';
    else if (/\bflv\b|\.flv\b/.test(text)) container = 'flv';
    else if (/\bm2ts\b|\.m2ts\b/.test(text)) container = 'm2ts';
    else if (/\.ts\b/.test(text)) container = 'ts';
    else if (/\bvob\b|\.vob\b/.test(text)) container = 'vob';
    else if (/\bmp4\b|\.mp4\b/.test(text)) container = 'mp4';
    else if (/\bwebm\b|\.webm\b/.test(text)) container = 'webm';
    else if (/\bm4v\b|\.m4v\b/.test(text)) container = 'm4v';
    else if (/\bmov\b|\.mov\b/.test(text)) container = 'mov';
  }

  if (container) {
    if (['mkv', 'avi', 'wmv', 'flv', 'ts', 'm2ts', 'vob'].includes(container)) {
      return 'external';
    }
    
    if (['mp4', 'm4v', 'mov', 'webm'].includes(container)) {
      // Check for clearly incompatible codecs inside web-friendly containers
      const hasHevc = encode === 'hevc' || encode === 'h265' || /\bhevc\b|\bh265\b|\bx265\b/.test(text);
      const hasIncompatibleAudio = audio.some((a: string) => ['dts', 'truehd', 'flac'].includes(a)) || 
                                   /\bdts\b|\btruehd\b|\bflac\b/.test(text);
      
      if (hasHevc || hasIncompatibleAudio) {
         return 'external';
      }
      return 'compatible';
    }
  }

  if (/\bhevc\b|\bh265\b|\bx265\b/.test(text) || /\bdts\b|\btruehd\b|\bflac\b/.test(text)) {
    return 'external';
  }

  return 'unknown';
}

function isStreamOption(value: unknown): value is StreamOption {
  return Boolean(value) && typeof value === "object";
}

function getDeduplicationKey(
  stream: StreamOption,
  index: number
): string {
  if (
    typeof stream.infoHash === "string" &&
    stream.infoHash.trim()
  ) {
    return [
      "torrent",
      stream.infoHash.trim().toLowerCase(),
      stream.fileIdx ?? ""
    ].join(":");
  }

  const filename = (stream.streamData?.filename || stream.behaviorHints?.filename || "").toLowerCase();
  const sizeBytes = getStreamSizeBytes(stream);

  if (filename && sizeBytes) {
    return `release:${filename}:${sizeBytes}`;
  }

  const directUrl = getDirectStreamUrl(stream);

  if (directUrl) {
    return `url:${directUrl}`;
  }

  return [
    "metadata",
    compactText(stream.name),
    compactText(stream.title),
    compactText(stream.description),
    index
  ].join(":");
}

function isMobileClient(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }

  return /iPhone|iPad|iPod|Android/i.test(
    navigator.userAgent
  );
}

export function isHardRejectTrailer(stream: StreamOption, type: PlaybackType): boolean {
  const filename = (stream.behaviorHints?.filename || "").toLowerCase();
  const text = getCombinedStreamText(stream).toLowerCase();

  const isTiny = (() => {
    const sizeBytes = getStreamSizeBytes(stream);
    if (sizeBytes !== undefined && sizeBytes > 0) {
      const sizeMB = sizeBytes / (1024 * 1024);
      return (type === "movie" && sizeMB < 100) || (type === "series" && sizeMB < 30);
    }
    return false;
  })();

  const unmistakableRegex =
    /(?:^|[._\s-])(?:tlr(?:[._\s-]*\d+[a-z]?)?|official[._\s-]*trailers?|trailers?|teasers?|sample|featurette)(?=$|[._\s-]|\d)|(?:^|[^\p{L}\p{N}])\u0442\u0440\u0435\u0439\u043b\u0435\u0440(?:\u044b|\u0430|\u043e\u0432)?(?=$|[^\p{L}\p{N}])/iu;
  if (unmistakableRegex.test(filename) || unmistakableRegex.test(text)) {
    return true;
  }

  const strongRegex = /\b(trailer|official\s*trailer|teaser|sample|featurette|behind\s*the\s*scenes)\b/i;
  const hasStrongMarker = strongRegex.test(filename);
  
  if (hasStrongMarker && isTiny) return true;
  if (isTiny && strongRegex.test(text)) return true;
  
  return false;
}

export function getTrailerPenalty(stream: StreamOption, type: PlaybackType): number {
  let penalty = 0;
  const filename = (stream.behaviorHints?.filename || "").toLowerCase();
  const text = getCombinedStreamText(stream).toLowerCase();

  const isTiny = (() => {
    const sizeBytes = getStreamSizeBytes(stream);
    if (sizeBytes !== undefined && sizeBytes > 0) {
      const sizeMB = sizeBytes / (1024 * 1024);
      return (type === "movie" && sizeMB < 100) || (type === "series" && sizeMB < 30);
    }
    return false;
  })();

  if (isTiny) {
    penalty += 15_000;
  }

  const strongRegex = /\b(trailer|official\s*trailer|teaser|sample|featurette|behind\s*the\s*scenes)\b/i;
  const hasStrongMarker = strongRegex.test(filename) || strongRegex.test(text);

  if (hasStrongMarker) {
    penalty += 20_000;
  }

  const ambiguousRegex = /\b(preview|extra|extras|specials|promo|clip|bonus|making\s*of)\b/i;
  const hasAmbiguousMarker = ambiguousRegex.test(filename) || ambiguousRegex.test(text);

  if (hasAmbiguousMarker) {
    penalty += 10_000;
  }

  return penalty;
}

function isEpisodeMismatch(
  stream: StreamOption,
  expectedSeason: number,
  expectedEpisode: number
): boolean {
  if (stream.streamData?.parsedFile) {
    const { season, episodes } = stream.streamData.parsedFile;
    if (typeof season === "number" && Array.isArray(episodes) && episodes.length > 0) {
      if (season !== expectedSeason) return true;
      if (!episodes.includes(expectedEpisode)) return true;
      return false; // Authoritative match
    }
  }

  const text = getCombinedStreamText(stream);
  if (!text) return false;

  // 1. Single episode check like S02E01 when requesting S02E05
  const seMatches = Array.from(
    text.matchAll(/\b[sS](\d{1,2})[\s._-]*[eE](\d{1,3})\b/g)
  );

  if (seMatches.length > 0) {
    const hasExactMatch = seMatches.some((m) => {
      const s = parseInt(m[1], 10);
      const e = parseInt(m[2], 10);
      return s === expectedSeason && e === expectedEpisode;
    });

    if (hasExactMatch) {
      return false;
    }

    // Check if it's an episode range like S02E01-E10 or S02E01-08
    const rangeMatch = text.match(
      /\b[sS](\d{1,2})[\s._-]*[eE](\d{1,3})[\s._-]*(?:[eE]|-)(\d{1,3})\b/i
    );
    if (rangeMatch) {
      const s = parseInt(rangeMatch[1], 10);
      const eStart = parseInt(rangeMatch[2], 10);
      const eEnd = parseInt(rangeMatch[3], 10);
      if (
        s === expectedSeason &&
        expectedEpisode >= eStart &&
        expectedEpisode <= eEnd
      ) {
        return false;
      }
    }

    // Has SxxExx pattern but doesn't match expected episode -> mismatch
    return true;
  }

  // 2. Check "NxNN" format like 2x05 vs 2x01
  const xMatches = Array.from(text.matchAll(/\b(\d{1,2})[xX](\d{1,3})\b/g));
  if (xMatches.length > 0) {
    const hasExactMatch = xMatches.some((m) => {
      const s = parseInt(m[1], 10);
      const e = parseInt(m[2], 10);
      return s === expectedSeason && e === expectedEpisode;
    });
    if (hasExactMatch) return false;
    return true;
  }

  // 3. Season mismatch check like "Season 3" when Season 2 requested
  const seasonMatch = text.match(/\b(?:season|s)[\s._-]*(\d{1,2})\b/i);
  if (seasonMatch) {
    const s = parseInt(seasonMatch[1], 10);
    if (
      s !== expectedSeason &&
      !/\b(?:s\d+[-~]\s*s?\d+|complete|all\s*seasons|season\s*\d+[-~]\d+)\b/i.test(
        text
      )
    ) {
      return true;
    }
  }

  return false;
}

function isMovieMismatch(stream: StreamOption): boolean {
  const text = getCombinedStreamText(stream);
  if (!text) return false;

  // TV show patterns in a movie request indicate misindexed stream
  if (
    /\b[sS]\d{1,2}[\s._-]*[eE]\d{1,3}\b/i.test(text) ||
    /\b\d{1,2}[xX]\d{1,3}\b/i.test(text)
  ) {
    return true;
  }

  // Season packs and complete series patterns
  if (
    /\b[sS]\d{1,2}(-[sS]?\d{1,2})?\b/.test(text) ||
    /\b[sS]eason\s+\d{1,2}\b/i.test(text) ||
    /\b[sS]easons\s+\d{1,2}-\d{1,2}\b/i.test(text) ||
    /\b[cC]omplete\s+[sS]eason\b/i.test(text) ||
    /\b[cC]omplete\s+[sS]eries\b/i.test(text) ||
    /\b[aA]ll\s+[sS]easons\b/i.test(text)
  ) {
    return true;
  }

  return false;
}

export type StreamCacheState = 'cached' | 'uncached' | 'unknown';

export function getStreamCacheState(stream: StreamOption): StreamCacheState {
  if (stream.streamData?.service?.cached !== undefined) {
    return stream.streamData.service.cached ? 'cached' : 'uncached';
  }
  const text = getCombinedStreamText(stream).toLowerCase();
  
  // Real-Debrid explicit uncached tokens
  if (text.includes('[rd download]') || /\buncached\b/.test(text)) {
    return 'uncached';
  }
  
  // Real-Debrid explicit cache tokens
  if (text.includes('[rd+]') || text.includes('⚡') || /\bcached\b/.test(text)) {
    return 'cached';
  }
  
  return 'unknown';
}

export function calculateStreamScore(
  stream: StreamOption,
  originalIndex: number,
  totalCandidates: number,
  mobile: boolean,
  type: PlaybackType = "series",
  season: number = 1,
  episode: number = 1
): number {
  const browserCompatibility = getBrowserCompatibility(stream);
  const cacheState = getStreamCacheState(stream);

  /*
   * Preserve AIOStreams' original ordering as the starting point.
   */
  let score = (totalCandidates - originalIndex) * 10;

  if (browserCompatibility === 'compatible') {
    score += 10_000;
  } else if (browserCompatibility === 'external') {
    score += 1_000;
  }

  if (cacheState === 'cached') {
    score += 50_000;
  } else if (cacheState === 'uncached') {
    score -= 500_000; // Heavily penalize uncached so they fall to the very bottom
  }

  // Exact episode / season match bonus
  if (type === "series") {
    if (isEpisodeMismatch(stream, season, episode)) {
      score -= 30_000;
    }
  } else if (type === "movie") {
    if (isMovieMismatch(stream)) {
      score -= 30_000;
    }
  }

  score -= getTrailerPenalty(stream, type);

  return score;
}

export interface ParsedStreamInfo {
  filename: string;
  size?: string;
  readiness: string;
  quality?: string;
  seeds?: number;
  provider?: string;
}

export function parseStreamInfo(stream: StreamOption): ParsedStreamInfo {
  const text = getCombinedStreamText(stream);
  const title = stream.title || stream.description || "";
  const name = stream.name || "";
  
  const lines = title.split('\n');
  const filename = lines[0] || "Unknown Stream";
  
  let sizeStr: string | undefined;
  const sizeMatch = text.match(/(?:💾|size[:=]?)\s*([\d.]+\s*[KMGTP]B)/i);
  if (sizeMatch) {
    sizeStr = sizeMatch[1];
  } else if (stream.behaviorHints?.videoSize) {
    sizeStr = (stream.behaviorHints.videoSize / (1024 * 1024 * 1024)).toFixed(2) + " GB";
  }

  let quality: string | undefined;
  if (/\b(?:2160p|4k|uhd)\b/i.test(text)) quality = "4K";
  else if (/\b1440p\b/i.test(text)) quality = "1440p";
  else if (/\b1080p\b/i.test(text)) quality = "1080p";
  else if (/\b720p\b/i.test(text)) quality = "720p";
  else if (/\b480p\b/i.test(text)) quality = "480p";

  let provider: string | undefined;
  const providerMatch = text.match(/(?:⚙️|provider[:=]?)\s*([\w]+)/i);
  if (providerMatch) {
    provider = providerMatch[1];
  } else {
    provider = name.split('\n')[0];
  }

  return {
    filename,
    size: sizeStr,
    readiness: getStreamCacheState(stream),
    quality,
    seeds: getStreamSeeders(stream),
    provider
  };
}

async function readErrorResponse(
  response: Response
): Promise<string> {
  try {
    const text = await response.text();

    if (!text) {
      return "";
    }

    try {
      const parsed = JSON.parse(text) as {
        error?: unknown;
        message?: unknown;
      };

      if (typeof parsed.message === "string") {
        return parsed.message;
      }

      if (typeof parsed.error === "string") {
        return parsed.error;
      }
    } catch {
      // The response was plain text rather than JSON.
    }

    return compactText(text).slice(0, 300);
  } catch {
    return "";
  }
}

interface StreamCacheEntry {
  resolvedAt: number;
  candidates: PlaybackCandidate[];
}
const STREAM_CACHE = new Map<string, StreamCacheEntry>();
const STREAM_CACHE_TTL_MS = 300_000;

export async function getBestTorrentioStream(
  imdbId: string,
  season: number,
  episode: number,
  type: PlaybackType = "series",
  signal?: AbortSignal,
  forceRefresh: boolean = false
): Promise<PlaybackCandidate[]> {
  const normalizedImdbId = imdbId.trim();
  const streamId = type === "movie" ? normalizedImdbId : `${normalizedImdbId}:${season}:${episode}`;
  const cacheKey = `${type}:${streamId}`;
  
  const now = Date.now();
  if (forceRefresh) {
    STREAM_CACHE.delete(cacheKey);
  }
  const existing = STREAM_CACHE.get(cacheKey);
  if (existing) {
    if (now - existing.resolvedAt < STREAM_CACHE_TTL_MS) {
      return existing.candidates;
    } else {
      STREAM_CACHE.delete(cacheKey);
    }
  }

  /*
   * Cache only completed resolutions. An in-flight promise is tied to the
   * caller's AbortSignal; sharing it allowed a closed player to abort the next
   * player opened for the same episode before the rejected promise was evicted.
   */
  const result = await fetchBestStreamImpl(imdbId, season, episode, type, signal);
  if (!signal?.aborted) {
    STREAM_CACHE.set(cacheKey, {
      resolvedAt: Date.now(),
      candidates: result,
    });
  }
  return result;
}

async function fetchBestStreamImpl(
  imdbId: string,
  season: number,
  episode: number,
  type: PlaybackType = "series",
  signal?: AbortSignal
): Promise<PlaybackCandidate[]> {
  const normalizedImdbId = imdbId.trim();

  if (
    type === "series" &&
    (
      !Number.isInteger(season) ||
      !Number.isInteger(episode) ||
      season < 1 ||
      episode < 1
    )
  ) {
    throw new Error("INVALID_EPISODE_MAPPING");
  }

  if (!/^tt\d+$/.test(normalizedImdbId)) {
    throw new Error(
      type === "movie"
        ? "This movie does not have a valid IMDb identifier."
        : "This series does not have a valid IMDb identifier."
    );
  }

  const streamId =
    type === "movie"
      ? normalizedImdbId
      : `${normalizedImdbId}:${season}:${episode}`;

  const baseUrl = getAioStreamsBaseUrl();
  const requestUrl = `${baseUrl}/stream/${type}/${streamId}.json`;
  const proxyUrl = `/api/debrid/stream?url=${encodeURIComponent(requestUrl)}`;

  const controller = new AbortController();
  const forwardAbort = () => controller.abort();
  const timeoutId = window.setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS
  );
  
  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener("abort", forwardAbort, { once: true });
    }
  }

  let response: Response;
  const requestInit: RequestInit = {
    method: "GET",
    headers: {
      Accept: "application/json"
    },
    cache: "no-store",
    signal: controller.signal
  };

  try {
    try {
      response = await fetch(proxyUrl, requestInit);
      if (response.status === 404 || response.status === 405) {
        response = await fetch(requestUrl, requestInit);
      }
    } catch (proxyError) {
      if (controller.signal.aborted) throw proxyError;
      // Static hosts such as GitHub Pages do not provide the local proxy.
      response = await fetch(requestUrl, requestInit);
    }
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      error.name === "AbortError"
    ) {
      throw new Error(
        "Stream resolution timed out. Please check your network connection or configured AIOStreams/Stremio URL in Settings."
      );
    }
    throw new Error(
      "Unable to reach the stream provider. Please check its URL and browser access settings."
    );
  } finally {
    window.clearTimeout(timeoutId);
    signal?.removeEventListener("abort", forwardAbort);
  }

  if (!response.ok) {
    const responseMessage =
      await readErrorResponse(response);

    if (response.status === 504) {
      throw new Error("Stream resolution timed out. Please check your network connection or configured AIOStreams/Stremio URL in Settings.");
    } else if (response.status === 502) {
      throw new Error("Unable to reach stream provider directly. Please check your configured URL in Settings.");
    }

    const detail = responseMessage
      ? ` ${responseMessage}`
      : "";

    throw new Error(
      `AIOStreams returned error ${response.status}.${detail}`
    );
  }

  let data: unknown;

  try {
    data = await response.json();
  } catch {
    throw new Error(
      "AIOStreams returned a response that was not valid JSON."
    );
  }

  if (
    !data ||
    typeof data !== "object" ||
    !Array.isArray(
      (data as { streams?: unknown }).streams
    )
  ) {
    throw new Error(
      "AIOStreams returned an invalid stream response."
    );
  }

  const rawStreams = (
    data as { streams: unknown[] }
  ).streams;

  const streams = rawStreams.filter(isStreamOption);

  if (streams.length === 0) {
    throw new Error(
      `No sources were returned for this ${type}. Check the IMDb mapping and your enabled AIOStreams addons.`
    );
  }

  const seenStreamCounts = new Map<string, number>();
  let uniqueStreams = streams.filter((stream, index) => {
    const key = getDeduplicationKey(stream, index);
    const count = seenStreamCounts.get(key) || 0;
    
    // Retain up to 3 copies of the same release/hash for failover
    if (count >= 3) {
      return false;
    }
    
    seenStreamCounts.set(key, count + 1);
    return true;
  });

  /*
   * Your app and VLC need a resolved URL.
   *
   * Do not convert an infoHash-only result into a PlaybackCandidate
   * with an undefined URL.
   */
  const directStreams = uniqueStreams.filter(
    (stream) => getDirectStreamUrl(stream) !== null
  );

  if (directStreams.length === 0) {
    const torrentOnlyCount = uniqueStreams.filter(
      (stream) =>
        typeof stream.infoHash === "string" &&
        stream.infoHash.trim().length > 0
    ).length;

    if (torrentOnlyCount > 0) {
      throw new Error(
        `AIOStreams found ${torrentOnlyCount} torrent source${
          torrentOnlyCount === 1 ? "" : "s"
        }, but none were resolved to a direct playback URL. Check that your debrid provider is connected and that resolved or cached links are enabled.`
      );
    }

    throw new Error(
      "Sources were returned, but none contained a valid HTTP or HTTPS playback URL."
    );
  }

  // Filter out trailers, samples, wrong episode/season, and wrong media type
  const streamsToProcess = directStreams.filter((stream) => {
    if (isHardRejectTrailer(stream, type)) {
      return false;
    }
    if (type === "series" && isEpisodeMismatch(stream, season, episode)) {
      return false;
    }
    if (type === "movie" && isMovieMismatch(stream)) {
      return false;
    }
    return true;
  });

  if (streamsToProcess.length === 0) {
    throw new Error(
      "Sources were returned, but all of them were identified as mismatched (wrong episode, sample, trailer, etc.)."
    );
  }

  const mobile = isMobileClient();

  interface PlaybackCandidateInternal extends PlaybackCandidate {
  cacheState: StreamCacheState;
}

  const playbackCandidates: PlaybackCandidateInternal[] =
    streamsToProcess.map((stream, index) => {
      const directUrl = getDirectStreamUrl(stream);

      /*
       * directStreams was filtered above, so this should never occur.
       * Keep the guard to prevent undefined URLs from entering the UI.
       */
      if (!directUrl) {
        throw new Error(
          "A source disappeared while preparing playback."
        );
      }

      const browserEligible =
        getBrowserCompatibility(stream) === 'compatible';

      const seeders =
        getStreamSeeders(stream);

      const quality =
        getQualityLabel(stream);

      const parsedInfo = parseStreamInfo(stream);

      return {
        id: stream.infoHash?.trim()
          ? `${stream.infoHash.trim().toLowerCase()}:${stream.fileIdx ?? "unknown"}:${directUrl}`
          : directUrl || `candidate-${index}`,

        url: directUrl,

        /*
         * Always provide visible text so the UI never renders an
         * empty source card.
         */
        title: parsedInfo.filename,

        quality: parsedInfo.quality || quality,

        sizeBytes: getStreamSizeBytes(stream),

        container: browserEligible
          ? "web-compatible"
          : "external",

        score: calculateStreamScore(
          stream,
          index,
          streamsToProcess.length,
          mobile,
          type,
          season,
          episode
        ),
        cacheState: getStreamCacheState(stream),

        seeders,
        readiness: parsedInfo.readiness,
        provider: parsedInfo.provider
      };
    });

  playbackCandidates.sort((first, second) => {
    const tier = { cached: 2, unknown: 1, uncached: 0 };
    const firstTier = tier[first.cacheState];
    const secondTier = tier[second.cacheState];
    if (firstTier !== secondTier) return secondTier - firstTier;
    return second.score - first.score;
  });

  let finalCandidates = playbackCandidates;
  const hasConfirmedCached = finalCandidates.some(c => c.cacheState === "cached");
  
  if (hasConfirmedCached) {
    // If we have cached options, exclude uncached options
    finalCandidates = finalCandidates.filter(c => c.cacheState !== "uncached");
  }

  const compatible = finalCandidates.filter(c => c.container === "web-compatible");
  const external = finalCandidates.filter(c => c.container === "external");

  return [
    ...compatible.slice(0, 15),
    ...external.slice(0, 15)
  ];
}

export function openExternalPlayer(
  directStreamUrl: string
): void {
  if (typeof window === "undefined") {
    throw new Error(
      "External playback is only available in the browser."
    );
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(directStreamUrl);
  } catch {
    throw new Error(
      "The selected source does not have a valid playback URL."
    );
  }

  if (
    parsedUrl.protocol !== "https:" &&
    parsedUrl.protocol !== "http:"
  ) {
    throw new Error(
      "The selected source uses an unsupported URL format."
    );
  }

  const isIOS =
    /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (
      navigator.platform === "MacIntel" &&
      navigator.maxTouchPoints > 1
    );

  const isAndroid =
    /Android/i.test(navigator.userAgent);

  if (isIOS) {
    const vlcUrl =
      "vlc-x-callback://x-callback-url/stream" +
      `?url=${encodeURIComponent(parsedUrl.toString())}`;

    window.location.assign(vlcUrl);
    return;
  }

  if (isAndroid) {
    const vlcUrl =
      `vlc://${parsedUrl.toString()}`;

    window.location.assign(vlcUrl);
    return;
  }

  const openedWindow = window.open(
    parsedUrl.toString(),
    "_blank",
    "noopener,noreferrer"
  );

  if (!openedWindow) {
    throw new Error(
      "The browser blocked the playback window. Allow pop-ups and try again."
    );
  }
}
