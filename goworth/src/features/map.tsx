import { router, useLocalSearchParams, type Href } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, TextInput, View, useWindowDimensions } from "react-native";
import { Button, Chip, Copy, DestinationPhoto, Header, Icon, Row, Screen, Sheet } from "@/components/goworth/ui";
import { PlacePreviewPhoto, PlaceThumbnail } from "@/components/goworth/place-preview";
import { MapSurface } from "@/components/goworth/map-surface";
import { palette as p } from "@/constants/design";
import { destinations, places, tripDays } from "@/data/travel";
import { destinationPins, worldCityPins, usStatePins, searchCatalogPlace, searchMap, type MapPin, type SearchResult } from "@/data/map";
import { countries, countryFlag, usStates } from "@/data/geography";
import { loadNearbyPlaces, type NearbyPlace } from "@/data/nearby-places";
import { useTravel } from "@/state/travel-context";
import { placeFitsTripDay } from "@/utils/trip-place";
import { routeStopForDay } from "@/data/trip-route";
import { formatMessage, translate, translateAccessibility } from "@/data/i18n";
import { useAppLanguage, type AppLanguage } from "@/data/formatting";
import { normalizeSearchText } from "@/utils/search";

const regions = ["Worldwide", "US states", "Europe", "Asia", "Americas", "Africa", "Oceania"];
const continents: Record<string, string[]> = { Europe: ["EU"], Asia: ["AS"], Americas: ["NA", "SA"], Africa: ["AF"], Oceania: ["OC"] };

function placeDetail(detail: string, language: AppLanguage) {
  if (language === "ro") {
    const nearby = detail.match(/^(.+) · (\d+(?:\.\d+)?) km away$/);
    if (nearby) return formatMessage("{category} · {distance} km away", { category: translate(nearby[1], language), distance: nearby[2].replace(".", ",") }, language);
    const wiki = detail.match(/^(\d+(?:\.\d+)?) km away · Wikipedia article$/);
    if (wiki) return formatMessage("{distance} km away · Wikipedia article", { distance: wiki[1].replace(".", ",") }, language);
  }
  return translate(detail, language);
}

function externalPlace(place: SearchResult | NearbyPlace, location?: string): NearbyPlace {
  return { id: place.id, name: place.name, latitude: place.latitude, longitude: place.longitude,
    kind: "place", category: place.category, detail: place.detail,
    source: place.source ?? "OpenStreetMap", sourceUrl: place.sourceUrl,
    location: "location" in place ? place.location : location };
}

export function MapScreen() {
  const language = useAppLanguage();
  const { width } = useWindowDimensions();
  const { destination, place, external, q, lat, lon, name, pinKind } = useLocalSearchParams<{ destination?: string; place?: string; external?: string; q?: string; lat?: string; lon?: string; name?: string; pinKind?: string }>();
  const { saved, savedPlaces, toggleSaved, externalPlaces, toggleExternalPlace, trip, addActivity } = useTravel();
  const initialExternal = externalPlaces.find((item) => item.id === external);
  const initialPlace = places.find((item) => item.id === place);
  const initialDestination = destinations.find((item) => item.id === initialPlace?.destinationId);
  const routePin: MapPin | undefined = useMemo(() => lat && lon && Number.isFinite(Number(lat)) && Number.isFinite(Number(lon)) &&
    Math.abs(Number(lat)) <= 90 && Math.abs(Number(lon)) <= 180
    ? { id: `route:${lat}:${lon}`, name: name || "Selected city", latitude: Number(lat), longitude: Number(lon), kind: pinKind === "place" ? "place" : "destination" }
    : undefined, [lat, lon, name, pinKind]);
  const initialPin = useMemo(() => initialExternal ?? routePin ?? (place ? undefined : destinationPins.find((pin) => pin.id === destination)), [initialExternal, routePin, place, destination]);
  const [query, setQuery] = useState(initialPlace && initialDestination ? `${initialPlace.name}, ${initialDestination.name}, ${initialDestination.country}` : q || "");
  const [region, setRegion] = useState("Worldwide");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<MapPin | undefined>(initialPin);
  const [preview, setPreview] = useState<SearchResult | NearbyPlace | (typeof destinations)[number] | null>(initialExternal ?? null);
  const [nearby, setNearby] = useState<NearbyPlace[]>([]);
  const [nearbyCenter, setNearbyCenter] = useState<MapPin | null>(initialPin?.kind === "destination" ? initialPin : null);
  const [nearbyStatus, setNearbyStatus] = useState<"idle" | "loading" | "ready" | "error">(initialPin?.kind === "destination" ? "loading" : "idle");
  const [nearbyVisibleCount, setNearbyVisibleCount] = useState(12);
  const [countryVisibleCount, setCountryVisibleCount] = useState(24);
  const [busy, setBusy] = useState(!!place || !!q);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [selectedDay, setSelectedDay] = useState(1);
  const [addedDays, setAddedDays] = useState<number[]>([]);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const visibleCountries = useMemo(() => countries.filter((item) => region === "Worldwide" || region === "US states" && item.code === "US" || continents[region]?.includes(item.continent)), [region]);
  const pins = useMemo(() => {
    const codes = new Set(visibleCountries.map((country) => country.code));
    const supplemental = region === "US states" ? [] : [...(initialPin ? [initialPin] : []), ...(routePin ? [routePin] : []), ...results, ...nearby, ...externalPlaces];
    return [...new Map([...worldCityPins.filter((pin) => codes.has(pin.countryCode ?? "")), ...(codes.has("US") ? usStatePins : []), ...supplemental].map((pin) => [pin.id, pin])).values()];
  }, [visibleCountries, region, initialPin, routePin, results, nearby, externalPlaces]);
  const compatibleDays = (item: MapPin) => trip ? Array.from({ length: tripDays(trip.start, trip.end) }, (_, index) => index + 1)
    .filter((day) => placeFitsTripDay(trip, day, item)) : [];
  const openPreview = (item: SearchResult | NearbyPlace | (typeof destinations)[number]) => {
    setPreview(item);
    setSelectedDay("latitude" in item ? compatibleDays(item)[0] || 1 : 1);
    setAddedDays([]);
    setActionError("");
  };
  const savePlace = async (item: SearchResult | NearbyPlace) => {
    setActionBusy(true);
    setActionError("");
    try { await toggleExternalPlace(externalPlace(item, nearbyCenter?.name ?? item.detail.split(",").slice(1).join(",").trim())); }
    catch (caught) { setActionError(caught instanceof Error ? caught.message : "Could not save this place."); }
    finally { setActionBusy(false); }
  };
  const addPlaceToTrip = async (item: SearchResult | NearbyPlace) => {
    setActionBusy(true);
    setActionError("");
    try {
      await addActivity({ day: selectedDay, period: "Afternoon", time: "13:00", name: item.name, note: `${item.detail} · ${item.sourceUrl}`,
        placeId: item.id, latitude: item.latitude, longitude: item.longitude });
      setAddedDays((days) => [...days, selectedDay]);
    } catch (caught) { setActionError(caught instanceof Error ? caught.message : "Could not add this place."); }
    finally { setActionBusy(false); }
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
        setNearby(places);
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
        if (matches[0]) setSelected(matches[0]);
      } else selectCenter(matches[0]);
      setSearched(true);
      if (!matches.length) setError(record ? "The exact location of this place could not be verified on the map." : "No locations found. Try a more specific search.");
    }).catch(() => { if (!cancelled) setError("This place could not be located on the map right now."); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [place, q]);

  const search = async () => {
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

  return <Screen active="map" style={{ gap: 16 }}>
    <Header title="Map" back={false} />
    <Row style={{ gap: 8 }}>
      <Row style={{ flex: 1, minWidth: 0, borderWidth: 1, borderColor: p.line, borderRadius: 6, paddingHorizontal: 12, gap: 8 }}>
        <Icon name="search" color={p.muted} size={18} />
        <TextInput accessibilityLabel={translate("Search the world map", language)} placeholder={translate("Country, city or place", language)} placeholderTextColor={p.muted} value={query} onChangeText={setQuery} onSubmitEditing={() => void search()} returnKeyType="search" style={{ flex: 1, height: 45, fontSize: 14, color: p.ink }} />
      </Row>
      <Button onPress={() => void search()} disabled={!query.trim()} busy={busy} style={{ minWidth: 76 }}>Search</Button>
    </Row>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>
      {regions.map((item) => <Chip key={item} selected={region === item} onPress={() => { setRegion(item); setCountryVisibleCount(24); setSelected(undefined); setNearby([]); setNearbyCenter(null); setNearbyStatus("idle"); setResults([]); setError(""); setSearched(false); }}>{translate(item, language)}</Chip>)}
    </ScrollView>
    <View style={{ height: Math.min(390, Math.max(280, width * 0.72)), borderRadius: 8, overflow: "hidden", borderWidth: 1, borderColor: p.line, backgroundColor: p.greenSoft }}>
      <MapSurface pins={pins} selected={selected} focus={region === "US states" ? "us" : undefined} onSelect={(pin) => {
        if (pin.kind === "place") setSelected(pin);
        else selectCenter(pin);
        const place = nearby.find((item) => item.id === pin.id) ?? externalPlaces.find((item) => item.id === pin.id) ?? results.find((item) => item.id === pin.id);
        if (place) openPreview(place);
      }} />
    </View>
    {selected && <Row style={{ gap: 11, justifyContent: "space-between" }}>
      <View style={{ flex: 1, minWidth: 0 }}><Copy style={{ fontWeight: "700" }}>{selected.name}</Copy><Copy muted style={{ fontSize: 11 }}>{selected.kind === "place" ? "Place" : selected.kind === "city" ? "City" : selected.kind === "state" ? translate("State", language) : selected.kind === "destination" ? "Destination" : "Search result"}</Copy></View>
      {selected.kind === "city" && selected.countryCode && <Button secondary icon="city" onPress={() => router.push({ pathname: "/city", params: { country: selected.countryCode, city: selected.id } } as Href)}>Explore</Button>}
      {selected.kind === "state" && selected.stateCode && <Button secondary icon="city" onPress={() => router.push({ pathname: "/country", params: { code: "US", state: selected.stateCode } } as Href)}>{translate("Cities", language)}</Button>}
      {selected.kind !== "state" && <Button secondary icon="map" onPress={() => void openDirections(selected)} style={{ minWidth: 115 }}>Directions</Button>}
    </Row>}
    {!!error && <Copy style={{ color: p.danger }}>{error}</Copy>}
    {searched && !busy && !error && !results.length && <Copy muted>No locations found. Try a more specific search.</Copy>}
    {!!results.length && <View style={{ gap: 3 }}>
      <Copy style={{ fontSize: 17, fontWeight: "700" }}>Search results</Copy>
      {results.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={translateAccessibility(`Preview ${item.detail}`, language)} onPress={() => { selectCenter(item); openPreview(item); }} style={{ paddingVertical: 9, borderBottomWidth: 1, borderColor: p.line }}>
        <Copy style={{ fontWeight: "600" }}>{item.name}</Copy>
        <Copy muted style={{ fontSize: 12 }}>{placeDetail(item.detail, language)}</Copy>
      </Pressable>)}
    </View>}
    {nearbyStatus !== "idle" && <View style={{ gap: 7 }}>
      <Copy style={{ fontSize: 17, fontWeight: "700" }}>{formatMessage("Near {city}", { city: nearbyCenter?.name.split(",")[0] || "" }, language)}</Copy>
      {nearbyStatus === "loading" && <Copy muted>Finding nearby places...</Copy>}
      {nearbyStatus === "error" && <Copy muted>Nearby places are unavailable right now.</Copy>}
      {nearbyStatus === "ready" && !nearby.length && <Copy muted>No nearby places found in this area.</Copy>}
      {nearby.slice(0, nearbyVisibleCount).map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={translateAccessibility(`Preview ${item.name}`, language)} onPress={() => { setSelected(item); openPreview(item); }} style={{ paddingVertical: 9, borderBottomWidth: 1, borderColor: p.line }}>
        <Row style={{ justifyContent: "space-between", gap: 9 }}><PlaceThumbnail name={item.name} location={nearbyCenter?.name ?? ""} latitude={item.latitude} longitude={item.longitude} sourceUrl={item.sourceUrl} /><View style={{ flex: 1, minWidth: 0 }}><Copy style={{ fontWeight: "600" }}>{item.name}</Copy><Copy muted style={{ fontSize: 12 }}>{placeDetail(item.detail, language)}</Copy></View>
          <Icon name="right" color={p.blue} size={16} /></Row>
      </Pressable>)}
      {nearbyVisibleCount < nearby.length && <Button secondary icon="plus" onPress={() => setNearbyVisibleCount((count) => count + 12)}>Show more places</Button>}
      {!!nearby.length && <Copy muted style={{ fontSize: 11 }}>{formatMessage("Places from {source}", { source: nearby[0].source }, language)}</Copy>}
    </View>}
    <Copy style={{ fontSize: 17, fontWeight: "700" }}>{translate(region === "US states" ? "US states" : "Countries", language)}</Copy>
    {region === "US states" ? <View style={{ gap: 3 }}>
      {usStates.slice(0, countryVisibleCount).map((state) => <Pressable key={state.code} accessibilityRole="button" accessibilityLabel={`${state.name}, ${state.cityCount} cities`} onPress={() => router.push({ pathname: "/country", params: { code: "US", state: state.code } } as Href)} style={{ borderBottomWidth: 1, borderColor: p.line, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Icon name="map" color={p.green} size={18} /><View style={{ flex: 1, minWidth: 0 }}><Copy style={{ fontWeight: "600" }}>{state.name}</Copy><Copy muted style={{ fontSize: 12 }}>{state.cityCount.toLocaleString(language === "ro" ? "ro-RO" : "en-US")} {language === "ro" ? "orașe" : "cities"}</Copy></View><Icon name="right" color={p.blue} size={17} />
      </Pressable>)}
      {countryVisibleCount < usStates.length && <Button secondary icon="plus" onPress={() => setCountryVisibleCount((count) => count + 24)}>{translate("Show more states", language)}</Button>}
    </View> : <><View style={{ gap: 3 }}>
      {visibleCountries.slice(0, countryVisibleCount).map((item) => <Row key={item.code} style={{ borderBottomWidth: 1, borderColor: p.line }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Explore ${item.name}`} onPress={() => router.push({ pathname: "/country", params: { code: item.code } } as Href)} style={{ flex: 1, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Copy style={{ fontSize: 25 }}>{countryFlag(item.code)}</Copy><View><Copy style={{ fontWeight: "600" }}>{translate(item.name, language)}</Copy><Copy muted style={{ fontSize: 12 }}>{item.cityCount.toLocaleString(language === "ro" ? "ro-RO" : "en-US")} {language === "ro" ? "orașe" : "cities"}</Copy></View>
        </Pressable>
        <Icon name="right" color={p.blue} />
      </Row>)}
    </View>
    {countryVisibleCount < visibleCountries.length && <Button secondary icon="plus" onPress={() => setCountryVisibleCount((count) => count + 24)}>{translate("Show more countries", language)}</Button>}
    </>}
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
        <PlacePreviewPhoto name={preview.name} location={"location" in preview && preview.location ? preview.location : "source" in preview ? nearbyCenter?.name ?? "" : preview.detail.split(",").slice(1).join(",").trim()} latitude={preview.latitude} longitude={preview.longitude} sourceUrl={preview.sourceUrl} />
        <View style={{ gap: 5 }}>
          <Copy muted>{preview.category}{"source" in preview ? ` · ${preview.source}` : ""}</Copy>
          <Copy>{placeDetail(preview.detail, language)}</Copy>
        </View>
        <Button secondary icon={savedPlaces.includes(preview.id) ? "heartFill" : "heart"} busy={actionBusy} onPress={() => void savePlace(preview)}>{savedPlaces.includes(preview.id) ? "Saved · tap to remove" : "Save place"}</Button>
        {trip && compatibleDays(preview).length ? <>
          <Copy style={{ fontWeight: "600" }}>Add to your trip</Copy>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
            {compatibleDays(preview).map((day) => <Chip key={day} selected={selectedDay === day} onPress={() => setSelectedDay(day)}>Day {day} · {routeStopForDay(trip, day).name}</Chip>)}
          </View>
          <Button icon={addedDays.includes(selectedDay) ? "check" : "plus"} busy={actionBusy} disabled={addedDays.includes(selectedDay)} onPress={() => void addPlaceToTrip(preview)}>{addedDays.includes(selectedDay) ? formatMessage("Added to Day {day}", { day: selectedDay }, language) : "Add to itinerary"}</Button>
          {!!addedDays.length && <Button secondary onPress={() => { setPreview(null); router.push("/itinerary" as Href); }}>View itinerary</Button>}
        </> : <>{trip && <Copy muted>This place is outside the cities assigned to your trip. Create a route with this city to add it.</Copy>}<Button onPress={() => { setPreview(null); router.push("/planner" as Href); }}>{trip ? "Plan a new route" : "Plan a trip"}</Button></>}
        <Button secondary icon="map" onPress={() => void openDirections(preview)}>Google Maps directions</Button>
        <Button secondary icon="globe" onPress={() => void Linking.openURL(preview.sourceUrl)}>Open source</Button>
        {!!actionError && <Copy style={{ color: p.danger }}>{actionError}</Copy>}
      </>)}
    </Sheet>
  </Screen>;
}
