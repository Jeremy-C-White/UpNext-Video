import { useState, useEffect } from "react";
import { X, PlayCircle, Sparkles, Dices, Info, Tv, Calendar } from "lucide-react";
import { UserShow, UserEpisode } from "../types";
import { ExpandableText } from "./ExpandableText";
import { format } from "date-fns";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  show: UserShow;
  episode: UserEpisode;
  progress: number;
  onPlayEpisode: (showId: string, imdbId: string | undefined, episode: UserEpisode) => void;
  onViewDetails: (show: UserShow) => void;
  onReroll: () => void;
  }

export function RecommendationModal({
  isOpen,
  onClose,
  show,
  episode,
  progress,
  onPlayEpisode,
  onViewDetails,
  onReroll,
}: Props) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isResolving = false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      {/* Blurred background overlay */}
      <div 
        className="fixed inset-0 bg-slate-950/85 backdrop-blur-xl transition-opacity animate-fade-in"
        onClick={onClose}
      />

      {/* Floating recommendation card */}
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl z-10 transition-transform animate-scale-up flex flex-col my-auto">
        
        {/* Backdrop Graphic Header with gradient fade */}
        <div className="relative h-64 sm:h-72 w-full bg-slate-950 shrink-0">
          {show.backdropUrl || show.imageUrl ? (
            <img 
              decoding="async"
              referrerPolicy="no-referrer"
              loading="lazy"
              src={show.backdropUrl || show.imageUrl}
              alt=""
              className="w-full h-full object-cover object-top opacity-80"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-slate-950 text-slate-800 text-6xl font-bold">
              {show.name[0]}
            </div>
          )}
          {/* Shading/gradient transition down into content card */}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent" />
          
          {/* Sparkles / Magic badge */}
          <div className="absolute top-4 left-4 flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 rounded-full text-xs font-semibold uppercase tracking-wider backdrop-blur-md">
            <Sparkles className="w-3.5 h-3.5 animate-pulse text-indigo-400" />
            <span>Tonight's Pick</span>
          </div>

          {/* Close button */}
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 p-2.5 bg-slate-900/60 hover:bg-slate-900/90 border border-slate-800/50 rounded-full text-slate-400 hover:text-white transition-colors backdrop-blur-md cursor-pointer touch-manipulation"
            aria-label="Dismiss recommendation"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Floating Show Name Info */}
          <div className="absolute bottom-4 left-5 right-5">
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded bg-orange-500/20 border border-orange-500/30 text-orange-400 text-[11px] font-bold uppercase tracking-wider">
                QUEUE ITEM
              </span>
              {show.provider && show.provider !== "Unknown Provider" && show.provider !== "Unknown" && (
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300 bg-slate-950/40 backdrop-blur-sm px-2 py-0.5 rounded border border-slate-800/40">
                  {show.provider}
                </span>
              )}
            </div>
            <h2 className="text-4xl md:text-5xl font-display font-black text-white tracking-tight leading-tight drop-shadow-md">
              {show.name}
            </h2>
          </div>
        </div>

        {/* Card Content body */}
        <div className="p-6 flex-1 flex flex-col justify-between">
          <div className="mb-6">
            {/* Episode Title & Info */}
            <div className="flex flex-wrap items-baseline gap-2 mb-2">
              <span className="text-lg font-bold text-slate-200">
                {show.isMovie ? "Feature Film" : `S${episode.season} E${episode.number}`}
              </span>
              {!show.isMovie && (
                <>
                  <span className="text-slate-500 text-sm">&middot;</span>
                  <span className="text-base text-slate-300 font-medium">{episode.name}</span>
                </>
              )}
            </div>

            {/* Aired date */}
            {episode.airdate && (
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-orange-400/90 uppercase tracking-wider mb-3">
                <Calendar className="w-3 h-3 shrink-0" />
                <span>Aired {format(new Date(episode.airstamp || episode.airdate), "MMM d, yyyy")}</span>
              </div>
            )}

            {/* Expandable Episode/Show Summary */}
            <div className="text-sm text-slate-300 leading-relaxed bg-slate-950/30 border border-slate-800/20 rounded-2xl p-4 mb-4">
              <ExpandableText 
                text={episode.summary || show.summary || "No description available."}
                className="text-slate-300 text-sm leading-relaxed"
                limit={160}
              />
            </div>

            {/* Progress indicator */}
            {!show.isMovie && progress > 0 && (
              <div className="mb-2">
                <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                  <span className="font-medium">Series Progress</span>
                  <span className="font-bold text-orange-400">{progress}% Watched</span>
                </div>
                <div className="w-full h-1.5 bg-slate-800/50 rounded-full overflow-hidden backdrop-blur-sm border border-slate-800/30">
                  <div className="h-full bg-orange-500 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-3">
            {/* Primary: Play Episode */}
            <button
              onClick={() => onPlayEpisode(show.id, show.imdbId, episode)}
              disabled={isResolving}
              className="w-full py-4 bg-orange-500 hover:bg-orange-400 disabled:bg-orange-500/50 text-orange-950 rounded-2xl font-bold text-base transition-all flex items-center justify-center gap-2.5 active:scale-98 shadow-xl shadow-orange-500/10 cursor-pointer touch-manipulation disabled:cursor-not-allowed"
            >
              {isResolving ? (
                <>
                  <div className="w-5 h-5 border-2 border-orange-950 border-t-transparent rounded-full animate-spin" />
                  <span>Finding best stream...</span>
                </>
              ) : (
                <>
                  <PlayCircle className="w-5 h-5 shrink-0" />
                  <span>Play {show.isMovie ? "Movie" : `Episode ${episode.season}x${episode.number}`} Now</span>
                </>
              )}
            </button>

            {/* Secondary Option Actions */}
            <div className="grid grid-cols-2 gap-3">
              {/* Reroll / Pick Another Show */}
              <button
                onClick={onReroll}
                className="py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/50 rounded-2xl font-semibold text-sm transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer touch-manipulation"
                title="Don't want to watch this? Let's pick another random show from your queue!"
              >
                <Dices className="w-4 h-4 text-orange-400 animate-wiggle" />
                <span>Shuffle Again</span>
              </button>

              {/* View Series Details */}
              <button
                onClick={() => onViewDetails(show)}
                className="py-3 px-4 bg-slate-800/40 hover:bg-slate-800 border border-slate-800 rounded-2xl font-semibold text-sm text-slate-300 hover:text-white transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer touch-manipulation"
              >
                <Info className="w-4 h-4 text-indigo-400" />
                <span>View Details</span>
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
