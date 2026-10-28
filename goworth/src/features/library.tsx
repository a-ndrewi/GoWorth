import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams, type Href } from "expo-router";
import Constants from "expo-constants";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { memo, useEffect, useMemo, useState } from "react";
import { destinationPins } from "@/data/map";
import { prefetchPlacePhotos } from "@/data/place-photo";
import { ActivityIndicator, FlatList, Linking, Platform, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { Button, Chip, Copy, Field, Header, Heading, Icon, IconButton, ListGroup, ListRow, Row, Screen, Sheet, sharedSheet, type IconName } from "@/components/goworth/ui";
import { socialLinks } from "@/constants/links";
import { openStoreReview, reviewStoreName } from "@/lib/store-review";
import { TripHero, heroStylesSheet } from "@/components/goworth/trip-hero";
import { PastTripCard } from "@/components/goworth/past-trip-card";
import { photos, themedStyles } from "@/constants/design";
import { usePalette, useThemePreference, useStyles } from "@/state/theme-context";
import { findDestination, money, places } from "@/data/travel";
import { useTravel } from "@/state/travel-context";
import { useAuth } from "@/state/auth-context";
import { useAppLanguage } from "@/data/formatting";
import { formatMessage, translate, translateAccessibility, translateLocation } from "@/data/i18n";
import { publicActivityNote, publicPlaceCategory } from "@/utils/public-activity";
import { PlacePreviewPhoto, PlaceThumbnail } from "@/components/goworth/place-preview";
import { GlyphIcon } from "@/components/goworth/icons";
import { venueFromCategory, type NearbyPlace } from "@/data/nearby-places";
import { useTimedMessage } from "@/hooks/use-timed-message";
import {
  requestNotificationPermission, sendTestNotifications, syncNearbyWatch, updateNotificationPrefs, useNotificationPrefs, type NotificationKind,
} from "@/lib/notifications";

type SavedPreview = {
  id: string; name: string; category: string; detail: string; location: string;
  latitude?: number; longitude?: number; sourceUrl?: string;
  /** Set for places saved from the map or Explore, which are re-saved from this record. */
  external?: NearbyPlace;
};

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
    <PlaceThumbnail name={name} location={location} latitude={latitude} longitude={longitude} sourceUrl={sourceUrl} style={styles.thumb} thumbWidth={250} venue={venueFromCategory(category)} />
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
  // A saved place opens in a sheet over the list; leaving it returns to Saved exactly as it was.
  const [preview, setPreview] = useState<SavedPreview | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useTimedMessage();
  const previewSaved = !!preview && (preview.external ? externalPlaces.some((place) => place.id === preview.id) : savedPlaces.includes(preview.id));
  const togglePreviewSaved = async () => {
    if (!preview) return;
    setPreviewBusy(true);
    setPreviewError("");
    try {
      if (preview.external) await toggleExternalPlace(preview.external);
      else await togglePlace(preview.id);
    } catch (caught) {
      setPreviewError(caught instanceof Error ? caught.message : translate("Could not update this place.", language));
    } finally { setPreviewBusy(false); }
  };
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
        latitude: undefined, longitude: undefined, sourceUrl: undefined, near: destinationPins.find((pin) => pin.id === place.destinationId),
        onOpen: () => setPreview({ id: place.id, name: place.name, category: place.category, detail: translate(place.detail, language),
          location: `${destination.name}, ${destination.country}`}),
        onUnsave: () => togglePlace(place.id) };
    }),
    ...externalPlaces.map((place) => ({ key: place.id, name: place.name, category: place.category, location: place.location || place.detail,
      latitude: place.latitude, longitude: place.longitude, sourceUrl: place.sourceUrl, near: undefined,
      onOpen: () => setPreview({ id: place.id, name: place.name, category: place.category, detail: publicActivityNote(place.detail),
        location: place.location || "", latitude: place.latitude, longitude: place.longitude, sourceUrl: place.sourceUrl,
        external: place }),
      onUnsave: () => void toggleExternalPlace(place) })),
  ], [savedPlaceRecords, externalPlaces, togglePlace, toggleExternalPlace, language]);
  // Photos for the whole list are looked up in bulk, a page at a time, before the cards each search on their own.
  const placesOpened = opened.has("Places");
  useEffect(() => {
    if (!placesOpened || !placeItems.length) return;
    let active = true;
    void (async () => {
      for (let start = 0; start < placeItems.length && active; start += 50) {
        await prefetchPlacePhotos(placeItems.slice(start, start + 50).map((item) => ({ name: item.name, location: item.location,
          latitude: item.latitude, longitude: item.longitude, sourceUrl: item.sourceUrl,
          ...(item.near ? { near: { latitude: item.near.latitude, longitude: item.near.longitude, radiusKm: 60 } } : {}) }))).catch(() => undefined);
      }
    })();
    return () => { active = false; };
  }, [placesOpened, placeItems]);
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
      <Sheet visible={!!preview} title={preview?.name ?? ""} onClose={() => { setPreview(null); setPreviewError(""); }}>
        {preview && <>
          <PlacePreviewPhoto name={preview.name} location={preview.location} latitude={preview.latitude} longitude={preview.longitude} sourceUrl={preview.sourceUrl}
            badge={translate(publicPlaceCategory(preview.category), language)} venue={venueFromCategory(preview.category)} />
          {!!preview.detail && <Copy muted>{preview.detail}</Copy>}
          {!!preview.location && <Row style={{ gap: 6 }}><Icon name="pin" size={15} color={p.muted} /><Copy muted style={{ flex: 1 }}>{translateLocation(preview.location, language)}</Copy></Row>}
          <Row style={{ gap: 9 }}>
            <Button secondary icon={previewSaved ? "heartFill" : "heart"} busy={previewBusy} onPress={() => void togglePreviewSaved()} style={{ flex: 1 }}>{previewSaved ? "Saved" : "Save"}</Button>
            <Button secondary icon="road" style={{ flex: 1 }} onPress={() => void Linking.openURL(preview.latitude !== undefined && preview.longitude !== undefined
              ? `https://www.google.com/maps/dir/?api=1&destination=${preview.latitude},${preview.longitude}`
              : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${preview.name}, ${preview.location}`)}`)}>Directions</Button>
          </Row>
          {!!previewError && <Copy style={s.error}>{previewError}</Copy>}
        </>}
      </Sheet>
    </Screen>
  );
}

export function ProfileScreen() {
  const styles = useStyles(stylesSheet);
  const s = useStyles(sharedSheet);
  const p = usePalette();
  const language = useAppLanguage();
  const { user, signOut } = useAuth();
  const { profile, setProfile, avatarUrl, uploadAvatar, removeAvatar, plan } = useTravel();
  const { preference: themePreference, setPreference: setThemePreference } = useThemePreference();
  const [dialog, setDialog] = useState("");
  const appVersion = Constants.expoConfig?.version || "1.0.0";
  const currentYear = new Date().getFullYear();
  const [name, setName] = useState(profile.name);
  const [username, setUsername] = useState(profile.username);
  const [error, setError] = useTimedMessage();
  const [busy, setBusy] = useState(false);
  const [avatarError, setAvatarError] = useTimedMessage();
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
  const { prefs: notificationPrefs } = useNotificationPrefs();
  const [notificationNote, setNotificationNote] = useTimedMessage();
  const [notificationBusy, setNotificationBusy] = useState(false);
  const toggleNotification = async (kind: NotificationKind, next: boolean) => {
    if (notificationBusy) return;
    setNotificationBusy(true);
    setNotificationNote("");
    try {
      if (next && !(await requestNotificationPermission())) {
        setNotificationNote("Notifications are off for GoWorth. Turn them on in your phone's Settings.");
        return;
      }
      if (kind === "nearby" && next && !(await syncNearbyWatch(true, profile.language, true))) {
        setNotificationNote("Nearby places need location access set to Always for GoWorth in your phone's Settings.");
        return;
      }
      await updateNotificationPrefs({ [kind]: next });
    } finally { setNotificationBusy(false); }
  };
  const sendTests = async () => {
    setNotificationBusy(true);
    setNotificationNote("");
    try {
      const sent = await sendTestNotifications(profile.language);
      setNotificationNote(sent ? formatMessage("{count} test notifications arrive over the next 20 seconds. Lock the phone to see them as banners.", { count: sent }, language)
        : "Notifications are off for GoWorth. Turn them on in your phone's Settings.");
    } finally { setNotificationBusy(false); }
  };
  const notificationRows: { kind: NotificationKind; icon: IconName; label: string; detail: string }[] = [
    { kind: "nearby", icon: "pin", label: "Places near you", detail: "When you arrive somewhere new, hear about a place worth seeing nearby." },
    { kind: "trip", icon: "plane", label: "Trip ideas", detail: "A nudge to plan your next trip after a few days without one." },
    { kind: "wheel", icon: "crown", label: "Daily wheel", detail: "An hour before your next free spin, and when it is ready." },
  ];
  const [linkError, setLinkError] = useTimedMessage();
  const openLink = async (url: string) => {
    setLinkError("");
    await Linking.openURL(url).catch(() => setLinkError(translate("Could not open the link.", language)));
  };
  const rate = async () => {
    setLinkError("");
    await openStoreReview().catch((caught) => setLinkError(translate(caught instanceof Error ? caught.message : "Could not open the store.", language)));
  };
  const openDocument = (type: "privacy" | "terms" | "premium" | "credits") =>
    router.push({ pathname: "/legal-document", params: { type } } as Href);
  const changeSetting = async (next: { language?: "en" | "ro"; currency?: "EUR" | "USD" }) => {
    setBusy(true); setError("");
    try { await setProfile(next); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not update settings."); }
    finally { setBusy(false); }
  };
  return (
    <Screen active="profile" style={{ gap: 22 }}>
      <Text accessibilityRole="header" style={styles.largeTitle}>{translate("Profile", language)}</Text>

      <View style={styles.profileCard}>
        <Pressable accessibilityRole="button" accessibilityLabel={translate("Change profile photo", language)} accessibilityState={{ disabled: avatarBusy, busy: avatarBusy }} disabled={avatarBusy} onPress={() => void changeAvatar()} style={styles.avatarRing}>
          {avatarBusy ? <ActivityIndicator color={p.blue} /> : avatarUrl
            ? <Image source={{ uri: avatarUrl }} contentFit="cover" transition={200} style={styles.avatar} />
            : <View style={[styles.avatar, styles.avatarPlaceholder]}><GlyphIcon name="person" size={38} color={p.blue} /></View>}
          {!avatarBusy && <View style={styles.cameraBadge}><Icon name="camera" size={12} color={p.onColor} /></View>}
        </Pressable>
        <Pressable accessibilityRole="button" onPress={edit} style={({ pressed }) => [{ flex: 1, minWidth: 0, gap: 3 }, pressed && { opacity: 0.7 }]}>
          <Text numberOfLines={1} style={styles.profileName}>{profile.name}</Text>
          <Text numberOfLines={1} style={styles.profileHandle}>{profile.username ? `@${profile.username}` : user?.email}</Text>
          <Text style={styles.profileEdit}>{translate("Edit profile", language)}</Text>
        </Pressable>
      </View>
      {!!avatarError && <View accessibilityLiveRegion="polite"><Copy style={[s.error, { textAlign: "center" }]}>{avatarError}</Copy></View>}

      <Pressable accessibilityRole="button" onPress={() => router.push("/membership" as Href)} style={({ pressed }) => [styles.planCard, pressed && { transform: [{ scale: 0.99 }] }]}>
        <LinearGradient colors={plan === "free" ? ["#FFE3A3", "#F5B83D"] : [p.blue, "#6E5BF5"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.planBadge}>
          <Icon name="crown" size={24} color={plan === "free" ? "#5A3B00" : p.onColor} />
        </LinearGradient>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={styles.planTitle}>GoWorth Premium</Text>
          <Text numberOfLines={2} style={styles.planDetail}>{translate(plan === "free" ? "Spin the daily wheel to win Premium for free." : "Unlimited trips and saves are active.", language)}</Text>
        </View>
        <View style={[styles.planPill, plan !== "free" && { backgroundColor: p.blueSoft }]}>
          <Text style={[styles.planPillText, plan !== "free" && { color: p.blue }]}>{translate(plan === "free" ? "Free" : plan === "premium" ? "Premium" : "Lifetime", language)}</Text>
        </View>
      </Pressable>

      <ListGroup title="Social media">
        <ListRow icon="instagram" label="Instagram" accessibilityRole="link" onPress={() => void openLink(socialLinks.instagram)} />
        <ListRow icon="tiktok" label="TikTok" accessibilityRole="link" onPress={() => void openLink(socialLinks.tiktok)} />
      </ListGroup>

      <ListGroup title="Preferences">
        <ListRow icon="compass" label="Travel preferences" onPress={() => router.push("/preferences" as Href)} />
        <ListRow icon="globe" label="Language & currency" value={`${profile.language.toUpperCase()} · ${profile.currency}`} onPress={() => { setError(""); setDialog("Language & currency"); }} />
        <ListRow icon="sun" label="Appearance" value={translate(themePreference === "system" ? "System" : themePreference === "dark" ? "Dark" : "Light", language)} onPress={() => setDialog("Appearance")} />
        {Platform.OS !== "web" && <ListRow icon="bell" label="Notifications" value={translate(Object.values(notificationPrefs).some(Boolean) ? "On" : "Off", language)} onPress={() => { setNotificationNote(""); setDialog("Notifications"); }} />}
      </ListGroup>

      <ListGroup title="Support">
        <ListRow icon="chat" label="Feedback & support" onPress={() => router.push("/support" as Href)} />
        {reviewStoreName && <ListRow icon="star" label={formatMessage("Rate us on {store}", { store: reviewStoreName }, language)} onPress={() => void rate()} />}
      </ListGroup>

      <ListGroup title="Information">
        <ListRow icon="lock" label="Privacy policy" onPress={() => openDocument("privacy")} />
        <ListRow icon="book" label="Terms of use" onPress={() => openDocument("terms")} />
        <ListRow icon="crown" label="Premium & wheel rules" onPress={() => openDocument("premium")} />
        <ListRow icon="map" label="Licenses & credits" onPress={() => openDocument("credits")} />
        <ListRow icon="info" label="App version" value={appVersion} />
      </ListGroup>

      <ListGroup title="Your data">
        <ListRow icon="share" label="Export or delete your data" detail="Download a copy of your account or delete it permanently." onPress={() => router.push("/legal" as Href)} />
        <ListRow icon="logout" label="Log out" destructive chevron={false} onPress={() => setDialog("Log out")} />
      </ListGroup>
      {!!linkError && <Copy style={[s.error, { textAlign: "center" }]}>{linkError}</Copy>}

      <View style={{ alignItems: "center", gap: 4, paddingTop: 2, paddingBottom: 8 }}>
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
        {dialog === "Language & currency" && <>
          <Copy style={s.label}>Language</Copy>
          <Row style={{ gap: 7 }}><Chip selected={profile.language === "en"} onPress={() => void changeSetting({ language: "en" })}>English</Chip><Chip selected={profile.language === "ro"} onPress={() => void changeSetting({ language: "ro" })}>Română</Chip></Row>
          <Copy style={s.label}>Currency</Copy>
          <Row style={{ gap: 7 }}><Chip selected={profile.currency === "EUR"} onPress={() => void changeSetting({ currency: "EUR" })}>EUR (€)</Chip><Chip selected={profile.currency === "USD"} onPress={() => void changeSetting({ currency: "USD" })}>USD ($)</Chip></Row>
          <Copy muted style={{ fontSize: 12 }}>Amounts keep their value when you switch currency. Only the symbol changes, with no exchange rate applied.</Copy>
          {!!error && <Copy style={s.error}>{error}</Copy>}
        </>}
        {dialog === "Appearance" && <>
          <Row style={{ gap: 7, flexWrap: "wrap" }}>
            {(["system", "light", "dark"] as const).map((option) => <Chip key={option} selected={themePreference === option} onPress={() => setThemePreference(option)}>{option === "system" ? "System" : option === "light" ? "Light" : "Dark"}</Chip>)}
          </Row>
          {themePreference === "system" && <Copy muted style={{ fontSize: 12 }}>Matches your device setting.</Copy>}
        </>}
        {dialog === "Notifications" && <>
          <ListGroup>
            {notificationRows.map((row) => <ListRow key={row.kind} icon={row.icon} label={row.label} detail={row.detail} chevron={false}
              onPress={() => void toggleNotification(row.kind, !notificationPrefs[row.kind])}
              right={<Switch value={notificationPrefs[row.kind]} disabled={notificationBusy} trackColor={{ true: p.blue }}
                accessibilityLabel={translate(row.label, language)} onValueChange={(next) => void toggleNotification(row.kind, next)} />} />)}
          </ListGroup>
          {!!notificationNote && <Copy style={s.error}>{notificationNote}</Copy>}
          {__DEV__ && <Button secondary icon="bell" busy={notificationBusy} onPress={() => void sendTests()}>Send test notifications</Button>}
          {notificationPrefs.nearby && <Copy muted style={{ fontSize: 12 }}>Uses your location in the background only to notice when you have moved about 2 km, at most one suggestion every few hours.</Copy>}
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
  largeTitle: { color: p.ink, fontSize: 34, lineHeight: 40, fontWeight: "800", letterSpacing: -0.8, marginTop: 6 },
  profileCard: { flexDirection: "row", alignItems: "center", gap: 16, padding: 16, borderRadius: 24, borderWidth: 1, borderColor: p.line, backgroundColor: p.white },
  avatarRing: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", backgroundColor: p.blueSoft },
  avatar: { width: 72, height: 72, borderRadius: 36 },
  avatarPlaceholder: { alignItems: "center", justifyContent: "center", backgroundColor: p.blueSoft },
  cameraBadge: { position: "absolute", right: -1, bottom: -1, width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: p.blue, borderWidth: 2, borderColor: p.white },
  profileName: { color: p.ink, fontSize: 20, lineHeight: 25, fontWeight: "800", letterSpacing: -0.3 },
  profileHandle: { color: p.muted, fontSize: 13, fontWeight: "500" },
  profileEdit: { color: p.blue, fontSize: 13, fontWeight: "700", marginTop: 3 },
  planCard: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: 24, borderWidth: 1, borderColor: p.line, backgroundColor: p.white },
  planBadge: { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  planTitle: { color: p.ink, fontSize: 17, lineHeight: 22, fontWeight: "800", letterSpacing: -0.2 },
  planDetail: { color: p.muted, fontSize: 13, lineHeight: 18 },
  planPill: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 14, backgroundColor: p.soft },
  planPillText: { color: p.ink, fontSize: 13, fontWeight: "700" },
  rowTitle: { color: p.ink, fontSize: 15, fontWeight: "700" },
  rowDetail: { color: p.muted, fontSize: 12, fontWeight: "600", marginTop: 1 },
  year: { color: p.muted, fontSize: 12, fontWeight: "800", letterSpacing: 0.5, marginTop: 4 },
  segments: { flexDirection: "row", gap: 4, padding: 4, borderRadius: 16, backgroundColor: p.line },
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
