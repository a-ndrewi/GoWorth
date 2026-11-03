import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { useFocusEffect } from "expo-router";
import { GestureDetector, useExclusiveGestures, usePanGesture, usePinchGesture, useSimultaneousGestures, useTapGesture } from "react-native-gesture-handler";
import Animated, {
  Easing, cancelAnimation, useAnimatedReaction, useAnimatedStyle, useSharedValue,
  withDecay, withDelay, withRepeat, withSpring, withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { countryAnchor, countryFlag, type Country } from "@/data/geography";
import { translate } from "@/data/i18n";
import { useAppLanguage } from "@/data/formatting";
import { themedStyles } from "@/constants/design";
import { usePalette, useStyles } from "@/state/theme-context";
import { Icon, useScrollLock } from "@/components/goworth/ui";
import { GlobeSurface, type GlobeBubbles } from "@/components/goworth/globe-surface";
import { BUBBLE, bubbleScale, projectPoint as project, revealFor } from "@/components/goworth/globe-math";
import { deviceCountry } from "@/utils/device-location";
import { finishBootTask } from "@/state/boot";

const HEIGHT = 390;
const DEG = Math.PI / 180;
const MAX_ZOOM = 6;
/** How long the globe has to stay still before the full outlines come in. */
const SETTLE_MS = 160;

export type GlobeFocus = { key: string; latitude: number; longitude: number; zoom?: number };
export type GlobeDot = { id: string; latitude: number; longitude: number };

export const CountryGlobe = memo(function CountryGlobe({ countries, highlighted, focus, marker, dots = [], onSelect }: {
  countries: Country[];
  /** Codes to emphasise (search or region); the rest are dimmed. `null` shows every country normally. */
  highlighted: string[] | null;
  focus?: GlobeFocus | null;
  marker?: { latitude: number; longitude: number } | null;
  dots?: GlobeDot[];
  onSelect: (code: string) => void;
}) {
  const styles = useStyles(stylesSheet);
  const p = usePalette();
  const language = useAppLanguage();
  const lockScroll = useScrollLock();
  const [width, setWidth] = useState(0);
  // The Skia surface takes a moment to mount, which made opening the Map tab stall.
  // The screen is shown first with the empty frame, and the globe fills it in the next frame.
  const [painted, setPainted] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const frame = requestAnimationFrame(() => { timer = setTimeout(() => setPainted(true), 0); });
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); };
  }, []);
  const [hereCode, setHereCode] = useState<string | null>(null);
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
    // The device's country always shows, even when it is one of the small ones revealed only up close.
    return codes.map((code) => highlightSet?.has(code) || code === hereCode ? 1 : (ranks.get(code) ?? 0) < 45 ? 1 : (ranks.get(code) ?? 0) < 110 ? 1.9 : 3);
  }, [anchored, codes, highlightSet, hereCode]);
  const dimmedFlags = useMemo(() => codes.map((code) => !!highlightSet && !highlightSet.has(code)), [codes, highlightSet]);
  // The bubbles are drawn by the globe's Skia surface rather than as a view each: two hundred views moved on every frame
  // of a turn or a zoom were what made the globe lag, and mounting them stalled the screen.
  const bubbles = useMemo<GlobeBubbles>(() => ({
    lons, lats, minZooms, dimmed: dimmedFlags,
    emphasized: codes.map((code) => !!highlightSet && highlightSet.has(code) && highlightSet.size <= 12),
    here: hereCode ? codes.indexOf(hereCode) : -1,
    flags: codes.map(countryFlag),
    names: anchored.map((item) => translate(item.country.name, language)),
    colors: { white: p.white, ring: p.orange, here: p.blue, ink: p.ink, line: p.line },
  }), [lons, lats, minZooms, dimmedFlags, codes, highlightSet, hereCode, anchored, language, p]);
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
  // 0 while the globe turns or zooms, 1 once it has been still for a moment. Heavy work waits for 1.
  const settled = useSharedValue(1);
  useAnimatedReaction(() => [lam.value, phi.value, zoom.value], (_, before) => {
    if (!before) return;
    settled.set(0);
    settled.set(withDelay(SETTLE_MS, withTiming(1, { duration: 0 })));
  });

  // Nothing more mounts once the globe has drawn, so the launch warm-up is done then.
  useEffect(() => {
    if (painted) finishBootTask("map");
  }, [painted]);
  // No turn on its own when the globe appears: it redrew the whole surface every frame just as the screen opened.
  // It moves when it flies to the device's country or a search, and otherwise only while it is touched.
  // The marker pulse stops while the Map tab is hidden. Focus events drive it because the frozen tab never re-renders
  // as unfocused, so a returning focus would otherwise look unchanged.
  useFocusEffect(useCallback(() => {
    if (!marker) return;
    // A few pulses draw the eye; an endless pulse would redraw the screen every frame.
    markerPulse.set(0);
    markerPulse.set(withRepeat(withTiming(1, { duration: 1400 }), 4));
    return () => cancelAnimation(markerPulse);
  }, [marker, markerPulse]));

  const flyTo = useCallback((target: Omit<GlobeFocus, "key">) => {
    cancelAnimation(lam);
    const current = lam.get();
    const delta = ((((target.longitude - current) % 360) + 540) % 360) - 180;
    lam.set(withTiming(current + delta, { duration: 900, easing: Easing.inOut(Easing.cubic) }));
    phi.set(withTiming(Math.max(-70, Math.min(70, target.latitude)), { duration: 900, easing: Easing.inOut(Easing.cubic) }));
    zoom.set(withTiming(target.zoom ?? 2.2, { duration: 900, easing: Easing.inOut(Easing.cubic) }));
  }, [lam, phi, zoom]);
  useEffect(() => {
    if (focus) flyTo(focus);
  }, [focus, flyTo]);

  // Only a permission given earlier is used here; the location button is what asks for it.
  // The globe turns to the device's country unless the screen opened on a place of its own.
  const openedOnFocus = useRef(!!focus);
  useEffect(() => {
    // The fly-in starts once the globe has drawn, so it does not share its first frames with the mounting.
    if (!painted) return;
    let active = true;
    deviceCountry(false).then((here) => {
      if (!active || !here) return;
      setHereCode(here.countryCode);
      if (!openedOnFocus.current) flyTo({ latitude: here.latitude, longitude: here.longitude, zoom: 2.2 });
    }).catch(() => {});
    return () => { active = false; };
  }, [flyTo, painted]);
  const locate = () => {
    // Asks for location (once) and refreshes it, so a trip abroad shows the new country.
    deviceCountry(true).then((here) => {
      if (!here) return;
      setHereCode(here.countryCode);
      flyTo({ latitude: here.latitude, longitude: here.longitude, zoom: 2.2 });
    }).catch(() => {});
  };

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
      scheduleOnRN(lockScroll, true);
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
      scheduleOnRN(lockScroll, false);
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
    zoom.set(withSpring(Math.max(1, Math.min(MAX_ZOOM, zoom.get() * factor)), { damping: 16, stiffness: 160 }));
  };
  const reset = () => {
    cancelAnimation(lam);
    zoom.set(withSpring(1, { damping: 16, stiffness: 140 }));
    phi.set(withSpring(28, { damping: 16, stiffness: 140 }));
  };

  return <View style={styles.frame} onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}>
    <GestureDetector gesture={gesture}>
      <View style={StyleSheet.absoluteFill} collapsable={false}>
        {width > 0 && painted && <>
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <GlobeSurface width={width} height={HEIGHT} radius={radius} lam={lam} phi={phi} zoom={zoom} settled={settled} dots={dotCoordinates} bubbles={bubbles} pressed={pressed} />
          </View>
          {!!marker && <Animated.View pointerEvents="none" style={[styles.marker, { left: cx - 9, top: cy - 9 }, markerStyle]}>
            <Animated.View style={[styles.markerPulse, pulseStyle]} />
            <View style={styles.markerDot} />
          </Animated.View>}
        </>}
      </View>
    </GestureDetector>
    <View style={styles.controls}>
      <Pressable accessibilityRole="button" accessibilityLabel={language === "ro" ? "Arată țara în care mă aflu" : "Show the country I'm in"} onPress={locate} style={({ pressed: down }) => [styles.control, down && styles.controlPressed]}><Icon name="target" size={18} color={p.blue} /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={language === "ro" ? "Mărește" : "Zoom in"} onPress={() => zoomBy(1.6)} style={({ pressed: down }) => [styles.control, down && styles.controlPressed]}><Icon name="plus" size={20} color={p.blue} /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={language === "ro" ? "Micșorează" : "Zoom out"} onPress={() => zoomBy(1 / 1.6)} style={({ pressed: down }) => [styles.control, down && styles.controlPressed]}><View style={styles.minus} /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={language === "ro" ? "Vezi tot globul" : "Show the whole globe"} onPress={reset} style={({ pressed: down }) => [styles.control, down && styles.controlPressed]}><Icon name="globe" size={19} color={p.blue} /></Pressable>
    </View>
  </View>;
});

const stylesSheet = themedStyles((p) => ({
  frame: { height: HEIGHT, borderRadius: 26, overflow: "hidden", backgroundColor: p.blueTint, borderWidth: 1, borderColor: p.blueLine },
  marker: { position: "absolute", width: 18, height: 18, alignItems: "center", justifyContent: "center" },
  markerPulse: { position: "absolute", width: 18, height: 18, borderRadius: 9, backgroundColor: p.pink },
  markerDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: p.pink, borderWidth: 2, borderColor: p.white },
  controls: { position: "absolute", right: 10, bottom: 10, gap: 8 },
  control: { width: 36, height: 36, borderRadius: 18, backgroundColor: p.white, alignItems: "center", justifyContent: "center",
    shadowColor: "#1E3A8A", shadowOpacity: 0.18, shadowRadius: 0, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  controlPressed: { transform: [{ scale: 0.9 }], backgroundColor: p.blueSoft },
  minus: { width: 14, height: 2.4, borderRadius: 2, backgroundColor: p.blue },
}));
