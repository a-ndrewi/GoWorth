import { Platform, Pressable, Text, View } from "react-native";
import { countryFlag, type Country } from "@/data/geography";
import { translate } from "@/data/i18n";
import { useAppLanguage } from "@/data/formatting";
import { themedStyles } from "@/constants/design";
import { useStyles, useThemePreference } from "@/state/theme-context";

/** Ink per continent, as if each region's border post had its own stamp pad. */
const inks: Record<string, { light: string; dark: string }> = {
  EU: { light: "#2457E6", dark: "#7FA2FF" },
  AS: { light: "#C2410C", dark: "#FDBA74" },
  NA: { light: "#0F766E", dark: "#5EEAD4" },
  SA: { light: "#15803D", dark: "#86EFAC" },
  AF: { light: "#A16207", dark: "#FCD34D" },
  OC: { light: "#7C3AED", dark: "#C4B5FD" },
  AN: { light: "#475569", dark: "#CBD5E1" },
};
const paper = { light: "#FFFBF0", dark: "#172033" };
const stampFont = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

/**
 * The same country always gets the same stamp: one of three shapes and a slight tilt, as if pressed by hand. The
 * roundest is a squircle rather than a circle, which would leave the name and city count too little room.
 */
function stampFor(code: string) {
  const seed = [...code].reduce((sum, letter) => sum * 31 + letter.charCodeAt(0), 7);
  return { radius: [14, 38, 5][seed % 3], tilt: (seed % 9) - 4 };
}

/** One country's passport stamp; it fills the square it is given. */
export function CountryStamp({ country, scale = 1 }: { country: Country; scale?: number }) {
  const styles = useStyles(stylesSheet);
  const language = useAppLanguage();
  const { scheme } = useThemePreference();
  const ink = (inks[country.continent] ?? inks.AN)[scheme === "dark" ? "dark" : "light"];
  const stamp = stampFor(country.code);
  const sized = (size: number) => ({ fontSize: size * scale, lineHeight: size * scale * 1.25 });
  return <View style={[styles.stamp, { borderColor: ink, borderRadius: stamp.radius * scale, transform: [{ rotate: `${stamp.tilt}deg` }] }]}>
    <View style={[styles.inner, { borderColor: ink, borderRadius: stamp.radius * scale }]}>
      <Text style={[styles.code, sized(10), { color: ink }]}>{country.code}</Text>
      <Text style={[styles.flag, sized(20)]}>{countryFlag(country.code)}</Text>
      <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75} style={[styles.name, sized(10), { color: ink }]}>
        {translate(country.name, language).toLocaleUpperCase(language === "ro" ? "ro-RO" : "en-US")}
      </Text>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={[styles.meta, sized(9), { color: ink }]}>{country.cityCount.toLocaleString(language === "ro" ? "ro-RO" : "en-US")} {language === "ro" ? "orașe" : "cities"}</Text>
    </View>
  </View>;
}

/** The paper a stamp is pressed on, matching the boarding pass. */
export const passportPaper = paper;

/** Countries as stamps on a passport page: ink by continent, the country's code, flag, name and how many cities. */
export function CountryGrid({
  countries,
  onSelect,
}: {
  countries: Country[];
  onSelect: (code: string) => void;
}) {
  const styles = useStyles(stylesSheet);
  const { scheme } = useThemePreference();
  return <View style={[styles.page, { backgroundColor: paper[scheme === "dark" ? "dark" : "light"] }]}>
    {countries.map((country) => <Pressable
      key={country.code}
      accessibilityRole="button"
      accessibilityLabel={`Explore ${country.name}`}
      onPress={() => onSelect(country.code)}
      style={({ pressed }) => [styles.slot, pressed && styles.slotPressed]}
    >
      <CountryStamp country={country} />
    </Pressable>)}
  </View>;
}

const stylesSheet = themedStyles((p) => ({
  page: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 14, padding: 12, borderRadius: 22, borderWidth: 1, borderColor: p.line },
  slot: { width: "31%", aspectRatio: 1 },
  slotPressed: { transform: [{ scale: 0.92 }], opacity: 0.75 },
  stamp: { flex: 1, borderWidth: 2, padding: 3 },
  // A second, dashed rule inside the first, as on a border stamp.
  inner: { flex: 1, borderWidth: 1, borderStyle: "dashed", alignItems: "center", justifyContent: "center", paddingHorizontal: 6, gap: 1 },
  code: { fontFamily: stampFont, fontSize: 10, fontWeight: "700", letterSpacing: 2 },
  flag: { fontSize: 20, lineHeight: 25 },
  name: { fontFamily: stampFont, fontSize: 10, lineHeight: 12, fontWeight: "700", letterSpacing: 0.6, textAlign: "center" },
  meta: { fontFamily: stampFont, fontSize: 9, opacity: 0.8 },
}));
