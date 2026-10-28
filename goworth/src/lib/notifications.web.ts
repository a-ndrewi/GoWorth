import type { Href } from "expo-router";
import type { AppLanguage } from "@/data/formatting";
import type { WheelStatus } from "@/lib/wheel";

// The web app has no scheduled or background notifications; these keep the native API so callers need no checks.
export type NotificationKind = "nearby" | "trip" | "wheel";
export type NotificationPrefs = Record<NotificationKind, boolean>;

const prefs: NotificationPrefs = { nearby: false, trip: false, wheel: false };

export const useNotificationPrefs = () => ({ prefs, loaded: true, grants: 0 });
export const updateNotificationPrefs = async (_next: Partial<NotificationPrefs>) => undefined;
export const notificationsAllowed = async () => false;
export const requestNotificationPermission = async () => false;
export const syncWheelReminders = async (_status: WheelStatus | null, _language: AppLanguage) => undefined;
export const syncTripNudges = async (_hasTrip: boolean | null, _language: AppLanguage) => undefined;
export const syncNearbyWatch = async (_enabled: boolean, _language: AppLanguage, _ask = false) => false;
export const sendTestNotifications = async (_language: AppLanguage) => 0;
export const clearAccountNotifications = async () => undefined;
export const useNotificationRoute = (): { id: string; route: Href } | null => null;
