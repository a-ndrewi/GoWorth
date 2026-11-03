import { Tabs } from "expo-router";

// The main sections stay mounted side by side so switching tabs is instant; the bar itself is the
// shared BottomNav rendered by the root layout.
export default function MainTabsLayout() {
  return (
    <Tabs tabBar={() => null} screenOptions={{ headerShown: false, freezeOnBlur: true }}>
      <Tabs.Screen name="home" />
      {/* Map mounts behind the launch cover, globe and bubbles included, and is never frozen: a frozen tab hides its
          views, and showing them again laid out the whole globe anew, so every visit stalled as if it were the first. */}
      <Tabs.Screen name="map" options={{ lazy: false, freezeOnBlur: false }} />
      {/* Saved mounts on first open: its thumbnails start photo lookups that would compete with Explore at launch. */}
      <Tabs.Screen name="saved" />
      {/* Profile is light, so it is mounted up front to make its first open instant; frozen screens would not mount early. */}
      <Tabs.Screen name="profile" options={{ lazy: false, freezeOnBlur: false }} />
    </Tabs>
  );
}
