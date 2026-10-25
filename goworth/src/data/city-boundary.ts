/**
 * The administrative outline of a city or district, so its place list shows what is inside it rather than everything
 * within a fixed radius of its centre point (a radius around "Sector 6" covers half of Bucharest).
 */
export type Boundary = {
  id: string;
  /** Each polygon is a list of rings of [longitude, latitude]: the outline first, then any holes. */
  polygons: [number, number][][][];
  bbox: [west: number, south: number, east: number, north: number];
};

type Point = { latitude: number; longitude: number };
type NominatimResult = { osm_type?: string; osm_id?: number; category?: string; geojson?: { type: string; coordinates: unknown } };

const cache = new Map<string, Promise<Boundary | null>>();
let nextRequestAt = 0;
// Nominatim asks for at most one request a second and an identifying User-Agent (browsers keep their own).
const headers: Record<string, string> = typeof document === "undefined" ? { "User-Agent": "GoWorth/1.0 (travel app)" } : {};

function polygonsOf(geojson: NominatimResult["geojson"]): Boundary["polygons"] {
  if (geojson?.type === "Polygon") return [geojson.coordinates as [number, number][][]];
  if (geojson?.type === "MultiPolygon") return geojson.coordinates as [number, number][][][];
  return [];
}

function insideRing(ring: [number, number][], longitude: number, latitude: number) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > latitude) !== (yj > latitude) && longitude < ((xj - xi) * (latitude - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function insideBoundary(boundary: Pick<Boundary, "polygons" | "bbox">, point: Point) {
  const [west, south, east, north] = boundary.bbox;
  if (point.longitude < west || point.longitude > east || point.latitude < south || point.latitude > north) return false;
  // Inside the outline and outside its holes: an odd number of ring crossings.
  return boundary.polygons.some((rings) => rings.filter((ring) => insideRing(ring, point.longitude, point.latitude)).length % 2 === 1);
}

export function boundaryFromGeoJson(id: string, geojson: NominatimResult["geojson"]): Boundary | null {
  const polygons = polygonsOf(geojson).filter((rings) => rings[0]?.length >= 4);
  if (!polygons.length) return null;
  const points = polygons.flatMap((rings) => rings[0]);
  return { id, polygons, bbox: [Math.min(...points.map((p) => p[0])), Math.min(...points.map((p) => p[1])), Math.max(...points.map((p) => p[0])), Math.max(...points.map((p) => p[1]))] };
}

/** How far the boundary reaches from the centre, so a nearby search can cover all of it (capped for huge areas). */
export function boundaryRadiusKm(boundary: Boundary, center: Point) {
  const [west, south, east, north] = boundary.bbox;
  const km = (latitude: number, longitude: number) => Math.hypot((latitude - center.latitude) * 111,
    (longitude - center.longitude) * 111 * Math.cos(center.latitude * Math.PI / 180));
  return Math.min(25, Math.max(1, ...[[south, west], [south, east], [north, west], [north, east]].map(([lat, lon]) => km(lat, lon))));
}

/** A radius for cities without a known outline, from their size: a village is not searched as widely as a capital. */
export function fallbackRadiusKm(population: number) {
  return population >= 1_000_000 ? 10 : population >= 200_000 ? 6 : population >= 50_000 ? 4 : 3;
}

/**
 * The outline of `name` (a city, town or district) from OpenStreetMap. Of the matches, the one containing the city's
 * own coordinates wins, so a namesake elsewhere is never used. `null` when none is found.
 */
export function loadCityBoundary(city: Point & { id: string; name: string }, countryName: string): Promise<Boundary | null> {
  const cached = cache.get(city.id);
  if (cached) return cached;
  const request = (async () => {
    const wait = Math.max(0, nextRequestAt - Date.now());
    nextRequestAt = Date.now() + wait + 1100;
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    const params = new URLSearchParams({ q: `${city.name}, ${countryName}`, format: "jsonv2", polygon_geojson: "1", polygon_threshold: "0.0015", limit: "5" });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers, signal: controller.signal });
      if (!response.ok) throw new Error("City outline unavailable.");
      const results: NominatimResult[] = await response.json();
      for (const result of results) {
        const boundary = boundaryFromGeoJson(`${result.osm_type}:${result.osm_id}`, result.geojson);
        if (boundary && insideBoundary(boundary, city)) return boundary;
      }
      return null;
    } finally {
      clearTimeout(timeout);
    }
  })();
  cache.set(city.id, request);
  // A failed request is tried again next time; a city with no outline is remembered as such.
  request.catch(() => cache.delete(city.id));
  return request;
}
