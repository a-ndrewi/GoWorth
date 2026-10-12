import { router, type Href } from "expo-router";
import { useState } from "react";
import { Linking, Pressable, Share, View } from "react-native";
import {
  Button, Chip, Copy, DestinationCard, EmptyState, Field, Header, Heading,
  Icon, IconButton, Row, Screen, Sheet, s,
} from "@/components/goworth/ui";
import { palette as p } from "@/constants/design";
import { dateLabel, destinations, findDestination, placeMapUrl, places } from "@/data/travel";
import { useTravel } from "@/state/travel-context";
import { useAuth } from "@/state/auth-context";

export function MemoriesScreen() {
  const { journal, setJournal } = useTravel();
  const [editor, setEditor] = useState(false);
  const [draft, setDraft] = useState(journal);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const openEditor = () => { setDraft(journal); setError(""); setEditor(true); };
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await setJournal(draft.trim());
      setEditor(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save your journal.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen active="profile" style={{ gap: 22 }}>
      <Header title="Travel journal" right={<IconButton name={journal ? "edit" : "plus"} label={journal ? "Edit journal" : "Write a journal entry"} color={p.blue} onPress={openEditor} />} />
      {journal ? <>
        <View style={{ borderLeftWidth: 3, borderColor: p.green, paddingLeft: 16, paddingVertical: 7 }}>
          <Copy style={{ fontSize: 15, lineHeight: 24 }}>{journal}</Copy>
        </View>
        <Button secondary icon="share" onPress={() => void Share.share({ message: journal })}>Share journal</Button>
      </> : <EmptyState title="No journal entry yet" detail="Write down a memory from your journey." action="Write an entry" onPress={openEditor} />}
      <Sheet visible={editor} title="Your travel journal" onClose={() => setEditor(false)}>
        <Field label="Your entry" value={draft} onChangeText={setDraft} multiline style={{ minHeight: 170, textAlignVertical: "top" }} maxLength={1200} />
        <Copy muted style={{ fontSize: 11 }}>{draft.length}/1200</Copy>
        {!!error && <Copy style={s.error}>{error}</Copy>}
        <Button busy={busy} onPress={save}>Save journal</Button>
      </Sheet>
    </Screen>
  );
}

export function SavedScreen() {
  const { saved, savedPlaces, togglePlace, trip } = useTravel();
  const [tab, setTab] = useState("Destinations");
  const [error, setError] = useState("");
  const savedDestinations = destinations.filter((destination) => saved.includes(destination.id));
  const savedPlaceRecords = places.filter((place) => savedPlaces.includes(place.id));
  const openMap = async (place: (typeof places)[number]) => {
    try { await Linking.openURL(placeMapUrl(place)); }
    catch { setError("Could not open the map on this device."); }
  };
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
          <IconButton name="map" label={`Map for ${place.name}`} onPress={() => void openMap(place)} />
          <IconButton name="heartFill" label={`Unsave ${place.name}`} color={p.pink} onPress={() => togglePlace(place.id)} />
        </Row>)}
        {!savedPlaceRecords.length && <EmptyState title="No places saved" detail="Save a landmark, trail, or market to find it here." action="Explore places" onPress={() => router.push("/explore" as Href)} />}
      </>}
      {tab === "Current trip" && (trip ? <>
        <DestinationCard destination={findDestination(trip.destinationId)} />
        <Copy muted>{dateLabel(trip.start)} - {dateLabel(trip.end)}</Copy>
        <Button onPress={() => router.push("/itinerary" as Href)}>Open itinerary</Button>
      </> : <EmptyState title="No trip planned" detail="Choose a destination and dates to start your trip." action="Plan a trip" onPress={() => router.push("/planner" as Href)} />)}
      {!!error && <Copy style={s.error}>{error}</Copy>}
    </Screen>
  );
}

export function ProfileScreen() {
  const { user, signOut } = useAuth();
  const { profile, setProfile, saved, savedPlaces, trip, clearTrip, journal } = useTravel();
  const [tab, setTab] = useState("Trips");
  const [dialog, setDialog] = useState("");
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
          { value: journal ? 1 : 0, label: "Journal" },
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
        {!!saved.length && <View style={s.grid}>{destinations.filter((destination) => saved.includes(destination.id)).slice(0, 4).map((destination) => <DestinationCard key={destination.id} destination={destination} />)}</View>}
        {places.filter((place) => savedPlaces.includes(place.id)).slice(0, 4).map((place) => (
          <Pressable key={place.id} accessibilityRole="button" onPress={() => router.push({ pathname: "/explore", params: { id: place.destinationId, place: place.id } } as Href)} style={[s.row, { paddingVertical: 9 }]}>
            <Icon name="pin" color={p.green} />
            <View style={{ flex: 1 }}>
              <Copy style={{ fontWeight: "600" }}>{place.name}</Copy>
              <Copy muted style={{ fontSize: 12 }}>{findDestination(place.destinationId).name}</Copy>
            </View>
            <Icon name="right" color={p.muted} />
          </Pressable>
        ))}
        <Button secondary onPress={() => router.push("/saved" as Href)}>View all saved</Button>
      </> : <EmptyState title="Nothing saved yet" detail="Save destinations or places to keep them close." action="Explore destinations" onPress={() => router.push("/home" as Href)} />)}
      {tab === "Journal" && <>
        <Copy muted>{journal || "No journal entry yet."}</Copy>
        <Button secondary icon="book" onPress={() => router.push("/memories" as Href)}>Open journal</Button>
      </>}
      <View style={{ borderTopWidth: 1, borderColor: p.line, paddingTop: 8 }}>
        <Pressable accessibilityRole="button" onPress={() => router.push("/preferences" as Href)} style={[s.row, { paddingVertical: 15 }]}><Icon name="compass" color={p.blue} /><Copy style={{ flex: 1 }}>Travel preferences</Copy><Icon name="right" color={p.muted} /></Pressable>
        <Pressable accessibilityRole="button" onPress={() => setDialog("Log out")} style={[s.row, { paddingVertical: 15 }]}><Icon name="logout" color={p.danger} /><Copy style={{ color: p.danger }}>Log out</Copy></Pressable>
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
