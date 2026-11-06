import { useCallback, useRef, useState } from "react";
import { router, type Href } from "expo-router";
import { Pressable, StyleSheet, Switch, Text, View, type ViewInstance } from "react-native";
import { Button, Copy, Icon, Row, Sheet } from "@/components/goworth/ui";
import { usePalette } from "@/state/theme-context";
import type { Activity, Trip } from "@/data/travel";
import { translate } from "@/data/i18n";
import { useAppLanguage } from "@/data/formatting";
import { useTravel } from "@/state/travel-context";
import { useTimedMessage } from "@/hooks/use-timed-message";
import { canShareImages, shareViewAsImage } from "@/lib/share-image";
import { premiumThemes, STORY_SIZE, TripStoryCard, type StoryTheme } from "@/components/goworth/trip-story-card";
import { wheelColors } from "@/components/goworth/premium-wheel";

const PREVIEW = 0.62;
const themes: { id: StoryTheme; label: string }[] = [{ id: "postcard", label: "Postcard" }, { id: "route", label: "Route" }, { id: "passport", label: "Passport" }];

/**
 * Shares a trip as a story card: a live preview, a choice of style, and spending hidden unless the traveller shows it.
 */
export function TripStorySheet({ visible, onClose, trip, activities, spent }: {
  visible: boolean; onClose: () => void; trip: Trip; activities: Activity[]; spent: string;
}) {
  const p = usePalette();
  const language = useAppLanguage();
  const { profile, plan } = useTravel();
  const card = useRef<ViewInstance>(null);
  const [theme, setTheme] = useState<StoryTheme>("postcard");
  const [showSpent, setShowSpent] = useState(false);
  const [ready, setReady] = useState<StoryTheme | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useTimedMessage();
  const markReady = useCallback(() => setReady(theme), [theme]);
  const locked = plan === "free" && premiumThemes.includes(theme);
  const unlock = () => { onClose(); router.push({ pathname: "/membership", params: { reason: "share" } } as Href); };

  const share = async () => {
    setBusy(true); setError("");
    try { await shareViewAsImage(card, `goworth-${trip.destinationId}-${trip.start}`); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not share the card."); }
    finally { setBusy(false); }
  };

  return <Sheet visible={visible} title={translate("Share your trip", language)} onClose={() => { if (!busy) onClose(); }}>
    {visible && <View style={[styles.frame, { width: STORY_SIZE.width * PREVIEW, height: STORY_SIZE.height * PREVIEW }]}>
      <View style={styles.scaled}>
        <TripStoryCard key={theme} ref={card} trip={trip} activities={activities} spent={spent} showSpent={showSpent}
          theme={theme} language={language} holder={profile.name} onReady={markReady} />
      </View>
    </View>}
    <Row style={{ gap: 8, justifyContent: "center" }}>
      {themes.map((item) => {
        const selected = item.id === theme;
        const premium = plan === "free" && premiumThemes.includes(item.id);
        return <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setTheme(item.id)}
          style={[styles.choice, { borderColor: selected ? p.ink : p.line, backgroundColor: selected ? p.ink : p.white }]}>
          {premium && <Icon name="crown" size={13} color={selected ? wheelColors.gold : p.orange} />}
          <Text style={{ color: selected ? p.canvas : p.ink, fontSize: 13, fontWeight: "800" }}>{translate(item.label, language)}</Text>
        </Pressable>;
      })}
    </Row>
    <Row style={{ justifyContent: "space-between" }}>
      <Copy style={{ fontWeight: "600" }}>Show spending</Copy>
      <Switch value={showSpent} onValueChange={setShowSpent} />
    </Row>
    {!!error && <Copy style={{ color: p.danger, fontSize: 13 }}>{error}</Copy>}
    {locked ? <Pressable accessibilityRole="button" onPress={unlock} style={({ pressed }) => [styles.unlock, pressed && { opacity: 0.85 }]}>
      <Icon name="crown" size={16} color={wheelColors.goldInk} />
      <Text style={{ color: wheelColors.goldInk, fontSize: 15, fontWeight: "800" }}>{translate("Unlock with Premium", language)}</Text>
    </Pressable>
      : canShareImages ? <Button icon="share" busy={busy || ready !== theme} onPress={() => void share()}>Share</Button>
      : <Copy muted style={{ fontSize: 13, textAlign: "center" }}>Take a screenshot of the card to post it.</Copy>}
  </Sheet>;
}

const styles = StyleSheet.create({
  frame: { alignSelf: "center", borderRadius: 18, overflow: "hidden" },
  scaled: { width: STORY_SIZE.width, height: STORY_SIZE.height, transform: [{ scale: PREVIEW }], transformOrigin: "top left" },
  choice: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  unlock: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 52, borderRadius: 16, backgroundColor: wheelColors.gold },
});
