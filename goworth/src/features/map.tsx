import { router, useLocalSearchParams, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { Button, Chip, Copy, DestinationPhoto, Header, Icon, Row, Screen, Sheet } from "@/components/goworth/ui";
import { PlacePreviewPhoto } from "@/components/goworth/place-preview";
import { MapSurface } from "@/components/goworth/map-surface";
import { palette as p } from "@/constants/design";
import { destinations, places } from "@/data/travel";
import { destinationPins, searchMap, type MapPin, type SearchResult } from "@/data/map";

const regions = ["Worldwide", "Europe", "Asia", "Americas", "Africa", "Oceania"];

export function MapScreen() {
  const { destination, place, q } = useLocalSearchParams<{ destination?: string; place?: string; q?: string }>();
  const initialPlace = places.find((item) => item.id === place);
  const initialDestination = destinations.find((item) => item.id === initialPlace?.destinationId);
  const [query, setQuery] = useState(initialPlace && initialDestination ? `${initialPlace.name}, ${initialDestination.name}, ${initialDestination.country}` : q || "");
  const [region, setRegion] = useState("Worldwide");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<MapPin | undefined>(() => destinationPins.find((pin) => pin.id === destination));
  const [preview, setPreview] = useState<SearchResult | (typeof destinations)[number] | null>(null);
  const [busy, setBusy] = useState(!!place || !!q);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const visibleDestinations = destinations.filter((item) => region === "Worldwide" || item.region === region);
  const pins = destinationPins.filter((pin) => visibleDestinations.some((item) => item.id === pin.id));

  useEffect(() => {
    const record = places.find((item) => item.id === place);
    const parent = destinations.find((item) => item.id === record?.destinationId);
    const search = record && parent ? `${record.name}, ${parent.name}, ${parent.country}` : q;
    if (!search) return;
    let cancelled = false;
    searchMap(search).then((matches) => {
      if (cancelled) return;
      setQuery(search);
      setResults(matches);
      setSelected(matches[0]);
      setSearched(true);
      if (!matches.length) setError("This place could not be located on the map.");
    }).catch(() => { if (!cancelled) setError("This place could not be located on the map right now."); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [place, q]);

  const search = async () => {
    if (!query.trim() || busy) return;
    setBusy(true);
    setError("");
    setSearched(true);
    try {
      const matches = await searchMap(query);
      setResults(matches);
      setSelected(matches[0]);
    } catch (caught) {
      setError(caught instanceof Error && caught.name !== "AbortError" ? caught.message : "Map search timed out. Try again.");
    } finally {
      setBusy(false);
    }
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
    <View style={{ height: 360, borderRadius: 6, overflow: "hidden", borderWidth: 1, borderColor: p.line }}>
      <MapSurface pins={pins} selected={selected} />
    </View>
    <Copy muted style={{ fontSize: 11 }}>Map and search data © OpenStreetMap contributors</Copy>
    {!!error && <Copy style={{ color: p.danger }}>{error}</Copy>}
    {searched && !busy && !error && !results.length && <Copy muted>No locations found. Try a more specific search.</Copy>}
    {!!results.length && <View style={{ gap: 3 }}>
      <Copy style={{ fontSize: 17, fontWeight: "700" }}>Search results</Copy>
      {results.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Preview ${item.detail}`} onPress={() => { setSelected(item); setPreview(item); }} style={{ paddingVertical: 9, borderBottomWidth: 1, borderColor: p.line }}>
        <Copy style={{ fontWeight: "600" }}>{item.name}</Copy>
        <Copy muted style={{ fontSize: 12 }}>{item.detail}</Copy>
      </Pressable>)}
    </View>}
    <Copy style={{ fontSize: 17, fontWeight: "700" }}>Destinations</Copy>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>
      {regions.map((item) => <Chip key={item} selected={region === item} onPress={() => { setRegion(item); setSelected(undefined); }}>{item}</Chip>)}
    </ScrollView>
    <View style={{ gap: 3 }}>
      {visibleDestinations.map((item) => <Row key={item.id} style={{ borderBottomWidth: 1, borderColor: p.line }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Preview ${item.name}`} onPress={() => { setSelected(destinationPins.find((pin) => pin.id === item.id)); setPreview(item); }} style={{ flex: 1, paddingVertical: 12 }}>
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
        <Button secondary icon="map" onPress={() => setPreview(null)}>View on map</Button>
        <Button onPress={() => { setPreview(null); router.push({ pathname: "/trip", params: { id: preview.id } } as Href); }}>Explore destination</Button>
      </> : <>
        <PlacePreviewPhoto name={preview.name} location={preview.detail.split(",").slice(1).join(",").trim()} />
        <View style={{ gap: 5 }}>
          <Copy muted>{preview.kind}</Copy>
          <Copy>{preview.detail}</Copy>
        </View>
        <Button secondary icon="map" onPress={() => setPreview(null)}>View on map</Button>
      </>)}
    </Sheet>
  </Screen>;
}
