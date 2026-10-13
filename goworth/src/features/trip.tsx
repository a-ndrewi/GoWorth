import Slider from "@react-native-community/slider";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import {
  Button,
  Chip,
  Copy,
  DestinationPhoto,
  EmptyState,
  Field,
  Header,
  Heading,
  Icon,
  IconButton,
  Row,
  Screen,
  Sheet,
  s,
  type IconName,
} from "@/components/goworth/ui";
import { palette as p } from "@/constants/design";
import {
  dateLabel,
  destinations,
  expenseCategories,
  findDestination,
  interests,
  money,
  tripDays,
  validateTrip,
  type Activity,
  type Expense,
  type ExpenseCategory,
  type Trip,
} from "@/data/travel";
import { useTravel } from "@/state/travel-context";

export function PlannerScreen() {
  const params = useLocalSearchParams<{ destination?: string }>();
  const { trip, preferences, generateTrip } = useTravel();
  const [draft, setDraft] = useState<Trip>({
    destinationId: params.destination
      ? findDestination(params.destination).id
      : trip?.destinationId || destinations[0].id,
    start: trip?.start || "",
    end: trip?.end || "",
    companions: trip?.companions || "Solo",
    budget: preferences.budget,
    interests: preferences.interests,
  });
  const [selecting, setSelecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const patch = (next: Partial<Trip>) =>
    setDraft((old) => ({ ...old, ...next }));
  const generate = async () => {
    const validation = validateTrip(draft);
    if (validation) {
      setError(validation);
      return;
    }
    setError("");
    if (trip) {
      setConfirmReplace(true);
      return;
    }
    await saveTrip();
  };
  const saveTrip = async () => {
    setBusy(true);
    try {
      await generateTrip(draft);
      router.replace("/itinerary" as Href);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save your trip. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen active="planner" style={{ gap: 20 }}>
      <Row style={{ justifyContent: "space-between" }}>
        <IconButton
          name="back"
          label="Back to Explore"
          onPress={() => router.navigate("/home" as Href)}
        />
        <IconButton
          name="more"
          label="Planner information"
          onPress={() => setInfo(true)}
        />
      </Row>
      <View style={{ gap: 8 }}>
        <Heading>Plan your trip</Heading>
        <Copy muted>
          Choose where and when to go. Build your itinerary from real places.
        </Copy>
      </View>
      <View style={{ gap: 7 }}>
        <Copy style={s.label}>Destination</Copy>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose destination"
          onPress={() => setSelecting(true)}
          style={[s.input, s.row, { justifyContent: "space-between" }]}
        >
          <Copy style={{ fontSize: 14 }}>
            {findDestination(draft.destinationId).name},{" "}
            {findDestination(draft.destinationId).country}
          </Copy>
          <Icon name="pin" size={19} color={p.blue} />
        </Pressable>
      </View>
      <Row style={{ alignItems: "flex-start" }}>
        <Field
          label="Departure"
          placeholder="YYYY-MM-DD"
          value={draft.start}
          onChangeText={(start) => patch({ start })}
          autoCapitalize="none"
          maxLength={10}
        />
        <Field
          label="Return"
          placeholder="YYYY-MM-DD"
          value={draft.end}
          onChangeText={(end) => patch({ end })}
          autoCapitalize="none"
          maxLength={10}
        />
      </Row>
      <View style={{ gap: 11 }}>
        <Row style={{ justifyContent: "space-between" }}>
          <Copy style={s.label}>Budget (per person)</Copy>
          <Copy style={{ fontWeight: "600", color: p.blue }}>
            {money(draft.budget)}
          </Copy>
        </Row>
        <Slider
          accessibilityLabel="Trip budget"
          minimumValue={500}
          maximumValue={10000}
          step={100}
          value={draft.budget}
          onValueChange={(budget) => patch({ budget })}
          minimumTrackTintColor={p.blue}
          maximumTrackTintColor={p.line}
          thumbTintColor={p.blue}
        />
        <Row style={{ justifyContent: "space-between" }}>
          <Copy muted style={{ fontSize: 12 }}>
            $500
          </Copy>
          <Copy muted style={{ fontSize: 12 }}>
            $10,000
          </Copy>
        </Row>
      </View>
      <View style={{ gap: 10 }}>
        <Copy style={s.label}>Travel companions</Copy>
        <Row>
          {["Solo", "Couple", "Friends", "Family"].map((companions) => (
            <Chip
              key={companions}
              selected={draft.companions === companions}
              onPress={() => patch({ companions })}
              style={{ flex: 1, paddingHorizontal: 5 }}
            >
              {companions}
            </Chip>
          ))}
        </Row>
      </View>
      <View style={{ gap: 10 }}>
        <Copy style={s.label}>Interests</Copy>
        <View style={[s.grid, { gap: 8 }]}>
          {interests.slice(0, 7).map((interest) => (
            <Chip
              key={interest}
              tint={p.greenSoft}
              selected={draft.interests.includes(interest)}
              onPress={() =>
                patch({
                  interests: draft.interests.includes(interest)
                    ? draft.interests.filter((x) => x !== interest)
                    : [...draft.interests, interest],
                })
              }
            >
              {interest}
            </Chip>
          ))}
        </View>
      </View>
      {!!error && <Copy style={s.error}>{error}</Copy>}
      <Button icon="plus" busy={busy} onPress={generate}>
        {busy ? "Saving your trip..." : "Create Trip"}
      </Button>
      <Sheet
        visible={selecting}
        title="Where are we going?"
        onClose={() => setSelecting(false)}
      >
        {destinations.map((d) => (
          <Pressable
            key={d.id}
            accessibilityRole="button"
            accessibilityLabel={`Choose ${d.name}`}
            onPress={() => {
              patch({ destinationId: d.id });
              setSelecting(false);
            }}
            style={[s.row, { paddingVertical: 5 }]}
          >
            <DestinationPhoto destination={d} style={{ width: 65, height: 58, borderRadius: 6 }} />
            <View style={{ flex: 1 }}>
              <Copy style={{ fontWeight: "600" }}>{d.name}</Copy>
              <Copy muted style={{ fontSize: 12 }}>
                {d.country}
              </Copy>
            </View>
            {draft.destinationId === d.id && (
              <Icon name="check" color={p.blue} />
            )}
          </Pressable>
        ))}
      </Sheet>
      <Sheet
        visible={info}
        title="Your travel plan"
        onClose={() => setInfo(false)}
      >
        <Copy muted>
          Creating a trip replaces your current itinerary and expense list. Add
          places and activities after you save. No reservations or payments are made.
        </Copy>
        {!!trip && <Button
          secondary
          onPress={() => {
            setInfo(false);
            router.push("/itinerary" as Href);
          }}
        >
          View current itinerary
        </Button>}
      </Sheet>
      <Sheet
        visible={confirmReplace}
        title="Replace current trip?"
        onClose={() => setConfirmReplace(false)}
      >
        <Copy muted>Your current trip will move into your journal with its itinerary, expenses, saved places, and note. You can still review it there.</Copy>
        {!!error && <Copy style={s.error}>{error}</Copy>}
        <Button busy={busy} onPress={() => void saveTrip()}>Replace trip</Button>
        <Button secondary onPress={() => setConfirmReplace(false)}>Keep current trip</Button>
      </Sheet>
    </Screen>
  );
}

export function ItineraryScreen() {
  const { trip, activities, addActivity, updateActivity, removeActivity } = useTravel();
  const [selectedDay, setDay] = useState(1);
  const [editing, setEditing] = useState<Activity | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [time, setTime] = useState("16:00");
  const [period, setPeriod] = useState<Activity["period"]>("Afternoon");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (!trip) {
    return (
      <Screen style={{ gap: 22 }}>
        <Header title="My itinerary" />
        <EmptyState title="Your first trip starts here" detail="Plan a destination to build your itinerary." action="Plan a trip" onPress={() => router.push("/planner" as Href)} />
      </Screen>
    );
  }
  const destination = findDestination(trip.destinationId);
  const days = tripDays(trip.start, trip.end);
  const day = Math.min(selectedDay, days);
  const openEditor = (activity?: Activity) => {
    setEditing(activity || null);
    setName(activity?.name || "");
    setNote(activity?.note || "");
    setTime(activity?.time || "16:00");
    setPeriod(activity?.period || "Afternoon");
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
      day,
      period,
      time,
      name: name.trim(),
      note: note.trim(),
    };
    setSaving(true);
    setError("");
    try {
      if (editing) await updateActivity({ ...activity, id: editing.id });
      else await addActivity(activity);
      setShowEditor(false);
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
  const today = activities
    .filter((a) => a.day === day)
    .sort((a, b) => a.time.localeCompare(b.time));
  const footer = (
    <Row style={{ justifyContent: "space-around" }}>
      {(
        [
          {
            label: "Overview",
            icon: "bag",
            action: () =>
              router.push({
                pathname: "/trip",
                params: { id: trip.destinationId },
              } as Href),
          },
          { label: "Places", icon: "pin", action: () => router.push({ pathname: "/explore", params: { id: trip.destinationId } } as Href) },
          {
            label: "Budget",
            icon: "wallet",
            action: () => router.push("/budget" as Href),
          },
        ] as { label: string; icon: IconName; action: () => void }[]
      ).map((item) => (
        <Pressable
          key={item.label}
          accessibilityRole="button"
          accessibilityLabel={item.label}
          onPress={item.action}
          style={{ alignItems: "center", gap: 5, flex: 1, minHeight: 44 }}
        >
          <Icon name={item.icon} size={20} color={p.muted} />
          <Copy muted style={{ fontSize: 10 }}>
            {item.label}
          </Copy>
        </Pressable>
      ))}
    </Row>
  );
  return (
    <Screen footer={footer} style={{ gap: 20 }}>
      <Header
        title={destination.name}
        subtitle={`${days} Days · ${dateLabel(trip.start)} - ${dateLabel(trip.end)}`}
        right={
          <IconButton
            name="plus"
            label="Add activity"
            color={p.blue}
            onPress={() => openEditor()}
          />
        }
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ gap: 9 }}
      >
        {Array.from({ length: days }, (_, i) => (
          <Chip key={i} selected={day === i + 1} onPress={() => setDay(i + 1)}>
            Day {i + 1}
          </Chip>
        ))}
      </ScrollView>
      {(["Morning", "Afternoon", "Evening"] as const).map((section) => (
        <View key={section} style={{ gap: 15 }}>
          <Row>
            <View
              style={[
                styles.dot,
                { borderColor: section === "Evening" ? p.pink : p.blue },
              ]}
            />
            <Copy style={{ fontWeight: "600" }}>{section}</Copy>
          </Row>
          <View
            style={{
              borderLeftWidth: 1.5,
              borderColor: p.blueSoft,
              marginLeft: 5,
              paddingLeft: 15,
              gap: 14,
            }}
          >
            {today
              .filter((a) => a.period === section)
              .map((activity) => (
                <Pressable
                  key={activity.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${activity.name}`}
                  onPress={() => openEditor(activity)}
                  style={[s.row, { alignItems: "flex-start", gap: 12 }]}
                >
                  <Copy
                    muted
                    style={{ width: 46, fontSize: 11, paddingTop: 15 }}
                  >
                    {activity.time}
                  </Copy>
                  <View
                    style={{
                      flex: 1,
                      borderWidth: 1,
                      borderColor: p.line,
                      borderRadius: 13,
                      padding: 13,
                      gap: 4,
                    }}
                  >
                    <Copy style={{ fontSize: 13, fontWeight: "600" }}>
                      {activity.name}
                    </Copy>
                    {!!activity.note && (
                      <Copy muted style={{ fontSize: 11, lineHeight: 17 }}>
                        {activity.note}
                      </Copy>
                    )}
                  </View>
                </Pressable>
              ))}
            {!today.some((a) => a.period === section) && (
              <Copy muted style={{ fontSize: 12, paddingVertical: 10 }}>
                A little room for spontaneity.
              </Copy>
            )}
          </View>
        </View>
      ))}
      <Button secondary icon="plus" onPress={() => openEditor()}>
        Add Activity
      </Button>
      <Button secondary icon="pin" onPress={() => router.push({ pathname: "/explore", params: { id: trip.destinationId } } as Href)}>
        Explore places in {destination.name}
      </Button>
      <Sheet
        visible={showEditor}
        title={editing ? "Edit activity" : `Add to Day ${day}`}
        onClose={() => setShowEditor(false)}
      >
        <Field
          label="Activity"
          placeholder="What would you like to do?"
          value={name}
          onChangeText={setName}
          maxLength={90}
        />
        <Field
          label="Time"
          value={time}
          onChangeText={setTime}
          placeholder="HH:MM"
          maxLength={5}
        />
        <Row>
          {(["Morning", "Afternoon", "Evening"] as const).map((v) => (
            <Chip
              key={v}
              selected={period === v}
              onPress={() => setPeriod(v)}
              style={{ flex: 1, paddingHorizontal: 5 }}
            >
              {v}
            </Chip>
          ))}
        </Row>
        <Field
          label="Notes"
          placeholder="Anything worth remembering"
          value={note}
          onChangeText={setNote}
          maxLength={200}
          multiline
        />
        {!!error && <Copy style={s.error}>{error}</Copy>}
        <Button busy={saving} onPress={save}>Save Activity</Button>
        {editing && (confirmDelete
          ? <Button secondary busy={saving} onPress={() => void remove()}>Confirm delete activity</Button>
          : <Button secondary onPress={() => setConfirmDelete(true)}>Delete activity</Button>)}
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
const expenseColors = [p.purple, p.orange, p.blue, p.pink, p.blue];

export function BudgetScreen() {
  const { trip, expenses, addExpense, updateExpense, removeExpense } = useTravel();
  const [editor, setEditor] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("Food & Drinks");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<ExpenseCategory | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const openEditor = (expense?: Expense) => {
    setEditing(expense || null);
    setLabel(expense?.label || "");
    setAmount(expense ? String(expense.amount) : "");
    setCategory(expense?.category || "Food & Drinks");
    setError("");
    setConfirmDelete(false);
    setDetail(null);
    setEditor(true);
  };
  const save = async () => {
    const value = Number(amount.replace(",", "."));
    if (!label.trim()) {
      setError("Give this expense a name.");
      return;
    }
    if (!Number.isFinite(value) || value < 0.01 || value > 1000000) {
      setError("Enter an amount between $0.01 and $1,000,000.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const expense = {
        label: label.trim(),
        category,
        amount: Math.round(value * 100) / 100,
      };
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
  if (!trip) {
    return (
      <Screen style={{ gap: 22 }}>
        <Header title="Trip budget" />
        <EmptyState
          title="No trip budget yet"
          detail="Plan a trip to start tracking expenses."
          action="Plan a trip"
          onPress={() => router.push("/planner" as Href)}
        />
      </Screen>
    );
  }
  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const fraction = total / trip.budget;
  const remaining = trip.budget - total;
  return (
    <Screen
      style={{ gap: 22 }}
      footer={
        <Button icon="plus" onPress={() => openEditor()}>
          Add Expense
        </Button>
      }
    >
      <Header
        title="Trip Budget"
        subtitle={`${findDestination(trip.destinationId).country} · ${dateLabel(trip.start)} - ${dateLabel(trip.end)}`}
      />
      <View
        accessibilityLabel={`${money(total)} spent of ${money(trip.budget)} budget`}
        style={{
          width: 208,
          height: 208,
          alignSelf: "center",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Svg width={208} height={208} style={StyleSheet.absoluteFill}>
          <Circle
            cx={104}
            cy={104}
            r={87}
            stroke={p.line}
            strokeWidth={14}
            fill="none"
          />
          <Circle
            cx={104}
            cy={104}
            r={87}
            stroke={remaining < 0 ? p.danger : p.blue}
            strokeWidth={14}
            fill="none"
            strokeDasharray={`${Math.min(fraction, 1) * 546.637} 546.637`}
            strokeLinecap="round"
            transform="rotate(90 104 104)"
          />
        </Svg>
        <Heading style={{ fontSize: 32, lineHeight: 39 }}>
          {money(total)}
        </Heading>
        <Copy muted>of {money(trip.budget)}</Copy>
        <Copy style={{ color: p.muted, marginTop: 12 }}>
          {Math.round(fraction * 100)}%
        </Copy>
      </View>
      <View style={{ gap: 22 }}>
        {expenseCategories.map((cat, i) => {
          const spent = expenses
            .filter((e) => e.category === cat)
            .reduce((sum, e) => sum + e.amount, 0);
          return (
            <Pressable
              key={cat}
              accessibilityRole="button"
              accessibilityLabel={`${cat}: ${money(spent)}`}
              onPress={() => setDetail(cat)}
              style={[s.row, { gap: 12 }]}
            >
              <View
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 21,
                  backgroundColor: `${expenseColors[i]}14`,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon
                  name={expenseIcons[cat]}
                  size={21}
                  color={expenseColors[i]}
                />
              </View>
              <View style={{ flex: 1, gap: 8 }}>
                <Row style={{ justifyContent: "space-between", gap: 4 }}>
                  <Copy style={{ fontSize: 12, fontWeight: "500" }}>{cat}</Copy>
                  <Copy style={{ fontSize: 12, fontWeight: "600" }}>
                    {money(spent)}
                  </Copy>
                </Row>
                <View
                  style={{
                    height: 7,
                    backgroundColor: p.line,
                    borderRadius: 4,
                    overflow: "hidden",
                  }}
                >
                  <View
                    style={{
                      height: 7,
                      width: `${Math.min((spent / trip.budget) * 100, 100)}%`,
                      backgroundColor: p.green,
                      borderRadius: 4,
                    }}
                  />
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
      <Row
        style={{
          backgroundColor: remaining < 0 ? "#FFF0F2" : p.greenSoft,
          borderRadius: 15,
          padding: 16,
        }}
      >
        <Icon
          name={remaining < 0 ? "wallet" : "leaf"}
          color={remaining < 0 ? p.danger : p.green}
          size={29}
        />
        <View>
          <Copy style={{ fontWeight: "600", fontSize: 14 }}>
            {remaining < 0 ? "Over your planned budget" : "You're on track!"}
          </Copy>
          <Copy muted style={{ fontSize: 12 }}>
            {money(Math.abs(remaining))}{" "}
            {remaining < 0 ? "over budget" : "remaining"}
          </Copy>
          <Copy muted style={{ fontSize: 12 }}>
            {remaining < 0
              ? "A good moment to review your spending."
              : "Keep exploring."}
          </Copy>
        </View>
      </Row>
      <Sheet
        visible={editor}
        title={editing ? "Edit expense" : "Add an expense"}
        onClose={() => setEditor(false)}
      >
        <Field
          label="Expense name"
          placeholder="e.g. Lunch by the sea"
          value={label}
          onChangeText={setLabel}
          maxLength={80}
        />
        <Field
          label="Amount (USD)"
          placeholder="0.00"
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={setAmount}
        />
        <View style={[s.grid, { gap: 8 }]}>
          {expenseCategories.map((cat) => (
            <Chip
              key={cat}
              selected={category === cat}
              onPress={() => setCategory(cat)}
            >
              {cat}
            </Chip>
          ))}
        </View>
        {!!error && <Copy style={s.error}>{error}</Copy>}
        <Button busy={saving} onPress={save}>Save Expense</Button>
        {editing && (confirmDelete
          ? <Button secondary busy={saving} onPress={() => void remove()}>Confirm delete expense</Button>
          : <Button secondary onPress={() => setConfirmDelete(true)}>Delete expense</Button>)}
      </Sheet>
      <Sheet
        visible={!!detail}
        title={detail || ""}
        onClose={() => setDetail(null)}
      >
        {expenses
          .filter((e) => e.category === detail)
          .map((e) => (
            <Pressable key={e.id} accessibilityRole="button" accessibilityLabel={`Edit ${e.label}`} onPress={() => openEditor(e)} style={[s.row, { justifyContent: "space-between", paddingVertical: 9 }]}>
              <Copy style={{ flex: 1 }}>{e.label}</Copy>
              <Copy style={{ fontWeight: "600" }}>{money(e.amount)}</Copy>
              <Icon name="right" size={17} color={p.muted} />
            </Pressable>
          ))}
        {!expenses.some((e) => e.category === detail) && (
          <EmptyState
            title="Nothing spent yet"
            detail="Your expenses in this category will appear here."
          />
        )}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  dot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 2,
    backgroundColor: "white",
  },
});
