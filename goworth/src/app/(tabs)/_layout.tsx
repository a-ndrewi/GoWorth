import { Tabs } from "expo-router";

// The main sections stay mounted side by side so switching tabs is instant; the bar itself is the
// shared BottomNav rendered by the root layout.
export default function MainTabsLayout() {
  return (
    <Tabs tabBar={() => null} screenOptions={{ headerShown: false, freezeOnBlur: true }}>
      <Tabs.Screen name="home" />
      <Tabs.Screen name="map" />
      {/* Saved mounts on first open: its thumbnails start photo lookups that would compete with Explore at launch. */}
      <Tabs.Screen name="saved" />
      {/* Profile is light, so it is mounted up front to make its first open instant; frozen screens would not mount early. */}
      <Tabs.Screen name="profile" options={{ lazy: false, freezeOnBlur: false }} />
    </Tabs>
  );
}
