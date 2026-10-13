import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import * as Location from "expo-location";
import { router, type Href } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Animated, Linking, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Copy, DestinationPhoto, Heading, Icon, IconButton, Row } from "@/components/goworth/ui";
import { palette as p } from "@/constants/design";
import { discoveryDeck, type Coordinates, type DiscoveryItem } from "@/data/discovery";
import { destinations, places } from "@/data/travel";
import { destinationPins } from "@/data/map";
import { findPlacePhoto, type PlacePhoto } from "@/data/place-photo";
import { loadRecentDiscoveries, type RecentDiscovery } from "@/lib/travel-repository";
import { useTravel } from "@/state/travel-context";

const BATCH_SIZE = 6;

function Radar({ title, detail }: { title: string; detail: string }) {
  const [pulse] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const animation = Animated.loop(Animated.timing(pulse, {
      toValue: 1, duration: 1700, useNativeDriver: Platform.OS !== "web",
    }));
    animation.start();
    return () => animation.stop();
  }, [pulse]);
  return <View style={styles.radarWrap}>
    <View style={styles.radar}>
      {[70, 114, 158].map((size) => <View key={size} style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 1, borderColor: "#B5DBD3", position: "absolute" }} />)}
      <Animated.View style={{ width: 152, height: 152, borderRadius: 76, borderWidth: 2, borderColor: p.green, position: "absolute", opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1.2] }) }] }} />
      <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: p.green, alignItems: "center", justifyContent: "center" }}><Icon name="compass" color={p.white} size={25} /></View>
    </View>
    <Heading style={{ fontSize: 19, textAlign: "center" }}>{title}</Heading>
    <Copy muted style={{ textAlign: "center", fontSize: 13, lineHeight: 19 }}>{detail}</Copy>
  </View>;
}

function SwipeCard({ item, nextItem, onChoice, onRefresh }: {
  item: DiscoveryItem;
  nextItem?: DiscoveryItem;
  onChoice: (choice: "skip" | "favorite") => void;
  onRefresh: () => void;
}) {
  const { height: windowHeight } = useWindowDimensions();
  const cardHeight = Math.max(305, Math.min(380, Math.round(windowHeight * 0.44)));
  const [position] = useState(() => new Animated.ValueXY());
  const [moving, setMoving] = useState(false);
  const [placePhoto, setPlacePhoto] = useState<PlacePhoto | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const placeName = item.place?.name;
  const photoLocation = `${item.destination.name}, ${item.destination.country}`;
  useEffect(() => {
    if (!placeName) return;
    let active = true;
    findPlacePhoto(placeName, photoLocation).then((photo) => {
      if (active) setPlacePhoto(photo);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [placeName, photoLocation]);
  const swipe = (choice: "skip" | "favorite") => {
    if (moving) return;
    setMoving(true);
    Animated.timing(position, { toValue: { x: choice === "favorite" ? 480 : -480, y: 20 }, duration: 220, useNativeDriver: false }).start(() => onChoice(choice));
  };
  const open = () => router.push(item.kind === "destination"
    ? { pathname: "/trip", params: { id: item.destination.id } } as Href
    : { pathname: "/explore", params: { id: item.destination.id, place: item.place!.id } } as Href);
  const gesture = Gesture.Pan()
      .activeOffsetX([-10, 10])
      .failOffsetY([-18, 18])
      .runOnJS(true)
      .onUpdate(({ translationX, translationY }) => position.setValue({ x: translationX, y: translationY * 0.15 }))
      .onEnd(({ translationX }) => {
        if (translationX > 85) swipe("favorite");
        else if (translationX < -85) swipe("skip");
        else Animated.spring(position, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
      });
  const rotation = position.x.interpolate({ inputRange: [-250, 0, 250], outputRange: ["-12deg", "0deg", "12deg"] });
  return <View style={{ gap: 15 }}>
    <View style={[styles.deckStage, { height: cardHeight + 10 }, nextItem && { marginRight: 10 }]}>
      {nextItem && <View pointerEvents="none" style={[styles.card, styles.peekCard, { height: cardHeight }]}>
        <DestinationPhoto destination={nextItem.destination} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={["rgba(0,0,0,0.2)", "rgba(0,0,0,0.55)"]} style={StyleSheet.absoluteFill} />
      </View>}
      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.card, { height: cardHeight, transform: [...position.getTranslateTransform(), { rotate: rotation }] }]}>
          <DestinationPhoto destination={item.destination} style={StyleSheet.absoluteFill} />
          {placePhoto && !imageFailed && <Image source={{ uri: placePhoto.url }} contentFit="cover" transition={250} accessibilityLabel={`Photo of ${placeName}`} onError={() => setImageFailed(true)} style={StyleSheet.absoluteFill} />}
          <LinearGradient colors={["rgba(0,0,0,0.14)", "rgba(0,0,0,0.06)", "rgba(0,0,0,0.82)"]} style={StyleSheet.absoluteFill} />
          <View style={styles.cardContent}>
            <View style={{ alignSelf: "flex-start", gap: 7 }}>
              <View style={styles.typeBadge}><Icon name={item.kind === "place" ? "pin" : "city"} size={15} color={p.white} /><Copy style={styles.typeText}>{item.kind === "place" ? "PLACE" : "CITY"}</Copy></View>
              {placePhoto && !imageFailed && <Pressable accessibilityRole="link" accessibilityLabel={`Photo source and license for ${placeName}`} onPress={() => void Linking.openURL(placePhoto.pageUrl)} style={styles.photoCredit}>
                <Text numberOfLines={2} style={styles.photoCreditText}>Photo: {placePhoto.artist} · {placePhoto.license}</Text>
              </Pressable>}
            </View>
            <IconButton name="right" label={`Explore ${item.place?.name ?? item.destination.name}`} onPress={open} filled style={{ position: "absolute", right: 12, top: 12, width: 38, height: 38, minWidth: 38, minHeight: 38 }} />
            <View style={{ gap: 7 }}>
              <Heading style={styles.cardTitle}>{item.place?.name ?? item.destination.name}</Heading>
              <Copy style={styles.cardMeta}>{item.place ? `${item.destination.name}, ${item.destination.country}` : item.destination.country}{item.distanceKm !== undefined ? `  ·  ~${Math.round(item.distanceKm)} km away` : ""}</Copy>
              <Copy style={styles.cardDetail}>{item.place?.detail ?? item.destination.description}</Copy>
            </View>
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
    <Row style={{ justifyContent: "center", gap: 24 }}>
      <View style={styles.actionGroup}><IconButton name="close" label="Skip this suggestion" onPress={() => swipe("skip")} style={styles.actionButton} /><Copy muted style={styles.actionLabel}>Pass</Copy></View>
      <View style={styles.actionGroup}><IconButton name="refresh" label="Refresh suggestions" onPress={onRefresh} color={p.blue} style={[styles.actionButton, styles.refreshButton]} /><Copy muted style={styles.actionLabel}>Refresh</Copy></View>
      <View style={styles.actionGroup}><IconButton name="heart" label={`Add ${item.place?.name ?? item.destination.name} to favorites`} onPress={() => swipe("favorite")} color={p.pink} style={styles.actionButton} /><Copy muted style={styles.actionLabel}>Save</Copy></View>
    </Row>
  </View>;
}

export function DiscoverySwiper() {
  const { trip, preferences, discoverySettings, saved, savedPlaces, favoriteDiscoveryItem } = useTravel();
  const [location, setLocation] = useState<Coordinates | null>(null);
  const [locationStatus, setLocationStatus] = useState<"checking" | "ready" | "unavailable">("checking");
  const [seenKeys, setSeenKeys] = useState<string[]>([]);
  const [cycle, setCycle] = useState(0);
  const [loading, setLoading] = useState(false);
  const manualPin = destinationPins.find((pin) => pin.id === discoverySettings.centerId);
  const tripPin = destinationPins.find((pin) => pin.id === trip?.destinationId);
  const center = manualPin ?? (discoverySettings.centerId ? null : location ?? tripPin ?? null);
  const centerLabel = manualPin ? manualPin.name.split(",")[0] : location ? "near you" : tripPin ? `near ${tripPin.name.split(",")[0]}` : "around the world";
  const radiusLabel = center ? discoverySettings.radiusKm === 20000 ? "Worldwide" : `${discoverySettings.radiusKm.toLocaleString("en-US")} km radius` : "Explore worldwide";

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

  const allItems = useMemo(() => discoveryDeck(center, discoverySettings.radiusKm, preferences.region), [center, discoverySettings.radiusKm, preferences.region]);
  const candidates = useMemo(() => allItems.filter((item) => item.kind === "destination" ? !saved.includes(item.destination.id) : !savedPlaces.includes(item.place!.id)), [allItems, saved, savedPlaces]);
  const ordered = useMemo(() => {
    if (!candidates.length) return candidates;
    const offset = (cycle * 7) % candidates.length;
    return [...candidates.slice(offset), ...candidates.slice(0, offset)];
  }, [candidates, cycle]);

  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setLoading(false), 1400);
    return () => clearTimeout(timer);
  }, [loading, seenKeys.length, cycle]);
  const refresh = () => { setLoading(true); setSeenKeys([]); setCycle((value) => value + 1); };
  const choose = (item: DiscoveryItem, choice: "skip" | "favorite") => {
    if (choice === "favorite") favoriteDiscoveryItem(item.kind, item.place?.id ?? item.destination.id);
    const next = [...seenKeys, item.key];
    setSeenKeys(next);
    if (next.length % BATCH_SIZE === 0 || !ordered.some((value) => !next.includes(value.key))) setLoading(true);
  };
  const unseen = ordered.filter((value) => !seenKeys.includes(value.key));
  const item = unseen[0];
  const nextItem = unseen[1];
  const exhausted = !item && !loading;
  return <View style={{ gap: 15 }}>
    <Row style={{ justifyContent: "space-between", alignItems: "center", gap: 12 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Copy style={styles.eyebrow}>YOUR DISCOVERY DECK</Copy>
        <Heading style={styles.sectionTitle}>Where to next?</Heading>
        <Copy muted style={{ fontSize: 12 }}>{centerLabel} · {radiusLabel}</Copy>
      </View>
      <IconButton name="settings" label="Discovery settings" onPress={() => router.push("/preferences" as Href)} color={p.blue} />
    </Row>
    {!center && locationStatus === "unavailable" && <Pressable accessibilityRole="button" onPress={() => router.push("/preferences" as Href)}><Copy style={{ color: p.blue, fontSize: 12 }}>Choose a city in settings to search within your radius.</Copy></Pressable>}
    {loading || (!center && locationStatus === "checking") ? <Radar title={loading ? "Looking for more places" : "Finding places near you"} detail={loading ? "Fresh suggestions are loading for you…" : "Checking your search area…"} /> : item ? <SwipeCard key={item.key} item={item} nextItem={nextItem} onChoice={(choice) => choose(item, choice)} onRefresh={refresh} /> : exhausted ? <View style={{ alignItems: "center", gap: 10, paddingVertical: 28 }}><Icon name="compass" color={p.green} size={36} /><Heading style={{ fontSize: 19, textAlign: "center" }}>{allItems.length ? "You have seen nearby picks" : "No places in this area yet"}</Heading><Copy muted style={{ textAlign: "center", fontSize: 13 }}>{allItems.length ? "Expand your radius for more places, or refresh to revisit suggestions." : "Try a wider radius or a different city for more suggestions."}</Copy><Row style={{ gap: 10 }}><IconButton name="refresh" label="Refresh suggestions" onPress={refresh} color={p.blue} /><IconButton name="settings" label="Change discovery radius" onPress={() => router.push("/preferences" as Href)} color={p.blue} /></Row></View> : null}
  </View>;
}

export function DiscoveryCommunity() {
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
      <Pressable key={destination.id} accessibilityRole="button" accessibilityLabel={`Explore ${destination.name}`} onPress={() => router.push({ pathname: "/trip", params: { id: destination.id } } as Href)} style={styles.ideaCard}>
        <DestinationPhoto destination={destination} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.7)"]} style={StyleSheet.absoluteFill} />
        <View style={styles.ideaContent}><Copy style={{ color: p.white, fontWeight: "700" }}>{destination.name}</Copy><Copy style={{ color: p.white, fontSize: 11 }}>{destination.country}</Copy></View>
      </Pressable>
    )}</Row>}
  </View>;
}

const styles = StyleSheet.create({
  eyebrow: { color: p.green, fontSize: 10, fontWeight: "800", lineHeight: 14 },
  sectionTitle: { fontSize: 29, lineHeight: 34 },
  deckStage: { position: "relative" },
  card: { position: "absolute", top: 0, left: 0, right: 0, borderRadius: 8, overflow: "hidden", backgroundColor: p.greenSoft },
  peekCard: { top: 10, left: 10, right: -10 },
  cardContent: { flex: 1, justifyContent: "space-between", padding: 19 },
  typeBadge: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 5, backgroundColor: "rgba(0,0,0,0.42)", borderRadius: 4, paddingHorizontal: 9, paddingVertical: 6 },
  typeText: { color: p.white, fontSize: 10, fontWeight: "700" },
  photoCredit: { alignSelf: "flex-start", maxWidth: 230, backgroundColor: "rgba(0,0,0,0.42)", borderRadius: 3, paddingHorizontal: 7, paddingVertical: 4 },
  photoCreditText: { color: p.white, fontSize: 10, lineHeight: 13 },
  cardTitle: { color: p.white, fontSize: 30, lineHeight: 35 },
  cardMeta: { color: p.white, fontSize: 13, fontWeight: "600" },
  cardDetail: { color: p.white, fontSize: 12, lineHeight: 18, opacity: 0.95 },
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
});
