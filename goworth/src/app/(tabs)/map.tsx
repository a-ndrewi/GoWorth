import { useLocalSearchParams } from "expo-router";
import { MapScreen } from "@/features/map";

export default function MapTab() {
  const params = useLocalSearchParams();
  // The tab stays mounted; a new focus request (place, search or coordinates) starts a fresh map state.
  return <MapScreen key={JSON.stringify(params)} />;
}
