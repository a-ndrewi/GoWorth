import { router, useLocalSearchParams, type Href } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import {
  Button, Chip, Copy, DestinationPhoto, EmptyState,
  Header, Heading, Icon, IconButton, Row, Screen, SectionTitle, Sheet, s,
  type IconName,
} from "@/components/goworth/ui";
import { PlacePreviewPhoto, PlaceThumbnail } from "@/components/goworth/place-preview";
import { DiscoverySwiper } from "@/components/goworth/discovery-swiper";
import { palette as p } from "@/constants/design";
import { tipsForDestination, type DestinationTip } from "@/data/tips";
import {
  destinations, placesForDestination, tripDays,
  type Place, type PlaceCategory,
} from "@/data/travel";
import { useTravel } from "@/state/travel-context";
import { normalizeSearchText } from "@/utils/search";
import { destinationPins, searchCatalogPlace } from "@/data/map";
import { destinationForDay } from "@/utils/trip";
import { uniqueRouteStops } from "@/data/trip-route";
import { formatMessage, translate, translateAccessibility } from "@/data/i18n";
import { useAppLanguage } from "@/data/formatting";
import { citiesForCountry, cityForId, countries, countryFlag, countryForCode } from "@/data/geography";
import { loadNearbyPlaces, type NearbyPlace } from "@/data/nearby-places";
import { unseenNearbyPlaces, type PlaceVisit } from "@/utils/explore-history";

const placeIcons: Record<PlaceCategory, IconName> = {
  Landmarks: "pin",
  Museums: "book",
  Nature: "leaf",
  Beaches: "beach",
  Neighborhoods: "city",
  "Food & Markets": "food",
};

function PlaceRow({ place, onPress, saved, onSave }: {
  place: Place;
  onPress: () => void;
  saved: boolean;
  onSave: () => void;
}) {
  const language = useAppLanguage();
  return (
    <Row style={{ gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderColor: p.line }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={translateAccessibility(`View ${place.name}`, language)}
        onPress={onPress}
        style={[s.row, { flex: 1, minWidth: 0, gap: 12 }]}
      >
        <View style={{ width: 54, height: 54, borderRadius: 6, backgroundColor: p.greenSoft, alignItems: "center", justifyContent: "center" }}>
          <Icon name={placeIcons[place.category]} color={p.green} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Copy style={{ fontWeight: "600", fontSize: 14 }}>{place.name}</Copy>
          <Copy muted style={{ fontSize: 12 }}>{place.detail}</Copy>
        </View>
      </Pressable>
      <IconButton
        name={saved ? "heartFill" : "heart"}
        label={`${saved ? "Unsave" : "Save"} ${place.name}`}
        color={saved ? p.pink : p.ink}
        onPress={onSave}
      />
    </Row>
  );
}

export function HomeScreen() {
  const language = useAppLanguage();
  const { trip, exploreHistory } = useTravel();
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [visibleCount, setVisibleCount] = useState(24);
  const [nearbyResult, setNearbyResult] = useState<{ key: string; status: "ready" | "error"; places: NearbyPlace[] } | null>(null);
  const filtered = countries.filter((country) =>
    normalizeSearchText(`${country.name} ${translate(country.name, language)}`).includes(normalizeSearchText(query.trim())));
  const browsing = !query.trim() && !searchFocused;
  const showPersonalized = browsing && !!exploreHistory.countries.length && !!exploreHistory.places.length;
  const recent = [
    ...exploreHistory.countries.slice(0, 2).map((visit) => ({ kind: "country" as const, visit })),
    ...exploreHistory.places.slice(0, 2).map((visit) => ({ kind: "place" as const, visit })),
  ].sort((a, b) => b.visit.viewedAt - a.visit.viewedAt);
  const recommendationSeed = useMemo(() => {
    const countryVisit = exploreHistory.countries[0];
    const placeVisit = exploreHistory.places[0];
    if (!countryVisit || !placeVisit) return null;
    const country = countryForCode(countryVisit.code);
    const countryCities = country ? citiesForCountry(country.code) : [];
    const countryCity = countryCities.find((city) => city.name.toLocaleLowerCase() === country?.capital.toLocaleLowerCase()) ?? countryCities[0];
    if (country && countryCity && countryVisit.viewedAt > placeVisit.viewedAt) {
      return { key: `country:${country.code}`, latitude: countryCity.latitude, longitude: countryCity.longitude,
        countryCode: country.code, cityId: countryCity.id, location: `${countryCity.name}, ${country.name}`,
        label: countryVisit.searchTerm || country.name };
    }
    const countryName = countryForCode(placeVisit.countryCode)?.name ?? placeVisit.countryCode;
    const cityName = cityForId(placeVisit.countryCode, placeVisit.cityId)?.name ?? placeVisit.place.name;
    return { key: `place:${placeVisit.place.id}`, latitude: placeVisit.place.latitude, longitude: placeVisit.place.longitude,
      countryCode: placeVisit.countryCode, cityId: placeVisit.cityId,
      location: `${cityName}, ${countryName}`,
      label: placeVisit.searchTerm || placeVisit.place.name };
  }, [exploreHistory]);
  useEffect(() => {
    if (!showPersonalized || !recommendationSeed) return;
    let active = true;
    loadNearbyPlaces(recommendationSeed, 10)
      .then((places) => { if (active) setNearbyResult({ key: recommendationSeed.key, status: "ready", places }); })
      .catch(() => { if (active) setNearbyResult({ key: recommendationSeed.key, status: "error", places: [] }); });
    return () => { active = false; };
  }, [showPersonalized, recommendationSeed]);
  const suggestions = recommendationSeed && nearbyResult?.key === recommendationSeed.key
    ? unseenNearbyPlaces(nearbyResult.places, exploreHistory) : [];
  const placeRoute = (visit: PlaceVisit) => ({ pathname: "/place", params: {
    country: visit.countryCode, city: visit.cityId, place: visit.place.id,
    name: visit.place.name, latitude: String(visit.place.latitude), longitude: String(visit.place.longitude),
    category: visit.place.category, detail: visit.place.detail, sourceUrl: visit.place.sourceUrl,
  } } as Href);

  return (
    <Screen active="home" style={{ gap: 18 }}>
      <View style={styles.homeBrowse}>
        <Row style={styles.search}>
          <TextInput
            accessibilityLabel={translate("Search countries", language)}
            value={query}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            onChangeText={(value) => { setQuery(value); setVisibleCount(24); }}
            returnKeyType="search"
            style={styles.searchInput}
          />
          {!searchFocused && !query && <View pointerEvents="none" style={styles.searchPlaceholder}>
            <Icon name="search" color={p.muted} size={18} />
            <Copy muted style={{ fontSize: 14 }}>{translate("Search countries", language)}</Copy>
          </View>}
        </Row>
      </View>
      {trip && <Pressable accessibilityRole="button" onPress={() => router.push("/itinerary" as Href)} style={styles.tripShortcut}>
        <Icon name="bag" size={18} color={p.blue} />
        <Copy style={{ flex: 1, color: p.blue, fontSize: 13, fontWeight: "600" }}>My itinerary</Copy>
        <Icon name="right" size={16} color={p.blue} />
      </Pressable>}
      {browsing && <DiscoverySwiper />}
      <SectionTitle title={translate("Countries", language)} action={translate("View map", language)} onPress={() => router.push("/map" as Href)} />
      <View style={{ gap: 9 }}>
        {filtered.slice(0, browsing ? 5 : visibleCount).map((country) => <Pressable key={country.code} accessibilityRole="button" accessibilityLabel={`Explore ${country.name}`} onPress={() => router.push({ pathname: "/country", params: { code: country.code, ...(query.trim() ? { search: query.trim() } : {}) } } as Href)} style={({ pressed }) => [s.row, styles.countryRow, pressed && styles.countryRowPressed]}>
          <View style={styles.countryFlag}><Copy style={{ fontSize: 30, lineHeight: 39 }}>{countryFlag(country.code)}</Copy></View>
          <View style={{ flex: 1, minWidth: 0 }}><Copy style={{ fontSize: 16, fontWeight: "700" }}>{translate(country.name, language)}</Copy><Copy muted style={{ fontSize: 12 }}>{country.cityCount.toLocaleString(language === "ro" ? "ro-RO" : "en-US")} {language === "ro" ? "orașe" : "cities"}</Copy></View>
          <Icon name="right" color={p.muted} size={18} />
        </Pressable>)}
      </View>
      {!filtered.length && <EmptyState title={translate("No countries found", language)} detail={translate("Try another country name.", language)} action={translate("Clear search", language)} onPress={() => setQuery("")} />}
      {!browsing && visibleCount < filtered.length && <Button secondary icon="plus" onPress={() => setVisibleCount((count) => count + 24)}>{translate("Show more countries", language)}</Button>}
      {showPersonalized && <View style={styles.personalSection}>
        <Heading style={styles.personalHeading}>{translate("Recently viewed", language)}</Heading>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.recentRail} contentContainerStyle={styles.recentRailContent}>
        {recent.map((entry) => entry.kind === "country" ? (() => {
          const country = countryForCode(entry.visit.code);
          if (!country) return null;
          return <Pressable key={`country:${country.code}`} accessibilityRole="button" accessibilityLabel={`${translate("Country", language)}: ${translate(country.name, language)}`} onPress={() => router.push({ pathname: "/country", params: { code: country.code } } as Href)} style={({ pressed }) => [styles.recentCard, pressed && styles.personalCardPressed]}>
            <View style={styles.recentCountryVisual}><Text style={styles.recentFlag}>{countryFlag(country.code)}</Text><Icon name="globe" color={p.blue} size={20} /></View>
            <View style={styles.recentCardBody}>
              <Text numberOfLines={2} style={styles.recentCardName}>{translate(country.name, language)}</Text>
              <Text style={styles.recentCardType}>{translate("Country", language)}</Text>
            </View>
          </Pressable>;
        })() : <Pressable key={`place:${entry.visit.place.id}`} accessibilityRole="button" accessibilityLabel={`${translate("Place", language)}: ${entry.visit.place.name}`} onPress={() => router.push(placeRoute(entry.visit))} style={({ pressed }) => [styles.recentCard, pressed && styles.personalCardPressed]}>
          <PlaceThumbnail name={entry.visit.place.name} location={entry.visit.place.location || countryForCode(entry.visit.countryCode)?.name || ""} latitude={entry.visit.place.latitude} longitude={entry.visit.place.longitude} sourceUrl={entry.visit.place.sourceUrl} style={styles.recentPhoto} fallbackColor={p.blue} />
          <View style={styles.recentCardBody}>
            <Text numberOfLines={2} style={styles.recentCardName}>{entry.visit.place.name}</Text>
            <Text numberOfLines={1} style={styles.recentCardType}>{translate(countryForCode(entry.visit.countryCode)?.name ?? entry.visit.countryCode, language)}</Text>
          </View>
        </Pressable>)}
        </ScrollView>
      </View>}
      {showPersonalized && recommendationSeed && <View style={styles.personalSection}>
        <Heading style={styles.personalHeading}>{formatMessage("Based on your search for {query}", { query: recommendationSeed.label }, language)}</Heading>
        {nearbyResult?.key !== recommendationSeed.key && <ActivityIndicator color={p.blue} style={{ marginVertical: 18 }} />}
        {suggestions.map((place, index) => <Pressable key={place.id} accessibilityRole="button" accessibilityLabel={`${translate("Place", language)}: ${place.name}`} onPress={() => router.push(placeRoute({ countryCode: recommendationSeed.countryCode, cityId: recommendationSeed.cityId, place, viewedAt: 0 }))} style={({ pressed }) => [index === 0 ? styles.featuredPlace : styles.recommendedPlace, pressed && styles.personalCardPressed]}>
          <PlaceThumbnail name={place.name} location={recommendationSeed.location} latitude={place.latitude} longitude={place.longitude} sourceUrl={place.sourceUrl} style={index === 0 ? styles.featuredPhoto : styles.recommendedPhoto} fallbackColor={p.blue} />
          <View style={styles.recommendedCopy}>
            <Text numberOfLines={1} style={index === 0 ? styles.featuredCategory : styles.recommendedCategory}>{translate(place.category, language)}</Text>
            <Text numberOfLines={2} style={index === 0 ? styles.featuredName : styles.recommendedName}>{place.name}</Text>
            {index === 0 && <Text numberOfLines={1} style={styles.featuredLocation}>{recommendationSeed.location}</Text>}
          </View>
          <View style={index === 0 ? styles.featuredArrow : styles.recommendedArrow}><Icon name="right" color={p.blue} size={16} /></View>
        </Pressable>)}
        {nearbyResult?.key === recommendationSeed.key && !suggestions.length && <>
          <Copy muted>{translate(nearbyResult.status === "error" ? "Nearby places are unavailable right now." : "No places found nearby", language)}</Copy>
          <Button secondary icon="map" onPress={() => router.push({ pathname: "/map", params: { lat: String(recommendationSeed.latitude), lon: String(recommendationSeed.longitude), name: recommendationSeed.location } } as Href)}>{translate("Explore on map", language)}</Button>
        </>}
      </View>}
    </Screen>
  );
}

export function TripDetailsScreen() {
  const language = useAppLanguage();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const destination = destinations.find((item) => item.id === id);
  const { saved, savedPlaces, toggleSaved, togglePlace } = useTravel();
  const [tab, setTab] = useState("Overview");
  const [notice, setNotice] = useState("");
  const [checkedTips, setCheckedTips] = useState<string[]>([]);
  if (!destination) {
    return <Screen><Header title="Destination" /><EmptyState title="Destination not found" detail="This destination is no longer in the catalog." action="Explore destinations" onPress={() => router.replace("/home" as Href)} /></Screen>;
  }
  const isSaved = saved.includes(destination.id);
  const nearby = placesForDestination(destination.id);
  const tips = tipsForDestination(destination);
  const checkedTipCount = checkedTips.filter((id) => tips.some((tip) => tip.id === id)).length;
  const openMap = () => router.push({ pathname: "/map", params: { destination: destination.id } } as Href);
  const plan = () => router.push({ pathname: "/planner", params: { destination: destination.id } } as Href);
  return (
    <Screen style={{ padding: 0, gap: 0 }} footer={<Row>
      <Button secondary icon={isSaved ? "heartFill" : "heart"} onPress={() => toggleSaved(destination.id)} style={{ flex: 1 }}>{isSaved ? "Saved" : "Save"}</Button>
      <Button onPress={plan} style={{ flex: 1 }}>Plan a trip</Button>
    </Row>}>
      <View style={{ height: 270 }}>
        <DestinationPhoto destination={destination} style={StyleSheet.absoluteFill} />
        <IconButton name="back" label="Go back" filled onPress={() => router.canGoBack() ? router.back() : router.replace("/home" as Href)} style={{ margin: 14 }} />
      </View>
      <View style={{ padding: 22, gap: 18 }}>
        <View>
          <Heading style={{ fontSize: 30 }}>{destination.name}</Heading>
          <Copy muted>{destination.country} · {destination.region}</Copy>
        </View>
        <Row style={{ borderBottomWidth: 1, borderColor: p.line, justifyContent: "center", gap: 8 }}>
          {["Overview", "Places", "Tips"].map((item) => (
            <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: tab === item }} onPress={() => setTab(item)} style={{ flex: 1, maxWidth: 110, alignItems: "center", paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: tab === item ? p.blue : "transparent" }}>
              <Copy style={{ color: tab === item ? p.blue : p.muted }}>{item}</Copy>
            </Pressable>
          ))}
        </Row>
        {tab === "Overview" && <>
          <Copy style={{ lineHeight: 23 }}>{destination.description}</Copy>
          <Copy muted>{destination.tags.map((tag) => translate(tag, language)).join(" · ")}</Copy>
          <Button secondary icon="map" onPress={openMap}>View on map</Button>
          <Button secondary icon="share" onPress={async () => {
            try { await Share.share({ message: formatMessage("Explore {destination}, {country} with GoWorth.", { destination: destination.name, country: translate(destination.country, language) }, language) }); }
            catch { setNotice("Sharing is unavailable on this device."); }
          }}>Share destination</Button>
        </>}
        {tab === "Places" && <>
          <Heading style={{ fontSize: 20 }}>{formatMessage("{count} places to explore", { count: nearby.length }, language)}</Heading>
          {nearby.slice(0, 4).map((place) => <PlaceRow key={place.id} place={place} saved={savedPlaces.includes(place.id)} onSave={() => togglePlace(place.id)} onPress={() => router.push({ pathname: "/explore", params: { id: destination.id, place: place.id } } as Href)} />)}
          <Button secondary onPress={() => router.push({ pathname: "/explore", params: { id: destination.id } } as Href)}>View all places</Button>
          <Button secondary icon="map" onPress={openMap}>More nearby on map</Button>
        </>}
        {tab === "Tips" && <TipsPanel
          destination={destination}
          tips={tips}
          checkedTips={checkedTips}
          checkedTipCount={checkedTipCount}
          onToggle={(id) => setCheckedTips((current) => current.includes(id) ? current.filter((tipId) => tipId !== id) : [...current, id])}
          onShare={async () => {
            try { await Share.share({ message: `${formatMessage("{destination} quick tips", { destination: destination.name }, language)}\n\n${tips.map((tip) => `• ${tip.title}: ${tip.detail}`).join("\n")}` }); }
            catch { setNotice("Sharing is unavailable on this device."); }
          }}
          onMap={openMap}
          onPlan={plan}
        />}
        {!!notice && <Copy style={{ color: p.danger }}>{notice}</Copy>}
      </View>
    </Screen>
  );
}

function TipsPanel({
  destination,
  tips,
  checkedTips,
  checkedTipCount,
  onToggle,
  onShare,
  onMap,
  onPlan,
}: {
  destination: (typeof destinations)[number];
  tips: DestinationTip[];
  checkedTips: string[];
  checkedTipCount: number;
  onToggle: (id: string) => void;
  onShare: () => void;
  onMap: () => void;
  onPlan: () => void;
}) {
  const language = useAppLanguage();
  return <View style={{ gap: 15 }}>
    <View style={{ gap: 5 }}>
      <Heading style={{ fontSize: 20 }}>{formatMessage("Your {destination} field guide", { destination: destination.name }, language)}</Heading>
      <Copy muted style={{ lineHeight: 20 }}>Small decisions before you go make the places you saved easier to enjoy.</Copy>
    </View>
    <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
      <Copy style={{ fontWeight: "700", color: checkedTipCount === tips.length ? p.green : p.ink }}>{formatMessage("{checked}/{total} tips checked", { checked: checkedTipCount, total: tips.length }, language)}</Copy>
      <Pressable accessibilityRole="button" onPress={onShare} style={{ paddingVertical: 8, paddingLeft: 10 }}><Copy style={{ color: p.blue, fontWeight: "700", fontSize: 13 }}>Share guide</Copy></Pressable>
    </Row>
    {(["Before you go", "While you're there"] as const).map((stage) => <View key={stage} style={{ gap: 8 }}>
      <Copy style={{ color: p.muted, fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 }}>{stage}</Copy>
      {tips.filter((tip) => tip.stage === stage).map((tip) => {
        const checked = checkedTips.includes(tip.id);
        return <Pressable key={tip.id} accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => onToggle(tip.id)} style={[styles.tipCard, checked && styles.tipCardChecked]}>
          <View style={[styles.tipIcon, { backgroundColor: checked ? p.greenSoft : p.blueSoft }]}><Icon name={tip.icon} color={checked ? p.green : p.blue} size={18} /></View>
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}><Copy style={{ fontWeight: "700" }}>{tip.title}</Copy><Copy muted style={{ fontSize: 12, lineHeight: 18 }}>{tip.detail}</Copy></View>
          <Icon name={checked ? "check" : "plus"} color={checked ? p.green : p.muted} size={18} />
        </Pressable>;
      })}
    </View>)}
    <View style={{ gap: 8, paddingTop: 2 }}>
      <Button secondary icon="map" onPress={onMap}>Open places on map</Button>
      <Button icon="calendar" onPress={onPlan}>Use tips while planning</Button>
    </View>
  </View>;
}

export function ExploreScreen() {
  const language = useAppLanguage();
  const { id, place: placeId } = useLocalSearchParams<{ id?: string; place?: string }>();
  const { trip, savedPlaces, togglePlace, addActivity } = useTravel();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [selected, setSelected] = useState<Place | null>(() =>
    placesForDestination(id ?? "")
      .find((item) => item.id === placeId) || null,
  );
  const [selectedDay, setSelectedDay] = useState(1);
  const [addedDays, setAddedDays] = useState<number[]>([]);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState("");
  const requestedId = id;
  const routeCities = trip ? uniqueRouteStops(trip) : [];
  const dynamicCity = routeCities.find((city) => city.id === requestedId && !destinations.some((destination) => destination.id === city.id));
  const destination = destinations.find((item) => item.id === requestedId);
  const localPlaces = destination ? placesForDestination(destination.id) : [];
  const filters = ["All", ...new Set(localPlaces.map((place) => place.category))];
  const filtered = localPlaces.filter((place) =>
    (filter === "All" || place.category === filter) &&
    normalizeSearchText(`${place.name} ${place.detail} ${place.category}`).includes(normalizeSearchText(query.trim())),
  );
  const matchingDays = trip && destination ? Array.from({ length: tripDays(trip.start, trip.end) }, (_, index) => index + 1)
    .filter((day) => destinationForDay(trip, day) === destination.id) : [];
  const canAdd = matchingDays.length > 0;
  const openMap = (place: Place) => {
    if (!destination) return;
    setSelected(null);
    router.push({ pathname: "/map", params: { destination: destination.id, place: place.id } } as Href);
  };
  if (dynamicCity) {
    const countries = [...new Set(routeCities.map((city) => city.country))];
    return <Screen active="home" style={{ gap: 17 }}>
      <Header title="Explore places" subtitle={`${dynamicCity.name}, ${dynamicCity.country}`} />
      {countries.map((country) => <View key={country} style={{ gap: 8 }}>
        <Heading style={{ fontSize: 19, lineHeight: 25 }}>{country}</Heading>
        {routeCities.filter((city) => city.country === country).map((city) => <Pressable key={city.id} accessibilityRole="button" accessibilityLabel={translateAccessibility(`Find places near ${city.name}`, language)} onPress={() => router.push({ pathname: "/map", params: { lat: String(city.latitude), lon: String(city.longitude), name: `${city.name}, ${city.country}` } } as Href)} style={[s.row, { paddingVertical: 12, gap: 10, borderBottomWidth: 1, borderColor: p.line }]}><Icon name="pin" color={p.green} /><View style={{ flex: 1 }}><Copy style={{ fontWeight: "600" }}>{city.name}</Copy><Copy muted style={{ fontSize: 12 }}>{city.country}</Copy></View><Icon name="right" color={p.muted} /></Pressable>)}
      </View>)}
      <Button secondary icon="map" onPress={() => router.push({ pathname: "/map", params: { lat: String(dynamicCity.latitude), lon: String(dynamicCity.longitude), name: `${dynamicCity.name}, ${dynamicCity.country}` } } as Href)}>Find nearby places</Button>
    </Screen>;
  }
  if (!destination) return <HomeScreen />;
  return (
    <Screen active="home" style={{ gap: 17 }}>
      <Header title="Explore places" subtitle={`${destination.name}, ${destination.country}`} />
      <Button secondary icon="compass" onPress={() => router.push("/home" as Href)}>Explore countries</Button>
      <Row style={styles.search}>
        <Icon name="search" color={p.muted} size={18} />
        <TextInput accessibilityLabel={translate("Search places", language)} placeholder={formatMessage("Search places in {city}", { city: destination.name }, language)} value={query} onChangeText={setQuery} placeholderTextColor={p.muted} style={{ flex: 1, height: 44, fontSize: 14, color: p.ink }} />
      </Row>
      <View style={[s.grid, { gap: 7 }]}>
        {filters.map((item) => <Chip key={item} selected={filter === item} onPress={() => setFilter(item)}>{item}</Chip>)}
      </View>
      <View>
        {filtered.map((place) => <PlaceRow key={place.id} place={place} saved={savedPlaces.includes(place.id)} onSave={() => togglePlace(place.id)} onPress={() => { setSelected(place); setSelectedDay(matchingDays[0] || 1); setAddedDays([]); setNotice(""); }} />)}
      </View>
      {!filtered.length && <EmptyState title="No places found" detail="Try another name or category." action="Reset search" onPress={() => { setQuery(""); setFilter("All"); }} />}
      <Button secondary icon="map" onPress={() => router.push({ pathname: "/map", params: { destination: destination.id } } as Href)}>More nearby on map</Button>
      <Sheet visible={!!selected} title={selected?.name || ""} onClose={() => setSelected(null)}>
        {selected && <>
          <PlacePreviewPhoto name={selected.name} location={`${destination.name}, ${destination.country}`} latitude={destinationPins.find((pin) => pin.id === destination.id)?.latitude} longitude={destinationPins.find((pin) => pin.id === destination.id)?.longitude} />
          <View style={{ gap: 5 }}>
            <Copy muted>{selected.category} · {destination.name}, {destination.country}</Copy>
            <Copy>{selected.detail}</Copy>
          </View>
          <Button secondary icon="map" onPress={() => openMap(selected)}>View on map</Button>
          <Button secondary icon={savedPlaces.includes(selected.id) ? "heartFill" : "heart"} onPress={() => togglePlace(selected.id)}>{savedPlaces.includes(selected.id) ? "Saved" : "Save place"}</Button>
          {canAdd ? <>
            <Copy style={s.label}>Add to day</Copy>
            <View style={s.grid}>{matchingDays.map((day) => <Chip key={day} selected={selectedDay === day} onPress={() => setSelectedDay(day)}>Day {day}</Chip>)}</View>
            <Button disabled={addedDays.includes(selectedDay)} busy={adding} icon={addedDays.includes(selectedDay) ? "check" : "plus"} onPress={async () => {
              setAdding(true);
              setNotice("");
              try {
                const day = matchingDays.includes(selectedDay) ? selectedDay : matchingDays[0];
                const matches = await searchCatalogPlace(selected);
                if (!matches[0]) throw new Error("We could not verify this place on the map yet. Try another place.");
                await addActivity({ day, period: "Afternoon", time: "13:00", name: selected.name, note: selected.detail,
                  placeId: selected.id, latitude: matches[0].latitude, longitude: matches[0].longitude });
                setAddedDays((days) => [...days, day]);
              } catch (caught) {
                setNotice(caught instanceof Error ? caught.message : "Could not add this place.");
              } finally {
                setAdding(false);
              }
            }}>{addedDays.includes(selectedDay) ? formatMessage("Added to Day {day}", { day: selectedDay }, language) : "Add to itinerary"}</Button>
            {addedDays.length > 0 && <Button secondary onPress={() => { setSelected(null); router.push("/itinerary" as Href); }}>View itinerary</Button>}
          </> : <Button onPress={() => { setSelected(null); router.push({ pathname: "/planner", params: { destination: destination.id } } as Href); }}>{trip ? "Add this city to a new route" : "Plan a trip here"}</Button>}
          <Button secondary icon="map" onPress={() => void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${selected.name}, ${destination.name}, ${destination.country}`)}`)}>Google Maps directions</Button>
          {!!notice && <Copy style={{ color: p.danger }}>{notice}</Copy>}
        </>}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tripShortcut: { minHeight: 38, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4 },
  homeBrowse: { gap: 12 },
  search: { borderWidth: 1, borderColor: p.line, borderRadius: 8, backgroundColor: p.soft, position: "relative" },
  searchInput: { width: "100%", fontSize: 14, color: p.ink, height: 48, textAlign: "center", paddingHorizontal: 16 },
  searchPlaceholder: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  countryRow: { minHeight: 74, gap: 13, paddingHorizontal: 3, paddingVertical: 10, borderBottomWidth: 1, borderColor: p.line, backgroundColor: p.white },
  countryRowPressed: { backgroundColor: p.soft, transform: [{ scale: 0.99 }] },
  countryFlag: { width: 48, height: 48, alignItems: "center", justifyContent: "center", backgroundColor: p.greenSoft, borderRadius: 8 },
  personalSection: { gap: 12, paddingTop: 20, borderTopWidth: 1, borderColor: p.line },
  personalHeading: { fontSize: 19, lineHeight: 25 },
  recentRail: { width: "100%" },
  recentRailContent: { gap: 10, paddingBottom: 2 },
  recentCard: { width: 158, height: 174, borderRadius: 8, overflow: "hidden", borderWidth: 1, borderColor: p.line, backgroundColor: p.white },
  recentCountryVisual: { height: 88, paddingHorizontal: 13, backgroundColor: p.blueSoft, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  recentFlag: { fontSize: 48, lineHeight: 58 },
  recentPhoto: { width: "100%", height: 88, borderRadius: 0, backgroundColor: p.blueSoft },
  recentCardBody: { flex: 1, paddingHorizontal: 11, paddingVertical: 8, justifyContent: "space-between" },
  recentCardName: { color: p.ink, fontSize: 14, lineHeight: 18, fontWeight: "700" },
  recentCardType: { color: p.blue, fontSize: 11, lineHeight: 14, fontWeight: "600" },
  personalCardPressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
  featuredPlace: { minHeight: 112, flexDirection: "row", alignItems: "center", gap: 12, padding: 8, paddingRight: 10, borderRadius: 8, borderWidth: 1, borderColor: "#CEDAFF", backgroundColor: p.blueSoft },
  featuredPhoto: { width: 100, height: 94, borderRadius: 5, backgroundColor: p.white },
  recommendedCopy: { flex: 1, minWidth: 0, gap: 2 },
  featuredCategory: { color: p.blue, fontSize: 11, lineHeight: 15, fontWeight: "700" },
  featuredName: { color: p.ink, fontSize: 16, lineHeight: 20, fontWeight: "700" },
  featuredLocation: { color: p.muted, fontSize: 11, lineHeight: 15 },
  featuredArrow: { width: 24, height: 24, borderRadius: 12, backgroundColor: p.white, alignItems: "center", justifyContent: "center" },
  recommendedPlace: { minHeight: 70, flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 7, borderBottomWidth: 1, borderColor: p.line },
  recommendedPhoto: { width: 54, height: 54, borderRadius: 5, backgroundColor: p.blueSoft },
  recommendedCategory: { color: p.blue, fontSize: 11, lineHeight: 15, fontWeight: "600" },
  recommendedName: { color: p.ink, fontSize: 14, lineHeight: 18, fontWeight: "700" },
  recommendedArrow: { padding: 4 },
  tipCard: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14, borderWidth: 1, borderColor: p.line, borderRadius: 12, backgroundColor: p.white },
  tipCardChecked: { borderColor: p.green, backgroundColor: "#F2FBF7" },
  tipIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
});
