import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming, type SharedValue,
} from "react-native-reanimated";
import { Icon } from "@/components/goworth/ui";
import { wheelColors } from "@/components/goworth/premium-wheel";
import { EntryStamp, VisaPage, passportWording } from "@/components/goworth/passport-pages";
import { countryForCode } from "@/data/geography";
import { translate } from "@/data/i18n";
import { visaStyle } from "@/data/visa-style";
import type { AppLanguage } from "@/data/formatting";
import type { Visa } from "@/lib/visas";

const wording = {
  en: { newVisa: "New visa", newEntry: "New entry", entryNumber: "Entry {n}", see: "See in passport", next: "Next visa", unlock: "Unlock with Premium", later: "Later", keptFree: "Kept in your passport. Premium shows it." },
  ro: { newVisa: "Viză nouă", newEntry: "Intrare nouă", entryNumber: "Intrarea {n}", see: "Vezi în pașaport", next: "Următoarea viză", unlock: "Deblochează cu Premium", later: "Mai târziu", keptFree: "Păstrată în pașaportul tău. Premium o afișează." },
} as const;

const RING_COUNT = 3;

/**
 * The moment a trip turns into a visa: the screen dims, the visa page swings up from below, the entry stamp
 * comes down on it with a thud that jolts the card, gold rings spread from the stamp, then the country is
 * named. Several visas are shown one after another.
 */
export function VisaAward({ visas, language, dark, holder, memberNumber, locked, onFinish, onOpenPassport, onUnlock }: {
  visas: Visa[]; language: AppLanguage; dark: boolean; holder: string; memberNumber: string; locked: boolean;
  onFinish: () => void; onOpenPassport: () => void; onUnlock: () => void;
}) {
  const { width: screenWidth } = useWindowDimensions();
  const t = wording[language];
  const pageText = passportWording[language];
  const [step, setStep] = useState(0);
  const visa = visas[step];
  const cardWidth = Math.min(300, screenWidth - 72);
  const cardHeight = Math.round(cardWidth * 1.38);

  const backdrop = useSharedValue(0);
  const rise = useSharedValue(0);
  const stamp = useSharedValue(0);
  const jolt = useSharedValue(0);
  const rings = useSharedValue(0);
  const caption = useSharedValue(0);

  useEffect(() => {
    backdrop.set(withTiming(1, { duration: 280 }));
    rise.set(0); stamp.set(0); jolt.set(0); rings.set(0); caption.set(0);
    rise.set(withDelay(120, withSpring(1, { damping: 13, stiffness: 110, mass: 0.9 })));
    stamp.set(withDelay(1000, withTiming(1, { duration: 260, easing: Easing.in(Easing.quad) })));
    // The card gives under the stamp the moment it lands.
    jolt.set(withDelay(1260, withSequence(
      withTiming(1, { duration: 60 }), withTiming(-0.6, { duration: 70 }), withTiming(0.3, { duration: 70 }), withTiming(0, { duration: 90 }),
    )));
    rings.set(withDelay(1260, withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) })));
    caption.set(withDelay(1450, withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) })));
  }, [step, backdrop, rise, stamp, jolt, rings, caption]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.get() }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, rise.get() * 3),
    transform: [
      { translateY: (1 - rise.get()) * 520 + jolt.get() * 5 },
      { rotate: `${(1 - rise.get()) * -16}deg` },
      { scale: 0.86 + rise.get() * 0.14 - Math.abs(jolt.get()) * 0.015 },
    ],
  }));
  const stampStyle = useAnimatedStyle(() => ({
    opacity: stamp.get() > 0 ? 1 : 0,
    transform: [{ scale: 2.6 - stamp.get() * 1.6 }, { rotate: `${(1 - stamp.get()) * -24}deg` }],
  }));
  const captionStyle = useAnimatedStyle(() => ({ opacity: caption.get(), transform: [{ translateY: (1 - caption.get()) * 14 }] }));

  if (!visa) return null;
  const country = countryForCode(visa.countryCode);
  const look = visaStyle(visa.countryCode, country?.continent, dark);
  const name = translate(country?.name ?? visa.countryCode, language);
  const repeat = visa.entries > 1;
  const latest = visa.stamps.at(-1)?.date ?? visa.lastEntry;
  const more = step < visas.length - 1;
  const advance = () => more ? setStep(step + 1) : onFinish();

  return <View style={[StyleSheet.absoluteFill, styles.root]} accessibilityViewIsModal>
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(7,12,30,0.9)" }, backdropStyle]} />
    <View style={{ alignItems: "center" }}>
      <View style={{ width: cardWidth, height: cardHeight, alignItems: "center", justifyContent: "center" }}>
        {Array.from({ length: RING_COUNT }, (_, ring) => <Ring key={ring} index={ring} progress={rings} />)}
        <Animated.View style={[{ width: cardWidth, height: cardHeight, borderRadius: 16, overflow: "hidden" }, cardStyle]}>
          <VisaPage visa={visa} t={pageText} language={language} dark={dark} width={cardWidth} holder={holder}
            memberNumber={memberNumber} stampless />
          <Animated.View pointerEvents="none" style={[{ position: "absolute", right: 16, bottom: 58 }, stampStyle]}>
            <EntryStamp code={visa.countryCode} date={latest} ink={look.stampInk} tilt={look.stampTilt} language={language} t={pageText} />
          </Animated.View>
        </Animated.View>
      </View>
      <Animated.View style={[{ alignItems: "center", marginTop: 22, paddingHorizontal: 32 }, captionStyle]}>
        <Text style={styles.kicker}>{(repeat ? t.newEntry : t.newVisa).toUpperCase()}</Text>
        <Text style={styles.title}>{name}</Text>
        <Text style={styles.detail}>{repeat ? t.entryNumber.replace("{n}", String(visa.entries)) : visa.cities.slice(0, 3).join(" · ")}</Text>
        {locked && <Text style={[styles.detail, { color: wheelColors.goldLight, marginTop: 6 }]}>{t.keptFree}</Text>}
        <Pressable accessibilityRole="button" onPress={more ? advance : locked ? onUnlock : onOpenPassport}
          style={({ pressed }) => [styles.primary, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}>
          {locked && !more && <Icon name="crown" size={16} color={wheelColors.goldInk} />}
          <Text style={styles.primaryText}>{more ? `${t.next} (${step + 2}/${visas.length})` : locked ? t.unlock : t.see}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" hitSlop={10} onPress={onFinish} style={{ marginTop: 12 }}>
          <Text style={styles.later}>{t.later}</Text>
        </Pressable>
      </Animated.View>
    </View>
  </View>;
}

/** A gold ring spreading from where the stamp landed. */
function Ring({ index, progress }: { index: number; progress: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const local = Math.min(1, Math.max(0, progress.get() * 1.4 - index * 0.18));
    return { opacity: local > 0 && local < 1 ? (1 - local) * 0.9 : 0, transform: [{ scale: 0.3 + local * 2.4 }] };
  });
  return <Animated.View pointerEvents="none" style={[styles.ring, style]} />;
}

const styles = StyleSheet.create({
  root: { zIndex: 300, elevation: 300, alignItems: "center", justifyContent: "center" },
  ring: { position: "absolute", right: 22, bottom: 64, width: 90, height: 90, borderRadius: 45, borderWidth: 2, borderColor: wheelColors.gold },
  kicker: { color: wheelColors.gold, fontSize: 12, fontWeight: "800", letterSpacing: 2.5, textAlign: "center" },
  title: { color: "#FFFFFF", fontSize: 28, fontWeight: "800", marginTop: 4, textAlign: "center" },
  detail: { color: "rgba(255,255,255,0.72)", fontSize: 14, marginTop: 2, textAlign: "center" },
  primary: {
    flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", marginTop: 18, minHeight: 48, paddingVertical: 10, paddingHorizontal: 24,
    borderRadius: 16, backgroundColor: wheelColors.gold,
  },
  primaryText: { flexShrink: 1, color: wheelColors.goldInk, fontSize: 15, fontWeight: "900", textAlign: "center" },
  later: { color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: "700" },
});
