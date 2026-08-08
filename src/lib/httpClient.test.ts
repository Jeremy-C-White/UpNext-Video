import { expect, test, describe, vi, beforeEach, afterEach } from 'vitest';
import { fetchJson } from './httpClient';

const _globalFetch = global.fetch;

describe('httpClient', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
    vi.useFakeTimers();
  });

  afterEach(() => {
    global.fetch = _globalFetch;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test('resolves successful request', async () => {
    (global.fetch as any).mockResolvedValueOnce({ ok: true, json: async () => ({ id: 1 }) });
    const data = await fetchJson('http://example.com');
    expect(data).toEqual({ id: 1 });
  });

  test('aborts when signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    
    await expect(fetchJson('http://example.com', { signal: controller.signal })).rejects.toThrow('Aborted');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('retries on 429 and applies retry-after cap', async () => {
    (global.fetch as any)
      .mockResolvedValueOnce({ ok: false, status: 429, headers: new Headers({ 'Retry-After': '100' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });

    const promise = fetchJson('http://example.com', { retries: 1 });
    
    // Fast-forward timers
    await vi.runAllTimersAsync();
    
    const data = await promise;
    expect(data).toEqual({ success: true });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('fails immediately on 404', async () => {
    (global.fetch as any).mockResolvedValueOnce({ ok: false, status: 404 });
    
    await expect(fetchJson('http://example.com', { retries: 3 })).rejects.toThrow('HTTP error! status: 404');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('coalesces identical requests', async () => {
    let resolveFirst: any;
    (global.fetch as any).mockImplementation(() => new Promise((resolve) => {
      resolveFirst = () => resolve({ ok: true, json: async () => ({ data: 'test' }) });
    }));

    const promise1 = fetchJson('http://example.com', { coalesce: true });
    const promise2 = fetchJson('http://example.com', { coalesce: true });
    
    expect(promise1).toBe(promise2);
    
    resolveFirst();
    const [res1, res2] = await Promise.all([promise1, promise2]);
    expect(res1).toEqual({ data: 'test' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
