import Slider from "@react-native-community/slider";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useDeferredValue, useMemo, useRef, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputInstance } from "react-native";
import Animated, { Easing, FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";

import { DateRangePicker } from "@/components/goworth/date-time-controls";
import { Button, Copy, DestinationPhoto, Heading, Icon, IconButton, Row, Screen, Sheet, sharedSheet, type IconName } from "@/components/goworth/ui";
import { themedStyles } from "@/constants/design";
import { usePalette, useStyles } from "@/state/theme-context";
import { destinations, interests, money, tripDays, validateTrip, type RouteStop, type Trip } from "@/data/travel";
import { cityForId, countries, countryFlag, countryForCode, searchCities, usStates } from "@/data/geography";
import { normalizeSearchText } from "@/utils/search";
import { routeStop, routeTitle } from "@/data/trip-route";
import { formatMessage, translate } from "@/data/i18n";
import { useAppLanguage } from "@/data/formatting";
import { useTravel } from "@/state/travel-context";
import { adjustStopDays, citiesForDay, dayCitiesFromStops, splitDays, stopsFromDayCities } from "@/utils/trip";
import { isFreeLimitFailure, SyncFailure } from "@/utils/sync-error";

// Quiet, overshoot-free movement so adding several cities quickly never makes the page bounce.
const gentleLayout = LinearTransition.duration(220).easing(Easing.out(Easing.quad));
const MAX_DAYS = 14;
const MAX_STOPS = 10;
const companions: { value: string; icon: IconName }[] = [
  { value: "Solo", icon: "person" },
  { value: "Couple", icon: "heart" },
  { value: "Friends", icon: "people" },
  { value: "Family", icon: "home" },
];

const localToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

/** A route stop for a city id from the world index, or for a curated destination id. */
function stopFromParams(params: { destination?: string; country?: string; city?: string; stopId?: string; stopName?: string; stopCountry?: string; stopLatitude?: string; stopLongitude?: string }): RouteStop | null {
  const city = cityForId(params.country ?? "", params.city ?? "");
  const country = countryForCode(city?.countryCode);
  if (city && country) return { id: city.id, name: city.name, country: country.name, countryCode: country.code, latitude: city.latitude, longitude: city.longitude };
  const latitude = Number(params.stopLatitude), longitude = Number(params.stopLongitude);
  if (params.stopId && params.stopName && params.stopCountry && Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
    return { id: params.stopId, name: params.stopName, country: params.stopCountry, countryCode: "", latitude, longitude };
  }
  if (params.destination && destinations.some((item) => item.id === params.destination)) return withCountryCode(routeStop({ destinationId: params.destination }));
  return null;
}

function Step({ number, title, hint, done, children }: { number: number; title: string; hint?: string; done: boolean; children: ReactNode }) {
  const styles = useStyles(stylesSheet);
  const p = usePalette();
  return <Animated.View layout={gentleLayout} style={styles.step}>
    <Row style={{ gap: 11, alignItems: "flex-start" }}>
      <View style={[styles.stepBadge, done && styles.stepBadgeDone]}>
        {done ? <Animated.View entering={FadeIn.duration(180)}><Icon name="tick" size={15} color={p.onColor} /></Animated.View>
          : <Text style={styles.stepNumber}>{number}</Text>}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Heading style={styles.stepTitle}>{title}</Heading>
        {!!hint && <Copy muted style={{ fontSize: 12, lineHeight: 17 }}>{hint}</Copy>}
      </View>
    </Row>
    {children}
  </Animated.View>;
}

export function PlannerScreen() {
  const styles = useStyles(stylesSheet);
  const s = useStyles(sharedSheet);
  const p = usePalette();
  const language = useAppLanguage();
  const locale = language === "ro" ? "ro-RO" : "en-US";
  const params = useLocalSearchParams<{ edit?: string; destination?: string; country?: string; city?: string; stopId?: string; stopName?: string; stopCountry?: string; stopLatitude?: string; stopLongitude?: string }>();
  const { trip, activities, preferences, generateTrip, updateTrip } = useTravel();
  // Editing reopens the current trip with its route, dates and style; saving keeps its activities and expenses.
  const [editing] = useState(() => params.edit === "1" && !!trip);
  const [initial] = useState(() => editing && trip ? editableTrip(trip) : null);
  const [stops, setStops] = useState<RouteStop[]>(() => initial?.stops ?? (() => { const stop = stopFromParams(params); return stop ? [stop] : []; })());
  const [dates, setDates] = useState(() => initial ? { start: trip!.start, end: trip!.end } : { start: "", end: "" });
  const [stopDays, setStopDays] = useState<number[]>(() => initial?.days ?? []);
  const [style, setStyle] = useState(() => initial && trip ? { companions: trip.companions, budget: trip.budget, interests: trip.interests }
    : { companions: "Solo", budget: preferences.budget, interests: preferences.interests });
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(() => !initial && !stopFromParams(params));
  const [picker, setPicker] = useState(false);
  const [styleSheet, setStyleSheet] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [freeLimit, setFreeLimit] = useState(false);
  const searchRef = useRef<TextInputInstance>(null);
  const today = localToday();

  const days = dates.start && dates.end ? tripDays(dates.start, dates.end) : 0;
  // Each city gets consecutive days; reset to an even split whenever the cities or dates change.
  const split = stopDays.length === stops.length && stopDays.reduce((sum, value) => sum + value, 0) === days ? stopDays : splitDays(days, stops.length);
  const canAddStop = stops.length < MAX_STOPS;
  const droppedActivities = editing ? activities.filter((activity) => activity.day > days).length : 0;

  const deferredQuery = useDeferredValue(query.trim());
  const results = useMemo(() => {
    if (deferredQuery.length < 2) return [];
    const chosen = new Set(stops.map((stop) => stop.id));
    const needle = normalizeSearchText(deferredQuery);
    // Exact names first, then names starting with the search, then any word starting with it; larger cities first.
    const rank = (name: string) => {
      const value = normalizeSearchText(name);
      return value === needle ? 0 : value.startsWith(needle) ? 1 : value.split(" ").some((word) => word.startsWith(needle)) ? 2 : 3;
    };
    return searchCities(deferredQuery, 60).filter((city) => !chosen.has(city.id))
      .map((city, order) => ({ city, order, rank: rank(city.name) }))
      .sort((a, b) => a.rank - b.rank || a.order - b.order).slice(0, 7)
      .map(({ city }) => {
        const country = countryForCode(city.countryCode);
        const state = city.countryCode === "US" ? usStates.find((item) => item.code === city.stateCode)?.name : undefined;
        return { stop: { id: city.id, name: city.name, country: country?.name ?? city.countryCode, countryCode: city.countryCode, latitude: city.latitude, longitude: city.longitude }, state };
      });
  }, [deferredQuery, stops]);
  const popular = destinations.filter((item) => !stops.some((stop) => stop.id === item.id)).slice(0, 8);

  const draft: Trip | null = useMemo(() => {
    if (!stops.length || !days) return null;
    const dayCities = dayCitiesFromStops(stops.map((stop) => stop.id), split);
    return {
      destinationId: stops[0].id, start: dates.start, end: dates.end,
      companions: style.companions, budget: style.budget, interests: style.interests,
      routeStops: stops, dayCities, dayDestinations: dayCities.map((day) => day[0]),
    };
  }, [stops, days, split, dates, style]);

  const addStop = (stop: RouteStop) => {
    setStops((current) => [...current, stop]);
    setStopDays([]);
    setQuery("");
    setSearching(false);
    setError("");
  };
  const removeStop = (id: string) => {
    setStops((current) => current.filter((stop) => stop.id !== id));
    setStopDays([]);
    if (stops.length === 1) setSearching(true);
  };
  const moveEarlier = (index: number) => {
    setStops((current) => { const next = [...current]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; });
    setStopDays((current) => { if (current.length !== stops.length) return current; const next = [...current]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; });
  };
  const changeDays = (index: number, delta: 1 | -1) => {
    const next = adjustStopDays(split, index, delta);
    if (next) setStopDays(next);
  };
  const openSearch = () => { setSearching(true); setTimeout(() => searchRef.current?.focus(), 60); };

  const save = async () => {
    if (!draft) return;
    const validation = validateTrip(draft);
    if (validation) { setError(validation); return; }
    setBusy(true);
    setError("");
    setFreeLimit(false);
    try {
      if (editing) {
        await updateTrip(draft);
        setConfirmReplace(false);
        if (router.canGoBack()) router.back(); else router.replace("/itinerary" as Href);
      } else {
        await generateTrip(draft);
        setConfirmReplace(false);
        router.replace("/itinerary" as Href);
      }
    } catch (caught) {
      setConfirmReplace(false);
      setError(caught instanceof Error ? caught.message : "Could not save your trip. Try again.");
      setFreeLimit(caught instanceof SyncFailure ? caught.isFreeLimit : isFreeLimitFailure(caught));
    } finally {
      setBusy(false);
    }
  };
  const create = () => editing ? droppedActivities ? setConfirmReplace(true) : void save() : trip ? setConfirmReplace(true) : void save();

  const short = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const compact = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "UTC" });
  const routeLabel = stops.length <= 3 ? stops.map((stop) => translate(stop.name, language)).join(" → ")
    : `${stops.slice(0, 2).map((stop) => translate(stop.name, language)).join(" → ")} +${stops.length - 2}`;
  const missing = !stops.length ? translate("Add a city to start", language) : !days ? translate("Pick your dates", language)
    : "";

  const footer = <View style={{ gap: 9 }}>
    {!!error && <View style={{ gap: 4 }}>
      <Copy style={[s.error, { textAlign: "center" }]}>{error}</Copy>
      {freeLimit && <Pressable accessibilityRole="button" onPress={() => router.push("/membership" as Href)}><Copy style={{ color: p.blue, fontWeight: "700", textAlign: "center", fontSize: 13 }}>See plans</Copy></Pressable>}
    </View>}
    <Row style={{ gap: 12 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={styles.footerTitle}>{stops.length ? routeLabel : translate(editing ? "Edit trip" : "New trip", language)}</Text>
        <Text numberOfLines={1} style={styles.footerMeta}>{missing || formatMessage(days === 1 ? "{days} day · {start}" : "{days} days · {start} – {end}", { days, start: compact(dates.start), end: compact(dates.end) }, language)}</Text>
      </View>
      <Button icon="trip" busy={busy} disabled={!draft} onPress={create} style={{ paddingHorizontal: 22 }}>{editing ? "Save changes" : "Create trip"}</Button>
    </Row>
  </View>;

  return <Screen footer={footer} style={{ gap: 16 }}>
    <Row style={{ gap: 6 }}>
      <IconButton name="back" label="Go back" onPress={() => router.canGoBack() ? router.back() : router.navigate("/home" as Href)} />
      <View style={{ flex: 1 }}>
        <Heading style={{ fontSize: 26, lineHeight: 31 }}>{editing ? "Edit trip" : "New trip"}</Heading>
        <Copy muted style={{ fontSize: 13 }}>{editing ? "Your activities and expenses are kept." : "Three quick steps. You can add places after."}</Copy>
      </View>
    </Row>

    <Step number={1} title={translate("Where are you going?", language)} done={!!stops.length}
      hint={stops.length > 1 && days ? translate("Set the days in each city. Go below 1 day to visit a city on the same day as the one before.", language) : translate("Add one city, or several for a route.", language)}>
      {!!stops.length && <View style={{ gap: 0 }}>
        {stops.map((stop, index) => <Animated.View key={stop.id} entering={FadeIn.duration(200)} exiting={FadeOut.duration(120)} layout={gentleLayout}>
          <Row style={styles.stop}>
            <View style={styles.stopRail}>
              <View style={[styles.stopDot, index === 0 && { backgroundColor: p.blue }]}><Text style={[styles.stopIndex, index === 0 && { color: p.onColor }]}>{index + 1}</Text></View>
              {index < stops.length - 1 && <View style={styles.stopLine} />}
            </View>
            <View style={{ flex: 1, minWidth: 0, paddingBottom: index < stops.length - 1 ? 14 : 0 }}>
              <Row style={{ gap: 6 }}>
                <Text style={{ fontSize: 17 }}>{countryFlag(stop.countryCode)}</Text>
                <Text numberOfLines={1} style={styles.stopName}>{translate(stop.name, language)}</Text>
              </Row>
              <Copy muted style={{ fontSize: 12 }}>{translate(stop.country, language)}</Copy>
              {stops.length > 1 && !!days && <Row style={styles.stepper}>
                <Pressable accessibilityRole="button" accessibilityLabel={formatMessage("One day less in {city}", { city: stop.name }, language)} disabled={!adjustStopDays(split, index, -1)} onPress={() => changeDays(index, -1)} style={({ pressed }) => [styles.stepperButton, !adjustStopDays(split, index, -1) && { opacity: 0.35 }, pressed && { backgroundColor: p.blueSoft }]}><View style={styles.minus} /></Pressable>
                <Text numberOfLines={1} style={[styles.stepperValue, !split[index] && { color: p.blue }]}>{split[index] ? formatMessage(split[index] === 1 ? "{days} day" : "{days} days", { days: split[index] }, language)
                  : formatMessage("Same day as {city}", { city: translate(stops[index - 1].name, language) }, language)}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel={formatMessage("One day more in {city}", { city: stop.name }, language)} disabled={!adjustStopDays(split, index, 1)} onPress={() => changeDays(index, 1)} style={({ pressed }) => [styles.stepperButton, !adjustStopDays(split, index, 1) && { opacity: 0.35 }, pressed && { backgroundColor: p.blueSoft }]}><Icon name="plus" size={18} color={p.blue} /></Pressable>
              </Row>}
            </View>
            {index > 0 && <IconButton name="up" label={formatMessage("Visit {city} earlier", { city: stop.name }, language)} color={p.muted} onPress={() => moveEarlier(index)} style={{ width: 36, minWidth: 36 }} />}
            <IconButton name="close" label={formatMessage("Remove {city}", { city: stop.name }, language)} color={p.muted} onPress={() => removeStop(stop.id)} style={{ width: 36, minWidth: 36 }} />
          </Row>
        </Animated.View>)}
      </View>}
      {!!initial && !initial.exact && <Copy muted style={{ fontSize: 12 }}>Your route was simplified to one stop after another. Check the days before saving.</Copy>}
      {searching ? <Animated.View entering={FadeIn.duration(160)} style={{ gap: 6 }}>
        <Row style={styles.search}>
          <Icon name="search" size={18} color={p.muted} />
          <TextInput ref={searchRef} value={query} onChangeText={setQuery} autoFocus={!!stops.length} autoCorrect={false}
            placeholder={translate(stops.length ? "Add another city" : "Search any city in the world", language)} placeholderTextColor={p.muted}
            accessibilityLabel={translate("Search a city", language)} returnKeyType="search" style={styles.searchInput} />
          {!!stops.length && <Pressable accessibilityRole="button" accessibilityLabel={translate("Close search", language)} onPress={() => { setSearching(false); setQuery(""); }} hitSlop={8}><Icon name="close" size={19} color={p.muted} /></Pressable>}
        </Row>
        {results.map(({ stop, state }) => <Pressable key={stop.id} accessibilityRole="button" accessibilityLabel={formatMessage("Add {city}, {country}", { city: stop.name, country: translate(stop.country, language) }, language)}
          onPress={() => addStop(stop)} style={({ pressed }) => [styles.result, pressed && { backgroundColor: p.blueSoft }]}>
          <Text style={{ fontSize: 20 }}>{countryFlag(stop.countryCode)}</Text>
          <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={styles.resultName}>{stop.name}</Text><Copy muted style={{ fontSize: 12 }}>{state ? `${state}, ` : ""}{translate(stop.country, language)}</Copy></View>
          <Icon name="plus" size={20} color={p.blue} />
        </Pressable>)}
        {deferredQuery.length >= 2 && !results.length && <Copy muted style={{ fontSize: 13, paddingVertical: 6 }}>No cities found. Check the spelling or try a nearby city.</Copy>}
        {!query && !stops.length && <View style={{ gap: 8, paddingTop: 4 }}>
          <Copy muted style={{ fontSize: 12, fontWeight: "700" }}>POPULAR PICKS</Copy>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 9 }}>
            {popular.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={formatMessage("Add {city}, {country}", { city: item.name, country: translate(item.country, language) }, language)}
              onPress={() => addStop(withCountryCode(routeStop({ destinationId: item.id })))} style={({ pressed }) => [styles.popular, pressed && { transform: [{ scale: 0.96 }] }]}>
              <DestinationPhoto destination={item} style={StyleSheet.absoluteFill} />
              <View style={styles.popularShade} />
              <Text numberOfLines={1} style={styles.popularName}>{translate(item.name, language)}</Text>
            </Pressable>)}
          </ScrollView>
        </View>}
      </Animated.View> : canAddStop && <Pressable accessibilityRole="button" onPress={openSearch} style={({ pressed }) => [styles.addCity, pressed && { backgroundColor: p.blueSoft }]}>
        <Icon name="plus" size={19} color={p.blue} /><Copy style={{ color: p.blue, fontWeight: "700" }}>Add another city</Copy>
      </Pressable>}
    </Step>

    <Step number={2} title={translate("When?", language)} done={!!days} hint={translate("Up to 14 days. Your itinerary is organised day by day.", language)}>
      <Pressable accessibilityRole="button" accessibilityLabel={translate("Choose travel dates", language)} onPress={() => setPicker(true)} style={({ pressed }) => [styles.dates, pressed && { borderColor: p.blue }]}>
        {(["start", "end"] as const).map((field, index) => <View key={field} style={[{ flex: 1, gap: 2 }, index === 1 && styles.datesDivider]}>
          <Copy muted style={{ fontSize: 11, fontWeight: "700" }}>{field === "start" ? "DEPARTURE" : "RETURN"}</Copy>
          <Copy style={{ fontWeight: "700", color: dates[field] ? p.ink : p.muted }}>{dates[field] ? short(dates[field]) : translate("Add date", language)}</Copy>
        </View>)}
        <Icon name="calendar" size={22} color={p.blue} />
      </Pressable>
    </Step>

    <Step number={3} title={translate("Trip style", language)} done={!!draft} hint={translate("Optional. Used for suggestions and your budget.", language)}>
      <Row style={{ gap: 7 }}>
        {companions.map((item) => {
          const selected = style.companions === item.value;
          return <Pressable key={item.value} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setStyle((current) => ({ ...current, companions: item.value }))}
            style={({ pressed }) => [styles.companion, selected && styles.companionSelected, pressed && { transform: [{ scale: 0.95 }] }]}>
            <Icon name={item.icon} size={20} color={selected ? p.onColor : p.blue} />
            <Text numberOfLines={1} style={[styles.companionLabel, selected && { color: p.onColor }]}>{translate(item.value, language)}</Text>
          </Pressable>;
        })}
      </Row>
      <Pressable accessibilityRole="button" onPress={() => setStyleSheet(true)} style={({ pressed }) => [styles.styleRow, pressed && { backgroundColor: p.blueSoft }]}>
        <Icon name="wallet" size={20} color={p.blue} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Copy style={{ fontWeight: "700" }}>{formatMessage("{budget} per person", { budget: money(style.budget) }, language)}</Copy>
          <Text numberOfLines={1} style={styles.footerMeta}>{style.interests.length ? style.interests.map((item) => translate(item, language)).join(" · ") : translate("No interests selected", language)}</Text>
        </View>
        <Copy style={{ color: p.blue, fontWeight: "700", fontSize: 13 }}>Edit</Copy>
      </Pressable>
    </Step>
    <Copy muted style={{ fontSize: 11, textAlign: "center" }}>GoWorth does not make reservations or payments for your trip.</Copy>

    <DateRangePicker key={picker ? "open" : "closed"} visible={picker} start={dates.start} end={dates.end} minDate={today} maxDays={MAX_DAYS}
      onDone={(start, end) => { setDates({ start, end }); setStopDays([]); setError(""); }} onClose={() => setPicker(false)} />

    <Sheet visible={styleSheet} title={translate("Trip style", language)} onClose={() => setStyleSheet(false)}>
      <View style={{ gap: 8 }}>
        <Row style={{ justifyContent: "space-between" }}><Copy style={s.label}>Budget (per person)</Copy><Copy style={{ fontWeight: "700", color: p.blue }}>{money(style.budget)}</Copy></Row>
        <Slider accessibilityLabel={translate("Trip budget", language)} minimumValue={500} maximumValue={10000} step={100} value={style.budget}
          onValueChange={(budget) => setStyle((current) => ({ ...current, budget }))} minimumTrackTintColor={p.blue} maximumTrackTintColor={p.line} thumbTintColor={p.blue} />
        <Row style={{ justifyContent: "space-between" }}><Copy muted style={{ fontSize: 12 }}>{money(500)}</Copy><Copy muted style={{ fontSize: 12 }}>{money(10000)}</Copy></Row>
      </View>
      <View style={{ gap: 10 }}>
        <Copy style={s.label}>Interests</Copy>
        <View style={[s.grid, { gap: 8 }]}>
          {interests.map((interest) => {
            const selected = style.interests.includes(interest);
            return <Pressable key={interest} accessibilityRole="button" accessibilityState={{ selected }}
              onPress={() => setStyle((current) => ({ ...current, interests: selected ? current.interests.filter((item) => item !== interest) : [...current.interests, interest] }))}
              style={({ pressed }) => [styles.interest, selected && styles.interestSelected, pressed && { opacity: 0.75 }]}>
              {selected && <Icon name="tick" size={14} color={p.onColor} />}
              <Text style={[styles.interestLabel, selected && { color: p.onColor }]}>{translate(interest, language)}</Text>
            </Pressable>;
          })}
        </View>
      </View>
      <Button onPress={() => setStyleSheet(false)}>Done</Button>
    </Sheet>

    <Sheet visible={confirmReplace && editing} title={translate("Shorten your trip?", language)} onClose={() => { if (!busy) setConfirmReplace(false); }}>
      <Copy muted>{formatMessage(droppedActivities === 1 ? "1 activity is planned on a day that no longer exists and will be removed." : "{count} activities are planned on days that no longer exist and will be removed.", { count: droppedActivities }, language)}</Copy>
      <Button busy={busy} onPress={() => void save()}>Save changes</Button>
      <Button secondary disabled={busy} onPress={() => setConfirmReplace(false)}>Keep editing</Button>
    </Sheet>

    <Sheet visible={confirmReplace && !editing} title={translate("Replace your current trip?", language)} onClose={() => { if (!busy) setConfirmReplace(false); }}>
      {!!trip && <Copy muted>{formatMessage("{trip} will move to your journal with its activities and expenses. You can still open it there.", { trip: routeTitle(trip, language) }, language)}</Copy>}
      <Button busy={busy} onPress={() => void save()}>Create new trip</Button>
      <Button secondary disabled={busy} onPress={() => setConfirmReplace(false)}>Keep current trip</Button>
    </Sheet>
  </Screen>;
}

/** The current trip as ordered stops with day counts, ready for the planner. */
function editableTrip(trip: Trip) {
  const dayCities = Array.from({ length: tripDays(trip.start, trip.end) }, (_, index) => citiesForDay(trip, index + 1));
  const { ids, days, exact } = stopsFromDayCities(dayCities);
  return { stops: ids.map((id) => withCountryCode(routeStop(trip, id))), days, exact };
}

/** Curated destinations do not carry a country code; look it up by country name for the flag. */
function withCountryCode(stop: RouteStop): RouteStop {
  if (stop.countryCode) return stop;
  const name = stop.country.toLocaleLowerCase();
  return { ...stop, countryCode: countries.find((country) => country.name.toLocaleLowerCase() === name)?.code ?? "" };
}

const stylesSheet = themedStyles((p) => ({
  step: { gap: 14, padding: 16, borderRadius: 18, borderWidth: 1, borderColor: p.line, backgroundColor: p.white,
    shadowColor: p.shadow, shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  stepBadge: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: p.blueSoft },
  stepBadgeDone: { backgroundColor: p.blue },
  stepNumber: { color: p.blue, fontSize: 13, fontWeight: "800" },
  stepTitle: { fontSize: 18, lineHeight: 24 },
  stop: { alignItems: "flex-start", gap: 10 },
  stopRail: { width: 26, alignItems: "center", alignSelf: "stretch" },
  stopDot: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: p.blue, backgroundColor: p.white, alignItems: "center", justifyContent: "center" },
  stopIndex: { color: p.blue, fontSize: 12, fontWeight: "800" },
  stopLine: { flex: 1, width: 2, marginVertical: 3, borderRadius: 1, backgroundColor: p.blueLine },
  stopName: { flexShrink: 1, color: p.ink, fontSize: 16, fontWeight: "700" },
  stepper: { alignSelf: "flex-start", gap: 4, marginTop: 8, padding: 3, borderRadius: 12, backgroundColor: p.soft },
  stepperButton: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: p.white },
  stepperValue: { minWidth: 62, maxWidth: 150, textAlign: "center", color: p.ink, fontSize: 13, fontWeight: "700" },
  minus: { width: 12, height: 2.2, borderRadius: 2, backgroundColor: p.blue },
  search: { gap: 9, minHeight: 50, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: p.blue, backgroundColor: p.white },
  searchInput: { flex: 1, fontSize: 15, color: p.ink, paddingVertical: 12, outlineWidth: 0 },
  result: { flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 10 },
  resultName: { color: p.ink, fontSize: 15, fontWeight: "600" },
  popular: { width: 112, height: 78, borderRadius: 12, overflow: "hidden", justifyContent: "flex-end", padding: 8, backgroundColor: p.blueSoft },
  popularShade: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(10,20,40,0.32)" },
  popularName: { color: p.onColor, fontSize: 13, fontWeight: "800" },
  addCity: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, minHeight: 46, borderRadius: 12, borderWidth: 1.5, borderStyle: "dashed", borderColor: p.blueLine },
  dates: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: p.line, backgroundColor: p.soft },
  datesDivider: { borderLeftWidth: 1, borderColor: p.line, paddingLeft: 12 },
  companion: { flex: 1, minWidth: 0, alignItems: "center", gap: 4, paddingVertical: 10, borderRadius: 12, backgroundColor: p.blueSoft },
  companionSelected: { backgroundColor: p.blue },
  companionLabel: { color: p.ink, fontSize: 12, fontWeight: "700" },
  styleRow: { flexDirection: "row", alignItems: "center", gap: 11, padding: 12, borderRadius: 12, backgroundColor: p.soft },
  interest: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 18, backgroundColor: p.blueSoft },
  interestSelected: { backgroundColor: p.blue },
  interestLabel: { color: p.ink, fontSize: 13, fontWeight: "600" },
  footerTitle: { color: p.ink, fontSize: 15, fontWeight: "800" },
  footerMeta: { color: p.muted, fontSize: 12, marginTop: 1 },
}));
