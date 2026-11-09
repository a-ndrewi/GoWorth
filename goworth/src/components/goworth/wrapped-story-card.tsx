import type { Ref } from "react";
import { Platform, StyleSheet, Text, View, type ViewInstance } from "react-native";
import { Image } from "expo-image";
import { photos } from "@/constants/design";
import { countryFlag } from "@/data/geography";
import type { AppLanguage } from "@/data/formatting";
import { visaMrz } from "@/data/visa-style";
import { Guilloche, pagePaper } from "@/components/goworth/passport-pages";
import { STORY_SIZE } from "@/components/goworth/trip-story-card";
import type { WrappedStats } from "@/utils/travel-wrapped";

const serif = Platform.select({ ios: "Georgia", android: "serif", default: "serif" });
const mono = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });
const NAVY = "#1F3A68";
/** The accent each paper is printed with: navy on cream, and on the dark paper a light blue with gold for the busiest month. */
const inks = {
  light: { accent: NAVY, pill: NAVY, peak: NAVY },
  dark: { accent: "#9DB8FF", pill: "#2B3D6B", peak: "#F5C451" },
} as const;

const wording = {
  en: { kicker: "Travel record", year: "My year in travel", trips: "Trips", days: "Days", countries: "Countries", cities: "Cities", km: "Km", cta: "Make yours on GoWorth" },
  ro: { kicker: "Jurnal de călătorie", year: "Anul meu în călătorii", trips: "Călătorii", days: "Zile", countries: "Țări", cities: "Orașe", km: "Km", cta: "Fă-ți-l pe al tău pe GoWorth" },
};

/**
 * The year on one 9:16 card, printed on the same passport paper as the trip and passport cards. Free shows trips,
 * days and countries; Premium adds cities, distance and the traveller's style, the same split the recap makes.
 */
export function WrappedStoryCard({ ref, stats, holder, persona, full, language, dark = false }: {
  ref?: Ref<ViewInstance>; stats: WrappedStats; holder: string; persona: string; full: boolean; language: AppLanguage; dark?: boolean;
}) {
  const t = wording[language];
  const c = pagePaper(dark);
  const ink = inks[dark ? "dark" : "light"];
  const number = (value: number) => value.toLocaleString(language === "ro" ? "ro-RO" : "en-US");
  const figures: [string, string][] = [
    [t.trips, number(stats.trips)], [t.days, number(stats.days)], [t.countries, number(stats.countries.length)],
    ...(full ? [[t.cities, number(stats.cities)], [t.km, number(stats.km)]] as [string, string][] : []),
  ];
  const peak = Math.max(...stats.monthDays, 1);
  const months = Array.from({ length: 12 }, (_, month) => new Date(Date.UTC(stats.year, month, 15))
    .toLocaleDateString(language === "ro" ? "ro-RO" : "en-US", { month: "narrow", timeZone: "UTC" }));

  return <View ref={ref} collapsable={false} style={[STORY_SIZE, { overflow: "hidden", backgroundColor: c.paper }]}>
    <Guilloche width={STORY_SIZE.width} color={ink.accent} wave={0.53} rows={12} />
    <View style={styles.header}>
      <View style={[styles.brand, { backgroundColor: ink.pill }]}>
        <Image source={photos.brandMark} style={{ width: 18, height: 18 }} contentFit="contain" />
        <Text style={styles.brandText}>GoWorth</Text>
      </View>
      <Text style={[styles.kicker, { color: ink.accent }]}>{t.kicker.toUpperCase()}</Text>
    </View>

    <View style={{ position: "absolute", top: 120, left: 28, right: 24 }}>
      <Text style={{ color: c.muted, fontSize: 12, fontWeight: "800", letterSpacing: 1.4 }}>{t.year.toUpperCase()}</Text>
      <Text style={{ color: c.ink, fontFamily: serif, fontSize: 76, lineHeight: 84 }}>{stats.year}</Text>
      <Text numberOfLines={1} style={{ color: c.muted, fontSize: 13, fontWeight: "700" }}>{holder}</Text>
      {full && !!persona && <Text numberOfLines={1} style={{ color: ink.accent, fontFamily: serif, fontStyle: "italic", fontSize: 22, marginTop: 8 }}>{persona}</Text>}
    </View>

    <View style={[styles.figures, { top: full ? 300 : 290 }]}>
      {figures.map(([label, value]) => <View key={label} style={{ width: "33.3%", paddingVertical: 8 }}>
        <Text style={{ color: c.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1 }}>{label.toUpperCase()}</Text>
        <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: c.ink, fontSize: 24, fontWeight: "900" }}>{value}</Text>
      </View>)}
    </View>

    <View style={[styles.chart, { top: full ? 428 : 372, borderColor: c.line }]}>
      {stats.monthDays.map((days, month) => <View key={month} style={{ flex: 1, alignItems: "center", gap: 4 }}>
        <View style={{ height: 44, width: "62%", justifyContent: "flex-end" }}>
          <View style={{ height: `${days ? Math.max(10, days / peak * 100) : 0}%`, borderRadius: 2,
            backgroundColor: month === stats.busiestMonth ? ink.peak : c.faint }} />
        </View>
        <Text style={{ color: c.muted, fontSize: 9, fontWeight: "800" }}>{months[month]}</Text>
      </View>)}
    </View>

    <View style={styles.bottom}>
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 20, letterSpacing: 2, marginBottom: 8 }}>
        {stats.countries.slice(0, 14).map(countryFlag).join(" ")}
      </Text>
      {visaMrz("GW", holder, String(stats.year), stats.countries.length, 36, "P").map((line) => <Text key={line} numberOfLines={1} adjustsFontSizeToFit
        style={{ color: c.ink, fontFamily: mono, fontSize: 10, letterSpacing: 1 }}>{line}</Text>)}
      <Text style={{ color: c.ink, fontSize: 10, fontWeight: "700", marginTop: 4 }}>{`${t.cta}  ·  @goworth.app`}</Text>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  header: { position: "absolute", top: 28, left: 24, right: 24, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brand: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  brandText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800", letterSpacing: 0.2 },
  kicker: { fontSize: 12, fontWeight: "900", letterSpacing: 2 },
  figures: { position: "absolute", left: 28, right: 24, flexDirection: "row", flexWrap: "wrap" },
  chart: { position: "absolute", left: 24, right: 24, flexDirection: "row", paddingTop: 12, borderTopWidth: 1 },
  bottom: { position: "absolute", left: 28, right: 24, bottom: 22, gap: 2 },
});
