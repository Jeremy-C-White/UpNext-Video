import { PlaybackRequest, UserEpisode } from "../types";
import { getReleasedEpisodes } from "./episodes";

type EpisodePosition = Pick<PlaybackRequest, "episodeId" | "season" | "number">;

export const CREDITS_AUTOPLAY_COUNTDOWN_SECONDS = 5;
const FALLBACK_CREDITS_AUTOPLAY_WINDOW_SECONDS = 90;

function compareEpisodeOrder(
  left: Pick<UserEpisode, "season" | "number">,
  right: Pick<UserEpisode, "season" | "number">
): number {
  return left.season - right.season || left.number - right.number;
}

export function findNextReleasedEpisode(
  episodes: UserEpisode[],
  current: EpisodePosition
): UserEpisode | null {
  const released = [...getReleasedEpisodes(episodes, false)].sort(compareEpisodeOrder);
  const currentIndex = released.findIndex(episode =>
    episode.id === current.episodeId ||
    (episode.season === current.season && episode.number === current.number)
  );

  if (currentIndex >= 0) return released[currentIndex + 1] || null;
  return released.find(episode => compareEpisodeOrder(episode, current) > 0) || null;
}

export function shouldOfferNextEpisodeShortcut(
  durationSeconds: number,
  currentTimeSeconds: number,
  hasNextEpisode: boolean
): boolean {
  if (!hasNextEpisode || !Number.isFinite(durationSeconds) || !Number.isFinite(currentTimeSeconds)) return false;
  const remainingSeconds = durationSeconds - currentTimeSeconds;
  return durationSeconds >= 10 * 60 && currentTimeSeconds > 0 && remainingSeconds > 0 && remainingSeconds <= 5 * 60;
}

export function shouldStartCreditsAutoplay(
  durationSeconds: number,
  currentTimeSeconds: number,
  hasNextEpisode: boolean,
  outroDetected: boolean
): boolean {
  if (!hasNextEpisode) return false;
  if (outroDetected) return true;
  if (!Number.isFinite(durationSeconds) || !Number.isFinite(currentTimeSeconds)) return false;

  const remainingSeconds = durationSeconds - currentTimeSeconds;
  return durationSeconds >= 10 * 60
    && currentTimeSeconds > 0
    && remainingSeconds > 0
    && remainingSeconds <= FALLBACK_CREDITS_AUTOPLAY_WINDOW_SECONDS;
}
