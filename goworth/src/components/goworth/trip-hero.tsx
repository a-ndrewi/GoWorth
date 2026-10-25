import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { themedStyles } from "@/constants/design";
import { usePalette, useStyles } from "@/state/theme-context";
import { tripDays, type Trip } from "@/data/travel";
import { routeTitle, uniqueRouteStops } from "@/data/trip-route";
import { countryFlag } from "@/data/geography";
import { formatMessage, translate } from "@/data/i18n";
import { useAppLanguage } from "@/data/formatting";

export const localToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

/** Where the traveller is relative to the trip: before it, on a given day, or after it. */
export function tripStatus(start: string, end: string, today: string) {
  if (today < start) return { kind: "upcoming" as const, days: tripDays(today, start) - 1 };
  if (today > end) return { kind: "ended" as const, days: 0 };
  return { kind: "active" as const, days: tripDays(start, today) };
}

/** The trip at a glance: status, route, dates and stops on the app's blue gradient. */
export function TripHero({ trip, label, archived = false, children }: {
  trip: Trip;
  /** Replaces the live status (for example "Completed" on an archived trip). */
  label?: string;
  /** Archived trips use a calmer palette so they never look like the active trip. */
  archived?: boolean;
  children?: ReactNode;
}) {
  const styles = useStyles(stylesSheet);
  const p = usePalette();
  const language = useAppLanguage();
  const locale = language === "ro" ? "ro-RO" : "en-US";
  const days = tripDays(trip.start, trip.end);
  const status = tripStatus(trip.start, trip.end, localToday());
  const format = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "UTC" });
  const statusLabel = label ?? (status.kind === "upcoming"
    ? status.days <= 1 ? translate("Starts tomorrow", language) : formatMessage("Starts in {days} days", { days: status.days }, language)
    : status.kind === "active" ? formatMessage("Day {day} of {days}", { day: status.days, days }, language) : translate("Trip ended", language));
  return <View style={styles.hero}>
    <LinearGradient colors={archived ? ["#1C2B45", "#2F4569", "#3D5C86"] : [p.blue, "#3B7BF0", p.teal]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
    <View style={styles.statusPill}><Text style={styles.statusText}>{statusLabel}</Text></View>
    <Text numberOfLines={2} style={styles.heroTitle}>{routeTitle(trip, language)}</Text>
    <Text style={styles.heroMeta}>{formatMessage("{start} – {end} · {days} days · {companions}", { start: format(trip.start), end: format(trip.end), days, companions: translate(trip.companions, language) }, language)}</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
      {uniqueRouteStops(trip).map((stop) => <View key={stop.id} style={styles.heroStop}><Text style={styles.heroStopText}>{countryFlag(stop.countryCode)} {translate(stop.name, language)}</Text></View>)}
    </ScrollView>
    {children}
  </View>;
}

export const heroStylesSheet = themedStyles((p) => ({
  heroButton: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 14, backgroundColor: p.white },
  heroButtonText: { color: p.blue, fontSize: 13, fontWeight: "800" },
}));

const stylesSheet = themedStyles((p) => ({
  hero: { borderRadius: 22, overflow: "hidden", padding: 18, gap: 10 },
  statusPill: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.22)" },
  statusText: { color: p.onColor, fontSize: 12, fontWeight: "800" },
  heroTitle: { color: p.onColor, fontSize: 26, lineHeight: 31, fontWeight: "800" },
  heroMeta: { color: "rgba(255,255,255,0.9)", fontSize: 13, fontWeight: "600" },
  heroStop: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.18)" },
  heroStopText: { color: p.onColor, fontSize: 12, fontWeight: "700" },
}));
