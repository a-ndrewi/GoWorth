import { Image } from "expo-image";
import { router, type Href } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ImageStyle,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { palette as p, photos } from "@/constants/design";
import { placesForDestination, type Destination } from "@/data/travel";
import { useTravel } from "@/state/travel-context";

const symbols = {
  back: ["chevron.left", "chevron_left"],
  right: ["chevron.right", "chevron_right"],
  home: ["house", "home"],
  search: ["magnifyingglass", "search"],
  heart: ["heart", "favorite"],
  heartFill: ["heart.fill", "favorite"],
  pin: ["mappin.and.ellipse", "location_on"],
  calendar: ["calendar", "calendar_today"],
  person: ["person", "person"],
  people: ["person.2", "group"],
  settings: ["gearshape", "settings"],
  plus: ["plus", "add"],
  close: ["xmark", "close"],
  check: ["checkmark", "check"],
  star: ["star.fill", "star"],
  sparkle: ["sparkles", "auto_awesome"],
  compass: ["safari", "explore"],
  bag: ["suitcase.rolling", "luggage"],
  bell: ["bell", "notifications"],
  camera: ["camera", "photo_camera"],
  share: ["square.and.arrow.up", "ios_share"],
  sun: ["sun.max.fill", "sunny"],
  wallet: ["creditcard", "account_balance_wallet"],
  food: ["fork.knife", "restaurant"],
  bed: ["bed.double", "bed"],
  bus: ["bus", "directions_bus"],
  shopping: ["bag", "shopping_bag"],
  beach: ["beach.umbrella", "beach_access"],
  mountain: ["mountain.2", "landscape"],
  city: ["building.2", "location_city"],
  road: ["car", "directions_car"],
  crown: ["crown", "diamond"],
  chat: ["bubble.left", "chat_bubble"],
  map: ["map", "map"],
  leaf: ["leaf", "eco"],
  book: ["book", "menu_book"],
  eye: ["eye", "visibility"],
  eyeOff: ["eye.slash", "visibility_off"],
  mail: ["envelope", "mail"],
  lock: ["lock", "lock"],
  help: ["questionmark.circle", "help"],
  logout: ["rectangle.portrait.and.arrow.right", "logout"],
  edit: ["pencil", "edit"],
  more: ["ellipsis", "more_horiz"],
  refresh: ["arrow.clockwise", "refresh"],
  apple: ["apple.logo", "phone_iphone"],
  google: ["globe", "public"],
  globe: ["globe", "public"],
} as const;
export type IconName = keyof typeof symbols;
export function Icon({
  name,
  size = 22,
  color = p.ink,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  if (name === "google")
    return (
      <Image
        source={require("@/assets/images/goworth/google.png")}
        contentFit="contain"
        style={{ width: size, height: size }}
      />
    );
  if (name === "apple")
    return (
      <Image
        source={require("@/assets/images/goworth/apple.svg")}
        tintColor={color}
        contentFit="contain"
        style={{ width: size, height: size }}
      />
    );
  const [ios, web] = symbols[name];
  return (
    <SymbolView
      name={{ ios, web, android: web }}
      size={size}
      tintColor={color}
      style={{ width: size, height: size }}
    />
  );
}
export function Copy({
  children,
  style,
  muted = false,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
  muted?: boolean;
}) {
  return <Text style={[s.text, muted && s.muted, style]}>{children}</Text>;
}
export function Heading({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text accessibilityRole="header" style={[s.heading, style]}>
      {children}
    </Text>
  );
}
export function Row({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[s.row, style]}>{children}</View>;
}
export function Brand({ large = false }: { large?: boolean }) {
  return (
    <Row style={{ gap: large ? 10 : 6 }}>
      <Image
        source={photos.brandMark}
        contentFit="contain"
        style={{ width: large ? 76 : 38, height: large ? 58 : 30 }}
      />
      <Image
        source={photos.brandName}
        contentFit="contain"
        style={{ width: large ? 178 : 123, height: large ? 39 : 27 }}
        accessibilityLabel="GoWorth"
      >
      </Image>
    </Row>
  );
}
export function Button({
  children,
  onPress,
  secondary,
  dark,
  busy,
  disabled,
  icon,
  style,
}: {
  children: ReactNode;
  onPress: () => void;
  secondary?: boolean;
  dark?: boolean;
  busy?: boolean;
  disabled?: boolean;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  const color = secondary ? p.ink : p.white;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled || !!busy, busy: !!busy }}
      style={({ pressed }) => [
        s.button,
        secondary && s.secondaryButton,
        dark && { backgroundColor: p.ink },
        (pressed || disabled) && { opacity: 0.65 },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={color} />
      ) : icon ? (
        <Icon name={icon} color={color} size={19} />
      ) : null}
      <Text style={[s.buttonLabel, { color }]}>{children}</Text>
    </Pressable>
  );
}
export function IconButton({
  name,
  label,
  onPress,
  color = p.ink,
  filled = false,
  style,
}: {
  name: IconName;
  label: string;
  onPress: () => void;
  color?: string;
  filled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        s.iconButton,
        filled && { backgroundColor: p.white },
        pressed && { opacity: 0.55 },
        style,
      ]}
    >
      <Icon name={name} color={color} />
    </Pressable>
  );
}
export function Chip({
  children,
  selected,
  onPress,
  tint,
  style,
}: {
  children: ReactNode;
  selected?: boolean;
  onPress: () => void;
  tint?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ pressed }) => [
        s.chip,
        tint && { backgroundColor: tint },
        selected && { backgroundColor: p.blue },
        pressed && { opacity: 0.7 },
        style,
      ]}
    >
      <Text style={[s.chipText, selected && { color: p.white }]}>
        {children}
      </Text>
    </Pressable>
  );
}
export function Field({
  label,
  style,
  ...props
}: TextInputProps & { label?: string }) {
  return (
    <View style={{ gap: 7, flex: 1 }}>
      {label && <Copy style={s.label}>{label}</Copy>}
      <TextInput
        accessibilityLabel={label || props.placeholder}
        placeholderTextColor={p.muted}
        style={[s.input, style]}
        {...props}
      />
    </View>
  );
}
export function Header({
  title,
  subtitle,
  back = true,
  right,
}: {
  title?: string;
  subtitle?: string;
  back?: boolean;
  right?: ReactNode;
}) {
  return (
    <Row style={{ justifyContent: "space-between", minHeight: 46, gap: 5 }}>
      {back && (
        <IconButton
          name="back"
          label="Go back"
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/home" as Href)
          }
        />
      )}
      <View style={{ flex: 1 }}>
        <Heading style={{ fontSize: 24, lineHeight: 30 }}>{title}</Heading>
        {subtitle && (
          <Copy muted style={{ fontSize: 13 }}>
            {subtitle}
          </Copy>
        )}
      </View>
      {right}
    </Row>
  );
}
export function BottomNav({ active }: { active: string }) {
  const items = [
    ["home", "Explore", "home", "/home"],
    ["map", "Map", "map", "/map"],
    ["planner", "Plan", "sparkle", "/planner"],
    ["saved", "Saved", "heart", "/saved"],
    ["profile", "Profile", "person", "/profile"],
  ] as const;
  return (
    <View style={s.nav}>
      {items.map(([id, label, icon, href]) => (
        <Pressable
          key={id}
          onPress={() => router.navigate(href as Href)}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ selected: active === id }}
          style={s.navItem}
        >
          <Icon
            name={icon}
            size={22}
            color={active === id ? p.blue : p.muted}
          />
          <Text
            style={[
              s.navLabel,
              active === id && { color: p.blue, fontWeight: "600" },
            ]}
          >
            {label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
export function Screen({
  children,
  active,
  footer,
  style,
  scroll = true,
}: {
  children: ReactNode;
  active?: string;
  footer?: ReactNode;
  style?: StyleProp<ViewStyle>;
  scroll?: boolean;
}) {
  const { syncError } = useTravel();
  return (
    <SafeAreaView style={s.screen} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        {scroll ? (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[s.content, style]}
          >
            {!!syncError && (
              <View style={{ backgroundColor: "#FFF1F2", borderRadius: 6, padding: 10 }}>
                <Copy style={{ color: p.danger, fontSize: 12 }}>{syncError}</Copy>
              </View>
            )}
            {children}
          </ScrollView>
        ) : (
          <View style={[s.content, { flex: 1 }, style]}>
            {!!syncError && <Copy style={{ color: p.danger }}>{syncError}</Copy>}
            {children}
          </View>
        )}
        {footer && <View style={s.footer}>{footer}</View>}
        {active && <BottomNav active={active} />}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
export function SectionTitle({
  title,
  action,
  onPress,
}: {
  title: string;
  action?: string;
  onPress?: () => void;
}) {
  return (
    <Row style={{ justifyContent: "space-between" }}>
      <Heading style={{ fontSize: 20, lineHeight: 26 }}>{title}</Heading>
      {action && (
        <Pressable
          accessibilityRole="button"
          onPress={onPress}
          style={{ paddingVertical: 10, paddingLeft: 12 }}
        >
          <Copy style={{ color: p.blue, fontSize: 13, fontWeight: "600" }}>
            {action}
          </Copy>
        </Pressable>
      )}
    </Row>
  );
}
export function DestinationPhoto({
  destination,
  style,
}: {
  destination: Destination;
  style?: StyleProp<ImageStyle>;
}) {
  const [failedId, setFailedId] = useState<string | null>(null);
  if (failedId === destination.id) {
    return (
      <View style={[style, { backgroundColor: p.blueSoft, alignItems: "center", justifyContent: "center", gap: 6 }]}>
        <Icon name="pin" color={p.blue} size={28} />
        <Copy style={{ color: p.blue, fontWeight: "600" }}>{destination.name}</Copy>
      </View>
    );
  }
  return (
    <Image
      source={destination.image}
      onError={() => setFailedId(destination.id)}
      accessibilityLabel={`${destination.name}, ${destination.country}`}
      style={style}
      contentFit="cover"
    />
  );
}

export function DestinationCard({ destination }: { destination: Destination }) {
  const { saved, toggleSaved } = useTravel();
  return (
    <View style={s.destinationCard}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Explore ${destination.name}`}
        onPress={() =>
          router.push({
            pathname: "/trip",
            params: { id: destination.id },
          } as Href)
        }
      >
        <DestinationPhoto destination={destination} style={{ width: "100%", height: 126 }} />
        <View style={{ padding: 11, gap: 3 }}>
          <Copy style={{ fontWeight: "700" }}>{destination.name}</Copy>
          <Copy muted style={{ fontSize: 12 }}>
            {destination.country}
          </Copy>
          <Row style={{ gap: 4, marginTop: 7 }}>
            <Copy style={{ fontSize: 11 }}>
              {placesForDestination(destination.id).length} places · {destination.tags.slice(0, 2).join(" & ")}
            </Copy>
          </Row>
        </View>
      </Pressable>
      <IconButton
        name={saved.includes(destination.id) ? "heartFill" : "heart"}
        label={`${saved.includes(destination.id) ? "Unsave" : "Save"} ${destination.name}`}
        onPress={() => toggleSaved(destination.id)}
        color={saved.includes(destination.id) ? p.pink : p.ink}
        filled
        style={{
          position: "absolute",
          right: 5,
          top: 5,
          width: 36,
          height: 36,
          minWidth: 36,
          minHeight: 36,
          opacity: 0.94,
        }}
      />
    </View>
  );
}
export function Sheet({
  visible,
  title,
  children,
  onClose,
}: {
  visible: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={s.scrim}
      >
        <Pressable
          accessibilityLabel="Dismiss dialog"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View accessibilityViewIsModal style={s.sheet}>
          <Row style={{ justifyContent: "space-between", marginBottom: 16 }}>
            <Heading style={{ fontSize: 22, lineHeight: 28, flex: 1 }}>
              {title}
            </Heading>
            <IconButton name="close" label="Close dialog" onPress={onClose} />
          </Row>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: 18 }}
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
export function EmptyState({
  title,
  detail,
  action,
  onPress,
}: {
  title: string;
  detail: string;
  action?: string;
  onPress?: () => void;
}) {
  return (
    <View style={{ alignItems: "center", paddingVertical: 40, gap: 12 }}>
      <Icon name="compass" size={44} color={p.blue} />
      <Heading style={{ fontSize: 23, textAlign: "center" }}>{title}</Heading>
      <Copy muted style={{ textAlign: "center", maxWidth: 260 }}>
        {detail}
      </Copy>
      {action && onPress && (
        <Button
          style={{ marginTop: 12, paddingHorizontal: 28 }}
          onPress={onPress}
        >
          {action}
        </Button>
      )}
    </View>
  );
}
export const s = StyleSheet.create({
  text: { fontSize: 15, lineHeight: 22, color: p.ink, letterSpacing: 0 },
  muted: { color: p.muted },
  heading: {
    fontSize: 28,
    lineHeight: 33,
    fontWeight: "700",
    color: p.ink,
    letterSpacing: 0,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  screen: { flex: 1, backgroundColor: p.white },
  content: { padding: 22, gap: 20, flexGrow: 1 },
  footer: {
    padding: 18,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: p.line,
    gap: 10,
    backgroundColor: p.white,
  },
  button: {
    minHeight: 50,
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: p.blue,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 9,
  },
  buttonLabel: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "600",
    letterSpacing: 0,
    textAlign: "center",
  },
  secondaryButton: {
    backgroundColor: p.white,
    borderWidth: 1,
    borderColor: p.line,
  },
  iconButton: {
    width: 44,
    height: 44,
    minWidth: 44,
    minHeight: 44,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  chip: {
    minHeight: 38,
    borderRadius: 24,
    paddingHorizontal: 17,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: p.soft,
  },
  chipText: {
    color: p.ink,
    fontSize: 12,
    lineHeight: 20,
    fontWeight: "500",
    letterSpacing: 0,
  },
  label: { fontSize: 13, lineHeight: 18, fontWeight: "600" },
  input: {
    minHeight: 49,
    borderWidth: 1,
    borderColor: p.line,
    borderRadius: 13,
    paddingHorizontal: 15,
    paddingVertical: 13,
    fontSize: 14,
    color: p.ink,
    backgroundColor: p.white,
    letterSpacing: 0,
  },
  nav: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: p.line,
    backgroundColor: p.white,
    paddingTop: 10,
    paddingBottom: Platform.OS === "web" ? 18 : 5,
  },
  navItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minHeight: 44,
  },
  navLabel: { fontSize: 10, lineHeight: 15, color: p.muted, letterSpacing: 0 },
  destinationCard: {
    width: "47.5%",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: p.line,
    backgroundColor: p.white,
  },
  scrim: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    backgroundColor: "rgba(16,28,42,.35)",
  },
  sheet: {
    width: "100%",
    maxWidth: 480,
    maxHeight: "90%",
    backgroundColor: p.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 38,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  error: { color: p.danger, fontSize: 13, lineHeight: 20 },
});
