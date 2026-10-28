import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/state/auth-context";
import { useTravel } from "@/state/travel-context";
import { loadWheelStatus } from "@/lib/wheel";
import {
  clearAccountNotifications, syncNearbyWatch, syncTripNudges, syncWheelReminders, useNotificationPrefs, useNotificationRoute,
} from "@/lib/notifications";
import { updateTripWidget } from "@/lib/trip-widget";

/** Increases each time the app comes back to the foreground, so reminders are rescheduled from that moment. */
function useForegroundCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => { if (state === "active") setCount((value) => value + 1); });
    return () => sub.remove();
  }, []);
  return count;
}

/** Keeps what lives outside the app (scheduled notifications, the nearby watch, the home screen widget) in step with the account. */
export function DeviceSync() {
  const { user } = useAuth();
  const { cloudReady, trip, activities, profile, plan } = useTravel();
  const { prefs, loaded, grants } = useNotificationPrefs();
  const foreground = useForegroundCount();
  const signedIn = !!user && cloudReady;
  const language = profile.language;

  useEffect(() => {
    if (!user) updateTripWidget(null, [], language);
    else if (cloudReady) updateTripWidget(trip, activities, language);
  }, [user, cloudReady, trip, activities, language]);

  useEffect(() => {
    if (!loaded) return;
    if (!user) { void clearAccountNotifications(); return; }
    if (!cloudReady) return;
    void syncTripNudges(!!trip, language);
    void syncNearbyWatch(prefs.nearby, language);
  }, [loaded, user, cloudReady, trip, language, prefs.nearby, prefs.trip, grants, foreground]);

  useEffect(() => {
    if (!loaded || !signedIn) return;
    let current = true;
    if (plan === "lifetime") { void syncWheelReminders(null, language); return; }
    loadWheelStatus().then((status) => { if (current) void syncWheelReminders(status, language); }).catch(() => undefined);
    return () => { current = false; };
  }, [loaded, signedIn, plan, language, prefs.wheel, grants, foreground]);

  const tapped = useNotificationRoute();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!tapped || !signedIn || handled.current === tapped.id) return;
    handled.current = tapped.id;
    router.push(tapped.route);
  }, [tapped, signedIn]);

  return null;
}
