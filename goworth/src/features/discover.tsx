import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useState } from "react";
import { Pressable, Share, StyleSheet, TextInput, View } from "react-native";
import {
  Brand, Button, Chip, Copy, DestinationCard, DestinationPhoto, EmptyState,
  Header, Heading, Icon, IconButton, Row, Screen, SectionTitle, Sheet, s,
  type IconName,
} from "@/components/goworth/ui";
import { palette as p } from "@/constants/design";
import {
  destinations, findDestination, placesForDestination, tripDays,
  type Place, type PlaceCategory,
} from "@/data/travel";
import { useTravel } from "@/state/travel-context";

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
  return (
    <Row style={{ gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderColor: p.line }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`View ${place.name}`}
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
  const { trip, preferences } = useTravel();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const filtered = destinations.filter((destination) =>
    `${destination.name} ${destination.country}`.toLowerCase().includes(query.trim().toLowerCase()) &&
    (!category || destination.tags.some((tag) => tag === category)),
  );
  const recommendations = destinations.filter((destination) =>
    preferences.region === "Worldwide" || destination.region === preferences.region,
  ).slice(0, 4);
  const featured = recommendations[0] || destinations[0];

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
      <Row style={styles.search}>
        <Icon name="search" color={p.muted} size={19} />
        <TextInput
          accessibilityLabel="Search destinations"
          placeholder="Where do you want to go?"
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
      {!query && !category && (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Explore ${featured.name}`}
            onPress={() => router.push({ pathname: "/trip", params: { id: featured.id } } as Href)}
            style={{ height: 215, borderRadius: 6, overflow: "hidden" }}
          >
            <DestinationPhoto destination={featured} style={StyleSheet.absoluteFill} />
            <LinearGradient colors={["rgba(0,0,0,.4)", "transparent", "rgba(0,0,0,.45)"]} style={StyleSheet.absoluteFill} />
            <View style={{ flex: 1, padding: 20, justifyContent: "space-between" }}>
              <View>
                <Heading style={{ color: p.white, fontSize: 29 }}>{featured.name}</Heading>
                <Copy style={{ color: p.white }}>{featured.country}</Copy>
              </View>
              <Copy style={{ color: p.white, fontWeight: "600" }}>Explore destination</Copy>
            </View>
          </Pressable>
          <SectionTitle title={preferences.region === "Worldwide" ? "Popular destinations" : `Explore ${preferences.region}`} />
          <View style={s.grid}>
            {recommendations.map((destination) => <DestinationCard key={destination.id} destination={destination} />)}
          </View>
          <SectionTitle title="All destinations" action="Browse places" onPress={() => router.push("/explore" as Href)} />
          <View style={s.grid}>
            {destinations.filter((destination) => !recommendations.includes(destination)).map((destination) => (
              <DestinationCard key={destination.id} destination={destination} />
            ))}
          </View>
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
  const { id } = useLocalSearchParams<{ id?: string }>();
  const destination = destinations.find((item) => item.id === id);
  const { saved, savedPlaces, toggleSaved, togglePlace } = useTravel();
  const [tab, setTab] = useState("Overview");
  const [notice, setNotice] = useState("");
  if (!destination) {
    return <Screen><Header title="Destination" /><EmptyState title="Destination not found" detail="This destination is no longer in the catalog." action="Explore destinations" onPress={() => router.replace("/home" as Href)} /></Screen>;
  }
  const isSaved = saved.includes(destination.id);
  const nearby = placesForDestination(destination.id);
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
        <Row style={{ borderBottomWidth: 1, borderColor: p.line, justifyContent: "space-between" }}>
          {["Overview", "Places", "Tips"].map((item) => (
            <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: tab === item }} onPress={() => setTab(item)} style={{ paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: tab === item ? p.blue : "transparent" }}>
              <Copy style={{ color: tab === item ? p.blue : p.muted }}>{item}</Copy>
            </Pressable>
          ))}
        </Row>
        {tab === "Overview" && <>
          <Copy style={{ lineHeight: 23 }}>{destination.description}</Copy>
          <Copy muted>{destination.tags.join(" · ")}</Copy>
          <Button secondary icon="map" onPress={openMap}>View on map</Button>
          <Button secondary icon="share" onPress={async () => {
            try { await Share.share({ message: `Explore ${destination.name}, ${destination.country} with GoWorth.` }); }
            catch { setNotice("Sharing is unavailable on this device."); }
          }}>Share destination</Button>
        </>}
        {tab === "Places" && <>
          <Heading style={{ fontSize: 20 }}>{nearby.length} places to explore</Heading>
          {nearby.slice(0, 4).map((place) => <PlaceRow key={place.id} place={place} saved={savedPlaces.includes(place.id)} onSave={() => togglePlace(place.id)} onPress={() => router.push({ pathname: "/explore", params: { id: destination.id, place: place.id } } as Href)} />)}
          <Button secondary onPress={() => router.push({ pathname: "/explore", params: { id: destination.id } } as Href)}>View all places</Button>
        </>}
        {tab === "Tips" && <Copy muted>Check opening hours, local access rules, transport schedules, and prices with each venue before visiting.</Copy>}
        {!!notice && <Copy style={{ color: p.danger }}>{notice}</Copy>}
      </View>
    </Screen>
  );
}

export function ExploreScreen() {
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
  const destination = findDestination(chosenDestinationId || id || trip?.destinationId);
  const localPlaces = placesForDestination(destination.id);
  const filters = ["All", ...new Set(localPlaces.map((place) => place.category))];
  const filtered = localPlaces.filter((place) =>
    (filter === "All" || place.category === filter) &&
    `${place.name} ${place.detail} ${place.category}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const canAdd = !!trip && trip.destinationId === destination.id;
  const openMap = (place: Place) => {
    setSelected(null);
    router.push({ pathname: "/map", params: { destination: destination.id, place: place.id } } as Href);
  };
  return (
    <Screen active="home" style={{ gap: 17 }}>
      <Header title="Explore places" subtitle={`${destination.name}, ${destination.country}`} />
      <Button secondary icon="pin" onPress={() => setChoosingDestination(true)}>{destination.name} · Change destination</Button>
      <Row style={styles.search}>
        <Icon name="search" color={p.muted} size={18} />
        <TextInput accessibilityLabel="Search places" placeholder={`Search places in ${destination.name}`} value={query} onChangeText={setQuery} placeholderTextColor={p.muted} style={{ flex: 1, height: 44, fontSize: 14, color: p.ink }} />
      </Row>
      <View style={[s.grid, { gap: 7 }]}>
        {filters.map((item) => <Chip key={item} selected={filter === item} onPress={() => setFilter(item)}>{item}</Chip>)}
      </View>
      <View>
        {filtered.map((place) => <PlaceRow key={place.id} place={place} saved={savedPlaces.includes(place.id)} onSave={() => togglePlace(place.id)} onPress={() => { setSelected(place); setSelectedDay(1); setAddedDays([]); setNotice(""); }} />)}
      </View>
      {!filtered.length && <EmptyState title="No places found" detail="Try another name or category." action="Reset search" onPress={() => { setQuery(""); setFilter("All"); }} />}
      <Sheet visible={choosingDestination} title="Choose a destination" onClose={() => setChoosingDestination(false)}>
        {destinations.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Explore places in ${item.name}`} onPress={() => { setChosenDestinationId(item.id); setFilter("All"); setQuery(""); setChoosingDestination(false); }} style={[s.row, { paddingVertical: 8 }]}>
          <DestinationPhoto destination={item} style={{ width: 56, height: 48, borderRadius: 6 }} />
          <View style={{ flex: 1 }}><Copy style={{ fontWeight: "600" }}>{item.name}</Copy><Copy muted style={{ fontSize: 12 }}>{item.country}</Copy></View>
          {item.id === destination.id && <Icon name="check" color={p.blue} />}
        </Pressable>)}
      </Sheet>
      <Sheet visible={!!selected} title={selected?.name || ""} onClose={() => setSelected(null)}>
        {selected && <>
          <Copy muted>{selected.category} · {selected.detail}</Copy>
          <Button secondary icon="map" onPress={() => openMap(selected)}>View on map</Button>
          <Button secondary icon={savedPlaces.includes(selected.id) ? "heartFill" : "heart"} onPress={() => togglePlace(selected.id)}>{savedPlaces.includes(selected.id) ? "Saved" : "Save place"}</Button>
          {canAdd ? <>
            <Copy style={s.label}>Add to day</Copy>
            <View style={s.grid}>{Array.from({ length: tripDays(trip.start, trip.end) }, (_, index) => <Chip key={index} selected={selectedDay === index + 1} onPress={() => setSelectedDay(index + 1)}>Day {index + 1}</Chip>)}</View>
            <Button disabled={addedDays.includes(selectedDay)} busy={adding} icon={addedDays.includes(selectedDay) ? "check" : "plus"} onPress={async () => {
              setAdding(true);
              setNotice("");
              try {
                await addActivity({ day: selectedDay, period: "Afternoon", time: "13:00", name: selected.name, note: selected.detail });
                setAddedDays((days) => [...days, selectedDay]);
              } catch (caught) {
                setNotice(caught instanceof Error ? caught.message : "Could not add this place.");
              } finally {
                setAdding(false);
              }
            }}>{addedDays.includes(selectedDay) ? `Added to Day ${selectedDay}` : "Add to itinerary"}</Button>
            {addedDays.length > 0 && <Button secondary onPress={() => { setSelected(null); router.push("/itinerary" as Href); }}>View itinerary</Button>}
          </> : <Button onPress={() => { setSelected(null); router.push({ pathname: "/planner", params: { destination: destination.id } } as Href); }}>Plan a trip here</Button>}
          {!!notice && <Copy style={{ color: p.danger }}>{notice}</Copy>}
        </>}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: { borderWidth: 1, borderColor: p.line, borderRadius: 6, paddingLeft: 14, paddingRight: 8, backgroundColor: p.white, gap: 8 },
});
