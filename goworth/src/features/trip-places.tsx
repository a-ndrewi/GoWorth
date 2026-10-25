import { router, useLocalSearchParams, type Href } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { Button, Copy, EmptyState, Heading, Icon, IconButton, Row, Screen, Sheet } from "@/components/goworth/ui";
import { PlacePreviewPhoto, PlaceThumbnail } from "@/components/goworth/place-preview";
import { venueFilterIcons, venueFilterLabels } from "@/components/goworth/venue-art";
import { SkeletonRows } from "@/components/goworth/loading";
import { TripMap } from "@/components/goworth/trip-map";
import { themedStyles, type Palette } from "@/constants/design";
import { usePalette, useStyles } from "@/state/theme-context";
import { tripDays } from "@/data/travel";
import { routeStop } from "@/data/trip-route";
import { filterVenues, loadNearbyPlaces, loadNearbyVenues, venueFilters, venueFromCategory, type NearbyPlace, type VenueFilter } from "@/data/nearby-places";
import { searchMap } from "@/data/map";
import { formatMessage, translate } from "@/data/i18n";
import { useAppLanguage } from "@/data/formatting";
import { countryFlag } from "@/data/geography";
import { useTravel } from "@/state/travel-context";
import { citiesForDay, nextActivitySlot } from "@/utils/trip";
import { placeFitsTripDay } from "@/utils/trip-place";
import { publicActivityNote, publicPlaceCategory } from "@/utils/public-activity";
import { SyncFailure } from "@/utils/sync-error";

const categoryTone: Record<string, keyof Palette> = {
  Landmarks: "blue", Museums: "purple", Nature: "green", Beaches: "teal", Neighborhoods: "orange", "Food & Markets": "pink",
};
const venueTone: Record<VenueFilter, keyof Palette> = { restaurant: "orange", bar: "purple", cafe: "teal", nightclub: "pink", terrace: "green" };
/** Venues are coloured by what they are; attractions by their category. */
const colorFor = (category: string, p: Palette, place?: NearbyPlace) => {
  const venue = place?.venue ?? venueFromCategory(category);
  return venue ? p[venueTone[venue.kind]] : p[categoryTone[category] ?? "muted"];
};
const venueChip = (filter: VenueFilter) => `venue:${filter}`;
const chipVenue = (category: string) => venueFilters.find((filter) => venueChip(filter) === category);

type Idea = NearbyPlace & { city: string };

/** What a venue adds to the itinerary note: its kind, cuisine, terrace and street, all readable in archived trips. */
function ideaNote(place: Idea) {
  if (!place.venue) return `${place.detail} · ${place.sourceUrl}`;
  return [place.category, place.venue.cuisine, place.venue.terrace ? "Terrace" : "", place.venue.address, place.sourceUrl].filter(Boolean).join(" · ");
}

export function TripPlacesScreen() {
  const styles = useStyles(stylesSheet);
  const p = usePalette();
  const language = useAppLanguage();
  const { day: dayParam, activity: activityParam } = useLocalSearchParams<{ day?: string; activity?: string }>();
  const { trip, activities, addActivity, removeActivity, externalPlaces, toggleExternalPlace } = useTravel();
  const days = trip ? tripDays(trip.start, trip.end) : 1;
  const day = Math.min(Math.max(1, Math.trunc(Number(dayParam)) || 1), days);
  const dayStops = useMemo(() => trip ? citiesForDay(trip, day).map((id) => routeStop(trip, id)) : [], [trip, day]);
  const stopsKey = dayStops.map((stop) => stop.id).join("|");
  const [ideas, setIdeas] = useState<{ key: string; status: "loading" | "ready" | "error"; places: Idea[] }>({ key: "", status: "loading", places: [] });
  const [venues, setVenues] = useState<{ key: string; status: "loading" | "ready" | "error"; places: Idea[] }>({ key: "", status: "loading", places: [] });
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Idea[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [category, setCategory] = useState("All");
  const [selectedId, setSelectedId] = useState(activityParam ?? "");
  const [preview, setPreview] = useState<Idea | null>(null);
  const [busyId, setBusyId] = useState("");
  const [toast, setToast] = useState<{ id: number; text: string; error?: boolean; freeLimit?: boolean } | null>(null);
  const showToast = (next: { text: string; error?: boolean; freeLimit?: boolean }) => setToast((current) => ({ ...next, id: (current?.id ?? 0) + 1 }));

  useEffect(() => {
    if (!dayStops.length) return;
    let active = true;
    Promise.all(dayStops.map((stop) => loadNearbyPlaces(stop, 8).then((places) => places.map((place) => ({ ...place, city: stop.name })))))
      .then((lists) => {
        if (!active) return;
        const seen = new Set<string>();
        const merged = lists.flat().filter((place) => !seen.has(place.id) && !!seen.add(place.id));
        setIdeas({ key: stopsKey, status: "ready", places: merged });
      })
      .catch(() => { if (active) setIdeas({ key: stopsKey, status: "error", places: [] }); });
    return () => { active = false; };
  }, [dayStops, stopsKey]);

  const venueFilter = chipVenue(category);
  // Venues load the first time a venue category is chosen for these cities; they stay for the other venue chips.
  const wantsVenues = !!venueFilter;
  useEffect(() => {
    if (!wantsVenues || !dayStops.length) return;
    let active = true;
    Promise.allSettled(dayStops.map((stop) => loadNearbyVenues(stop, 3).then((places) => places.map((place) => ({ ...place, city: stop.name })))))
      .then((results) => {
        if (!active) return;
        if (results.every((result) => result.status === "rejected")) { setVenues({ key: stopsKey, status: "error", places: [] }); return; }
        const seen = new Set<string>();
        const merged = results.flatMap((result) => result.status === "fulfilled" ? result.value : []).filter((place) => !seen.has(place.id) && !!seen.add(place.id));
        setVenues({ key: stopsKey, status: "ready", places: merged });
      });
    return () => { active = false; };
  }, [wantsVenues, dayStops, stopsKey]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.freeLimit ? 6000 : 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  const dayActivities = useMemo(() => activities.filter((activity) => activity.day === day).sort((a, b) => a.time.localeCompare(b.time)), [activities, day]);
  const planned = dayActivities.filter((activity) => Number.isFinite(activity.latitude) && Number.isFinite(activity.longitude));
  const plannedIds = new Set(dayActivities.map((activity) => activity.placeId).filter(Boolean));
  const loading = venueFilter ? venues.key !== stopsKey || venues.status === "loading" : ideas.key !== stopsKey || ideas.status === "loading";
  const source = useMemo(() => searchResults ?? (venueFilter
    ? venues.key === stopsKey ? filterVenues(venues.places, [venueFilter]) as Idea[] : []
    : ideas.key === stopsKey ? ideas.places : []), [searchResults, venueFilter, venues, ideas, stopsKey]);
  const attractionSource = searchResults ?? (ideas.key === stopsKey ? ideas.places : []);
  const categories = ["All", ...new Set(attractionSource.map((place) => publicPlaceCategory(place.category) || place.category))];
  const visible = venueFilter ? source : source.filter((place) => category === "All" || (publicPlaceCategory(place.category) || place.category) === category);

  const mapData = {
    cities: dayStops.map((stop) => ({ id: `city:${stop.id}`, name: stop.name, latitude: stop.latitude, longitude: stop.longitude })),
    planned: planned.map((activity) => ({ id: activity.id, name: activity.name, latitude: activity.latitude!, longitude: activity.longitude! })),
    suggestions: visible.filter((place) => !plannedIds.has(place.id)).slice(0, 15)
      .map((place) => ({ id: place.id, name: place.name, latitude: place.latitude, longitude: place.longitude, color: colorFor(publicPlaceCategory(place.category) || place.category, p, place) })),
    selectedId,
    frameKey: `${day}|${category}|${searchResults ? "search" : "ideas"}|${source.length}`,
  };

  const selectFromMap = (id: string) => {
    setSelectedId(id);
    const place = source.find((item) => item.id === id);
    if (place) setPreview(place);
  };

  const runSearch = async () => {
    const text = query.trim();
    if (!text || !dayStops.length || !trip) { setSearchResults(null); return; }
    setSearching(true);
    try {
      const lists = await Promise.all(dayStops.map((stop) => searchMap(text, { center: { ...stop, kind: "city" }, radiusKm: 25 })
        .then((results) => results.map((result): Idea => ({ id: result.id, name: result.name, latitude: result.latitude, longitude: result.longitude, kind: "place",
          category: result.category, detail: result.detail, source: result.source ?? "OpenStreetMap", sourceUrl: result.sourceUrl, location: stop.name, city: stop.name })))));
      const seen = new Set<string>();
      setSearchResults(lists.flat().filter((place) => placeFitsTripDay(trip, day, place) && !seen.has(place.id) && !!seen.add(place.id)));
      setCategory("All");
    } catch {
      setSearchResults([]);
    } finally { setSearching(false); }
  };

  const toggle = async (place: Idea) => {
    if (!trip || busyId) return;
    setBusyId(place.id);
    try {
      const existing = dayActivities.filter((activity) => activity.placeId === place.id);
      if (existing.length) {
        await Promise.all(existing.map((activity) => removeActivity(activity.id)));
        showToast({ text: formatMessage("Removed from day {day}", { day }, language) });
      } else {
        const slot = nextActivitySlot(activities, day);
        await addActivity({ day, ...slot, name: place.name, note: ideaNote(place), placeId: place.id, latitude: place.latitude, longitude: place.longitude });
        showToast({ text: formatMessage("Added to day {day} at {time}", { day, time: slot.time }, language) });
      }
    } catch (caught) {
      showToast({ error: true, text: caught instanceof Error ? caught.message : translate("Could not update your itinerary.", language),
        freeLimit: caught instanceof SyncFailure && caught.isFreeLimit });
    } finally { setBusyId(""); }
  };

  if (!trip) return <Screen active="itinerary"><EmptyState title="No trip planned" detail="Choose a destination and dates to start your trip." action="Plan a trip" onPress={() => router.push("/planner" as Href)} /></Screen>;

  const toastView = toast && <Animated.View key={toast.id} entering={FadeInDown.springify().damping(16)} exiting={FadeOutDown.duration(160)} style={[styles.toast, toast.error && { backgroundColor: p.danger }]}>
    <Icon name={toast.error ? "close" : "check"} size={18} color={p.onColor} />
    <Text style={styles.toastText} numberOfLines={2}>{toast.text}</Text>
    {toast.freeLimit ? <Pressable accessibilityRole="button" onPress={() => router.push("/membership" as Href)}><Text style={styles.toastAction}>{translate("See plans", language)}</Text></Pressable>
      : !toast.error && <Pressable accessibilityRole="button" onPress={() => router.navigate({ pathname: "/itinerary", params: { day: String(day) } } as Href)}><Text style={styles.toastAction}>{translate("View day", language)}</Text></Pressable>}
  </Animated.View>;

  const addButton = (place: Idea, wide = false) => {
    const added = plannedIds.has(place.id);
    return <Pressable accessibilityRole="button" accessibilityState={{ selected: added, busy: busyId === place.id }}
      accessibilityLabel={formatMessage(added ? "Remove {place} from day {day}" : "Add {place} to day {day}", { place: place.name, day }, language)}
      onPress={() => void toggle(place)} disabled={!!busyId}
      style={({ pressed }) => [styles.add, added && styles.added, wide && { alignSelf: "stretch", justifyContent: "center", minHeight: 48 }, pressed && { transform: [{ scale: 0.94 }] }]}>
      {busyId === place.id ? <ActivityIndicator size="small" color={added ? p.onColor : p.blue} />
        : <Icon name={added ? "tick" : "plus"} size={added ? 15 : 17} color={added ? p.onColor : p.blue} />}
      <Text style={[styles.addText, added && { color: p.onColor }]}>{added ? formatMessage("Day {day}", { day }, language) : translate("Add", language)}</Text>
    </Pressable>;
  };

  return <Screen active="itinerary" style={{ gap: 14 }} overlay={toastView}>
    <Row style={{ gap: 4 }}>
      <IconButton name="back" label="Go back" onPress={() => router.navigate({ pathname: "/itinerary", params: { day: String(day) } } as Href)} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Heading style={{ fontSize: 22, lineHeight: 28 }}>Find places</Heading>
        <Text numberOfLines={1} style={styles.cardMeta}>{dayStops.map((stop) => `${countryFlag(stop.countryCode)} ${translate(stop.name, language)}`.trim()).join("  →  ")}</Text>
      </View>
    </Row>

    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 7 }}>
      {Array.from({ length: days }, (_, index) => {
        const selected = index + 1 === day;
        const count = activities.filter((activity) => activity.day === index + 1).length;
        return <Pressable key={index} accessibilityRole="button" accessibilityState={{ selected }}
          onPress={() => { setSelectedId(""); setSearchResults(null); setQuery(""); setCategory("All"); router.setParams({ day: String(index + 1), activity: "" }); }}
          style={({ pressed }) => [styles.day, selected && styles.daySelected, pressed && { opacity: 0.8 }]}>
          <Text style={[styles.dayText, selected && { color: p.onColor }]}>{formatMessage("Day {day}", { day: index + 1 }, language)}</Text>
          {!!count && <View style={[styles.dayCount, selected && { backgroundColor: p.white }]}><Text style={[styles.dayCountText, selected && { color: p.blue }]}>{count}</Text></View>}
        </Pressable>;
      })}
    </ScrollView>

    <View style={styles.mapCard}>
      <TripMap data={mapData} onSelect={selectFromMap} />
      <View pointerEvents="none" style={styles.mapBadge}>
        <Icon name="calendar" size={14} color={p.blue} />
        <Text style={styles.mapBadgeText}>{formatMessage(planned.length === 1 ? "{count} stop planned" : "{count} stops planned", { count: planned.length }, language)}</Text>
      </View>
    </View>

    <Row style={styles.search}>
      <Icon name="search" size={18} color={p.muted} />
      <TextInput value={query} onChangeText={(value) => { setQuery(value); if (!value.trim()) setSearchResults(null); }} onSubmitEditing={() => void runSearch()} returnKeyType="search"
        placeholder={formatMessage("Search in {city}", { city: dayStops.map((stop) => translate(stop.name, language)).join(", ") }, language)} placeholderTextColor={p.muted}
        accessibilityLabel={translate("Search places for this day", language)} style={styles.searchInput} />
      {searching ? <ActivityIndicator size="small" color={p.blue} /> : !!query && <Pressable accessibilityRole="button" accessibilityLabel={translate("Clear search", language)} onPress={() => { setQuery(""); setSearchResults(null); }} hitSlop={8}><Icon name="close" size={19} color={p.muted} /></Pressable>}
    </Row>

    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 7 }}>
      {categories.map((item) => {
        const selected = category === item;
        return <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setCategory(item)}
          style={({ pressed }) => [styles.category, selected && styles.categorySelected, pressed && { opacity: 0.8 }]}>
          {item !== "All" && <View style={[styles.categoryDot, { backgroundColor: selected ? p.white : colorFor(item, p) }]} />}
          <Text style={[styles.categoryText, selected && { color: p.onColor }]}>{translate(item, language)}</Text>
        </Pressable>;
      })}
      {!searchResults && venueFilters.map((filter) => {
        const selected = category === venueChip(filter);
        return <Pressable key={filter} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => { setCategory(selected ? "All" : venueChip(filter)); setSelectedId(""); }}
          style={({ pressed }) => [styles.category, selected && styles.categorySelected, pressed && { opacity: 0.8 }]}>
          <Icon name={venueFilterIcons[filter]} size={14} color={selected ? p.onColor : p[venueTone[filter]]} />
          <Text style={[styles.categoryText, selected && { color: p.onColor }]}>{translate(venueFilterLabels[filter], language)}</Text>
        </Pressable>;
      })}
    </ScrollView>

    <Heading style={{ fontSize: 17, lineHeight: 23 }}>{searchResults ? formatMessage("Results for “{query}”", { query: query.trim() }, language) : venueFilter ? formatMessage("{venues} near your stops", { venues: translate(venueFilterLabels[venueFilter], language) }, language) : translate("Ideas for this day", language)}</Heading>
    {loading && !searchResults ? <SkeletonRows count={3} thumbSize={64} card />
      : visible.length ? visible.map((place) => {
        const tone = colorFor(publicPlaceCategory(place.category) || place.category, p, place);
        const venueDetail = place.venue ? [place.venue.cuisine, place.venue.terrace ? translate("Terrace", language) : ""].filter(Boolean).join(" · ") : "";
        // The card and its add button are siblings: a button inside a button is invalid on the web.
        return <View key={place.id} style={[styles.card, selectedId === place.id && { borderColor: p.blue }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={formatMessage("Preview {place}", { place: place.name }, language)}
            onPress={() => { setSelectedId(place.id); setPreview(place); }}
            style={({ pressed }) => [styles.cardBody, pressed && { opacity: 0.7 }]}>
          <PlaceThumbnail name={place.name} location={place.city} latitude={place.latitude} longitude={place.longitude} sourceUrl={place.sourceUrl} style={styles.thumb} thumbWidth={250} venue={place.venue} />
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <Text numberOfLines={2} style={styles.cardName}>{place.name}</Text>
            <Row style={{ gap: 5 }}>
              <View style={[styles.categoryDot, { backgroundColor: tone }]} />
              <Text numberOfLines={1} style={styles.cardMeta}>{translate(publicPlaceCategory(place.category) || place.category, language)}{venueDetail ? ` · ${venueDetail}` : ""}{dayStops.length > 1 ? ` · ${translate(place.city, language)}` : ""}</Text>
            </Row>
          </View>
          </Pressable>
          {addButton(place)}
        </View>;
      }) : <View style={styles.empty}>
        <Icon name="compass" size={26} color={p.blue} />
        <Copy muted style={{ textAlign: "center", fontSize: 13 }}>{searchResults ? translate("No places found for this day. Try another name.", language)
          : venueFilter ? translate(venues.status === "error" ? "Nearby places are unavailable right now." : "No venues of this kind near this day's cities yet.", language)
          : ideas.status === "error" ? translate("Nearby places are unavailable right now.", language) : translate("No suggestions here yet. Search for a place you have in mind.", language)}</Copy>
      </View>}

    <Sheet visible={!!preview} title={preview?.name ?? ""} onClose={() => setPreview(null)}>
      {preview && <>
        <PlacePreviewPhoto name={preview.name} location={preview.city} latitude={preview.latitude} longitude={preview.longitude} sourceUrl={preview.sourceUrl}
          badge={translate(publicPlaceCategory(preview.category) || preview.category, language)} venue={preview.venue} />
        {preview.venue ? <View style={{ gap: 6 }}>
          {!!preview.venue.cuisine && <Row style={{ gap: 8 }}><Icon name="food" size={16} color={p.muted} /><Copy muted style={{ flex: 1 }}>{preview.venue.cuisine}</Copy></Row>}
          {preview.venue.terrace && <Row style={{ gap: 8 }}><Icon name="terrace" size={16} color={p.muted} /><Copy muted style={{ flex: 1 }}>Terrace</Copy></Row>}
          {!!preview.venue.openingHours && <Row style={{ gap: 8 }}><Icon name="calendar" size={16} color={p.muted} /><Copy muted style={{ flex: 1 }}>{preview.venue.openingHours}</Copy></Row>}
          {!!preview.venue.address && <Row style={{ gap: 8 }}><Icon name="pin" size={16} color={p.muted} /><Copy muted style={{ flex: 1 }}>{preview.venue.address}</Copy></Row>}
        </View> : !!publicActivityNote(preview.detail) && <Copy muted>{publicActivityNote(preview.detail)}</Copy>}
        {addButton(preview, true)}
        <Row style={{ gap: 9 }}>
          <Button secondary icon={externalPlaces.some((place) => place.id === preview.id) ? "heartFill" : "heart"} style={{ flex: 1 }}
            onPress={() => void toggleExternalPlace({ ...preview, location: preview.city }).catch(() => undefined)}>{externalPlaces.some((place) => place.id === preview.id) ? "Saved" : "Save"}</Button>
          <Button secondary icon="road" style={{ flex: 1 }} onPress={() => void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${preview.latitude},${preview.longitude}`)}>Directions</Button>
        </Row>
      </>}
    </Sheet>
  </Screen>;
}

const stylesSheet = themedStyles((p) => ({
  day: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 14, borderWidth: 1, borderColor: p.line, backgroundColor: p.white },
  daySelected: { backgroundColor: p.blue, borderColor: p.blue },
  dayText: { color: p.ink, fontSize: 13, fontWeight: "700" },
  dayCount: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, alignItems: "center", justifyContent: "center", backgroundColor: p.blueSoft },
  dayCountText: { color: p.blue, fontSize: 11, fontWeight: "800" },
  mapCard: { height: 250, borderRadius: 22, overflow: "hidden", borderWidth: 1, borderColor: p.line, backgroundColor: p.soft },
  mapBadge: { position: "absolute", top: 10, left: 10, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: p.white },
  mapBadgeText: { color: p.ink, fontSize: 12, fontWeight: "700" },
  search: { gap: 9, minHeight: 48, paddingHorizontal: 14, borderRadius: 14, backgroundColor: p.soft },
  searchInput: { flex: 1, color: p.ink, fontSize: 14, paddingVertical: 12, outlineWidth: 0 },
  category: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 16, backgroundColor: p.soft },
  categorySelected: { backgroundColor: p.night },
  categoryText: { color: p.ink, fontSize: 12, fontWeight: "700" },
  categoryDot: { width: 8, height: 8, borderRadius: 4 },
  card: { flexDirection: "row", alignItems: "center", gap: 12, padding: 10, borderRadius: 18, borderWidth: 1.5, borderColor: p.line, backgroundColor: p.white },
  cardBody: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 12 },
  thumb: { width: 64, height: 64, borderRadius: 14, backgroundColor: p.blueSoft },
  cardName: { color: p.ink, fontSize: 15, lineHeight: 19, fontWeight: "700" },
  cardMeta: { flexShrink: 1, color: p.muted, fontSize: 12, fontWeight: "600" },
  add: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 14, backgroundColor: p.blueSoft },
  added: { backgroundColor: p.blue },
  addText: { color: p.blue, fontSize: 13, fontWeight: "800" },
  empty: { alignItems: "center", gap: 8, paddingVertical: 26, paddingHorizontal: 20, borderRadius: 18, borderWidth: 1.5, borderStyle: "dashed", borderColor: p.blueLine, backgroundColor: p.blueTint },
  toast: { position: "absolute", left: 22, right: 22, bottom: 16, flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 16, backgroundColor: p.night,
    shadowColor: p.shadow, shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  toastText: { flex: 1, color: p.onColor, fontSize: 13, fontWeight: "700" },
  toastAction: { color: "#9DB8FF", fontSize: 13, fontWeight: "800" },
}));
