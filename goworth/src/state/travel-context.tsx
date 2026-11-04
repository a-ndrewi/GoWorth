import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Activity, Expense, Trip, TripJournalEntry } from "@/data/travel";
import { venueFilters, type NearbyPlace, type VenueFilter } from "@/data/nearby-places";
import { externalPlaceFromSaved } from "@/data/external-places";
import { loadMembership } from "@/lib/wheel";
import { useAuth } from "@/state/auth-context";
import { dayCityNames, placeFitsTripDayChecked } from "@/utils/trip-place";
import { formatMessage } from "@/data/i18n";
import { describeSyncFailure, isFreeLimitFailure, SyncFailure } from "@/utils/sync-error";
import { tripDays, validateTrip } from "@/utils/trip";
import { emptyExploreHistory, parseExploreHistory, rememberCountry, rememberPlace, type ExploreHistory } from "@/utils/explore-history";
import { setDisplaySettings, type AppCurrency, type AppLanguage } from "@/data/formatting";
import {
  archiveTrip,
  deleteActivity,
  deleteExpense,
  deleteTrip,
  deleteTripJournalEntry,
  loadTravelData,
  loadTripJournal,
  createTrip,
  loadOwnTrips,
  saveTripNote,
  updateTrip as saveTripChanges,
  recordDiscoveryFavorite,
  saveActivity,
  saveExpense,
  saveTripReflection,
  savePreferences,
  saveProfile,
  saveDisplayPreferences,
  profileAvatarUrl,
  uploadProfileAvatar,
  removeProfileAvatar,
  setSavedItem,
  loadTripData,
  loadSharedTrips,
  inviteTripMember,
  loadTripCompanions,
  respondTripInvite,
  removeTripMember,
  type PlannedTrip,
  type SharedTrip,
  type TripCompanion,
} from "@/lib/travel-repository";
import { useTimedMessage } from "@/hooks/use-timed-message";

export type TravelPreferences = {
  interests: string[];
  region: string;
  budget: number;
  pace: string;
};

export type TravelProfile = { name: string; username: string; language: AppLanguage; currency: AppCurrency; avatarPath?: string; avatarStatus?: "none" | "pending" | "approved" | "rejected" };
export type DiscoverySettings = { radiusKm: number; centerId: string | null; venues: VenueFilter[] };
const defaultDiscoverySettings: DiscoverySettings = { radiusKm: 500, centerId: null, venues: venueFilters };
const externalPlacesKey = (userId: string) => `external-places:${userId}`;
const exploreHistoryKey = (userId: string) => `explore-history:${userId}`;
const openTripKey = (userId: string) => `open-trip:${userId}`;
const offlineKey = (userId: string) => `offline-snapshot:${userId}`;

/** The account as last seen online, kept on the phone for Premium so trips open without a connection. */
type OfflineSnapshot = {
  savedAt: string; plan: "premium" | "lifetime"; profile: TravelProfile; preferences: TravelPreferences; hasPreferences: boolean;
  trip: Trip | null; tripId: string | null; tripOwner: string | null; ownTrips?: PlannedTrip[]; activities: Activity[]; expenses: Expense[];
  saved: string[]; savedPlaces: string[]; externalPlaces: NearbyPlace[]; journal: string; journalEntries: TripJournalEntry[];
  sharedTrips: SharedTrip[]; monthlyUsage: { trip: number; place: number; destination: number };
};

function parseLocalExternalPlaces(value: string | null): NearbyPlace[] {
  if (!value) return [];
  try {
    const records: unknown = JSON.parse(value);
    if (!Array.isArray(records)) return [];
    return records.map((item) => externalPlaceFromSaved(item?.id, item))
      .filter((item): item is NearbyPlace => !!item);
  } catch { return []; }
}

const blankPreferences: TravelPreferences = {
  interests: [],
  region: "Worldwide",
  budget: 2500,
  pace: "Balanced",
};

/** A place saved to a day must lie in a city planned for that day; free-form activities without a place are not checked. */
async function ensurePlaceFitsDay(trip: Trip, activity: Pick<Activity, "day" | "placeId" | "latitude" | "longitude">) {
  if (!activity.placeId) return;
  const point = activity.latitude !== undefined && activity.longitude !== undefined ? { latitude: activity.latitude, longitude: activity.longitude } : null;
  if (point && await placeFitsTripDayChecked(trip, activity.day, { ...point, placeId: activity.placeId })) return;
  throw new Error(formatMessage("Day {day} is planned for {city}. Only places in {city} can be added to it.", { day: activity.day, city: dayCityNames(trip, activity.day).join(", ") }));
}

type OpenedTrip = PlannedTrip & { activities: Activity[]; expenses: Expense[] };
const byStart = (a: PlannedTrip, b: PlannedTrip) => a.trip.start.localeCompare(b.trip.start);

/** The trip to open when none is chosen: the next one still ahead, or the latest when all have ended. */
function nextTrip(trips: PlannedTrip[]) {
  const today = new Date().toISOString().slice(0, 10);
  const sorted = [...trips].sort(byStart);
  return sorted.find((item) => item.trip.end >= today) ?? sorted.at(-1) ?? null;
}

function useTravelState() {
  const { user } = useAuth();
  const userId = user?.id;
  const fallbackName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Traveler";
  const accountLanguage = user?.user_metadata?.goworth_language;
  const accountCurrency = user?.user_metadata?.goworth_currency;
  const [saved, setSaved] = useState<string[]>([]);
  const [savedPlaces, setSavedPlaces] = useState<string[]>([]);
  const [externalPlaces, setExternalPlaces] = useState<NearbyPlace[]>([]);
  const [exploreHistoryState, setExploreHistoryState] = useState<{ owner: string | null; history: ExploreHistory }>({ owner: null, history: emptyExploreHistory });
  const [trip, setTrip] = useState<Trip | null>(null);
  // The open trip's id, and its owner when it is a trip the traveller joined as a companion (null for their own).
  const [tripId, setTripId] = useState<string | null>(null);
  const [tripOwner, setTripOwner] = useState<string | null>(null);
  // Every trip the traveller owns and has not finished; Premium plans several side by side.
  const [ownTrips, setOwnTrips] = useState<PlannedTrip[]>([]);
  const [sharedTrips, setSharedTrips] = useState<SharedTrip[]>([]);
  // Everyone on the open trip who has joined (the owner included), so its party reads Solo, Duo or Group.
  const [party, setParty] = useState<{ trip: Trip; people: TripCompanion[] } | null>(null);
  const partyRef = useRef(party);
  useEffect(() => { partyRef.current = party; }, [party]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [preferences, setPreferencesState] = useState<TravelPreferences>(blankPreferences);
  const [discoverySettings, setDiscoverySettingsState] = useState<DiscoverySettings>(defaultDiscoverySettings);
  const [hasPreferences, setHasPreferences] = useState(false);
  const [profile, setProfileState] = useState<TravelProfile>({ name: fallbackName, username: "", language: "en", currency: "EUR" });
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [plan, setPlan] = useState<"free" | "premium" | "lifetime">("free");
  const [monthlyUsage, setMonthlyUsage] = useState({ trip: 0, place: 0, destination: 0 });
  const [journal, setJournalState] = useState("");
  const [journalEntries, setJournalEntries] = useState<TripJournalEntry[]>([]);
  const [journalAvailable, setJournalAvailable] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [cloudReady, setCloudReady] = useState(false);
  // True when the account opened from the offline copy; edits then fail until the connection is back.
  const [offlineSince, setOfflineSince] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const [syncError, setSyncError] = useTimedMessage();
  const [reload, setReload] = useState(0);
  const writeQueue = useRef<Promise<void>>(Promise.resolve());
  // When the account or the open trip was last fetched; Explore's check on focus skips data that is seconds old.
  const loadedAt = useRef(0);
  const exploreHistoryWriteQueue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (!userId) setDisplaySettings({ language: "en", currency: "EUR" });
  }, [userId]);

  // What only this phone remembers (recently viewed, the discovery centre and radius) is read before the account counts
  // as loaded, so Explore opens with it instead of drawing a default deck and reloading it a moment later.
  const [localReadFor, setLocalReadFor] = useState<string | null>(null);
  useEffect(() => {
    if (!userId) return;
    let current = true;
    const history = AsyncStorage.getItem(exploreHistoryKey(userId))
      .then((value) => { if (current) setExploreHistoryState({ owner: userId, history: parseExploreHistory(value) }); })
      .catch(() => { if (current) setExploreHistoryState({ owner: userId, history: emptyExploreHistory }); });
    const discovery = AsyncStorage.getItem(`discovery-settings:${userId}`).then((value) => {
      if (!current || !value) return;
      const parsed: Partial<DiscoverySettings> = JSON.parse(value);
      if (!parsed.radiusKm || ![25, 100, 500, 2000, 20000].includes(parsed.radiusKm)) return;
      // Settings saved before venues existed show every kind.
      const venues = Array.isArray(parsed.venues) ? parsed.venues.filter((item) => venueFilters.includes(item)) : venueFilters;
      setDiscoverySettingsState({ radiusKm: parsed.radiusKm, centerId: parsed.centerId ?? null, venues });
    }).catch(() => undefined);
    void Promise.all([history, discovery]).then(() => { if (current) setLocalReadFor(userId); });
    return () => { current = false; };
  }, [userId]);

  useEffect(() => {
    if (userId && exploreHistoryState.owner === userId) {
      const value = JSON.stringify(exploreHistoryState.history);
      exploreHistoryWriteQueue.current = exploreHistoryWriteQueue.current
        .then(() => AsyncStorage.setItem(exploreHistoryKey(userId), value))
        .catch(() => undefined);
    }
  }, [userId, exploreHistoryState]);

  const recordCountryVisit = useCallback((code: string, searchTerm = "") => {
    if (!userId) return;
    setExploreHistoryState((current) => current.owner === userId
      ? { owner: userId, history: rememberCountry(current.history, code, searchTerm) } : current);
  }, [userId]);

  const recordPlaceVisit = useCallback((countryCode: string, cityId: string, place: NearbyPlace, searchTerm = "") => {
    if (!userId) return;
    setExploreHistoryState((current) => current.owner === userId
      ? { owner: userId, history: rememberPlace(current.history, countryCode, cityId, place, searchTerm) } : current);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let current = true;
    Promise.all([loadTravelData(userId), AsyncStorage.getItem(externalPlacesKey(userId)).catch(() => null),
      loadSharedTrips().catch(() => []), AsyncStorage.getItem(openTripKey(userId)).catch(() => null)])
      .then(async ([data, localValue, shared, storedTrip]) => {
        if (!current) return;
        const language = accountLanguage === "ro" ||
          (!accountLanguage && data.profile?.language === "ro") ? "ro" : "en";
        const currency: AppCurrency = accountCurrency === "USD" ||
          (!accountCurrency && data.profile?.currency === "USD") ? "USD" : "EUR";
        setDisplaySettings({ language, currency });
        setProfileState({
          name: data.profile?.display_name || fallbackName,
          username: data.profile?.username || "",
          language, currency,
          avatarPath: data.profile?.avatar_path || undefined,
          avatarStatus: data.profile?.avatar_status === "approved" || data.profile?.avatar_status === "pending" || data.profile?.avatar_status === "rejected" ? data.profile.avatar_status : "none",
        });
        setAvatarUrl(data.profile?.avatar_status === "approved" && data.profile.avatar_path
          ? await profileAvatarUrl(data.profile.avatar_path).catch(() => null) : null);
        setPlan(data.entitlement?.plan === "lifetime" || (data.entitlement?.plan === "premium" && Date.parse(data.entitlement.valid_until || "") > Date.now()) ? data.entitlement.plan : "free");
        setMonthlyUsage({ trip: data.usage.filter((event) => event.kind === "trip").length,
          place: data.usage.filter((event) => event.kind === "place").length,
          destination: data.usage.filter((event) => event.kind === "destination").length });
        setNotifications(data.profile?.notifications_enabled ?? false);
        setHasPreferences(!!data.preferences);
        setPreferencesState(data.preferences ? {
          interests: data.preferences.interests,
          region: data.preferences.region,
          budget: Number(data.preferences.budget),
          pace: data.preferences.pace,
        } : blankPreferences);
        setSharedTrips(shared);
        setOwnTrips(data.trips);
        // Reopen the trip last chosen, else the next one ahead, else the only trip joined.
        const joined = shared.filter((item) => item.status === "accepted");
        const known = (id: string | null) => !!id && (data.trips.some((item) => item.trip.id === id) || joined.some((item) => item.tripId === id));
        const chosen = known(storedTrip) ? storedTrip : nextTrip(data.trips)?.trip.id ?? (joined.length === 1 ? joined[0].tripId : null);
        const opened = chosen ? await loadTripData(chosen).catch(() => null) : null;
        // The party is part of what the trip card shows (Solo, Duo, Group), so it comes in with the trip.
        const people = opened?.trip.id ? await loadTripCompanions(opened.trip.id).catch(() => null) : null;
        if (!current) return;
        showTrip(opened, userId);
        if (opened && people) setParty({ trip: opened.trip, people });
        setSaved(data.saved.filter((item) => item.kind === "destination").map((item) => item.item_id));
        setSavedPlaces(data.saved.filter((item) => item.kind === "place").map((item) => item.item_id));
        const savedPlaceIds = new Set(data.saved.filter((item) => item.kind === "place").map((item) => item.item_id));
        const cloudPlaces = data.saved.filter((item) => item.kind === "place")
          .map((item) => externalPlaceFromSaved(item.item_id, "details" in item ? item.details : null))
          .filter((item): item is NearbyPlace => !!item);
        const localPlaces = parseLocalExternalPlaces(localValue).filter((item) => savedPlaceIds.has(item.id));
        setExternalPlaces([...new Map([...localPlaces, ...cloudPlaces].map((item) => [item.id, item])).values()]);
        setJournalEntries(data.journalEntries);
        setJournalAvailable(data.journalAvailable);
        setSyncError("");
        setOfflineSince(null);
        loadedAt.current = Date.now();
        setCloudReady(true);
      })
      .catch(async () => {
        if (!current) return;
        const snapshot = await AsyncStorage.getItem(offlineKey(userId)).then((value) => value ? JSON.parse(value) as OfflineSnapshot : null).catch(() => null);
        if (!current) return;
        if (!snapshot) {
          setLoadError("Could not load your account. Check your connection and try again.");
          return;
        }
        setDisplaySettings({ language: snapshot.profile.language, currency: snapshot.profile.currency });
        setProfileState(snapshot.profile);
        setPlan(snapshot.plan);
        setPreferencesState(snapshot.preferences);
        setHasPreferences(snapshot.hasPreferences);
        setTripOwner(snapshot.tripOwner);
        setTripId(snapshot.tripId ?? null);
        setOwnTrips(snapshot.ownTrips ?? []);
        setTrip(snapshot.trip);
        setActivities(snapshot.activities);
        setExpenses(snapshot.expenses);
        setSaved(snapshot.saved);
        setSavedPlaces(snapshot.savedPlaces);
        setExternalPlaces(snapshot.externalPlaces);
        setJournalState(snapshot.journal);
        setJournalEntries(snapshot.journalEntries);
        setJournalAvailable(true);
        setSharedTrips(snapshot.sharedTrips);
        setMonthlyUsage(snapshot.monthlyUsage);
        setOfflineSince(snapshot.savedAt);
        setCloudReady(true);
      });
    return () => { current = false; };
    // showTrip only sets state; it is recreated each render and must not restart the load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, fallbackName, accountLanguage, accountCurrency, reload, setSyncError]);

  // Premium keeps a copy of the account on the phone, refreshed after every change made online.
  useEffect(() => {
    if (!userId || !cloudReady || offlineSince) return;
    if (plan === "free") { void AsyncStorage.removeItem(offlineKey(userId)).catch(() => undefined); return; }
    const snapshot: OfflineSnapshot = {
      savedAt: new Date().toISOString(), plan, profile, preferences, hasPreferences, trip, tripId, tripOwner, ownTrips, activities, expenses,
      saved, savedPlaces, externalPlaces, journal, journalEntries, sharedTrips, monthlyUsage,
    };
    const timer = setTimeout(() => void AsyncStorage.setItem(offlineKey(userId), JSON.stringify(snapshot)).catch(() => undefined), 800);
    return () => clearTimeout(timer);
  }, [userId, cloudReady, offlineSince, plan, profile, preferences, hasPreferences, trip, tripId, tripOwner, ownTrips, activities, expenses,
    saved, savedPlaces, externalPlaces, journal, journalEntries, sharedTrips, monthlyUsage]);

  /** Puts a loaded trip (or none) on screen and remembers it as the one to reopen. */
  function showTrip(data: OpenedTrip | null, account = userId) {
    const id = data?.trip.id ?? null;
    setTripId(id);
    setTripOwner(data && data.owner !== account ? data.owner : null);
    setTrip(data?.trip ?? null);
    setActivities(data?.activities ?? []);
    setExpenses(data?.expenses ?? []);
    setJournalState(data?.note ?? "");
    if (account) void (id ? AsyncStorage.setItem(openTripKey(account), id) : AsyncStorage.removeItem(openTripKey(account))).catch(() => undefined);
  }

  const persist = (work: () => Promise<unknown>, showGlobalError = true) => {
    const next = writeQueue.current.then(work);
    writeQueue.current = next.then(() => undefined, () => undefined);
    return next.then(() => {
      setSyncError("");
    }, (error: unknown) => {
      const message = describeSyncFailure(error, profile.language);
      setSyncError(showGlobalError ? message : "");
      throw new SyncFailure(message, isFreeLimitFailure(error));
    });
  };

  const toggleSaved = (id: string) => {
    if (!user || !cloudReady) return;
    const enabled = !saved.includes(id);
    void persist(() => setSavedItem(user.id, "destination", id, enabled))
      .then(() => {
        setSaved((current) => enabled ? [...new Set([...current, id])] : current.filter((item) => item !== id));
        if (enabled) setMonthlyUsage((current) => ({ ...current, destination: current.destination + 1 }));
      })
      .catch(() => undefined);
  };

  const togglePlace = (id: string) => {
    if (!user || !cloudReady) return;
    const enabled = !savedPlaces.includes(id);
    void persist(() => setSavedItem(user.id, "place", id, enabled))
      .then(() => {
        setSavedPlaces((current) => enabled ? [...new Set([...current, id])] : current.filter((item) => item !== id));
        if (enabled) setMonthlyUsage((current) => ({ ...current, place: current.place + 1 }));
        if (!enabled) setExternalPlaces((current) => current.filter((item) => item.id !== id));
      })
      .catch(() => undefined);
  };

  const toggleExternalPlace = async (place: NearbyPlace, showGlobalError = true) => {
    if (!user || !cloudReady) throw new Error("Your account is not ready. Try again.");
    const enabled = !savedPlaces.includes(place.id);
    await persist(async () => {
      await setSavedItem(user.id, "place", place.id, enabled, enabled ? place : undefined);
      try {
        const existing = parseLocalExternalPlaces(await AsyncStorage.getItem(externalPlacesKey(user.id)));
        const next = enabled ? [...existing.filter((item) => item.id !== place.id), place] : existing.filter((item) => item.id !== place.id);
        await AsyncStorage.setItem(externalPlacesKey(user.id), JSON.stringify(next));
      } catch { /* Cloud save is still authoritative when local storage is unavailable. */ }
    }, showGlobalError);
    setSavedPlaces((current) => enabled ? [...new Set([...current, place.id])] : current.filter((id) => id !== place.id));
    if (enabled) setMonthlyUsage((current) => ({ ...current, place: current.place + 1 }));
    setExternalPlaces((current) => enabled ? [...current.filter((item) => item.id !== place.id), place] : current.filter((item) => item.id !== place.id));
  };

  const favoriteDiscoveryItem = async (id: string) => {
    if (!user || !cloudReady) throw new Error("Your account is not ready. Try again.");
    if (savedPlaces.includes(id)) return;
    await persist(() => setSavedItem(user.id, "place", id, true), false);
    setSavedPlaces((current) => [...new Set([...current, id])]);
    setMonthlyUsage((current) => ({ ...current, place: current.place + 1 }));
    void recordDiscoveryFavorite(user.id, "place", id).catch(() => undefined);
  };

  const setDiscoverySettings = (next: DiscoverySettings) => {
    setDiscoverySettingsState(next);
    if (userId) void AsyncStorage.setItem(`discovery-settings:${userId}`, JSON.stringify(next)).catch(() => undefined);
  };

  const refreshMembership = useCallback(async () => {
    if (!user || !cloudReady) throw new Error("Your account is not ready. Try again.");
    const membership = await loadMembership(user.id);
    setPlan(membership.plan);
    return membership;
  }, [user, cloudReady]);

  const generateTrip = async (next: Trip) => {
    if (!user || !cloudReady) throw new Error("Your account is not ready. Try again.");
    const validation = validateTrip(next);
    if (validation) throw new Error(validation);
    // Free keeps one trip: the new one moves the current one to the journal. Several left over from Premium stay
    // until some are finished or deleted.
    if (plan === "free" && ownTrips.length > 1) throw new Error("Free plan includes one active trip. Finish or delete a trip, or upgrade for unlimited trips");
    const replacing = plan === "free" && ownTrips.length > 0;
    if (replacing && !journalAvailable) throw new Error("Update the trip journal database before replacing this trip.");
    await writeQueue.current;
    const created: PlannedTrip = { trip: { ...next, id: await createTrip(next) }, owner: user.id, note: "" };
    if (replacing) setJournalEntries(await loadTripJournal(user.id));
    setOwnTrips((current) => [...(replacing ? [] : current), created].sort(byStart));
    showTrip({ ...created, activities: [], expenses: [] });
    setMonthlyUsage((current) => ({ ...current, trip: current.trip + 1 }));
    setSyncError("");
  };

  /** Edits the open trip (dates, cities, style or budget) and keeps its activities and expenses. */
  const updateTrip = async (next: Trip) => {
    if (!user || !trip || !tripId || !cloudReady) throw new Error("Your trip is not ready. Try again.");
    const validation = validateTrip(next);
    if (validation) throw new Error(validation);
    const days = tripDays(next.start, next.end);
    const removed = activities.filter((activity) => activity.day > days).map((activity) => activity.id);
    await persist(() => saveTripChanges(tripId, next, removed));
    const saved = { ...next, id: tripId };
    setTrip(saved);
    setOwnTrips((current) => current.map((item) => item.trip.id === tripId ? { ...item, trip: saved } : item).sort(byStart));
    setActivities((current) => current.filter((activity) => activity.day <= days));
  };

  /** After the open trip is finished or deleted, opens the next of the traveller's own trips, if any. */
  const closeTrip = async (closedId: string) => {
    const remaining = ownTrips.filter((item) => item.trip.id !== closedId);
    setOwnTrips(remaining);
    const next = nextTrip(remaining);
    showTrip(next?.trip.id ? await loadTripData(next.trip.id).catch(() => null) : null);
    setSyncError("");
  };

  const clearTrip = async () => {
    if (!user || !tripId || !cloudReady) throw new Error("Your account is not ready. Try again.");
    if (tripOwner) throw new Error("Only the trip owner can delete this trip.");
    await writeQueue.current;
    await deleteTrip(tripId);
    await closeTrip(tripId);
  };

  const finishTrip = async () => {
    if (!user || !trip || !tripId || !cloudReady) throw new Error("Your trip is not ready. Try again.");
    if (tripOwner) throw new Error("Only the trip owner can finish this trip.");
    if (!journalAvailable) throw new Error("Update the trip journal database before finishing this trip.");
    await writeQueue.current;
    await archiveTrip(tripId);
    setJournalEntries(await loadTripJournal(user.id));
    await closeTrip(tripId);
  };

  const addActivity = async (activity: Omit<Activity, "id">) => {
    if (!user || !trip || !tripId || !cloudReady) throw new Error("Your trip is not ready. Try again.");
    if (activity.day < 1 || activity.day > tripDays(trip.start, trip.end)) throw new Error("Choose a day in this trip.");
    await ensurePlaceFitsDay(trip, activity);
    const next = { ...activity, id: `activity-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
    await persist(() => saveActivity(tripId!, next, activities.length));
    setActivities((current) => [...current, next]);
  };

  const updateActivity = async (activity: Activity) => {
    if (!user || !trip || !tripId || !cloudReady) throw new Error("Your trip is not ready. Try again.");
    await ensurePlaceFitsDay(trip, activity);
    const position = activities.findIndex((item) => item.id === activity.id);
    if (position < 0) throw new Error("Activity not found. Reload your itinerary.");
    await persist(() => saveActivity(tripId!, activity, position));
    setActivities((current) => current.map((item) => item.id === activity.id ? activity : item));
  };

  const removeActivity = async (id: string) => {
    if (!user || !trip || !tripId || !cloudReady) throw new Error("Your trip is not ready. Try again.");
    await persist(() => deleteActivity(tripId!, id));
    setActivities((current) => current.filter((item) => item.id !== id));
  };

  const addExpense = async (expense: Omit<Expense, "id">) => {
    if (!user || !trip || !tripId || !cloudReady) throw new Error("Your trip is not ready. Try again.");
    const next = { ...expense, id: `expense-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
    await persist(() => saveExpense(tripId!, next, expenses.length));
    setExpenses((current) => [...current, next]);
  };

  const updateExpense = async (expense: Expense) => {
    if (!user || !trip || !tripId || !cloudReady) throw new Error("Your trip is not ready. Try again.");
    const position = expenses.findIndex((item) => item.id === expense.id);
    if (position < 0) throw new Error("Expense not found. Reload your budget.");
    await persist(() => saveExpense(tripId!, expense, position));
    setExpenses((current) => current.map((item) => item.id === expense.id ? expense : item));
  };

  const removeExpense = async (id: string) => {
    if (!user || !trip || !tripId || !cloudReady) throw new Error("Your trip is not ready. Try again.");
    await persist(() => deleteExpense(tripId!, id));
    setExpenses((current) => current.filter((item) => item.id !== id));
  };

  /** Opens the traveller's own trip (null) or a trip they joined; edits then go to that trip. */
  const openTrip = async (id: string | null) => {
    if (!user || !cloudReady) throw new Error("Your account is not ready. Try again.");
    await writeQueue.current;
    const target = id ?? nextTrip(ownTrips)?.trip.id ?? null;
    const data = target ? await loadTripData(target) : null;
    if (target && !data) {
      const [shared, own] = await Promise.all([loadSharedTrips(), loadOwnTrips(user.id)]);
      setSharedTrips(shared); setOwnTrips(own);
      throw new Error(ownTrips.some((item) => item.trip.id === target) ? "This trip no longer exists." : "This trip is no longer shared with you.");
    }
    showTrip(data);
  };

  /** Fetches the latest of the open trip and of the trip lists, so a companion's edits show up. */
  const refreshTrip = useCallback(async () => {
    if (!user || !cloudReady || offlineSince) return;
    // Explore checks on every focus, the first one right after launch: fetching again what was just loaded swapped
    // the trip for an identical copy and reloaded its party, which looked like the app refreshing itself.
    if (Date.now() - loadedAt.current < 15 * 1000) return;
    loadedAt.current = Date.now();
    const [shared, own, data] = await Promise.all([loadSharedTrips(), loadOwnTrips(user.id).catch(() => undefined),
      tripId ? loadTripData(tripId).catch(() => undefined) : Promise.resolve(null)]);
    setSharedTrips(shared);
    if (own) setOwnTrips(own);
    if (data === undefined) return;
    if (tripId && !data) {
      const next = own ? nextTrip(own) : null;
      showTrip(next?.trip.id ? await loadTripData(next.trip.id).catch(() => null) : null);
      return;
    }
    if (data) showTrip(data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, cloudReady, offlineSince, tripId]);

  // A new or refreshed trip is a new object, so this also picks up companions who joined or left on their phones.
  useEffect(() => {
    if (!user || !cloudReady || offlineSince || !trip || !tripId) return;
    if (partyRef.current?.trip === trip) return;
    let current = true;
    loadTripCompanions(tripId).then((people) => { if (current) setParty({ trip, people }); }).catch(() => undefined);
    return () => { current = false; };
  }, [user, cloudReady, offlineSince, tripId, trip]);

  const answerInvite = async (id: string, accept: boolean) => {
    if (!user || !cloudReady) throw new Error("Your account is not ready. Try again.");
    await respondTripInvite(id, accept);
    setSharedTrips(await loadSharedTrips());
    if (accept) await openTrip(id);
  };

  const inviteCompanion = async (memberId: string) => {
    if (!user || !trip || !tripId || tripOwner) throw new Error("Only the trip owner can invite companions.");
    await inviteTripMember(tripId, memberId);
  };

  /** The owner removes a companion; a companion passing their own id leaves the trip. */
  const removeCompanion = async (memberId: string) => {
    if (!user || !tripId || !cloudReady) throw new Error("Your account is not ready. Try again.");
    await removeTripMember(tripId, memberId);
    if (memberId === user.id) {
      setSharedTrips((current) => current.filter((item) => item.tripId !== tripId));
      await openTrip(null);
    } else if (trip) {
      const people = await loadTripCompanions(tripId).catch(() => null);
      if (people) setParty({ trip, people });
    }
  };

  const setPreferences = (next: TravelPreferences) => setPreferencesState(next);
  const completePreferences = async (next: TravelPreferences = preferences) => {
    if (!user || !cloudReady) throw new Error("Your account is not ready. Try again.");
    await savePreferences(user.id, next);
    setPreferencesState(next);
    setHasPreferences(true);
    setSyncError("");
  };
  const setProfile = async (next: Partial<TravelProfile>) => {
    if (!user || !cloudReady) throw new Error("Your account is not ready. Try again.");
    const merged = { ...profile, ...next };
    if (next.name !== undefined || next.username !== undefined) {
      await saveProfile(user.id, merged, notifications);
    } else {
      await saveDisplayPreferences(merged.language, merged.currency);
    }
    setProfileState(merged);
    setDisplaySettings({ language: merged.language, currency: merged.currency });
    setSyncError("");
  };
  const uploadAvatar = async (base64: string) => {
    if (!user || !cloudReady) throw new Error("Your account is not ready. Try again.");
    const uploaded = await uploadProfileAvatar(user.id, base64);
    setAvatarUrl(uploaded.url);
    setProfileState((current) => ({ ...current, avatarPath: uploaded.path, avatarStatus: "approved" }));
  };
  const removeAvatar = async () => {
    if (!user || !cloudReady) throw new Error("Your account is not ready. Try again.");
    await removeProfileAvatar();
    setAvatarUrl(null);
    setProfileState((current) => ({ ...current, avatarPath: undefined, avatarStatus: "none" }));
  };
  const setJournal = async (next: string) => {
    if (!user || !tripId || !cloudReady) throw new Error("Your trip is not ready. Try again.");
    await saveTripNote(tripId, next);
    setOwnTrips((current) => current.map((item) => item.trip.id === tripId ? { ...item, note: next } : item));
    setJournalState(next);
    setSyncError("");
  };
  const setArchivedReflection = async (entryId: string, next: string) => {
    if (!user || !cloudReady) throw new Error("Your account is not ready. Try again.");
    await saveTripReflection(user.id, entryId, next);
    setJournalEntries((current) => current.map((entry) => entry.id === entryId ? { ...entry, reflection: next } : entry));
    setSyncError("");
  };
  const deleteJournalEntry = async (entryId: string) => {
    if (!user || !cloudReady) throw new Error("Your account is not ready. Try again.");
    await persist(() => deleteTripJournalEntry(user.id, entryId));
    setJournalEntries((current) => current.filter((entry) => entry.id !== entryId));
    setSyncError("");
  };
  const updateNotifications = (next: boolean) => {
    if (!user || !cloudReady) return;
    void persist(() => saveProfile(user.id, profile, next))
      .then(() => setNotifications(next))
      .catch(() => undefined);
  };

  return {
    saved, toggleSaved, savedPlaces, togglePlace, externalPlaces, toggleExternalPlace, favoriteDiscoveryItem,
    exploreHistory: exploreHistoryState.owner === userId ? exploreHistoryState.history : emptyExploreHistory,
    exploreHistoryReady: !!userId && exploreHistoryState.owner === userId,
    recordCountryVisit, recordPlaceVisit,
    trip, tripId, hasTrip: !!trip, trips: ownTrips, hasOwnTrip: ownTrips.length > 0, tripOwner, sharedTrips, pendingInvites: sharedTrips.filter((item) => item.status === "pending"),
    // The open trip's people as last loaded, and how many have joined (owner included; pending invitations do not count).
    tripPeople: trip && party?.trip === trip ? party.people : null,
    travellers: trip && party?.trip === trip ? Math.max(1, party.people.filter((person) => person.status !== "pending").length) : 1, openTrip, refreshTrip, answerInvite, inviteCompanion, removeCompanion, generateTrip, updateTrip, clearTrip, finishTrip,
    activities, addActivity, updateActivity, removeActivity,
    expenses, addExpense, updateExpense, removeExpense,
    preferences, setPreferences, hasPreferences, completePreferences,
    discoverySettings, setDiscoverySettings,
    profile, setProfile, avatarUrl, uploadAvatar, removeAvatar, plan, monthlyUsage, refreshMembership, journal, setJournal, journalEntries, journalAvailable, setArchivedReflection, deleteJournalEntry,
    notifications, setNotifications: updateNotifications,
    cloudReady: cloudReady && localReadFor === userId, offlineSince, loadError, retryLoad: () => {
      setCloudReady(false);
      setLoadError("");
      setReload((value) => value + 1);
    }, syncError,
  };
}

type TravelState = ReturnType<typeof useTravelState>;
const TravelContext = createContext<TravelState | null>(null);

export function TravelProvider({ children }: { children: ReactNode }) {
  const state = useTravelState();
  return <TravelContext value={state}>{children}</TravelContext>;
}

export function useTravel() {
  const context = useContext(TravelContext);
  if (!context) throw new Error("useTravel requires TravelProvider.");
  return context;
}
