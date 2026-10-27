import { router, type Href } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { Icon } from "@/components/goworth/ui";
import { themedStyles } from "@/constants/design";
import { usePalette, useStyles } from "@/state/theme-context";
import { money, tripDays, type TripJournalEntry } from "@/data/travel";
import { routeTitle, uniqueRouteStops } from "@/data/trip-route";
import { countryFlag } from "@/data/geography";
import { formatMessage, translate } from "@/data/i18n";
import { useAppLanguage } from "@/data/formatting";

/** An archived trip at a glance: route, dates, outcome and what was recorded. */
export function PastTripCard({ entry }: { entry: TripJournalEntry }) {
  const styles = useStyles(stylesSheet);
  const p = usePalette();
  const language = useAppLanguage();
  const locale = language === "ro" ? "ro-RO" : "en-US";
  const stops = uniqueRouteStops(entry.trip);
  const days = tripDays(entry.trip.start, entry.trip.end);
  const spent = entry.expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const completed = entry.status === "completed";
  const start = new Date(`${entry.trip.start}T12:00:00Z`);
  const range = `${start.toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "UTC" })} – ${new Date(`${entry.trip.end}T12:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}`;
  const flags = [...new Set(stops.map((stop) => countryFlag(stop.countryCode)).filter(Boolean))].slice(0, 3);
  return <Pressable accessibilityRole="button" accessibilityLabel={formatMessage("Open {title} trip record", { title: routeTitle(entry.trip, language) }, language)}
    onPress={() => router.push({ pathname: "/journal-trip", params: { id: entry.id } } as Href)}
    style={({ pressed }) => [styles.card, pressed && { backgroundColor: p.soft, transform: [{ scale: 0.99 }] }]}>
    <View style={[styles.date, !completed && { backgroundColor: p.soft }]}>
      <Text style={[styles.month, !completed && { color: p.muted }]}>{start.toLocaleDateString(locale, { month: "short", timeZone: "UTC" }).toUpperCase()}</Text>
      <Text style={[styles.day, !completed && { color: p.muted }]}>{start.getUTCDate()}</Text>
      {!!flags.length && <Text style={styles.flags}>{flags.join("")}</Text>}
    </View>
    <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
      <View style={styles.titleRow}>
        <Text numberOfLines={1} style={styles.title}>{routeTitle(entry.trip, language)}</Text>
        <View style={[styles.badge, completed ? styles.badgeDone : styles.badgePlan]}>
          <Text style={[styles.badgeText, { color: completed ? p.green : p.muted }]}>{translate(completed ? "Completed" : "Plan", language)}</Text>
        </View>
      </View>
      <Text numberOfLines={1} style={styles.meta}>{formatMessage(days === 1 ? "{range} · {days} day" : "{range} · {days} days", { range, days }, language)}</Text>
      {stops.length > 1 && <Text numberOfLines={1} style={styles.meta}>{stops.map((stop) => translate(stop.name, language)).join(" → ")}</Text>}
      <View style={styles.stats}>
        <View style={styles.stat}><Icon name="calendar" size={13} color={p.blue} /><Text style={styles.statText}>{entry.activities.length}</Text></View>
        <View style={styles.stat}><Icon name="wallet" size={13} color={spent > entry.trip.budget ? p.danger : p.blue} /><Text style={styles.statText}>{money(spent)}<Text style={styles.statMuted}> / {money(entry.trip.budget)}</Text></Text></View>
      </View>
      {!!entry.reflection && <Text numberOfLines={2} style={styles.note}>“{entry.reflection}”</Text>}
    </View>
    <Icon name="right" size={17} color={p.muted} />
  </Pressable>;
}

const stylesSheet = themedStyles((p) => ({
  card: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 18, borderWidth: 1, borderColor: p.line, backgroundColor: p.white },
  date: { width: 58, alignSelf: "stretch", minHeight: 76, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: p.blueSoft },
  month: { color: p.blue, fontSize: 11, fontWeight: "800" },
  day: { color: p.ink, fontSize: 22, lineHeight: 26, fontWeight: "800" },
  flags: { fontSize: 12, marginTop: 2 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  title: { flexShrink: 1, color: p.ink, fontSize: 15, fontWeight: "800" },
  badge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  badgeDone: { backgroundColor: p.greenSoft },
  badgePlan: { backgroundColor: p.soft },
  badgeText: { fontSize: 10, fontWeight: "800" },
  meta: { color: p.muted, fontSize: 12, fontWeight: "600" },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 2 },
  stat: { flexDirection: "row", alignItems: "center", gap: 4 },
  statText: { color: p.ink, fontSize: 12, fontWeight: "700" },
  statMuted: { color: p.muted, fontWeight: "600" },
  note: { color: p.muted, fontSize: 12, fontStyle: "italic", lineHeight: 17 },
}));
