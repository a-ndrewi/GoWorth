import { insideBoundary, type Boundary } from "../data/city-boundary.ts";
import { places as catalogPlaces } from "../data/catalog.ts";
import { citiesForDay } from "./trip.ts";

/**
 * Catalog destinations that are whole regions rather than one city: their places are spread far apart, so they are
 * matched by distance instead of by an outline.
 */
export const REGION_RADIUS_KM: Record<string, number> = { iceland: 350, alps: 220, bali: 150, "danube-delta": 160 };
/** For a city whose outline is unknown or unavailable: the same radius its place ideas are drawn from. */
export const CITY_FALLBACK_KM = 8;

type Point = { latitude: number; longitude: number };
export type AreaStop = Point & { id: string; name: string };
type DayTrip = { destinationId: string; dayDestinations?: string[]; dayCities?: string[][] };
/** City outlines by stop id: `null` when the city has none, missing while it has not been loaded. */
export type DayAreas = Record<string, Boundary | null | undefined>;

function distanceKm(a: Point, b: Point) {
  const radians = Math.PI / 180;
  const lat = (b.latitude - a.latitude) * radians;
  const lon = (b.longitude - a.longitude) * radians;
  const arc = Math.sin(lat / 2) ** 2 + Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * Math.sin(lon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(arc));
}

/** Whether a point lies in a stop: inside its outline when known, otherwise close to its centre. */
export function stopContains(stop: AreaStop, place: Point, area?: Boundary | null) {
  if (!Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)) return false;
  const region = REGION_RADIUS_KM[stop.id];
  if (region) return distanceKm(stop, place) <= region;
  if (area) return insideBoundary(area, place);
  return distanceKm(stop, place) <= CITY_FALLBACK_KM;
}

/**
 * Whether a place belongs to one of the cities planned for `day`. A place from the app's catalog belongs to its own
 * destination, wherever its map point falls; any other place must lie in the city itself, so a neighbouring town or a
 * place across a border is never added to a day planned for somewhere else.
 */
export function placeInDay(trip: DayTrip, day: number, place: Point & { placeId?: string }, stopFor: (id: string) => AreaStop, areas: DayAreas = {}) {
  const ids = citiesForDay(trip, day);
  const catalogDestination = place.placeId ? catalogPlaces.find((item) => item.id === place.placeId)?.destinationId : undefined;
  if (catalogDestination) return ids.includes(catalogDestination);
  return ids.some((id) => stopContains(stopFor(id), place, areas[id]));
}
