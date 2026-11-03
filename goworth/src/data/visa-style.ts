/**
 * How a country's visa looks. The same country always gets the same inks and stamp tilt, so a passport reads as
 * one traveller's record rather than a generated list: the page ink follows the continent, like the country
 * stamps on the map, and the entry stamp takes a second ink of its own.
 */
const pageInks: Record<string, { light: string; dark: string }> = {
  EU: { light: "#2457E6", dark: "#7FA2FF" },
  AS: { light: "#C2410C", dark: "#FDBA74" },
  NA: { light: "#0F766E", dark: "#5EEAD4" },
  SA: { light: "#15803D", dark: "#86EFAC" },
  AF: { light: "#A16207", dark: "#FCD34D" },
  OC: { light: "#7C3AED", dark: "#C4B5FD" },
  AN: { light: "#475569", dark: "#CBD5E1" },
};

const stampInks = [
  { light: "#B42318", dark: "#FDA29B" },
  { light: "#6941C6", dark: "#D6BBFB" },
  { light: "#1D4ED8", dark: "#93C5FD" },
  { light: "#B54708", dark: "#FEC84B" },
  { light: "#067647", dark: "#75E0A7" },
];

function seedOf(code: string) {
  return [...code].reduce((sum, letter) => sum * 31 + letter.charCodeAt(0), 11);
}

export function visaStyle(code: string, continent: string | undefined, dark: boolean) {
  const seed = seedOf(code);
  const mode = dark ? "dark" : "light";
  return {
    ink: (pageInks[continent ?? ""] ?? pageInks.AN)[mode],
    stampInk: stampInks[seed % stampInks.length][mode],
    /** Degrees, between -14 and 6: pressed by hand, never straight. */
    stampTilt: (seed % 21) - 14,
    /** Shifts the guilloche waves so no two countries share a pattern. */
    wave: (seed % 97) / 97,
  };
}

/** The machine-readable lines at the foot of a visa (V) or identity (P) page, in the format real ones use, filled to a fixed width. */
export function visaMrz(code: string, holder: string, memberId: string, entries: number, width = 36, kind: "V" | "P" = "V") {
  const clean = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "<");
  const fit = (value: string) => value.slice(0, width).padEnd(width, "<");
  return [
    fit(`${kind}<${clean(code)}${clean(holder)}<<GOWORTH`),
    fit(`${clean(memberId).replace(/</g, "").slice(0, 10)}<${clean(code)}<${entries}`),
  ];
}
