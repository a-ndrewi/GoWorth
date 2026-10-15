import { router, useLocalSearchParams, type Href } from "expo-router";
import Constants from "expo-constants";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import {
  Button, Chip, Copy, DestinationCard, EmptyState, Field, Header, Heading,
  Icon, IconButton, Row, Screen, Sheet, s,
} from "@/components/goworth/ui";
import { palette as p } from "@/constants/design";
import { dateLabel, destinations, findDestination, places, type Trip } from "@/data/travel";
import { routeStop, routeTitle, uniqueRouteStops } from "@/data/trip-route";
import { useTravel } from "@/state/travel-context";
import { useAuth } from "@/state/auth-context";
import { currentExchangeRate, useAppLanguage } from "@/data/formatting";
import { formatMessage, translate, translateAccessibility } from "@/data/i18n";

function TripSummary({ trip }: { trip: Trip }) {
  const catalogDestination = destinations.find((destination) => destination.id === trip.destinationId);
  return <View style={{ gap: 8 }}>
    {catalogDestination && <DestinationCard destination={catalogDestination} />}
    {!catalogDestination && <Pressable accessibilityRole="button" onPress={() => router.push("/itinerary" as Href)} style={[s.row, { paddingVertical: 12, gap: 10 }]}><Icon name="map" color={p.blue} /><View style={{ flex: 1 }}><Copy style={{ fontWeight: "700" }}>{routeTitle(trip)}</Copy><Copy muted>{routeStop(trip).country}</Copy></View><Icon name="right" color={p.muted} /></Pressable>}
    {uniqueRouteStops(trip).length > 1 && <Copy muted>{uniqueRouteStops(trip).map((stop) => `${stop.name}, ${stop.country}`).join(" → ")}</Copy>}
  </View>;
}

export function SavedScreen() {
  const language = useAppLanguage();
  const { tab: initialTab } = useLocalSearchParams<{ tab?: string }>();
  const { saved, savedPlaces, togglePlace, externalPlaces, toggleExternalPlace, trip } = useTravel();
  const [tab, setTab] = useState(initialTab === "Places" || initialTab === "Current trip" ? initialTab : "Destinations");
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
          <Pressable accessibilityRole="button" accessibilityLabel={translateAccessibility(`View ${place.name}`, language)} onPress={() => router.push({ pathname: "/explore", params: { id: place.destinationId, place: place.id } } as Href)} style={{ flex: 1 }}>
            <Copy style={{ fontWeight: "600" }}>{place.name}</Copy>
            <Copy muted style={{ fontSize: 12 }}>{findDestination(place.destinationId).name} · {place.category}</Copy>
          </Pressable>
          <IconButton name="map" label={`Map for ${place.name}`} onPress={() => openMap(place)} />
          <IconButton name="heartFill" label={`Unsave ${place.name}`} color={p.pink} onPress={() => togglePlace(place.id)} />
        </Row>)}
        {externalPlaces.map((place) => <Row key={place.id} style={{ paddingVertical: 10, gap: 12, borderBottomWidth: 1, borderColor: p.line }}>
          <View style={{ width: 46, height: 46, borderRadius: 6, backgroundColor: p.greenSoft, justifyContent: "center", alignItems: "center" }}><Icon name="pin" color={p.green} /></View>
          <Pressable accessibilityRole="button" accessibilityLabel={translateAccessibility(`View ${place.name}`, language)} onPress={() => router.push({ pathname: "/map", params: { external: place.id } } as Href)} style={{ flex: 1, minWidth: 0 }}>
            <Copy style={{ fontWeight: "600" }}>{place.name}</Copy>
            <Copy muted style={{ fontSize: 12 }}>{place.location || place.category} · {place.source}</Copy>
          </Pressable>
          <IconButton name="map" label={`Map for ${place.name}`} onPress={() => router.push({ pathname: "/map", params: { external: place.id } } as Href)} />
          <IconButton name="heartFill" label={`Unsave ${place.name}`} color={p.pink} onPress={() => void toggleExternalPlace(place)} />
        </Row>)}
        {!!unavailablePlaces && <Copy muted>{formatMessage(unavailablePlaces === 1 ? "{count} saved place is unavailable on this device." : "{count} saved places are unavailable on this device.", { count: unavailablePlaces }, language)}</Copy>}
        {!savedPlaces.length && <EmptyState title="No places saved" detail="Save a landmark, trail, or market to find it here." action="Explore places" onPress={() => router.push("/explore" as Href)} />}
      </>}
      {tab === "Current trip" && (trip ? <>
        <TripSummary trip={trip} />
        <Copy muted>{dateLabel(trip.start)} - {dateLabel(trip.end)}</Copy>
        <Button onPress={() => router.push("/itinerary" as Href)}>Open itinerary</Button>
      </> : <EmptyState title="No trip planned" detail="Choose a destination and dates to start your trip." action="Plan a trip" onPress={() => router.push("/planner" as Href)} />)}
    </Screen>
  );
}

export function ProfileScreen() {
  const language = useAppLanguage();
  const { user, signOut } = useAuth();
  const { profile, setProfile, avatarUrl, uploadAvatar, removeAvatar, plan, saved, savedPlaces, externalPlaces, trip, clearTrip, journal, journalEntries } = useTravel();
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
  const [avatarError, setAvatarError] = useState("");
  const [avatarBusy, setAvatarBusy] = useState(false);
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
  const changeAvatar = async () => {
    if (avatarBusy) return;
    setAvatarError("");
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true,
        aspect: [1, 1], quality: 0.8, base64: true });
      if (result.canceled) return;
      if (!result.assets[0]?.base64) throw new Error("Could not read the selected photo.");
      setAvatarBusy(true);
      await uploadAvatar(result.assets[0].base64);
    } catch (caught) { setAvatarError(caught instanceof Error ? caught.message : "Could not upload your photo."); }
    finally { setAvatarBusy(false); }
  };
  const deleteAvatar = async () => {
    if (avatarBusy) return;
    setAvatarBusy(true);
    setAvatarError("");
    try { await removeAvatar(); }
    catch (caught) { setAvatarError(caught instanceof Error ? caught.message : "Could not remove the photo."); }
    finally { setAvatarBusy(false); }
  };
  const changeSetting = async (next: { language?: "en" | "ro"; currency?: "EUR" | "USD" }) => {
    setBusy(true); setError("");
    try { await setProfile(next); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not update settings."); }
    finally { setBusy(false); }
  };
  return (
    <Screen active="profile" style={{ gap: 22 }}>
      <Header title="Profile" back={false} right={<IconButton name="settings" label="Account settings" onPress={() => setDialog("Account settings")} />} />
      <View style={{ alignItems: "center", gap: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={translate("Change profile photo", language)} accessibilityState={{ disabled: avatarBusy, busy: avatarBusy }} disabled={avatarBusy} onPress={() => void changeAvatar()} style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: p.greenSoft, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          {avatarBusy ? <ActivityIndicator color={p.green} /> : avatarUrl ? <Image source={{ uri: avatarUrl }} contentFit="cover" style={{ width: 84, height: 84 }} /> : <Icon name="person" size={38} color={p.green} />}
        </Pressable>
        {!!avatarError && <View accessibilityLiveRegion="polite"><Copy style={[s.error, { textAlign: "center" }]}>{avatarError}</Copy></View>}
        <Heading style={{ fontSize: 22, lineHeight: 28, textAlign: "center", maxWidth: "100%", flexShrink: 1 }}>{profile.name}</Heading>
        <Copy muted style={{ fontSize: 12, textAlign: "center", maxWidth: "100%", flexShrink: 1 }}>{profile.username ? `@${profile.username}` : user?.email}</Copy>
        <Button secondary onPress={edit}>Edit profile</Button>
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
        <TripSummary trip={trip} />
        <Button secondary onPress={() => router.push("/itinerary" as Href)}>Open itinerary</Button>
      </> : <EmptyState title="No trip yet" detail="Your first trip will appear here after you plan it." action="Plan a trip" onPress={() => router.push("/planner" as Href)} />)}
      {tab === "Saved" && (saved.length || savedPlaces.length ? <>
        <View style={{ gap: 12 }}>
          <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
            <Heading style={{ fontSize: 18, lineHeight: 24 }}>{formatMessage("Destinations ({count})", { count: savedDestinations.length }, language)}</Heading>
            {!!savedDestinations.length && <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/saved", params: { tab: "Destinations" } } as Href)} style={{ paddingVertical: 8, paddingLeft: 10 }}><Copy style={{ color: p.blue, fontSize: 13, fontWeight: "700" }}>View all</Copy></Pressable>}
          </Row>
          {savedDestinations.length ? <View style={s.grid}>{savedDestinations.slice(0, 4).map((destination) => <DestinationCard key={destination.id} destination={destination} />)}</View> : <Copy muted>No destinations saved yet.</Copy>}
        </View>
        <View style={{ gap: 8, borderTopWidth: 1, borderColor: p.line, paddingTop: 16 }}>
          <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
            <Heading style={{ fontSize: 18, lineHeight: 24 }}>{formatMessage("Places ({count})", { count: savedPlaceRecords.length + externalPlaces.length }, language)}</Heading>
            {!!(savedPlaceRecords.length + externalPlaces.length) && <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/saved", params: { tab: "Places" } } as Href)} style={{ paddingVertical: 8, paddingLeft: 10 }}><Copy style={{ color: p.blue, fontSize: 13, fontWeight: "700" }}>View all</Copy></Pressable>}
          </Row>
          {savedPlaceRecords.slice(0, 4).map((place) => (
            <Pressable key={place.id} accessibilityRole="button" accessibilityLabel={translateAccessibility(`View ${place.name}`, language)} onPress={() => router.push({ pathname: "/explore", params: { id: place.destinationId, place: place.id } } as Href)} style={[s.row, { paddingVertical: 9, gap: 10 }]}>
              <Icon name="pin" color={p.green} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Copy style={{ fontWeight: "600" }}>{place.name}</Copy>
                <Copy muted style={{ fontSize: 12 }}>{findDestination(place.destinationId).name} · {place.category}</Copy>
              </View>
              <Icon name="right" color={p.muted} />
            </Pressable>
          ))}
          {externalPlaces.slice(0, Math.max(0, 4 - savedPlaceRecords.length)).map((place) => <Pressable key={place.id} accessibilityRole="button" accessibilityLabel={translateAccessibility(`View ${place.name}`, language)} onPress={() => router.push({ pathname: "/map", params: { external: place.id } } as Href)} style={[s.row, { paddingVertical: 9, gap: 10 }]}>
            <Icon name="pin" color={p.green} /><View style={{ flex: 1, minWidth: 0 }}><Copy style={{ fontWeight: "600" }}>{place.name}</Copy><Copy muted style={{ fontSize: 12 }}>{place.location || place.category} · {place.source}</Copy></View><Icon name="right" color={p.muted} />
          </Pressable>)}
          {!savedPlaceRecords.length && !externalPlaces.length && <Copy muted>No places saved yet.</Copy>}
        </View>
        <Button secondary onPress={() => router.push("/saved" as Href)}>View all saved</Button>
      </> : <EmptyState title="Nothing saved yet" detail="Save destinations or places to keep them close." action="Explore destinations" onPress={() => router.push("/home" as Href)} />)}
      {tab === "Journal" && <>
        <Heading style={{ fontSize: 18, lineHeight: 24 }}>Your trips</Heading>
        {trip && <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/journal-trip", params: { id: "current" } } as Href)} style={[s.row, { paddingVertical: 10, gap: 10 }]}><Icon name="bag" color={p.blue} /><View style={{ flex: 1 }}><Copy style={{ fontWeight: "600" }}>{routeTitle(trip)}</Copy><Copy muted style={{ fontSize: 12 }}>{formatMessage("Current trip · {start} - {end}", { start: dateLabel(trip.start), end: dateLabel(trip.end) }, language)}</Copy></View><Icon name="right" color={p.muted} /></Pressable>}
        {journalEntries.slice(0, 2).map((entry) => <Pressable key={entry.id} accessibilityRole="button" onPress={() => router.push({ pathname: "/journal-trip", params: { id: entry.id } } as Href)} style={[s.row, { paddingVertical: 10, gap: 10 }]}><Icon name="book" color={p.green} /><View style={{ flex: 1 }}><Copy style={{ fontWeight: "600" }}>{routeTitle(entry.trip)}</Copy><Copy muted style={{ fontSize: 12 }}>{formatMessage("{status} · {start} - {end}", { status: translate(entry.status === "completed" ? "Completed" : "Archived plan", language), start: dateLabel(entry.trip.start), end: dateLabel(entry.trip.end) }, language)}</Copy></View><Icon name="right" color={p.muted} /></Pressable>)}
        {!trip && !journalEntries.length && <Copy muted>{journal ? "Your personal note is in the travel journal." : "Your trips will appear here after you start planning."}</Copy>}
        <Button secondary icon="book" onPress={() => router.push("/memories" as Href)}>Open travel journal</Button>
      </>}
      <View style={{ borderTopWidth: 1, borderColor: p.line, paddingTop: 8 }}>
        <Pressable accessibilityRole="button" onPress={() => router.push("/membership" as Href)} style={[s.row, { paddingVertical: 15 }]}><Icon name="crown" color={p.green} /><Copy style={{ flex: 1 }}>{formatMessage("Membership · {plan}", { plan: translate(plan === "free" ? "Free" : plan === "premium" ? "Premium" : "Lifetime", language) }, language)}</Copy><Icon name="right" color={p.muted} /></Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push("/preferences" as Href)} style={[s.row, { paddingVertical: 15 }]}><Icon name="compass" color={p.blue} /><Copy style={{ flex: 1 }}>Travel preferences</Copy><Icon name="right" color={p.muted} /></Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push("/legal" as Href)} style={[s.row, { paddingVertical: 15 }]}><Icon name="book" color={p.blue} /><Copy style={{ flex: 1 }}>Legal & privacy</Copy><Icon name="right" color={p.muted} /></Pressable>
        <Pressable accessibilityRole="button" onPress={() => setDialog("Log out")} style={[s.row, { paddingVertical: 15 }]}><Icon name="logout" color={p.danger} /><Copy style={{ color: p.danger }}>Log out</Copy></Pressable>
      </View>
      <View style={{ alignItems: "center", gap: 3, paddingTop: 4, paddingBottom: 6 }}>
        <Copy muted style={{ fontSize: 11 }}>GoWorth v{appVersion}</Copy>
        <Copy muted style={{ fontSize: 11 }}>© {currentYear} {translate("GoWorth. All rights reserved.", language)}</Copy>
      </View>
      <Sheet visible={!!dialog} title={dialog} onClose={() => setDialog("")}>
        {dialog === "Edit profile" && <>
          <Field label="Name" value={name} onChangeText={setName} maxLength={50} />
          <Field label="Username (optional)" value={username} onChangeText={setUsername} autoCapitalize="none" maxLength={24} />
          <Copy muted style={{ fontSize: 12 }}>Use your own name and photo. Profile content is checked before it is published.</Copy>
          <Button secondary icon="camera" busy={avatarBusy} onPress={() => void changeAvatar()}>Change photo</Button>
          {!!profile.avatarPath && <Button secondary icon="trash" busy={avatarBusy} onPress={() => void deleteAvatar()}>Remove photo</Button>}
          {!!avatarError && <Copy style={s.error}>{avatarError}</Copy>}
          {!!error && <Copy style={s.error}>{error}</Copy>}
          <Button busy={busy} onPress={save}>Save profile</Button>
        </>}
        {dialog === "Account settings" && <>
          <Copy>{profile.name}</Copy>
          <Copy muted>{user?.email}</Copy>
          <Button secondary onPress={edit}>Edit profile</Button>
          <Copy style={s.label}>Language</Copy>
          <Row style={{ gap: 7 }}><Chip selected={profile.language === "en"} onPress={() => void changeSetting({ language: "en" })}>English</Chip><Chip selected={profile.language === "ro"} onPress={() => void changeSetting({ language: "ro" })}>Română</Chip></Row>
          <Copy style={s.label}>Currency</Copy>
          <Row style={{ gap: 7 }}><Chip selected={profile.currency === "EUR"} onPress={() => void changeSetting({ currency: "EUR" })}>EUR (€)</Chip><Chip selected={profile.currency === "USD"} onPress={() => void changeSetting({ currency: "USD" })}>USD ($)</Chip></Row>
          <Copy muted style={{ fontSize: 12 }}>{formatMessage("Budgets are stored in EUR. USD values use the latest available ECB reference rate{date}.", { date: currentExchangeRate() ? ` (${currentExchangeRate()!.date})` : "" }, language)}</Copy>
          {!!error && <Copy style={s.error}>{error}</Copy>}
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
