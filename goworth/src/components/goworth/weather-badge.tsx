import { Text, View, type StyleProp, type ViewStyle } from "react-native";
import { GlyphIcon } from "@/components/goworth/icons";
import { formatTemperature, useCurrentWeather } from "@/data/weather";

/** The temperature there right now with a small weather icon; renders nothing until it is known. */
export function WeatherBadge({ point, color, size = 13, style }: {
  point: { latitude: number; longitude: number } | null | undefined;
  color: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const weather = useCurrentWeather(point);
  if (!weather) return null;
  return <View accessible accessibilityLabel={`${formatTemperature(weather.temperature)}`} style={[{ flexDirection: "row", alignItems: "center", gap: 3 }, style]}>
    <GlyphIcon name={weather.kind} size={size + 3} color={color} />
    <Text style={{ color, fontSize: size, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{formatTemperature(weather.temperature)}</Text>
  </View>;
}
