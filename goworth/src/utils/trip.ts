export function tripDays(start: string, end: string) {
  return Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;
}

export function validateTrip(trip: {
  start: string;
  end: string;
  budget: number;
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
    return "Choose a budget of at least $100.";
  return null;
}
