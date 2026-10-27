import { useEffect, useMemo, useState } from "react";
import { loadCityBoundary } from "@/data/city-boundary";
import { routeStop } from "@/data/trip-route";
import type { Trip } from "@/data/travel";
import { citiesForDay, tripDays } from "@/utils/trip";
import { placeInDay, REGION_RADIUS_KM, type DayAreas } from "@/utils/day-area";

type TripShape = Pick<Trip, "destinationId" | "dayDestinations" | "dayCities" | "routeStops">;
type PlacePoint = { latitude: number; longitude: number; placeId?: string };

/**
 * Whether a place belongs to the cities planned for `day`. With `areas` it is checked against the cities' outlines;
 * without them (or while they load) against a short radius around each city's centre.
 */
export function placeFitsTripDay(trip: TripShape, day: number, place: PlacePoint, areas?: DayAreas) {
  return placeInDay(trip, day, place, (id) => routeStop(trip, id), areas);
}

/** The outlines of the given stops. A stop whose outline cannot be loaded right now is left out and checked by radius. */
export async function loadDayAreas(trip: TripShape, ids: string[]): Promise<DayAreas> {
  const entries = await Promise.all([...new Set(ids)].filter((id) => !REGION_RADIUS_KM[id]).map(async (id) => {
    const stop = routeStop(trip, id);
    if (!stop.country || (!stop.latitude && !stop.longitude)) return [id, undefined] as const;
    return [id, await loadCityBoundary(stop, stop.country).catch(() => undefined)] as const;
  }));
  return Object.fromEntries(entries);
}

/** The final check before a place is saved to a day, with the cities' outlines loaded. */
export async function placeFitsTripDayChecked(trip: TripShape, day: number, place: PlacePoint) {
  return placeFitsTripDay(trip, day, place, await loadDayAreas(trip, citiesForDay(trip, day)));
}

/** The names of the cities planned for `day`, for messages such as "only places in Brașov". */
export function dayCityNames(trip: TripShape, day: number) {
  return citiesForDay(trip, day).map((id) => routeStop(trip, id).name);
}

/** The outlines of every city in the trip, loaded in the background; screens use them to offer only matching days. */
export function useTripAreas(trip: Trip | null) {
  const ids = useMemo(() => trip ? [...new Set(Array.from({ length: tripDays(trip.start, trip.end) }, (_, index) => citiesForDay(trip, index + 1)).flat())] : [], [trip]);
  const key = ids.join("|");
  const [areas, setAreas] = useState<{ key: string; areas: DayAreas }>({ key: "", areas: {} });
  useEffect(() => {
    if (!trip || !ids.length) return;
    let active = true;
    void loadDayAreas(trip, ids).then((next) => { if (active) setAreas({ key, areas: next }); });
    return () => { active = false; };
    // `key` stands for `ids`; the trip object changes on every save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return areas.key === key ? areas.areas : undefined;
}

export { dayRoutePoints, MAX_ROUTE_STOPS, mapsRouteUrl } from "@/utils/trip-navigation";
