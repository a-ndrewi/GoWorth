import { WithSkiaWeb } from "@shopify/react-native-skia/lib/module/web";
import { View } from "react-native";
import type { GlobeSurfaceProps } from "@/components/goworth/globe-surface-skia";

// CanvasKit (Skia for the web) is downloaded on first use rather than shipped in the app bundle.
const canvasKit = { locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/canvaskit-wasm@0.41.0/bin/full/${file}` };

export function GlobeSurface(props: GlobeSurfaceProps) {
  const size = props.radius * 2;
  return <WithSkiaWeb opts={canvasKit} componentProps={props} getComponent={() => import("@/components/goworth/globe-surface-skia")}
    fallback={<View style={{ position: "absolute", left: props.width / 2 - props.radius, top: props.height / 2 - props.radius, width: size, height: size, borderRadius: props.radius, backgroundColor: "#2457E6" }} />} />;
}
export type { GlobeSurfaceProps };
