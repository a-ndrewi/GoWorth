/** How long before the wheel's cooldown ends the "almost ready" reminder comes. */
export const wheelSoonLeadMs = 60 * 60 * 1000;

/**
 * When to remind about the wheel: an hour before the cooldown ends (only if that is still a while away) and when it
 * ends. Both are `null` while a spin is already available.
 */
export function wheelReminderDates(remainingMs: number, now = Date.now()) {
  if (remainingMs <= 0) return { soon: null, ready: null };
  const ready = new Date(now + remainingMs);
  const soon = remainingMs > wheelSoonLeadMs + 5 * 60 * 1000 ? new Date(ready.getTime() - wheelSoonLeadMs) : null;
  return { soon, ready };
}

/** Days without a trip after which GoWorth suggests planning one. */
export const tripNudgeDays = [4, 11] as const;

/**
 * Early evenings a few days out. They are scheduled again every time the app opens, so a nudge only arrives after
 * that many days away from the app with no trip planned.
 */
export function tripNudgeDates(now = new Date()) {
  return tripNudgeDays.map((days) => {
    const date = new Date(now);
    date.setDate(date.getDate() + days);
    date.setHours(18, 30, 0, 0);
    return date;
  });
}

/** At most one "worth a look nearby" notification in this window, however much the traveller moves. */
export const nearbyCooldownMs = 4 * 60 * 60 * 1000;

/** The nearest attraction not suggested before; restaurants and bars are left to the app. */
export function pickNearbyPlace<T extends { id: string; venue?: unknown }>(places: T[], seen: readonly string[]) {
  return places.find((place) => !place.venue && !seen.includes(place.id));
}

/** "350 m", "1.4 km" or "12 km". */
export function formatDistance(km: number) {
  if (km < 1) return `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m`;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

const shiftDate = (date: string, days: number) => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

/**
 * The days the trip widget needs an entry for, as YYYY-MM-DD: from today up to and including the day after the trip,
 * so the card counts down, follows each trip day and then clears by itself. Capped so a far-off trip stays small.
 */
export function widgetDays(start: string, end: string, today: string, limit = 60) {
  const last = shiftDate(end, 1);
  const days: string[] = [];
  for (let day = today; day <= last && days.length < limit; day = shiftDate(day, 1)) days.push(day);
  return days.length ? days : [today];
}
