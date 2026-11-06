import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Copy, Field, Heading, Icon } from "@/components/goworth/ui";
import { cleanUsername, UsernameField, usernamePattern, useUsernameStatus } from "@/components/goworth/username-field";
import { themedStyles } from "@/constants/design";
import { useAuth } from "@/state/auth-context";
import { usePalette, useStyles } from "@/state/theme-context";
import { useTravel } from "@/state/travel-context";
import { useTimedMessage } from "@/hooks/use-timed-message";

// The same rule the profile function applies to names.
const namePattern = /^[\p{L}\p{M}][\p{L}\p{M}\p{N} .'-]{0,49}$/u;

/**
 * Every account needs a username so friends can find it and invite it on trips. A new account picked one at
 * sign-up and it is saved here on the first launch; an older account, or one whose name was taken meanwhile,
 * chooses it on this screen, which cannot be skipped.
 */
export function UsernameGate() {
  const { user } = useAuth();
  const { cloudReady, offlineSince, profile } = useTravel();
  // Mounted only once the account has loaded, so the form starts from the real profile.
  return user && cloudReady && !offlineSince && !profile.username ? <UsernameForm /> : null;
}

function UsernameForm() {
  const styles = useStyles(stylesSheet);
  const p = usePalette();
  const { user, signOut } = useAuth();
  const { profile, setProfile } = useTravel();
  const chosen = typeof user?.user_metadata?.goworth_username === "string" ? cleanUsername(user.user_metadata.goworth_username) : "";
  const [name, setName] = useState(profile.name);
  // Name is asked only when the account has none that passes the rule. Decided once, so the field does not vanish
  // while it is being typed into.
  const [askName] = useState(() => !namePattern.test(profile.name.trim()));
  const [username, setUsername] = useState(chosen);
  const status = useUsernameStatus(username);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useTimedMessage();
  // The username from sign-up is saved without asking again; the form only appears if that does not work.
  const [autoSave, setAutoSave] = useState<"pending" | "done">(chosen ? "pending" : "done");
  const tried = useRef(false);

  useEffect(() => {
    if (autoSave !== "pending" || tried.current) return;
    tried.current = true;
    const autoName = namePattern.test(profile.name.trim()) ? profile.name.trim() : "";
    if (!autoName || !usernamePattern.test(chosen)) { void Promise.resolve().then(() => setAutoSave("done")); return; }
    setProfile({ name: autoName, username: chosen }).catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : "Could not save your username.");
    }).finally(() => setAutoSave("done"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSave, chosen]);

  if (autoSave === "pending") return <View style={[StyleSheet.absoluteFill, styles.backdrop]} />;

  const save = async () => {
    const value = cleanUsername(username);
    if (!namePattern.test(name.trim())) { setError("Enter your name as friends know you, starting with a letter."); return; }
    if (!usernamePattern.test(value)) { setError("Use 3-24 letters, numbers or underscores."); return; }
    if (status === "taken") { setError("Username is already taken."); return; }
    setSaving(true); setError("");
    try { await setProfile({ name: name.trim(), username: value }); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save your username."); }
    finally { setSaving(false); }
  };

  return <View style={[StyleSheet.absoluteFill, styles.backdrop]}>
    <SafeAreaView style={{ flex: 1 }}>
      <View style={styles.body}>
        <View style={styles.badge}><Icon name="person" size={28} color={p.blue} /></View>
        <View style={{ gap: 8 }}>
          <Heading>Choose your username</Heading>
          <Copy muted>Friends find you by it to invite you on their trips. It is unique, and you can change it later in Profile.</Copy>
        </View>
        {askName && <Field label="Name" placeholder="Your name" value={name} onChangeText={setName} maxLength={50} autoComplete="name" textContentType="name" containerStyle={{ flex: 0 }} />}
        <UsernameField value={username} onChangeText={setUsername} status={status} />
        {!!error && <Copy style={{ color: p.danger, fontSize: 13 }}>{error}</Copy>}
        <Button busy={saving} disabled={status === "taken" || status === "invalid" || status === "empty"} onPress={() => void save()}>Continue</Button>
        <Button secondary onPress={() => void signOut()}>Sign out</Button>
      </View>
    </SafeAreaView>
  </View>;
}

const stylesSheet = themedStyles((p) => ({
  backdrop: { backgroundColor: p.canvas, zIndex: 50 },
  body: { flex: 1, justifyContent: "center", gap: 18, paddingHorizontal: 24, maxWidth: 520, width: "100%", alignSelf: "center" },
  badge: { width: 60, height: 60, borderRadius: 30, backgroundColor: p.blueSoft, alignItems: "center", justifyContent: "center" },
}));
