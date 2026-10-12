import type { MapPin } from "@/data/map";
import { mapHtml } from "@/components/goworth/map-html";

export function MapSurface({ pins, selected }: { pins: MapPin[]; selected?: MapPin }) {
  return <iframe title="Interactive world map" srcDoc={mapHtml(pins, selected)} style={{ width: "100%", height: "100%", border: 0 }} />;
}
