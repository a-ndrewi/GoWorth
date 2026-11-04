import type { MapPin } from "./map";
import { findPlacePhoto, prefetchPlacePhotos } from "./place-photo.ts";
import { boundaryRadiusKm, fallbackRadiusKm, insideBoundary, loadCityBoundary, type Boundary } from "./city-boundary.ts";
import { countryForCode, nearestCity } from "./geography.ts";

export type VenueKind = "restaurant" | "bar" | "cafe" | "nightclub";
/** What the Explore deck can show besides attractions; "terrace" means any venue with outdoor seating. */
export type VenueFilter = VenueKind | "terrace";
export const venueFilters: VenueFilter[] = ["restaurant", "bar", "cafe", "nightclub", "terrace"];
export type Venue = { kind: VenueKind; terrace: boolean; cuisine?: string; openingHours?: string; address?: string };

export type NearbyPlace = MapPin & {
  kind: "place";
  category: string;
  detail: string;
  source: "OpenStreetMap" | "Wikipedia";
  sourceUrl: string;
  location?: string;
  /** The OpenStreetMap object's Wikidata item, whose image is the quickest reliable photo of the place. */
  wikidata?: string;
  /** The Commons file OpenStreetMap tags as the place's photo (`wikimedia_commons` or `image`). */
  commonsFile?: string;
  /** Set for restaurants, bars, cafés and clubs, which rarely have a free photo and get their own card. */
  venue?: Venue;
};

type Center = { latitude: number; longitude: number };
type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};
type WikiPlace = { pageid: number; title: string; lat?: number; lon?: number; dist?: number; index?: number;
  coordinates?: { lat: number; lon: number }[]; pageprops?: { page_image_free?: string; "wikibase-shortdesc"?: string; wikibase_item?: string } };
type PhotonFeature = {
  properties: { osm_type: "N" | "W" | "R"; osm_id: number; osm_key: string; osm_value: string; name?: string; city?: string; country?: string; street?: string; housenumber?: string };
  geometry: { coordinates: [number, number] };
};

const cache = new Map<string, { expiresAt: number; places: NearbyPlace[] }>();
const pending = new Map<string, Promise<NearbyPlace[]>>();
const venueCache = new Map<string, { expiresAt: number; places: NearbyPlace[] }>();
const venuePending = new Map<string, Promise<NearbyPlace[]>>();
const wikipediaSearchCache = new Map<string, { expiresAt: number; places: NearbyPlace[] }>();
const photoReadyCache = new Map<string, Promise<boolean>>();
/** The kinds of OpenStreetMap objects listed as places to see, by key. */
const attractionKinds: Record<string, string[]> = {
  tourism: ["attraction", "museum", "gallery", "viewpoint", "zoo", "theme_park", "aquarium", "artwork"],
  historic: ["castle", "fort", "archaeological_site", "monument", "memorial", "ruins", "palace", "manor", "monastery",
    "church", "city_gate", "tower", "citywalls", "aqueduct", "ship", "building"],
  natural: ["peak", "waterfall", "cave_entrance", "beach", "volcano", "glacier", "cliff", "arch", "hot_spring", "gorge"],
  leisure: ["park", "nature_reserve", "garden"],
  amenity: ["marketplace", "theatre", "place_of_worship", "fountain", "arts_centre", "planetarium"],
  man_made: ["lighthouse"],
};
const photonCategories = Object.entries(attractionKinds).flatMap(([key, values]) => values.map((value) => `osm.${key}.${value}`));
/**
 * Photon answers at most 50 places a request, so the kinds are asked for in groups: one long list would let the
 * best-known parks and churches fill every slot and hide the museums, ruins and viewpoints.
 */
const photonCategoryGroups = [
  attractionKinds.tourism.map((value) => `osm.tourism.${value}`),
  attractionKinds.historic.slice(0, 8).map((value) => `osm.historic.${value}`),
  attractionKinds.historic.slice(8).map((value) => `osm.historic.${value}`),
  [...attractionKinds.natural.map((value) => `osm.natural.${value}`), ...attractionKinds.leisure.map((value) => `osm.leisure.${value}`)],
  [...attractionKinds.amenity.map((value) => `osm.amenity.${value}`), "osm.man_made.lighthouse"],
];
export const photonSearchCategories = photonCategories;

function photoKey(place: NearbyPlace) {
  return `${place.name}|${place.location ?? ""}|${place.latitude.toFixed(4)}|${place.longitude.toFixed(4)}|${place.sourceUrl}`.toLowerCase();
}

function hasVerifiedPhoto(place: NearbyPlace) {
  const key = photoKey(place);
  const cached = photoReadyCache.get(key);
  if (cached) return cached;
  const request = findPlacePhoto(place.name, place.location ?? "", place.latitude, place.longitude, place.sourceUrl)
    .then((photo) => !!photo)
    // A failed lookup (throttled, offline) is tried again next time instead of hiding the place for the session.
    .catch(() => { photoReadyCache.delete(key); return false; });
  photoReadyCache.set(key, request);
  return request;
}

/**
 * Keeps the places that have a photo. Most are confirmed in bulk from their Wikipedia articles; only when that leaves
 * too few does each remaining place get its own (slower) search, and only until there are enough or time runs out.
 */
const later = <T,>(ms: number, value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

/**
 * Keeps the places that have a photo. Most are confirmed in bulk from their Wikipedia articles; only when that leaves
 * too few does each remaining place get its own (slower) search. The whole check gives up after about 8 seconds
 * (Wikimedia may be throttling): the list then also shows unchecked places rather than nothing, and `complete` is
 * false so it is not kept for long.
 */
async function keepPhotoBackedPlaces(places: NearbyPlace[]): Promise<{ places: NearbyPlace[]; complete: boolean }> {
  // Places that link a Wikidata item or a Wikipedia article are the notable ones and confirm their photo in bulk, so
  // they are checked first; the source order (nearest first) is restored afterwards.
  const notable = (place: NearbyPlace) => place.source === "Wikipedia" || !!place.wikidata || !!place.commonsFile;
  const candidates = [...places.filter(notable), ...places.filter((place) => !notable(place))].slice(0, 200);
  const deadline = Date.now() + 9000;
  const bulk = await Promise.race([
    prefetchPlacePhotos(candidates.map((place) => ({ name: place.name, location: place.location ?? "", latitude: place.latitude, longitude: place.longitude, sourceUrl: place.sourceUrl, wikidata: place.wikidata, commonsFile: place.commonsFile })))
      .catch(() => candidates.map(() => false)),
    later(deadline - Date.now(), null),
  ]);
  // Wikipedia places are only listed when their article has a free lead image, so they need no check of their own:
  // a check that Wikimedia throttled must not hide them.
  const ready = new Set(candidates.filter((place, index) => place.source === "Wikipedia" || bulk?.[index]));
  let complete = !!bulk;
  const rest = candidates.filter((place) => !ready.has(place));
  for (let start = 0; complete && start < rest.length && ready.size < 40; start += 8) {
    if (Date.now() >= deadline) { complete = false; break; }
    const batch = rest.slice(start, start + 8);
    const results = await Promise.race([
      Promise.all(batch.map(async (place) => ({ place, ok: await hasVerifiedPhoto(place) }))),
      later(Math.max(0, deadline - Date.now()), null),
    ]);
    if (!results) { complete = false; break; }
    for (const result of results) if (result.ok) ready.add(result.place);
  }
  // Keep the source's order (nearest or best-known first) rather than the order the photos were confirmed in.
  const verified = places.filter((place) => ready.has(place));
  if (complete || verified.length >= 20) return { places: verified.slice(0, 150), complete };
  return { places: [...verified, ...places.filter((place) => candidates.includes(place) && !ready.has(place))].slice(0, 60), complete: false };
}

/**
 * The places of a city or district: inside its outline when OpenStreetMap has one, otherwise within a radius that
 * suits its size. The outline also tells how wide the search must be to cover all of it.
 */
export async function loadCityPlaces(city: Center & { id: string; name: string; population?: number }, countryName: string, fallbackKm?: number) {
  const boundary = await loadCityBoundary(city, countryName).catch(() => null);
  return loadNearbyPlaces(city, boundary ? boundaryRadiusKm(boundary, city) : fallbackKm ?? fallbackRadiusKm(city.population ?? 0), boundary);
}

export function isExplorePlace(properties: { osm_key?: string; osm_value?: string } | undefined): boolean {
  if (!properties?.osm_key || !properties.osm_value) return false;
  return isAttraction(properties.osm_key, properties.osm_value);
}

function distanceKm(a: Center, b: Center) {
  const radians = Math.PI / 180;
  const lat = (b.latitude - a.latitude) * radians;
  const lon = (b.longitude - a.longitude) * radians;
  const arc = Math.sin(lat / 2) ** 2 + Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * Math.sin(lon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(arc));
}

function validCoordinates(latitude: number, longitude: number) {
  return Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
}

function osmCategory(tags: Record<string, string>) {
  if (tags.tourism === "museum" || tags.tourism === "gallery" || tags.amenity === "arts_centre" || tags.amenity === "planetarium") return "Museums";
  if (tags.natural === "beach") return "Beaches";
  if (tags.amenity === "marketplace") return "Food & Markets";
  if (tags.natural || tags.leisure === "park" || tags.leisure === "nature_reserve" || tags.leisure === "garden") return "Nature";
  return "Landmarks";
}

function isAttraction(key: string, value: string) {
  return attractionKinds[key]?.includes(value) ?? false;
}

export function parseOsmPlaces(elements: OsmElement[], center: Center, radiusKm: number): NearbyPlace[] {
  // One landmark is often mapped several times (a node, its outline, its ruins); the same name within a kilometre is the same place.
  const seen = new Map<string, Center[]>();
  return elements.flatMap((element) => {
    const latitude = element.lat ?? element.center?.lat;
    const longitude = element.lon ?? element.center?.lon;
    const name = element.tags?.name?.trim();
    if (!name || latitude === undefined || longitude === undefined || !validCoordinates(latitude, longitude)) return [];
    const distance = distanceKm(center, { latitude, longitude });
    if (distance > radiusKm) return [];
    const key = name.toLocaleLowerCase();
    const point = { latitude, longitude };
    if (seen.get(key)?.some((other) => distanceKm(other, point) < 1)) return [];
    seen.set(key, [...(seen.get(key) ?? []), point]);
    const category = osmCategory(element.tags!);
    return [{
      id: `osm:${element.type}:${element.id}`, name, latitude, longitude, kind: "place" as const,
      category, detail: `${category} · ${distance.toFixed(1)} km away`, source: "OpenStreetMap" as const,
      sourceUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
      ...(element.tags?.city && element.tags?.country ? { location: `${element.tags.city}, ${element.tags.country}` } : {}),
      ...(wikidataId(element.tags?.wikidata) ? { wikidata: wikidataId(element.tags?.wikidata) } : {}),
    }];
  }).sort((a, b) => distanceKm(center, a) - distanceKm(center, b)).slice(0, 400);
}

/**
 * The Commons file an OpenStreetMap tag names: `wikimedia_commons=File:X.jpg`, or an `image` link to a Commons file
 * page or upload. Categories, other hosts and non-photos are ignored.
 */
export function commonsFileTag(value: string | undefined): string | undefined {
  const text = value?.trim().split(";")[0]?.trim();
  if (!text) return undefined;
  let file: string | undefined;
  if (/^File:/i.test(text)) file = text.slice(5);
  else {
    try {
      const url = new URL(text);
      if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
      if (url.hostname === "commons.wikimedia.org") file = decodeURIComponent(url.pathname).match(/^\/wiki\/File:(.+)$/i)?.[1];
      else if (url.hostname === "upload.wikimedia.org") file = decodeURIComponent(url.pathname).match(/\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/]+)/)?.[1];
    } catch {
      return undefined;
    }
  }
  file = file?.replace(/_/g, " ").trim();
  return file && /\.(?:jpe?g|png|webp)$/i.test(file) ? file : undefined;
}

function wikidataId(value: string | undefined) {
  return value && /^Q\d+$/.test(value.trim()) ? value.trim() : undefined;
}

/**
 * Photon leaves out OpenStreetMap's tags, so the Wikidata items of its places are read from Nominatim, up to 50 in one
 * request. When it is slow or down the places come back as they were and photos fall back to the search by name.
 */
export async function withWikidata(places: NearbyPlace[], limit = 50): Promise<NearbyPlace[]> {
  const missing = places.slice(0, limit).filter((place) => !place.wikidata && place.id.startsWith("osm:"));
  let result = places;
  // Nominatim takes 50 objects a request and asks for one request a second.
  for (let start = 0; start < missing.length; start += 50) {
    if (start) await wait(1000);
    result = await wikidataBatch(result, missing.slice(start, start + 50));
  }
  return result;
}

async function wikidataBatch(places: NearbyPlace[], missing: NearbyPlace[]): Promise<NearbyPlace[]> {
  const types = { node: "N", way: "W", relation: "R" } as Record<string, string>;
  if (!missing.length) return places;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const url = new URL("https://nominatim.openstreetmap.org/lookup");
    url.searchParams.set("osm_ids", missing.map((place) => { const [, type, id] = place.id.split(":"); return `${types[type]}${id}`; }).join(","));
    url.searchParams.set("format", "json");
    url.searchParams.set("extratags", "1");
    const response = await fetch(url.toString(), { headers: overpassHeaders, signal: controller.signal });
    if (!response.ok) return places;
    const data: { osm_type?: string; osm_id?: number; extratags?: Record<string, string> | null }[] = await response.json();
    const items = new Map<string, { wikidata?: string; commonsFile?: string }>((Array.isArray(data) ? data : []).flatMap((element) => {
      const item = wikidataId(element.extratags?.wikidata);
      const file = commonsFileTag(element.extratags?.wikimedia_commons) ?? commonsFileTag(element.extratags?.image);
      return item || file ? [[`osm:${element.osm_type}:${element.osm_id}`, { ...(item ? { wikidata: item } : {}), ...(file ? { commonsFile: file } : {}) }] as const] : [];
    }));
    return items.size ? places.map((place) => items.has(place.id) ? { ...place, ...items.get(place.id) } : place) : places;
  } catch {
    return places;
  } finally {
    clearTimeout(timeout);
  }
}

export function parsePhotonPlaces(features: PhotonFeature[], center: Center, radiusKm: number): NearbyPlace[] {
  const types = { N: "node", W: "way", R: "relation" } as const;
  return parseOsmPlaces(features.filter((feature) => isAttraction(feature.properties.osm_key, feature.properties.osm_value))
    .map((feature) => ({
      type: types[feature.properties.osm_type], id: feature.properties.osm_id,
      lat: feature.geometry.coordinates[1], lon: feature.geometry.coordinates[0],
      tags: { name: feature.properties.name ?? "", city: feature.properties.city ?? "", country: feature.properties.country ?? "", [feature.properties.osm_key]: feature.properties.osm_value },
    })), center, radiusKm);
}

const visitableDescription = /\b(?:museum|gallery|cathedral|church|chapel|mosque|temple|shrine|palace|castle|fortress|fort|monument|memorial|landmark|tower|bridge|garden|park|square|fountain|statue|sculpture|amphitheat\w*|theat\w*|ruins?|archaeolog\w*|heritage|beach|island|mountain|peak|waterfall|canyon|cave|lake|forest|reserve|viewpoint|observatory|zoo|aquarium|botanical|attraction|abbey|basilica|monastery|synagogue|pagoda|promenade|volcano|cliff|fjord|glacier|reef)\b/i;
const nonDestinationDescription = /\b(?:station|airport|hospital|school|university|company|organization|film|novel|album|battle|war|festival|election|constituency|municipality|district|neighborhood|suburb|restaurant|hotel|shopping|department store)\b/i;
const settlementDescription = /^(?:capital\b|(?:(?:port|largest)\s+)?city\b|town\b|village\b|country\b|sovereign state\b|municipality\b|commune\b)/i;

function wikipediaCategory(description: string): string {
  if (/\b(?:museum|gallery)\b/i.test(description)) return "Museums";
  if (/\bbeach\b/i.test(description)) return "Beaches";
  if (/\b(?:park|garden|reserve|island|mountain|peak|waterfall|canyon|cave|lake|forest|volcano|cliff|fjord|glacier|reef)\b/i.test(description)) return "Nature";
  return "Landmarks";
}

/**
 * "Brașov, Romania" for a point, from the nearest known city. Wikipedia articles carry no town of their own, and
 * without one a card fell back to the trip's destination and showed a Romanian castle as being in Paris.
 */
function locationAt(latitude: number, longitude: number) {
  const city = nearestCity(latitude, longitude);
  const country = city && countryForCode(city.countryCode);
  return city && country ? `${city.name}, ${country.name}` : undefined;
}

export function parseWikipediaPlaces(items: WikiPlace[], center: Center, radiusKm: number, includeSettlements = false,
  { language = "en", descriptions }: { language?: string; descriptions?: Map<string, string> } = {}): NearbyPlace[] {
  return items.flatMap((item) => {
    const latitude = item.coordinates?.[0]?.lat ?? item.lat;
    const longitude = item.coordinates?.[0]?.lon ?? item.lon;
    const wikidata = wikidataId(item.pageprops?.wikibase_item);
    // Local-language articles rarely carry an English short description; their Wikidata item's English one stands in.
    const description = (wikidata && descriptions?.get(wikidata)) || (language === "en" ? item.pageprops?.["wikibase-shortdesc"] ?? "" : "");
    const settlement = includeSettlements && settlementDescription.test(description);
    if (!item.title.trim() || !item.pageprops?.page_image_free || (!settlement &&
      (!visitableDescription.test(description) || nonDestinationDescription.test(description))) || latitude === undefined || longitude === undefined ||
      !validCoordinates(latitude, longitude) || distanceKm(center, { latitude, longitude }) > radiusKm) return [];
    return [{ id: language === "en" ? `wiki:${item.pageid}` : `wiki:${language}:${item.pageid}`,
      // "Biserica Sfântul Mihail (Cluj)": the parenthesis only tells namesakes apart.
      name: language === "en" ? item.title : item.title.replace(/\s*\([^)]*\)\s*$/, "") || item.title,
      latitude, longitude, kind: "place" as const,
      category: settlement ? /\b(?:country|sovereign state)\b/i.test(description) ? "Country" : "City" : wikipediaCategory(description),
      detail: "Wikipedia article", source: "Wikipedia" as const, location: locationAt(latitude, longitude),
      sourceUrl: `https://${language}.wikipedia.org/?curid=${item.pageid}`, ...(wikidata ? { wikidata } : {}) }];
  }).slice(0, 200);
}

export async function searchWikipediaPlaces(query: string, center: Center, radiusKm: number, includeSettlements = false): Promise<NearbyPlace[]> {
  const key = `${query.trim().toLowerCase()}|${center.latitude.toFixed(3)}|${center.longitude.toFixed(3)}|${radiusKm}|${includeSettlements}`;
  const cached = wikipediaSearchCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.places;
  const params = new URLSearchParams({ action: "query", generator: "search", gsrsearch: query.trim(),
    // `coordinates` answers for 10 pages unless `colimit` says otherwise; the rest would come back without a position.
    gsrlimit: "30", prop: "coordinates|pageprops", colimit: "max", format: "json", origin: "*" });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, { headers: wikipediaHeaders, signal: controller.signal });
    if (!response.ok) throw new Error("Wikipedia place search is unavailable.");
    const data: { query?: { pages?: Record<string, WikiPlace> } } = await response.json();
    const places = parseWikipediaPlaces(Object.values(data.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0)), center, radiusKm, includeSettlements);
    wikipediaSearchCache.set(key, { places, expiresAt: Date.now() + 30 * 60 * 1000 });
    return places;
  } finally {
    clearTimeout(timeout);
  }
}

// Wikipedia, like Wikimedia's image servers, refuses generic User-Agents such as Android's "okhttp".
const wikipediaHeaders: Record<string, string> = { "User-Agent": "GoWorth/1.0 (travel app)" };

/** Overpass turns away requests without an identifying User-Agent (browsers keep their own). */
/** Overpass and Nominatim both ask clients to identify themselves. */
const overpassHeaders = { Accept: "application/json", "User-Agent": "GoWorth/1.0 (travel app)" };

// The main Overpass server is often overloaded (502/504); public mirrors serve the same data.
const overpassServers = ["https://overpass-api.de", "https://overpass.kumi.systems", "https://overpass.private.coffee"];
let overpassPreferred = 0;

/**
 * Runs an Overpass query, trying the mirrors in turn from the last one that answered, within `timeoutMs` overall.
 * Throws when none answers, so callers can tell "no data" from "unreachable".
 */
async function overpassQuery(query: string, timeoutMs: number): Promise<{ elements?: OsmElement[] }> {
  const deadline = Date.now() + timeoutMs;
  for (let attempt = 0; attempt < overpassServers.length; attempt++) {
    const index = (overpassPreferred + attempt) % overpassServers.length;
    const remaining = deadline - Date.now();
    if (remaining <= 300) break;
    const controller = new AbortController();
    // A mirror gets at most half the time left, so a hanging one leaves room for the next.
    const timer = setTimeout(() => controller.abort(), attempt === overpassServers.length - 1 ? remaining : remaining / 2);
    try {
      const url = new URL(`${overpassServers[index]}/api/interpreter`);
      url.searchParams.set("data", query);
      const response = await fetch(url.toString(), { headers: overpassHeaders, signal: controller.signal });
      if (!response.ok) continue;
      const data: { elements?: OsmElement[] } = await response.json();
      overpassPreferred = index;
      return data;
    } catch {
      // Unreachable or too slow: the next mirror is tried.
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("OpenStreetMap is unavailable.");
}

async function overpassPlaces(center: Center, radiusKm: number) {
  const radius = Math.round(radiusKm * 1000);
  const around = `around:${radius},${center.latitude},${center.longitude}`;
  const query = `[out:json][timeout:15];(` +
    `nwr(${around})["tourism"~"^(attraction|museum|gallery|viewpoint|zoo|theme_park|aquarium)$"]["name"];` +
    `nwr(${around})["tourism"="artwork"]["name"]["wikidata"];` +
    `nwr(${around})["historic"~"^(castle|fort|archaeological_site|monument|memorial|ruins|palace|manor|monastery|city_gate|tower|citywalls|aqueduct|ship)$"]["name"];` +
    `nwr(${around})["historic"~"^(church|building)$"]["name"]["wikidata"];` +
    `nwr(${around})["natural"~"^(peak|waterfall|cave_entrance|beach|volcano|glacier|cliff|arch|hot_spring|gorge)$"]["name"];` +
    `nwr(${around})["leisure"~"^(park|nature_reserve|garden)$"]["name"];` +
    `nwr(${around})["amenity"~"^(marketplace|theatre|arts_centre|planetarium)$"]["name"];` +
    `nwr(${around})["amenity"~"^(place_of_worship|fountain)$"]["name"]["wikidata"];` +
    `nwr(${around})["man_made"="lighthouse"]["name"];` +
    `);out center 600;`;
  const data = await overpassQuery(query, 9000);
  return parseOsmPlaces(data.elements ?? [], center, radiusKm);
}

export function photonBoundingBoxes(center: Center, radiusKm: number): number[][] {
  const latDelta = radiusKm / 111;
  const lonDelta = radiusKm / (111 * Math.max(0.2, Math.cos(center.latitude * Math.PI / 180)));
  const west = center.longitude - lonDelta;
  const east = center.longitude + lonDelta;
  return west < -180
    ? [[west + 360, center.latitude - latDelta, 180, center.latitude + latDelta], [-180, center.latitude - latDelta, east, center.latitude + latDelta]]
    : east > 180
      ? [[west, center.latitude - latDelta, 180, center.latitude + latDelta], [-180, center.latitude - latDelta, east - 360, center.latitude + latDelta]]
      : [[west, center.latitude - latDelta, east, center.latitude + latDelta]];
}

async function photonPlaces(center: Center, radiusKm: number) {
  const boxes = photonBoundingBoxes(center, radiusKm);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const requests = boxes.flatMap((box) => photonCategoryGroups.map(async (group) => {
      const url = new URL("https://photon.komoot.io/api/");
      for (const [key, value] of Object.entries({
        lat: String(center.latitude), lon: String(center.longitude),
        bbox: box.join(","), include: group.join(","), limit: "50",
      })) url.searchParams.set(key, value);
      const response = await fetch(url.toString(), { signal: controller.signal });
      if (!response.ok) throw new Error("OpenStreetMap place search is unavailable.");
      const data: { features?: PhotonFeature[] } = await response.json();
      return data.features ?? [];
    }));
    const responses = await Promise.allSettled(requests);
    const features = responses.flatMap((result) => result.status === "fulfilled" ? result.value : []);
    if (responses.every((result) => result.status === "rejected")) throw new Error("OpenStreetMap place search is unavailable.");
    return parsePhotonPlaces(features, center, radiusKm);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Wikipedia's geosearch reaches 10 km at most, so a wider area is covered by a ring of searches around its centre as
 * well; the same article found twice is kept once.
 */
async function wikipediaPlaces(center: Center, radiusKm: number) {
  const points = [center];
  if (radiusKm > 10) {
    const offset = Math.min(radiusKm - 5, 15);
    const lonScale = 111 * Math.max(0.2, Math.cos(center.latitude * Math.PI / 180));
    for (let step = 0; step < 6; step++) {
      const angle = step * Math.PI / 3;
      points.push({ latitude: center.latitude + offset * Math.sin(angle) / 111, longitude: center.longitude + offset * Math.cos(angle) / lonScale });
    }
  }
  // English Wikipedia covers the famous sights; the country's own Wikipedia has many more (most Romanian churches,
  // fortresses and museums have a Romanian article and no English one).
  const local = localWikipedia(center);
  const languages = local && local !== "en" ? ["en", local] : ["en"];
  const lists = await Promise.allSettled(languages.flatMap((language) => points.map((point) => wikipediaPlacesAround(point, center, radiusKm, language))));
  if (lists.every((list) => list.status === "rejected")) throw new Error("Nearby places are unavailable.");
  // The same sight found in both languages, or from two search points, is kept once; English comes first.
  const seen = new Set<string>();
  return lists.flatMap((list) => list.status === "fulfilled" ? list.value : [])
    .filter((place) => {
      const keys = [place.id, ...(place.wikidata ? [place.wikidata] : [])];
      if (keys.some((key) => seen.has(key))) return false;
      for (const key of keys) seen.add(key);
      return true;
    })
    .sort((a, b) => distanceKm(center, a) - distanceKm(center, b));
}

/** The Wikipedia language of the country a point is in, for the countries whose own Wikipedia is large. */
const countryWikipedia: Record<string, string> = {
  RO: "ro", MD: "ro", FR: "fr", MC: "fr", LU: "fr", DE: "de", AT: "de", LI: "de", CH: "de", IT: "it", SM: "it", VA: "it",
  ES: "es", AD: "ca", PT: "pt", BR: "pt", NL: "nl", BE: "nl", PL: "pl", CZ: "cs", SK: "sk", HU: "hu", BG: "bg",
  GR: "el", CY: "el", HR: "hr", RS: "sr", SI: "sl", BA: "sh", ME: "sr", MK: "mk", AL: "sq", UA: "uk", RU: "ru",
  BY: "be", LT: "lt", LV: "lv", EE: "et", SE: "sv", NO: "no", DK: "da", FI: "fi", IS: "is", TR: "tr", GE: "ka",
  AM: "hy", IL: "he", JP: "ja", CN: "zh", TW: "zh", KR: "ko", VN: "vi", TH: "th", ID: "id", IR: "fa",
  MX: "es", AR: "es", CL: "es", CO: "es", PE: "es", VE: "es", EC: "es", BO: "es", UY: "es", PY: "es", CU: "es",
  CR: "es", PA: "es", GT: "es", DO: "es", EG: "ar", MA: "fr", TN: "fr", DZ: "fr",
};
function localWikipedia(center: Center) {
  const code = nearestCity(center.latitude, center.longitude)?.countryCode;
  return code ? countryWikipedia[code] : undefined;
}

/**
 * English descriptions of Wikidata items, 50 a request, so local-language articles can be told apart (a church, not a
 * school or a footballer) by the same rules as English ones.
 */
async function wikidataDescriptions(ids: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const chunks = Array.from({ length: Math.ceil(ids.length / 50) }, (_, index) => ids.slice(index * 50, index * 50 + 50));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    await Promise.allSettled(chunks.map(async (chunk) => {
      const url = new URL("https://www.wikidata.org/w/api.php");
      for (const [key, value] of Object.entries({ action: "wbgetentities", ids: chunk.join("|"), props: "descriptions",
        languages: "en", format: "json", origin: "*" })) url.searchParams.set(key, value);
      const response = await fetch(url.toString(), { headers: wikipediaHeaders, signal: controller.signal });
      if (!response.ok) return;
      const data: { entities?: Record<string, { descriptions?: { en?: { value?: string } } }> } = await response.json();
      for (const [id, entity] of Object.entries(data.entities ?? {})) {
        const description = entity.descriptions?.en?.value;
        if (description) result.set(id, description);
      }
    }));
  } finally {
    clearTimeout(timeout);
  }
  return result;
}

async function wikipediaPlacesAround(point: Center, center: Center, radiusKm: number, language = "en") {
  const url = new URL(`https://${language}.wikipedia.org/w/api.php`);
  for (const [key, value] of Object.entries({
    action: "query", generator: "geosearch", ggscoord: `${point.latitude}|${point.longitude}`,
    ggsradius: String(Math.min(10000, Math.round(radiusKm * 1000))), ggslimit: "500",
    // Without `colimit` only 10 of the pages found come back with coordinates, and the others are dropped.
    prop: "coordinates|pageprops", colimit: "max", format: "json", origin: "*",
  })) url.searchParams.set(key, value);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(url.toString(), { headers: wikipediaHeaders, signal: controller.signal });
    if (!response.ok) throw new Error("Nearby places are unavailable.");
    const data: { query?: { pages?: Record<string, WikiPlace> } } = await response.json();
    const pages = Object.values(data.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    if (language === "en") return parseWikipediaPlaces(pages, center, radiusKm);
    // Only articles with a free lead photo can be listed, so only their items need a description.
    const ids = [...new Set(pages.flatMap((page) => page.pageprops?.page_image_free ? [wikidataId(page.pageprops.wikibase_item)].filter((id): id is string => !!id) : []))];
    return parseWikipediaPlaces(pages, center, radiusKm, false, { language, descriptions: await wikidataDescriptions(ids) });
  } finally {
    clearTimeout(timeout);
  }
}

function comparableName(name: string) {
  // Wikipedia titles often carry their city ("Bob Church, Cluj-Napoca"), which OpenStreetMap names leave out.
  return name.split(",")[0].normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim().toLocaleLowerCase();
}

/**
 * OpenStreetMap and Wikipedia places as one list, nearest first. A Wikipedia article is left out when OpenStreetMap
 * already has the place: the same name within a kilometre, or anything within 40 metres.
 */
/** Places from any source without a town get the nearest one, so no card borrows the trip's destination instead. */
const withLocations = (places: NearbyPlace[]) => places.map((place) => place.location ? place : { ...place, location: locationAt(place.latitude, place.longitude) });

export function mergeSourcePlaces(osm: NearbyPlace[], wiki: NearbyPlace[], center: Center): NearbyPlace[] {
  const extra = wiki.filter((article) => !osm.some((place) => {
    if (place.wikidata && place.wikidata === article.wikidata) return true;
    const distance = distanceKm(place, article);
    return distance < 0.04 || distance < 1 && comparableName(place.name) === comparableName(article.name);
  }));
  return [...osm, ...extra].sort((a, b) => distanceKm(center, a) - distanceKm(center, b));
}

/** `within` keeps only places inside an area's outline, such as a city district, before their photos are checked. */
export async function loadNearbyPlaces(center: Center, radiusKm = 8, within?: Boundary | null): Promise<NearbyPlace[]> {
  const radius = Math.max(1, Math.min(radiusKm, 25));
  const key = `${center.latitude.toFixed(3)}|${center.longitude.toFixed(3)}|${radius}|${within?.id ?? ""}`;
  const saved = cache.get(key);
  if (saved && saved.expiresAt > Date.now()) return saved.places;
  const current = pending.get(key);
  if (current) return current;
  const request = (async () => {
    const inside = (places: NearbyPlace[]) => within ? places.filter((place) => insideBoundary(within, place)) : places;
    // Wikipedia is asked alongside OpenStreetMap: its landmarks fill in cities OpenStreetMap maps thinly, and keep the
    // list going while Photon or Overpass are down. A source that failed is `null`, unlike one that found nothing.
    const wiki = wikipediaPlaces(center, radius).then(inside).catch(() => null);
    const osmRequest = (async () => {
      const photon = await photonPlaces(center, radius).catch(() => null);
      return photon?.length ? photon : await overpassPlaces(center, radius).catch(() => photon);
    })();
    const wikiInside = await wiki;
    // When Wikipedia alone already fills the list, OpenStreetMap gets a short grace rather than holding everything up
    // while its servers are busy; the list is then marked incomplete and asked for again soon.
    const osm = wikiInside && wikiInside.length >= 12 ? await Promise.race([osmRequest, later(2500, null)]) : await osmRequest;
    const osmInside = osm ? inside(osm) : null;
    // Nothing answered (offline, every provider busy): fail so the screen offers a retry instead of caching an empty list.
    if (!osmInside && !wikiInside) throw new Error("Nearby places are unavailable.");
    const rawPlaces = mergeSourcePlaces(osmInside?.length ? await withWikidata(osmInside, 100) : [], wikiInside ?? [], center);
    const { places: checked, complete } = await keepPhotoBackedPlaces(rawPlaces);
    const places = withLocations(checked);
    // A list missing one of its sources is kept only briefly, so the next visit tries that source again.
    cache.set(key, { places, expiresAt: Date.now() + (complete && osmInside && wikiInside ? 30 : 2) * 60 * 1000 });
    return places;
  })().finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

const venueCategories: Record<VenueKind, string> = {
  restaurant: "Restaurants", bar: "Bars & Pubs", cafe: "Cafés", nightclub: "Nightlife",
};
const venueAmenities: Record<string, VenueKind> = { restaurant: "restaurant", bar: "bar", pub: "bar", cafe: "cafe", nightclub: "nightclub" };

function titleCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/**
 * Restaurants, bars, cafés and clubs from OpenStreetMap. There are no ratings, so the best-described venues come first:
 * opening hours, cuisine, a website or outdoor seating suggest a real, maintained place; chains sink to the bottom.
 */
export function parseOsmVenues(elements: OsmElement[], center: Center, radiusKm: number, { limit = 40, location }: { limit?: number; location?: (element: OsmElement) => string | undefined } = {}): NearbyPlace[] {
  const seen = new Set<string>();
  const ranked = elements.flatMap((element, order) => {
    const tags = element.tags ?? {};
    const kind = venueAmenities[tags.amenity ?? ""];
    const latitude = element.lat ?? element.center?.lat;
    const longitude = element.lon ?? element.center?.lon;
    const name = tags.name?.trim();
    if (!kind || !name || latitude === undefined || longitude === undefined || !validCoordinates(latitude, longitude)) return [];
    const distance = distanceKm(center, { latitude, longitude });
    if (distance > radiusKm) return [];
    const key = `${name.toLocaleLowerCase()}|${latitude.toFixed(3)}|${longitude.toFixed(3)}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const terrace = tags.outdoor_seating === "yes";
    const cuisine = tags.cuisine?.split(";")[0]?.trim();
    const address = [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" ");
    const category = venueCategories[kind];
    const score = (tags.opening_hours ? 2 : 0) + (cuisine ? 2 : 0) + (tags.website || tags["contact:website"] ? 1 : 0)
      + (tags.phone || tags["contact:phone"] ? 1 : 0) + (terrace ? 1 : 0) + (tags.wikidata && !tags.brand ? 2 : 0)
      - (tags.brand || tags["brand:wikidata"] ? 4 : 0);
    const place: NearbyPlace = {
      id: `osm:${element.type}:${element.id}`, name, latitude, longitude, kind: "place",
      category, detail: `${category} · ${distance.toFixed(1)} km away`, source: "OpenStreetMap",
      sourceUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
      venue: { kind, terrace, ...(cuisine ? { cuisine: titleCase(cuisine) } : {}), ...(tags.opening_hours ? { openingHours: tags.opening_hours } : {}), ...(address ? { address } : {}) },
    };
    const where = location?.(element) ?? tags["addr:city"];
    if (where) place.location = where;
    return [{ place, score, order }];
  });
  // Equal scores keep the source's order: Photon lists the best-known venues first.
  return ranked.sort((a, b) => b.score - a.score || a.order - b.order).slice(0, limit).map((item) => item.place);
}

/** The venues a set of discovery filters lets through: a matching kind, or outdoor seating when terraces are on. */
export function filterVenues(places: NearbyPlace[], filters: VenueFilter[]) {
  return places.filter((place) => place.venue && (filters.includes(place.venue.kind) || filters.includes("terrace") && place.venue.terrace));
}

/**
 * Photon is quick and lists well-known venues first, but carries no tags such as cuisine or outdoor seating. Each kind
 * is asked for separately and the results alternate, so famous restaurants do not crowd out bars, cafés and clubs.
 */
async function photonVenues(center: Center, radiusKm: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  const types = { N: "node", W: "way", R: "relation" } as const;
  const locations = new Map<string, string>();
  try {
    const groups = await Promise.allSettled([["restaurant"], ["bar", "pub"], ["cafe"], ["nightclub"]].map(async (amenities) => {
      const url = new URL("https://photon.komoot.io/api/");
      for (const [key, value] of Object.entries({
        lat: String(center.latitude), lon: String(center.longitude), bbox: photonBoundingBoxes(center, radiusKm)[0].join(","),
        include: amenities.map((value) => `osm.amenity.${value}`).join(","), limit: "25",
      })) url.searchParams.set(key, value);
      const response = await fetch(url.toString(), { signal: controller.signal });
      if (!response.ok) throw new Error("OpenStreetMap venues are unavailable.");
      const data: { features?: PhotonFeature[] } = await response.json();
      return (data.features ?? []).filter((feature) => feature.properties.osm_key === "amenity").map((feature): OsmElement => {
        const element: OsmElement = {
          type: types[feature.properties.osm_type], id: feature.properties.osm_id,
          lat: feature.geometry.coordinates[1], lon: feature.geometry.coordinates[0],
          tags: {
            name: feature.properties.name ?? "", amenity: feature.properties.osm_value,
            ...(feature.properties.street ? { "addr:street": feature.properties.street } : {}),
            ...(feature.properties.housenumber ? { "addr:housenumber": feature.properties.housenumber } : {}),
          },
        };
        if (feature.properties.city && feature.properties.country) locations.set(`${element.type}:${element.id}`, `${feature.properties.city}, ${feature.properties.country}`);
        return element;
      });
    }));
    if (groups.every((group) => group.status === "rejected")) throw new Error("OpenStreetMap venues are unavailable.");
    const lists = groups.map((group) => group.status === "fulfilled" ? group.value : []);
    const elements = Array.from({ length: Math.max(...lists.map((list) => list.length)) }, (_, index) => lists.flatMap((list) => list[index] ? [list[index]] : [])).flat();
    const location = (element: OsmElement) => locations.get(`${element.type}:${element.id}`);
    return { elements, location, places: parseOsmVenues(elements, center, radiusKm, { location }) };
  } finally {
    clearTimeout(timeout);
  }
}

/** Fills in cuisine, opening hours and outdoor seating for known venues by ID; a quick lookup, skipped when Overpass is busy. */
async function overpassVenueTags(places: NearbyPlace[]) {
  const ids = { node: [] as string[], way: [] as string[], relation: [] as string[] };
  for (const place of places) {
    const [, type, id] = place.id.split(":") as [string, keyof typeof ids, string];
    ids[type]?.push(id);
  }
  const query = `[out:json][timeout:8];(${Object.entries(ids).filter(([, list]) => list.length).map(([type, list]) => `${type}(id:${list.join(",")});`).join("")});out tags;`;
  const data = await overpassQuery(query, 4000).catch(() => null);
  return new Map((data?.elements ?? []).map((element) => [`osm:${element.type}:${element.id}`, element.tags ?? {}]));
}

/**
 * Cuisine, opening hours and outdoor seating for known venues, from Nominatim: one request for up to 50 of them, and
 * it answers when Overpass, the other source of these tags, is overloaded.
 */
async function nominatimVenueTags(places: NearbyPlace[]) {
  const types = { node: "N", way: "W", relation: "R" } as Record<string, string>;
  const ids = places.slice(0, 50).map((place) => { const [, type, id] = place.id.split(":"); return types[type] ? `${types[type]}${id}` : ""; }).filter(Boolean);
  if (!ids.length) return new Map<string, Record<string, string>>();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const url = new URL("https://nominatim.openstreetmap.org/lookup");
    url.searchParams.set("osm_ids", ids.join(","));
    url.searchParams.set("format", "json");
    url.searchParams.set("extratags", "1");
    const response = await fetch(url.toString(), { headers: overpassHeaders, signal: controller.signal });
    if (!response.ok) throw new Error("Nominatim is unavailable.");
    const data: { osm_type?: string; osm_id?: number; extratags?: Record<string, string> | null }[] = await response.json();
    return new Map((Array.isArray(data) ? data : []).map((item) => [`osm:${item.osm_type}:${item.osm_id}`, item.extratags ?? {}]));
  } finally {
    clearTimeout(timeout);
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Venues from Nominatim's search, the last resort when Photon and Overpass both fail. Nominatim allows one request a
 * second, so the kinds are asked for in turn; each answer carries the full tags, outdoor seating included.
 */
async function nominatimVenues(center: Center, radiusKm: number) {
  const dLat = radiusKm / 111, dLon = radiusKm / (111 * Math.max(0.2, Math.cos(center.latitude * Math.PI / 180)));
  const viewbox = [center.longitude - dLon, center.latitude + dLat, center.longitude + dLon, center.latitude - dLat].map((value) => value.toFixed(4)).join(",");
  const types = { node: "node", way: "way", relation: "relation" } as Record<string, OsmElement["type"]>;
  const elements: OsmElement[] = [];
  let answered = false;
  for (const [index, amenity] of ["restaurant", "bar", "cafe", "nightclub"].entries()) {
    if (index) await wait(1100);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      for (const [key, value] of Object.entries({ q: `[${amenity}]`, format: "jsonv2", viewbox, bounded: "1", limit: "25", extratags: "1", addressdetails: "1" })) url.searchParams.set(key, value);
      const response = await fetch(url.toString(), { headers: overpassHeaders, signal: controller.signal });
      if (!response.ok) continue;
      answered = true;
      const data: { osm_type?: string; osm_id?: number; lat?: string; lon?: string; name?: string; type?: string; extratags?: Record<string, string> | null; address?: Record<string, string> }[] = await response.json();
      for (const item of Array.isArray(data) ? data : []) {
        const type = types[item.osm_type ?? ""];
        if (!type || !item.osm_id || !item.name) continue;
        elements.push({ type, id: item.osm_id, lat: Number(item.lat), lon: Number(item.lon), tags: {
          ...item.extratags, name: item.name, amenity: item.type ?? amenity,
          ...(item.address?.road ? { "addr:street": item.address.road } : {}),
          ...(item.address?.house_number ? { "addr:housenumber": item.address.house_number } : {}),
        } });
      }
    } catch {
      // This kind is skipped; the others may still answer.
    } finally {
      clearTimeout(timeout);
    }
  }
  if (!answered) throw new Error("OpenStreetMap venues are unavailable.");
  return parseOsmVenues(elements, center, radiusKm);
}

/** Venues straight from Overpass, with all their tags: used when Photon, the usual venue search, does not answer. */
async function overpassVenues(center: Center, radiusKm: number) {
  const around = `around:${Math.round(radiusKm * 1000)},${center.latitude},${center.longitude}`;
  const data = await overpassQuery(`[out:json][timeout:10];nwr(${around})["amenity"~"^(restaurant|bar|pub|cafe|nightclub)$"]["name"];out center 160;`, 9000);
  return parseOsmVenues(data.elements ?? [], center, radiusKm);
}

/** Venues around a point, within walking distance of it however wide the discovery radius is. */
export async function loadNearbyVenues(center: Center, radiusKm = 3): Promise<NearbyPlace[]> {
  const radius = Math.max(0.5, Math.min(radiusKm, 3));
  const key = `${center.latitude.toFixed(3)}|${center.longitude.toFixed(3)}|${radius}`;
  const saved = venueCache.get(key);
  if (saved && saved.expiresAt > Date.now()) return saved.places;
  const current = venuePending.get(key);
  if (current) return current;
  const request = (async () => {
    const photon = await photonVenues(center, radius).catch(() => null);
    if (!photon) {
      // Overpass already returns the full tags, so there is nothing to fill in afterwards.
      const venues = withLocations(await overpassVenues(center, radius).catch(() => nominatimVenues(center, radius)));
      venueCache.set(key, { places: venues, expiresAt: Date.now() + 10 * 60 * 1000 });
      return venues;
    }
    const { elements, location, places } = photon;
    const tags = !places.length ? new Map<string, Record<string, string>>()
      : await nominatimVenueTags(places).catch(() => overpassVenueTags(places).catch(() => new Map<string, Record<string, string>>()));
    const venues = withLocations(tags.size
      ? parseOsmVenues(elements.map((element) => ({ ...element, tags: { ...element.tags, ...tags.get(`osm:${element.type}:${element.id}`) } })), center, radius, { location })
      : places);
    venueCache.set(key, { places: venues, expiresAt: Date.now() + (tags.size ? 30 : 5) * 60 * 1000 });
    return venues;
  })().finally(() => venuePending.delete(key));
  venuePending.set(key, request);
  return request;
}

/** The venue a saved place is, from its category: saved places keep the category but not the venue details. */
export function venueFromCategory(category: string | undefined, details: Partial<Omit<Venue, "kind">> = {}): Venue | undefined {
  const kind = (Object.keys(venueCategories) as VenueKind[]).find((item) => venueCategories[item] === category);
  return kind ? { terrace: false, ...details, kind } : undefined;
}
