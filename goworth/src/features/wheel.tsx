import { router, type Href } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Button, Header, Icon, Row, Screen } from "@/components/goworth/ui";
import { PremiumWheel, premiumTone, usePremiumTone, wheelColors, type PremiumWheelHandle } from "@/components/goworth/premium-wheel";
import { themedStyles } from "@/constants/design";
import { usePalette, useStyles } from "@/state/theme-context";
import { useAppLanguage } from "@/data/formatting";
import { loadWheelStatus, spinWheel, type WheelResult } from "@/lib/wheel";
import { requestNotificationPermission, syncWheelReminders } from "@/lib/notifications";
import { wheelCountdown, wheelOdds, wheelRemainingMs, type WheelPrize } from "@/lib/wheel-odds";
import { useAuth } from "@/state/auth-context";
import { useTravel } from "@/state/travel-context";
import { useTimedMessage } from "@/hooks/use-timed-message";

const wording = {
  en: {
    title: "Daily wheel", premium: "Premium",
    wheel: "Daily Premium wheel", wheelIntro: "One free spin every 24 hours, with or without a subscription. Spinning never costs anything.",
    spin: "Spin the wheel", spinning: "Spinning…", nextSpin: "Next spin in", loading: "Loading the wheel…",
    signIn: "Sign in to spin the wheel.",
    wonLifetime: "Jackpot! Lifetime Premium is now active on your account.",
    wonMonth: "You won 1 month of Premium. Unlimited access is active until",
    wonNone: "No prize this time. Come back in 24 hours for another spin.",
    hasLifetime: "You already have Lifetime Premium, so there is nothing left to win.",
    labelLifetime: "Lifetime", labelMonth: "1 month", labelNone: "Tomorrow",
    oddsToggle: "Odds & rules", odds: "Odds per spin", oddsMonth: "Premium for 1 month", oddsLifetime: "Lifetime Premium", oddsNone: "No prize",
    oneIn: "1 in", oddsNote: "All slices are drawn the same size; only the odds above decide the result. A month won while Premium is active is added after its end date. Apple and Google do not sponsor and are not involved in this wheel.",
    plans: "See Premium plans", rules: "Premium & wheel rules",
  },
  ro: {
    title: "Roata zilnică", premium: "Premium",
    wheel: "Roata Premium zilnică", wheelIntro: "O rotire gratuită la fiecare 24 de ore, cu sau fără abonament. Rotirea nu costă niciodată nimic.",
    spin: "Învârte roata", spinning: "Se învârte…", nextSpin: "Următoarea rotire în", loading: "Se încarcă roata…",
    signIn: "Conectează-te ca să învârți roata.",
    wonLifetime: "Marele premiu! Premium Pe viață este acum activ în contul tău.",
    wonMonth: "Ai câștigat o lună de Premium. Accesul nelimitat este activ până la",
    wonNone: "Fără premiu de data asta. Revino peste 24 de ore pentru o nouă rotire.",
    hasLifetime: "Ai deja Premium Pe viață, așa că nu mai ai nimic de câștigat.",
    labelLifetime: "Pe viață", labelMonth: "1 lună", labelNone: "Mâine",
    oddsToggle: "Șanse și reguli", odds: "Șanse la fiecare rotire", oddsMonth: "Premium pentru o lună", oddsLifetime: "Premium Pe viață", oddsNone: "Fără premiu",
    oneIn: "1 din", oddsNote: "Toate feliile au aceeași mărime; doar șansele de mai sus decid rezultatul. O lună câștigată cât Premium este activ se adaugă după data de expirare. Apple și Google nu sponsorizează și nu sunt implicate în această roată.",
    plans: "Vezi planurile Premium", rules: "Regulile Premium și ale roții",
  },
} as const;

function Note({ color, children }: { color?: string; children: string }) {
  const styles = useStyles(stylesSheet);
  const p = usePalette();
  return <Text accessibilityLiveRegion="polite" style={[styles.note, { color: color ?? p.muted }]}>{children}</Text>;
}

export function WheelScreen() {
  const styles = useStyles(stylesSheet);
  const language = useAppLanguage();
  const t = wording[language];
  const locale = language === "ro" ? "ro-RO" : "en-US";
  const { width } = useWindowDimensions();
  const tone = usePremiumTone();
  const { user } = useAuth();
  const { plan, refreshMembership } = useTravel();
  const wheel = useRef<PremiumWheelHandle>(null);
  const [status, setStatus] = useState<{ nextSpinAt: string | null; clockOffsetMs: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<WheelResult | null>(null);
  const [oddsOpen, setOddsOpen] = useState(false);
  const [error, setError] = useTimedMessage();

  const load = useCallback(async () => {
    try {
      const wheelStatus = await loadWheelStatus();
      return () => { setError(""); setStatus(wheelStatus); };
    } catch (caught) {
      return () => setError(caught instanceof Error ? caught.message : t.loading);
    }
  }, [t.loading, setError]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    void load().then((apply) => { if (active) apply(); });
    return () => { active = false; };
  }, [user, load]);

  const remaining = status ? wheelRemainingMs(status.nextSpinAt, status.clockOffsetMs, now) : 0;
  useEffect(() => {
    if (!remaining) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [remaining]);

  const spin = async () => {
    if (!user || spinning || !status || remaining > 0 || plan === "lifetime") return;
    setSpinning(true);
    setResult(null);
    setError("");
    try {
      const outcome = await spinWheel();
      wheel.current?.spinTo(outcome.prize, () => {
        setResult(outcome);
        setStatus({ nextSpinAt: outcome.nextSpinAt, clockOffsetMs: outcome.clockOffsetMs });
        setNow(Date.now());
        setSpinning(false);
        // The account is upgraded by the spin itself; this brings the rest of the app up to date.
        void refreshMembership().catch(() => undefined);
        // Right after a spin is when a "your next spin is ready" reminder makes sense, so this is where it is first asked for.
        if (outcome.prize !== "lifetime") void requestNotificationPermission().then(() => syncWheelReminders(outcome, language));
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t.loading);
      setSpinning(false);
      void load().then((apply) => apply());
    }
  };

  const date = (value: string | null) => value ? new Date(value).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" }) : "";
  const percent = (value: number) => `${(value * 100).toLocaleString(locale, { maximumFractionDigits: 2 })}%`;
  const oneIn = (value: number) => `${t.oneIn} ${Math.round(1 / value).toLocaleString(locale)}`;
  const labels: Record<WheelPrize, string> = { lifetime: t.labelLifetime, premium_month: t.labelMonth, none: t.labelNone };
  const resultText = result?.prize === "lifetime" ? t.wonLifetime : result?.prize === "premium_month" ? `${t.wonMonth} ${date(result.validUntil)}.` : result ? t.wonNone : "";
  const wheelSize = Math.min(320, width - 64);
  // Lifetime, won or bought, leaves nothing to win; a jackpot just won stays on screen until they leave.
  const nothingToWin = plan === "lifetime" && result?.prize !== "lifetime";

  return <Screen active="profile" style={{ gap: 18 }}>
    <Header title={t.title} />
    <View style={styles.wheelCard}>
      <LinearGradient colors={tone.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={{ gap: 6, alignItems: "center" }}>
        <Row style={styles.wheelBadge}>
          <Icon name="crown" size={13} color={tone.accent} />
          <Text style={styles.wheelBadgeText}>{t.premium.toUpperCase()}</Text>
        </Row>
        <Text style={styles.section}>{t.wheel}</Text>
        <Text style={styles.body}>{t.wheelIntro}</Text>
      </View>
      {nothingToWin ? <Note color={tone.accentText}>{t.hasLifetime}</Note> : !user ? <Note color={tone.accentText}>{t.signIn}</Note> : <>
        <View style={{ alignItems: "center", paddingVertical: 6 }}><PremiumWheel ref={wheel} size={wheelSize} labels={labels} /></View>
        {!!resultText && <Note color={result?.prize === "none" ? tone.strong : tone.accentText}>{resultText}</Note>}
        {plan !== "lifetime" && <Button secondary={remaining > 0} icon={remaining > 0 ? undefined : "sparkle"} disabled={!status || remaining > 0 || spinning} busy={!status && !error}
          onPress={() => void spin()} style={remaining > 0 ? styles.spinWaiting : styles.spinButton}>
          {spinning ? t.spinning : remaining > 0 ? `${t.nextSpin} ${wheelCountdown(remaining)}` : status ? t.spin : t.loading}
        </Button>}
      </>}
      {!!error && <Note color={tone.error}>{error}</Note>}
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: oddsOpen }} hitSlop={8} onPress={() => setOddsOpen((open) => !open)}
        style={({ pressed }) => [styles.oddsToggle, pressed && { opacity: 0.6 }]}>
        <Icon name="info" size={14} color={tone.muted} />
        <Text style={styles.oddsToggleText}>{t.oddsToggle}</Text>
      </Pressable>
      {oddsOpen && <View style={styles.odds}>
        <Text style={styles.oddsTitle}>{t.odds}</Text>
        {([[t.oddsMonth, wheelOdds.premiumMonth], [t.oddsLifetime, wheelOdds.lifetime]] as const).map(([label, value]) =>
          <Row key={label} style={{ justifyContent: "space-between", gap: 12 }}>
            <Text style={styles.oddsLabel}>{label}</Text>
            <Text style={styles.oddsValue}>{percent(value)} <Text style={styles.oddsHint}>({oneIn(value)})</Text></Text>
          </Row>)}
        <Row style={{ justifyContent: "space-between", gap: 12 }}>
          <Text style={styles.oddsLabel}>{t.oddsNone}</Text>
          <Text style={styles.oddsValue}>{percent(1 - wheelOdds.premiumMonth - wheelOdds.lifetime)}</Text>
        </Row>
        <Text style={styles.oddsNote}>{t.oddsNote}</Text>
      </View>}
    </View>

    <Row style={{ gap: 16, flexWrap: "wrap", justifyContent: "center", paddingBottom: 6 }}>
      {plan !== "lifetime" && <Pressable accessibilityRole="link" hitSlop={8} onPress={() => router.push("/membership" as Href)}>
        <Text style={styles.link}>{t.plans}</Text>
      </Pressable>}
      <Pressable accessibilityRole="link" hitSlop={8} onPress={() => router.push({ pathname: "/legal-document", params: { type: "premium" } } as Href)}>
        <Text style={styles.link}>{t.rules}</Text>
      </Pressable>
    </Row>
  </Screen>;
}

const stylesSheet = themedStyles((p) => {
  const c = premiumTone(p);
  return {
  wheelCard: { gap: 16, padding: 20, borderRadius: 28, borderWidth: 1, borderColor: c.border, overflow: "hidden" },
  wheelBadge: { gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: c.chipBorder, backgroundColor: c.chipBg },
  wheelBadgeText: { color: c.accentText, fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
  section: { color: c.title, fontSize: 22, lineHeight: 28, fontWeight: "800", textAlign: "center", letterSpacing: -0.3 },
  body: { color: c.body, fontSize: 13, lineHeight: 19, textAlign: "center" },
  spinButton: { backgroundColor: wheelColors.royal, borderWidth: 1, borderColor: wheelColors.gold },
  spinWaiting: { backgroundColor: c.waiting, borderWidth: 1, borderColor: c.waitingBorder },
  oddsToggle: { flexDirection: "row", alignItems: "center", alignSelf: "center", gap: 6, paddingVertical: 2 },
  oddsToggleText: { color: c.muted, fontSize: 12, fontWeight: "600" },
  odds: { gap: 10, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: c.surfaceBorder, backgroundColor: c.surface },
  oddsTitle: { color: c.title, fontSize: 14, fontWeight: "800" },
  oddsLabel: { flex: 1, color: c.strong, fontSize: 13, fontWeight: "600" },
  oddsValue: { color: c.title, fontSize: 13, fontWeight: "800" },
  oddsHint: { color: c.muted, fontWeight: "600" },
  oddsNote: { color: c.muted, fontSize: 12, lineHeight: 18 },
  note: { fontSize: 13, lineHeight: 19, textAlign: "center", fontWeight: "600" },
  link: { color: p.blue, fontSize: 12, fontWeight: "600" },
  };
});
