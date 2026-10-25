import { router, type Href } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { sharedSheet } from "@/components/goworth/ui";
import { GlyphIcon, type GlyphName } from "@/components/goworth/icons";
import { usePalette, useStyles } from "@/state/theme-context";
import { translate } from "@/data/i18n";
import { useAppLanguage } from "@/data/formatting";

type ItineraryTab = "overview" | "places" | "budget";

const tabs: { id: ItineraryTab; label: string; icon: GlyphName; href: string }[] = [
  { id: "overview", label: "Itinerary", icon: "calendar", href: "/itinerary" },
  { id: "places", label: "Places", icon: "pin", href: "/itinerary-places" },
  { id: "budget", label: "Budget", icon: "wallet", href: "/budget" },
];

export function ItineraryNav({ active, day }: { active: ItineraryTab; day: number }) {
  const s = useStyles(sharedSheet);
  const p = usePalette();
  const language = useAppLanguage();
  return (
    <View style={s.navShell}>
      <View style={s.nav}>
        {tabs.map((tab) => (
          <Pressable
            key={tab.id}
            accessibilityRole="button"
            accessibilityLabel={translate(tab.label, language)}
            accessibilityState={{ selected: active === tab.id }}
            onPress={() => {
              if (active !== tab.id) router.navigate({ pathname: tab.href, params: { day: String(day) } } as Href);
            }}
            style={({ pressed }) => [s.navItem, pressed && { opacity: 0.78 }]}
          >
            <View style={[s.navIcon, active === tab.id && s.navIconActive]}>
              <GlyphIcon name={tab.icon} size={22} color={active === tab.id ? p.blue : p.muted} />
            </View>
            <Text style={[s.navLabel, active === tab.id && s.navLabelActive]}>{translate(tab.label, language)}</Text>
            {active === tab.id && <View style={s.navIndicator} />}
          </Pressable>
        ))}
      </View>
    </View>
  );
}
