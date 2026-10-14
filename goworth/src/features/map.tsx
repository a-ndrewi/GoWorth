import { router, useLocalSearchParams, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, Platform, Pressable, ScrollView, TextInput, View, useWindowDimensions } from "react-native";
import { Button, Chip, Copy, DestinationPhoto, Header, Icon, Row, Screen, Sheet } from "@/components/goworth/ui";
import { PlacePreviewPhoto } from "@/components/goworth/place-preview";
import { MapSurface } from "@/components/goworth/map-surface";
import { palette as p } from "@/constants/design";
import { destinations, places, tripDays } from "@/data/travel";
import { destinationPins, searchCatalogPlace, searchMap, type MapPin, type SearchResult } from "@/data/map";
import { loadNearbyPlaces, type NearbyPlace } from "@/data/nearby-places";
import { useTravel } from "@/state/travel-context";

const regions = ["Worldwide", "Europe", "Asia", "Americas", "Africa", "Oceania"];

function externalPlace(place: SearchResult | NearbyPlace, location?: string): NearbyPlace {
  return { id: place.id, name: place.name, latitude: place.latitude, longitude: place.longitude,
    kind: "place", category: place.category, detail: place.detail,
    source: "source" in place ? place.source : "OpenStreetMap", sourceUrl: place.sourceUrl,
    location: "location" in place ? place.location : location };
}

export function MapScreen() {
  const { width } = useWindowDimensions();
  const { destination, place, external, q } = useLocalSearchParams<{ destination?: string; place?: string; external?: string; q?: string }>();
  const { saved, savedPlaces, toggleSaved, externalPlaces, toggleExternalPlace, trip, addActivity } = useTravel();
  const initialExternal = externalPlaces.find((item) => item.id === external);
  const initialPlace = places.find((item) => item.id === place);
  const initialDestination = destinations.find((item) => item.id === initialPlace?.destinationId);
  const initialPin = initialExternal ?? (place ? undefined : destinationPins.find((pin) => pin.id === destination));
  const [query, setQuery] = useState(initialPlace && initialDestination ? `${initialPlace.name}, ${initialDestination.name}, ${initialDestination.country}` : q || "");
  const [region, setRegion] = useState("Worldwide");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<MapPin | undefined>(initialPin);
  const [preview, setPreview] = useState<SearchResult | NearbyPlace | (typeof destinations)[number] | null>(initialExternal ?? null);
  const [nearby, setNearby] = useState<NearbyPlace[]>([]);
  const [nearbyCenter, setNearbyCenter] = useState<MapPin | null>(initialPin?.kind === "destination" ? initialPin : null);
  const [nearbyStatus, setNearbyStatus] = useState<"idle" | "loading" | "ready" | "error">(initialPin?.kind === "destination" ? "loading" : "idle");
  const [nearbyVisibleCount, setNearbyVisibleCount] = useState(12);
  const [busy, setBusy] = useState(!!place || !!q);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [selectedDay, setSelectedDay] = useState(1);
  const [addedDays, setAddedDays] = useState<number[]>([]);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const visibleDestinations = destinations.filter((item) => region === "Worldwide" || item.region === region);
  const pins = [...new Map([...destinationPins.filter((pin) => visibleDestinations.some((item) => item.id === pin.id)), ...results, ...nearby, ...externalPlaces].map((pin) => [pin.id, pin])).values()];
  const openPreview = (item: SearchResult | NearbyPlace | (typeof destinations)[number]) => {
    setPreview(item);
    setSelectedDay(1);
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
      if (!savedPlaces.includes(item.id)) await toggleExternalPlace(externalPlace(item, nearbyCenter?.name ?? item.detail.split(",").slice(1).join(",").trim()));
      await addActivity({ day: selectedDay, period: "Afternoon", time: "13:00", name: item.name, note: `${item.detail} · ${item.sourceUrl}` });
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
    if (pin.kind === "place") return;
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
    const url = Platform.OS === "ios"
      ? `https://maps.apple.com/?daddr=${encodeURIComponent(coordinates)}`
      : Platform.OS === "android"
        ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(coordinates)}`
        : `https://www.openstreetmap.org/directions?to=${encodeURIComponent(coordinates)}`;
    try { await Linking.openURL(url); }
    catch { setError("Could not open directions on this device."); }
  };

  return <Screen active="map" style={{ gap: 16 }}>
    <Header title="Map" back={false} />
    <Row style={{ gap: 8 }}>
      <Row style={{ flex: 1, minWidth: 0, borderWidth: 1, borderColor: p.line, borderRadius: 6, paddingHorizontal: 12, gap: 8 }}>
        <Icon name="search" color={p.muted} size={18} />
        <TextInput accessibilityLabel="Search the world map" placeholder="Country, city or place" placeholderTextColor={p.muted} value={query} onChangeText={setQuery} onSubmitEditing={() => void search()} returnKeyType="search" style={{ flex: 1, height: 45, fontSize: 14, color: p.ink }} />
      </Row>
      <Button onPress={() => void search()} disabled={!query.trim()} busy={busy} style={{ minWidth: 76 }}>Search</Button>
    </Row>
    <View style={{ height: Math.min(390, Math.max(280, width * 0.72)), borderRadius: 8, overflow: "hidden", borderWidth: 1, borderColor: p.line, backgroundColor: p.greenSoft }}>
      <MapSurface pins={pins} selected={selected} onSelect={(pin) => {
        if (pin.kind === "place") setSelected(pin);
        else selectCenter(pin);
        const place = nearby.find((item) => item.id === pin.id) ?? externalPlaces.find((item) => item.id === pin.id) ?? results.find((item) => item.id === pin.id);
        if (place) openPreview(place);
      }} />
    </View>
    <Copy muted style={{ fontSize: 11 }}>Map data © OpenStreetMap contributors · Tiles © OpenFreeMap</Copy>
    {selected && <Row style={{ gap: 11, justifyContent: "space-between" }}>
      <View style={{ flex: 1, minWidth: 0 }}><Copy style={{ fontWeight: "700" }}>{selected.name}</Copy><Copy muted style={{ fontSize: 11 }}>{selected.kind === "place" ? "Place" : selected.kind === "destination" ? "Destination" : "Search result"}</Copy></View>
      <Button secondary icon="map" onPress={() => void openDirections(selected)} style={{ minWidth: 115 }}>Directions</Button>
    </Row>}
    {!!error && <Copy style={{ color: p.danger }}>{error}</Copy>}
    {searched && !busy && !error && !results.length && <Copy muted>No locations found. Try a more specific search.</Copy>}
    {!!results.length && <View style={{ gap: 3 }}>
      <Copy style={{ fontSize: 17, fontWeight: "700" }}>Search results</Copy>
      {results.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Preview ${item.detail}`} onPress={() => { selectCenter(item); openPreview(item); }} style={{ paddingVertical: 9, borderBottomWidth: 1, borderColor: p.line }}>
        <Copy style={{ fontWeight: "600" }}>{item.name}</Copy>
        <Copy muted style={{ fontSize: 12 }}>{item.detail}</Copy>
      </Pressable>)}
    </View>}
    {nearbyStatus !== "idle" && <View style={{ gap: 7 }}>
      <Copy style={{ fontSize: 17, fontWeight: "700" }}>Near {nearbyCenter?.name.split(",")[0]}</Copy>
      {nearbyStatus === "loading" && <Copy muted>Finding nearby places...</Copy>}
      {nearbyStatus === "error" && <Copy muted>Nearby places are unavailable right now.</Copy>}
      {nearbyStatus === "ready" && !nearby.length && <Copy muted>No nearby places found in this area.</Copy>}
      {nearby.slice(0, nearbyVisibleCount).map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Preview ${item.name}`} onPress={() => { setSelected(item); openPreview(item); }} style={{ paddingVertical: 9, borderBottomWidth: 1, borderColor: p.line }}>
        <Copy style={{ fontWeight: "600" }}>{item.name}</Copy>
        <Copy muted style={{ fontSize: 12 }}>{item.detail}</Copy>
      </Pressable>)}
      {nearbyVisibleCount < nearby.length && <Button secondary icon="plus" onPress={() => setNearbyVisibleCount((count) => count + 12)}>Show more places</Button>}
      {!!nearby.length && <Copy muted style={{ fontSize: 11 }}>Places from {nearby[0].source}</Copy>}
    </View>}
    <Copy style={{ fontSize: 17, fontWeight: "700" }}>Destinations</Copy>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>
      {regions.map((item) => <Chip key={item} selected={region === item} onPress={() => { setRegion(item); setSelected(undefined); setNearby([]); setNearbyCenter(null); setNearbyStatus("idle"); }}>{item}</Chip>)}
    </ScrollView>
    <View style={{ gap: 3 }}>
      {visibleDestinations.map((item) => <Row key={item.id} style={{ borderBottomWidth: 1, borderColor: p.line }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Preview ${item.name}`} onPress={() => { selectCenter(destinationPins.find((pin) => pin.id === item.id)); openPreview(item); }} style={{ flex: 1, paddingVertical: 12 }}>
          <Copy style={{ fontWeight: "600" }}>{item.name}</Copy><Copy muted style={{ fontSize: 12 }}>{item.country}</Copy>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Explore ${item.name}`} onPress={() => router.push({ pathname: "/trip", params: { id: item.id } } as Href)} style={{ padding: 12 }}><Icon name="right" color={p.blue} /></Pressable>
      </Row>)}
    </View>
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
        <PlacePreviewPhoto name={preview.name} location={"location" in preview && preview.location ? preview.location : "source" in preview ? nearbyCenter?.name ?? "" : preview.detail.split(",").slice(1).join(",").trim()} />
        <View style={{ gap: 5 }}>
          <Copy muted>{preview.category}{"source" in preview ? ` · ${preview.source}` : ""}</Copy>
          <Copy>{preview.detail}</Copy>
        </View>
        <Button secondary icon={savedPlaces.includes(preview.id) ? "heartFill" : "heart"} busy={actionBusy} onPress={() => void savePlace(preview)}>{savedPlaces.includes(preview.id) ? "Saved · tap to remove" : "Save place"}</Button>
        {trip ? <>
          <Copy style={{ fontWeight: "600" }}>Add to {destinations.find((item) => item.id === trip.destinationId)?.name} trip</Copy>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
            {Array.from({ length: tripDays(trip.start, trip.end) }, (_, index) => <Chip key={index} selected={selectedDay === index + 1} onPress={() => setSelectedDay(index + 1)}>Day {index + 1}</Chip>)}
          </View>
          <Button icon={addedDays.includes(selectedDay) ? "check" : "plus"} busy={actionBusy} disabled={addedDays.includes(selectedDay)} onPress={() => void addPlaceToTrip(preview)}>{addedDays.includes(selectedDay) ? `Added to Day ${selectedDay}` : "Add to itinerary"}</Button>
          {!!addedDays.length && <Button secondary onPress={() => { setPreview(null); router.push("/itinerary" as Href); }}>View itinerary</Button>}
        </> : <Button onPress={() => { setPreview(null); router.push("/planner" as Href); }}>Plan a trip</Button>}
        <Button secondary icon="map" onPress={() => void openDirections(preview)}>Directions</Button>
        <Button secondary icon="globe" onPress={() => void Linking.openURL(preview.sourceUrl)}>Open source</Button>
        {!!actionError && <Copy style={{ color: p.danger }}>{actionError}</Copy>}
      </>)}
    </Sheet>
  </Screen>;
}
