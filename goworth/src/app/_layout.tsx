import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useGlobalSearchParams, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, type ReactNode } from "react";
import { ActivityIndicator, Platform, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { TravelProvider, useTravel } from "@/state/travel-context";
import { AuthProvider, useAuth } from "@/state/auth-context";
import { ThemeProvider as AppThemeProvider, usePalette, useThemePreference } from "@/state/theme-context";
import { tripDays } from "@/data/travel";
import { BottomNav, Button, Copy } from "@/components/goworth/ui";
import { ItineraryNav } from "@/components/goworth/itinerary-nav";
// Also defines the background task that wakes the app for nearby places, which must exist before the app renders.
import { DeviceSync } from "@/state/device-sync";
import { setPhotoStore } from "@/data/place-photo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import "@/global.css";

// The native splash only knows the system theme; keep it up until the saved theme is read.
void SplashScreen.preventAutoHideAsync().catch(() => undefined);

// Photo lookups take several Wikipedia requests each; keep the answers across launches. The key's version changes
// when the lookup improves, so places remembered as having no photo are searched again.
void AsyncStorage.removeItem("place-photo-lookups").catch(() => undefined);
setPhotoStore({
  load: () => AsyncStorage.getItem("place-photo-lookups-v2"),
  save: (value) => AsyncStorage.setItem("place-photo-lookups-v2", value),
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
  "/support": "profile",
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
  const { cloudReady, loadError, retryLoad, trip } = useTravel();
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
            maxWidth: Platform.OS === "web" ? 960 : undefined,
            backgroundColor: palette.canvas,
          }}
        >
          {!!user && loadError ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <View style={{ padding: 28, width: "100%", gap: 16 }}>
                <Copy style={{ textAlign: "center" }}>{loadError}</Copy>
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
              <Stack.Screen name="(tabs)" options={{ animation: "fade" }} />
              <Stack.Screen name="(itinerary)" />
              <Stack.Screen name="country" />
              <Stack.Screen name="city" />
              <Stack.Screen name="place" />
              <Stack.Screen name="trip" />
              <Stack.Screen name="explore" />
              <Stack.Screen name="planner" />
              <Stack.Screen name="journal-trip" />
              <Stack.Screen name="membership" />
              <Stack.Screen name="preferences" />
              <Stack.Screen name="support" />
            </Stack.Protected>
          </Stack>
          {!!user && activeTab && <SafeAreaView edges={["bottom"]} style={{ backgroundColor: palette.canvas }}><BottomNav active={activeTab} /></SafeAreaView>}
          {!!user && !!trip && itineraryTab && <SafeAreaView edges={["bottom"]} style={{ backgroundColor: palette.canvas }}><ItineraryNav active={itineraryTab} day={itineraryDay} /></SafeAreaView>}
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
        <AppNavigator />
      </TravelProvider>
    </GestureHandlerRootView>
  );
}

function NavigationTheme({ children }: { children: ReactNode }) {
  const palette = usePalette();
  const { scheme, ready } = useThemePreference();
  useEffect(() => {
    if (ready) SplashScreen.hide();
  }, [ready]);
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
