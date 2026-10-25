import { Pressable, Text, View } from "react-native";
import { countryFlag, type Country } from "@/data/geography";
import { translate } from "@/data/i18n";
import { useAppLanguage } from "@/data/formatting";
import { themedStyles } from "@/constants/design";
import { useStyles } from "@/state/theme-context";

export function CountryGrid({
  countries,
  onSelect,
}: {
  countries: Country[];
  onSelect: (code: string) => void;
}) {
  const styles = useStyles(stylesSheet);
  const language = useAppLanguage();
  return <View style={styles.grid}>
    {countries.map((country) => <Pressable
      key={country.code}
      accessibilityRole="button"
      accessibilityLabel={`Explore ${country.name}`}
      onPress={() => onSelect(country.code)}
      style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
    >
      <View style={styles.flag}><Text style={styles.flagText}>{countryFlag(country.code)}</Text></View>
      <Text numberOfLines={2} style={styles.name}>{translate(country.name, language)}</Text>
      <Text style={styles.meta}>{country.cityCount.toLocaleString(language === "ro" ? "ro-RO" : "en-US")} {language === "ro" ? "orașe" : "cities"}</Text>
    </Pressable>)}
  </View>;
}

const stylesSheet = themedStyles((p) => ({
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12 },
  tile: { width: "31.5%", minHeight: 108, paddingHorizontal: 7, paddingVertical: 10, alignItems: "center", justifyContent: "center", gap: 4, borderWidth: 1, borderColor: p.line, borderRadius: 16, backgroundColor: p.white, shadowColor: p.shadow, shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  tilePressed: { backgroundColor: p.blueSoft, borderColor: p.blue, transform: [{ scale: 0.94 }] },
  flag: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 21, backgroundColor: p.blueSoft },
  flagText: { fontSize: 25, lineHeight: 31 },
  name: { color: p.ink, fontSize: 12, lineHeight: 15, fontWeight: "700", textAlign: "center" },
  meta: { color: p.muted, fontSize: 10, lineHeight: 13 },
}));
