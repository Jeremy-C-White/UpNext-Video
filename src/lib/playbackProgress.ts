export interface PlaybackProgressRecord {
  position: number;
  duration: number;
  updatedAt: number;
}

export interface PlaybackProgressStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const STORAGE_PREFIX = "nextup_playback_progress_v1";
const MAX_PROGRESS_AGE_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_FUTURE_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MIN_RESUME_POSITION_SECONDS = 30;
const MIN_REMAINING_SECONDS = 120;

export function getPlaybackProgressKey(userId: string, showId: string, episodeId: string): string {
  return [STORAGE_PREFIX, userId, showId, episodeId].map(part => encodeURIComponent(part)).join(":");
}

function isValidProgressRecord(value: unknown, now: number): value is PlaybackProgressRecord {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PlaybackProgressRecord>;
  return Number.isFinite(candidate.position)
    && Number.isFinite(candidate.duration)
    && Number.isFinite(candidate.updatedAt)
    && (candidate.position || 0) >= 0
    && (candidate.duration || 0) > 0
    && (candidate.position || 0) < (candidate.duration || 0)
    && (candidate.updatedAt || 0) >= now - MAX_PROGRESS_AGE_MS
    && (candidate.updatedAt || 0) <= now + MAX_FUTURE_CLOCK_SKEW_MS;
}

export function readPlaybackProgress(
  storage: PlaybackProgressStorage,
  userId: string,
  showId: string,
  episodeId: string,
  now = Date.now()
): PlaybackProgressRecord | null {
  const key = getPlaybackProgressKey(userId, showId, episodeId);
  try {
    const serialized = storage.getItem(key);
    if (!serialized) return null;
    const parsed: unknown = JSON.parse(serialized);
    if (isValidProgressRecord(parsed, now)) return parsed;
    storage.removeItem(key);
  } catch {
    try { storage.removeItem(key); } catch { /* Playback remains usable without storage. */ }
  }
  return null;
}

export function writePlaybackProgress(
  storage: PlaybackProgressStorage,
  userId: string,
  showId: string,
  episodeId: string,
  position: number,
  duration: number,
  now = Date.now()
): boolean {
  if (!Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0 || position < 0 || position >= duration) return false;
  try {
    storage.setItem(getPlaybackProgressKey(userId, showId, episodeId), JSON.stringify({
      position: Math.floor(position),
      duration: Math.floor(duration),
      updatedAt: now,
    } satisfies PlaybackProgressRecord));
    return true;
  } catch {
    return false;
  }
}

export function clearPlaybackProgress(
  storage: PlaybackProgressStorage,
  userId: string,
  showId: string,
  episodeId: string
): void {
  try { storage.removeItem(getPlaybackProgressKey(userId, showId, episodeId)); } catch { /* no-op */ }
}

export function getResumePosition(
  record: PlaybackProgressRecord | null,
  playbackDuration = record?.duration || 0
): number | null {
  if (!record || !Number.isFinite(playbackDuration) || playbackDuration <= 0) return null;
  if (record.position < MIN_RESUME_POSITION_SECONDS) return null;
  if (playbackDuration - record.position < MIN_REMAINING_SECONDS) return null;
  return record.position;
}
