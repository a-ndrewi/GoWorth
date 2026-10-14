import WebView from "react-native-webview";
import type { MapPin } from "@/data/map";
import { mapHtml } from "@/components/goworth/map-html";
import { useAppLanguage } from "@/data/formatting";

export function MapSurface({ pins, selected, onSelect }: { pins: MapPin[]; selected?: MapPin; onSelect?: (pin: MapPin) => void }) {
  const language = useAppLanguage();
  return <WebView originWhitelist={["*"]} source={{ html: mapHtml(pins, selected, language) }} javaScriptEnabled scrollEnabled={false} bounces={false} allowsInlineMediaPlayback onMessage={(event) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      if (message.type === "pin") {
        const pin = pins.find((item) => item.id === message.id);
        if (pin) onSelect?.(pin);
      }
    } catch { /* Ignore messages not sent by the map. */ }
  }} />;
}
