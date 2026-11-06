import { useEffect, useState, type Ref } from "react";
import { Platform, StyleSheet, Text, View, type ViewInstance } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { photos } from "@/constants/design";
import { destinations, tripDays, type Activity, type Trip } from "@/data/travel";
import { uniqueRouteStops } from "@/data/trip-route";
import { countries, countryFlag, countryForCode } from "@/data/geography";
import { translate } from "@/data/i18n";
import type { AppLanguage } from "@/data/formatting";
import { visaMrz, visaStyle } from "@/data/visa-style";
import { findPlacePhoto, photoSource } from "@/data/place-photo";
import { EntryStamp, Guilloche, pagePaper, passportWording } from "@/components/goworth/passport-pages";
import Svg, { Circle, Line, Path, Text as SvgText } from "react-native-svg";
import { arcPath, routeLayout, storyCountries, storyHeadline, storyPalette } from "@/utils/trip-story";

/** The card is laid out at this size and captured at the screen's pixel density: 1080 × 1920 on a 3× phone, a full story. */
export const STORY_SIZE = { width: 360, height: 640 } as const;
export type StoryTheme = "postcard" | "route" | "passport";
/** Styles shared only with Premium; Free sees them in the preview and is offered Premium to post them. */
export const premiumThemes: StoryTheme[] = ["route"];

const mono = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });
const serif = Platform.select({ ios: "Georgia", android: "serif", default: "serif" });

const wording = {
  en: { record: "Travel record", days: "Days", cities: "Cities", places: "Places", spent: "Spent", entry: "Entry", exit: "Exit", route: "Route", cta: "Plan yours on GoWorth" },
  ro: { record: "Jurnal de călătorie", days: "Zile", cities: "Orașe", places: "Locuri", spent: "Cheltuit", entry: "Intrare", exit: "Ieșire", route: "Traseu", cta: "Planifică-ți călătoria pe GoWorth" },
};

const codeForName = (name: string) => {
  const needle = name.toLocaleLowerCase();
  return countries.find((country) => country.name.toLocaleLowerCase() === needle)?.code;
};

/** The countries, cities and colours a card shows, shared by the card and the sheet that offers it. */
export function storyFacts(trip: Trip, language: AppLanguage) {
  const stops = uniqueRouteStops(trip);
  const visited = storyCountries(stops, codeForName);
  const lead = visited[0];
  const continent = lead ? countryForCode(lead.code)?.continent : undefined;
  const look = visaStyle(lead?.code ?? "GW", continent, false);
  return {
    stops, countries: visited, look,
    palette: storyPalette(lead?.code ?? "", look.ink),
    headline: storyHeadline(visited.map((country) => translate(countryForCode(country.code)?.name ?? country.name, language)), language)
      || translate(stops[0]?.name ?? "", language),
  };
}

/**
 * A trip as a 9:16 story card, coloured after the country it went to. The postcard lays the destination photo over
 * the flag's colours; the passport prints it as a visa page with an entry stamp for every country.
 */
export function TripStoryCard({ ref, trip, activities, spent, showSpent, theme, language, holder, onReady }: {
  ref?: Ref<ViewInstance>;
  trip: Trip;
  activities: Activity[];
  /** Already formatted in the traveller's currency. */
  spent: string;
  showSpent: boolean;
  theme: StoryTheme;
  language: AppLanguage;
  holder: string;
  /** Called once everything the card shows has loaded, so a capture never catches a blank photo. */
  onReady?: () => void;
}) {
  const t = wording[language];
  const facts = storyFacts(trip, language);
  const days = tripDays(trip.start, trip.end);
  const places = new Set(activities.map((activity) => activity.placeId || activity.name)).size;
  const locale = language === "ro" ? "ro-RO" : "en-US";
  const date = (value: string, withYear: boolean) => new Date(`${value}T12:00:00Z`).toLocaleDateString(locale,
    { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });
  const dates = `${date(trip.start, trip.start.slice(0, 4) !== trip.end.slice(0, 4))} – ${date(trip.end, true)}`;
  const route = facts.stops.slice(0, 4).map((stop) => translate(stop.name, language)).join("  →  ") + (facts.stops.length > 4 ? `  +${facts.stops.length - 4}` : "");
  const stats = [
    { label: t.days, value: String(days) },
    { label: t.cities, value: String(facts.stops.length) },
    ...(places ? [{ label: t.places, value: String(places) }] : []),
    ...(showSpent ? [{ label: t.spent, value: spent }] : []),
  ].slice(0, 4);
  const mrz = visaMrz(facts.countries[0]?.code ?? "GW", holder, trip.start.replace(/-/g, ""), facts.countries.length || 1);
  const stampWording = passportWording[language];
  const stamps = facts.countries.slice(0, 3);

  return <View ref={ref} collapsable={false} style={[STORY_SIZE, { overflow: "hidden", backgroundColor: facts.palette.deep }]}>
    {theme === "postcard" ? <Postcard trip={trip} facts={facts} onReady={onReady} />
      : theme === "route" ? <RouteMap facts={facts} language={language} onReady={onReady} />
        : <PassportPaper facts={facts} onReady={onReady} />}

    {/* The flag runs down the left edge like the security stripe of a visa. */}
    <View style={styles.stripe}>
      {facts.palette.stripe.map((color, index) => <View key={index} style={{ flex: 1, backgroundColor: color }} />)}
    </View>

    {theme !== "passport" ? <>
      <View style={styles.topBar}>
        <View style={styles.brand}>
          <Image source={photos.brandMark} style={{ width: 18, height: 18 }} contentFit="contain" />
          <Text style={styles.brandText}>GoWorth</Text>
        </View>
        <View style={styles.flagBubble}><Text style={{ fontSize: 26 }}>{countryFlag(facts.countries[0]?.code ?? "")}</Text></View>
      </View>
      {theme === "postcard" && stamps.map((country, index) => <View key={country.code} pointerEvents="none"
        style={{ position: "absolute", right: 18 + index * 40, top: 228 + (index % 2) * 34 }}>
        <EntryStamp code={country.code} date={trip.start} ink="#FFFFFF" tilt={visaStyle(country.code, undefined, false).stampTilt + index * 11}
          size={96} language={language} t={stampWording} />
      </View>)}
      <View style={styles.postcardText}>
        <Text style={styles.kicker}>{`${t.record.toUpperCase()} · ${trip.end.slice(0, 4)}`}</Text>
        <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6} style={styles.headline}>{facts.headline}</Text>
        <Text numberOfLines={2} style={styles.route}>{route}</Text>
        <Text style={styles.dates}>{dates}</Text>
        <View style={styles.stats}>
          {stats.map((stat) => <View key={stat.label} style={styles.stat}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={styles.statValue}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label.toUpperCase()}</Text>
          </View>)}
        </View>
      </View>
      <Footer mrz={mrz} cta={t.cta} color="rgba(255,255,255,0.62)" />
    </> : <PassportText facts={facts} trip={trip} t={t} dates={{ entry: date(trip.start, true), exit: date(trip.end, true) }}
      stats={stats} stamps={stamps} language={language} mrz={mrz} />}
  </View>;
}

type Facts = ReturnType<typeof storyFacts>;

/** The destination's photo fading into the flag's deepest colour; the catalog's own photo when it has one. */
function Postcard({ trip, facts, onReady }: { trip: Trip; facts: Facts; onReady?: () => void }) {
  const catalog = destinations.find((item) => item.id === trip.destinationId)?.image;
  const lead = facts.stops[0];
  const [remote, setRemote] = useState<{ uri: string } | null | undefined>(catalog ? null : undefined);
  useEffect(() => {
    if (catalog || !lead) { if (!lead) onReady?.(); return; }
    let active = true;
    findPlacePhoto(lead.name, lead.country, lead.latitude || undefined, lead.longitude || undefined)
      .then((photo) => { if (!active) return; setRemote(photo ? photoSource(photo.url, 960) : null); if (!photo) onReady?.(); })
      .catch(() => { if (active) { setRemote(null); onReady?.(); } });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, lead?.id]);
  const source = catalog ?? remote;
  return <>
    <LinearGradient colors={[facts.palette.accent, facts.palette.deep]} start={{ x: 0, y: 0 }} end={{ x: 0.4, y: 0.7 }} style={StyleSheet.absoluteFill} />
    {source && <Image source={source} style={{ position: "absolute", top: 0, left: 0, right: 0, height: 430 }} contentFit="cover"
      transition={0} onLoad={() => onReady?.()} onError={() => onReady?.()} />}
    <LinearGradient colors={["rgba(0,0,0,0.35)", "rgba(0,0,0,0)", `${facts.palette.deep}00`, facts.palette.deep]}
      locations={[0, 0.18, 0.42, 0.7]} style={StyleSheet.absoluteFill} />
  </>;
}

/** The route drawn as a flight map: a faint graticule, arcs between the cities in order, and each city named. */
function RouteMap({ facts, language, onReady }: { facts: Facts; language: AppLanguage; onReady?: () => void }) {
  useEffect(() => { onReady?.(); }, [onReady]);
  const { width } = STORY_SIZE;
  const stops = facts.stops.filter((stop) => stop.latitude || stop.longitude).slice(0, 10);
  const points = routeLayout(stops, { left: 64, top: 118, width: width - 128, height: 190 });
  const accent = facts.palette.stripe.find((color) => color !== facts.palette.deep && color.toUpperCase() !== "#FFFFFF") ?? "#FFFFFF";
  return <>
    <LinearGradient colors={[facts.palette.deep, "#0B0F1A"]} start={{ x: 0, y: 0 }} end={{ x: 0.3, y: 1 }} style={StyleSheet.absoluteFill} />
    <Svg width={width} height={STORY_SIZE.height} style={StyleSheet.absoluteFill}>
      {Array.from({ length: 9 }, (_, index) => <Line key={`v${index}`} x1={20 + index * 40} y1={80} x2={20 + index * 40} y2={340} stroke="#FFFFFF" strokeOpacity={0.07} strokeWidth={1} />)}
      {Array.from({ length: 7 }, (_, index) => <Line key={`h${index}`} x1={0} y1={90 + index * 40} x2={width} y2={90 + index * 40} stroke="#FFFFFF" strokeOpacity={0.07} strokeWidth={1} />)}
      {points.slice(1).map((point, index) => <Path key={`arc${index}`} d={arcPath(points[index], point)} stroke="#FFFFFF" strokeOpacity={0.85}
        strokeWidth={2} strokeDasharray="5 6" strokeLinecap="round" fill="none" />)}
      {points.map((point, index) => <Circle key={`halo${index}`} cx={point.x} cy={point.y} r={index === 0 ? 16 : 11} fill={accent} fillOpacity={0.25} />)}
      {points.map((point, index) => <Circle key={`dot${index}`} cx={point.x} cy={point.y} r={index === 0 ? 7 : 5} fill={index === 0 ? accent : "#FFFFFF"} stroke="#FFFFFF" strokeWidth={2} />)}
      {points.map((point, index) => {
        const right = point.x < width / 2;
        return <SvgText key={`name${index}`} x={point.x + (right ? 14 : -14)} y={point.y + 4} fill="#FFFFFF" fontSize={12} fontWeight="700"
          textAnchor={right ? "start" : "end"}>{translate(stops[index].name, language)}</SvgText>;
      })}
    </Svg>
  </>;
}

function PassportPaper({ facts, onReady }: { facts: Facts; onReady?: () => void }) {
  useEffect(() => { onReady?.(); }, [onReady]);
  const c = pagePaper(false);
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: c.paper }]}>
    <Guilloche width={STORY_SIZE.width} color={facts.look.ink} wave={facts.look.wave} rows={14} />
    <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 200 }}>
      <Guilloche width={STORY_SIZE.width} color={facts.look.ink} wave={facts.look.wave + 0.3} rows={8} />
    </View>
  </View>;
}

function PassportText({ facts, trip, t, dates, stats, stamps, language, mrz }: {
  facts: Facts; trip: Trip; t: (typeof wording)["en"]; dates: { entry: string; exit: string };
  stats: { label: string; value: string }[]; stamps: Facts["countries"]; language: AppLanguage; mrz: string[];
}) {
  const c = pagePaper(false);
  const ink = facts.look.ink;
  return <>
    <View style={[styles.topBar, { top: 30 }]}>
      <Text style={{ color: ink, fontSize: 12, fontWeight: "900", letterSpacing: 2 }}>{language === "ro" ? "VIZĂ · VISA" : "VISA"}</Text>
      <Text style={{ fontSize: 34 }}>{countryFlag(facts.countries[0]?.code ?? "")}</Text>
    </View>
    <View style={{ position: "absolute", top: 150, left: 34, right: 26, gap: 6 }}>
      <Text style={{ color: c.muted, fontSize: 11, fontWeight: "700", letterSpacing: 1.6 }}>{`${t.record.toUpperCase()} · ${trip.end.slice(0, 4)}`}</Text>
      <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6} style={{ color: c.ink, fontFamily: serif, fontSize: 44, lineHeight: 50 }}>{facts.headline}</Text>
    </View>
    <View style={{ position: "absolute", top: 270, left: 34, right: 26, flexDirection: "row", flexWrap: "wrap", rowGap: 14 }}>
      <PassportField label={t.entry} value={dates.entry} c={c} />
      <PassportField label={t.exit} value={dates.exit} c={c} />
      {stats.map((stat) => <PassportField key={stat.label} label={stat.label} value={stat.value} c={c} />)}
      <PassportField wide label={t.route} value={facts.stops.slice(0, 5).map((stop) => translate(stop.name, language)).join(", ")} c={c} />
    </View>
    {stamps.map((country, index) => {
      const look = visaStyle(country.code, countryForCode(country.code)?.continent, false);
      return <View key={country.code} pointerEvents="none" style={{ position: "absolute", right: 22 + index * 62, bottom: 120 + (index % 2) * 46 }}>
        <EntryStamp code={country.code} date={trip.start} ink={look.stampInk} tilt={look.stampTilt + index * 9} size={118} language={language} t={passportWording[language]} />
      </View>;
    })}
    <Footer mrz={mrz} cta={t.cta} color={c.ink} />
  </>;
}

function PassportField({ label, value, c, wide }: { label: string; value: string; c: ReturnType<typeof pagePaper>; wide?: boolean }) {
  return <View style={{ width: wide ? "100%" : "50%", paddingRight: 10 }}>
    <Text style={{ color: c.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.8 }}>{label.toUpperCase()}</Text>
    <Text numberOfLines={2} style={{ color: c.ink, fontSize: 16, fontWeight: "700", marginTop: 2 }}>{value}</Text>
  </View>;
}

function Footer({ mrz, cta, color }: { mrz: string[]; cta: string; color: string }) {
  return <View style={styles.footer}>
    {mrz.map((line) => <Text key={line} numberOfLines={1} adjustsFontSizeToFit style={[styles.mrz, { color }]}>{line}</Text>)}
    <Text style={[styles.cta, { color }]}>{`${cta}  ·  @goworth.app`}</Text>
  </View>;
}

const styles = StyleSheet.create({
  stripe: { position: "absolute", left: 0, top: 0, bottom: 0, width: 8, flexDirection: "column" },
  topBar: { position: "absolute", top: 26, left: 26, right: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brand: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.32)" },
  brandText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800", letterSpacing: 0.2 },
  flagBubble: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.9)" },
  postcardText: { position: "absolute", left: 28, right: 24, top: 352, gap: 4 },
  kicker: { color: "rgba(255,255,255,0.72)", fontSize: 11, fontWeight: "800", letterSpacing: 2 },
  headline: { color: "#FFFFFF", fontSize: 46, lineHeight: 50, fontWeight: "900", letterSpacing: -1 },
  route: { color: "#FFFFFF", fontSize: 15, fontWeight: "600", marginTop: 2 },
  dates: { color: "rgba(255,255,255,0.72)", fontSize: 13, fontWeight: "600" },
  stats: { flexDirection: "row", gap: 8, marginTop: 14 },
  stat: { flex: 1, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.14)", borderWidth: 1, borderColor: "rgba(255,255,255,0.22)" },
  statValue: { color: "#FFFFFF", fontSize: 20, fontWeight: "900" },
  statLabel: { color: "rgba(255,255,255,0.7)", fontSize: 9, fontWeight: "800", letterSpacing: 1.2, marginTop: 2 },
  footer: { position: "absolute", left: 28, right: 22, bottom: 22, gap: 1 },
  mrz: { fontFamily: mono, fontSize: 10, letterSpacing: 1 },
  cta: { fontSize: 10, fontWeight: "700", marginTop: 6, letterSpacing: 0.4 },
});
