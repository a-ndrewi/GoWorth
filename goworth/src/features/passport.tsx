import { router, useLocalSearchParams, type Href } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { FlipBook } from "@/components/goworth/flip-book";
import { VisaAward } from "@/components/goworth/visa-award";
import { BadgesPage, CoverPage, EmptyPage, IdentityPage, VisaPage, pagePaper, passportWording } from "@/components/goworth/passport-pages";
import { wheelColors } from "@/components/goworth/premium-wheel";
import { Header, Icon, Row, Screen } from "@/components/goworth/ui";
import { themedStyles } from "@/constants/design";
import { formatMessage } from "@/data/i18n";
import { useAppLanguage } from "@/data/formatting";
import { memberNumber } from "@/features/membership";
import { useAuth } from "@/state/auth-context";
import { useStyles, useThemePreference } from "@/state/theme-context";
import { useTravel } from "@/state/travel-context";
import { useVisas } from "@/state/visas-context";

const wording = {
  en: {
    title: "My passport", visas: "{count} visas", visa: "1 visa", page: "Page {page} of {count}", hint: "Swipe the page to turn it",
    lockedTitle: "Your visas are kept", lockedBody: "Every trip you finish still earns its visa. Premium opens the passport so you can see them.", unlock: "Unlock with Premium",
  },
  ro: {
    title: "Pașaportul meu", visas: "{count} vize", visa: "1 viză", page: "Pagina {page} din {count}", hint: "Trage pagina ca s-o întorci",
    lockedTitle: "Vizele tale sunt păstrate", lockedBody: "Fiecare călătorie încheiată îți aduce viza. Premium deschide pașaportul ca să le vezi.", unlock: "Deblochează cu Premium",
  },
} as const;

/**
 * The visa passport as a book: cover, identity page, one page per country visited, and a blank page for the next
 * one. Free accounts collect visas the same way; their pages are veiled until Premium.
 */
export function PassportScreen() {
  const styles = useStyles(stylesSheet);
  const language = useAppLanguage();
  const t = wording[language];
  const pageText = passportWording[language];
  const dark = useThemePreference().scheme === "dark";
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { user } = useAuth();
  const { plan, profile, avatarUrl } = useTravel();
  const { visas } = useVisas();
  const { open } = useLocalSearchParams<{ open?: string }>();
  const locked = plan === "free";
  const holder = (profile.name || "Traveller").toUpperCase();
  const member = memberNumber(user?.id);
  // The book is sized to fit between the header and the tab bar, so the screen never scrolls: a scrolling screen
  // took the drag away from the page as soon as the finger drifted up or down.
  const width = Math.round(Math.min(460, screenWidth - 40, (screenHeight - 340) / 1.42));
  const height = Math.round(width * 1.42);
  const unlock = () => router.push({ pathname: "/membership", params: { reason: "passport" } } as Href);

  const pages = useMemo(() => [
    <CoverPage key="cover" t={pageText} />,
    <IdentityPage key="identity" t={pageText} language={language} dark={dark} width={width} holder={holder} memberNumber={member} visas={visas} photo={avatarUrl} />,
    <BadgesPage key="badges" visas={visas} language={language} dark={dark} width={width} locked={locked} onUnlock={() => router.push({ pathname: "/membership", params: { reason: "stamps" } } as Href)} />,
    ...visas.map((visa) => <VisaPage key={visa.countryCode} visa={visa} t={pageText} language={language} dark={dark} width={width}
      holder={holder} memberNumber={member} locked={locked} onUnlock={unlock} />),
    <EmptyPage key="empty" t={pageText} dark={dark} width={width} />,
  ], [visas, pageText, language, dark, width, holder, member, locked, avatarUrl]);

  // Opened from the award, the book starts at the new visa's page.
  const [index, setIndex] = useState(() => {
    const at = open ? visas.findIndex((visa) => visa.countryCode === open) : -1;
    return at >= 0 ? at + 3 : 0;
  });
  const paper = pagePaper(dark);

  return <Screen active="profile" scroll={false} style={{ gap: 14 }}>
    <Header title={t.title} right={<View style={styles.count}><Text style={styles.countText}>
      {visas.length === 1 ? t.visa : formatMessage(t.visas, { count: visas.length }, language)}</Text></View>} />
    <View style={{ alignItems: "center", paddingTop: 6 }}>
      <FlipBook pages={pages} width={width} height={height} index={index} onIndexChange={setIndex}
        backColor={paper.line} edgeColor={dark ? "#24304A" : "#E9E1CC"} />
    </View>
    <View style={{ alignItems: "center", gap: 6 }}>
      <Row style={{ gap: 6 }}>
        {pages.length <= 12
          ? pages.map((_, page) => <View key={page} style={[styles.dot, page === index && styles.dotOn]} />)
          : <Text style={styles.page}>{formatMessage(t.page, { page: index + 1, count: pages.length }, language)}</Text>}
      </Row>
      <Text style={styles.hint}>{t.hint}</Text>
    </View>
    {locked && visas.length > 0 && <Pressable accessibilityRole="button" accessibilityHint={t.lockedBody} onPress={unlock}
      style={({ pressed }) => [styles.unlock, pressed && { opacity: 0.85 }]}>
      <Icon name="crown" size={16} color={wheelColors.goldInk} />
      <Text style={styles.unlockText}>{t.lockedTitle} · {t.unlock}</Text>
    </Pressable>}
  </Screen>;
}

/** Shows newly issued visas over the app once it is on its tabs, then marks them seen whichever way it is closed. */
export function VisaAwardHost({ ready }: { ready: boolean }) {
  const language = useAppLanguage();
  const dark = useThemePreference().scheme === "dark";
  const { user } = useAuth();
  const { plan, profile } = useTravel();
  const { pending, acknowledge } = useVisas();
  if (!ready || !pending.length) return null;
  const close = (then?: () => void) => { void acknowledge(); then?.(); };
  return <VisaAward visas={pending} language={language} dark={dark} holder={(profile.name || "Traveller").toUpperCase()}
    memberNumber={memberNumber(user?.id)} locked={plan === "free"}
    onFinish={() => close()}
    onOpenPassport={() => close(() => router.push({ pathname: "/passport", params: { open: pending.at(-1)?.countryCode } } as Href))}
    onUnlock={() => close(() => router.push({ pathname: "/membership", params: { reason: "passport" } } as Href))} />;
}

const stylesSheet = themedStyles((p) => ({
  count: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: p.orangeSoft },
  countText: { color: p.ink, fontSize: 12, fontWeight: "800" },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: p.line },
  dotOn: { width: 18, backgroundColor: p.ink },
  page: { color: p.muted, fontSize: 12, fontWeight: "700" },
  hint: { color: p.muted, fontSize: 12, textAlign: "center" },
  unlock: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, alignSelf: "center", maxWidth: "100%", paddingHorizontal: 18, paddingVertical: 10, minHeight: 44, borderRadius: 14, backgroundColor: wheelColors.gold },
  unlockText: { flexShrink: 1, color: wheelColors.goldInk, fontSize: 14, fontWeight: "800", textAlign: "center" },
}));
