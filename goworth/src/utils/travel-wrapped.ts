/**
 * The yearly travel recap ("Wrapped"): which year to show, and the numbers it is built from. Kept free of app imports
 * so it can be tested on its own; the screen passes in trips already resolved to their stops and country codes.
 */

export type WrappedStop = { id: string; name: string; countryCode: string; latitude: number; longitude: number };
export type WrappedTrip = {
  start: string;
  end: string;
  stops: WrappedStop[];
  /** Distinct places on the itinerary. */
  places: number;
  /** Total of the trip's expenses in the traveller's currency, 0 when none were recorded. */
  spent: number;
};

export type WrappedPersona = "explorer" | "city-hopper" | "slow-traveller" | "weekender" | "first-timer";

export type WrappedStats = {
  year: number;
  trips: number;
  /** Days away within the year; a trip over New Year counts only its days in this year. */
  days: number;
  countries: string[];
  /** Countries whose first visit in the traveller's whole history fell in this year. */
  newCountries: string[];
  cities: number;
  places: number;
  /** Great-circle distance between consecutive stops of every trip, rounded to whole kilometres. */
  km: number;
  spent: number;
  longest: { name: string; days: number } | null;
  /** The country with the most days this year, with its days. */
  topCountry: { code: string; days: number } | null;
  /** 0-based month with the most days away, null without trips. */
  busiestMonth: number | null;
  /** Days away in each month, January first. */
  monthDays: number[];
  persona: WrappedPersona;
};

/** The recap opens from November 1 for the year ending, and stays through January for the year just ended. */
export function wrappedYear(today: Date): number | null {
  const month = today.getUTCMonth();
  if (month >= 10) return today.getUTCFullYear();
  if (month === 0) return today.getUTCFullYear() - 1;
  return null;
}

const DAY = 86_400_000;
const toDay = (value: string) => Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)));

/** Each calendar day of a trip, inclusive, as UTC midnights. */
function tripDayList(start: string, end: string) {
  const from = toDay(start), to = toDay(end);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return [];
  return Array.from({ length: Math.round((to - from) / DAY) + 1 }, (_, index) => from + index * DAY);
}

const EARTH_KM = 6371;
const radians = (value: number) => value * Math.PI / 180;
export function distanceKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const dLat = radians(b.latitude - a.latitude), dLon = radians(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}
/** Stops without a position are stored at 0,0; they are left out of the distance rather than counted from the Gulf of Guinea. */
const located = (stop: WrappedStop) => Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude) && (stop.latitude !== 0 || stop.longitude !== 0);

function personaFor(stats: Omit<WrappedStats, "persona">): WrappedPersona {
  if (stats.trips === 0 || (stats.trips === 1 && stats.countries.length <= 1 && stats.cities <= 1)) return "first-timer";
  if (stats.countries.length >= 4) return "explorer";
  if (stats.cities >= stats.trips * 3) return "city-hopper";
  if (stats.days / stats.trips >= 7) return "slow-traveller";
  return "weekender";
}

/**
 * The recap for one year. Trips count when any of their days fall in the year; finished trips appear in the journal
 * and the trip list alike, so the caller passes each once. `firstVisits` maps a country code to the date of its very
 * first visit (the passport's first entry), so a country seen before this year is not called new.
 */
export function wrappedStats(year: number, trips: WrappedTrip[], firstVisits: Record<string, string> = {}): WrappedStats {
  const yearStart = Date.UTC(year, 0, 1), yearEnd = Date.UTC(year + 1, 0, 1);
  const inYear = trips
    .map((trip) => ({ trip, days: tripDayList(trip.start, trip.end).filter((day) => day >= yearStart && day < yearEnd) }))
    .filter((item) => item.days.length > 0)
    .sort((a, b) => a.trip.start.localeCompare(b.trip.start));

  const countryDays = new Map<string, number>();
  const monthDays = Array.from({ length: 12 }, () => 0);
  const cities = new Set<string>();
  let days = 0, places = 0, km = 0, spent = 0;
  let longest: WrappedStats["longest"] = null;

  for (const { trip, days: tripDaysInYear } of inYear) {
    days += tripDaysInYear.length;
    places += trip.places;
    spent += trip.spent;
    for (const day of tripDaysInYear) monthDays[new Date(day).getUTCMonth()] += 1;
    for (const stop of trip.stops) cities.add(stop.id || stop.name.toLocaleLowerCase());
    const codes = [...new Set(trip.stops.map((stop) => stop.countryCode.toUpperCase()).filter(Boolean))];
    // A trip's days are shared evenly between its countries; the route does not say how long each one took.
    for (const code of codes) countryDays.set(code, (countryDays.get(code) ?? 0) + tripDaysInYear.length / codes.length);
    const path = trip.stops.filter(located);
    for (let index = 1; index < path.length; index += 1) km += distanceKm(path[index - 1], path[index]);
    if (!longest || tripDaysInYear.length > longest.days) longest = { name: trip.stops[0]?.name ?? "", days: tripDaysInYear.length };
  }

  const countries = [...countryDays.keys()];
  const top = [...countryDays.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  const busiest = days ? monthDays.indexOf(Math.max(...monthDays)) : null;
  const newCountries = countries.filter((code) => {
    const first = firstVisits[code];
    return !first || Number(first.slice(0, 4)) >= year;
  });
  const base = {
    year, trips: inYear.length, days, countries, newCountries, cities: cities.size, places, km: Math.round(km), spent,
    longest, topCountry: top ? { code: top[0], days: Math.round(top[1]) } : null, busiestMonth: busiest, monthDays,
  };
  return { ...base, persona: personaFor(base) };
}
