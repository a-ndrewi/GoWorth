import { router, useLocalSearchParams, type Href } from "expo-router";
import { useState } from "react";
import { Platform, Pressable, Share, View } from "react-native";
import { Button, Copy, Field, Header, Heading, Icon, Screen, Sheet, s, type IconName } from "@/components/goworth/ui";
import { palette as p } from "@/constants/design";
import { legalDocuments, legalIdentity, type LegalDocumentId } from "@/data/legal";
import { useAuth } from "@/state/auth-context";
import { useTravel } from "@/state/travel-context";

const documents: { id: LegalDocumentId; icon: IconName }[] = [
  { id: "privacy", icon: "lock" },
  { id: "terms", icon: "book" },
  { id: "subscriptions", icon: "wallet" },
  { id: "credits", icon: "map" },
];

export function LegalScreen() {
  const { user, deleteAccount } = useAuth();
  const {
    profile, preferences, saved, savedPlaces, trip, activities, expenses,
    journal, journalEntries,
  } = useTravel();
  const [confirming, setConfirming] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const exportData = async () => {
    if (!user) return;
    setError("");
    const data = JSON.stringify({
      exportedAt: new Date().toISOString(),
      account: { id: user.id, email: user.email, profile },
      preferences, savedDestinations: saved, savedPlaces,
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

  return <Screen style={{ gap: 20 }}>
    <Header title="Legal & privacy" />
    <View style={{ gap: 2 }}>
      {documents.map(({ id, icon }) => <Pressable
        key={id}
        accessibilityRole="button"
        onPress={() => router.push({ pathname: "/legal-document", params: { type: id } } as Href)}
        style={[s.row, { minHeight: 56, gap: 13, borderBottomWidth: 1, borderColor: p.line }]}
      >
        <Icon name={icon} color={p.blue} size={20} />
        <Copy style={{ flex: 1, fontWeight: "600" }}>{legalDocuments[id].title}</Copy>
        <Icon name="right" color={p.muted} size={18} />
      </Pressable>)}
    </View>
    <View style={{ gap: 12, borderTopWidth: 1, borderColor: p.line, paddingTop: 18 }}>
      <Heading style={{ fontSize: 19, lineHeight: 25 }}>Your data</Heading>
      {user ? <>
        <Button secondary icon="share" onPress={() => void exportData()}>Export my data</Button>
        <Button secondary icon="logout" onPress={() => { setError(""); setConfirmation(""); setConfirming(true); }}>Delete account</Button>
      </> : <Copy muted>Sign in to export data or delete your account.</Copy>}
      {!!error && !confirming && <Copy style={s.error}>{error}</Copy>}
    </View>
    <View style={{ gap: 4, borderTopWidth: 1, borderColor: p.line, paddingTop: 18 }}>
      <Copy muted style={{ fontSize: 12 }}>Operator: {legalIdentity.operator}</Copy>
      <Copy muted style={{ fontSize: 12 }}>Contact: {legalIdentity.contact}</Copy>
    </View>
    <Sheet visible={confirming} title="Delete your account?" onClose={() => setConfirming(false)}>
      <Copy>All account data, including saved items and trip history, will be permanently deleted. This cannot be undone.</Copy>
      <Field label="Type DELETE to confirm" value={confirmation} onChangeText={setConfirmation} autoCapitalize="characters" />
      {!!error && <Copy style={s.error}>{error}</Copy>}
      <Button disabled={confirmation !== "DELETE"} busy={busy} onPress={() => void removeAccount()}>Delete account permanently</Button>
      <Button secondary onPress={() => setConfirming(false)}>Cancel</Button>
    </Sheet>
  </Screen>;
}

export function LegalDocumentScreen() {
  const { type } = useLocalSearchParams<{ type?: string }>();
  const id = type && Object.prototype.hasOwnProperty.call(legalDocuments, type) ? type as LegalDocumentId : "privacy";
  const document = legalDocuments[id];
  return <Screen style={{ gap: 20 }}>
    <Header title={document.title} />
    <Copy style={{ color: p.danger, fontSize: 12, fontWeight: "600" }}>{document.updated} · Operator details pending</Copy>
    {document.sections.map((section) => <View key={section.title} style={{ gap: 7 }}>
      <Heading style={{ fontSize: 18, lineHeight: 24 }}>{section.title}</Heading>
      <Copy style={{ lineHeight: 23 }}>{section.body}</Copy>
    </View>)}
  </Screen>;
}
