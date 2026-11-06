import { Image } from "expo-image";
import { useMemo } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { Icon } from "@/components/goworth/ui";
import { wheelColors } from "@/components/goworth/premium-wheel";
import { countryFlag, countryForCode } from "@/data/geography";
import { translate } from "@/data/i18n";
import { visaMrz, visaStyle } from "@/data/visa-style";
import type { AppLanguage } from "@/data/formatting";
import type { Visa } from "@/lib/visas";
import { passportBadges } from "@/data/passport-extras";

export const passportWording = {
  en: {
    passport: "Passport", identity: "Identity page", name: "Name", member: "Member", countries: "Countries visited",
    firstVisa: "First visa", none: "—", of: "of", visa: "Visa", issued: "Issued", entries: "Entries", cities: "Cities",
    holder: "Holder", entry: "Entry", emptyTitle: "Your next visa goes here",
    emptyBody: "A visa is issued the day after a trip ends, for every country it passed through.",
    locked: "Kept for you", unlock: "Unlock with Premium",
  },
  ro: {
    passport: "Pașaport", identity: "Pagină de identitate", name: "Nume", member: "Membru", countries: "Țări vizitate",
    firstVisa: "Prima viză", none: "—", of: "din", visa: "Viză", issued: "Emisă", entries: "Intrări", cities: "Orașe",
    holder: "Titular", entry: "Intrare", emptyTitle: "Următoarea viză apare aici",
    emptyBody: "O viză se emite a doua zi după ce se termină o călătorie, pentru fiecare țară prin care a trecut.",
    locked: "Păstrată pentru tine", unlock: "Deblochează cu Premium",
  },
} as const;
type Wording = (typeof passportWording)[keyof typeof passportWording];

const mono = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });
const serif = Platform.select({ ios: "Georgia", android: "serif", default: "serif" });

/** Paper and ink for the inner pages: cream stock in the light theme, night paper in the dark one. */
export function pagePaper(dark: boolean) {
  return dark
    ? { paper: "#172033", ink: "#E6EBF4", muted: "#9AA4B5", line: "#2A3550", faint: "#3A4660" }
    : { paper: "#FBF7EC", ink: "#24324A", muted: "#8A94A6", line: "#E7DFC9", faint: "#C3CAD6" };
}

const locale = (language: AppLanguage) => language === "ro" ? "ro-RO" : "en-US";
const shortDate = (value: string, language: AppLanguage) =>
  new Date(`${value}T12:00:00`).toLocaleDateString(locale(language), { day: "2-digit", month: "short", year: "numeric" });

/** Fine interlaced waves across the top of a page, the security print of a real visa. */
export function Guilloche({ width, color, wave, rows = 10 }: { width: number; color: string; wave: number; rows?: number }) {
  const paths = useMemo(() => Array.from({ length: rows }, (_, row) => {
    let d = `M 0 ${14 + row * 9}`;
    for (let x = 0; x <= width; x += 6) {
      const y = 14 + row * 9 + Math.sin(x / 14 + row * 0.7 + wave * 6) * 5 * Math.cos(x / 40 + row + wave * 3);
      d += ` L ${x} ${y.toFixed(1)}`;
    }
    return d;
  }), [width, wave, rows]);
  return <Svg width={width} height={rows * 9 + 24} style={StyleSheet.absoluteFill} pointerEvents="none">
    {paths.map((d, index) => <Path key={index} d={d} stroke={color} strokeWidth={0.8} strokeOpacity={0.45} fill="none" />)}
  </Svg>;
}

function Field({ label, value, c }: { label: string; value: string; c: ReturnType<typeof pagePaper> }) {
  return <View style={{ width: "50%", paddingRight: 8, marginBottom: 10 }}>
    <Text style={{ color: c.muted, fontSize: 11 }}>{label}</Text>
    <Text numberOfLines={2} style={{ color: c.ink, fontSize: 13, fontWeight: "700", marginTop: 1 }}>{value}</Text>
  </View>;
}

export function CoverPage({ t }: { t: Wording }) {
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: wheelColors.navy, alignItems: "center", justifyContent: "center", gap: 16 }]}>
    <View style={{ position: "absolute", top: 14, left: 14, right: 14, bottom: 14, borderRadius: 10, borderWidth: 1, borderColor: "rgba(245,196,81,0.35)" }} />
    <View style={{ width: 86, height: 86, borderRadius: 43, borderWidth: 2, borderColor: wheelColors.gold, alignItems: "center", justifyContent: "center" }}>
      <Icon name="plane" size={36} color={wheelColors.gold} />
    </View>
    <Text style={{ color: wheelColors.gold, fontSize: 22, fontWeight: "800", letterSpacing: 0.5 }}>GoWorth</Text>
    <Text style={{ color: wheelColors.goldLight, fontSize: 12, fontWeight: "600", letterSpacing: 4 }}>{t.passport.toUpperCase()}</Text>
  </View>;
}

/** The rare stamps page: milestones pressed in colour once earned, ghosted with their progress until then. */
export function BadgesPage({ visas, language, dark, width, locked, onUnlock }: {
  visas: Visa[]; language: AppLanguage; dark: boolean; width: number; locked: boolean; onUnlock: () => void;
}) {
  const c = pagePaper(dark);
  const badges = passportBadges(visas);
  const size = Math.min(92, (width - 64) / 3);
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: c.paper, padding: 18, paddingTop: 44 }]}>
    <Guilloche width={width} color={c.faint} wave={0.35} rows={4} />
    <Text style={[styles.kicker, { color: c.muted }]}>{(language === "ro" ? "Ștampile rare" : "Rare stamps").toUpperCase()}</Text>
    <Text style={{ position: "absolute", top: 16, right: 16, color: c.muted, fontSize: 11, fontWeight: "800" }}>{`${badges.filter((badge) => badge.earned).length}/${badges.length}`}</Text>
    <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 12, opacity: locked ? 0.35 : 1 }}>
      {badges.map((badge, index) => <View key={badge.id} style={{ width: size, alignItems: "center", gap: 4, transform: [{ rotate: `${((index * 37) % 15) - 7}deg` }] }}>
        <View style={{ width: size * 0.78, height: size * 0.78, borderRadius: size, borderWidth: 2.5, borderStyle: badge.earned ? "solid" : "dashed",
          borderColor: badge.earned ? badge.ink : c.faint, alignItems: "center", justifyContent: "center", backgroundColor: badge.earned ? `${badge.ink}14` : "transparent" }}>
          <View style={{ position: "absolute", top: 4, left: 4, right: 4, bottom: 4, borderRadius: size, borderWidth: 1, borderColor: badge.earned ? badge.ink : c.faint, opacity: 0.6 }} />
          <Icon name={badge.icon} size={size * 0.3} color={badge.earned ? badge.ink : c.faint} />
        </View>
        <Text numberOfLines={1} style={{ color: badge.earned ? c.ink : c.muted, fontSize: 10.5, fontWeight: "800", textAlign: "center" }}>{badge.title[language]}</Text>
        <Text numberOfLines={1} style={{ color: c.muted, fontSize: 9.5, textAlign: "center" }}>{badge.earned ? badge.detail[language] : badge.progress}</Text>
      </View>)}
    </View>
    {locked && <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "flex-end", paddingBottom: 26 }]}>
      <Pressable accessibilityRole="button" onPress={onUnlock} style={styles.unlock}>
        <Icon name="crown" size={14} color={wheelColors.goldInk} />
        <Text style={{ color: wheelColors.goldInk, fontWeight: "800", fontSize: 13 }}>{passportWording[language].unlock}</Text>
      </Pressable>
    </View>}
  </View>;
}

export function IdentityPage({ t, language, dark, width, holder, memberNumber, visas, photo }: {
  t: Wording; language: AppLanguage; dark: boolean; width: number; holder: string; memberNumber: string; visas: Visa[]; photo?: string | null;
}) {
  const c = pagePaper(dark);
  const first = visas[0];
  const lines = visaMrz("GW", holder, memberNumber, visas.length, 36, "P");
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: c.paper }]}>
    <Guilloche width={width} color={dark ? "#7FA2FF" : "#2457E6"} wave={0.3} />
    <Text style={[styles.kicker, { color: dark ? "#7FA2FF" : "#2457E6" }]}>{t.identity.toUpperCase()}</Text>
    <View style={{ position: "absolute", top: 118, left: 16, right: 16, flexDirection: "row", gap: 14 }}>
      <View style={{ width: 78, height: 98, borderRadius: 8, backgroundColor: dark ? "#1E2A40" : "#E8EEFF", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {photo
          ? <Image source={{ uri: photo }} contentFit="cover" style={StyleSheet.absoluteFill} />
          : <Icon name="person" size={34} color={dark ? "#7FA2FF" : "#2457E6"} />}
      </View>
      <View style={{ flex: 1, flexDirection: "row", flexWrap: "wrap" }}>
        <View style={{ width: "100%", marginBottom: 10 }}>
          <Text style={{ color: c.muted, fontSize: 11 }}>{t.name}</Text>
          <Text numberOfLines={1} style={{ color: c.ink, fontSize: 15, fontWeight: "800", marginTop: 1 }}>{holder}</Text>
        </View>
        <View style={{ width: "100%", marginBottom: 10 }}>
          <Text style={{ color: c.muted, fontSize: 11 }}>{t.member}</Text>
          <Text style={{ color: c.ink, fontSize: 13, fontWeight: "700", fontFamily: mono, marginTop: 1 }}>{memberNumber}</Text>
        </View>
      </View>
    </View>
    <View style={{ position: "absolute", top: 234, left: 16, right: 16, flexDirection: "row", flexWrap: "wrap" }}>
      <Field c={c} label={t.countries} value={`${visas.length} ${t.of} 195`} />
      <Field c={c} label={t.firstVisa} value={first ? shortDate(first.lastEntry, language) : t.none} />
    </View>
    <Mrz lines={lines} c={c} />
  </View>;
}

function Mrz({ lines, c }: { lines: string[]; c: ReturnType<typeof pagePaper> }) {
  return <View style={{ position: "absolute", left: 16, right: 16, bottom: 14 }}>
    {lines.map((line) => <Text key={line} numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: mono, fontSize: 11, lineHeight: 15, color: c.muted, letterSpacing: 0.4 }}>{line}</Text>)}
  </View>;
}

/** The entry stamp pressed over a visa: a double ring with the country, the date and "Entry". */
export function EntryStamp({ code, date, ink, tilt, size = 92, language, t }: {
  code: string; date: string; ink: string; tilt: number; size?: number; language: AppLanguage; t: Wording;
}) {
  const day = new Date(`${date}T12:00:00`).toLocaleDateString(locale(language), { day: "2-digit", month: "short" }).toUpperCase();
  return <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center", transform: [{ rotate: `${tilt}deg` }] }}>
    <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
      <Circle cx={size / 2} cy={size / 2} r={size / 2 - 2} stroke={ink} strokeWidth={2.5} fill="none" strokeOpacity={0.85} />
      <Circle cx={size / 2} cy={size / 2} r={size / 2 - 8} stroke={ink} strokeWidth={1} strokeDasharray="3 3" fill="none" strokeOpacity={0.8} />
    </Svg>
    <Text style={{ color: ink, fontSize: 12, fontWeight: "900", letterSpacing: 1.5, opacity: 0.9 }}>{code}</Text>
    <Text style={{ color: ink, fontSize: 11, fontWeight: "700", opacity: 0.9 }}>{day}</Text>
    <Text style={{ color: ink, fontSize: 9, fontWeight: "800", letterSpacing: 1.2, opacity: 0.9 }}>{t.entry.toUpperCase()}</Text>
  </View>;
}

/**
 * A country's visa: security print in the continent's ink, flag, the country set large, issue details, the
 * machine lines, and an entry stamp for every trip there. `stampless` leaves the stamps off so the award
 * animation can press the newest one itself. A locked visa (Free plan) is kept but veiled.
 */
export function VisaPage({ visa, t, language, dark, width, holder, memberNumber, locked, onUnlock, stampless }: {
  visa: Visa; t: Wording; language: AppLanguage; dark: boolean; width: number; holder: string; memberNumber: string;
  locked?: boolean; onUnlock?: () => void; stampless?: boolean;
}) {
  const c = pagePaper(dark);
  const country = countryForCode(visa.countryCode);
  const look = visaStyle(visa.countryCode, country?.continent, dark);
  const name = translate(country?.name ?? visa.countryCode, language);
  const stamps = visa.stamps.slice(-3);
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: c.paper }]}>
    <Guilloche width={width} color={look.ink} wave={look.wave} />
    <View style={{ position: "absolute", top: 14, left: 16, right: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <Text style={[styles.kickerInline, { color: look.ink }]}>{language === "ro" ? `${t.visa.toUpperCase()} · VISA` : "VISA"}</Text>
      <Text style={{ fontSize: 26 }}>{countryFlag(visa.countryCode)}</Text>
    </View>
    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ position: "absolute", top: 104, left: 16, right: 16, fontFamily: serif, fontSize: 34, color: c.ink }}>{name}</Text>
    <View style={{ position: "absolute", top: 156, left: 16, right: 16, flexDirection: "row", flexWrap: "wrap" }}>
      <Field c={c} label={t.issued} value={shortDate(visa.lastEntry, language)} />
      <Field c={c} label={t.entries} value={String(visa.entries)} />
      <Field c={c} label={t.cities} value={visa.cities.slice(0, 3).join(", ") || t.none} />
      <Field c={c} label={t.holder} value={holder} />
    </View>
    {!stampless && stamps.map((stamp, index) => <View key={`${stamp.date}-${index}`} pointerEvents="none"
      style={{ position: "absolute", right: 14 + index * 34, bottom: 52 + (index % 2) * 26 }}>
      <EntryStamp code={visa.countryCode} date={stamp.date} ink={look.stampInk} tilt={look.stampTilt + index * 9} language={language} t={t} />
    </View>)}
    <Mrz lines={visaMrz(visa.countryCode, holder, memberNumber, visa.entries)} c={c} />
    {locked && <View style={[StyleSheet.absoluteFill, { backgroundColor: dark ? "rgba(23,32,51,0.82)" : "rgba(251,247,236,0.84)", alignItems: "center", justifyContent: "center", gap: 10, padding: 24 }]}>
      <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: wheelColors.gold, alignItems: "center", justifyContent: "center" }}>
        <Icon name="lock" size={24} color={wheelColors.goldInk} />
      </View>
      <Text style={{ color: c.ink, fontSize: 17, fontWeight: "800", textAlign: "center" }}>{name}</Text>
      <Text style={{ color: c.muted, fontSize: 13, textAlign: "center" }}>{t.locked}</Text>
      {onUnlock && <Pressable accessibilityRole="button" onPress={onUnlock} style={({ pressed }) => [styles.unlock, pressed && { opacity: 0.8 }]}>
        <Icon name="crown" size={15} color={wheelColors.goldInk} />
        <Text style={{ color: wheelColors.goldInk, fontSize: 14, fontWeight: "800" }}>{t.unlock}</Text>
      </Pressable>}
    </View>}
  </View>;
}

export function EmptyPage({ t, dark, width }: { t: Wording; dark: boolean; width: number }) {
  const c = pagePaper(dark);
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: c.paper, alignItems: "center", justifyContent: "center", gap: 12, padding: 28 }]}>
    <Guilloche width={width} color={c.faint} wave={0.7} />
    <View style={{ width: 104, height: 104, borderRadius: 52, borderWidth: 2, borderStyle: "dashed", borderColor: c.faint, alignItems: "center", justifyContent: "center" }}>
      <Icon name="globe" size={38} color={c.faint} />
    </View>
    <Text style={{ color: c.ink, fontSize: 16, fontWeight: "800", textAlign: "center" }}>{t.emptyTitle}</Text>
    <Text style={{ color: c.muted, fontSize: 13, lineHeight: 19, textAlign: "center" }}>{t.emptyBody}</Text>
  </View>;
}

const styles = StyleSheet.create({
  kicker: { position: "absolute", top: 16, left: 16, fontSize: 11, fontWeight: "800", letterSpacing: 2.5 },
  kickerInline: { fontSize: 11, fontWeight: "800", letterSpacing: 2.5 },
  unlock: {
    flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6, paddingHorizontal: 16, height: 42, borderRadius: 14,
    backgroundColor: wheelColors.gold,
  },
});
