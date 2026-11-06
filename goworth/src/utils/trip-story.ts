/**
 * What a shareable trip card shows and the colours it is printed in. Kept free of app imports so it can be tested
 * on its own: the card component passes in the route and the country lookups.
 */

/** Main colours of the flags travellers visit most, from hoist to fly. Others fall back to their continent's ink. */
export const flagColors: Record<string, string[]> = {
  IT: ["#009246", "#F1F2F1", "#CE2B37"], FR: ["#0055A4", "#FFFFFF", "#EF4135"], ES: ["#AA151B", "#F1BF00", "#AA151B"],
  PT: ["#006600", "#FF0000"], GR: ["#0D5EAF", "#FFFFFF"], DE: ["#000000", "#DD0000", "#FFCE00"],
  NL: ["#AE1C28", "#FFFFFF", "#21468B"], BE: ["#000000", "#FAE042", "#ED2939"], GB: ["#012169", "#FFFFFF", "#C8102E"],
  IE: ["#169B62", "#FFFFFF", "#FF883E"], RO: ["#002B7F", "#FCD116", "#CE1126"], BG: ["#FFFFFF", "#00966E", "#D62612"],
  HU: ["#CD2A3E", "#FFFFFF", "#436F4D"], AT: ["#ED2939", "#FFFFFF", "#ED2939"], CH: ["#DA291C", "#FFFFFF"],
  CZ: ["#11457E", "#FFFFFF", "#D7141A"], PL: ["#FFFFFF", "#DC143C"], HR: ["#FF0000", "#FFFFFF", "#171796"],
  RS: ["#C6363C", "#0C4076", "#FFFFFF"], SI: ["#FFFFFF", "#0000FF", "#FF0000"], TR: ["#E30A17", "#FFFFFF"],
  IS: ["#02529C", "#FFFFFF", "#DC1E35"], NO: ["#BA0C2F", "#FFFFFF", "#00205B"], SE: ["#006AA7", "#FECC00"],
  DK: ["#C8102E", "#FFFFFF"], FI: ["#FFFFFF", "#002F6C"], EE: ["#0072CE", "#000000", "#FFFFFF"],
  LV: ["#9E3039", "#FFFFFF", "#9E3039"], LT: ["#FDB913", "#006A44", "#C1272D"], JP: ["#FFFFFF", "#BC002D"],
  KR: ["#FFFFFF", "#C60C30", "#003478"], TH: ["#A51931", "#F4F5F8", "#2D2A4A"], ID: ["#FF0000", "#FFFFFF"],
  VN: ["#DA251D", "#FFFF00"], IN: ["#FF9933", "#FFFFFF", "#138808"], MY: ["#010066", "#FFFFFF", "#CC0001", "#FFCC00"],
  SG: ["#EF3340", "#FFFFFF"], AE: ["#00732F", "#FFFFFF", "#000000", "#FF0000"], EG: ["#CE1126", "#FFFFFF", "#000000"],
  MA: ["#C1272D", "#006233"], KE: ["#000000", "#BB0000", "#006600"], ZA: ["#007A4D", "#FFB612", "#DE3831", "#002395"],
  US: ["#B22234", "#FFFFFF", "#3C3B6E"], CA: ["#FF0000", "#FFFFFF"], MX: ["#006847", "#FFFFFF", "#CE1126"],
  BR: ["#009C3B", "#FFDF00", "#002776"], AR: ["#74ACDF", "#FFFFFF", "#F6B40E"], PE: ["#D91023", "#FFFFFF"],
  AU: ["#00008B", "#FFFFFF", "#FF0000"], NZ: ["#00247D", "#FFFFFF", "#CC142B"],
};

const hex = (value: string) => [1, 3, 5].map((start) => parseInt(value.slice(start, start + 2), 16));
const toHex = (rgb: number[]) => `#${rgb.map((channel) => Math.round(Math.max(0, Math.min(255, channel))).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
const luminance = (value: string) => {
  const [r, g, b] = hex(value).map((channel) => channel / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** Mixes a colour toward black by the given share, keeping its hue. */
export function deepen(value: string, share: number) {
  return toHex(hex(value).map((channel) => channel * (1 - share)));
}

/**
 * The card's colours for a country: a deep background taken from its flag so white text always reads, an accent
 * for highlights, and the flag's own colours for the stripe. Countries without a known flag use the fallback ink.
 */
export function storyPalette(code: string, fallbackInk: string) {
  const flag = flagColors[code];
  const colors = flag?.filter((color) => luminance(color) < 0.85) ?? [];
  if (!flag || !colors.length) return { deep: deepen(fallbackInk, 0.45), accent: fallbackInk, stripe: [fallbackInk, "#FFFFFF", fallbackInk] };
  const darkest = [...colors].sort((a, b) => luminance(a) - luminance(b))[0];
  // Pure black flags (Germany, Belgium) print as charcoal so photos above still blend into it.
  let deep = luminance(darkest) < 0.02 ? "#1C1C22" : deepen(darkest, 0.35);
  // Light flags (Argentina's sky blue) keep darkening until white text on them still reads.
  while (luminance(deep) > 0.12) deep = deepen(deep, 0.15);
  const accent = colors.find((color) => color !== darkest) ?? darkest;
  return { deep, accent, stripe: flag };
}

export type StoryStop = { id: string; name: string; country: string; countryCode: string };
export type StoryCountry = { code: string; name: string; cities: string[] };

/** The countries a trip passed through, in route order, each with its cities; unknown countries are left out. */
export function storyCountries(stops: StoryStop[], codeForName: (name: string) => string | undefined): StoryCountry[] {
  const found = new Map<string, StoryCountry>();
  for (const stop of stops) {
    const code = (stop.countryCode || codeForName(stop.country) || "").toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) continue;
    const country = found.get(code) ?? { code, name: stop.country, cities: [] };
    if (!country.cities.includes(stop.name)) country.cities.push(stop.name);
    found.set(code, country);
  }
  return [...found.values()];
}

/** The big line on the card: the country for a one-country trip, two names joined, or a count past that. */
export function storyHeadline(names: string[], language: "en" | "ro") {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return language === "ro" ? `${names.length} țări` : `${names.length} countries`;
}

export type MapBox = { left: number; top: number; width: number; height: number };

/**
 * Places a route's stops inside a box, north up, keeping real proportions (longitude narrowed by latitude) so a
 * coast-to-coast trip looks wide and a north-south one tall. A single stop, or stops on the same spot, sit centred.
 */
export function routeLayout(points: { latitude: number; longitude: number }[], box: MapBox) {
  if (!points.length) return [];
  const midLat = points.reduce((sum, point) => sum + point.latitude, 0) / points.length;
  const squeeze = Math.max(0.2, Math.cos((midLat * Math.PI) / 180));
  const xs = points.map((point) => point.longitude * squeeze);
  const ys = points.map((point) => -point.latitude);
  const spanX = Math.max(...xs) - Math.min(...xs);
  const spanY = Math.max(...ys) - Math.min(...ys);
  const span = Math.max(spanX / box.width, spanY / box.height);
  const centre = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  if (span < 1e-6) return points.map(() => ({ ...centre }));
  const midX = (Math.max(...xs) + Math.min(...xs)) / 2;
  const midY = (Math.max(...ys) + Math.min(...ys)) / 2;
  return xs.map((x, index) => ({ x: centre.x + (x - midX) / span, y: centre.y + (ys[index] - midY) / span }));
}

/** A gentle arc between two stops, bowed to one side like a flight path; SVG path syntax. */
export function arcPath(from: { x: number; y: number }, to: { x: number; y: number }) {
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const dx = to.x - from.x, dy = to.y - from.y;
  const bow = 0.22;
  return `M ${from.x.toFixed(1)} ${from.y.toFixed(1)} Q ${(mid.x - dy * bow).toFixed(1)} ${(mid.y + dx * bow).toFixed(1)} ${to.x.toFixed(1)} ${to.y.toFixed(1)}`;
}
