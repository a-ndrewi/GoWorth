import { Pressable, Text } from "react-native";
import { Icon } from "@/components/goworth/ui";
import { themedStyles } from "@/constants/design";
import { formatMessage, translate } from "@/data/i18n";
import { useAppLanguage } from "@/data/formatting";
import { usePalette, useStyles } from "@/state/theme-context";

/** Shown while the account runs from its offline copy; tapping it tries the connection again. */
export function OfflineBanner({ since, onRetry }: { since: string; onRetry: () => void }) {
  const styles = useStyles(stylesSheet);
  const p = usePalette();
  const language = useAppLanguage();
  const when = new Date(since).toLocaleString(language === "ro" ? "ro-RO" : "en-US", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return <Pressable accessibilityRole="button" accessibilityHint={translate("Tries to connect again", language)} onPress={onRetry}
    style={({ pressed }) => [styles.banner, pressed && { opacity: 0.85 }]}>
    <Icon name="plane" size={15} color={p.onColor} />
    <Text numberOfLines={2} style={styles.text}>{formatMessage("Offline · your trips as of {time}. Changes need a connection.", { time: when }, language)}</Text>
    <Icon name="refresh" size={15} color={p.onColor} />
  </Pressable>;
}

const stylesSheet = themedStyles((p) => ({
  banner: { flexDirection: "row", alignItems: "center", gap: 9, marginHorizontal: 12, marginBottom: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, backgroundColor: p.night },
  text: { flex: 1, color: p.onColor, fontSize: 12.5, fontWeight: "600" },
}));
