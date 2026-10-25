import { destinationPins, distanceKm } from "@/data/map";
import { citiesForDay } from "@/utils/trip";

export const CITY_RADIUS_KM = 50;
const REGION_RADIUS_KM: Record<string, number> = { iceland: 350, alps: 220, bali: 150, "danube-delta": 160, "new-york": 85 };

export function placeFitsTripDay(
  trip: { destinationId: string; dayDestinations?: string[]; dayCities?: string[][]; routeStops?: { id: string; latitude: number; longitude: number }[] },
  day: number,
  place: { latitude: number; longitude: number },
) {
  return citiesForDay(trip, day).some((id) => {
    const center = trip.routeStops?.find((stop) => stop.id === id) || destinationPins.find((pin) => pin.id === id);
    return !!center && distanceKm(center, place) <= (REGION_RADIUS_KM[id] || CITY_RADIUS_KM);
  });
}

export { dayRoutePoints, MAX_ROUTE_STOPS, mapsRouteUrl } from "@/utils/trip-navigation";
