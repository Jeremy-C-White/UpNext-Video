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
let preferredAnisotropy = 4;
let lastTextureError = "";
const managedTextureArrays = new Set<THREE.DataArrayTexture>();

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
  texture.anisotropy = preferredAnisotropy;
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
      createTexture: () => {
        const texture = new THREE.Texture(bitmap);
        texture.userData.nextupImagePreflipped = true;
        return texture;
      },
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
    lastTextureError = error instanceof Error ? error.message : String(error);
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

export function setPosterTextureAnisotropy(value: number) {
  preferredAnisotropy = Math.max(1, Math.floor(value));
  placeholderTexture.anisotropy = preferredAnisotropy;
  for (const entry of textureCache.values()) {
    entry.texture.anisotropy = preferredAnisotropy;
  }
  for (const texture of managedTextureArrays) texture.anisotropy = preferredAnisotropy;
}

export function usePosterTextureArray(rawUrls: string[]) {
  const urls = useMemo(() => rawUrls.map((url) => posterUrlForQuality(url, "shelf")), [rawUrls]);
  const resource = useMemo(() => {
    const width = 128;
    const height = 192;
    const depth = Math.max(1, urls.length);
    const layerSize = width * height * 4;
    const data = new Uint8Array(layerSize * depth);
    for (let layer = 0; layer < depth; layer += 1) {
      const offset = layer * layerSize;
      for (let pixel = 0; pixel < width * height; pixel += 1) {
        const x = pixel % width;
        const y = Math.floor(pixel / width);
        const border = x < 7 || x >= width - 7 || y < 7 || y >= height - 7;
        data[offset + pixel * 4] = border ? 213 : 229;
        data[offset + pixel * 4 + 1] = border ? 205 : 223;
        data[offset + pixel * 4 + 2] = border ? 189 : 208;
        data[offset + pixel * 4 + 3] = 255;
      }
    }
    const texture = new THREE.DataArrayTexture(data, width, height, depth);
    texture.colorSpace = THREE.NoColorSpace;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.anisotropy = preferredAnisotropy;
    texture.needsUpdate = true;
    managedTextureArrays.add(texture);
    return { texture, data, width, height, layerSize };
  }, [urls]);

  useEffect(() => {
    const scratch = document.createElement("canvas");
    scratch.width = resource.width;
    scratch.height = resource.height;
    const context = scratch.getContext("2d", { willReadFrequently: true })!;
    const releases = urls.map((url, layer) => acquireTexture(url, (sourceTexture) => {
      if (sourceTexture.userData.nextupPosterPlaceholder || !sourceTexture.image) return;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, resource.width, resource.height);
      if (!sourceTexture.userData.nextupImagePreflipped) {
        context.translate(0, resource.height);
        context.scale(1, -1);
      }
      context.drawImage(sourceTexture.image as CanvasImageSource, 0, 0, resource.width, resource.height);
      context.setTransform(1, 0, 0, 1, 0, 0);
      const pixels = context.getImageData(0, 0, resource.width, resource.height);
      for (let index = 0; index < pixels.data.length; index += 4) {
        const red = pixels.data[index];
        const green = pixels.data[index + 1];
        const blue = pixels.data[index + 2];
        const gray = red * 0.2126 + green * 0.7152 + blue * 0.0722;
        const grain = (((index / 4 + layer * 37) * 17) % 7) - 3;
        pixels.data[index] = Math.min(255, 7 + (red * 0.96 + gray * 0.04) * 0.96 + grain);
        pixels.data[index + 1] = Math.min(255, 7 + (green * 0.96 + gray * 0.04) * 0.96 + grain);
        pixels.data[index + 2] = Math.min(255, 7 + (blue * 0.96 + gray * 0.04) * 0.96 + grain);
      }
      resource.data.set(pixels.data, layer * resource.layerSize);
      resource.texture.addLayerUpdate(layer);
      resource.texture.needsUpdate = true;
    }));
    return () => releases.forEach((release) => release());
  }, [resource, urls]);

  useEffect(() => () => {
    managedTextureArrays.delete(resource.texture);
    resource.texture.dispose();
  }, [resource]);

  return resource.texture;
}

export function getPosterTextureStats() {
  return {
    entries: textureCache.size,
    loadedTextures: Array.from(textureCache.values()).filter((entry) => entry.loaded).length,
    references: Array.from(textureCache.values()).reduce((sum, entry) => sum + entry.refs, 0),
    pendingDownloads: downloadQueue.length,
    pendingUploads: uploadQueue.length,
    activeDownloads,
    lastError: lastTextureError,
  };
}
