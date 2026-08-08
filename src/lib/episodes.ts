import { Episode, UserEpisode } from "../types";

type AnyEpisode = Episode | UserEpisode;

// Parses "YYYY-MM-DD" into a local date at midnight, avoiding timezone offset issues
export function parseLocalDateOnly(dateString: string): Date {
  const [year, month, day] = dateString.split('-');
  return new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
}

// Returns the release Date for an episode, preferring exact airstamp if available
export function getEpisodeReleaseTime(episode: AnyEpisode): Date | null {
  if (episode.airstamp) {
    return new Date(episode.airstamp);
  }
  if (episode.airdate) {
    return parseLocalDateOnly(episode.airdate);
  }
  return null;
}

export function isEpisodeReleased(episode: AnyEpisode, now: Date = new Date()): boolean {
  const releaseTime = getEpisodeReleaseTime(episode);
  if (!releaseTime) {
    if (typeof episode.id === "string" && episode.id.startsWith("movie_")) {
      return true;
    }
    return false; // Unknown release date implies unreleased
  }
  return releaseTime <= now;
}

export function isRegularEpisode(episode: AnyEpisode): boolean {
  if (typeof episode.id === "string" && episode.id.startsWith("movie_")) return true;
  return (
    (!episode.type || episode.type === "regular") &&
    Number.isInteger(episode.season) &&
    Number.isInteger(episode.number) &&
    (episode.season ?? 0) > 0 &&
    (episode.number ?? 0) > 0
  );
}

export function getTrackableEpisodes<T extends AnyEpisode>(episodes: T[], includeSpecials = false): T[] {
  return episodes.filter(ep => includeSpecials || isRegularEpisode(ep));
}

export function getReleasedEpisodes<T extends AnyEpisode>(episodes: T[], includeSpecials = false): T[] {
  const now = new Date();
  return getTrackableEpisodes(episodes, includeSpecials).filter(ep => isEpisodeReleased(ep, now));
}

export function calculateProgress(episodes: AnyEpisode[], includeSpecials = false): { total: number, watched: number, percentage: number } {
  const released = getReleasedEpisodes(episodes, includeSpecials);
  const watched = released.filter((ep: any) => ep.watched).length;
  const total = released.length;
  const percentage = total > 0 ? Math.round((watched / total) * 100) : 0;
  return { total, watched, percentage };
}

export function getDaysUntilRelease(episode: AnyEpisode): number | null {
  const releaseTime = getEpisodeReleaseTime(episode);
  if (!releaseTime) return null;
  const now = new Date();
  const diffTime = releaseTime.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}
