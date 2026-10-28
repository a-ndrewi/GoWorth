import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Button, Copy, Icon, IconButton, Row, Sheet, sharedSheet } from "@/components/goworth/ui";
import { usePalette, useStyles } from "@/state/theme-context";
import { useAppLanguage } from "@/data/formatting";
import { formatMessage, translate } from "@/data/i18n";

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
  const p = usePalette();
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
            <Copy style={{ color: value === date ? p.onColor : p.ink, fontWeight: value === date ? "700" : "400" }}>{day}</Copy>
          </Pressable>}
        </View>;
      })}
    </View>
  </Sheet>;
}

export function TimeDropdown({ value, onChange }: { value: string; onChange: (time: string) => void }) {
  const s = useStyles(sharedSheet);
  const p = usePalette();
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

const addDays = (date: string, days: number) => isoDate(new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000));

/** One calendar for a whole trip: the first tap sets departure, the second sets return. */
export function DateRangePicker({ visible, start, end, minDate, maxDays, onDone, onClose }: {
  visible: boolean;
  start: string;
  end: string;
  minDate: string;
  maxDays: number;
  onDone: (start: string, end: string) => void;
  onClose: () => void;
}) {
  const p = usePalette();
  const language = useAppLanguage();
  const locale = language === "ro" ? "ro-RO" : "en-US";
  const [range, setRange] = useState({ start, end });
  const [month, setMonth] = useState(() => {
    const date = new Date(`${start || minDate}T12:00:00Z`);
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  });
  const firstDay = month.getUTCDay();
  const days = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
  const cells = Array.from({ length: Math.ceil((firstDay + days) / 7) * 7 }, (_, index) => {
    const day = index - firstDay + 1;
    return day > 0 && day <= days ? day : null;
  });
  const choosingEnd = !!range.start && !range.end;
  const lastEnd = range.start ? addDays(range.start, maxDays - 1) : "";
  const canGoBack = isoDate(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 0))) >= minDate;
  const pick = (date: string) => setRange((current) => current.start && !current.end && date >= current.start && date <= addDays(current.start, maxDays - 1)
    ? { start: current.start, end: date }
    : { start: date, end: "" });
  const short = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  return <Sheet visible={visible} title={translate("Travel dates", language)} onClose={onClose}>
    <Row style={{ gap: 8 }}>
      {(["start", "end"] as const).map((field) => <View key={field} style={{ flex: 1, padding: 12, borderRadius: 16, borderWidth: 1.5,
        borderColor: (field === "start" ? !choosingEnd && !range.end : choosingEnd) ? p.blue : p.line, backgroundColor: p.white, gap: 2 }}>
        <Copy muted style={{ fontSize: 11, fontWeight: "700" }}>{field === "start" ? "DEPARTURE" : "RETURN"}</Copy>
        <Copy style={{ fontWeight: "700" }}>{range[field] ? short(range[field]) : "—"}</Copy>
      </View>)}
    </Row>
    <Copy muted style={{ fontSize: 12, textAlign: "center" }}>{choosingEnd
      ? formatMessage("Now pick your return date (up to {days} days).", { days: maxDays }, language)
      : range.end ? formatMessage("{days} days selected", { days: Math.round((Date.parse(range.end) - Date.parse(range.start)) / 86_400_000) + 1 }, language)
        : translate("Pick your departure date.", language)}</Copy>
    <Row style={{ justifyContent: "space-between" }}>
      <View style={{ opacity: canGoBack ? 1 : 0.3 }} pointerEvents={canGoBack ? "auto" : "none"}>
        <IconButton name="back" label="Previous month" onPress={() => setMonth(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 1, 1)))} />
      </View>
      <Copy style={{ fontWeight: "700", fontSize: 16 }}>{month.toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" })}</Copy>
      <IconButton name="right" label="Next month" onPress={() => setMonth(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1)))} />
    </Row>
    <View style={{ flexDirection: "row" }}>
      {weekdays.map((day) => <Copy key={day} muted style={{ width: "14.2857%", textAlign: "center", fontSize: 11 }}>{day}</Copy>)}
    </View>
    <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
      {cells.map((day, index) => {
        const date = day ? isoDate(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), day))) : "";
        const disabled = !!day && date < minDate;
        const edge = !!date && (date === range.start || date === range.end);
        const inside = !!date && !!range.start && !!range.end && date > range.start && date < range.end;
        const reachable = choosingEnd && !!date && date > range.start && date <= lastEnd;
        return <View key={index} style={{ width: "14.2857%", height: 44, paddingVertical: 2 }}>
          {day && <View style={{ flex: 1, backgroundColor: inside ? p.blueSoft : "transparent",
            borderTopLeftRadius: date === range.start ? 10 : 0, borderBottomLeftRadius: date === range.start ? 10 : 0,
            borderTopRightRadius: date === range.end ? 10 : 0, borderBottomRightRadius: date === range.end ? 10 : 0 }}>
            <Pressable accessibilityRole="button"
              accessibilityLabel={new Date(`${date}T12:00:00Z`).toLocaleDateString(locale, { dateStyle: "full", timeZone: "UTC" })}
              accessibilityState={{ selected: edge, disabled }} disabled={disabled}
              onPress={() => pick(date)}
              style={({ pressed }) => ({ flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 10,
                backgroundColor: edge ? p.blue : reachable ? p.blueTint : "transparent", opacity: disabled ? 0.3 : pressed ? 0.7 : 1 })}>
              <Copy style={{ color: edge ? p.onColor : p.ink, fontWeight: edge ? "700" : "400" }}>{day}</Copy>
            </Pressable>
          </View>}
        </View>;
      })}
    </View>
    <Button disabled={!range.start || !range.end} onPress={() => { onDone(range.start, range.end); onClose(); }}>Confirm dates</Button>
  </Sheet>;
}
