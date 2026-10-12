import WebView from "react-native-webview";
import type { MapPin } from "@/data/map";
import { mapHtml } from "@/components/goworth/map-html";

export function MapSurface({ pins, selected }: { pins: MapPin[]; selected?: MapPin }) {
  return <WebView originWhitelist={["*"]} source={{ html: mapHtml(pins, selected) }} javaScriptEnabled nestedScrollEnabled />;
}
