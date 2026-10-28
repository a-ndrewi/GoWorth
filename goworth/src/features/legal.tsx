import { router, useLocalSearchParams, type Href } from "expo-router";
import { useState } from "react";
import { Linking, Platform, Share, View } from "react-native";
import { Button, Copy, Field, Header, Heading, ListGroup, ListRow, Screen, Sheet, sharedSheet } from "@/components/goworth/ui";
import { usePalette, useStyles } from "@/state/theme-context";
import { legalDocuments, legalIdentity, legalIdentityPending, type LegalDocumentId } from "@/data/legal";
import { legalDocumentsRo } from "@/data/legal-ro";
import { useAppLanguage } from "@/data/formatting";
import { translate } from "@/data/i18n";
import { useAuth } from "@/state/auth-context";
import { useTravel } from "@/state/travel-context";
import { useTimedMessage } from "@/hooks/use-timed-message";

export function LegalScreen() {
  const s = useStyles(sharedSheet);
  const language = useAppLanguage();
  const { user, deleteAccount } = useAuth();
  const {
    profile, preferences, saved, savedPlaces, externalPlaces, trip, activities, expenses,
    journal, journalEntries, plan,
  } = useTravel();
  const [confirming, setConfirming] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useTimedMessage();

  const exportData = async () => {
    if (!user) return;
    setError("");
    const data = JSON.stringify({
      exportedAt: new Date().toISOString(),
      account: { id: user.id, email: user.email, profile },
      preferences, savedDestinations: saved, savedPlaces, externalPlaces,
      currentTrip: trip ? { trip, activities, expenses, note: journal } : null,
      pastTrips: journalEntries,
      personalNote: trip ? null : journal,
    }, null, 2);
    try {
      if (Platform.OS === "web" && typeof document !== "undefined") {
        const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = "goworth-data.json";
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        await Share.share({ title: "GoWorth data export", message: data });
      }
    } catch {
      setError("Could not export your data on this device.");
    }
  };
  const removeAccount = async () => {
    if (confirmation !== "DELETE") return;
    setBusy(true);
    setError("");
    try {
      await deleteAccount();
      setConfirming(false);
      router.replace("/welcome" as Href);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete your account.");
    } finally { setBusy(false); }
  };

  // The legal documents themselves are listed under Information in Profile.
  return <Screen style={{ gap: 20 }}>
    <Header title="Your data" />
    {user ? <>
      <ListGroup footer="The export is a JSON file with your profile, preferences, saved places and trips.">
        <ListRow icon="share" label="Export my data" chevron={false} onPress={() => void exportData()} />
      </ListGroup>
      <ListGroup footer="All account data, including saved items and trip history, will be permanently deleted. This cannot be undone.">
        <ListRow icon="trash" label="Delete account" destructive chevron={false} onPress={() => { setError(""); setConfirmation(""); setConfirming(true); }} />
      </ListGroup>
    </> : <Copy muted>Sign in to export data or delete your account.</Copy>}
    {!!error && !confirming && <Copy style={s.error}>{error}</Copy>}
    <View style={{ gap: 4, paddingHorizontal: 6 }}>
      <Copy muted style={{ fontSize: 12 }}>Contact: {translate(legalIdentity.contact, language)}</Copy>
    </View>
    <Sheet visible={confirming} title="Delete your account?" onClose={() => setConfirming(false)}>
      <Copy>All account data, including saved items and trip history, will be permanently deleted. This cannot be undone.</Copy>
      {plan !== "free" && <Copy muted style={{ fontSize: 12, lineHeight: 18 }}>Remaining Premium time and Lifetime access end when the account is deleted.</Copy>}
      <Field label="Type DELETE to confirm" value={confirmation} onChangeText={setConfirmation} autoCapitalize="characters" />
      {!!error && <Copy style={s.error}>{error}</Copy>}
      <Button disabled={confirmation !== "DELETE"} busy={busy} onPress={() => void removeAccount()}>Delete account permanently</Button>
      <Button secondary onPress={() => setConfirming(false)}>Cancel</Button>
    </Sheet>
  </Screen>;
}

export function LegalDocumentScreen() {
  const p = usePalette();
  const language = useAppLanguage();
  const { type, photoName, photoArtist, photoLicense, photoPageUrl, photoLicenseUrl } = useLocalSearchParams<{ type?: string; photoName?: string; photoArtist?: string; photoLicense?: string; photoPageUrl?: string; photoLicenseUrl?: string }>();
  const id = type && Object.prototype.hasOwnProperty.call(legalDocuments, type) ? type as LegalDocumentId : "privacy";
  const document = (language === "ro" ? legalDocumentsRo : legalDocuments)[id];
  const validPhotoSource = photoPageUrl?.startsWith("https://commons.wikimedia.org/wiki/File:");
  const validLicenseUrl = photoLicenseUrl?.startsWith("https://creativecommons.org/licenses/") || photoLicenseUrl?.startsWith("https://creativecommons.org/publicdomain/") || photoLicenseUrl === photoPageUrl;
  return <Screen style={{ gap: 20 }}>
    <Header title={document.title} />
    {legalIdentityPending && (id === "privacy" || id === "terms")
      ? <Copy style={{ color: p.danger, fontSize: 12, fontWeight: "600" }}>{document.updated} · {translate("Operator details pending", language)}</Copy>
      : <Copy muted style={{ fontSize: 12 }}>{document.updated}</Copy>}
    {id === "credits" && validPhotoSource && <View style={{ gap: 8 }}>
      <Heading style={{ fontSize: 18, lineHeight: 24 }}>{photoName}</Heading>
      <Copy>{photoArtist} · {photoLicense}</Copy>
      <Button secondary icon="globe" onPress={() => { if (photoPageUrl) void Linking.openURL(photoPageUrl); }}>{translate("Photo source", language)}</Button>
      {validLicenseUrl && photoLicenseUrl !== photoPageUrl && <Button secondary icon="book" onPress={() => { if (photoLicenseUrl) void Linking.openURL(photoLicenseUrl); }}>{translate("Photo license", language)}</Button>}
    </View>}
    {id === "credits" && <View style={{ gap: 8 }}>
      <Button secondary icon="globe" onPress={() => void Linking.openURL("https://www.geonames.org/")}>GeoNames</Button>
      <Button secondary icon="book" onPress={() => void Linking.openURL("https://creativecommons.org/licenses/by/4.0/")}>CC BY 4.0</Button>
      <Button secondary icon="map" onPress={() => void Linking.openURL("https://www.openstreetmap.org/copyright")}>OpenStreetMap</Button>
      <Button secondary icon="camera" onPress={() => void Linking.openURL("https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia")}>Wikimedia Commons</Button>
    </View>}
    {document.sections.map((section) => <View key={section.title} style={{ gap: 7 }}>
      <Heading style={{ fontSize: 18, lineHeight: 24 }}>{section.title}</Heading>
      <Copy style={{ lineHeight: 23 }}>{section.body}</Copy>
    </View>)}
  </Screen>;
}
