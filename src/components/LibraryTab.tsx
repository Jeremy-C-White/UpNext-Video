import { CheckCircle2 } from "lucide-react";
import { UserShow, UserEpisode } from "../types";
import { calculateProgress } from "../lib/episodes";

interface LibraryTabProps {
  filteredLibrary: UserShow[];
  shows: UserShow[];
  episodesMap: Record<string, UserEpisode[]>;
  setDetailsShow: (show: UserShow) => void;
  libraryFilter: string;
  setLibraryFilter: (f: any) => void;
  librarySort: string;
  setLibrarySort: (s: any) => void;
  librarySearch: string;
  setLibrarySearch: (s: string) => void;
}

export function LibraryTab({
  filteredLibrary,
  shows,
  episodesMap,
  setDetailsShow,
  libraryFilter,
  setLibraryFilter,
  librarySort,
  setLibrarySort,
  librarySearch,
  setLibrarySearch
}: LibraryTabProps) {
  let epsTotal = 0;
  let minutesTotal = 0;
  const showWatchCounts: Record<string, {name: string, count: number}> = {};
  
  Object.values(episodesMap).forEach(showEps => {
    showEps.forEach(ep => {
      if (ep.watched) {
        epsTotal++;
        minutesTotal += ep.runtime || 0;
        if (!showWatchCounts[ep.showId]) {
           const show = shows.find(s => s.id === ep.showId.toString() || s.tvmazeId === ep.showId || s.imdbId === ep.showId?.toString());
           showWatchCounts[ep.showId] = { name: "Unknown Show", count: 0 };
           if (show) showWatchCounts[ep.showId].name = show.name;
        }
        showWatchCounts[ep.showId].count++;
      }
    });
  });
  
  const topShow = Object.values(showWatchCounts).sort((a,b) => b.count - a.count)[0];
  const hoursTotal = Math.round(minutesTotal / 60);

  return (
    <section className="space-y-6">
      {epsTotal > 0 && (
        <div className="mb-8 p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <h3 className="text-xl font-display font-bold text-slate-900 dark:text-white mb-1">Your Watch Stats</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">All-time overview</p>
          </div>
          <div className="flex flex-wrap gap-6 md:gap-8">
            <div>
              <div className="text-4xl md:text-5xl font-display font-bold text-orange-400">{epsTotal}</div>
              <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mt-1">Episodes</div>
            </div>
            <div>
              <div className="text-4xl md:text-5xl font-display font-bold text-indigo-400">{hoursTotal}</div>
              <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mt-1">Hours</div>
            </div>
            {topShow && (
              <div>
                <div className="text-xl font-bold text-slate-900 dark:text-white max-w-[220px] leading-tight pt-1.5">{topShow.name}</div>
                <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mt-1">Most Watched</div>
              </div>
            )}
          </div>
        </div>
      )}
      
      <div className="mb-6">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-2">
          <div>
            <h2 className="text-4xl md:text-5xl font-display font-bold text-slate-900 dark:text-white tracking-tight mb-2">Your library</h2>
            <p className="text-slate-600 dark:text-slate-400">All your saved series.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input 
              type="text" 
              placeholder="Search library..." 
              value={librarySearch}
              onChange={(e) => setLibrarySearch(e.target.value)}
              className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-base rounded-lg px-4 py-2 w-full md:w-48 focus:outline-none focus:border-orange-500"
            />
            <select 
              value={librarySort} 
              onChange={(e) => setLibrarySort(e.target.value as any)}
              className="bg-slate-200 dark:bg-slate-800 text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-base focus:outline-none focus:ring-1 focus:ring-orange-500"
            >
              <option value="added">Recently Added</option>
              <option value="name">Alphabetical</option>
              <option value="progress">Progress</option>
            </select>
            <div className="flex bg-slate-200 dark:bg-slate-800 rounded-lg p-1 overflow-x-auto snap-x">
              {(['all', 'watching', 'caught-up', 'ended', 'movies'] as const).map(filter => (
                <button
                  key={filter}
                  onClick={() => setLibraryFilter(filter)}
                  className={`snap-start whitespace-nowrap px-3 py-2 text-base font-medium rounded-md transition-colors ${libraryFilter === filter ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-300"}`}
                >
                  {filter === 'all' ? 'All' : filter === 'watching' ? 'Watching' : filter === 'caught-up' ? 'Caught Up' : filter === 'ended' ? 'Ended' : 'Movies'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {filteredLibrary.map((show) => {
          const eps = episodesMap[show.id] || [];
          const pct = calculateProgress(eps).percentage;
          return (
            <div key={show.id} className="group relative rounded-xl overflow-hidden bg-slate-900 border border-slate-800 aspect-[2/3] hover:border-orange-500/50 transition-colors flex flex-col text-left">
              <button onClick={() => setDetailsShow(show)} className="absolute inset-0 z-10 touch-manipulation">
                <span className="sr-only">View Details for {show.name}</span>
              </button>
              {show.imageUrl ? (
                <img decoding="async" referrerPolicy="no-referrer" loading="lazy" src={show.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-4xl font-bold text-slate-800">{show.name[0]}</div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent p-4 flex flex-col justify-end pointer-events-none">
                <span className="text-[11px] font-bold text-orange-400 uppercase tracking-wider mb-1">
                  {show.isMovie ? (pct === 100 ? "Movie · Watched" : "Movie") : `${pct}% Watched`}
                </span>
                <h3 className="text-white font-display font-bold leading-tight line-clamp-2">{show.name}</h3>
              </div>
            </div>
          )
        })}
      </div>
      
      {filteredLibrary.length === 0 && (
        <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 max-w-xl mx-auto text-center mt-6">
          <CheckCircle2 className="w-12 h-12 text-slate-400 mx-auto mb-4 animate-pulse" />
          <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">No Saved Movies or Shows</h3>
          <p className="text-slate-600 dark:text-slate-400 text-sm mb-6 leading-relaxed">
            {shows.length === 0 
               ? "You haven't added any series or movies to your library yet. Use the Search tab or browse the Discover section to find your favorite titles!" 
               : "No titles match your current filter or search criteria. Try changing your filters above!"}
          </p>
          {shows.length === 0 && (
            <div className="bg-orange-500/10 border border-orange-500/20 text-orange-600 dark:text-orange-400 p-4 rounded-2xl text-xs text-left leading-relaxed">
              <span className="font-bold block mb-1">🔑 Is your library missing? Casing Sensitivity Note:</span>
              Please note that NextUp usernames are strictly case-sensitive. For example, <code className="font-mono bg-orange-500/10 px-1 py-0.5 rounded text-[11px]">Alex</code> and <code className="font-mono bg-orange-500/10 px-1 py-0.5 rounded text-[11px]">alex</code> are treated as separate accounts. If you previously saved titles, try signing out and signing in with your exact original capitalization.
            </div>
          )}
        </div>
      )}
    </section>
  );
}
