import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  DoorOpen,
  Info,
  Map as MapIcon,
  Navigation,
  Play,
  Plus,
  RotateCcw,
  Search,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { STORE_SECTIONS } from "./layout";
import type { PlayerPose, StoreMedia } from "./types";

function StoreFinder({
  items,
  onClose,
  onGuide,
}: {
  items: StoreMedia[];
  onClose: () => void;
  onGuide: (item: StoreMedia) => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);
  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const unique = items.filter((item, index, all) => all.findIndex((candidate) => candidate.mediaKey === item.mediaKey) === index);
    if (!normalized) return unique.slice(0, 8);
    return unique
      .filter((item) => `${item.name} ${item.genres.join(" ")} ${item.department}`.toLowerCase().includes(normalized))
      .slice(0, 8);
  }, [items, query]);

  return (
    <div className="store-modal-backdrop" role="dialog" aria-modal="true" aria-label="NextUp Video Finder">
      <div className="store-directory-card">
        <button className="store-icon-button store-directory-close" onClick={onClose} aria-label="Close finder"><X /></button>
        <div className="store-directory-kicker">AISLE DIRECTORY · TERMINAL 01</div>
        <h2>NEXTUP VIDEO FINDER</h2>
        <p>Tell us what you’re looking for. We’ll light the way.</p>
        <label className="store-search-field">
          <Search aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search movies, shows, or genres…"
          />
        </label>
        <div className="store-directory-results">
          {results.length ? results.map((item) => (
            <article key={item.id} className="store-directory-result">
              <div className="store-directory-poster">
                {item.posterUrl ? <img src={item.posterUrl} alt="" referrerPolicy="no-referrer" /> : <span>{item.name.slice(0, 1)}</span>}
              </div>
              <div className="store-directory-copy">
                <strong>{item.name}</strong>
                <span>{item.department}</span>
                <small>{item.placement.aisle} · {item.placement.shelf}</small>
              </div>
              <button className="store-show-me" onClick={() => onGuide(item)}>
                <Navigation /> Show me
              </button>
            </article>
          )) : (
            <div className="store-directory-empty">No title in today’s store matches that search.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function StoreMap({ pose, onClose }: { pose: PlayerPose; onClose: () => void }) {
  const playerLeft = ((pose.x + 18) / 36) * 100;
  const playerTop = ((pose.z + 24) / 48) * 100;
  return (
    <div className="store-modal-backdrop" role="dialog" aria-modal="true" aria-label="Store map">
      <div className="store-map-card">
        <button className="store-icon-button store-directory-close" onClick={onClose} aria-label="Close map"><X /></button>
        <div className="store-directory-kicker">YOU ARE HERE</div>
        <h2>STORE DIRECTORY</h2>
        <div className="store-map-floor">
          <span className="map-label map-new">NEW RELEASES</span>
          <span className="map-label map-action">ACTION</span>
          <span className="map-label map-comedy">COMEDY / HORROR</span>
          <span className="map-label map-scifi">SCI-FI / TV</span>
          <span className="map-label map-staff">STAFF PICKS</span>
          <span className="map-label map-snacks">SNACKS</span>
          <span className="map-label map-checkout">CHECKOUT</span>
          <span className="map-entrance">ENTRANCE</span>
          <span className="map-player" style={{ left: `${playerLeft}%`, top: `${playerTop}%` }}><i /></span>
        </div>
        <p className="store-map-help">Press M anytime to open this map. Press F to find a title and create a floor route.</p>
      </div>
    </div>
  );
}

function InspectPanel({
  item,
  flipped,
  adding,
  onFlip,
  onReturn,
  onWatch,
  onDetails,
  onAdd,
}: {
  item: StoreMedia;
  flipped: boolean;
  adding: boolean;
  onFlip: () => void;
  onReturn: () => void;
  onWatch: () => void;
  onDetails: () => void;
  onAdd: () => void;
}) {
  const watchLabel = item.nextEpisode
    ? `Continue S${item.nextEpisode.season} E${item.nextEpisode.number}`
    : item.isMovie
      ? "Watch movie"
      : "Start series";
  return (
    <aside className="store-inspect-panel">
      <div className="store-inspect-topline">
        <span>{item.department}</span>
        <button className="store-icon-button" onClick={onReturn} aria-label="Return case"><X /></button>
      </div>
      <h2>{item.name}</h2>
      <div className="store-metadata-line">
        {item.year && <span>{item.year}</span>}
        {item.runtime && <span>{item.runtime} min</span>}
        {item.rating && <span>★ {item.rating.toFixed(1)}</span>}
        <span>{item.isMovie ? "DVD" : "Box set"}</span>
      </div>
      {item.personalizedReason && <div className="store-staff-note">“{item.personalizedReason}”</div>}
      <p>{item.summary}</p>
      <div className="store-genre-line">{item.genres.slice(0, 4).join(" · ") || item.department}</div>
      {item.libraryShow && (
        <div className="store-progress-card">
          <div><span>{item.nextEpisode ? "Continue watching" : item.watched ? "Watched" : "In your library"}</span><strong>{item.progress}%</strong></div>
          <div className="store-progress-track"><i style={{ width: `${item.progress}%` }} /></div>
          {item.nextEpisode && <small>S{item.nextEpisode.season} E{item.nextEpisode.number} · {item.nextEpisode.name}</small>}
        </div>
      )}
      <div className="store-inspect-actions">
        <button className="store-primary-action" onClick={onWatch}><Play /> {watchLabel}</button>
        <button onClick={onDetails}><Info /> Full details</button>
        {!item.libraryShow ? (
          <button onClick={onAdd} disabled={adding}><Plus /> {adding ? "Adding…" : "Add to library"}</button>
        ) : (
          <button disabled><Check /> In your library</button>
        )}
      </div>
      <button className="store-flip-button" onClick={onFlip}><RotateCcw /> {flipped ? "Show front cover" : "Flip to back cover"}</button>
      <div className="store-inspect-hint">Right click or Esc to return the case</div>
    </aside>
  );
}

interface Props {
  items: StoreMedia[];
  hovered: StoreMedia | null;
  selected: StoreMedia | null;
  flipped: boolean;
  entered: boolean;
  locked: boolean;
  finderOpen: boolean;
  mapOpen: boolean;
  muted: boolean;
  adding: boolean;
  playerPose: PlayerPose;
  guide: StoreMedia | null;
  onExit: () => void;
  onResume: () => void;
  onOpenFinder: () => void;
  onCloseFinder: () => void;
  onOpenMap: () => void;
  onCloseMap: () => void;
  onGuide: (item: StoreMedia) => void;
  onClearGuide: () => void;
  onToggleMuted: () => void;
  onFlip: () => void;
  onReturn: () => void;
  onWatch: (item: StoreMedia) => void;
  onDetails: (item: StoreMedia) => void;
  onAdd: (item: StoreMedia) => void;
}

export function StoreHUD(props: Props) {
  const paused = props.entered && !props.locked && !props.selected && !props.finderOpen && !props.mapOpen;
  return (
    <div className="store-hud" aria-live="polite">
      <header className="store-hud-header">
        <div className="store-logo-lockup"><b>NEXTUP</b><span>VIDEO</span><small>Open late · Be kind</small></div>
        <div className="store-header-actions">
          <button onClick={props.onOpenFinder}><Search /> Finder <kbd>F</kbd></button>
          <button onClick={props.onOpenMap}><MapIcon /> Map <kbd>M</kbd></button>
          <button className="store-icon-button" onClick={props.onToggleMuted} aria-label={props.muted ? "Unmute store audio" : "Mute store audio"}>
            {props.muted ? <VolumeX /> : <Volume2 />}
          </button>
          <button className="store-exit-button" onClick={props.onExit}><DoorOpen /> Classic NextUp</button>
        </div>
      </header>

      {props.entered && !props.selected && !props.finderOpen && !props.mapOpen && <div className="store-crosshair"><i /><i /></div>}
      {props.hovered && props.locked && !props.selected && (
        <div className="store-pickup-prompt"><strong>{props.hovered.name}</strong><span><kbd>E</kbd> Pick up case</span></div>
      )}
      {props.guide && !props.finderOpen && (
        <div className="store-guide-chip"><Navigation /><div><strong>Follow the glowing route</strong><span>{props.guide.name} · {props.guide.placement.aisle}</span></div><button onClick={props.onClearGuide}>Clear</button></div>
      )}
      {props.entered && props.locked && !props.selected && (
        <div className="store-controls-strip"><span><kbd>WASD</kbd> Move</span><span><kbd>Mouse</kbd> Look</span><span><kbd>Shift</kbd> Faster</span><span><kbd>Esc</kbd> Pause</span></div>
      )}

      {paused && (
        <div className="store-pause-card">
          <div className="store-directory-kicker">STORE PAUSED</div>
          <h2>Take your time.</h2>
          <p>Your place in the aisle is saved.</p>
          <button className="store-primary-action" onClick={props.onResume}>Resume browsing</button>
          <button onClick={props.onExit}>Exit to classic NextUp</button>
          <small>This product uses the TMDB API but is not endorsed or certified by TMDB.</small>
        </div>
      )}
      {props.selected && (
        <InspectPanel
          item={props.selected}
          flipped={props.flipped}
          adding={props.adding}
          onFlip={props.onFlip}
          onReturn={props.onReturn}
          onWatch={() => props.onWatch(props.selected!)}
          onDetails={() => props.onDetails(props.selected!)}
          onAdd={() => props.onAdd(props.selected!)}
        />
      )}
      {props.finderOpen && <StoreFinder items={props.items} onClose={props.onCloseFinder} onGuide={props.onGuide} />}
      {props.mapOpen && <StoreMap pose={props.playerPose} onClose={props.onCloseMap} />}
    </div>
  );
}

