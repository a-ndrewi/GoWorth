export type PlacePhoto = {
  url: string;
  pageUrl: string;
  artist: string;
  license: string;
  licenseUrl: string;
};

type CommonsPage = {
  index?: number;
  title?: string;
  imageinfo?: {
    thumburl?: string;
    thumbwidth?: number;
    thumbheight?: number;
    descriptionurl?: string;
    mime?: string;
    extmetadata?: Record<string, { value?: string }>;
  }[];
};

/** Wikimedia thumbnails come in standard widths; small list images should not decode the 640px card version. */
export function sizedPhotoUrl(url: string, width: 120 | 250 | 330 | 500) {
  return /\/thumb\/.+\/\d+px-[^/]+$/.test(url) ? url.replace(/\/\d+px-([^/]+)$/, `/${width}px-$1`) : url;
}

const cache = new Map<string, { expiresAt: number; photos: Promise<PlacePhoto[]> }>();

/** Where finished lookups survive app restarts; the app plugs in device storage, tests leave it unset. */
export type PhotoStore = { load: () => Promise<string | null>; save: (value: string) => Promise<void> };
type StoredLookup = { expiresAt: number; photos: PlacePhoto[] };
const storedLimit = 500;
let stored: Record<string, StoredLookup> = {};
let storeReady: Promise<void> = Promise.resolve();
let photoStore: PhotoStore | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function setPhotoStore(store: PhotoStore) {
  photoStore = store;
  storeReady = store.load()
    .then((value) => {
      const parsed = value ? JSON.parse(value) as Record<string, StoredLookup> : {};
      const now = Date.now();
      stored = Object.fromEntries(Object.entries(parsed).filter(([, entry]) => entry.expiresAt > now && Array.isArray(entry.photos)));
    })
    .catch(() => { stored = {}; });
}

function remember(key: string, lookup: StoredLookup) {
  if (!photoStore) return;
  stored[key] = lookup;
  const keys = Object.keys(stored);
  // Keep the newest lookups: object keys keep insertion order, so the oldest come first.
  for (const old of keys.slice(0, Math.max(0, keys.length - storedLimit))) delete stored[old];
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { void photoStore?.save(JSON.stringify(stored)).catch(() => undefined); }, 1500);
}
const stopWords = new Set(["the", "of", "de", "do", "da", "del", "di", "la", "le", "and", "at"]);
const genericWords = new Set(["church", "museum", "market", "palace", "old", "town", "beach", "garden", "temple", "park", "national", "historic", "city", "center", "centre"]);
const verifiedFiles: Record<string, string> = {
  "palace of the parliament|bucharest, romania": "File:Palace of the Parliament.jpg",
};

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
}

function tokens(value: string) {
  return normalize(value).split(" ").filter((word) => word.length > 2 && !stopWords.has(word));
}

function plainText(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function safeUrl(value: string | undefined, host: string) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

/**
 * `nearby` is for files taken within a few hundred metres of the place: one distinctive word of its name in the file
 * is then enough, since the location itself is already confirmed.
 */
function photoFromPage(page: CommonsPage, name: string, location: string, trustedAssociation = false, nearby = false, requireLocation = false): PlacePhoto | null {
  const info = page.imageinfo?.[0];
  const metadata = info?.extmetadata;
  const license = metadata?.LicenseShortName?.value || "";
  const title = page.title || "";
  const titleWords = tokens(title.replace(/^File:/, ""));
  const placeWords = tokens(name);
  const distinctiveWords = placeWords.filter((word) => !genericWords.has(word));
  const titleCompact = normalize(title).replace(/ /g, "");
  const description = normalize(metadata?.ImageDescription?.value || "");
  const wordMatches = (word: string) => titleWords.includes(word) || titleCompact.includes(word) || description.includes(word);
  const matchesName = placeWords.length > 0 && (nearby
    ? distinctiveWords.some(wordMatches)
    : (distinctiveWords.length ? distinctiveWords : placeWords).every(wordMatches));
  const genericName = distinctiveWords.length < 2 || placeWords.some((word) => genericWords.has(word));
  const locationWords = tokens(location);
  const searchContext = `${title} ${metadata?.ImageDescription?.value || ""} ${metadata?.Categories?.value || ""}`;
  const matchesLocation = locationWords.some((word) => normalize(searchContext).includes(word));
  // Found by name alone, the file must name the city itself: the country is too broad to tell two same-named places apart.
  const matchesCity = tokens(location.split(",")[0] ?? "").some((word) => normalize(searchContext).includes(word));
  if (!info?.thumburl || !info.descriptionurl || (!trustedAssociation && (!matchesName || (!nearby && genericName && !matchesLocation) || (requireLocation && !matchesCity)))) return null;
  if (!/^CC0(?:\b|$)|^Public domain$/i.test(license) && !/^CC BY(?:-SA)?(?:\s|$)/i.test(license)) return null;
  if (!safeUrl(info.thumburl, "wikimedia.org") || !safeUrl(info.descriptionurl, "wikimedia.org")) return null;
  if (info.mime && !["image/jpeg", "image/png", "image/webp"].includes(info.mime)) return null;

  const artist = plainText(metadata?.Artist?.value || "").slice(0, 120) || "Wikimedia Commons contributor";
  const licenseUrl = metadata?.LicenseUrl?.value || "";
  return {
    url: info.thumburl,
    pageUrl: info.descriptionurl,
    artist,
    license,
    licenseUrl: safeUrl(licenseUrl, "creativecommons.org") ? licenseUrl : info.descriptionurl,
  };
}

// Wikimedia throttles anonymous clients without an identifying User-Agent; browsers keep their own and may not set it.
const wikimediaHeaders: Record<string, string> = typeof document === "undefined" ? { "User-Agent": "GoWorth/1.0 (travel app)" } : {};
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A Wikimedia API request that waits and tries again when the API asks it to slow down, so a busy list does not
 * end up with "no photo" for places that simply were not looked up.
 */
// When Wikimedia asks to slow down, every lookup pauses together; retrying them one by one would keep it throttled.
let pausedUntil = 0;

async function wikimediaJson<T>(url: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    if (pausedUntil > Date.now()) await wait(pausedUntil - Date.now());
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch(url, { headers: wikimediaHeaders, signal: controller.signal });
      if ((response.status === 429 || response.status === 503) && attempt < 3) {
        const retryAfter = Number(response.headers?.get?.("retry-after"));
        const delay = Math.min(8000, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1500 * 2 ** attempt);
        pausedUntil = Math.max(pausedUntil, Date.now() + delay);
        continue;
      }
      if (!response.ok) throw new Error("Photo search is unavailable.");
      return await response.json() as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function queryCommons(params: URLSearchParams): Promise<CommonsPage[]> {
  const data = await wikimediaJson<{ query?: { pages?: Record<string, CommonsPage> } }>(`https://commons.wikimedia.org/w/api.php?${params}`);
  return Object.values(data.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
}

const imageProps = { prop: "imageinfo", iiprop: "url|mime|extmetadata", iiurlwidth: "640", format: "json", origin: "*" };

/** `requireLocation` is for searches by name alone, where a same-named place elsewhere would otherwise match. */
async function searchCommons(query: string, name: string, location: string, requireLocation = false): Promise<PlacePhoto[]> {
  const pages = await queryCommons(new URLSearchParams({ action: "query", generator: "search", gsrsearch: query, gsrnamespace: "6", gsrlimit: "15", ...imageProps }));
  return rankedPhotos(pages, name, location, false, requireLocation);
}

/** Files photographed within 250 m of the place whose title or description names it. */
async function nearbyCommons(name: string, location: string, latitude: number, longitude: number): Promise<PlacePhoto[]> {
  const pages = await queryCommons(new URLSearchParams({ action: "query", generator: "geosearch", ggsnamespace: "6",
    ggscoord: `${latitude}|${longitude}`, ggsradius: "250", ggslimit: "30", ...imageProps }));
  return rankedPhotos(pages, name, location, true);
}

function rankedPhotos(pages: CommonsPage[], name: string, location: string, nearby = false, requireLocation = false): PlacePhoto[] {
  const locationWords = tokens(location);
  const candidates = pages.flatMap((page) => {
    const photo = photoFromPage(page, name, location, false, nearby, requireLocation);
    if (!photo) return [];
    const title = normalize(page.title || "");
    const fileTitle = normalize((page.title || "").replace(/^File:/, ""));
    const info = page.imageinfo?.[0];
    const score = locationWords.reduce((total, word) => total + (title.includes(word) ? 4 : 0), 0)
      + (fileTitle.startsWith(normalize(name)) ? 10 : 0)
      + (info?.thumbwidth && info?.thumbheight && info.thumbwidth > info.thumbheight ? 2 : 0)
      - (/(?:detail|close up|quadriga|statue|sculpture|painting|model|souvenir|interior|inside|view from|from the)/.test(title) ? 12 : 0)
      - (page.index || 0) / 20;
    return [{ photo, score }];
  });
  candidates.sort((a, b) => b.score - a.score);
  return candidates.map(({ photo }) => photo);
}

async function verifiedPhoto(title: string, name: string, location: string) {
  const params = new URLSearchParams({
    action: "query", titles: title, prop: "imageinfo", iiprop: "url|mime|extmetadata",
    iiurlwidth: "640", format: "json", origin: "*",
  });
  const pages = await queryCommons(params);
  return pages.length ? photoFromPage(pages[0], name, location) : null;
}

async function wikipediaPhoto(name: string, location: string, latitude?: number, longitude?: number, sourceUrl?: string) {
  const pageId = sourceUrl?.match(/^https:\/\/en\.wikipedia\.org\/\?curid=(\d+)$/)?.[1];
  if (!pageId && (latitude === undefined || longitude === undefined)) return null;
  const params = new URLSearchParams({ action: "query", prop: "pageimages|coordinates", piprop: "name", format: "json", origin: "*" });
  if (pageId) params.set("pageids", pageId);
  else params.set("titles", name);
  const data = await wikimediaJson<{ query?: { pages?: Record<string, { title?: string; pageimage?: string; coordinates?: { lat: number; lon: number }[] }> } }>(`https://en.wikipedia.org/w/api.php?${params}`);
  const page = Object.values(data.query?.pages || {})[0];
  if (!page?.pageimage) return null;
  if (!pageId) {
    const point = page.coordinates?.[0];
    if (!point || latitude === undefined || longitude === undefined) return null;
    const latKm = (point.lat - latitude) * 111;
    const lonKm = (point.lon - longitude) * 111 * Math.cos(latitude * Math.PI / 180);
    if (Math.hypot(latKm, lonKm) > 5) return null;
  }
  const commons = await queryCommons(new URLSearchParams({
    action: "query", titles: `File:${page.pageimage}`, prop: "imageinfo", iiprop: "url|mime|extmetadata",
    iiurlwidth: "640", format: "json", origin: "*",
  }));
  return commons.length ? photoFromPage(commons[0], name, location, true) : null;
}

/**
 * At most a few lookups hit the network at once; the newest request goes first, so cards just scrolled into view
 * are served before ones that have already scrolled away.
 */
const maxLookups = 4;
let runningLookups = 0;
const waitingLookups: (() => void)[] = [];
async function limited<T>(task: () => Promise<T>): Promise<T> {
  if (runningLookups >= maxLookups) await new Promise<void>((resolve) => waitingLookups.push(resolve));
  runningLookups++;
  try { return await task(); }
  finally { runningLookups--; waitingLookups.pop()?.(); }
}

const resolved = new Map<string, PlacePhoto[]>();
/**
 * With coordinates the place is already pinned down, so the location label is left out of the key: a list and its
 * thumbnails describe the same city differently ("Rome, IT" or "Rome, Italy") and should share one lookup.
 */
const lookupKey = (name: string, location: string, latitude?: number, longitude?: number, sourceUrl?: string) =>
  (latitude !== undefined && longitude !== undefined && Number.isFinite(latitude) && Number.isFinite(longitude)
    ? `${name}|@${latitude.toFixed(4)}|${longitude.toFixed(4)}|${sourceUrl ?? ""}`
    : `${name}|${location}|||${sourceUrl ?? ""}`).toLowerCase();

/** Records a photo found outside `findPlacePhoto`, so later lookups for the place answer at once. */
function settle(key: string, photos: PlacePhoto[]) {
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
  cache.set(key, { photos: Promise.resolve(photos), expiresAt });
  resolved.set(key, photos);
  remember(key, { expiresAt, photos });
}

/** `near` stands in for the place's own coordinates when it has none: the article must then lie within `radiusKm` of it. */
export type PhotoRequest = { name: string; location: string; latitude?: number; longitude?: number; sourceUrl?: string;
  near?: { latitude: number; longitude: number; radiusKm: number } };
/** Bulk lookups in flight, by place key; a single lookup for one of these places waits for it instead of racing it. */
const prefetching = new Map<string, Promise<unknown>>();
type WikiLeadPage = { pageid?: number; title?: string; pageimage?: string; coordinates?: { lat: number; lon: number }[] };

/**
 * Finds the Wikipedia lead photo of many places at once: one Wikipedia request and one Commons request per 50 places,
 * instead of several requests for each. Local names usually redirect to the English article. Places found here are
 * settled in the cache; the result tells which ones have a photo, and `false` only means "not found this way".
 */
export function prefetchPlacePhotos(places: PhotoRequest[]): Promise<boolean[]> {
  const keys = places.map((place) => lookupKey(place.name, place.location, place.latitude, place.longitude, place.sourceUrl));
  const run = bulkPhotos(places);
  for (const key of keys) if (!prefetching.has(key)) prefetching.set(key, run);
  void run.catch(() => undefined).finally(() => { for (const key of keys) if (prefetching.get(key) === run) prefetching.delete(key); });
  return run;
}

async function bulkPhotos(places: PhotoRequest[]): Promise<boolean[]> {
  await storeReady;
  const found = places.map((place) => !!peekPlacePhoto(place.name, place.location, place.latitude, place.longitude, place.sourceUrl));
  const pending = places.map((place, index) => ({ place, index })).filter(({ place, index }) => !found[index] &&
    peekPlacePhoto(place.name, place.location, place.latitude, place.longitude, place.sourceUrl) === undefined &&
    ((place.latitude !== undefined && place.longitude !== undefined) || !!place.near));
  for (let start = 0; start < pending.length; start += 50) {
    const chunk = pending.slice(start, start + 50);
    const byPageId = chunk.filter(({ place }) => /^https:\/\/en\.wikipedia\.org\/\?curid=\d+$/.test(place.sourceUrl ?? ""));
    const byTitle = chunk.filter((item) => !byPageId.includes(item));
    const lead = new Map<number, string>();
    for (const [group, param] of [[byTitle, "titles"], [byPageId, "pageids"]] as const) {
      if (!group.length) continue;
      const params = new URLSearchParams({ action: "query", prop: "pageimages|coordinates", piprop: "name", redirects: "1", format: "json", origin: "*" });
      params.set(param, group.map(({ place }) => param === "pageids" ? place.sourceUrl!.split("curid=")[1] : place.name).join("|"));
      const data = await wikimediaJson<{ query?: { normalized?: { from: string; to: string }[]; redirects?: { from: string; to: string }[]; pages?: Record<string, WikiLeadPage> } }>(`https://en.wikipedia.org/w/api.php?${params}`).catch(() => null);
      const pages = Object.values(data?.query?.pages ?? {});
      const follow = (title: string) => {
        const normalized = data?.query?.normalized?.find((item) => item.from === title)?.to ?? title;
        return data?.query?.redirects?.find((item) => item.from === normalized)?.to ?? normalized;
      };
      for (const { place, index } of group) {
        const page = param === "pageids" ? pages.find((item) => String(item.pageid) === place.sourceUrl!.split("curid=")[1]) : pages.find((item) => item.title === follow(place.name));
        const point = page?.coordinates?.[0];
        if (!page?.pageimage) continue;
        // A title lookup can land on a namesake elsewhere; the article must sit within 5 km of the place.
        if (param === "titles") {
          const anchor = place.latitude !== undefined && place.longitude !== undefined
            ? { latitude: place.latitude, longitude: place.longitude, radiusKm: 5 } : place.near!;
          if (!point) continue;
          const latKm = (point.lat - anchor.latitude) * 111;
          const lonKm = (point.lon - anchor.longitude) * 111 * Math.cos(anchor.latitude * Math.PI / 180);
          if (Math.hypot(latKm, lonKm) > anchor.radiusKm) continue;
        }
        lead.set(index, page.pageimage);
      }
    }
    if (!lead.size) continue;
    const files = await queryCommons(new URLSearchParams({ action: "query", titles: [...new Set(lead.values())].map((file) => `File:${file}`).join("|"), ...imageProps })).catch(() => []);
    const fileKey = (title: string) => normalize(title.replace(/^File:/, ""));
    for (const [index, file] of lead) {
      const page = files.find((item) => item.title && fileKey(item.title) === fileKey(file));
      const place = places[index];
      const photo = page ? photoFromPage(page, place.name, place.location, true) : null;
      if (!photo) continue;
      settle(lookupKey(place.name, place.location, place.latitude, place.longitude, place.sourceUrl), [photo]);
      found[index] = true;
    }
  }
  return found;
}

/** The photo if it was already looked up (this session or a previous one), so a list can draw it on its first frame. `undefined` means unknown yet. */
export function peekPlacePhoto(name: string, location: string, latitude?: number, longitude?: number, sourceUrl?: string): PlacePhoto | null | undefined {
  const key = lookupKey(name, location, latitude, longitude, sourceUrl);
  const photos = resolved.get(key) ?? (stored[key]?.expiresAt > Date.now() ? stored[key].photos : undefined);
  return photos ? photos[0] ?? null : undefined;
}

export async function findPlacePhoto(name: string, location: string, latitude?: number, longitude?: number, sourceUrl?: string, excludedUrls: string[] = []): Promise<PlacePhoto | null> {
  const key = lookupKey(name, location, latitude, longitude, sourceUrl);
  // Let the effects of the same render start their bulk lookups first (a list's effect runs after its cards' effects).
  await Promise.resolve();
  const bulk = prefetching.get(key);
  if (bulk) await bulk.catch(() => undefined);
  let entry = cache.get(key);
  if (!entry || entry.expiresAt < Date.now()) {
    const photos = (async () => {
      await storeReady;
      const saved = stored[key];
      if (saved && saved.expiresAt > Date.now()) return saved.photos;
      return limited(async () => {
        // A step that failed (offline, throttled) must not turn into a remembered "no photo".
        let failed = false;
        const attempt = <T,>(task: Promise<T>, fallback: T) => task.catch(() => { failed = true; return fallback; });
        const verified = verifiedFiles[`${name}|${location}`.toLowerCase()];
        const [linked, verifiedResult] = await Promise.all([
          attempt(wikipediaPhoto(name, location, latitude, longitude, sourceUrl), null),
          verified ? attempt(verifiedPhoto(verified, name, location), null) : Promise.resolve(null),
        ]);
        if (linked || verifiedResult) return [linked, verifiedResult].filter((photo): photo is PlacePhoto => !!photo);
        // Commons search needs every word to match, and files rarely name the country: try the city, then the name alone,
        // then files taken at the place itself.
        const city = location.split(",")[0]?.trim() ?? "";
        const queries = [...new Set([city && !normalize(name).includes(normalize(city)) ? `${name} ${city}` : "", name].filter(Boolean))];
        for (const query of queries) {
          const photos = await attempt(searchCommons(query, name, location, query === name), []);
          if (photos.length) return photos;
        }
        if (latitude !== undefined && longitude !== undefined && Number.isFinite(latitude) && Number.isFinite(longitude)) {
          const photos = await attempt(nearbyCommons(name, location, latitude, longitude), []);
          if (photos.length) return photos;
        }
        if (failed) throw new Error("Photo search is unavailable.");
        return [];
      });
    })().catch((error) => {
      cache.delete(key);
      throw error;
    });
    const currentEntry = { photos, expiresAt: Date.now() + 5 * 60 * 1000 };
    entry = currentEntry;
    cache.set(key, currentEntry);
    void photos.then((results) => {
      if (cache.get(key) !== currentEntry) return;
      resolved.set(key, results);
      currentEntry.expiresAt = stored[key]?.expiresAt ?? Date.now() + (results.length ? 7 : 1) * 24 * 60 * 60 * 1000;
      if (!stored[key]) remember(key, { expiresAt: currentEntry.expiresAt, photos: results });
    }).catch(() => undefined);
  }
  const photos = await entry.photos;
  const specific = photos.find((photo) => !excludedUrls.includes(photo.url));
  if (specific) return specific;
  return null;
}
