import { useRef, useState, type Ref } from "react";
import { Platform, StyleSheet, Text, View, type ViewInstance } from "react-native";
import { Image } from "expo-image";
import { photos } from "@/constants/design";
import { countryFlag, countryForCode } from "@/data/geography";
import type { AppLanguage } from "@/data/formatting";
import { translate } from "@/data/i18n";
import { visaMrz, visaStyle } from "@/data/visa-style";
import type { Visa } from "@/lib/visas";
import { canShareImages, shareViewAsImage } from "@/lib/share-image";
import { useTimedMessage } from "@/hooks/use-timed-message";
import { usePalette, useThemePreference } from "@/state/theme-context";
import { Button, Chip, Copy, Row, Sheet } from "@/components/goworth/ui";
import { EntryStamp, Guilloche, pagePaper, passportWording } from "@/components/goworth/passport-pages";
import { STORY_SIZE } from "@/components/goworth/trip-story-card";

const serif = Platform.select({ ios: "Georgia", android: "serif", default: "serif" });
const mono = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });
const NAVY = "#1F3A68";
/** Navy on the cream paper; on the dark paper a light blue, with a deeper pill behind the logo. */
const inks = { light: { accent: NAVY, pill: NAVY }, dark: { accent: "#9DB8FF", pill: "#2B3D6B" } } as const;
const STAMP_SLOTS = 12;

const wording = {
  en: { kicker: "Passport", visited: "countries visited", visitedOne: "country visited", countries: "Countries", cities: "Cities", stamps: "Stamps", more: "more", cta: "Collect yours on GoWorth" },
  ro: { kicker: "Pașaport", visited: "țări vizitate", visitedOne: "țară vizitată", countries: "Țări", cities: "Orașe", stamps: "Ștampile", more: "încă", cta: "Colecționează-le pe GoWorth" },
};

/** The whole passport on one story card: how many countries, an entry stamp for each, and the flags in a row. */
export function PassportStoryCard({ ref, visas, holder, member, language, dark = false }: {
  ref?: Ref<ViewInstance>; visas: Visa[]; holder: string; member: string; language: AppLanguage; dark?: boolean;
}) {
  const t = wording[language];
  const c = pagePaper(dark);
  const ink = inks[dark ? "dark" : "light"];
  const ordered = [...visas].sort((a, b) => a.firstEntry.localeCompare(b.firstEntry));
  // Twelve stamps fit the page; past that the last slot counts the rest.
  const shown = ordered.length > STAMP_SLOTS ? ordered.slice(0, STAMP_SLOTS - 1) : ordered;
  const extra = ordered.length - shown.length;
  const cities = new Set(visas.flatMap((visa) => visa.cities)).size;
  const stamps = visas.reduce((sum, visa) => sum + visa.stamps.length, 0);
  // The stamps share the band between the count and the flags: up to four large, then smaller in three or four columns.
  const slots = shown.length + (extra ? 1 : 0);
  const columns = slots <= 4 ? 2 : slots <= 9 ? 3 : 4;
  const size = columns === 2 ? 108 : 74;
  return <View ref={ref} collapsable={false} style={[STORY_SIZE, { overflow: "hidden", backgroundColor: c.paper }]}>
    <Guilloche width={STORY_SIZE.width} color={ink.accent} wave={0.31} rows={12} />
    <View style={styles.header}>
      <View style={[styles.brand, { backgroundColor: ink.pill }]}>
        <Image source={photos.brandMark} style={{ width: 18, height: 18 }} contentFit="contain" />
        <Text style={styles.brandText}>GoWorth</Text>
      </View>
      <Text style={[styles.kicker, { color: ink.accent }]}>{t.kicker.toUpperCase()}</Text>
    </View>
    <View style={{ position: "absolute", top: 118, left: 28, right: 24 }}>
      <Text style={{ color: c.ink, fontFamily: serif, fontSize: 64, lineHeight: 68 }}>{visas.length}</Text>
      <Text style={{ color: c.ink, fontFamily: serif, fontSize: 24 }}>{visas.length === 1 ? t.visitedOne : t.visited}</Text>
      <Text numberOfLines={1} style={{ color: c.muted, fontSize: 13, fontWeight: "700", marginTop: 6 }}>{holder}</Text>
    </View>
    <View style={[styles.grid, { top: 250 }]}>
      {shown.map((visa, index) => {
        const look = visaStyle(visa.countryCode, countryForCode(visa.countryCode)?.continent, dark);
        return <View key={visa.countryCode} style={[styles.cell, { width: `${100 / columns}%`, height: size + 2 }]}>
          <EntryStamp code={visa.countryCode} date={visa.firstEntry} ink={look.stampInk} tilt={look.stampTilt + (index % 3) * 6}
            size={size} language={language} t={passportWording[language]} />
        </View>;
      })}
      {!!extra && <View style={[styles.cell, { width: `${100 / columns}%`, height: size + 2 }]}>
        <View style={[styles.more, { borderColor: ink.accent, width: size - 10, height: size - 10, borderRadius: (size - 10) / 2 }]}>
          <Text style={{ color: ink.accent, fontSize: 22, fontWeight: "900" }}>+{extra}</Text>
          <Text style={{ color: ink.accent, fontSize: 10, fontWeight: "800", letterSpacing: 1 }}>{t.more.toUpperCase()}</Text>
        </View>
      </View>}
    </View>
    <View style={styles.bottom}>
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 20, letterSpacing: 2 }}>{ordered.slice(0, 16).map((visa) => countryFlag(visa.countryCode)).join(" ")}</Text>
      <View style={styles.stats}>
        {[[t.countries, visas.length], [t.cities, cities], [t.stamps, stamps]].map(([label, value]) => <View key={label} style={{ flex: 1 }}>
          <Text style={{ color: c.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1 }}>{String(label).toUpperCase()}</Text>
          <Text style={{ color: c.ink, fontSize: 20, fontWeight: "900" }}>{value}</Text>
        </View>)}
      </View>
      {visaMrz("GW", holder, member, visas.length, 36, "P").map((line) => <Text key={line} numberOfLines={1} adjustsFontSizeToFit
        style={{ color: c.ink, fontFamily: mono, fontSize: 10, letterSpacing: 1 }}>{line}</Text>)}
      <Text style={{ color: c.ink, fontSize: 10, fontWeight: "700", marginTop: 4 }}>{`${t.cta}  ·  @goworth.app`}</Text>
    </View>
  </View>;
}

const PREVIEW = 0.62;

/** The passport card with a preview and one share button; opened only for Premium, whose visas are unlocked. */
export function PassportShareSheet({ visible, onClose, visas, holder, member, language }: {
  visible: boolean; onClose: () => void; visas: Visa[]; holder: string; member: string; language: AppLanguage;
}) {
  const p = usePalette();
  const card = useRef<ViewInstance>(null);
  // The card starts on the paper that matches the app's theme; either can be shared.
  const [dark, setDark] = useState(useThemePreference().scheme === "dark");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useTimedMessage();
  const share = async () => {
    setBusy(true); setError("");
    try { await shareViewAsImage(card, `goworth-passport-${visas.length}`); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not share the card."); }
    finally { setBusy(false); }
  };
  return <Sheet visible={visible} title={translate("Share your passport", language)} onClose={() => { if (!busy) onClose(); }}>
    {visible && <View style={[styles.frame, { width: STORY_SIZE.width * PREVIEW, height: STORY_SIZE.height * PREVIEW }]}>
      <View style={styles.scaled}><PassportStoryCard ref={card} visas={visas} holder={holder} member={member} language={language} dark={dark} /></View>
    </View>}
    <Row style={{ gap: 8, justifyContent: "center" }}>
      <Chip selected={!dark} onPress={() => setDark(false)}>Light</Chip>
      <Chip selected={dark} onPress={() => setDark(true)}>Dark</Chip>
    </Row>
    {!!error && <Copy style={{ color: p.danger, fontSize: 13 }}>{error}</Copy>}
    {canShareImages ? <Button icon="share" busy={busy} onPress={() => void share()}>Share</Button>
      : <Copy muted style={{ fontSize: 13, textAlign: "center" }}>Take a screenshot of the card to post it.</Copy>}
  </Sheet>;
}

const styles = StyleSheet.create({
  header: { position: "absolute", top: 28, left: 24, right: 24, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brand: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  brandText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800", letterSpacing: 0.2 },
  kicker: { fontSize: 12, fontWeight: "900", letterSpacing: 2 },
  grid: { position: "absolute", left: 16, right: 16, flexDirection: "row", flexWrap: "wrap" },
  cell: { alignItems: "center", justifyContent: "center" },
  more: { borderWidth: 2, borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
  bottom: { position: "absolute", left: 28, right: 24, bottom: 22, gap: 2 },
  stats: { flexDirection: "row", marginTop: 8, marginBottom: 8 },
  frame: { alignSelf: "center", borderRadius: 18, overflow: "hidden" },
  scaled: { width: STORY_SIZE.width, height: STORY_SIZE.height, transform: [{ scale: PREVIEW }], transformOrigin: "top left" },
});
