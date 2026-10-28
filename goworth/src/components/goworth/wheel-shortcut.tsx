import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useIsFocused } from "expo-router";
import Animated, {
  cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Defs, G, LinearGradient, Path, Stop } from "react-native-svg";
import { wheelColors } from "@/components/goworth/premium-wheel";
import { translate } from "@/data/i18n";
import { useAppLanguage } from "@/data/formatting";
import type { WheelStatus } from "@/lib/wheel";
import { wheelCountdown, wheelRemainingMs, wheelSlices } from "@/lib/wheel-odds";

const SIZE = 48;
const START_DELAY = 500;

function miniSlice(center: number, radius: number, index: number, count: number) {
  const span = 360 / count;
  const point = (degrees: number) => {
    const radians = (degrees * Math.PI) / 180;
    return `${center + radius * Math.sin(radians)} ${center - radius * Math.cos(radians)}`;
  };
  return `M ${center} ${center} L ${point(index * span - span / 2)} A ${radius} ${radius} 0 0 1 ${point(index * span + span / 2)} Z`;
}

/** Ticks once a second while the cooldown runs, then settles at 0. */
function useRemaining(status: WheelStatus | null) {
  const [now, setNow] = useState(Date.now);
  const remaining = status ? wheelRemainingMs(status.nextSpinAt, status.clockOffsetMs, now) : 0;
  const counting = remaining > 0;
  useEffect(() => {
    if (!status) return;
    // A fresh status may arrive long after the last tick, so resync right away before ticking.
    const first = setTimeout(() => setNow(Date.now()), 0);
    const timer = counting ? setInterval(() => setNow(Date.now()), 1000) : undefined;
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [status, counting]);
  return remaining;
}

/** Pill under the wheel: a gently pulsing "Spin now" when ready, the cooldown countdown otherwise. */
function WheelBadge({ remaining }: { remaining: number }) {
  const c = wheelColors;
  const language = useAppLanguage();
  const ready = remaining <= 0;
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (!ready) { cancelAnimation(pulse); pulse.set(1); return; }
    pulse.set(withRepeat(withSequence(
      withTiming(1.08, { duration: 650, easing: Easing.inOut(Easing.quad) }),
      withTiming(1, { duration: 650, easing: Easing.inOut(Easing.quad) }),
    ), -1));
    return () => cancelAnimation(pulse);
  }, [ready, pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  return <View pointerEvents="none" style={{ position: "absolute", bottom: -8, left: -12, right: -12, alignItems: "center" }}>
    <Animated.View style={[{
      paddingHorizontal: 6, height: 16, borderRadius: 8, justifyContent: "center",
      backgroundColor: ready ? c.gold : c.night, borderWidth: 1, borderColor: ready ? c.goldLight : c.goldDark,
      shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 3,
    }, pulseStyle]}>
      <Text numberOfLines={1} allowFontScaling={false} style={{
        fontSize: 9, lineHeight: 12, fontWeight: "800", letterSpacing: ready ? 0.4 : 0.2,
        color: ready ? c.goldInk : c.goldLight, fontVariant: ["tabular-nums"],
      }}>
        {ready ? translate("Spin now", language).toUpperCase() : wheelCountdown(remaining)}
      </Text>
    </Animated.View>
  </View>;
}

/** Explore's shortcut to the daily Premium wheel: a tiny gold wheel that gives one spin when shown, badged with the cooldown or "Spin now". */
export function WheelShortcut({ label, status, onPress }: { label: string; status: WheelStatus | null; onPress: () => void }) {
  const c = wheelColors;
  const remaining = useRemaining(status);
  const turn = useSharedValue(0);
  const press = useSharedValue(1);
  const focused = useIsFocused();
  useEffect(() => {
    if (!focused) return;
    turn.set(0);
    turn.set(withDelay(START_DELAY, withTiming(1, { duration: 1800, easing: Easing.out(Easing.cubic) })));
    return () => { cancelAnimation(turn); turn.set(0); };
  }, [focused, turn]);
  const turnStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 360}deg` }] }));
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));
  const center = SIZE / 2;
  const radius = 15.5;
  const fill = (index: number) => wheelSlices[index] === "lifetime" ? c.gold : wheelSlices[index] === "premium_month" ? c.royal : index % 2 ? c.navy : "#1A2C5C";
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    onPress={onPress}
    onPressIn={() => {
      press.set(withSpring(0.88, { damping: 14, stiffness: 420 }));
      turn.set(withTiming(turn.get() + 0.15, { duration: 220, easing: Easing.out(Easing.quad) }));
    }}
    onPressOut={() => { press.set(withSpring(1, { damping: 6, stiffness: 240 })); }}
    style={{ width: SIZE, minHeight: SIZE, alignItems: "center", justifyContent: "center" }}
  >
    <Animated.View style={[{
      width: SIZE, height: SIZE, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: c.night,
      shadowColor: c.gold, shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 5,
    }, pressStyle]}>
      <Animated.View style={turnStyle}>
        <Svg width={SIZE} height={SIZE}>
          <Defs>
            <LinearGradient id="shortcutRim" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={c.goldLight} />
              <Stop offset="1" stopColor={c.goldDark} />
            </LinearGradient>
          </Defs>
          <Circle cx={center} cy={center} r={radius + 2.5} fill="url(#shortcutRim)" />
          {wheelSlices.map((_, index) => <Path key={index} d={miniSlice(center, radius, index, wheelSlices.length)} fill={fill(index)} />)}
          <G>
            {wheelSlices.map((_, index) => {
              const radians = ((index * 360) / wheelSlices.length - 180 / wheelSlices.length) * Math.PI / 180;
              return <Path key={`sep-${index}`} d={`M ${center} ${center} L ${center + radius * Math.sin(radians)} ${center - radius * Math.cos(radians)}`}
                stroke={c.gold} strokeWidth={0.8} />;
            })}
          </G>
          <Circle cx={center} cy={center} r={4} fill="url(#shortcutRim)" />
        </Svg>
      </Animated.View>
      {/* Fixed pointer at the top, so the wheel reads as a prize wheel even this small. */}
      <View pointerEvents="none" style={{ position: "absolute", top: 3 }}>
        <Svg width={10} height={9}><Path d="M 1 1 L 9 1 L 5 8 Z" fill={c.goldLight} stroke={c.night} strokeWidth={1} strokeLinejoin="round" /></Svg>
      </View>
    </Animated.View>
    {status && <WheelBadge remaining={remaining} />}
  </Pressable>;
}
