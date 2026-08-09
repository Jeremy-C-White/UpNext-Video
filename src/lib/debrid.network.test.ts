import { expect, test, describe, vi, beforeEach, afterEach } from 'vitest';
import {
  getAioStreamsManifestUrl,
  getBestTorrentioStream,
  normalizeAioStreamsBaseUrl,
  validateAioStreamsProvider,
} from './debrid';

const MOCK_AIO_RESPONSE = {
  streams: [
    {
      name: "Torrentio\n[RD+] 4k",
      title: "Supergirl.S01E01.mkv\n👤 25 💾 1.2 GB ⚙️ Torrentio",
      url: "http://example.com/stream1"
    },
    {
      name: "Torrentio\n[RD download] 1080p",
      title: "Silo.S01E01.mp4\n👤 0 💾 800 MB ⚙️ Torrentio",
      url: "http://example.com/stream2"
    }
  ]
};

const MOCK_MANIFEST = {
  id: "community.example",
  name: "Example Streams",
  resources: ["stream"],
};

describe('AIOStreams provider settings', () => {
  afterEach(() => vi.restoreAllMocks());

  test('normalizes base, manifest, and configure URLs to the addon base', () => {
    expect(normalizeAioStreamsBaseUrl('https://example.test/addon/manifest.json')).toBe('https://example.test/addon');
    expect(normalizeAioStreamsBaseUrl('https://example.test/addon/configure')).toBe('https://example.test/addon');
    expect(getAioStreamsManifestUrl('https://example.test/addon/')).toBe('https://example.test/addon/manifest.json');
  });

  test('validates the provider manifest directly before trying a local proxy', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => MOCK_MANIFEST,
    } as Response);

    await expect(validateAioStreamsProvider('https://example.test/addon')).resolves.toBe('https://example.test/addon');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe('https://example.test/addon/manifest.json');
  });

  test('uses the backend proxy only when direct browser access fails', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('CORS blocked'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => MOCK_MANIFEST,
      } as Response);

    await validateAioStreamsProvider('https://example.test/addon');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[1][0]).toContain('/api/debrid/stream?url=');
  });

  test('reports a real manifest HTTP failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({ ok: false, status: 404 } as Response);
    await expect(validateAioStreamsProvider('https://example.test/addon'))
      .rejects.toThrow('Provider manifest unreachable (HTTP 404)');
  });
});

describe('AIOStreams Network layer', () => {
  let fetchSpy: any;
  let originalLocalStorage: any;

  beforeEach(() => {
    originalLocalStorage = global.localStorage;
    const store: Record<string, string> = {};
    global.localStorage = {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => store[key] = value,
      removeItem: (key: string) => delete store[key],
      clear: () => Object.keys(store).forEach(key => delete store[key]),
      length: 0,
      key: (i: number) => null,
    } as any;
    
    (global as any).window = { 
      localStorage: global.localStorage,
      setTimeout: global.setTimeout,
      clearTimeout: global.clearTimeout
    };
    
    global.localStorage.setItem("aiostreams_base_url", "https://my.aio.streams");
    fetchSpy = vi.spyOn(global, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    global.localStorage = originalLocalStorage;
    delete (global as any).window;
  });

  test('requests the same-origin backend proxy route rather than the external domain', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => MOCK_AIO_RESPONSE,
    });

    await getBestTorrentioStream("tt1234567", 1, 1, "series", undefined, true);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const requestUrl = fetchSpy.mock.calls[0][0];
    expect(requestUrl).toContain("/api/debrid/stream?url=");
    expect(requestUrl).toContain(encodeURIComponent("https://my.aio.streams/stream/series/tt1234567:1:1.json"));
  });

  test('falls back to the provider directly when a static host has no proxy route', async () => {
    fetchSpy
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => MOCK_AIO_RESPONSE,
      });

    await getBestTorrentioStream("tt1234567", 1, 1, "series", undefined, true);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[1][0]).toBe(
      "https://my.aio.streams/stream/series/tt1234567:1:1.json"
    );
  });

  test('backend 504 produces the timeout message', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 504,
      text: async () => "Timeout",
    });

    await expect(getBestTorrentioStream("tt1234567", 1, 1, "series", undefined, true))
      .rejects.toThrow("Stream resolution timed out. Please check your network connection or configured AIOStreams/Stremio URL in Settings.");
  });

  test('backend 502 produces the provider-connection message', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 502,
      text: async () => "Bad Gateway",
    });

    await expect(getBestTorrentioStream("tt1234567", 1, 1, "series", undefined, true))
      .rejects.toThrow("Unable to reach stream provider directly. Please check your configured URL in Settings.");
  });
  
  test('cancellation via AbortSignal is respected', async () => {
    const controller = new AbortController();
    
    fetchSpy.mockImplementation(async (url: string, options: any) => {
      return new Promise((_, reject) => {
        options.signal?.addEventListener("abort", () => {
          const err = new Error("AbortError");
          err.name = "AbortError";
          reject(err);
        });
      });
    });

    const promise = getBestTorrentioStream("tt1234567", 1, 1, "series", controller.signal, true);
    controller.abort();

    await expect(promise).rejects.toThrow("Stream resolution timed out.");
  });
});
