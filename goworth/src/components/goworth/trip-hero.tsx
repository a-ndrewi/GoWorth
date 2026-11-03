import type { ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";
import { themedStyles } from "@/constants/design";
import { usePalette, useStyles, useThemePreference } from "@/state/theme-context";
import { money, tripDays, type Trip } from "@/data/travel";
import { tripParty } from "@/utils/trip-party";
import { useTravel } from "@/state/travel-context";
import { routeStop, uniqueRouteStops } from "@/data/trip-route";
import { countryFlag } from "@/data/geography";
import { formatMessage, translate } from "@/data/i18n";
import { useAppLanguage } from "@/data/formatting";
import { GlyphIcon } from "@/components/goworth/icons";
import { WeatherBadge } from "@/components/goworth/weather-badge";
import { citiesForDay } from "@/utils/trip";
import { cityCode, dateRange } from "@/utils/ticket";

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

/** Ticket colours, the same as the home screen widget's, so the trip looks like one boarding pass everywhere. */
const ticket = {
  light: { paper: "#FFFBF0", ink: "#132238", muted: "#5B6B85", accent: "#2457E6", tear: "#C9D3E8" },
  dark: { paper: "#172033", ink: "#EEF2F8", muted: "#8FA0BC", accent: "#7FA2FF", tear: "#3A4A66" },
  // Past trips are printed on grey stock so they never pass for the trip under way.
  archived: { paper: "#EEF0F4", ink: "#3A4559", muted: "#7A8599", accent: "#5B6B85", tear: "#C7CDD8" },
  archivedDark: { paper: "#1A1F2A", ink: "#C9D1DE", muted: "#7D889C", accent: "#8FA0BC", tear: "#353D4D" },
};
const BARS = [2, 1, 1, 3, 1, 2, 1, 1, 2, 3, 1, 1, 2, 1, 3, 1, 2, 1];

/** The trip as a boarding pass: city codes with the route between them, a tear line, and the trip's details. */
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
  const { scheme } = useThemePreference();
  const { travellers } = useTravel();
  const c = archived ? ticket[scheme === "dark" ? "archivedDark" : "archived"] : ticket[scheme === "dark" ? "dark" : "light"];
  const language = useAppLanguage();
  const locale = language === "ro" ? "ro-RO" : "en-US";
  const days = tripDays(trip.start, trip.end);
  const status = tripStatus(trip.start, trip.end, localToday());
  const stops = uniqueRouteStops(trip);
  const from = stops[0];
  const to = stops.length > 1 ? stops[stops.length - 1] : null;
  // The weather shown is where the traveller is today, or where the trip starts before it begins.
  const here = routeStop(trip, citiesForDay(trip, status.kind === "active" ? status.days : 1)[0]);
  const statusLabel = (label ?? (status.kind === "upcoming"
    ? status.days <= 1 ? translate("Departs tomorrow", language) : formatMessage("Departs in {days} days", { days: status.days }, language)
    : status.kind === "active" ? formatMessage("Day {day}/{days}", { day: status.days, days }, language) : translate("Trip ended", language)))
    .toLocaleUpperCase(locale);
  const upper = (value: string) => translate(value, language).toLocaleUpperCase(locale);
  const field = (title: string, value: ReactNode, align: "flex-start" | "flex-end" = "flex-start") => (
    <View style={{ gap: 2, alignItems: align }}>
      <Text style={[styles.fieldLabel, { color: c.muted }]}>{upper(title)}</Text>
      {typeof value === "string" ? <Text numberOfLines={1} style={[styles.fieldValue, { color: c.ink }]}>{value}</Text> : value}
    </View>
  );
  const place = (stop: typeof from, alignEnd = false) => (
    <View style={{ flexShrink: 1, alignItems: alignEnd ? "flex-end" : "flex-start" }}>
      <Text style={[styles.code, { color: c.ink }]}>{cityCode(stop.name)}</Text>
      <Text numberOfLines={1} style={[styles.city, { color: c.muted }]}>{countryFlag(stop.countryCode)} {translate(stop.name, language)}</Text>
    </View>
  );
  return <View style={[styles.ticket, { backgroundColor: c.paper }]}>
    <View style={styles.top}>
      <View style={styles.headerRow}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <GlyphIcon name="plane" size={14} color={c.accent} />
          <Text style={[styles.status, { color: c.accent }]}>{statusLabel}</Text>
        </View>
        {!archived && <WeatherBadge point={here} color={c.ink} />}
      </View>
      <View style={styles.route}>
        {place(from)}
        {to && <View style={styles.flight}>
          <View style={[styles.flightLine, { borderColor: c.tear }]} />
          <GlyphIcon name="plane" size={16} color={c.accent} />
          <View style={[styles.flightLine, { borderColor: c.tear }]} />
        </View>}
        {to && place(to, true)}
      </View>
      {stops.length > 2 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {stops.slice(1, -1).map((stop) => <View key={stop.id} style={[styles.via, { borderColor: c.tear }]}>
          <Text style={[styles.viaText, { color: c.muted }]}>{translate("via", language)} {cityCode(stop.name)} · {translate(stop.name, language)}</Text>
        </View>)}
      </ScrollView>}
    </View>

    {/* Tear line: notches in the screen's colour cut into both edges, joined by a dashed line. */}
    <View style={styles.tear}>
      <View style={[styles.notch, styles.notchLeft, { backgroundColor: p.canvas }]} />
      <View style={[styles.dash, { borderColor: c.tear }]} />
      <View style={[styles.notch, styles.notchRight, { backgroundColor: p.canvas }]} />
    </View>

    <View style={styles.stub}>
      <View style={styles.fields}>
        {field("Dates", dateRange(trip.start, trip.end, locale))}
        {field("Passenger", translate(tripParty(trip.companions, archived ? 1 : travellers), language))}
        {field("Budget", money(trip.budget), "flex-end")}
      </View>
      <View style={styles.footer}>
        <View style={{ flexShrink: 1 }}>{children}</View>
        <View style={styles.barcode} accessible={false}>
          {BARS.map((width, index) => <View key={index} style={{ width, height: 26, backgroundColor: c.ink }} />)}
        </View>
      </View>
    </View>
  </View>;
}

export const heroStylesSheet = themedStyles((p) => ({
  heroButton: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 14, borderWidth: 1.5, borderColor: p.blue },
  heroButtonText: { color: p.blue, fontSize: 13, fontWeight: "800" },
}));

const NOTCH = 22;

const stylesSheet = themedStyles((p) => ({
  // Clipped to its corners, which also trims the notches into half circles; no shadow, which clipping would cut off.
  ticket: { borderRadius: 22, overflow: "hidden", borderWidth: 1, borderColor: p.line },
  top: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 12, gap: 10 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  status: { fontSize: 12, fontWeight: "900", letterSpacing: 1.3 },
  route: { flexDirection: "row", alignItems: "center", gap: 10 },
  code: { fontSize: 40, lineHeight: 44, fontWeight: "900", letterSpacing: 1.5 },
  city: { fontSize: 13, fontWeight: "600" },
  flight: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 },
  flightLine: { flex: 1, borderTopWidth: 1.5, borderStyle: "dashed" },
  via: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10, borderWidth: 1 },
  viaText: { fontSize: 11, fontWeight: "700" },
  tear: { height: NOTCH, justifyContent: "center" },
  dash: { marginHorizontal: NOTCH / 2 + 4, borderTopWidth: 1.5, borderStyle: "dashed" },
  // Outlined like the ticket, so the card's edge follows the cut round.
  notch: { position: "absolute", top: 0, width: NOTCH, height: NOTCH, borderRadius: NOTCH / 2, borderWidth: 1, borderColor: p.line },
  notchLeft: { left: -NOTCH / 2 },
  notchRight: { right: -NOTCH / 2 },
  stub: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 16, gap: 14 },
  fields: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  fieldLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  fieldValue: { fontSize: 14, fontWeight: "700" },
  footer: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12, minHeight: 26 },
  barcode: { flexDirection: "row", gap: 1.5, opacity: 0.9 },
}));
