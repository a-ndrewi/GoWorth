import { HStack, Image, ProgressView, Rectangle, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import {
  containerBackground, font, foregroundStyle, frame, kerning, lineLimit, minimumScaleFactor, padding, strokeBorder, tint, widgetURL,
} from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

/** Everything is worked out in the app (labels already translated), since the widget runtime can only lay it out. */
export type TripWidgetProps = {
  active: boolean;
  /** The ticket's header, "DAY 2/5" or "DEPARTS IN 3 DAYS". */
  label: string;
  /** Three-letter code of the first city, like an airport's: "KYO". */
  code: string;
  /** "Kyoto + 2 stops · 27–31 Oct", or the empty-state hint. */
  route: string;
  /** The two fields on the stub: "Today / 09:00 Fushimi Inari" and "Left / 3 days". */
  firstLabel: string;
  first: string;
  secondLabel: string;
  second: string;
  /** The medium ticket shows the day's plans beside it, so its first field names who is travelling instead. */
  passengerLabel: string;
  passenger: string;
  plansHeading: string;
  /** Up to three of the day's plans, "09:00 Fushimi Inari". */
  plans: string[];
  /** 0–1 through the trip; negative when not under way. */
  progress: number;
  url: string;
};

/** A boarding pass: a big city code, a perforated tear line and a stub with the day's plan. */
const TripWidget = (props: TripWidgetProps, environment: WidgetEnvironment) => {
  "widget";
  const dark = environment.colorScheme === "dark";
  const paper = dark ? "#172033" : "#FFFBF0";
  const ink = dark ? "#EEF2F8" : "#132238";
  const muted = dark ? "#8FA0BC" : "#5B6B85";
  const accent = dark ? "#7FA2FF" : "#2457E6";
  const perforation = dark ? "#3A4A66" : "#C9D3E8";
  const dash = { lineWidth: 1.5, dash: [4, 4] };
  const tiny = [font({ size: 9, weight: "bold" }), kerning(1.2), foregroundStyle(muted), lineLimit(1)];

  const header = (
    <HStack spacing={5}>
      <Image systemName={props.active ? "airplane" : "ticket"} size={10} color={accent} />
      <Text modifiers={[font({ size: 10, weight: "heavy" }), kerning(1.2), foregroundStyle(accent), lineLimit(1), minimumScaleFactor(0.7)]}>{props.label}</Text>
    </HStack>
  );
  const code = (
    <Text modifiers={[font({ size: 38, weight: "black", design: "rounded" }), kerning(1.5), foregroundStyle(ink), lineLimit(1), minimumScaleFactor(0.6)]}>{props.code}</Text>
  );
  const route = <Text modifiers={[font({ size: 11, weight: "medium" }), foregroundStyle(muted), lineLimit(1), minimumScaleFactor(0.8)]}>{props.route}</Text>;
  const field = (label: string, value: string, alignment: "leading" | "trailing") => (
    <VStack alignment={alignment} spacing={1}>
      <Text modifiers={tiny}>{label}</Text>
      <Text modifiers={[font({ size: 12, weight: "semibold" }), foregroundStyle(ink), lineLimit(1), minimumScaleFactor(0.75)]}>{value}</Text>
    </VStack>
  );
  // A 1.5 pt high outline with a dash pattern reads as the ticket's tear line.
  const tearLine = (vertical: boolean) => (
    <Rectangle modifiers={[vertical ? frame({ width: 1.5 }) : frame({ height: 1.5 }), strokeBorder({ color: perforation, style: dash })]} />
  );
  // Bar widths of a made-up barcode: decoration only, so the same pattern on every ticket.
  const bars = [2, 1, 1, 3, 1, 2, 1, 1, 2, 3, 1, 1, 2, 1, 3, 1, 2, 1, 1, 2, 1, 3, 1, 1];
  const barcode = (
    <HStack spacing={1.5}>
      {bars.map((width, index) => <Rectangle key={index} modifiers={[frame({ width, height: 18 }), foregroundStyle(ink)]} />)}
    </HStack>
  );
  const shell = [containerBackground(paper, "widget"), widgetURL(props.url)];

  if (environment.widgetFamily !== "systemMedium") {
    return (
      <VStack alignment="leading" spacing={0} modifiers={shell}>
        {header}
        {code}
        {route}
        <Spacer />
        {tearLine(false)}
        <HStack modifiers={[padding({ top: 8 })]}>
          {field(props.firstLabel, props.first, "leading")}
          <Spacer />
          {field(props.secondLabel, props.second, "trailing")}
        </HStack>
      </VStack>
    );
  }
  return (
    <HStack spacing={12} modifiers={shell}>
      <VStack alignment="leading" spacing={0} modifiers={[frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: "topLeading" })]}>
        {header}
        {code}
        {route}
        <Spacer />
        {props.progress >= 0 && <ProgressView value={props.progress} modifiers={[tint(accent), padding({ bottom: 6 })]} />}
        <HStack>
          {field(props.passengerLabel, props.passenger, "leading")}
          <Spacer />
          {field(props.secondLabel, props.second, "trailing")}
        </HStack>
      </VStack>
      {tearLine(true)}
      <VStack alignment="leading" spacing={4} modifiers={[frame({ width: 118 }), frame({ maxHeight: Infinity, alignment: "topLeading" })]}>
        <Text modifiers={tiny}>{props.plansHeading}</Text>
        {props.plans.map((plan, index) => (
          <Text key={index} modifiers={[font({ size: 11, weight: "semibold" }), foregroundStyle(ink), lineLimit(1)]}>{plan}</Text>
        ))}
        <Spacer />
        {barcode}
      </VStack>
    </HStack>
  );
};

export default createWidget<TripWidgetProps>("TripWidget", TripWidget, {
  active: false, label: "GOWORTH", code: "GO", route: "Plan your next trip", firstLabel: "NEXT", first: "Pick a city",
  secondLabel: "CLASS", second: "Explorer", passengerLabel: "NEXT", passenger: "Pick a city", plansHeading: "", plans: [], progress: -1, url: "goworth://planner",
});
