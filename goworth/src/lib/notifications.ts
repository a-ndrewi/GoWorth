import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import type { Href } from "expo-router";
import { formatMessage, translate } from "@/data/i18n";
import type { AppLanguage } from "@/data/formatting";
import { nearestCity } from "@/data/geography";
import { distanceKm } from "@/data/map";
import { loadNearbyPlaces } from "@/data/nearby-places";
import type { WheelStatus } from "@/lib/wheel";
import { wheelRemainingMs } from "@/lib/wheel-odds";
import { formatDistance, nearbyCooldownMs, pickNearbyPlace, tripNudgeDates, wheelReminderDates } from "@/utils/reminders";

export type NotificationKind = "nearby" | "trip" | "wheel";
export type NotificationPrefs = Record<NotificationKind, boolean>;

const prefsKey = "notification-prefs";
const watchKey = "nearby-watch";
const NEARBY_TASK = "goworth-nearby-places";
/** Leaving this circle around the last known position counts as arriving somewhere new. */
const ANCHOR_RADIUS_M = 2000;
const NEARBY_SEARCH_KM = 3;
const wheelIds = ["wheel-soon", "wheel-ready"];
const tripIds = ["trip-nudge-0", "trip-nudge-1"];

// Shown while the app is open as well; GoWorth only sends what the traveller asked for.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

// Nearby places need location while the app is closed, so the trip, wheel and reminder kinds are on and this one is opt-in.
const defaultPrefs: NotificationPrefs = { nearby: false, trip: true, wheel: true };
let prefs = defaultPrefs;
let prefsLoaded = false;
/** Bumped when the system permission is newly granted, so reminders skipped for lack of it are scheduled. */
let permissionGrants = 0;
const listeners = new Set<() => void>();

const prefsReady = AsyncStorage.getItem(prefsKey).then((value) => {
  if (value) prefs = { ...defaultPrefs, ...JSON.parse(value) };
}).catch(() => undefined).finally(() => { prefsLoaded = true; listeners.forEach((listener) => listener()); });

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

/** The kinds the traveller turned on here, and whether they have been read from storage yet. */
export function useNotificationPrefs() {
  const value = useSyncExternalStore(subscribe, () => prefs, () => defaultPrefs);
  const loaded = useSyncExternalStore(subscribe, () => prefsLoaded, () => false);
  const grants = useSyncExternalStore(subscribe, () => permissionGrants, () => 0);
  return { prefs: value, loaded, grants };
}

export async function updateNotificationPrefs(next: Partial<NotificationPrefs>) {
  await prefsReady;
  prefs = { ...prefs, ...next };
  listeners.forEach((listener) => listener());
  await AsyncStorage.setItem(prefsKey, JSON.stringify(prefs)).catch(() => undefined);
}

export async function notificationsAllowed() {
  const settings = await Notifications.getPermissionsAsync().catch(() => null);
  return !!settings?.granted;
}

/** Asks the system once; later calls return the traveller's answer without a prompt. */
export async function requestNotificationPermission() {
  if (await notificationsAllowed()) return true;
  const settings = await Notifications.requestPermissionsAsync().catch(() => null);
  if (settings?.granted) { permissionGrants += 1; listeners.forEach((listener) => listener()); }
  return !!settings?.granted;
}

const cancel = (ids: string[]) => Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)));

const wheelCopy = (language: AppLanguage) => ({
  soon: [translate("Your wheel is almost ready", language), translate("One hour until your next free spin for Premium.", language)],
  ready: [translate("Your daily spin is ready", language), translate("Spin the wheel now for a chance to win Premium.", language)],
});
const tripCopy = (language: AppLanguage) => [
  [translate("Where to next?", language), translate("Pick a city and GoWorth lays out the days for you.", language)],
  [translate("Your next trip is waiting", language), translate("A weekend away is a few taps from planned.", language)],
];

async function scheduleAt(identifier: string, date: Date, title: string, body: string, route: Href) {
  await Notifications.scheduleNotificationAsync({
    identifier,
    content: { title, body, data: { route } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
  });
}

/** An hour before the next free spin and when it is ready. Pass `null` when the wheel does not apply (signed out, lifetime). */
export async function syncWheelReminders(status: WheelStatus | null, language: AppLanguage) {
  await cancel(wheelIds);
  await prefsReady;
  if (!status || !prefs.wheel || !(await notificationsAllowed())) return;
  const { soon, ready } = wheelReminderDates(wheelRemainingMs(status.nextSpinAt, status.clockOffsetMs));
  const copy = wheelCopy(language);
  if (soon) await scheduleAt(wheelIds[0], soon, copy.soon[0], copy.soon[1], "/membership");
  if (ready) await scheduleAt(wheelIds[1], ready, copy.ready[0], copy.ready[1], "/membership");
}

/** Suggests planning a trip after some days away from the app with none planned; a planned trip clears them. */
export async function syncTripNudges(hasTrip: boolean | null, language: AppLanguage) {
  await cancel(tripIds);
  await prefsReady;
  if (hasTrip !== false || !prefs.trip || !(await notificationsAllowed())) return;
  const dates = tripNudgeDates();
  const copy = tripCopy(language);
  for (const [index, date] of dates.entries()) await scheduleAt(tripIds[index], date, copy[index][0], copy[index][1], "/planner");
}

type WatchState = { language: AppLanguage; lastAt: number; seen: string[] };

async function readWatch(): Promise<WatchState> {
  try {
    const value = JSON.parse((await AsyncStorage.getItem(watchKey)) || "{}");
    return { language: value.language === "ro" ? "ro" : "en", lastAt: Number(value.lastAt) || 0, seen: Array.isArray(value.seen) ? value.seen : [] };
  } catch { return { language: "en", lastAt: 0, seen: [] }; }
}

const writeWatch = (state: WatchState) => AsyncStorage.setItem(watchKey, JSON.stringify(state)).catch(() => undefined);

function anchorAt(point: { latitude: number; longitude: number }) {
  return Location.startGeofencingAsync(NEARBY_TASK, [{
    identifier: "anchor", latitude: point.latitude, longitude: point.longitude, radius: ANCHOR_RADIUS_M, notifyOnEnter: false, notifyOnExit: true,
  }]);
}

const within = <T,>(promise: Promise<T>, ms: number) =>
  Promise.race([promise, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);

/** The nearest attraction around `center` not suggested before, as a notification that opens its page. */
async function nearbySuggestion(center: { latitude: number; longitude: number }, language: AppLanguage, seen: readonly string[]) {
  // The system gives a woken app little time, so a slow lookup is dropped rather than finished late.
  const places = await within(loadNearbyPlaces(center, NEARBY_SEARCH_KM).catch(() => null), 20000);
  const place = places && pickNearbyPlace(places, seen);
  const city = nearestCity(center.latitude, center.longitude);
  if (!place || !city) return null;
  const content: Notifications.NotificationContentInput = {
    title: translate("Worth a look nearby", language),
    body: formatMessage("{name} is {distance} away · {category}", {
      name: place.name, distance: formatDistance(distanceKm(center, place)), category: translate(place.category, language),
    }, language),
    data: { route: { pathname: "/place", params: {
      country: city.countryCode, city: city.id, place: place.id, name: place.name,
      latitude: String(place.latitude), longitude: String(place.longitude),
      category: place.category, detail: place.detail, sourceUrl: place.sourceUrl,
    } } },
  };
  return { placeId: place.id, content };
}

/** The traveller left the circle: follow them there and, now and then, point out the nearest attraction. */
async function arrivedSomewhere() {
  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  const center = { latitude: position.coords.latitude, longitude: position.coords.longitude };
  await anchorAt(center);
  const state = await readWatch();
  if (Date.now() - state.lastAt < nearbyCooldownMs || !prefs.nearby) return;
  const suggestion = await nearbySuggestion(center, state.language, state.seen);
  if (!suggestion) return;
  await Notifications.scheduleNotificationAsync({ content: suggestion.content, trigger: null });
  await writeWatch({ ...state, lastAt: Date.now(), seen: [suggestion.placeId, ...state.seen].slice(0, 100) });
}

TaskManager.defineTask<{ eventType: Location.GeofencingEventType }>(NEARBY_TASK, async ({ data, error }) => {
  if (error || data?.eventType !== Location.GeofencingEventType.Exit) return;
  await prefsReady;
  await arrivedSomewhere().catch(() => undefined);
});

/**
 * Starts or stops watching for arrivals. With `ask` it may show the notification and "Always" location prompts;
 * without it, it only re-centres a watch the traveller already allowed. Resolves to whether the watch is running.
 */
export async function syncNearbyWatch(enabled: boolean, language: AppLanguage, ask = false) {
  const running = await Location.hasStartedGeofencingAsync(NEARBY_TASK).catch(() => false);
  const stop = async () => { if (running) await Location.stopGeofencingAsync(NEARBY_TASK).catch(() => undefined); return false; };
  if (!enabled) return stop();
  if (!(ask ? await requestNotificationPermission() : await notificationsAllowed())) return stop();
  const foreground = ask ? await Location.requestForegroundPermissionsAsync() : await Location.getForegroundPermissionsAsync();
  if (foreground.status !== "granted") return stop();
  const background = ask ? await Location.requestBackgroundPermissionsAsync() : await Location.getBackgroundPermissionsAsync();
  if (background.status !== "granted") return stop();
  const position = await Location.getLastKnownPositionAsync()
    ?? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  await writeWatch({ ...(await readWatch()), language });
  await anchorAt(position.coords);
  return true;
}

/**
 * Development builds only: every kind of notification, with its real text, a few seconds apart, so each can be seen
 * and tapped on a device without waiting for the wheel, days without a trip, or a 2 km walk. Nothing real is changed.
 * Resolves to the number scheduled, or 0 without permission.
 */
export async function sendTestNotifications(language: AppLanguage) {
  if (!(await requestNotificationPermission())) return 0;
  const inSeconds = (seconds: number) => ({ type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds } as const);
  const wheel = wheelCopy(language);
  const [trip] = tripCopy(language);
  const tests: [string, string, Href][] = [
    [wheel.soon[0], wheel.soon[1], "/membership"], [wheel.ready[0], wheel.ready[1], "/membership"], [trip[0], trip[1], "/planner"],
  ];
  for (const [index, [title, body, route]] of tests.entries()) {
    await Notifications.scheduleNotificationAsync({ identifier: `test-${index}`, content: { title, body, data: { route } }, trigger: inSeconds(5 + index * 5) });
  }
  // Nearby uses where the phone is now, so it needs location (while using the app is enough here).
  const permission = await Location.requestForegroundPermissionsAsync().catch(() => null);
  if (permission?.status !== "granted") return tests.length;
  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null);
  const suggestion = position && await nearbySuggestion(position.coords, language, []);
  if (!suggestion) return tests.length;
  await Notifications.scheduleNotificationAsync({ identifier: "test-nearby", content: suggestion.content, trigger: inSeconds(20) });
  return tests.length + 1;
}

/** Signing out: nothing scheduled for this account should arrive later. */
export async function clearAccountNotifications() {
  await cancel([...wheelIds, ...tripIds]);
  await syncNearbyWatch(false, "en");
}

/** Where the last tapped notification leads, once per tap. */
export function useNotificationRoute() {
  const response = Notifications.useLastNotificationResponse();
  const route = response?.notification.request.content.data?.route;
  return response && route ? { id: response.notification.request.identifier + response.notification.date, route: route as Href } : null;
}
