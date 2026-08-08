import { useState, useEffect } from "react";
import { Search, X, Plus, Check, CheckCircle } from "lucide-react";
import { searchMultiTMDB } from "../lib/tmdb";
import { Show, UserShow } from "../types";
import { ExpandableText } from "./ExpandableText";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAddShow: (show: Show, caughtUp?: boolean) => void;
  library: UserShow[];
}

export function SearchModal({ isOpen, onClose, onAddShow, library }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Show[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const trimmedQuery = query.trim();
    
    if (trimmedQuery.length > 2) {
      setLoading(true);
      setError(null);
      setResults([]);
      const timer = setTimeout(async () => {
        try {
          const res = await searchMultiTMDB(trimmedQuery, controller.signal);
          if (!controller.signal.aborted) {
            setResults(res.slice(0, 10));
            setLoading(false);
          }
        } catch (e: any) {
          if (!controller.signal.aborted) {
            console.error(e);
            setError(e.message || "Failed to search");
            setLoading(false);
          }
        }
      }, 300);
      return () => {
        clearTimeout(timer);
        controller.abort();
      };
    } else {
      setResults([]);
      setLoading(false);
      setError(null);
    }
  }, [query]);

  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[calc(1rem+env(safe-area-inset-top))] md:pt-[calc(6rem+env(safe-area-inset-top))] p-4 bg-slate-950/80 backdrop-blur-sm" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85dvh] overscroll-contain animate-in" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-white/50 dark:bg-slate-900/50 backdrop-blur">
          <div>
            <p className="text-orange-500 text-xs font-bold tracking-wider uppercase mb-1">Add to your library</p>
            <h2 className="text-2xl font-display font-bold text-slate-900 dark:text-white">Search movies & shows</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <div className="p-6">
          <div className="relative">
            <Search className="absolute left-4 top-4 w-5 h-5 text-slate-500 dark:text-slate-400" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Try Severance, The Bear, One Piece..."
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl py-4 pl-12 pr-4 text-slate-900 dark:text-white focus:outline-none focus:border-orange-500 transition-colors text-base"
            />
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-xs mt-3 ml-1">Check the year and network so you save the right version.</p>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-6 pb-6">
          {error && <div className="text-center text-red-500 py-8 font-medium">{error}</div>}
          {!loading && !error && query.trim().length > 2 && results.length === 0 && (
            <div className="text-center text-slate-600 dark:text-slate-400 py-8">No results found for "{query.trim()}"</div>
          )}
          {loading && <div className="text-center text-slate-600 dark:text-slate-400 py-8 animate-pulse">Searching...</div>}
          
          <div className="space-y-3">
            {results.map(show => {
              const inLibrary = library.some(s => {
    if (s.imdbId && show.externals?.imdb && s.imdbId === show.externals.imdb) return true;
    if (s.isMovie === show.isMovie && s._tmdbId && show._tmdbId && s._tmdbId === show._tmdbId) return true;
    if (s.tvmazeId && show.id > 0 && s.tvmazeId === show.id) return true;
    if (s.name && show.name && s.name.toLowerCase() === show.name.toLowerCase() && (s.premiered?.split('-')[0] === show.premiered?.split('-')[0])) return true;
    return false;
  });
              return (
                <div key={show.id} className="flex gap-4 p-3 rounded-2xl bg-slate-100/80 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-800/50 hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
                  {show.image?.medium ? (
                    <img decoding="async" referrerPolicy="no-referrer" loading="lazy" src={show.image.medium} alt={show.name} className="w-16 h-24 object-cover rounded-xl bg-slate-200 dark:bg-slate-800" />
                  ) : (
                    <div className="w-16 h-24 bg-slate-200 dark:bg-slate-800 rounded-xl flex items-center justify-center text-slate-600 font-bold text-xl">
                      {show.name[0]}
                    </div>
                  )}
                  <div className="flex-1 min-w-0 py-1">
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <h3 className="text-slate-900 dark:text-white font-display font-bold text-lg leading-tight">{show.name}</h3>
                        <p className="text-slate-600 dark:text-slate-400 text-xs mt-1 font-mono flex items-center flex-wrap gap-1">
                          {[show.premiered?.split('-')[0], show.status, show.network?.name || show.webChannel?.name].filter(Boolean).join(" · ")}
                          {show.rating?.average && (
                            <span className="inline-flex items-center gap-0.5 text-orange-400 ml-1">
                              <span className="text-[11px]">★</span>
                              <span className="font-bold text-slate-900 dark:text-white">{show.rating.average}</span>
                            </span>
                          )}
                        </p>
                      </div>
                      {inLibrary && <span className="px-2 py-1 rounded-md bg-orange-500/10 text-orange-400 text-xs font-bold uppercase tracking-wide">Saved</span>}
                    </div>
                    {show.summary && (
                      <ExpandableText 
                        text={show.summary} 
                        className="text-slate-500 dark:text-slate-400 text-sm mt-2 leading-snug break-words" 
                        limit={120}
                      />
                    )}
                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                      <div className="flex flex-wrap gap-2 justify-end">
                        {inLibrary ? (
                          <div className="flex items-center gap-1.5 px-4 py-2 min-h-[44px] rounded-full text-sm font-semibold bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-default">
                            <Check className="w-4 h-4" />
                            In Library
                          </div>
                        ) : (
                          <>
                            {!(show.isMovie) && (
                              <button 
                                onClick={() => onAddShow(show, true)}
                                className="flex items-center gap-1.5 px-4 py-2 min-h-[44px] rounded-full text-sm font-semibold transition-all bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white active:scale-95 touch-manipulation"
                              >
                                <CheckCircle className="w-4 h-4" />
                                Caught Up
                              </button>
                            )}
                            <button 
                              onClick={() => onAddShow(show, false)}
                              className="flex items-center gap-1.5 px-4 py-2 min-h-[44px] rounded-full text-sm font-semibold transition-all bg-orange-500 text-orange-950 hover:bg-orange-400 active:scale-95 touch-manipulation"
                            >
                              <Plus className="w-4 h-4" />
                              {(show.isMovie) ? "Add Movie" : "Add"}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
