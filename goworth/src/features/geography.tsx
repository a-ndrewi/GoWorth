import { router, useLocalSearchParams, type Href } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";
import { Button, Chip, Copy, EmptyState, Header, Icon, Row, Screen } from "@/components/goworth/ui";
import { PlacePreviewPhoto, PlaceThumbnail } from "@/components/goworth/place-preview";
import { Shimmer, SkeletonRows } from "@/components/goworth/loading";
import { usePalette } from "@/state/theme-context";
import type { Palette } from "@/constants/design";
import { citiesForCountry, citiesForUsState, cityForId, countryFlag, countryForCode, usStates } from "@/data/geography";
import { loadCityPlaces, searchWikipediaPlaces, venueFromCategory, type NearbyPlace } from "@/data/nearby-places";
import { insideBoundary, loadCityBoundary, type Boundary } from "@/data/city-boundary";
import { externalPlaceFromSaved } from "@/data/external-places";
import { useTravel } from "@/state/travel-context";
import { normalizeSearchText } from "@/utils/search";
import { useAppLanguage } from "@/data/formatting";
import { formatMessage, translate } from "@/data/i18n";
import { useTimedMessage } from "@/hooks/use-timed-message";

function placeBadge(category: string, detail: string, language: ReturnType<typeof useAppLanguage>) {
  const distance = detail.match(/(?:·|,)\s*(\d+(?:\.\d+)?)\s*km away/i)?.[1];
  return distance ? `${translate(category, language)} · ${distance.replace(".", ",")} km` : translate(category, language);
}

export function CountryScreen() {
  const p = usePalette();
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
  // City names are normalised once per country, so typing only compares strings.
  const searchable = useMemo(() => cities.map((city) => normalizeSearchText(`${city.name} ${translate(city.name, language)}`)), [cities, language]);
  const filtered = useMemo(() => {
    const needle = normalizeSearchText(query.trim());
    return needle ? cities.filter((_, index) => searchable[index].includes(needle)) : cities;
  }, [cities, searchable, query]);
  const filteredStates = isUs && !selectedState ? usStates.filter((state) => normalizeSearchText(state.name).includes(normalizeSearchText(query))) : [];
  useEffect(() => {
    if (country && exploreHistoryReady) recordCountryVisit(country.code, search);
  }, [country, exploreHistoryReady, recordCountryVisit, search]);
  if (!country) return <Screen><Header title={translate("Country unavailable", language)} /><EmptyState title={translate("Country not found", language)} detail={translate("Choose another country.", language)} action={translate("Explore countries", language)} onPress={() => router.dismissTo("/home" as Href)} /></Screen>;
  return <Screen active="home" style={{ gap: 17 }}>
    <Header title={selectedState ? selectedState.name : `${countryFlag(country.code)}  ${translate(country.name, language)}`} subtitle={selectedState ? `${translate(country.name, language)} · ${selectedState.cityCount.toLocaleString(language === "ro" ? "ro-RO" : "en-US")} ${language === "ro" ? "orașe" : "cities"}` : `${country.cityCount.toLocaleString(language === "ro" ? "ro-RO" : "en-US")} ${language === "ro" ? "orașe" : "cities"}`} />
    {selectedState && <Button secondary icon="back" onPress={() => { setSelectedStateCode(null); setQuery(""); setVisibleCount(40); }}>{translate("All states", language)}</Button>}
    <Row style={{ borderWidth: 1, borderColor: p.line, borderRadius: 16, backgroundColor: p.white, paddingHorizontal: 14, gap: 8 }}>
      <Icon name="search" color={p.muted} size={18} />
      <TextInput accessibilityLabel={`${translate(isUs && !selectedState ? "Search states" : "Search cities", language)}: ${country.name}`} placeholder={translate(isUs && !selectedState ? "Search states" : "Search cities", language)} placeholderTextColor={p.muted} value={query} onChangeText={(value) => { setQuery(value); setVisibleCount(40); }} style={{ flex: 1, minWidth: 0, height: 46, fontSize: 14, color: p.ink }} />
    </Row>
    {isUs && !selectedState ? <View style={{ gap: 12 }}>
      {!!filteredStates.length && <View style={listCard(p)}>{filteredStates.map((state, index) => <Pressable key={state.code} accessibilityRole="button" accessibilityLabel={`${state.name}, ${state.cityCount} cities`} onPress={() => { setSelectedStateCode(state.code); setQuery(""); setVisibleCount(40); }} style={({ pressed }) => [{ minHeight: 58, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 12 }, listRow(p, index), pressed && { backgroundColor: p.soft }]}>
        <Icon name="map" color={p.green} size={19} />
        <View style={{ flex: 1, minWidth: 0 }}><Copy style={{ fontSize: 15, fontWeight: "600" }}>{state.name}</Copy><Copy muted style={{ fontSize: 11 }}>{state.cityCount.toLocaleString(language === "ro" ? "ro-RO" : "en-US")} {language === "ro" ? "orașe" : "cities"}</Copy></View>
        <Icon name="right" color={p.muted} size={17} />
      </Pressable>)}</View>}
      {!filteredStates.length && <EmptyState title={translate("No states found", language)} detail={translate("Try another state name.", language)} action={translate("Clear search", language)} onPress={() => setQuery("")} />}
    </View> : <>
    {!!filtered.length && <View style={listCard(p)}>
      {filtered.slice(0, visibleCount).map((city, index) => <Pressable key={city.id} accessibilityRole="button" accessibilityLabel={`Explore ${city.name}`} onPress={() => router.push({ pathname: "/city", params: { country: country.code, city: city.id } } as Href)} style={({ pressed }) => [{ minHeight: 58, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 12 }, listRow(p, index), pressed && { backgroundColor: p.soft }]}>
        <Icon name="city" color={p.green} size={19} />
        <View style={{ flex: 1, minWidth: 0 }}><Copy style={{ fontSize: 15, fontWeight: "600" }}>{translate(city.name, language)}</Copy>{city.population > 0 && <Copy muted style={{ fontSize: 11 }}>{translate("Population", language)} {city.population.toLocaleString(language === "ro" ? "ro-RO" : "en-US")}</Copy>}</View>
        <Icon name="right" color={p.muted} size={17} />
      </Pressable>)}
    </View>}
    {!filtered.length && <EmptyState title={translate(query ? "No cities found" : "No indexed cities", language)} detail={translate(query ? "Try another city name." : "Cities for this country are not available yet.", language)} action={query ? translate("Clear search", language) : undefined} onPress={query ? () => setQuery("") : undefined} />}
    {visibleCount < filtered.length && <Button secondary icon="plus" onPress={() => setVisibleCount((count) => count + 40)}>{translate("Show more cities", language)}</Button>}
    </>}
  </Screen>;
}

/** Rows of a list grouped into one rounded card, as in iOS settings. */
const listCard = (p: Palette) => ({ borderRadius: 20, borderWidth: 1, borderColor: p.line, backgroundColor: p.white, overflow: "hidden" as const });
const listRow = (p: Palette, index: number) => ({ paddingHorizontal: 14, borderTopWidth: index ? 1 : 0, borderColor: p.line });

export function CityScreen() {
  const p = usePalette();
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
  const [searchError, setSearchError] = useTimedMessage();
  const searchId = useRef(0);
  const [boundary, setBoundary] = useState<{ cityId: string; outline: Boundary | null } | null>(null);
  useEffect(() => {
    if (!city || !country) return;
    let active = true;
    loadCityPlaces(city, country.name).then((items) => { if (active) setResult({ key: city.id, places: items, status: "ready" }); })
      .catch(() => { if (active) setResult({ key: city.id, places: [], status: "error" }); });
    // Already fetched by the line above; kept here so searches can be limited to the same area.
    loadCityBoundary(city, country.name).then((outline) => { if (active) setBoundary({ cityId: city.id, outline }); }).catch(() => undefined);
    return () => { active = false; };
  }, [city, country]);
  const outline = boundary?.cityId === city?.id ? boundary?.outline ?? null : null;
  const inCity = (places: NearbyPlace[]) => outline ? places.filter((place) => insideBoundary(outline, place)) : places;
  // Wider results load on their own shortly after the user stops typing; there is no separate search button.
  useEffect(() => {
    const searchedQuery = query.trim();
    if (!city || !country || searchedQuery.length < 3) return;
    const requestId = ++searchId.current;
    const timer = setTimeout(() => {
      setSearching(true);
      setSearchError("");
      searchWikipediaPlaces(searchedQuery, city, 25)
        .then((results) => { if (requestId === searchId.current) setRemote({ cityId: city.id, query: searchedQuery, places: (outline ? results.filter((result) => insideBoundary(outline, result)) : results).map((result) => ({ ...result, location: `${city.name}, ${country.name}` })) }); })
        .catch(() => { if (requestId === searchId.current) setSearchError(translate("Search is unavailable right now.", language)); })
        .finally(() => { if (requestId === searchId.current) setSearching(false); });
    }, 600);
    return () => clearTimeout(timer);
  }, [query, city, country, language, outline, setSearchError]);
  if (!country || !city) return <Screen><Header title={translate("City unavailable", language)} /><EmptyState title={translate("City not found", language)} detail={translate("Choose a city from a country.", language)} action={translate("Explore countries", language)} onPress={() => router.dismissTo("/home" as Href)} /></Screen>;
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
      if (requestId === searchId.current) setRemote({ cityId: city.id, query: searchedQuery, places: inCity(results).map((result) => ({ ...result, location: `${city.name}, ${country.name}` })) });
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
    <Row style={{ minHeight: 48, borderRadius: 16, borderWidth: 1, borderColor: p.line, paddingHorizontal: 14, gap: 9, backgroundColor: p.white }}>
      <Icon name="search" color={p.muted} size={18} />
      <TextInput accessibilityLabel={`${translate("Search places", language)}: ${city.name}`} placeholder={formatMessage("Search places in {city}", { city: translate(city.name, language) }, language)} placeholderTextColor={p.muted} value={query}
        onChangeText={(value) => { searchId.current++; setSearching(false); setSearchError(""); setQuery(value); setVisibleCount(20); }}
        onSubmitEditing={() => void searchCity()} returnKeyType="search" style={{ flex: 1, minWidth: 0, height: 46, fontSize: 14, color: p.ink, outlineWidth: 0 }} />
      {searching && <ActivityIndicator size="small" color={p.blue} />}
    </Row>
    <Row style={{ flexWrap: "wrap", gap: 6 }}>{categories.map((item) => <Chip key={item} selected={category === item} onPress={() => { setCategory(item); setVisibleCount(20); }}>{translate(item, language)}</Chip>)}</Row>
    {status === "loading" && <SkeletonRows count={6} />}
    {status === "error" && <EmptyState title={translate("Places unavailable", language)} detail={translate("Check your connection and try again.", language)} action={translate("Retry", language)} onPress={() => { setResult({ key: city.id, places: [], status: "loading" }); loadCityPlaces(city, country.name).then((items) => setResult({ key: city.id, places: items, status: "ready" })).catch(() => setResult({ key: city.id, places: [], status: "error" })); }} />}
    {status === "ready" && !filtered.length && !searchResults.length && !searching && (!query.trim() || remote?.query === query.trim()) && <EmptyState title={translate(query ? "No matching places" : "No places found nearby", language)} detail={translate("Try another search.", language)} />}
    {!!filtered.length && <View style={listCard(p)}>
      {filtered.slice(0, visibleCount).map((place, index) => <Pressable key={place.id} accessibilityRole="button" accessibilityLabel={`Explore ${place.name}`} onPress={() => openPlace(place)} style={({ pressed }) => [{ minHeight: 70, paddingVertical: 9, flexDirection: "row", alignItems: "center", gap: 12 }, listRow(p, index), pressed && { backgroundColor: p.soft }]}>
        <PlaceThumbnail name={place.name} location={`${city.name}, ${country.name}`} latitude={place.latitude} longitude={place.longitude} sourceUrl={place.sourceUrl} />
        <View style={{ flex: 1, minWidth: 0 }}><Copy style={{ fontSize: 14, fontWeight: "600" }}>{place.name}</Copy><Copy muted style={{ fontSize: 12 }}>{translate(place.category, language)}</Copy></View>
        <Icon name="right" color={p.muted} size={17} />
      </Pressable>)}
    </View>}
    {!!searchError && <Copy style={{ color: p.danger }}>{searchError}</Copy>}
    {!!searchResults.length && <View style={{ gap: 8 }}><Copy style={{ fontSize: 16, fontWeight: "700" }}>{translate("Search results", language)}</Copy><View style={listCard(p)}>{searchResults.map((place, index) => <Pressable key={place.id} accessibilityRole="button" accessibilityLabel={`Explore ${place.name}`} onPress={() => openPlace(place)} style={({ pressed }) => [{ minHeight: 56, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 11 }, listRow(p, index), pressed && { backgroundColor: p.soft }]}><Icon name="pin" color={p.green} /><View style={{ flex: 1, minWidth: 0 }}><Copy style={{ fontWeight: "600" }}>{place.name}</Copy><Copy muted style={{ fontSize: 12 }}>{translate(place.category, language)}</Copy></View><Icon name="right" color={p.muted} size={17} /></Pressable>)}</View></View>}
    {visibleCount < filtered.length && <Button secondary icon="plus" onPress={() => setVisibleCount((count) => count + 20)}>{translate("Show more places", language)}</Button>}
  </Screen>;
}

export function PlaceScreen() {
  const p = usePalette();
  const language = useAppLanguage();
  const { country: code, city: cityId, place: placeId, name, latitude, longitude, category, detail, sourceUrl, search, terrace, cuisine, hours, address } = useLocalSearchParams<{ country?: string; city?: string; place?: string; name?: string; latitude?: string; longitude?: string; category?: string; detail?: string; sourceUrl?: string; search?: string; terrace?: string; cuisine?: string; hours?: string; address?: string }>();
  const country = countryForCode(code);
  const city = useMemo(() => cityForId(code ?? "", cityId ?? ""), [code, cityId]);
  const { savedPlaces, toggleExternalPlace, exploreHistoryReady, recordPlaceVisit } = useTravel();
  const [result, setResult] = useState<{ key: string; place: NearbyPlace | null; status: "ready" | "error" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useTimedMessage();
  const key = `${city?.id ?? ""}|${placeId ?? ""}`;
  const routePlace = useMemo(() => {
    const osm = /^osm:(?:node|way|relation):\d+$/.test(placeId ?? "") && /^https:\/\/www\.openstreetmap\.org\/(?:node|way|relation)\/\d+$/.test(sourceUrl ?? "");
    const wiki = /^wiki:\d+$/.test(placeId ?? "") && /^https:\/\/en\.wikipedia\.org\/\?curid=\d+$/.test(sourceUrl ?? "");
    if (!city || !country || !placeId || (!osm && !wiki)) return null;
    return externalPlaceFromSaved(placeId, { id: placeId, name, latitude: Number(latitude), longitude: Number(longitude), category, detail, source: wiki ? "Wikipedia" : "OpenStreetMap", sourceUrl, location: `${city.name}, ${country.name}` });
  }, [city, country, placeId, name, latitude, longitude, category, detail, sourceUrl]);
  const place = result?.key === key ? result.place : routePlace;
  const venue = venueFromCategory(place?.category, { terrace: terrace === "1", ...(cuisine ? { cuisine } : {}), ...(hours ? { openingHours: hours } : {}), ...(address ? { address } : {}) });
  const status = result?.key === key ? result.status : routePlace ? "ready" : "loading";
  useEffect(() => {
    if (!city || !country || routePlace) return;
    let active = true;
    loadCityPlaces(city, country.name).then((items) => { if (active) setResult({ key, place: items.find((item) => item.id === placeId) ?? null, status: "ready" }); })
      .catch(() => { if (active) setResult({ key, place: null, status: "error" }); });
    return () => { active = false; };
  }, [city, country, placeId, key, routePlace]);
  useEffect(() => {
    if (country && city && place && exploreHistoryReady) recordPlaceVisit(country.code, city.id, place, search);
  }, [country, city, place, exploreHistoryReady, recordPlaceVisit, search]);
  if (!country || !city) return <Screen><Header title={translate("Place unavailable", language)} /><EmptyState title={translate("Place not found", language)} detail={translate("Choose a city to explore.", language)} action={translate("Explore countries", language)} onPress={() => router.dismissTo("/home" as Href)} /></Screen>;
  return <Screen active="home" style={{ gap: 16 }}>
    <Header title={place?.name ?? "Place"} subtitle={`${translate(city.name, language)} · ${countryFlag(country.code)} ${translate(country.name, language)}`} />
    {status === "loading" && <View style={{ gap: 12 }}>
      <Shimmer style={{ height: 215, borderRadius: 6 }} />
      <Shimmer style={{ height: 48, borderRadius: 12 }} />
      <Shimmer style={{ height: 48, borderRadius: 12 }} />
    </View>}
    {status === "error" && <Copy muted>Places are unavailable right now. Try again from the city page.</Copy>}
    {status === "ready" && !place && <EmptyState title={translate("Place unavailable", language)} detail={translate("This place may have changed in the source data.", language)} action={translate("Back to city", language)} onPress={() => router.back()} />}
    {place && <>
      <PlacePreviewPhoto name={place.name} location={`${city.name}, ${country.name}`} latitude={place.latitude} longitude={place.longitude} sourceUrl={place.sourceUrl} badge={placeBadge(place.category, place.detail, language)} venue={venue} />
      {venue && (venue.cuisine || venue.terrace || venue.openingHours || venue.address) && <View style={{ gap: 6 }}>
        {!!venue.cuisine && <Row style={{ gap: 8 }}><Icon name="food" size={16} color={p.muted} /><Copy muted style={{ flex: 1 }}>{venue.cuisine}</Copy></Row>}
        {venue.terrace && <Row style={{ gap: 8 }}><Icon name="terrace" size={16} color={p.muted} /><Copy muted style={{ flex: 1 }}>Terrace</Copy></Row>}
        {!!venue.openingHours && <Row style={{ gap: 8 }}><Icon name="calendar" size={16} color={p.muted} /><Copy muted style={{ flex: 1 }}>{venue.openingHours}</Copy></Row>}
        {!!venue.address && <Row style={{ gap: 8 }}><Icon name="pin" size={16} color={p.muted} /><Copy muted style={{ flex: 1 }}>{venue.address}</Copy></Row>}
      </View>}
      <Button icon="plus" onPress={() => router.push({ pathname: "/planner", params: { country: country.code, city: city.id } } as Href)}>Plan a trip</Button>
      <Button secondary icon={savedPlaces.includes(place.id) ? "heartFill" : "heart"} busy={busy} onPress={async () => { setBusy(true); setNotice(""); try { await toggleExternalPlace({ ...place, location: `${city.name}, ${country.name}` }); } catch (error) { setNotice(error instanceof Error ? error.message : "Could not save this place."); } finally { setBusy(false); } }}>{translate(savedPlaces.includes(place.id) ? "Remove from saved" : "Save place", language)}</Button>
      {!!notice && <Copy style={{ color: p.danger }}>{notice}</Copy>}
    </>}
  </Screen>;
}
