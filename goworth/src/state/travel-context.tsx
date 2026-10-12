import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Activity, Expense, Trip } from "@/data/travel";
import { useAuth } from "@/state/auth-context";
import {
  deleteActivity,
  deleteExpense,
  deleteTrip,
  loadTravelData,
  replaceTrip,
  saveActivity,
  saveExpense,
  saveJournal,
  savePreferences,
  saveProfile,
  setSavedItem,
} from "@/lib/travel-repository";

export type TravelPreferences = {
  interests: string[];
  region: string;
  budget: number;
  pace: string;
};

export type TravelProfile = { name: string; username: string };

const blankPreferences: TravelPreferences = {
  interests: [],
  region: "Worldwide",
  budget: 2500,
  pace: "Balanced",
};

function useTravelState() {
  const { user } = useAuth();
  const userId = user?.id;
  const fallbackName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Traveler";
  const [saved, setSaved] = useState<string[]>([]);
  const [savedPlaces, setSavedPlaces] = useState<string[]>([]);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [preferences, setPreferencesState] = useState<TravelPreferences>(blankPreferences);
  const [hasPreferences, setHasPreferences] = useState(false);
  const [profile, setProfileState] = useState<TravelProfile>({ name: fallbackName, username: "" });
  const [journal, setJournalState] = useState("");
  const [notifications, setNotifications] = useState(false);
  const [cloudReady, setCloudReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [syncError, setSyncError] = useState("");
  const [reload, setReload] = useState(0);
  const writeQueue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (!userId) return;
    let current = true;
    loadTravelData(userId)
      .then((data) => {
        if (!current) return;
        setProfileState({
          name: data.profile?.display_name || fallbackName,
          username: data.profile?.username || "",
        });
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
        setJournalState(data.journal);
        setSyncError("");
        setCloudReady(true);
      })
      .catch(() => {
        if (current) setLoadError("Could not load your account. Check your connection and try again.");
      });
    return () => { current = false; };
  }, [userId, fallbackName, reload]);

  const persist = (work: () => Promise<unknown>) => {
    const next = writeQueue.current.then(work);
    writeQueue.current = next.then(() => undefined, () => undefined);
    return next.then(() => {
      setSyncError("");
    }, (error: unknown) => {
      setSyncError("Changes could not sync. Check your connection and try again.");
      throw error;
    });
  };

  const toggleSaved = (id: string) => {
    if (!user || !cloudReady) return;
    const enabled = !saved.includes(id);
    void persist(() => setSavedItem(user.id, "destination", id, enabled))
      .then(() => setSaved((current) => enabled ? [...new Set([...current, id])] : current.filter((item) => item !== id)))
      .catch(() => undefined);
  };

  const togglePlace = (id: string) => {
    if (!user || !cloudReady) return;
    const enabled = !savedPlaces.includes(id);
    void persist(() => setSavedItem(user.id, "place", id, enabled))
      .then(() => setSavedPlaces((current) => enabled ? [...new Set([...current, id])] : current.filter((item) => item !== id)))
      .catch(() => undefined);
  };

  const generateTrip = async (next: Trip) => {
    if (!user || !cloudReady) throw new Error("Your account is not ready. Try again.");
    await writeQueue.current;
    await replaceTrip(user.id, next, []);
    setTrip(next);
    setActivities([]);
    setExpenses([]);
    setSyncError("");
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

  const addActivity = async (activity: Omit<Activity, "id">) => {
    if (!user || !trip || !cloudReady) throw new Error("Your trip is not ready. Try again.");
    const next = { ...activity, id: `activity-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
    await persist(() => saveActivity(user.id, next, activities.length));
    setActivities((current) => [...current, next]);
  };

  const updateActivity = async (activity: Activity) => {
    if (!user || !trip || !cloudReady) throw new Error("Your trip is not ready. Try again.");
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
  const completePreferences = async () => {
    if (!user || !cloudReady) throw new Error("Your account is not ready. Try again.");
    await savePreferences(user.id, preferences);
    setHasPreferences(true);
    setSyncError("");
  };
  const setProfile = async (next: TravelProfile) => {
    if (!user || !cloudReady) throw new Error("Your account is not ready. Try again.");
    await saveProfile(user.id, next, notifications);
    setProfileState(next);
    setSyncError("");
  };
  const setJournal = async (next: string) => {
    if (!user || !cloudReady) throw new Error("Your account is not ready. Try again.");
    await saveJournal(user.id, next);
    setJournalState(next);
    setSyncError("");
  };
  const updateNotifications = (next: boolean) => {
    if (!user || !cloudReady) return;
    void persist(() => saveProfile(user.id, profile, next))
      .then(() => setNotifications(next))
      .catch(() => undefined);
  };

  return {
    saved, toggleSaved, savedPlaces, togglePlace,
    trip, hasTrip: !!trip, generateTrip, clearTrip,
    activities, addActivity, updateActivity, removeActivity,
    expenses, addExpense, updateExpense, removeExpense,
    preferences, setPreferences, hasPreferences, completePreferences,
    profile, setProfile, journal, setJournal,
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
