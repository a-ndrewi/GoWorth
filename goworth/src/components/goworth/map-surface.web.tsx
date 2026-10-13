import { useEffect, useRef } from "react";
import type { MapPin } from "@/data/map";
import { mapHtml } from "@/components/goworth/map-html";

export function MapSurface({ pins, selected, onSelect }: { pins: MapPin[]; selected?: MapPin; onSelect?: (pin: MapPin) => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
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
  return <iframe ref={frame} title="Interactive world map" srcDoc={mapHtml(pins, selected)} style={{ width: "100%", height: "100%", border: 0 }} />;
}
