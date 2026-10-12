import Slider from "@react-native-community/slider";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as Linking from "expo-linking";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
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
  s,
} from "@/components/goworth/ui";
import { palette as p, photos } from "@/constants/design";
import { interests, money } from "@/data/travel";
import { useTravel } from "@/state/travel-context";
import { useAuth } from "@/state/auth-context";
import { supabase } from "@/lib/supabase";

export function SplashScreen() {
  const { hold } = useLocalSearchParams<{ hold?: string }>();
  const { user, ready } = useAuth();
  const { cloudReady, hasPreferences } = useTravel();
  useEffect(() => {
    if (hold || !ready || (user && !cloudReady)) return;
    const timer = setTimeout(
      () => router.replace((user ? hasPreferences ? "/home" : "/preferences" : "/welcome") as Href),
      300,
    );
    return () => clearTimeout(timer);
  }, [hold, ready, user, cloudReady, hasPreferences]);
  return (
    <Pressable
      style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
      accessibilityRole="button"
      accessibilityLabel="Continue to GoWorth"
      onPress={() => router.replace((user ? hasPreferences ? "/home" : "/preferences" : "/welcome") as Href)}
    >
      <StatusBar style="light" />
      <Image
        source={photos.coast}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        blurRadius={9}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: "rgba(7,65,106,.27)" },
        ]}
      />
      <View style={{ alignItems: "center", gap: 18 }}>
        <Image
          source={photos.brandMark}
          style={{ width: 98, height: 86 }}
          contentFit="contain"
        />
        <Heading style={{ color: p.white, fontSize: 46, lineHeight: 54 }}>
          GoWorth
        </Heading>
        <Copy
          style={{
            color: p.white,
            textAlign: "center",
            fontSize: 22,
            lineHeight: 29,
          }}
        >
          Your next{"\n"}adventure is{"\n"}worth it.
        </Copy>
      </View>
    </Pressable>
  );
}

export function WelcomeScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: "white" }}>
      <StatusBar style="light" />
      <Image
        source={photos.welcome}
        contentFit="cover"
        contentPosition="right center"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "82%",
        }}
      />
      <LinearGradient
        colors={[
          "transparent",
          "rgba(17,30,39,.35)",
          "rgba(255,255,255,.6)",
          "#FFFFFF",
        ]}
        locations={[0, 0.64, 0.86, 1]}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "82%",
        }}
      />
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "flex-end",
            padding: 24,
            paddingTop: 260,
            gap: 12,
          }}
        >
          <View style={{ paddingBottom: 15 }}>
            <Text
              style={{
                fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
                color: "white",
                fontSize: 39,
                lineHeight: 43,
                fontWeight: "700",
                letterSpacing: 0,
                textShadowColor: "rgba(0,0,0,.15)",
                textShadowRadius: 10,
              }}
            >
              Every{"\n"}destination{"\n"}is a worthy one
            </Text>
            <Copy
              style={{
                color: "white",
                marginTop: 12,
                fontSize: 16,
                lineHeight: 23,
              }}
            >
              Extraordinary places.{"\n"}A more fulfilled you.
            </Copy>
          </View>
          <Button onPress={() => router.push({ pathname: "/auth", params: { mode: "signup" } } as Href)}>
            Create an account
          </Button>
          <Button secondary onPress={() => router.push("/auth" as Href)}>
            Sign in
          </Button>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
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
          redirectTo: Linking.createURL("auth"),
        });
        if (result.error) throw result.error;
        setNotice("If this email has an account, a password reset link is on its way.");
        return;
      }
      const result = signUp
        ? await supabase.auth.signUp({
            email: address,
            password,
            options: { emailRedirectTo: Linking.createURL("auth") },
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
      if (code === "email_not_confirmed") setConfirmationEmail(address);
      setError(code === "over_email_send_rate_limit"
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
        options: { emailRedirectTo: Linking.createURL("auth") },
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
          {passwordRecovery ? "Save new password" : resetMode ? "Send reset link" : signUp ? "Create Account" : "Sign In"}
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
  const { preferences, setPreferences, completePreferences } = useTravel();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
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
        <Chip selected={preferences.region === "Worldwide"} onPress={() => setPreferences({ ...preferences, region: "Worldwide" })}>Worldwide</Chip>
        <Row style={{ gap: 10 }}>
          {(["Europe", "Asia", "Americas"] as const).map((region) => (
            <Pressable
              key={region}
              accessibilityRole="button"
              accessibilityLabel={region}
              accessibilityState={{ selected: preferences.region === region }}
              onPress={() => setPreferences({ ...preferences, region })}
              style={{ flex: 1, gap: 7 }}
            >
              <Image
                source={
                  photos[region.toLowerCase() as "europe" | "asia" | "americas"]
                }
                style={{
                  width: "100%",
                  height: 92,
                  borderRadius: 12,
                  borderWidth: preferences.region === region ? 2 : 0,
                  borderColor: p.blue,
                }}
              />
              <Copy
                style={{ fontSize: 12, textAlign: "center", fontWeight: "500" }}
              >
                {region}
              </Copy>
            </Pressable>
          ))}
        </Row>
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
      {!!error && <Copy style={s.error}>{error}</Copy>}
    </Screen>
  );
}
