import { router, useLocalSearchParams, type Href } from "expo-router";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Keyboard, Linking, Pressable, ScrollView, TextInput, View } from "react-native";
import { Button, Chip, Copy, DestinationPhoto, Header, Icon, Row, Screen, Sheet } from "@/components/goworth/ui";
import { PlacePreviewPhoto, PlaceThumbnail } from "@/components/goworth/place-preview";
import { SkeletonRows } from "@/components/goworth/loading";
import { usePalette } from "@/state/theme-context";
import { destinations, places, tripDays } from "@/data/travel";
import { destinationPins, usStatePins, searchCatalogPlace, searchMap, type MapPin, type SearchResult } from "@/data/map";
import { cityForId, countries, countryAnchor, countryFlag, countryForCode, searchCities, usStates } from "@/data/geography";
import { loadNearbyPlaces, venueFromCategory, type NearbyPlace } from "@/data/nearby-places";
import { useTravel } from "@/state/travel-context";
import { placeFitsTripDay, useTripAreas } from "@/utils/trip-place";
import { nextActivitySlot } from "@/utils/trip";
import { routeStopForDay } from "@/data/trip-route";
import { formatMessage, translate, translateAccessibility } from "@/data/i18n";
import { useAppLanguage, type AppLanguage } from "@/data/formatting";
import { normalizeSearchText } from "@/utils/search";
import { CountryGrid } from "@/components/goworth/country-grid";
import { CountryGlobe, type GlobeFocus } from "@/components/goworth/country-globe";
import { useTimedMessage } from "@/hooks/use-timed-message";

const regions = ["Worldwide", "US states", "Europe", "Asia", "Americas", "Africa", "Oceania"];
const continents: Record<string, string[]> = { Europe: ["EU"], Asia: ["AS"], Americas: ["NA", "SA"], Africa: ["AF"], Oceania: ["OC"] };
const regionCenters: Record<string, { latitude: number; longitude: number; zoom: number }> = {
  "US states": { latitude: 39, longitude: -98, zoom: 2.6 }, Europe: { latitude: 50, longitude: 14, zoom: 2.4 },
  Asia: { latitude: 32, longitude: 92, zoom: 1.5 }, Americas: { latitude: 12, longitude: -78, zoom: 1.2 },
  Africa: { latitude: 3, longitude: 20, zoom: 1.5 }, Oceania: { latitude: -22, longitude: 145, zoom: 1.7 },
};

function placeDetail(detail: string, language: AppLanguage) {
  if (language === "ro") {
    const nearby = detail.match(/^(.+) · (\d+(?:\.\d+)?) km away$/);
    if (nearby) return formatMessage("{category} · {distance} km away", { category: translate(nearby[1], language), distance: nearby[2].replace(".", ",") }, language);
    const wiki = detail.match(/^(\d+(?:\.\d+)?) km away · Wikipedia article$/);
    if (wiki) return formatMessage("{distance} km away · Wikipedia article", { distance: wiki[1].replace(".", ",") }, language);
  }
  return translate(detail, language);
}

function placeBadge(category: string, detail: string, language: AppLanguage) {
  const distance = detail.match(/(?:·|,)\s*(\d+(?:\.\d+)?)\s*km away/i)?.[1];
  return distance ? `${translate(category, language)} · ${distance.replace(".", ",")} km` : translate(category, language);
}

/** One row of a search list, laid out like the city list of a country and the place list of a city. */
function ResultRow({ label, title, subtitle, leading, onPress }: { label: string; title: string; subtitle?: string; leading: ReactNode; onPress: () => void }) {
  const p = usePalette();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    style={({ pressed }) => ({ minHeight: 58, paddingVertical: 8, borderBottomWidth: 1, borderColor: p.line, flexDirection: "row", alignItems: "center", gap: 12, opacity: pressed ? 0.7 : 1 })}>
    {leading}
    <View style={{ flex: 1, minWidth: 0 }}>
      <Copy style={{ fontSize: 15, fontWeight: "600" }}>{title}</Copy>
      {!!subtitle && <Copy muted style={{ fontSize: 12 }}>{subtitle}</Copy>}
    </View>
    <Icon name="right" color={p.muted} size={17} />
  </Pressable>;
}

function externalPlace(place: SearchResult | NearbyPlace, location?: string): NearbyPlace {
  return { id: place.id, name: place.name, latitude: place.latitude, longitude: place.longitude,
    kind: "place", category: place.category, detail: place.detail,
    source: place.source ?? "OpenStreetMap", sourceUrl: place.sourceUrl,
    location: "location" in place ? place.location : location };
}

export function MapScreen() {
  const p = usePalette();
  const language = useAppLanguage();
  const { destination, place, external, suggestion, q, lat, lon, name, pinKind, category, detail, sourceUrl, location, country: routeCountry, city: routeCity, day: dayParam } = useLocalSearchParams<{ destination?: string; place?: string; external?: string; suggestion?: string; q?: string; lat?: string; lon?: string; name?: string; pinKind?: string; category?: string; detail?: string; sourceUrl?: string; location?: string; country?: string; city?: string; day?: string }>();
  const { saved, savedPlaces, toggleSaved, externalPlaces, toggleExternalPlace, trip, activities, addActivity, removeActivity } = useTravel();
  const tripAreas = useTripAreas(trip);
  const itineraryDay = trip ? Math.min(Math.max(1, Math.trunc(Number(dayParam)) || 1), tripDays(trip.start, trip.end)) : 1;
  const initialExternal = externalPlaces.find((item) => item.id === external);
  const initialPlace = places.find((item) => item.id === place);
  const initialDestination = destinations.find((item) => item.id === initialPlace?.destinationId);
  const routePin: MapPin | undefined = useMemo(() => lat && lon && Number.isFinite(Number(lat)) && Number.isFinite(Number(lon)) &&
    Math.abs(Number(lat)) <= 90 && Math.abs(Number(lon)) <= 180
    ? { id: `route:${lat}:${lon}`, name: name || "Selected city", latitude: Number(lat), longitude: Number(lon), kind: pinKind === "place" ? "place" : "destination" }
    : undefined, [lat, lon, name, pinKind]);
  const suggestedPlace = useMemo<NearbyPlace | undefined>(() => suggestion && routePin?.kind === "place" && sourceUrl
    ? { ...routePin, id: suggestion, kind: "place", category: category || "Place", detail: detail || "", source: sourceUrl.includes("wikipedia.org") ? "Wikipedia" : "OpenStreetMap", sourceUrl, location }
    : undefined, [suggestion, routePin, category, detail, sourceUrl, location]);
  const initialPin = useMemo(() => initialExternal ?? suggestedPlace ?? routePin ?? (place ? undefined : destinationPins.find((pin) => pin.id === destination)), [initialExternal, suggestedPlace, routePin, place, destination]);
  const [query, setQuery] = useState(initialPlace && initialDestination ? `${initialPlace.name}, ${initialDestination.name}, ${initialDestination.country}` : q || "");
  const [region, setRegion] = useState("Worldwide");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<MapPin | undefined>(initialPin);
  const [preview, setPreview] = useState<SearchResult | NearbyPlace | (typeof destinations)[number] | null>(initialExternal ?? suggestedPlace ?? null);
  const [nearby, setNearby] = useState<NearbyPlace[]>([]);
  const [nearbyCenter, setNearbyCenter] = useState<MapPin | null>(initialPin?.kind === "destination" ? initialPin : null);
  const [nearbyStatus, setNearbyStatus] = useState<"idle" | "loading" | "ready" | "error">(initialPin?.kind === "destination" ? "loading" : "idle");
  const [nearbyVisibleCount, setNearbyVisibleCount] = useState(12);
  const [countryVisibleCount, setCountryVisibleCount] = useState(24);
  const [busy, setBusy] = useState(!!place || !!q);
  const [error, setError] = useTimedMessage();
  const [searched, setSearched] = useState(false);
  const [selectedDay, setSelectedDay] = useState(1);
  const [addedDays, setAddedDays] = useState<number[]>([]);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useTimedMessage();
  const [globeActive, setGlobeActive] = useState(false);
  const visibleCountries = useMemo(() => countries.filter((item) => region === "Worldwide" || region === "US states" && item.code === "US" || continents[region]?.includes(item.continent)), [region]);
  const countryQuery = normalizeSearchText(query.trim());
  const queryCountries = useMemo(() => countryQuery.length < 2 ? [] : countries.filter((item) =>
    normalizeSearchText(`${item.name} ${translate(item.name, language)}`).includes(countryQuery)), [countryQuery, language]);
  const queryCities = useMemo(() => countryQuery.length < 2 ? [] : searchCities(countryQuery, 8), [countryQuery]);
  const highlighted = useMemo(() => queryCountries.length ? queryCountries.map((item) => item.code)
    : region === "Worldwide" ? null : visibleCountries.map((item) => item.code), [queryCountries, region, visibleCountries]);
  const topCountry = queryCountries[0];
  const globeFocus = useMemo<GlobeFocus | null>(() => {
    if (selected) return { key: `pin:${selected.id}`, latitude: selected.latitude, longitude: selected.longitude, zoom: selected.kind === "place" ? 4.5 : selected.kind === "state" ? 3 : 3.6 };
    const anchor = topCountry ? countryAnchor(topCountry) : null;
    if (topCountry && anchor) return { key: `country:${topCountry.code}`, ...anchor, zoom: queryCountries.length === 1 ? 3 : 2.2 };
    const center = regionCenters[region];
    return center ? { key: `region:${region}`, ...center } : null;
  }, [selected, topCountry, queryCountries.length, region]);
  // Cities and countries have their own lists above; the place list keeps only what those lists cannot open.
  const placeResults = results.filter((item) => item.category !== "Country" && !(item.category === "City" && queryCities.length));
  const globeDots = useMemo(() => [...results, ...nearby].map((item) => ({ id: item.id, latitude: item.latitude, longitude: item.longitude })), [results, nearby]);
  const openCountry = useCallback((code: string) => router.push({ pathname: "/country", params: { code } } as Href), []);
  const compatibleDays = (item: MapPin) => trip ? Array.from({ length: tripDays(trip.start, trip.end) }, (_, index) => index + 1)
    .filter((day) => placeFitsTripDay(trip, day, { ...item, placeId: place || external || item.id }, tripAreas)) : [];
  const openPreview = (item: SearchResult | NearbyPlace | (typeof destinations)[number]) => {
    setPreview(item);
    const days = "latitude" in item ? compatibleDays(item) : [];
    setSelectedDay(days.includes(itineraryDay) ? itineraryDay : days[0] || 1);
    setAddedDays([]);
    setActionError("");
  };
  const activityKey = preview ? (place || external || preview.id) : "";
  const existingActivities = preview && activityKey
    ? activities.filter((activity) => activity.placeId === activityKey)
    : [];
  const existingDays = [...new Set(existingActivities.map((activity) => activity.day))].sort((a, b) => a - b);
  const savePlace = async (item: SearchResult | NearbyPlace) => {
    setActionBusy(true);
    setActionError("");
    try { await toggleExternalPlace(externalPlace(item, nearbyCenter?.name ?? item.detail.split(",").slice(1).join(",").trim())); }
    catch (caught) { setActionError(caught instanceof Error ? caught.message : "Could not save this place."); }
    finally { setActionBusy(false); }
  };
  const addPlaceToTrip = async (item: SearchResult | NearbyPlace) => {
    const key = place || external || item.id;
    if (activities.some((activity) => activity.placeId === key && activity.day === selectedDay)) {
      setActionError(formatMessage("This place is already on Day {day}.", { day: selectedDay }, language));
      return;
    }
    setActionBusy(true);
    setActionError("");
    try {
      const slot = nextActivitySlot(activities, selectedDay);
      await addActivity({ day: selectedDay, ...slot, name: item.name, note: `${item.detail} · ${item.sourceUrl}`,
        placeId: key, latitude: item.latitude, longitude: item.longitude });
      setAddedDays((days) => [...days, selectedDay]);
    } catch (caught) { setActionError(caught instanceof Error ? caught.message : "Could not add this place."); }
    finally { setActionBusy(false); }
  };
  const removePlaceFromDay = async (targetDay: number) => {
    const matches = existingActivities.filter((activity) => activity.day === targetDay);
    if (!matches.length) return;
    setActionBusy(true);
    setActionError("");
    try {
      await Promise.all(matches.map((activity) => removeActivity(activity.id)));
      setPreview(null);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Could not remove this place from the itinerary.");
    } finally { setActionBusy(false); }
  };
  const selectCenter = (pin?: MapPin) => {
    setSelected(pin);
    if (!pin) {
      setNearbyCenter(null);
      setNearby([]);
      setNearbyStatus("idle");
      return;
    }
    if (pin.kind === "place" || pin.kind === "state") {
      setNearbyCenter(null);
      setNearby([]);
      setNearbyStatus("idle");
      return;
    }
    setNearbyCenter(pin);
    setNearby([]);
    setNearbyVisibleCount(12);
    setNearbyStatus("loading");
  };
  useEffect(() => {
    if (!nearbyCenter) return;
    let current = true;
    const timer = setTimeout(() => {
      loadNearbyPlaces(nearbyCenter).then((places) => {
        if (!current) return;
        // The searched place is the centre of the list, not one of its neighbours.
        setNearby(places.filter((item) => item.id !== nearbyCenter.id && item.name !== nearbyCenter.name));
        setNearbyStatus("ready");
      }).catch(() => { if (current) setNearbyStatus("error"); });
    }, 350);
    return () => { current = false; clearTimeout(timer); };
  }, [nearbyCenter]);

  useEffect(() => {
    const record = places.find((item) => item.id === place);
    const parent = destinations.find((item) => item.id === record?.destinationId);
    const search = record && parent ? record.name : q;
    if (!search) return;
    let cancelled = false;
    (record && parent ? searchCatalogPlace(record) : searchMap(search)).then((matches) => {
      if (cancelled) return;
      setQuery(record && parent ? `${record.name}, ${parent.name}, ${parent.country}` : search);
      setResults(matches);
      if (record) {
        selectCenter(destinationPins.find((pin) => pin.id === record.destinationId));
        if (matches[0]) {
          setSelected(matches[0]);
          setPreview(matches[0]);
        }
      } else selectCenter(matches[0]);
      setSearched(true);
      if (!matches.length) setError(record ? "The exact location of this place could not be verified on the map." : "No locations found. Try a more specific search.");
    }).catch(() => { if (!cancelled) setError("This place could not be located on the map right now."); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [place, q, setError]);

  const search = async () => {
    Keyboard.dismiss();
    if (!query.trim() || busy) return;
    const state = usStatePins.find((pin) => normalizeSearchText(pin.name.split(",")[0]) === normalizeSearchText(query.trim()));
    if (state) {
      setRegion("US states");
      setError("");
      setResults([]);
      setSearched(false);
      selectCenter(state);
      return;
    }
    setBusy(true);
    setError("");
    setSearched(true);
    setResults([]);
    selectCenter(undefined);
    try {
      const matches = await searchMap(query);
      setResults(matches);
      selectCenter(matches[0]);
    } catch (caught) {
      setError(caught instanceof Error && caught.name !== "AbortError" ? caught.message : "Map search timed out. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const openDirections = async (pin: MapPin) => {
    const coordinates = `${pin.latitude},${pin.longitude}`;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(coordinates)}`;
    try { await Linking.openURL(url); }
    catch { setError("Could not open directions on this device."); }
  };
  const planPlace = (item: SearchResult | NearbyPlace) => {
    const linkedCity = cityForId(routeCountry ?? "", routeCity ?? "");
    const centerCity = nearbyCenter?.countryCode ? cityForId(nearbyCenter.countryCode, nearbyCenter.id) : undefined;
    const city = linkedCity ?? centerCity;
    const catalogCenter = destinations.find((entry) => entry.id === nearbyCenter?.id);
    setPreview(null);
    if (city) router.push({ pathname: "/planner", params: { country: city.countryCode, city: city.id } } as Href);
    else if (catalogCenter) router.push({ pathname: "/planner", params: { destination: catalogCenter.id } } as Href);
    else router.push({ pathname: "/planner", params: {
      stopId: item.id, stopName: item.name,
      stopCountry: countryForCode(item.countryCode)?.name ?? "Worldwide",
      stopLatitude: String(item.latitude), stopLongitude: String(item.longitude),
    } } as Href);
  };

  return <Screen active="map" style={{ gap: 16 }} scrollEnabled={!globeActive}>
    <Header title="Map" back={false} centered />
    <Row style={{ gap: 8 }}>
      <Row style={{ flex: 1, minWidth: 0, borderWidth: 1, borderColor: p.line, borderRadius: 16, backgroundColor: p.white, paddingHorizontal: 14, gap: 8 }}>
        <Icon name="search" color={p.muted} size={18} />
        <TextInput accessibilityLabel={translate("Search the world map", language)} placeholder={translate("Country, city or place", language)} placeholderTextColor={p.muted} value={query} onChangeText={setQuery} onSubmitEditing={() => void search()} returnKeyType="search" style={{ flex: 1, height: 45, fontSize: 14, color: p.ink }} />
      </Row>
      <Button onPress={() => void search()} disabled={!query.trim()} busy={busy} style={{ minWidth: 76 }}>Search</Button>
    </Row>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>
      {regions.map((item) => <Chip key={item} selected={region === item} onPress={() => { setRegion(item); setCountryVisibleCount(24); setSelected(undefined); setNearby([]); setNearbyCenter(null); setNearbyStatus("idle"); setResults([]); setError(""); setSearched(false); }}>{translate(item, language)}</Chip>)}
    </ScrollView>
    <CountryGlobe
      countries={countries}
      highlighted={highlighted}
      focus={globeFocus}
      marker={selected}
      dots={globeDots}
      onInteraction={setGlobeActive}
      onSelect={openCountry}
    />
    {!!queryCountries.length && <View>
      <Copy style={{ fontSize: 17, fontWeight: "700", marginBottom: 2 }}>{translate("Countries", language)}</Copy>
      {queryCountries.slice(0, 5).map((item) => <ResultRow key={item.code} label={`${translate("Country", language)}: ${translate(item.name, language)}`}
        leading={<Copy style={{ fontSize: 24, width: 28, textAlign: "center" }}>{countryFlag(item.code)}</Copy>}
        title={translate(item.name, language)}
        subtitle={`${item.cityCount.toLocaleString(language === "ro" ? "ro-RO" : "en-US")} ${language === "ro" ? "orașe" : "cities"}`}
        onPress={() => { Keyboard.dismiss(); openCountry(item.code); }} />)}
    </View>}
    {!!queryCities.length && <View>
      <Copy style={{ fontSize: 17, fontWeight: "700", marginBottom: 2 }}>{translate("Cities", language)}</Copy>
      {queryCities.map((city) => <ResultRow key={city.id} label={translateAccessibility(`Explore ${city.name}`, language)}
        leading={<View style={{ width: 28, alignItems: "center" }}><Icon name="city" color={p.green} size={19} /></View>}
        title={translate(city.name, language)}
        subtitle={[`${countryFlag(city.countryCode)} ${translate(countryForCode(city.countryCode)?.name ?? city.countryCode, language)}`,
          city.population > 0 ? `${translate("Population", language)} ${city.population.toLocaleString(language === "ro" ? "ro-RO" : "en-US")}` : ""].filter(Boolean).join(" · ")}
        onPress={() => { Keyboard.dismiss(); router.push({ pathname: "/city", params: { country: city.countryCode, city: city.id } } as Href); }} />)}
    </View>}
    {selected && <Row style={{ gap: 11, justifyContent: "space-between" }}>
      <View style={{ flex: 1, minWidth: 0 }}><Copy style={{ fontWeight: "700" }}>{selected.name}</Copy><Copy muted style={{ fontSize: 11 }}>{selected.kind === "place" ? "Place" : selected.kind === "city" ? "City" : selected.kind === "state" ? translate("State", language) : selected.kind === "destination" ? "Destination" : "Search result"}</Copy></View>
      {selected.kind === "city" && selected.countryCode && <Button secondary icon="city" onPress={() => router.push({ pathname: "/city", params: { country: selected.countryCode, city: selected.id } } as Href)}>Explore</Button>}
      {selected.kind === "state" && selected.stateCode && <Button secondary icon="city" onPress={() => router.push({ pathname: "/country", params: { code: "US", state: selected.stateCode } } as Href)}>{translate("Cities", language)}</Button>}
      {selected.kind !== "state" && <Button secondary icon="map" onPress={() => void openDirections(selected)} style={{ minWidth: 115 }}>Directions</Button>}
    </Row>}
    {!!error && <Copy style={{ color: p.danger }}>{error}</Copy>}
    {searched && !busy && !error && !results.length && !queryCities.length && !queryCountries.length && <Copy muted>No locations found. Try a more specific search.</Copy>}
    {!!placeResults.length && <View>
      <Copy style={{ fontSize: 17, fontWeight: "700", marginBottom: 2 }}>{translate("Places", language)}</Copy>
      {placeResults.map((item) => <ResultRow key={item.id} label={translateAccessibility(`Preview ${item.detail}`, language)}
        leading={<PlaceThumbnail name={item.name} location={item.detail.split(",").slice(1).join(",").trim()} latitude={item.latitude} longitude={item.longitude} sourceUrl={item.sourceUrl} venue={venueFromCategory(item.category)} />}
        title={item.name}
        subtitle={[translate(item.category === "Location" ? "Place" : item.category.replace(/^\w/, (letter) => letter.toUpperCase()), language), item.detail.split(",").slice(1).join(",").trim()].filter(Boolean).join(" · ")}
        onPress={() => { Keyboard.dismiss(); selectCenter(item); openPreview(item); }} />)}
    </View>}
    {nearbyStatus !== "idle" && <View style={{ gap: 7 }}>
      <Copy style={{ fontSize: 17, fontWeight: "700" }}>{formatMessage("Near {city}", { city: nearbyCenter?.name.split(",")[0] || "" }, language)}</Copy>
      {nearbyStatus === "loading" && <SkeletonRows count={4} />}
      {nearbyStatus === "error" && <Copy muted>Nearby places are unavailable right now.</Copy>}
      {nearbyStatus === "ready" && !nearby.length && <Copy muted>No nearby places found in this area.</Copy>}
      <View>{nearby.slice(0, nearbyVisibleCount).map((item) => <ResultRow key={item.id} label={translateAccessibility(`Preview ${item.name}`, language)}
        leading={<PlaceThumbnail name={item.name} location={nearbyCenter?.name ?? ""} latitude={item.latitude} longitude={item.longitude} sourceUrl={item.sourceUrl} />}
        title={item.name} subtitle={placeDetail(item.detail, language)} onPress={() => { setSelected(item); openPreview(item); }} />)}</View>
      {nearbyVisibleCount < nearby.length && <Button secondary icon="plus" onPress={() => setNearbyVisibleCount((count) => count + 12)}>Show more places</Button>}
    </View>}
    <>
    <Copy style={{ fontSize: 17, fontWeight: "700" }}>{translate(region === "US states" ? "US states" : "Countries", language)}</Copy>
    {region === "US states" ? <View style={{ gap: 3 }}>
      {usStates.slice(0, countryVisibleCount).map((state) => <Pressable key={state.code} accessibilityRole="button" accessibilityLabel={`${state.name}, ${state.cityCount} cities`} onPress={() => router.push({ pathname: "/country", params: { code: "US", state: state.code } } as Href)} style={{ borderBottomWidth: 1, borderColor: p.line, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Icon name="map" color={p.green} size={18} /><View style={{ flex: 1, minWidth: 0 }}><Copy style={{ fontWeight: "600" }}>{state.name}</Copy><Copy muted style={{ fontSize: 12 }}>{state.cityCount.toLocaleString(language === "ro" ? "ro-RO" : "en-US")} {language === "ro" ? "orașe" : "cities"}</Copy></View><Icon name="right" color={p.blue} size={17} />
      </Pressable>)}
      {countryVisibleCount < usStates.length && <Button secondary icon="plus" onPress={() => setCountryVisibleCount((count) => count + 24)}>{translate("Show more states", language)}</Button>}
    </View> : <>
      <CountryGrid countries={visibleCountries.slice(0, countryVisibleCount)} onSelect={(code) => router.push({ pathname: "/country", params: { code } } as Href)} />
    {countryVisibleCount < visibleCountries.length && <Button secondary icon="plus" onPress={() => setCountryVisibleCount((count) => count + 24)}>{translate("Show more countries", language)}</Button>}
    </>}
    </>
    <Sheet visible={!!preview} title={preview?.name || ""} onClose={() => setPreview(null)}>
      {preview && ("country" in preview ? <>
        <DestinationPhoto destination={preview} style={{ width: "100%", height: 215, borderRadius: 6 }} />
        <Copy muted>{preview.country} · {preview.region}</Copy>
        <Copy>{preview.description}</Copy>
        <Button secondary icon={saved.includes(preview.id) ? "heartFill" : "heart"} onPress={() => toggleSaved(preview.id)}>{saved.includes(preview.id) ? "Saved" : "Save destination"}</Button>
        <Button secondary icon="map" onPress={() => setPreview(null)}>View on map</Button>
        <Button secondary onPress={() => { setPreview(null); router.push({ pathname: "/trip", params: { id: preview.id } } as Href); }}>Explore destination</Button>
        <Button onPress={() => { setPreview(null); router.push({ pathname: "/planner", params: { destination: preview.id } } as Href); }}>Plan a trip here</Button>
      </> : <>
        <PlacePreviewPhoto name={preview.name} location={"location" in preview && preview.location ? preview.location : "source" in preview ? nearbyCenter?.name ?? "" : preview.detail.split(",").slice(1).join(",").trim()} latitude={preview.latitude} longitude={preview.longitude} sourceUrl={preview.sourceUrl} badge={placeBadge(preview.category, preview.detail, language)} venue={venueFromCategory(preview.category)} />
        <Button secondary icon={savedPlaces.includes(preview.id) ? "heartFill" : "heart"} busy={actionBusy} onPress={() => void savePlace(preview)}>{savedPlaces.includes(preview.id) ? "Saved · tap to remove" : "Save place"}</Button>
        {trip && existingActivities.length ? <>
          <Copy style={{ fontWeight: "600" }}>Already in your itinerary</Copy>
          {existingDays.map((targetDay) => <Button key={targetDay} secondary icon="trash" busy={actionBusy} onPress={() => void removePlaceFromDay(targetDay)}>
            {formatMessage("Remove from Day {day}", { day: targetDay }, language)}
          </Button>)}
        </> : trip && compatibleDays(preview).length ? <>
          <Copy style={{ fontWeight: "600" }}>Add to your trip</Copy>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
            {compatibleDays(preview).map((day) => <Chip key={day} selected={selectedDay === day} onPress={() => setSelectedDay(day)}>Day {day} · {routeStopForDay(trip, day).name}</Chip>)}
          </View>
          <Button icon={addedDays.includes(selectedDay) ? "check" : "plus"} busy={actionBusy} disabled={addedDays.includes(selectedDay)} onPress={() => void addPlaceToTrip(preview)}>{addedDays.includes(selectedDay) ? formatMessage("Added to Day {day}", { day: selectedDay }, language) : "Add to itinerary"}</Button>
          {!!addedDays.length && <Button secondary onPress={() => { setPreview(null); router.push("/itinerary" as Href); }}>View itinerary</Button>}
        </> : <>{trip && <Copy muted>Each day of your trip only takes places in the city planned for it, and this place is in none of them. Plan a new route to visit it.</Copy>}<Button onPress={() => planPlace(preview)}>{trip ? "Plan a new route" : "Plan a trip"}</Button></>}
        <Button secondary icon="map" onPress={() => void openDirections(preview)}>Google Maps directions</Button>
        {!!actionError && <Copy style={{ color: p.danger }}>{actionError}</Copy>}
      </>)}
    </Sheet>
  </Screen>;
}
