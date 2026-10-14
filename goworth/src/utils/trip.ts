export function tripDays(start: string, end: string) {
  return Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;
}

export function validateTrip(trip: {
  start: string;
  end: string;
  budget: number;
  destinationId?: string;
  dayDestinations?: string[];
  routeStops?: { id: string; name: string; country: string; countryCode: string; latitude: number; longitude: number }[];
}): string | null {
  const validDate = (value: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value;
  if (!validDate(trip.start) || !validDate(trip.end))
    return "Select valid dates for departure and return.";
  const days = tripDays(trip.start, trip.end);
  if (days < 1) return "Your return date must be on or after your departure.";
  if (days > 14) return "Choose a trip of up to 14 days for this preview.";
  if (!Number.isFinite(trip.budget) || trip.budget < 100)
    return "Choose a budget of at least €100.";
  if (trip.dayDestinations && (
    trip.dayDestinations.length !== days ||
    trip.dayDestinations[0] !== trip.destinationId ||
    trip.dayDestinations.some((id) => !id)
  )) return "Assign one destination to every day of your trip.";
  if (trip.dayDestinations && trip.dayDestinations.filter((id, index, ids) => index === 0 || id !== ids[index - 1]).length > 10)
    return "Choose at most 10 city stops for one trip.";
  if (trip.routeStops) {
    const ids = new Set(trip.routeStops.map((stop) => stop.id));
    if (ids.size !== trip.routeStops.length || !ids.has(trip.destinationId || "") ||
      trip.routeStops.some((stop) => !stop.id || !stop.name.trim() || !stop.country.trim() ||
        !Number.isFinite(stop.latitude) || !Number.isFinite(stop.longitude) ||
        Math.abs(stop.latitude) > 90 || Math.abs(stop.longitude) > 180) ||
      trip.dayDestinations?.some((id) => !ids.has(id)))
      return "Choose a valid city for each stop on your route.";
  }
  return null;
}

export function destinationForDay(trip: { destinationId: string; dayDestinations?: string[] }, day: number) {
  return trip.dayDestinations?.[day - 1] || trip.destinationId;
}
