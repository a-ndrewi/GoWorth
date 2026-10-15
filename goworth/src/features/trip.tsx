import Slider from "@react-native-community/slider";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { CalendarPicker, TimeDropdown } from "@/components/goworth/date-time-controls";
import {
  Button,
  Chip,
  Copy,
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
  places,
  tripDays,
  validateTrip,
  type Activity,
  type Expense,
  type ExpenseCategory,
  type Trip,
  type RouteStop,
} from "@/data/travel";
import { searchTripCities, searchTripCountries, type TripCountry } from "@/data/trip-geography";
import { countryFlag, usStates } from "@/data/geography";
import { routeStop, routeStopForDay, routeTitle, uniqueRouteStops } from "@/data/trip-route";
import { formatMessage, translate, translateAccessibility } from "@/data/i18n";
import { useAppLanguage } from "@/data/formatting";
import { useTravel } from "@/state/travel-context";
import { mapsRouteUrl, wazeRouteUrl } from "@/utils/trip-place";

export function PlannerScreen() {
  const language = useAppLanguage();
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
    dayDestinations: trip?.dayDestinations,
    routeStops: trip?.routeStops,
  });
  const [routeMode, setRouteMode] = useState(!!trip?.dayDestinations && new Set(trip.dayDestinations).size > 1);
  const [selectingDay, setSelectingDay] = useState<number | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [country, setCountry] = useState<TripCountry | null>(null);
  const [countryQuery, setCountryQuery] = useState("");
  const [stateCode, setStateCode] = useState<string | null>(null);
  const [cityQuery, setCityQuery] = useState("");
  const [listLimit, setListLimit] = useState(40);
  const [dateField, setDateField] = useState<"start" | "end" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const patch = (next: Partial<Trip>) =>
    setDraft((old) => ({ ...old, ...next }));
  const chooseDate = (value: string) => {
    if (dateField === "start") {
      const end = draft.end && (draft.end < value || tripDays(value, draft.end) > 14) ? "" : draft.end;
      patch({ start: value, end, dayDestinations: routeMode && end ? Array.from({ length: tripDays(value, end) }, (_, i) => draft.dayDestinations?.[i] || draft.destinationId) : undefined });
    } else if (dateField === "end") patch({ end: value, dayDestinations: routeMode && draft.start ? Array.from({ length: tripDays(draft.start, value) }, (_, i) => draft.dayDestinations?.[i] || draft.destinationId) : undefined });
  };
  const maxEnd = draft.start
    ? new Date(Date.parse(draft.start) + 13 * 86_400_000).toISOString().slice(0, 10)
    : undefined;
  const openDestinationSelector = (day: number | null) => {
    setCountry(null);
    setCountryQuery("");
    setStateCode(null);
    setCityQuery("");
    setListLimit(40);
    setSelectingDay(day);
    setSelecting(true);
  };
  const countryResults = !country ? searchTripCountries(countryQuery, listLimit + 1) : [];
  const stateResults = country?.code === "US" && !stateCode
    ? usStates.filter((state) => state.name.toLocaleLowerCase().includes(cityQuery.trim().toLocaleLowerCase())).slice(0, listLimit + 1)
    : [];
  const cityResults = country && (country.code !== "US" || stateCode)
    ? searchTripCities(cityQuery, country, listLimit + 1, stateCode ?? undefined)
    : [];
  const chooseStop = (stop: RouteStop) => {
    const count = draft.start && draft.end ? tripDays(draft.start, draft.end) : 0;
    const oldStart = draft.destinationId;
    const nextDays = routeMode && count ? Array.from({ length: count }, (_, i) =>
      selectingDay === null || selectingDay === 0
        ? i === 0 || (draft.dayDestinations?.[i] || oldStart) === oldStart ? stop.id : draft.dayDestinations![i]
        : i === selectingDay ? stop.id : draft.dayDestinations?.[i] || oldStart) : undefined;
    const nextId = selectingDay === null || selectingDay === 0 ? stop.id : oldStart;
    const usedIds = new Set(nextDays || [nextId]);
    const nextStops = [...usedIds].map((id) => id === stop.id ? stop : routeStop(draft, id));
    patch({ destinationId: nextId, dayDestinations: nextDays, routeStops: nextStops });
    setSelecting(false); setSelectingDay(null);
  };
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
      <Row style={{ gap: 8 }}>
        <Chip selected={!routeMode} onPress={() => { setRouteMode(false); patch({ dayDestinations: undefined, routeStops: draft.routeStops?.filter((stop) => stop.id === draft.destinationId) }); }}>One city</Chip>
        <Chip selected={routeMode} onPress={() => {
          setRouteMode(true);
          if (draft.start && draft.end) patch({ dayDestinations: Array.from({ length: tripDays(draft.start, draft.end) }, (_, i) => draft.dayDestinations?.[i] || draft.destinationId) });
        }}>Multi-city route</Chip>
      </Row>
      <View style={{ gap: 7 }}>
        <Copy style={s.label}>{routeMode ? "Starting city" : "Destination"}</Copy>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={translate("Choose destination", language)}
          onPress={() => openDestinationSelector(null)}
          style={[s.input, s.row, { justifyContent: "space-between" }]}
        >
          <Copy style={{ fontSize: 14 }}>
            {routeStop(draft).name},{" "}
            {routeStop(draft).country}
          </Copy>
          <Icon name="pin" size={19} color={p.blue} />
        </Pressable>
      </View>
      <Row style={{ alignItems: "flex-start", gap: 8 }}>
        {(["start", "end"] as const).map((field) => <View key={field} style={{ flex: 1, gap: 7 }}>
          <Copy style={s.label}>{field === "start" ? "Departure" : "Return"}</Copy>
          <Pressable accessibilityRole="button" accessibilityLabel={translate(field === "start" ? "Choose departure date" : "Choose return date", language)}
            onPress={() => setDateField(field)} style={[s.input, s.row, { justifyContent: "space-between", minHeight: 48, paddingHorizontal: 9, gap: 4 }]}>
            <Copy style={{ fontSize: 13, flexShrink: 1 }}>{draft[field] ? new Date(`${draft[field]}T12:00:00Z`).toLocaleDateString(language === "ro" ? "ro-RO" : "en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "Select date"}</Copy>
            <Icon name="calendar" size={18} color={p.blue} />
          </Pressable>
        </View>)}
      </Row>
      {!!draft.start && !!draft.end && <Copy muted style={{ fontSize: 12 }}>{routeMode ? formatMessage("{days} days · Choose a city for each day", { days: tripDays(draft.start, draft.end) }, language) : formatMessage("{days} days · In {city}", { days: tripDays(draft.start, draft.end), city: routeStop(draft).name }, language)}</Copy>}
      {routeMode && !!draft.start && !!draft.end && <View style={{ gap: 7 }}>
        <Copy style={s.label}>Route by day</Copy>
        {Array.from({ length: tripDays(draft.start, draft.end) }, (_, index) => <Pressable key={index} accessibilityRole="button" onPress={() => openDestinationSelector(index)} style={[s.input, s.row, { justifyContent: "space-between" }]}>
          <Copy>Day {index + 1} · {routeStopForDay(draft, index + 1).name}, {routeStopForDay(draft, index + 1).country}</Copy><Icon name="right" size={17} color={p.blue} />
        </Pressable>)}
      </View>}
      <View style={{ gap: 11 }}>
        <Row style={{ justifyContent: "space-between" }}>
          <Copy style={s.label}>Budget (per person)</Copy>
          <Copy style={{ fontWeight: "600", color: p.blue }}>
            {money(draft.budget)}
          </Copy>
        </Row>
        <Slider
          accessibilityLabel={translate("Trip budget", language)}
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
            {money(500)}
          </Copy>
          <Copy muted style={{ fontSize: 12 }}>
            {money(10000)}
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
        title={!country ? translate("Country", language) : country.code === "US" && !stateCode ? translate("State", language) : selectingDay === null ? translate("Starting city", language) : formatMessage("City for day {day}", { day: selectingDay + 1 }, language)}
        onClose={() => { setSelecting(false); setSelectingDay(null); }}
      >
        {country && <Button secondary icon="back" onPress={() => { if (stateCode) { setStateCode(null); setCityQuery(""); } else { setCountry(null); setCountryQuery(""); } setListLimit(40); }}>{translate(stateCode ? "All states" : "All countries", language)}</Button>}
        {!country && <>
          <Field label="Country" placeholder="Search a country" value={countryQuery} onChangeText={(value) => { setCountryQuery(value); setListLimit(40); }} />
          {countryResults.slice(0, listLimit).map((item) => <Pressable key={item.code} accessibilityRole="button" onPress={() => { setCountry(item); setStateCode(null); setCityQuery(""); setListLimit(40); }} style={[s.row, { paddingVertical: 10, gap: 10 }]}><Copy style={{ fontSize: 23 }}>{countryFlag(item.code)}</Copy><Copy style={{ flex: 1 }}>{translate(item.name, language)}</Copy><Icon name="right" color={p.muted} /></Pressable>)}
          {!countryResults.length && <Copy muted>{translate("No countries found. Try another name.", language)}</Copy>}
          {countryResults.length > listLimit && <Button secondary icon="plus" onPress={() => setListLimit((limit) => limit + 40)}>{translate("Show more countries", language)}</Button>}
        </>}
        {country?.code === "US" && !stateCode && <>
          <Field label="State" placeholder="Search states" value={cityQuery} onChangeText={(value) => { setCityQuery(value); setListLimit(40); }} />
          {stateResults.slice(0, listLimit).map((state) => <Pressable key={state.code} accessibilityRole="button" onPress={() => { setStateCode(state.code); setCityQuery(""); setListLimit(40); }} style={[s.row, { paddingVertical: 10, gap: 10 }]}><Icon name="map" color={p.green} /><Copy style={{ flex: 1 }}>{state.name}</Copy><Copy muted>{state.cityCount}</Copy><Icon name="right" color={p.muted} /></Pressable>)}
          {!stateResults.length && <Copy muted>{translate("No states found", language)}</Copy>}
          {stateResults.length > listLimit && <Button secondary icon="plus" onPress={() => setListLimit((limit) => limit + 40)}>{translate("Show more states", language)}</Button>}
        </>}
        {country && (country.code !== "US" || stateCode) && <>
          <Field label={formatMessage("City in {country}", { country: translate(country.name, language) }, language)} placeholder="Search a city or town" value={cityQuery} onChangeText={(value) => { setCityQuery(value); setListLimit(40); }} />
          {cityResults.slice(0, listLimit).map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={formatMessage("Choose {city}, {country}", { city: item.name, country: translate(item.country, language) }, language)} onPress={() => chooseStop(item)} style={[s.row, { paddingVertical: 10, gap: 10 }]}><Icon name="pin" color={p.green} /><View style={{ flex: 1 }}><Copy style={{ fontWeight: "600" }}>{item.name}</Copy><Copy muted style={{ fontSize: 12 }}>{stateCode ? `${usStates.find((state) => state.code === stateCode)?.name}, ` : ""}{translate(item.country, language)}</Copy></View><Icon name="right" color={p.muted} /></Pressable>)}
          {!cityResults.length && <Copy muted>{translate("No cities found in this country. Try another name.", language)}</Copy>}
          {cityResults.length > listLimit && <Button secondary icon="plus" onPress={() => setListLimit((limit) => limit + 40)}>{translate("Show more cities", language)}</Button>}
        </>}
      </Sheet>
      <CalendarPicker key={dateField ?? "closed"} visible={!!dateField} title={dateField === "end" ? "Return date" : "Departure date"}
        value={dateField ? draft[dateField] : ""} minDate={dateField === "end" ? draft.start || undefined : undefined}
        maxDate={dateField === "end" ? maxEnd : undefined} onSelect={chooseDate} onClose={() => setDateField(null)} />
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
  const language = useAppLanguage();
  const { trip, activities, externalPlaces, addActivity, updateActivity, removeActivity } = useTravel();
  const [selectedDay, setDay] = useState(1);
  const [editing, setEditing] = useState<Activity | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [time, setTime] = useState("16:00");
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
  const destination = routeStop(trip);
  const days = tripDays(trip.start, trip.end);
  const day = Math.min(selectedDay, days);
  const dayCity = routeStopForDay(trip, day);
  const routeStops = uniqueRouteStops(trip);
  const routeIds = routeStops.map((stop) => stop.id);
  const routePins = routeStops;
  const openEditor = (activity?: Activity) => {
    setEditing(activity || null);
    setName(activity?.name || "");
    setNote(activity?.note || "");
    setTime(activity?.time || "16:00");
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
                pathname: destinations.some((item) => item.id === trip.destinationId) ? "/trip" : "/map",
                params: destinations.some((item) => item.id === trip.destinationId)
                  ? { id: trip.destinationId }
                  : { lat: String(destination.latitude), lon: String(destination.longitude), name: destination.name },
              } as Href),
          },
          { label: "Places", icon: "pin", action: () => router.push(destinations.some((item) => item.id === dayCity.id)
            ? { pathname: "/explore", params: { id: dayCity.id } } as Href
            : { pathname: "/map", params: { lat: String(dayCity.latitude), lon: String(dayCity.longitude), name: dayCity.name } } as Href) },
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
          accessibilityLabel={translate(item.label, language)}
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
        title={routeTitle(trip)}
        subtitle={formatMessage("{days} Days · {start} - {end}", { days, start: dateLabel(trip.start), end: dateLabel(trip.end) }, language)}
        right={
          <IconButton
            name="plus"
            label="Add activity"
            color={p.blue}
            onPress={() => openEditor()}
          />
        }
      />
      {routeIds.length > 1 && <View style={{ gap: 8 }}>
        <Copy style={s.label}>City route</Copy>
        <Copy muted>{routeStops.map((stop) => `${stop.name}, ${stop.country}`).join(" → ")}</Copy>
        {Array.from({ length: Math.ceil((routePins.length - 1) / 3) }, (_, index) => {
          const url = mapsRouteUrl(routePins.slice(index * 3, index * 3 + 4));
          return url && <Button key={index} secondary icon="map" onPress={() => void Linking.openURL(url)}>{formatMessage("Google Maps · leg {leg}", { leg: index + 1 }, language)}</Button>;
        })}
        <Button secondary icon="map" onPress={() => void Linking.openURL(wazeRouteUrl(routePins[Math.min(routePins.length - 1, Math.max(1, routeIds.indexOf(dayCity.id)))]))}>Waze · next city</Button>
      </View>}
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
      {routeIds.length > 1 && <Copy muted>Day {day} · {dayCity.name}, {dayCity.country}</Copy>}
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
              .map((activity) => {
                const externalPlace = externalPlaces.find((place) => activity.note.includes(place.sourceUrl));
                const catalogPlace = places.find((place) => place.destinationId === dayCity.id && (place.id === activity.placeId || place.name === activity.name));
                return <Row key={activity.id} style={{ alignItems: "center", gap: 6 }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={translateAccessibility(`Edit ${activity.name}`, language)}
                    onPress={() => openEditor(activity)}
                    style={[s.row, { flex: 1, minWidth: 0, alignItems: "flex-start", gap: 12 }]}
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
                  {(externalPlace || catalogPlace) && <IconButton name="map" label={`Open ${activity.name} on map`} onPress={() => router.push(externalPlace
                    ? { pathname: "/map", params: { external: externalPlace.id } } as Href
                    : { pathname: "/map", params: { destination: dayCity.id, place: catalogPlace!.id } } as Href)} />}
                </Row>;
              })}
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
      <Button secondary icon="pin" onPress={() => router.push({ pathname: "/explore", params: { id: dayCity.id } } as Href)}>
        {formatMessage("Explore places in {city}", { city: dayCity.name }, language)}
      </Button>
      <Sheet
        visible={showEditor}
        title={editing ? "Edit activity" : formatMessage("Add to Day {day}", { day }, language)}
        onClose={() => setShowEditor(false)}
      >
        <Field
          label="Activity"
          placeholder="What would you like to do?"
          value={name}
          onChangeText={setName}
          maxLength={90}
        />
        <TimeDropdown value={time} onChange={setTime} />
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
  const language = useAppLanguage();
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
        subtitle={`${routeStop(trip).country} · ${dateLabel(trip.start)} - ${dateLabel(trip.end)}`}
      />
      <View
        accessibilityLabel={formatMessage("{spent} spent of {budget} budget", { spent: money(total), budget: money(trip.budget) }, language)}
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
          label="Amount (EUR)"
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
