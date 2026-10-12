import type { Activity, Expense, Trip } from "@/data/travel";
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
  const [profile, preferences, trip, activities, expenses, saved, memory] =
    await Promise.all([
      db.from("profiles").select("display_name,username,notifications_enabled").eq("user_id", userId).maybeSingle(),
      db.from("travel_preferences").select("interests,region,budget,pace").eq("user_id", userId).maybeSingle(),
      db.from("trips").select("destination_id,start_date,end_date,budget,companions,interests").eq("user_id", userId).maybeSingle(),
      db.from("trip_activities").select("id,day,period,activity_time,name,note").eq("user_id", userId).order("position"),
      db.from("trip_expenses").select("id,label,category,amount").eq("user_id", userId).order("position"),
      db.from("saved_items").select("kind,item_id").eq("user_id", userId),
      db.from("travel_memories").select("journal").eq("user_id", userId).maybeSingle(),
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
  };
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

export async function saveExpense(userId: string, expense: Expense, position: number) {
  requireData(await client().from("trip_expenses").upsert({
    user_id: userId,
    ...expense,
    position,
  }));
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

export async function saveJournal(userId: string, journal: string) {
  requireData(await client().from("travel_memories").upsert({
    user_id: userId,
    journal,
    updated_at: new Date().toISOString(),
  }));
}
