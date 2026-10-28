import { router, type Href } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Button, Header, Icon, Row, Screen } from "@/components/goworth/ui";
import { LinearGradient } from "expo-linear-gradient";
import { PremiumWheel, wheelColors, type PremiumWheelHandle } from "@/components/goworth/premium-wheel";
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
    title: "Premium", current: "Current plan", trip: "Trips", places: "Saved places",
    free: "Free", premium: "Premium", lifetime: "Lifetime",
    freeStatus: "1 trip and 5 new saved places each calendar month. Limits reset on the 1st.",
    premiumStatus: "Unlimited trips and saves until", lifetimeStatus: "Unlimited trips and saves, for as long as your account exists.",
    wheel: "Daily Premium wheel", wheelIntro: "One free spin every 24 hours. Premium is never sold, so there is nothing to pay.",
    spin: "Spin the wheel", spinning: "Spinning…", nextSpin: "Next spin in", loading: "Loading the wheel…",
    lifetimeNoSpin: "You already have Lifetime, so there is nothing more to win.",
    signIn: "Sign in to spin the wheel.",
    wonLifetime: "Jackpot! Lifetime Premium is now active on your account.",
    wonMonth: "You won 1 month of Premium. Unlimited access is active until",
    wonNone: "No prize this time. Come back in 24 hours for another spin.",
    labelLifetime: "Lifetime", labelMonth: "1 month", labelNone: "Tomorrow",
    oddsToggle: "Odds & rules", odds: "Odds per spin", oddsMonth: "Premium for 1 month", oddsLifetime: "Lifetime Premium", oddsNone: "No prize",
    oneIn: "1 in", oddsNote: "All slices are drawn the same size; only the odds above decide the result. A month won while Premium is active is added after its end date. Apple and Google do not sponsor and are not involved in this wheel.",
    rules: "Premium & wheel rules", terms: "Terms", privacy: "Privacy",
  },
  ro: {
    title: "Premium", current: "Planul actual", trip: "Călătorii", places: "Locuri salvate",
    free: "Gratuit", premium: "Premium", lifetime: "Pe viață",
    freeStatus: "1 călătorie și 5 locuri noi salvate în fiecare lună calendaristică. Limitele se resetează pe 1.",
    premiumStatus: "Călătorii și salvări nelimitate până la", lifetimeStatus: "Călătorii și salvări nelimitate, cât timp există contul tău.",
    wheel: "Roata Premium zilnică", wheelIntro: "O rotire gratuită la fiecare 24 de ore. Premium nu se vinde, deci nu ai nimic de plătit.",
    spin: "Învârte roata", spinning: "Se învârte…", nextSpin: "Următoarea rotire în", loading: "Se încarcă roata…",
    lifetimeNoSpin: "Ai deja Pe viață, deci nu mai ai ce câștiga.",
    signIn: "Conectează-te ca să învârți roata.",
    wonLifetime: "Marele premiu! Premium Pe viață este acum activ în contul tău.",
    wonMonth: "Ai câștigat o lună de Premium. Accesul nelimitat este activ până la",
    wonNone: "Fără premiu de data asta. Revino peste 24 de ore pentru o nouă rotire.",
    labelLifetime: "Pe viață", labelMonth: "1 lună", labelNone: "Mâine",
    oddsToggle: "Șanse și reguli", odds: "Șanse la fiecare rotire", oddsMonth: "Premium pentru o lună", oddsLifetime: "Premium Pe viață", oddsNone: "Fără premiu",
    oneIn: "1 din", oddsNote: "Toate feliile au aceeași mărime; doar șansele de mai sus decid rezultatul. O lună câștigată cât Premium este activ se adaugă după data de expirare. Apple și Google nu sponsorizează și nu sunt implicate în această roată.",
    rules: "Regulile Premium și ale roții", terms: "Termeni", privacy: "Confidențialitate",
  },
} as const;

function Usage({ label, used, limit }: { label: string; used: number; limit: number }) {
  const styles = useStyles(stylesSheet);
  return <View style={{ gap: 6 }}>
    <Row style={{ justifyContent: "space-between", gap: 8 }}>
      <Text numberOfLines={1} style={styles.usageLabel}>{label}</Text>
      <Text style={styles.usageCount}>{Math.min(used, limit)}/{limit}</Text>
    </Row>
    <View style={styles.track}><View style={[styles.fill, { width: `${Math.min(used / limit, 1) * 100}%` }]} /></View>
  </View>;
}

function Note({ color, children }: { color?: string; children: string }) {
  const styles = useStyles(stylesSheet);
  const p = usePalette();
  return <Text accessibilityLiveRegion="polite" style={[styles.note, { color: color ?? p.muted }]}>{children}</Text>;
}

export function MembershipScreen() {
  const styles = useStyles(stylesSheet);
  const p = usePalette();
  const language = useAppLanguage();
  const t = wording[language];
  const locale = language === "ro" ? "ro-RO" : "en-US";
  const { width } = useWindowDimensions();
  const { user } = useAuth();
  const { plan, monthlyUsage, refreshMembership } = useTravel();
  const wheel = useRef<PremiumWheelHandle>(null);
  const [validUntil, setValidUntil] = useState<string | null>(null);
  const [status, setStatus] = useState<{ nextSpinAt: string | null; clockOffsetMs: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<WheelResult | null>(null);
  const [oddsOpen, setOddsOpen] = useState(false);
  const [error, setError] = useTimedMessage();

  const load = useCallback(async () => {
    try {
      const [membership, wheelStatus] = await Promise.all([refreshMembership(), loadWheelStatus()]);
      return () => { setError(""); setValidUntil(membership.validUntil); setStatus(wheelStatus); };
    } catch (caught) {
      return () => setError(caught instanceof Error ? caught.message : t.loading);
    }
  }, [refreshMembership, t.loading, setError]);

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
        void refreshMembership().then((membership) => setValidUntil(membership.validUntil)).catch(() => undefined);
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
  const planName = plan === "free" ? t.free : plan === "premium" ? t.premium : t.lifetime;
  const planStatus = plan === "lifetime" ? t.lifetimeStatus : plan === "premium" ? `${t.premiumStatus} ${date(validUntil)}.` : t.freeStatus;
  const labels: Record<WheelPrize, string> = { lifetime: t.labelLifetime, premium_month: t.labelMonth, none: t.labelNone };
  const resultText = result?.prize === "lifetime" ? t.wonLifetime : result?.prize === "premium_month" ? `${t.wonMonth} ${date(result.validUntil)}.` : result ? t.wonNone : "";
  const wheelSize = Math.min(320, width - 64);

  return <Screen active="profile" style={{ gap: 18 }}>
    <Header title={t.title} />
    <View style={[styles.current, plan !== "free" && styles.currentPaid]}>
      <Text style={[styles.label, plan !== "free" && { color: "rgba(255,255,255,0.75)" }]}>{t.current.toUpperCase()}</Text>
      <Row style={{ gap: 8 }}>
        {plan !== "free" && <Icon name="crown" size={20} color="#FFD27A" />}
        <Text style={[styles.currentPlan, plan !== "free" && { color: p.onColor }]}>{planName}</Text>
      </Row>
      <Text style={[styles.currentStatus, plan !== "free" && { color: "rgba(255,255,255,0.85)" }]}>{planStatus}</Text>
      {plan === "free" && <View style={{ gap: 12, marginTop: 8 }}>
        <Usage label={t.trip} used={monthlyUsage.trip} limit={1} />
        <Usage label={t.places} used={monthlyUsage.place} limit={5} />
      </View>}
    </View>

    <View style={styles.wheelCard}>
      <LinearGradient colors={["#1A2C5C", wheelColors.night, "#070C1E"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={{ gap: 6, alignItems: "center" }}>
        <Row style={styles.wheelBadge}>
          <Icon name="crown" size={13} color={wheelColors.gold} />
          <Text style={styles.wheelBadgeText}>{t.premium.toUpperCase()}</Text>
        </Row>
        <Text style={styles.section}>{t.wheel}</Text>
        <Text style={styles.body}>{t.wheelIntro}</Text>
      </View>
      {plan === "lifetime" ? <Note color={wheelColors.goldLight}>{t.lifetimeNoSpin}</Note> : !user ? <Note color={wheelColors.goldLight}>{t.signIn}</Note> : <>
        <View style={{ alignItems: "center", paddingVertical: 6 }}><PremiumWheel ref={wheel} size={wheelSize} labels={labels} /></View>
        {!!resultText && <Note color={result?.prize === "none" ? "rgba(255,255,255,0.85)" : wheelColors.goldLight}>{resultText}</Note>}
        <Button icon={remaining > 0 ? undefined : "sparkle"} disabled={!status || remaining > 0 || spinning} busy={!status && !error}
          onPress={() => void spin()} style={remaining > 0 ? styles.spinWaiting : styles.spinButton}>
          {spinning ? t.spinning : remaining > 0 ? `${t.nextSpin} ${wheelCountdown(remaining)}` : status ? t.spin : t.loading}
        </Button>
      </>}
      {!!error && <Note color="#FF8A95">{error}</Note>}
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: oddsOpen }} hitSlop={8} onPress={() => setOddsOpen((open) => !open)}
        style={({ pressed }) => [styles.oddsToggle, pressed && { opacity: 0.6 }]}>
        <Icon name="info" size={14} color="rgba(255,255,255,0.55)" />
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
      {(["premium", "terms", "privacy"] as const).map((document) => <Pressable key={document} accessibilityRole="link" hitSlop={8} onPress={() => router.push({ pathname: "/legal-document", params: { type: document } } as Href)}>
        <Text style={styles.link}>{document === "premium" ? t.rules : document === "terms" ? t.terms : t.privacy}</Text>
      </Pressable>)}
    </Row>
  </Screen>;
}

const stylesSheet = themedStyles((p) => ({
  current: { gap: 4, padding: 18, borderRadius: 24, borderWidth: 1, borderColor: p.line, backgroundColor: p.white },
  currentPaid: { backgroundColor: p.blue, borderColor: p.blue },
  label: { color: p.muted, fontSize: 11, fontWeight: "800", letterSpacing: 0.8 },
  currentPlan: { color: p.ink, fontSize: 24, lineHeight: 30, fontWeight: "800" },
  currentStatus: { color: p.muted, fontSize: 13, lineHeight: 19, fontWeight: "600" },
  usageLabel: { flexShrink: 1, color: p.ink, fontSize: 13, fontWeight: "600" },
  usageCount: { color: p.ink, fontSize: 13, fontWeight: "700" },
  track: { height: 4, borderRadius: 2, overflow: "hidden", backgroundColor: p.line },
  fill: { height: 4, borderRadius: 2, backgroundColor: p.blue },
  wheelCard: {
    gap: 16, padding: 20, borderRadius: 28, borderWidth: 1, borderColor: "rgba(245,196,81,0.45)", overflow: "hidden",
    backgroundColor: wheelColors.night,
  },
  wheelBadge: {
    gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
    borderWidth: 1, borderColor: "rgba(245,196,81,0.5)", backgroundColor: "rgba(245,196,81,0.12)",
  },
  wheelBadgeText: { color: wheelColors.gold, fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
  section: { color: "#FFFFFF", fontSize: 22, lineHeight: 28, fontWeight: "800", textAlign: "center", letterSpacing: -0.3 },
  body: { color: "rgba(255,255,255,0.7)", fontSize: 13, lineHeight: 19, textAlign: "center" },
  spinButton: { backgroundColor: wheelColors.royal, borderWidth: 1, borderColor: wheelColors.gold },
  spinWaiting: { backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(245,196,81,0.35)" },
  oddsToggle: { flexDirection: "row", alignItems: "center", alignSelf: "center", gap: 6, paddingVertical: 2 },
  oddsToggleText: { color: "rgba(255,255,255,0.55)", fontSize: 12, fontWeight: "600" },
  odds: { gap: 10, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", backgroundColor: "rgba(255,255,255,0.05)" },
  oddsTitle: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  oddsLabel: { flex: 1, color: "rgba(255,255,255,0.8)", fontSize: 13, fontWeight: "600" },
  oddsValue: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  oddsHint: { color: "rgba(255,255,255,0.55)", fontWeight: "600" },
  oddsNote: { color: "rgba(255,255,255,0.55)", fontSize: 12, lineHeight: 18 },
  note: { fontSize: 13, lineHeight: 19, textAlign: "center", fontWeight: "600" },
  link: { color: p.blue, fontSize: 12, fontWeight: "600" },
}));
