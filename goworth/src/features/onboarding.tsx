import { Image } from "expo-image";
import * as Linking from "expo-linking";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
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
import { useAppLanguage } from "@/data/formatting";
import { useTimedMessage } from "@/hooks/use-timed-message";

const authRedirectUrl = () =>
  Platform.OS === "web" ? `${window.location.origin}/auth` : Linking.createURL("auth");

export function SplashScreen() {
  const { hold } = useLocalSearchParams<{ hold?: string }>();
  const { user, ready } = useAuth();
  const { cloudReady, hasPreferences } = useTravel();
  const [actionReveal] = useState(() => new Animated.Value(0));
  const [actionsEnabled, setActionsEnabled] = useState(false);
  const [introDone, setIntroDone] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIntroDone(true), 1100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (hold || !ready || (user && !cloudReady) || actionsEnabled) return;
    if (user) {
      router.replace((hasPreferences ? "/home" : "/preferences") as Href);
      return;
    }
    // The short intro pause is for the welcome screen; signed-in users go straight in.
    if (!introDone) return;
    const animation = Animated.timing(actionReveal, {
      toValue: 1,
      duration: 650,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== "web",
    });
    animation.start(({ finished }) => {
      if (finished) setActionsEnabled(true);
    });
    return () => animation.stop();
  }, [hold, introDone, ready, user, cloudReady, hasPreferences, actionsEnabled, actionReveal]);

  return <WelcomeContent actionReveal={actionReveal} actionsEnabled={actionsEnabled} />;
}

function WelcomeContent({ actionReveal, actionsEnabled = true }: { actionReveal?: Animated.Value; actionsEnabled?: boolean }) {
  const p = usePalette();
  const { scheme } = useThemePreference();
  return (
    <View style={{ flex: 1, backgroundColor: p.white }}>
      <StatusBar style="dark" />
      <SafeAreaView style={{ flex: 1 }}>
        <View style={{ flex: 1, paddingHorizontal: 24 }}>
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 15 }}>
            <Image
              source={photos.brandMark}
              style={{ width: 132, height: 104 }}
              contentFit="contain"
              accessibilityLabel="GoWorth logo"
            />
            <Image
              source={photos.brandName}
              style={{ width: 218, height: 54 }}
              tintColor={scheme === "dark" ? p.ink : undefined}
              contentFit="contain"
              accessibilityLabel="GoWorth"
            />
          </View>
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

export function AuthScreen() {
  const s = useStyles(sharedSheet);
  const p = usePalette();
  const language = useAppLanguage();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const { user, passwordRecovery, finishPasswordRecovery } = useAuth();
  const { cloudReady, hasPreferences } = useTravel();
  const [signUp, setSignUp] = useState(mode === "signup");
  const [resetMode, setResetMode] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useTimedMessage();
  const [notice, setNotice] = useTimedMessage();
  const [confirmationEmail, setConfirmationEmail] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (user && cloudReady && !passwordRecovery) {
      router.replace((hasPreferences ? "/home" : "/preferences") as Href);
    }
  }, [user, cloudReady, hasPreferences, passwordRecovery]);
  const submit = async () => {
    if (busy) return;
    setError("");
    setNotice("");
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
          redirectTo: authRedirectUrl(),
        });
        if (result.error) throw result.error;
        setNotice("If this email has an account, a password reset link is on its way.");
        return;
      }
      const result = signUp
        ? await supabase.auth.signUp({
            email: address,
            password,
            options: { emailRedirectTo: authRedirectUrl() },
          })
        : await supabase.auth.signInWithPassword({ email: address, password });
      if (result.error) throw result.error;
      setPassword("");
      if (!result.data.session) {
        setNotice("Check your email to confirm your account. The link will bring you back here.");
        setConfirmationEmail(address);
        setSignUp(false);
      }
    } catch (caught) {
      const code = typeof caught === "object" && caught !== null && "code" in caught ? String(caught.code) : "";
      const status = typeof caught === "object" && caught !== null && "status" in caught ? Number(caught.status) : 0;
      if (code === "email_not_confirmed") setConfirmationEmail(address);
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
        options: { emailRedirectTo: authRedirectUrl() },
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
          {passwordRecovery ? "Choose a new\npassword" : resetMode ? "Reset your\npassword" : signUp
            ? "Your next chapter\nstarts here"
            : "Welcome back\nto GoWorth"}
        </Heading>
        <Copy muted>
          {passwordRecovery ? "Set a new password for your account." : resetMode ? "We'll email you a link to continue." : signUp
            ? "A world of worthy adventures awaits."
            : "Sign in to continue your\ntravel journey."}
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
        <Text style={prefStyles.budgetHint}>{translate("per person", language)}</Text>
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
