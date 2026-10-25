import { useEffect, useMemo, useRef } from "react";
import { tripMapHtml, type TripMapData } from "@/components/goworth/trip-map-html";
import { useAppLanguage } from "@/data/formatting";

export function TripMap({ data, onSelect }: { data: TripMapData; onSelect: (id: string) => void }) {
  const language = useAppLanguage();
  const frame = useRef<HTMLIFrameElement>(null);
  // A data: URL gives the map its own document origin, isolated from the app page.
  const src = useMemo(() => `data:text/html;charset=utf-8,${encodeURIComponent(tripMapHtml(language))}`, [language]);
  const message = JSON.stringify({ type: "update", data });
  useEffect(() => { frame.current?.contentWindow?.postMessage(message, "*"); }, [message]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      try {
        const parsed = JSON.parse(event.data);
        if (parsed.type === "select") onSelect(String(parsed.id ?? ""));
      } catch { /* Ignore messages not sent by the map. */ }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [onSelect]);
  return <iframe ref={frame} title={language === "ro" ? "Harta zilei" : "Map of the day"} src={src}
    onLoad={() => frame.current?.contentWindow?.postMessage(message, "*")} style={{ width: "100%", height: "100%", border: 0 }} />;
}
