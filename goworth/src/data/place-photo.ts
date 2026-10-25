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

function photoFromPage(page: CommonsPage, name: string, location: string, trustedAssociation = false): PlacePhoto | null {
  const info = page.imageinfo?.[0];
  const metadata = info?.extmetadata;
  const license = metadata?.LicenseShortName?.value || "";
  const title = page.title || "";
  const titleWords = tokens(title.replace(/^File:/, ""));
  const placeWords = tokens(name);
  const distinctiveWords = placeWords.filter((word) => !genericWords.has(word));
  const titleCompact = normalize(title).replace(/ /g, "");
  const description = normalize(metadata?.ImageDescription?.value || "");
  const matchesName = placeWords.length > 0 && (distinctiveWords.length ? distinctiveWords : placeWords).every((word) =>
    titleWords.includes(word) || titleCompact.includes(word) || description.includes(word),
  );
  const genericName = distinctiveWords.length < 2 || placeWords.some((word) => genericWords.has(word));
  const locationWords = tokens(location);
  const searchContext = `${title} ${metadata?.ImageDescription?.value || ""} ${metadata?.Categories?.value || ""}`;
  const matchesLocation = locationWords.some((word) => normalize(searchContext).includes(word));
  if (!info?.thumburl || !info.descriptionurl || (!trustedAssociation && (!matchesName || (genericName && !matchesLocation)))) return null;
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

async function queryCommons(params: URLSearchParams): Promise<CommonsPage[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, { signal: controller.signal });
    if (!response.ok) throw new Error("Photo search is unavailable.");
    const data: { query?: { pages?: Record<string, CommonsPage> } } = await response.json();
    return Object.values(data.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
  } finally {
    clearTimeout(timeout);
  }
}

async function searchCommons(query: string, name: string, location: string): Promise<PlacePhoto[]> {
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: query,
    gsrnamespace: "6",
    gsrlimit: "15",
    prop: "imageinfo",
    iiprop: "url|mime|extmetadata",
    iiurlwidth: "640",
    format: "json",
    origin: "*",
  });
  const pages = await queryCommons(params);
  const locationWords = tokens(location);
  const candidates = pages.flatMap((page) => {
    const photo = photoFromPage(page, name, location);
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  let response: Response;
  try {
    response = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) return null;
  const data: { query?: { pages?: Record<string, { title?: string; pageimage?: string; coordinates?: { lat: number; lon: number }[] }> } } = await response.json();
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
const lookupKey = (name: string, location: string, latitude?: number, longitude?: number, sourceUrl?: string) =>
  `${name}|${location}|${latitude ?? ""}|${longitude ?? ""}|${sourceUrl ?? ""}`.toLowerCase();

/** The photo if it was already looked up (this session or a previous one), so a list can draw it on its first frame. `undefined` means unknown yet. */
export function peekPlacePhoto(name: string, location: string, latitude?: number, longitude?: number, sourceUrl?: string): PlacePhoto | null | undefined {
  const key = lookupKey(name, location, latitude, longitude, sourceUrl);
  const photos = resolved.get(key) ?? (stored[key]?.expiresAt > Date.now() ? stored[key].photos : undefined);
  return photos ? photos[0] ?? null : undefined;
}

export async function findPlacePhoto(name: string, location: string, latitude?: number, longitude?: number, sourceUrl?: string, excludedUrls: string[] = []): Promise<PlacePhoto | null> {
  const key = lookupKey(name, location, latitude, longitude, sourceUrl);
  let entry = cache.get(key);
  if (!entry || entry.expiresAt < Date.now()) {
    const photos = (async () => {
      await storeReady;
      const saved = stored[key];
      if (saved && saved.expiresAt > Date.now()) return saved.photos;
      return limited(async () => {
        const verified = verifiedFiles[`${name}|${location}`.toLowerCase()];
        const [linked, verifiedResult] = await Promise.all([
          wikipediaPhoto(name, location, latitude, longitude, sourceUrl).catch(() => null),
          verified ? verifiedPhoto(verified, name, location).catch(() => null) : Promise.resolve(null),
        ]);
        if (linked || verifiedResult) return [linked, verifiedResult].filter((photo): photo is PlacePhoto => !!photo);
        return searchCommons(`${name} ${location}`, name, location);
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
