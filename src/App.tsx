import { useEffect, useState, lazy, Suspense, useMemo, useRef } from "react";
import type { ReactNode, PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { LibraryTab } from "./components/LibraryTab";
import { collection, onSnapshot, query, getDocs, writeBatch, setDoc, doc } from "firebase/firestore";
import { auth, db } from "./firebase";
import { SwipeableCard } from "./components/SwipeableCard";
import { ExpandableText } from "./components/ExpandableText";

const AuthScreen = lazy(() => import("./components/AuthScreen").then(m => ({ default: m.AuthScreen })));
const OnboardingScreen = lazy(() => import("./components/OnboardingScreen").then(m => ({ default: m.OnboardingScreen })));
const SettingsModal = lazy(() => import("./components/SettingsModal").then(m => ({ default: m.SettingsModal })));
const SearchModal = lazy(() => import("./components/SearchModal").then(m => ({ default: m.SearchModal })));
const DetailsModal = lazy(() => import("./components/DetailsModal").then(m => ({ default: m.DetailsModal })));
const VideoPlayerModal = lazy(() => import("./components/VideoPlayerModal").then(m => ({ default: m.VideoPlayerModal })));
const RecommendationModal = lazy(() => import("./components/RecommendationModal").then(m => ({ default: m.RecommendationModal })));
const StoreView = lazy(() => import("./store/StoreView"));

import { UserMenu } from "./components/UserMenu";
import { AddToCalendarButton } from "./components/AddToCalendarButton";
import { DiscoverErrorBoundary } from "./components/DiscoverErrorBoundary";
import { UserShow, Show, UserEpisode, PlaybackRequest } from "./types";
import type { StoreMedia } from "./store/types";
import { addShowToLibrary, getShowEpisodes, markEpisodeWatched, markEpisodesWatchedBatch, removeShowFromLibrary, removeUndefined } from "./lib/library";
import { checkAndNotifyUpcomingEpisodes } from "./lib/notifications";
import { getTrendingShows, getPremieringSoon, resolveTVMazeShow, getShow, getTrendingTVMaze, getHiddenGems, getForYou } from "./lib/tvmaze";
import { getTrendingTMDB, getTrendingMoviesTMDB, getRecommendationsTMDB, getTMDBIdFromIMDB, getTopShowsByNetwork, getHiddenGemsTMDB, getForYouTMDB, getTMDBExternalIds } from "./lib/tmdb";
import { getBestTorrentioStream } from "./lib/debrid";
import { Tv, Search, LogOut, Settings, CheckCircle2, PlayCircle, Clock, ExternalLink, Compass, X, Calendar, Plus, ChevronLeft, ChevronRight, Gamepad2 } from "lucide-react";
import { calculateProgress, isEpisodeReleased, getEpisodeReleaseTime, getReleasedEpisodes } from "./lib/episodes";
import { format, isFuture, formatDistanceToNow } from "date-fns";
import { registerSW } from "virtual:pwa-register";

function ScrollRow({ children }: { children: ReactNode }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ down: false, moved: false, startX: 0, startLeft: 0 });
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const updateArrows = () => {
    const el = trackRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  };

  useEffect(() => {
    updateArrows();
    const el = trackRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(updateArrows);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scrollByDir = (dir: number) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    // Mouse drag-to-scroll only; touch already scrolls natively
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    const el = trackRef.current;
    if (!el) return;
    dragRef.current = { down: true, moved: false, startX: e.clientX, startLeft: el.scrollLeft };
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const d = dragRef.current;
    const el = trackRef.current;
    if (!d.down || !el) return;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > 5) d.moved = true;
    if (d.moved) el.scrollLeft = d.startLeft - dx;
  };

  const endDrag = () => {
    // Keep `moved` true briefly so the click-capture below can swallow the click
    dragRef.current.down = false;
    setTimeout(() => { dragRef.current.moved = false; }, 0);
  };

  const onClickCapture = (e: ReactMouseEvent) => {
    if (dragRef.current.moved) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return (
    <div className="relative group/row">
      <div
        ref={trackRef}
        onScroll={updateArrows}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onClickCapture={onClickCapture}
        className="flex gap-4 overflow-x-auto pb-4 scrollbar-none snap-x snap-proximity cursor-grab active:cursor-grabbing select-none"
      >
        {children}
      </div>
      {canLeft && (
        <button
          type="button"
          aria-label="Scroll left"
          onClick={() => scrollByDir(-1)}
          className="hidden md:flex items-center justify-center absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 z-30 w-10 h-10 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 transition-opacity"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      )}
      {canRight && (
        <button
          type="button"
          aria-label="Scroll right"
          onClick={() => scrollByDir(1)}
          className="hidden md:flex items-center justify-center absolute right-0 top-1/2 -translate-y-1/2 translate-x-3 z-30 w-10 h-10 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 transition-opacity"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(auth.currentUser);
  const [loading, setLoading] = useState(true);
  
  const [playbackRequest, setPlaybackRequest] = useState<PlaybackRequest | null>(null);
  const [toast, setToast] = useState<{message: string, action?: {label: string, onClick: () => void}} | null>(null);

  const handlePlayEpisode = (showId: string, imdbId: string | undefined, episode: UserEpisode) => {
    let show = shows.find(s => s.id === showId);
    if (!show && detailsShow?.id === showId) {
      show = detailsShow;
    }
    if (!show) return;
    
    setPlaybackRequest({
      showId: show.id,
      showName: show.name,
      isMovie: show.isMovie,
      imdbId: imdbId && imdbId !== "none" ? imdbId : undefined,
      _tmdbId: show._tmdbId,
      tvmazeId: show.tvmazeId,
      season: episode.season,
      number: episode.number,
      episodeName: episode.name,
    });
  };

  useEffect(() => {
    if (user) {
      const unsubscribe = fetchLibrary();
      return () => {
        if (unsubscribe) unsubscribe();
      };
    }
  }, [user]);

  useEffect(() => {
    if (toast && !toast.action) {
      const timer = setTimeout(() => setToast(null), 2500);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    let controllerChanged = false;
    const handleControllerChange = () => {
      if (controllerChanged) return;
      controllerChanged = true;
      window.location.reload();
    };
    navigator.serviceWorker?.addEventListener('controllerchange', handleControllerChange);

    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        const applyUpdate = async () => {
          setToast({ message: 'Installing update...' });
          try {
            await updateSW();
          } catch (error) {
            console.error('Service worker update failed', error);
          }

          // Older NextUp workers did not handle SKIP_WAITING. If control has
          // not changed after a short grace period, remove that stuck
          // registration and reload once from the network.
          window.setTimeout(async () => {
            if (controllerChanged) return;
            try {
              const registration = await navigator.serviceWorker?.getRegistration();
              if (registration?.waiting) {
                await registration.unregister();
              }
            } catch (error) {
              console.error('Service worker recovery failed', error);
            }
            window.location.reload();
          }, 5000);
        };
        setToast({
          message: 'Update available',
          action: {
            label: 'Refresh',
            onClick: () => { void applyUpdate(); }
          }
        });
      },
      onOfflineReady() {
        setToast({ message: 'Ready to work offline' });
      },
      onRegisterError(error) {
        console.error("Service worker registration failed", error);
      }
    });

    return () => {
      navigator.serviceWorker?.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);
const STREAMING_NETWORKS = [
  { id: 213, name: "Netflix" },
  { id: 2552, name: "Apple TV+" },
  { id: 1024, name: "Amazon Prime Video" },
  { id: 2739, name: "Disney+" },
  { id: 4330, name: "Paramount+" },
  { id: 3186, name: "Max" },
  { id: 453, name: "Hulu" }
];

function normalizeDiscoverShows(value: unknown): Show[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((show): show is Show => {
    if (!show || typeof show !== "object") {
      return false;
    }
    const candidate = show as Partial<Show>;
    return (
      typeof candidate.id === "number" &&
      typeof candidate.name === "string" &&
      candidate.name.trim().length > 0
    );
  });
}

function getDisplayRating(show: Show): string | null {
  const rawRating = show.rating?.average ?? show.vote_average;
  const numericRating = typeof rawRating === "number" ? rawRating : Number(rawRating);
  return Number.isFinite(numericRating) && numericRating > 0
    ? numericRating.toFixed(1)
    : null;
}

function getDisplayGenres(show: Show): string[] {
  if (!Array.isArray(show.genres)) {
    return [];
  }
  return show.genres
    .filter((genre): genre is string => typeof genre === "string" && genre.trim().length > 0)
    .slice(0, 2);
}

function showToPreviewUserShow(show: Show): UserShow {
  return {
    id: show.id.toString(),
    tvmazeId: show.id,
    name: show.name,
    imageUrl: show.image?.medium || show.image?.original || "",
    status: show.status || "Unknown",
    provider: show.webChannel?.name || show.network?.name || "",
    addedAt: Date.now(),
    summary: typeof show.summary === "string" ? show.summary.replace(/<[^>]+>/g, "") : "",
    imdbId: show.externals?.imdb || "",
    isMovie: Boolean(show.isMovie),
    rating: show.rating || {},
    vote_average: typeof show.vote_average === "number" ? show.vote_average : 0,
    genres: Array.isArray(show.genres) ? show.genres : [],
    premiered: show.premiered || "",
    runtime: show.runtime,
    backdropUrl: show.image?.original || "",
    _tmdbId: show._tmdbId,
  };
}

const loadWithFallback = async (
  primary: () => Promise<Show[]>,
  fallback?: () => Promise<Show[]>
): Promise<Show[]> => {
  try {
    return normalizeDiscoverShows(await primary());
  } catch (primaryError) {
    console.warn("Discover source failed", primaryError);
    if (!fallback) {
      return [];
    }
    try {
      return normalizeDiscoverShows(await fallback());
    } catch (fallbackError) {
      console.warn("Discover fallback failed", fallbackError);
      return [];
    }
  }
};

  const [shows, setShows] = useState<UserShow[]>([]);
  const [episodesMap, setEpisodesMap] = useState<Record<string, UserEpisode[]>>({});
  
  const episodesMapRef = useRef<Record<string, UserEpisode[]>>({});
  useEffect(() => {
    episodesMapRef.current = episodesMap;
  }, [episodesMap]);

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isStoreOpen, setIsStoreOpen] = useState(false);
  const [addingShowId, setAddingShowId] = useState<number | null>(null);
  const [previewSource, setPreviewSource] = useState<Show | null>(null);
  const [isOnboarding, setIsOnboarding] = useState(() => localStorage.getItem('nextup_needs_onboarding') === 'true');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"up-next" | "discover" | "coming" | "library">("up-next");
  const [detailsShow, setDetailsShow] = useState<UserShow | null>(null);
  const [trendingShows, setTrendingShows] = useState<Show[]>([]);
  const [trendingMovies, setTrendingMovies] = useState<Show[]>([]);
  const [premieringSoon, setPremieringSoon] = useState<Show[]>([]);
  const [hiddenGems, setHiddenGems] = useState<Show[]>([]);
  const [forYou, setForYou] = useState<Show[]>([]);
  const [networkShows, setNetworkShows] = useState<Record<number, Show[]>>({});
  const [appError, setAppError] = useState<string | null>(null);
  const [libraryFilter, setLibraryFilter] = useState<"all" | "watching" | "caught-up" | "ended" | "movies">("all");
  const [librarySearch, setLibrarySearch] = useState("");
  const [librarySort, setLibrarySort] = useState<"name" | "added" | "progress">("added");
  const [recommendedPick, setRecommendedPick] = useState<{ show: UserShow, nextEp: UserEpisode, progress: number } | null>(null);
  const [isDiscoverLoading, setIsDiscoverLoading] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const generationRef = useRef(0);
  const discoverFetchedRef = useRef(false);
  const discoverRequestRef = useRef<Promise<void> | null>(null);
  const lastFetchedShowsLengthRef = useRef(-1);


  useEffect(() => {
    if (user && localStorage.getItem('nextup_needs_onboarding') === 'true') {
      setIsOnboarding(true);
    }
  }, [user]);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      if (u?.uid !== user?.uid) {
        generationRef.current += 1;
        
        setShows([]);
        setEpisodesMap({});
        setTrendingShows([]);
        setTrendingMovies([]);
        setPremieringSoon([]);
        setHiddenGems([]);
        setForYou([]);
        setNetworkShows({});
        setDetailsShow(null);
        setLibraryFilter("all");
        setLibrarySearch("");
        setLibrarySort("added");
        setRecommendedPick(null);
        setPreviewSource(null);
        setAddingShowId(null);
        setIsSearchOpen(false);
        setIsStoreOpen(false);
        setAppError(null);
        setDiscoverError(null);
        
        discoverFetchedRef.current = false;
        discoverRequestRef.current = null;
        lastFetchedShowsLengthRef.current = -1;
      }
      
      setUser(u);
      setLoading(false);
    });
  }, [user]);

  useEffect(() => {
    if (user) {
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(() => {
          import("./components/SearchModal");
          import("./components/DetailsModal");
        });
      } else {
        setTimeout(() => {
          import("./components/SearchModal");
          import("./components/DetailsModal");
        }, 2000);
      }
    }
  }, [user]);



  type JobState = {
    inFlight: boolean;
    lastSuccess: number;
    failureCount: number;
    nextAttemptAt: number;
  };

  const reconcileJobsRef = useRef<Map<string, { eps: JobState, meta: JobState }>>(new Map());

  useEffect(() => {
    if (!user || shows.length === 0) return;
    
    const runReconciliation = async () => {
      const currentGen = generationRef.current;
      const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
      const EPISODE_REFRESH_INTERVAL = 4 * 60 * 60 * 1000; // 4 hours
      const MAX_BACKOFF = 4 * 60 * 60 * 1000; // 4 hours max backoff

      for (const show of shows) {
        if (currentGen !== generationRef.current) return;
        const jobId = show.id;
        
        let jobs = reconcileJobsRef.current.get(jobId);
        if (!jobs) {
          jobs = {
            eps: { inFlight: false, lastSuccess: 0, failureCount: 0, nextAttemptAt: 0 },
            meta: { inFlight: false, lastSuccess: 0, failureCount: 0, nextAttemptAt: 0 }
          };
          reconcileJobsRef.current.set(jobId, jobs);
        }

        const now = Date.now();
        const numId = typeof show.id === 'string' ? parseInt(show.id, 10) : show.id;
        let id = show.tvmazeId !== undefined ? show.tvmazeId : numId;
        const tmdbId = show._tmdbId || (show.isMovie && id < 0 ? (-id - 1000000000) : undefined);
        
        // Auto-fix negative TVMaze ID for TV series
        if (!show.isMovie && id < 0) {
          try {
            const resolved = await resolveTVMazeShow({ id, name: show.name, externals: { imdb: show.imdbId }, _tmdbId: show._tmdbId, isMovie: false } as any);
            if (resolved && resolved.id > 0) {
              id = resolved.id;
              if (currentGen === generationRef.current) {
                await setDoc(doc(db, `users/${user.uid}/shows/${show.id}`), removeUndefined({
                  tvmazeId: resolved.id,
                  imdbId: resolved.externals?.imdb || show.imdbId || "none",
                  status: resolved.status || show.status,
                  genres: resolved.genres || show.genres || [],
                  lastRefreshed: now
                }), { merge: true });
              }
            }
          } catch (e) {
            console.error("Reconciliation resolution failed for negative ID", show.name, e);
          }
        }
        
        // Metadata needs logic
        const CURRENT_AUDIT_VERSION = 1;
        const needsAudit = (show as any)._auditVersion !== CURRENT_AUDIT_VERSION;

        // Re-check metadata if imdbId is missing, empty, or set to "none", or if 7 days have passed
        const isImdbInvalid = !show.imdbId || show.imdbId === "none" || show.imdbId === "";
        const metaDueTime = show.lastRefreshed ? show.lastRefreshed + SEVEN_DAYS : 0;
        const needsMetadataRefresh = !show.isMovie && id > 0 && (isImdbInvalid || now > metaDueTime || needsAudit);
        const needsMovieImdb = show.isMovie && (isImdbInvalid || needsAudit);

        // Episode needs logic
        const epsObj = episodesMapRef.current[jobId];
        const epsDueTime = jobs.eps.lastSuccess + EPISODE_REFRESH_INTERVAL;
        const needsEpisodes = !epsObj || now > epsDueTime;

        // Handle Metadata
        if ((needsMetadataRefresh || needsMovieImdb) && !jobs.meta.inFlight && now >= jobs.meta.nextAttemptAt) {
          jobs.meta.inFlight = true;
          (async () => {
             try {
               if (needsMovieImdb) {
                 let resolvedImdb: string | undefined = undefined;
                 if (tmdbId) {
                   try {
                     const extIds = await getTMDBExternalIds(tmdbId, true);
                     resolvedImdb = extIds.imdb || undefined;
                   } catch (e) {}
                 }
                 if (currentGen === generationRef.current && resolvedImdb) {
                   await setDoc(doc(db, `users/${user.uid}/shows/${show.id}`), removeUndefined({ imdbId: resolvedImdb, _tmdbId: tmdbId, _auditVersion: CURRENT_AUDIT_VERSION }), { merge: true });
                 } else if (currentGen === generationRef.current) {
                   await setDoc(doc(db, `users/${user.uid}/shows/${show.id}`), { _auditVersion: CURRENT_AUDIT_VERSION }, { merge: true });
                 }
               } else if (!show.isMovie && id > 0) {
                 const freshShow = await getShow(id);
                 let resolvedImdb = freshShow.externals?.imdb;
                 
                 if (currentGen === generationRef.current) {
                   await setDoc(doc(db, `users/${user.uid}/shows/${show.id}`), removeUndefined({
                       status: freshShow.status || show.status,
                       imdbId: resolvedImdb || show.imdbId || undefined,
                       genres: freshShow.genres || show.genres || [],
                       officialSite: freshShow.officialSite || show.officialSite || "",
                       lastRefreshed: now,
                       _auditVersion: CURRENT_AUDIT_VERSION
                   }), { merge: true });
                 }
               }
               jobs.meta.lastSuccess = now;
               jobs.meta.failureCount = 0;
               jobs.meta.nextAttemptAt = 0;
             } catch (e) {
               console.error("Meta reconciliation failed for", show.name, e);
               jobs.meta.failureCount++;
               jobs.meta.nextAttemptAt = now + Math.min(MAX_BACKOFF, Math.pow(2, jobs.meta.failureCount) * 60000); // starts at 2min, 4min, 8min...
             } finally {
               jobs.meta.inFlight = false;
             }
          })();
        }

        // Handle Episodes
        if (needsEpisodes && !jobs.eps.inFlight && now >= jobs.eps.nextAttemptAt) {
          jobs.eps.inFlight = true;
          (async () => {
             try {
               const eps = await getShowEpisodes(id, show.watchedEpisodes || {}, show.isMovie, show.premiered);
               if (currentGen === generationRef.current) {
                 setEpisodesMap(current => ({ ...current, [show.id]: eps }));
               }
               jobs.eps.lastSuccess = now;
               jobs.eps.failureCount = 0;
               jobs.eps.nextAttemptAt = 0;
             } catch (e) {
               console.error("Episode reconciliation failed for", show.name, e);
               jobs.eps.failureCount++;
               jobs.eps.nextAttemptAt = now + Math.min(MAX_BACKOFF, Math.pow(2, jobs.eps.failureCount) * 60000);
             } finally {
               jobs.eps.inFlight = false;
             }
          })();
        }
      }
    };
    
    runReconciliation();
    
    const interval = setInterval(runReconciliation, 5 * 60 * 1000); // Check every 5 minutes
    const onVis = () => { if (document.visibilityState === 'visible') runReconciliation(); };
    const onOn = () => runReconciliation();
    
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', onOn);
    
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('online', onOn);
    };
  }, [shows, user]);
  
  const fetchLibrary = () => {
    if (!user) return;
    
    setAppError(null);
    const showsRef = collection(db, `users/${user.uid}/shows`);
    const q = query(showsRef);
    
    return onSnapshot(q, async (snapshot) => {
      const currentGen = generationRef.current;
      try {
        const userShows = snapshot.docs.map(d => ({...d.data(), id: d.id} as UserShow));
        setShows(userShows);
        
        const asyncTasks: Promise<void>[] = [];
        
        setEpisodesMap(prevEpsMap => {
          const newEpsMap = { ...prevEpsMap };
          
          snapshot.docChanges().forEach(change => {
            const show = { ...change.doc.data(), id: change.doc.id } as UserShow;
            if (change.type === 'removed') {
              delete newEpsMap[show.id];
            } else if (change.type === 'modified') {
              const existingEps = newEpsMap[show.id];
              if (existingEps) {
                newEpsMap[show.id] = existingEps.map(ep => ({
                  ...ep,
                  watched: !!(show.watchedEpisodes && show.watchedEpisodes[ep.id]),
                  watchedAt: show.watchedEpisodes ? (show.watchedEpisodes[ep.id] || undefined) : undefined
                }));
              }
            }
          });
          return newEpsMap;
        });
      } catch (err) {
        console.error("Failed to parse shows snapshot", err);
      }
    });
  };

  const handleAddShow = async (show: Show, caughtUp: boolean = false) => {
    if (!user) return false;
    setAddingShowId(show.id);
    setAppError(null);
    try {
      const { userShow, userEpisodes } = await addShowToLibrary(show, caughtUp);
      if (userEpisodes && userEpisodes.length > 0) {
        setEpisodesMap(prev => ({
          ...prev,
          [userShow.id]: userEpisodes
        }));
      }
      setAddingShowId(null);
      setToast({ message: caughtUp ? `Added ${userShow.name} (Caught Up)` : `Added ${userShow.name} to Next Up` });
      return true;
    } catch (err: any) {
      console.error("Failed to add show:", err);
      setAppError(err.message || "Failed to add show. Please try again.");
      setAddingShowId(null);
      return false;
    }
  };

  const toggleWatched = async (showId: string, tvmazeId: number, epId: string, watched: boolean) => {
    if (!user) return;
    
    // Optimistic update
    setEpisodesMap(prev => {
      const eps = prev[showId] || [];
      return {
        ...prev,
        [showId]: eps.map(e => e.id === epId ? { ...e, watched, watchedAt: watched ? Date.now() : undefined } : e)
      };
    });

    try {
      await markEpisodeWatched(tvmazeId !== undefined ? tvmazeId : parseInt(showId, 10), epId, watched);
    } catch (err) {
      console.error("Failed to mark watched", err);
      // Rollback specific episode
      setEpisodesMap(prev => {
        const eps = prev[showId] || [];
        return {
          ...prev,
          [showId]: eps.map(e => e.id === epId ? { ...e, watched: !watched } : e)
        };
      });
      setAppError("Failed to save changes. Please check your connection.");
    }
  };

  const handleMarkThrough = async (showId: string, tvmazeId: number, epIds: string[]) => {
    // Store original watched states for rollback
    const originalStates: Record<string, boolean> = {};
    const eps = episodesMap[showId] || [];
    epIds.forEach(id => {
      const ep = eps.find(e => e.id === id);
      if (ep) originalStates[id] = !!ep.watched;
    });

    setEpisodesMap(prev => {
      const eps = prev[showId] || [];
      return {
        ...prev,
        [showId]: eps.map(e => epIds.includes(e.id) ? { ...e, watched: true } : e)
      };
    });
    
    try {
      await markEpisodesWatchedBatch(tvmazeId, epIds, true);
    } catch (err) {
      console.error("Failed to batch mark watched", err);
      // Rollback specific episodes
      setEpisodesMap(prev => {
        const eps = prev[showId] || [];
        return {
          ...prev,
          [showId]: eps.map(e => epIds.includes(e.id) ? { ...e, watched: originalStates[e.id] } : e)
        };
      });
      setAppError("Failed to save changes. Please check your connection.");
    }
  };

  const handleRemoveShow = async () => {
    if (!detailsShow) return;
    const removedShow = detailsShow;
    
    // We shouldn't optimistically remove because it's a big UI change, just wait for network
    try {
      await removeShowFromLibrary(removedShow.tvmazeId);
      setDetailsShow(null);
      setToast({ message: `Removed ${removedShow.name}` });
    } catch (err) {
      console.error("Failed to remove show", err);
      setAppError("Failed to remove show. Please check your connection.");
    }
  };

  const { upNext, comingSoon, tonight, filteredLibrary } = useMemo(() => {
    const now = new Date();
    
    const upNextRaw = shows.map(show => {
      const eps = episodesMap[show.id] || [];
      const unwatched = getReleasedEpisodes(eps, false).filter(e => !e.watched);
      
      const { percentage } = calculateProgress(eps, false);
      
      return { show, nextEp: unwatched[0], progress: percentage };
    }).filter(s => s.nextEp);

    const comingSoonRaw = shows.map(show => {
      const eps = episodesMap[show.id] || [];
      const future = eps.filter(e => {
        const releaseTime = getEpisodeReleaseTime(e);
        return releaseTime && releaseTime > now;
      });
      return { show, nextEp: future[0] };
    }).filter(s => s.nextEp).sort((a, b) => {
      const aTime = getEpisodeReleaseTime(a.nextEp)?.getTime() || 0;
      const bTime = getEpisodeReleaseTime(b.nextEp)?.getTime() || 0;
      return aTime - bTime;
    });

    const todayString = format(now, 'yyyy-MM-dd');
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    
    const tonightRaw = comingSoonRaw.filter(s => {
      const releaseTime = getEpisodeReleaseTime(s.nextEp);
      if (!releaseTime) return s.nextEp.airdate === todayString;
      // For accurate international (anime) timing, show episodes that air between now and midnight local time
      return releaseTime > now && releaseTime <= endOfToday;
    });
    
    const horizonRaw = comingSoonRaw.filter(s => !tonightRaw.includes(s));

    let lib = [...shows];
    
    if (libraryFilter !== "all") {
      lib = lib.filter(show => {
        if (libraryFilter === "movies") return !!show.isMovie;
        if (show.isMovie) return false; // Exclude movies from TV series filters

        const eps = episodesMap[show.id] || [];
        const unwatched = getReleasedEpisodes(eps, false).filter(e => !e.watched);
        const caughtUp = unwatched.length === 0;
        
        if (libraryFilter === "watching") return !caughtUp;
        if (libraryFilter === "caught-up") return caughtUp && show.status !== "Ended";
        if (libraryFilter === "ended") return show.status === "Ended";
        return true;
      });
    }

    if (librarySearch.trim()) {
      const q = librarySearch.toLowerCase();
      lib = lib.filter(s => String(s.name || "").toLowerCase().includes(q));
    }

    lib.sort((a, b) => {
      if (librarySort === "name") return a.name.localeCompare(b.name);
      if (librarySort === "added") return (b.addedAt || 0) - (a.addedAt || 0);
      if (librarySort === "progress") {
        const epsA = episodesMap[a.id] || [];
        const epsB = episodesMap[b.id] || [];
        const pctA = calculateProgress(epsA).percentage;
        const pctB = calculateProgress(epsB).percentage;
        return pctB - pctA;
      }
      return 0;
    });

    return { upNext: upNextRaw, comingSoon: horizonRaw, tonight: tonightRaw, filteredLibrary: lib };
  }, [shows, episodesMap, libraryFilter, librarySort, librarySearch]);

  const storeDiscovery = useMemo(
    () => [
      ...trendingShows,
      ...trendingMovies,
      ...premieringSoon,
      ...hiddenGems,
      ...forYou,
      ...Object.values(networkShows).flat(),
    ],
    [forYou, hiddenGems, networkShows, premieringSoon, trendingMovies, trendingShows],
  );

  const handleStoreDetails = (item: StoreMedia) => {
    setPreviewSource(item.libraryShow ? null : item.source);
    setDetailsShow(item.libraryShow || showToPreviewUserShow(item.source));
  };

  const handleStoreWatch = (item: StoreMedia) => {
    const owned = item.libraryShow;
    if (owned) {
      const released = getReleasedEpisodes(episodesMap[owned.id] || [], false);
      const episode = released.find((candidate) => !candidate.watched) || released[released.length - 1];
      if (episode) {
        handlePlayEpisode(owned.id, owned.imdbId, episode);
        return;
      }
    }

    const source = item.source;
    setPlaybackRequest({
      showId: owned?.id || source.id.toString(),
      showName: source.name,
      isMovie: Boolean(source.isMovie),
      imdbId: owned?.imdbId || source.externals?.imdb || undefined,
      _tmdbId: owned?._tmdbId || source._tmdbId,
      tvmazeId: owned?.tvmazeId ?? source.id,
      season: 1,
      number: 1,
      episodeName: source.isMovie ? "Movie" : "Episode 1",
    });
  };

  useEffect(() => {
    if (shows.length > 0 && Object.keys(episodesMap).length > 0) {
      const runCheck = () => {
        const showsWithEps = shows.map(s => ({
          ...s,
          episodes: episodesMap[s.id] || s.episodes || []
        }));
        checkAndNotifyUpcomingEpisodes(showsWithEps);
      };
      
      runCheck();
      
      const interval = setInterval(runCheck, 5 * 60 * 1000);
      
      const onVisibilityChange = () => {
        if (document.visibilityState === 'visible') runCheck();
      };
      const onOnline = () => {
        runCheck();
      };
      
      document.addEventListener('visibilitychange', onVisibilityChange);
      window.addEventListener('online', onOnline);
      
      return () => {
        clearInterval(interval);
        document.removeEventListener('visibilitychange', onVisibilityChange);
        window.removeEventListener('online', onOnline);
      };
    }
  }, [shows, episodesMap]);

  const handlePickTonight = () => {
    if (upNext.length === 0) return;
    
    if (upNext.length === 1) {
      setRecommendedPick(upNext[0]);
      return;
    }

    const sorted = [...upNext].sort((a, b) => {
      const aWatchedAt = Object.values(a.show.watchedEpisodes || {}).filter(v => v !== null) as number[];
      const bWatchedAt = Object.values(b.show.watchedEpisodes || {}).filter(v => v !== null) as number[];
      const aMax = aWatchedAt.length ? Math.max(...aWatchedAt) : 0;
      const bMax = bWatchedAt.length ? Math.max(...bWatchedAt) : 0;
      return aMax - bMax; // Oldest first
    });
    const pool = sorted.slice(0, Math.max(3, Math.floor(sorted.length / 2)));
    let picked = pool[Math.floor(Math.random() * pool.length)];
    if (recommendedPick && pool.length > 1) {
      let attempts = 0;
      while (picked.show.id === recommendedPick.show.id && attempts < 10) {
        picked = pool[Math.floor(Math.random() * pool.length)];
        attempts++;
      }
    }
    setRecommendedPick(picked);
  };

  const fetchDiscover = async () => {
    if (discoverFetchedRef.current || discoverRequestRef.current) return;
    
    setIsDiscoverLoading(true);
    setDiscoverError(null);
    
    try {
      const p = (async () => {
        const [
          trending,
          movies,
          premiering,
          gems,
          forYouData,
          networksData
        ] = await Promise.all([
          getTrendingTMDB(),
          getTrendingMoviesTMDB(),
          getPremieringSoon(),
          getHiddenGemsTMDB(),
          getForYouTMDB(),
          Promise.all(STREAMING_NETWORKS.map(async n => {
            const shows = await getTopShowsByNetwork(n.id);
            return { id: n.id, shows };
          }))
        ]);
        
        setTrendingShows(trending);
        setTrendingMovies(movies);
        setPremieringSoon(premiering);
        setHiddenGems(gems);
        setForYou(forYouData);
        
        const networksMap: Record<number, Show[]> = {};
        for (const n of networksData) {
          networksMap[n.id] = n.shows;
        }
        setNetworkShows(networksMap);
        discoverFetchedRef.current = true;
      })();
      
      discoverRequestRef.current = p;
      await p;
    } catch (err: any) {
      console.error("Failed to fetch discover data:", err);
      setDiscoverError(err.message || "Failed to load discover content");
    } finally {
      setIsDiscoverLoading(false);
      discoverRequestRef.current = null;
    }
  };

  useEffect(() => {
    if (activeTab === "discover" || isStoreOpen) {
      fetchDiscover();
    }
  }, [activeTab, isStoreOpen]);

  if (loading) {
    return (
      <div className="min-h-dvh bg-slate-50 dark:bg-slate-950 pb-24 font-sans text-slate-900 dark:text-white p-4 max-w-7xl mx-auto md:p-8 pt-12 md:pt-16">
        <h1 className="text-4xl md:text-5xl font-display font-bold mb-8 text-slate-900 dark:text-white">
          Next<span className="text-orange-500">Up</span>
        </h1>
        <div className="flex gap-4 mb-8">
          <div className="w-24 h-10 bg-white dark:bg-slate-900 rounded-full animate-pulse" />
          <div className="w-24 h-10 bg-white dark:bg-slate-900 rounded-full animate-pulse" />
          <div className="w-24 h-10 bg-white dark:bg-slate-900 rounded-full animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-2xl bg-white dark:bg-slate-900 h-48 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }
  if (!user) return <Suspense fallback={<div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div></div>}><AuthScreen /></Suspense>;

  if (isOnboarding) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div></div>}>
        <OnboardingScreen 
          onComplete={() => {
            localStorage.removeItem('nextup_needs_onboarding');
            setIsOnboarding(false);
          }}
          onAddShow={handleAddShow}
          libraryIds={new Set(shows.map(s => parseInt(s.tvmazeId?.toString() || s.id, 10)))}
          libraryImdbs={new Set(shows.map(s => s.imdbId).filter(Boolean) as string[])}
          addingShowId={addingShowId}
        />
      </Suspense>
    );
  }

  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-200 font-sans pb-24">
      {/* Topbar */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl border-b border-slate-200/60 dark:border-slate-800/60 px-4 sm:px-8 pt-[calc(1rem+env(safe-area-inset-top))] pb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-orange-400 to-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20">
            <Tv className="w-5 h-5 text-slate-950" />
          </div>
          <div>
            <h1 className="text-slate-900 dark:text-white font-display font-bold text-lg leading-tight tracking-tight">
              Next<span className="text-orange-500">Up</span>
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-[11px] font-mono tracking-wider uppercase">Shows you love in one place.</p>
          </div>
        </div>
        
        <button 
          onClick={() => setIsSearchOpen(true)}
          className="hidden md:flex items-center gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 px-4 py-2 rounded-full text-slate-600 dark:text-slate-400 w-64 transition-all"
        >
          <Search className="w-4 h-4" />
          <span className="text-base">Search movies & shows...</span>
        </button>

        <button
          type="button"
          onClick={() => setIsStoreOpen(true)}
          className="hidden lg:flex items-center gap-2 bg-gradient-to-r from-blue-700 to-blue-600 hover:from-blue-600 hover:to-blue-500 border border-blue-400/30 px-4 py-2 rounded-full text-white font-bold text-sm shadow-lg shadow-blue-900/25 transition-all active:scale-95"
        >
          <Gamepad2 className="w-4 h-4 text-yellow-300" />
          Enter Video Store
        </button>

        <div className="flex items-center gap-3">
          <UserMenu 
            user={user} 
            onOpenSettings={() => setIsSettingsOpen(true)} 
            onSignOut={() => signOut(auth)} 
          />
        </div>
      </header>

      {appError && (
        <div className="max-w-7xl mx-auto px-4 mt-4">
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl flex justify-between items-center">
            <span className="text-base font-medium">{appError}</span>
            <button onClick={() => setAppError(null)} className="text-red-400 hover:text-red-300">×</button>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-8 pb-28">
      <div key={activeTab} className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-12">



        {/* Discover View */}
        {activeTab === "discover" && (
          <DiscoverErrorBoundary onRetry={fetchDiscover}>
            <section className="space-y-12">
              <div>
                <div className="mb-6">
                  <h2 className="text-4xl md:text-5xl font-display font-bold text-slate-900 dark:text-white tracking-tight mb-2">Discover</h2>
                  <p className="text-slate-600 dark:text-slate-400">Find your next obsession.</p>
                </div>

                {discoverError ? (
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center max-w-lg mx-auto mt-12 animate-in fade-in">
                    <h2 className="text-xl font-display font-bold text-slate-900 dark:text-white mb-2">Something went wrong</h2>
                    <p className="text-slate-600 dark:text-slate-400 mb-6 text-sm">{discoverError}</p>
                    <button 
                      onClick={() => fetchDiscover()}
                      className="bg-orange-500 hover:bg-orange-400 text-orange-950 font-bold py-2 px-6 rounded-full text-sm transition-colors"
                    >
                      Try Again
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="space-y-10">
                      {[
                        { id: 'for-you', title: 'For You', subtitle: 'Popular starting points.', shows: forYou },
                        { id: 'trending', title: 'New and trending', subtitle: 'Series drawing attention this week.', shows: trendingShows },
                        { id: 'trending-movies', title: 'Trending Movies', subtitle: 'Popular movies this week.', shows: trendingMovies },
                        { id: 'premiering', title: 'Premiering soon', subtitle: 'New series arriving shortly.', shows: premieringSoon },
                        { id: 'hidden-gems', title: 'Hidden gems', subtitle: 'Strongly rated picks you may have missed.', shows: hiddenGems },
                        ...STREAMING_NETWORKS.filter(network => networkShows[network.id] && networkShows[network.id].length > 0).map(network => ({
                          id: `network-${network.id}`,
                          title: `Top on ${network.name}`,
                          subtitle: "",
                          shows: networkShows[network.id]
                        }))
                      ].filter(section => section.shows && section.shows.length > 0).map(section => (
                        <div key={section.id} className="[content-visibility:auto] [contain-intrinsic-size:auto_480px]">
                          <div className="mb-4">
                            <h3 className="text-xl font-display font-bold text-slate-900 dark:text-white mb-1">{section.title}</h3>
                            {section.subtitle && <p className="text-slate-600 dark:text-slate-400 text-base">{section.subtitle}</p>}
                          </div>
                          <ScrollRow>
                            {(section.shows || []).filter((show): show is Show => !!(show && show.id && show.name)).map((show) => {
                              const inLibrary = shows.some(s => {
                                if (!s || !show) return false;
                                if (s.tvmazeId === show.id) return true;
                                const showYear = show.premiered ? new Date(show.premiered).getFullYear() : null;
                                const sYear = s.premiered ? new Date(s.premiered).getFullYear() : null;
                                const sameName = String(s.name || "").toLowerCase() === String(show.name || "").toLowerCase();
                                if (sameName) {
                                  if (showYear && sYear) return showYear === sYear;
                                  return true;
                                }
                                return false;
                              });
                              return (
                                <div key={show.id} className="snap-start shrink-0 w-40 md:w-48 lg:w-56 group relative rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 aspect-[2/3] hover:border-orange-500/50 transition-colors flex flex-col text-left">
                                  <button 
                                    onClick={() => {
                                      const owned = shows.find(s => {
                                        if (!s || !show) return false;
                                        if (s.tvmazeId === show.id) return true;
                                        const showYear = show.premiered ? new Date(show.premiered).getFullYear() : null;
                                        const sYear = s.premiered ? new Date(s.premiered).getFullYear() : null;
                                        const sameName = String(s.name || "").toLowerCase() === String(show.name || "").toLowerCase();
                                        if (sameName) {
                                          if (showYear && sYear) return showYear === sYear;
                                          return true;
                                        }
                                        return false;
                                      });
                                      setPreviewSource(owned ? null : show);
                                      setDetailsShow(owned || {
                                        id: show.id.toString(),
                                        tvmazeId: show.id,
                                        name: show.name,
                                        imageUrl: show.image?.medium || show.image?.original || "",
                                        status: show.status || "Unknown",
                                        provider: show.webChannel?.name || show.network?.name || "",
                                        addedAt: Date.now(),
                                        summary: typeof show.summary === 'string' ? show.summary.replace(/<[^>]+>/g, "") : "",
                                        imdbId: show.externals?.imdb || "",
                                        isMovie: !!show.isMovie,
                                        rating: show.rating || {},
                                        vote_average: typeof show.vote_average === 'number' ? show.vote_average : 0,
                                        genres: Array.isArray(show.genres) ? show.genres : [],
                                        premiered: show.premiered || "",
                                        _tmdbId: show._tmdbId
                                      });
                                    }}
                              className="absolute inset-0 z-10 touch-manipulation"
                            >
                              <span className="sr-only">View Details for {show.name}</span>
                            </button>
                            {show.image?.original || show.image?.medium ? (
                              <img decoding="async" referrerPolicy="no-referrer" loading="lazy" src={show.image.medium || show.image.original} alt="" className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" />
                            ) : (
                              <div className="absolute inset-0 flex items-center justify-center text-4xl font-bold text-slate-800">{(show.name || "?")[0]}</div>
                            )}
                            
                            {getDisplayRating(show) ? (
                              <div className="absolute top-2 right-2 z-20 flex items-center gap-1 px-2 py-1 bg-white/90 dark:bg-slate-950/90 rounded-lg border border-slate-200 dark:border-slate-800">
                                <span className="text-orange-400 text-[11px] tracking-tighter">★</span>
                                <span className="text-slate-900 dark:text-white text-[11px] font-bold">{getDisplayRating(show)}</span>
                              </div>
                            ) : null}
                            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent p-4 flex flex-col justify-end pointer-events-none">
                              <div className="pointer-events-auto relative z-20">
                                {inLibrary ? (
                                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> In Library</span>
                                ) : (
                                  <div className="flex gap-2 w-full justify-center">
                                    <button type="button"
                                      onClick={(e) => { 
                                        e.stopPropagation(); 
                                        handleAddShow(show, false); 
                                      }}
                                      className={`bg-orange-500 hover:bg-orange-400 active:scale-95 touch-manipulation text-orange-950 text-[11px] font-bold uppercase tracking-wider mb-2 py-1 px-2 rounded flex-1 text-center flex items-center justify-center gap-1 ${addingShowId === show.id ? "opacity-50" : ""}`}
                                      disabled={addingShowId === show.id}
                                    >
                                      {addingShowId === show.id ? "Adding..." : (show.isMovie) ? "+ Add Movie" : "+ Add"}
                                    </button>
                                  </div>
                                )}
                              </div>
                              <h3 className="text-white font-display font-bold leading-tight line-clamp-2 mt-1">{show.name}</h3>
                              {getDisplayGenres(show).length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1.5 opacity-80">
                                  {getDisplayGenres(show).map(g => (
                                    <span key={g} className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700/50 bg-white/90 dark:bg-slate-900/80 px-1.5 py-0.5 rounded">{g}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </ScrollRow>
                  </div>
                ))}
                {isDiscoverLoading && (
                  <div className="space-y-10 animate-pulse mt-10">
                    {[1, 2].map((sectionIndex) => (
                      <div key={sectionIndex}>
                        <div className="mb-4">
                          <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded-lg w-48 mb-2"></div>
                          <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-64"></div>
                        </div>
                        <div className="flex gap-4 overflow-hidden">
                          {[1, 2, 3, 4, 5].map((cardIndex) => (
                            <div key={cardIndex} className="shrink-0 w-40 md:w-48 lg:w-56 aspect-[2/3] bg-slate-200 dark:bg-slate-800 rounded-xl"></div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              </>
              )}
            </div>
          </section>
          </DiscoverErrorBoundary>
        )}

        {/* Up Next View */}
        {activeTab === "up-next" && (
          <section>
            <div className="mb-6">
              <h2 className="text-4xl md:text-5xl font-display font-bold text-slate-900 dark:text-white tracking-tight mb-2">Ready to watch</h2>
              <p className="text-slate-600 dark:text-slate-400">Pick up exactly where you left off.</p>
            </div>
            {upNext.length > 1 && (
              <button 
                onClick={handlePickTonight}
                className="w-full mb-6 p-4 rounded-2xl bg-gradient-to-r from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-between hover:from-indigo-500/30 hover:to-purple-500/30 transition-colors group text-left cursor-pointer"
              >
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">What should we watch tonight?</h3>
                  <p className="text-sm text-slate-700 dark:text-slate-300">Let us pick from your queue</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-indigo-500 flex items-center justify-center group-active:scale-95 transition-transform shrink-0 shadow-xl shadow-indigo-500/20">
                  <PlayCircle className="w-5 h-5 text-slate-900 dark:text-white" />
                </div>
              </button>
            )}
            
            {upNext.length === 0 && (shows.length === 0 || Object.keys(episodesMap).length >= shows.length) ? (
              <div className="bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 border-dashed rounded-3xl p-12 text-center">
                <p className="text-slate-600 dark:text-slate-400 mb-4">You're all caught up!</p>
                <button onClick={() => setIsSearchOpen(true)} className="bg-orange-500 text-orange-950 font-bold px-6 py-2.5 rounded-full hover:bg-orange-400 transition-colors">Find a show</button>
              </div>
            ) : upNext.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {upNext.map(({ show, nextEp, progress }) => (
                  <SwipeableCard key={show.id} onMark={() => toggleWatched(show.id, show.tvmazeId, nextEp.id, true)}>
                  <article className="relative min-h-[420px] bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-xl flex flex-col justify-end hover:border-slate-300 dark:hover:border-slate-700 transition-all group">
                    {/* Background Backdrop Image */}
                    <div className="absolute inset-0 z-0">
                      {show.imageUrl ? (
                        <img 
                          decoding="async" 
                          referrerPolicy="no-referrer" 
                          loading="lazy" 
                          src={show.backdropUrl || show.imageUrl} 
                          alt="" 
                          className="w-full h-full object-cover object-top opacity-90 group-hover:opacity-100 transition-all duration-500" 
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-slate-100 dark:bg-slate-900 text-slate-300 dark:text-slate-800 text-6xl font-bold">{show.name[0]}</div>
                      )}
                      {/* Premium gradual gradient overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/35 to-transparent" />
                    </div>

                    {/* Card click target to view details */}
                    <button 
                      onClick={() => setDetailsShow(show)}
                      className="absolute inset-0 z-10 w-full h-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-orange-500 rounded-3xl"
                      aria-label={`View details for ${show.name}`}
                    />

                    {/* Content Overlays */}
                    <div className="relative z-20 p-5 flex flex-col justify-end h-full pointer-events-none w-full">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="px-2.5 py-1 rounded-lg bg-orange-500/20 border border-orange-500/30 text-orange-400 text-[11px] font-bold uppercase tracking-wider">Up Next</span>
                        {show.provider && show.provider !== "Unknown Provider" && show.provider !== "Unknown" && (
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 drop-shadow-md bg-white/70 dark:bg-slate-950/70 px-2 py-0.5 rounded-lg border border-slate-300/40 dark:border-slate-800/40">{show.provider}</span>
                        )}
                      </div>

                      <h3 className="text-xl font-display font-bold text-white leading-tight drop-shadow-lg mb-1">{show.name}</h3>
                      
                      <div className="text-base font-semibold text-slate-200 mb-1 drop-shadow">
                        {show.isMovie ? "Feature Film" : `S${nextEp.season} E${nextEp.number} · ${nextEp.name}`}
                      </div>
                      
                      {getEpisodeReleaseTime(nextEp) && (
                        <div className="text-[11px] font-bold text-orange-400/90 uppercase tracking-wider mb-2">
                          Aired {format(getEpisodeReleaseTime(nextEp) || new Date(), "MMM d, yyyy")}
                        </div>
                      )}
                      
                      <ExpandableText 
                        text={nextEp.summary || show.summary || "No description."} 
                        className="text-xs text-slate-300 leading-relaxed mb-4 pointer-events-auto" 
                        limit={120}
                      />
                      
                      {!(show.isMovie) && (
                        <div className="w-full h-1.5 bg-slate-800/50 rounded-full mb-4 overflow-hidden">
                          <div className="h-full bg-orange-500 rounded-full" style={{ width: `${progress}%` }} />
                        </div>
                      )}
                      
                      <div className="flex gap-2.5 pointer-events-auto">
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleWatched(show.id, show.tvmazeId, nextEp.id, true); }}
                          className="flex-1 py-2.5 bg-white/10 hover:bg-white/20 text-white text-sm font-semibold rounded-xl transition-all border border-white/10 flex items-center justify-center gap-1.5 active:scale-95 shadow-md"
                        >
                          <CheckCircle2 className="w-4 h-4 text-orange-400" />
                          Mark Watched
                        </button>
                        <button 
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              handlePlayEpisode(show.id, show.imdbId, nextEp); 
                            }}
                            className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-400 text-orange-950 text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 active:scale-95 shadow-lg shadow-orange-500/20"
                          >
                            <PlayCircle className="w-4 h-4" />
                            Play
                          </button>
                      </div>
                    </div>
                  </article>
                  </SwipeableCard>
                ))}
              </div>
            ) : null}
          </section>
        )}

        {/* Coming Soon */}
        {activeTab === "coming" && (
          <section className="space-y-12">
            {tonight.length > 0 && (
              <div>
                <div className="mb-6">
                  <h2 className="text-4xl md:text-5xl font-display font-bold text-slate-900 dark:text-white tracking-tight mb-2">Airing Tonight</h2>
                  <p className="text-slate-600 dark:text-slate-400">Don't miss these episodes airing today.</p>
                </div>
                <div className="space-y-4">
                  {tonight.map(({ show, nextEp }) => (
                    <article 
                      key={show.id} 
                      className="w-full flex gap-6 p-4 rounded-2xl bg-orange-500/5 border border-orange-500/20 items-start text-left relative group hover:border-orange-500/40 transition-colors"
                    >
                      <button 
                        onClick={() => setDetailsShow(show)}
                        className="absolute inset-0 z-10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all touch-manipulation"
                      >
                        <span className="sr-only">View Details for {show.name}</span>
                      </button>
                      <div className="w-24 shrink-0 aspect-[2/3] bg-slate-200 dark:bg-slate-800 rounded-xl overflow-hidden relative z-0">
                        {show.imageUrl && <img decoding="async" referrerPolicy="no-referrer" loading="lazy" src={show.imageUrl} alt="" className="w-full h-full object-cover" />}
                      </div>
                      <div className="flex-1 min-w-0 relative z-0">
                        <div className="flex items-center gap-2 mb-1 min-w-0">
                          <span className="text-xs font-bold uppercase tracking-wider text-orange-400 whitespace-nowrap shrink-0">Tonight &middot; {format(getEpisodeReleaseTime(nextEp) || new Date(), "h:mm a")}</span>
                          {show.provider && show.provider !== "Unknown Provider" && show.provider !== "Unknown" && (
                            <span className="text-xs text-slate-500 dark:text-slate-400 truncate">&middot; {show.provider}</span>
                          )}
                        </div>
                        <h3 className="text-xl font-display font-bold text-slate-900 dark:text-white mb-1 truncate">{show.name}</h3>
                        <p className="text-base text-slate-700 dark:text-slate-300 font-medium truncate mb-1">{show.isMovie ? "Movie ·" : `S${nextEp.season} E${nextEp.number} ·`} {nextEp.name}</p>
                        {nextEp.summary && (
                          <ExpandableText 
                            text={nextEp.summary} 
                            className="text-sm text-slate-500 dark:text-slate-400 leading-snug mb-3" 
                            limit={120}
                          />
                        )}
                        <div className="flex flex-wrap items-center gap-2.5 mt-2 relative z-20 pointer-events-auto">
                          <AddToCalendarButton 
                            showName={show.name}
                            season={nextEp.season}
                            number={nextEp.number}
                            epTitle={nextEp.name}
                            airstamp={getEpisodeReleaseTime(nextEp)?.toISOString() || ""}
                            runtimeMinutes={show.runtime}
                          />
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )}
            <div>
              <div className="mb-6">
                <h2 className="text-4xl md:text-5xl font-display font-bold text-slate-900 dark:text-white tracking-tight mb-2">On the horizon</h2>
                <p className="text-slate-600 dark:text-slate-400">Upcoming episodes for your saved shows.</p>
              </div>
              <div className="space-y-4">
                {comingSoon.length === 0 ? (
                <div className="text-slate-500 dark:text-slate-400 py-12 text-center border border-slate-200 dark:border-slate-800 border-dashed rounded-3xl bg-slate-100 dark:bg-slate-900/30">No announced future episodes.</div>
              ) : (
                comingSoon.map(({ show, nextEp }) => (
                  <article 
                    key={show.id} 
                    className="w-full flex gap-6 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 items-start text-left relative group"
                  >
                    <button 
                      onClick={() => setDetailsShow(show)}
                      className="absolute inset-0 z-10 rounded-2xl hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-800/20 border border-transparent focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all touch-manipulation"
                    >
                      <span className="sr-only">View Details for {show.name}</span>
                    </button>
                    <div className="w-24 shrink-0 aspect-[2/3] bg-slate-200 dark:bg-slate-800 rounded-xl overflow-hidden relative z-0">
                      {show.imageUrl && <img decoding="async" referrerPolicy="no-referrer" loading="lazy" src={show.imageUrl} alt="" className="w-full h-full object-cover" />}
                    </div>
                    <div className="flex-1 min-w-0 relative z-0">
                      <h3 className="text-xl font-display font-bold text-slate-900 dark:text-white mb-1 truncate">{show.name}</h3>
                      <p className="text-base text-slate-700 dark:text-slate-300 font-medium truncate mb-1">{show.isMovie ? "Movie ·" : `S${nextEp.season} E${nextEp.number} ·`} {nextEp.name}</p>
                      {nextEp.summary && (
                        <ExpandableText 
                          text={nextEp.summary} 
                          className="text-sm text-slate-500 dark:text-slate-400 leading-snug mb-3" 
                          limit={120}
                        />
                      )}
                      <div className="flex flex-wrap items-center gap-2.5 mt-2 relative z-20 pointer-events-auto">
                        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-500/10 rounded-xl border border-orange-500/20 text-orange-400 text-xs font-bold tracking-wide uppercase">
                          <Calendar className="w-3.5 h-3.5 shrink-0" />
                          <span>{format(getEpisodeReleaseTime(nextEp) || new Date(), "MMM d")}</span>
                          <span className="opacity-40">&middot;</span>
                          <span className="text-orange-300/90 font-medium">in {formatDistanceToNow(getEpisodeReleaseTime(nextEp) || new Date())}</span>
                        </div>
                        <AddToCalendarButton 
                          showName={show.name}
                          season={nextEp.season}
                          number={nextEp.number}
                          epTitle={nextEp.name}
                          airstamp={getEpisodeReleaseTime(nextEp)?.toISOString() || ""}
                          runtimeMinutes={show.runtime}
                        />
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>
        </section>
        )}
        {activeTab === "library" && (
          <LibraryTab
            filteredLibrary={filteredLibrary}
            shows={shows}
            episodesMap={episodesMap}
            setDetailsShow={setDetailsShow}
            libraryFilter={libraryFilter}
            setLibraryFilter={setLibraryFilter}
            librarySort={librarySort}
            setLibrarySort={setLibrarySort}
            librarySearch={librarySearch}
            setLibrarySearch={setLibrarySearch}
          />
        )}
      </div>
      </main>

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-sm font-medium px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in" role="status">
          {toast.message}
          {toast.action && <button onClick={toast.action.onClick} className="text-orange-400 font-bold">{toast.action.label}</button>}
        </div>
      )}

      {/* Bottom Nav */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-slate-950/90 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 pb-[env(safe-area-inset-bottom)] z-40">
        <div className="flex justify-around items-center px-2 py-2 max-w-md mx-auto">
          {[
            { id: "up-next", label: "Up Next", icon: PlayCircle },
            { id: "discover", label: "Discover", icon: Compass },
            { id: "search", label: "Search", icon: Search, action: () => setIsSearchOpen(true) },
            { id: "coming", label: "Coming", icon: Clock },
            { id: "library", label: "Library", icon: CheckCircle2 }
          ].map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => t.action ? t.action() : setActiveTab(t.id as any)}
              className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors active:scale-95 ${
                (!t.action && activeTab === t.id) ? "text-orange-500" : "text-slate-400 hover:text-slate-300"
              }`}
            >
              <t.icon className="w-6 h-6" />
              <span className="text-[11px] font-medium tracking-wide">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {isStoreOpen && (
        <Suspense fallback={
          <div className="fixed inset-0 z-[60] grid place-items-center bg-[#061126] text-white">
            <div className="text-center">
              <div className="w-10 h-10 mx-auto mb-4 border-4 border-yellow-300 border-t-transparent rounded-full animate-spin" />
              <p className="font-display font-bold text-xl">Unlocking NEXTUP VIDEO…</p>
            </div>
          </div>
        }>
          <StoreView
            library={shows}
            episodesMap={episodesMap}
            discovery={storeDiscovery}
            staffPicks={[...forYou, ...hiddenGems]}
            userName={user.displayName?.split(" ")[0] || undefined}
            paused={Boolean(playbackRequest || detailsShow)}
            addingShowId={addingShowId}
            onExit={() => setIsStoreOpen(false)}
            onWatch={handleStoreWatch}
            onDetails={handleStoreDetails}
            onAdd={(item) => { void handleAddShow(item.source); }}
          />
        </Suspense>
      )}

      {isSettingsOpen && (
        <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} shows={shows} />
      )}
      {isSearchOpen && (
                <Suspense fallback={
          <div className="fixed inset-0 z-50 flex justify-center items-center bg-slate-950/80 backdrop-blur-sm" role="dialog" aria-modal="true">
            <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        }>
          <SearchModal 
            isOpen={isSearchOpen} 
            onClose={() => setIsSearchOpen(false)} 
            onAddShow={handleAddShow} 
            library={shows}
          />
        </Suspense>
      )}

      {detailsShow && (
                <Suspense fallback={
          <div className="fixed inset-0 z-50 flex justify-center items-center bg-slate-950/80 backdrop-blur-sm" role="dialog" aria-modal="true">
            <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        }><DetailsModal
          key={detailsShow.id}
          show={detailsShow}
          episodes={episodesMap[detailsShow.id] || []}
          isOpen={!!detailsShow}
          onClose={() => { setDetailsShow(null); setPreviewSource(null); }}
          onRemove={() => {
            handleRemoveShow();
          }}
          onToggleWatched={(epId, watched) => toggleWatched(detailsShow.id, detailsShow.tvmazeId, epId, watched)}
          onMarkThrough={(epIds) => handleMarkThrough(detailsShow.id, detailsShow.tvmazeId, epIds)}
          inLibrary={shows.some(s => s.tvmazeId === detailsShow.tvmazeId || (!!s.imdbId && s.imdbId === detailsShow.imdbId))}
          onAdd={async (caughtUp) => {
            if (previewSource) {
              const success = await handleAddShow(previewSource, caughtUp);
              if (success) {
                setToast({ message: `Added ${previewSource.name}` });
                setDetailsShow(null);
                setPreviewSource(null);
              }
            }
          }}
          addingShowId={addingShowId}
          onPlayEpisode={handlePlayEpisode}
        />
        </Suspense>
      )}

      {playbackRequest && (
        <VideoPlayerModal 
          request={playbackRequest}
          onClose={() => setPlaybackRequest(null)}
          overStore={isStoreOpen}
        />
      )}

      {recommendedPick && (
        <RecommendationModal
          isOpen={!!recommendedPick}
          onClose={() => setRecommendedPick(null)}
          show={recommendedPick.show}
          episode={recommendedPick.nextEp}
          progress={recommendedPick.progress}
          onPlayEpisode={(showId, imdbId, episode) => {
            handlePlayEpisode(showId, imdbId, episode);
            setRecommendedPick(null);
          }}
          onViewDetails={(show) => {
            setDetailsShow(show);
            setRecommendedPick(null);
          }}
          onReroll={handlePickTonight}
        />
      )}
    </div>
  );
}
