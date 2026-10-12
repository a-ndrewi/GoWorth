import { DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, Platform, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { TravelProvider, useTravel } from "@/state/travel-context";
import { AuthProvider, useAuth } from "@/state/auth-context";
import { palette } from "@/constants/design";
import { Button, Copy } from "@/components/goworth/ui";
import "@/global.css";

function AppNavigator() {
  const { user, ready, signOut } = useAuth();
  const { cloudReady, loadError, retryLoad } = useTravel();
  if (!ready) {
    return <View style={{ flex: 1, justifyContent: "center" }}><ActivityIndicator color={palette.blue} /></View>;
  }
  return (
    <>
      <StatusBar style="dark" />
      <View
        style={{
          flex: 1,
          backgroundColor: "#F0F3F6",
          alignItems: "center",
        }}
      >
        <View
          style={{
            flex: 1,
            width: "100%",
            maxWidth: Platform.OS === "web" ? 480 : undefined,
            backgroundColor: palette.white,
          }}
        >
          {!!user && !cloudReady ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              {loadError ? (
                <View style={{ padding: 28, width: "100%", gap: 16 }}>
                  <Copy style={{ textAlign: "center" }}>{loadError}</Copy>
                  <Button onPress={retryLoad}>Try again</Button>
                  <Button secondary onPress={() => void signOut()}>Sign out</Button>
                </View>
              ) : <ActivityIndicator color={palette.blue} accessibilityLabel="Loading account" />}
            </View>
          ) : <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: palette.white },
              animation: "slide_from_right",
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="splash" />
            <Stack.Screen name="auth" />
            <Stack.Protected guard={!user}>
              <Stack.Screen name="welcome" />
            </Stack.Protected>
            <Stack.Protected guard={!!user}>
              <Stack.Screen name="home" />
              <Stack.Screen name="trip" />
              <Stack.Screen name="explore" />
              <Stack.Screen name="planner" />
              <Stack.Screen name="itinerary" />
              <Stack.Screen name="budget" />
              <Stack.Screen name="saved" />
              <Stack.Screen name="memories" />
              <Stack.Screen name="profile" />
              <Stack.Screen name="preferences" />
            </Stack.Protected>
          </Stack>}
        </View>
      </View>
    </>
  );
}

function AppContent() {
  const { user } = useAuth();
  return (
    <TravelProvider key={user?.id ?? "anonymous"}>
      <AppNavigator />
    </TravelProvider>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider
        value={{
          ...DefaultTheme,
          colors: {
            ...DefaultTheme.colors,
            background: palette.white,
            primary: palette.blue,
          },
        }}
      >
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
