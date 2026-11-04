import { Image } from "expo-image";
import { router, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Button, Copy, Field, Icon, Row, Sheet, sharedSheet } from "@/components/goworth/ui";
import { themedStyles } from "@/constants/design";
import { formatMessage, translate } from "@/data/i18n";
import { useAppLanguage } from "@/data/formatting";
import { routeTitle } from "@/data/trip-route";
import { useTimedMessage } from "@/hooks/use-timed-message";
import { loadTripCompanions, profileAvatarUrl, searchTravelers, type Traveler, type TripCompanion } from "@/lib/travel-repository";
import { useAuth } from "@/state/auth-context";
import { usePalette, useStyles } from "@/state/theme-context";
import { useTravel } from "@/state/travel-context";

// Signed photo links last an hour; keep them for the session so lists do not refetch on every render.
const avatarLinks = new Map<string, Promise<string | null>>();
function useAvatar(path: string | null) {
  const [link, setLink] = useState<{ path: string; url: string | null } | null>(null);
  useEffect(() => {
    if (!path) return;
    let current = true;
    if (!avatarLinks.has(path)) avatarLinks.set(path, profileAvatarUrl(path).catch(() => null));
    void avatarLinks.get(path)!.then((url) => { if (current) setLink({ path, url }); });
    return () => { current = false; };
  }, [path]);
  return path && link?.path === path ? link.url : null;
}

/** The name others see: the profile name, else the @username, else a neutral word. */
const shownName = (traveler: Pick<Traveler, "name" | "username">, language: "en" | "ro") =>
  traveler.name.trim() || (traveler.username ? `@${traveler.username}` : translate("Traveller", language));

const initials = (traveler: Pick<Traveler, "name" | "username">) =>
  (traveler.name || traveler.username).split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";

/** A traveller's photo, or their initials on a colour picked from their id so each person keeps the same one. */
export function TravelerAvatar({ traveler, size = 40, ring }: { traveler: Pick<Traveler, "id" | "name" | "username" | "avatarPath">; size?: number; ring?: string }) {
  const p = usePalette();
  const url = useAvatar(traveler.avatarPath);
  const tones = [p.blue, p.purple, p.teal, p.pink, p.orange, p.green];
  const tone = tones[[...traveler.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % tones.length];
  const frame = { width: size, height: size, borderRadius: size / 2, borderWidth: ring ? 2 : 0, borderColor: ring };
  return url
    ? <Image source={{ uri: url }} contentFit="cover" transition={150} style={frame} />
    : <View style={[frame, { backgroundColor: tone, alignItems: "center", justifyContent: "center" }]}>
      <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: size * 0.38 }}>{initials(traveler)}</Text>
    </View>;
}

/** Overlapping faces of everyone on the trip with a button to manage them; sits under the trip hero. */
export function CompanionStrip() {
  const styles = useStyles(stylesSheet);
  const p = usePalette();
  const language = useAppLanguage();
  const { user } = useAuth();
  const { trip, tripId, tripOwner, profile, avatarUrl } = useTravel();
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<TripCompanion[] | null>(null);
  useEffect(() => {
    if (!tripId || !trip || open) return;
    let current = true;
    loadTripCompanions(tripId).then((value) => { if (current) setPeople(value); }).catch(() => { if (current) setPeople(null); });
    return () => { current = false; };
  }, [tripId, trip, open]);
  if (!trip || !user) return null;
  const others = (people ?? []).filter((person) => person.id !== user.id && person.status !== "pending");
  const pending = (people ?? []).filter((person) => person.status === "pending").length;
  const label = !others.length
    ? translate(tripOwner ? "Shared trip" : "Travelling with friends? Invite them", language)
    : others.length === 1 ? formatMessage("You and {name}", { name: shownName(others[0], language) }, language)
      : formatMessage("You and {count} companions", { count: others.length }, language);
  const me: Traveler = { id: user.id, name: profile.name, username: profile.username, avatarPath: null };
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={translate("Trip companions", language)} onPress={() => setOpen(true)}
      style={({ pressed }) => [styles.strip, pressed && { opacity: 0.8 }]}>
      <View style={{ flexDirection: "row" }}>
        {avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.stripSelf} /> : <TravelerAvatar traveler={me} size={34} ring={p.white} />}
        {others.slice(0, 3).map((person) => <View key={person.id} style={{ marginLeft: -10 }}><TravelerAvatar traveler={person} size={34} ring={p.white} /></View>)}
        {others.length > 3 && <View style={[styles.more, { marginLeft: -10 }]}><Text style={styles.moreText}>+{others.length - 3}</Text></View>}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={styles.stripTitle}>{label}</Text>
        {!!pending && <Text style={styles.stripMeta}>{formatMessage(pending === 1 ? "1 invitation waiting" : "{count} invitations waiting", { count: pending }, language)}</Text>}
      </View>
      <View style={styles.addBubble}><Icon name={tripOwner ? "people" : "plus"} size={16} color={p.blue} /></View>
    </Pressable>
    <CompanionsSheet visible={open} onClose={() => setOpen(false)} />
  </>;
}

export function CompanionsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const language = useAppLanguage();
  const { trip } = useTravel();
  if (!trip) return null;
  // The panel mounts with each opening, so it always starts from a fresh list and an empty search.
  return <Sheet visible={visible} title={translate("Trip companions", language)} onClose={onClose}>
    {visible && <CompanionsPanel onClose={onClose} />}
  </Sheet>;
}

export function CompanionsPanel({ onClose }: { onClose: () => void }) {
  const styles = useStyles(stylesSheet);
  const s = useStyles(sharedSheet);
  const p = usePalette();
  const language = useAppLanguage();
  const { user } = useAuth();
  const { trip, tripId, tripOwner, tripPeople, plan, profile, setProfile, inviteCompanion, removeCompanion } = useTravel();
  const isOwner = !tripOwner;
  // The list the trip already loaded shows straight away, so the sheet does not wait on a spinner or grow
  // mid-animation; a fresh copy replaces it once it arrives.
  const [people, setPeople] = useState<TripCompanion[]>(tripPeople ?? []);
  const [loading, setLoading] = useState(!tripPeople);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ term: string; travelers: Traveler[] }>({ term: "", travelers: [] });
  const [busy, setBusy] = useState("");
  const [username, setUsername] = useState("");
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [error, setError] = useTimedMessage();
  const [limitHit, setLimitHit] = useState(false);
  const searchId = useRef(0);

  const reload = () => tripId ? loadTripCompanions(tripId).then(setPeople) : Promise.resolve();
  useEffect(() => {
    reload().catch(() => setError("Could not load companions. Try again.")).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  // Search as the traveller types, a moment after they pause; only the answer for the current text is shown.
  const term = query.trim().replace(/^@/, "");
  useEffect(() => {
    if (term.length < 2) return;
    const id = ++searchId.current;
    const timer = setTimeout(() => {
      searchTravelers(term).then((travelers) => { if (id === searchId.current) setFound({ term, travelers }); })
        .catch(() => { if (id === searchId.current) setFound({ term, travelers: [] }); });
    }, 280);
    return () => clearTimeout(timer);
  }, [term]);
  const searching = term.length >= 2 && found.term !== term;
  const results = term.length >= 2 && found.term === term ? found.travelers : [];

  if (!trip || !user) return null;
  const members = people.filter((person) => person.status !== "owner");
  const freeFull = isOwner && plan === "free" && members.length >= 1;
  const onTrip = new Set(people.map((person) => person.id));

  const invite = async (traveler: Traveler) => {
    setBusy(traveler.id); setError("");
    try {
      await inviteCompanion(traveler.id);
      await reload();
      setQuery("");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      if (/upgrade|one companion/i.test(message)) setLimitHit(true);
      else setError(message || "Could not send the invitation.");
    } finally { setBusy(""); }
  };
  const remove = async (memberId: string) => {
    setBusy(memberId); setError("");
    try {
      await removeCompanion(memberId);
      if (memberId === user.id) { onClose(); return; }
      await reload();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not update companions."); }
    finally { setBusy(""); }
  };
  const saveUsername = async () => {
    const value = username.trim().replace(/^@/, "");
    if (!/^[A-Za-z0-9_]{3,24}$/.test(value)) { setError("Use 3-24 letters, numbers or underscores."); return; }
    setBusy("username"); setError("");
    try { await setProfile({ username: value }); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save your username."); }
    finally { setBusy(""); }
  };
  const upgrade = () => { onClose(); router.push({ pathname: "/membership", params: { reason: "companions" } } as Href); };

  return <>
    <Copy muted>{isOwner
      ? "Everyone you add sees this trip and can edit the plan with you. When it ends, they get its visas too."
      : formatMessage("You are on {route}. Everyone here can edit the plan.", { route: routeTitle(trip, language) }, language)}</Copy>

    {loading ? <View style={styles.loading}><ActivityIndicator color={p.blue} /></View> : <View style={styles.group}>
      {people.map((person, index) => {
        const self = person.id === user.id;
        return <Row key={person.id} style={[styles.person, index > 0 && styles.divider]}>
          <TravelerAvatar traveler={person} size={42} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={styles.name}>{self ? translate("You", language) : shownName(person, language)}</Text>
            {!!person.username && <Text numberOfLines={1} style={styles.handle}>@{person.username}</Text>}
          </View>
          {person.status === "owner" && <View style={styles.badge}><Icon name="crown" size={11} color={p.orange} /><Text style={[styles.badgeText, { color: p.orange }]}>{translate("Organiser", language)}</Text></View>}
          {person.status === "pending" && <View style={[styles.badge, { backgroundColor: p.soft }]}><Text style={[styles.badgeText, { color: p.muted }]}>{translate("Invited", language)}</Text></View>}
          {isOwner && person.status !== "owner" && (busy === person.id ? <ActivityIndicator color={p.muted} /> :
            <Pressable accessibilityRole="button" accessibilityLabel={formatMessage("Remove {name}", { name: shownName(person, language) }, language)} hitSlop={8}
              onPress={() => void remove(person.id)} style={styles.remove}><Icon name="close" size={14} color={p.muted} /></Pressable>)}
        </Row>;
      })}
    </View>}

    {isOwner && (!profile.username ? <View style={styles.card}>
      <Row style={{ gap: 8 }}><Icon name="person" size={18} color={p.blue} /><Text style={styles.cardTitle}>{translate("Choose your @username", language)}</Text></Row>
      <Copy muted style={{ fontSize: 13 }}>Friends find you by it, and it shows on trips you share.</Copy>
      <Field placeholder="username" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} maxLength={25} />
      <Button busy={busy === "username"} onPress={() => void saveUsername()}>Save username</Button>
    </View> : freeFull || limitHit ? <Pressable accessibilityRole="button" onPress={upgrade} style={({ pressed }) => [styles.upsell, pressed && { opacity: 0.9 }]}>
      <View style={styles.upsellIcon}><Icon name="crown" size={20} color="#1B1405" /></View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={styles.upsellTitle}>{translate("Bring the whole group", language)}</Text>
        <Text style={styles.upsellBody}>{translate("Free trips include one companion. Premium adds as many as you like.", language)}</Text>
      </View>
      <Icon name="right" size={16} color="#F5D58A" />
    </Pressable> : <View style={{ gap: 10 }}>
      <View style={styles.search}>
        <Icon name="search" size={17} color={p.muted} />
        <TextInput value={query} onChangeText={setQuery} placeholder={translate("Search by @username or name", language)} placeholderTextColor={p.muted}
          autoCapitalize="none" autoCorrect={false} returnKeyType="search" style={styles.searchInput} accessibilityLabel={translate("Search travellers", language)} />
        {searching && <ActivityIndicator size="small" color={p.muted} />}
      </View>
      {term.length >= 2 && !searching && !results.length &&
        <Copy muted style={{ fontSize: 13, textAlign: "center" }}>No travellers with that name yet. Ask them to choose a username in Profile.</Copy>}
      <ScrollView style={{ maxHeight: 260 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
        {results.map((traveler) => {
          const added = onTrip.has(traveler.id);
          return <Row key={traveler.id} style={styles.person}>
            <TravelerAvatar traveler={traveler} size={40} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={styles.name}>{shownName(traveler, language)}</Text>
              {!!traveler.username && <Text numberOfLines={1} style={styles.handle}>@{traveler.username}</Text>}
            </View>
            <Pressable accessibilityRole="button" disabled={added || !!busy} onPress={() => void invite(traveler)}
              style={({ pressed }) => [styles.invite, added && { backgroundColor: p.soft }, pressed && { opacity: 0.8 }]}>
              {busy === traveler.id ? <ActivityIndicator size="small" color={p.onColor} />
                : <Text style={[styles.inviteText, added && { color: p.muted }]}>{translate(added ? "Added" : "Invite", language)}</Text>}
            </Pressable>
          </Row>;
        })}
      </ScrollView>
    </View>)}

    {!!error && <Copy style={s.error}>{error}</Copy>}
    {!isOwner && (confirmLeave
      ? <Button secondary busy={busy === user.id} onPress={() => void remove(user.id)}>Confirm leaving the trip</Button>
      : <Button secondary icon="logout" onPress={() => setConfirmLeave(true)}>Leave trip</Button>)}
  </>;
}

/** Invitations waiting for an answer, as boarding-pass style cards. */
export function TripInvites() {
  const styles = useStyles(stylesSheet);
  const p = usePalette();
  const language = useAppLanguage();
  const locale = language === "ro" ? "ro-RO" : "en-US";
  const { pendingInvites, answerInvite } = useTravel();
  const [busy, setBusy] = useState("");
  const [error, setError] = useTimedMessage();
  if (!pendingInvites.length) return null;
  const date = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "UTC" });
  const answer = async (tripId: string, accept: boolean) => {
    setBusy(`${tripId}:${accept}`); setError("");
    try {
      await answerInvite(tripId, accept);
      if (accept) router.push("/itinerary" as Href);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not answer the invitation."); }
    finally { setBusy(""); }
  };
  return <View style={{ gap: 10 }}>
    {pendingInvites.map((invite) => <View key={invite.tripId} style={styles.inviteCard}>
      <Row style={{ gap: 12 }}>
        <TravelerAvatar traveler={invite.owner} size={46} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={styles.inviteEyebrow}>{translate("Trip invitation", language)}</Text>
          <Text style={styles.inviteTitle}>{formatMessage("{name} invited you to {route}", { name: shownName(invite.owner, language), route: routeTitle(invite.trip, language) }, language)}</Text>
          <Text style={styles.handle}>{`${date(invite.trip.start)} – ${date(invite.trip.end)}${invite.companions ? ` · ${formatMessage(invite.companions === 1 ? "1 companion" : "{count} companions", { count: invite.companions }, language)}` : ""}`}</Text>
        </View>
      </Row>
      <Row style={{ gap: 9 }}>
        <Button secondary busy={busy === `${invite.tripId}:false`} disabled={!!busy} onPress={() => void answer(invite.tripId, false)} style={{ flex: 1 }}>Decline</Button>
        <Button icon="check" busy={busy === `${invite.tripId}:true`} disabled={!!busy} onPress={() => void answer(invite.tripId, true)} style={{ flex: 1 }}>Join trip</Button>
      </Row>
    </View>)}
    {!!error && <Copy style={{ color: p.danger, fontSize: 13 }}>{error}</Copy>}
  </View>;
}

/** Chips to move between the traveller's own trips and the trips they joined; hidden when there is only one. */
export function TripSwitcher() {
  const p = usePalette();
  const styles = useStyles(stylesSheet);
  const language = useAppLanguage();
  const { tripId, trips, sharedTrips, openTrip } = useTravel();
  const [busy, setBusy] = useState<string | null>(null);
  const options: { id: string; label: string; shared: boolean }[] = [
    ...trips.flatMap((item) => item.trip.id ? [{ id: item.trip.id, label: routeTitle(item.trip, language), shared: false }] : []),
    ...sharedTrips.filter((item) => item.status === "accepted")
      .map((item) => ({ id: item.tripId, label: `${routeTitle(item.trip, language)} · ${shownName(item.owner, language).split(" ")[0]}`, shared: true })),
  ];
  if (options.length < 2) return null;
  const choose = async (id: string) => {
    if (id === tripId) return;
    setBusy(id);
    try { await openTrip(id); } catch { /* The list refreshes itself when a trip is gone. */ } finally { setBusy(null); }
  };
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8 }}>
    {options.map((option) => {
      const selected = option.id === tripId;
      return <Pressable key={option.id} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => void choose(option.id)}
        style={({ pressed }) => [styles.switch, selected && { backgroundColor: p.ink, borderColor: p.ink }, pressed && { opacity: 0.8 }]}>
        {busy === option.id ? <ActivityIndicator size="small" color={selected ? p.canvas : p.muted} />
          : <Icon name={option.shared ? "people" : "trip"} size={14} color={selected ? p.canvas : p.muted} />}
        <Text numberOfLines={1} style={[styles.switchText, selected && { color: p.canvas }]}>{option.label}</Text>
      </Pressable>;
    })}
  </ScrollView>;
}

const stylesSheet = themedStyles((p) => ({
  strip: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 18, backgroundColor: p.white, borderWidth: 1, borderColor: p.line },
  stripSelf: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: p.white },
  stripTitle: { color: p.ink, fontSize: 14, fontWeight: "700" },
  stripMeta: { color: p.muted, fontSize: 12, marginTop: 2 },
  more: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: p.white, backgroundColor: p.soft, alignItems: "center", justifyContent: "center" },
  moreText: { color: p.ink, fontSize: 12, fontWeight: "800" },
  addBubble: { width: 34, height: 34, borderRadius: 17, backgroundColor: p.blueSoft, alignItems: "center", justifyContent: "center" },
  loading: { minHeight: 64, alignItems: "center", justifyContent: "center" },
  group: { borderRadius: 18, backgroundColor: p.white, borderWidth: 1, borderColor: p.line, paddingHorizontal: 12 },
  person: { gap: 12, paddingVertical: 10 },
  divider: { borderTopWidth: 1, borderTopColor: p.line },
  name: { color: p.ink, fontSize: 15, fontWeight: "700" },
  handle: { color: p.muted, fontSize: 12, marginTop: 1 },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: p.orangeSoft },
  badgeText: { fontSize: 11, fontWeight: "800" },
  card: { gap: 10, padding: 14, borderRadius: 18, backgroundColor: p.blueTint, borderWidth: 1, borderColor: p.blueLine },
  cardTitle: { color: p.ink, fontSize: 15, fontWeight: "800" },
  remove: { width: 28, height: 28, borderRadius: 14, backgroundColor: p.soft, alignItems: "center", justifyContent: "center" },
  upsell: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 18, backgroundColor: "#13213F", borderWidth: 1, borderColor: "#C9A24A" },
  upsellIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#E9C46A", alignItems: "center", justifyContent: "center" },
  upsellTitle: { color: "#F5D58A", fontSize: 15, fontWeight: "800" },
  upsellBody: { color: "rgba(255,255,255,0.78)", fontSize: 12, lineHeight: 17 },
  search: { flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 14, minHeight: 48, borderRadius: 16, backgroundColor: p.soft },
  searchInput: { flex: 1, color: p.ink, fontSize: 15, paddingVertical: 10 },
  invite: { minWidth: 78, height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: p.blue, alignItems: "center", justifyContent: "center" },
  inviteText: { color: p.onColor, fontSize: 13, fontWeight: "800" },
  inviteCard: { gap: 14, padding: 16, borderRadius: 22, backgroundColor: p.white, borderWidth: 1, borderColor: p.blueLine, borderStyle: "dashed" },
  inviteEyebrow: { color: p.blue, fontSize: 11, fontWeight: "800", letterSpacing: 0.8, textTransform: "uppercase" },
  inviteTitle: { color: p.ink, fontSize: 16, lineHeight: 21, fontWeight: "800" },
  switch: { flexDirection: "row", alignItems: "center", gap: 6, maxWidth: 240, paddingHorizontal: 13, height: 36, borderRadius: 18, borderWidth: 1, borderColor: p.line, backgroundColor: p.white },
  switchText: { color: p.ink, fontSize: 13, fontWeight: "700", flexShrink: 1 },
}));
