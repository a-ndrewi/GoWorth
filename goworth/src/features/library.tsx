import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams, type Href } from "expo-router";
import Constants from "expo-constants";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { memo, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Button, Chip, Copy, Field, Header, Heading, Icon, IconButton, Row, Screen, Sheet, sharedSheet, type IconName } from "@/components/goworth/ui";
import { TripHero, heroStylesSheet } from "@/components/goworth/trip-hero";
import { PastTripCard } from "@/components/goworth/past-trip-card";
import { photos, themedStyles } from "@/constants/design";
import { usePalette, useThemePreference, useStyles } from "@/state/theme-context";
import { findDestination, money, places } from "@/data/travel";
import { useTravel } from "@/state/travel-context";
import { useAuth } from "@/state/auth-context";
import { currentExchangeRate, useAppLanguage } from "@/data/formatting";
import { formatMessage, translate, translateAccessibility } from "@/data/i18n";
import { PlaceThumbnail } from "@/components/goworth/place-preview";
import { venueFromCategory } from "@/data/nearby-places";

// Saved place cards have one fixed height, so the list can place them without measuring each one; measuring left it
// unsure of their size, and it then rendered every saved place at once.
const savedCardHeight = 98;
const savedCardGap = 10;

const SavedPlaceCard = memo(function SavedPlaceCard({ name, category, location, latitude, longitude, sourceUrl, onOpen, onUnsave }: {
  name: string; category: string; location: string; latitude?: number; longitude?: number; sourceUrl?: string;
  onOpen: () => void; onUnsave: () => void;
}) {
  const styles = useStyles(stylesSheet);
  const p = usePalette();
  const language = useAppLanguage();
  // The unsave button sits beside the card's pressable area, not inside it: nested buttons are invalid on the web.
  return <View style={[styles.card, { height: savedCardHeight }]}>
    <Pressable accessibilityRole="button" accessibilityLabel={translateAccessibility(`View ${name}`, language)} onPress={onOpen}
      style={({ pressed }) => [styles.cardBody, pressed && { opacity: 0.7 }]}>
    <PlaceThumbnail name={name} location={location} latitude={latitude} longitude={longitude} sourceUrl={sourceUrl} style={styles.thumb} fallbackColor={p.blue} thumbWidth={250} venue={venueFromCategory(category)} />
    <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
      <Text numberOfLines={2} style={styles.cardName}>{name}</Text>
      {!!category && <Text numberOfLines={1} style={styles.cardCategory}>{translate(category, language)}</Text>}
      <Row style={{ gap: 4 }}><Icon name="pin" size={13} color={p.muted} /><Text numberOfLines={1} style={styles.cardMeta}>{translate(location, language)}</Text></Row>
    </View>
    </Pressable>
    <IconButton name="heartFill" label={`Unsave ${name}`} color={p.pink} onPress={onUnsave} style={styles.cardAction} />
  </View>;
});

function QuickAction({ icon, label, detail, onPress }: { icon: IconName; label: string; detail: string; onPress: () => void }) {
  const styles = useStyles(stylesSheet);
  const p = usePalette();
  const language = useAppLanguage();
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.action, pressed && { transform: [{ scale: 0.97 }], backgroundColor: p.blueSoft }]}>
    <View style={styles.actionIcon}><Icon name={icon} size={20} color={p.blue} /></View>
    <Text style={styles.actionLabel}>{translate(label, language)}</Text>
    <Text numberOfLines={1} style={styles.cardMeta}>{detail}</Text>
  </Pressable>;
}

export function SavedScreen() {
  const styles = useStyles(stylesSheet);
  const s = useStyles(sharedSheet);
  const heroStyles = useStyles(heroStylesSheet);
  const p = usePalette();
  const language = useAppLanguage();
  const { tab: initialTab } = useLocalSearchParams<{ tab?: string }>();
  const { savedPlaces, togglePlace, externalPlaces, toggleExternalPlace, trip, activities, expenses, journalEntries, journalAvailable } = useTravel();
  const [history, setHistory] = useState<"all" | "completed" | "replaced">("all");
  const [tab, setTab] = useState(initialTab === "Trips" || initialTab === "Current trip" ? "Trips" : "Places");
  // A tab stays mounted once opened, so switching back does not rebuild its cards and reload their photos.
  const [opened, setOpened] = useState(() => new Set([tab]));
  const openTab = (next: string) => { setTab(next); setOpened((current) => current.has(next) ? current : new Set([...current, next])); };
  const savedPlaceRecords = useMemo(() => {
    const ids = new Set(savedPlaces);
    return places.filter((place) => ids.has(place.id));
  }, [savedPlaces]);
  const placeCount = savedPlaceRecords.length + externalPlaces.length;
  // One flat list for both kinds of saved place, so it can be virtualized: hundreds of cards must not mount at once.
  const placeItems = useMemo(() => [
    ...savedPlaceRecords.map((place) => {
      const destination = findDestination(place.destinationId);
      return { key: place.id, name: place.name, category: place.category, location: `${destination.name}, ${destination.country}`,
        latitude: undefined, longitude: undefined, sourceUrl: undefined,
        onOpen: () => router.push({ pathname: "/explore", params: { id: place.destinationId, place: place.id } } as Href),
        onUnsave: () => togglePlace(place.id) };
    }),
    ...externalPlaces.map((place) => ({ key: place.id, name: place.name, category: place.category, location: place.location || place.detail,
      latitude: place.latitude, longitude: place.longitude, sourceUrl: place.sourceUrl,
      onOpen: () => router.navigate({ pathname: "/map", params: { external: place.id } } as Href),
      onUnsave: () => void toggleExternalPlace(place) })),
  ], [savedPlaceRecords, externalPlaces, togglePlace, toggleExternalPlace]);
  const unavailablePlaces = Math.max(0, savedPlaces.length - savedPlaceRecords.length - externalPlaces.length);
  const spent = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const tabs = [{ id: "Places", count: placeCount }, { id: "Trips", count: (trip ? 1 : 0) + journalEntries.length }];
  const pastTrips = journalEntries.filter((entry) => history === "all" || entry.status === history)
    .sort((a, b) => b.trip.start.localeCompare(a.trip.start));
  const years = [...new Set(pastTrips.map((entry) => entry.trip.start.slice(0, 4)))];
  const completedCount = journalEntries.filter((entry) => entry.status === "completed").length;
  return (
    <Screen active="saved" scroll={false} style={{ gap: 18, paddingBottom: 0 }}>
      <Header title="Saved" back={false} centered />
      <View style={styles.segments}>
        {tabs.map((item) => {
          const selected = tab === item.id;
          return <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => openTab(item.id)} style={[styles.segment, selected && styles.segmentSelected]}>
            <Text style={[styles.segmentText, selected && { color: p.ink }]}>{translate(item.id, language)}</Text>
            {!!item.count && <View style={[styles.segmentCount, selected && { backgroundColor: p.blue }]}><Text style={[styles.segmentCountText, selected && { color: p.onColor }]}>{item.count}</Text></View>}
          </Pressable>;
        })}
      </View>
      {opened.has("Places") && <FlatList
        style={[{ flex: 1, marginHorizontal: -22 }, tab !== "Places" && { display: "none" }]}
        contentContainerStyle={{ flexGrow: 1, gap: savedCardGap, paddingHorizontal: 22, paddingBottom: 90, justifyContent: placeCount ? "flex-start" : "center" }}
        data={placeItems}
        keyExtractor={(item) => item.key}
        getItemLayout={(_, index) => ({ length: savedCardHeight, offset: (savedCardHeight + savedCardGap) * index, index })}
        renderItem={({ item }) => <SavedPlaceCard name={item.name} category={item.category} location={item.location}
          latitude={item.latitude} longitude={item.longitude} sourceUrl={item.sourceUrl} onOpen={item.onOpen} onUnsave={item.onUnsave} />}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={5}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={unavailablePlaces ? <Copy muted style={{ fontSize: 12 }}>{formatMessage(unavailablePlaces === 1 ? "{count} saved place is unavailable on this device." : "{count} saved places are unavailable on this device.", { count: unavailablePlaces }, language)}</Copy> : undefined}
        ListEmptyComponent={<View style={styles.empty}>
          <View style={styles.emptyIcon}><Icon name="heart" size={26} color={p.pink} /></View>
          <Heading style={{ fontSize: 18, lineHeight: 24, textAlign: "center" }}>No places saved</Heading>
          <Copy muted style={{ fontSize: 13, textAlign: "center" }}>Tap the heart on any place, or swipe right in Explore, to keep it here.</Copy>
          <Button icon="compass" onPress={() => router.navigate("/home" as Href)} style={{ marginTop: 6, paddingHorizontal: 22 }}>Explore places</Button>
        </View>}
      />}
      {opened.has("Trips") && <ScrollView style={[{ flex: 1, marginHorizontal: -22 }, tab !== "Trips" && { display: "none" }]} contentContainerStyle={{ flexGrow: 1, gap: 14, paddingHorizontal: 22, paddingBottom: 90 }} showsVerticalScrollIndicator={false}>
        {!!trip && <Text style={styles.section}>{translate("Current trip", language)}</Text>}
        {trip ? <>
          <Pressable accessibilityRole="button" accessibilityLabel={translate("Open itinerary", language)} onPress={() => router.push("/itinerary" as Href)}>
            <TripHero trip={trip}>
              <View style={[heroStyles.heroButton, { alignSelf: "flex-start" }]}>
                <Text style={heroStyles.heroButtonText}>{translate("Open itinerary", language)}</Text><Icon name="right" size={15} color={p.blue} />
              </View>
            </TripHero>
          </Pressable>
          <View style={styles.actions}>
            <QuickAction icon="calendar" label="Itinerary" detail={formatMessage(activities.length === 1 ? "{count} activity" : "{count} activities", { count: activities.length }, language)} onPress={() => router.push("/itinerary" as Href)} />
            <QuickAction icon="pin" label="Find places" detail={translate("Ideas for each day", language)} onPress={() => router.push("/itinerary-places" as Href)} />
            <QuickAction icon="wallet" label="Budget" detail={`${money(spent)} / ${money(trip.budget)}`} onPress={() => router.push("/budget" as Href)} />
            <QuickAction icon="edit" label="Edit trip" detail={translate("Dates, cities, style", language)} onPress={() => router.push({ pathname: "/planner", params: { edit: "1" } } as Href)} />
          </View>
          <Pressable accessibilityRole="button" onPress={() => router.push("/planner" as Href)} style={({ pressed }) => [styles.newTrip, pressed && { backgroundColor: p.blueSoft }]}>
            <Icon name="plus" size={18} color={p.blue} /><Text style={styles.newTripText}>{translate("Plan a new trip", language)}</Text>
          </Pressable>
        </> : <View style={[styles.empty, !journalEntries.length && { marginTop: 40 }]}>
          <View style={styles.emptyIcon}><Icon name="trip" size={26} color={p.blue} /></View>
          <Heading style={{ fontSize: 18, lineHeight: 24, textAlign: "center" }}>No trip planned</Heading>
          <Copy muted style={{ fontSize: 13, textAlign: "center" }}>Choose a destination and dates to start your trip.</Copy>
          <Button icon="plus" onPress={() => router.push("/planner" as Href)} style={{ marginTop: 6, paddingHorizontal: 22 }}>Plan a trip</Button>
        </View>}
        {!!journalEntries.length && <View style={{ gap: 10, marginTop: 8 }}>
          <Row style={{ justifyContent: "space-between" }}>
            <Text style={styles.section}>{translate("Past trips", language)}</Text>
            <Text style={styles.cardMeta}>{formatMessage("{done} completed · {total} total", { done: completedCount, total: journalEntries.length }, language)}</Text>
          </Row>
          {journalEntries.length > 1 && <Row style={{ gap: 7 }}>
            {(["all", "completed", "replaced"] as const).map((item) => <Chip key={item} selected={history === item} onPress={() => setHistory(item)}>
              {item === "all" ? "All" : item === "completed" ? "Completed" : "Unfinished plans"}
            </Chip>)}
          </Row>}
          {years.map((year) => <View key={year} style={{ gap: 9 }}>
            {years.length > 1 && <Text style={styles.year}>{year}</Text>}
            {pastTrips.filter((entry) => entry.trip.start.startsWith(year)).map((entry) => <PastTripCard key={entry.id} entry={entry} />)}
          </View>)}
          {!pastTrips.length && <Copy muted style={{ fontSize: 13 }}>No trips in this filter.</Copy>}
          <Copy muted style={{ fontSize: 11 }}>Finished trips are marked completed. Trips replaced by a new plan are kept as unfinished plans.</Copy>
        </View>}
        {!journalAvailable && <Copy style={s.error}>Trip history needs the latest database migration.</Copy>}
      </ScrollView>}
    </Screen>
  );
}

export function ProfileScreen() {
  const styles = useStyles(stylesSheet);
  const s = useStyles(sharedSheet);
  const p = usePalette();
  const language = useAppLanguage();
  const { user, signOut } = useAuth();
  const { profile, setProfile, avatarUrl, uploadAvatar, removeAvatar, plan, trip, clearTrip } = useTravel();
  const { preference: themePreference, setPreference: setThemePreference } = useThemePreference();
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
    <Screen active="profile" style={{ gap: 16 }}>
      <View style={styles.profileHero}>
        <LinearGradient colors={[p.blue, "#3B7BF0", p.teal]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <Row style={{ justifyContent: "space-between", alignSelf: "stretch" }}>
          <Text style={styles.profileTitle}>{translate("Profile", language)}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={translate("Account settings", language)} onPress={() => setDialog("Account settings")} style={({ pressed }) => [styles.heroIcon, pressed && { opacity: 0.8 }]}>
            <Icon name="settings" size={20} color={p.onColor} />
          </Pressable>
        </Row>
        <Pressable accessibilityRole="button" accessibilityLabel={translate("Change profile photo", language)} accessibilityState={{ disabled: avatarBusy, busy: avatarBusy }} disabled={avatarBusy} onPress={() => void changeAvatar()} style={styles.avatarRing}>
          {avatarBusy ? <ActivityIndicator color={p.blue} /> : <Image source={avatarUrl ? { uri: avatarUrl } : photos.avatar} contentFit="cover" transition={200} style={styles.avatar} />}
          {!avatarBusy && <View style={styles.cameraBadge}><Icon name="camera" size={14} color={p.blue} /></View>}
        </Pressable>
        <View style={{ alignItems: "center", gap: 2, maxWidth: "100%" }}>
          <Text numberOfLines={1} style={styles.profileName}>{profile.name}</Text>
          <Text numberOfLines={1} style={styles.profileHandle}>{profile.username ? `@${profile.username}` : user?.email}</Text>
        </View>
        <Row style={{ gap: 8 }}>
          <View style={styles.planPill}><Icon name="crown" size={14} color={plan === "free" ? p.onColor : "#FFD27A"} /><Text style={styles.planPillText}>{translate(plan === "free" ? "Free" : plan === "premium" ? "Premium" : "Lifetime", language)}</Text></View>
          <Pressable accessibilityRole="button" onPress={edit} style={({ pressed }) => [styles.editPill, pressed && { opacity: 0.85 }]}>
            <Icon name="edit" size={14} color={p.blue} /><Text style={styles.editPillText}>{translate("Edit profile", language)}</Text>
          </Pressable>
        </Row>
      </View>
      {!!avatarError && <View accessibilityLiveRegion="polite"><Copy style={[s.error, { textAlign: "center" }]}>{avatarError}</Copy></View>}

      <Pressable accessibilityRole="button" onPress={() => router.push("/membership" as Href)} style={({ pressed }) => [styles.memberCard, plan !== "free" && styles.memberCardPaid, pressed && { transform: [{ scale: 0.99 }] }]}>
        <View style={[styles.rowIcon, { backgroundColor: plan === "free" ? p.orangeSoft : "rgba(255,255,255,0.18)" }]}><Icon name="crown" size={20} color={plan === "free" ? p.orange : "#FFD27A"} /></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.rowTitle, plan !== "free" && { color: p.onColor }]}>{plan === "free" ? translate("Go unlimited", language) : formatMessage("Membership · {plan}", { plan: translate(plan === "premium" ? "Premium" : "Lifetime", language) }, language)}</Text>
          <Text numberOfLines={2} style={[styles.rowDetail, plan !== "free" && { color: "rgba(255,255,255,0.8)" }]}>{translate(plan === "free" ? "Unlimited trips and saves with Premium or Lifetime." : "Unlimited trips and saves are active.", language)}</Text>
        </View>
        <Icon name="right" size={18} color={plan === "free" ? p.muted : p.onColor} />
      </Pressable>

      <View style={styles.group}>
        {([
          { icon: "compass", tone: p.blue, soft: p.blueSoft, label: "Travel preferences", detail: "Destinations, budget, nearby discovery", onPress: () => router.push("/preferences" as Href) },
          { icon: "globe", tone: p.teal, soft: p.tealSoft, label: "Language, currency & appearance", detail: `${profile.language === "ro" ? "Română" : "English"} · ${profile.currency} · ${translate(themePreference === "system" ? "System" : themePreference === "dark" ? "Dark" : "Light", language)}`, onPress: () => setDialog("Account settings") },
          { icon: "help", tone: p.orange, soft: p.orangeSoft, label: "Help & support", detail: "Report a problem or send feedback", onPress: () => router.push("/support" as Href) },
          { icon: "lock", tone: p.purple, soft: p.purpleSoft, label: "Legal & privacy", detail: "Terms, privacy, your data", onPress: () => router.push("/legal" as Href) },
        ] as const).map((row, index) => <Pressable key={row.label} accessibilityRole="button" onPress={row.onPress} style={({ pressed }) => [styles.row, index > 0 && styles.rowDivider, pressed && { backgroundColor: p.soft }]}>
          <View style={[styles.rowIcon, { backgroundColor: row.soft }]}><Icon name={row.icon} size={19} color={row.tone} /></View>
          <View style={{ flex: 1, minWidth: 0 }}><Text style={styles.rowTitle}>{translate(row.label, language)}</Text><Text numberOfLines={1} style={styles.rowDetail}>{row.label === "Language, currency & appearance" ? row.detail : translate(row.detail, language)}</Text></View>
          <Icon name="right" size={17} color={p.muted} />
        </Pressable>)}
      </View>

      <Pressable accessibilityRole="button" onPress={() => setDialog("Log out")} style={({ pressed }) => [styles.group, styles.row, pressed && { backgroundColor: p.dangerSoft }]}>
        <View style={[styles.rowIcon, { backgroundColor: p.dangerSoft }]}><Icon name="logout" size={19} color={p.danger} /></View>
        <Text style={[styles.rowTitle, { flex: 1, color: p.danger }]}>{translate("Log out", language)}</Text>
      </Pressable>

      <View style={{ alignItems: "center", gap: 4, paddingTop: 6, paddingBottom: 8 }}>
        <Image source={photos.brandMark} contentFit="contain" accessibilityLabel="GoWorth" style={{ width: 40, height: 30 }} />
        <Copy muted style={{ fontSize: 11 }}>GoWorth v{appVersion} · © {currentYear}</Copy>
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
          <Copy style={s.label}>Appearance</Copy>
          <Row style={{ gap: 7, flexWrap: "wrap" }}>
            {(["system", "light", "dark"] as const).map((option) => <Chip key={option} selected={themePreference === option} onPress={() => setThemePreference(option)}>{option === "system" ? "System" : option === "light" ? "Light" : "Dark"}</Chip>)}
          </Row>
          {themePreference === "system" && <Copy muted style={{ fontSize: 12 }}>Matches your device setting.</Copy>}
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

const stylesSheet = themedStyles((p) => ({
  section: { color: p.ink, fontSize: 18, fontWeight: "800" },
  profileHero: { alignItems: "center", gap: 12, padding: 18, paddingBottom: 20, borderRadius: 26, overflow: "hidden" },
  profileTitle: { color: p.onColor, fontSize: 20, fontWeight: "800" },
  heroIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.2)" },
  avatarRing: { width: 98, height: 98, borderRadius: 49, alignItems: "center", justifyContent: "center", backgroundColor: p.onColor,
    shadowColor: "#1E3A8A", shadowOpacity: 0.25, shadowRadius: 0, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  avatar: { width: 90, height: 90, borderRadius: 45 },
  cameraBadge: { position: "absolute", right: -2, bottom: 0, width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: p.white, borderWidth: 2, borderColor: p.blueSoft },
  profileName: { color: p.onColor, fontSize: 22, fontWeight: "800" },
  profileHandle: { color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: "600" },
  planPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.2)" },
  planPillText: { color: p.onColor, fontSize: 13, fontWeight: "800" },
  editPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14, backgroundColor: p.white },
  editPillText: { color: p.blue, fontSize: 13, fontWeight: "800" },
  memberCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 20, borderWidth: 1, borderColor: p.orangeLine, backgroundColor: p.orangeSoft },
  memberCardPaid: { borderColor: p.ink, backgroundColor: p.night },
  group: { borderRadius: 20, borderWidth: 1, borderColor: p.line, backgroundColor: p.white, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  rowDivider: { borderTopWidth: 1, borderColor: p.line },
  rowIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  rowTitle: { color: p.ink, fontSize: 15, fontWeight: "700" },
  rowDetail: { color: p.muted, fontSize: 12, fontWeight: "600", marginTop: 1 },
  year: { color: p.muted, fontSize: 12, fontWeight: "800", letterSpacing: 0.5, marginTop: 4 },
  segments: { flexDirection: "row", gap: 4, padding: 4, borderRadius: 16, backgroundColor: p.soft },
  segment: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 40, borderRadius: 12 },
  segmentSelected: { backgroundColor: p.white, shadowColor: p.shadow, shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  segmentText: { color: p.muted, fontSize: 14, fontWeight: "700" },
  segmentCount: { minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: p.line },
  segmentCountText: { color: p.muted, fontSize: 11, fontWeight: "800" },
  card: { flexDirection: "row", alignItems: "center", gap: 12, padding: 10, borderRadius: 18, borderWidth: 1, borderColor: p.line, backgroundColor: p.white },
  cardBody: { flex: 1, minWidth: 0, alignSelf: "stretch", flexDirection: "row", alignItems: "center", gap: 12 },
  thumb: { width: 72, height: 72, borderRadius: 14, backgroundColor: p.blueSoft },
  cardName: { color: p.ink, fontSize: 15, lineHeight: 19, fontWeight: "700" },
  cardCategory: { color: p.blue, fontSize: 12, fontWeight: "700" },
  cardMeta: { flexShrink: 1, color: p.muted, fontSize: 12, fontWeight: "600" },
  cardAction: { width: 36, minWidth: 36, height: 36, minHeight: 36, borderRadius: 12, backgroundColor: p.soft },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  action: { width: "48%", flexGrow: 1, gap: 4, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: p.line, backgroundColor: p.white },
  actionIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: p.blueSoft, marginBottom: 4 },
  actionLabel: { color: p.ink, fontSize: 15, fontWeight: "800" },
  newTrip: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, minHeight: 48, borderRadius: 14, borderWidth: 1.5, borderStyle: "dashed", borderColor: p.blueLine },
  newTripText: { color: p.blue, fontSize: 14, fontWeight: "700" },
  empty: { alignItems: "center", gap: 7, paddingVertical: 30, paddingHorizontal: 22, borderRadius: 22, borderWidth: 1.5, borderStyle: "dashed", borderColor: p.blueLine, backgroundColor: p.blueTint },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: p.blueSoft, marginBottom: 4 },
}));
