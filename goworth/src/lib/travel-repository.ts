import type { Activity, Expense, Trip, TripJournalEntry } from "@/data/travel";
import type { NearbyPlace } from "@/data/nearby-places";
import { supabase } from "@/lib/supabase";
import type { AppCurrency, AppLanguage } from "@/data/formatting";
import { decode } from "base64-arraybuffer";

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

function requireData<T>(result: { data: T; error: { message: string } | null }) {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

async function profileFunctionError(error: { message: string; context?: unknown } | null, fallback: string) {
  const response = error?.context;
  if (response instanceof Response) {
    if (response.status === 404) return "Profile verification is unavailable. Please try again later.";
    const body = await response.clone().json().catch(() => null);
    if (typeof body?.error === "string") return body.error;
  }
  return error?.message || fallback;
}

export async function loadTravelData(userId: string) {
  const db = client();
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const [profile, preferences, trip, activities, expenses, saved, memory, journalEntries, entitlement, usage] =
    await Promise.all([
      db.from("profiles").select("display_name,username,notifications_enabled,language,currency,avatar_path,avatar_status").eq("user_id", userId).maybeSingle(),
      db.from("travel_preferences").select("interests,region,budget,pace").eq("user_id", userId).maybeSingle(),
      db.from("trips").select("destination_id,start_date,end_date,budget,companions,interests,day_destinations,day_cities,route_stops").eq("user_id", userId).maybeSingle(),
      db.from("trip_activities").select("id,day,period,activity_time,name,note,place_id,latitude,longitude").eq("user_id", userId).order("position"),
      db.from("trip_expenses").select("id,label,category,amount").eq("user_id", userId).order("position"),
      db.from("saved_items").select("kind,item_id,details").eq("user_id", userId),
      db.from("travel_memories").select("journal").eq("user_id", userId).maybeSingle(),
      db.from("trip_journal_entries").select("id,destination_id,start_date,end_date,budget,companions,interests,day_destinations,day_cities,route_stops,activities,expenses,saved_place_ids,reflection,status,archived_at").eq("user_id", userId).order("archived_at", { ascending: false }),
      db.from("user_entitlements").select("plan,valid_until").eq("user_id", userId).maybeSingle(),
      db.from("usage_events").select("kind").eq("user_id", userId).gte("created_at", monthStart.toISOString()),
    ]);

  const profileRow = requireData(profile.error
    ? await db.from("profiles").select("display_name,username,notifications_enabled").eq("user_id", userId).maybeSingle()
    : profile);
  const tripRow = requireData(trip.error
    ? await db.from("trips").select("destination_id,start_date,end_date,budget,companions,interests").eq("user_id", userId).maybeSingle()
    : trip);
  const activityRows = requireData(activities.error
    ? await db.from("trip_activities").select("id,day,period,activity_time,name,note").eq("user_id", userId).order("position")
    : activities);
  const journalRows = journalEntries.error
    ? await db.from("trip_journal_entries").select("id,destination_id,start_date,end_date,budget,companions,interests,activities,expenses,saved_place_ids,reflection,status,archived_at").eq("user_id", userId).order("archived_at", { ascending: false })
    : journalEntries;
  const savedRows = requireData(saved.error
    ? await db.from("saved_items").select("kind,item_id").eq("user_id", userId)
    : saved);
  return {
    profile: profileRow ? {
      ...profileRow,
      language: "language" in profileRow ? profileRow.language : "en",
      currency: "currency" in profileRow ? profileRow.currency : "EUR",
      avatar_path: "avatar_path" in profileRow && typeof profileRow.avatar_path === "string" ? profileRow.avatar_path : null,
      avatar_status: "avatar_status" in profileRow && typeof profileRow.avatar_status === "string" ? profileRow.avatar_status : "none",
    } : null,
    preferences: requireData(preferences),
    trip: tripRow
      ? {
          destinationId: tripRow.destination_id,
          dayDestinations: "day_destinations" in tripRow ? tripRow.day_destinations || undefined : undefined,
          dayCities: "day_cities" in tripRow ? tripRow.day_cities || undefined : undefined,
          routeStops: "route_stops" in tripRow ? tripRow.route_stops || undefined : undefined,
          start: tripRow.start_date,
          end: tripRow.end_date,
          budget: Number(tripRow.budget),
          companions: tripRow.companions,
          interests: tripRow.interests,
        } as Trip
      : null,
    activities: (activityRows ?? []).map((item) => ({
      id: item.id,
      day: item.day,
      period: item.period,
      time: item.activity_time,
      name: item.name,
      note: item.note,
      placeId: "place_id" in item ? item.place_id || undefined : undefined,
      latitude: "latitude" in item ? item.latitude ?? undefined : undefined,
      longitude: "longitude" in item ? item.longitude ?? undefined : undefined,
    })) as Activity[],
    expenses: (requireData(expenses) ?? []).map((item) => ({
      id: item.id,
      label: item.label,
      category: item.category,
      amount: Number(item.amount),
    })) as Expense[],
    saved: savedRows ?? [],
    journal: requireData(memory)?.journal ?? "",
    journalAvailable: !journalRows.error,
    journalEntries: journalRows.error ? [] : mapJournalEntries(journalRows.data ?? []),
    entitlement: entitlement.error ? null : entitlement.data,
    usage: usage.error ? [] : usage.data ?? [],
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
  day_destinations?: Trip["dayDestinations"];
  day_cities?: Trip["dayCities"];
  route_stops?: Trip["routeStops"];
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
      dayDestinations: row.day_destinations,
      dayCities: row.day_cities,
      routeStops: row.route_stops,
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
  const db = client();
  const result = await db.from("trip_journal_entries")
    .select("id,destination_id,start_date,end_date,budget,companions,interests,day_destinations,day_cities,route_stops,activities,expenses,saved_place_ids,reflection,status,archived_at")
    .eq("user_id", userId).order("archived_at", { ascending: false });
  const rows = result.error
    ? await db.from("trip_journal_entries")
      .select("id,destination_id,start_date,end_date,budget,companions,interests,activities,expenses,saved_place_ids,reflection,status,archived_at")
      .eq("user_id", userId).order("archived_at", { ascending: false })
    : result;
  return mapJournalEntries(requireData(rows) ?? []);
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
  profile: { name: string; username: string; language: AppLanguage; currency: AppCurrency },
  notifications: boolean,
) {
  const result = await client().functions.invoke("moderate-profile", { body: {
    action: "profile", name: profile.name, username: profile.username,
    language: profile.language, currency: profile.currency, notifications,
  } });
  if (result.error) throw new Error(await profileFunctionError(result.error, "Could not save your profile."));
}

export async function saveDisplayPreferences(language: AppLanguage, currency: AppCurrency) {
  const { error } = await client().auth.updateUser({ data: {
    goworth_language: language,
    goworth_currency: currency,
  } });
  if (error) throw new Error(error.message);
}

export async function profileAvatarUrl(path: string) {
  const { data, error } = await client().storage.from("profile-avatars").createSignedUrl(path, 3600);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export async function uploadProfileAvatar(userId: string, base64: string) {
  const bytes = decode(base64);
  if (bytes.byteLength < 100 || bytes.byteLength > 5 * 1024 * 1024)
    throw new Error("Choose a photo under 5 MB.");
  const header = new Uint8Array(bytes, 0, 3);
  if (header[0] !== 0xff || header[1] !== 0xd8 || header[2] !== 0xff)
    throw new Error("Choose a JPEG photo.");
  const path = `${userId}/pending/${Date.now()}-${Math.random().toString(36).slice(2, 12)}.jpg`;
  const db = client();
  const { error: uploadError } = await db.storage.from("profile-avatars").upload(path, bytes, { contentType: "image/jpeg", upsert: false });
  if (uploadError) throw new Error(/bucket not found|not found/i.test(uploadError.message)
    ? "Profile photos need the latest database migration and moderation function."
    : uploadError.message);
  try {
    const result = await db.functions.invoke("moderate-profile", { body: { action: "avatar", path } });
    if (result.error) throw new Error(await profileFunctionError(result.error, "Photo could not be approved."));
    if (!result.data?.path) throw new Error("Photo could not be approved.");
    return { path: result.data.path as string, url: await profileAvatarUrl(result.data.path) };
  } catch (error) {
    await db.storage.from("profile-avatars").remove([path]).catch(() => undefined);
    throw error;
  }
}

export type SupportTopic = "bug" | "account" | "premium" | "feedback" | "other";

export async function sendSupportMessage(message: { topic: SupportTopic; subject: string; message: string; name: string; device: string }) {
  const result = await client().functions.invoke("contact-support", { body: message });
  if (!result.error) return;
  const response = result.error.context;
  if (response instanceof Response && response.status === 404) throw new Error("Support messages are unavailable right now. Please try again later.");
  throw new Error(await profileFunctionError(result.error, "Your message could not be sent. Please try again later."));
}

export async function removeProfileAvatar() {
  const result = await client().functions.invoke("moderate-profile", { body: { action: "remove-avatar" } });
  if (result.error) throw new Error(await profileFunctionError(result.error, "Could not remove the photo."));
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
  const db = client();
  const payload = {
    p_destination_id: trip.destinationId,
    p_start_date: trip.start,
    p_end_date: trip.end,
    p_budget: trip.budget,
    p_companions: trip.companions,
    p_interests: trip.interests,
    p_day_destinations: trip.dayDestinations || null,
    p_day_cities: trip.dayCities || null,
    p_route_stops: trip.routeStops || null,
    p_activities: activities.map((activity, position) => ({
      id: activity.id,
      day: activity.day,
      period: activity.period,
      activity_time: activity.time,
      name: activity.name,
      note: activity.note,
      place_id: activity.placeId || null,
      latitude: activity.latitude ?? null,
      longitude: activity.longitude ?? null,
      position,
    })),
  };
  const result = await db.rpc("replace_trip", payload);
  if (result.error && !trip.dayDestinations && !trip.dayCities && !trip.routeStops && /function|schema cache/i.test(result.error.message)) {
    const { p_day_destinations, p_day_cities, p_route_stops, ...legacyPayload } = payload;
    void p_day_destinations; void p_day_cities; void p_route_stops;
    requireData(await db.rpc("replace_trip", legacyPayload));
    return;
  }
  requireData(result);
}

/** Saves changes to the current trip in place: no archive, and activities on days that no longer exist are removed. */
export async function updateTrip(userId: string, trip: Trip, removedActivityIds: string[]) {
  const db = client();
  requireData(await db.from("trips").update({
    destination_id: trip.destinationId, start_date: trip.start, end_date: trip.end, budget: trip.budget,
    companions: trip.companions, interests: trip.interests, day_destinations: trip.dayDestinations ?? null,
    day_cities: trip.dayCities ?? null, route_stops: trip.routeStops ?? null,
  }).eq("user_id", userId));
  if (removedActivityIds.length) requireData(await db.from("trip_activities").delete().eq("user_id", userId).in("id", removedActivityIds));
}

export async function deleteTrip(userId: string) {
  requireData(await client().from("trips").delete().eq("user_id", userId));
}

export async function saveActivity(userId: string, activity: Activity, position: number) {
  const db = client();
  const values = {
    user_id: userId,
    id: activity.id,
    day: activity.day,
    period: activity.period,
    activity_time: activity.time,
    name: activity.name,
    note: activity.note,
    place_id: activity.placeId || null,
    latitude: activity.latitude ?? null,
    longitude: activity.longitude ?? null,
    position,
  };
  const result = await db.from("trip_activities").upsert(values);
  if (result.error && !activity.placeId && /column|schema cache/i.test(result.error.message)) {
    const { place_id, latitude, longitude, ...legacyValues } = values;
    void place_id; void latitude; void longitude;
    requireData(await db.from("trip_activities").upsert(legacyValues));
    return;
  }
  requireData(result);
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
  details?: NearbyPlace,
) {
  const db = client();
  let result = enabled
    ? await db.from("saved_items").upsert({ user_id: userId, kind, item_id: itemId, ...(details ? { details } : {}) })
    : await db.from("saved_items").delete().eq("user_id", userId).eq("kind", kind).eq("item_id", itemId);
  if (details && result.error && /column.*details|details.*column/i.test(result.error.message)) {
    result = await db.from("saved_items").upsert({ user_id: userId, kind, item_id: itemId });
  }
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
