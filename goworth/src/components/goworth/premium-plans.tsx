import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Icon, Row } from "@/components/goworth/ui";
import { premiumTone, usePremiumTone, wheelColors } from "@/components/goworth/premium-wheel";
import { themedStyles } from "@/constants/design";
import { formatMessage, translate } from "@/data/i18n";
import { useAppLanguage } from "@/data/formatting";
import { buyPlan, loadPlans, manageSubscription, purchasesAvailable, restorePurchases, type PlanOption } from "@/lib/purchases";
import type { PlanId } from "@/lib/plan-offer";
import { useTimedMessage } from "@/hooks/use-timed-message";
import { useStyles } from "@/state/theme-context";
import { scheduleTrialReminder } from "@/lib/notifications";

const wording = {
  en: {
    eyebrow: "GoWorth Premium", title: "Travel without limits",
    perks: [["book", "Your passport, with a visa for every country you visit"], ["people", "Unlimited companions on every trip"],
      ["trip", "Plan several trips side by side, no monthly limit"], ["plane", "Your trips offline, even in airplane mode"],
      ["star", "Rare stamps for every travel milestone"]],
    reasons: {
      companions: ["Bring the whole group", "Free trips include one companion. With Premium, everyone comes along."],
      trip: ["Your free trip this month is planned", "Premium plans as many trips as you like, side by side, starting now."],
      place: ["Your free saves are used up", "Keep every place you love with unlimited saves."],
      passport: ["Open your passport", "Your visas are already waiting inside."],
      offline: ["Take your trips offline", "Itinerary, budget and saved places, with or without signal."],
      stamps: ["Collect rare stamps", "Your passport marks every milestone, from your first visa to ten flags."],
    },
    timeline: [["Today", "Full Premium access, free"], ["Day {reminder}", "We remind you the trial is ending"], ["Day {days}", "{price} per year, unless you cancel"]],
    yearly: "Yearly", monthly: "Monthly", lifetime: "Lifetime",
    bestValue: "Best value", save: "Save {percent}%", perMonth: "{price}/month", billedYearly: "{price} billed yearly",
    monthlyNote: "Billed every month", lifetimeNote: "Pay once, yours forever", trial: "{days} days free",
    perYear: "/year", perMonthShort: "/month", once: "once",
    startTrial: "Start {days}-day free trial", continueYearly: "Get Yearly · {price}", continueMonthly: "Get Monthly · {price}", continueLifetime: "Get Lifetime · {price}",
    afterTrial: "Free for {days} days, then {price} per year. Cancel anytime before the trial ends and you pay nothing.",
    renewal: "Subscriptions renew automatically at the same price until you cancel in your {store} settings, at least 24 hours before the period ends. Lifetime is a single payment with no renewal.",
    current: "Your plan", restore: "Restore purchases", manage: "Manage subscription", restored: "Purchases restored.",
    thanks: "Welcome to Premium! Unlimited trips and saves are active now.",
    signIn: "Sign in to buy Premium, so it stays with your account on every device.",
    appOnly: "Premium can be bought in the GoWorth app for iPhone and Android.",
    loading: "Loading plans…",
  },
  ro: {
    eyebrow: "GoWorth Premium", title: "Călătorește fără limite",
    perks: [["book", "Pașaportul tău, cu o viză pentru fiecare țară vizitată"], ["people", "Însoțitori nelimitați în fiecare călătorie"],
      ["trip", "Mai multe călătorii în paralel, fără limită lunară"], ["plane", "Călătoriile tale offline, chiar și în modul avion"],
      ["star", "Ștampile rare pentru fiecare reper din călătorii"]],
    reasons: {
      companions: ["Adu tot grupul", "Călătoriile gratuite includ un însoțitor. Cu Premium, vine toată lumea."],
      trip: ["Călătoria gratuită a lunii e planificată", "Cu Premium planifici oricâte călătorii vrei, în paralel, de acum."],
      place: ["Salvările gratuite s-au terminat", "Păstrează fiecare loc îndrăgit cu salvări nelimitate."],
      passport: ["Deschide-ți pașaportul", "Vizele tale te așteaptă deja înăuntru."],
      offline: ["Ia-ți călătoriile offline", "Itinerariu, buget și locuri salvate, cu sau fără semnal."],
      stamps: ["Colecționează ștampile rare", "Pașaportul îți marchează fiecare reper, de la prima viză la zece steaguri."],
    },
    timeline: [["Azi", "Acces Premium complet, gratuit"], ["Ziua {reminder}", "Îți amintim că perioada gratuită se termină"], ["Ziua {days}", "{price} pe an, dacă nu anulezi"]],
    yearly: "Anual", monthly: "Lunar", lifetime: "Pe viață",
    bestValue: "Cea mai bună ofertă", save: "−{percent}%", perMonth: "{price}/lună", billedYearly: "{price} facturat anual",
    monthlyNote: "Facturat lunar", lifetimeNote: "Plătești o dată, e al tău pentru totdeauna", trial: "{days} zile gratuit",
    perYear: "/an", perMonthShort: "/lună", once: "o dată",
    startTrial: "Începe perioada gratuită de {days} zile", continueYearly: "Alege Anual · {price}", continueMonthly: "Alege Lunar · {price}", continueLifetime: "Alege Pe viață · {price}",
    afterTrial: "Gratuit {days} zile, apoi {price} pe an. Anulezi oricând înainte să se termine perioada gratuită și nu plătești nimic.",
    renewal: "Abonamentele se reînnoiesc automat la același preț până le anulezi din setările {store}, cu cel puțin 24 de ore înainte de finalul perioadei. Pe viață este o plată unică, fără reînnoire.",
    current: "Planul tău", restore: "Restaurează cumpărăturile", manage: "Gestionează abonamentul", restored: "Cumpărăturile au fost restaurate.",
    thanks: "Bun venit în Premium! Călătoriile și salvările nelimitate sunt active acum.",
    signIn: "Conectează-te ca să cumperi Premium, ca să rămână în contul tău pe orice dispozitiv.",
    appOnly: "Premium se poate cumpăra din aplicația GoWorth pentru iPhone și Android.",
    loading: "Se încarcă planurile…",
  },
} as const;

/**
 * The paywall: monthly, yearly and lifetime, with yearly in the middle, preselected and framed in gold with its saving.
 * Prices always come from the store, so they match the local currency and whatever the store charges.
 */
export type PaywallReason = keyof (typeof wording)["en"]["reasons"];
export const isPaywallReason = (value: unknown): value is PaywallReason => typeof value === "string" && value in wording.en.reasons;

export function PremiumPlans({ signedIn, storeProduct, willRenew, onPurchased, reason }: {
  signedIn: boolean; storeProduct?: string | null; willRenew?: boolean | null; onPurchased: () => Promise<unknown>; reason?: PaywallReason;
}) {
  const styles = useStyles(stylesSheet);
  const c = usePremiumTone();
  const language = useAppLanguage();
  const t = wording[language];
  const [plans, setPlans] = useState<PlanOption[] | null>(null);
  const [selected, setSelected] = useState<PlanId>("yearly");
  const [busy, setBusy] = useState<"buy" | "restore" | null>(null);
  const [message, setMessage] = useTimedMessage();
  const [error, setError] = useState("");

  useEffect(() => {
    if (!purchasesAvailable || !signedIn) return;
    let active = true;
    loadPlans().then((loaded) => {
      if (!active) return;
      setPlans(loaded);
      if (!loaded.some((plan) => plan.id === "yearly") && loaded[0]) setSelected(loaded[0].id);
    }).catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : t.loading); });
    return () => { active = false; };
  }, [signedIn, t.loading]);

  // A native build without RevenueCat keys has nothing to sell, so it shows no paywall rather than a broken one.
  if (!purchasesAvailable) return null;
  const store = Platform.OS === "ios" ? "App Store" : "Google Play";
  const choice = plans?.find((plan) => plan.id === selected);
  const owned = (plan: PlanOption) => plan.productId === storeProduct;
  const fail = (caught: unknown) => setError(translate(caught instanceof Error ? caught.message : "Plans could not be loaded right now.", language));

  const buy = async () => {
    if (!choice || busy || owned(choice)) return;
    setBusy("buy"); setError("");
    try {
      if (await buyPlan(choice)) {
        await onPurchased();
        setMessage(t.thanks);
        if (choice.trialDays && choice.id !== "lifetime") void scheduleTrialReminder(choice.trialDays, choice.price, choice.id);
      }
    } catch (caught) { fail(caught); }
    setBusy(null);
  };
  const restore = async () => {
    if (busy) return;
    setBusy("restore"); setError("");
    try { await restorePurchases(); await onPurchased(); setMessage(t.restored); }
    catch (caught) { fail(caught); }
    setBusy(null);
  };

  const cta = !choice ? t.loading
    : choice.trialDays ? formatMessage(t.startTrial, { days: choice.trialDays })
    : formatMessage(choice.id === "yearly" ? t.continueYearly : choice.id === "monthly" ? t.continueMonthly : t.continueLifetime, { price: choice.price });

  return <View style={styles.card}>
    <LinearGradient colors={c.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
    <View style={{ gap: 6, alignItems: "center" }}>
      <Row style={styles.eyebrow}>
        <Icon name="crown" size={13} color={c.accent} />
        <Text style={styles.eyebrowText}>{t.eyebrow.toUpperCase()}</Text>
      </Row>
      <Text style={styles.title}>{reason ? t.reasons[reason][0] : t.title}</Text>
      {!!reason && <Text style={styles.subtitle}>{t.reasons[reason][1]}</Text>}
    </View>
    <View style={{ gap: 10 }}>
      {t.perks.map(([icon, perk]) => <Row key={perk} style={{ gap: 11 }}>
        <View style={styles.perkTick}><Icon name={icon} size={13} color={wheelColors.goldInk} /></View>
        <Text style={styles.perk}>{perk}</Text>
      </Row>)}
    </View>

    {!purchasesAvailable ? <Text style={styles.note}>{t.appOnly}</Text>
      : !signedIn ? <Text style={styles.note}>{t.signIn}</Text>
      : !plans ? (error ? null : <Row style={{ gap: 8, justifyContent: "center" }}><ActivityIndicator color={c.accentText} /><Text style={styles.note}>{t.loading}</Text></Row>)
      : <>
        <View accessibilityRole="radiogroup" style={{ gap: 12 }}>
          {plans.map((plan) => <PlanRow key={plan.id} plan={plan} selected={plan.id === selected} owned={owned(plan)} onPress={() => setSelected(plan.id)} t={t} />)}
        </View>
        {choice?.trialDays ? <View style={styles.timeline}>
          {/* What happens and when, so a free trial never feels like a trap. */}
          {t.timeline.map(([when, what], index) => <Row key={when} style={{ gap: 12, alignItems: "flex-start" }}>
            <View style={{ alignItems: "center", width: 22 }}>
              <View style={[styles.timelineDot, index === 0 && styles.timelineDotOn]}>
                <Icon name={index === 0 ? "check" : index === 1 ? "bell" : "crown"} size={11} color={index === 0 ? wheelColors.goldInk : c.accentText} />
              </View>
              {index < t.timeline.length - 1 && <View style={styles.timelineLine} />}
            </View>
            <View style={{ flex: 1, paddingBottom: index < t.timeline.length - 1 ? 10 : 0 }}>
              <Text style={styles.timelineWhen}>{formatMessage(when, { reminder: Math.max(1, choice.trialDays! - 2), days: choice.trialDays! })}</Text>
              <Text style={styles.timelineWhat}>{formatMessage(what, { price: choice.price })}</Text>
            </View>
          </Row>)}
          <Text style={styles.trialNote}>{formatMessage(t.afterTrial, { days: choice.trialDays, price: choice.price })}</Text>
        </View> : null}
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: !choice || !!busy || (!!choice && owned(choice)), busy: busy === "buy" }}
          disabled={!choice || !!busy || (!!choice && owned(choice))} onPress={() => void buy()}
          style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85, transform: [{ scale: 0.985 }] }, (!choice || (choice && owned(choice))) && { opacity: 0.5 }]}>
          <LinearGradient colors={[wheelColors.goldLight, wheelColors.gold, wheelColors.goldDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          {busy === "buy" ? <ActivityIndicator color={wheelColors.goldInk} /> : <Text style={styles.ctaText}>{cta}</Text>}
        </Pressable>
      </>}

    {!!message && <Text accessibilityLiveRegion="polite" style={[styles.note, { color: c.success }]}>{message}</Text>}
    {!!error && <Text accessibilityLiveRegion="polite" style={[styles.note, { color: c.error }]}>{error}</Text>}

    {purchasesAvailable && signedIn && <>
      <Text style={styles.fine}>{formatMessage(t.renewal, { store })}</Text>
      <Row style={{ gap: 18, justifyContent: "center", flexWrap: "wrap" }}>
        {/* A store purchase already on the account has nothing left to restore; wheel Premium still can. */}
        {!storeProduct && <Pressable accessibilityRole="button" hitSlop={8} disabled={!!busy} onPress={() => void restore()}>
          <Text style={styles.link}>{busy === "restore" ? "…" : t.restore}</Text>
        </Pressable>}
        {!!storeProduct && willRenew !== null && <Pressable accessibilityRole="button" hitSlop={8} onPress={() => void manageSubscription()}>
          <Text style={styles.link}>{t.manage}</Text>
        </Pressable>}
      </Row>
    </>}
  </View>;
}

function PlanRow({ plan, selected, owned, onPress, t }: {
  plan: PlanOption; selected: boolean; owned: boolean; onPress: () => void; t: (typeof wording)[keyof typeof wording];
}) {
  const styles = useStyles(stylesSheet);
  const c = usePremiumTone();
  const yearly = plan.id === "yearly";
  const name = yearly ? t.yearly : plan.id === "monthly" ? t.monthly : t.lifetime;
  const detail = yearly ? (plan.pricePerMonth ? formatMessage(t.perMonth, { price: plan.pricePerMonth }) : formatMessage(t.billedYearly, { price: plan.price }))
    : plan.id === "monthly" ? t.monthlyNote : t.lifetimeNote;
  const unit = yearly ? t.perYear : plan.id === "monthly" ? t.perMonthShort : ` ${t.once}`;
  return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected, disabled: owned }} accessibilityLabel={`${name}, ${plan.price}${unit}. ${detail}`}
    onPress={onPress} style={({ pressed }) => [styles.plan, yearly && styles.planYearly, selected && styles.planSelected, pressed && { opacity: 0.85 }]}>
    {yearly && <View style={styles.ribbon}>
      <LinearGradient colors={[wheelColors.goldLight, wheelColors.gold]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
      <Icon name="sparkle" size={11} color={wheelColors.goldInk} />
      <Text numberOfLines={1} style={styles.ribbonText}>{(plan.savings ? `${t.bestValue} · ${formatMessage(t.save, { percent: plan.savings })}` : t.bestValue).toUpperCase()}</Text>
    </View>}
    <View style={[styles.radio, selected && styles.radioOn]}>{selected && <View style={styles.radioDot} />}</View>
    <View style={{ flex: 1, gap: 3 }}>
      <Row style={{ gap: 8, flexWrap: "wrap" }}>
        <Text style={styles.planName}>{name}</Text>
        {owned ? <Text style={styles.pill}>{t.current.toUpperCase()}</Text>
          : plan.trialDays ? <Text style={styles.pill}>{formatMessage(t.trial, { days: plan.trialDays }).toUpperCase()}</Text> : null}
      </Row>
      <Text style={[styles.planDetail, yearly && { color: c.accentText }]}>{detail}</Text>
    </View>
    <View style={{ alignItems: "flex-end" }}>
      <Text style={[styles.price, yearly && styles.priceYearly]}>{plan.price}</Text>
      <Text style={styles.unit}>{unit.trim()}</Text>
    </View>
  </Pressable>;
}

const stylesSheet = themedStyles((p) => {
  const c = premiumTone(p);
  return {
    card: { gap: 16, padding: 20, borderRadius: 28, borderWidth: 1, borderColor: c.border, overflow: "hidden" },
    eyebrow: { gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: c.chipBorder, backgroundColor: c.chipBg },
    eyebrowText: { color: c.accentText, fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
    title: { color: c.title, fontSize: 24, lineHeight: 30, fontWeight: "800", textAlign: "center", letterSpacing: -0.4 },
    subtitle: { color: c.body, fontSize: 14, lineHeight: 20, textAlign: "center", fontWeight: "600", paddingHorizontal: 8 },
    perkTick: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: wheelColors.gold },
    timeline: { gap: 2, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: c.surfaceBorder, backgroundColor: c.surface },
    timelineDot: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: c.accent },
    timelineDotOn: { backgroundColor: wheelColors.gold, borderColor: wheelColors.gold },
    timelineLine: { flex: 1, width: 2, minHeight: 14, backgroundColor: c.surfaceBorder, marginVertical: 2 },
    timelineWhen: { color: c.title, fontSize: 13.5, fontWeight: "800" },
    timelineWhat: { color: c.muted, fontSize: 12.5, fontWeight: "600", marginTop: 1 },
    perk: { flex: 1, color: c.strong, fontSize: 14, fontWeight: "600" },
    plan: {
      flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 14, borderRadius: 18,
      borderWidth: 1.5, borderColor: c.surfaceBorder, backgroundColor: c.surface,
    },
    // The yearly row sits a little taller with room for its ribbon, so it reads as the main offer even unselected.
    planYearly: { paddingTop: 24, paddingBottom: 16, marginTop: 10, borderColor: c.offerBorder, backgroundColor: c.offer },
    planSelected: { borderColor: c.accent, backgroundColor: c.offerSelected },
    ribbon: {
      position: "absolute", top: -11, left: 14, maxWidth: "88%", flexDirection: "row", alignItems: "center", gap: 4,
      paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, overflow: "hidden",
    },
    ribbonText: { flexShrink: 1, color: wheelColors.goldInk, fontSize: 10.5, lineHeight: 15, fontWeight: "900", letterSpacing: 0.8 },
    radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: c.radio, alignItems: "center", justifyContent: "center" },
    radioOn: { borderColor: c.accent },
    radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: c.accent },
    planName: { color: c.title, fontSize: 16, fontWeight: "800" },
    planDetail: { color: c.muted, fontSize: 12.5, fontWeight: "600" },
    pill: {
      color: wheelColors.goldInk, backgroundColor: wheelColors.goldLight, fontSize: 9.5, fontWeight: "900", letterSpacing: 0.6,
      paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, overflow: "hidden",
    },
    price: { color: c.title, fontSize: 17, fontWeight: "800" },
    priceYearly: { color: c.accentText, fontSize: 19 },
    unit: { color: c.muted, fontSize: 11, fontWeight: "600" },
    trialNote: { color: c.accentText, fontSize: 12.5, lineHeight: 18, textAlign: "center", fontWeight: "600" },
    cta: { minHeight: 54, borderRadius: 18, alignItems: "center", justifyContent: "center", overflow: "hidden", paddingHorizontal: 16 },
    ctaText: { color: wheelColors.goldInk, fontSize: 16, fontWeight: "900", textAlign: "center" },
    note: { color: c.body, fontSize: 13, lineHeight: 19, textAlign: "center", fontWeight: "600" },
    fine: { color: c.faint, fontSize: 11, lineHeight: 16, textAlign: "center" },
    link: { color: c.muted, fontSize: 12.5, fontWeight: "700", textDecorationLine: "underline" },
  };
});
