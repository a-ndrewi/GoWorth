import { router, useLocalSearchParams, type Href } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Linking, Pressable, TextInput, View } from "react-native";
import { Button, Chip, Copy, EmptyState, Header, Icon, Row, Screen } from "@/components/goworth/ui";
import { PlacePreviewPhoto, PlaceThumbnail } from "@/components/goworth/place-preview";
import { palette as p } from "@/constants/design";
import { citiesForCountry, citiesForUsState, cityForId, countryFlag, countryForCode, usStates } from "@/data/geography";
import { loadNearbyPlaces, searchWikipediaPlaces, type NearbyPlace } from "@/data/nearby-places";
import { externalPlaceFromSaved } from "@/data/external-places";
import { useTravel } from "@/state/travel-context";
import { normalizeSearchText } from "@/utils/search";
import { useAppLanguage } from "@/data/formatting";
import { translate } from "@/data/i18n";

export function CountryScreen() {
  const language = useAppLanguage();
  const { code, state: routeState, search } = useLocalSearchParams<{ code?: string; state?: string; search?: string }>();
  const { exploreHistoryReady, recordCountryVisit } = useTravel();
  const country = countryForCode(code);
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(40);
  const [selectedStateCode, setSelectedStateCode] = useState<string | null>(routeState ?? null);
  const isUs = code === "US";
  const selectedState = isUs ? usStates.find((state) => state.code === selectedStateCode) : undefined;
  const cities = useMemo(() => code === "US" ? selectedStateCode ? citiesForUsState(selectedStateCode) : [] : citiesForCountry(code ?? ""), [code, selectedStateCode]);
  const filtered = useMemo(() => cities.filter((city) => normalizeSearchText(`${city.name} ${translate(city.name, language)}`).includes(normalizeSearchText(query))), [cities, query, language]);
  const filteredStates = isUs && !selectedState ? usStates.filter((state) => normalizeSearchText(state.name).includes(normalizeSearchText(query))) : [];
  useEffect(() => {
    if (country && exploreHistoryReady) recordCountryVisit(country.code, search);
  }, [country, exploreHistoryReady, recordCountryVisit, search]);
  if (!country) return <Screen><Header title={translate("Country unavailable", language)} /><EmptyState title={translate("Country not found", language)} detail={translate("Choose another country.", language)} action={translate("Explore countries", language)} onPress={() => router.replace("/home" as Href)} /></Screen>;
  return <Screen active="home" style={{ gap: 17 }}>
    <Header title={selectedState ? selectedState.name : `${countryFlag(country.code)}  ${translate(country.name, language)}`} subtitle={selectedState ? `${translate(country.name, language)} · ${selectedState.cityCount.toLocaleString(language === "ro" ? "ro-RO" : "en-US")} ${language === "ro" ? "orașe" : "cities"}` : `${country.cityCount.toLocaleString(language === "ro" ? "ro-RO" : "en-US")} ${language === "ro" ? "orașe" : "cities"}`} />
    {selectedState && <Button secondary icon="back" onPress={() => { setSelectedStateCode(null); setQuery(""); setVisibleCount(40); }}>{translate("All states", language)}</Button>}
    <Row style={{ borderWidth: 1, borderColor: p.line, borderRadius: 6, paddingHorizontal: 12, gap: 8 }}>
      <Icon name="search" color={p.muted} size={18} />
      <TextInput accessibilityLabel={`${translate(isUs && !selectedState ? "Search states" : "Search cities", language)}: ${country.name}`} placeholder={translate(isUs && !selectedState ? "Search states" : "Search cities", language)} placeholderTextColor={p.muted} value={query} onChangeText={(value) => { setQuery(value); setVisibleCount(40); }} style={{ flex: 1, minWidth: 0, height: 46, fontSize: 14, color: p.ink }} />
    </Row>
    {isUs && !selectedState ? <View style={{ gap: 1 }}>
      {filteredStates.map((state) => <Pressable key={state.code} accessibilityRole="button" accessibilityLabel={`${state.name}, ${state.cityCount} cities`} onPress={() => { setSelectedStateCode(state.code); setQuery(""); setVisibleCount(40); }} style={{ minHeight: 58, paddingVertical: 10, borderBottomWidth: 1, borderColor: p.line, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Icon name="map" color={p.green} size={19} />
        <View style={{ flex: 1, minWidth: 0 }}><Copy style={{ fontSize: 15, fontWeight: "600" }}>{state.name}</Copy><Copy muted style={{ fontSize: 11 }}>{state.cityCount.toLocaleString(language === "ro" ? "ro-RO" : "en-US")} {language === "ro" ? "orașe" : "cities"}</Copy></View>
        <Icon name="right" color={p.muted} size={17} />
      </Pressable>)}
      {!filteredStates.length && <EmptyState title={translate("No states found", language)} detail={translate("Try another state name.", language)} action={translate("Clear search", language)} onPress={() => setQuery("")} />}
    </View> : <>
    <View style={{ gap: 1 }}>
      {filtered.slice(0, visibleCount).map((city) => <Pressable key={city.id} accessibilityRole="button" accessibilityLabel={`Explore ${city.name}`} onPress={() => router.push({ pathname: "/city", params: { country: country.code, city: city.id } } as Href)} style={{ minHeight: 58, paddingVertical: 10, borderBottomWidth: 1, borderColor: p.line, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Icon name="city" color={p.green} size={19} />
        <View style={{ flex: 1, minWidth: 0 }}><Copy style={{ fontSize: 15, fontWeight: "600" }}>{translate(city.name, language)}</Copy>{city.population > 0 && <Copy muted style={{ fontSize: 11 }}>{translate("Population", language)} {city.population.toLocaleString(language === "ro" ? "ro-RO" : "en-US")}</Copy>}</View>
        <Icon name="right" color={p.muted} size={17} />
      </Pressable>)}
    </View>
    {!filtered.length && <EmptyState title={translate(query ? "No cities found" : "No indexed cities", language)} detail={translate(query ? "Try another city name." : "Search this country on the world map.", language)} action={translate(query ? "Clear search" : "Open map", language)} onPress={() => query ? setQuery("") : router.push({ pathname: "/map", params: { q: country.name } } as Href)} />}
    {visibleCount < filtered.length && <Button secondary icon="plus" onPress={() => setVisibleCount((count) => count + 40)}>{translate("Show more cities", language)}</Button>}
    </>}
  </Screen>;
}

export function CityScreen() {
  const language = useAppLanguage();
  const { country: code, city: id } = useLocalSearchParams<{ country?: string; city?: string }>();
  const country = countryForCode(code);
  const city = useMemo(() => cityForId(code ?? "", id ?? ""), [code, id]);
  const [result, setResult] = useState<{ key: string; places: NearbyPlace[]; status: "loading" | "ready" | "error" } | null>(null);
  const places = result && city && result.key === city.id ? result.places : [];
  const status = result && city && result.key === city.id ? result.status : "loading";
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [visibleCount, setVisibleCount] = useState(20);
  const [remote, setRemote] = useState<{ cityId: string; query: string; places: NearbyPlace[] } | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const searchId = useRef(0);
  useEffect(() => {
    if (!city) return;
    let active = true;
    loadNearbyPlaces(city, 10).then((items) => { if (active) setResult({ key: city.id, places: items, status: "ready" }); })
      .catch(() => { if (active) setResult({ key: city.id, places: [], status: "error" }); });
    return () => { active = false; };
  }, [city]);
  if (!country || !city) return <Screen><Header title={translate("City unavailable", language)} /><EmptyState title={translate("City not found", language)} detail={translate("Choose a city from a country.", language)} action={translate("Explore countries", language)} onPress={() => router.replace("/home" as Href)} /></Screen>;
  const categories = ["All", ...new Set(places.map((place) => place.category))];
  const filtered = places.filter((place) => (category === "All" || place.category === category) && normalizeSearchText(place.name).includes(normalizeSearchText(query)));
  const searchCity = async () => {
    const searchedQuery = query.trim();
    if (searchedQuery.length < 3 || searching) return;
    const requestId = ++searchId.current;
    setSearching(true);
    setSearchError("");
    setCategory("All");
    try {
      const results = await searchWikipediaPlaces(searchedQuery, city, 25);
      if (requestId === searchId.current) setRemote({ cityId: city.id, query: searchedQuery, places: results.map((result) => ({ ...result, location: `${city.name}, ${country.name}` })) });
    } catch { if (requestId === searchId.current) setSearchError(translate("Search is unavailable right now.", language)); }
    finally { if (requestId === searchId.current) setSearching(false); }
  };
  const searchResults = remote?.cityId === city.id && remote.query === query.trim() ? remote.places.filter((item) =>
    (category === "All" || item.category === category) && !filtered.some((place) => place.id === item.id)) : [];
  const openPlace = (place: NearbyPlace) => router.push({ pathname: "/place", params: {
    country: country.code, city: city.id, place: place.id,
    name: place.name, latitude: String(place.latitude), longitude: String(place.longitude),
    category: place.category, detail: place.detail, sourceUrl: place.sourceUrl,
    ...(query.trim() ? { search: query.trim() } : {}),
  } } as Href);
  return <Screen active="home" style={{ gap: 17 }}>
    <Header title={translate(city.name, language)} subtitle={`${city.stateCode ? `${usStates.find((state) => state.code === city.stateCode)?.name ?? city.stateCode} · ` : ""}${countryFlag(country.code)}  ${translate(country.name, language)}`} />
    <Button secondary icon="plus" onPress={() => router.push({ pathname: "/planner", params: { country: country.code, city: city.id } } as Href)}>Plan a trip</Button>
    <View style={{ gap: 8 }}><Row style={{ borderWidth: 1, borderColor: p.line, borderRadius: 6, paddingHorizontal: 12, gap: 8 }}><Icon name="search" color={p.muted} size={18} /><TextInput accessibilityLabel={`${translate("Search places", language)}: ${city.name}`} placeholder={translate("Search places", language)} placeholderTextColor={p.muted} value={query} onChangeText={(value) => { searchId.current++; setSearching(false); setSearchError(""); setQuery(value); setVisibleCount(20); }} onSubmitEditing={() => void searchCity()} returnKeyType="search" style={{ flex: 1, minWidth: 0, height: 46, fontSize: 14, color: p.ink }} /></Row><Button secondary icon="search" busy={searching} disabled={query.trim().length < 3} onPress={() => void searchCity()}>{translate("Search city", language)}</Button></View>
    <Row style={{ flexWrap: "wrap", gap: 6 }}>{categories.map((item) => <Chip key={item} selected={category === item} onPress={() => { setCategory(item); setVisibleCount(20); }}>{translate(item, language)}</Chip>)}</Row>
    {status === "loading" && <ActivityIndicator color={p.green} />}
    {status === "error" && <EmptyState title={translate("Places unavailable", language)} detail={translate("Check your connection and try again.", language)} action={translate("Retry", language)} onPress={() => { setResult({ key: city.id, places: [], status: "loading" }); loadNearbyPlaces(city, 10).then((items) => setResult({ key: city.id, places: items, status: "ready" })).catch(() => setResult({ key: city.id, places: [], status: "error" })); }} />}
    {status === "ready" && !filtered.length && !searchResults.length && !searching && (!query.trim() || remote?.query === query.trim()) && <EmptyState title={translate(query ? "No matching places" : "No places found nearby", language)} detail={translate("Try another search or explore the map.", language)} action={translate("Open map", language)} onPress={() => router.push({ pathname: "/map", params: { lat: String(city.latitude), lon: String(city.longitude), name: `${city.name}, ${country.name}` } } as Href)} />}
    <View style={{ gap: 1 }}>
      {filtered.slice(0, visibleCount).map((place) => <Pressable key={place.id} accessibilityRole="button" accessibilityLabel={`Explore ${place.name}`} onPress={() => openPlace(place)} style={{ minHeight: 67, paddingVertical: 7, borderBottomWidth: 1, borderColor: p.line, flexDirection: "row", alignItems: "center", gap: 11 }}>
        <PlaceThumbnail name={place.name} location={`${city.name}, ${country.name}`} latitude={place.latitude} longitude={place.longitude} sourceUrl={place.sourceUrl} />
        <View style={{ flex: 1, minWidth: 0 }}><Copy style={{ fontSize: 14, fontWeight: "600" }}>{place.name}</Copy><Copy muted style={{ fontSize: 12 }}>{translate(place.category, language)}</Copy></View>
        <Icon name="right" color={p.muted} size={17} />
      </Pressable>)}
    </View>
    {!!searchError && <Copy style={{ color: p.danger }}>{searchError}</Copy>}
    {!!searchResults.length && <View style={{ gap: 1 }}><Copy style={{ fontSize: 16, fontWeight: "700" }}>{translate("Search results", language)}</Copy>{searchResults.map((place) => <Pressable key={place.id} accessibilityRole="button" accessibilityLabel={`Explore ${place.name}`} onPress={() => openPlace(place)} style={{ minHeight: 56, paddingVertical: 8, borderBottomWidth: 1, borderColor: p.line, flexDirection: "row", alignItems: "center", gap: 11 }}><Icon name="pin" color={p.green} /><View style={{ flex: 1, minWidth: 0 }}><Copy style={{ fontWeight: "600" }}>{place.name}</Copy><Copy muted style={{ fontSize: 12 }}>{translate(place.category, language)}</Copy></View><Icon name="right" color={p.muted} size={17} /></Pressable>)}</View>}
    {visibleCount < filtered.length && <Button secondary icon="plus" onPress={() => setVisibleCount((count) => count + 20)}>{translate("Show more places", language)}</Button>}
    <Button secondary icon="map" onPress={() => router.push({ pathname: "/map", params: { lat: String(city.latitude), lon: String(city.longitude), name: `${city.name}, ${country.name}` } } as Href)}>{translate("Explore on map", language)}</Button>
  </Screen>;
}

export function PlaceScreen() {
  const language = useAppLanguage();
  const { country: code, city: cityId, place: placeId, name, latitude, longitude, category, detail, sourceUrl, search } = useLocalSearchParams<{ country?: string; city?: string; place?: string; name?: string; latitude?: string; longitude?: string; category?: string; detail?: string; sourceUrl?: string; search?: string }>();
  const country = countryForCode(code);
  const city = useMemo(() => cityForId(code ?? "", cityId ?? ""), [code, cityId]);
  const { savedPlaces, toggleExternalPlace, exploreHistoryReady, recordPlaceVisit } = useTravel();
  const [result, setResult] = useState<{ key: string; place: NearbyPlace | null; status: "ready" | "error" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const key = `${city?.id ?? ""}|${placeId ?? ""}`;
  const routePlace = useMemo(() => {
    const osm = /^osm:(?:node|way|relation):\d+$/.test(placeId ?? "") && /^https:\/\/www\.openstreetmap\.org\/(?:node|way|relation)\/\d+$/.test(sourceUrl ?? "");
    const wiki = /^wiki:\d+$/.test(placeId ?? "") && /^https:\/\/en\.wikipedia\.org\/\?curid=\d+$/.test(sourceUrl ?? "");
    if (!city || !country || !placeId || (!osm && !wiki)) return null;
    return externalPlaceFromSaved(placeId, { id: placeId, name, latitude: Number(latitude), longitude: Number(longitude), category, detail, source: wiki ? "Wikipedia" : "OpenStreetMap", sourceUrl, location: `${city.name}, ${country.name}` });
  }, [city, country, placeId, name, latitude, longitude, category, detail, sourceUrl]);
  const place = result?.key === key ? result.place : routePlace;
  const status = result?.key === key ? result.status : routePlace ? "ready" : "loading";
  useEffect(() => {
    if (!city || routePlace) return;
    let active = true;
    loadNearbyPlaces(city, 10).then((items) => { if (active) setResult({ key, place: items.find((item) => item.id === placeId) ?? null, status: "ready" }); })
      .catch(() => { if (active) setResult({ key, place: null, status: "error" }); });
    return () => { active = false; };
  }, [city, placeId, key, routePlace]);
  useEffect(() => {
    if (country && city && place && exploreHistoryReady) recordPlaceVisit(country.code, city.id, place, search);
  }, [country, city, place, exploreHistoryReady, recordPlaceVisit, search]);
  if (!country || !city) return <Screen><Header title={translate("Place unavailable", language)} /><EmptyState title={translate("Place not found", language)} detail={translate("Choose a city to explore.", language)} action={translate("Explore countries", language)} onPress={() => router.replace("/home" as Href)} /></Screen>;
  return <Screen active="home" style={{ gap: 16 }}>
    <Header title={place?.name ?? "Place"} subtitle={`${translate(city.name, language)} · ${countryFlag(country.code)} ${translate(country.name, language)}`} />
    {status === "loading" && <ActivityIndicator color={p.green} />}
    {status === "error" && <Copy muted>Places are unavailable right now. Try again from the city page.</Copy>}
    {status === "ready" && !place && <EmptyState title={translate("Place unavailable", language)} detail={translate("This place may have changed in the source data.", language)} action={translate("Back to city", language)} onPress={() => router.back()} />}
    {place && <>
      <PlacePreviewPhoto name={place.name} location={`${city.name}, ${country.name}`} latitude={place.latitude} longitude={place.longitude} sourceUrl={place.sourceUrl} />
      <Copy muted>{translate(place.category, language)} · {place.source}</Copy>
      <Copy>{place.detail}</Copy>
      <Button icon="plus" onPress={() => router.push({ pathname: "/planner", params: { country: country.code, city: city.id } } as Href)}>Plan a trip</Button>
      <Button icon={savedPlaces.includes(place.id) ? "heartFill" : "heart"} busy={busy} onPress={async () => { setBusy(true); setNotice(""); try { await toggleExternalPlace({ ...place, location: `${city.name}, ${country.name}` }); } catch (error) { setNotice(error instanceof Error ? error.message : "Could not save this place."); } finally { setBusy(false); } }}>{translate(savedPlaces.includes(place.id) ? "Remove from saved" : "Save place", language)}</Button>
      {!!notice && <Copy style={{ color: p.danger }}>{notice}</Copy>}
      <Button secondary icon="map" onPress={() => router.push({ pathname: "/map", params: { lat: String(place.latitude), lon: String(place.longitude), name: place.name, pinKind: "place", country: country.code, city: city.id } } as Href)}>{translate("Open on map", language)}</Button>
      <Button secondary icon="globe" onPress={() => void Linking.openURL(place.sourceUrl)}>{translate("Open source", language)}</Button>
    </>}
  </Screen>;
}
