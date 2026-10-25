type Point = { latitude: number; longitude: number };
type NamedPoint = Point & { name: string };

// Google Maps accepts a destination plus at most 9 waypoints in one directions link.
export const MAX_ROUTE_STOPS = 10;

// Starts from the traveler's current location and visits every stop in order.
export function mapsRouteUrl(points: Point[]) {
  if (!points.length) return null;
  const coordinates = points.slice(0, MAX_ROUTE_STOPS).map((point) => `${point.latitude},${point.longitude}`);
  const params = new URLSearchParams({ api: "1", destination: coordinates.at(-1)!, travelmode: "driving" });
  if (coordinates.length > 1) params.set("waypoints", coordinates.slice(0, -1).join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

// Orders the day's mapped places by the trip's city order, then by time within each city.
export function dayRoutePoints<T extends NamedPoint & { time: string }>(cities: Point[], activities: T[]): T[] {
  const located = activities.filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude));
  if (!cities.length) return [...located].sort((a, b) => a.time.localeCompare(b.time));
  const stops = cities.map(() => [] as T[]);
  for (const activity of located) {
    const nearest = cities.reduce((best, city, index) => {
      const lat = (city.latitude - activity.latitude) * Math.PI / 180;
      const lon = (city.longitude - activity.longitude) * Math.PI / 180;
      const a = Math.sin(lat / 2) ** 2 + Math.cos(city.latitude * Math.PI / 180) *
        Math.cos(activity.latitude * Math.PI / 180) * Math.sin(lon / 2) ** 2;
      const distance = 2 * Math.asin(Math.min(1, Math.sqrt(a)));
      return distance < best.distance ? { index, distance } : best;
    }, { index: 0, distance: Infinity });
    stops[nearest.index].push(activity);
  }
  return stops.flatMap((group) => group.sort((a, b) => a.time.localeCompare(b.time)));
}
