import { cleanUsername, UsernameField, usernameAvailable, usernamePattern, useUsernameStatus } from "@/components/goworth/username-field";
import { Image } from "expo-image";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Linking from "expo-linking";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  AppState,
  Easing,
  Pressable, Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BudgetInput } from "@/components/goworth/budget-input";
import { Brand, Button, Copy, Field, Header, Heading, Icon, IconButton, Row, Screen, Sheet, sharedSheet } from "@/components/goworth/ui";
import { photos, themedStyles } from "@/constants/design";
import { usePalette, useStyles, useThemePreference } from "@/state/theme-context";
import { venueFilters } from "@/data/nearby-places";
import { venueFilterIcons, venueFilterLabels } from "@/components/goworth/venue-art";
import { destinations } from "@/data/travel";
import { cityForGlobalId, countryForCode, searchCities } from "@/data/geography";
import { useTravel } from "@/state/travel-context";
import { useAuth } from "@/state/auth-context";
import { supabase } from "@/lib/supabase";
import { translate } from "@/data/i18n";
import { useAppLanguage, type AppLanguage } from "@/data/formatting";
import { useTimedMessage } from "@/hooks/use-timed-message";
import { cleanReferralCode, referralCodePattern, referralMetadataKey } from "@/lib/referral";
import { launchCoverArtShown, splashArtShown, useLaunchCoverArtShown, whenSplashArtShown } from "@/state/boot";

// Email links land on a small page of the presentation site, which opens the app with the link's one-time code.
// Mail apps follow an https link reliably; many refuse to follow a redirect straight to goworth://.
// Expo Go cannot open goworth://, so there the link returns to Expo Go directly.
const authBridgeUrl = process.env.EXPO_PUBLIC_AUTH_LINK_URL?.trim() || "https://a-ndrewi.github.io/goworth-website/auth/";
// The page speaks the language the app was in when the email was asked for, not the browser's.
const authRedirectUrl = (flow: "signup" | "recovery", language: AppLanguage) =>
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient ? Linking.createURL("auth") : `${authBridgeUrl}?flow=${flow}&lang=${language}`;

export function SplashScreen() {
  const { hold } = useLocalSearchParams<{ hold?: string }>();
  const { user, ready } = useAuth();
  const { cloudReady, hasPreferences } = useTravel();
  const [actionReveal] = useState(() => new Animated.Value(0));
  const [actionsEnabled, setActionsEnabled] = useState(false);
  const [introDone, setIntroDone] = useState(false);
  // A signed-in launch goes to the tabs under the launch cover, laid over this screen with the same picture. Leaving
  // waits until the cover's images are drawn: swapping straight away showed neither for a frame, a blink of the logo.
  const coverDrawn = useLaunchCoverArtShown();
  const [coverWaitOver, setCoverWaitOver] = useState(false);
  const signedIn = !!user;

  useEffect(() => {
    const timer = setTimeout(() => setIntroDone(true), 1100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!signedIn || coverDrawn) return;
    const timer = setTimeout(() => setCoverWaitOver(true), 1500);
    return () => clearTimeout(timer);
  }, [signedIn, coverDrawn]);

  useEffect(() => {
    if (hold || !ready || (user && !cloudReady) || actionsEnabled) return;
    if (user) {
      if (!coverDrawn && !coverWaitOver) return;
      router.replace((hasPreferences ? "/home" : "/preferences") as Href);
      return;
    }
    // The short intro pause is for the welcome screen; signed-in users go straight in.
    if (!introDone) return;
    settleMark();
    const animation = Animated.timing(actionReveal, {
      toValue: 1,
      duration: 650,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) setActionsEnabled(true);
    });
    return () => animation.stop();
  }, [hold, introDone, ready, user, cloudReady, hasPreferences, actionsEnabled, actionReveal, coverDrawn, coverWaitOver]);

  return <WelcomeContent actionReveal={actionReveal} actionsEnabled={actionsEnabled} animated />;
}

/**
 * The splash's mark, flipped like a tossed coin with a small bounce, over and over while the app loads, and floating.
 * It starts where the native splash left it, so the hand-over shows no jump. The motion is shared app-wide:
 * the launch cover over the tabs shows the same mark mid-flight instead of a still copy, so passing from the
 * splash to the cover looks like one screen.
 */
const mark = { flip: new Animated.Value(0), float: new Animated.Value(0), started: false, users: 0,
  running: null as Animated.CompositeAnimation | null, spinning: null as Animated.CompositeAnimation | null };

function startMark() {
  if (mark.started) return;
  mark.started = true;
  // Still while the native splash is up: the turn starts once the drawn mark has taken its place, so the hand-over
  // shows no jump.
  void Promise.all([AccessibilityInfo.isReduceMotionEnabled().catch(() => false), whenSplashArtShown()]).then(([reduce]) => {
    if (reduce || !mark.started) return;
    // A full turn ends where it started, so each loop restarts from 0 without a jump.
    mark.spinning = Animated.sequence([
      Animated.delay(150),
      Animated.loop(Animated.sequence([
        Animated.timing(mark.flip, { toValue: 1, duration: 950, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
        Animated.delay(300),
      ])),
    ]);
    mark.running = Animated.loop(Animated.sequence([
      Animated.timing(mark.float, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(mark.float, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    mark.spinning.start();
    mark.running.start();
  });
}

/** Stops the float once nothing shows the mark any more, and lets a later splash (after sign-out) play it again. */
/** Loading is over (the welcome buttons come up): the turn under way finishes and the mark stays still, only floating. */
function settleMark() {
  const spin = mark.spinning;
  if (!spin) return;
  mark.spinning = null;
  spin.stop();
  mark.flip.stopAnimation((value) => {
    if (value <= 0) return;
    Animated.timing(mark.flip, { toValue: 1, duration: Math.max(1, (1 - value) * 950), easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  });
}

function stopMark() {
  if (mark.users > 0) return;
  mark.spinning?.stop();
  mark.spinning = null;
  mark.running?.stop();
  mark.running = null;
  mark.started = false;
  mark.flip.setValue(0);
  mark.float.setValue(0);
}

const sharedMarkStyle = {
  transform: [
    { perspective: 700 },
    { rotateY: mark.flip.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) },
    // Swells a little at the half-turn and lands with a soft bounce.
    { scale: mark.flip.interpolate({ inputRange: [0, 0.5, 0.85, 1], outputRange: [1, 1.12, 0.96, 1] }) },
    { translateY: mark.float.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) },
  ],
};

function useMarkAnimation(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    mark.users += 1;
    startMark();
    // The cover mounts before the splash leaves, so the count only reaches zero once the mark is truly gone.
    return () => { mark.users -= 1; setTimeout(stopMark, 0); };
  }, [enabled]);
  return enabled ? sharedMarkStyle : undefined;
}

/** The native splash image's side in points; equals app.json's imageWidth and `side` in scripts/build-splash.mjs. */
const splashSide = 285;

function WelcomeContent({ actionReveal, actionsEnabled = true, animated = false, onArtShown }: { actionReveal?: Animated.Value; actionsEnabled?: boolean; animated?: boolean; onArtShown?: (name: "mark" | "name") => void }) {
  const p = usePalette();
  const { scheme } = useThemePreference();
  const markStyle = useMarkAnimation(animated);
  return (
    <View style={{ flex: 1, backgroundColor: p.white }}>
      <StatusBar style="dark" />
      {/* Laid out exactly like the native splash image (scripts/build-splash.mjs): a square centred on the whole
          screen with the mark at its top. Centring it in the space left by the safe area and the buttons put it a few
          points off on most phones, and off by the insets for the frame before they apply, so the logo snapped. */}
      <View pointerEvents="none" style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, alignItems: "center", justifyContent: "center" }}>
        <View style={{ width: splashSide, height: splashSide, alignItems: "center", gap: 15 }}>
          <Animated.View style={markStyle}>
            <Image
              source={photos.brandMark}
              style={{ width: 132, height: 104 }}
              contentFit="contain"
              accessibilityLabel="GoWorth logo"
              onDisplay={() => (onArtShown ?? splashArtShown)("mark")}
            />
          </Animated.View>
          <Image
            source={photos.brandName}
            style={{ width: 218, height: 54 }}
            tintColor={scheme === "dark" ? p.ink : undefined}
            contentFit="contain"
            accessibilityLabel="GoWorth"
            onDisplay={() => (onArtShown ?? splashArtShown)("name")}
          />
        </View>
      </View>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={{ flex: 1, paddingHorizontal: 24, justifyContent: "flex-end" }}>
          <Animated.View
            pointerEvents={actionsEnabled ? "auto" : "none"}
            accessibilityElementsHidden={!actionsEnabled}
            importantForAccessibility={actionsEnabled ? "auto" : "no-hide-descendants"}
            style={[
              { gap: 12, paddingBottom: 24 },
              actionReveal && {
                opacity: actionReveal,
                transform: [{ translateY: actionReveal.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
              },
            ]}
          >
            <Button disabled={!actionsEnabled} onPress={() => router.push({ pathname: "/auth", params: { mode: "signup" } } as Href)}>
              Create an account
            </Button>
            <Button secondary disabled={!actionsEnabled} onPress={() => router.push("/auth" as Href)}>
              Sign in
            </Button>
          </Animated.View>
        </View>
      </SafeAreaView>
    </View>
  );
}

export function WelcomeScreen() {
  return <WelcomeContent />;
}

/**
 * The splash look laid over the tabs while they warm up at launch; it fades out once they are ready. A signed-in launch
 * lays it over the splash first, so the splash can leave for the tabs underneath it without the logo blinking.
 */
export function BootCover({ visible, overSplash }: { visible: boolean; overSplash: boolean }) {
  const [opacity] = useState(() => new Animated.Value(1));
  const [shown, setShown] = useState(visible);
  // Over the splash it stays hidden until its own logo and name are drawn: coming up empty showed a frame without them.
  const [drawn] = useState(() => new Set<string>());
  const [artReady, setArtReady] = useState(false);
  const onArtShown = (name: "mark" | "name") => {
    // Over the splash, the native splash waits for the splash's own images, which are the ones it uncovers.
    if (!overSplash) splashArtShown(name);
    drawn.add(name);
    if (drawn.size < 2 || artReady) return;
    setArtReady(true);
    launchCoverArtShown();
  };
  if (visible && !shown) { opacity.setValue(1); setShown(true); }
  useEffect(() => {
    // Only a cover that was on screen fades. Fading one that was never shown (the app mounts on the splash route)
    // left the value at 0, and the cover then came up invisible over a half-drawn Explore.
    if (visible || !shown) return;
    // On the JS thread: a native-driven value set back to 1 from JS did not always reach the view.
    const animation = Animated.timing(opacity, { toValue: 0, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: false });
    animation.start(({ finished }) => { if (finished) setShown(false); });
    return () => animation.stop();
  }, [visible, shown, opacity]);
  if (!shown) return null;
  // Above the bottom bar as well, so the logo sits exactly where the splash left it until the tabs are ready.
  return <Animated.View pointerEvents={visible ? "auto" : "none"} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, elevation: 100, opacity: artReady || !overSplash ? opacity : 0 }}>
    <WelcomeContent actionsEnabled={false} actionReveal={hiddenActions} animated onArtShown={onArtShown} />
  </Animated.View>;
}
const hiddenActions = new Animated.Value(0);

export function AuthScreen() {
  const s = useStyles(sharedSheet);
  const p = usePalette();
  const language = useAppLanguage();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const { user, passwordRecovery, finishPasswordRecovery, linkNotice, clearLinkNotice } = useAuth();
  const { cloudReady, hasPreferences } = useTravel();
  const [signUp, setSignUp] = useState(mode === "signup");
  const [resetMode, setResetMode] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const usernameStatus = useUsernameStatus(username);
  const [show, setShow] = useState(false);
  const [error, setError] = useTimedMessage();
  const [notice, setNotice] = useTimedMessage();
  const [confirmationEmail, setConfirmationEmail] = useState("");
  const [busy, setBusy] = useState(false);
  // Kept in memory only, from sign-up until the email is confirmed: when the traveller comes back to the app,
  // even after confirming on another device, it signs in without asking for the password again.
  const awaitingConfirmation = useRef<{ email: string; password: string } | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const subscription = AppState.addEventListener("change", (state) => {
      const pending = awaitingConfirmation.current;
      if (state !== "active" || !pending || !supabase) return;
      const db = supabase;
      // A link tapped on this phone signs in through its code; give that a moment before trying the password.
      clearTimeout(timer);
      timer = setTimeout(async () => {
        if (awaitingConfirmation.current !== pending || (await db.auth.getSession()).data.session) return;
        const { error: signInError } = await db.auth.signInWithPassword(pending);
        if (!signInError || signInError.code !== "email_not_confirmed") awaitingConfirmation.current = null;
      }, 1500);
    });
    return () => { clearTimeout(timer); subscription.remove(); awaitingConfirmation.current = null; };
  }, []);
  useEffect(() => {
    if (user) awaitingConfirmation.current = null;
  }, [user]);
  useEffect(() => {
    if (user && cloudReady && !passwordRecovery) {
      router.replace((hasPreferences ? "/home" : "/preferences") as Href);
    }
  }, [user, cloudReady, hasPreferences, passwordRecovery]);
  const submit = async () => {
    if (busy) return;
    setError("");
    setNotice("");
    clearLinkNotice();
    setConfirmationEmail("");
    const address = email.trim().toLowerCase();
    if (!passwordRecovery && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!resetMode && password.length < 8) {
      setError("Use a password with at least 8 characters.");
      return;
    }
    // A new account picks its username up front, so friends can find and invite it from day one.
    const chosenUsername = cleanUsername(username);
    if (signUp && !resetMode && !passwordRecovery) {
      if (!usernamePattern.test(chosenUsername)) { setError("Use 3-24 letters, numbers or underscores."); return; }
      if (usernameStatus === "taken" || await usernameAvailable(chosenUsername) === false) { setError("Username is already taken."); return; }
      if (inviteCode && !referralCodePattern.test(inviteCode)) { setError("Enter the 6-character code your friend shared."); return; }
    }
    if (!supabase) {
      setError("Account sign-in is not configured on this build.");
      return;
    }
    setBusy(true);
    try {
      if (passwordRecovery) {
        const result = await supabase.auth.updateUser({ password });
        if (result.error) throw result.error;
        finishPasswordRecovery();
        setPassword("");
        router.replace((hasPreferences ? "/home" : "/preferences") as Href);
        return;
      }
      if (resetMode) {
        const result = await supabase.auth.resetPasswordForEmail(address, {
          redirectTo: authRedirectUrl("recovery", language),
        });
        if (result.error) throw result.error;
        setNotice("If this email has an account, a password reset link is on its way.");
        return;
      }
      const result = signUp
        ? await supabase.auth.signUp({
            email: address,
            password,
            // Kept with the account until the first sign-in, when it is saved to the profile.
            options: { emailRedirectTo: authRedirectUrl("signup", language), data: { goworth_username: chosenUsername, ...(inviteCode ? { [referralMetadataKey]: inviteCode } : {}) } },
          })
        : await supabase.auth.signInWithPassword({ email: address, password });
      if (result.error) throw result.error;
      setPassword("");
      if (!result.data.session) {
        awaitingConfirmation.current = { email: address, password };
        setNotice("Check your email and tap the link to confirm your account. GoWorth signs you in as soon as you come back.");
        setConfirmationEmail(address);
        setSignUp(false);
      }
    } catch (caught) {
      const code = typeof caught === "object" && caught !== null && "code" in caught ? String(caught.code) : "";
      const status = typeof caught === "object" && caught !== null && "status" in caught ? Number(caught.status) : 0;
      if (code === "email_not_confirmed") {
        setConfirmationEmail(address);
        awaitingConfirmation.current = { email: address, password };
      }
      setError(status === 504 || code === "request_timeout"
        ? "Account creation is temporarily unavailable because the confirmation email could not be sent. Please try again later."
        : code === "over_email_send_rate_limit"
          ? "Too many emails have been sent. Wait a while before trying again."
          : caught instanceof Error ? caught.message : "Authentication failed. Try again.");
    } finally {
      setBusy(false);
    }
  };
  const resendConfirmation = async () => {
    if (!supabase || !confirmationEmail || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await supabase.auth.resend({
        type: "signup",
        email: confirmationEmail,
        options: { emailRedirectTo: authRedirectUrl("signup", language) },
      });
      if (result.error) throw result.error;
      setNotice("A new confirmation link is on its way. Check your inbox and spam folder.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not resend the email. Try again later.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen style={{ gap: 24 }}>
      <Row style={{ justifyContent: "space-between" }}>
        <Brand />
        <IconButton
          name="close"
          label="Back to welcome"
          onPress={() => router.replace("/welcome" as Href)}
        />
      </Row>
      <View style={{ marginTop: 36, gap: 10 }}>
        <Heading>
          {passwordRecovery ? "Choose a new password" : resetMode ? "Reset your password" : signUp
            ? "Your next chapter starts here"
            : "Welcome back to GoWorth"}
        </Heading>
        <Copy muted>
          {passwordRecovery ? "Set a new password for your account." : resetMode ? "We'll email you a link to continue." : signUp
            ? "A world of worthy adventures awaits."
            : "Sign in to continue your travel journey."}
        </Copy>
      </View>
      <View style={{ gap: 20 }}>
        {!passwordRecovery && <Field
          label="Email address"
          placeholder="name@example.com"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />}
        {signUp && !resetMode && !passwordRecovery && <UsernameField value={username} onChangeText={setUsername} status={usernameStatus} />}
        {signUp && !resetMode && !passwordRecovery && <Field label="Friend's invite code (optional)" placeholder="ABC234" autoCapitalize="characters" autoCorrect={false}
          maxLength={8} value={inviteCode} onChangeText={(value) => setInviteCode(cleanReferralCode(value))} />}
        {!resetMode && <View style={{ gap: 7 }}>
          <Copy style={s.label}>Password</Copy>
          <Row style={[s.input, { paddingVertical: 0, paddingRight: 4 }]}>
            <TextInput
              accessibilityLabel="Password"
              autoCapitalize="none"
              secureTextEntry={!show}
              value={password}
              onChangeText={setPassword}
              placeholder={translate("At least 8 characters", language)}
              placeholderTextColor={p.muted}
              style={{
                flex: 1,
                fontSize: 14,
                color: p.ink,
                paddingVertical: 13,
              }}
            />
            <IconButton
              name={show ? "eyeOff" : "eye"}
              label={show ? "Hide password" : "Show password"}
              onPress={() => setShow(!show)}
              color={p.muted}
            />
          </Row>
        </View>}
        {!signUp && !resetMode && !passwordRecovery && (
          <Pressable
            accessibilityRole="button"
            onPress={() => { setResetMode(true); setError(""); setNotice(""); }}
            style={{ alignSelf: "flex-end" }}
          >
            <Copy style={{ fontSize: 13, color: p.blue }}>
              Forgot password?
            </Copy>
          </Pressable>
        )}
        {!!error && <Copy style={s.error}>{error}</Copy>}
        {!!notice && <Copy style={{ color: p.blue }}>{notice}</Copy>}
        {!!linkNotice && !error && !notice && <Copy style={{ color: p.blue }}>{linkNotice}</Copy>}
        {!!confirmationEmail && !signUp && !resetMode && !passwordRecovery && (
          <Button secondary busy={busy} icon="mail" onPress={resendConfirmation}>Resend confirmation</Button>
        )}
        <Button onPress={submit} busy={busy}>
          {busy && signUp ? "Creating account..." : passwordRecovery ? "Save new password" : resetMode ? "Send reset link" : signUp ? "Create Account" : "Sign In"}
        </Button>
        {signUp && !resetMode && !passwordRecovery && <View style={{ gap: 4 }}>
          <Copy muted style={{ textAlign: "center", fontSize: 12 }}>By creating an account, you agree to the Terms of use and acknowledge the Privacy notice.</Copy>
          <Row style={{ justifyContent: "center", gap: 18 }}>
            <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: "/legal-document", params: { type: "terms" } } as Href)}><Copy style={{ color: p.blue, fontSize: 12 }}>Terms of use</Copy></Pressable>
            <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: "/legal-document", params: { type: "privacy" } } as Href)}><Copy style={{ color: p.blue, fontSize: 12 }}>Privacy notice</Copy></Pressable>
          </Row>
        </View>}
      </View>
      {!passwordRecovery && <Pressable
        accessibilityRole="button"
        onPress={() => {
          if (resetMode) setResetMode(false);
          else setSignUp(!signUp);
          setError("");
          setNotice("");
          setConfirmationEmail("");
        }}
        style={{ paddingVertical: 14 }}
      >
        <Copy style={{ textAlign: "center", fontSize: 13 }}>
          {resetMode ? "Remember your password? " : signUp ? "Already have an account? " : "Don't have an account? "}
          <Text style={{ color: p.blue, fontWeight: "600" }}>
            {translate(resetMode || signUp ? "Sign In" : "Sign Up", language)}
          </Text>
        </Copy>
      </Pressable>}
    </Screen>
  );
}

export function PreferencesScreen() {
  const prefStyles = useStyles(prefStylesSheet);
  const s = useStyles(sharedSheet);
  const p = usePalette();
  const language = useAppLanguage();
  const {
    preferences: storedPreferences,
    hasPreferences,
    completePreferences,
    discoverySettings: storedDiscoverySettings,
    setDiscoverySettings: commitDiscoverySettings,
  } = useTravel();
  const [preferences, setPreferences] = useState(storedPreferences);
  const [discoverySettings, setDiscoverySettings] = useState(storedDiscoverySettings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useTimedMessage();
  const [choosingCenter, setChoosingCenter] = useState(false);
  const [cityQuery, setCityQuery] = useState("");
  const selectedCity = cityForGlobalId(discoverySettings.centerId);
  const center = selectedCity
    ? { id: selectedCity.id, name: selectedCity.name, country: countryForCode(selectedCity.countryCode)?.name ?? selectedCity.countryCode }
    : destinations.find((item) => item.id === discoverySettings.centerId);
  return (
    <Screen
      footer={
        <Button busy={saving} onPress={async () => {
          setSaving(true);
          setError("");
          try {
            await completePreferences(preferences);
            commitDiscoverySettings(discoverySettings);
            if (hasPreferences && router.canGoBack()) router.back();
            else router.replace((hasPreferences ? "/profile" : "/home") as Href);
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Could not save your preferences.");
          } finally {
            setSaving(false);
          }
        }}>Save preferences</Button>
      }
      style={{ gap: 16 }}
    >
      {hasPreferences ? <View style={{ gap: 8 }}>
        <Header title="Travel preferences" />
        <Copy muted>Shape the destinations and nearby places you see.</Copy>
      </View> : <View style={{ gap: 8 }}>
        <Heading>Tell us about your travel style</Heading>
        <Copy muted>This helps GoWorth suggest destinations that fit you.</Copy>
      </View>}
      <View style={prefStyles.card}>
        <Row style={{ gap: 10 }}><View style={prefStyles.cardIcon}><Icon name="globe" size={19} color={p.blue} /></View><Heading style={prefStyles.cardTitle}>Preferred destinations</Heading></Row>
        <View style={[s.grid, { gap: 8 }]}>
          {(["Worldwide", "Europe", "Asia", "Americas", "Africa", "Oceania"] as const).map((region) => {
            const selected = preferences.region === region;
            return <Pressable key={region} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setPreferences({ ...preferences, region })}
              style={({ pressed }) => [prefStyles.option, selected && prefStyles.optionSelected, pressed && { opacity: 0.8 }]}>
              <Text style={[prefStyles.optionText, selected && { color: p.onColor }]}>{translate(region, language)}</Text>
            </Pressable>;
          })}
        </View>
      </View>
      <View style={prefStyles.card}>
        <Row style={{ gap: 10 }}><View style={prefStyles.cardIcon}><Icon name="wallet" size={19} color={p.blue} /></View><Heading style={prefStyles.cardTitle}>Budget range</Heading></Row>
        <Text style={prefStyles.budgetHint}>{translate("for the whole trip", language)}</Text>
        <BudgetInput label="Travel budget" value={preferences.budget} onChange={(budget) => setPreferences({ ...preferences, budget })} />
        <Copy muted style={{ fontSize: 12 }}>Used as the starting budget for new trips.</Copy>
      </View>
      <View style={prefStyles.card}>
        <Row style={{ gap: 10 }}><View style={prefStyles.cardIcon}><Icon name="compass" size={19} color={p.blue} /></View><Heading style={prefStyles.cardTitle}>Nearby discovery</Heading></Row>
        <Copy muted style={{ fontSize: 13 }}>Choose where the Explore deck looks for places and how far it goes.</Copy>
        <Copy style={s.label}>Search from</Copy>
        <Pressable accessibilityRole="button" onPress={() => setChoosingCenter(true)} style={({ pressed }) => [prefStyles.from, pressed && { backgroundColor: p.blueSoft }]}>
          <Icon name={center ? "pin" : "target"} size={19} color={p.blue} />
          <Text numberOfLines={1} style={prefStyles.fromText}>{center ? `${translate(center.name, language)}, ${translate(center.country, language)}` : translate("My current location", language)}</Text>
          <Text style={prefStyles.change}>{translate("Change", language)}</Text>
        </Pressable>
        <Copy style={s.label}>Search radius</Copy>
        <View style={[s.grid, { gap: 8 }]}>
          {[25, 100, 500, 2000, 20000].map((radiusKm) => {
            const selected = discoverySettings.radiusKm === radiusKm;
            return <Pressable key={radiusKm} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => setDiscoverySettings({ ...discoverySettings, radiusKm })}
              style={({ pressed }) => [prefStyles.option, selected && prefStyles.optionSelected, pressed && { opacity: 0.8 }]}>
              <Text style={[prefStyles.optionText, selected && { color: p.onColor }]}>{radiusKm === 20000 ? translate("Worldwide", language) : `${radiusKm.toLocaleString(language === "ro" ? "ro-RO" : "en-US")} km`}</Text>
            </Pressable>;
          })}
        </View>
        <Copy muted style={{ fontSize: 12 }}>Distance is measured to each city center.</Copy>
      </View>
      <View style={prefStyles.card}>
        <Row style={{ gap: 10 }}><View style={prefStyles.cardIcon}><Icon name="cocktail" size={19} color={p.blue} /></View><Heading style={prefStyles.cardTitle}>Food & nightlife</Heading></Row>
        <Copy muted style={{ fontSize: 13 }}>Choose which venues join the Explore deck. Terraces are places with outdoor seating.</Copy>
        <View style={[s.grid, { gap: 8 }]}>
          {venueFilters.map((venue) => {
            const selected = discoverySettings.venues.includes(venue);
            return <Pressable key={venue} accessibilityRole="checkbox" accessibilityState={{ checked: selected }}
              onPress={() => setDiscoverySettings((current) => ({ ...current, venues: current.venues.includes(venue) ? current.venues.filter((item) => item !== venue) : [...current.venues, venue] }))}
              style={({ pressed }) => [prefStyles.option, prefStyles.venueOption, selected && prefStyles.optionSelected, pressed && { opacity: 0.8 }]}>
              <Icon name={venueFilterIcons[venue]} size={16} color={selected ? p.onColor : p.blue} />
              <Text style={[prefStyles.optionText, selected && { color: p.onColor }]}>{translate(venueFilterLabels[venue], language)}</Text>
            </Pressable>;
          })}
        </View>
      </View>
      {!!error && <Copy style={s.error}>{error}</Copy>}
      <Sheet visible={choosingCenter} title="Search from" onClose={() => setChoosingCenter(false)}>
        <TextInput accessibilityLabel={translate("Search cities", language)} placeholder={translate("Find a city", language)} placeholderTextColor={p.muted} value={cityQuery} onChangeText={setCityQuery} style={[s.input, { flex: 0 }]} />
        <Pressable accessibilityRole="button" onPress={() => { setDiscoverySettings({ ...discoverySettings, centerId: null }); setChoosingCenter(false); }} style={[s.row, { paddingVertical: 10, gap: 10 }]}>
          <Copy style={{ flex: 1, fontWeight: "600" }}>My current location</Copy>
          {!center && <Copy style={{ color: p.blue }}>Selected</Copy>}
        </Pressable>
        {choosingCenter && searchCities(cityQuery).map((item) => (
          <Pressable key={item.id} accessibilityRole="button" onPress={() => { setDiscoverySettings({ ...discoverySettings, centerId: item.id }); setChoosingCenter(false); setCityQuery(""); }} style={[s.row, { paddingVertical: 10, gap: 10, borderTopWidth: 1, borderColor: p.line }]}>
            <Copy style={{ flex: 1 }}>{item.name}, {countryForCode(item.countryCode)?.name ?? item.countryCode}</Copy>
            {center?.id === item.id && <Copy style={{ color: p.blue }}>Selected</Copy>}
          </Pressable>
        ))}
      </Sheet>
    </Screen>
  );
}

const prefStylesSheet = themedStyles((p) => ({
  card: { gap: 12, padding: 16, borderRadius: 20, borderWidth: 1, borderColor: p.line, backgroundColor: p.white },
  cardIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: p.blueSoft },
  cardTitle: { fontSize: 17, lineHeight: 23 },
  option: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 14, backgroundColor: p.soft },
  optionSelected: { backgroundColor: p.blue },
  venueOption: { flexDirection: "row", alignItems: "center", gap: 6 },
  optionText: { color: p.ink, fontSize: 13, fontWeight: "700" },
  budget: { color: p.ink, fontSize: 28, fontWeight: "800" },
  budgetHint: { color: p.muted, fontSize: 13, fontWeight: "600" },
  from: { flexDirection: "row", alignItems: "center", gap: 10, padding: 13, borderRadius: 14, backgroundColor: p.soft },
  fromText: { flex: 1, color: p.ink, fontSize: 14, fontWeight: "700" },
  change: { color: p.blue, fontSize: 13, fontWeight: "700" },
}));
