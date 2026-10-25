import Constants from "expo-constants";
import { router, type Href } from "expo-router";
import { useState } from "react";
import { Keyboard, Platform, Pressable, View } from "react-native";
import { Button, Chip, Copy, Field, Header, Heading, Icon, Row, Screen, sharedSheet } from "@/components/goworth/ui";
import { usePalette, useStyles } from "@/state/theme-context";
import { useAuth } from "@/state/auth-context";
import { useTravel } from "@/state/travel-context";
import { useAppLanguage } from "@/data/formatting";
import { translate } from "@/data/i18n";
import { sendSupportMessage, type SupportTopic } from "@/lib/travel-repository";

const topics: { id: SupportTopic; label: string }[] = [
  { id: "bug", label: "Something is broken" },
  { id: "account", label: "My account" },
  { id: "billing", label: "Membership & billing" },
  { id: "feedback", label: "Feedback or idea" },
  { id: "other", label: "Other" },
];

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SupportScreen() {
  const s = useStyles(sharedSheet);
  const p = usePalette();
  const language = useAppLanguage();
  const { user } = useAuth();
  const { profile } = useTravel();
  const [topic, setTopic] = useState<SupportTopic | null>(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState(user?.email ?? "");
  const [includeDevice, setIncludeDevice] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const device = `${Platform.OS} ${String(Platform.Version ?? "")} · GoWorth ${Constants.expoConfig?.version || "1.0.0"} · ${language}`.trim();

  const submit = async () => {
    Keyboard.dismiss();
    setError("");
    if (!topic) return setError(translate("Choose what your message is about.", language));
    if (subject.trim().length < 3) return setError(translate("Add a short subject.", language));
    if (message.trim().length < 10) return setError(translate("Tell us a bit more (at least 10 characters).", language));
    if (!emailPattern.test(email.trim())) return setError(translate("Enter an email address we can reply to.", language));
    setBusy(true);
    try {
      await sendSupportMessage({ topic, subject: subject.trim(), message: message.trim(), email: email.trim(), name: profile.name, device: includeDevice ? device : "" });
      setSent(true);
    } catch (caught) {
      setError(caught instanceof Error ? translate(caught.message, language) : translate("Your message could not be sent. Please try again later.", language));
    } finally { setBusy(false); }
  };

  if (sent) return <Screen active="profile" style={{ gap: 18 }}>
    <Header title="Contact support" />
    <View style={{ alignItems: "center", gap: 12, paddingVertical: 30 }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", backgroundColor: p.greenSoft }}><Icon name="check" size={30} color={p.green} /></View>
      <Heading style={{ fontSize: 22, textAlign: "center" }}>Message sent</Heading>
      <Copy muted style={{ textAlign: "center" }}>{`${translate("Thanks for writing to us. We will reply to", language)} ${email.trim()}.`}</Copy>
    </View>
    <Button onPress={() => router.canGoBack() ? router.back() : router.replace("/profile" as Href)}>Back to profile</Button>
    <Button secondary onPress={() => { setSent(false); setTopic(null); setSubject(""); setMessage(""); }}>Send another message</Button>
  </Screen>;

  return <Screen active="profile" style={{ gap: 16 }}>
    <Header title="Contact support" subtitle={translate("We usually reply within two working days.", language)} />
    <View style={{ gap: 8 }}>
      <Copy style={s.label}>What can we help with?</Copy>
      <Row style={{ flexWrap: "wrap", gap: 7 }}>
        {topics.map((item) => <Chip key={item.id} selected={topic === item.id} onPress={() => setTopic(item.id)}>{translate(item.label, language)}</Chip>)}
      </Row>
    </View>
    <Field label="Subject" value={subject} onChangeText={setSubject} maxLength={120} placeholder="A few words about the issue" returnKeyType="next" />
    <View style={{ gap: 4 }}>
      <Field label="Message" value={message} onChangeText={setMessage} multiline maxLength={4000} placeholder="What happened? What did you expect? Steps to reproduce help us a lot."
        style={{ minHeight: 160, textAlignVertical: "top", paddingTop: 12 }} />
      <Copy muted style={{ fontSize: 11, textAlign: "right" }}>{`${message.length}/4000`}</Copy>
    </View>
    <Field label="Reply to" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" maxLength={254} placeholder="you@example.com" />
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: includeDevice }} onPress={() => setIncludeDevice((value) => !value)}
      style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 }, pressed && { opacity: 0.7 }]}>
      <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: includeDevice ? p.blue : p.line, backgroundColor: includeDevice ? p.blue : "transparent", alignItems: "center", justifyContent: "center" }}>
        {includeDevice && <Icon name="tick" size={13} color={p.onColor} />}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Copy style={{ fontSize: 14, fontWeight: "600" }}>Include device details</Copy>
        <Copy muted style={{ fontSize: 12 }}>{device}</Copy>
      </View>
    </Pressable>
    {!!error && <Copy style={s.error}>{error}</Copy>}
    <Button icon="mail" busy={busy} onPress={() => void submit()}>Send message</Button>
  </Screen>;
}
