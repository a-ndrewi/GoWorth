import { countryForCode } from "@/data/geography";
import type { IconName } from "@/components/goworth/ui";
import type { Visa } from "@/lib/visas";

type Badge = { id: string; icon: IconName; title: { en: string; ro: string }; detail: { en: string; ro: string }; ink: string; earned: boolean; progress: string };

/** Rare stamps: milestones the passport collects alongside its visas, worked out from the visas themselves. */
export function passportBadges(visas: Visa[]): Badge[] {
  const countries = visas.length;
  const continents = new Map<string, number>();
  for (const visa of visas) {
    const continent = countryForCode(visa.countryCode)?.continent;
    if (continent) continents.set(continent, (continents.get(continent) ?? 0) + 1);
  }
  const bestContinent = Math.max(0, ...continents.values());
  const mostEntries = Math.max(0, ...visas.map((visa) => visa.entries));
  const cities = new Set(visas.flatMap((visa) => visa.cities)).size;
  const romania = visas.find((visa) => visa.countryCode === "RO")?.cities.length ?? 0;
  const badge = (id: string, icon: IconName, ink: string, title: Badge["title"], detail: Badge["detail"], value: number, goal: number): Badge =>
    ({ id, icon, ink, title, detail, earned: value >= goal, progress: `${Math.min(value, goal)}/${goal}` });
  return [
    badge("first", "plane", "#2457E6", { en: "First visa", ro: "Prima viză" }, { en: "Your first country", ro: "Prima ta țară" }, countries, 1),
    badge("five", "globe", "#0B9B72", { en: "Globetrotter", ro: "Globetrotter" }, { en: "5 countries", ro: "5 țări" }, countries, 5),
    badge("ten", "crown", "#B8860B", { en: "Ten flags", ro: "Zece steaguri" }, { en: "10 countries", ro: "10 țări" }, countries, 10),
    badge("continent", "compass", "#7667D8", { en: "Continental", ro: "Continental" }, { en: "4 countries on one continent", ro: "4 țări pe un continent" }, bestContinent, 4),
    badge("worlds", "map", "#E85D75", { en: "Two worlds", ro: "Două lumi" }, { en: "2 continents", ro: "2 continente" }, continents.size, 2),
    badge("regular", "heart", "#D9480F", { en: "Regular", ro: "Obișnuit al casei" }, { en: "3 trips to one country", ro: "3 călătorii în aceeași țară" }, mostEntries, 3),
    badge("cities", "city", "#20A7A0", { en: "City collector", ro: "Colecționar de orașe" }, { en: "12 cities", ro: "12 orașe" }, cities, 12),
    badge("romania", "mountain", "#1D4ED8", { en: "Carpathian", ro: "Carpatin" }, { en: "4 cities in Romania", ro: "4 orașe în România" }, romania, 4),
  ];
}
