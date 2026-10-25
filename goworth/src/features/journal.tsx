import { router, useLocalSearchParams, type Href } from "expo-router";
import { useState } from "react";
import { Pressable, Share, Text, View } from "react-native";
import { Button, Copy, EmptyState, Field, Header, Heading, Icon, IconButton, Row, Screen, Sheet, sharedSheet } from "@/components/goworth/ui";
import { themedStyles } from "@/constants/design";
import { usePalette, useStyles } from "@/state/theme-context";
import {
  findDestination, money, places, type Activity, type Expense, type Trip,
  type TripJournalEntry,
} from "@/data/travel";
import { useTravel } from "@/state/travel-context";
import { TripHero } from "@/components/goworth/trip-hero";
import { routeStopForDay, uniqueRouteStops } from "@/data/trip-route";
import { formatMessage, translate } from "@/data/i18n";
import { getLanguage, useAppLanguage } from "@/data/formatting";
import { publicActivityNote, publicPlaceCategory, translatedActivityNote } from "@/utils/public-activity";
import { PlacePreviewPhoto, PlaceThumbnail } from "@/components/goworth/place-preview";
import { venueFromCategory } from "@/data/nearby-places";

type TripRecord = {
  id: string;
  trip: Trip;
  activities: Activity[];
  expenses: Expense[];
  savedPlaceIds: string[];
  reflection: string;
  status: "current" | TripJournalEntry["status"];
};

type PreviewPlace = { id: string; name: string; category: string; location: string; latitude?: number; longitude?: number; sourceUrl?: string };

function dateRange(trip: Trip) {
  const format = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString(getLanguage() === "ro" ? "ro-RO" : "en-US", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });
  return `${format(trip.start)} - ${format(trip.end)}`;
}


export function JournalTripScreen() {
  const styles = useStyles(stylesSheet);
  const s = useStyles(sharedSheet);
  const p = usePalette();
  const language = useAppLanguage();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const {
    trip, activities, expenses, savedPlaces, externalPlaces, journal, journalEntries,
    setJournal, setArchivedReflection, deleteJournalEntry,
  } = useTravel();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [placePreview, setPlacePreview] = useState<PreviewPlace | null>(null);
  const archived = journalEntries.find((entry) => entry.id === id);
  const record: TripRecord | null = id === "current" && trip ? {
    id: "current", trip, activities, expenses, savedPlaceIds: savedPlaces,
    reflection: journal, status: "current",
  } : archived ? { ...archived } : null;
  if (!record) return <Screen><Header title="Trip record" /><EmptyState title="Trip not found" detail="This trip is no longer in your journal." action="Back to trips" onPress={() => router.replace({ pathname: "/saved", params: { tab: "Trips" } } as Href)} /></Screen>;

  const routeCities = uniqueRouteStops(record.trip);
  const spent = record.expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const days = [...new Set(record.activities.map((activity) => activity.day))].sort((a, b) => a - b);
  const localPlaces = places.filter((place) => routeCities.some((city) => city.id === place.destinationId) && (
    record.savedPlaceIds.includes(place.id) || record.activities.some((activity) => activity.name.trim().toLowerCase() === place.name.toLowerCase())
  ));
  const linkedExternalPlaces = externalPlaces.filter((place) => record.savedPlaceIds.includes(place.id) && (
    record.activities.some((activity) => activity.note.includes(place.sourceUrl)) ||
    routeCities.some((city) => place.location?.toLocaleLowerCase().includes(city.name.toLocaleLowerCase()))
  ));
  const saveNote = async () => {
    setBusy(true);
    setError("");
    try {
      if (record.status === "current") await setJournal(draft.trim());
      else await setArchivedReflection(record.id, draft.trim());
      setEditing(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save this note.");
    } finally { setBusy(false); }
  };
  const share = () => {
    const lines = [
      routeCities.map((city) => `${city.name}, ${city.country}`).join(" → "), dateRange(record.trip),
      formatMessage("Budget: {budget}. Recorded expenses: {spent}.", { budget: money(record.trip.budget), spent: money(spent) }, language),
      ...record.activities.map((activity) => {
        const note = publicActivityNote(activity.note);
        return formatMessage("Day {day}, {time}: {name}{note}", { day: activity.day, time: activity.time, name: activity.name, note: note ? ` - ${note}` : "" }, language);
      }),
      ...record.expenses.map((expense) => `${expense.category}: ${expense.label} - ${money(expense.amount)}`),
      ...(record.reflection ? [formatMessage("Note: {note}", { note: record.reflection }, language)] : []),
    ];
    void Share.share({ message: lines.join("\n") });
  };

  const byCategory = [...new Set(record.expenses.map((expense) => expense.category))]
    .map((category) => ({ category, total: record.expenses.filter((expense) => expense.category === category).reduce((sum, expense) => sum + expense.amount, 0) }))
    .sort((x, y) => y.total - x.total);
  const placeCount = localPlaces.length + linkedExternalPlaces.length;
  const stat = (label: string, value: string, tone: string = p.ink) => <View style={styles.stat}>
    <Copy muted style={{ fontSize: 11, fontWeight: "700" }}>{label}</Copy>
    <Text numberOfLines={1} style={[styles.statValue, { color: tone }]}>{value}</Text>
  </View>;

  return <Screen style={{ gap: 18 }}>
    <Row style={{ justifyContent: "space-between" }}>
      <IconButton name="back" label="Go back" onPress={() => router.canGoBack() ? router.back() : router.navigate({ pathname: "/saved", params: { tab: "Trips" } } as Href)} />
      <Copy style={{ fontWeight: "700" }}>{record.status === "current" ? "Current trip" : "Trip record"}</Copy>
      <IconButton name="share" label="Share trip record" onPress={share} />
    </Row>
    <TripHero trip={record.trip} archived={record.status !== "current"}
      label={record.status === "current" ? undefined : translate(record.status === "completed" ? "Completed" : "Unfinished plan", language)} />
    <Row style={{ gap: 8 }}>
      {stat("SPENT", money(spent), spent > record.trip.budget ? p.danger : p.ink)}
      {stat("BUDGET", money(record.trip.budget))}
      {stat("ACTIVITIES", String(record.activities.length))}
    </Row>

    <View style={styles.noteCard}>
      <Row style={{ justifyContent: "space-between" }}>
        <Heading style={styles.section}>Trip note</Heading>
        <Pressable accessibilityRole="button" accessibilityLabel={translate("Edit trip note", language)} onPress={() => { setDraft(record.reflection); setError(""); setEditing(true); }} hitSlop={8}>
          <Copy style={{ color: p.blue, fontWeight: "700", fontSize: 13 }}>{record.reflection ? "Edit" : "Add"}</Copy>
        </Pressable>
      </Row>
      <Copy muted style={{ fontStyle: record.reflection ? "italic" : "normal" }}>{record.reflection ? `“${record.reflection}”` : translate("How was it? Write down what you want to remember.", language)}</Copy>
    </View>

    <View style={{ gap: 10 }}>
      <Heading style={styles.section}>{formatMessage("Itinerary ({count})", { count: record.activities.length }, language)}</Heading>
      {days.map((day) => <View key={day} style={styles.dayCard}>
        <Row style={{ gap: 8 }}>
          <View style={styles.dayBadge}><Text style={styles.dayBadgeText}>{day}</Text></View>
          <Text style={styles.dayTitle}>{formatMessage("Day {day} · {city}", { day, city: translate(routeStopForDay(record.trip, day).name, language) }, language)}</Text>
        </Row>
        {record.activities.filter((activity) => activity.day === day).sort((a, b) => a.time.localeCompare(b.time)).map((activity) => <Row key={activity.id} style={{ alignItems: "flex-start", gap: 10 }}>
          <Text style={styles.time}>{activity.time}</Text>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Copy style={{ fontWeight: "600", fontSize: 14 }}>{activity.name}</Copy>
            {!!publicActivityNote(activity.note) && <Copy muted style={{ fontSize: 12 }}>{translatedActivityNote(activity.note, (part) => translate(part, language))}</Copy>}
          </View>
        </Row>)}
      </View>)}
      {!record.activities.length && <Copy muted>No activities were added to this itinerary.</Copy>}
    </View>

    {!!byCategory.length && <View style={{ gap: 10 }}>
      <Heading style={styles.section}>{formatMessage("Expenses ({count})", { count: record.expenses.length }, language)}</Heading>
      {byCategory.map((item) => <View key={item.category} style={{ gap: 5 }}>
        <Row style={{ justifyContent: "space-between" }}><Copy style={{ fontSize: 14, fontWeight: "600" }}>{translate(item.category, language)}</Copy><Copy style={{ fontWeight: "700" }}>{money(item.total)}</Copy></Row>
        <View style={styles.track}><View style={[styles.fill, { width: `${Math.max(4, (item.total / Math.max(spent, 1)) * 100)}%` }]} /></View>
      </View>)}
    </View>}

    {!!placeCount && <View style={{ gap: 6 }}>
      <Heading style={styles.section}>{formatMessage("Places ({count})", { count: placeCount }, language)}</Heading>
      {[...localPlaces.map((place): PreviewPlace => ({ id: place.id, name: place.name, category: place.category, location: `${findDestination(place.destinationId).name}, ${findDestination(place.destinationId).country}` })),
        ...linkedExternalPlaces.map((place): PreviewPlace => ({ id: place.id, name: place.name, category: publicPlaceCategory(place.category), location: place.location || "", latitude: place.latitude, longitude: place.longitude, sourceUrl: place.sourceUrl }))]
        .map((place) => <Pressable key={place.id} accessibilityRole="button" onPress={() => setPlacePreview(place)} style={({ pressed }) => [styles.placeRow, pressed && { backgroundColor: p.soft }]}>
          <PlaceThumbnail name={place.name} location={place.location} latitude={place.latitude} longitude={place.longitude} sourceUrl={place.sourceUrl} style={styles.placeThumb} venue={venueFromCategory(place.category)} />
          <View style={{ flex: 1, minWidth: 0 }}><Copy style={{ fontWeight: "600", fontSize: 14 }}>{place.name}</Copy>{!!place.category && <Copy muted style={{ fontSize: 12 }}>{translate(place.category, language)}</Copy>}</View>
        </Pressable>)}
    </View>}

    {record.status !== "current" && <Button secondary icon="trash" onPress={() => { setError(""); setConfirmDelete(true); }}>Delete trip record</Button>}
    <Sheet visible={!!placePreview} title={placePreview?.name ?? ""} onClose={() => setPlacePreview(null)}>
      {placePreview && <>
        <PlacePreviewPhoto name={placePreview.name} location={placePreview.location} latitude={placePreview.latitude} longitude={placePreview.longitude} sourceUrl={placePreview.sourceUrl}
          badge={placePreview.category ? translate(placePreview.category, language) : undefined} venue={venueFromCategory(placePreview.category)} />
        {!!placePreview.location && <Row style={{ gap: 6 }}><Icon name="pin" size={15} color={p.muted} /><Copy muted>{translate(placePreview.location, language)}</Copy></Row>}
      </>}
    </Sheet>
    <Sheet visible={editing} title="Trip note" onClose={() => setEditing(false)}>
      <Field label="Your note" value={draft} onChangeText={setDraft} multiline style={{ minHeight: 170, textAlignVertical: "top" }} maxLength={1200} />
      <Copy muted style={{ fontSize: 11 }}>{draft.length}/1200</Copy>
      {!!error && <Copy style={s.error}>{error}</Copy>}
      <Button busy={busy} onPress={() => void saveNote()}>Save note</Button>
    </Sheet>
    <Sheet visible={confirmDelete} title="Delete this trip record?" onClose={() => setConfirmDelete(false)}>
      <Copy muted>This removes the archived trip and all of its journal details. This cannot be undone.</Copy>
      {!!error && <Copy style={s.error}>{error}</Copy>}
      <Button busy={busy} icon="trash" onPress={async () => {
        setBusy(true);
        setError("");
        try { await deleteJournalEntry(record.id); setConfirmDelete(false); if (router.canGoBack()) router.back(); else router.replace({ pathname: "/saved", params: { tab: "Trips" } } as Href); }
        catch (caught) { setError(caught instanceof Error ? caught.message : "Could not delete this trip."); }
        finally { setBusy(false); }
      }}>Delete trip</Button>
      <Button secondary onPress={() => setConfirmDelete(false)}>Keep trip</Button>
    </Sheet>
  </Screen>;
}

const stylesSheet = themedStyles((p) => ({
  section: { fontSize: 18, lineHeight: 24 },
  stat: { flex: 1, minWidth: 0, gap: 3, padding: 12, borderRadius: 14, backgroundColor: p.soft },
  statValue: { fontSize: 16, fontWeight: "800" },
  noteCard: { gap: 8, padding: 16, borderRadius: 18, backgroundColor: p.blueTint, borderWidth: 1, borderColor: p.blueLine },
  dayCard: { gap: 10, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: p.line, backgroundColor: p.white },
  dayBadge: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: p.blue },
  dayBadgeText: { color: p.onColor, fontSize: 12, fontWeight: "800" },
  dayTitle: { color: p.ink, fontSize: 15, fontWeight: "800" },
  time: { width: 44, color: p.muted, fontSize: 12, fontWeight: "700", paddingTop: 2 },
  track: { height: 8, borderRadius: 4, overflow: "hidden", backgroundColor: p.soft },
  fill: { height: 8, borderRadius: 4, backgroundColor: p.blue },
  placeThumb: { width: 48, height: 48, borderRadius: 12, backgroundColor: p.blueSoft },
  placeRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 6, borderRadius: 10 },
}));
