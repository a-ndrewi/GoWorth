import { useEffect, useMemo, useRef } from "react";
import type { MapPin } from "@/data/map";
import { mapHtml } from "@/components/goworth/map-html";
import { useAppLanguage } from "@/data/formatting";

export function MapSurface({ pins, selected, focus, onSelect }: { pins: MapPin[]; selected?: MapPin; focus?: "us"; onSelect?: (pin: MapPin) => void }) {
  const language = useAppLanguage();
  const frame = useRef<HTMLIFrameElement>(null);
  const html = useMemo(() => mapHtml(pins, selected, language, focus), [pins, selected, language, focus]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      try {
        const message = JSON.parse(event.data);
        if (message.type === "pin") {
          const pin = pins.find((item) => item.id === message.id);
          if (pin) onSelect?.(pin);
        }
      } catch { /* Ignore messages not sent by the map. */ }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [pins, onSelect]);
  return <iframe ref={frame} title={language === "ro" ? "Hartă interactivă a lumii" : "Interactive world map"} srcDoc={html} style={{ width: "100%", height: "100%", border: 0 }} />;
}
