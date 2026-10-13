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

const cache = new Map<string, Promise<PlacePhoto | null>>();
const stopWords = new Set(["the", "of", "de", "do", "da", "del", "di", "la", "le", "and", "at"]);
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

function photoFromPage(page: CommonsPage, name: string, location: string): PlacePhoto | null {
  const info = page.imageinfo?.[0];
  const metadata = info?.extmetadata;
  const license = metadata?.LicenseShortName?.value || "";
  const title = page.title || "";
  const titleWords = tokens(title.replace(/^File:/, ""));
  const placeWords = tokens(name);
  const titleCompact = normalize(title).replace(/ /g, "");
  const matchesName = placeWords.length > 0 && placeWords.every((word) =>
    titleWords.includes(word) || titleCompact.includes(word),
  );
  const genericName = placeWords.length < 2 || ["park", "museum", "market", "palace", "old", "town", "beach", "garden", "temple"].some((word) => placeWords.includes(word));
  const locationWords = tokens(location);
  const searchContext = `${title} ${metadata?.ImageDescription?.value || ""} ${metadata?.Categories?.value || ""}`;
  const matchesLocation = locationWords.some((word) => normalize(searchContext).includes(word));
  if (!info?.thumburl || !info.descriptionurl || !matchesName || (genericName && !matchesLocation)) return null;
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
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, { signal: controller.signal });
    if (!response.ok) throw new Error("Photo search is unavailable.");
    const data: { query?: { pages?: Record<string, CommonsPage> } } = await response.json();
    return Object.values(data.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
  } finally {
    clearTimeout(timeout);
  }
}

async function searchCommons(query: string, name: string, location: string): Promise<PlacePhoto | null> {
    const params = new URLSearchParams({
      action: "query",
      generator: "search",
      gsrsearch: query,
      gsrnamespace: "6",
      gsrlimit: "15",
      prop: "imageinfo",
      iiprop: "url|mime|extmetadata",
      iiurlwidth: "900",
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
    return candidates[0]?.photo || null;
}

async function verifiedPhoto(title: string, name: string, location: string) {
  const params = new URLSearchParams({
    action: "query", titles: title, prop: "imageinfo", iiprop: "url|mime|extmetadata",
    iiurlwidth: "900", format: "json", origin: "*",
  });
  const pages = await queryCommons(params);
  return pages.length ? photoFromPage(pages[0], name, location) : null;
}

export function findPlacePhoto(name: string, location: string): Promise<PlacePhoto | null> {
  const key = `${name}|${location}`.toLowerCase();
  if (!cache.has(key)) {
    const request = (async () => {
      const verified = verifiedFiles[key];
      if (verified) {
        const photo = await verifiedPhoto(verified, name, location);
        if (photo) return photo;
      }
      return await searchCommons(`${name} ${location}`, name, location) ||
        await searchCommons(name, name, location);
    })().catch((error) => {
      cache.delete(key);
      throw error;
    });
    cache.set(key, request);
  }
  return cache.get(key)!;
}
