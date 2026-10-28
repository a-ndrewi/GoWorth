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
  archiveCurrentTrip,
  deleteActivity,
  deleteExpense,
  deleteTrip,
  deleteTripJournalEntry,
  loadTravelData,
  loadTripJournal,
  replaceTrip,
  updateTrip as saveTripChanges,
  recordDiscoveryFavorite,
  saveActivity,
  saveExpense,
  saveJournal,
  saveTripReflection,
  savePreferences,
  saveProfile,
  saveDisplayPreferences,
  profileAvatarUrl,
  uploadProfileAvatar,
  removeProfileAvatar,
  setSavedItem,
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
  const [loadError, setLoadError] = useState("");
  const [syncError, setSyncError] = useTimedMessage();
  const [reload, setReload] = useState(0);
  const writeQueue = useRef<Promise<void>>(Promise.resolve());
  const exploreHistoryWriteQueue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (!userId) setDisplaySettings({ language: "en", currency: "EUR" });
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let current = true;
    AsyncStorage.getItem(exploreHistoryKey(userId))
      .then((value) => { if (current) setExploreHistoryState({ owner: userId, history: parseExploreHistory(value) }); })
      .catch(() => { if (current) setExploreHistoryState({ owner: userId, history: emptyExploreHistory }); });
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
    AsyncStorage.getItem(`discovery-settings:${userId}`).then((value) => {
      if (!current || !value) return;
      const parsed: Partial<DiscoverySettings> = JSON.parse(value);
      if (!parsed.radiusKm || ![25, 100, 500, 2000, 20000].includes(parsed.radiusKm)) return;
      // Settings saved before venues existed show every kind.
      const venues = Array.isArray(parsed.venues) ? parsed.venues.filter((item) => venueFilters.includes(item)) : venueFilters;
      setDiscoverySettingsState({ radiusKm: parsed.radiusKm, centerId: parsed.centerId ?? null, venues });
    }).catch(() => undefined);
    return () => { current = false; };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let current = true;
    Promise.all([loadTravelData(userId), AsyncStorage.getItem(externalPlacesKey(userId)).catch(() => null)])
      .then(async ([data, localValue]) => {
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
        setTrip(data.trip);
        setActivities(data.trip ? data.activities : []);
        setExpenses(data.trip ? data.expenses : []);
        setSaved(data.saved.filter((item) => item.kind === "destination").map((item) => item.item_id));
        setSavedPlaces(data.saved.filter((item) => item.kind === "place").map((item) => item.item_id));
        const savedPlaceIds = new Set(data.saved.filter((item) => item.kind === "place").map((item) => item.item_id));
        const cloudPlaces = data.saved.filter((item) => item.kind === "place")
          .map((item) => externalPlaceFromSaved(item.item_id, "details" in item ? item.details : null))
          .filter((item): item is NearbyPlace => !!item);
        const localPlaces = parseLocalExternalPlaces(localValue).filter((item) => savedPlaceIds.has(item.id));
        setExternalPlaces([...new Map([...localPlaces, ...cloudPlaces].map((item) => [item.id, item])).values()]);
        setJournalState(data.journal);
        setJournalEntries(data.journalEntries);
        setJournalAvailable(data.journalAvailable);
        setSyncError("");
        setCloudReady(true);
      })
      .catch(() => {
        if (current) setLoadError("Could not load your account. Check your connection and try again.");
      });
    return () => { current = false; };
  }, [userId, fallbackName, accountLanguage, accountCurrency, reload, setSyncError]);

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
    if (trip && !journalAvailable) throw new Error("Update the trip journal database before replacing this trip.");
    await writeQueue.current;
    await replaceTrip(user.id, next, []);
    if (trip) {
      setJournalEntries(await loadTripJournal(user.id));
      setJournalState("");
    }
    setTrip(next);
    setMonthlyUsage((current) => ({ ...current, trip: current.trip + 1 }));
    setActivities([]);
    setExpenses([]);
    setSyncError("");
  };

  /** Edits the current trip (dates, cities, style or budget) and keeps its activities and expenses. */
  const updateTrip = async (next: Trip) => {
    if (!user || !trip || !cloudReady) throw new Error("Your trip is not ready. Try again.");
    const validation = validateTrip(next);
    if (validation) throw new Error(validation);
    const days = tripDays(next.start, next.end);
    const removed = activities.filter((activity) => activity.day > days).map((activity) => activity.id);
    await persist(() => saveTripChanges(user.id, next, removed));
    setTrip(next);
    setActivities((current) => current.filter((activity) => activity.day <= days));
  };

  const clearTrip = async () => {
    if (!user || !cloudReady) throw new Error("Your account is not ready. Try again.");
    await writeQueue.current;
    await deleteTrip(user.id);
    setTrip(null);
    setActivities([]);
    setExpenses([]);
    setSyncError("");
  };

  const finishTrip = async () => {
    if (!user || !trip || !cloudReady) throw new Error("Your trip is not ready. Try again.");
    if (!journalAvailable) throw new Error("Update the trip journal database before finishing this trip.");
    await writeQueue.current;
    await archiveCurrentTrip();
    setJournalEntries(await loadTripJournal(user.id));
    setTrip(null);
    setActivities([]);
    setExpenses([]);
    setJournalState("");
    setSyncError("");
  };

  const addActivity = async (activity: Omit<Activity, "id">) => {
    if (!user || !trip || !cloudReady) throw new Error("Your trip is not ready. Try again.");
    if (activity.day < 1 || activity.day > tripDays(trip.start, trip.end)) throw new Error("Choose a day in this trip.");
    await ensurePlaceFitsDay(trip, activity);
    const next = { ...activity, id: `activity-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
    await persist(() => saveActivity(user.id, next, activities.length));
    setActivities((current) => [...current, next]);
  };

  const updateActivity = async (activity: Activity) => {
    if (!user || !trip || !cloudReady) throw new Error("Your trip is not ready. Try again.");
    await ensurePlaceFitsDay(trip, activity);
    const position = activities.findIndex((item) => item.id === activity.id);
    if (position < 0) throw new Error("Activity not found. Reload your itinerary.");
    await persist(() => saveActivity(user.id, activity, position));
    setActivities((current) => current.map((item) => item.id === activity.id ? activity : item));
  };

  const removeActivity = async (id: string) => {
    if (!user || !trip || !cloudReady) throw new Error("Your trip is not ready. Try again.");
    await persist(() => deleteActivity(user.id, id));
    setActivities((current) => current.filter((item) => item.id !== id));
  };

  const addExpense = async (expense: Omit<Expense, "id">) => {
    if (!user || !trip || !cloudReady) throw new Error("Your trip is not ready. Try again.");
    const next = { ...expense, id: `expense-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
    await persist(() => saveExpense(user.id, next, expenses.length));
    setExpenses((current) => [...current, next]);
  };

  const updateExpense = async (expense: Expense) => {
    if (!user || !trip || !cloudReady) throw new Error("Your trip is not ready. Try again.");
    const position = expenses.findIndex((item) => item.id === expense.id);
    if (position < 0) throw new Error("Expense not found. Reload your budget.");
    await persist(() => saveExpense(user.id, expense, position));
    setExpenses((current) => current.map((item) => item.id === expense.id ? expense : item));
  };

  const removeExpense = async (id: string) => {
    if (!user || !trip || !cloudReady) throw new Error("Your trip is not ready. Try again.");
    await persist(() => deleteExpense(user.id, id));
    setExpenses((current) => current.filter((item) => item.id !== id));
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
    if (!user || !cloudReady) throw new Error("Your account is not ready. Try again.");
    await saveJournal(user.id, next);
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
    trip, hasTrip: !!trip, generateTrip, updateTrip, clearTrip, finishTrip,
    activities, addActivity, updateActivity, removeActivity,
    expenses, addExpense, updateExpense, removeExpense,
    preferences, setPreferences, hasPreferences, completePreferences,
    discoverySettings, setDiscoverySettings,
    profile, setProfile, avatarUrl, uploadAvatar, removeAvatar, plan, monthlyUsage, refreshMembership, journal, setJournal, journalEntries, journalAvailable, setArchivedReflection, deleteJournalEntry,
    notifications, setNotifications: updateNotifications,
    cloudReady, loadError, retryLoad: () => {
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
