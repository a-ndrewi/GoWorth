import { useMemo } from "react";
import WebView from "react-native-webview";
import type { MapPin } from "@/data/map";
import { mapHtml } from "@/components/goworth/map-html";
import { useAppLanguage } from "@/data/formatting";

export function MapSurface({ pins, selected, focus, onSelect }: { pins: MapPin[]; selected?: MapPin; focus?: "us"; onSelect?: (pin: MapPin) => void }) {
  const language = useAppLanguage();
  const html = useMemo(() => mapHtml(pins, selected, language, focus), [pins, selected, language, focus]);
  const source = useMemo(() => ({ html }), [html]);
  return <WebView style={{ flex: 1, alignSelf: "stretch", backgroundColor: "#edf5f2" }} originWhitelist={["*"]} source={source} applicationNameForUserAgent="GoWorth/1.0.0" javaScriptEnabled scrollEnabled={false} bounces={false} allowsInlineMediaPlayback onMessage={(event) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      if (message.type === "pin") {
        const pin = pins.find((item) => item.id === message.id);
        if (pin) onSelect?.(pin);
      }
    } catch { /* Ignore messages not sent by the map. */ }
  }} />;
}
