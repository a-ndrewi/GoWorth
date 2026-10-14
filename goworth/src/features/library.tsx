import { router, useLocalSearchParams, type Href } from "expo-router";
import Constants from "expo-constants";
import { useState } from "react";
import { Pressable, View } from "react-native";
import {
  Button, Chip, Copy, DestinationCard, EmptyState, Field, Header, Heading,
  Icon, IconButton, Row, Screen, Sheet, s,
} from "@/components/goworth/ui";
import { palette as p } from "@/constants/design";
import { dateLabel, destinations, findDestination, places } from "@/data/travel";
import { useTravel } from "@/state/travel-context";
import { useAuth } from "@/state/auth-context";

export function SavedScreen() {
  const { tab: initialTab } = useLocalSearchParams<{ tab?: string }>();
  const { saved, savedPlaces, togglePlace, externalPlaces, toggleExternalPlace, trip } = useTravel();
  const [tab, setTab] = useState(initialTab === "Places" ? "Places" : "Destinations");
  const savedDestinations = destinations.filter((destination) => saved.includes(destination.id));
  const savedPlaceRecords = places.filter((place) => savedPlaces.includes(place.id));
  const unavailablePlaces = Math.max(0, savedPlaces.length - savedPlaceRecords.length - externalPlaces.length);
  const openMap = (place: (typeof places)[number]) =>
    router.push({ pathname: "/map", params: { destination: place.destinationId, place: place.id } } as Href);
  return (
    <Screen active="saved" style={{ gap: 18 }}>
      <Header title="Saved" back={false} right={<IconButton name="plus" label="Plan a trip" color={p.blue} onPress={() => router.push("/planner" as Href)} />} />
      <Row style={{ gap: 6 }}>
        {["Destinations", "Places", "Current trip"].map((item) => <Chip key={item} selected={tab === item} onPress={() => setTab(item)} style={{ flex: 1, paddingHorizontal: 4 }}>{item}</Chip>)}
      </Row>
      {tab === "Destinations" && <>
        <View style={s.grid}>{savedDestinations.map((destination) => <DestinationCard key={destination.id} destination={destination} />)}</View>
        {!savedDestinations.length && <EmptyState title="No destinations saved" detail="Keep interesting destinations here while you plan." action="Explore destinations" onPress={() => router.navigate("/home" as Href)} />}
      </>}
      {tab === "Places" && <>
        {savedPlaceRecords.map((place) => <Row key={place.id} style={{ paddingVertical: 10, gap: 12, borderBottomWidth: 1, borderColor: p.line }}>
          <View style={{ width: 46, height: 46, borderRadius: 6, backgroundColor: p.greenSoft, justifyContent: "center", alignItems: "center" }}><Icon name="pin" color={p.green} /></View>
          <Pressable accessibilityRole="button" accessibilityLabel={`View ${place.name}`} onPress={() => router.push({ pathname: "/explore", params: { id: place.destinationId, place: place.id } } as Href)} style={{ flex: 1 }}>
            <Copy style={{ fontWeight: "600" }}>{place.name}</Copy>
            <Copy muted style={{ fontSize: 12 }}>{findDestination(place.destinationId).name} · {place.category}</Copy>
          </Pressable>
          <IconButton name="map" label={`Map for ${place.name}`} onPress={() => openMap(place)} />
          <IconButton name="heartFill" label={`Unsave ${place.name}`} color={p.pink} onPress={() => togglePlace(place.id)} />
        </Row>)}
        {externalPlaces.map((place) => <Row key={place.id} style={{ paddingVertical: 10, gap: 12, borderBottomWidth: 1, borderColor: p.line }}>
          <View style={{ width: 46, height: 46, borderRadius: 6, backgroundColor: p.greenSoft, justifyContent: "center", alignItems: "center" }}><Icon name="pin" color={p.green} /></View>
          <Pressable accessibilityRole="button" accessibilityLabel={`View ${place.name}`} onPress={() => router.push({ pathname: "/map", params: { external: place.id } } as Href)} style={{ flex: 1, minWidth: 0 }}>
            <Copy style={{ fontWeight: "600" }}>{place.name}</Copy>
            <Copy muted style={{ fontSize: 12 }}>{place.location || place.category} · {place.source}</Copy>
          </Pressable>
          <IconButton name="map" label={`Map for ${place.name}`} onPress={() => router.push({ pathname: "/map", params: { external: place.id } } as Href)} />
          <IconButton name="heartFill" label={`Unsave ${place.name}`} color={p.pink} onPress={() => void toggleExternalPlace(place)} />
        </Row>)}
        {!!unavailablePlaces && <Copy muted>{unavailablePlaces} saved {unavailablePlaces === 1 ? "place is" : "places are"} unavailable on this device.</Copy>}
        {!savedPlaces.length && <EmptyState title="No places saved" detail="Save a landmark, trail, or market to find it here." action="Explore places" onPress={() => router.push("/explore" as Href)} />}
      </>}
      {tab === "Current trip" && (trip ? <>
        <DestinationCard destination={findDestination(trip.destinationId)} />
        <Copy muted>{dateLabel(trip.start)} - {dateLabel(trip.end)}</Copy>
        <Button onPress={() => router.push("/itinerary" as Href)}>Open itinerary</Button>
      </> : <EmptyState title="No trip planned" detail="Choose a destination and dates to start your trip." action="Plan a trip" onPress={() => router.push("/planner" as Href)} />)}
    </Screen>
  );
}

export function ProfileScreen() {
  const { user, signOut } = useAuth();
  const { profile, setProfile, saved, savedPlaces, externalPlaces, trip, clearTrip, journal, journalEntries } = useTravel();
  const savedDestinations = destinations.filter((destination) => saved.includes(destination.id));
  const savedPlaceRecords = places.filter((place) => savedPlaces.includes(place.id));
  const [tab, setTab] = useState("Trips");
  const [dialog, setDialog] = useState("");
  const appVersion = Constants.expoConfig?.version || "1.0.0";
  const currentYear = new Date().getFullYear();
  const [name, setName] = useState(profile.name);
  const [username, setUsername] = useState(profile.username);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!name.trim() || name.trim().length > 50 || (username && !/^[A-Za-z0-9_]{3,24}$/.test(username))) {
      setError("Enter a name and, if used, a username of 3-24 letters, numbers, or underscores.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await setProfile({ name: name.trim(), username: username.trim() });
      setDialog("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save your profile.");
    } finally {
      setBusy(false);
    }
  };
  const edit = () => { setName(profile.name); setUsername(profile.username); setError(""); setDialog("Edit profile"); };
  return (
    <Screen active="profile" style={{ gap: 22 }}>
      <Header title="Profile" back={false} right={<IconButton name="settings" label="Account settings" onPress={() => setDialog("Account settings")} />} />
      <View style={{ alignItems: "center", gap: 8 }}>
        <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: p.greenSoft, alignItems: "center", justifyContent: "center" }}><Icon name="person" size={38} color={p.green} /></View>
        <Heading style={{ fontSize: 24 }}>{profile.name}</Heading>
        <Copy muted style={{ fontSize: 12 }}>{profile.username ? `@${profile.username}` : user?.email}</Copy>
        <Button secondary icon="edit" onPress={edit}>Edit profile</Button>
      </View>
      <Row style={{ justifyContent: "space-around" }}>
        {[
          { value: trip ? 1 : 0, label: "Current trip" },
          { value: saved.length, label: "Destinations" },
          { value: savedPlaces.length, label: "Places" },
          { value: journalEntries.length + (trip ? 1 : 0), label: "Journal" },
        ].map((item) => <View key={item.label} style={{ alignItems: "center", gap: 4 }}><Copy style={{ fontSize: 18, fontWeight: "700" }}>{item.value}</Copy><Copy muted style={{ fontSize: 11 }}>{item.label}</Copy></View>)}
      </Row>
      <Row style={{ borderBottomWidth: 1, borderColor: p.line }}>
        {["Trips", "Saved", "Journal"].map((item) => <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: tab === item }} onPress={() => setTab(item)} style={{ flex: 1, alignItems: "center", paddingVertical: 11, borderBottomWidth: 2, borderBottomColor: tab === item ? p.blue : "transparent" }}><Copy style={{ color: tab === item ? p.blue : p.muted, fontSize: 12 }}>{item}</Copy></Pressable>)}
      </Row>
      {tab === "Trips" && (trip ? <>
        <DestinationCard destination={findDestination(trip.destinationId)} />
        <Button secondary onPress={() => router.push("/itinerary" as Href)}>Open itinerary</Button>
      </> : <EmptyState title="No trip yet" detail="Your first trip will appear here after you plan it." action="Plan a trip" onPress={() => router.push("/planner" as Href)} />)}
      {tab === "Saved" && (saved.length || savedPlaces.length ? <>
        <View style={{ gap: 12 }}>
          <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
            <Heading style={{ fontSize: 18, lineHeight: 24 }}>Destinations ({savedDestinations.length})</Heading>
            {!!savedDestinations.length && <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/saved", params: { tab: "Destinations" } } as Href)} style={{ paddingVertical: 8, paddingLeft: 10 }}><Copy style={{ color: p.blue, fontSize: 13, fontWeight: "700" }}>View all</Copy></Pressable>}
          </Row>
          {savedDestinations.length ? <View style={s.grid}>{savedDestinations.slice(0, 4).map((destination) => <DestinationCard key={destination.id} destination={destination} />)}</View> : <Copy muted>No destinations saved yet.</Copy>}
        </View>
        <View style={{ gap: 8, borderTopWidth: 1, borderColor: p.line, paddingTop: 16 }}>
          <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
            <Heading style={{ fontSize: 18, lineHeight: 24 }}>Places ({savedPlaceRecords.length + externalPlaces.length})</Heading>
            {!!(savedPlaceRecords.length + externalPlaces.length) && <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/saved", params: { tab: "Places" } } as Href)} style={{ paddingVertical: 8, paddingLeft: 10 }}><Copy style={{ color: p.blue, fontSize: 13, fontWeight: "700" }}>View all</Copy></Pressable>}
          </Row>
          {savedPlaceRecords.slice(0, 4).map((place) => (
            <Pressable key={place.id} accessibilityRole="button" accessibilityLabel={`View ${place.name}`} onPress={() => router.push({ pathname: "/explore", params: { id: place.destinationId, place: place.id } } as Href)} style={[s.row, { paddingVertical: 9, gap: 10 }]}>
              <Icon name="pin" color={p.green} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Copy style={{ fontWeight: "600" }}>{place.name}</Copy>
                <Copy muted style={{ fontSize: 12 }}>{findDestination(place.destinationId).name} · {place.category}</Copy>
              </View>
              <Icon name="right" color={p.muted} />
            </Pressable>
          ))}
          {externalPlaces.slice(0, Math.max(0, 4 - savedPlaceRecords.length)).map((place) => <Pressable key={place.id} accessibilityRole="button" accessibilityLabel={`View ${place.name}`} onPress={() => router.push({ pathname: "/map", params: { external: place.id } } as Href)} style={[s.row, { paddingVertical: 9, gap: 10 }]}>
            <Icon name="pin" color={p.green} /><View style={{ flex: 1, minWidth: 0 }}><Copy style={{ fontWeight: "600" }}>{place.name}</Copy><Copy muted style={{ fontSize: 12 }}>{place.location || place.category} · {place.source}</Copy></View><Icon name="right" color={p.muted} />
          </Pressable>)}
          {!savedPlaceRecords.length && !externalPlaces.length && <Copy muted>No places saved yet.</Copy>}
        </View>
        <Button secondary onPress={() => router.push("/saved" as Href)}>View all saved</Button>
      </> : <EmptyState title="Nothing saved yet" detail="Save destinations or places to keep them close." action="Explore destinations" onPress={() => router.push("/home" as Href)} />)}
      {tab === "Journal" && <>
        <Heading style={{ fontSize: 18, lineHeight: 24 }}>Your trips</Heading>
        {trip && <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/journal-trip", params: { id: "current" } } as Href)} style={[s.row, { paddingVertical: 10, gap: 10 }]}><Icon name="bag" color={p.blue} /><View style={{ flex: 1 }}><Copy style={{ fontWeight: "600" }}>{findDestination(trip.destinationId).name}</Copy><Copy muted style={{ fontSize: 12 }}>Current trip · {dateLabel(trip.start)} - {dateLabel(trip.end)}</Copy></View><Icon name="right" color={p.muted} /></Pressable>}
        {journalEntries.slice(0, 2).map((entry) => <Pressable key={entry.id} accessibilityRole="button" onPress={() => router.push({ pathname: "/journal-trip", params: { id: entry.id } } as Href)} style={[s.row, { paddingVertical: 10, gap: 10 }]}><Icon name="book" color={p.green} /><View style={{ flex: 1 }}><Copy style={{ fontWeight: "600" }}>{findDestination(entry.trip.destinationId).name}</Copy><Copy muted style={{ fontSize: 12 }}>{entry.status === "completed" ? "Completed" : "Archived plan"} · {dateLabel(entry.trip.start)} - {dateLabel(entry.trip.end)}</Copy></View><Icon name="right" color={p.muted} /></Pressable>)}
        {!trip && !journalEntries.length && <Copy muted>{journal ? "Your personal note is in the travel journal." : "Your trips will appear here after you start planning."}</Copy>}
        <Button secondary icon="book" onPress={() => router.push("/memories" as Href)}>Open travel journal</Button>
      </>}
      <View style={{ borderTopWidth: 1, borderColor: p.line, paddingTop: 8 }}>
        <Pressable accessibilityRole="button" onPress={() => router.push("/preferences" as Href)} style={[s.row, { paddingVertical: 15 }]}><Icon name="compass" color={p.blue} /><Copy style={{ flex: 1 }}>Travel preferences</Copy><Icon name="right" color={p.muted} /></Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push("/legal" as Href)} style={[s.row, { paddingVertical: 15 }]}><Icon name="book" color={p.blue} /><Copy style={{ flex: 1 }}>Legal & privacy</Copy><Icon name="right" color={p.muted} /></Pressable>
        <Pressable accessibilityRole="button" onPress={() => setDialog("Log out")} style={[s.row, { paddingVertical: 15 }]}><Icon name="logout" color={p.danger} /><Copy style={{ color: p.danger }}>Log out</Copy></Pressable>
      </View>
      <View style={{ alignItems: "center", gap: 3, paddingTop: 4, paddingBottom: 6 }}>
        <Copy muted style={{ fontSize: 11 }}>GoWorth v{appVersion}</Copy>
        <Copy muted style={{ fontSize: 11 }}>© {currentYear} GoWorth. All rights reserved.</Copy>
      </View>
      <Sheet visible={!!dialog} title={dialog} onClose={() => setDialog("")}>
        {dialog === "Edit profile" && <>
          <Field label="Name" value={name} onChangeText={setName} maxLength={50} />
          <Field label="Username (optional)" value={username} onChangeText={setUsername} autoCapitalize="none" maxLength={24} />
          {!!error && <Copy style={s.error}>{error}</Copy>}
          <Button busy={busy} onPress={save}>Save profile</Button>
        </>}
        {dialog === "Account settings" && <>
          <Copy>{profile.name}</Copy>
          <Copy muted>{user?.email}</Copy>
          <Button secondary onPress={edit}>Edit profile</Button>
          {!!trip && <Button secondary onPress={() => { setError(""); setDialog("Delete trip"); }}>Delete current trip</Button>}
        </>}
        {dialog === "Delete trip" && <>
          <Copy muted>Your itinerary and expenses will be deleted. Saved places and your journal will remain.</Copy>
          {!!error && <Copy style={s.error}>{error}</Copy>}
          <Button busy={busy} onPress={async () => {
            setBusy(true);
            setError("");
            try { await clearTrip(); setDialog(""); }
            catch (caught) { setError(caught instanceof Error ? caught.message : "Could not delete the trip."); }
            finally { setBusy(false); }
          }}>Delete trip</Button>
          <Button secondary onPress={() => setDialog("Account settings")}>Cancel</Button>
        </>}
        {dialog === "Log out" && <>
          <Copy muted>Sign out of your account?</Copy>
          {!!error && <Copy style={s.error}>{error}</Copy>}
          <Button onPress={async () => {
            setBusy(true);
            try { await signOut(); setDialog(""); router.replace("/welcome" as Href); }
            catch (caught) { setError(caught instanceof Error ? caught.message : "Could not sign out."); }
            finally { setBusy(false); }
          }} busy={busy}>Log out</Button>
          <Button secondary onPress={() => setDialog("")}>Stay here</Button>
        </>}
      </Sheet>
    </Screen>
  );
}
