import { router, useLocalSearchParams, type Href } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Keyboard, Pressable, Share, Text, TextInput, View } from "react-native";
import { Button, Copy, Header, Icon, Row, Screen, sharedSheet } from "@/components/goworth/ui";
import { themedStyles } from "@/constants/design";
import { storeLinks } from "@/constants/links";
import { formatMessage, translate } from "@/data/i18n";
import { useAppLanguage } from "@/data/formatting";
import { useTimedMessage } from "@/hooks/use-timed-message";
import { cleanReferralCode, loadReferral, redeemReferral, referralCodePattern, type ReferralStatus } from "@/lib/referral";
import { usePalette, useStyles } from "@/state/theme-context";
import { useTravel } from "@/state/travel-context";

const longDate = (value: string, language: "en" | "ro") =>
  new Date(value).toLocaleDateString(language === "ro" ? "ro-RO" : "en-US", { day: "numeric", month: "long", year: "numeric" });

/** The message friends receive when the code is shared. */
export function referralMessage(code: string, language: "en" | "ro") {
  const invite = formatMessage("Join me on GoWorth! Enter my code {code} when you sign up and we both win 1 month of Premium.", { code }, language);
  const downloads = [
    storeLinks.appStore && `${translate("App Store (iPhone):", language)} ${storeLinks.appStore}`,
    `${translate("Google Play (Android):", language)} ${storeLinks.googlePlay}`,
  ].filter(Boolean);
  return `${invite}\n\n${translate("Download the app:", language)}\n${downloads.join("\n")}`;
}

/** Your invite code to share, the friends who joined with it, and a friend's code to enter while the account is new. */
export function ReferralScreen() {
  const styles = useStyles(stylesSheet);
  const s = useStyles(sharedSheet);
  const p = usePalette();
  const language = useAppLanguage();
  const { cloudReady, offlineSince, refreshMembership } = useTravel();
  const { code: linkCode } = useLocalSearchParams<{ code?: string }>();
  const [status, setStatus] = useState<ReferralStatus | null>(null);
  const [loadError, setLoadError] = useState("");
  const [entry, setEntry] = useState(() => cleanReferralCode(linkCode ?? ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useTimedMessage();
  const [won, setWon] = useState<string | null>(null);

  const load = useCallback(() => {
    loadReferral().then((value) => { setLoadError(""); setStatus(value); }).catch((caught: unknown) => setLoadError(caught instanceof Error ? caught.message : "Could not load your invite code right now."));
  }, []);
  useEffect(() => { if (cloudReady && !offlineSince) load(); }, [cloudReady, offlineSince, load]);

  const share = () => {
    if (!status?.code) return;
    void Share.share({ message: referralMessage(status.code, language) }).catch(() => undefined);
  };

  const redeem = async () => {
    Keyboard.dismiss();
    const code = cleanReferralCode(entry);
    if (!referralCodePattern.test(code)) { setError(translate("Enter the 6-character code your friend shared.", language)); return; }
    setBusy(true);
    setError("");
    try {
      const result = await redeemReferral(code);
      setWon(result.validUntil);
      setEntry("");
      await refreshMembership().catch(() => undefined);
      load();
    } catch (caught) {
      setError(translate(caught instanceof Error ? caught.message : "Could not use this invite code.", language));
    } finally { setBusy(false); }
  };

  return <Screen active="profile" style={{ gap: 18 }}>
    <Header title={translate("Invite friends", language)} onBack={() => router.canGoBack() ? router.back() : router.replace("/profile" as Href)} />

    <View style={styles.pass}>
      <View style={styles.passTop}>
        <View style={styles.passChip}>
          <Icon name="crown" size={13} color={p.orange} />
          <Text style={styles.passChipText}>{translate("Premium", language)}</Text>
        </View>
        <Text style={styles.heroTitle}>{translate("Win 1 month of Premium, together", language)}</Text>
        <Text style={styles.heroBody}>{translate("Share your code. When a friend signs up with it, you both get a month of Premium. It adds to any Premium you already have, bought or won on the wheel.", language)}</Text>
      </View>

      <View style={styles.perforation}>
        <View style={[styles.notch, styles.notchLeft]} />
        <View style={styles.dash} />
        <View style={[styles.notch, styles.notchRight]} />
      </View>

      <View style={styles.stub}>
        <Text style={styles.stubLabel}>{translate("Your code", language)}</Text>
        <View style={styles.codeBox}>
          {status ? <Text selectable accessibilityLabel={formatMessage("Your code: {code}", { code: status.code.split("").join(" ") }, language)} style={styles.code}>{status.code}</Text>
            : loadError ? <Text style={styles.codeError}>{translate(loadError, language)}</Text>
              : <ActivityIndicator color={p.muted} />}
        </View>
        {status ? <Pressable accessibilityRole="button" onPress={share} style={({ pressed }) => [styles.shareButton, pressed && { opacity: 0.85 }]}>
          <Icon name="share" size={18} color={p.white} />
          <Text style={styles.shareText}>{translate("Share your code", language)}</Text>
        </Pressable> : !!loadError && <Pressable accessibilityRole="button" onPress={load} style={({ pressed }) => [styles.shareButton, pressed && { opacity: 0.85 }]}>
          <Icon name="refresh" size={18} color={p.white} />
          <Text style={styles.shareText}>{translate("Try again", language)}</Text>
        </Pressable>}
      </View>
    </View>

    {status && <Row style={{ gap: 10 }}>
      <View style={styles.stat}>
        <Text style={styles.statValue}>{status.friends}</Text>
        <Copy muted style={{ fontSize: 12, fontWeight: "700" }}>{status.friends === 1 ? "friend joined" : "friends joined"}</Copy>
      </View>
      <View style={styles.stat}>
        <Text style={styles.statValue}>{status.monthsEarned}</Text>
        <Copy muted style={{ fontSize: 12, fontWeight: "700" }}>{status.monthsEarned === 1 ? "month earned" : "months earned"}</Copy>
      </View>
    </Row>}

    {!!won && <View style={styles.wonCard} accessibilityLiveRegion="polite">
      <Icon name="check" size={20} color={p.green} />
      <Copy style={{ flex: 1, fontSize: 14, fontWeight: "600" }}>{formatMessage("You both won a month of Premium. Yours is active until {date}.", { date: longDate(won, language) }, language)}</Copy>
    </View>}

    {status?.redeemUntil && !won && <View style={styles.redeemCard}>
      <Text style={styles.redeemTitle}>{translate("Got a code from a friend?", language)}</Text>
      <Copy muted style={{ fontSize: 13 }}>{formatMessage("New accounts can enter one until {date}.", { date: longDate(status.redeemUntil, language) }, language)}</Copy>
      <Row style={{ gap: 8 }}>
        <TextInput accessibilityLabel={translate("Friend's invite code", language)} value={entry} onChangeText={(value) => setEntry(cleanReferralCode(value))}
          autoCapitalize="characters" autoCorrect={false} maxLength={8} placeholder="ABC234" placeholderTextColor={p.muted}
          style={[s.input, styles.entry]} onSubmitEditing={() => void redeem()} returnKeyType="done" />
        <Button busy={busy} disabled={entry.length < 6} onPress={() => void redeem()} style={{ paddingHorizontal: 18 }}>Use code</Button>
      </Row>
      {!!error && <Copy style={s.error}>{error}</Copy>}
    </View>}

    <View style={{ gap: 12 }}>
      <Text style={styles.howTitle}>{translate("How it works", language)}</Text>
      {[
        ["share", "Send your code to a friend who is not on GoWorth yet."],
        ["person", "They enter it when they create their account, or within 14 days."],
        ["crown", "You each get 1 month of Premium, added after any Premium you have."],
      ].map(([icon, line], index) => <Row key={line} style={{ gap: 12, alignItems: "flex-start" }}>
        <View style={styles.step}><Text style={styles.stepText}>{index + 1}</Text></View>
        <Copy style={{ flex: 1, fontSize: 14, paddingTop: 4 }}>{line}</Copy>
      </Row>)}
      <Copy muted style={{ fontSize: 12 }}>You can earn up to 12 months a year by inviting friends. Your friends always get their month. Lifetime accounts have nothing to add, but their friends still win.</Copy>
    </View>
  </Screen>;
}

const stylesSheet = themedStyles((p) => ({
  pass: { borderRadius: 22, borderWidth: 1, borderColor: p.line, backgroundColor: p.white },
  passTop: { gap: 8, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 18 },
  passChip: { flexDirection: "row", alignSelf: "flex-start", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: p.orangeSoft },
  passChipText: { color: p.ink, fontSize: 12, fontWeight: "700" },
  heroTitle: { color: p.ink, fontSize: 21, lineHeight: 27, fontWeight: "800" },
  heroBody: { color: p.muted, fontSize: 14, lineHeight: 20 },
  perforation: { height: 20, flexDirection: "row", alignItems: "center" },
  notch: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: p.line, backgroundColor: p.canvas },
  notchLeft: { marginLeft: -10 },
  notchRight: { marginRight: -10 },
  dash: { flex: 1, marginHorizontal: 6, borderTopWidth: 1.5, borderStyle: "dashed", borderColor: p.line },
  stub: { gap: 12, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 20 },
  stubLabel: { color: p.muted, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase" },
  codeBox: { minHeight: 44, justifyContent: "center" },
  code: { color: p.ink, fontSize: 34, fontWeight: "800", letterSpacing: 7, fontVariant: ["tabular-nums"] },
  codeError: { color: p.muted, fontSize: 13 },
  shareButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 14, backgroundColor: p.ink },
  shareText: { color: p.white, fontSize: 15, fontWeight: "800" },
  stat: { flex: 1, gap: 2, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: p.line, backgroundColor: p.white },
  statValue: { color: p.ink, fontSize: 26, fontWeight: "800" },
  wonCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 16, backgroundColor: p.greenSoft },
  redeemCard: { gap: 10, padding: 16, borderRadius: 20, borderWidth: 1, borderColor: p.blueLine, backgroundColor: p.blueTint },
  redeemTitle: { color: p.ink, fontSize: 16, fontWeight: "800" },
  entry: { flex: 1, fontSize: 18, fontWeight: "800", letterSpacing: 3 },
  howTitle: { color: p.ink, fontSize: 18, fontWeight: "800" },
  step: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: p.blueSoft },
  stepText: { color: p.blue, fontSize: 13, fontWeight: "800" },
}));
