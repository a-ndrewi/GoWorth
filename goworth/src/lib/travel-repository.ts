import type { Activity, Expense, Trip, TripJournalEntry } from "@/data/travel";
import type { Settlement } from "@/utils/expense-split";
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

type TripRow = {
  id: string; user_id: string; destination_id: string; start_date: string; end_date: string; budget: number | string;
  companions: string; interests: string[]; day_destinations: string[] | null; day_cities: string[][] | null;
  route_stops: Trip["routeStops"] | null; note: string | null;
};
const tripColumns = "id,user_id,destination_id,start_date,end_date,budget,companions,interests,day_destinations,day_cities,route_stops,note";

/** One planned trip with its id, owner and note, as the app works with it. */
export type PlannedTrip = { trip: Trip; owner: string; note: string };

function mapTrip(row: TripRow): PlannedTrip {
  return {
    owner: row.user_id,
    note: row.note ?? "",
    trip: {
      id: row.id, destinationId: row.destination_id, dayDestinations: row.day_destinations || undefined,
      dayCities: row.day_cities || undefined, routeStops: row.route_stops || undefined, start: row.start_date, end: row.end_date,
      budget: Number(row.budget), companions: row.companions, interests: row.interests,
    },
  };
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
  const [profile, preferences, trips, saved, journalEntries, entitlement, usage] =
    await Promise.all([
      db.from("profiles").select("display_name,username,notifications_enabled,language,currency,avatar_path,avatar_status").eq("user_id", userId).maybeSingle(),
      db.from("travel_preferences").select("interests,region,budget,pace").eq("user_id", userId).maybeSingle(),
      db.from("trips").select("id,user_id,destination_id,start_date,end_date,budget,companions,interests,day_destinations,day_cities,route_stops,note").eq("user_id", userId).order("start_date"),
      db.from("saved_items").select("kind,item_id,details").eq("user_id", userId),
      db.from("trip_journal_entries").select("id,destination_id,start_date,end_date,budget,companions,interests,day_destinations,day_cities,route_stops,activities,expenses,saved_place_ids,reflection,status,archived_at").eq("user_id", userId).order("archived_at", { ascending: false }),
      db.rpc("my_membership").then((result) => result.error
        ? db.from("user_entitlements").select("plan,valid_until").eq("user_id", userId).maybeSingle()
        : { ...result, data: result.data ? { plan: result.data.plan as string, valid_until: (result.data.validUntil ?? null) as string | null } : null }),
      db.from("usage_events").select("kind").eq("user_id", userId).gte("created_at", monthStart.toISOString()),
    ]);

  const profileRow = requireData(profile.error
    ? await db.from("profiles").select("display_name,username,notifications_enabled").eq("user_id", userId).maybeSingle()
    : profile);
  const tripRows = requireData(trips) ?? [];
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
    trips: tripRows.map(mapTrip),
    saved: savedRows ?? [],
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

export async function archiveTrip(tripId: string) {
  return requireData(await client().rpc("archive_trip", { p_trip: tripId, p_status: "completed" }));
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

/** Plans a new trip and returns its id. On Free the server moves the current trip to the journal first. */
export async function createTrip(trip: Trip) {
  const id = requireData(await client().rpc("create_trip", {
    p_destination_id: trip.destinationId,
    p_start_date: trip.start,
    p_end_date: trip.end,
    p_budget: trip.budget,
    p_companions: trip.companions,
    p_interests: trip.interests,
    p_day_destinations: trip.dayDestinations || null,
    p_day_cities: trip.dayCities || null,
    p_route_stops: trip.routeStops || null,
  }));
  if (typeof id !== "string") throw new Error("Could not create the trip. Try again.");
  return id;
}

/** Saves changes to a trip in place: no archive, and activities on days that no longer exist are removed. */
export async function updateTrip(tripId: string, trip: Trip, removedActivityIds: string[]) {
  const db = client();
  requireData(await db.from("trips").update({
    destination_id: trip.destinationId, start_date: trip.start, end_date: trip.end, budget: trip.budget,
    companions: trip.companions, interests: trip.interests, day_destinations: trip.dayDestinations ?? null,
    day_cities: trip.dayCities ?? null, route_stops: trip.routeStops ?? null,
  }).eq("id", tripId));
  if (removedActivityIds.length) requireData(await db.from("trip_activities").delete().eq("trip_id", tripId).in("id", removedActivityIds));
}

export async function saveTripNote(tripId: string, note: string) {
  requireData(await client().from("trips").update({ note }).eq("id", tripId));
}

export async function deleteTrip(tripId: string) {
  requireData(await client().from("trips").delete().eq("id", tripId));
}

// Rows carry the trip's owner, which the database fills in from the trip, so companions write them the same way.
export async function saveActivity(tripId: string, activity: Activity, position: number) {
  requireData(await client().from("trip_activities").upsert({
    trip_id: tripId,
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
  }, { onConflict: "trip_id,id" }));
}

export async function deleteActivity(tripId: string, id: string) {
  requireData(await client().from("trip_activities").delete().eq("trip_id", tripId).eq("id", id));
}

export async function saveExpense(tripId: string, expense: Expense, position: number) {
  const { paidBy, splitWith, ...rest } = expense;
  // The split columns are sent only when an expense is split, so trips on their own keep saving before the
  // split-expenses migration is deployed.
  requireData(await client().from("trip_expenses").upsert({
    trip_id: tripId,
    ...rest,
    ...(paidBy || splitWith?.length ? { paid_by: paidBy ?? null, split_with: splitWith?.length ? splitWith : null } : {}),
    position,
  }, { onConflict: "trip_id,id" }));
}

export async function saveSettlement(tripId: string, settlement: Settlement) {
  requireData(await client().from("trip_settlements").insert({
    trip_id: tripId, id: settlement.id, from_member: settlement.from, to_member: settlement.to, amount: settlement.amount,
  }));
}

export async function deleteSettlement(tripId: string, id: string) {
  requireData(await client().from("trip_settlements").delete().eq("trip_id", tripId).eq("id", id));
}

/** Empty when the split-expenses migration is not deployed yet. */
async function loadSettlements(tripId: string): Promise<Settlement[]> {
  const result = await client().from("trip_settlements").select("id,from_member,to_member,amount,created_at").eq("trip_id", tripId).order("created_at");
  if (result.error) return [];
  return (result.data ?? []).map((row) => ({ id: row.id, from: row.from_member, to: row.to_member, amount: Number(row.amount), createdAt: row.created_at }));
}

/** Expenses with who paid and whom they are shared between, or without them before the migration is deployed. */
async function loadExpenses(tripId: string): Promise<Expense[]> {
  const db = client();
  let result = await db.from("trip_expenses").select("id,label,category,amount,paid_by,split_with").eq("trip_id", tripId).order("position");
  if (result.error) result = await db.from("trip_expenses").select("id,label,category,amount").eq("trip_id", tripId).order("position") as typeof result;
  return (requireData(result) ?? []).map((item) => ({
    id: item.id, label: item.label, category: item.category, amount: Number(item.amount),
    ...(item.paid_by ? { paidBy: item.paid_by } : {}), ...(item.split_with?.length ? { splitWith: item.split_with } : {}),
  })) as Expense[];
}

export async function deleteExpense(tripId: string, id: string) {
  requireData(await client().from("trip_expenses").delete().eq("trip_id", tripId).eq("id", id));
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

/** A traveller as others see them: findable only with a username, photo only once approved. */
export type Traveler = { id: string; username: string; name: string; avatarPath: string | null };
export type TripCompanion = Traveler & { status: "owner" | "pending" | "accepted" };
export type SharedTrip = { tripId: string; owner: Traveler; status: "pending" | "accepted"; invitedAt: string; trip: Trip; companions: number };

/** The trip itself, its note, owner, itinerary and expenses; null once it is gone or no longer shared. */
export async function loadTripData(tripId: string) {
  const db = client();
  const [trip, activities, expenses, settlements] = await Promise.all([
    db.from("trips").select(tripColumns).eq("id", tripId).maybeSingle(),
    db.from("trip_activities").select("id,day,period,activity_time,name,note,place_id,latitude,longitude").eq("trip_id", tripId).order("position"),
    loadExpenses(tripId),
    loadSettlements(tripId),
  ]);
  const row = requireData(trip) as TripRow | null;
  if (!row) return null;
  return {
    ...mapTrip(row),
    activities: (requireData(activities) ?? []).map((item) => ({
      id: item.id, day: item.day, period: item.period, time: item.activity_time, name: item.name, note: item.note,
      placeId: item.place_id || undefined, latitude: item.latitude ?? undefined, longitude: item.longitude ?? undefined,
    })) as Activity[],
    expenses,
    settlements,
  };
}

export async function loadOwnTrips(userId: string): Promise<PlannedTrip[]> {
  return ((requireData(await client().from("trips").select(tripColumns).eq("user_id", userId).order("start_date")) ?? []) as TripRow[]).map(mapTrip);
}

export async function searchTravelers(query: string): Promise<Traveler[]> {
  return (requireData(await client().rpc("search_travelers", { p_query: query })) ?? []) as Traveler[];
}

export async function inviteTripMember(tripId: string, memberId: string) {
  requireData(await client().rpc("invite_trip_member", { p_trip: tripId, p_member: memberId }));
}

export async function respondTripInvite(tripId: string, accept: boolean) {
  requireData(await client().rpc("respond_trip_invite", { p_trip: tripId, p_accept: accept }));
}

export async function removeTripMember(tripId: string, memberId: string) {
  requireData(await client().rpc("remove_trip_member", { p_trip: tripId, p_member: memberId }));
}

/** Empty when the companions migration is not deployed yet, so the rest of the app keeps working. */
export async function loadSharedTrips(): Promise<SharedTrip[]> {
  const result = await client().rpc("shared_trips");
  if (result.error) return [];
  return ((result.data ?? []) as SharedTrip[]).map((item) => ({ ...item, trip: {
    ...item.trip, budget: Number(item.trip.budget),
    dayDestinations: item.trip.dayDestinations || undefined, dayCities: item.trip.dayCities || undefined, routeStops: item.trip.routeStops || undefined,
  } }));
}

export async function loadTripCompanions(tripId: string): Promise<TripCompanion[]> {
  return (requireData(await client().rpc("trip_companions", { p_trip: tripId })) ?? []) as TripCompanion[];
}
