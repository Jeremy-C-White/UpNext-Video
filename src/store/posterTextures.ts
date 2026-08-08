import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";

type PosterQuality = "shelf" | "inspect";

interface TextureEntry {
  texture: THREE.Texture;
  refs: number;
  loaded: boolean;
  disposeTimer?: ReturnType<typeof setTimeout>;
  listeners: Set<(texture: THREE.Texture) => void>;
}

const textureCache = new Map<string, TextureEntry>();
const loader = new THREE.TextureLoader();
loader.setCrossOrigin("anonymous");

function createPlaceholderTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 96;
  const context = canvas.getContext("2d")!;
  const gradient = context.createLinearGradient(0, 0, 64, 96);
  gradient.addColorStop(0, "#183b8c");
  gradient.addColorStop(1, "#07142e");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 96);
  context.strokeStyle = "#f6cf47";
  context.lineWidth = 3;
  context.strokeRect(5, 5, 54, 86);
  context.fillStyle = "#ffffff";
  context.font = "bold 9px Arial";
  context.textAlign = "center";
  context.fillText("NEXTUP", 32, 45);
  context.fillStyle = "#f6cf47";
  context.fillText("VIDEO", 32, 58);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const placeholderTexture = createPlaceholderTexture();

export function posterUrlForQuality(url: string, quality: PosterQuality) {
  if (!url) return "";
  const target = quality === "inspect" ? "w500" : "w185";
  return url.replace(/\/t\/p\/(?:w\d+|original)\//, `/t/p/${target}/`);
}

function acquireTexture(url: string, listener: (texture: THREE.Texture) => void) {
  if (!url) {
    listener(placeholderTexture);
    return () => undefined;
  }

  let entry = textureCache.get(url);
  if (!entry) {
    entry = {
      texture: placeholderTexture,
      refs: 0,
      loaded: false,
      listeners: new Set(),
    };
    textureCache.set(url, entry);
    loader.load(
      url,
      (texture) => {
        const liveEntry = textureCache.get(url);
        if (!liveEntry) {
          texture.dispose();
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 4;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        liveEntry.texture = texture;
        liveEntry.loaded = true;
        liveEntry.listeners.forEach((notify) => notify(texture));
      },
      undefined,
      () => {
        const liveEntry = textureCache.get(url);
        liveEntry?.listeners.forEach((notify) => notify(placeholderTexture));
      },
    );
  }

  if (entry.disposeTimer) clearTimeout(entry.disposeTimer);
  entry.refs += 1;
  entry.listeners.add(listener);
  listener(entry.texture);

  return () => {
    const liveEntry = textureCache.get(url);
    if (!liveEntry) return;
    liveEntry.listeners.delete(listener);
    liveEntry.refs = Math.max(0, liveEntry.refs - 1);
    if (liveEntry.refs === 0) {
      liveEntry.disposeTimer = setTimeout(() => {
        const disposable = textureCache.get(url);
        if (!disposable || disposable.refs > 0) return;
        if (disposable.loaded && disposable.texture !== placeholderTexture) {
          disposable.texture.dispose();
        }
        textureCache.delete(url);
      }, 8_000);
    }
  };
}

export function usePosterTexture(rawUrl: string, quality: PosterQuality = "shelf") {
  const url = useMemo(() => posterUrlForQuality(rawUrl, quality), [rawUrl, quality]);
  const [texture, setTexture] = useState<THREE.Texture>(placeholderTexture);

  useEffect(() => acquireTexture(url, setTexture), [url]);
  return texture;
}

export function getPosterTextureStats() {
  return {
    entries: textureCache.size,
    references: Array.from(textureCache.values()).reduce((sum, entry) => sum + entry.refs, 0),
  };
}

