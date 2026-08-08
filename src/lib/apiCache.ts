export interface ApiCacheRecord<T> {
  version: number;
  createdAt: number;
  lastAccessed: number;
  expiry: number;
  data: T;
}

const CACHE_PREFIX = 'api:v1:';
const MAX_CACHE_ENTRIES = 150;
const MAX_CACHE_SIZE_BYTES = 3 * 1024 * 1024; // 3 MB
const ACCESS_UPDATE_INTERVAL_MS = 60 * 60 * 1000;

function normalizeKey(service: 'tmdb' | 'tvmaze', type: string, keyParts: string[]): string {
  const normalizedParts = keyParts.map(part => {
    return part.toString().toLowerCase().trim().replace(/\s+/g, ' ');
  });
  return `${CACHE_PREFIX}${service}:${type}:${normalizedParts.join(':')}`;
}

export function getCached<T>(service: 'tmdb' | 'tvmaze', type: string, keyParts: string[]): T | null {
  const key = normalizeKey(service, type, keyParts);
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch (e) {
    return null;
  }
  if (!raw) return null;

  try {
    const record: ApiCacheRecord<T> = JSON.parse(raw);
    const now = Date.now();

    if (record.version !== 1 || record.expiry < now) {
      try { localStorage.removeItem(key); } catch (e) {}
      return null;
    }

    if (now - record.lastAccessed > ACCESS_UPDATE_INTERVAL_MS) {
      record.lastAccessed = now;
      try {
        localStorage.setItem(key, JSON.stringify(record));
      } catch (e) {
        // Ignore quota errors on read access update
      }
    }

    return record.data;
  } catch (e) {
    try { localStorage.removeItem(key); } catch (e) {}
    return null;
  }
}

export function setCached<T>(service: 'tmdb' | 'tvmaze', type: string, keyParts: string[], data: T, ttlMinutes = 24 * 60): void {
  const key = normalizeKey(service, type, keyParts);
  const now = Date.now();
  
  const record: ApiCacheRecord<T> = {
    version: 1,
    createdAt: now,
    lastAccessed: now,
    expiry: now + (ttlMinutes * 60 * 1000),
    data
  };

  const serialized = JSON.stringify(record);

  try {
    localStorage.setItem(key, serialized);
    enforceCacheLimits();
  } catch (e) {
    enforceCacheLimits();
    try {
      localStorage.setItem(key, serialized);
      enforceCacheLimits();
    } catch (e2) {
      console.warn('Failed to cache API response after sweeping');
    }
  }
}

function enforceCacheLimits() {
  const keys: string[] = [];
  let totalBytes = 0;
  const entries: { key: string; record: ApiCacheRecord<any>; size: number }[] = [];

  try {
    const legacyPrefixes = ['tmdb_', 'tvmaze_'];
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key) {
        if (key.startsWith(CACHE_PREFIX)) {
          keys.push(key);
        } else if (legacyPrefixes.some(prefix => key.startsWith(prefix))) {
          localStorage.removeItem(key);
        }
      }
    }
  } catch (e) {
    return;
  }

  const now = Date.now();
  const encoder = new TextEncoder();

  for (const key of keys) {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(key);
    } catch (e) {
      continue;
    }
    
    if (!raw) continue;
    
    try {
      const record = JSON.parse(raw);
      if (record.version !== 1 || record.expiry < now) {
        try { localStorage.removeItem(key); } catch (e) {}
      } else {
        const size = encoder.encode(raw).length;
        entries.push({ key, record, size });
        totalBytes += size;
      }
    } catch (e) {
      try { localStorage.removeItem(key); } catch (e) {}
    }
  }

  if (entries.length > MAX_CACHE_ENTRIES || totalBytes > MAX_CACHE_SIZE_BYTES) {
    entries.sort((a, b) => a.record.lastAccessed - b.record.lastAccessed);
    
    let currentEntries = entries.length;
    let currentBytes = totalBytes;
    
    for (const entry of entries) {
      if (currentEntries <= MAX_CACHE_ENTRIES && currentBytes <= MAX_CACHE_SIZE_BYTES) {
        break;
      }
      try {
        localStorage.removeItem(entry.key);
      } catch (e) {}
      currentEntries--;
      currentBytes -= entry.size;
    }
  }
  

}
