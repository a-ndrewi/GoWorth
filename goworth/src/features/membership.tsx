import { router, useLocalSearchParams, type Href } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Button, Header, Icon, Row, Screen } from "@/components/goworth/ui";
import { LinearGradient } from "expo-linear-gradient";
import { isPaywallReason, PremiumPlans } from "@/components/goworth/premium-plans";
import { useVisas } from "@/state/visas-context";
import { freeAllowance } from "@/lib/plan-offer";
import { PremiumWheel, premiumTone, premiumTones, usePremiumTone, wheelColors, type PremiumWheelHandle } from "@/components/goworth/premium-wheel";
import { palettes, themedStyles } from "@/constants/design";
import { usePalette, useStyles } from "@/state/theme-context";
import { useAppLanguage } from "@/data/formatting";
import { loadWheelStatus, spinWheel, type Membership, type WheelResult } from "@/lib/wheel";
import { requestNotificationPermission, syncPremiumEnding, syncWheelReminders } from "@/lib/notifications";
import { wheelCountdown, wheelOdds, wheelRemainingMs, type WheelPrize } from "@/lib/wheel-odds";
import { useAuth } from "@/state/auth-context";
import { useTravel } from "@/state/travel-context";
import { useTimedMessage } from "@/hooks/use-timed-message";

const wording = {
  en: {
    title: "Premium", current: "Current plan", trip: "Trips", places: "Saved places",
    free: "Free", premium: "Premium", lifetime: "Lifetime",
    pass: "GoWorth pass", member: "Member", validUntil: "Valid until", explorer: "Explorer", unlimited: "Unlimited", noExpiry: "No expiry",
    freeStatus: "1 trip and 5 new saved places each calendar month. Limits reset on the 1st.",
    premiumStatus: "Unlimited trips and saves until", lifetimeStatus: "Unlimited trips and saves, for as long as your account exists.",
    wheel: "Daily Premium wheel", wheelIntro: "One free spin every 24 hours, with or without a subscription. Spinning never costs anything.",
    spin: "Spin the wheel", spinning: "Spinning…", nextSpin: "Next spin in", loading: "Loading the wheel…",
    signIn: "Sign in to spin the wheel.",
    wonLifetime: "Jackpot! Lifetime Premium is now active on your account.",
    wonMonth: "You won 1 month of Premium. Unlimited access is active until",
    wonNone: "No prize this time. Come back in 24 hours for another spin.",
    labelLifetime: "Lifetime", labelMonth: "1 month", labelNone: "Tomorrow",
    oddsToggle: "Odds & rules", odds: "Odds per spin", oddsMonth: "Premium for 1 month", oddsLifetime: "Lifetime Premium", oddsNone: "No prize",
    oneIn: "1 in", oddsNote: "All slices are drawn the same size; only the odds above decide the result. A month won while Premium is active is added after its end date. Apple and Google do not sponsor and are not involved in this wheel.",
    rules: "Premium & wheel rules", terms: "Terms", privacy: "Privacy",
    wonEnds: "Your won Premium ends in {days} days", wonEndsTomorrow: "Your won Premium ends tomorrow",
    wonKeep: "Pick a plan before then to keep everything you use now:", keepVisas: "Your passport and its {count} visas",
    keepPassport: "Your passport, open for every visa you earn", keepCompanions: "Unlimited companions on shared trips", keepTrips: "Several trips side by side, unlimited saves and offline access",
  },
  ro: {
    title: "Premium", current: "Planul actual", trip: "Călătorii", places: "Locuri salvate",
    free: "Gratuit", premium: "Premium", lifetime: "Pe viață",
    pass: "Permis GoWorth", member: "Membru", validUntil: "Valabilitate", explorer: "Explorator", unlimited: "Nelimitat", noExpiry: "Fără expirare",
    freeStatus: "1 călătorie și 5 locuri noi salvate în fiecare lună calendaristică. Limitele se resetează pe 1.",
    premiumStatus: "Călătorii și salvări nelimitate până la", lifetimeStatus: "Călătorii și salvări nelimitate, cât timp există contul tău.",
    wheel: "Roata Premium zilnică", wheelIntro: "O rotire gratuită la fiecare 24 de ore, cu sau fără abonament. Rotirea nu costă niciodată nimic.",
    spin: "Învârte roata", spinning: "Se învârte…", nextSpin: "Următoarea rotire în", loading: "Se încarcă roata…",
    signIn: "Conectează-te ca să învârți roata.",
    wonLifetime: "Marele premiu! Premium Pe viață este acum activ în contul tău.",
    wonMonth: "Ai câștigat o lună de Premium. Accesul nelimitat este activ până la",
    wonNone: "Fără premiu de data asta. Revino peste 24 de ore pentru o nouă rotire.",
    labelLifetime: "Pe viață", labelMonth: "1 lună", labelNone: "Mâine",
    oddsToggle: "Șanse și reguli", odds: "Șanse la fiecare rotire", oddsMonth: "Premium pentru o lună", oddsLifetime: "Premium Pe viață", oddsNone: "Fără premiu",
    oneIn: "1 din", oddsNote: "Toate feliile au aceeași mărime; doar șansele de mai sus decid rezultatul. O lună câștigată cât Premium este activ se adaugă după data de expirare. Apple și Google nu sponsorizează și nu sunt implicate în această roată.",
    rules: "Regulile Premium și ale roții", terms: "Termeni", privacy: "Confidențialitate",
    wonEnds: "Premium-ul câștigat expiră în {days} zile", wonEndsTomorrow: "Premium-ul câștigat expiră mâine",
    wonKeep: "Alege un plan până atunci ca să păstrezi tot ce folosești acum:", keepVisas: "Pașaportul tău și cele {count} vize",
    keepPassport: "Pașaportul tău, deschis pentru fiecare viză câștigată", keepCompanions: "Însoțitori nelimitați în călătoriile comune", keepTrips: "Mai multe călătorii în paralel, salvări nelimitate și acces offline",
  },
} as const;

const passFont = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

/** A member number for the card, read from the account id: stable for the account and meaning nothing else. */
export function memberNumber(id: string | undefined) {
  const digits = (id ?? "").replace(/[^0-9a-f]/gi, "").slice(0, 12).toUpperCase().padEnd(12, "0");
  return `GW ${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8, 12)}`;
}

/**
 * The plan as a membership card, like an airline's: cream stock for Free with the month's allowance, navy with gold
 * for Premium and Lifetime, the holder's name set like embossed letters.
 */
function PassCard({ plan, name, memberId, validUntil, locale, used, t }: {
  plan: "free" | "premium" | "lifetime"; name: string; memberId?: string; validUntil: string | null; locale: string;
  used: { trip: number; place: number }; t: (typeof wording)[keyof typeof wording];
}) {
  const styles = useStyles(stylesSheet);
  const p = usePalette();
  const tone = usePremiumTone();
  const dark = tone === premiumTones.dark;
  const paid = plan !== "free";
  // Paid is night-blue and gold in the dark theme, warm gold card stock in the light one; Free is cream or slate.
  const c = paid
    ? dark ? { ink: wheelColors.goldLight, muted: "rgba(255,231,163,0.62)", accent: wheelColors.gold, track: "rgba(245,196,81,0.22)", chip: wheelColors.gold }
      : { ink: tone.title, muted: tone.body, accent: tone.accentText, track: tone.chipBg, chip: wheelColors.gold }
    : dark ? { ink: p.ink, muted: p.muted, accent: p.blue, track: p.line, chip: "#3A4660" }
    : { ink: "#132238", muted: "#5B6B85", accent: "#2457E6", track: "#E4EAF6", chip: "#C9D3E8" };
  const className = plan === "free" ? t.explorer : plan === "premium" ? t.premium : t.lifetime;
  const field = (label: string, value: string, fill?: number) => <View style={{ flex: 1, gap: 3 }}>
    <Text style={[styles.passLabel, { color: c.muted }]}>{label.toUpperCase()}</Text>
    <Text numberOfLines={1} style={[styles.passValue, { color: c.ink }]}>{value}</Text>
    {fill !== undefined && <View style={[styles.track, { backgroundColor: c.track }]}><View style={[styles.fill, { backgroundColor: c.accent, width: `${Math.min(fill, 1) * 100}%` }]} /></View>}
  </View>;
  return <View style={[styles.pass, paid ? styles.passPaid : styles.passFree]}>
    {paid && <LinearGradient colors={tone.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />}
    <Row style={{ justifyContent: "space-between" }}>
      <Row style={{ gap: 6 }}>
        <Icon name="plane" size={15} color={c.accent} />
        <Text style={[styles.passBrand, { color: c.accent }]}>{t.pass.toUpperCase()}</Text>
      </Row>
      <Row style={[styles.passTier, { borderColor: c.accent }]}>
        {paid && <Icon name="crown" size={12} color={c.accent} />}
        <Text style={[styles.passTierText, { color: c.accent }]}>{className.toUpperCase()}</Text>
      </Row>
    </Row>
    <View style={{ gap: 2 }}>
      {/* The card's chip: gold for paid plans, steel for Free. */}
      <View style={[styles.chip, { backgroundColor: c.chip }]}>
        <View style={[styles.chipLine, { top: 8 }]} /><View style={[styles.chipLine, { top: 16 }]} /><View style={styles.chipMiddle} />
      </View>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.passName, { color: c.ink }]}>{name.toUpperCase()}</Text>
      <Text style={[styles.passNumber, { color: c.muted }]}>{t.member.toUpperCase()} · {memberNumber(memberId)}</Text>
    </View>
    <Row style={{ gap: 14, alignItems: "flex-start" }}>
      {field(t.validUntil, plan === "lifetime" ? t.noExpiry : plan === "premium" && validUntil
        ? new Date(validUntil).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" }) : "—")}
      {field(t.trip, paid ? t.unlimited : `${Math.min(used.trip, freeAllowance.trip)}/${freeAllowance.trip}`, paid ? undefined : used.trip / freeAllowance.trip)}
      {field(t.places, paid ? t.unlimited : `${Math.min(used.place, freeAllowance.place)}/${freeAllowance.place}`, paid ? undefined : used.place / freeAllowance.place)}
    </Row>
  </View>;
}

function Note({ color, children }: { color?: string; children: string }) {
  const styles = useStyles(stylesSheet);
  const p = usePalette();
  return <Text accessibilityLiveRegion="polite" style={[styles.note, { color: color ?? p.muted }]}>{children}</Text>;
}

export function MembershipScreen() {
  const styles = useStyles(stylesSheet);
  const language = useAppLanguage();
  const t = wording[language];
  const locale = language === "ro" ? "ro-RO" : "en-US";
  const { width } = useWindowDimensions();
  const tone = usePremiumTone();
  const { user } = useAuth();
  const { plan, monthlyUsage, refreshMembership, profile } = useTravel();
  const { reason } = useLocalSearchParams<{ reason?: string }>();
  const { visas } = useVisas();
  const wheel = useRef<PremiumWheelHandle>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const validUntil = membership?.validUntil ?? null;
  const [status, setStatus] = useState<{ nextSpinAt: string | null; clockOffsetMs: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<WheelResult | null>(null);
  const [oddsOpen, setOddsOpen] = useState(false);
  const [error, setError] = useTimedMessage();

  const load = useCallback(async () => {
    try {
      const [membership, wheelStatus] = await Promise.all([refreshMembership(), loadWheelStatus()]);
      return () => { setError(""); setMembership(membership); setStatus(wheelStatus); };
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

  // A month won on the wheel runs out on its own; remind the traveller before it does. A bought plan renews, so it gets none.
  const wonUntil = plan === "premium" && membership && !membership.storeProduct ? validUntil : null;
  useEffect(() => {
    if (membership) void syncPremiumEnding(wonUntil, language).catch(() => undefined);
  }, [membership, wonUntil, language]);
  const wonDaysLeft = wonUntil ? Math.max(0, Math.ceil((Date.parse(wonUntil) - Date.now()) / 86_400_000)) : 0;

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
        void refreshMembership().then(setMembership).catch(() => undefined);
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
    <View style={{ gap: 8 }}>
      <PassCard plan={plan} name={profile.name} memberId={user?.id} validUntil={validUntil} locale={locale} used={monthlyUsage} t={t} />
      <Text accessibilityLabel={`${t.current}: ${planName}. ${planStatus}`} style={styles.currentStatus}>{planStatus}</Text>
    </View>

    {!!wonUntil && <View style={styles.endingCard}>
      <Row style={{ gap: 10 }}>
        <View style={styles.endingIcon}><Icon name="crown" size={18} color={wheelColors.goldInk} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.endingTitle}>{(wonDaysLeft === 1 ? t.wonEndsTomorrow : t.wonEnds).replace("{days}", String(wonDaysLeft))}</Text>
          <Text style={styles.endingBody}>{t.wonKeep}</Text>
        </View>
      </Row>
      {[visas.length ? t.keepVisas.replace("{count}", String(visas.length)) : t.keepPassport, t.keepCompanions, t.keepTrips].map((line) =>
        <Row key={line} style={{ gap: 8 }}><Icon name="check" size={13} color={tone.accent} /><Text style={styles.endingLine}>{line}</Text></Row>)}
    </View>}

    {plan !== "lifetime" && <PremiumPlans signedIn={!!user} storeProduct={membership?.storeProduct} willRenew={membership?.willRenew}
      reason={isPaywallReason(reason) ? reason : undefined} onPurchased={() => refreshMembership().then(setMembership)} />}

    {/* Lifetime, won or bought, leaves nothing to win, so those accounts never see the wheel; a jackpot just won stays on screen until they leave. */}
    {(plan !== "lifetime" || result?.prize === "lifetime") && <View style={styles.wheelCard}>
      <LinearGradient colors={tone.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={{ gap: 6, alignItems: "center" }}>
        <Row style={styles.wheelBadge}>
          <Icon name="crown" size={13} color={tone.accent} />
          <Text style={styles.wheelBadgeText}>{t.premium.toUpperCase()}</Text>
        </Row>
        <Text style={styles.section}>{t.wheel}</Text>
        <Text style={styles.body}>{t.wheelIntro}</Text>
      </View>
      {!user ? <Note color={tone.accentText}>{t.signIn}</Note> : <>
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
    </View>}

    <Row style={{ gap: 16, flexWrap: "wrap", justifyContent: "center", paddingBottom: 6 }}>
      {(["premium", "terms", "privacy"] as const).map((document) => <Pressable key={document} accessibilityRole="link" hitSlop={8} onPress={() => router.push({ pathname: "/legal-document", params: { type: document } } as Href)}>
        <Text style={styles.link}>{document === "premium" ? t.rules : document === "terms" ? t.terms : t.privacy}</Text>
      </Pressable>)}
    </Row>
  </Screen>;
}

const stylesSheet = themedStyles((p) => {
  const c = premiumTone(p);
  return {
  endingCard: { gap: 9, padding: 16, borderRadius: 22, backgroundColor: p === palettes.dark ? "#13213F" : c.offer, borderWidth: 1, borderColor: p === palettes.dark ? wheelColors.gold : c.offerBorder },
  endingIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: wheelColors.gold, alignItems: "center", justifyContent: "center" },
  endingTitle: { color: c.accentText, fontSize: 16, fontWeight: "800" },
  endingBody: { color: c.body, fontSize: 12.5, lineHeight: 18, marginTop: 2 },
  endingLine: { color: c.strong, fontSize: 13.5, fontWeight: "600", flex: 1 },
  // Loyalty-card proportions.
  pass: { aspectRatio: 1.62, padding: 18, borderRadius: 22, overflow: "hidden", justifyContent: "space-between", borderWidth: 1 },
  passFree: { backgroundColor: p === palettes.dark ? "#161E2D" : "#FFFBF0", borderColor: p.line },
  passPaid: { backgroundColor: c.gradient[1], borderColor: c.border },
  chip: { width: 36, height: 26, borderRadius: 6, marginBottom: 8, overflow: "hidden", opacity: 0.9 },
  chipLine: { position: "absolute", left: 0, right: 0, height: 1, backgroundColor: "rgba(0,0,0,0.25)" },
  chipMiddle: { position: "absolute", top: 0, bottom: 0, left: 13, width: 10, borderLeftWidth: 1, borderRightWidth: 1, borderColor: "rgba(0,0,0,0.25)" },
  passBrand: { fontSize: 12, fontWeight: "900", letterSpacing: 1.6 },
  passTier: { gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  passTierText: { fontSize: 11, fontWeight: "900", letterSpacing: 1.2 },
  passName: { fontFamily: passFont, fontSize: 20, fontWeight: "700", letterSpacing: 2 },
  passNumber: { fontFamily: passFont, fontSize: 11, letterSpacing: 1.2 },
  passLabel: { fontSize: 9, fontWeight: "800", letterSpacing: 1.2 },
  passValue: { fontSize: 13, fontWeight: "800" },
  currentStatus: { color: p.muted, fontSize: 13, lineHeight: 19, fontWeight: "600" },
  track: { height: 4, borderRadius: 2, overflow: "hidden", backgroundColor: p.line },
  fill: { height: 4, borderRadius: 2, backgroundColor: p.blue },
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
