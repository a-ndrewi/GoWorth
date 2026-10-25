import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect, useLocalSearchParams, type Href } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { Button, Chip, Copy, DestinationPhoto, EmptyState, Header, Heading, Icon, IconButton, Row, Screen, SectionTitle, Sheet, sharedSheet, type IconName } from "@/components/goworth/ui";
import { PlacePreviewPhoto, PlaceThumbnail } from "@/components/goworth/place-preview";
import { DiscoverySwiper } from "@/components/goworth/discovery-swiper";
import { Shimmer, SkeletonRows } from "@/components/goworth/loading";
import { themedStyles } from "@/constants/design";
import { usePalette, useStyles } from "@/state/theme-context";
import { tipsForDestination, type DestinationTip } from "@/data/tips";
import {
  destinations, placesForDestination, tripDays,
  type Place,
} from "@/data/travel";
import { useTravel } from "@/state/travel-context";
import { normalizeSearchText } from "@/utils/search";
import { destinationPins, searchCatalogPlace } from "@/data/map";
import { citiesForDay, nextActivitySlot } from "@/utils/trip";
import { uniqueRouteStops } from "@/data/trip-route";
import { formatMessage, translate, translateAccessibility, translateLocation } from "@/data/i18n";
import { useAppLanguage } from "@/data/formatting";
import { citiesForCountry, cityForId, countries, countryFlag, countryForCode } from "@/data/geography";
import { loadNearbyPlaces, venueFromCategory, type NearbyPlace } from "@/data/nearby-places";
import { venueFilterIcons } from "@/components/goworth/venue-art";
import { unseenNearbyPlaces, type PlaceVisit } from "@/utils/explore-history";
import { CountryHoneycomb } from "@/components/goworth/country-honeycomb";
import { publicPlaceCategory } from "@/utils/public-activity";
import { TripShortcut } from "@/components/goworth/trip-shortcut";

/** Venues keep their own glyph on Explore's cards; every other place gets the pin. */
function placeIcon(category: string): IconName {
  const venue = venueFromCategory(category);
  return venue ? venueFilterIcons[venue.kind] : "pin";
}

function PlaceRow({ place, location, onPress, saved, onSave, onPhotoAvailable }: {
  place: Place;
  location: string;
  onPress: () => void;
  saved: boolean;
  onSave: () => void;
  onPhotoAvailable?: (available: boolean) => void;
}) {
  const s = useStyles(sharedSheet);
  const p = usePalette();
  const language = useAppLanguage();
  return (
    <Row style={{ gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderColor: p.line }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={translateAccessibility(`View ${place.name}`, language)}
        onPress={onPress}
        style={[s.row, { flex: 1, minWidth: 0, gap: 12 }]}
      >
        <PlaceThumbnail name={place.name} location={location} style={{ width: 54, height: 54 }} onPhotoAvailable={onPhotoAvailable} />
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
  const styles = useStyles(stylesSheet);
  const p = usePalette();
  const language = useAppLanguage();
  const { trip, exploreHistory } = useTravel();
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [gridActive, setGridActive] = useState(false);
  const [nearbyResult, setNearbyResult] = useState<{ key: string; status: "ready" | "error"; places: NearbyPlace[] } | null>(null);
  const [nearbyAttempt, setNearbyAttempt] = useState(0);
  const filtered = useMemo(() => countries.filter((country) =>
    normalizeSearchText(`${country.name} ${translate(country.name, language)}`).includes(normalizeSearchText(query.trim()))), [query, language]);
  const browsing = !query.trim() && !searchFocused;
  const recent = [
    ...exploreHistory.countries.slice(0, 2).map((visit) => ({ kind: "country" as const, visit })),
    ...exploreHistory.places.slice(0, 2).map((visit) => ({ kind: "place" as const, visit })),
  ].sort((a, b) => b.visit.viewedAt - a.visit.viewedAt);
  // Each section stands on its own: places opened from the discovery deck are remembered without a country visit.
  const showRecent = browsing && recent.length > 0;
  const recommendationSeed = useMemo(() => {
    const countryVisit = exploreHistory.countries[0];
    const placeVisit = exploreHistory.places[0];
    const country = countryVisit ? countryForCode(countryVisit.code) : undefined;
    const countryCities = country ? citiesForCountry(country.code) : [];
    const countryCity = countryCities.find((city) => city.name.toLocaleLowerCase() === country?.capital.toLocaleLowerCase()) ?? countryCities[0];
    if (countryVisit && country && countryCity && (!placeVisit || countryVisit.viewedAt > placeVisit.viewedAt)) {
      return { key: `country:${country.code}`, latitude: countryCity.latitude, longitude: countryCity.longitude,
        countryCode: country.code, cityId: countryCity.id, location: `${countryCity.name}, ${country.name}`,
        label: countryVisit.searchTerm || country.name };
    }
    if (!placeVisit) return null;
    const countryName = countryForCode(placeVisit.countryCode)?.name ?? placeVisit.countryCode;
    const cityName = cityForId(placeVisit.countryCode, placeVisit.cityId)?.name ?? placeVisit.place.name;
    return { key: `place:${placeVisit.place.id}`, latitude: placeVisit.place.latitude, longitude: placeVisit.place.longitude,
      countryCode: placeVisit.countryCode, cityId: placeVisit.cityId,
      location: `${cityName}, ${countryName}`,
      label: placeVisit.searchTerm || placeVisit.place.name };
  }, [exploreHistory]);
  const showMore = browsing && !!recommendationSeed;
  const seedKey = recommendationSeed?.key ?? "";
  useEffect(() => {
    if (!showMore || !recommendationSeed) return;
    let active = true;
    loadNearbyPlaces(recommendationSeed, 10)
      .then((places) => { if (active) setNearbyResult({ key: recommendationSeed.key, status: "ready", places }); })
      .catch(() => { if (active) setNearbyResult({ key: recommendationSeed.key, status: "error", places: [] }); });
    return () => { active = false; };
    // The seed object changes with every history write; only a new key needs a new lookup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMore, seedKey, nearbyAttempt]);
  // A lookup that failed (offline, a slow provider) is tried again whenever Explore comes back into view.
  useFocusEffect(useCallback(() => {
    if (nearbyResult?.status === "error") setNearbyAttempt((count) => count + 1);
  }, [nearbyResult?.status]));
  const suggestions = recommendationSeed && nearbyResult?.key === recommendationSeed.key
    ? unseenNearbyPlaces(nearbyResult.places, exploreHistory) : [];
  const placeRoute = (visit: PlaceVisit) => ({ pathname: "/place", params: {
    country: visit.countryCode, city: visit.cityId, place: visit.place.id,
    name: visit.place.name, latitude: String(visit.place.latitude), longitude: String(visit.place.longitude),
    category: visit.place.category, detail: visit.place.detail, sourceUrl: visit.place.sourceUrl,
    ...(visit.place.venue ? {
      terrace: visit.place.venue.terrace ? "1" : "", cuisine: visit.place.venue.cuisine ?? "",
      hours: visit.place.venue.openingHours ?? "", address: visit.place.venue.address ?? "",
    } : {}),
  } } as Href);

  return (
    <Screen active="home" style={{ gap: 18 }} scrollEnabled={!gridActive}>
      <View style={styles.homeBrowse}>
        <Row style={styles.searchRow}>
          <Row style={[styles.search, trip ? styles.searchWithTrip : styles.searchFull]}>
          <TextInput
            accessibilityLabel={translate("Search countries", language)}
            value={query}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            onChangeText={setQuery}
            returnKeyType="search"
            style={styles.searchInput}
          />
          {!searchFocused && !query && <View pointerEvents="none" style={styles.searchPlaceholder}>
            <Icon name="search" color={p.muted} size={18} />
            <Copy muted style={{ fontSize: 14 }}>{translate("Search countries", language)}</Copy>
          </View>}
          </Row>
          {trip && <TripShortcut label={translateAccessibility("My itinerary", language)} onPress={() => router.push("/itinerary" as Href)} />}
        </Row>
      </View>
      {browsing && <DiscoverySwiper />}
      <SectionTitle title={translate("Countries", language)} action={translate("View map", language)} onPress={() => router.push("/map" as Href)} />
      {!!filtered.length && <CountryHoneycomb
        countries={filtered}
        onInteraction={setGridActive}
        onSelect={(code) => router.push({ pathname: "/country", params: { code, ...(query.trim() ? { search: query.trim() } : {}) } } as Href)}
      />}
      {!filtered.length && <EmptyState title={translate("No countries found", language)} detail={translate("Try another country name.", language)} action={translate("Clear search", language)} onPress={() => setQuery("")} />}
      {showRecent && <View style={styles.personalSection}>
        <View style={{ gap: 2 }}>
          <Text style={styles.eyebrow}>{translate("JUMP BACK IN", language)}</Text>
          <Heading style={styles.personalHeading}>{translate("Recently viewed", language)}</Heading>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.recentRail} contentContainerStyle={styles.recentRailContent}>
        {recent.map((entry) => entry.kind === "country" ? (() => {
          const country = countryForCode(entry.visit.code);
          if (!country) return null;
          return <Pressable key={`country:${country.code}`} accessibilityRole="button" accessibilityLabel={`${translate("Country", language)}: ${translate(country.name, language)}`} onPress={() => router.push({ pathname: "/country", params: { code: country.code } } as Href)} style={({ pressed }) => [styles.recentCard, pressed && styles.personalCardPressed]}>
            <LinearGradient colors={[p.blue, "#3B7BF0", p.teal]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <Text style={styles.recentFlag}>{countryFlag(country.code)}</Text>
            <View style={styles.recentBody}>
              <View style={styles.recentPill}><Icon name="globe" size={12} color={p.onColor} /><Text style={styles.recentPillText}>{translate("Country", language)}</Text></View>
              <Text numberOfLines={2} style={styles.recentName}>{translate(country.name, language)}</Text>
              <Text numberOfLines={1} style={styles.recentMeta}>{formatMessage("{count} cities", { count: country.cityCount.toLocaleString(language === "ro" ? "ro-RO" : "en-US") }, language)}</Text>
            </View>
          </Pressable>;
        })() : <Pressable key={`place:${entry.visit.place.id}`} accessibilityRole="button" accessibilityLabel={`${translate("Place", language)}: ${entry.visit.place.name}`} onPress={() => router.push(placeRoute(entry.visit))} style={({ pressed }) => [styles.recentCard, pressed && styles.personalCardPressed]}>
          <PlaceThumbnail name={entry.visit.place.name} location={entry.visit.place.location || countryForCode(entry.visit.countryCode)?.name || ""} latitude={entry.visit.place.latitude} longitude={entry.visit.place.longitude} sourceUrl={entry.visit.place.sourceUrl} style={styles.photoFill} thumbWidth={330} venue={venueFromCategory(entry.visit.place.category)} />
          <LinearGradient colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.05)", "rgba(10,20,40,0.82)"]} style={StyleSheet.absoluteFill} />
          <View style={styles.recentBody}>
            <View style={styles.recentPill}><Icon name={placeIcon(entry.visit.place.category)} size={12} color={p.onColor} /><Text numberOfLines={1} style={styles.recentPillText}>{translate(publicPlaceCategory(entry.visit.place.category) || "Place", language)}</Text></View>
            <Text numberOfLines={2} style={styles.recentName}>{entry.visit.place.name}</Text>
            <Text numberOfLines={1} style={styles.recentMeta}>{countryFlag(entry.visit.countryCode)} {translate(countryForCode(entry.visit.countryCode)?.name ?? entry.visit.countryCode, language)}</Text>
          </View>
        </Pressable>)}
        </ScrollView>
      </View>}
      {showMore && recommendationSeed && <View style={styles.personalSection}>
        <View style={{ gap: 2 }}>
          <Text style={styles.eyebrow}>{formatMessage("BECAUSE YOU LOOKED AT {query}", { query: recommendationSeed.label.toLocaleUpperCase() }, language)}</Text>
          <Heading style={styles.personalHeading}>{formatMessage("More to see near {place}", { place: translateLocation(recommendationSeed.location, language).split(",")[0] }, language)}</Heading>
        </View>
        {nearbyResult?.key !== recommendationSeed.key && <View style={{ gap: 10 }}><Shimmer style={styles.featured} /><Row style={{ gap: 10 }}><Shimmer style={styles.tile} /><Shimmer style={styles.tile} /></Row></View>}
        {!!suggestions.length && (() => {
          const [first, ...rest] = suggestions;
          const open = (place: NearbyPlace) => router.push(placeRoute({ countryCode: recommendationSeed.countryCode, cityId: recommendationSeed.cityId, place, viewedAt: 0 }));
          return <>
            <Pressable accessibilityRole="button" accessibilityLabel={`${translate("Place", language)}: ${first.name}`} onPress={() => open(first)} style={({ pressed }) => [styles.featured, pressed && styles.personalCardPressed]}>
              <PlaceThumbnail name={first.name} location={recommendationSeed.location} latitude={first.latitude} longitude={first.longitude} sourceUrl={first.sourceUrl} style={styles.photoFill} thumbWidth={500} venue={venueFromCategory(first.category)} />
              <LinearGradient colors={["rgba(0,0,0,0.1)", "rgba(0,0,0,0)", "rgba(10,20,40,0.85)"]} style={StyleSheet.absoluteFill} />
              <View style={styles.featuredTop}>
                <View style={styles.recentPill}><Text style={styles.recentPillText}>{translate("Top pick", language)}</Text></View>
                <View style={styles.featuredArrow}><Icon name="right" color={p.blue} size={16} /></View>
              </View>
              <View style={styles.recentBody}>
                <Text numberOfLines={1} style={styles.featuredCategory}>{translate(publicPlaceCategory(first.category) || first.category, language)}</Text>
                <Text numberOfLines={2} style={styles.featuredName}>{first.name}</Text>
                <Row style={{ gap: 4 }}><Icon name="pin" size={13} color="rgba(255,255,255,0.85)" /><Text numberOfLines={1} style={styles.recentMeta}>{translateLocation(recommendationSeed.location, language)}</Text></Row>
              </View>
            </Pressable>
            {!!rest.length && <View style={styles.tiles}>
              {rest.slice(0, rest.length > 1 ? Math.min(6, rest.length - (rest.length % 2)) : 1).map((place) => <Pressable key={place.id} accessibilityRole="button" accessibilityLabel={`${translate("Place", language)}: ${place.name}`} onPress={() => open(place)} style={({ pressed }) => [styles.tile, pressed && styles.personalCardPressed]}>
                <PlaceThumbnail name={place.name} location={recommendationSeed.location} latitude={place.latitude} longitude={place.longitude} sourceUrl={place.sourceUrl} style={styles.photoFill} thumbWidth={330} venue={venueFromCategory(place.category)} />
                <LinearGradient colors={["rgba(0,0,0,0)", "rgba(10,20,40,0.8)"]} style={StyleSheet.absoluteFill} />
                <View style={styles.recentBody}>
                  <Text numberOfLines={1} style={styles.tileCategory}>{translate(publicPlaceCategory(place.category) || place.category, language)}</Text>
                  <Text numberOfLines={2} style={styles.tileName}>{place.name}</Text>
                </View>
              </Pressable>)}
            </View>}
          </>;
        })()}
        {nearbyResult?.key === recommendationSeed.key && !suggestions.length && <View style={styles.personalEmpty}>
          <Icon name="compass" size={24} color={p.blue} />
          <Copy muted style={{ textAlign: "center", fontSize: 13 }}>{translate(nearbyResult.status === "error" ? "Nearby places are unavailable right now." : "No places found nearby", language)}</Copy>
          {nearbyResult.status === "error" && <Pressable accessibilityRole="button" onPress={() => setNearbyAttempt((count) => count + 1)} hitSlop={8}><Copy style={{ color: p.blue, fontWeight: "700", fontSize: 13 }}>{translate("Retry", language)}</Copy></Pressable>}
        </View>}
      </View>}
    </Screen>
  );
}

export function TripDetailsScreen() {
  const p = usePalette();
  const language = useAppLanguage();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const destination = destinations.find((item) => item.id === id);
  const { saved, savedPlaces, toggleSaved, togglePlace } = useTravel();
  const [tab, setTab] = useState("Overview");
  const [notice, setNotice] = useState("");
  const [checkedTips, setCheckedTips] = useState<string[]>([]);
  const [photoAvailability, setPhotoAvailability] = useState<Record<string, boolean>>({});
  if (!destination) {
    return <Screen><Header title="Destination" /><EmptyState title="Destination not found" detail="This destination is no longer in the catalog." action="Explore destinations" onPress={() => router.replace("/home" as Href)} /></Screen>;
  }
  const isSaved = saved.includes(destination.id);
  const nearby = placesForDestination(destination.id);
  const tips = tipsForDestination(destination);
  const checkedTipCount = checkedTips.filter((id) => tips.some((tip) => tip.id === id)).length;
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
          <Button secondary icon="share" onPress={async () => {
            try { await Share.share({ message: formatMessage("Explore {destination}, {country} with GoWorth.", { destination: destination.name, country: translate(destination.country, language) }, language) }); }
            catch { setNotice("Sharing is unavailable on this device."); }
          }}>Share destination</Button>
        </>}
        {tab === "Places" && <>
          <Heading style={{ fontSize: 20 }}>{formatMessage("{count} places to explore", { count: nearby.length }, language)}</Heading>
          {nearby.filter((place) => photoAvailability[place.id] !== false).slice(0, 4).map((place) => <PlaceRow key={place.id} place={place} location={`${destination.name}, ${destination.country}`} saved={savedPlaces.includes(place.id)} onSave={() => togglePlace(place.id)} onPhotoAvailable={(available) => setPhotoAvailability((current) => current[place.id] === available ? current : { ...current, [place.id]: available })} onPress={() => router.push({ pathname: "/explore", params: { id: destination.id, place: place.id } } as Href)} />)}
          <Button secondary onPress={() => router.push({ pathname: "/explore", params: { id: destination.id } } as Href)}>View all places</Button>
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
  onPlan,
}: {
  destination: (typeof destinations)[number];
  tips: DestinationTip[];
  checkedTips: string[];
  checkedTipCount: number;
  onToggle: (id: string) => void;
  onShare: () => void;
  onPlan: () => void;
}) {
  const styles = useStyles(stylesSheet);
  const p = usePalette();
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
      <Button icon="calendar" onPress={onPlan}>Use tips while planning</Button>
    </View>
  </View>;
}

export function ExploreScreen() {
  const styles = useStyles(stylesSheet);
  const s = useStyles(sharedSheet);
  const p = usePalette();
  const language = useAppLanguage();
  const { id, place: placeId } = useLocalSearchParams<{ id?: string; place?: string }>();
  const { trip, activities, savedPlaces, togglePlace, addActivity } = useTravel();
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
  const [photoAvailability, setPhotoAvailability] = useState<Record<string, boolean>>({});
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
  const photoFiltered = filtered.filter((place) => photoAvailability[place.id] !== false);
  const checkingPhotos = filtered.some((place) => photoAvailability[place.id] === undefined);
  const matchingDays = trip && destination ? Array.from({ length: tripDays(trip.start, trip.end) }, (_, index) => index + 1)
    .filter((day) => citiesForDay(trip, day).includes(destination.id)) : [];
  const canAdd = matchingDays.length > 0;
  if (dynamicCity) {
    const countries = [...new Set(routeCities.map((city) => city.country))];
    return <Screen active="home" style={{ gap: 17 }}>
      <Header title="Explore places" subtitle={`${dynamicCity.name}, ${dynamicCity.country}`} />
      {countries.map((country) => <View key={country} style={{ gap: 8 }}>
        <Heading style={{ fontSize: 19, lineHeight: 25 }}>{country}</Heading>
        {routeCities.filter((city) => city.country === country).map((city) => <Pressable key={city.id} accessibilityRole="button" accessibilityLabel={translateAccessibility(`Find places near ${city.name}`, language)} onPress={() => router.push({ pathname: "/city", params: { country: city.countryCode, city: city.id } } as Href)} style={[s.row, { paddingVertical: 12, gap: 10, borderBottomWidth: 1, borderColor: p.line }]}><Icon name="pin" color={p.green} /><View style={{ flex: 1 }}><Copy style={{ fontWeight: "600" }}>{city.name}</Copy><Copy muted style={{ fontSize: 12 }}>{city.country}</Copy></View><Icon name="right" color={p.muted} /></Pressable>)}
      </View>)}
    </Screen>;
  }
  if (!destination) return <HomeScreen />;
  return (
    <Screen active="home" style={{ gap: 17 }}>
      <Header title="Explore places" subtitle={`${destination.name}, ${destination.country}`} />
      <Button secondary icon="compass" onPress={() => router.dismissTo("/home" as Href)}>Explore countries</Button>
      <Row style={styles.search}>
        <Icon name="search" color={p.muted} size={18} />
        <TextInput accessibilityLabel={translate("Search places", language)} placeholder={formatMessage("Search places in {city}", { city: destination.name }, language)} value={query} onChangeText={setQuery} placeholderTextColor={p.muted} style={{ flex: 1, height: 44, fontSize: 14, color: p.ink }} />
      </Row>
      <View style={[s.grid, { gap: 7 }]}>
        {filters.map((item) => <Chip key={item} selected={filter === item} onPress={() => setFilter(item)}>{item}</Chip>)}
      </View>
      <View>
        {photoFiltered.map((place) => <PlaceRow key={place.id} place={place} location={`${destination.name}, ${destination.country}`} saved={savedPlaces.includes(place.id)} onSave={() => togglePlace(place.id)} onPhotoAvailable={(available) => setPhotoAvailability((current) => current[place.id] === available ? current : { ...current, [place.id]: available })} onPress={() => { setSelected(place); setSelectedDay(matchingDays[0] || 1); setAddedDays([]); setNotice(""); }} />)}
      </View>
      {!photoFiltered.length && checkingPhotos && <SkeletonRows count={4} />}
      {!photoFiltered.length && !filtered.length && <EmptyState title="No places found" detail="Try another name or category." action="Reset search" onPress={() => { setQuery(""); setFilter("All"); }} />}
      <Sheet visible={!!selected} title={selected?.name || ""} onClose={() => setSelected(null)}>
        {selected && <>
          <PlacePreviewPhoto name={selected.name} location={`${destination.name}, ${destination.country}`} latitude={destinationPins.find((pin) => pin.id === destination.id)?.latitude} longitude={destinationPins.find((pin) => pin.id === destination.id)?.longitude} badge={translate(selected.category, language)} />
          <View style={{ gap: 5 }}>
            <Copy>{selected.detail}</Copy>
          </View>
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
                const slot = nextActivitySlot(activities, day);
                await addActivity({ day, ...slot, name: selected.name, note: selected.detail,
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

const stylesSheet = themedStyles((p) => ({
  searchRow: { width: "100%", gap: 8, alignItems: "stretch" },
  homeBrowse: { gap: 12 },
  search: { borderWidth: 1, borderColor: p.line, borderRadius: 8, backgroundColor: p.soft, position: "relative", minWidth: 0 },
  searchFull: { flex: 1 },
  searchWithTrip: { flex: 1 },
  searchInput: { width: "100%", fontSize: 14, color: p.ink, height: 48, textAlign: "center", paddingHorizontal: 16 },
  searchPlaceholder: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  personalSection: { gap: 12, paddingTop: 8 },
  photoFill: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", borderRadius: 0, backgroundColor: p.blueSoft },
  eyebrow: { color: p.blue, fontSize: 11, fontWeight: "800", letterSpacing: 0.4 },
  personalHeading: { fontSize: 21, lineHeight: 27 },
  recentRail: { width: "100%" },
  recentRailContent: { gap: 10, paddingBottom: 2 },
  recentCard: { width: 156, height: 206, borderRadius: 20, overflow: "hidden", backgroundColor: p.blueSoft },
  recentFlag: { position: "absolute", top: 16, left: 14, fontSize: 54, lineHeight: 64 },
  recentBody: { position: "absolute", left: 12, right: 12, bottom: 12, gap: 4 },
  recentPill: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 4, maxWidth: "100%", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.22)" },
  recentPillText: { color: p.onColor, fontSize: 11, fontWeight: "800" },
  recentName: { color: p.onColor, fontSize: 16, lineHeight: 20, fontWeight: "800" },
  recentMeta: { flexShrink: 1, color: "rgba(255,255,255,0.88)", fontSize: 12, fontWeight: "600" },
  personalCardPressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
  featured: { height: 230, borderRadius: 22, overflow: "hidden", backgroundColor: p.blueSoft },
  featuredTop: { position: "absolute", top: 12, left: 12, right: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  featuredArrow: { width: 34, height: 34, borderRadius: 17, backgroundColor: p.white, alignItems: "center", justifyContent: "center" },
  featuredCategory: { color: "#BFD0FF", fontSize: 12, fontWeight: "800" },
  featuredName: { color: p.onColor, fontSize: 22, lineHeight: 27, fontWeight: "800" },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: { width: "48%", flexGrow: 1, height: 150, borderRadius: 18, overflow: "hidden", backgroundColor: p.blueSoft },
  tileCategory: { color: "#BFD0FF", fontSize: 11, fontWeight: "800" },
  tileName: { color: p.onColor, fontSize: 14, lineHeight: 18, fontWeight: "800" },
  personalEmpty: { alignItems: "center", gap: 10, padding: 20, borderRadius: 18, borderWidth: 1.5, borderStyle: "dashed", borderColor: p.blueLine, backgroundColor: p.blueTint },
  tipCard: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14, borderWidth: 1, borderColor: p.line, borderRadius: 12, backgroundColor: p.white },
  tipCardChecked: { borderColor: p.green, backgroundColor: p.greenSoft },
  tipIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
}));
