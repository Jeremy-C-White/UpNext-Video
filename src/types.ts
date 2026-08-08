export interface Show {
  id: number;
  name: string;
  image?: {
    medium: string;
    original: string;
  };
  summary?: string;
  status?: string;
  premiered?: string;
  network?: { name: string };
  webChannel?: { name: string };
  genres?: string[];
  rating?: { average?: number };
  vote_average?: number;
  isMovie?: boolean;
  runtime?: number;
  officialSite?: string;
  externals?: {
    imdb?: string;
    thetvdb?: number;
  };
  _tmdbId?: number;
}

export interface Episode {
  id: number;
  name: string;
  season: number;
  number: number;
  airdate: string;
  airstamp: string;
  runtime: number;
  image?: {
    medium: string;
    original: string;
  };
  summary?: string;
  type?: string;
}

export interface UserShow {
  id: string; // Firestore document ID (TVmaze ID as string)
  tvmazeId: number;
  name: string;
  imageUrl: string;
  status: string;
  provider: string;
  addedAt: number;
  summary: string;
  imdbId?: string;
  genres?: string[];
  runtime?: number;
  officialSite?: string;
  backdropUrl?: string;
  isMovie?: boolean;
  premiered?: string;
  rating?: { average?: number };
  vote_average?: number;
  watchedEpisodes?: Record<string, number | null>;
  episodes?: UserEpisode[];
  lastRefreshed?: number;
  _tmdbId?: number;
}

export interface UserEpisode {
  id: string; // Episode ID as string
  showId: number;
  season: number;
  number: number;
  name: string;
  airdate: string;
  airstamp: string;
  imageUrl: string;
  summary: string;
  watched: boolean;
  watchedAt?: number;
  type?: string;
  runtime?: number;
}

export interface PlaybackCandidate {
  id: string;
  url: string;
  title: string;
  quality?: string;
  sizeBytes?: number;
  container?: string;
  videoCodec?: string;
  audioCodec?: string;
  score: number;
  seeders?: number;
  readiness?: string;
  provider?: string;
}

export interface PlaybackSession {
  mediaType: "movie" | "series";
  imdbId: string;
  season?: number;
  episode?: number;
  candidates: PlaybackCandidate[];
  currentCandidateIndex: number;
}

export interface PlaybackRequest {
  showId: string;
  showName: string;
  isMovie?: boolean;
  imdbId?: string;
  _tmdbId?: number;
  tvmazeId?: number;
  season: number;
  number: number;
  episodeName: string;
}
