import React, { useState, useEffect } from "react";
import { ArrowRight, Check, Compass, PlayCircle, Clock, CheckCircle2, Search, X } from "lucide-react";
import { Show } from "../types";
import { getTrendingTMDB } from "../lib/tmdb";
import { searchShows } from "../lib/tvmaze";

interface Props {
  onComplete: () => void;
  onAddShow: (show: Show, caughtUp: boolean) => void;
  libraryIds: Set<number>;
  libraryImdbs: Set<string>;
  addingShowId: number | null;
}

export function OnboardingScreen({ onComplete, onAddShow, libraryIds, libraryImdbs, addingShowId }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [popularShows, setPopularShows] = useState<Show[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Show[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    getTrendingTMDB().then(shows => setPopularShows(shows.slice(0, 12))).catch(console.error);
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setIsSearching(true);
      searchShows(searchQuery, controller.signal)
        .then(res => {
          if (!controller.signal.aborted) setSearchResults(res);
        })
        .catch(err => {
          if (!controller.signal.aborted) console.error(err);
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsSearching(false);
        });
    }, 500);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery]);

  const displayedShows = searchQuery.trim() ? searchResults : popularShows;

  if (step === 1) {
    return (
      <div className="min-h-dvh bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white flex flex-col p-4 sm:p-8 animate-in">
        <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col pt-8">
          <div className="mb-8 text-center">
            <h1 className="text-4xl md:text-5xl font-display font-bold mb-2">
              Welcome to Next<span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-orange-600 font-black italic">Up</span>!
            </h1>
            <p className="text-slate-600 dark:text-slate-400">Let's start by adding a few of your favorite movies or shows.</p>
          </div>
          
          <div className="relative mb-8 max-w-xl mx-auto w-full">
            <Search className="absolute left-4 top-4 w-5 h-5 text-slate-500 dark:text-slate-400" />
            <input
              type="text"
              placeholder="Search for a movie or show..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-4 pl-12 pr-10 text-slate-900 dark:text-white text-base focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery("")}
                className="absolute right-4 top-4 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto pb-48 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {displayedShows.map(show => {
              const inLibrary = libraryIds.has(show.id) || (show.externals?.imdb && libraryImdbs.has(show.externals.imdb));
              const isAdding = addingShowId === show.id;
              
              return (
                <div key={show.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden flex flex-col">
                  {show.image?.medium ? (
                    <img decoding="async" loading="lazy" src={show.image.medium} alt={show.name} className="w-full aspect-[2/3] object-cover" />
                  ) : (
                    <div className="w-full aspect-[2/3] bg-slate-200 dark:bg-slate-800 flex items-center justify-center p-4 text-center">
                      <span className="text-slate-500 dark:text-slate-400 font-medium">{show.name}</span>
                    </div>
                  )}
                  <div className="p-4 flex flex-col flex-1">
                    <h3 className="font-display font-bold line-clamp-1 mb-3 text-sm">{show.name}</h3>
                    <div className="mt-auto">
                      {inLibrary ? (
                        <button disabled className="w-full py-2 bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl text-xs font-bold uppercase flex items-center justify-center gap-1">
                          <Check className="w-4 h-4" /> Added
                        </button>
                      ) : (
                        <button 
                          onClick={() => onAddShow(show, false)}
                          disabled={isAdding}
                          className={`w-full py-2 bg-orange-500 hover:bg-orange-400 active:scale-95 touch-manipulation text-orange-950 rounded-xl text-xs font-bold uppercase transition-all flex items-center justify-center gap-1 ${isAdding ? "opacity-50" : ""}`}
                        >
                          {isAdding ? "Adding..." : "+ Add"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            
            {searchQuery && searchResults.length === 0 && !isSearching && (
              <div className="col-span-full text-center py-12 text-slate-500 dark:text-slate-400">
                No shows found for "{searchQuery}"
              </div>
            )}
          </div>
          
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent pb-[calc(1rem+env(safe-area-inset-bottom))] pt-12">
            <div className="max-w-xl mx-auto flex flex-col gap-3">
              <div className="flex gap-4">
                <button 
                  onClick={() => setStep(2)}
                  className="flex-1 py-4 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-900 dark:text-white font-bold rounded-2xl transition-all flex items-center justify-center active:scale-95 touch-manipulation"
                >
                  Skip for now
                </button>
                <button 
                  onClick={() => setStep(2)}
                  disabled={libraryIds.size === 0}
                  className="flex-1 py-4 bg-orange-500 hover:bg-orange-400 text-slate-950 font-bold rounded-2xl transition-all flex items-center justify-center active:scale-95 touch-manipulation disabled:opacity-50 disabled:active:scale-100 disabled:bg-slate-800 disabled:text-slate-500"
                >
                  Continue <ArrowRight className="w-5 h-5 ml-2" />
                </button>
              </div>
              <p className="text-center text-xs text-slate-500 dark:text-slate-400 mb-2 font-medium">You can always add more shows later from the Discover tab.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Step 2: Tour
  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white flex flex-col justify-center items-center p-4 sm:p-8 animate-in">
      <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-2xl space-y-8">
        <div className="text-center">
          <h2 className="text-4xl md:text-5xl font-display font-bold mb-2">You're all set!</h2>
          <p className="text-slate-600 dark:text-slate-400">Here is a quick tour of how to use the app.</p>
        </div>

        <div className="space-y-6">
          <div className="flex gap-4 items-start">
            <div className="w-12 h-12 bg-indigo-500/10 text-indigo-400 rounded-2xl flex items-center justify-center shrink-0">
              <PlayCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-lg mb-1">Up Next</h3>
              <p className="text-slate-600 dark:text-slate-400 text-sm">Your personalized queue. See exactly what episode you need to watch next.</p>
            </div>
          </div>
          
          <div className="flex gap-4 items-start">
            <div className="w-12 h-12 bg-orange-500/10 text-orange-400 rounded-2xl flex items-center justify-center shrink-0">
              <Compass className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-lg mb-1">Discover & Search</h3>
              <p className="text-slate-600 dark:text-slate-400 text-sm">Find new movies & shows to watch, or search for your favorites.</p>
            </div>
          </div>

          <div className="flex gap-4 items-start">
            <div className="w-12 h-12 bg-blue-500/10 text-blue-400 rounded-2xl flex items-center justify-center shrink-0">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-lg mb-1">Coming Soon</h3>
              <p className="text-slate-600 dark:text-slate-400 text-sm">Track what's airing tonight and see upcoming release dates.</p>
            </div>
          </div>
          
          <div className="flex gap-4 items-start">
            <div className="w-12 h-12 bg-emerald-500/10 text-emerald-400 rounded-2xl flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-lg mb-1">Library</h3>
              <p className="text-slate-600 dark:text-slate-400 text-sm">Manage your entire collection of watched and unwatched shows.</p>
            </div>
          </div>
        </div>

        <button 
          onClick={onComplete}
          className="w-full py-4 bg-orange-500 hover:bg-orange-400 text-slate-950 font-bold rounded-2xl transition-all flex items-center justify-center gap-2 active:scale-95 touch-manipulation mt-4"
        >
          Let's Go! <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
