export interface JsonRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  retries?: number;
  coalesce?: boolean;
  concurrencyGroup?: "tmdb" | "tvmaze";
}

const IN_FLIGHT_REQUESTS = new Map<string, Promise<any>>();
const ACTIVE_COUNTS = new Map<string, number>();
const CONCURRENCY_QUEUE = new Map<string, Array<() => void>>();

const CONCURRENCY_LIMITS: Record<string, number> = {
  tmdb: 10,
  tvmaze: 3
};

async function acquirePermit(group: string, signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  
  const limit = CONCURRENCY_LIMITS[group] || 5;
  const current = ACTIVE_COUNTS.get(group) || 0;
  
  if (current < limit) {
    ACTIVE_COUNTS.set(group, current + 1);
    return;
  }
  
  return new Promise<void>((resolve, reject) => {
    const queue = CONCURRENCY_QUEUE.get(group) || [];
    
    let onAbort: () => void;
    
    const permitResolver = () => {
      if (signal && onAbort) signal.removeEventListener('abort', onAbort);
      resolve();
    };
    
    if (signal) {
      onAbort = () => {
        const q = CONCURRENCY_QUEUE.get(group) || [];
        const index = q.indexOf(permitResolver);
        if (index !== -1) {
          q.splice(index, 1);
        }
        reject(new DOMException("Aborted", "AbortError"));
      };
      signal.addEventListener('abort', onAbort);
    }
    
    queue.push(permitResolver);
    CONCURRENCY_QUEUE.set(group, queue);
  });
}

function releasePermit(group: string) {
  const current = ACTIVE_COUNTS.get(group) || 0;
  const queue = CONCURRENCY_QUEUE.get(group) || [];
  
  if (queue.length > 0) {
    const next = queue.shift();
    if (next) next();
  } else {
    ACTIVE_COUNTS.set(group, Math.max(0, current - 1));
  }
}

async function sleep(ms: number, signal?: AbortSignal) {
  if (ms <= 0) return;
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  return new Promise<void>((resolve, reject) => {
    let timeout: ReturnType<typeof setTimeout>;
    let onAbort: () => void;
    
    if (signal) {
      onAbort = () => {
        clearTimeout(timeout);
        reject(new DOMException("Aborted", "AbortError"));
      };
      signal.addEventListener('abort', onAbort);
    }
    
    timeout = setTimeout(() => {
      if (signal && onAbort) signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
  });
}

export function fetchJson<T>(url: string, options: JsonRequestOptions = {}): Promise<T> {
  const {
    signal,
    timeoutMs = 15000,
    retries = 2,
    coalesce = true,
    concurrencyGroup
  } = options;

  const coalesceKey = coalesce && !signal ? url : null;

  if (coalesceKey && IN_FLIGHT_REQUESTS.has(coalesceKey)) {
    return IN_FLIGHT_REQUESTS.get(coalesceKey) as Promise<T>;
  }

  const doRequest = async () => {
    let lastError: Error | null = null;
    let lastStatus = 0;

    for (let attempt = 0; attempt <= retries; attempt++) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

      if (concurrencyGroup) {
        await acquirePermit(concurrencyGroup, signal);
      }
      
      if (signal?.aborted) {
        if (concurrencyGroup) releasePermit(concurrencyGroup);
        throw new DOMException("Aborted", "AbortError");
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(new DOMException("Timeout", "TimeoutError")), timeoutMs);
      
      let onAbort: () => void;
      if (signal) {
        onAbort = () => controller.abort(signal.reason);
        if (signal.aborted) {
          onAbort();
        } else {
          signal.addEventListener('abort', onAbort);
        }
      }

      let response: Response | undefined;
      let error: any;

      try {
        response = await fetch(url, { signal: controller.signal });
      } catch (e: any) {
        error = e;
      } finally {
        clearTimeout(timeoutId);
        if (signal && onAbort!) signal.removeEventListener('abort', onAbort);
        if (concurrencyGroup) releasePermit(concurrencyGroup);
      }

      if (response && response.ok) {
        return (await response.json()) as T;
      }

      if (error) {
        lastError = error;
        if (error.name === 'AbortError' && signal?.aborted) {
          throw error; // User aborted
        }
        // TimeoutError or Network error (can be retried)
        if (attempt < retries) {
          const delayMs = Math.min(500 * Math.pow(2, attempt) + Math.random() * 200, 5000);
          await sleep(delayMs, signal);
          continue;
        }
      }

      if (response) {
        const status = response.status;
        lastStatus = status;
        
        // Throw 4xx (except 429) immediately
        if (status >= 400 && status < 500 && status !== 429) {
          throw new Error(`HTTP error! status: ${status}`);
        }

        if (attempt < retries) {
          let delayMs = 1000;
          if (status === 429) {
            const retryAfter = response.headers.get("Retry-After");
            if (retryAfter) {
              const seconds = parseInt(retryAfter, 10);
              if (!isNaN(seconds)) {
                 delayMs = seconds * 1000;
              } else {
                 delayMs = Math.max(0, new Date(retryAfter).getTime() - Date.now());
              }
            } else {
              delayMs = Math.min(1000 * Math.pow(2, attempt), 10000);
            }
            delayMs = Math.min(delayMs, 10000); // Cap Retry-After to 10s max
          } else {
             // 5xx errors
             delayMs = Math.min(500 * Math.pow(2, attempt) + Math.random() * 200, 5000);
          }
          
          await sleep(delayMs, signal);
          continue;
        }
      }
    }

    if (lastStatus) {
      throw new Error(`Request failed with status: ${lastStatus}`);
    }
    throw lastError || new Error("Request failed after retries");
  };

  const promise = doRequest();

  if (coalesceKey) {
    IN_FLIGHT_REQUESTS.set(coalesceKey, promise);
    promise.finally(() => {
      if (IN_FLIGHT_REQUESTS.get(coalesceKey) === promise) {
        IN_FLIGHT_REQUESTS.delete(coalesceKey);
      }
    }).catch(() => {}); // Prevent unhandled rejection warning from the map's copy
  }

  return promise;
}
