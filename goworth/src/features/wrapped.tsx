import { Children, Fragment, isValidElement, useMemo, useRef, useState, type ReactElement, type ReactNode, type RefObject } from "react";
import { router, type Href } from "expo-router";
import { Pressable, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type ViewInstance, type ViewStyle } from "react-native";
import { Image, type ImageSource } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Button, Chip, EmptyState, Icon, IconButton, Row, type IconName } from "@/components/goworth/ui";
import { wheelColors } from "@/components/goworth/premium-wheel";
import { STORY_SIZE } from "@/components/goworth/trip-story-card";
import { WrappedStoryCard } from "@/components/goworth/wrapped-story-card";
import { themedStyles, type Palette } from "@/constants/design";
import { findDestination, type Activity, type Expense, type Trip } from "@/data/travel";
import { uniqueRouteStops } from "@/data/trip-route";
import { countries, countryFlag, countryForCode } from "@/data/geography";
import { formatMessage, translate } from "@/data/i18n";
import { money, useAppLanguage, type AppLanguage } from "@/data/formatting";
import { canShareImages, shareViewAsImage } from "@/lib/share-image";
import { useTimedMessage } from "@/hooks/use-timed-message";
import { usePalette, useStyles, useThemePreference } from "@/state/theme-context";
import { useTravel } from "@/state/travel-context";
import { useVisas } from "@/state/visas-context";
import { flagColors } from "@/utils/trip-story";
import { wrappedStats, wrappedYear, type WrappedPersona, type WrappedStats, type WrappedTrip } from "@/utils/travel-wrapped";

const wording = {
  en: {
    kicker: "{year} in travel", intro: "Your {year} in travel", introBody: "Every trip, country and kilometre of your year, page by page.",
    trips: "trips", trip: "trip", tripsTitle: "Trips taken", days: "{count} days away from home", daysOne: "1 day away from home",
    spent: "{amount} spent on your trips",
    countriesTitle: "Countries", countries: "countries", country: "country", new: "New", more: "+{count} more",
    newCountries: "{count} visited for the first time", newCountry: "1 visited for the first time",
    kmTitle: "Distance", km: "km between your stops", around: "{share}% of the way around the Earth",
    top: "Country of the year", topBody: "{days} days there", longest: "Longest trip", longestValue: "{name} · {days} days",
    personaTitle: "Travel style", month: "Busiest month: {month}",
    summary: "Your year on one card", share: "Share", screenshot: "Take a screenshot of the card to post it.",
    locked: "See your whole year", lockedBody: "Distance, your country of the year and your travel style are part of Premium.", unlock: "Unlock with Premium",
    emptyTitle: "No trips in {year} yet", emptyBody: "Finish a trip and your year in travel will be waiting here.", plan: "Plan a trip",
    hint: "Tap to continue", previous: "Previous", next: "Next", close: "Close",
  },
  ro: {
    kicker: "{year} în călătorii", intro: "Anul tău {year} în călătorii", introBody: "Fiecare călătorie, țară și kilometru din anul tău, pagină cu pagină.",
    trips: "călătorii", trip: "călătorie", tripsTitle: "Călătorii", days: "{count} zile departe de casă", daysOne: "O zi departe de casă",
    spent: "{amount} cheltuiți în călătorii",
    countriesTitle: "Țări", countries: "țări", country: "țară", new: "Nouă", more: "încă {count}",
    newCountries: "{count} vizitate pentru prima dată", newCountry: "Una vizitată pentru prima dată",
    kmTitle: "Distanță", km: "km între opririle tale", around: "{share}% din drumul în jurul Pământului",
    top: "Țara anului", topBody: "{days} zile acolo", longest: "Cea mai lungă călătorie", longestValue: "{name} · {days} zile",
    personaTitle: "Stilul tău", month: "Luna cea mai plină: {month}",
    summary: "Anul tău pe un singur card", share: "Distribuie", screenshot: "Fă o captură de ecran a cardului ca să-l postezi.",
    locked: "Vezi tot anul tău", lockedBody: "Distanța, țara anului și stilul tău de călătorie fac parte din Premium.", unlock: "Deblochează cu Premium",
    emptyTitle: "Nicio călătorie în {year} încă", emptyBody: "Termină o călătorie și anul tău în călătorii te va aștepta aici.", plan: "Planifică o călătorie",
    hint: "Atinge ca să continui", previous: "Înapoi", next: "Înainte", close: "Închide",
  },
} as const;
type Wording = (typeof wording)[AppLanguage];

const personas: Record<AppLanguage, Record<WrappedPersona, [string, string]>> = {
  en: {
    explorer: ["The Explorer", "Four or more countries in one year. The map is getting smaller."],
    "city-hopper": ["The City Hopper", "Why see one city when you can see three?"],
    "slow-traveller": ["The Slow Traveller", "Long stays and no rush. You travel to live somewhere for a while."],
    weekender: ["The Weekender", "Short escapes, often. Every free weekend is a ticket."],
    "first-timer": ["The Beginner", "Your first trip is on the map. The next ones come easier."],
  },
  ro: {
    explorer: ["Exploratorul", "Patru sau mai multe țări într-un an. Harta devine tot mai mică."],
    "city-hopper": ["Colecționarul de orașe", "De ce să vezi un oraș când poți vedea trei?"],
    "slow-traveller": ["Călătorul fără grabă", "Șederi lungi, fără grabă. Călătorești ca să trăiești o vreme altundeva."],
    weekender: ["Evadatul de weekend", "Escapade scurte, dese. Fiecare weekend liber e un bilet."],
    "first-timer": ["Începătorul", "Prima călătorie e pe hartă. Următoarele vin mai ușor."],
  },
};

const EARTH_KM = 40_075;
const tripKey = (trip: Trip) => `${trip.destinationId}|${trip.start}|${trip.end}`;
const codeFor = (code: string, country: string) => code.toUpperCase()
  || countries.find((item) => item.name.toLocaleLowerCase() === country.toLocaleLowerCase())?.code || "";
const tripLength = (trip: Trip) => Date.parse(trip.end) - Date.parse(trip.start);

function toWrappedTrip(trip: Trip, activities: Activity[], expenses: Expense[]): WrappedTrip {
  return {
    start: trip.start, end: trip.end,
    stops: uniqueRouteStops(trip).map((stop) => ({
      id: stop.id, name: stop.name, countryCode: codeFor(stop.countryCode, stop.country), latitude: stop.latitude, longitude: stop.longitude,
    })),
    places: new Set(activities.map((activity) => activity.placeId || activity.name)).size,
    spent: expenses.reduce((sum, expense) => sum + expense.amount, 0),
  };
}

/**
 * The year's trips: finished ones from the journal, then any of the account's own trips that have started and are
 * not there yet. The cover is the photo of the year's longest trip.
 */
function useWrapped(year: number) {
  const { journalEntries, trips, tripId, activities, expenses } = useTravel();
  const { visas } = useVisas();
  return useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const seen = new Set<string>();
    const list: WrappedTrip[] = [];
    const raw: Trip[] = [];
    const add = (trip: Trip, tripActivities: Activity[], tripExpenses: Expense[]) => {
      seen.add(tripKey(trip));
      raw.push(trip);
      list.push(toWrappedTrip(trip, tripActivities, tripExpenses));
    };
    for (const entry of journalEntries) {
      if (entry.status === "completed" && !seen.has(tripKey(entry.trip))) add(entry.trip, entry.activities, entry.expenses);
    }
    for (const { trip } of trips) {
      if (trip.start > today || seen.has(tripKey(trip))) continue;
      const open = !!trip.id && trip.id === tripId;
      add(trip, open ? activities : [], open ? expenses : []);
    }
    const firstVisits = Object.fromEntries(visas.map((visa) => [visa.countryCode.toUpperCase(), visa.firstEntry]));
    const yearTrips: YearTrip[] = raw
      .map((trip, at) => ({ trip, codes: [...new Set(list[at].stops.map((stop) => stop.countryCode).filter(Boolean))] }))
      .filter(({ trip }) => trip.start.slice(0, 4) <= String(year) && trip.end.slice(0, 4) >= String(year))
      .sort((a, b) => a.trip.start.localeCompare(b.trip.start))
      .map(({ trip, codes }) => {
        const destination = findDestination(trip.destinationId);
        return { key: tripKey(trip), name: destination.name, image: destination.image as ImageSource, start: trip.start, length: tripLength(trip), codes };
      });
    const longest = [...yearTrips].sort((a, b) => b.length - a.length)[0];
    return { stats: wrappedStats(year, list, firstVisits), cover: longest?.image ?? null, yearTrips };
  }, [year, journalEntries, trips, tripId, activities, expenses, visas]);
}

type YearTrip = { key: string; name: string; image: ImageSource; start: string; length: number; codes: string[] };
/** `bleed` slides fill the card edge to edge with a photo instead of sitting in its padding. */
type Slide = { id: string; locked: boolean; bleed?: boolean; render: () => ReactNode };

/**
 * The yearly recap as pages in the app's own cards: tap the right of the page for the next one, the left for the
 * previous one. Free sees its trips, days and countries and the summary card; distance, the country of the year and
 * the travel style are veiled until Premium.
 */
export function WrappedScreen() {
  const styles = useStyles(stylesSheet);
  const p = usePalette();
  const language = useAppLanguage();
  const t = wording[language];
  const { plan, profile } = useTravel();
  const year = wrappedYear(new Date()) ?? new Date().getUTCFullYear();
  const { stats, cover, yearTrips } = useWrapped(year);
  const full = plan !== "free";
  const holder = (profile.name || "Traveller").toUpperCase();
  const [persona, personaBody] = personas[language][stats.persona];
  const [index, setIndex] = useState(0);
  const card = useRef<ViewInstance>(null);
  const [cardDark, setCardDark] = useState(useThemePreference().scheme === "dark");
  const close = () => router.canGoBack() ? router.back() : router.replace("/profile" as Href);
  const unlock = () => router.push({ pathname: "/membership", params: { reason: "wrapped" } } as Href);
  const slides = useMemo(() => buildSlides(stats, cover, yearTrips, language, persona, personaBody, styles, p),
    [stats, cover, yearTrips, language, persona, personaBody, styles, p]);

  if (stats.trips === 0) return <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
    <View style={styles.top}><View style={{ flex: 1 }} /><IconButton name="close" label={t.close} onPress={close} filled /></View>
    <EmptyState title={formatMessage(t.emptyTitle, { year }, language)} detail={t.emptyBody} action={t.plan}
      onPress={() => router.replace("/planner" as Href)} />
  </SafeAreaView>;

  const count = slides.length + 1;
  const onSummary = index === slides.length;
  const current = slides[Math.min(index, slides.length - 1)];
  const veiled = !onSummary && current.locked && !full;
  const go = (step: number) => setIndex((value) => Math.max(0, Math.min(count - 1, value + step)));

  return <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
    <View style={styles.top}>
      <View style={styles.bars}>
        {Array.from({ length: count }, (_, bar) => <View key={bar} style={[styles.bar, bar <= index && styles.barOn]} />)}
      </View>
      <IconButton name="close" label={t.close} onPress={close} filled />
    </View>

    <View style={{ flex: 1 }}>
      {onSummary
        ? <Summary card={card} stats={stats} holder={holder} persona={persona} full={full} language={language} dark={cardDark} onDark={setCardDark} onBack={() => go(-1)} />
        : <Animated.View key={current.id} entering={FadeIn.duration(220)} style={[styles.card, current.bleed && !veiled && styles.bleed]}>
          {veiled ? <Stagger>{Locked({ t, styles, p })}</Stagger> : current.bleed ? current.render() : <Stagger>{current.render()}</Stagger>}
        </Animated.View>}
      {!onSummary && <>
        <Pressable accessibilityRole="button" accessibilityLabel={t.previous} onPress={() => go(-1)} style={[styles.zone, { left: 0, width: "32%" }]} />
        <Pressable accessibilityRole="button" accessibilityLabel={t.next} onPress={() => go(1)} style={[styles.zone, { right: 0, width: "68%" }]} />
      </>}
    </View>

    <View style={styles.footer}>
      {veiled ? <Pressable accessibilityRole="button" onPress={unlock} style={({ pressed }) => [styles.gold, pressed && { opacity: 0.85 }]}>
        <Icon name="crown" size={16} color={wheelColors.goldInk} />
        <Text style={styles.goldText}>{t.unlock}</Text>
      </Pressable>
        : onSummary ? <SummaryActions card={card} stats={stats} full={full} language={language} onUnlock={unlock} />
        : <Text style={styles.hint}>{t.hint}</Text>}
    </View>
  </SafeAreaView>;
}

type Styles = ReturnType<typeof stylesSheet.resolve>;

function Kicker({ icon, tint, soft, label, styles }: { icon: IconName; tint: string; soft: string; label: string; styles: Styles }) {
  return <View style={styles.kickerRow}>
    <View style={[styles.badge, { backgroundColor: soft }]}><Icon name={icon} size={22} color={tint} /></View>
    <Text style={styles.kicker}>{label.toUpperCase()}</Text>
  </View>;
}

/**
 * Brings a page's parts in one after another. Each part keeps its own flex and auto margin on the wrapper, so a photo
 * or stamp that fills the rest of the card still does.
 */
function Stagger({ children }: { children: ReactNode }) {
  const root = isValidElement(children) && children.type === Fragment ? (children as ReactElement<{ children: ReactNode }>).props.children : children;
  return Children.toArray(root).map((child, at) => {
    const own: ViewStyle | undefined = isValidElement(child) ? StyleSheet.flatten((child as ReactElement<{ style?: StyleProp<ViewStyle> }>).props.style) ?? undefined : undefined;
    return <Animated.View key={at} entering={FadeInDown.duration(380).delay(60 + at * 70)}
      style={own && { flex: own.flex, marginTop: own.marginTop, minHeight: own.minHeight }}>{child}</Animated.View>;
  });
}

function buildSlides(stats: WrappedStats, cover: ImageSource | null, yearTrips: YearTrip[], language: AppLanguage, persona: string, personaBody: string, styles: Styles, p: Palette): Slide[] {
  const t = wording[language];
  const number = (value: number) => value.toLocaleString(language === "ro" ? "ro-RO" : "en-US");
  const countryName = (code: string) => translate(countryForCode(code)?.name ?? code, language);
  const monthName = (month: number, form: "long" | "short" | "narrow") => new Date(Date.UTC(stats.year, month, 15))
    .toLocaleDateString(language === "ro" ? "ro-RO" : "en-US", { month: form, timeZone: "UTC" });
  const share = Math.min(100, Math.max(1, Math.round(stats.km / EARTH_KM * 100)));
  const peak = Math.max(...stats.monthDays, 1);
  const listed = stats.countries.slice(0, 6);

  return [
    { id: "intro", locked: false, bleed: true, render: () => <>
      {cover ? <Image source={cover} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
        : <View style={[StyleSheet.absoluteFill, { backgroundColor: p.night }]} />}
      <LinearGradient colors={["rgba(10,14,22,0)", "rgba(10,14,22,0.82)"]} style={[StyleSheet.absoluteFill, { top: "35%" }]} />
      <View style={styles.yearChip}><Text style={styles.yearChipText}>{stats.year}</Text></View>
      <Animated.View entering={FadeInDown.duration(420).delay(120)} style={styles.introText}>
        <Text style={[styles.kicker, { color: "rgba(255,255,255,0.75)" }]}>{formatMessage(t.kicker, { year: stats.year }, language).toUpperCase()}</Text>
        <Text style={[styles.heading, { color: p.onColor, fontSize: 34, lineHeight: 40 }]}>{formatMessage(t.intro, { year: stats.year }, language)}</Text>
        <Text style={[styles.body, { color: "rgba(255,255,255,0.88)" }]}>{t.introBody}</Text>
      </Animated.View>
    </> },
    { id: "trips", locked: false, render: () => <>
      <Kicker icon="trip" tint={p.blue} soft={p.blueSoft} label={t.tripsTitle} styles={styles} />
      <View>
        <Text style={styles.big}>{number(stats.trips)}<Text style={styles.unit}> {stats.trips === 1 ? t.trip : t.trips}</Text></Text>
        <Text style={styles.body}>{stats.days === 1 ? t.daysOne : formatMessage(t.days, { count: stats.days }, language)}</Text>
      </View>
      <View style={styles.chart}>
        {stats.monthDays.map((days, month) => <View key={month} style={styles.chartColumn}>
          <View style={styles.chartTrack}>
            <View style={[styles.chartBar, { height: `${Math.max(days ? 8 : 0, days / peak * 100)}%`,
              backgroundColor: month === stats.busiestMonth ? p.blue : p.blueLine }]} />
          </View>
          <Text style={[styles.chartLabel, month === stats.busiestMonth && { color: p.ink }]}>{monthName(month, "narrow")}</Text>
        </View>)}
      </View>
      <Row style={{ gap: 8, alignItems: "flex-start" }}>
        {yearTrips.slice(0, 4).map((trip) => <View key={trip.key} style={{ flex: 1, gap: 4, maxWidth: "25%" }}>
          <Image source={trip.image} style={styles.thumb} contentFit="cover" />
          <Text numberOfLines={1} style={styles.thumbName}>{translate(trip.name, language)}</Text>
          <Text style={styles.chartLabel}>{monthName(Number(trip.start.slice(5, 7)) - 1, "short")}</Text>
        </View>)}
      </Row>
      {stats.spent > 0 && <View style={styles.pill}>
        <Icon name="wallet" size={16} color={p.muted} />
        <Text style={styles.pillText}>{formatMessage(t.spent, { amount: money(stats.spent) }, language)}</Text>
      </View>}
    </> },
    { id: "countries", locked: false, render: () => <>
      <Kicker icon="globe" tint={p.teal} soft={p.tealSoft} label={t.countriesTitle} styles={styles} />
      <View>
        <Text style={styles.big}>{number(stats.countries.length)}<Text style={styles.unit}> {stats.countries.length === 1 ? t.country : t.countries}</Text></Text>
        {stats.newCountries.length > 0 && <Text style={styles.body}>{stats.newCountries.length === 1 ? t.newCountry
          : formatMessage(t.newCountries, { count: stats.newCountries.length }, language)}</Text>}
      </View>
      <View style={styles.list}>
        {listed.map((code, row) => <View key={code} style={[styles.listRow, row > 0 && styles.listDivider]}>
          <Text style={styles.flag}>{countryFlag(code)}</Text>
          <Text numberOfLines={1} style={styles.listLabel}>{countryName(code)}</Text>
          {stats.newCountries.includes(code) && <View style={styles.newChip}><Text style={styles.newText}>{t.new}</Text></View>}
        </View>)}
        {stats.countries.length > listed.length && <Text style={[styles.hint, { textAlign: "left", paddingTop: 8 }]}>
          {formatMessage(t.more, { count: stats.countries.length - listed.length }, language)}</Text>}
      </View>
    </> },
    ...(stats.km > 0 ? [{ id: "km", locked: true, render: () => <>
      <Kicker icon="plane" tint={p.orange} soft={p.orangeSoft} label={t.kmTitle} styles={styles} />
      <View>
        <Text style={styles.big}>{number(stats.km)}</Text>
        <Text style={styles.body}>{t.km}</Text>
      </View>
      <View style={{ gap: 8 }}>
        <View style={styles.track}><View style={[styles.fill, { width: `${Math.max(share, 3)}%` }]} /></View>
        <View style={styles.trackLabels}>
          <Text style={styles.chartLabel}>0</Text>
          <Text style={styles.chartLabel}>{`${number(EARTH_KM)} km`}</Text>
        </View>
        <Text style={styles.body}>{formatMessage(t.around, { share }, language)}</Text>
      </View>
    </> }] : []),
    ...(stats.topCountry ? [{ id: "top", locked: true, render: () => {
      const code = stats.topCountry!.code;
      const stripe = flagColors[code] ?? [p.blue];
      const photo = [...yearTrips].filter((trip) => trip.codes.includes(code)).sort((a, b) => b.length - a.length)[0]?.image;
      return <>
        <View style={styles.stripe}>{stripe.map((color, band) => <View key={band} style={{ flex: 1, backgroundColor: color }} />)}</View>
        <Kicker icon="star" tint={p.purple} soft={p.purpleSoft} label={t.top} styles={styles} />
        {photo && <Image source={photo} style={styles.banner} contentFit="cover" transition={200} />}
        <Row style={{ gap: 14 }}>
          <Text style={{ fontSize: 48, lineHeight: 58 }}>{countryFlag(code)}</Text>
          <View style={{ flex: 1, gap: 2 }}>
            <Text numberOfLines={1} adjustsFontSizeToFit style={styles.heading}>{countryName(code)}</Text>
            <Text style={styles.muted}>{formatMessage(t.topBody, { days: stats.topCountry!.days }, language)}</Text>
          </View>
        </Row>
        {stats.longest && <View style={styles.pill}>
          <Icon name="calendar" size={16} color={p.muted} />
          <Text style={styles.pillText}>{`${t.longest}: ${formatMessage(t.longestValue, { name: translate(stats.longest.name, language), days: stats.longest.days }, language)}`}</Text>
        </View>}
      </>;
    } }] : []),
    { id: "persona", locked: true, render: () => <>
      <Kicker icon="sparkle" tint={p.pink} soft={p.pinkSoft} label={t.personaTitle} styles={styles} />
      <View style={styles.stampWrap}>
        <View style={styles.stamp}>
          <View style={styles.stampInner}>
            <Text style={styles.stampYear}>{`★ ${stats.year} ★`}</Text>
            <Text style={styles.stampName} numberOfLines={2} adjustsFontSizeToFit>{persona.toUpperCase()}</Text>
            <Text style={styles.stampYear}>GOWORTH</Text>
          </View>
        </View>
      </View>
      <View style={{ gap: 6 }}>
        <Text style={styles.body}>{personaBody}</Text>
        {stats.busiestMonth !== null && <Text style={styles.muted}>{formatMessage(t.month, { month: monthName(stats.busiestMonth, "long") }, language)}</Text>}
      </View>
    </> },
  ];
}

function Locked({ t, styles, p }: { t: Wording; styles: Styles; p: Palette }) {
  return <>
    <Kicker icon="lock" tint={p.orange} soft={p.orangeSoft} label="Premium" styles={styles} />
    <View style={{ gap: 8 }}>
      <Text style={styles.heading}>{t.locked}</Text>
      <Text style={styles.body}>{t.lockedBody}</Text>
    </View>
    <View style={styles.veil}>
      {[0.9, 0.6, 0.75].map((width, line) => <View key={line} style={[styles.veilLine, { width: `${width * 100}%` }]} />)}
    </View>
  </>;
}

/** The share card, scaled to fit the room the page leaves under the progress bars. */
function Summary({ card, stats, holder, persona, full, language, dark, onDark, onBack }: {
  card: RefObject<ViewInstance | null>; stats: WrappedStats; holder: string; persona: string; full: boolean; language: AppLanguage;
  dark: boolean; onDark: (dark: boolean) => void; onBack: () => void;
}) {
  const styles = useStyles(stylesSheet);
  const { height } = useWindowDimensions();
  const scale = Math.max(0.4, Math.min(0.66, (height - 350) / STORY_SIZE.height));
  return <Animated.View entering={FadeIn.duration(260)} style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
    <Text style={styles.kicker}>{wording[language].summary.toUpperCase()}</Text>
    {/* Tapping the card goes back to the last page, as the left side does on the others. */}
    <Pressable accessibilityRole="button" accessibilityLabel={wording[language].previous} onPress={onBack}
      style={[styles.frame, { width: STORY_SIZE.width * scale, height: STORY_SIZE.height * scale }]}>
      <View style={[styles.scaled, { transform: [{ scale }] }]}>
        <WrappedStoryCard ref={card} stats={stats} holder={holder} persona={persona} full={full} language={language} dark={dark} />
      </View>
    </Pressable>
    <Row style={{ gap: 8 }}>
      <Chip selected={!dark} onPress={() => onDark(false)}>Light</Chip>
      <Chip selected={dark} onPress={() => onDark(true)}>Dark</Chip>
    </Row>
  </Animated.View>;
}

function SummaryActions({ card, stats, full, language, onUnlock }: {
  card: RefObject<ViewInstance | null>; stats: WrappedStats; full: boolean; language: AppLanguage; onUnlock: () => void;
}) {
  const styles = useStyles(stylesSheet);
  const p = usePalette();
  const t = wording[language];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useTimedMessage();
  const share = async () => {
    setBusy(true); setError("");
    try { await shareViewAsImage(card, `goworth-wrapped-${stats.year}`); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not share the card."); }
    finally { setBusy(false); }
  };
  return <View style={{ gap: 10, alignSelf: "stretch" }}>
    {!!error && <Text style={[styles.hint, { color: p.danger }]}>{error}</Text>}
    {canShareImages ? <Button icon="share" busy={busy} onPress={() => void share()}>{t.share}</Button>
      : <Text style={styles.hint}>{t.screenshot}</Text>}
    {!full && <Pressable accessibilityRole="button" onPress={onUnlock} style={({ pressed }) => [styles.gold, pressed && { opacity: 0.85 }]}>
      <Icon name="crown" size={16} color={wheelColors.goldInk} />
      <Text style={styles.goldText}>{t.locked}</Text>
    </Pressable>}
  </View>;
}

const stylesSheet = themedStyles((p) => ({
  screen: { flex: 1, backgroundColor: p.canvas },
  top: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingTop: 6, paddingBottom: 12 },
  bars: { flex: 1, flexDirection: "row", gap: 4 },
  bar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: p.line },
  barOn: { backgroundColor: p.ink },
  card: { flex: 1, marginHorizontal: 18, padding: 22, gap: 22, borderRadius: 28, borderWidth: 1, borderColor: p.line, backgroundColor: p.white, overflow: "hidden" },
  bleed: { padding: 0, justifyContent: "flex-end" },
  zone: { position: "absolute", top: 0, bottom: 0 },
  yearChip: { position: "absolute", top: 18, left: 18, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.92)" },
  yearChipText: { color: "#132238", fontSize: 13, fontWeight: "800" },
  introText: { padding: 24, gap: 8 },
  thumb: { width: "100%", aspectRatio: 1, borderRadius: 14, backgroundColor: p.soft },
  thumbName: { color: p.ink, fontSize: 12, fontWeight: "700" },
  banner: { flex: 1, minHeight: 110, borderRadius: 20, backgroundColor: p.soft },
  footer: { minHeight: 76, justifyContent: "center", paddingHorizontal: 18, paddingTop: 12, paddingBottom: 8 },
  hint: { color: p.muted, fontSize: 12, textAlign: "center" },
  kickerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  badge: { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  kicker: { color: p.muted, fontSize: 12, fontWeight: "800", letterSpacing: 1.2 },
  heading: { color: p.ink, fontSize: 30, lineHeight: 36, fontWeight: "800", letterSpacing: -0.5 },
  big: { color: p.ink, fontSize: 64, lineHeight: 72, fontWeight: "800", letterSpacing: -1.5 },
  unit: { color: p.muted, fontSize: 22, fontWeight: "700", letterSpacing: -0.2 },
  body: { color: p.ink, fontSize: 16, lineHeight: 23 },
  muted: { color: p.muted, fontSize: 14, lineHeight: 20 },
  chart: { flexDirection: "row", gap: 6, height: 104, alignItems: "flex-end" },
  chartColumn: { flex: 1, alignItems: "center", gap: 6, height: "100%" },
  chartTrack: { flex: 1, width: "100%", justifyContent: "flex-end", borderRadius: 6, backgroundColor: p.soft, overflow: "hidden" },
  chartBar: { width: "100%", borderRadius: 6 },
  chartLabel: { color: p.muted, fontSize: 11, fontWeight: "700" },
  pill: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", paddingHorizontal: 13, paddingVertical: 9, borderRadius: 14, backgroundColor: p.soft },
  pillText: { color: p.ink, fontSize: 13, fontWeight: "700", flexShrink: 1 },
  list: { borderRadius: 18, borderWidth: 1, borderColor: p.line, paddingHorizontal: 14, paddingVertical: 4 },
  listRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 46 },
  listDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.line },
  flag: { fontSize: 22 },
  listLabel: { flex: 1, color: p.ink, fontSize: 15, fontWeight: "700" },
  newChip: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: p.greenSoft },
  newText: { color: p.green, fontSize: 11, fontWeight: "800" },
  track: { height: 12, borderRadius: 6, backgroundColor: p.orangeSoft, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 6, backgroundColor: p.orange },
  trackLabels: { flexDirection: "row", justifyContent: "space-between" },
  stripe: { flexDirection: "row", height: 8, marginHorizontal: -22, marginTop: -22 },
  stampWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  stamp: { width: 210, height: 210, borderRadius: 105, borderWidth: 3, borderColor: p.blue, padding: 7, transform: [{ rotate: "-8deg" }] },
  stampInner: { flex: 1, borderRadius: 100, borderWidth: 1.5, borderColor: p.blue, borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 20 },
  stampYear: { color: p.blue, fontSize: 12, fontWeight: "900", letterSpacing: 2 },
  stampName: { color: p.blue, fontSize: 20, lineHeight: 24, fontWeight: "900", textAlign: "center", letterSpacing: 0.5 },
  veil: { gap: 10, marginTop: "auto" },
  veilLine: { height: 14, borderRadius: 7, backgroundColor: p.soft },
  gold: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 52, borderRadius: 16, backgroundColor: wheelColors.gold },
  goldText: { color: wheelColors.goldInk, fontSize: 15, fontWeight: "800" },
  frame: { borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: p.line },
  scaled: { width: STORY_SIZE.width, height: STORY_SIZE.height, transformOrigin: "top left" },
}));
