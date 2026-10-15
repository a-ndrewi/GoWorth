import { router, type Href } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { Button, Copy, Header, Heading, Icon, Row, Screen } from "@/components/goworth/ui";
import { palette as p } from "@/constants/design";
import { useAppLanguage } from "@/data/formatting";
import type { Membership } from "@/lib/entitlements";
import { loadStoreOffers, purchaseStorePlan, purchasesConfigured, restoreStorePurchases } from "@/lib/purchases";
import type { PaidPlan, StoreOffers } from "@/lib/purchase-types";
import { useAuth } from "@/state/auth-context";
import { useTravel } from "@/state/travel-context";

const wording = {
  en: {
    title: "Membership", current: "Current plan", monthlyUsage: "This month", trip: "Trips", places: "Saved places", destinations: "Saved destinations",
    free: "Free", premium: "Premium monthly", lifetime: "Lifetime", freePrice: "Free", loading: "Checking store prices…",
    unavailable: "Store price unavailable", monthlyDetail: "Unlimited trips and saves. Renews each month; cancel in your store settings.",
    lifetimeDetail: "Unlimited trips and saves for this GoWorth account. One-time purchase.",
    cancelMonthlyFirst: "Cancel the monthly subscription in your store before buying lifetime access. You can buy it after your monthly access ends.",
    freeDetail: "1 trip, 5 new saved places and 5 new saved destinations each calendar month.",
    monthlyAction: "Subscribe monthly", lifetimeAction: "Get lifetime access", active: "Your plan", paidActive: "Unlimited access is active.",
    setup: "Purchases are being set up. Prices and purchase buttons will appear when the stores are connected.",
    verify: "Purchase verification is unavailable. Purchases are paused until access can be confirmed.",
    noProducts: "Products are not available in this store yet.",
    restore: "Restore purchases", manage: "Manage subscription", retry: "Refresh plans",
    restored: "Your purchases have been restored.", noneRestored: "No active store purchase was found for this account.",
    activated: "Your membership is active.", pending: "The store completed the purchase, but access has not been verified. Try Restore purchases.",
    terms: "Terms", privacy: "Privacy", billing: "Subscription information",
    renewal: "The monthly plan renews automatically. Your store shows the final price and confirms payment before purchase.",
  },
  ro: {
    title: "Abonament", current: "Planul actual", monthlyUsage: "Luna aceasta", trip: "Călătorii", places: "Locuri salvate", destinations: "Destinații salvate",
    free: "Gratuit", premium: "Premium lunar", lifetime: "Pe viață", freePrice: "Gratuit", loading: "Se verifică prețurile din magazin…",
    unavailable: "Preț indisponibil", monthlyDetail: "Călătorii și salvări nelimitate. Se reînnoiește lunar; poți anula din setările magazinului.",
    lifetimeDetail: "Călătorii și salvări nelimitate pentru acest cont GoWorth. Plată unică.",
    cancelMonthlyFirst: "Anulează abonamentul lunar în magazin înainte de a cumpăra accesul pe viață. Îl poți cumpăra după ce expiră accesul lunar.",
    freeDetail: "1 călătorie, 5 locuri noi și 5 destinații noi salvate în fiecare lună calendaristică.",
    monthlyAction: "Abonează-te lunar", lifetimeAction: "Obține acces pe viață", active: "Planul tău", paidActive: "Accesul nelimitat este activ.",
    setup: "Plățile sunt în curs de configurare. Prețurile și butoanele de cumpărare vor apărea după conectarea magazinelor.",
    verify: "Verificarea cumpărăturilor nu este disponibilă. Cumpărarea rămâne oprită până când accesul poate fi confirmat.",
    noProducts: "Produsele nu sunt încă disponibile în acest magazin.",
    restore: "Restaurează cumpărăturile", manage: "Gestionează abonamentul", retry: "Reîncarcă planurile",
    restored: "Cumpărăturile au fost restaurate.", noneRestored: "Nu am găsit o cumpărătură activă pentru acest cont.",
    activated: "Abonamentul tău este activ.", pending: "Magazinul a finalizat cumpărarea, dar accesul nu a fost verificat. Încearcă restaurarea cumpărăturilor.",
    terms: "Termeni", privacy: "Confidențialitate", billing: "Informații despre abonament",
    renewal: "Planul lunar se reînnoiește automat. Magazinul afișează prețul final și cere confirmarea înainte de plată.",
  },
} as const;

function Plan({ title, price, detail, current, action, disabled, busy, onPress }: {
  title: string; price: string; detail: string; current: boolean; action?: string;
  disabled?: boolean; busy?: boolean; onPress?: () => void;
}) {
  return <View style={{ borderWidth: 1, borderColor: current ? p.green : p.line, borderRadius: 6, padding: 16, gap: 10, backgroundColor: p.white }}>
    <Row style={{ alignItems: "flex-start", gap: 12 }}>
      <Icon name={current ? "check" : "crown"} color={current ? p.green : p.blue} size={21} />
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}><Heading style={{ fontSize: 17, lineHeight: 22 }}>{title}</Heading><Copy style={{ fontSize: 21, fontWeight: "700" }}>{price}</Copy></View>
    </Row>
    <Copy muted style={{ fontSize: 13, lineHeight: 19 }}>{detail}</Copy>
    {action && onPress && <Button icon={current ? "check" : "wallet"} disabled={disabled || current} busy={busy} onPress={onPress}>{action}</Button>}
  </View>;
}

export function MembershipScreen() {
  const language = useAppLanguage();
  const t = wording[language];
  const { user } = useAuth();
  const userId = user?.id;
  const { plan, monthlyUsage, refreshMembership } = useTravel();
  const [offers, setOffers] = useState<StoreOffers | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [loading, setLoading] = useState(true);
  const [verificationReady, setVerificationReady] = useState(false);
  const [busy, setBusy] = useState<PaidPlan | "restore" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
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
    }
    setLoading(false);
  }, [t.noProducts]);

  useEffect(() => {
    let active = true;
    void load().then((result) => { if (active) apply(result); });
    return () => { active = false; };
  }, [load, apply]);

  const refresh = () => {
    setLoading(true);
    setError("");
    void load().then(apply);
  };

  const buy = async (selected: PaidPlan) => {
    if (!user || !verificationReady || plan === "lifetime" || selected === "lifetime" && plan === "premium") return;
    setBusy(selected);
    setError("");
    setNotice("");
    let storeCompleted = false;
    try {
      const preflight = await refreshMembership();
      if (preflight.plan === "lifetime" || preflight.plan === "premium" && selected === "premium") return;
      if (preflight.plan === "premium" && selected === "lifetime") throw new Error(t.cancelMonthlyFirst);
      if (await purchaseStorePlan(user.id, selected) === "cancelled") return;
      storeCompleted = true;
      const updated = await refreshMembership();
      if (updated.plan === "free") throw new Error(t.pending);
      setMembership(updated);
      setNotice(t.activated);
    } catch (caught) { setError(storeCompleted ? t.pending : caught instanceof Error ? caught.message : t.verify); }
    finally { setBusy(null); }
  };

  const restore = async () => {
    if (!user || !verificationReady) return;
    setBusy("restore");
    setError("");
    setNotice("");
    try {
      const found = await restoreStorePurchases(user.id);
      const updated = await refreshMembership();
      setMembership(updated);
      setNotice(found && updated.plan !== "free" ? t.restored : t.noneRestored);
    } catch (caught) { setError(caught instanceof Error ? caught.message : t.verify); }
    finally { setBusy(null); }
  };

  const price = (value: string | null | undefined) => loading ? t.loading : value ?? t.unavailable;
  const canBuy = configured && verificationReady && !loading;
  const managementUrl = membership?.managementUrl ?? offers?.managementUrl;
  return <Screen active="profile" style={{ gap: 19 }}>
    <Header title={t.title} />
    <View style={{ gap: 6 }}>
      <Copy muted style={{ fontSize: 12, fontWeight: "700" }}>{t.current.toUpperCase()}</Copy>
      <Heading style={{ fontSize: 24, lineHeight: 30 }}>{plan === "free" ? t.free : plan === "premium" ? t.premium : t.lifetime}</Heading>
      {plan !== "free" && <Copy style={{ color: p.green }}>{t.paidActive}</Copy>}
    </View>
    {plan === "free" && <View style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: p.line, paddingVertical: 13, gap: 7 }}>
      <Copy style={{ fontSize: 13, fontWeight: "700" }}>{t.monthlyUsage}</Copy>
      <Row style={{ justifyContent: "space-between" }}><Copy muted>{t.trip}</Copy><Copy>{monthlyUsage.trip}/1</Copy></Row>
      <Row style={{ justifyContent: "space-between" }}><Copy muted>{t.places}</Copy><Copy>{monthlyUsage.place}/5</Copy></Row>
      <Row style={{ justifyContent: "space-between" }}><Copy muted>{t.destinations}</Copy><Copy>{monthlyUsage.destination}/5</Copy></Row>
    </View>}
    <View style={{ gap: 10 }}>
      <Plan title={t.free} price={t.freePrice} detail={t.freeDetail} current={plan === "free"} />
      <Plan title={t.premium} price={price(offers?.monthlyPrice)} detail={t.monthlyDetail} current={plan === "premium"}
        action={plan === "premium" ? t.active : t.monthlyAction} disabled={!canBuy || !offers?.monthlyPrice || !!busy || plan === "lifetime"} busy={busy === "premium"} onPress={() => void buy("premium")} />
      <Plan title={t.lifetime} price={price(offers?.lifetimePrice)} detail={t.lifetimeDetail} current={plan === "lifetime"}
        action={plan === "lifetime" ? t.active : t.lifetimeAction} disabled={!canBuy || !offers?.lifetimePrice || !!busy || plan === "premium"} busy={busy === "lifetime"} onPress={() => void buy("lifetime")} />
    </View>
    {plan === "premium" && <Copy muted style={{ fontSize: 12, lineHeight: 18 }}>{t.cancelMonthlyFirst}</Copy>}
    {!configured && <Copy muted style={{ fontSize: 12, lineHeight: 18 }}>{t.setup}</Copy>}
    {configured && !verificationReady && <Copy style={{ color: p.danger, fontSize: 12, lineHeight: 18 }}>{t.verify}</Copy>}
    {configured && verificationReady && !loading && !offers?.monthlyPrice && !offers?.lifetimePrice && <Copy muted style={{ fontSize: 12 }}>{t.noProducts}</Copy>}
    {!!error && <Copy style={{ color: p.danger, fontSize: 12 }}>{error}</Copy>}
    {!!notice && <Copy style={{ color: p.green, fontSize: 12 }}>{notice}</Copy>}
    {configured && <Button secondary icon="refresh" onPress={refresh} disabled={!!busy} busy={loading}>{t.retry}</Button>}
    {configured && <Button secondary icon="refresh" onPress={() => void restore()} disabled={!verificationReady || !!busy} busy={busy === "restore"}>{t.restore}</Button>}
    {!!managementUrl && <Button secondary icon="wallet" onPress={() => void Linking.openURL(managementUrl)}>{t.manage}</Button>}
    <Copy muted style={{ fontSize: 12, lineHeight: 18 }}>{t.renewal}</Copy>
    <Row style={{ gap: 17, flexWrap: "wrap" }}>
      {(["subscriptions", "terms", "privacy"] as const).map((document) => <Pressable key={document} accessibilityRole="link" onPress={() => router.push({ pathname: "/legal-document", params: { type: document } } as Href)}><Copy style={{ color: p.blue, fontSize: 12 }}>{document === "subscriptions" ? t.billing : document === "terms" ? t.terms : t.privacy}</Copy></Pressable>)}
    </Row>
  </Screen>;
}
