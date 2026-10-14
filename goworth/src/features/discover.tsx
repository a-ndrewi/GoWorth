import { router, useLocalSearchParams, type Href } from "expo-router";
import { useState } from "react";
import { Linking, Pressable, Share, StyleSheet, TextInput, View } from "react-native";
import {
  Brand, Button, Chip, Copy, DestinationCard, DestinationPhoto, EmptyState,
  Header, Heading, Icon, IconButton, Row, Screen, SectionTitle, Sheet, s,
  type IconName,
} from "@/components/goworth/ui";
import { PlacePreviewPhoto } from "@/components/goworth/place-preview";
import { DiscoveryCommunity, DiscoverySwiper } from "@/components/goworth/discovery-swiper";
import { palette as p } from "@/constants/design";
import { tipsForDestination, type DestinationTip } from "@/data/tips";
import {
  destinations, findDestination, placesForDestination, tripDays,
  type Place, type PlaceCategory,
} from "@/data/travel";
import { useTravel } from "@/state/travel-context";
import { normalizeSearchText } from "@/utils/search";
import { searchCatalogPlace } from "@/data/map";
import { destinationForDay } from "@/utils/trip";
import { uniqueRouteStops } from "@/data/trip-route";
import { formatMessage, translate, translateAccessibility } from "@/data/i18n";
import { useAppLanguage } from "@/data/formatting";

const categories = ["City", "Beach", "Nature", "Culture", "Mountains", "Food"];
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
  const { trip, preferences } = useTravel();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [visibleCount, setVisibleCount] = useState(10);
  const filtered = destinations.filter((destination) =>
    normalizeSearchText(`${destination.name} ${destination.country}`).includes(normalizeSearchText(query.trim())) &&
    (!category || destination.tags.some((tag) => tag === category)),
  );
  const recommendations = destinations.filter((destination) =>
    preferences.region === "Worldwide" || destination.region === preferences.region,
  ).slice(0, 4);
  const moreDestinations = destinations.filter((destination) => !recommendations.includes(destination));

  return (
    <Screen active="home" style={{ gap: 18 }}>
      <Row style={{ justifyContent: "space-between" }}>
        <Brand />
        <IconButton
          name={trip ? "bag" : "plus"}
          label={trip ? "My itinerary" : "Plan a trip"}
          onPress={() => router.push((trip ? "/itinerary" : "/planner") as Href)}
        />
      </Row>
      <Heading style={{ fontSize: 24, lineHeight: 30 }}>Explore destinations</Heading>
      <View style={styles.homeBrowse}>
        <Row style={styles.search}>
          <Icon name="search" color={p.muted} size={19} />
          <TextInput
            accessibilityLabel={translate("Search destinations", language)}
            placeholder={translate("Where do you want to go?", language)}
            placeholderTextColor={p.muted}
            value={query}
            onChangeText={setQuery}
            style={{ flex: 1, minWidth: 0, fontSize: 14, color: p.ink, height: 44 }}
          />
        </Row>
        {!!query.trim() && <Button secondary icon="map" onPress={() => router.push({ pathname: "/map", params: { q: query.trim() } } as Href)}>Search the world map</Button>}
        <View style={[s.grid, { gap: 7 }]}>
          {categories.map((item) => (
            <Chip
              key={item}
              selected={category === item}
              onPress={() => setCategory(category === item ? "" : item)}
            >
              {item}
            </Chip>
          ))}
        </View>
      </View>
      {!query && !category && <DiscoverySwiper />}
      {!query && !category && (
        <>
          <DiscoveryCommunity />
          <SectionTitle title={preferences.region === "Worldwide" ? "Popular destinations" : formatMessage("Explore {region}", { region: translate(preferences.region, language) }, language)} />
          <View style={s.grid}>
            {recommendations.map((destination) => <DestinationCard key={destination.id} destination={destination} />)}
          </View>
          <SectionTitle title="More destinations" action="View map" onPress={() => router.push("/map" as Href)} />
          <View style={s.grid}>
            {moreDestinations.slice(0, visibleCount).map((destination) => (
              <DestinationCard key={destination.id} destination={destination} />
            ))}
          </View>
          {visibleCount < moreDestinations.length && <Button secondary icon="plus" onPress={() => setVisibleCount((count) => count + 10)}>Show more destinations</Button>}
        </>
      )}
      {(!!query || !!category) && (
        <>
          <SectionTitle title="Destinations" action="Clear" onPress={() => { setQuery(""); setCategory(""); }} />
          <View style={s.grid}>
            {filtered.map((destination) => <DestinationCard key={destination.id} destination={destination} />)}
          </View>
          {!filtered.length && <EmptyState title="No destinations found" detail="Try another search or category." action="Clear filters" onPress={() => { setQuery(""); setCategory(""); }} />}
        </>
      )}
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
  const [chosenDestinationId, setChosenDestinationId] = useState<string | null>(null);
  const [choosingDestination, setChoosingDestination] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [selected, setSelected] = useState<Place | null>(() =>
    placesForDestination(id || trip?.destinationId || destinations[0].id)
      .find((item) => item.id === placeId) || null,
  );
  const [selectedDay, setSelectedDay] = useState(1);
  const [addedDays, setAddedDays] = useState<number[]>([]);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState("");
  const requestedId = chosenDestinationId || id || trip?.destinationId;
  const routeCities = trip ? uniqueRouteStops(trip) : [];
  const dynamicCity = routeCities.find((city) => city.id === requestedId && !destinations.some((destination) => destination.id === city.id));
  const destination = findDestination(requestedId);
  const localPlaces = placesForDestination(destination.id);
  const filters = ["All", ...new Set(localPlaces.map((place) => place.category))];
  const filtered = localPlaces.filter((place) =>
    (filter === "All" || place.category === filter) &&
    normalizeSearchText(`${place.name} ${place.detail} ${place.category}`).includes(normalizeSearchText(query.trim())),
  );
  const matchingDays = trip ? Array.from({ length: tripDays(trip.start, trip.end) }, (_, index) => index + 1)
    .filter((day) => destinationForDay(trip, day) === destination.id) : [];
  const canAdd = matchingDays.length > 0;
  const openMap = (place: Place) => {
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
  return (
    <Screen active="home" style={{ gap: 17 }}>
      <Header title="Explore places" subtitle={`${destination.name}, ${destination.country}`} />
      <Button secondary icon="pin" onPress={() => setChoosingDestination(true)}>{destination.name} · Change destination</Button>
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
      <Sheet visible={choosingDestination} title="Choose a destination" onClose={() => setChoosingDestination(false)}>
        {destinations.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={translateAccessibility(`Explore places in ${item.name}`, language)} onPress={() => { setChosenDestinationId(item.id); setFilter("All"); setQuery(""); setChoosingDestination(false); }} style={[s.row, { paddingVertical: 8 }]}>
          <DestinationPhoto destination={item} style={{ width: 56, height: 48, borderRadius: 6 }} />
          <View style={{ flex: 1 }}><Copy style={{ fontWeight: "600" }}>{item.name}</Copy><Copy muted style={{ fontSize: 12 }}>{item.country}</Copy></View>
          {item.id === destination.id && <Icon name="check" color={p.blue} />}
        </Pressable>)}
      </Sheet>
      <Sheet visible={!!selected} title={selected?.name || ""} onClose={() => setSelected(null)}>
        {selected && <>
          <PlacePreviewPhoto name={selected.name} location={`${destination.name}, ${destination.country}`} />
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
  homeBrowse: { gap: 12 },
  search: { borderWidth: 1, borderColor: p.line, borderRadius: 6, paddingLeft: 14, paddingRight: 8, backgroundColor: p.white, gap: 8 },
  tipCard: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 12, borderWidth: 1, borderColor: p.line, borderRadius: 7, backgroundColor: p.white },
  tipCardChecked: { borderColor: p.green, backgroundColor: "#F2FBF7" },
  tipIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
});
