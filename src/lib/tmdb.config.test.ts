import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  fetchTMDB,
  getTmdbApiKey,
  TMDB_API_KEY_STORAGE_KEY,
} from './tmdb';

const originalWindow = global.window;

describe('TMDB browser configuration', () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    (global as any).window = {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
    };
  });

  afterEach(() => {
    global.window = originalWindow;
  });

  test('reads the API key from browser-only storage', () => {
    window.localStorage.setItem(TMDB_API_KEY_STORAGE_KEY, 'browser-key');
    expect(getTmdbApiKey()).toBe('browser-key');
  });

  test('reports a clear error when no API key is configured', async () => {
    await expect(fetchTMDB('/configuration')).rejects.toThrow(
      'Add your TMDB API key in Settings'
    );
  });
});
