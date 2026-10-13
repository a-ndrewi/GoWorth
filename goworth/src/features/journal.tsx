import { router, useLocalSearchParams, type Href } from "expo-router";
import { useState } from "react";
import { Pressable, Share, View } from "react-native";
import {
  Button, Copy, DestinationPhoto, EmptyState, Field, Header, Heading,
  Icon, IconButton, Row, Screen, Sheet, s,
} from "@/components/goworth/ui";
import { palette as p } from "@/constants/design";
import {
  findDestination, money, places, type Activity, type Expense, type Trip,
  type TripJournalEntry,
} from "@/data/travel";
import { useTravel } from "@/state/travel-context";

type TripRecord = {
  id: string;
  trip: Trip;
  activities: Activity[];
  expenses: Expense[];
  savedPlaceIds: string[];
  reflection: string;
  status: "current" | TripJournalEntry["status"];
};

function dateRange(trip: Trip) {
  const format = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString("en-US", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });
  return `${format(trip.start)} - ${format(trip.end)}`;
}

function recordLabel(status: TripRecord["status"]) {
  return status === "current" ? "Current trip" : status === "completed" ? "Completed" : "Archived plan";
}

function TripRecordRow({ record, onDelete }: { record: TripRecord; onDelete?: () => void }) {
  const destination = findDestination(record.trip.destinationId);
  const spent = record.expenses.reduce((sum, expense) => sum + expense.amount, 0);
  return <Row style={{ gap: 10, paddingVertical: 14, borderBottomWidth: 1, borderColor: p.line }}>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${destination.name} trip record`}
      onPress={() => router.push({ pathname: "/journal-trip", params: { id: record.id } } as Href)}
      style={[s.row, { flex: 1, minWidth: 0, gap: 13 }]}
    >
      <DestinationPhoto destination={destination} style={{ width: 76, height: 76, borderRadius: 6 }} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Copy style={{ fontSize: 15, fontWeight: "700" }}>{destination.name}</Copy>
        <Copy muted style={{ fontSize: 12 }}>{dateRange(record.trip)}</Copy>
        <Copy style={{ fontSize: 12, color: record.status === "completed" ? p.green : p.blue }}>{recordLabel(record.status)}</Copy>
        <Copy muted style={{ fontSize: 11 }}>{record.activities.length} activities · {money(spent)} recorded</Copy>
      </View>
      <Icon name="right" size={18} color={p.muted} />
    </Pressable>
    {onDelete && <IconButton name="trash" label={`Delete ${destination.name} trip`} color={p.danger} onPress={onDelete} />}
  </Row>;
}

export function MemoriesScreen() {
  const {
    trip, activities, expenses, savedPlaces, journal, journalEntries,
    journalAvailable, finishTrip, setJournal, deleteJournalEntry,
  } = useTravel();
  const [editing, setEditing] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleteEntry, setDeleteEntry] = useState<TripRecord | null>(null);
  const current: TripRecord | null = trip ? {
    id: "current", trip, activities, expenses, savedPlaceIds: savedPlaces,
    reflection: journal, status: "current",
  } : null;
  const history: TripRecord[] = journalEntries.map((entry) => ({ ...entry, savedPlaceIds: entry.savedPlaceIds }));
  const openEditor = () => { setDraft(journal); setError(""); setEditing(true); };
  const saveNote = async () => {
    setBusy(true);
    setError("");
    try { await setJournal(draft.trim()); setEditing(false); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save this note."); }
    finally { setBusy(false); }
  };
  const complete = async () => {
    setBusy(true);
    setError("");
    try { await finishTrip(); setConfirmFinish(false); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not finish this trip."); }
    finally { setBusy(false); }
  };

  return <Screen active="profile" style={{ gap: 18 }}>
    <Header title="Travel journal" />
    {!journalAvailable && <Copy style={s.error}>Trip history needs the latest database migration. Current trips are still available.</Copy>}
    {current && <View>
      <Heading style={{ fontSize: 19, lineHeight: 25 }}>Current trip</Heading>
      <TripRecordRow record={current} />
      <Row style={{ gap: 9, paddingTop: 11 }}>
        <Button secondary icon="edit" onPress={openEditor} style={{ flex: 1 }}>{journal ? "Edit note" : "Add note"}</Button>
        <Button secondary icon="check" onPress={() => { setError(""); setConfirmFinish(true); }} style={{ flex: 1 }}>Finish trip</Button>
      </Row>
    </View>}
    {!current && !!journal && <View style={{ gap: 9 }}>
      <Heading style={{ fontSize: 18, lineHeight: 24 }}>Personal note</Heading>
      <Copy>{journal}</Copy>
      <Button secondary icon="edit" onPress={openEditor}>Edit note</Button>
    </View>}
    <View>
      <Heading style={{ fontSize: 19, lineHeight: 25 }}>Past trips ({journalEntries.length})</Heading>
      {history.map((record) => <TripRecordRow key={record.id} record={record} onDelete={() => { setError(""); setDeleteEntry(record); }} />)}
    </View>
    {!current && !history.length && !journal && <EmptyState title="Your journal starts with a trip" detail="Your itinerary, recorded expenses, places, and notes will stay together here when you finish a trip." action="Plan a trip" onPress={() => router.push("/planner" as Href)} />}
    <Sheet visible={editing} title={trip ? "Trip note" : "Personal note"} onClose={() => setEditing(false)}>
      <Field label="Your note" value={draft} onChangeText={setDraft} multiline style={{ minHeight: 170, textAlignVertical: "top" }} maxLength={1200} />
      <Copy muted style={{ fontSize: 11 }}>{draft.length}/1200</Copy>
      {!!error && <Copy style={s.error}>{error}</Copy>}
      <Button busy={busy} onPress={() => void saveNote()}>Save note</Button>
    </Sheet>
    <Sheet visible={confirmFinish} title="Finish this trip?" onClose={() => setConfirmFinish(false)}>
      <Copy muted>The itinerary, recorded expenses, saved places, and note will move into your journal. This trip will no longer be editable.</Copy>
      {!!error && <Copy style={s.error}>{error}</Copy>}
      <Button busy={busy} onPress={() => void complete()}>Finish and archive</Button>
      <Button secondary onPress={() => setConfirmFinish(false)}>Keep trip open</Button>
    </Sheet>
    <Sheet visible={!!deleteEntry} title="Delete this trip record?" onClose={() => setDeleteEntry(null)}>
      <Copy muted>This removes the archived trip, its expenses, itinerary, places and note from your journal. This cannot be undone.</Copy>
      {!!error && <Copy style={s.error}>{error}</Copy>}
      <Button busy={busy} icon="trash" onPress={async () => {
        if (!deleteEntry) return;
        setBusy(true);
        setError("");
        try { await deleteJournalEntry(deleteEntry.id); setDeleteEntry(null); }
        catch (caught) { setError(caught instanceof Error ? caught.message : "Could not delete this trip."); }
        finally { setBusy(false); }
      }}>Delete trip</Button>
      <Button secondary onPress={() => setDeleteEntry(null)}>Keep trip</Button>
    </Sheet>
  </Screen>;
}

export function JournalTripScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const {
    trip, activities, expenses, savedPlaces, journal, journalEntries,
    setJournal, setArchivedReflection, deleteJournalEntry,
  } = useTravel();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const archived = journalEntries.find((entry) => entry.id === id);
  const record: TripRecord | null = id === "current" && trip ? {
    id: "current", trip, activities, expenses, savedPlaceIds: savedPlaces,
    reflection: journal, status: "current",
  } : archived ? { ...archived } : null;
  if (!record) return <Screen><Header title="Trip record" /><EmptyState title="Trip not found" detail="This trip is no longer in your journal." action="Back to journal" onPress={() => router.replace("/memories" as Href)} /></Screen>;

  const destination = findDestination(record.trip.destinationId);
  const spent = record.expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const days = [...new Set(record.activities.map((activity) => activity.day))].sort((a, b) => a - b);
  const localPlaces = places.filter((place) => place.destinationId === record.trip.destinationId && (
    record.savedPlaceIds.includes(place.id) || record.activities.some((activity) => activity.name.trim().toLowerCase() === place.name.toLowerCase())
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
      `${destination.name}, ${destination.country}`, dateRange(record.trip),
      `Budget: ${money(record.trip.budget)}. Recorded expenses: ${money(spent)}.`,
      ...record.activities.map((activity) => `Day ${activity.day}, ${activity.time}: ${activity.name}${activity.note ? ` - ${activity.note}` : ""}`),
      ...record.expenses.map((expense) => `${expense.category}: ${expense.label} - ${money(expense.amount)}`),
      ...(record.reflection ? [`Note: ${record.reflection}`] : []),
    ];
    void Share.share({ message: lines.join("\n") });
  };

  return <Screen style={{ gap: 18 }}>
    <Header title="Trip record" />
    <DestinationPhoto destination={destination} style={{ width: "100%", height: 190, borderRadius: 6 }} />
    <View style={{ gap: 4 }}>
      <Heading style={{ fontSize: 26, lineHeight: 32 }}>{destination.name}</Heading>
      <Copy muted>{destination.country} · {dateRange(record.trip)}</Copy>
      <Copy style={{ fontSize: 12, color: record.status === "completed" ? p.green : p.blue }}>{recordLabel(record.status)}</Copy>
    </View>
    <Row style={{ justifyContent: "space-between", gap: 10 }}>
      <View><Copy muted style={{ fontSize: 11 }}>BUDGET</Copy><Copy style={{ fontWeight: "700" }}>{money(record.trip.budget)}</Copy></View>
      <View><Copy muted style={{ fontSize: 11 }}>RECORDED</Copy><Copy style={{ fontWeight: "700" }}>{money(spent)}</Copy></View>
      <View><Copy muted style={{ fontSize: 11 }}>REMAINING</Copy><Copy style={{ fontWeight: "700", color: spent > record.trip.budget ? p.danger : p.ink }}>{money(record.trip.budget - spent)}</Copy></View>
    </Row>
    <Copy muted style={{ fontSize: 12 }}>{record.trip.companions} · {record.trip.interests.length ? record.trip.interests.join(", ") : "No interests specified"}</Copy>
    <View style={{ borderTopWidth: 1, borderColor: p.line, paddingTop: 16, gap: 8 }}>
      <Heading style={{ fontSize: 19, lineHeight: 25 }}>Places ({localPlaces.length})</Heading>
      {localPlaces.length ? localPlaces.map((place) => <Pressable key={place.id} accessibilityRole="button" onPress={() => router.push({ pathname: "/explore", params: { id: destination.id, place: place.id } } as Href)} style={[s.row, { paddingVertical: 7, gap: 10 }]}>
        <Icon name="pin" color={p.green} size={19} />
        <View style={{ flex: 1 }}><Copy style={{ fontWeight: "600", fontSize: 14 }}>{place.name}</Copy><Copy muted style={{ fontSize: 11 }}>{record.activities.some((activity) => activity.name.trim().toLowerCase() === place.name.toLowerCase()) ? "In itinerary" : "Saved place"} · {place.category}</Copy></View>
        <Icon name="right" color={p.muted} size={18} />
      </Pressable>) : <Copy muted>No catalog places were linked to this trip.</Copy>}
    </View>
    <View style={{ borderTopWidth: 1, borderColor: p.line, paddingTop: 16, gap: 11 }}>
      <Heading style={{ fontSize: 19, lineHeight: 25 }}>Itinerary ({record.activities.length})</Heading>
      {days.map((day) => <View key={day} style={{ gap: 7 }}>
        <Copy style={{ fontWeight: "700", color: p.blue }}>Day {day}</Copy>
        {record.activities.filter((activity) => activity.day === day).sort((a, b) => a.time.localeCompare(b.time)).map((activity) => <Row key={activity.id} style={{ alignItems: "flex-start", gap: 10, paddingVertical: 5 }}>
          <Copy muted style={{ width: 45, fontSize: 12 }}>{activity.time}</Copy>
          <View style={{ flex: 1 }}><Copy style={{ fontWeight: "600", fontSize: 14 }}>{activity.name}</Copy><Copy muted style={{ fontSize: 12 }}>{activity.period}{activity.note ? ` · ${activity.note}` : ""}</Copy></View>
        </Row>)}
      </View>)}
      {!record.activities.length && <Copy muted>No activities were added to this itinerary.</Copy>}
    </View>
    <View style={{ borderTopWidth: 1, borderColor: p.line, paddingTop: 16, gap: 9 }}>
      <Heading style={{ fontSize: 19, lineHeight: 25 }}>Expenses ({record.expenses.length})</Heading>
      {record.expenses.map((expense) => <Row key={expense.id} style={{ justifyContent: "space-between", gap: 10, paddingVertical: 4 }}>
        <View style={{ flex: 1 }}><Copy style={{ fontSize: 14, fontWeight: "600" }}>{expense.label}</Copy><Copy muted style={{ fontSize: 11 }}>{expense.category}</Copy></View>
        <Copy style={{ fontWeight: "600" }}>{money(expense.amount)}</Copy>
      </Row>)}
      {!record.expenses.length && <Copy muted>No expenses were recorded.</Copy>}
    </View>
    <View style={{ borderTopWidth: 1, borderColor: p.line, paddingTop: 16, gap: 9 }}>
      <Row style={{ justifyContent: "space-between" }}><Heading style={{ fontSize: 19, lineHeight: 25 }}>Notes</Heading><Pressable accessibilityRole="button" accessibilityLabel="Edit trip note" onPress={() => { setDraft(record.reflection); setError(""); setEditing(true); }}><Icon name="edit" color={p.blue} size={20} /></Pressable></Row>
      <Copy muted>{record.reflection || "No note added yet."}</Copy>
    </View>
    <Button secondary icon="share" onPress={share}>Share trip record</Button>
    {record.status !== "current" && <Button secondary icon="trash" onPress={() => { setError(""); setConfirmDelete(true); }}>Delete trip record</Button>}
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
        try { await deleteJournalEntry(record.id); setConfirmDelete(false); router.replace("/memories" as Href); }
        catch (caught) { setError(caught instanceof Error ? caught.message : "Could not delete this trip."); }
        finally { setBusy(false); }
      }}>Delete trip</Button>
      <Button secondary onPress={() => setConfirmDelete(false)}>Keep trip</Button>
    </Sheet>
  </Screen>;
}
