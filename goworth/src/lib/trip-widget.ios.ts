import type { AppLanguage } from "@/data/formatting";
import { formatMessage, translate } from "@/data/i18n";
import { tripDays, type Activity, type Trip } from "@/data/travel";
import { routeTitle } from "@/data/trip-route";
import { localToday, tripStatus } from "@/components/goworth/trip-hero";
import { dayCityNames } from "@/utils/trip-place";
import { widgetDays } from "@/utils/reminders";
import { cityCode, dateRange } from "@/utils/ticket";
import { requireOptionalNativeModule } from "expo";
import type { TripWidgetProps } from "@/widgets/trip-widget";

// Expo Go has no widget extension, and loading the widget there throws at startup, so it is only required when the
// native module is present (a development or store build).
type TripWidgetObject = typeof import("@/widgets/trip-widget").default;
let tripWidget: TripWidgetObject | null | undefined;
function loadTripWidget() {
  if (tripWidget === undefined) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    tripWidget = requireOptionalNativeModule("ExpoWidgets") ? (require("../widgets/trip-widget") as { default: TripWidgetObject }).default : null;
  }
  return tripWidget;
}

const upper = (value: string, language: AppLanguage) => value.toLocaleUpperCase(language === "ro" ? "ro-RO" : "en-US");

/** No trip: a blank ticket that invites planning one. */
const emptyProps = (language: AppLanguage, ended = false): TripWidgetProps => ({
  active: false,
  label: upper(translate(ended ? "Trip ended" : "No trip booked", language), language),
  code: "GO",
  route: translate("Plan your next trip", language),
  firstLabel: upper(translate("Next", language), language), first: translate("Pick a city", language),
  secondLabel: upper(translate("Class", language), language), second: translate("Explorer", language),
  passengerLabel: upper(translate("Next", language), language), passenger: translate("Pick a city", language),
  plansHeading: "", plans: [], progress: -1, url: "goworth://planner",
});

function propsForDay(trip: Trip, activities: Activity[], day: string, language: AppLanguage): TripWidgetProps {
  const status = tripStatus(trip.start, trip.end, day);
  if (status.kind === "ended") return emptyProps(language, true);
  const total = tripDays(trip.start, trip.end);
  // Before the trip the ticket previews its first day.
  const tripDay = status.kind === "active" ? status.days : 1;
  const plans = activities.filter((activity) => activity.day === tripDay)
    .sort((a, b) => a.time.localeCompare(b.time)).slice(0, 3).map((activity) => `${activity.time} ${activity.name}`);
  // The code follows the city of the day, so a route trip changes ticket as it moves on.
  const city = dayCityNames(trip, tripDay)[0] ?? routeTitle(trip, language);
  const left = total - tripDay;
  const days = (count: number) => count === 1 ? translate("1 day", language) : formatMessage("{days} days", { days: count }, language);
  return {
    active: true,
    label: upper(status.kind === "upcoming"
      ? status.days <= 1 ? translate("Departs tomorrow", language) : formatMessage("Departs in {days} days", { days: status.days }, language)
      : formatMessage("Day {day}/{days}", { day: status.days, days: total }, language), language),
    code: cityCode(city),
    route: `${routeTitle(trip, language)} · ${dateRange(trip.start, trip.end, language === "ro" ? "ro-RO" : "en-US")}`,
    firstLabel: upper(translate(status.kind === "active" ? "Today" : "First stop", language), language),
    first: status.kind === "active" ? plans[0] ?? translate("Free day", language) : translate(city, language),
    secondLabel: upper(translate(status.kind === "active" ? "Left" : "Length", language), language),
    second: status.kind !== "active" ? days(total) : left === 0 ? translate("Last day", language) : days(left),
    passengerLabel: upper(translate("Passenger", language), language),
    passenger: translate(trip.companions, language),
    plansHeading: upper(translate(status.kind === "active" ? "Today" : "First day", language), language),
    plans: plans.length ? plans : [translate("Nothing planned yet", language)],
    progress: status.kind === "active" ? status.days / total : -1,
    url: "goworth://itinerary",
  };
}

const startOfDay = (day: string) => {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date);
};

/** One timeline entry per day, so the countdown and "Day N" move on at midnight without the app being opened. */
export function updateTripWidget(trip: Trip | null, activities: Activity[], language: AppLanguage) {
  const widget = loadTripWidget();
  if (!widget) return;
  try {
    const today = localToday();
    if (!trip) { widget.updateSnapshot(emptyProps(language)); return; }
    widget.updateTimeline(widgetDays(trip.start, trip.end, today).map((day) => ({
      date: day === today ? new Date() : startOfDay(day),
      props: propsForDay(trip, activities, day, language),
    })));
  } catch {
    // The system can refuse an update (for example with no app group); the app carries on without the widget.
  }
}
