import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Copy, Icon, IconButton, Row, Sheet, s } from "@/components/goworth/ui";
import { palette as p } from "@/constants/design";
import { useAppLanguage } from "@/data/formatting";
import { translate } from "@/data/i18n";

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const isoDate = (date: Date) => date.toISOString().slice(0, 10);

export function CalendarPicker({ visible, title, value, minDate, maxDate, onSelect, onClose }: {
  visible: boolean;
  title: string;
  value: string;
  minDate?: string;
  maxDate?: string;
  onSelect: (value: string) => void;
  onClose: () => void;
}) {
  const language = useAppLanguage();
  const [month, setMonth] = useState(() => {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date();
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  });
  const firstDay = month.getUTCDay();
  const days = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
  const cells = Array.from({ length: Math.ceil((firstDay + days) / 7) * 7 }, (_, index) => {
    const day = index - firstDay + 1;
    return day > 0 && day <= days ? day : null;
  });
  return <Sheet visible={visible} title={title} onClose={onClose}>
    <Row style={{ justifyContent: "space-between" }}>
      <IconButton name="back" label="Previous month" onPress={() => setMonth(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 1, 1)))} />
      <Copy style={{ fontWeight: "700", fontSize: 16 }}>{month.toLocaleDateString(language === "ro" ? "ro-RO" : "en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</Copy>
      <IconButton name="right" label="Next month" onPress={() => setMonth(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1)))} />
    </Row>
    <View style={{ flexDirection: "row" }}>
      {weekdays.map((day) => <Copy key={day} muted style={{ width: "14.2857%", textAlign: "center", fontSize: 11 }}>{day}</Copy>)}
    </View>
    <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
      {cells.map((day, index) => {
        const date = day ? isoDate(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), day))) : "";
        const disabled = !!day && (!!minDate && date < minDate || !!maxDate && date > maxDate);
        return <View key={index} style={{ width: "14.2857%", height: 44, padding: 2 }}>
          {day && <Pressable accessibilityRole="button" accessibilityLabel={new Date(`${date}T12:00:00Z`).toLocaleDateString(language === "ro" ? "ro-RO" : "en-US", { dateStyle: "full", timeZone: "UTC" })}
            accessibilityState={{ selected: value === date, disabled }} disabled={disabled}
            onPress={() => { onSelect(date); onClose(); }}
            style={{ flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 6, backgroundColor: value === date ? p.blue : "transparent", opacity: disabled ? 0.35 : 1 }}>
            <Copy style={{ color: value === date ? p.white : p.ink, fontWeight: value === date ? "700" : "400" }}>{day}</Copy>
          </Pressable>}
        </View>;
      })}
    </View>
  </Sheet>;
}

export function TimeDropdown({ value, onChange }: { value: string; onChange: (time: string) => void }) {
  const language = useAppLanguage();
  const [open, setOpen] = useState<"hour" | "minute" | null>(null);
  const [hour, minute] = value.split(":");
  const options = open === "hour"
    ? Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"))
    : ["00", "15", "30", "45"];
  return <View style={{ gap: 7 }}>
    <Copy style={s.label}>Time</Copy>
    <Row style={{ gap: 8 }}>
      {(["hour", "minute"] as const).map((part) => <Pressable key={part} accessibilityRole="button"
        accessibilityLabel={translate(part === "hour" ? "Choose hour" : "Choose minute", language)} accessibilityState={{ expanded: open === part }}
        onPress={() => setOpen(open === part ? null : part)}
        style={[s.input, { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}>
        <Copy>{part === "hour" ? hour : minute}</Copy><Icon name="more" size={18} color={p.muted} />
      </Pressable>)}
    </Row>
    {open && <ScrollView nestedScrollEnabled style={{ maxHeight: 180, borderWidth: 1, borderColor: p.line, borderRadius: 6 }}>
      {options.map((option) => <Pressable key={option} accessibilityRole="button" accessibilityLabel={`${translate(open === "hour" ? "Hour" : "Minute", language)} ${option}`}
        onPress={() => { onChange(open === "hour" ? `${option}:${minute}` : `${hour}:${option}`); setOpen(null); }}
        style={{ paddingHorizontal: 14, paddingVertical: 11, backgroundColor: option === (open === "hour" ? hour : minute) ? p.blueSoft : p.white }}>
        <Copy>{option}</Copy>
      </Pressable>)}
    </ScrollView>}
  </View>;
}
