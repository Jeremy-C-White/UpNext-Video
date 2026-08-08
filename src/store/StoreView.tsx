import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { DoorOpen } from "lucide-react";
import type { Show, UserEpisode, UserShow } from "../types";
import { getStoreCatalogTMDB } from "../lib/tmdb";
import { buildStoreCatalog } from "./catalog";
import { PLAYER_SPAWN } from "./layout";
import { StoreAudioBus } from "./StoreAudio";
import { StoreHUD } from "./StoreHUD";
import { StoreScene } from "./StoreScene";
import type { PlayerPose, StoreMedia } from "./types";
import "./store.css";

interface Props {
  library: UserShow[];
  episodesMap: Record<string, UserEpisode[]>;
  discovery: Show[];
  staffPicks: Show[];
  userName?: string;
  paused: boolean;
  addingShowId: number | null;
  onExit: () => void;
  onWatch: (item: StoreMedia) => void;
  onDetails: (item: StoreMedia) => void;
  onAdd: (item: StoreMedia) => void;
}

class StoreCanvasBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("NEXTUP VIDEO renderer failed", error, info);
    this.props.onError();
  }
  render() { return this.state.failed ? null : this.props.children; }
}

function supportsDesktopStore() {
  if (typeof window === "undefined") return true;
  const canvas = document.createElement("canvas");
  const webgl2 = Boolean(canvas.getContext("webgl2"));
  const desktopViewport = window.innerWidth >= 960;
  return webgl2 && desktopViewport;
}

export default function StoreView({
  library,
  episodesMap,
  discovery,
  staffPicks,
  userName,
  paused,
  addingShowId,
  onExit,
  onWatch,
  onDetails,
  onAdd,
}: Props) {
  const [supplemental, setSupplemental] = useState<Show[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [entered, setEntered] = useState(false);
  const [locked, setLocked] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [finderOpen, setFinderOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [guideId, setGuideId] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [rendererFailed, setRendererFailed] = useState(false);
  const [unsupported] = useState(() => !supportsDesktopStore());
  const [canvasElement, setCanvasElement] = useState<HTMLCanvasElement | null>(null);
  const [playerPose, setPlayerPose] = useState<PlayerPose>({ x: PLAYER_SPAWN[0], y: PLAYER_SPAWN[1], z: PLAYER_SPAWN[2], yaw: 0 });
  const audio = useRef<StoreAudioBus | null>(null);

  useEffect(() => {
    let active = true;
    getStoreCatalogTMDB()
      .then((shows) => { if (active) setSupplemental(shows); })
      .catch((error) => console.warn("Store catalog expansion unavailable; using current NextUp data.", error))
      .finally(() => { if (active) setCatalogLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const bus = new StoreAudioBus();
    audio.current = bus;
    return () => {
      bus.stop();
      audio.current = null;
      if (document.pointerLockElement) document.exitPointerLock();
    };
  }, []);

  useEffect(() => { audio.current?.setMuted(muted); }, [muted]);
  useEffect(() => { audio.current?.setPaused(paused || !entered); }, [entered, paused]);

  useEffect(() => {
    if (!canvasElement) return;
    const handleLost = (event: Event) => {
      event.preventDefault();
      setRendererFailed(true);
    };
    canvasElement.addEventListener("webglcontextlost", handleLost);
    return () => canvasElement.removeEventListener("webglcontextlost", handleLost);
  }, [canvasElement]);

  const items = useMemo(() => buildStoreCatalog({
    library,
    episodesMap,
    discovery,
    staffPicks,
    supplemental,
    userName,
  }), [discovery, episodesMap, library, staffPicks, supplemental, userName]);
  const hovered = items.find((item) => item.id === hoveredId) || null;
  const selected = items.find((item) => item.id === selectedId) || null;
  const guide = items.find((item) => item.id === guideId) || null;

  const requestPointerLock = useCallback(() => {
    if (paused || !canvasElement) return;
    void canvasElement.requestPointerLock();
  }, [canvasElement, paused]);

  const startStore = useCallback(() => {
    setEntered(true);
    void audio.current?.start();
    requestPointerLock();
  }, [requestPointerLock]);

  const selectCase = useCallback((id: string) => {
    setSelectedId(id);
    setFlipped(false);
    audio.current?.playCasePickup();
    if (document.pointerLockElement) document.exitPointerLock();
  }, []);

  const returnCase = useCallback(() => {
    setSelectedId(null);
    setFlipped(false);
  }, []);

  const openFinder = useCallback(() => {
    if (document.pointerLockElement) document.exitPointerLock();
    setFinderOpen(true);
    setMapOpen(false);
  }, []);

  const openMap = useCallback(() => {
    if (document.pointerLockElement) document.exitPointerLock();
    setMapOpen(true);
    setFinderOpen(false);
  }, []);

  const guideTo = useCallback((item: StoreMedia) => {
    setGuideId(item.id);
    setFinderOpen(false);
    audio.current?.playNavigationPing();
    requestPointerLock();
  }, [requestPointerLock]);

  const exitStore = useCallback(() => {
    if (document.pointerLockElement) document.exitPointerLock();
    onExit();
  }, [onExit]);

  if (unsupported) {
    return (
      <div className="store-shell store-unsupported">
        <div><span className="store-directory-kicker">DESKTOP EXPERIENCE</span><h1>NEXTUP VIDEO needs a larger WebGL 2 browser.</h1><p>Open this mode in a current desktop version of Chrome, Edge, Firefox, or Safari. Your classic NextUp experience is still available.</p><button onClick={onExit}>Return to classic NextUp</button></div>
      </div>
    );
  }

  return (
    <div className="store-shell">
      <StoreCanvasBoundary onError={() => setRendererFailed(true)}>
        <Suspense fallback={<div className="store-render-loading">Preparing the showroom…</div>}>
          <Canvas
            shadows
            dpr={[1, 1.7]}
            frameloop={paused ? "never" : "always"}
            camera={{ fov: 66, near: 0.06, far: 78, position: PLAYER_SPAWN }}
            gl={{ antialias: true, alpha: false, powerPreference: "high-performance", stencil: false }}
            onCreated={({ gl }) => {
              gl.outputColorSpace = THREE.SRGBColorSpace;
              gl.toneMapping = THREE.ACESFilmicToneMapping;
              gl.toneMappingExposure = 1.08;
              gl.shadowMap.type = THREE.PCFSoftShadowMap;
              setCanvasElement(gl.domElement);
            }}
          >
            <StoreScene
              entered={entered}
              items={items}
              hoveredId={hoveredId}
              selected={selected}
              flipped={flipped}
              paused={paused || finderOpen || mapOpen || !entered}
              playerPose={playerPose}
              guideTarget={guide ? guide.placement.position : null}
              onHover={setHoveredId}
              onSelect={selectCase}
              onReturnCase={returnCase}
              onOpenFinder={openFinder}
              onToggleMap={openMap}
              onLockChange={setLocked}
              onPoseChange={setPlayerPose}
            />
          </Canvas>
        </Suspense>
      </StoreCanvasBoundary>

      {!entered && !rendererFailed && (
        <div className="store-entry-screen">
          <div className="store-entry-glow" />
          <div className="store-entry-copy">
            <span className="store-entry-eyebrow">WELCOME TO</span>
            <h1><b>NEXTUP</b><em>VIDEO</em></h1>
            <p>A walkable video store stocked from your real NextUp catalog.</p>
            <div className="store-stocking-status">
              <i className={catalogLoading ? "is-loading" : "is-ready"} />
              <div><strong>{catalogLoading ? "Preparing the store…" : `${items.length} titles stocked`}</strong><span>{catalogLoading ? "Organizing Horror · Loading Staff Picks · Rewinding tapes…" : "The doors are open. Headphones recommended."}</span></div>
            </div>
            <button onClick={startStore} disabled={catalogLoading || !canvasElement}><DoorOpen /> Enter NextUp Video</button>
            <small>Desktop controls: WASD + mouse · Esc returns your cursor</small>
          </div>
        </div>
      )}

      {rendererFailed ? (
        <div className="store-render-failed"><span className="store-directory-kicker">THE LIGHTS FLICKERED</span><h2>The 3D renderer stopped.</h2><p>Your NextUp data and playback are safe. You can retry the store or return to the classic interface.</p><button onClick={() => window.location.reload()}>Reload NextUp</button><button onClick={exitStore}>Classic NextUp</button></div>
      ) : entered ? (
        <StoreHUD
          items={items}
          hovered={hovered}
          selected={selected}
          flipped={flipped}
          entered={entered}
          locked={locked}
          finderOpen={finderOpen}
          mapOpen={mapOpen}
          muted={muted}
          adding={addingShowId === selected?.source.id}
          playerPose={playerPose}
          guide={guide}
          onExit={exitStore}
          onResume={requestPointerLock}
          onOpenFinder={openFinder}
          onCloseFinder={() => setFinderOpen(false)}
          onOpenMap={openMap}
          onCloseMap={() => setMapOpen(false)}
          onGuide={guideTo}
          onClearGuide={() => setGuideId(null)}
          onToggleMuted={() => setMuted((value) => !value)}
          onFlip={() => setFlipped((value) => !value)}
          onReturn={returnCase}
          onWatch={onWatch}
          onDetails={onDetails}
          onAdd={onAdd}
        />
      ) : null}
    </div>
  );
}

export type { StoreMedia } from "./types";
