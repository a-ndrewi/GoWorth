import { useEffect, useMemo, useRef, type ComponentType, type Ref } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import WebView from "react-native-webview";
import { tripMapHtml, type TripMapData } from "@/components/goworth/trip-map-html";
import { useAppLanguage } from "@/data/formatting";

type MapHandle = { injectJavaScript: (script: string) => void };
// react-native-webview 14 intersects its per-platform prop types into `never` under React Native 0.88's
// strict types, so the props this map uses are declared here.
const MapWebView = WebView as unknown as ComponentType<{
  ref?: Ref<MapHandle>; style?: StyleProp<ViewStyle>; originWhitelist: string[]; source: { html: string };
  javaScriptEnabled?: boolean; scrollEnabled?: boolean; bounces?: boolean; onLoadEnd?: () => void;
  onMessage?: (event: { nativeEvent: { data: string } }) => void;
}>;

export function TripMap({ data, onSelect }: { data: TripMapData; onSelect: (id: string) => void }) {
  const language = useAppLanguage();
  const view = useRef<MapHandle>(null);
  const loaded = useRef(false);
  // The page is built once; pins and selection are pushed in afterwards so the map never reloads.
  const source = useMemo(() => ({ html: tripMapHtml(language) }), [language]);
  const script = `window.goworthUpdate&&window.goworthUpdate(${JSON.stringify(data).replace(/</g, "\\u003c")});true;`;
  useEffect(() => { if (loaded.current) view.current?.injectJavaScript(script); }, [script]);
  return <MapWebView ref={view} style={{ flex: 1, backgroundColor: "#F3F6FB" }} originWhitelist={["*"]} source={source}
    javaScriptEnabled scrollEnabled={false} bounces={false}
    onLoadEnd={() => { loaded.current = true; view.current?.injectJavaScript(script); }}
    onMessage={(event) => {
      try {
        const message = JSON.parse(event.nativeEvent.data);
        if (message.type === "select") onSelect(String(message.id ?? ""));
      } catch { /* Ignore messages not sent by the map. */ }
    }} />;
}
