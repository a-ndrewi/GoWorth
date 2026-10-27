import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { GestureDetector, useExclusiveGestures, usePanGesture, useTapGesture } from "react-native-gesture-handler";
import Animated, {
  Easing, Extrapolation, interpolate, useAnimatedStyle, useSharedValue, withDecay, withSpring, withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import * as Location from "expo-location";
import { countryFlag, nearestCity, type Country } from "@/data/geography";
import { translate } from "@/data/i18n";
import { useAppLanguage } from "@/data/formatting";
import { themedStyles, type Palette } from "@/constants/design";
import { usePalette, useStyles } from "@/state/theme-context";
import { Icon } from "@/components/goworth/ui";

const BUBBLE = 76;
const SPACING = BUBBLE + 10;
const HEIGHT = 360;
const continentTint = (p: Palette): Record<string, { bg: string; ring: string }> => ({
  EU: { bg: p.blueSoft, ring: p.blueLine },
  AS: { bg: p.orangeSoft, ring: p.orangeLine },
  AF: { bg: p.greenSoft, ring: "#A9DDC6" },
  NA: { bg: p.pinkSoft, ring: "#F4B3BF" },
  SA: { bg: p.tealSoft, ring: "#9FDAD6" },
  OC: { bg: p.purpleSoft, ring: "#C5BDF2" },
  AN: { bg: p.soft, ring: p.line },
});

/** The country the device is in, from the nearest known city; asks for permission only when `ask` is set. */
async function locateCountry(ask: boolean): Promise<string | null> {
  const permission = ask ? await Location.requestForegroundPermissionsAsync() : await Location.getForegroundPermissionsAsync();
  if (permission.status !== "granted") return null;
  const position = await Location.getLastKnownPositionAsync()
    ?? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return nearestCity(position.coords.latitude, position.coords.longitude)?.countryCode ?? null;
}

/** Axial hex coordinates walked outward ring by ring, so the first items sit in the middle. */
function spiral(count: number) {
  const directions = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  const cells: { x: number; y: number }[] = [{ x: 0, y: 0 }];
  for (let ring = 1; cells.length < count; ring++) {
    let q = -ring, r = ring;
    for (const [dq, dr] of directions) {
      for (let step = 0; step < ring && cells.length < count; step++) {
        cells.push({ x: SPACING * (q + r / 2), y: SPACING * (Math.sqrt(3) / 2) * r });
        q += dq; r += dr;
      }
    }
  }
  return cells;
}

/** Apple Watch–style fisheye: bubbles shrink and gather toward the centre as they near the edge. */
function project(x: number, y: number, tx: number, ty: number, halfW: number, halfH: number) {
  "worklet";
  const px = x + tx, py = y + ty;
  const r = Math.sqrt((px / halfW) ** 2 + (py / halfH) ** 2);
  const scale = interpolate(r, [0, 0.45, 0.85, 1.15, 1.4], [1, 0.96, 0.66, 0.32, 0.12], Extrapolation.CLAMP);
  const pull = interpolate(r, [0.55, 1.4], [1, 0.8], Extrapolation.CLAMP);
  const opacity = interpolate(r, [1.05, 1.4], [1, 0], Extrapolation.CLAMP);
  return { x: px * pull, y: py * pull, scale, opacity, r };
}

const HIDDEN = { opacity: 0, transform: [{ translateX: 0 }, { translateY: 0 }, { scale: 0 }] };

function rubber(value: number, limit: number) {
  "worklet";
  if (value > limit) return limit + (value - limit) * 0.32;
  if (value < -limit) return -limit + (value + limit) * 0.32;
  return value;
}

const Bubble = memo(function Bubble({ country, cell, index, here, tx, ty, intro, pressed, width, language, onSelect }: {
  country: Country; cell: { x: number; y: number }; index: number; here: boolean;
  tx: SharedValue<number>; ty: SharedValue<number>; intro: SharedValue<number>; pressed: SharedValue<number>;
  width: number; language: ReturnType<typeof useAppLanguage>; onSelect: (code: string) => void;
}) {
  const styles = useStyles(stylesSheet);
  const p = usePalette();
  const halfW = width / 2, halfH = HEIGHT / 2;
  const startAt = Math.min(0.55, Math.hypot(cell.x, cell.y) / (SPACING * 9));
  const style = useAnimatedStyle(() => {
    const view = project(cell.x, cell.y, tx.value, ty.value, halfW, halfH);
    if (view.opacity <= 0) return HIDDEN;
    const t = Math.min(1, Math.max(0, (intro.value - startAt) / 0.45));
    const c1 = 1.9, c3 = c1 + 1;
    const pop = t === 0 ? 0 : 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
    return {
      opacity: view.opacity * Math.min(1, t * 2),
      transform: [
        { translateX: view.x },
        { translateY: view.y },
        { scale: view.scale * pop },
      ],
    };
  });
  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(pressed.value === index ? 0.86 : 1, { damping: 12, stiffness: 320 }) }],
  }));
  const tints = continentTint(p);
  const tint = tints[country.continent] ?? tints.AN;
  const name = translate(country.name, language);
  return <Animated.View
    accessible
    accessibilityRole="button"
    accessibilityLabel={language === "ro" ? `Explorează ${name}${here ? ", ești aici" : ""}` : `Explore ${name}${here ? ", you are here" : ""}`}
    accessibilityActions={[{ name: "activate" }]}
    onAccessibilityAction={() => onSelect(country.code)}
    pointerEvents="none"
    style={[styles.bubbleSlot, { left: halfW - BUBBLE / 2, top: halfH - BUBBLE / 2 }, style]}
  >
    <Animated.View style={[styles.bubble, { backgroundColor: tint.bg, borderColor: here ? p.blue : tint.ring }, here && styles.bubbleHere, pressStyle]}>
      <Text style={styles.flag}>{countryFlag(country.code)}</Text>
      <Text numberOfLines={2} style={styles.name}>{name}</Text>
    </Animated.View>
    {here && <View style={styles.hereBadge}><Icon name="pin" size={11} color={p.white} /></View>}
  </Animated.View>;
});

export function CountryHoneycomb({
  countries,
  onSelect,
  onInteraction,
}: {
  countries: Country[];
  onSelect: (code: string) => void;
  onInteraction?: (active: boolean) => void;
}) {
  const styles = useStyles(stylesSheet);
  const p = usePalette();
  const language = useAppLanguage();
  const selectRef = useRef(onSelect);
  useEffect(() => { selectRef.current = onSelect; }, [onSelect]);
  const select = useCallback((code: string) => selectRef.current(code), []);
  const [size, setSize] = useState({ width: 0 });
  // The spiral starts in the middle, so the first bubbles are the ones on screen; the rest mount a moment later.
  const [allBubbles, setAllBubbles] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setAllBubbles(true), 800);
    return () => clearTimeout(timer);
  }, []);
  const [movedFor, setMovedFor] = useState("");
  const [hereCode, setHereCode] = useState<string | null>(null);
  const ordered = useMemo(() => [...countries].sort((a, b) => b.cityCount - a.cityCount), [countries]);
  const cells = useMemo(() => spiral(ordered.length), [ordered.length]);
  const xs = useMemo(() => cells.map((cell) => cell.x), [cells]);
  const ys = useMemo(() => cells.map((cell) => cell.y), [cells]);
  const codes = useMemo(() => ordered.map((country) => country.code), [ordered]);
  const codesKey = codes.join(",");
  const moved = movedFor === codesKey;
  const limitX = Math.max(0, ...xs.map(Math.abs));
  const limitY = Math.max(0, ...ys.map(Math.abs));
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const intro = useSharedValue(0);
  const pressed = useSharedValue(-1);
  const halfW = size.width / 2, halfH = HEIGHT / 2;
  // The grid rests on the bubble of the country the device is in, when location is allowed and that country is listed.
  const hereIndex = hereCode ? codes.indexOf(hereCode) : -1;
  const homeX = hereIndex >= 0 ? -cells[hereIndex].x : 0;
  const homeY = hereIndex >= 0 ? -cells[hereIndex].y : 0;

  // Only a permission given earlier is used here; the location button is what asks for it.
  useEffect(() => {
    let active = true;
    locateCountry(false).then((code) => { if (active && code) setHereCode(code); }).catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    tx.set(withSpring(homeX));
    ty.set(withSpring(homeY));
    // A new list or a newly found location moves the grid home; the intro replays only for a new list.
  }, [codesKey, homeX, homeY, tx, ty]);

  useEffect(() => {
    intro.set(0);
    intro.set(withTiming(1, { duration: 1100, easing: Easing.linear }));
  }, [codesKey, intro]);

  const hit = (x: number, y: number) => {
    "worklet";
    let best = -1, bestScale = 0;
    for (let i = 0; i < xs.length; i++) {
      const view = project(xs[i], ys[i], tx.value, ty.value, halfW, halfH);
      const dx = x - halfW - view.x, dy = y - halfH - view.y;
      if (view.opacity > 0.3 && Math.sqrt(dx * dx + dy * dy) <= (BUBBLE / 2) * view.scale && view.scale > bestScale) {
        best = i; bestScale = view.scale;
      }
    }
    return best;
  };

  const pan = usePanGesture({
    minDistance: 4,
    onBegin: () => {
      "worklet";
      startX.set(tx.value);
      startY.set(ty.value);
      if (onInteraction) scheduleOnRN(onInteraction, true);
    },
    onActivate: () => {
      "worklet";
      pressed.set(-1);
      scheduleOnRN(setMovedFor, codesKey);
    },
    onUpdate: ({ translationX, translationY }) => {
      "worklet";
      tx.set(rubber(startX.value + translationX, limitX));
      ty.set(rubber(startY.value + translationY, limitY));
    },
    onDeactivate: ({ velocityX, velocityY }) => {
      "worklet";
      tx.set(withDecay({ velocity: velocityX, deceleration: 0.994, clamp: [-limitX, limitX], rubberBandEffect: true, rubberBandFactor: 0.7 }));
      ty.set(withDecay({ velocity: velocityY, deceleration: 0.994, clamp: [-limitY, limitY], rubberBandEffect: true, rubberBandFactor: 0.7 }));
    },
    onFinalize: () => {
      "worklet";
      if (onInteraction) scheduleOnRN(onInteraction, false);
    },
  });

  const tap = useTapGesture({
    maxDistance: 8,
    onBegin: ({ x, y }) => {
      "worklet";
      pressed.set(hit(x, y));
    },
    onActivate: ({ x, y }) => {
      "worklet";
      const index = hit(x, y);
      if (index >= 0 && index === pressed.value) scheduleOnRN(onSelect, codes[index]);
    },
    onFinalize: () => {
      "worklet";
      pressed.set(-1);
    },
  });
  const gesture = useExclusiveGestures(pan, tap);

  const glide = (x: number, y: number) => {
    tx.set(withSpring(x, { damping: 16, stiffness: 140 }));
    ty.set(withSpring(y, { damping: 16, stiffness: 140 }));
    setMovedFor("");
  };
  const locate = () => {
    glide(homeX, homeY);
    // Asks for location (once) and refreshes it, so a trip abroad shows the new country.
    locateCountry(true).then((code) => {
      if (!code) return;
      setHereCode(code);
      const index = codes.indexOf(code);
      if (index >= 0) glide(-cells[index].x, -cells[index].y);
    }).catch(() => {});
  };

  return <View style={styles.frame} onLayout={(event: LayoutChangeEvent) => setSize({ width: event.nativeEvent.layout.width })}>
    <GestureDetector gesture={gesture}>
      <View style={StyleSheet.absoluteFill} collapsable={false}>
        {size.width > 0 && ordered.map((country, index) => (allBubbles || index < 48) && <Bubble
          key={country.code}
          country={country}
          cell={cells[index]}
          index={index}
          here={country.code === hereCode}
          tx={tx} ty={ty} intro={intro} pressed={pressed}
          width={size.width}
          language={language}
          onSelect={select}
        />)}
      </View>
    </GestureDetector>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={language === "ro" ? "Arată țara în care mă aflu" : "Show the country I'm in"}
      onPress={locate}
      style={({ pressed: down }) => [styles.recenter, down && { transform: [{ scale: 0.9 }] }]}
    >
      <Icon name="target" size={18} color={p.blue} />
    </Pressable>
    {!moved && <View pointerEvents="none" style={styles.hint}>
      <Text style={styles.hintText}>{language === "ro" ? "Trage pentru a explora · atinge o țară" : "Drag to explore · tap a country"}</Text>
    </View>}
  </View>;
}

const stylesSheet = themedStyles((p) => ({
  frame: { height: HEIGHT, borderRadius: 28, overflow: "hidden", backgroundColor: p.soft, borderWidth: 1, borderColor: p.line },
  bubbleSlot: { position: "absolute", width: BUBBLE, height: BUBBLE },
  bubble: {
    width: BUBBLE, height: BUBBLE, borderRadius: BUBBLE / 2, borderWidth: 2,
    alignItems: "center", justifyContent: "center", paddingHorizontal: 6,
    shadowColor: p.shadow, shadowOpacity: 0.1, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  bubbleHere: { borderWidth: 3, shadowOpacity: 0.22 },
  hereBadge: {
    position: "absolute", top: 0, right: 2, width: 22, height: 22, borderRadius: 11, backgroundColor: p.blue,
    borderWidth: 2, borderColor: p.white, alignItems: "center", justifyContent: "center",
  },
  flag: { fontSize: 28, lineHeight: 33 },
  name: { color: p.ink, fontSize: 9, lineHeight: 10.5, fontWeight: "700", textAlign: "center", maxWidth: BUBBLE - 12 },
  recenter: {
    position: "absolute", top: 12, right: 12, width: 38, height: 38, borderRadius: 19, backgroundColor: p.white,
    alignItems: "center", justifyContent: "center",
    shadowColor: p.shadow, shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  hint: { position: "absolute", bottom: 10, alignSelf: "center", paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12, backgroundColor: p.white, opacity: 0.92 },
  hintText: { color: p.muted, fontSize: 11, fontWeight: "600" },
}));
