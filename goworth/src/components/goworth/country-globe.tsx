import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { useIsFocused } from "expo-router";
import { GestureDetector, useExclusiveGestures, usePanGesture, usePinchGesture, useSimultaneousGestures, useTapGesture } from "react-native-gesture-handler";
import Animated, {
  Easing, Extrapolation, cancelAnimation, interpolate, useAnimatedStyle, useSharedValue,
  withDecay, withRepeat, withSpring, withTiming, type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { countryAnchor, countryFlag, type Country } from "@/data/geography";
import { translate } from "@/data/i18n";
import { useAppLanguage } from "@/data/formatting";
import { themedStyles } from "@/constants/design";
import { usePalette, useStyles } from "@/state/theme-context";
import { Icon } from "@/components/goworth/ui";
import { GlobeSurface } from "@/components/goworth/globe-surface";
import { projectPoint as project } from "@/components/goworth/globe-math";

const HEIGHT = 390;
const BUBBLE = 42;
const DEG = Math.PI / 180;
const MAX_ZOOM = 6;

export type GlobeFocus = { key: string; latitude: number; longitude: number; zoom?: number };
export type GlobeDot = { id: string; latitude: number; longitude: number };

/** Bubbles grow toward the middle of the globe and shrink toward its edge, like the Explore comb. */
function bubbleScale(facing: number, zoom: number, dimmed: boolean) {
  "worklet";
  const depth = interpolate(facing, [0, 0.3, 1], [0.22, 0.6, 1], Extrapolation.CLAMP);
  const focus = interpolate(facing, [0.92, 1], [1, interpolate(zoom, [1, 3], [1.22, 1.05], Extrapolation.CLAMP)], Extrapolation.CLAMP);
  // Bubbles peak at a medium zoom, then shrink again so country borders stay visible up close.
  const zoomScale = interpolate(zoom, [1, 2.2, 4, 6], [0.56, 0.86, 0.66, 0.58], Extrapolation.CLAMP);
  return depth * focus * zoomScale * (dimmed ? 0.72 : 1);
}

/** Smaller countries fade in as the globe is zoomed, so the overview is not crowded. */
function revealFor(zoom: number, minZoom: number) {
  "worklet";
  return minZoom <= 1 ? 1 : interpolate(zoom, [minZoom - 0.4, minZoom], [0, 1], Extrapolation.CLAMP);
}

const HIDDEN = { opacity: 0, transform: [{ translateX: 0 }, { translateY: 0 }, { scale: 0 }] };

const GlobeBubble = memo(function GlobeBubble({ country, latitude, longitude, index, minZoom, lam, phi, zoom, pressed, radius, cx, cy, dimmed, emphasized, language, onSelect }: {
  country: Country; latitude: number; longitude: number; index: number; minZoom: number;
  lam: SharedValue<number>; phi: SharedValue<number>; zoom: SharedValue<number>; pressed: SharedValue<number>;
  radius: number; cx: number; cy: number; dimmed: boolean; emphasized: boolean;
  language: ReturnType<typeof useAppLanguage>; onSelect: (code: string) => void;
}) {
  const styles = useStyles(stylesSheet);
  const style = useAnimatedStyle(() => {
    const view = project(longitude, latitude, lam.value, phi.value, radius * zoom.value);
    const reveal = revealFor(zoom.value, minZoom);
    // Returning the same object for hidden bubbles lets Reanimated skip the native update entirely.
    if (view.facing < -0.02 || reveal <= 0) return HIDDEN;
    const scale = bubbleScale(view.facing, zoom.value, dimmed) * (0.55 + 0.45 * reveal) * (pressed.value === index ? 0.84 : 1);
    return {
      opacity: interpolate(view.facing, [-0.02, 0.16], [0, dimmed ? 0.32 : 1], Extrapolation.CLAMP) * reveal,
      transform: [{ translateX: view.x }, { translateY: view.y }, { scale }],
    };
  });
  const labelStyle = useAnimatedStyle(() => ({
    opacity: emphasized ? 1 : dimmed ? 0 : interpolate(zoom.value, [minZoom + 1.3, minZoom + 1.9], [0, 1], Extrapolation.CLAMP),
  }));
  const name = translate(country.name, language);
  return <Animated.View
    accessible
    accessibilityRole="button"
    accessibilityLabel={language === "ro" ? `Explorează ${name}` : `Explore ${name}`}
    accessibilityActions={[{ name: "activate" }]}
    onAccessibilityAction={() => onSelect(country.code)}
    pointerEvents="none"
    style={[styles.bubbleSlot, { left: cx - BUBBLE / 2, top: cy - BUBBLE / 2, zIndex: emphasized ? 2 : 1 }, style]}
  >
    <View style={[styles.bubble, emphasized && styles.bubbleEmphasized]}><Text style={styles.flag}>{countryFlag(country.code)}</Text></View>
    <Animated.View style={[styles.label, labelStyle]}><Text numberOfLines={1} style={styles.labelText}>{name}</Text></Animated.View>
  </Animated.View>;
});

export const CountryGlobe = memo(function CountryGlobe({ countries, highlighted, focus, marker, dots = [], onSelect, onInteraction }: {
  countries: Country[];
  /** Codes to emphasise (search or region); the rest are dimmed. `null` shows every country normally. */
  highlighted: string[] | null;
  focus?: GlobeFocus | null;
  marker?: { latitude: number; longitude: number } | null;
  dots?: GlobeDot[];
  onSelect: (code: string) => void;
  onInteraction?: (active: boolean) => void;
}) {
  const styles = useStyles(stylesSheet);
  const p = usePalette();
  const language = useAppLanguage();
  const selectRef = useRef(onSelect);
  useEffect(() => { selectRef.current = onSelect; }, [onSelect]);
  const select = useCallback((code: string) => selectRef.current(code), []);
  const [width, setWidth] = useState(0);
  const anchored = useMemo(() => countries.flatMap((country) => {
    const anchor = countryAnchor(country);
    return anchor ? [{ country, ...anchor }] : [];
  }), [countries]);
  const lons = useMemo(() => anchored.map((item) => item.longitude), [anchored]);
  const lats = useMemo(() => anchored.map((item) => item.latitude), [anchored]);
  const codes = useMemo(() => anchored.map((item) => item.country.code), [anchored]);
  const highlightSet = useMemo(() => highlighted ? new Set(highlighted) : null, [highlighted]);
  const minZooms = useMemo(() => {
    const ranks = new Map([...anchored].sort((a, b) => b.country.cityCount - a.country.cityCount).map((item, rank) => [item.country.code, rank]));
    return codes.map((code) => highlightSet?.has(code) ? 1 : (ranks.get(code) ?? 0) < 45 ? 1 : (ranks.get(code) ?? 0) < 110 ? 1.9 : 3);
  }, [anchored, codes, highlightSet]);
  const dimmedFlags = useMemo(() => codes.map((code) => !!highlightSet && !highlightSet.has(code)), [codes, highlightSet]);
  const dotCoordinates = useMemo(() => dots.flatMap((dot) => [dot.longitude, dot.latitude]), [dots]);
  const cx = width / 2, cy = HEIGHT / 2;
  const radius = Math.max(60, Math.min(width, HEIGHT) / 2 - 18);
  const lam = useSharedValue(18);
  const phi = useSharedValue(28);
  const zoom = useSharedValue(1);
  const startLam = useSharedValue(0);
  const startPhi = useSharedValue(0);
  const startZoom = useSharedValue(1);
  const pressed = useSharedValue(-1);
  const markerPulse = useSharedValue(0);

  // Only the largest countries show at the starting zoom; the rest mount a moment later so the globe appears quickly.
  const [allBubbles, setAllBubbles] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setAllBubbles(true), 700);
    return () => clearTimeout(timer);
  }, []);
  const focused = useIsFocused();
  useEffect(() => {
    // One short turn when the globe appears; it then only redraws while it is touched or animating.
    lam.set(withTiming(lam.value + 40, { duration: 1400, easing: Easing.out(Easing.cubic) }));
  }, [lam]);
  useEffect(() => {
    // The marker pulse stops while the Map tab is hidden.
    if (!focused || !marker) return;
    // A few pulses draw the eye; an endless pulse would redraw the screen every frame.
    markerPulse.set(withRepeat(withTiming(1, { duration: 1400 }), 4));
    return () => cancelAnimation(markerPulse);
  }, [focused, marker, markerPulse]);

  useEffect(() => {
    if (!focus) return;
    cancelAnimation(lam);
    const current = lam.value;
    const delta = ((((focus.longitude - current) % 360) + 540) % 360) - 180;
    lam.set(withTiming(current + delta, { duration: 900, easing: Easing.inOut(Easing.cubic) }));
    phi.set(withTiming(Math.max(-70, Math.min(70, focus.latitude)), { duration: 900, easing: Easing.inOut(Easing.cubic) }));
    zoom.set(withTiming(focus.zoom ?? 2.2, { duration: 900, easing: Easing.inOut(Easing.cubic) }));
  }, [focus, lam, phi, zoom]);

  const markerStyle = useAnimatedStyle(() => {
    if (!marker) return { opacity: 0 };
    const view = project(marker.longitude, marker.latitude, lam.value, phi.value, radius * zoom.value);
    return { opacity: view.facing > 0 ? 1 : 0, zIndex: 3000, transform: [{ translateX: view.x }, { translateY: view.y }] };
  });
  const pulseStyle = useAnimatedStyle(() => ({ opacity: 0.55 * (1 - markerPulse.value), transform: [{ scale: 0.6 + markerPulse.value * 1.6 }] }));

  const hit = (x: number, y: number) => {
    "worklet";
    let best = -1, bestFacing = -1;
    for (let i = 0; i < lons.length; i++) {
      const view = project(lons[i], lats[i], lam.value, phi.value, radius * zoom.value);
      if (view.facing < 0.1 || revealFor(zoom.value, minZooms[i]) < 0.5) continue;
      const scale = bubbleScale(view.facing, zoom.value, dimmedFlags[i]);
      const dx = x - cx - view.x, dy = y - cy - view.y;
      if (Math.sqrt(dx * dx + dy * dy) <= (BUBBLE / 2) * scale + 4 && view.facing > bestFacing) { best = i; bestFacing = view.facing; }
    }
    return best;
  };
  const pan = usePanGesture({
    minDistance: 4,
    onBegin: () => {
      "worklet";
      cancelAnimation(lam); cancelAnimation(phi);
      startLam.set(lam.value); startPhi.set(phi.value);
      if (onInteraction) scheduleOnRN(onInteraction, true);
    },
    onActivate: () => {
      "worklet";
      pressed.set(-1);
    },
    onUpdate: ({ translationX, translationY }) => {
      "worklet";
      const r = radius * zoom.value;
      lam.set(startLam.value - translationX / r / DEG);
      phi.set(Math.max(-75, Math.min(75, startPhi.value + translationY / r / DEG)));
    },
    onDeactivate: ({ velocityX, velocityY }) => {
      "worklet";
      const r = radius * zoom.value;
      // A long, soft glide; latitude eases into its limit instead of stopping hard.
      lam.set(withDecay({ velocity: -velocityX / r / DEG, deceleration: 0.9975, velocityFactor: 0.9 }));
      phi.set(withDecay({ velocity: velocityY / r / DEG, deceleration: 0.9975, velocityFactor: 0.9, clamp: [-75, 75], rubberBandEffect: true, rubberBandFactor: 0.8 }));
    },
    onFinalize: () => {
      "worklet";
      if (onInteraction) scheduleOnRN(onInteraction, false);
    },
  });
  const pinch = usePinchGesture({
    onBegin: () => {
      "worklet";
      cancelAnimation(zoom); startZoom.set(zoom.value);
    },
    onUpdate: ({ scale }) => {
      "worklet";
      zoom.set(Math.max(1, Math.min(MAX_ZOOM, startZoom.value * scale)));
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
  const turnAndZoom = useSimultaneousGestures(pan, pinch);
  const gesture = useExclusiveGestures(turnAndZoom, tap);

  const zoomBy = (factor: number) => {
    cancelAnimation(zoom);
    zoom.set(withSpring(Math.max(1, Math.min(MAX_ZOOM, zoom.value * factor)), { damping: 16, stiffness: 160 }));
  };
  const reset = () => {
    cancelAnimation(lam);
    zoom.set(withSpring(1, { damping: 16, stiffness: 140 }));
    phi.set(withSpring(28, { damping: 16, stiffness: 140 }));
  };

  return <View style={styles.frame} onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}>
    <GestureDetector gesture={gesture}>
      <View style={StyleSheet.absoluteFill} collapsable={false}>
        {width > 0 && <>
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <GlobeSurface width={width} height={HEIGHT} radius={radius} lam={lam} phi={phi} zoom={zoom} dots={dotCoordinates} />
          </View>
          {anchored.map((item, index) => (allBubbles || minZooms[index] <= 1) && <GlobeBubble
            key={item.country.code}
            country={item.country}
            latitude={item.latitude}
            longitude={item.longitude}
            index={index}
            minZoom={minZooms[index]}
            lam={lam} phi={phi} zoom={zoom} pressed={pressed}
            radius={radius} cx={cx} cy={cy}
            dimmed={dimmedFlags[index]}
            emphasized={!!highlightSet && highlightSet.has(item.country.code) && highlightSet.size <= 12}
            language={language}
            onSelect={select}
          />)}
          {!!marker && <Animated.View pointerEvents="none" style={[styles.marker, { left: cx - 9, top: cy - 9 }, markerStyle]}>
            <Animated.View style={[styles.markerPulse, pulseStyle]} />
            <View style={styles.markerDot} />
          </Animated.View>}
        </>}
      </View>
    </GestureDetector>
    <View style={styles.controls}>
      <Pressable accessibilityRole="button" accessibilityLabel={language === "ro" ? "Mărește" : "Zoom in"} onPress={() => zoomBy(1.6)} style={({ pressed: down }) => [styles.control, down && styles.controlPressed]}><Icon name="plus" size={20} color={p.blue} /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={language === "ro" ? "Micșorează" : "Zoom out"} onPress={() => zoomBy(1 / 1.6)} style={({ pressed: down }) => [styles.control, down && styles.controlPressed]}><View style={styles.minus} /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={language === "ro" ? "Vezi tot globul" : "Show the whole globe"} onPress={reset} style={({ pressed: down }) => [styles.control, down && styles.controlPressed]}><Icon name="globe" size={19} color={p.blue} /></Pressable>
    </View>
  </View>;
});

const stylesSheet = themedStyles((p) => ({
  frame: { height: HEIGHT, borderRadius: 26, overflow: "hidden", backgroundColor: p.blueTint, borderWidth: 1, borderColor: p.blueLine },
  bubbleSlot: { position: "absolute", width: BUBBLE, height: BUBBLE, alignItems: "center" },
  bubble: {
    width: BUBBLE, height: BUBBLE, borderRadius: BUBBLE / 2, backgroundColor: p.white, borderWidth: 3, borderColor: p.white,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#1E3A8A", shadowOpacity: 0.3, shadowRadius: 0, shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  bubbleEmphasized: { borderColor: p.orange, borderWidth: 3 },
  flag: { fontSize: 22, lineHeight: 27 },
  label: { position: "absolute", top: BUBBLE + 3, width: 110, alignItems: "center" },
  labelText: { color: p.ink, fontSize: 11, fontWeight: "800", paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.94)" },
  marker: { position: "absolute", width: 18, height: 18, alignItems: "center", justifyContent: "center" },
  markerPulse: { position: "absolute", width: 18, height: 18, borderRadius: 9, backgroundColor: p.pink },
  markerDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: p.pink, borderWidth: 2, borderColor: p.white },
  controls: { position: "absolute", right: 10, bottom: 10, gap: 8 },
  control: { width: 36, height: 36, borderRadius: 18, backgroundColor: p.white, alignItems: "center", justifyContent: "center",
    shadowColor: "#1E3A8A", shadowOpacity: 0.18, shadowRadius: 0, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  controlPressed: { transform: [{ scale: 0.9 }], backgroundColor: p.blueSoft },
  minus: { width: 14, height: 2.4, borderRadius: 2, backgroundColor: p.blue },
}));
