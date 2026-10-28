/** A three-letter code for a city, like an airport's: "Kyoto" → "KYO", "Brașov" → "BRA", "San Sebastián" → "SAN". */
export function cityCode(name: string) {
  const letters = name.normalize("NFD").replace(/[^A-Za-z]/g, "").toUpperCase();
  return letters.slice(0, 3) || "GO";
}

/** "27–31 Oct" within one month, "28 Oct – 2 Nov" across two, from YYYY-MM-DD dates. */
export function dateRange(start: string, end: string, locale: string) {
  const day = (date: string) => new Date(`${date}T12:00:00Z`);
  const month = (date: string) => day(date).toLocaleDateString(locale, { month: "short", timeZone: "UTC" });
  const dayOf = (date: string) => String(day(date).getUTCDate());
  if (start === end) return `${dayOf(start)} ${month(start)}`;
  return start.slice(0, 7) === end.slice(0, 7)
    ? `${dayOf(start)}–${dayOf(end)} ${month(end)}`
    : `${dayOf(start)} ${month(start)} – ${dayOf(end)} ${month(end)}`;
}
