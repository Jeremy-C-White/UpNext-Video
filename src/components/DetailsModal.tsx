import { useState, useEffect } from "react";
import { X, CheckCircle2, PlayCircle, Trash2, ExternalLink } from "lucide-react";
import { UserShow, UserEpisode } from "../types";
import { ExpandableText } from "./ExpandableText";
import { AddToCalendarButton } from "./AddToCalendarButton";
import { getTMDBIdFromIMDB, getWatchProviders, getTMDBExternalIds } from "../lib/tmdb";
import { resolveTVMazeShow, getEpisodes } from "../lib/tvmaze";
import { getEpisodeReleaseTime, isEpisodeReleased, getReleasedEpisodes } from "../lib/episodes";
import { getBestTorrentioStream } from "../lib/debrid";
import { doc, setDoc } from "firebase/firestore";
import { db, auth } from "../firebase";
import { removeUndefined } from "../lib/library";

interface Props {
  show: UserShow;
  episodes: UserEpisode[];
  isOpen: boolean;
  onClose: () => void;
  onRemove: () => void;
  onToggleWatched: (episodeId: string, watched: boolean) => void;
  onMarkThrough: (episodeIds: string[]) => void;
  inLibrary?: boolean;
  onAdd?: (caughtUp: boolean) => void;
  addingShowId?: number | null;
  onPlayEpisode?: (showId: string, imdbId: string | undefined, episode: UserEpisode) => void;
}

export function DetailsModal({ show, episodes, isOpen, onClose, onRemove, onToggleWatched, onMarkThrough, inLibrary, onAdd, addingShowId, onPlayEpisode }: Props) {
  const [seasonFilter, setSeasonFilter] = useState<string>("all");
  const [providers, setProviders] = useState<any[]>([]);
  const [selectedEpForStreams, setSelectedEpForStreams] = useState<UserEpisode | null>(null);
  const [resolvingStream, setResolvingStream] = useState(false);
  const [previewEps, setPreviewEps] = useState<UserEpisode[] | null>(null);
  const [epsLoading, setEpsLoading] = useState(false);
  const [isCheckingImdb, setIsCheckingImdb] = useState(false);
  const [checkedImdb, setCheckedImdb] = useState(false);
  const [resolvedLocalImdb, setResolvedLocalImdb] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setResolvedLocalImdb(null);
    }
  }, [isOpen, show.id]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      
      if (inLibrary !== false && episodes.length > 0) {
        const unwatched = getReleasedEpisodes(episodes).filter(e => !e.watched);
        if (unwatched.length > 0) {
          setSeasonFilter(unwatched[0].season.toString());
        } else {
          setSeasonFilter("all");
        }
      } else {
        setSeasonFilter("all");
      }
      
      return () => { document.body.style.overflow = ''; };
    }
  }, [isOpen, episodes, inLibrary]);

  useEffect(() => {
    if (isOpen) {
      const currentImdb = resolvedLocalImdb || show.imdbId;
      if (currentImdb && currentImdb !== "none") {
        getTMDBIdFromIMDB(currentImdb, Boolean(show.isMovie)).then(tmdbId => {
          if (tmdbId) {
            getWatchProviders(tmdbId, Boolean(show.isMovie)).then(setProviders).catch(console.error);
          }
        });
      } else {
        setProviders([]);
      }
    } else {
      setProviders([]);
    }
  }, [isOpen, show.imdbId, resolvedLocalImdb]);

  useEffect(() => {
    if (!isOpen) {
      setIsCheckingImdb(false);
      setCheckedImdb(false);
      return;
    }

    const numId = typeof show.id === 'string' ? parseInt(show.id, 10) : show.id;
    const tvmazeId = show.tvmazeId;
    const targetId = tvmazeId !== undefined ? tvmazeId : numId;
    
    const tmdbId = show._tmdbId || (show.isMovie && targetId < 0 ? (-targetId - 1000000000) : undefined);
    const currentImdb = show.imdbId;
    const isImdbNoneOrEmpty = !currentImdb || currentImdb === "none";

    if (show.isMovie && isImdbNoneOrEmpty && tmdbId) {
      setIsCheckingImdb(true);
      getTMDBExternalIds(tmdbId, true).then(async (extIds) => {
        if (extIds.imdb) {
          setResolvedLocalImdb(extIds.imdb);
          if (inLibrary !== false) {
            const showRef = doc(db, `users/${auth.currentUser?.uid}/shows/${show.id}`);
            await setDoc(showRef, removeUndefined({ imdbId: extIds.imdb, _tmdbId: tmdbId }), { merge: true });
          }
        } else {
          if (inLibrary !== false) {
            const showRef = doc(db, `users/${auth.currentUser?.uid}/shows/${show.id}`);
          }
        }
      }).catch(console.error)
      .finally(() => {
        setIsCheckingImdb(false);
        setCheckedImdb(true);
      });
    } else if (!show.isMovie && isImdbNoneOrEmpty) {
      setIsCheckingImdb(true);
      resolveTVMazeShow({ id: targetId || -1, name: show.name, _tmdbId: show._tmdbId, isMovie: false } as any).then(async (resolved) => {
        const imdbId = resolved.externals?.imdb;
        if (imdbId) {
          setResolvedLocalImdb(imdbId);
        }
        if (inLibrary !== false && auth.currentUser) {
          const showRef = doc(db, `users/${auth.currentUser.uid}/shows/${show.id}`);
          await setDoc(showRef, removeUndefined({
            imdbId: imdbId || undefined,
            ...(resolved.id > 0 ? { tvmazeId: resolved.id } : {})
          }), { merge: true });
        }
      }).catch(() => {
        // Ignore
      }).finally(() => {
        setIsCheckingImdb(false);
        setCheckedImdb(true);
      });
    } else {
      setIsCheckingImdb(false);
      setCheckedImdb(true);
    }
  }, [isOpen, show.isMovie, show.imdbId, show._tmdbId, show.id, show.tvmazeId, inLibrary]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen && inLibrary === false && episodes.length === 0) {
      setEpsLoading(true);
      const isMovie = show.isMovie;
      Promise.resolve(isMovie ? [{id: "movie_"+show.id, season: 1, number: 1, name: "Movie", airstamp: new Date().toISOString()}] : resolveTVMazeShow({ id: show.tvmazeId, name: show.name, externals: { imdb: show.imdbId }, _tmdbId: show._tmdbId, isMovie: show.isMovie } as any).then(resolved => getEpisodes(resolved.id)))
        .then(eps => {
          setPreviewEps(eps.map(e => ({
            id: String(e.id),
            showId: show.tvmazeId,
            season: e.season,
            number: e.number,
            name: e.name,
            airdate: e.airdate || "",
            airstamp: e.airstamp || "",
            imageUrl: e.image?.medium || "",
            summary: e.summary || "",
            watched: false
          })));
        })
        .catch(() => setPreviewEps([]))
        .finally(() => setEpsLoading(false));
    }
  }, [isOpen, inLibrary, show.tvmazeId, show.name, show.imdbId, episodes.length, show.isMovie, (show as any).isMovie]);

  if (!isOpen) return null;

  const displayEpisodes = inLibrary !== false ? episodes : (previewEps ?? []);
  
  const seasons = Array.from(new Set(displayEpisodes.map(e => Number(e.season)))).sort((a: any, b: any) => b - a);
  const filteredEpisodes = displayEpisodes.filter(e => {
    if (seasonFilter === "all") return true;
    return e.season.toString() === seasonFilter;
  });


  const handleToggleWatched = (episodeId: string, currentWatched: boolean) => {
    onToggleWatched(episodeId, !currentWatched);
  };

  const handleMarkThrough = (episodeId: string) => {
    const episodeIndex = episodes.findIndex(e => e.id === episodeId);
    if (episodeIndex === -1) return;
    const toMark = episodes.slice(0, episodeIndex + 1).filter(e => !e.watched).map(e => e.id);
    if (toMark.length > 0) {
      onMarkThrough(toMark);
    }
  };

  const handleRemove = () => {
    if (window.confirm("Remove this series and its watch progress?")) {
      onRemove();
    }
  };

  const handlePlayEpisode = async (episode: UserEpisode) => {
    if (onPlayEpisode) {
      onPlayEpisode(show.id, resolvedLocalImdb || show.imdbId, episode);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center pt-8 md:pt-20 px-4 bg-slate-950/80 backdrop-blur-sm touch-manipulation overflow-y-auto" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col max-h-[92dvh] md:max-h-[85dvh] overscroll-contain animate-in my-4 md:my-8" onClick={(e) => e.stopPropagation()}>
        <div className="relative min-h-[14rem] md:min-h-[18rem] bg-slate-950 shrink-0 flex flex-col justify-end p-5 md:p-6 pt-14 md:pt-20">
          {show.imageUrl && (
            <img decoding="async" referrerPolicy="no-referrer" loading="lazy" src={show.backdropUrl || show.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-20 pointer-events-none" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/70 to-slate-950/20 pointer-events-none" />
          
          <button onClick={onClose} aria-label="Close" className="absolute top-4 right-4 w-11 h-11 flex items-center justify-center bg-slate-950/60 hover:bg-slate-800 rounded-full text-white backdrop-blur transition-colors z-50 touch-manipulation border border-white/10">
            <X className="w-6 h-6" />
          </button>

          <div className="relative z-10 flex flex-col sm:flex-row items-center sm:items-end gap-4 sm:gap-6 text-center sm:text-left w-full">
            {show.imageUrl ? (
              <img decoding="async" referrerPolicy="no-referrer" loading="lazy" src={show.imageUrl} alt="" className="w-20 h-30 sm:w-24 sm:h-36 rounded-xl shadow-lg object-cover border border-slate-800 shrink-0" />
            ) : (
              <div className="w-20 h-30 sm:w-24 sm:h-36 bg-slate-800 rounded-xl flex items-center justify-center text-4xl font-bold text-white shrink-0">{show.name[0]}</div>
            )}
            <div className="flex-1 min-w-0 pb-1">
              <span className="text-orange-400 font-bold text-xs uppercase tracking-wider">{show.status}</span>
              <h2 className="text-2xl md:text-4xl font-display font-bold text-white leading-tight mt-1 mb-2 drop-shadow-md">{show.name}</h2>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-3 gap-y-1 text-xs text-slate-300">
                {show.premiered && <span>Released {new Date(show.premiered).getFullYear()}</span>}
                {show.rating?.average && (
                  <span className="flex items-center gap-1 text-orange-400 font-semibold">
                    ★ {show.rating.average}
                  </span>
                )}
                {show.genres && show.genres.length > 0 && (
                  <span className="text-slate-400">{show.genres.slice(0, 2).join(", ")}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-y-auto md:overflow-hidden overscroll-contain">
          <div className="w-full md:w-64 p-6 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 md:shrink-0 md:overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Details</h3>
            <div className="space-y-4">
              {show.summary && (
                <div className="border-b border-slate-100 dark:border-slate-800/60 pb-4 mb-2">
                  <span className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase">Overview</span>
                  <div className="text-slate-700 dark:text-slate-300 text-sm mt-1 leading-relaxed">
                    <ExpandableText text={show.summary} limit={160} className="text-slate-600 dark:text-slate-300" />
                  </div>
                </div>
              )}
              
              {(providers.length > 0 || (show.provider && show.provider !== "Unknown Provider" && show.provider !== "Unknown")) && (
                <div>
                  <span className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase">Streaming on</span>
                  <div className="flex flex-col gap-1.5 mt-1">
                    {providers.length > 0 ? (
                      providers.slice(0, 4).map(p => (
                        <div key={p.provider_id} className="flex items-center gap-2">
                          <img src={`https://image.tmdb.org/t/p/w45${p.logo_path}`} alt={p.provider_name} className="w-5 h-5 rounded" />
                          <span className="text-slate-700 dark:text-slate-300 text-base">{p.provider_name}</span>
                        </div>
                      ))
                    ) : (
                      <span className="text-slate-700 dark:text-slate-300 text-base">{show.provider}</span>
                    )}
                  </div>
                </div>
              )}
              
              {show.genres && show.genres.length > 0 && (
                <div>
                  <span className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase">Genres</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {show.genres.map(g => (
                      <span key={g} className="px-2 py-0.5 bg-slate-200 dark:bg-slate-800 rounded text-slate-700 dark:text-slate-300 text-[11px] uppercase font-bold tracking-wider">{g}</span>
                    ))}
                  </div>
                </div>
              )}
              
              {show.runtime ? (
                <div>
                  <span className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase">Runtime</span>
                  <p className="text-slate-700 dark:text-slate-300 text-base">{show.runtime} mins</p>
                </div>
              ) : null}
              
              {show.officialSite && (
                <div>
                  <span className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase">Links</span>
                  <a href={show.officialSite} target="_blank" rel="noopener noreferrer" className="text-orange-400 hover:text-orange-300 text-base flex items-center gap-1 mt-1">
                    Official Site <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
              {inLibrary !== false ? (
                <button 
                  onClick={handleRemove}
                  className="w-full py-2 px-4 border border-red-500/30 text-red-400 rounded-xl hover:bg-red-500/10 transition-colors text-base font-bold flex items-center justify-center gap-2 mt-8"
                >
                  <Trash2 className="w-4 h-4" />
                  {(show.isMovie) ? "Remove Movie" : "Remove Series"}
                </button>
              ) : (
                <div className="flex flex-col gap-2 mt-8">
                  {!(show.isMovie) && (
                    <button 
                      onClick={() => onAdd?.(true)}
                      disabled={addingShowId === show.tvmazeId}
                      className="w-full py-2 px-4 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors text-base font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {addingShowId === show.tvmazeId ? "Adding..." : "Caught Up"}
                    </button>
                  )}
                  <button 
                    onClick={() => onAdd?.(false)}
                    disabled={addingShowId === show.tvmazeId}
                    className="w-full py-2 px-4 bg-orange-500 text-orange-950 rounded-xl hover:bg-orange-400 transition-colors text-base font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {addingShowId === show.tvmazeId ? "Adding..." : (show.isMovie) ? "Add Movie" : "+ Add to Library"}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 flex flex-col md:min-h-0 bg-white/50 dark:bg-slate-900/50">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {(show.isMovie) ? "Stream Movie" : "Episodes"}
              </h3>
              {!(show.isMovie) && (
                <div className="flex items-center gap-3">
                  {inLibrary !== false && seasonFilter !== "all" && getReleasedEpisodes(filteredEpisodes).some(e => !e.watched) && (
                    <button onClick={() => onMarkThrough(
                      getReleasedEpisodes(filteredEpisodes).filter(e => !e.watched).map(e => e.id)
                    )} className="text-xs font-bold text-orange-400 bg-orange-500/10 border border-orange-500/20 px-3 py-2 rounded-lg active:scale-95 touch-manipulation">
                      Mark Season Watched
                    </button>
                  )}
                  <select 
                    value={seasonFilter} 
                    onChange={(e) => setSeasonFilter(e.target.value)}
                    className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-base rounded-lg px-3 py-1.5 focus:outline-none focus:border-orange-500"
                  >
                    <option value="all">All Seasons</option>
                    {seasons.map(s => <option key={s} value={s}>Season {s}</option>)}
                  </select>
                </div>
              )}
            </div>
            
            <div className="md:flex-1 md:overflow-y-auto overscroll-contain p-4 space-y-2">
              {epsLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex gap-4 p-3 rounded-xl border bg-slate-100/80 dark:bg-slate-800/30 border-slate-200 dark:border-slate-700/50 animate-pulse">
                    <div className="w-12 h-12 bg-slate-700/50 rounded-lg shrink-0" />
                    <div className="flex-1 space-y-2 py-1">
                      <div className="h-4 bg-slate-700/50 rounded w-1/3" />
                      <div className="h-3 bg-slate-700/50 rounded w-1/4" />
                    </div>
                  </div>
                ))
              ) : inLibrary === false && previewEps?.length === 0 ? (
                <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                  <p>Movie details unavailable.</p>
                </div>
              ) : (show.isMovie) ? (
                /* Beautiful Hero Watch Section for Movies */
                <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 flex flex-col md:flex-row items-center justify-between gap-6">
                  <div className="flex-1 text-center md:text-left">
                    <h4 className="text-slate-900 dark:text-white font-display font-bold text-xl mb-1">{show.name}</h4>
                    <p className="text-slate-500 dark:text-slate-400 text-sm">
                      {show.premiered ? `Released ${new Date(show.premiered).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}` : "Feature Film"}
                    </p>
                    {show.summary && (
                      <p className="text-slate-600 dark:text-slate-400 text-sm mt-3 leading-relaxed">
                        {show.summary.replace(/<[^>]+>/g, '')}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col sm:flex-row md:flex-col gap-3 shrink-0 w-full sm:w-auto md:w-48">
                    {(() => {
                      const finalImdbId = resolvedLocalImdb || show.imdbId;
                      const isMovieReleased = show.premiered ? new Date(show.premiered) <= new Date() : true;
                      
                      if (!isMovieReleased) {
                        const formattedDate = show.premiered ? new Date(show.premiered).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
                        return (
                          <button
                            disabled
                            className="w-full py-3.5 px-6 rounded-xl bg-slate-200 dark:bg-slate-900 text-slate-400 dark:text-slate-600 flex flex-col items-center justify-center gap-1 text-sm font-semibold border border-slate-300 dark:border-slate-800"
                          >
                            <div className="flex items-center gap-2">
                              <X className="w-5 h-5" />
                              <span>Not Released Yet</span>
                            </div>
                            {formattedDate && <span className="text-[10px] opacity-75">Expected {formattedDate}</span>}
                          </button>
                        );
                      }

                      if (isCheckingImdb || !checkedImdb) {
                        return (
                          <button
                            disabled
                            className="w-full py-3.5 px-6 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 flex items-center justify-center gap-2 text-base font-bold animate-pulse"
                          >
                            <div className="w-5 h-5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                            <span>Locating IMDb...</span>
                          </button>
                        );
                      }

                      if (finalImdbId && finalImdbId !== "none") {
                        return (
                          <button
                            onClick={() => handlePlayEpisode(filteredEpisodes[0] || { id: "movie_" + show.id, season: 1, number: 1, name: show.name } as any)}
                            
                            className="w-full py-3.5 px-6 rounded-xl bg-orange-500 text-orange-950 hover:bg-orange-400 active:scale-95 transition-all flex items-center justify-center gap-2 text-base font-bold shadow-lg shadow-orange-500/20 disabled:opacity-50 touch-manipulation"
                          >
                            {(false) ? (
                              <div className="w-5 h-5 border-2 border-orange-950 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <PlayCircle className="w-5 h-5" />
                            )}
                            <span>"Play Movie"</span>
                          </button>
                        );
                      } else {
                        return (
                          <button
                            disabled
                            className="w-full py-3.5 px-6 rounded-xl bg-slate-200 dark:bg-slate-900 text-slate-400 dark:text-slate-600 flex items-center justify-center gap-2 text-base font-semibold border border-slate-300 dark:border-slate-800"
                          >
                            <X className="w-5 h-5" />
                            <span>No Stream Available</span>
                          </button>
                        );
                      }
                    })()}
                    
                    {inLibrary !== false && filteredEpisodes[0] && (
                      <button 
                        onClick={() => handleToggleWatched(filteredEpisodes[0].id, filteredEpisodes[0].watched)}
                        className={`w-full py-3 px-6 rounded-xl border font-bold text-sm transition-all flex items-center justify-center gap-2 active:scale-95 touch-manipulation ${
                          filteredEpisodes[0].watched 
                            ? 'bg-green-500/10 border-green-500/30 text-green-500 hover:bg-green-500/20' 
                            : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{filteredEpisodes[0].watched ? "Watched" : "Mark Watched"}</span>
                      </button>
                    )}
                  </div>
                </div>
              ) : filteredEpisodes.map((ep, index) => {
                const released = isEpisodeReleased(ep);
                
                return (
                  <div key={ep.id} className={`flex flex-wrap sm:flex-nowrap items-center gap-4 p-3 rounded-xl border ${ep.watched ? 'bg-slate-50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800/50 opacity-60' : 'bg-slate-100/80 dark:bg-slate-800/30 border-slate-200 dark:border-slate-700/50'}`}>
                    <div className="w-12 h-12 bg-slate-200 dark:bg-slate-800 rounded-lg flex items-center justify-center font-mono text-xs font-bold text-orange-400 shrink-0">
                      {show.isMovie ? "MOVIE" : `S${ep.season} E${ep.number}`}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-slate-900 dark:text-white font-bold truncate text-base">{ep.name}</h4>
                      <p className="text-slate-500 dark:text-slate-400 text-xs truncate">
                        {getEpisodeReleaseTime(ep) ? getEpisodeReleaseTime(ep)!.toLocaleDateString() : "TBA"}
                      </p>
                      {ep.summary && (
                        <ExpandableText 
                          text={ep.summary} 
                          className="text-slate-600 dark:text-slate-400 text-xs mt-2 leading-snug break-words whitespace-normal" 
                          limit={100}
                        />
                      )}
                    </div>
                    {released ? (
                      <div className="flex items-center gap-2 shrink-0 w-full justify-end sm:w-auto mt-3 sm:mt-0">
                        {(() => {
                          const finalImdbId = resolvedLocalImdb || show.imdbId;

                          if (isCheckingImdb || !checkedImdb) {
                            return (
                              <button
                                disabled
                                className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-850 text-slate-400 dark:text-slate-500 flex items-center gap-1.5 text-xs font-bold animate-pulse"
                              >
                                <div className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                                <span>Checking...</span>
                              </button>
                            );
                          }

                          if (finalImdbId && finalImdbId !== "none") {
                            return (
                              <button
                                onClick={() => handlePlayEpisode(ep)}
                                
                                className="p-2.5 rounded-lg bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 active:scale-95 touch-manipulation flex items-center gap-1.5 text-xs font-bold disabled:opacity-50"
                                title="Stream"
                              >
                                {(false) ? (
                                  <div className="w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <PlayCircle className="w-4 h-4" />
                                )}
                                <span>"Play"</span>
                              </button>
                            );
                          } else {
                            return (
                              <button
                                disabled
                                className="p-2.5 rounded-lg bg-slate-200/50 dark:bg-slate-900 text-slate-400 dark:text-slate-600 flex items-center gap-1.5 text-xs font-semibold border border-slate-200 dark:border-slate-800"
                                title="No Stream Available"
                              >
                                <X className="w-3.5 h-3.5" />
                                <span>No Stream</span>
                              </button>
                            );
                          }
                        })()}
                        {inLibrary !== false && !ep.watched && (
                          <button 
                            onClick={() => handleMarkThrough(ep.id)}
                            className="text-[11px] uppercase font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white px-3 py-2 bg-slate-200 dark:bg-slate-800 rounded-lg ml-2"
                          >
                            Through Here
                          </button>
                        )}
                        {inLibrary !== false && (
                          <button 
                            onClick={() => handleToggleWatched(ep.id, ep.watched)}
                            className={`p-2.5 rounded-xl transition-colors ${ep.watched ? 'text-green-500 bg-green-500/10' : 'text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 active:scale-95 touch-manipulation'}`}
                          >
                            <CheckCircle2 className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                    ) : getEpisodeReleaseTime(ep) ? (
                      <div className="flex items-center gap-2 shrink-0 w-full justify-end sm:w-auto mt-3 sm:mt-0">
                        <AddToCalendarButton 
                          showName={show.name}
                          season={ep.season}
                          number={ep.number}
                          epTitle={ep.name}
                          airstamp={getEpisodeReleaseTime(ep)?.toISOString() || ""}
                          runtimeMinutes={show.runtime}
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {inLibrary !== false && (
              <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur shrink-0 md:hidden flex justify-center">
                <button 
                  onClick={onClose}
                  className="w-full py-3 bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl font-bold text-base hover:bg-slate-300 dark:hover:bg-slate-700 active:scale-95 transition-all touch-manipulation"
                >
                  Close
                </button>
              </div>
            )}
            {inLibrary === false && previewEps && previewEps.length > 0 && (
              <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur shrink-0 md:hidden flex gap-2">
                {!(show.isMovie) && (
                  <button 
                    onClick={() => onAdd?.(true)}
                    disabled={addingShowId === show.tvmazeId}
                    className="flex-1 py-2 px-4 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {addingShowId === show.tvmazeId ? "Adding..." : "Caught Up"}
                  </button>
                )}
                <button 
                  onClick={() => onAdd?.(false)}
                  disabled={addingShowId === show.tvmazeId}
                  className="flex-1 py-2 px-4 bg-orange-500 text-orange-950 rounded-xl hover:bg-orange-400 transition-colors text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {addingShowId === show.tvmazeId ? "Adding..." : (show.isMovie) ? "Add Movie" : "+ Add"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
