import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { usePalette, useThemePreference } from "@/state/theme-context";

/**
 * The app's loading placeholder: a soft surface with a light band sweeping across it, in the theme's own colours.
 * It takes the size and corners of whatever it stands in for, so content replaces it without a jump.
 */
export function Shimmer({ style }: { style?: StyleProp<ViewStyle> }) {
  const p = usePalette();
  const { scheme } = useThemePreference();
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const progress = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion || !width) return;
    progress.set(withRepeat(withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.quad) }), -1, false));
    return () => cancelAnimation(progress);
  }, [progress, reduceMotion, width]);
  const band = useAnimatedStyle(() => ({ transform: [{ translateX: -width + progress.value * width * 2 }] }));
  const glow = scheme === "dark" ? "rgba(140,170,255,0.10)" : "rgba(255,255,255,0.75)";
  return <View accessibilityRole="progressbar" accessibilityLabel="Loading" onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    style={[{ overflow: "hidden", backgroundColor: p.soft }, style]}>
    {!reduceMotion && width > 0 && <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, band]}>
      <LinearGradient colors={["transparent", glow, "transparent"]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
    </Animated.View>}
  </View>;
}

/** Placeholder rows for a list of places: a photo square and two lines of text, like the rows that will replace them. */
export function SkeletonRows({ count = 4, thumbSize = 54, card = false }: { count?: number; thumbSize?: number; card?: boolean }) {
  const p = usePalette();
  return <View style={{ gap: card ? 10 : 0 }}>
    {Array.from({ length: count }, (_, index) => <View key={index} style={[{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
      card ? { padding: 10, borderRadius: 18, borderWidth: 1.5, borderColor: p.line } : { borderBottomWidth: 1, borderColor: p.line }]}>
      <Shimmer style={{ width: thumbSize, height: thumbSize, borderRadius: card ? 14 : 6 }} />
      <View style={{ flex: 1, gap: 8 }}>
        <Shimmer style={{ height: 13, width: `${70 - (index % 3) * 12}%`, borderRadius: 6 }} />
        <Shimmer style={{ height: 10, width: "38%", borderRadius: 5 }} />
      </View>
    </View>)}
  </View>;
}
