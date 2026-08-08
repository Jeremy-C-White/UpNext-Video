import { Show, Episode } from "../types";
import { getCached as apiGetCached, setCached as apiSetCached } from "./apiCache";
import { fetchJson } from "./httpClient";
import { getTMDBExternalIds } from "./tmdb";

const BASE_URL = "https://api.tvmaze.com";

async function fetchTVMaze(endpoint: string, signal?: AbortSignal) {
  const url = endpoint.startsWith('http') ? endpoint : `${BASE_URL}${endpoint}`;
  return fetchJson<any>(url, { signal, concurrencyGroup: 'tvmaze', timeoutMs: 15000, retries: 2 });
}

function getCached<T>(key: string) { return apiGetCached<T>("tvmaze", "legacy", [key]); }
function setCached<T>(key: string, data: T, ttl = 60) { apiSetCached<T>("tvmaze", "legacy", [key], data, ttl); }

export async function searchShows(query: string, signal?: AbortSignal): Promise<Show[]> {
  const cacheKey = `tvmaze_search_${query}`;
  const cached = getCached<Show[]>(cacheKey);
  if (cached) return cached;
  
  try {
    const data = await fetchTVMaze(`/search/shows?q=${encodeURIComponent(query)}`, signal);
    const shows = data.map((item: any) => item.show);
    setCached(cacheKey, shows, 360); // 6 hours
    return shows;
  } catch (e) {
    return [];
  }
}

export async function getTrendingShows(): Promise<Show[]> {
  const cacheKey = 'tvmaze_trending';
  const cached = getCached<Show[]>(cacheKey);
  if (cached) return cached;
  
  const date = new Date().toISOString().split('T')[0];
  try {
    const data = await fetchTVMaze(`/schedule/web?date=${date}`);
    const uniqueShows = new Map<number, Show>();
    data.forEach((item: any) => {
      const show = item._embedded?.show || item.show;
      if (show && show.language === 'English') {
        uniqueShows.set(show.id, show);
      }
    });
    const shows = Array.from(uniqueShows.values())
      .sort((a, b) => (b as any).weight - (a as any).weight)
      .slice(0, 10);
    setCached(cacheKey, shows);
    return shows;
  } catch (e) {
    return [];
  }
}

export async function getPremieringSoon(): Promise<Show[]> {
  const cacheKey = 'tvmaze_premiering';
  const cached = getCached<Show[]>(cacheKey);
  if (cached) return cached;
  
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const date = tomorrow.toISOString().split('T')[0];
  try {
    const data = await fetchTVMaze(`/schedule/web?date=${date}`);
    const uniqueShows = new Map<number, Show>();
    data.forEach((item: any) => {
      const show = item._embedded?.show || item.show;
      if (show && show.language === 'English') {
        uniqueShows.set(show.id, show);
      }
    });
    const shows = Array.from(uniqueShows.values())
      .sort((a, b) => (b as any).weight - (a as any).weight)
      .slice(0, 10);
    setCached(cacheKey, shows);
    return shows;
  } catch (e) {
    return [];
  }
}

export async function getHiddenGems(): Promise<Show[]> {
  const cacheKey = 'tvmaze_gems';
  const cached = getCached<Show[]>(cacheKey);
  if (cached) return cached;
  
  try {
    const data = await fetchTVMaze(`/shows?page=0`);
    const shows = data
      .filter((show: any) => show.rating?.average && show.rating.average >= 7.5 && show.weight < 90 && show.language === 'English')
      .sort((a: any, b: any) => b.rating.average - a.rating.average)
      .slice(0, 10);
    setCached(cacheKey, shows);
    return shows;
  } catch (e) {
    return [];
  }
}

export async function getForYou(): Promise<Show[]> {
  const cacheKey = 'tvmaze_foryou';
  const cached = getCached<Show[]>(cacheKey);
  if (cached) return cached;
  
  try {
    const data = await fetchTVMaze(`/shows?page=1`);
    const shows = data
      .filter((show: any) => show.language === 'English')
      .sort((a: any, b: any) => b.weight - a.weight)
      .slice(0, 10);
    setCached(cacheKey, shows);
    return shows;
  } catch (e) {
    return [];
  }
}

export async function getTrendingTVMaze(): Promise<Show[]> {
  const cacheKey = 'tvmaze_trending_fallback';
  const cached = getCached<Show[]>(cacheKey);
  if (cached) return cached;
  
  try {
    const data = await fetchTVMaze(`/shows?page=0`);
    const shows = data
      .filter((show: any) => show.language === 'English')
      .sort((a: any, b: any) => b.weight - a.weight)
      .slice(0, 10);
    setCached(cacheKey, shows);
    return shows;
  } catch (e) {
    return [];
  }
}

export async function getShow(id: number): Promise<Show> {
  return fetchTVMaze(`/shows/${id}`);
}

export async function getEpisodes(showId: number): Promise<Episode[]> {
  const cacheKey = `tvmaze_episodes_${showId}`;
  const cached = getCached<Episode[]>(cacheKey);
  if (cached) return cached;
  
  const data = await fetchTVMaze(`/shows/${showId}/episodes?specials=1`);
  if (data) {
    setCached(cacheKey, data, 1440); // 24 hours
    return data;
  }
  return [];
}

export async function resolveTVMazeShow(show: Show): Promise<Show> {
  if (show.id > 0) return show; // Already a TVMaze show
  
  let imdbId = show.externals?.imdb;
  let thetvdbId = show.externals?.thetvdb;
  
  if (!imdbId && show._tmdbId) {
    try {
      const ext = await getTMDBExternalIds(show._tmdbId, !!show.isMovie);
      imdbId = ext.imdb;
      thetvdbId = ext.thetvdb;
    } catch (e) {
      console.error("Failed to resolve TMDB external IDs during lookup", e);
    }
  }
  
  if (imdbId) {
    try { const data = await fetchTVMaze(`/lookup/shows?imdb=${imdbId}`); if (data) return data; } catch (e) {}
  }
  
  if (thetvdbId) {
    try { const data = await fetchTVMaze(`/lookup/shows?thetvdb=${thetvdbId}`); if (data) return data; } catch (e) {}
  }
  
  // Fallback to name search
  try {
    const data = await fetchTVMaze(`/search/shows?q=${encodeURIComponent(show.name)}`);
    if (data && data.length > 0) {
      // Find a match that roughly matches the premiere year if we have it
      if (show.premiered) {
        const expectedYear = show.premiered.split('-')[0];
        const match = data.find((item: any) => item.show.premiered && item.show.premiered.startsWith(expectedYear));
        if (match) return match.show;
      } else {
        return data[0].show;
      }
    }
  } catch (e) {
    // ignore
  }
  
  throw new Error("Could not confidently match this show on TVMaze - try searching for it manually.");
}
