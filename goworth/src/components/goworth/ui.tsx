import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
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
        selected && { backgroundColor: p.blue, borderColor: p.blue },
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
      <View style={{ flex: 1, alignItems: centered && back ? "center" : "flex-start" }}>
        {/* Top-level screens get an iOS large title; pushed screens a compact one. */}
        <Heading style={back
          ? { fontSize: 26, lineHeight: 32, letterSpacing: -0.4, textAlign: centered ? "center" : "left" }
          : { fontSize: 34, lineHeight: 40, letterSpacing: -0.8, marginTop: 6 }}>{title}</Heading>
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
  // The highlight behind the active item is BottomNav's sliding indicator, so items stay plain views.
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
          avatarUrl
            ? <Image source={{ uri: avatarUrl }} contentFit="cover" style={[s.navAvatar, active && s.navAvatarActive]} />
            : <GlyphIcon name="person" size={23} color={active ? p.blue : p.muted} />
        ) : (
          <GlyphIcon name={active ? activeIcon : icon} size={create ? 22 : 23} color={create ? p.onColor : active && id === "saved" ? p.danger : active ? p.blue : p.muted} />
        )}
      </View>
      {!create && <Text style={[s.navLabel, active && s.navLabelActive]}>{translate(label, language)}</Text>}
    </Pressable>
  );
}
export function BottomNav({ active }: { active: string }) {
  const items = [
    ["home", "Explore", "compass", "/home"],
    ["map", "Map", "map", "/map"],
    ["planner", "Plan", "plus", "/planner"],
    ["saved", "Saved", "heart", "/saved"],
    ["profile", "Profile", "person", "/profile"],
  ] as const;
  const index = items.findIndex(([id]) => id === active);
  return (
    // Plan opens a screen rather than a tab, so it never carries the indicator.
    <NavBar index={items[index]?.[0] === "planner" ? -1 : index} count={items.length}>
      {items.map(([id, label, icon, href]) => (
        <NavItem key={id} id={id} label={label} icon={icon} href={href} active={active === id} />
      ))}
    </NavBar>
  );
}
// Border plus padding around the items, used to size the sliding indicator.
const navInset = 7;
const liquidGlass = isLiquidGlassAvailable();
// The selector's glass per theme: a milky, blue-tinted pane on light; a brighter, see-through pane on dark.
const navGlass = {
  light: {
    body: ["rgba(255,255,255,0.75)", "rgba(36,87,230,0.13)"],
    sheen: ["rgba(255,255,255,0.9)", "rgba(255,255,255,0)"],
    edge: "rgba(36,87,230,0.16)",
    glow: "#2457E6",
    nativeTint: "1F",
  },
  dark: {
    body: ["rgba(255,255,255,0.14)", "rgba(91,134,245,0.22)"],
    sheen: ["rgba(255,255,255,0.22)", "rgba(255,255,255,0)"],
    edge: "rgba(255,255,255,0.16)",
    glow: "#000000",
    nativeTint: "33",
  },
} as const;
/** The floating bottom bar; a pill slides behind the item at `index` (-1 hides it). */
export function NavBar({ index, count, children }: { index: number; count: number; children: ReactNode }) {
  const s = useStyles(sharedSheet);
  const p = usePalette();
  const { scheme } = useThemePreference();
  const glass = navGlass[scheme];
  const visible = index >= 0;
  const [itemWidth, setItemWidth] = useState(0);
  // The pill's two edges follow the target on springs of different stiffness, so it stretches toward
  // the new tab like a drop of liquid and settles back into a pill when the slower edge catches up.
  const lead = useSharedValue(Math.max(index, 0));
  const tail = useSharedValue(Math.max(index, 0));
  const visibility = useSharedValue(visible ? 1 : 0);
  useEffect(() => {
    if (visible) {
      lead.set(withSpring(index, { damping: 16, stiffness: 320, mass: 0.7 }));
      tail.set(withSpring(index, { damping: 20, stiffness: 130, mass: 0.9 }));
    }
    visibility.set(withTiming(visible ? 1 : 0, { duration: 160 }));
  }, [index, visible, lead, tail, visibility]);
  const indicatorStyle = useAnimatedStyle(() => {
    const stretch = Math.abs(lead.value - tail.value);
    return {
      width: (1 + stretch) * itemWidth,
      opacity: visibility.value,
      transform: [
        { translateX: Math.min(lead.value, tail.value) * itemWidth },
        // Stretched liquid gets thinner, and the pill swells in as it appears.
        { scaleY: (1 - Math.min(stretch, 1) * 0.14) * (0.9 + visibility.value * 0.1) },
        { scaleX: 0.9 + visibility.value * 0.1 },
      ],
    };
  });
  return (
    <View style={s.navShell}>
      <View style={s.nav} onLayout={(event) => setItemWidth((event.nativeEvent.layout.width - navInset * 2) / count)}>
        {itemWidth > 0 && (
          // Real Liquid Glass where iOS offers it; elsewhere layered translucent fills drawn per theme.
          <Animated.View pointerEvents="none" style={[s.navIndicator, { shadowColor: glass.glow, borderColor: glass.edge }, indicatorStyle]}>
            {liquidGlass ? (
              <GlassView glassEffectStyle="regular" colorScheme={scheme} tintColor={p.blue + glass.nativeTint} style={s.navIndicatorLayer} />
            ) : (
              <>
                <LinearGradient colors={glass.body} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={s.navIndicatorLayer} />
                <LinearGradient colors={glass.sheen} start={{ x: 0, y: 0 }} end={{ x: 0, y: 0.6 }} style={s.navIndicatorSheen} />
              </>
            )}
          </Animated.View>
        )}
        {children}
      </View>
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
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[s.content, style, active ? { paddingBottom: 28 } : null, footer ? { paddingBottom: 112 } : null]}
          >
            {!!syncError && (
              <View style={{ backgroundColor: p.dangerSoft, borderRadius: 14, padding: 12 }}>
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
          <View style={s.grabber} />
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
/** An iOS-style grouped list: an optional title above a rounded card of rows. */
export function ListGroup({ title, footer, children }: { title?: string; footer?: string; children: ReactNode }) {
  const s = useStyles(sharedSheet);
  const language = useAppLanguage();
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View>
      {!!title && <Text accessibilityRole="header" style={s.groupTitle}>{translate(title, language)}</Text>}
      <View style={s.group}>
        {rows.map((row, index) => <View key={index}>{index > 0 && <View style={s.listDivider} />}{row}</View>)}
      </View>
      {!!footer && <Text style={s.groupFooter}>{translate(footer, language)}</Text>}
    </View>
  );
}
export function ListRow({
  icon,
  iconColor,
  label,
  detail,
  value,
  onPress,
  destructive = false,
  chevron = true,
  right,
  accessibilityRole = "button",
}: {
  icon?: IconName;
  iconColor?: string;
  label: string;
  detail?: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
  chevron?: boolean;
  right?: ReactNode;
  accessibilityRole?: "button" | "link";
}) {
  const s = useStyles(sharedSheet);
  const p = usePalette();
  const language = useAppLanguage();
  const tint = destructive ? p.danger : iconColor ?? p.ink;
  const body = <>
    {icon && <View style={{ width: 26, alignItems: "center" }}><Icon name={icon} size={23} color={tint} /></View>}
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={[s.listLabel, destructive && { color: p.danger }]}>{translate(label, language)}</Text>
      {!!detail && <Text style={s.listDetail}>{translate(detail, language)}</Text>}
    </View>
    {!!value && <Text numberOfLines={1} style={s.listValue}>{value}</Text>}
    {right}
    {onPress && chevron && <Icon name="right" size={17} color={p.muted} />}
  </>;
  if (!onPress) return <View style={s.listRow}>{body}</View>;
  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      onPress={onPress}
      style={({ pressed }) => [s.listRow, pressed && { backgroundColor: p.soft }]}
    >
      {body}
    </Pressable>
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
      <View style={{ width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center", backgroundColor: p.blueSoft }}>
        <Icon name="compass" size={38} color={p.blue} />
      </View>
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
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "800",
    color: p.ink,
    letterSpacing: -0.5,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  screen: { flex: 1, backgroundColor: p.canvas },
  content: { width: "100%", maxWidth: 860, alignSelf: "center", padding: 22, gap: 20, flexGrow: 1 },
  footer: {
    width: "100%",
    maxWidth: 860,
    alignSelf: "center",
    padding: 18,
    paddingTop: 12,
    gap: 10,
    backgroundColor: p.canvas,
  },
  button: {
    minHeight: 52,
    paddingHorizontal: 20,
    paddingVertical: 13,
    backgroundColor: p.blue,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 9,
    shadowColor: p.blue,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 3,
  },
  buttonLabel: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "700",
    letterSpacing: -0.1,
    textAlign: "center",
  },
  secondaryButton: {
    backgroundColor: p.white,
    borderWidth: 1,
    borderColor: p.line,
    shadowOpacity: 0,
    elevation: 0,
  },
  iconButton: {
    width: 44,
    height: 44,
    minWidth: 44,
    minHeight: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  chip: {
    minHeight: 38,
    borderRadius: 19,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: p.white,
    borderWidth: 1,
    borderColor: p.line,
  },
  chipText: {
    color: p.ink,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "600",
    letterSpacing: 0,
  },
  label: { fontSize: 13, lineHeight: 18, fontWeight: "700", color: p.muted },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: p.line,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 14,
    color: p.ink,
    backgroundColor: p.white,
    letterSpacing: 0,
  },
  // A floating pill, as in iOS: the canvas shows around it.
  navShell: {
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: Platform.OS === "web" ? 12 : 4,
    backgroundColor: p.canvas,
  },
  nav: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    flexDirection: "row",
    padding: 6,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: p.line,
    backgroundColor: p.white,
    shadowColor: p.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 8,
  },
  navItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 54,
    borderRadius: 24,
    gap: 2,
  },
  navIndicator: {
    position: "absolute",
    top: 6,
    bottom: 6,
    left: 6,
    borderRadius: 24,
    borderWidth: 1,
    // The bar behind it is this colour anyway; an opaque fill lets iOS draw the shadow from the shape instead of
    // recomputing it from the translucent layers on every frame of the slide.
    backgroundColor: p.white,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
  },
  // Layers inside the pill round their own corners so the pill can keep its shadow (no overflow clipping).
  navIndicatorLayer: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, borderRadius: 23 },
  navIndicatorSheen: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "55%",
    borderTopLeftRadius: 23,
    borderTopRightRadius: 23,
  },
  navIcon: {
    width: 36,
    height: 30,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  navIconActive: {},
  navCreate: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: p.blue,
    shadowColor: p.blue,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.16,
    shadowRadius: 5,
    elevation: 3,
  },
  navAvatar: { width: 29, height: 29, borderRadius: 15, borderWidth: 1, borderColor: p.line },
  navAvatarActive: { borderWidth: 2, borderColor: p.blue },
  navLabel: { color: p.muted, fontSize: 10, lineHeight: 14, fontWeight: "600", textAlign: "center" },
  navLabelActive: { color: p.blue, fontWeight: "700" },
  destinationCard: {
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: p.white,
    borderWidth: 1,
    borderColor: p.line,
  },
  scrim: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    backgroundColor: "rgba(6,10,18,.48)",
  },
  sheet: {
    width: "100%",
    maxWidth: 480,
    maxHeight: "90%",
    backgroundColor: p.white,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 24,
    paddingTop: 10,
    paddingBottom: 38,
  },
  grabber: { alignSelf: "center", width: 38, height: 5, borderRadius: 3, backgroundColor: p.line, marginBottom: 14 },
  groupTitle: { color: p.muted, fontSize: 13, lineHeight: 18, fontWeight: "700", paddingHorizontal: 6, marginBottom: 8 },
  groupFooter: { color: p.muted, fontSize: 12, lineHeight: 17, paddingHorizontal: 6, marginTop: 8 },
  group: { borderRadius: 20, backgroundColor: p.white, overflow: "hidden", borderWidth: 1, borderColor: p.line },
  listRow: { flexDirection: "row", alignItems: "center", gap: 13, minHeight: 56, paddingLeft: 16, paddingRight: 14, paddingVertical: 11 },
  listDivider: { position: "absolute", top: 0, left: 55, right: 0, height: StyleSheet.hairlineWidth * 2, backgroundColor: p.line },
  listLabel: { color: p.ink, fontSize: 16, lineHeight: 21, fontWeight: "500" },
  listDetail: { color: p.muted, fontSize: 12.5, lineHeight: 17, marginTop: 1 },
  listValue: { color: p.muted, fontSize: 15, fontWeight: "500" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  error: { color: p.danger, fontSize: 13, lineHeight: 20 },
}));
