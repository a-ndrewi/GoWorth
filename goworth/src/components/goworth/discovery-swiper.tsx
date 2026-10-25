import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import * as Location from "expo-location";
import { router, type Href } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated as LegacyAnimated, Platform, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, {
  cancelAnimation, Easing, Extrapolation, interpolate, runOnUI, useAnimatedStyle, useSharedValue, withRepeat, withSpring, withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import { Copy, DestinationPhoto, Heading, Icon, IconButton, Row } from "@/components/goworth/ui";
import { themedStyles } from "@/constants/design";
import { usePalette, useStyles } from "@/state/theme-context";
import { discoveryDeck, distanceKm, type Coordinates, type DiscoveryItem } from "@/data/discovery";
import { destinations, places } from "@/data/travel";
import { destinationPins } from "@/data/map";
import { cityForGlobalId, countryForCode, nearestCity, worldDiscoveryCities, type City } from "@/data/geography";
import { filterVenues, loadNearbyPlaces, loadNearbyVenues, type NearbyPlace } from "@/data/nearby-places";
import { VenueArt, venueFilterIcons } from "@/components/goworth/venue-art";
import { findPlacePhoto } from "@/data/place-photo";
import { loadRecentDiscoveries, type RecentDiscovery } from "@/lib/travel-repository";
import { useTravel } from "@/state/travel-context";
import { formatMessage, translate, translateAccessibility, translateLocation } from "@/data/i18n";
import { useAppLanguage } from "@/data/formatting";
import { isSavedDiscoverySuggestion } from "@/utils/discovery-suggestions";
import { SyncFailure } from "@/utils/sync-error";

/** Cities a worldwide deck draws more places from once the catalog runs low, in a fresh order each time the app opens. */
let worldCityOrder: City[] | null = null;
function worldCities() {
  if (!worldCityOrder) {
    worldCityOrder = worldDiscoveryCities();
    for (let index = worldCityOrder.length - 1; index > 0; index--) {
      const other = Math.floor(Math.random() * (index + 1));
      [worldCityOrder[index], worldCityOrder[other]] = [worldCityOrder[other], worldCityOrder[index]];
    }
  }
  return worldCityOrder;
}
/** How many cities in a row may come back empty before the deck stops asking, so being offline does not loop. */
const worldMisses = 4;

type SwipeItem = DiscoveryItem | { key: string; kind: "nearby"; place: NearbyPlace; location: string; distanceKm?: number };

function Radar({ title, detail }: { title: string; detail: string }) {
  const styles = useStyles(stylesSheet);
  const p = usePalette();
  const [pulse] = useState(() => new LegacyAnimated.Value(0));
  useEffect(() => {
    const animation = LegacyAnimated.loop(LegacyAnimated.timing(pulse, {
      toValue: 1, duration: 1700, useNativeDriver: Platform.OS !== "web",
    }));
    animation.start();
    return () => animation.stop();
  }, [pulse]);
  return <View style={styles.radarWrap}>
    <View style={styles.radar}>
      {[70, 114, 158].map((size) => <View key={size} style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 1, borderColor: p.blueLine, position: "absolute" }} />)}
      <LegacyAnimated.View style={{ width: 152, height: 152, borderRadius: 76, borderWidth: 2, borderColor: p.blue, position: "absolute", opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1.2] }) }] }} />
      <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: p.blue, alignItems: "center", justifyContent: "center" }}><Icon name="compass" color={p.onColor} size={25} /></View>
    </View>
    <Heading style={{ fontSize: 19, textAlign: "center" }}>{title}</Heading>
    <Copy muted style={{ textAlign: "center", fontSize: 13, lineHeight: 19 }}>{detail}</Copy>
  </View>;
}

/** Resolved card photos, shared across renders so a card never swaps images once it is on screen. */
const photoCache = new Map<string, string | null>();
const photoRequests = new Map<string, Promise<string | null>>();

function resolveCardPhoto(item: SwipeItem): Promise<string | null> {
  // Venues almost never have a free photo; their card draws its own art instead of searching.
  if (item.kind === "nearby" && item.place.venue) photoCache.set(item.key, null);
  if (photoCache.has(item.key)) return Promise.resolve(photoCache.get(item.key) ?? null);
  let request = photoRequests.get(item.key);
  if (!request) {
    const name = item.kind === "nearby" ? item.place.name : item.place?.name;
    const location = item.kind === "nearby" ? item.location : `${item.destination.name}, ${item.destination.country}`;
    const pin = item.kind === "nearby" ? item.place : destinationPins.find((value) => value.id === item.destination.id);
    request = (name ? findPlacePhoto(name, location, pin?.latitude, pin?.longitude, item.kind === "nearby" ? item.place.sourceUrl : undefined) : Promise.resolve(null))
      .then(async (photo) => {
        // Download before revealing, so the card shows the final photo in one step.
        if (photo?.url && !await Image.prefetch(photo.url, "memory-disk").catch(() => false)) return null;
        return photo?.url ?? null;
      })
      .then((url) => { photoCache.set(item.key, url); return url; })
      // A failed search is not remembered as "no photo": the card asks again the next time it comes up.
      .catch(() => { photoRequests.delete(item.key); return null; });
    photoRequests.set(item.key, request);
  }
  return request;
}

function useCardPhoto(item: SwipeItem) {
  const [state, setState] = useState<{ key: string; url: string | null } | null>(() =>
    photoCache.has(item.key) ? { key: item.key, url: photoCache.get(item.key) ?? null } : null);
  useEffect(() => {
    let active = true;
    void resolveCardPhoto(item).then((url) => { if (active) setState({ key: item.key, url }); });
    return () => { active = false; };
  }, [item]);
  const failed = (url: string) => { photoCache.set(item.key, null); setState((current) => current?.url === url ? { key: item.key, url: null } : current); };
  return { ready: state?.key === item.key, url: state?.key === item.key ? state.url : null, failed };
}

function openItem(item: SwipeItem) {
  if (item.kind === "nearby") {
    // Places are not drawn on the globe, so open the place itself, filed under its nearest city.
    const city = nearestCity(item.place.latitude, item.place.longitude);
    if (!city) return;
    router.push({ pathname: "/place", params: {
      country: city.countryCode, city: city.id, place: item.place.id, name: item.place.name,
      latitude: String(item.place.latitude), longitude: String(item.place.longitude),
      category: item.place.category, detail: item.place.detail, sourceUrl: item.place.sourceUrl,
      ...(item.place.venue ? {
        terrace: item.place.venue.terrace ? "1" : "", cuisine: item.place.venue.cuisine ?? "",
        hours: item.place.venue.openingHours ?? "", address: item.place.venue.address ?? "",
      } : {}),
    } } as Href);
    return;
  }
  router.push(item.kind === "destination"
    ? { pathname: "/trip", params: { id: item.destination.id } } as Href
    : { pathname: "/explore", params: { id: item.destination.id, place: item.place!.id } } as Href);
}

/** A button press aimed at one card, so a card that later reaches the top never replays it. */
type SwipeCommand = { choice: "skip" | "favorite"; id: number; key: string };

function SwipeCard({ item, depth, height, command, onSwiped }: {
  item: SwipeItem;
  depth: number;
  height: number;
  command: SwipeCommand | null;
  onSwiped: (item: SwipeItem, choice: "skip" | "favorite") => void;
}) {
  const styles = useStyles(stylesSheet);
  const p = usePalette();
  const language = useAppLanguage();
  const photo = useCardPhoto(item);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const layer = useSharedValue(depth);
  const flying = useSharedValue(false);
  const shimmer = useSharedValue(0);
  const destination = item.kind === "nearby" ? null : item.destination;
  const venue = item.kind === "nearby" ? item.place.venue : undefined;
  const placeName = item.kind === "nearby" ? item.place.name : item.place?.name;
  const venueDetail = venue ? [venue.cuisine, venue.terrace ? translate("Terrace", language) : null, venue.openingHours && venue.openingHours.length <= 28 ? venue.openingHours : venue.address].filter(Boolean).join(" · ") : "";
  useEffect(() => { layer.set(withSpring(depth, { damping: 17, stiffness: 190 })); }, [depth, layer]);
  useEffect(() => {
    if (photo.ready) return;
    shimmer.set(withRepeat(withTiming(1, { duration: 900 }), -1, true));
    // An endless loop keeps redrawing every frame, so it must stop as soon as the photo is in.
    return () => cancelAnimation(shimmer);
  }, [photo.ready, shimmer]);
  const finish = (choice: "skip" | "favorite") => onSwiped(item, choice);
  const fly = (choice: "skip" | "favorite", velocity = 0) => {
    "worklet";
    if (flying.value) return;
    flying.set(true);
    const direction = choice === "favorite" ? 1 : -1;
    y.set(withTiming(y.value + 30, { duration: 240 }));
    x.set(withTiming(direction * 620, { duration: Math.max(150, 260 - Math.abs(velocity) / 20), easing: Easing.out(Easing.quad) }, (done) => {
      if (done) scheduleOnRN(finish, choice);
    }));
  };
  useEffect(() => {
    if (command && depth === 0) runOnUI(fly)(command.choice);
  // A button press is a new command; the card reacts once per command id.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command?.id]);
  const gesture = usePanGesture({
    enabled: depth === 0,
    activeOffsetX: [-10, 10],
    failOffsetY: [-18, 18],
    onUpdate: ({ translationX, translationY }) => {
      "worklet";
      x.set(translationX);
      y.set(translationY * 0.2);
    },
    onDeactivate: ({ translationX, velocityX }) => {
      "worklet";
      if (translationX > 95 || velocityX > 900) fly("favorite", velocityX);
      else if (translationX < -95 || velocityX < -900) fly("skip", velocityX);
      else { x.set(withSpring(0, { damping: 15, stiffness: 220 })); y.set(withSpring(0, { damping: 15, stiffness: 220 })); }
    },
  });
  const cardStyle = useAnimatedStyle(() => ({
    opacity: interpolate(layer.value, [1.4, 2], [1, 0], Extrapolation.CLAMP),
    transform: [
      { translateX: x.value + layer.value * 10 },
      { translateY: y.value + layer.value * 10 },
      { rotate: `${interpolate(x.value, [-260, 0, 260], [-12, 0, 12])}deg` },
      { scale: 1 - layer.value * 0.035 },
    ],
  }));
  const dimStyle = useAnimatedStyle(() => ({ opacity: interpolate(layer.value, [0, 1], [0, 0.45], Extrapolation.CLAMP) }));
  const saveStyle = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [20, 110], [0, 1], Extrapolation.CLAMP) }));
  const passStyle = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [-110, -20], [1, 0], Extrapolation.CLAMP) }));
  const shimmerStyle = useAnimatedStyle(() => ({ opacity: 0.35 + shimmer.value * 0.35 }));
  return <GestureDetector gesture={gesture}>
    <Animated.View pointerEvents={depth === 0 ? "auto" : "none"} style={[styles.card, { height, zIndex: 10 - depth }, cardStyle]}>
      {!photo.ready && <Animated.View style={[StyleSheet.absoluteFill, shimmerStyle]}>
        <LinearGradient colors={[p.blue, p.teal]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      </Animated.View>}
      {photo.ready && !photo.url && (venue ? <VenueArt venue={venue} /> : destination
        ? <DestinationPhoto destination={destination} style={StyleSheet.absoluteFill} />
        : <LinearGradient colors={[p.blue, p.teal]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />)}
      {photo.ready && !!photo.url && <Image source={{ uri: photo.url }} cachePolicy="memory-disk" contentFit="cover" transition={180} accessibilityLabel={translateAccessibility(`Photo of ${placeName}`, language)} onError={() => photo.failed(photo.url!)} style={StyleSheet.absoluteFill} />}
      <LinearGradient colors={["rgba(0,0,0,0.14)", "rgba(0,0,0,0.06)", "rgba(0,0,0,0.82)"]} style={StyleSheet.absoluteFill} />
      <View style={styles.cardContent}>
        <View style={{ alignSelf: "flex-start", gap: 7 }}>
          <View style={styles.typeBadge}><Icon name={venue ? venueFilterIcons[venue.kind] : "pin"} size={15} color={p.onColor} /><Copy style={styles.typeText}>{item.kind === "nearby" ? `${translate(item.place.category, language)}${item.distanceKm !== undefined ? ` · ~${Math.round(item.distanceKm)} km` : ""}` : translate(item.place?.category ?? "Place", language)}</Copy></View>
        </View>
        {depth === 0 && <IconButton name="right" label={`Explore ${placeName}`} onPress={() => openItem(item)} filled style={{ position: "absolute", right: 12, top: 12, width: 38, height: 38, minWidth: 38, minHeight: 38 }} />}
        <View style={{ gap: 7 }}>
          <Heading style={styles.cardTitle}>{placeName}</Heading>
          <Copy style={styles.cardMeta}>{item.kind === "nearby" ? translateLocation(item.location, language) : `${translate(item.destination.name, language)}, ${translate(item.destination.country, language)}`}{item.distanceKm !== undefined ? formatMessage("  ·  ~{distance} km away", { distance: Math.round(item.distanceKm) }, language) : ""}</Copy>
          <Copy style={styles.cardDetail}>{venue && item.kind === "nearby" ? venueDetail || translate(item.place.category, language) : item.kind === "nearby" ? item.place.category : item.place?.detail ?? item.destination.description}</Copy>
        </View>
      </View>
      <Animated.View pointerEvents="none" style={[styles.stamp, styles.saveStamp, saveStyle]}><Icon name="heartFill" size={18} color={p.onColor} /><Copy style={styles.stampText}>{translate("Save", language).toUpperCase()}</Copy></Animated.View>
      <Animated.View pointerEvents="none" style={[styles.stamp, styles.passStamp, passStyle]}><Icon name="close" size={18} color={p.onColor} /><Copy style={styles.stampText}>{translate("Pass", language).toUpperCase()}</Copy></Animated.View>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: p.white }, dimStyle]} />
    </Animated.View>
  </GestureDetector>;
}

export function DiscoverySwiper() {
  const styles = useStyles(stylesSheet);
  const p = usePalette();
  const language = useAppLanguage();
  const { height: windowHeight } = useWindowDimensions();
  const cardHeight = Math.max(305, Math.min(380, Math.round(windowHeight * 0.44)));
  const { trip, preferences, discoverySettings, savedPlaces, externalPlaces, favoriteDiscoveryItem, toggleExternalPlace } = useTravel();
  const [location, setLocation] = useState<Coordinates | null>(null);
  const [locationStatus, setLocationStatus] = useState<"checking" | "ready" | "unavailable">("checking");
  const [seenKeys, setSeenKeys] = useState<string[]>([]);
  const [cycle, setCycle] = useState(0);
  const [command, setCommand] = useState<SwipeCommand | null>(null);
  const [saveError, setSaveError] = useState("");
  const [freeLimitReached, setFreeLimitReached] = useState(false);
  const [liveResult, setLiveResult] = useState<{ key: string; places: NearbyPlace[] } | null>(null);
  // `from` is how many cards had been swiped when venues arrived, so they join after the cards already on screen.
  const [venueResult, setVenueResult] = useState<{ key: string; places: NearbyPlace[]; from: number } | null>(null);
  const seenCount = useRef(0);
  // Places gathered from cities around the world, for a worldwide deck that has run through its nearby picks.
  const [worldPlaces, setWorldPlaces] = useState<{ place: NearbyPlace; location: string }[]>([]);
  const [worldCursor, setWorldCursor] = useState(0);
  const [worldMissCount, setWorldMissCount] = useState(0);
  const worldRequest = useRef<number | null>(null);
  const selectedCity = useMemo(() => cityForGlobalId(discoverySettings.centerId), [discoverySettings.centerId]);
  const manualPin = useMemo(() => destinationPins.find((pin) => pin.id === discoverySettings.centerId) ?? (selectedCity ? { ...selectedCity, name: `${selectedCity.name}, ${countryForCode(selectedCity.countryCode)?.name ?? selectedCity.countryCode}` } : undefined), [discoverySettings.centerId, selectedCity]);
  const tripPin = destinationPins.find((pin) => pin.id === trip?.destinationId);
  const center = manualPin ?? (discoverySettings.centerId ? null : location ?? tripPin ?? null);
  const centerLabel = manualPin ? manualPin.name.split(",")[0] : location ? translate("near you", language) : tripPin ? formatMessage("near {city}", { city: tripPin.name.split(",")[0] }, language) : translate("around the world", language);
  const radiusLabel = center ? discoverySettings.radiusKm === 20000 ? translate("Worldwide", language) : formatMessage("{distance} km radius", { distance: discoverySettings.radiusKm.toLocaleString(language === "ro" ? "ro-RO" : "en-US") }, language) : translate("Explore worldwide", language);
  const centerKey = center ? `${center.latitude.toFixed(3)}|${center.longitude.toFixed(3)}|${Math.min(discoverySettings.radiusKm, 25)}` : "";

  useEffect(() => {
    if (!center || !centerKey) return;
    let active = true;
    loadNearbyPlaces(center, Math.min(discoverySettings.radiusKm, 25))
      .then((places) => { if (active) setLiveResult({ key: centerKey, places }); })
      .catch(() => { if (active) setLiveResult({ key: centerKey, places: [] }); })
    return () => { active = false; };
  }, [center, centerKey, discoverySettings.radiusKm]);

  const venueKey = center && discoverySettings.venues.length ? `${center.latitude.toFixed(3)}|${center.longitude.toFixed(3)}` : "";
  useEffect(() => {
    if (!center || !venueKey) return;
    let active = true;
    loadNearbyVenues(center)
      .then((places) => { if (active) setVenueResult({ key: venueKey, places, from: seenCount.current }); })
      .catch(() => { if (active) setVenueResult({ key: venueKey, places: [], from: 0 }); });
    return () => { active = false; };
  }, [center, venueKey]);

  useEffect(() => {
    if (discoverySettings.centerId) return;
    let current = true;
    Location.requestForegroundPermissionsAsync().then(async (permission) => {
      if (!current) return;
      if (permission.status !== "granted") { setLocationStatus("unavailable"); return; }
      const result = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (current) { setLocation(result.coords); setLocationStatus("ready"); }
    }).catch(() => { if (current) setLocationStatus("unavailable"); });
    return () => { current = false; };
  }, [discoverySettings.centerId]);

  const liveKey = liveResult?.key === centerKey ? liveResult : null;
  const ordered = useMemo(() => {
    const catalogItems = discoveryDeck(center, discoverySettings.radiusKm, preferences.region).filter((item) => item.kind === "place");
    const liveItems: SwipeItem[] = liveKey ? liveKey.places.map((place) => ({ key: `nearby:${place.id}`, kind: "nearby", place, location: place.location ?? manualPin?.name ?? tripPin?.name ?? "Near you" })) : [];
    const venueLive = venueResult?.key === venueKey ? venueResult : null;
    const venueItems: SwipeItem[] = venueLive ? filterVenues(venueLive.places, discoverySettings.venues).map((place) => ({ key: `venue:${place.id}`, kind: "nearby", place, location: manualPin?.name ?? place.location ?? tripPin?.name ?? "Near you" })) : [];
    const savedIds = new Set(savedPlaces);
    const notSaved = (item: SwipeItem) => !isSavedDiscoverySuggestion(
      item.kind === "nearby" ? item.place : { ...item.place!, destinationId: item.destination.id },
      savedIds, externalPlaces, places, destinationPins,
    );
    const rotate = <T,>(items: T[]) => {
      const offset = items.length ? (cycle * 7) % items.length : 0;
      return [...items.slice(offset), ...items.slice(0, offset)];
    };
    const attractions = rotate([...liveItems, ...catalogItems].filter(notSaved));
    const venues = rotate(venueItems.filter(notSaved));
    // Two attractions, then a venue; the first venue waits until after the cards that were already on screen.
    const hold = (venueLive?.from ?? 0) + 2;
    const deck: SwipeItem[] = [];
    let next = 0;
    attractions.forEach((item, index) => {
      deck.push(item);
      if (index + 1 >= hold && (index + 1 - hold) % 2 === 0 && next < venues.length) deck.push(venues[next++]);
    });
    // Worldwide places go last and are never rotated, so cards already queued keep their place as more arrive.
    const worldItems: SwipeItem[] = worldPlaces.map(({ place, location: where }) => ({
      key: `nearby:${place.id}`, kind: "nearby", place, location: where,
      ...(center ? { distanceKm: distanceKm(center, place) } : {}),
    }));
    const keys = new Set<string>();
    return [...deck, ...venues.slice(next), ...worldItems.filter(notSaved)].filter((value) => !keys.has(value.key) && !!keys.add(value.key));
  }, [center, discoverySettings.radiusKm, discoverySettings.venues, preferences.region, liveKey, venueResult, venueKey, manualPin, tripPin, savedPlaces, externalPlaces, cycle, worldPlaces]);
  const nearbyLoading = !!centerKey && liveResult?.key !== centerKey;
  const unseen = useMemo(() => ordered.filter((value) => !seenKeys.includes(value.key)), [ordered, seenKeys]);
  useEffect(() => { seenCount.current = seenKeys.length; }, [seenKeys]);
  const item = unseen[0];
  const worldwide = discoverySettings.radiusKm === 20000 || !center;
  const wantsMoreWorld = worldwide && !nearbyLoading && unseen.length < 6 && worldMissCount < worldMisses && worldCursor < worldCities().length;

  useEffect(() => {
    if (!wantsMoreWorld || worldRequest.current !== null) return;
    const city = worldCities()[worldCursor];
    const where = `${city.name}, ${countryForCode(city.countryCode)?.name ?? city.countryCode}`;
    worldRequest.current = worldCursor;
    loadNearbyPlaces(city, 25)
      .catch(() => [] as NearbyPlace[])
      .then((found) => {
        setWorldPlaces((current) => [...current, ...found.map((place) => ({ place, location: place.location ?? where }))]);
        setWorldMissCount((count) => found.length ? 0 : count + 1);
        setWorldCursor((cursor) => cursor + 1);
        worldRequest.current = null;
      });
  }, [wantsMoreWorld, worldCursor]);
  const upcomingKeys = unseen.slice(0, 3).map((value) => value.key).join("|");

  useEffect(() => {
    // Look up and download the next photos while the current card is on screen.
    for (const value of unseen.slice(0, 3)) void resolveCardPhoto(value);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upcomingKeys]);

  const refresh = () => { setWorldMissCount(0); setCommand(null); setSeenKeys([]); setCycle((value) => value + 1); setSaveError(""); setFreeLimitReached(false); };
  const swiped = (swipedItem: SwipeItem, choice: "skip" | "favorite") => {
    setCommand(null);
    setSeenKeys((keys) => [...keys, swipedItem.key]);
    setSaveError("");
    setFreeLimitReached(false);
    if (choice !== "favorite") return;
    const save = swipedItem.kind === "nearby"
      ? toggleExternalPlace({ ...swipedItem.place, location: swipedItem.location }, false)
      : swipedItem.place ? favoriteDiscoveryItem(swipedItem.place.id) : Promise.resolve();
    void save.catch((error: unknown) => {
      // Put the card back on top so the save can be retried.
      setSeenKeys((keys) => keys.filter((key) => key !== swipedItem.key));
      setSaveError(error instanceof Error ? error.message : "Could not save this place. Try again.");
      setFreeLimitReached(error instanceof SyncFailure && error.isFreeLimit);
    });
  };
  const press = (choice: "skip" | "favorite") => {
    if (item) setCommand((current) => ({ choice, id: (current?.id ?? 0) + 1, key: item.key }));
  };
  return <View style={{ width: "100%", maxWidth: 560, alignSelf: "center", gap: 15 }}>
    <Row style={{ justifyContent: "space-between", alignItems: "center", gap: 12 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Copy style={styles.eyebrow}>YOUR DISCOVERY DECK</Copy>
        <Heading style={styles.sectionTitle}>Discover places</Heading>
        <Copy muted style={{ fontSize: 12 }}>{centerLabel} · {radiusLabel}</Copy>
      </View>
      <IconButton name="settings" label="Discovery settings" onPress={() => router.push("/preferences" as Href)} color={p.blue} />
    </Row>
    {!center && locationStatus === "unavailable" && <Pressable accessibilityRole="button" onPress={() => router.push("/preferences" as Href)}><Copy style={{ color: p.blue, fontSize: 12 }}>Choose a city in settings to search within your radius.</Copy></Pressable>}
    {nearbyLoading || (!center && locationStatus === "checking") ? <Radar title="Finding places near you" detail="Checking your search area…" /> : !item && wantsMoreWorld ? <Radar title="Finding places around the world" detail="Looking in another city…" /> : item ? <View style={{ gap: 15 }}>
      <View style={[styles.deckStage, { height: cardHeight + 20, marginRight: 10 }]}>
        {unseen.slice(0, 3).map((value, depth) => <SwipeCard key={value.key} item={value} depth={depth} height={cardHeight} command={depth === 0 && command?.key === value.key ? command : null} onSwiped={swiped} />).reverse()}
      </View>
      <Row style={{ justifyContent: "center", gap: 24 }}>
        <View style={styles.actionGroup}><IconButton name="close" label="Skip this suggestion" onPress={() => press("skip")} style={styles.actionButton} /><Copy muted style={styles.actionLabel}>Pass</Copy></View>
        <View style={styles.actionGroup}><IconButton name="refresh" label="Refresh suggestions" onPress={refresh} color={p.blue} style={[styles.actionButton, styles.refreshButton]} /><Copy muted style={styles.actionLabel}>Refresh</Copy></View>
        <View style={styles.actionGroup}><IconButton name="heart" label={translateAccessibility(`Add ${item.kind === "nearby" ? item.place.name : item.place?.name} to favorites`, language)} onPress={() => press("favorite")} color={p.pink} style={styles.actionButton} /><Copy muted style={styles.actionLabel}>Save</Copy></View>
      </Row>
      {!!saveError && <View style={{ alignItems: "center", gap: 6 }}>
        <Copy style={{ color: p.danger, fontSize: 12, textAlign: "center" }}>{saveError}</Copy>
        {freeLimitReached && <Pressable accessibilityRole="button" onPress={() => router.push("/membership" as Href)}>
          <Copy style={{ color: p.blue, fontSize: 13, fontWeight: "700" }}>{language === "ro" ? "Vezi planurile" : "See plans"}</Copy>
        </Pressable>}
      </View>}
    </View> : <View style={{ alignItems: "center", gap: 10, paddingVertical: 28 }}><Icon name="compass" color={p.blue} size={36} /><Heading style={{ fontSize: 19, textAlign: "center" }}>{ordered.length ? "You have seen nearby picks" : "No places in this area yet"}</Heading><Copy muted style={{ textAlign: "center", fontSize: 13 }}>{ordered.length ? "Expand your radius for more places, or refresh to revisit suggestions." : "Try a wider radius or a different city for more suggestions."}</Copy><Row style={{ gap: 10 }}><IconButton name="refresh" label="Refresh suggestions" onPress={refresh} color={p.blue} /><IconButton name="settings" label="Change discovery radius" onPress={() => router.push("/preferences" as Href)} color={p.blue} /></Row></View>}
  </View>;
}

export function DiscoveryCommunity() {
  const styles = useStyles(stylesSheet);
  const p = usePalette();
  const language = useAppLanguage();
  const { trip, preferences, discoverySettings } = useTravel();
  const [activity, setActivity] = useState<RecentDiscovery[]>([]);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => { void loadRecentDiscoveries().then(setActivity).catch(() => setActivity([])); }, []);
  const ideas = destinations.filter((destination) =>
    destination.id !== (discoverySettings.centerId ?? trip?.destinationId) &&
    (preferences.region === "Worldwide" || destination.region === preferences.region),
  ).slice(0, 2);
  const visibleActivity = showAll ? activity : activity.slice(0, 3);

  return <View style={styles.inspiration}>
    <Row style={{ justifyContent: "space-between" }}>
      <Heading style={{ fontSize: 19, lineHeight: 25 }}>{activity.length ? "Saved by travelers" : "Worth a closer look"}</Heading>
      {activity.length > 3 && <Pressable accessibilityRole="button" onPress={() => setShowAll((value) => !value)}><Copy style={{ color: p.blue, fontSize: 13, fontWeight: "600" }}>{showAll ? "Show less" : "See all"}</Copy></Pressable>}
    </Row>
    {activity.length ? visibleActivity.map((event, position) => {
      const place = event.kind === "place" ? places.find((value) => value.id === event.item_id) : null;
      const destination = destinations.find((value) => value.id === (place?.destinationId ?? event.item_id));
      if (!destination) return null;
      return <Pressable key={`${event.item_id}-${position}`} accessibilityRole="button" onPress={() => router.push(event.kind === "place" && place ? { pathname: "/explore", params: { id: destination.id, place: place.id } } as Href : { pathname: "/trip", params: { id: destination.id } } as Href)} style={[styles.activityRow, { borderBottomWidth: position === visibleActivity.length - 1 ? 0 : 1 }]}>
        <DestinationPhoto destination={destination} style={styles.activityPhoto} />
        <View style={{ flex: 1, minWidth: 0 }}><Copy style={{ fontSize: 13, fontWeight: "600" }}>{place?.name ?? destination.name}</Copy><Copy muted style={{ fontSize: 11 }}>{destination.name}, {destination.country}</Copy></View>
        <Icon name="heartFill" size={17} color={p.pink} />
      </Pressable>;
    }) : <Row style={{ gap: 10 }}>{ideas.map((destination) =>
      <Pressable key={destination.id} accessibilityRole="button" accessibilityLabel={translateAccessibility(`Explore ${destination.name}`, language)} onPress={() => router.push({ pathname: "/trip", params: { id: destination.id } } as Href)} style={styles.ideaCard}>
        <DestinationPhoto destination={destination} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.7)"]} style={StyleSheet.absoluteFill} />
        <View style={styles.ideaContent}><Copy style={{ color: p.onColor, fontWeight: "700" }}>{destination.name}</Copy><Copy style={{ color: p.onColor, fontSize: 11 }}>{destination.country}</Copy></View>
      </Pressable>
    )}</Row>}
  </View>;
}

const stylesSheet = themedStyles((p) => ({
  eyebrow: { color: p.blue, fontSize: 10, fontWeight: "800", lineHeight: 14 },
  sectionTitle: { fontSize: 29, lineHeight: 34 },
  deckStage: { position: "relative" },
  card: { position: "absolute", top: 0, left: 0, right: 0, borderRadius: 8, overflow: "hidden", backgroundColor: p.blueSoft },
  cardContent: { flex: 1, justifyContent: "space-between", padding: 19 },
  typeBadge: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 5, backgroundColor: "rgba(0,0,0,0.42)", borderRadius: 4, paddingHorizontal: 9, paddingVertical: 6 },
  typeText: { color: p.onColor, fontSize: 10, fontWeight: "700" },
  cardTitle: { color: p.onColor, fontSize: 30, lineHeight: 35 },
  cardMeta: { color: p.onColor, fontSize: 13, fontWeight: "600" },
  cardDetail: { color: p.onColor, fontSize: 12, lineHeight: 18, opacity: 0.95 },
  stamp: { position: "absolute", top: 18, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 2, borderColor: p.white },
  saveStamp: { left: 18, backgroundColor: p.pink, transform: [{ rotate: "-10deg" }] },
  passStamp: { right: 18, backgroundColor: p.night, transform: [{ rotate: "10deg" }] },
  stampText: { color: p.onColor, fontSize: 13, fontWeight: "800" },
  actionButton: { width: 54, height: 54, borderRadius: 27, backgroundColor: p.white, borderWidth: 1, borderColor: p.line, alignItems: "center", justifyContent: "center" },
  refreshButton: { width: 48, height: 48, borderRadius: 24 },
  actionGroup: { width: 68, alignItems: "center", gap: 5 },
  actionLabel: { fontSize: 11, lineHeight: 15 },
  radarWrap: { height: 300, alignItems: "center", justifyContent: "center", gap: 9, paddingHorizontal: 22 },
  radar: { height: 176, width: 176, alignItems: "center", justifyContent: "center", marginBottom: 5 },
  inspiration: { borderTopWidth: 1, borderColor: p.line, paddingTop: 20, gap: 12 },
  activityRow: { flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 8, borderColor: p.line },
  activityPhoto: { width: 48, height: 48, borderRadius: 5 },
  ideaCard: { flex: 1, minWidth: 0, height: 146, borderRadius: 6, overflow: "hidden", backgroundColor: p.greenSoft },
  ideaContent: { flex: 1, justifyContent: "flex-end", padding: 11 },
}));
