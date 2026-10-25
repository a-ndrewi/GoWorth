export function tripDays(start: string, end: string) {
  return Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;
}

export function validateTrip(trip: {
  start: string;
  end: string;
  budget: number;
  destinationId?: string;
  dayDestinations?: string[];
  dayCities?: string[][];
  routeStops?: { id: string; name: string; country: string; countryCode: string; latitude: number; longitude: number }[];
}): string | null {
  if (!trip.destinationId) return "Select a country and city for your trip.";
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
  if (trip.dayCities && (
    trip.dayCities.length !== days ||
    trip.dayCities[0]?.[0] !== trip.destinationId ||
    trip.dayCities.some((cities, index) => !Array.isArray(cities) || !cities.length ||
      cities.some((id) => !id) || new Set(cities).size !== cities.length ||
      !!trip.dayDestinations && cities[0] !== trip.dayDestinations[index])
  )) return "Choose at least one valid city for every day.";
  if (trip.dayCities && new Set(trip.dayCities.flat()).size > 10)
    return "Choose at most 10 cities for one trip.";
  if (trip.dayDestinations && trip.dayDestinations.filter((id, index, ids) => index === 0 || id !== ids[index - 1]).length > 10)
    return "Choose at most 10 city stops for one trip.";
  if (trip.routeStops) {
    const ids = new Set(trip.routeStops.map((stop) => stop.id));
    if (ids.size !== trip.routeStops.length || !ids.has(trip.destinationId || "") ||
      trip.routeStops.some((stop) => !stop.id || !stop.name.trim() || !stop.country.trim() ||
        !Number.isFinite(stop.latitude) || !Number.isFinite(stop.longitude) ||
        Math.abs(stop.latitude) > 90 || Math.abs(stop.longitude) > 180) ||
      trip.dayDestinations?.some((id) => !ids.has(id)) ||
      trip.dayCities?.some((cities) => cities.some((id) => !ids.has(id))))
      return "Choose a valid city for each stop on your route.";
  }
  return null;
}

export function citiesForDay(trip: { destinationId: string; dayDestinations?: string[]; dayCities?: string[][] }, day: number) {
  return trip.dayCities?.[day - 1] ?? [trip.dayDestinations?.[day - 1] || trip.destinationId];
}

export function resizeDayCities(trip: { destinationId: string; dayDestinations?: string[]; dayCities?: string[][] }, count: number) {
  const existing = trip.dayCities ?? trip.dayDestinations?.map((id) => [id]) ?? [];
  return Array.from({ length: count }, (_, index) => [...(existing[index] ?? existing.at(-1) ?? [trip.destinationId])]);
}

export function destinationForDay(trip: { destinationId: string; dayDestinations?: string[]; dayCities?: string[][] }, day: number) {
  return citiesForDay(trip, day)[0] || trip.destinationId;
}

const suggestedSlots = ["09:00", "11:30", "14:00", "16:30", "19:00"] as const;

export function nextActivitySlot(activities: { day: number; time: string }[], day: number) {
  const used = new Set(activities.filter((activity) => activity.day === day).map((activity) => activity.time));
  const time = suggestedSlots.find((slot) => !used.has(slot)) ?? suggestedSlots[suggestedSlots.length - 1];
  const hour = Number(time.slice(0, 2));
  return {
    time,
    period: (hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening") as "Morning" | "Afternoon" | "Evening",
  };
}

/**
 * Splits `total` days across consecutive stops as evenly as possible; earlier stops get the extra days.
 * When there are more stops than days, the extra stops get 0 days: they are visited the same day as the stop before.
 */
export function splitDays(total: number, count: number) {
  if (count < 1 || total < 1) return [];
  const withDays = Math.min(total, count);
  return Array.from({ length: count }, (_, index) => index < withDays
    ? Math.floor(total / withDays) + (index < total % withDays ? 1 : 0) : 0);
}

/** The first stop always starts the trip; later stops may share a day with the stop before them. */
const minimumDays = (index: number) => index === 0 ? 1 : 0;

/**
 * Gives one day more (+1) or less (-1) to a stop while keeping the trip length: the day is taken from,
 * or handed to, the nearest other stop that can spare or receive it. Returns null when nothing can change.
 */
export function adjustStopDays(days: number[], index: number, delta: 1 | -1) {
  if (days.length < 2 || index < 0 || index >= days.length) return null;
  const order = days.map((_, other) => other).filter((other) => other !== index)
    .sort((a, b) => Math.abs(a - index) - Math.abs(b - index) || b - a);
  const partner = delta === 1
    ? order.find((other) => days[other] > 1) ?? order.find((other) => days[other] > minimumDays(other))
    : days[index] > minimumDays(index) ? order[0] : undefined;
  if (partner === undefined) return null;
  const next = [...days];
  next[index] += delta;
  next[partner] -= delta;
  return next;
}

/** Cities per day, following the stops in order; a 0-day stop joins the last day of the stop before it. */
export function dayCitiesFromStops(ids: string[], days: number[]) {
  const result: string[][] = [];
  ids.forEach((id, index) => {
    const count = days[index] ?? 0;
    if (!count) result.at(-1)?.push(id);
    for (let day = 0; day < count; day++) result.push([id]);
  });
  return result;
}

/**
 * Reads a saved day plan back into ordered stops and day counts. `exact` is false when the plan cannot be
 * expressed as consecutive stops (for example, a city visited again later), so editing would simplify it.
 */
export function stopsFromDayCities(dayCities: string[][]) {
  const ids: string[] = [];
  const days: number[] = [];
  dayCities.forEach((cities) => {
    cities.forEach((id, position) => {
      const last = ids.length - 1;
      if (position === 0 && ids[last] === id && days[last] > 0) days[last] += 1;
      else if (!ids.includes(id)) { ids.push(id); days.push(position === 0 ? 1 : 0); }
    });
  });
  const rebuilt = dayCitiesFromStops(ids, days);
  return { ids, days, exact: JSON.stringify(rebuilt) === JSON.stringify(dayCities) };
}
