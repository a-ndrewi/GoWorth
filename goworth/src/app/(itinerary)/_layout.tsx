import { Tabs } from "expo-router";

// Overview, places and budget of the active trip switch in place instead of stacking new screens.
export default function ItineraryTabsLayout() {
  return (
    <Tabs tabBar={() => null} screenOptions={{ headerShown: false, freezeOnBlur: true }}>
      <Tabs.Screen name="itinerary" />
      <Tabs.Screen name="itinerary-places" />
      <Tabs.Screen name="budget" />
    </Tabs>
  );
}
