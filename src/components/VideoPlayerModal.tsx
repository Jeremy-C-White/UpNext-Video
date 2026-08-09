import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { X, PlayCircle, RefreshCcw, List, Check, Database, Copy, ExternalLink, Film, Tv, SkipForward } from "lucide-react";
import { openExternalPlayer, getBestTorrentioStream } from "../lib/debrid";
import { PlaybackRequest, PlaybackCandidate } from "../types";
import { getTMDBExternalIds } from "../lib/tmdb";
import { getShow, resolveTVMazeShow } from "../lib/tvmaze";
import { doc, setDoc } from "firebase/firestore";
import { db, auth } from "../firebase";
import { removeUndefined } from "../lib/library";
import {
  detectPlaybackEnvironment,
  getCandidateFormatLabel,
  inferCandidateContainer,
  partitionPlaybackCandidates,
} from "../lib/playbackCapabilities";
import { findEnglishAudioTrackIndex, hasOnlyKnownNonEnglishTracks, type AudioTrackDescriptor } from "../lib/audioTracks";
import {
  CREDITS_AUTOPLAY_COUNTDOWN_SECONDS,
  shouldOfferNextEpisodeShortcut,
  shouldStartCreditsAutoplay,
} from "../lib/autoplay";
import {
  findActiveIntroDBSegment,
  getIntroDBSegments,
  type IntroDBSegments,
  type IntroDBSegmentType,
} from "../lib/introdb";
import {
  clearPlaybackProgress,
  getResumePosition,
  readPlaybackProgress,
  writePlaybackProgress,
} from "../lib/playbackProgress";

const formatBytes = (bytes?: number) => {
  if (!bytes) return "";
  const gb = bytes / 1024 / 1024 / 1024;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(1)} MB`;
};

function StreamBadges({ cand, isExternal }: { cand: PlaybackCandidate, isExternal: boolean }) {
  const formatLabel = getCandidateFormatLabel(cand);
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {cand.provider && (
        <span className="bg-purple-500/15 text-purple-300 font-bold text-[10px] px-2 py-0.5 rounded border border-purple-500/20">
          ⚙️ {cand.provider}
        </span>
      )}
      {cand.readiness === 'cached' && (
        <span className="bg-blue-500/15 text-blue-300 font-bold text-[10px] px-2 py-0.5 rounded border border-blue-500/20">
          ⚡ Cached
        </span>
      )}
      {cand.readiness === 'uncached' && (
        <span className="bg-red-500/15 text-red-300 font-bold text-[10px] px-2 py-0.5 rounded border border-red-500/20">
          ⏳ Uncached
        </span>
      )}
      {cand.seeders !== undefined && (
        <span className="bg-emerald-500/10 text-emerald-400 font-bold text-[10px] px-2 py-0.5 rounded border border-emerald-500/20">
          👤 {cand.seeders} seeds
        </span>
      )}
      {isExternal ? (
        <span className="bg-amber-500/10 text-amber-300 font-bold text-[10px] px-2 py-0.5 rounded border border-amber-500/20">
          Fallback
        </span>
      ) : (
        <span className="bg-green-500/20 text-green-300 font-bold text-[10px] px-2 py-0.5 rounded border border-green-500/20">
          Plays in NextUp
        </span>
      )}
      {formatLabel && (
        <span className="bg-cyan-500/10 text-cyan-200 font-bold text-[10px] px-2 py-0.5 rounded border border-cyan-500/20">
          {formatLabel}
        </span>
      )}
      {cand.quality && (
        <span className="bg-white/10 text-white/80 font-bold text-[10px] px-2 py-0.5 rounded border border-white/5">
          {cand.quality}
        </span>
      )}
      {cand.audioLanguage && cand.audioLanguage !== "unknown" && (
        <span className="bg-indigo-500/15 text-indigo-200 font-bold text-[10px] px-2 py-0.5 rounded border border-indigo-500/20">
          {cand.audioLanguage === "english" ? "English audio" : "Multi-audio"}
        </span>
      )}
      {cand.sizeBytes && (
        <span className="bg-slate-800/80 text-slate-300 font-mono text-[10px] px-2 py-0.5 rounded border border-slate-700">
          {formatBytes(cand.sizeBytes)}
        </span>
      )}
    </div>
  );
}

interface VideoPlayerModalProps {
  request: PlaybackRequest;
  nextRequest?: PlaybackRequest | null;
  onEpisodeComplete?: () => void;
  onPlayNext?: () => void;
  onClose: () => void;
  overStore?: boolean;
}

type PlayerMode = 'loading' | 'mp4_play' | 'mkv_transition' | 'error';

export function VideoPlayerModal({
  request,
  nextRequest = null,
  onEpisodeComplete,
  onPlayNext,
  onClose,
  overStore = false,
}: VideoPlayerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playbackEnvironment = useMemo(() => detectPlaybackEnvironment(), []);
  const isIOS = playbackEnvironment.isIOS;
  
  const [candidates, setCandidates] = useState<PlaybackCandidate[]>([]);
  const [candidateIndex, setCandidateIndex] = useState(0);
  
  // Keep the existing internal names to avoid disturbing the media recovery
  // state machine. The lists are now adaptive: desktop Chrome receives MKV
  // runtime probes while iOS receives only conservative inline sources.
  const partitionedCandidates = useMemo(
    () => partitionPlaybackCandidates(candidates, playbackEnvironment),
    [candidates, playbackEnvironment],
  );
  const mp4Candidates = partitionedCandidates.inApp;
  const mkvCandidates = partitionedCandidates.fallback;

  const [mode, setMode] = useState<PlayerMode>('loading');
  const [showSourceSelector, setShowSourceSelector] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  
  const [statusText, setStatusText] = useState("Locating title...");
  const [hasError, setHasError] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [playbackWarning, setPlaybackWarning] = useState<string | null>(null);
  
  const [showUI, setShowUI] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [sourceValidated, setSourceValidated] = useState(false);
  const [resolutionAttempt, setResolutionAttempt] = useState(0);
  const [videoAttemptKey, setVideoAttemptKey] = useState(0);
  const [resolvedImdbId, setResolvedImdbId] = useState(request.imdbId || "");
  const [introSegments, setIntroSegments] = useState<IntroDBSegments>({});
  const [ignoredSegmentTypes, setIgnoredSegmentTypes] = useState<Set<IntroDBSegmentType>>(new Set());
  const [playbackClock, setPlaybackClock] = useState({ currentTime: 0, duration: 0 });
  const [creditsCountdown, setCreditsCountdown] = useState<number | null>(null);
  const [creditsAutoplayCancelled, setCreditsAutoplayCancelled] = useState(false);
  
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const playAttemptedForSourceRef = useRef(false);
  const candidateAdvanceLockRef = useRef(false);
  const sourceValidatedRef = useRef(false);
  const startupDeadlineRef = useRef(0);
  const resolutionAttemptRef = useRef(0);
  const lastProgressWriteRef = useRef(0);
  const resumeAppliedForSourceRef = useRef("");
  const completionHandledRef = useRef(false);
  const nextSourcePrewarmRef = useRef("");

  // Mutable refs to eliminate stale closure issues in timers & event handlers
  const candidatesRef = useRef<PlaybackCandidate[]>([]);
  const mp4CandidatesRef = useRef<PlaybackCandidate[]>([]);
  const mkvCandidatesRef = useRef<PlaybackCandidate[]>([]);
  const candidateIndexRef = useRef<number>(0);
  const modeRef = useRef<PlayerMode>('loading');

  useEffect(() => {
    candidatesRef.current = candidates;
    mp4CandidatesRef.current = mp4Candidates;
    mkvCandidatesRef.current = mkvCandidates;
  }, [candidates]);
  useEffect(() => { candidateIndexRef.current = candidateIndex; }, [candidateIndex]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { resolutionAttemptRef.current = resolutionAttempt; }, [resolutionAttempt]);

  const currentInAppCandidate = mp4Candidates[candidateIndex];
  const currentMp4Stream = currentInAppCandidate?.url;
  const usesHlsAdapter = Boolean(
    currentInAppCandidate &&
    inferCandidateContainer(currentInAppCandidate) === "hls" &&
    !playbackEnvironment.supportsNativeHls,
  );
  const topMkv = mkvCandidates[0];

  const progressUserId = auth.currentUser?.uid || "local";

  const saveCurrentProgress = useCallback((force = false) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return;
    const now = Date.now();
    if (!force && now - lastProgressWriteRef.current < 10_000) return;
    if (writePlaybackProgress(
      localStorage,
      progressUserId,
      request.showId,
      request.episodeId,
      video.currentTime,
      video.duration,
      now,
    )) {
      lastProgressWriteRef.current = now;
    }
  }, [progressUserId, request.episodeId, request.showId]);

  const applyResumePosition = useCallback((video: HTMLVideoElement) => {
    if (!currentMp4Stream || resumeAppliedForSourceRef.current === currentMp4Stream) return;
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;

    const record = readPlaybackProgress(
      localStorage,
      progressUserId,
      request.showId,
      request.episodeId,
    );
    const resumeAt = getResumePosition(record, video.duration);
    if (resumeAt !== null) video.currentTime = resumeAt;
    resumeAppliedForSourceRef.current = currentMp4Stream;
  }, [currentMp4Stream, progressUserId, request.episodeId, request.showId]);

  const selectNativeEnglishAudio = useCallback((video: HTMLVideoElement): "selected" | "unknown" | "foreign" => {
    type MutableAudioTrack = AudioTrackDescriptor & { enabled?: boolean };
    type VideoWithAudioTracks = HTMLVideoElement & {
      audioTracks?: { length: number; [index: number]: MutableAudioTrack };
    };
    const audioTracks = (video as VideoWithAudioTracks).audioTracks;
    if (!audioTracks || audioTracks.length === 0) return "unknown";

    const tracks: MutableAudioTrack[] = [];
    for (let index = 0; index < audioTracks.length; index += 1) tracks.push(audioTracks[index]);
    const englishIndex = findEnglishAudioTrackIndex(tracks);
    if (englishIndex >= 0) {
      tracks.forEach((track, index) => { track.enabled = index === englishIndex; });
      return "selected";
    }
    return hasOnlyKnownNonEnglishTracks(tracks) ? "foreign" : "unknown";
  }, []);

  const finishCurrentEpisode = useCallback((advance: boolean) => {
    if (completionHandledRef.current) return;
    completionHandledRef.current = true;
    clearPlaybackProgress(localStorage, progressUserId, request.showId, request.episodeId);
    onEpisodeComplete?.();
    if (advance && nextRequest) onPlayNext?.();
  }, [nextRequest, onEpisodeComplete, onPlayNext, progressUserId, request.episodeId, request.showId]);

  const handleExternalPlay = (url: string) => {
    try {
      openExternalPlayer(url);
    } catch (err: any) {
      setPlaybackError(err.message || "Failed to open the direct stream.");
      setMode('error');
    }
  };

  const copyToClipboard = async (url: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      setTimeout(() => setCopiedUrl(null), 2500);
    } catch (err) {
      console.error("Copy failed", err);
      setPlaybackWarning("Failed to copy link. Check clipboard permissions.");
      setTimeout(() => setPlaybackWarning(null), 3000);
    }
  };

  const stopCurrentVideo = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    try {
      video.pause();
      video.removeAttribute("src");
      video.load();
    } catch {
      // The element may already be leaving fullscreen or unmounting.
    }
  }, []);

  const retrySourceSearch = useCallback((message = "Refreshing video sources...") => {
    modeRef.current = 'loading';
    stopCurrentVideo();
    candidateAdvanceLockRef.current = true;
    playAttemptedForSourceRef.current = false;
    sourceValidatedRef.current = false;
    startupDeadlineRef.current = 0;
    setMode('loading');
    setSourceValidated(false);
    setAutoplayBlocked(false);
    setHasError(false);
    setPlaybackError(null);
    setPlaybackWarning(null);
    setShowSourceSelector(false);
    setIsLoading(true);
    setStatusText(message);
    setVideoAttemptKey((attempt) => attempt + 1);
    resolutionAttemptRef.current += 1;
    setResolutionAttempt(resolutionAttemptRef.current);
  }, [stopCurrentVideo]);

  const handleClose = useCallback(() => {
    const video = videoRef.current;
    saveCurrentProgress(true);
    const fullscreenElement = document.fullscreenElement;
    if (
      fullscreenElement &&
      video &&
      (fullscreenElement === video || fullscreenElement.contains(video))
    ) {
      void document.exitFullscreen?.().catch(() => undefined);
    }
    modeRef.current = 'loading';
    stopCurrentVideo();
    onClose();
  }, [onClose, saveCurrentProgress, stopCurrentVideo]);


  const handleNextMp4Candidate = useCallback((manual = false) => {
    // Several media events can fire for the same failure. Only advance once.
    if (candidateAdvanceLockRef.current) return;
    candidateAdvanceLockRef.current = true;

    if (videoRef.current) {
      try {
        videoRef.current.pause();
      } catch {
        // Ignore browsers that reject pause during a source transition.
      }
    }

    playAttemptedForSourceRef.current = false;
    sourceValidatedRef.current = false;
    setSourceValidated(false);
    setAutoplayBlocked(false);

    const currentMp4s = mp4CandidatesRef.current;
    const currentMkvs = mkvCandidatesRef.current;
    const currentIndex = candidateIndexRef.current;

    const resetAttemptState = () => {
      setHasError(false);
      setPlaybackError(null);
      setPlaybackWarning(null);
      setIsLoading(true);
    };

    if (!manual && startupDeadlineRef.current !== 0 && Date.now() > startupDeadlineRef.current) {
      if (resolutionAttemptRef.current === 0) {
        retrySourceSearch("The first links expired. Requesting fresh sources...");
        return;
      }
      if (currentMkvs.length > 0) {
        setMode('mkv_transition');
        modeRef.current = 'mkv_transition';
        setPlaybackError(
          isIOS
            ? "Automatic playback timed out. iOS fallback sources are available."
            : "Automatic playback timed out. The remaining sources need a different browser codec or delivery path.",
        );
        setIsLoading(false);
      } else {
        setMode('error');
        modeRef.current = 'error';
        setPlaybackError("Automatic playback timed out and no more sources are available.");
        setIsLoading(false);
      }
      return;
    }

    if (currentIndex + 1 < currentMp4s.length) {
      const nextIdx = currentIndex + 1;
      setCandidateIndex(nextIdx);
      candidateIndexRef.current = nextIdx;
      resetAttemptState();
      setAutoplayBlocked(false);
      setStatusText(`Checking source ${nextIdx + 1} of ${currentMp4s.length} in NextUp...`);
    } else if (manual && currentMp4s.length > 0) {
      const nextIdx = currentMp4s.length > 1 ? 0 : currentIndex;
      setCandidateIndex(nextIdx);
      candidateIndexRef.current = nextIdx;
      resetAttemptState();
      setAutoplayBlocked(false);
      setStatusText("Checking video source...");

      // A one-source retry does not change the src prop. Remounting the media
      // element clears Chromium's latched native "Something went wrong" state.
      if (nextIdx === currentIndex) {
        setVideoAttemptKey((attempt) => attempt + 1);
      }
    } else if (currentMkvs.length > 0) {
      setMode('mkv_transition');
      modeRef.current = 'mkv_transition';
      setPlaybackError(
        isIOS
          ? "The inline iOS sources could not start. External iOS fallbacks are available."
          : "NextUp tested the available browser sources. The remaining links require conversion or provider headers.",
      );
      setIsLoading(false);
    } else {
      if (resolutionAttemptRef.current === 0) {
        retrySourceSearch("The first links failed. Requesting fresh sources...");
      } else {
        setMode('error');
        modeRef.current = 'error';
        setPlaybackError("The available browser sources could not be started. Please retry the source search.");
        setIsLoading(false);
      }
    }
  }, [isIOS, retrySourceSearch]);

  const chooseInAppCandidate = useCallback((index: number) => {
    candidateAdvanceLockRef.current = false;
    playAttemptedForSourceRef.current = false;
    sourceValidatedRef.current = false;
    startupDeadlineRef.current = Date.now() + 30_000;
    setSourceValidated(false);
    setAutoplayBlocked(false);
    setHasError(false);
    setPlaybackError(null);
    setCandidateIndex(index);
    candidateIndexRef.current = index;
    setMode('mp4_play');
    modeRef.current = 'mp4_play';
    setIsLoading(true);
    setStatusText(`Checking source ${index + 1} in NextUp...`);
    setShowSourceSelector(false);
    setVideoAttemptKey((attempt) => attempt + 1);
  }, []);

  /**
   * Real-Debrid can occasionally return a short placeholder video stating that
   * the requested file was removed. Keep every source hidden until its duration
   * proves it is a real movie or episode, then reveal it to the user.
   */
  const validateCurrentSource = useCallback((video: HTMLVideoElement): 'valid' | 'invalid' | 'pending' => {
    const duration = video.duration;

    if (!Number.isFinite(duration) || duration <= 0) {
      return 'pending';
    }

    // A normal movie or TV episode will never be a 30-second clip.
    // Allow a little margin because placeholder duration can vary by browser.
    if (duration <= 45) {
      sourceValidatedRef.current = false;
      setSourceValidated(false);
      setAutoplayBlocked(false);
      setIsLoading(true);
      setStatusText("Skipping an unavailable source...");

      // Defer the source change until the current media event finishes.
      window.setTimeout(() => handleNextMp4Candidate(), 0);
      return 'invalid';
    }

    sourceValidatedRef.current = true;
    setSourceValidated(true);
    setHasError(false);

    if (isIOS) {
      setAutoplayBlocked(true);
      setIsLoading(false);
      setStatusText("Video is ready. Tap play to begin.");
    }

    return 'valid';
  }, [handleNextMp4Candidate, isIOS]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    setMode('loading');
    modeRef.current = 'loading';
    setCandidates([]);
    candidatesRef.current = [];
    mp4CandidatesRef.current = [];
    mkvCandidatesRef.current = [];
    setCandidateIndex(0);
    candidateIndexRef.current = 0;
    setPlaybackError(null);
    setPlaybackWarning(null);
    setHasError(false);
    setAutoplayBlocked(false);
    setSourceValidated(false);
    sourceValidatedRef.current = false;
    setIsLoading(true);
    setResolvedImdbId(request.imdbId || "");
    setPlaybackClock({ currentTime: 0, duration: 0 });
    setCreditsCountdown(null);
    setCreditsAutoplayCancelled(false);
    setIgnoredSegmentTypes(new Set());
    completionHandledRef.current = false;
    nextSourcePrewarmRef.current = "";
    lastProgressWriteRef.current = 0;
    resumeAppliedForSourceRef.current = "";
    candidateAdvanceLockRef.current = false;
    playAttemptedForSourceRef.current = false;
    startupDeadlineRef.current = 0;
    
    async function resolveAndFetch() {
      try {
        let activeImdbId = request.imdbId && request.imdbId !== "none" ? request.imdbId : undefined;
        let resolvedTvmazeId = request.tvmazeId;
        
        if (!activeImdbId) {
          setStatusText("Locating title metadata...");
          if (request.isMovie) {
            const tmdbId = request._tmdbId || (resolvedTvmazeId && resolvedTvmazeId < 0 ? (-resolvedTvmazeId - 1000000000) : undefined);
            if (tmdbId) {
              try {
                const extIds = await getTMDBExternalIds(tmdbId, true);
                activeImdbId = extIds.imdb || undefined;
              } catch (e) {}
            }
          } else {
            if (resolvedTvmazeId && resolvedTvmazeId > 0) {
              try {
                const freshShow = await getShow(resolvedTvmazeId);
                activeImdbId = freshShow.externals?.imdb || undefined;
              } catch (e) {}
            }
            if (!activeImdbId) {
              const tmdbId = request._tmdbId || (resolvedTvmazeId && resolvedTvmazeId < 0 ? -resolvedTvmazeId : undefined);
              if (tmdbId) {
                try {
                  const extIds = await getTMDBExternalIds(tmdbId, false);
                  activeImdbId = extIds.imdb || undefined;
                } catch (e) {}
              }
            }
            if (!activeImdbId) {
              try {
                const resolved = await resolveTVMazeShow({
                  id: resolvedTvmazeId || -1,
                  name: request.showName,
                  _tmdbId: request._tmdbId,
                  isMovie: false
                } as any);
                if (resolved) {
                  if (resolved.id > 0) resolvedTvmazeId = resolved.id;
                  if (resolved.externals?.imdb) activeImdbId = resolved.externals.imdb;
                }
              } catch (e) {}
            }
          }

          // Backfill resolved IMDb ID and TVMaze ID to Firestore so existing library items stay fixed forever
          if (activeImdbId && auth.currentUser && request.showId) {
            try {
              const showRef = doc(db, `users/${auth.currentUser.uid}/shows/${request.showId}`);
              await setDoc(showRef, removeUndefined({
                imdbId: activeImdbId,
                ...(resolvedTvmazeId && resolvedTvmazeId > 0 ? { tvmazeId: resolvedTvmazeId } : {})
              }), { merge: true });
            } catch (e) {
              console.warn("Could not backfill resolved metadata to Firestore", e);
            }
          }
        }
        
        if (!active || !activeImdbId || activeImdbId === "none") {
          throw new Error("Unable to locate a valid IMDb ID for this title. Streams cannot be loaded.");
        }

        setResolvedImdbId(activeImdbId);
        
        setStatusText("Finding sources...");
        const forceRefresh = resolutionAttempt > 0;
        const found = await getBestTorrentioStream(activeImdbId, request.season, request.number, request.isMovie ? 'movie' : 'series', controller.signal, forceRefresh);
        
        if (!active) return;
        
        if (found.length === 0) {
          throw new Error("No playable sources found.");
        }

        const playbackPlan = partitionPlaybackCandidates(found, playbackEnvironment);
        const mp4s = playbackPlan.inApp;
        const mkvs = playbackPlan.fallback;

        setCandidates(found);
        candidatesRef.current = found;
        mp4CandidatesRef.current = mp4s;
        mkvCandidatesRef.current = mkvs;
        
        if (mp4s.length > 0) {
          setCandidateIndex(0);
          candidateIndexRef.current = 0;
          setMode('mp4_play');
          modeRef.current = 'mp4_play';
          startupDeadlineRef.current = Date.now() + 30000;
          setAutoplayBlocked(false);
          setSourceValidated(false);
          sourceValidatedRef.current = false;
          setIsLoading(true);
          setStatusText(`Checking source 1 of ${mp4s.length} in NextUp...`);
        } else if (mkvs.length > 0) {
          setMode('mkv_transition');
          modeRef.current = 'mkv_transition';
          setIsLoading(false);
        } else {
          setMode('error');
          modeRef.current = 'error';
          setPlaybackError("No playable sources found.");
          setIsLoading(false);
        }
      } catch (err: any) {
        if (!active) return;
        if (err.name === "AbortError") return;

        setHasError(true);
        setPlaybackError(err.message);
        setMode('error');
        modeRef.current = 'error';
        setIsLoading(false);
      }
    }
    
    resolveAndFetch();
    
    return () => { 
      active = false; 
      controller.abort();
    };
  }, [request, resolutionAttempt, isIOS, playbackEnvironment]);

  useEffect(() => {
    const controller = new AbortController();
    setIntroSegments({});
    if (request.isMovie || !resolvedImdbId) return () => controller.abort();

    void getIntroDBSegments(
      resolvedImdbId,
      request.season,
      request.number,
      controller.signal,
    ).then(setIntroSegments).catch(error => {
      if ((error as DOMException)?.name !== "AbortError") {
        console.warn("Intro markers could not be loaded.", error);
      }
    });

    return () => controller.abort();
  }, [request.isMovie, request.number, request.season, resolvedImdbId]);

  const attemptPlayback = async () => {
    const video = videoRef.current;
    if (!video) return;

    const validation = validateCurrentSource(video);
    if (validation !== 'valid') {
      if (validation === 'pending') {
        setAutoplayBlocked(false);
        setIsLoading(true);
        setStatusText("Checking video source...");
      }
      return;
    }

    try {
      setIsLoading(true);
      await video.play();
      setAutoplayBlocked(false);
      setHasError(false);
      setIsLoading(false);
      setStatusText("Playing");
    } catch (error) {
      const pbError = error instanceof DOMException ? error : null;
      if (pbError?.name === "NotAllowedError") {
        setAutoplayBlocked(true);
        setIsLoading(false);
        return;
      }
      if (pbError?.name === "AbortError") {
        if (videoRef.current && videoRef.current.paused) {
          setIsLoading(false);
          setStatusText("Playback interrupted.");
          setAutoplayBlocked(true);
        }
        return;
      }
      setAutoplayBlocked(false);
      setIsLoading(false);
      handleNextMp4Candidate();
    }
  };

  // Safari can mount HLS directly. Desktop Chromium uses hls.js through MSE,
  // loaded only for an HLS source so the normal player bundle stays lean.
  useEffect(() => {
    if (mode !== 'mp4_play' || !currentMp4Stream || !usesHlsAdapter) return;

    const video = videoRef.current;
    if (!video) return;

    let active = true;
    let hlsInstance: import("hls.js").default | null = null;
    let recoveryAttempts = 0;

    void import("hls.js")
      .then(({ default: Hls }) => {
        if (!active) return;
        if (!Hls.isSupported()) {
          setPlaybackWarning("This browser could not initialize its HLS decoder. Trying another source...");
          handleNextMp4Candidate();
          return;
        }

        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 90,
          maxBufferLength: 45,
        });
        hlsInstance = hls;

        hls.on(Hls.Events.MEDIA_ATTACHED, () => {
          if (active) hls.loadSource(currentMp4Stream);
        });
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (!active) return;
          const tracks = hls.audioTracks.map(track => ({
            language: track.lang,
            label: `${track.name || ""} ${track.audioCodec || ""}`.trim(),
            kind: "main",
          }));
          const englishIndex = findEnglishAudioTrackIndex(tracks);
          if (englishIndex >= 0) {
            hls.audioTrack = englishIndex;
          } else if (hasOnlyKnownNonEnglishTracks(tracks)) {
            setPlaybackWarning("That source contains only non-English audio. Trying another source...");
            hls.destroy();
            hlsInstance = null;
            handleNextMp4Candidate();
          }
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!active || !data.fatal) return;

          if (data.type === Hls.ErrorTypes.MEDIA_ERROR && recoveryAttempts < 1) {
            recoveryAttempts += 1;
            hls.recoverMediaError();
            return;
          }

          if (data.type === Hls.ErrorTypes.NETWORK_ERROR && recoveryAttempts < 1) {
            recoveryAttempts += 1;
            hls.startLoad();
            return;
          }

          hls.destroy();
          hlsInstance = null;
          setPlaybackWarning("That HLS source stopped responding. Trying the next source...");
          handleNextMp4Candidate();
        });
        hls.attachMedia(video);
      })
      .catch((error) => {
        if (!active) return;
        console.error("Unable to load the HLS playback adapter", error);
        setPlaybackWarning("The HLS player could not load. Trying another source...");
        handleNextMp4Candidate();
      });

    return () => {
      active = false;
      hlsInstance?.destroy();
    };
  }, [currentMp4Stream, handleNextMp4Candidate, mode, usesHlsAdapter]);

  // Give each direct stream time to expose metadata while it remains hidden.
  useEffect(() => {
    if (mode !== 'mp4_play' || !currentMp4Stream) return;

    candidateAdvanceLockRef.current = false;
    playAttemptedForSourceRef.current = false;
    sourceValidatedRef.current = false;
    setSourceValidated(false);
    setAutoplayBlocked(false);
    setIsLoading(true);
    setStatusText(`Checking source ${candidateIndexRef.current + 1} of ${mp4CandidatesRef.current.length} in NextUp...`);

    let timeoutDuration = candidateIndexRef.current === 0 ? 15000 : 7000;
    if (startupDeadlineRef.current !== 0) {
      const remainingBudget = startupDeadlineRef.current - Date.now();
      if (remainingBudget > 0 && remainingBudget < timeoutDuration) {
        timeoutDuration = remainingBudget;
      } else if (remainingBudget <= 0) {
        timeoutDuration = 0; // Trigger immediately
      }
    }
    const timeout = window.setTimeout(() => {
      if (modeRef.current !== 'mp4_play' || sourceValidatedRef.current) return;

      const video = videoRef.current;
      if (video) {
        const validation = validateCurrentSource(video);
        if (validation !== 'pending') return;
      }

      handleNextMp4Candidate();
    }, timeoutDuration);

    return () => window.clearTimeout(timeout);
  }, [currentMp4Stream, mode, handleNextMp4Candidate, validateCurrentSource]);

  useEffect(() => {
    if (mode !== 'mp4_play') return;
    const video = videoRef.current;
    if (!video) return;

    let stallTimer: ReturnType<typeof setTimeout> | null = null;

    const handleWaiting = () => {
      if (video.paused || autoplayBlocked) return;

      // Only show spinner if video actually lacks sufficient buffer data
      if (video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
        setIsLoading(true);
      }

      if (stallTimer) clearTimeout(stallTimer);
      const stallDuration = candidateIndexRef.current === 0 ? 15000 : 7000;
      stallTimer = setTimeout(() => {
        if (
          modeRef.current === 'mp4_play' &&
          !video.paused &&
          video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA
        ) {
          handleNextMp4Candidate();
        }
      }, stallDuration);
    };

    const handlePlaying = () => {
      if (!sourceValidatedRef.current) {
        const validation = validateCurrentSource(video);
        if (validation !== 'valid') {
          video.pause();
          return;
        }
      }

      setIsLoading(false);
      setAutoplayBlocked(false);
      setStatusText("Playing");
      startupDeadlineRef.current = 0;
      if (stallTimer) clearTimeout(stallTimer);
    };

    const handleTimeUpdate = () => {
      setPlaybackClock({ currentTime: video.currentTime, duration: video.duration });
      saveCurrentProgress();
      if (!video.paused && video.currentTime > 0) {
        if (!sourceValidatedRef.current) {
          const validation = validateCurrentSource(video);
          if (validation !== 'valid') {
            video.pause();
            return;
          }
        }
        setIsLoading(false);
        setAutoplayBlocked(false);
        setStatusText("Playing");
        startupDeadlineRef.current = 0;
        if (stallTimer) clearTimeout(stallTimer);
      }
    };

    const handleLoadStart = () => {
      if (!autoplayBlocked) setIsLoading(true);
    };

    const handleLoadedMetadata = () => {
      const validation = validateCurrentSource(video);
      if (validation !== "valid") return;
      const audioSelection = selectNativeEnglishAudio(video);
      if (audioSelection === "foreign") {
        setPlaybackWarning("That source contains only non-English audio. Trying another source...");
        handleNextMp4Candidate();
        return;
      }
      applyResumePosition(video);
      setPlaybackClock({ currentTime: video.currentTime, duration: video.duration });
    };

    const handleCanPlay = () => {
      const validation = validateCurrentSource(video);
      if (validation !== 'valid') return;
      const audioSelection = selectNativeEnglishAudio(video);
      if (audioSelection === "foreign") {
        setPlaybackWarning("That source contains only non-English audio. Trying another source...");
        handleNextMp4Candidate();
        return;
      }
      applyResumePosition(video);
      
      startupDeadlineRef.current = 0;

      if (isIOS) {
        setAutoplayBlocked(true);
        setIsLoading(false);
        setStatusText("Video is ready. Tap play to begin.");
        return;
      }

      setIsLoading(false);
      if (!autoplayBlocked && !playAttemptedForSourceRef.current) {
        playAttemptedForSourceRef.current = true;
        void attemptPlayback();
      }
    };

    const handleVideoError = () => {
      if (modeRef.current === 'mp4_play') {
        handleNextMp4Candidate();
      }
    };

    const handlePause = () => saveCurrentProgress(true);
    const handleEnded = () => finishCurrentEpisode(Boolean(nextRequest));

    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('stalled', handleWaiting);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('play', handlePlaying);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('seeked', handlePlaying);
    video.addEventListener('loadstart', handleLoadStart);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('durationchange', handleLoadedMetadata);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('canplaythrough', handleCanPlay);
    video.addEventListener('error', handleVideoError);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);

    return () => {
      if (stallTimer) clearTimeout(stallTimer);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('stalled', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('play', handlePlaying);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('seeked', handlePlaying);
      video.removeEventListener('loadstart', handleLoadStart);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('durationchange', handleLoadedMetadata);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('canplaythrough', handleCanPlay);
      video.removeEventListener('error', handleVideoError);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
    };
  }, [
    applyResumePosition,
    autoplayBlocked,
    currentMp4Stream,
    finishCurrentEpisode,
    handleNextMp4Candidate,
    isIOS,
    mode,
    nextRequest,
    saveCurrentProgress,
    selectNativeEnglishAudio,
    validateCurrentSource,
  ]);

  useEffect(() => {
    const handleActivity = () => {
      setShowUI(true);
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
      
      hideTimeoutRef.current = setTimeout(() => {
        if (videoRef.current && !videoRef.current.paused) {
          setShowUI(false);
        }
      }, 3000);
    };
    
    handleActivity();
    const events = ['mousemove', 'mousedown', 'touchstart', 'click', 'keydown'];
    events.forEach(event => window.addEventListener(event, handleActivity));
    
    return () => {
      events.forEach(event => window.removeEventListener(event, handleActivity));
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, []);

  const activeSkipSegment = useMemo(() => {
    const segment = findActiveIntroDBSegment(
      introSegments,
      playbackClock.currentTime,
      playbackClock.duration,
      ignoredSegmentTypes,
    );
    return segment?.type === "intro" || segment?.type === "recap" ? segment : null;
  }, [ignoredSegmentTypes, introSegments, playbackClock.currentTime, playbackClock.duration]);

  const outroDetected = Boolean(
    introSegments.outro &&
    playbackClock.currentTime >= Math.max(0, introSegments.outro.startSeconds - 1) &&
    playbackClock.currentTime < introSegments.outro.endSeconds,
  );
  const offerNextEpisode = shouldOfferNextEpisodeShortcut(
    playbackClock.duration,
    playbackClock.currentTime,
    Boolean(nextRequest),
  );

  useEffect(() => {
    if (creditsAutoplayCancelled || creditsCountdown !== null || completionHandledRef.current) return;
    if (shouldStartCreditsAutoplay(
      playbackClock.duration,
      playbackClock.currentTime,
      Boolean(nextRequest),
      outroDetected,
    )) {
      setCreditsCountdown(CREDITS_AUTOPLAY_COUNTDOWN_SECONDS);
    }
  }, [
    creditsAutoplayCancelled,
    creditsCountdown,
    nextRequest,
    outroDetected,
    playbackClock.currentTime,
    playbackClock.duration,
  ]);

  useEffect(() => {
    if (!nextRequest?.imdbId || nextRequest.isMovie || playbackClock.currentTime <= 0) return;
    if (!introSegments.outro && (!Number.isFinite(playbackClock.duration) || playbackClock.duration <= 0)) return;
    const triggerAt = introSegments.outro
      ? Math.max(0, introSegments.outro.startSeconds - 180)
      : Math.max(0, playbackClock.duration - 270);
    if (!Number.isFinite(triggerAt) || playbackClock.currentTime < triggerAt) return;

    const prewarmKey = `${nextRequest.imdbId}:${nextRequest.season}:${nextRequest.number}`;
    if (nextSourcePrewarmRef.current === prewarmKey) return;
    nextSourcePrewarmRef.current = prewarmKey;
    void getBestTorrentioStream(
      nextRequest.imdbId,
      nextRequest.season,
      nextRequest.number,
      "series",
    ).catch(error => {
      console.warn("The next episode could not be prepared in advance.", error);
      nextSourcePrewarmRef.current = "";
    });
  }, [introSegments.outro, nextRequest, playbackClock.currentTime, playbackClock.duration]);

  useEffect(() => {
    if (creditsCountdown === null) return;
    if (creditsCountdown <= 0) {
      finishCurrentEpisode(true);
      return;
    }
    const timer = window.setTimeout(() => setCreditsCountdown(value => value === null ? null : value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [creditsCountdown, finishCurrentEpisode]);

  useEffect(() => {
    const handleBeforeUnload = () => saveCurrentProgress(true);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [saveCurrentProgress]);

  const fallbackActionLabel = isIOS ? "Open in VLC" : "Open direct stream";
  const fallbackGroupLabel = isIOS ? "iOS fallback" : "Needs conversion";
  const showCloseButton = showUI || mode === 'mkv_transition' || mode === 'error' || isLoading || autoplayBlocked;
  const portalTarget = typeof document === "undefined"
    ? null
    : document.fullscreenElement instanceof HTMLElement
      ? document.fullscreenElement
      : document.body;

  if (!portalTarget) return null;

  return createPortal((
    <div className={`fixed inset-0 z-[100] ${overStore ? "bg-slate-950/90 backdrop-blur-[3px]" : "bg-slate-950"}`}>
      {overStore && (
        <div className="absolute bottom-5 left-5 z-[199] pointer-events-none rounded-full border border-white/15 bg-black/55 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white/65 shadow-xl">
          Showroom paused · close player to return to your case
        </div>
      )}
      {/* Toast Notification for Copied Link */}
      {copiedUrl && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[250] bg-emerald-500 text-slate-950 font-bold px-4 py-2 rounded-full shadow-2xl flex items-center gap-2 text-xs animate-in fade-in slide-in-from-top-2">
          <Check className="w-4 h-4" />
          <span>Stream URL copied to clipboard!</span>
        </div>
      )}
      {playbackWarning && !copiedUrl && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[250] max-w-[min(90vw,36rem)] rounded-full border border-amber-400/30 bg-amber-500 px-4 py-2 text-center text-xs font-bold text-slate-950 shadow-2xl animate-in fade-in slide-in-from-top-2">
          {playbackWarning}
        </div>
      )}

      {/* Always-on-top Close Button */}
      <div 
        className={`absolute top-4 sm:top-6 right-4 sm:right-6 z-[200] transition-opacity duration-300 ${
          showCloseButton ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <button 
          onClick={handleClose}
          className="p-3 bg-black/60 hover:bg-black/80 active:scale-95 rounded-full text-white transition-all shadow-lg border border-white/10"
          aria-label="Close"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* MP4 Mode Header overlay */}
      {mode === 'mp4_play' && (
        <div className={`absolute inset-0 z-[101] pointer-events-none transition-opacity duration-500 ${showUI ? 'opacity-100' : 'opacity-0'}`}>
          <div className="absolute top-4 left-0 right-0 flex items-start justify-between px-4 pointer-events-none">
            <div className="flex flex-col gap-1 pointer-events-auto mt-2 ml-2">
              <h2 className="text-white font-bold drop-shadow-md text-lg">{request.showName}</h2>
              {!request.isMovie && (
                <p className="text-white/80 font-medium text-sm drop-shadow-md">Season {request.season}, Episode {request.number}: {request.episodeName}</p>
              )}
              {currentMp4Stream && (
                <div className="flex items-center gap-3 mt-2 pointer-events-auto flex-wrap">
                  {isIOS && (
                    <button
                      onClick={() => handleExternalPlay(currentMp4Stream)}
                      className="w-max px-4 py-2 bg-orange-500/80 hover:bg-orange-500 text-slate-900 dark:text-white rounded-full text-sm font-semibold transition-colors flex items-center gap-2 shadow-md"
                    >
                      <PlayCircle className="w-4 h-4" />
                      Open in VLC
                    </button>
                  )}
                  {mp4Candidates.length > 1 && (
                    <button
                      onClick={() => handleNextMp4Candidate(true)}
                      className="w-max px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-full text-sm font-semibold transition-colors flex items-center gap-2 backdrop-blur-md border border-white/5"
                    >
                      <RefreshCcw className="w-4 h-4" />
                      Next Source ({candidateIndex + 1}/{mp4Candidates.length})
                    </button>
                  )}
                  {mkvCandidates.length > 0 && (
                    <button
                      onClick={() => setMode('mkv_transition')}
                      className="w-max px-4 py-2 bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 hover:text-white rounded-full text-sm font-semibold transition-colors flex items-center gap-2 backdrop-blur-md border border-orange-500/30 shadow-lg"
                    >
                      <ExternalLink className="w-4 h-4" />
                      {fallbackGroupLabel} Sources ({mkvCandidates.length})
                    </button>
                  )}
                  <button
                    onClick={() => setShowSourceSelector(true)}
                    className="w-max px-4 py-2 bg-white/10 hover:bg-white/20 text-white/80 hover:text-white rounded-full text-sm font-semibold transition-colors flex items-center gap-2 backdrop-blur-md border border-white/10"
                  >
                    <List className="w-4 h-4" />
                    All Sources ({candidates.length})
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODE: Loading */}
      {mode === 'loading' && (
        <div className="absolute inset-0 z-[90] flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 bg-black/50 p-6 rounded-3xl backdrop-blur-sm border border-white/5">
            <div className="w-12 h-12 border-4 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
            <p className="text-white font-medium text-sm drop-shadow-md">{statusText}</p>
          </div>
        </div>
      )}

      {/* MODE: In-App MP4 Player */}
      {mode === 'mp4_play' && (
        <>
          {isLoading && !autoplayBlocked && (!videoRef.current || videoRef.current.paused || videoRef.current.currentTime === 0) && (
            <div className="absolute inset-0 z-[90] flex items-center justify-center pointer-events-none">
              <div className="flex flex-col items-center gap-4 bg-black/50 p-6 rounded-3xl backdrop-blur-sm">
                <div className="w-12 h-12 border-4 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
                <p className="text-white font-medium text-sm drop-shadow-md">{statusText}</p>
              </div>
            </div>
          )}

          {autoplayBlocked && (
            <div className="absolute inset-0 z-[90] flex items-center justify-center">
              <button 
                onClick={attemptPlayback}
                className="flex flex-col items-center gap-4 bg-black/80 hover:bg-black/90 p-8 rounded-3xl backdrop-blur-sm transition-all border border-orange-500/20"
              >
                <PlayCircle className="w-16 h-16 text-orange-500" />
                <div className="text-center">
                  <p className="text-white font-semibold text-lg drop-shadow-md">Tap to Play</p>
                  <p className="text-white/60 text-xs mt-1">Your browser requires a tap before video with sound can start.</p>
                </div>
              </button>
            </div>
          )}

          {currentMp4Stream && (
            <video
              key={`${currentMp4Stream}:${videoAttemptKey}`}
              ref={videoRef}
              src={usesHlsAdapter ? undefined : currentMp4Stream}
              controls
              playsInline
              preload={isIOS ? "metadata" : "auto"}
              onPause={() => setShowUI(true)}
              onPlay={() => {
                setIsLoading(false);
                setAutoplayBlocked(false);
              }}
              onPlaying={() => {
                setIsLoading(false);
                setAutoplayBlocked(false);
              }}
              onTimeUpdate={() => {
                if (videoRef.current && !videoRef.current.paused && videoRef.current.currentTime > 0) {
                  setIsLoading(false);
                  setAutoplayBlocked(false);
                }
              }}
              aria-hidden={!sourceValidated}
              className={`absolute inset-0 w-full h-full object-contain z-[80] transition-opacity duration-200 ${
                sourceValidated ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
              }`}
            >
              Your browser does not support the video tag.
            </video>
          )}

          {sourceValidated && activeSkipSegment && (
            <button
              type="button"
              onClick={() => {
                const video = videoRef.current;
                if (video) video.currentTime = Math.min(activeSkipSegment.endSeconds + 0.1, video.duration || activeSkipSegment.endSeconds + 0.1);
                setIgnoredSegmentTypes(previous => new Set(previous).add(activeSkipSegment.type));
              }}
              className="absolute bottom-20 left-5 sm:left-8 z-[160] flex items-center gap-2 rounded-xl border border-white/20 bg-black/80 px-5 py-3 text-sm font-extrabold text-white shadow-2xl backdrop-blur-md transition hover:bg-orange-500 hover:text-slate-950"
            >
              <SkipForward className="h-5 w-5" />
              Skip {activeSkipSegment.type === "recap" ? "recap" : "intro"}
            </button>
          )}

          {sourceValidated && nextRequest && (offerNextEpisode || creditsCountdown !== null) && (
            <div className="absolute bottom-20 right-5 sm:right-8 z-[160] w-[min(90vw,22rem)] overflow-hidden rounded-2xl border border-white/15 bg-black/85 p-4 text-white shadow-2xl backdrop-blur-xl">
              <div className="flex items-center gap-3">
                {(nextRequest.episodeImageUrl || nextRequest.backdropUrl || nextRequest.imageUrl) && (
                  <img
                    src={nextRequest.episodeImageUrl || nextRequest.backdropUrl || nextRequest.imageUrl}
                    alt=""
                    className="h-16 w-24 shrink-0 rounded-lg object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-orange-400">
                    {creditsCountdown !== null ? `Playing next in ${creditsCountdown}` : "Up next"}
                  </p>
                  <p className="mt-1 truncate text-sm font-bold">S{nextRequest.season} E{nextRequest.number} · {nextRequest.episodeName}</p>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => finishCurrentEpisode(true)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-orange-500 px-3 py-2.5 text-xs font-black text-slate-950 hover:bg-orange-400"
                >
                  <PlayCircle className="h-4 w-4" /> Play next
                </button>
                {creditsCountdown !== null && (
                  <button
                    type="button"
                    onClick={() => {
                      setCreditsAutoplayCancelled(true);
                      setCreditsCountdown(null);
                    }}
                    className="rounded-lg bg-white/10 px-3 py-2.5 text-xs font-bold text-white/80 hover:bg-white/20"
                  >
                    Keep watching
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* MODE: Sources that need an iOS fallback or a conversion-capable delivery path */}
      {mode === 'mkv_transition' && (
        <div className="relative z-[102] h-full overflow-y-auto px-4 py-8 sm:px-8 max-w-4xl mx-auto flex flex-col justify-between">
          <div className="space-y-6 my-auto pt-8">
            {/* Header info */}
            <div className="text-center space-y-2">
              <div className="inline-flex items-center justify-center w-14 h-14 bg-orange-500/10 text-orange-500 rounded-2xl border border-orange-500/20 mb-2">
                <Tv className="w-7 h-7" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white">{request.showName}</h2>
              {!request.isMovie && (
                <p className="text-orange-400 font-semibold text-sm">Season {request.season}, Episode {request.number}: {request.episodeName}</p>
              )}
              <p className="text-white/60 text-xs sm:text-sm max-w-lg mx-auto pt-1 leading-relaxed">
                {isIOS
                  ? "NextUp keeps iPhone and iPad playback on formats Safari can safely play inline. These remaining sources can be handed to VLC only if you want the fallback."
                  : "NextUp tried every source this desktop browser could play directly, including Matroska candidates. These remaining links need provider headers, a different codec, or a future conversion service. VLC is not required for normal desktop playback."
                }
              </p>
            </div>

            {/* Top Featured MKV Source */}
            {topMkv && (
              <div className="bg-gradient-to-br from-orange-500/15 via-slate-900 to-slate-900 border border-orange-500/40 rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="bg-orange-500 text-slate-950 font-black text-xs px-2.5 py-1 rounded-full uppercase tracking-wider">
                      Recommended
                    </span>
                    <span className="bg-emerald-500/20 text-emerald-300 font-bold text-xs px-2.5 py-1 rounded-full border border-emerald-500/30 flex items-center gap-1">
                      👤 {topMkv.seeders || 0} seeds
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-white/70 font-mono">
                    {topMkv.quality && <span className="bg-white/10 px-2 py-0.5 rounded">{topMkv.quality}</span>}
                    {topMkv.sizeBytes && <span>{formatBytes(topMkv.sizeBytes)}</span>}
                  </div>
                </div>

                <p className="text-white text-xs sm:text-sm font-mono break-all line-clamp-2 bg-black/40 p-3 rounded-lg border border-white/5">
                  {topMkv.title}
                </p>

                <div className="flex flex-col sm:flex-row gap-3 pt-1">
                  <button
                    onClick={() => handleExternalPlay(topMkv.url)}
                    className="flex-1 py-3.5 px-6 bg-orange-500 hover:bg-orange-600 active:scale-[0.99] text-slate-950 font-extrabold rounded-xl transition-all shadow-xl flex items-center justify-center gap-2 text-sm sm:text-base"
                  >
                    <PlayCircle className="w-5 h-5" />
                    {fallbackActionLabel} (Top Source)
                  </button>
                  <button
                    onClick={(e) => copyToClipboard(topMkv.url, e)}
                    className="py-3.5 px-5 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-xl transition-all border border-white/10 flex items-center justify-center gap-2 text-sm"
                  >
                    <Copy className="w-4 h-4" />
                    Copy Link
                  </button>
                </div>
              </div>
            )}

            {/* Sorted List of All MKV Sources */}
            {mkvCandidates.length > 0 && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between text-xs text-white/70 font-semibold px-1">
                  <span>{fallbackGroupLabel} Sources ({mkvCandidates.length})</span>
                </div>

                <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
                  {mkvCandidates.map((cand, idx) => (
                    <div 
                      key={cand.id || idx}
                      className="bg-slate-900/90 border border-white/10 hover:border-white/20 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all"
                    >
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <StreamBadges cand={cand} isExternal={true} />
                        <p className="text-white/90 text-xs font-mono truncate" title={cand.title}>
                          {cand.title}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <button
                          onClick={() => handleExternalPlay(cand.url)}
                          className="px-3.5 py-2 bg-orange-500/80 hover:bg-orange-500 text-slate-950 font-bold rounded-lg text-xs transition-all flex items-center gap-1.5 shadow"
                        >
                          <PlayCircle className="w-3.5 h-3.5" />
                          <span>{isIOS ? "VLC" : "Open"}</span>
                        </button>
                        <button
                          onClick={(e) => copyToClipboard(cand.url, e)}
                          className="p-2 bg-white/10 hover:bg-white/20 text-white/80 hover:text-white rounded-lg text-xs transition-colors"
                          title="Copy Link"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer controls */}
          <div className="pt-6 flex flex-col sm:flex-row items-center justify-center gap-3 border-t border-white/10 mt-6">
            {mp4Candidates.length > 0 && (
              <button
                onClick={() => {
                  retrySourceSearch("Requesting fresh browser sources...");
                }}
                className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-xl transition-all border border-white/10 flex items-center gap-2"
              >
                <RefreshCcw className="w-4 h-4 text-orange-400" />
                Retry NextUp Player ({mp4Candidates.length})
              </button>
            )}
            <button
              onClick={() => setShowSourceSelector(true)}
              className="px-5 py-2.5 bg-white/5 hover:bg-white/10 text-white/80 text-xs font-semibold rounded-xl transition-all border border-white/5 flex items-center gap-2"
            >
              <List className="w-4 h-4" />
              View All Sources List ({candidates.length})
            </button>
            <button
                onClick={handleClose}
              className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white/70 hover:text-white text-xs font-semibold rounded-xl transition-all"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* MODE: Error */}
      {mode === 'error' && (
        <div className="flex flex-col items-center justify-center h-full text-white gap-4 p-8 text-center max-w-md mx-auto relative z-[102]">
          <div className="w-16 h-16 bg-orange-500/15 text-orange-400 rounded-full flex items-center justify-center mb-2 border border-orange-500/25">
            <RefreshCcw className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold">Video couldn’t start</h2>
          <p className="text-gray-400 text-sm">
            {playbackError || "The video service did not return a usable source."}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 mt-4 items-center justify-center">
            {mkvCandidates.length > 0 && (
              <button
                onClick={() => setMode('mkv_transition')}
                className="px-6 py-3 bg-orange-500 hover:bg-orange-600 text-slate-950 font-extrabold rounded-xl transition-colors flex items-center justify-center gap-2 text-sm"
              >
                <ExternalLink className="w-4 h-4" />
                Browse {fallbackGroupLabel} Sources ({mkvCandidates.length})
              </button>
            )}
            <button
                onClick={() => retrySourceSearch()}
              className="px-6 py-3 bg-orange-500 hover:bg-orange-600 text-slate-950 rounded-xl font-bold transition-colors text-sm flex items-center justify-center gap-2"
            >
              <RefreshCcw className="w-4 h-4" />
              Try Again
            </button>
            <button
                onClick={handleClose}
              className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-semibold transition-colors text-sm"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Sliding Source Selector Overlay (Drawer) */}
      {showSourceSelector && (
        <div className="fixed inset-0 z-[220] bg-black/70 backdrop-blur-sm flex justify-end">
          <div className="absolute inset-0" onClick={() => setShowSourceSelector(false)} />
          
          <div className="relative w-full max-w-md md:max-w-lg bg-slate-950 border-l border-white/10 h-full flex flex-col shadow-2xl z-[230]">
            <div className="p-4 sm:p-6 border-b border-white/10 flex items-center justify-between">
              <div>
                <h3 className="text-white text-lg font-bold flex items-center gap-2">
                  <Database className="w-5 h-5 text-orange-500" />
                  All Available Stream Sources
                </h3>
                <p className="text-white/60 text-xs mt-1">
                  {mp4Candidates.length} play in NextUp • {mkvCandidates.length} {fallbackGroupLabel.toLowerCase()}
                </p>
              </div>
              <button 
                onClick={() => setShowSourceSelector(false)}
                className="p-2 hover:bg-white/10 rounded-full text-white/70 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
              {/* In-App Browser Playable Streams Section */}
              {mp4Candidates.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-green-400">
                    <span className="flex items-center gap-1.5">
                      <Film className="w-4 h-4" />
                      In-App Streams ({mp4Candidates.length})
                    </span>
                    <span className="text-[10px] bg-green-500/10 px-2 py-0.5 rounded border border-green-500/20">Adaptive browser playback</span>
                  </div>

                  <div className="space-y-2">
                    {mp4Candidates.map((cand, idx) => {
                      const isActive = mode === 'mp4_play' && idx === candidateIndex;
                      return (
                        <div
                          key={cand.id || `mp4-${idx}`}
                          className={`w-full text-left p-3.5 rounded-xl transition-all border flex flex-col gap-2 ${
                            isActive 
                              ? 'bg-orange-500/15 border-orange-500/60' 
                              : 'bg-white/5 border-white/5 hover:bg-white/10'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 w-full">
                            <div className="flex items-center gap-2 flex-wrap cursor-pointer flex-1" onClick={() => chooseInAppCandidate(idx)}>
                              <StreamBadges cand={cand} isExternal={false} />
                            </div>
                            
                            <div className="flex items-center gap-1 pl-2">
                              {isActive ? (
                                <div className="flex items-center gap-1 text-orange-400 text-xs font-semibold mr-2">
                                  <Check className="w-4 h-4" />
                                  <span>Playing</span>
                                </div>
                              ) : (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    chooseInAppCandidate(idx);
                                  }}
                                  className="px-2.5 py-1 bg-orange-500/80 hover:bg-orange-500 text-slate-950 font-bold rounded text-[11px] transition-colors flex items-center gap-1"
                                >
                                  <PlayCircle className="w-3 h-3" />
                                  Play
                                </button>
                              )}
                              <button
                                onClick={(e) => copyToClipboard(cand.url, e)}
                                className="p-1.5 bg-white/10 hover:bg-white/20 text-white/80 hover:text-white rounded transition-colors"
                                title="Copy Link"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                          
                          <p className="text-white/90 text-xs font-mono leading-relaxed break-all line-clamp-2 cursor-pointer" onClick={() => chooseInAppCandidate(idx)}>
                            {cand.title}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Sources that cannot be mounted directly in this environment */}
              {mkvCandidates.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-amber-400">
                    <span className="flex items-center gap-1.5">
                      <Tv className="w-4 h-4" />
                      {fallbackGroupLabel} Sources ({mkvCandidates.length})
                    </span>
                    <span className="text-[10px] bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">Ranked</span>
                  </div>

                  <div className="space-y-2">
                    {mkvCandidates.map((cand, idx) => (
                      <div
                        key={cand.id || `mkv-${idx}`}
                        className="w-full text-left p-3.5 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 transition-all flex flex-col gap-2"
                      >
                        <div className="flex items-center justify-between gap-2 w-full">
                          <div className="flex items-center gap-2 flex-wrap">
                            <StreamBadges cand={cand} isExternal={true} />
                          </div>
                          
                          <div className="flex items-center gap-1 pl-2">
                            <button
                              onClick={() => handleExternalPlay(cand.url)}
                              className="px-2.5 py-1 bg-orange-500/80 hover:bg-orange-500 text-slate-950 font-bold rounded text-[11px] transition-colors flex items-center gap-1"
                            >
                              <PlayCircle className="w-3 h-3" />
                              {isIOS ? "VLC" : "Open"}
                            </button>
                            <button
                              onClick={(e) => copyToClipboard(cand.url, e)}
                              className="p-1.5 bg-white/10 hover:bg-white/20 text-white/80 hover:text-white rounded transition-colors"
                              title="Copy Link"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                        
                        <p className="text-white/90 text-xs font-mono leading-relaxed break-all line-clamp-2">
                          {cand.title}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  ), portalTarget);
}
