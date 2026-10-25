import { LinearGradient } from "expo-linear-gradient";
import { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useIsFocused } from "expo-router";
import Animated, {
  cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { themedStyles } from "@/constants/design";
import { usePalette, useStyles } from "@/state/theme-context";
import { GlyphIcon } from "@/components/goworth/icons";

const SIZE = 48;

/** Explore's itinerary shortcut: a plane orbiting a globe on a dashed route, with a soft pulse. */
export function TripShortcut({ label, onPress }: { label: string; onPress: () => void }) {
  const styles = useStyles(stylesSheet);
  const p = usePalette();
  const orbit = useSharedValue(0);
  const pulse = useSharedValue(0);
  const press = useSharedValue(1);
  const focused = useIsFocused();
  useEffect(() => {
    // A couple of turns each time Explore is shown: an endless loop would redraw every frame and keep the CPU busy.
    if (!focused) return;
    orbit.set(0);
    orbit.set(withRepeat(withTiming(1, { duration: 5200, easing: Easing.linear }), 2));
    pulse.set(withRepeat(withSequence(withTiming(1, { duration: 1500, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 0 })), 3));
    return () => { cancelAnimation(orbit); cancelAnimation(pulse); };
  }, [focused, orbit, pulse]);
  const orbitStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${orbit.value * 360}deg` }] }));
  const pulseStyle = useAnimatedStyle(() => ({ opacity: 0.45 * (1 - pulse.value), transform: [{ scale: 1 + pulse.value * 0.32 }] }));
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }, { rotate: `${(1 - press.value) * -40}deg` }] }));
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    onPress={onPress}
    onPressIn={() => { press.set(withSpring(0.86, { damping: 14, stiffness: 420 })); }}
    onPressOut={() => { press.set(withSpring(1, { damping: 6, stiffness: 240 })); }}
    style={styles.hit}
  >
    <Animated.View pointerEvents="none" style={[styles.pulse, pulseStyle]} />
    <Animated.View style={[styles.button, pressStyle]}>
      <View style={styles.clip}>
        <LinearGradient colors={[p.blue, "#3B7BF0", p.teal]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      </View>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg width={SIZE} height={SIZE}>
          <Circle cx={SIZE / 2} cy={SIZE / 2} r={15} stroke="rgba(255,255,255,0.55)" strokeWidth={1.4} strokeDasharray="2 3.2" fill="none" />
        </Svg>
      </View>
      <View><GlyphIcon name="globe" size={20} color={p.onColor} /></View>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, orbitStyle]}>
        <View style={styles.plane}>
          <GlyphIcon name="plane" size={13} color={p.onColor} />
        </View>
      </Animated.View>
    </Animated.View>
  </Pressable>;
}

const stylesSheet = themedStyles((p) => ({
  hit: { width: SIZE, minHeight: SIZE, alignItems: "center", justifyContent: "center" },
  pulse: { position: "absolute", width: SIZE, height: SIZE, borderRadius: 17, backgroundColor: p.blue },
  button: {
    width: SIZE, height: SIZE, borderRadius: 17, alignItems: "center", justifyContent: "center",
    shadowColor: p.blue, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 5,
  },
  clip: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, borderRadius: 17, overflow: "hidden" },
  // Sits on top of the dashed orbit and points along it (clockwise), so rotation carries it around the globe.
  plane: { position: "absolute", top: SIZE / 2 - 15 - 6.5, left: SIZE / 2 - 6.5, transform: [{ rotate: "90deg" }] },
}));
