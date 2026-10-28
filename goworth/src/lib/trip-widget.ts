import type { AppLanguage } from "@/data/formatting";
import type { Activity, Trip } from "@/data/travel";

/** Home screen widgets are iOS-only for now (see trip-widget.ios.ts). */
export function updateTripWidget(_trip: Trip | null, _activities: Activity[], _language: AppLanguage) {}
