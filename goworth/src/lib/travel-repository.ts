import type { Activity, Expense, Trip, TripJournalEntry } from "@/data/travel";
import { supabase } from "@/lib/supabase";

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

function requireData<T>(result: { data: T; error: { message: string } | null }) {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

export async function loadTravelData(userId: string) {
  const db = client();
  const [profile, preferences, trip, activities, expenses, saved, memory, journalEntries] =
    await Promise.all([
      db.from("profiles").select("display_name,username,notifications_enabled").eq("user_id", userId).maybeSingle(),
      db.from("travel_preferences").select("interests,region,budget,pace").eq("user_id", userId).maybeSingle(),
      db.from("trips").select("destination_id,start_date,end_date,budget,companions,interests").eq("user_id", userId).maybeSingle(),
      db.from("trip_activities").select("id,day,period,activity_time,name,note").eq("user_id", userId).order("position"),
      db.from("trip_expenses").select("id,label,category,amount").eq("user_id", userId).order("position"),
      db.from("saved_items").select("kind,item_id").eq("user_id", userId),
      db.from("travel_memories").select("journal").eq("user_id", userId).maybeSingle(),
      db.from("trip_journal_entries").select("id,destination_id,start_date,end_date,budget,companions,interests,activities,expenses,saved_place_ids,reflection,status,archived_at").eq("user_id", userId).order("archived_at", { ascending: false }),
    ]);

  const loadedTrip = requireData(trip);
  return {
    profile: requireData(profile),
    preferences: requireData(preferences),
    trip: loadedTrip
      ? {
          destinationId: loadedTrip.destination_id,
          start: loadedTrip.start_date,
          end: loadedTrip.end_date,
          budget: Number(loadedTrip.budget),
          companions: loadedTrip.companions,
          interests: loadedTrip.interests,
        } as Trip
      : null,
    activities: (requireData(activities) ?? []).map((item) => ({
      id: item.id,
      day: item.day,
      period: item.period,
      time: item.activity_time,
      name: item.name,
      note: item.note,
    })) as Activity[],
    expenses: (requireData(expenses) ?? []).map((item) => ({
      id: item.id,
      label: item.label,
      category: item.category,
      amount: Number(item.amount),
    })) as Expense[],
    saved: requireData(saved) ?? [],
    journal: requireData(memory)?.journal ?? "",
    journalAvailable: !journalEntries.error,
    journalEntries: journalEntries.error ? [] : mapJournalEntries(journalEntries.data ?? []),
  };
}

type JournalRow = {
  id: string;
  destination_id: string;
  start_date: string;
  end_date: string;
  budget: number;
  companions: string;
  interests: string[];
  activities: Activity[];
  expenses: Expense[];
  saved_place_ids: string[];
  reflection: string;
  status: "completed" | "replaced";
  archived_at: string;
};

function mapJournalEntries(rows: JournalRow[]): TripJournalEntry[] {
  return rows.map((row) => ({
    id: row.id,
    trip: {
      destinationId: row.destination_id as Trip["destinationId"],
      start: row.start_date,
      end: row.end_date,
      budget: Number(row.budget),
      companions: row.companions,
      interests: row.interests,
    },
    activities: row.activities,
    expenses: row.expenses.map((expense) => ({ ...expense, amount: Number(expense.amount) })),
    savedPlaceIds: row.saved_place_ids,
    reflection: row.reflection,
    status: row.status,
    archivedAt: row.archived_at,
  }));
}

export async function loadTripJournal(userId: string): Promise<TripJournalEntry[]> {
  const result = await client().from("trip_journal_entries")
    .select("id,destination_id,start_date,end_date,budget,companions,interests,activities,expenses,saved_place_ids,reflection,status,archived_at")
    .eq("user_id", userId).order("archived_at", { ascending: false });
  return mapJournalEntries(requireData(result) ?? []);
}

export async function archiveCurrentTrip() {
  return requireData(await client().rpc("archive_trip", { p_status: "completed" }));
}

export async function saveTripReflection(userId: string, entryId: string, reflection: string) {
  requireData(await client().from("trip_journal_entries").update({ reflection })
    .eq("user_id", userId).eq("id", entryId));
}

export async function deleteTripJournalEntry(userId: string, entryId: string) {
  requireData(await client().from("trip_journal_entries").delete()
    .eq("user_id", userId).eq("id", entryId));
}

export async function saveProfile(
  userId: string,
  profile: { name: string; username: string },
  notifications: boolean,
) {
  requireData(await client().from("profiles").upsert({
    user_id: userId,
    display_name: profile.name,
    username: profile.username || null,
    notifications_enabled: notifications,
    updated_at: new Date().toISOString(),
  }));
}

export async function savePreferences(
  userId: string,
  preferences: { interests: string[]; region: string; budget: number; pace: string },
) {
  requireData(await client().from("travel_preferences").upsert({
    user_id: userId,
    ...preferences,
    updated_at: new Date().toISOString(),
  }));
}

export async function replaceTrip(userId: string, trip: Trip, activities: Activity[]) {
  requireData(await client().rpc("replace_trip", {
    p_destination_id: trip.destinationId,
    p_start_date: trip.start,
    p_end_date: trip.end,
    p_budget: trip.budget,
    p_companions: trip.companions,
    p_interests: trip.interests,
    p_activities: activities.map((activity, position) => ({
      id: activity.id,
      day: activity.day,
      period: activity.period,
      activity_time: activity.time,
      name: activity.name,
      note: activity.note,
      position,
    })),
  }));
}

export async function deleteTrip(userId: string) {
  requireData(await client().from("trips").delete().eq("user_id", userId));
}

export async function saveActivity(userId: string, activity: Activity, position: number) {
  requireData(await client().from("trip_activities").upsert({
    user_id: userId,
    id: activity.id,
    day: activity.day,
    period: activity.period,
    activity_time: activity.time,
    name: activity.name,
    note: activity.note,
    position,
  }));
}

export async function deleteActivity(userId: string, id: string) {
  requireData(await client().from("trip_activities").delete().eq("user_id", userId).eq("id", id));
}

export async function saveExpense(userId: string, expense: Expense, position: number) {
  requireData(await client().from("trip_expenses").upsert({
    user_id: userId,
    ...expense,
    position,
  }));
}

export async function deleteExpense(userId: string, id: string) {
  requireData(await client().from("trip_expenses").delete().eq("user_id", userId).eq("id", id));
}

export async function setSavedItem(
  userId: string,
  kind: "destination" | "place",
  itemId: string,
  enabled: boolean,
) {
  const db = client();
  const result = enabled
    ? await db.from("saved_items").upsert({ user_id: userId, kind, item_id: itemId })
    : await db.from("saved_items").delete().eq("user_id", userId).eq("kind", kind).eq("item_id", itemId);
  requireData(result);
}

export type RecentDiscovery = { kind: "destination" | "place"; item_id: string; created_at: string };

export async function loadRecentDiscoveries(): Promise<RecentDiscovery[]> {
  const result = await client().rpc("recent_discoveries");
  if (result.error) return [];
  return (result.data ?? []) as RecentDiscovery[];
}

export async function recordDiscoveryFavorite(
  userId: string,
  kind: "destination" | "place",
  itemId: string,
) {
  requireData(await client().from("discovery_activity").insert({ user_id: userId, kind, item_id: itemId }));
}

export async function saveJournal(userId: string, journal: string) {
  requireData(await client().from("travel_memories").upsert({
    user_id: userId,
    journal,
    updated_at: new Date().toISOString(),
  }));
}
