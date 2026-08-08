import type { Show, UserEpisode, UserShow } from "../types";
import { createPlacement, sectionCapacity, STORE_SECTIONS } from "./layout";
import type { StoreDepartment, StoreMedia, StoreSectionDefinition } from "./types";

interface CatalogOptions {
  library: UserShow[];
  episodesMap: Record<string, UserEpisode[]>;
  discovery: Show[];
  staffPicks: Show[];
  supplemental: Show[];
  userName?: string;
}

function cleanText(value?: string) {
  return (value || "").replace(/<[^>]+>/g, "").trim();
}

function yearOf(value?: string) {
  if (!value) return undefined;
  const year = new Date(value).getFullYear();
  return Number.isFinite(year) ? year : undefined;
}

function keyForShow(show: Show) {
  if (show._tmdbId) return `tmdb:${show.isMovie ? "movie" : "tv"}:${show._tmdbId}`;
  if (show.externals?.imdb) return `imdb:${show.externals.imdb}`;
  return `${show.isMovie ? "movie" : "tv"}:${show.name.toLowerCase()}:${yearOf(show.premiered) || ""}`;
}

function showFromLibrary(show: UserShow): Show {
  return {
    id: Number(show.id),
    name: show.name,
    image: { medium: show.imageUrl || "", original: show.backdropUrl || show.imageUrl || "" },
    summary: show.summary,
    status: show.status,
    premiered: show.premiered,
    genres: show.genres || [],
    rating: show.rating,
    vote_average: show.vote_average,
    isMovie: show.isMovie,
    runtime: show.runtime,
    externals: { imdb: show.imdbId },
    _tmdbId: show._tmdbId,
  };
}

function sameMedia(libraryShow: UserShow, show: Show) {
  if (libraryShow._tmdbId && show._tmdbId) {
    return libraryShow._tmdbId === show._tmdbId && Boolean(libraryShow.isMovie) === Boolean(show.isMovie);
  }
  if (libraryShow.imdbId && show.externals?.imdb) return libraryShow.imdbId === show.externals.imdb;
  const sameName = libraryShow.name.trim().toLowerCase() === show.name.trim().toLowerCase();
  const libraryYear = yearOf(libraryShow.premiered);
  const showYear = yearOf(show.premiered);
  return sameName && (!libraryYear || !showYear || libraryYear === showYear);
}

function releasedEpisodes(episodes: UserEpisode[]) {
  const now = Date.now();
  return episodes.filter((episode) => {
    if (!episode.airstamp) return true;
    const timestamp = new Date(episode.airstamp).getTime();
    return Number.isFinite(timestamp) ? timestamp <= now : true;
  });
}

function progressFor(show: UserShow | undefined, episodesMap: Record<string, UserEpisode[]>) {
  if (!show) return { progress: 0, watched: false, nextEpisode: undefined };
  const released = releasedEpisodes(episodesMap[show.id] || show.episodes || []);
  const watchedCount = released.filter((episode) => episode.watched).length;
  const progress = released.length ? Math.round((watchedCount / released.length) * 100) : 0;
  const nextEpisode = released.find((episode) => !episode.watched);
  return { progress, watched: released.length > 0 && watchedCount === released.length, nextEpisode };
}

function matchesDepartment(show: Show, department: StoreDepartment) {
  const genres = (show.genres || []).map((genre) => genre.toLowerCase());
  if (department === "Television") return !show.isMovie;
  if (department === "Action") return genres.some((genre) => genre.includes("action") || genre.includes("adventure"));
  if (department === "Comedy") return genres.some((genre) => genre.includes("comedy"));
  if (department === "Horror") return genres.some((genre) => genre.includes("horror") || genre.includes("thriller"));
  if (department === "Science Fiction") return genres.some((genre) => genre.includes("science fiction") || genre.includes("sci-fi") || genre.includes("fantasy"));
  return true;
}

function ratingOf(show: Show) {
  return Number(show.rating?.average ?? show.vote_average ?? 0) || 0;
}

function posterOf(show: Show) {
  return show.image?.medium || show.image?.original || "";
}

function takeForSection(
  section: StoreSectionDefinition,
  preferred: Show[],
  fallback: Show[],
  used: Set<string>,
  allowReuse = false,
) {
  const capacity = sectionCapacity(section);
  const results: Show[] = [];
  const localKeys = new Set<string>();
  const consider = (show: Show) => {
    const key = keyForShow(show);
    if (!show?.name || localKeys.has(key) || (!allowReuse && used.has(key))) return;
    localKeys.add(key);
    results.push(show);
  };
  preferred.forEach(consider);
  fallback.forEach(consider);
  if (results.length < capacity && !allowReuse) {
    fallback.forEach((show) => {
      if (results.length >= capacity) return;
      const key = keyForShow(show);
      if (localKeys.has(key)) return;
      localKeys.add(key);
      results.push(show);
    });
  }
  results.splice(capacity);
  if (!allowReuse) results.forEach((show) => used.add(keyForShow(show)));
  return results;
}

export function buildStoreCatalog(options: CatalogOptions): StoreMedia[] {
  const { library, episodesMap, discovery, staffPicks, supplemental, userName } = options;
  const librarySources = library.map(showFromLibrary);
  const combined = [...librarySources, ...discovery, ...supplemental]
    .filter((show): show is Show => Boolean(show?.name))
    .filter((show, index, all) => all.findIndex((candidate) => keyForShow(candidate) === keyForShow(show)) === index);

  const posterFirst = [...combined].sort((a, b) => Number(Boolean(posterOf(b))) - Number(Boolean(posterOf(a))));
  const recentFirst = [...posterFirst].sort((a, b) => (yearOf(b.premiered) || 0) - (yearOf(a.premiered) || 0));
  const ratedFirst = [...staffPicks, ...posterFirst].sort((a, b) => ratingOf(b) - ratingOf(a));
  const used = new Set<string>();
  const items: StoreMedia[] = [];

  for (const section of STORE_SECTIONS) {
    let preferred: Show[] = [];
    let allowReuse = false;

    if (section.id === "reserved") {
      preferred = librarySources.filter((source) => {
        const owned = library.find((show) => sameMedia(show, source));
        return Boolean(progressFor(owned, episodesMap).nextEpisode);
      });
      if (!preferred.length) preferred = librarySources;
      allowReuse = true;
    } else if (section.id === "new-releases") {
      preferred = recentFirst;
    } else if (section.id === "staff-picks") {
      preferred = ratedFirst;
      allowReuse = true;
    } else {
      preferred = posterFirst.filter((show) => matchesDepartment(show, section.department));
    }

    const selected = takeForSection(
      section,
      preferred,
      section.id === "reserved" ? librarySources : posterFirst,
      used,
      allowReuse,
    );
    selected.forEach((source, index) => {
      const libraryShow = library.find((show) => sameMedia(show, source));
      const { progress, watched, nextEpisode } = progressFor(libraryShow, episodesMap);
      const reason = section.id === "reserved"
        ? nextEpisode
          ? `Your next episode is waiting${userName ? `, ${userName}` : ""}.`
          : "Saved in your NextUp library."
        : section.id === "staff-picks"
          ? libraryShow
            ? "A favorite from your own shelf."
            : ratingOf(source) >= 7.5
              ? "A highly rated pick from the NextUp staff."
              : "Selected for tonight's browse."
          : undefined;

      items.push({
        id: `${section.id}:${keyForShow(source)}:${index}`,
        mediaKey: keyForShow(source),
        source,
        libraryShow,
        name: source.name,
        summary: cleanText(source.summary) || "Ask the clerk for more information about this title.",
        posterUrl: posterOf(source),
        backdropUrl: source.image?.original || libraryShow?.backdropUrl || "",
        genres: source.genres || libraryShow?.genres || [],
        department: section.department,
        year: yearOf(source.premiered),
        runtime: source.runtime || libraryShow?.runtime,
        rating: ratingOf(source) || undefined,
        isMovie: Boolean(source.isMovie),
        watched,
        progress,
        nextEpisode,
        personalizedReason: reason,
        placement: createPlacement(section, index),
      });
    });
  }

  return items;
}
