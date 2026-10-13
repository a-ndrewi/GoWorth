import Slider from "@react-native-community/slider";
import { Image } from "expo-image";
import * as Linking from "expo-linking";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Brand,
  Button,
  Chip,
  Copy,
  Field,
  Heading,
  IconButton,
  Row,
  Screen,
  Sheet,
  s,
} from "@/components/goworth/ui";
import { palette as p, photos } from "@/constants/design";
import { destinations, interests, money } from "@/data/travel";
import { useTravel } from "@/state/travel-context";
import { useAuth } from "@/state/auth-context";
import { supabase } from "@/lib/supabase";

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
    if (hold || !introDone || !ready || (user && !cloudReady) || actionsEnabled) return;
    if (user) {
      router.replace((hasPreferences ? "/home" : "/preferences") as Href);
      return;
    }
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
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const { user, passwordRecovery, finishPasswordRecovery } = useAuth();
  const { cloudReady, hasPreferences } = useTravel();
  const [signUp, setSignUp] = useState(mode === "signup");
  const [resetMode, setResetMode] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
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
              placeholder="At least 8 characters"
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
            {resetMode || signUp ? "Sign In" : "Sign Up"}
          </Text>
        </Copy>
      </Pressable>}
    </Screen>
  );
}

export function PreferencesScreen() {
  const { preferences, setPreferences, completePreferences, discoverySettings, setDiscoverySettings } = useTravel();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [choosingCenter, setChoosingCenter] = useState(false);
  const [cityQuery, setCityQuery] = useState("");
  const center = destinations.find((item) => item.id === discoverySettings.centerId);
  const toggle = (interest: string) =>
    setPreferences({
      ...preferences,
      interests: preferences.interests.includes(interest)
        ? preferences.interests.filter((x) => x !== interest)
        : [...preferences.interests, interest],
    });
  return (
    <Screen
      footer={
        <Button busy={saving} onPress={async () => {
          setSaving(true);
          setError("");
          try {
            await completePreferences();
            router.replace("/home" as Href);
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Could not save your preferences.");
          } finally {
            setSaving(false);
          }
        }}>Save preferences</Button>
      }
      style={{ gap: 22 }}
    >
      <View style={{ gap: 8 }}>
        <Heading>Tell us about{"\n"}your travel style</Heading>
        <Copy muted>
          This helps GoWorth create{"\n"}better recommendations for you.
        </Copy>
      </View>
      <View style={{ gap: 10 }}>
        <Copy style={s.label}>Trip style</Copy>
        <View style={[s.grid, { gap: 8 }]}>
          {interests.map((name, i) => (
            <Chip
              key={name}
              selected={preferences.interests.includes(name)}
              tint={[p.greenSoft, p.orangeSoft, p.blueSoft, "#F0EAFE"][i % 4]}
              onPress={() => toggle(name)}
            >
              {name}
            </Chip>
          ))}
        </View>
      </View>
      <View style={{ gap: 12 }}>
        <Copy style={s.label}>Preferred destinations</Copy>
        <View style={[s.grid, { gap: 8 }]}>
          {(["Worldwide", "Europe", "Asia", "Americas", "Africa", "Oceania"] as const).map((region) => (
            <Chip
              key={region}
              selected={preferences.region === region}
              onPress={() => setPreferences({ ...preferences, region })}
              style={{ minWidth: 94 }}
            >
              {region}
            </Chip>
          ))}
        </View>
      </View>
      <View style={{ gap: 9 }}>
        <Row style={{ justifyContent: "space-between" }}>
          <Copy style={s.label}>Budget range (per person)</Copy>
          <Copy style={{ color: p.blue, fontWeight: "600" }}>
            {money(preferences.budget)}
          </Copy>
        </Row>
        <Slider
          accessibilityLabel="Travel budget"
          minimumValue={500}
          maximumValue={10000}
          step={100}
          value={preferences.budget}
          onValueChange={(budget) => setPreferences({ ...preferences, budget })}
          minimumTrackTintColor={p.blue}
          maximumTrackTintColor={p.line}
          thumbTintColor={p.blue}
        />
        <Row style={{ justifyContent: "space-between" }}>
          <Copy muted style={{ fontSize: 12 }}>
            $500
          </Copy>
          <Copy muted style={{ fontSize: 12 }}>
            $10,000
          </Copy>
        </Row>
      </View>
      <View style={{ gap: 9 }}>
        <Copy style={s.label}>Travel pace</Copy>
        <Row>
          {["Relaxed", "Balanced", "Packed"].map((pace) => (
            <Chip
              key={pace}
              selected={preferences.pace === pace}
              onPress={() => setPreferences({ ...preferences, pace })}
              style={{ flex: 1, paddingHorizontal: 8 }}
            >
              {pace}
            </Chip>
          ))}
        </Row>
      </View>
      <View style={{ gap: 12, borderTopWidth: 1, borderColor: p.line, paddingTop: 20 }}>
        <Heading style={{ fontSize: 20 }}>Nearby discovery</Heading>
        <Copy style={s.label}>Search from</Copy>
        <Button secondary icon="pin" onPress={() => setChoosingCenter(true)}>{center ? `${center.name}, ${center.country}` : "My current location"}</Button>
        <Copy style={s.label}>Search radius</Copy>
        <View style={[s.grid, { gap: 8 }]}>
          {[25, 100, 500, 2000, 20000].map((radiusKm) => (
            <Chip key={radiusKm} selected={discoverySettings.radiusKm === radiusKm} onPress={() => setDiscoverySettings({ ...discoverySettings, radiusKm })}>
              {radiusKm === 20000 ? "Worldwide" : `${radiusKm.toLocaleString("en-US")} km`}
            </Chip>
          ))}
        </View>
        <Copy muted style={{ fontSize: 12 }}>Distance is measured to each city center.</Copy>
      </View>
      {!!error && <Copy style={s.error}>{error}</Copy>}
      <Sheet visible={choosingCenter} title="Search from" onClose={() => setChoosingCenter(false)}>
        <TextInput accessibilityLabel="Search cities" placeholder="Find a city" placeholderTextColor={p.muted} value={cityQuery} onChangeText={setCityQuery} style={[s.input, { flex: 0 }]} />
        <Pressable accessibilityRole="button" onPress={() => { setDiscoverySettings({ ...discoverySettings, centerId: null }); setChoosingCenter(false); }} style={[s.row, { paddingVertical: 10, gap: 10 }]}>
          <Copy style={{ flex: 1, fontWeight: "600" }}>My current location</Copy>
          {!center && <Copy style={{ color: p.blue }}>Selected</Copy>}
        </Pressable>
        {destinations.filter((item) => `${item.name} ${item.country}`.toLowerCase().includes(cityQuery.trim().toLowerCase())).map((item) => (
          <Pressable key={item.id} accessibilityRole="button" onPress={() => { setDiscoverySettings({ ...discoverySettings, centerId: item.id }); setChoosingCenter(false); setCityQuery(""); }} style={[s.row, { paddingVertical: 10, gap: 10, borderTopWidth: 1, borderColor: p.line }]}>
            <Copy style={{ flex: 1 }}>{item.name}, {item.country}</Copy>
            {center?.id === item.id && <Copy style={{ color: p.blue }}>Selected</Copy>}
          </Pressable>
        ))}
      </Sheet>
    </Screen>
  );
}
