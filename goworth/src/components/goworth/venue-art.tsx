import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View } from "react-native";
import { GlyphIcon, type GlyphName } from "@/components/goworth/icons";
import type { Palette } from "@/constants/design";
import type { Venue, VenueFilter } from "@/data/nearby-places";
import { usePalette } from "@/state/theme-context";

export const venueFilterLabels: Record<VenueFilter, string> = {
  restaurant: "Restaurants", bar: "Bars & Pubs", cafe: "Cafés", nightclub: "Clubs", terrace: "Terraces",
};
export const venueFilterIcons: Record<VenueFilter, GlyphName> = {
  restaurant: "food", bar: "cocktail", cafe: "coffee", nightclub: "music", terrace: "terrace",
};

function venueColors(venue: Venue, p: Palette): [string, string] {
  if (venue.kind === "restaurant") return [p.orange, p.pink];
  if (venue.kind === "bar") return [p.purple, p.blue];
  if (venue.kind === "cafe") return [p.teal, p.green];
  return ["#1B1F4B", p.purple];
}

/**
 * The picture for a venue card. Venues rarely have a free photo, so each kind gets its own gradient with its glyph
 * drawn large, plus a few faint copies for texture.
 */
export function VenueArt({ venue, compact = false }: { venue: Venue; compact?: boolean }) {
  const p = usePalette();
  const icon = venueFilterIcons[venue.kind];
  return <View style={StyleSheet.absoluteFill}>
    <LinearGradient colors={venueColors(venue, p)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
    {[[8, 14, 46, -14], [72, 6, 34, 12], [14, 46, 28, 8], [78, 40, 52, -8]].map(([left, top, size, rotate]) =>
      <View key={`${left}-${top}`} style={{ position: "absolute", left: `${left}%`, top: `${top}%`, opacity: 0.14, transform: [{ rotate: `${rotate}deg` }] }}>
        <GlyphIcon name={icon} size={size} color={p.onColor} knockColor="transparent" />
      </View>)}
    <View style={[styles.badge, compact && styles.badgeCompact]}>
      <GlyphIcon name={icon} size={compact ? 46 : 64} color={p.onColor} knockColor="transparent" />
    </View>
    {venue.terrace && <View style={[styles.terrace, compact && styles.terraceCompact, { backgroundColor: "rgba(255,255,255,0.2)" }]}>
      <GlyphIcon name="terrace" size={compact ? 20 : 26} color={p.onColor} knockColor="transparent" />
    </View>}
  </View>;
}

/**
 * Venue art for thumbnails: the gradient with its glyph. Small squares centre it; large cards lift it into the upper
 * part, clear of the text laid over their lower half.
 */
export function VenueTile({ venue, large = false }: { venue: Venue; large?: boolean }) {
  const p = usePalette();
  return <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }, large && { paddingBottom: "38%" }]}>
    <LinearGradient colors={venueColors(venue, p)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
    <View style={large ? styles.tileBadge : undefined}>
      <GlyphIcon name={venueFilterIcons[venue.kind]} size={large ? 40 : 28} color={p.onColor} knockColor="transparent" />
    </View>
  </View>;
}

const styles = StyleSheet.create({
  badge: {
    position: "absolute", alignSelf: "center", top: "22%", width: 124, height: 124, borderRadius: 62,
    alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.16)",
  },
  tileBadge: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.16)" },
  badgeCompact: { top: "50%", width: 88, height: 88, borderRadius: 44, marginTop: -44 },
  terrace: { position: "absolute", alignSelf: "center", top: "22%", marginTop: 96, marginLeft: 92, width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  terraceCompact: { top: "50%", marginTop: 18, marginLeft: 70, width: 34, height: 34, borderRadius: 17 },
});
