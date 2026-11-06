import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useGlobalSearchParams, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, type ReactNode } from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { TravelProvider, useTravel } from "@/state/travel-context";
import { AuthProvider, useAuth } from "@/state/auth-context";
import { ThemeProvider as AppThemeProvider, usePalette, useThemePreference } from "@/state/theme-context";
import { tripDays } from "@/data/travel";
import { BottomNav, Button, Copy } from "@/components/goworth/ui";
import { ItineraryNav } from "@/components/goworth/itinerary-nav";
import { OfflineBanner } from "@/components/goworth/offline-banner";
import { UsernameGate } from "@/features/username-gate";
import { ReferralAutoRedeem } from "@/features/referral-auto-redeem";
// Also defines the background task that wakes the app for nearby places, which must exist before the app renders.
import { DeviceSync } from "@/state/device-sync";
import { setPhotoStore } from "@/data/place-photo";
import { setNearbyPlacesStore, setSharedPlaceLists } from "@/data/nearby-places";
import { supabase } from "@/lib/supabase";
import { setBoundaryStore } from "@/data/city-boundary";
import { bootTimeoutMs, finishBoot, useBootDone, useSplashArtShown } from "@/state/boot";
import { BootCover } from "@/features/onboarding";
import { VisaAwardHost } from "@/features/passport";
import { VisaProvider } from "@/state/visas-context";
import { warmDeviceLocation } from "@/utils/device-location";
import AsyncStorage from "@react-native-async-storage/async-storage";

// The native splash only knows the system theme; keep it up until the saved theme is read.
void SplashScreen.preventAutoHideAsync().catch(() => undefined);

// Photo lookups take several Wikipedia requests each; keep the answers across launches. The key's version changes
// when the lookup improves, so places remembered as having no photo are searched again.
void AsyncStorage.removeItem("place-photo-lookups").catch(() => undefined);
setPhotoStore({
  load: () => AsyncStorage.getItem("place-photo-lookups-v2"),
  save: (value) => AsyncStorage.setItem("place-photo-lookups-v2", value),
});
// City outlines and finished place lists, so a city opened before shows its places at once on the next launch.
setBoundaryStore({
  load: () => AsyncStorage.getItem("city-boundaries-v1"),
  save: (value) => AsyncStorage.setItem("city-boundaries-v1", value),
});
// v2: lists now include squares, bridges, bays and more; lists saved before that are fetched afresh.
void AsyncStorage.removeItem("nearby-places-v1").catch(() => undefined);
setNearbyPlacesStore({
  load: () => AsyncStorage.getItem("nearby-places-v2"),
  save: (value) => AsyncStorage.setItem("nearby-places-v2", value),
});
// Lists other travellers already loaded, so a city's places come from one request to our database. Anyone can read
// them; a signed-in device shares the lists it finishes (the database checks every place before keeping it).
const sharedDb = supabase;
setSharedPlaceLists(sharedDb && {
  get: async (key) => {
    const { data, error } = await sharedDb.from("place_lists").select("places, updated_at").eq("key", key).maybeSingle();
    if (error) throw error;
    return data ? { places: data.places, savedAt: Date.parse(data.updated_at) } : null;
  },
  put: async (key, places) => {
    if (!(await sharedDb.auth.getSession()).data.session) return;
    const { error } = await sharedDb.rpc("save_place_list", { list_key: key, list: places });
    if (error) throw error;
  },
});

const tabByPath: Record<string, string> = {
  "/home": "home",
  "/country": "home",
  "/city": "home",
  "/place": "home",
  "/explore": "home",
  "/map": "map",
  "/saved": "saved",
  "/profile": "profile",
  "/membership": "profile",
  "/passport": "profile",
  "/support": "profile",
  "/referral": "profile",
};

function AppNavigator() {
  const pathname = usePathname();
  const { day: dayParam } = useGlobalSearchParams<{ day?: string }>();
  const activeTab = tabByPath[pathname];
  const itineraryTab = pathname === "/itinerary" ? "overview" : pathname === "/itinerary-places" ? "places" : pathname === "/budget" ? "budget" : null;
  const isSplash = pathname === "/" || pathname === "/splash";
  const { user, ready, signOut } = useAuth();
  const palette = usePalette();
  const { scheme } = useThemePreference();
  const { cloudReady, loadError, retryLoad, trip, offlineSince, profile: { username: profileUsername } } = useTravel();
  const bootDone = useBootDone();
  // The native splash stays until the saved session is read (before then the tree is drawn for no one and is drawn
  // again for the account) and, on the splash route, until its logo and name are drawn, so the hand-over shows the
  // same picture instead of a screen that is blank for a moment.
  const artShown = useSplashArtShown();
  const nativeSplashDone = ready && (artShown || !isSplash);
  useEffect(() => {
    if (nativeSplashDone) { SplashScreen.hide(); return; }
    const timer = setTimeout(() => SplashScreen.hide(), 4000);
    return () => clearTimeout(timer);
  }, [nativeSplashDone]);
  const signedInId = user?.id;
  useEffect(() => {
    if (signedInId) warmDeviceLocation();
  }, [signedInId]);
  const warmingUp = !!user && !bootDone && !!activeTab;
  // The warm-up is only for a launch that lands on the tabs, and never holds the app for long.
  useEffect(() => {
    if (user && !isSplash && !activeTab) finishBoot();
  }, [user, isSplash, activeTab]);
  useEffect(() => {
    if (!warmingUp) return;
    const timer = setTimeout(finishBoot, bootTimeoutMs);
    return () => clearTimeout(timer);
  }, [warmingUp]);
  const itineraryDay = trip ? Math.min(Math.max(1, Math.trunc(Number(dayParam)) || 1), tripDays(trip.start, trip.end)) : 1;
  if (!ready && !isSplash) {
    return <View style={{ flex: 1, justifyContent: "center" }}><ActivityIndicator color={palette.blue} /></View>;
  }
  return (
    <>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <DeviceSync />
      <View
        style={{
          flex: 1,
          backgroundColor: palette.backdrop,
          alignItems: "center",
        }}
      >
        <View
          style={{
            flex: 1,
            width: "100%",
            backgroundColor: palette.canvas,
          }}
        >
          {!!user && loadError ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <View style={{ padding: 28, width: "100%", gap: 16 }}>
                <Copy style={{ textAlign: "center" }}>{loadError}</Copy>
                <Copy muted style={{ textAlign: "center", fontSize: 13 }}>With Premium, your trips, budget and saved places open even without a connection.</Copy>
                <Button onPress={retryLoad}>Try again</Button>
                <Button secondary onPress={() => void signOut()}>Sign out</Button>
              </View>
            </View>
          ) : !!user && !cloudReady && !isSplash ? (
            <View style={{ flex: 1, justifyContent: "center" }}>
              <ActivityIndicator color={palette.blue} accessibilityLabel="Loading account" />
            </View>
          ) : <><Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: palette.canvas },
              animation: "slide_from_right",
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="splash" />
            <Stack.Screen name="auth" />
            <Stack.Screen name="legal" />
            <Stack.Screen name="legal-document" />
            <Stack.Protected guard={!user}>
              <Stack.Screen name="welcome" />
            </Stack.Protected>
            <Stack.Protected guard={!!user}>
              {/* No fade: the launch cover is already over the tabs, and a fading splash showed through it squeezed above the bar. */}
              <Stack.Screen name="(tabs)" options={{ animation: "none" }} />
              <Stack.Screen name="(itinerary)" />
              <Stack.Screen name="country" />
              <Stack.Screen name="city" />
              <Stack.Screen name="place" />
              <Stack.Screen name="trip" />
              <Stack.Screen name="explore" />
              <Stack.Screen name="planner" />
              <Stack.Screen name="journal-trip" />
              <Stack.Screen name="membership" />
              <Stack.Screen name="passport" />
              <Stack.Screen name="preferences" />
              <Stack.Screen name="support" />
              <Stack.Screen name="referral" />
            </Stack.Protected>
          </Stack>
          {!!user && !!offlineSince && <OfflineBanner since={offlineSince} onRetry={retryLoad} />}
          {/* Kept in the layout but invisible under the launch cover: its native glass draws above the cover otherwise. */}
          {!!user && activeTab && <SafeAreaView edges={["bottom"]} style={{ backgroundColor: palette.canvas, opacity: warmingUp ? 0 : 1 }}><BottomNav active={activeTab} /></SafeAreaView>}
          {!!user && !!trip && itineraryTab && <SafeAreaView edges={["bottom"]} style={{ backgroundColor: palette.canvas }}><ItineraryNav active={itineraryTab} day={itineraryDay} /></SafeAreaView>}
          <BootCover visible={warmingUp} />
          <VisaAwardHost ready={!!user && cloudReady && bootDone && !!activeTab && !!profileUsername} />
          {!isSplash && <UsernameGate />}
          {!isSplash && <ReferralAutoRedeem />}
          </>}
        </View>
      </View>
    </>
  );
}

function AppContent() {
  const { user } = useAuth();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <TravelProvider key={user?.id ?? "anonymous"}>
        <VisaProvider>
          <AppNavigator />
        </VisaProvider>
      </TravelProvider>
    </GestureHandlerRootView>
  );
}

function NavigationTheme({ children }: { children: ReactNode }) {
  const palette = usePalette();
  const { scheme, ready } = useThemePreference();
  // The native splash is hidden by AppNavigator once the session is read as well.
  if (!ready) return null;
  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
  return (
    <ThemeProvider
      value={{
        ...base,
        colors: {
          ...base.colors,
          background: palette.canvas,
          card: palette.white,
          border: palette.line,
          text: palette.ink,
          primary: palette.blue,
        },
      }}
    >
      {children}
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppThemeProvider>
        <NavigationTheme>
          <AuthProvider>
            <AppContent />
          </AuthProvider>
        </NavigationTheme>
      </AppThemeProvider>
    </SafeAreaProvider>
  );
}
