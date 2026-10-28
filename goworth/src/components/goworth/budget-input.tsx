import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import Slider from "@react-native-community/slider";
import { Copy, Row } from "@/components/goworth/ui";
import { themedStyles } from "@/constants/design";
import { currencySymbol, money, useAppLanguage } from "@/data/formatting";
import { translate } from "@/data/i18n";
import { usePalette, useStyles } from "@/state/theme-context";

export const BUDGET_MIN = 500;
export const BUDGET_MAX = 10000;

export const clampBudget = (value: number) => Math.min(BUDGET_MAX, Math.max(BUDGET_MIN, Math.round(value)));

/** Budget picker: drag the slider or type an exact amount, both kept between BUDGET_MIN and BUDGET_MAX. */
export function BudgetInput({ value, onChange, label = "Trip budget" }: { value: number; onChange: (value: number) => void; label?: string }) {
  const styles = useStyles(stylesSheet);
  const p = usePalette();
  const language = useAppLanguage();
  // Holds the typed text while the field is focused; otherwise the field mirrors the value (e.g. while dragging).
  const [draft, setDraft] = useState<string | null>(null);

  const type = (text: string) => {
    const digits = text.replace(/\D/g, "").slice(0, 5);
    setDraft(digits);
    const next = Number(digits);
    if (digits && next >= BUDGET_MIN && next <= BUDGET_MAX) onChange(next);
  };
  const commit = () => {
    const next = clampBudget(Number(draft) || value);
    setDraft(null);
    if (next !== value) onChange(next);
  };

  return (
    <View style={{ gap: 8 }}>
      <View style={styles.field}>
        <Text style={styles.symbol}>{currencySymbol()}</Text>
        <TextInput accessibilityLabel={translate(label, language)} value={draft ?? String(value)} onChangeText={type} onFocus={() => setDraft(String(value))} onBlur={commit}
          onSubmitEditing={commit} keyboardType="number-pad" returnKeyType="done" maxLength={5} selectTextOnFocus style={styles.input} />
      </View>
      <Slider accessibilityLabel={translate(label, language)} minimumValue={BUDGET_MIN} maximumValue={BUDGET_MAX} step={100} value={clampBudget(value)}
        onValueChange={(next) => onChange(Math.round(next))} minimumTrackTintColor={p.blue} maximumTrackTintColor={p.line} thumbTintColor={p.blue} />
      <Row style={{ justifyContent: "space-between" }}><Copy muted style={{ fontSize: 12 }}>{money(BUDGET_MIN)}</Copy><Copy muted style={{ fontSize: 12 }}>{money(BUDGET_MAX)}</Copy></Row>
    </View>
  );
}

const stylesSheet = themedStyles((p) => ({
  field: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: p.line, backgroundColor: p.soft },
  symbol: { color: p.muted, fontSize: 24, fontWeight: "700" },
  input: { minWidth: 90, color: p.ink, fontSize: 30, fontWeight: "800", textAlign: "center", paddingVertical: 4, outlineWidth: 0 },
}));
