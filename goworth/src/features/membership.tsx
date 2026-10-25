import { router, type Href } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Button, Copy, Header, Icon, Row, Screen, Sheet } from "@/components/goworth/ui";
import { themedStyles } from "@/constants/design";
import { usePalette, useStyles } from "@/state/theme-context";
import { useAppLanguage } from "@/data/formatting";
import type { Membership } from "@/lib/entitlements";
import { cancelMonthlyRenewal, loadStoreOffers, purchaseStorePlan, purchasesConfigured } from "@/lib/purchases";
import type { PaidPlan, StoreOffers } from "@/lib/purchase-types";
import { useAuth } from "@/state/auth-context";
import { useTravel } from "@/state/travel-context";

const wording = {
  en: {
    title: "Membership", current: "Current plan", monthlyUsage: "This month", trip: "Trips", places: "Saved places", destinations: "Saved destinations",
    free: "Free", premium: "Premium monthly", lifetime: "Lifetime", loading: "Checking store prices…",
    unavailable: "Store price unavailable", monthlyDetail: "Unlimited trips and saves. Renews every month until you cancel. After cancelling, Premium stays active until the end of the paid month. No refunds.",
    lifetimeDetail: "Unlimited trips and saves for this GoWorth account. One-time payment with no renewal. Cannot be cancelled and is not refundable.",
    cancelMonthlyFirst: "Cancel monthly renewal before buying Lifetime. Your paid month remains active and is not refunded.",
    cancelRenewal: "Cancel subscription", renewalCancelled: "Subscription canceled. Premium remains active until", cancellationFailed: "Could not confirm the cancellation. Please try again.",
    cancelConfirmation: "Your next renewal will stop. Premium stays active until the end of the month you already paid for, and that month is not refunded. After confirming, you can also buy Lifetime.", keepRenewal: "Keep monthly renewal",
    lifetimeNoSubscription: "Lifetime is a one-time purchase with no renewal to cancel.",
    freeDetail: "1 trip, 5 new saved places and 5 new saved destinations each calendar month.",
    monthlyAction: "Subscribe monthly", lifetimeAction: "Get lifetime access", active: "Your plan", paidActive: "Unlimited access is active.",
    setup: "Purchases are being set up. Prices and purchase buttons will appear when the stores are connected.",
    verify: "Purchase verification is unavailable. Purchases are paused until access can be confirmed.",
    noProducts: "Products are not available in this store yet.",
    activated: "Your membership is active.", pending: "The store completed the purchase, but access has not been verified yet. Please try again later.",
    terms: "Terms", privacy: "Privacy", billing: "Subscription information",
    testMode: "Test mode: prices and checkout are simulated. No real payment is collected.",
    renewal: "The monthly plan renews automatically. Stripe Checkout shows the final price before purchase.",
    consent: "I want access to start immediately and understand that I lose my 14-day right of withdrawal once it starts. All purchases are final and non-refundable.",
    consentNeeded: "Confirm the box above to continue.",
    choose: "Choose a plan", perMonth: "/ month", oneTime: "one-time", yourPlan: "Your plan",
    renewsOn: "Renews on", activeUntil: "Active until", limitsReset: "Limits reset on the 1st of every month.",
  },
  ro: {
    title: "Abonament", current: "Planul actual", monthlyUsage: "Luna aceasta", trip: "Călătorii", places: "Locuri salvate", destinations: "Destinații salvate",
    free: "Gratuit", premium: "Premium lunar", lifetime: "Pe viață", loading: "Se verifică prețurile din magazin…",
    unavailable: "Preț indisponibil", monthlyDetail: "Călătorii și salvări nelimitate. Se reînnoiește lunar până îl anulezi. După anulare, Premium rămâne activ până la sfârșitul lunii plătite. Fără rambursări.",
    lifetimeDetail: "Călătorii și salvări nelimitate pentru acest cont GoWorth. Plată unică, fără reînnoire. Nu poate fi anulat și nu este rambursabil.",
    cancelMonthlyFirst: "Anulează reînnoirea lunară înainte de a cumpăra planul pe viață. Luna plătită rămâne activă și nu este rambursată.",
    cancelRenewal: "Anulează abonamentul", renewalCancelled: "Abonamentul este anulat. Premium rămâne activ până la", cancellationFailed: "Nu am putut confirma anularea. Încearcă din nou.",
    cancelConfirmation: "Următoarea reînnoire se oprește. Premium rămâne activ până la sfârșitul lunii deja plătite, iar acea lună nu se rambursează. După confirmare, poți cumpăra și planul pe viață.", keepRenewal: "Păstrează reînnoirea lunară",
    lifetimeNoSubscription: "Planul pe viață este o plată unică și nu are reînnoire de anulat.",
    freeDetail: "1 călătorie, 5 locuri noi și 5 destinații noi salvate în fiecare lună calendaristică.",
    monthlyAction: "Abonează-te lunar", lifetimeAction: "Obține acces pe viață", active: "Planul tău", paidActive: "Accesul nelimitat este activ.",
    setup: "Plățile sunt în curs de configurare. Prețurile și butoanele de cumpărare vor apărea după conectarea magazinelor.",
    verify: "Verificarea cumpărăturilor nu este disponibilă. Cumpărarea rămâne oprită până când accesul poate fi confirmat.",
    noProducts: "Produsele nu sunt încă disponibile în acest magazin.",
    activated: "Abonamentul tău este activ.", pending: "Magazinul a finalizat cumpărarea, dar accesul nu a fost verificat încă. Încearcă din nou mai târziu.",
    terms: "Termeni", privacy: "Confidențialitate", billing: "Informații despre abonament",
    testMode: "Mod test: prețurile și checkout-ul sunt simulate. Nu se percepe nicio plată reală.",
    renewal: "Planul lunar se reînnoiește automat. Stripe Checkout afișează prețul final înainte de plată.",
    consent: "Vreau ca accesul să înceapă imediat și înțeleg că pierd dreptul de retragere de 14 zile din momentul în care începe. Toate achizițiile sunt definitive și nerambursabile.",
    consentNeeded: "Bifează căsuța de mai sus pentru a continua.",
    choose: "Alege un plan", perMonth: "/ lună", oneTime: "plată unică", yourPlan: "Planul tău",
    renewsOn: "Se reînnoiește pe", activeUntil: "Activ până la", limitsReset: "Limitele se resetează pe 1 a fiecărei luni.",
  },
} as const;

function Plan({ title, price, pending, suffix, detail, current, currentLabel, note, action, disabled, busy, onPress }: {
  title: string; price?: string; pending?: boolean; suffix?: string; detail: string; current: boolean; currentLabel: string;
  note?: string; action?: string; disabled?: boolean; busy?: boolean; onPress?: () => void;
}) {
  const styles = useStyles(stylesSheet);
  return <View style={[styles.plan, current && styles.planCurrent]}>
    <Row style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={styles.planTitle}>{title}</Text>
        {!!price && <Row style={{ gap: 5, alignItems: "baseline", flexWrap: "wrap" }}>
          <Text style={pending ? styles.planPending : styles.planPrice}>{price}</Text>
          {!!suffix && <Text style={styles.planSuffix}>{suffix}</Text>}
        </Row>}
      </View>
      {current && <Text style={styles.currentLabel}>{currentLabel}</Text>}
    </Row>
    <Text style={styles.planDetail}>{detail}</Text>
    {!!note && <Text style={styles.planNote}>{note}</Text>}
    {action && onPress && !current && <Button disabled={disabled} busy={busy} onPress={onPress}>{action}</Button>}
  </View>;
}

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
  const { user } = useAuth();
  const userId = user?.id;
  const { plan, monthlyUsage, refreshMembership } = useTravel();
  const [offers, setOffers] = useState<StoreOffers | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [loading, setLoading] = useState(true);
  const [verificationReady, setVerificationReady] = useState(false);
  const [busy, setBusy] = useState<PaidPlan | "cancel" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [consent, setConsent] = useState(false);
  const configured = purchasesConfigured();

  const load = useCallback(async () => {
    if (!userId) return null;
    const [storeResult, verificationResult] = await Promise.allSettled([
      loadStoreOffers(userId), configured ? refreshMembership() : Promise.resolve(null),
    ]);
    return { storeResult, verificationResult };
  }, [userId, configured, refreshMembership]);

  const apply = useCallback((result: Awaited<ReturnType<typeof load>>) => {
    if (!result) return;
    const { storeResult, verificationResult } = result;
    setError("");
    if (storeResult.status === "fulfilled") setOffers(storeResult.value);
    else {
      setOffers(null);
      setError(storeResult.reason instanceof Error ? storeResult.reason.message : t.noProducts);
    }
    if (verificationResult.status === "fulfilled" && verificationResult.value) {
      setMembership(verificationResult.value);
      setVerificationReady(true);
    } else {
      setMembership(null);
      setVerificationReady(false);
      if (verificationResult.status === "rejected") setError(verificationResult.reason instanceof Error ? verificationResult.reason.message : t.verify);
    }
    setLoading(false);
  }, [t.noProducts, t.verify]);

  useEffect(() => {
    let active = true;
    void load().then((result) => { if (active) apply(result); });
    return () => { active = false; };
  }, [load, apply]);

  const buy = async (selected: PaidPlan) => {
    if (!user || !consent || !verificationReady || plan === "lifetime" || selected === "lifetime" && plan === "premium" && !membership?.cancelAtPeriodEnd) return;
    setBusy(selected);
    setError("");
    setNotice("");
    let storeCompleted = false;
    try {
      const preflight = await refreshMembership();
      if (preflight.plan === "lifetime" || preflight.plan === "premium" && selected === "premium") return;
      if (preflight.plan === "premium" && selected === "lifetime" && !preflight.cancelAtPeriodEnd) throw new Error(t.cancelMonthlyFirst);
      if (await purchaseStorePlan(user.id, selected) === "cancelled") return;
      storeCompleted = true;
      const updated = await refreshMembership();
      if (updated.plan !== selected) throw new Error(t.pending);
      setMembership(updated);
      setNotice(t.activated);
    } catch (caught) { setError(storeCompleted ? t.pending : caught instanceof Error ? caught.message : t.verify); }
    finally { setBusy(null); }
  };

  const cancelRenewal = async () => {
    if (!user || loading || busy || !verificationReady || plan !== "premium" || membership?.cancelAtPeriodEnd) return;
    setBusy("cancel");
    setError("");
    setNotice("");
    try {
      await cancelMonthlyRenewal();
      const updated = await refreshMembership();
      if (!updated.cancelAtPeriodEnd) throw new Error(t.cancellationFailed);
      setMembership(updated);
      setShowCancelConfirm(false);
    } catch (caught) { setShowCancelConfirm(false); setError(caught instanceof Error ? caught.message : t.cancellationFailed); }
    finally { setBusy(null); }
  };

  const price = (value: string | null | undefined) => loading ? t.loading : value ?? t.unavailable;
  const canBuy = configured && verificationReady && !loading && consent;
  const renewalDate = membership?.validUntil ? new Date(membership.validUntil).toLocaleDateString(language === "ro" ? "ro-RO" : "en-US") : "";
  const planName = plan === "free" ? t.free : plan === "premium" ? t.premium : t.lifetime;
  const lifetimeBlocked = plan === "premium" && !membership?.cancelAtPeriodEnd;
  const status = plan === "lifetime" ? t.lifetimeNoSubscription
    : plan === "premium" ? (renewalDate ? `${membership?.cancelAtPeriodEnd ? t.activeUntil : t.renewsOn} ${renewalDate}` : t.paidActive)
    : t.limitsReset;
  return <Screen active="profile" style={{ gap: 18 }}>
    <Header title={t.title} />
    <View style={styles.current}>
      <Text style={styles.label}>{t.current.toUpperCase()}</Text>
      <Row style={{ gap: 8 }}>
        {plan !== "free" && <Icon name="crown" size={20} color={p.blue} />}
        <Text style={styles.currentPlan}>{planName}</Text>
      </Row>
      <Text style={styles.currentStatus}>{status}</Text>
      {plan === "free" && <View style={{ gap: 12, marginTop: 8 }}>
        <Usage label={t.trip} used={monthlyUsage.trip} limit={1} />
        <Usage label={t.places} used={monthlyUsage.place} limit={5} />
        <Usage label={t.destinations} used={monthlyUsage.destination} limit={5} />
      </View>}
    </View>

    <View style={{ gap: 12 }}>
      <Text style={styles.section}>{t.choose}</Text>
      {plan !== "lifetime" && <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: consent }}
        onPress={() => setConsent((value) => !value)}
        style={({ pressed }) => [styles.consent, pressed && { opacity: 0.7 }]}
      >
        <View style={[styles.checkbox, consent && { borderColor: p.blue, backgroundColor: p.blue }]}>
          {consent && <Icon name="tick" size={15} color={p.onColor} />}
        </View>
        <Text style={styles.consentText}>{t.consent}</Text>
      </Pressable>}
      {configured && verificationReady && !loading && !consent && plan !== "lifetime" && <Note>{t.consentNeeded}</Note>}

      <Plan title={t.free} detail={t.freeDetail} current={plan === "free"} currentLabel={t.yourPlan} />
      <Plan title={t.premium} price={price(offers?.monthlyPrice)} pending={loading || !offers?.monthlyPrice} suffix={offers?.monthlyPrice && !loading ? t.perMonth : undefined} detail={t.monthlyDetail}
        current={plan === "premium"} currentLabel={t.yourPlan}
        action={t.monthlyAction} disabled={!canBuy || !offers?.monthlyPrice || !!busy || plan === "lifetime"} busy={loading || busy === "premium"} onPress={() => void buy("premium")} />
      <Plan title={t.lifetime} price={price(offers?.lifetimePrice)} pending={loading || !offers?.lifetimePrice} suffix={offers?.lifetimePrice && !loading ? t.oneTime : undefined} detail={t.lifetimeDetail}
        current={plan === "lifetime"} currentLabel={t.yourPlan} note={lifetimeBlocked ? t.cancelMonthlyFirst : undefined}
        action={t.lifetimeAction} disabled={!canBuy || !offers?.lifetimePrice || !!busy || lifetimeBlocked} busy={loading || busy === "lifetime"} onPress={() => void buy("lifetime")} />
    </View>

    {plan === "premium" && (membership?.cancelAtPeriodEnd
      ? <Note>{`${t.renewalCancelled} ${renewalDate}.`}</Note>
      : <Button secondary onPress={() => setShowCancelConfirm(true)} disabled={!verificationReady || loading || !!busy}>{t.cancelRenewal}</Button>)}

    <View style={{ gap: 6 }}>
      {!!notice && <Note color={p.green}>{notice}</Note>}
      {!!error && <Note color={p.danger}>{error}</Note>}
      {!loading && configured && !verificationReady && <Note color={p.danger}>{t.verify}</Note>}
      {configured && verificationReady && !loading && !offers?.monthlyPrice && !offers?.lifetimePrice && <Note>{t.noProducts}</Note>}
      {!configured && <Note>{t.setup}</Note>}
      {plan !== "lifetime" && <Note>{t.renewal}</Note>}
      {configured && <Note>{t.testMode}</Note>}
    </View>

    <Row style={{ gap: 16, flexWrap: "wrap", justifyContent: "center", paddingBottom: 6 }}>
      {(["subscriptions", "terms", "privacy"] as const).map((document) => <Pressable key={document} accessibilityRole="link" hitSlop={8} onPress={() => router.push({ pathname: "/legal-document", params: { type: document } } as Href)}>
        <Text style={styles.link}>{document === "subscriptions" ? t.billing : document === "terms" ? t.terms : t.privacy}</Text>
      </Pressable>)}
    </Row>
    <Sheet visible={showCancelConfirm} title={t.cancelRenewal} onClose={() => { if (busy !== "cancel") setShowCancelConfirm(false); }}>
      <Copy>{t.cancelConfirmation}</Copy>
      <Button onPress={() => void cancelRenewal()} busy={busy === "cancel"} style={{ backgroundColor: p.danger }}>{t.cancelRenewal}</Button>
      <Button secondary onPress={() => setShowCancelConfirm(false)} disabled={busy === "cancel"}>{t.keepRenewal}</Button>
    </Sheet>
  </Screen>;
}

const stylesSheet = themedStyles((p) => ({
  current: { gap: 4, padding: 18, borderRadius: 20, backgroundColor: p.soft },
  label: { color: p.muted, fontSize: 11, fontWeight: "800", letterSpacing: 0.8 },
  currentPlan: { color: p.ink, fontSize: 24, lineHeight: 30, fontWeight: "800" },
  currentStatus: { color: p.muted, fontSize: 13, fontWeight: "600" },
  usageLabel: { flexShrink: 1, color: p.ink, fontSize: 13, fontWeight: "600" },
  usageCount: { color: p.ink, fontSize: 13, fontWeight: "700" },
  track: { height: 4, borderRadius: 2, overflow: "hidden", backgroundColor: p.line },
  fill: { height: 4, borderRadius: 2, backgroundColor: p.blue },
  section: { color: p.ink, fontSize: 18, fontWeight: "800" },
  plan: { gap: 10, padding: 16, borderRadius: 20, borderWidth: 1, borderColor: p.line, backgroundColor: p.white },
  planCurrent: { borderColor: p.blue, borderWidth: 1.5 },
  planTitle: { color: p.ink, fontSize: 15, fontWeight: "800" },
  planPrice: { color: p.ink, fontSize: 22, lineHeight: 28, fontWeight: "800" },
  planPending: { color: p.muted, fontSize: 13, lineHeight: 20, fontWeight: "600" },
  planSuffix: { color: p.muted, fontSize: 13, fontWeight: "600" },
  planDetail: { color: p.muted, fontSize: 13, lineHeight: 19 },
  planNote: { color: p.ink, fontSize: 12, lineHeight: 17, fontWeight: "600" },
  currentLabel: { color: p.blue, fontSize: 12, fontWeight: "800" },
  consent: { flexDirection: "row", alignItems: "flex-start", gap: 11, paddingVertical: 4 },
  checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: p.muted, backgroundColor: p.white, alignItems: "center", justifyContent: "center", marginTop: 1 },
  consentText: { flex: 1, color: p.muted, fontSize: 12, lineHeight: 18 },
  note: { fontSize: 12, lineHeight: 18, textAlign: "center" },
  link: { color: p.blue, fontSize: 12, fontWeight: "600" },
}));
