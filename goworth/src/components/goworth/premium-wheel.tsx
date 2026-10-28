import { forwardRef, useImperativeHandle, useState } from "react";
import { View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import Svg, { Circle, Defs, G, LinearGradient, Path, RadialGradient, Stop, Text as SvgText } from "react-native-svg";
import { wheelSlices, wheelTargetRotation, type WheelPrize } from "@/lib/wheel-odds";

export type PremiumWheelHandle = { spinTo: (prize: WheelPrize, onDone: () => void) => void };

const SPIN_MS = 4800;
const POINTER = 34;
const BULBS = 24;
const CROWN = "M4 8l4 4 4-6 4 6 4-4-1.5 10h-13z";

/** The wheel's own colours: a night-blue and gold casino look, the same in light and dark themes. */
export const wheelColors = {
  gold: "#F5C451", goldLight: "#FFE7A3", goldDark: "#B07A18", goldInk: "#3A2600",
  night: "#0B1430", navy: "#13224A", royal: "#2F5BEA", royalDeep: "#1A3A9E",
} as const;

function slicePath(center: number, radius: number, index: number, count: number) {
  const span = 360 / count;
  const point = (degrees: number) => {
    const radians = (degrees * Math.PI) / 180;
    return `${center + radius * Math.sin(radians)} ${center - radius * Math.cos(radians)}`;
  };
  return `M ${center} ${center} L ${point(index * span - span / 2)} A ${radius} ${radius} 0 0 1 ${point(index * span + span / 2)} Z`;
}

const onCircle = (center: number, radius: number, degrees: number) => {
  const radians = (degrees * Math.PI) / 180;
  return { x: center + radius * Math.sin(radians), y: center - radius * Math.cos(radians) };
};

/** A prize wheel whose pointer sits at the top. The server picks the prize; this only animates to a matching slice. */
export const PremiumWheel = forwardRef<PremiumWheelHandle, { size: number; labels: Record<WheelPrize, string> }>(
  function PremiumWheel({ size, labels }, ref) {
    const c = wheelColors;
    const rotation = useSharedValue(0);
    const [spinning, setSpinning] = useState(false);
    const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));

    useImperativeHandle(ref, () => ({
      spinTo(prize, onDone) {
        const target = wheelTargetRotation(rotation.get(), prize, Math.random());
        setSpinning(true);
        rotation.set(withTiming(target, { duration: SPIN_MS, easing: Easing.out(Easing.cubic) }, (finished) => {
          if (finished) { scheduleOnRN(setSpinning, false); scheduleOnRN(onDone); }
        }));
      },
    }), [rotation]);

    const center = size / 2;
    const rim = center - 2;
    const radius = rim - size * 0.06;
    const span = 360 / wheelSlices.length;
    const fill = (prize: WheelPrize, index: number) => prize === "lifetime" ? "url(#lifetime)" : prize === "premium_month" ? "url(#month)" : index % 2 ? "url(#nightA)" : "url(#nightB)";
    const ink = (prize: WheelPrize) => prize === "lifetime" ? c.goldInk : prize === "premium_month" ? "#FFFFFF" : "rgba(255,231,163,0.72)";
    const fontSize = size < 280 ? 10 : 12;
    const hub = radius * 0.2;

    return <View style={{ width: size, height: size + POINTER / 2, alignItems: "center" }}>
      {/* Soft gold halo behind the rim. */}
      <View pointerEvents="none" style={{
        position: "absolute", top: POINTER / 2, width: size, height: size, borderRadius: size / 2,
        shadowColor: c.gold, shadowOpacity: 0.45, shadowRadius: 22, shadowOffset: { width: 0, height: 6 }, elevation: 10,
        backgroundColor: c.night,
      }} />
      <Animated.View style={[{ width: size, height: size, marginTop: POINTER / 2 }, style]}>
        <Svg width={size} height={size}>
          <Defs>
            <LinearGradient id="rim" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={c.goldLight} />
              <Stop offset="0.45" stopColor={c.gold} />
              <Stop offset="1" stopColor={c.goldDark} />
            </LinearGradient>
            <LinearGradient id="lifetime" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={c.goldLight} />
              <Stop offset="1" stopColor={c.gold} />
            </LinearGradient>
            <LinearGradient id="month" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={c.royal} />
              <Stop offset="1" stopColor={c.royalDeep} />
            </LinearGradient>
            <LinearGradient id="nightA" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={c.navy} />
              <Stop offset="1" stopColor={c.night} />
            </LinearGradient>
            <LinearGradient id="nightB" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#1A2C5C" />
              <Stop offset="1" stopColor={c.navy} />
            </LinearGradient>
            <RadialGradient id="sheen" cx="50%" cy="50%" r="50%">
              <Stop offset="0.55" stopColor="#000000" stopOpacity="0" />
              <Stop offset="1" stopColor="#000000" stopOpacity="0.38" />
            </RadialGradient>
            <RadialGradient id="hub" cx="40%" cy="35%" r="70%">
              <Stop offset="0" stopColor={c.goldLight} />
              <Stop offset="0.6" stopColor={c.gold} />
              <Stop offset="1" stopColor={c.goldDark} />
            </RadialGradient>
          </Defs>

          <Circle cx={center} cy={center} r={rim} fill="url(#rim)" />
          <Circle cx={center} cy={center} r={rim - 3} fill={c.night} />
          {Array.from({ length: BULBS }, (_, index) => {
            const { x, y } = onCircle(center, (rim + radius) / 2 - 0.5, (index * 360) / BULBS + span / 2);
            // Alternate bulbs glow brighter while spinning, like marquee lights.
            const lit = spinning ? index % 2 === 0 : true;
            return <G key={`bulb-${index}`}>
              <Circle cx={x} cy={y} r={size * 0.016} fill={lit ? c.goldLight : c.goldDark} opacity={lit ? 1 : 0.7} />
              <Circle cx={x - size * 0.004} cy={y - size * 0.004} r={size * 0.006} fill="#FFFFFF" opacity={lit ? 0.9 : 0.25} />
            </G>;
          })}
          <Circle cx={center} cy={center} r={radius + 1.5} fill="url(#rim)" />

          {wheelSlices.map((prize, index) => <Path key={index} d={slicePath(center, radius, index, wheelSlices.length)} fill={fill(prize, index)} />)}
          {wheelSlices.map((_, index) => {
            const { x, y } = onCircle(center, radius, index * span - span / 2);
            return <Path key={`sep-${index}`} d={`M ${center} ${center} L ${x} ${y}`} stroke={c.gold} strokeWidth={1.4} strokeOpacity={0.85} />;
          })}
          <Circle cx={center} cy={center} r={radius} fill="url(#sheen)" />

          {wheelSlices.map((prize, index) => <G key={`label-${index}`} transform={`rotate(${index * span} ${center} ${center})`}>
            {prize === "lifetime" && <G transform={`translate(${center - fontSize * 0.75} ${center - radius * 0.9}) scale(${fontSize / 16})`}>
              <Path d={CROWN} fill={c.goldInk} />
            </G>}
            {prize === "premium_month" && <Path
              d={`M ${center} ${center - radius * 0.9} l ${fontSize * 0.28} ${fontSize * 0.62} ${fontSize * 0.62} ${fontSize * 0.28} -${fontSize * 0.62} ${fontSize * 0.28} -${fontSize * 0.28} ${fontSize * 0.62} -${fontSize * 0.28} -${fontSize * 0.62} -${fontSize * 0.62} -${fontSize * 0.28} ${fontSize * 0.62} -${fontSize * 0.28} z`}
              fill="#FFFFFF" opacity={0.9} />}
            <SvgText x={center} y={center - radius * 0.66} fill={ink(prize)} fontSize={prize === "none" ? fontSize * 0.85 : fontSize} fontWeight="800"
              textAnchor="middle" letterSpacing={prize === "none" ? 0.2 : 0.8} fontFamily="Helvetica, Arial, sans-serif">
              {labels[prize].toUpperCase()}
            </SvgText>
          </G>)}

          <Circle cx={center} cy={center} r={hub + 4} fill={c.night} opacity={0.5} />
          <Circle cx={center} cy={center} r={hub} fill="url(#hub)" stroke={c.goldLight} strokeWidth={1.5} />
          <Circle cx={center} cy={center} r={hub * 0.72} fill={c.night} />
          <G transform={`translate(${center - hub * 0.5} ${center - hub * 0.52}) scale(${hub / 24})`}>
            <Path d={CROWN} fill={c.gold} />
          </G>
        </Svg>
      </Animated.View>

      {/* Gold pointer with a gem, fixed above the wheel. */}
      <Svg width={POINTER} height={POINTER + 4} style={{ position: "absolute", top: 0 }}>
        <Defs>
          <LinearGradient id="pointer" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={c.goldLight} />
            <Stop offset="1" stopColor={c.goldDark} />
          </LinearGradient>
        </Defs>
        <Path d={`M 4 6 Q 4 2 8 2 L ${POINTER - 8} 2 Q ${POINTER - 4} 2 ${POINTER - 4} 6 L ${POINTER / 2 + 2} ${POINTER} Q ${POINTER / 2} ${POINTER + 3} ${POINTER / 2 - 2} ${POINTER} Z`}
          fill="url(#pointer)" stroke={c.night} strokeWidth={1.5} strokeLinejoin="round" />
        <Circle cx={POINTER / 2} cy={11} r={4.5} fill={c.royal} stroke="#FFFFFF" strokeWidth={1.2} />
        <Circle cx={POINTER / 2 - 1.4} cy={9.6} r={1.3} fill="#FFFFFF" opacity={0.85} />
      </Svg>
    </View>;
  },
);
