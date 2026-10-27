import { router, useLocalSearchParams, type Href } from "expo-router";
import { useState } from "react";
import { Linking, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { TimeDropdown } from "@/components/goworth/date-time-controls";
import { Button, Chip, Copy, EmptyState, Field, Header, Heading, Icon, IconButton, Row, Screen, Sheet, sharedSheet, type IconName } from "@/components/goworth/ui";
import { themedStyles } from "@/constants/design";
import { usePalette, useStyles } from "@/state/theme-context";
import {
  expenseCategories,
  money,
  tripDays,
  type Activity,
  type Expense,
  type ExpenseCategory,
} from "@/data/travel";
import { routeStop, routeTitle } from "@/data/trip-route";
import { formatMessage, translate, translateAccessibility } from "@/data/i18n";
import { countryFlag } from "@/data/geography";
import { useAppLanguage } from "@/data/formatting";
import { useTravel } from "@/state/travel-context";
import { TripHero, heroStylesSheet, localToday, tripStatus } from "@/components/goworth/trip-hero";
import { citiesForDay, nextActivitySlot } from "@/utils/trip";
import { dayRoutePoints, MAX_ROUTE_STOPS, mapsRouteUrl, placeFitsTripDay, useTripAreas } from "@/utils/trip-place";
import { publicActivityNote, translatedActivityNote } from "@/utils/public-activity";

const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

export function ItineraryScreen() {
  const styles = useStyles(stylesSheet);
  const s = useStyles(sharedSheet);
  const heroStyles = useStyles(heroStylesSheet);
  const p = usePalette();
  const language = useAppLanguage();
  const locale = language === "ro" ? "ro-RO" : "en-US";
  const { day: dayParam } = useLocalSearchParams<{ day?: string }>();
  const { trip, activities, addActivity, updateActivity, removeActivity, finishTrip, clearTrip } = useTravel();
  const [editing, setEditing] = useState<Activity | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [menu, setMenu] = useState<"" | "trip" | "finish" | "delete">("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [time, setTime] = useState("10:00");
  const [activityDay, setActivityDay] = useState(1);
  const tripAreas = useTripAreas(trip);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (!trip) {
    return (
      <Screen active="itinerary" style={{ gap: 22 }}>
        <Header title="My trip" onBack={() => router.dismissTo("/home" as Href)} />
        <EmptyState title="Your first trip starts here" detail="Plan a destination to build your itinerary." action="Plan a trip" onPress={() => router.push("/planner" as Href)} />
      </Screen>
    );
  }
  const days = tripDays(trip.start, trip.end);
  const today = localToday();
  const status = tripStatus(trip.start, trip.end, today);
  const day = Math.min(Math.max(1, Math.trunc(Number(dayParam)) || (status.kind === "active" ? status.days : 1)), days);
  const dayDate = addDays(trip.start, day - 1);
  const dayStops = citiesForDay(trip, day).map((id) => routeStop(trip, id));
  const format = (date: string, options: Intl.DateTimeFormatOptions) => new Date(`${date}T12:00:00Z`).toLocaleDateString(locale, { ...options, timeZone: "UTC" });
  const selectDay = (next: number) => router.setParams({ day: String(next) });
  const openEditor = (activity?: Activity) => {
    setEditing(activity || null);
    setName(activity?.name || "");
    setNote(activity?.note || "");
    setTime(activity?.time || nextActivitySlot(activities, day).time);
    setActivityDay(activity?.day ?? day);
    setError("");
    setConfirmDelete(false);
    setShowEditor(true);
  };
  const save = async () => {
    if (!name.trim()) {
      setError("Give your activity a name.");
      return;
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      setError("Enter a time in HH:MM format, such as 16:00.");
      return;
    }
    const activity = {
      day: activityDay,
      period: (Number(time.slice(0, 2)) < 12 ? "Morning" : Number(time.slice(0, 2)) < 18 ? "Afternoon" : "Evening") as Activity["period"],
      time,
      name: name.trim(),
      note: note.trim(),
    };
    setSaving(true);
    setError("");
    try {
      if (editing) await updateActivity({ ...activity, id: editing.id, placeId: editing.placeId, latitude: editing.latitude, longitude: editing.longitude });
      else await addActivity(activity);
      setShowEditor(false);
      if (activityDay !== day) selectDay(activityDay);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the activity.");
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    if (!editing) return;
    setSaving(true);
    setError("");
    try {
      await removeActivity(editing.id);
      setShowEditor(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete the activity.");
    } finally {
      setSaving(false);
    }
  };
  const closeTrip = async (action: "finish" | "delete") => {
    setSaving(true);
    setError("");
    try {
      if (action === "finish") { await finishTrip(); setMenu(""); router.dismissTo({ pathname: "/saved", params: { tab: "Trips" } } as Href); }
      else { await clearTrip(); setMenu(""); router.dismissTo("/home" as Href); }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update this trip.");
    } finally {
      setSaving(false);
    }
  };
  const dayActivities = activities.filter((a) => a.day === day).sort((a, b) => a.time.localeCompare(b.time));
  const navigationPoints = dayRoutePoints(dayStops, dayActivities.filter((activity) => activity.latitude !== undefined && activity.longitude !== undefined) as (Activity & { latitude: number; longitude: number })[]);
  const routeUrl = mapsRouteUrl(navigationPoints);
  const unmapped = dayActivities.filter((activity) => !Number.isFinite(activity.latitude) || !Number.isFinite(activity.longitude)).length;
  const findPlaces = () => router.navigate({ pathname: "/itinerary-places", params: { day: String(day) } } as Href);
  return (
    <Screen active="itinerary" style={{ gap: 18 }}>
      <Row style={{ justifyContent: "space-between" }}>
        <IconButton name="back" label="Go back" onPress={() => router.dismissTo("/home" as Href)} />
        <Copy style={{ fontWeight: "700" }}>My trip</Copy>
        <IconButton name="more" label="Trip options" onPress={() => { setError(""); setMenu("trip"); }} />
      </Row>

      <TripHero trip={trip}>
        <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/planner", params: { edit: "1" } } as Href)} style={({ pressed }) => [heroStyles.heroButton, { alignSelf: "flex-start" }, pressed && { opacity: 0.85 }]}>
          <Icon name="edit" size={16} color={p.blue} /><Text style={heroStyles.heroButtonText}>{translate("Edit trip", language)}</Text>
        </Pressable>
      </TripHero>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8 }}>
        {Array.from({ length: days }, (_, index) => {
          const date = addDays(trip.start, index);
          const selected = day === index + 1;
          const planned = activities.some((activity) => activity.day === index + 1);
          return <Pressable key={index} accessibilityRole="button" accessibilityState={{ selected }}
            accessibilityLabel={formatMessage("Day {day}, {date}", { day: index + 1, date: format(date, { weekday: "long", day: "numeric", month: "long" }) }, language)}
            onPress={() => selectDay(index + 1)} style={({ pressed }) => [styles.dayPill, selected && styles.dayPillSelected, date === today && !selected && styles.dayPillToday, pressed && { transform: [{ scale: 0.95 }] }]}>
            <Text style={[styles.dayPillLabel, selected && { color: "rgba(255,255,255,0.85)" }]}>{formatMessage("Day {day}", { day: index + 1 }, language)}</Text>
            <Text style={[styles.dayPillDate, selected && { color: p.onColor }]}>{format(date, { day: "numeric" })}</Text>
            <Text style={[styles.dayPillLabel, selected && { color: "rgba(255,255,255,0.85)" }]}>{format(date, { weekday: "short" })}</Text>
            <View style={[styles.dayPillDot, { opacity: planned ? 1 : 0 }, selected && { backgroundColor: p.white }]} />
          </Pressable>;
        })}
      </ScrollView>

      <Row style={{ alignItems: "flex-start", gap: 10 }}>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Heading style={{ fontSize: 20, lineHeight: 26 }}>{format(dayDate, { weekday: "long", day: "numeric", month: "long" })}</Heading>
          <Copy muted style={{ fontSize: 13 }}>{dayStops.map((stop) => `${countryFlag(stop.countryCode)} ${translate(stop.name, language)}`.trim()).join("  →  ")}</Copy>
        </View>
        {!!routeUrl && <Pressable accessibilityRole="button" accessibilityLabel={formatMessage("Open day {day} route in Google Maps", { day }, language)} onPress={() => void Linking.openURL(routeUrl)} style={({ pressed }) => [styles.navigate, pressed && { backgroundColor: p.blueSoft }]}>
          <Icon name="road" size={17} color={p.blue} /><Text style={styles.navigateText}>{translate("Navigate", language)}</Text>
        </Pressable>}
      </Row>

      {navigationPoints.length ? <View style={styles.routeCard}>
        <Row style={{ gap: 6 }}>
          <Icon name="road" size={15} color={p.blue} />
          <Text style={styles.routeTitle}>{formatMessage(navigationPoints.length === 1 ? "Day {day} route · 1 stop" : "Day {day} route · {count} stops", { day, count: navigationPoints.length }, language)}</Text>
        </Row>
        <Copy muted style={{ fontSize: 12, lineHeight: 18 }}>{navigationPoints.slice(0, MAX_ROUTE_STOPS).map((stop, index) => `${index + 1}. ${stop.name}`).join("  →  ")}</Copy>
        {navigationPoints.length > MAX_ROUTE_STOPS && <Copy muted style={{ fontSize: 11 }}>{formatMessage("Google Maps opens the first {count} stops.", { count: MAX_ROUTE_STOPS }, language)}</Copy>}
      </View> : !!dayActivities.length && <Copy muted style={{ fontSize: 12 }}>Add a place from Find places to build the Google Maps route for this day.</Copy>}

      {dayActivities.length ? <View>
        {dayActivities.map((activity, index) => {
          const located = Number.isFinite(activity.latitude) && Number.isFinite(activity.longitude);
          return <Row key={activity.id} style={{ alignItems: "stretch", gap: 12 }}>
            <View style={{ width: 44, alignItems: "center" }}>
              <Text style={styles.time}>{activity.time}</Text>
              <View style={[styles.timelineDot, located && { backgroundColor: p.blue }]} />
              {index < dayActivities.length - 1 && <View style={styles.timelineLine} />}
            </View>
            <View style={styles.activity}>
            <Pressable accessibilityRole="button" accessibilityLabel={translateAccessibility(`Edit ${activity.name}`, language)} onPress={() => openEditor(activity)}
              style={({ pressed }) => [{ flex: 1, minWidth: 0, alignSelf: "stretch", justifyContent: "center" }, pressed && { opacity: 0.7 }]}>
              <View style={{ flex: 1, minWidth: 0, gap: 3, justifyContent: "center" }}>
                <Text style={styles.activityName}>{activity.name}</Text>
                {!!publicActivityNote(activity.note) && <Copy muted style={{ fontSize: 12, lineHeight: 17 }}>{translatedActivityNote(activity.note, (part) => translate(part, language))}</Copy>}
                {located && <Row style={{ gap: 4 }}><Icon name="pin" size={13} color={p.blue} /><Copy style={{ fontSize: 11, color: p.blue, fontWeight: "600" }}>On the map</Copy></Row>}
              </View>
            </Pressable>
              {located && <IconButton name="map" label={`Open ${activity.name} on map`} color={p.blue} onPress={() => router.navigate({ pathname: "/itinerary-places", params: { day: String(day), activity: activity.id } } as Href)} style={{ width: 38, minWidth: 38, height: 38, minHeight: 38 }} />}
            </View>
          </Row>;
        })}
      </View> : <View style={styles.emptyDay}>
        <View style={styles.emptyIcon}><Icon name="compass" size={26} color={p.blue} /></View>
        <Heading style={{ fontSize: 17, lineHeight: 23, textAlign: "center" }}>Nothing planned yet</Heading>
        <Copy muted style={{ fontSize: 13, textAlign: "center" }}>{formatMessage("Find things to do in {city} or add your own plan.", { city: dayStops.map((stop) => translate(stop.name, language)).join(", ") }, language)}</Copy>
      </View>}
      <Row style={{ gap: 9 }}>
        <Button secondary icon="pin" onPress={findPlaces} style={{ flex: 1 }}>Find places</Button>
        <Button icon="plus" onPress={() => openEditor()} style={{ flex: 1 }}>Add activity</Button>
      </Row>
      {!!unmapped && !!navigationPoints.length && <Copy muted style={{ fontSize: 11, textAlign: "center" }}>Activities without a map location are not included in navigation.</Copy>}


      <Sheet visible={menu === "trip"} title={routeTitle(trip, language)} onClose={() => setMenu("")}>
        <Button secondary icon="edit" onPress={() => { setMenu(""); router.push({ pathname: "/planner", params: { edit: "1" } } as Href); }}>Edit trip</Button>
        <Button secondary icon="check" onPress={() => setMenu("finish")}>Finish trip</Button>
        <Button secondary icon="trash" onPress={() => setMenu("delete")}>Delete trip</Button>
      </Sheet>
      <Sheet visible={menu === "finish"} title="Finish this trip?" onClose={() => { if (!saving) setMenu(""); }}>
        <Copy muted>The itinerary, recorded expenses, saved places, and note will move into your journal. This trip will no longer be editable.</Copy>
        {!!error && <Copy style={s.error}>{error}</Copy>}
        <Button busy={saving} onPress={() => void closeTrip("finish")}>Finish and archive</Button>
        <Button secondary disabled={saving} onPress={() => setMenu("trip")}>Keep trip open</Button>
      </Sheet>
      <Sheet visible={menu === "delete"} title="Delete this trip?" onClose={() => { if (!saving) setMenu(""); }}>
        <Copy muted>Your itinerary and expenses will be deleted. Saved places and your journal will remain.</Copy>
        {!!error && <Copy style={s.error}>{error}</Copy>}
        <Button busy={saving} onPress={() => void closeTrip("delete")}>Delete trip</Button>
        <Button secondary disabled={saving} onPress={() => setMenu("trip")}>Cancel</Button>
      </Sheet>

      <Sheet visible={showEditor} title={editing ? "Edit activity" : "New activity"} onClose={() => setShowEditor(false)}>
        <Field label="Activity" placeholder="What would you like to do?" value={name} onChangeText={setName} maxLength={90} />
        <View style={{ gap: 7 }}>
          <Copy style={s.label}>Day</Copy>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>
            {/* A place can only move to the days planned for its own city; a free-form activity can go on any day. */}
            {Array.from({ length: days }, (_, index) => index + 1).filter((option) => option === activityDay || !editing?.placeId ||
              editing.latitude === undefined || editing.longitude === undefined ||
              placeFitsTripDay(trip, option, { latitude: editing.latitude, longitude: editing.longitude, placeId: editing.placeId }, tripAreas)).map((option) =>
              <Chip key={option} selected={activityDay === option} onPress={() => setActivityDay(option)}>
                {formatMessage("Day {day} · {date}", { day: option, date: format(addDays(trip.start, option - 1), { day: "numeric", month: "short" }) }, language)}
              </Chip>)}
          </ScrollView>
        </View>
        <TimeDropdown value={time} onChange={setTime} />
        <Field label="Notes" placeholder="Anything worth remembering" value={note} onChangeText={setNote} maxLength={200} multiline />
        {!!error && <Copy style={s.error}>{error}</Copy>}
        <Button busy={saving} onPress={save}>{editing ? "Save changes" : "Add to itinerary"}</Button>
        {editing && (confirmDelete
          ? <Button secondary busy={saving} onPress={() => void remove()}>Confirm delete activity</Button>
          : <Button secondary icon="trash" onPress={() => setConfirmDelete(true)}>Delete activity</Button>)}
      </Sheet>
    </Screen>
  );
}

const expenseIcons: Record<ExpenseCategory, IconName> = {
  Accommodation: "bed",
  "Food & Drinks": "food",
  Transportation: "bus",
  Activities: "sparkle",
  Shopping: "shopping",
};
const expenseTones = ["purple", "orange", "blue", "pink", "blue"] as const;

export function BudgetScreen() {
  const styles = useStyles(stylesSheet);
  const s = useStyles(sharedSheet);
  const p = usePalette();
  const expenseColors = expenseTones.map((tone) => p[tone]);
  const language = useAppLanguage();
  const { trip, expenses, addExpense, updateExpense, removeExpense, updateTrip } = useTravel();
  const [editor, setEditor] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("Food & Drinks");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [budgetEditor, setBudgetEditor] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState("");
  const openEditor = (expense?: Expense) => {
    setEditing(expense || null);
    setLabel(expense?.label || "");
    setAmount(expense ? String(expense.amount) : "");
    setCategory(expense?.category || "Food & Drinks");
    setError("");
    setConfirmDelete(false);
    setEditor(true);
  };
  const save = async () => {
    const value = Number(amount.replace(",", "."));
    if (!Number.isFinite(value) || value < 0.01 || value > 1000000) {
      setError("Enter an amount between €0.01 and €1,000,000.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      // The name is optional; the category is a clear default.
      const expense = { label: label.trim() || translate(category, language), category, amount: Math.round(value * 100) / 100 };
      if (editing) await updateExpense({ ...expense, id: editing.id });
      else await addExpense(expense);
      setEditor(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the expense.");
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    if (!editing) return;
    setSaving(true);
    setError("");
    try {
      await removeExpense(editing.id);
      setEditor(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete the expense.");
    } finally {
      setSaving(false);
    }
  };
  const saveBudget = async () => {
    if (!trip) return;
    const value = Math.round(Number(budgetDraft.replace(",", ".")));
    if (!Number.isFinite(value) || value < 100 || value > 1000000) {
      setError("Enter a budget between €100 and €1,000,000.");
      return;
    }
    setSaving(true);
    setError("");
    try { await updateTrip({ ...trip, budget: value }); setBudgetEditor(false); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not update the budget."); }
    finally { setSaving(false); }
  };
  if (!trip) {
    return (
      <Screen active="itinerary" style={{ gap: 22 }}>
        <Header title="Budget" onBack={() => router.dismissTo("/home" as Href)} />
        <EmptyState title="No trip budget yet" detail="Plan a trip to start tracking expenses." action="Plan a trip" onPress={() => router.push("/planner" as Href)} />
      </Screen>
    );
  }
  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const remaining = trip.budget - total;
  const over = remaining < 0;
  const today = localToday();
  const daysLeft = today > trip.end ? 0 : tripDays(today < trip.start ? trip.start : today, trip.end);
  const byCategory = expenseCategories.map((cat, index) => ({ cat, color: expenseColors[index], spent: expenses.filter((e) => e.category === cat).reduce((sum, e) => sum + e.amount, 0) }))
    .filter((item) => item.spent > 0).sort((a, b) => b.spent - a.spent);
  const categoryIndex = (cat: ExpenseCategory) => expenseCategories.indexOf(cat);
  return (
    <Screen active="itinerary" footer={<Button icon="plus" onPress={() => openEditor()}>Add expense</Button>} style={{ gap: 20 }}>
      <Row style={{ justifyContent: "space-between" }}>
        <IconButton name="back" label="Go back" onPress={() => router.dismissTo("/home" as Href)} />
        <Copy style={{ fontWeight: "700" }}>Budget</Copy>
        <View style={{ width: 44 }} />
      </Row>

      <View style={styles.budgetCard}>
        <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <View style={{ gap: 2 }}>
            <Copy muted style={{ fontSize: 12, fontWeight: "700" }}>SPENT</Copy>
            <Text style={styles.budgetTotal}>{money(total)}</Text>
            <Copy muted style={{ fontSize: 13 }}>{formatMessage("of {budget} budget", { budget: money(trip.budget) }, language)}</Copy>
          </View>
          <Pressable accessibilityRole="button" onPress={() => { setBudgetDraft(String(trip.budget)); setError(""); setBudgetEditor(true); }} style={({ pressed }) => [styles.editBudget, pressed && { backgroundColor: p.blueSoft }]}>
            <Icon name="edit" size={15} color={p.blue} /><Text style={styles.editBudgetText}>{translate("Edit budget", language)}</Text>
          </Pressable>
        </Row>
        <View style={styles.progressTrack}>
          {total > 0 && byCategory.map((item) => <View key={item.cat} style={{ width: `${(item.spent / Math.max(total, trip.budget)) * 100}%`, backgroundColor: item.color }} />)}
        </View>
        <Row style={{ gap: 10 }}>
          <View style={[styles.stat, over && { backgroundColor: p.dangerSoft }]}>
            <Copy muted style={{ fontSize: 11, fontWeight: "700" }}>{over ? "OVER BUDGET" : "REMAINING"}</Copy>
            <Text style={[styles.statValue, { color: over ? p.danger : p.green }]}>{money(Math.abs(remaining))}</Text>
          </View>
          <View style={styles.stat}>
            <Copy muted style={{ fontSize: 11, fontWeight: "700" }}>PER DAY LEFT</Copy>
            <Text style={styles.statValue}>{daysLeft && !over ? money(remaining / daysLeft) : "—"}</Text>
          </View>
        </Row>
      </View>

      {!!byCategory.length && <View style={{ gap: 10 }}>
        <Heading style={{ fontSize: 18, lineHeight: 24 }}>By category</Heading>
        {byCategory.map((item) => <Row key={item.cat} style={{ gap: 11 }}>
          <View style={[styles.categoryIcon, { backgroundColor: `${item.color}18` }]}><Icon name={expenseIcons[item.cat]} size={19} color={item.color} /></View>
          <Copy style={{ flex: 1, fontSize: 14, fontWeight: "600" }}>{item.cat}</Copy>
          <Copy muted style={{ fontSize: 12 }}>{Math.round((item.spent / total) * 100)}%</Copy>
          <Copy style={{ fontWeight: "700", minWidth: 76, textAlign: "right" }}>{money(item.spent)}</Copy>
        </Row>)}
      </View>}

      <View style={{ gap: 4 }}>
        <Heading style={{ fontSize: 18, lineHeight: 24 }}>{formatMessage("Expenses ({count})", { count: expenses.length }, language)}</Heading>
        {[...expenses].reverse().map((expense) => <Pressable key={expense.id} accessibilityRole="button" accessibilityLabel={translateAccessibility(`Edit ${expense.label}`, language)} onPress={() => openEditor(expense)}
          style={({ pressed }) => [styles.expenseRow, pressed && { backgroundColor: p.soft }]}>
          <View style={[styles.categoryIcon, { backgroundColor: `${expenseColors[categoryIndex(expense.category)]}18` }]}><Icon name={expenseIcons[expense.category]} size={19} color={expenseColors[categoryIndex(expense.category)]} /></View>
          <View style={{ flex: 1, minWidth: 0 }}><Copy style={{ fontWeight: "600" }}>{expense.label}</Copy><Copy muted style={{ fontSize: 12 }}>{expense.category}</Copy></View>
          <Copy style={{ fontWeight: "700" }}>{money(expense.amount)}</Copy>
        </Pressable>)}
        {!expenses.length && <View style={styles.emptyDay}>
          <View style={styles.emptyIcon}><Icon name="wallet" size={26} color={p.blue} /></View>
          <Heading style={{ fontSize: 17, lineHeight: 23, textAlign: "center" }}>No expenses yet</Heading>
          <Copy muted style={{ fontSize: 13, textAlign: "center" }}>Add what you spend to see how your trip budget is doing.</Copy>
        </View>}
      </View>

      <Sheet visible={editor} title={editing ? "Edit expense" : "New expense"} onClose={() => setEditor(false)}>
        <View style={styles.amountBox}>
          <Text style={styles.amountCurrency}>€</Text>
          <TextInput accessibilityLabel={translate("Amount (EUR)", language)} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={p.muted} autoFocus={!editing} style={styles.amountInput} />
        </View>
        <View style={styles.categoryGrid}>
          {expenseCategories.map((cat, index) => {
            const selected = category === cat;
            return <Pressable key={cat} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setCategory(cat)}
              style={({ pressed }) => [styles.categoryTile, selected && { borderColor: expenseColors[index], backgroundColor: `${expenseColors[index]}14` }, pressed && { transform: [{ scale: 0.95 }] }]}>
              <Icon name={expenseIcons[cat]} size={21} color={expenseColors[index]} />
              <Text numberOfLines={1} style={styles.categoryLabel}>{translate(cat, language)}</Text>
            </Pressable>;
          })}
        </View>
        <Field label="Name (optional)" placeholder="e.g. Lunch by the sea" value={label} onChangeText={setLabel} maxLength={80} />
        {!!error && <Copy style={s.error}>{error}</Copy>}
        <Button busy={saving} onPress={save}>{editing ? "Save changes" : "Add expense"}</Button>
        {editing && (confirmDelete
          ? <Button secondary busy={saving} onPress={() => void remove()}>Confirm delete expense</Button>
          : <Button secondary icon="trash" onPress={() => setConfirmDelete(true)}>Delete expense</Button>)}
      </Sheet>

      <Sheet visible={budgetEditor} title={translate("Trip budget", language)} onClose={() => setBudgetEditor(false)}>
        <View style={styles.amountBox}>
          <Text style={styles.amountCurrency}>€</Text>
          <TextInput accessibilityLabel={translate("Trip budget", language)} value={budgetDraft} onChangeText={setBudgetDraft} keyboardType="number-pad" style={styles.amountInput} />
        </View>
        <Copy muted style={{ fontSize: 12 }}>Budgets are stored in EUR.</Copy>
        {!!error && <Copy style={s.error}>{error}</Copy>}
        <Button busy={saving} onPress={() => void saveBudget()}>Save budget</Button>
      </Sheet>
    </Screen>
  );
}

const stylesSheet = themedStyles((p) => ({
  dayPill: { width: 62, alignItems: "center", gap: 1, paddingVertical: 9, borderRadius: 16, borderWidth: 1, borderColor: p.line, backgroundColor: p.white },
  dayPillSelected: { backgroundColor: p.blue, borderColor: p.blue },
  dayPillToday: { borderColor: p.blue },
  dayPillLabel: { color: p.muted, fontSize: 10, fontWeight: "700" },
  dayPillDate: { color: p.ink, fontSize: 19, lineHeight: 24, fontWeight: "800" },
  dayPillDot: { width: 5, height: 5, borderRadius: 3, marginTop: 2, backgroundColor: p.blue },
  navigate: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: p.line },
  navigateText: { color: p.blue, fontSize: 13, fontWeight: "700" },
  routeCard: { gap: 6, padding: 13, borderRadius: 14, borderWidth: 1, borderColor: p.blueLine, backgroundColor: p.blueTint },
  routeTitle: { color: p.blue, fontSize: 13, fontWeight: "700" },
  time: { color: p.ink, fontSize: 12, fontWeight: "800", paddingTop: 14 },
  timelineDot: { width: 10, height: 10, borderRadius: 5, marginTop: 6, borderWidth: 2, borderColor: p.blue, backgroundColor: p.white },
  timelineLine: { flex: 1, width: 2, marginTop: 4, borderRadius: 1, backgroundColor: p.blueSoft },
  activity: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10, padding: 13, borderRadius: 14, borderWidth: 1, borderColor: p.line, backgroundColor: p.white },
  activityName: { color: p.ink, fontSize: 15, fontWeight: "700" },
  emptyDay: { alignItems: "center", gap: 7, paddingVertical: 24, paddingHorizontal: 20, borderRadius: 18, borderWidth: 1.5, borderStyle: "dashed", borderColor: p.blueLine, backgroundColor: p.blueTint },
  emptyIcon: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: p.blueSoft, marginBottom: 4 },
  budgetCard: { gap: 16, padding: 18, borderRadius: 22, borderWidth: 1, borderColor: p.line, backgroundColor: p.white,
    shadowColor: p.shadow, shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  budgetTotal: { color: p.ink, fontSize: 34, lineHeight: 41, fontWeight: "800" },
  editBudget: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: p.line },
  editBudgetText: { color: p.blue, fontSize: 12, fontWeight: "700" },
  progressTrack: { height: 12, flexDirection: "row", overflow: "hidden", borderRadius: 6, backgroundColor: p.soft },
  stat: { flex: 1, gap: 3, padding: 12, borderRadius: 14, backgroundColor: p.soft },
  statValue: { color: p.ink, fontSize: 18, fontWeight: "800" },
  categoryIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  expenseRow: { flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 10, paddingHorizontal: 4, borderRadius: 12 },
  amountBox: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 16, backgroundColor: p.soft },
  amountCurrency: { color: p.muted, fontSize: 30, fontWeight: "700" },
  amountInput: { minWidth: 80, color: p.ink, fontSize: 38, fontWeight: "800", textAlign: "center", paddingVertical: 4, outlineWidth: 0 },
  categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  categoryTile: { width: "31.5%", alignItems: "center", gap: 5, paddingVertical: 11, borderRadius: 14, borderWidth: 1.5, borderColor: p.line, backgroundColor: p.white },
  categoryLabel: { color: p.ink, fontSize: 11, fontWeight: "700" },
}));
