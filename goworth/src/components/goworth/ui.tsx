import { Image } from "expo-image";
import { router, usePathname, type Href } from "expo-router";
import Animated, {
  FadeIn, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming,
} from "react-native-reanimated";
import { Children, useEffect, useRef, useState, type ReactNode } from "react";
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
  useWindowDimensions,
  type StyleProp,
  type ImageStyle,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { photos, themedStyles } from "@/constants/design";
import { usePalette, useStyles, useThemePreference } from "@/state/theme-context";
import { GlyphIcon, type GlyphName } from "@/components/goworth/icons";
import { placesForDestination, type Destination } from "@/data/travel";
import { useTravel } from "@/state/travel-context";
import { formatMessage, translate, translateAccessibility } from "@/data/i18n";
import { useAppLanguage } from "@/data/formatting";

function translateText(children: ReactNode, language: ReturnType<typeof useAppLanguage>) {
  return Children.map(children, (child) => typeof child === "string" ? translate(child, language) : child);
}

export type IconName = GlyphName | "apple" | "google";
export function Icon({
  name,
  size = 22,
  color: tint,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  const p = usePalette();
  const color = tint ?? p.ink;
  // Icons are plain views: they appear on every screen and in long lists, so they carry no animation of their own.
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
  return <GlyphIcon name={name} size={size} color={color} />;
}
/** Springy press feedback shared by icon buttons and the tab bar. */
function usePressSpring(pressedScale = 0.86) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return {
    style,
    onPressIn: () => { scale.set(withSpring(pressedScale, { damping: 14, stiffness: 420 })); },
    onPressOut: () => { scale.set(withSpring(1, { damping: 7, stiffness: 260 })); },
  };
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
  const s = useStyles(sharedSheet);
  const language = useAppLanguage();
  return <Text style={[s.text, muted && s.muted, style]}>{translateText(children, language)}</Text>;
}
export function Heading({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  const s = useStyles(sharedSheet);
  const language = useAppLanguage();
  return (
    <Text accessibilityRole="header" style={[s.heading, style]}>
      {translateText(children, language)}
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
  const s = useStyles(sharedSheet);
  return <View style={[s.row, style]}>{children}</View>;
}
export function Brand({ large = false }: { large?: boolean }) {
  const p = usePalette();
  const { scheme } = useThemePreference();
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
        tintColor={scheme === "dark" ? p.ink : undefined}
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
  const s = useStyles(sharedSheet);
  const p = usePalette();
  const language = useAppLanguage();
  const color = secondary ? p.ink : p.onColor;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled || !!busy, busy: !!busy }}
      style={({ pressed }) => [
        s.button,
        secondary && s.secondaryButton,
        dark && { backgroundColor: p.night },
        pressed && { opacity: 0.78, transform: [{ scale: 0.985 }] },
        disabled && { opacity: 0.52 },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={color} />
      ) : icon ? (
        <Icon name={icon} color={color} size={19} />
      ) : null}
      <Text style={[s.buttonLabel, { color }]}>{translateText(children, language)}</Text>
    </Pressable>
  );
}
export function IconButton({
  name,
  label,
  onPress,
  color: tint,
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
  const s = useStyles(sharedSheet);
  const p = usePalette();
  const color = tint ?? p.ink;
  const language = useAppLanguage();
  const spring = usePressSpring();
  // A short pop when the icon changes (for example the heart after saving).
  const pop = useSharedValue(1);
  const previous = useRef(name);
  useEffect(() => {
    if (previous.current === name) return;
    previous.current = name;
    pop.set(withSequence(withTiming(0.62, { duration: 90 }), withSpring(1, { damping: 8, stiffness: 280 })));
  }, [name, pop]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  return (
    <Pressable
      onPress={onPress}
      onPressIn={spring.onPressIn}
      onPressOut={spring.onPressOut}
      accessibilityRole="button"
      accessibilityLabel={translateAccessibility(label, language)}
      style={({ pressed }) => [
        s.iconButton,
        filled && { backgroundColor: p.white },
        pressed && { backgroundColor: p.soft },
        style,
      ]}
    >
      <Animated.View style={[spring.style, popStyle]}>
        <Icon name={name} color={color} />
      </Animated.View>
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
  const s = useStyles(sharedSheet);
  const p = usePalette();
  const language = useAppLanguage();
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
      <Text style={[s.chipText, selected && { color: p.onColor }]}>
        {translateText(children, language)}
      </Text>
    </Pressable>
  );
}
export function Field({
  label,
  style,
  ...props
}: TextInputProps & { label?: string }) {
  const s = useStyles(sharedSheet);
  const p = usePalette();
  const language = useAppLanguage();
  return (
    <View style={{ gap: 7, flex: 1 }}>
      {label && <Copy style={s.label}>{label}</Copy>}
      <TextInput
        {...props}
        accessibilityLabel={label ? translate(label, language) : props.placeholder ? translate(props.placeholder, language) : undefined}
        placeholderTextColor={p.muted}
        placeholder={props.placeholder ? translate(props.placeholder, language) : undefined}
        style={[s.input, style]}
      />
    </View>
  );
}
export function Header({
  title,
  subtitle,
  back = true,
  onBack,
  right,
  centered = false,
}: {
  title?: string;
  subtitle?: string;
  back?: boolean;
  onBack?: () => void;
  right?: ReactNode;
  centered?: boolean;
}) {
  return (
    <Row style={{ justifyContent: "space-between", minHeight: 46, gap: 5 }}>
      {back && (
        <IconButton
          name="back"
          label="Go back"
          onPress={onBack ?? (() =>
            router.canGoBack() ? router.back() : router.replace("/home" as Href)
          )}
        />
      )}
      <View style={{ flex: 1, alignItems: centered ? "center" : "flex-start" }}>
        <Heading style={{ fontSize: 24, lineHeight: 30, textAlign: centered ? "center" : "left" }}>{title}</Heading>
        {subtitle && (
          <Copy muted style={{ fontSize: 13, textAlign: centered ? "center" : "left" }}>
            {subtitle}
          </Copy>
        )}
      </View>
      {right}
    </Row>
  );
}
const mainTabRoutes = new Set(["/home", "/map", "/saved", "/profile"]);
function NavItem({ id, label, icon, href, active }: {
  id: string; label: string; icon: GlyphName; href: string; active: boolean;
}) {
  const s = useStyles(sharedSheet);
  const p = usePalette();
  const language = useAppLanguage();
  const { avatarUrl } = useTravel();
  const pathname = usePathname();
  const create = id === "planner";
  const activeIcon: GlyphName = id === "saved" ? "heartFill" : id === "home" ? "compassFill" : id === "map" ? "mapFill" : icon;
  // Plain views and the raw glyph: the tab bar is on every screen, so it stays free of animations.
  return (
    <Pressable
      onPress={() => {
        if (create) router.push(href as Href);
        // Inside the tab navigator, switch tabs; from a screen stacked above it, go back down to the tabs.
        else if (mainTabRoutes.has(pathname)) router.navigate(href as Href);
        else router.dismissTo(href as Href);
      }}
      accessibilityRole="button"
      accessibilityLabel={translate(label, language)}
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [s.navItem, pressed && { opacity: 0.6 }]}
    >
      <View style={[s.navIcon, create && s.navCreate, active && !create && s.navIconActive]}>
        {id === "profile" ? (
          <Image source={avatarUrl ? { uri: avatarUrl } : photos.avatar} contentFit="cover" style={[s.navAvatar, active && s.navAvatarActive]} />
        ) : (
          <GlyphIcon name={active ? activeIcon : icon} size={create ? 22 : 23} color={create ? p.onColor : active && id === "saved" ? p.danger : active ? p.blue : p.muted} />
        )}
      </View>
      <Text style={[s.navLabel, active && s.navLabelActive]}>{translate(label, language)}</Text>
      {active && <View style={s.navIndicator} />}
    </Pressable>
  );
}
export function BottomNav({ active }: { active: string }) {
  const s = useStyles(sharedSheet);
  const items = [
    ["home", "Explore", "compass", "/home"],
    ["map", "Map", "map", "/map"],
    ["planner", "Plan", "plus", "/planner"],
    ["saved", "Saved", "heart", "/saved"],
    ["profile", "Profile", "person", "/profile"],
  ] as const;
  return (
    <View style={s.navShell}>
      <View style={s.nav}>{items.map(([id, label, icon, href]) => (
        <NavItem key={id} id={id} label={label} icon={icon} href={href} active={active === id} />
      ))}</View>
    </View>
  );
}
export function Screen({
  children,
  active,
  footer,
  style,
  bodyStyle,
  scroll = true,
  scrollEnabled = true,
  overlay,
}: {
  children: ReactNode;
  active?: string;
  footer?: ReactNode;
  style?: StyleProp<ViewStyle>;
  bodyStyle?: StyleProp<ViewStyle>;
  scroll?: boolean;
  scrollEnabled?: boolean;
  /** Floating content above the page, such as a toast. */
  overlay?: ReactNode;
}) {
  const s = useStyles(sharedSheet);
  const p = usePalette();
  const { syncError } = useTravel();
  const contentGap = StyleSheet.flatten(style)?.gap ?? 20;
  // Tab screens can mount in the background, where an entering animation may never get to run;
  // the tab switch already fades them in.
  const contentEntering = active ? undefined : FadeIn.duration(180);
  return (
    <SafeAreaView style={s.screen} edges={active ? ["top"] : ["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        {scroll ? (
          <ScrollView
            scrollEnabled={scrollEnabled}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[s.content, style, active ? { paddingBottom: 90 } : null, footer ? { paddingBottom: 112 } : null]}
          >
            {!!syncError && (
              <View style={{ backgroundColor: p.dangerSoft, borderRadius: 6, padding: 10 }}>
                <Copy style={{ color: p.danger, fontSize: 12 }}>{syncError}</Copy>
              </View>
            )}
            <Animated.View entering={contentEntering} style={[{ gap: contentGap }, bodyStyle]}>{children}</Animated.View>
          </ScrollView>
        ) : (
          <Animated.View entering={contentEntering} style={[s.content, { flex: 1 }, style, bodyStyle]}>
            {!!syncError && <Copy style={{ color: p.danger }}>{syncError}</Copy>}
            {children}
          </Animated.View>
        )}
        {footer && <View style={s.footer}>{footer}</View>}
        {overlay && <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>{overlay}</View>}
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
  const p = usePalette();
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
  const p = usePalette();
  const language = useAppLanguage();
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
      accessibilityLabel={`${translate(destination.name, language)}, ${translate(destination.country, language)}`}
      style={style}
      contentFit="cover"
    />
  );
}

export function DestinationCard({ destination }: { destination: Destination }) {
  const s = useStyles(sharedSheet);
  const p = usePalette();
  const language = useAppLanguage();
  const { saved, toggleSaved } = useTravel();
  const { width } = useWindowDimensions();
  return (
    <View style={[s.destinationCard, { width: Platform.OS === "web" && width >= 900 ? "23%" : Platform.OS === "web" && width >= 720 ? "31%" : "47.5%" }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={translateAccessibility(`Explore ${destination.name}`, language)}
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
              {formatMessage("{count} places · {tags}", { count: placesForDestination(destination.id).length, tags: destination.tags.slice(0, 2).map((tag) => translate(tag, language)).join(" & ") }, language)}
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
          right: 4,
          top: 4,
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
  const s = useStyles(sharedSheet);
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
  const p = usePalette();
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
export const sharedSheet = themedStyles((p) => ({
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
  content: { width: "100%", maxWidth: 860, alignSelf: "center", padding: 22, gap: 20, flexGrow: 1 },
  footer: {
    width: "100%",
    maxWidth: 860,
    alignSelf: "center",
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
    borderRadius: 10,
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
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  chip: {
    minHeight: 38,
    borderRadius: 8,
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
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 13,
    fontSize: 14,
    color: p.ink,
    backgroundColor: p.white,
    letterSpacing: 0,
  },
  navShell: {
    borderTopWidth: 1,
    borderTopColor: p.line,
    backgroundColor: p.white,
    shadowColor: p.shadow,
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.035,
    shadowRadius: 14,
  },
  nav: {
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
    flexDirection: "row",
    paddingTop: 8,
    paddingBottom: Platform.OS === "web" ? 7 : 2,
    paddingHorizontal: 4,
  },
  navItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 62,
    gap: 3,
  },
  navIcon: {
    width: 40,
    height: 37,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  navIconActive: { backgroundColor: p.blueSoft },
  navCreate: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: p.blue,
    shadowColor: p.blue,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.16,
    shadowRadius: 5,
    elevation: 3,
  },
  navAvatar: { width: 29, height: 29, borderRadius: 15, borderWidth: 1, borderColor: p.line },
  navAvatarActive: { borderWidth: 2, borderColor: p.blue },
  navIndicator: { width: 13, height: 2, borderRadius: 1, backgroundColor: p.blue, position: "absolute", bottom: 0 },
  navLabel: { color: p.muted, fontSize: 10, lineHeight: 14, fontWeight: "600", textAlign: "center" },
  navLabelActive: { color: p.blue, fontWeight: "700" },
  destinationCard: {
    borderRadius: 8,
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
}));
