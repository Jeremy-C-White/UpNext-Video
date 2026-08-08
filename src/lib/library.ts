import { collection, doc, setDoc, deleteDoc, getDocs, deleteField } from "firebase/firestore";
import { db, auth } from "../firebase";
import { UserShow, UserEpisode, Show, Episode } from "../types";
import { getEpisodes, resolveTVMazeShow } from "./tvmaze";

export function removeUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter(item => item !== undefined)
      .map(item => removeUndefined(item)) as T;
  }
  if (value !== null && typeof value === "object") {
    const cleanedEntries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .map(([key, entryValue]) => [key, removeUndefined(entryValue)]);
    return Object.fromEntries(cleanedEntries) as T;
  }
  return value;
}

export async function addShowToLibrary(show: Show, caughtUp: boolean = false): Promise<{ userShow: UserShow, userEpisodes: UserEpisode[] }> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");

  const showId = show.id;

  let resolvedShow: Show | null = null;
  if (!show.isMovie && (show.id < 0 || (show as any).tvmazeId < 0)) {
    try {
      resolvedShow = await resolveTVMazeShow(show);
    } catch (e) {
      console.warn("Could not resolve TVMaze show during addShowToLibrary for", show.name, e);
    }
  }

  const finalTvmazeId = resolvedShow ? resolvedShow.id : ((show as any).tvmazeId || showId);
  const finalImdbId = resolvedShow?.externals?.imdb || show.externals?.imdb || "";
  const finalName = resolvedShow?.name || show.name;
  const finalSummary = resolvedShow?.summary ? resolvedShow.summary.replace(/<[^>]+>/g, '') : (show.summary ? show.summary.replace(/<[^>]+>/g, '') : "");
  const finalStatus = resolvedShow?.status || show.status || "Unknown";
  
  let watchedEpisodes: Record<string, number> = {};
  if (caughtUp) {
    let episodes: any[] = [];
    if (show.isMovie) {
      episodes = [{ id: "movie_" + showId, airstamp: new Date().toISOString() }];
    } else {
      episodes = await getEpisodes(finalTvmazeId);
    }
    watchedEpisodes = episodes.filter(ep => ep.airstamp && new Date(ep.airstamp) < new Date()).reduce((acc, ep) => ({ ...acc, [ep.id.toString()]: Date.now() }), {});
  }

  const provider = show.webChannel?.name || show.network?.name || resolvedShow?.webChannel?.name || resolvedShow?.network?.name || "";

  const userShow: UserShow = {
    id: showId.toString(),
    tvmazeId: finalTvmazeId,
    name: finalName,
    imageUrl: show.image?.medium || show.image?.original || resolvedShow?.image?.medium || "",
    status: finalStatus,
    provider,
    addedAt: Date.now(),
    summary: finalSummary,
    imdbId: finalImdbId,
    genres: show.genres || resolvedShow?.genres || [],
    runtime: show.runtime || resolvedShow?.runtime || 0,
    officialSite: show.officialSite || resolvedShow?.officialSite || "",
    backdropUrl: show.image?.original || resolvedShow?.image?.original || "",
    watchedEpisodes,
    lastRefreshed: Date.now(),
    isMovie: Boolean(show.isMovie),
    premiered: show.premiered || resolvedShow?.premiered || "",
    rating: show.rating || resolvedShow?.rating || {},
    vote_average: show.vote_average || resolvedShow?.vote_average || 0,
  };

  const tmdbId = show._tmdbId || (show.isMovie && showId < 0 ? (-showId - 1000000000) : undefined);
  if (tmdbId !== undefined) {
    userShow._tmdbId = tmdbId;
  }

  const safeShowData = removeUndefined(userShow);
  const showRef = doc(db, `users/${user.uid}/shows/${showId}`);
  await setDoc(showRef, safeShowData, { merge: true });

  const userEpisodes = await getShowEpisodes(finalTvmazeId, watchedEpisodes, show.isMovie, show.premiered);
  
  return { userShow, userEpisodes };
}

export async function removeShowFromLibrary(showId: number): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");

  const showRef = doc(db, `users/${user.uid}/shows/${showId}`);
  await deleteDoc(showRef);
}


export async function getShowEpisodes(showId: number, watchedEpisodes: Record<string, number | null> = {}, isMovie?: boolean, premiered?: string): Promise<UserEpisode[]> {
  if (isMovie) {
    let airstamp = "";
    if (premiered) {
      try {
        const parsed = new Date(premiered);
        if (!isNaN(parsed.getTime())) {
          airstamp = parsed.toISOString();
        }
      } catch (e) {}
    }
    if (!airstamp) {
      airstamp = new Date().toISOString();
    }
    return [{
      id: "movie_" + showId,
      showId,
      season: 1,
      number: 1,
      name: "Movie",
      airdate: premiered || "",
      airstamp,
      imageUrl: "",
      summary: "",
      watched: !!watchedEpisodes["movie_" + showId],
      watchedAt: watchedEpisodes["movie_" + showId] || undefined
    }];
  }

  let targetId = showId;
  if (targetId < 0) {
    try {
      const resolved = await resolveTVMazeShow({ id: targetId, name: "", isMovie: false } as any);
      if (resolved && resolved.id > 0) {
        targetId = resolved.id;
      }
    } catch (e) {
      console.warn("Could not resolve TVMaze show for negative ID in getShowEpisodes", showId);
    }
  }

  if (targetId < 0) {
    return [];
  }

  const episodes = await getEpisodes(targetId);
  return episodes.map(ep => ({
    id: ep.id.toString(),
    showId,
    season: ep.season,
    number: ep.number,
    type: ep.type,
    runtime: ep.runtime,
    name: ep.name,
    airdate: ep.airdate,
    airstamp: ep.airstamp,
    imageUrl: ep.image?.medium || ep.image?.original || "",
    summary: ep.summary ? ep.summary.replace(/<[^>]+>/g, '') : "",
    watched: !!watchedEpisodes[ep.id.toString()],
    watchedAt: watchedEpisodes[ep.id.toString()] || undefined
  })).sort((a, b) => {
    if (a.season !== b.season) return a.season - b.season;
    return a.number - b.number;
  });
}

export async function markEpisodeWatched(showId: number, episodeId: string, watched: boolean): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");

  const showRef = doc(db, `users/${user.uid}/shows/${showId}`);
  await setDoc(showRef, {
    watchedEpisodes: {
      [episodeId]: watched ? Date.now() : deleteField()
    }
  }, { merge: true });
}

export async function markEpisodesWatchedBatch(showId: number, episodesToMark: string[], watched: boolean): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");

  const updates: Record<string, any> = {};
  for (const epId of episodesToMark) {
    updates[epId] = watched ? Date.now() : deleteField();
  }

  const showRef = doc(db, `users/${user.uid}/shows/${showId}`);
  await setDoc(showRef, {
    watchedEpisodes: updates
  }, { merge: true });
}
