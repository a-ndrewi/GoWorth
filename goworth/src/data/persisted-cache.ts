/** Where a cache survives app restarts; the app plugs in device storage, tests leave it unset. */
export type JsonStore = { load: () => Promise<string | null>; save: (value: string) => Promise<void> };

type Entry<T> = { savedAt: number; value: T };

/**
 * A small key/value cache kept in one stored JSON document, newest `limit` entries only. Entries older than `maxAgeMs`
 * are dropped when read back. Writes are batched so a burst of results is saved once.
 */
export function persistedCache<T>(limit: number, maxAgeMs: number) {
  let entries: Record<string, Entry<T>> = {};
  let ready: Promise<void> = Promise.resolve();
  let store: JsonStore | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  return {
    attach(next: JsonStore) {
      store = next;
      ready = next.load()
        .then((value) => {
          const parsed = value ? JSON.parse(value) as Record<string, Entry<T>> : {};
          const now = Date.now();
          // Anything written since attach (a request that finished first) wins over what was stored.
          entries = { ...Object.fromEntries(Object.entries(parsed).filter(([, entry]) => entry && now - entry.savedAt < maxAgeMs)), ...entries };
        })
        .catch(() => undefined);
    },
    async get(key: string): Promise<Entry<T> | undefined> {
      if (!store) return undefined;
      await ready;
      const entry = entries[key];
      return entry && Date.now() - entry.savedAt < maxAgeMs ? entry : undefined;
    },
    set(key: string, value: T) {
      if (!store) return;
      delete entries[key];
      entries[key] = { savedAt: Date.now(), value };
      const keys = Object.keys(entries);
      // Object keys keep insertion order, so the oldest come first.
      for (const old of keys.slice(0, Math.max(0, keys.length - limit))) delete entries[old];
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void ready.then(() => store?.save(JSON.stringify(entries))).catch(() => undefined); }, 1500);
    },
  };
}
