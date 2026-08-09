import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";

type PosterQuality = "shelf" | "inspect";

interface TextureEntry {
  texture: THREE.Texture;
  refs: number;
  loaded: boolean;
  queued: boolean;
  abortController?: AbortController;
  disposeTimer?: ReturnType<typeof setTimeout>;
  listeners: Set<(texture: THREE.Texture) => void>;
}

interface UploadTask {
  url: string;
  createTexture: () => THREE.Texture;
  discard: () => void;
}

const MAX_SIMULTANEOUS_DOWNLOADS = 4;
const textureCache = new Map<string, TextureEntry>();
const downloadQueue: string[] = [];
const uploadQueue: UploadTask[] = [];
const fallbackLoader = new THREE.TextureLoader();
fallbackLoader.setCrossOrigin("anonymous");
let activeDownloads = 0;
let uploadFrame = 0;

function createPlaceholderTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 192;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#e5dfd0";
  context.fillRect(0, 0, 128, 192);
  context.fillStyle = "#d5cdbd";
  context.fillRect(8, 8, 112, 176);
  context.strokeStyle = "#b8ad99";
  context.lineWidth = 2;
  context.strokeRect(9, 9, 110, 174);
  context.fillStyle = "#173d82";
  context.fillRect(18, 27, 92, 25);
  context.fillStyle = "#f4d459";
  context.font = "bold 13px Arial";
  context.textAlign = "center";
  context.fillText("NEXTUP VIDEO", 64, 44);
  context.fillStyle = "#817765";
  context.font = "10px monospace";
  context.fillText("RENTAL COPY", 64, 105);
  context.strokeStyle = "rgba(90,78,58,.18)";
  context.beginPath();
  context.moveTo(19, 158);
  context.lineTo(107, 146);
  context.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.userData.nextupPosterPlaceholder = true;
  return texture;
}

const placeholderTexture = createPlaceholderTexture();

export function posterUrlForQuality(url: string, quality: PosterQuality) {
  if (!url) return "";
  const target = quality === "inspect" ? "w500" : "w185";
  return url.replace(/\/t\/p\/(?:w\d+|original)\//, `/t/p/${target}/`);
}

function configurePosterTexture(texture: THREE.Texture) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.userData.nextupPosterReady = true;
  texture.needsUpdate = true;
  return texture;
}

function closeTextureImage(texture: THREE.Texture) {
  const image = texture.image as ImageBitmap | undefined;
  if (image && typeof image.close === "function") image.close();
}

function scheduleUpload(task: UploadTask) {
  uploadQueue.push(task);
  if (uploadFrame) return;

  const uploadOneTexture = () => {
    uploadFrame = 0;
    const next = uploadQueue.shift();
    if (!next) return;

    const entry = textureCache.get(next.url);
    if (!entry || entry.refs === 0) {
      if (entry) {
        entry.queued = false;
        entry.abortController = undefined;
      }
      next.discard();
    } else {
      const texture = configurePosterTexture(next.createTexture());
      entry.texture = texture;
      entry.loaded = true;
      entry.queued = false;
      entry.abortController = undefined;
      entry.listeners.forEach((notify) => notify(texture));
    }

    if (uploadQueue.length) uploadFrame = window.requestAnimationFrame(uploadOneTexture);
  };

  uploadFrame = window.requestAnimationFrame(uploadOneTexture);
}

function queueFallbackImage(url: string) {
  fallbackLoader.load(
    url,
    (texture) => scheduleUpload({
      url,
      createTexture: () => texture,
      discard: () => texture.dispose(),
    }),
    undefined,
    () => {
      const entry = textureCache.get(url);
      if (!entry) return;
      entry.queued = false;
      entry.abortController = undefined;
      entry.listeners.forEach((notify) => notify(placeholderTexture));
    },
  );
}

async function downloadPoster(url: string) {
  const entry = textureCache.get(url);
  if (!entry || entry.refs === 0) return;

  if (typeof window.createImageBitmap !== "function") {
    queueFallbackImage(url);
    return;
  }

  const controller = new AbortController();
  entry.abortController = controller;
  try {
    const response = await fetch(url, {
      mode: "cors",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Poster request failed (${response.status})`);
    const blob = await response.blob();
    const bitmap = await window.createImageBitmap(blob, { imageOrientation: "flipY" });
    scheduleUpload({
      url,
      createTexture: () => new THREE.Texture(bitmap),
      discard: () => bitmap.close(),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      const abortedEntry = textureCache.get(url);
      if (abortedEntry) {
        abortedEntry.queued = false;
        abortedEntry.abortController = undefined;
      }
      return;
    }
    const liveEntry = textureCache.get(url);
    if (!liveEntry) return;
    liveEntry.queued = false;
    liveEntry.abortController = undefined;
    liveEntry.listeners.forEach((notify) => notify(placeholderTexture));
  }
}

function pumpDownloadQueue() {
  while (activeDownloads < MAX_SIMULTANEOUS_DOWNLOADS && downloadQueue.length) {
    const url = downloadQueue.shift()!;
    const entry = textureCache.get(url);
    if (!entry || entry.refs === 0 || entry.loaded) {
      if (entry) entry.queued = false;
      continue;
    }
    activeDownloads += 1;
    void downloadPoster(url).finally(() => {
      activeDownloads = Math.max(0, activeDownloads - 1);
      pumpDownloadQueue();
    });
  }
}

function enqueueDownload(url: string, entry: TextureEntry) {
  if (entry.queued || entry.loaded) return;
  entry.queued = true;
  downloadQueue.push(url);
  pumpDownloadQueue();
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
      queued: false,
      listeners: new Set(),
    };
    textureCache.set(url, entry);
  }

  if (entry.disposeTimer) clearTimeout(entry.disposeTimer);
  entry.refs += 1;
  entry.listeners.add(listener);
  listener(entry.texture);
  enqueueDownload(url, entry);

  return () => {
    const liveEntry = textureCache.get(url);
    if (!liveEntry) return;
    liveEntry.listeners.delete(listener);
    liveEntry.refs = Math.max(0, liveEntry.refs - 1);
    if (liveEntry.refs === 0) {
      liveEntry.abortController?.abort();
      liveEntry.abortController = undefined;
      liveEntry.disposeTimer = setTimeout(() => {
        const disposable = textureCache.get(url);
        if (!disposable || disposable.refs > 0) return;
        if (disposable.loaded && disposable.texture !== placeholderTexture) {
          closeTextureImage(disposable.texture);
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
    pendingDownloads: downloadQueue.length,
    pendingUploads: uploadQueue.length,
    activeDownloads,
  };
}
