import { Platform, StyleSheet, Text, View } from "react-native";
import { GlyphIcon, type GlyphName } from "@/components/goworth/icons";
import type { Venue, VenueFilter, VenueKind } from "@/data/nearby-places";

export const venueFilterLabels: Record<VenueFilter, string> = {
  restaurant: "Restaurants", bar: "Bars & Pubs", cafe: "Cafés", nightclub: "Clubs", terrace: "Terraces",
};
export const venueFilterIcons: Record<VenueFilter, GlyphName> = {
  restaurant: "food", bar: "cocktail", cafe: "coffee", nightclub: "music", terrace: "terrace",
};

/**
 * Each kind of venue as a neon sign: a dark wall, the glow's colour and the lit tube's colour, and the word on the
 * sign. The words read the same in English and Romanian, so they are not translated.
 */
const neon: Record<VenueKind, { wall: string; glow: string; tube: string; word: string }> = {
  restaurant: { wall: "#1E1610", glow: "#F5B83D", tube: "#FFD98A", word: "BISTRO" },
  bar: { wall: "#1A1220", glow: "#E85D75", tube: "#FFB3C1", word: "BAR" },
  cafe: { wall: "#10201E", glow: "#2DBDB5", tube: "#9FF0E8", word: "CAFÉ" },
  nightclub: { wall: "#140F2A", glow: "#8B7CFF", tube: "#C9C2FF", word: "CLUB" },
};
const signFont = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

/** Soft rings of the glow's colour behind the tube; flat fills, so swiping the card costs nothing extra to draw. */
function Halo({ size, color }: { size: number; color: string }) {
  return <>
    {[1, 0.72, 0.46].map((scale, index) => <View key={scale} pointerEvents="none" style={{
      position: "absolute", width: size * scale, height: size * scale, borderRadius: size * scale / 2,
      backgroundColor: color, opacity: [0.08, 0.12, 0.18][index],
    }} />)}
  </>;
}

/** A string of warm bulbs sagging across the top: the sign of a venue with outdoor seating. */
function StringLights({ count }: { count: number }) {
  return <View pointerEvents="none" style={styles.lights}>
    {Array.from({ length: count }, (_, index) => {
      const t = index / (count - 1);
      return <View key={index} style={[styles.bulb, { top: 4 + Math.sin(t * Math.PI) * 16 }]}>
        <View style={styles.bulbGlow} />
        <View style={styles.bulbCore} />
      </View>;
    })}
  </View>;
}

/**
 * The picture for a venue card. Venues rarely have a free photo, so each kind is drawn as its own neon sign: the
 * glyph lit in a halo with the word under it, and string lights for terraces.
 */
export function VenueArt({ venue, compact = false }: { venue: Venue; compact?: boolean }) {
  const sign = neon[venue.kind];
  const size = compact ? 150 : 210;
  return <View style={[StyleSheet.absoluteFill, { backgroundColor: sign.wall }]}>
    {venue.terrace && <StringLights count={compact ? 9 : 11} />}
    <View style={[styles.sign, compact ? styles.signCompact : styles.signLarge]}>
      <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
        <Halo size={size} color={sign.glow} />
        <GlyphIcon name={venueFilterIcons[venue.kind]} size={compact ? 52 : 72} color={sign.tube} knockColor="transparent" />
      </View>
      <Text style={[styles.word, compact && styles.wordCompact, { color: sign.tube, textShadowColor: sign.glow }]}>{sign.word}</Text>
    </View>
  </View>;
}

/** Venue art for thumbnails: the same sign, glyph only, sized for a small square or a wide preview. */
export function VenueTile({ venue, large = false }: { venue: Venue; large?: boolean }) {
  const sign = neon[venue.kind];
  const size = large ? 120 : 52;
  return <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", backgroundColor: sign.wall }, large && { paddingBottom: "38%" }]}>
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Halo size={size} color={sign.glow} />
      <GlyphIcon name={venueFilterIcons[venue.kind]} size={large ? 40 : 26} color={sign.tube} knockColor="transparent" />
    </View>
  </View>;
}

const styles = StyleSheet.create({
  sign: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  // The large card's text covers its lower half, so the sign hangs in the upper part.
  signLarge: { top: "10%" },
  signCompact: { top: "50%", marginTop: -95 },
  // The glow is clipped to the text's box, so the box is padded wider than the glow to let it fade out.
  word: { marginTop: -30, paddingHorizontal: 16, paddingVertical: 12, fontFamily: signFont, fontSize: 26, fontWeight: "700", letterSpacing: 8, textShadowRadius: 10, textShadowOffset: { width: 0, height: 0 } },
  wordCompact: { marginTop: -26, fontSize: 20, letterSpacing: 6 },
  lights: { position: "absolute", top: 0, left: 14, right: 14, height: 34, flexDirection: "row", justifyContent: "space-between" },
  bulb: { width: 12, height: 12, alignItems: "center", justifyContent: "center" },
  bulbGlow: { position: "absolute", width: 16, height: 16, borderRadius: 8, backgroundColor: "#FFD98A", opacity: 0.25 },
  bulbCore: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#FFE7A8" },
});
