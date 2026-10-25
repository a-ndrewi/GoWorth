import { BlurMask, Canvas, Circle, Group, Oval, Path, RadialGradient, Skia, vec } from "@shopify/react-native-skia";
import { useDerivedValue, type SharedValue } from "react-native-reanimated";
import { BORDERS, GRID, LAND, addLine, addRing, globeView, projectPoint } from "@/components/goworth/globe-math";

export type GlobeSurfaceProps = {
  width: number; height: number; radius: number;
  lam: SharedValue<number>; phi: SharedValue<number>; zoom: SharedValue<number>;
  /** Flat [lon, lat, lon, lat, …] list of places to mark. */
  dots: number[];
};

/**
 * The globe's surface drawn with Skia on the UI thread: paths are built natively every frame, so turning and
 * zooming never cross the bridge. A flat, slightly cartoon look in the app's blues: bright ocean, warm white land
 * with a navy coastline, a soft shine and a white rim.
 */
export default function GlobeSurface({ width, height, radius, lam, phi, zoom, dots }: GlobeSurfaceProps) {
  const cx = width / 2, cy = height / 2;
  const r = useDerivedValue(() => radius * zoom.value);
  const view = useDerivedValue(() => globeView(lam.value, phi.value, radius * zoom.value, cx, cy));
  // Paths are returned from plain derived values rather than Skia's usePathValue: that hook writes a shared value
  // it also captures, so Reanimated re-runs it every frame forever and the globe redraws even while it sits still.
  const grid = useDerivedValue(() => {
    const path = Skia.PathBuilder.Make();
    for (const shape of GRID) addLine(path, shape, view.value);
    return path.build();
  });
  const land = useDerivedValue(() => {
    const path = Skia.PathBuilder.Make();
    for (const shape of LAND) addRing(path, shape, view.value);
    return path.build();
  });
  const borders = useDerivedValue(() => {
    const path = Skia.PathBuilder.Make();
    for (const shape of BORDERS) addLine(path, shape, view.value);
    return path.build();
  });
  const marks = useDerivedValue(() => {
    const path = Skia.PathBuilder.Make();
    for (let i = 0; i < dots.length; i += 2) {
      const point = projectPoint(dots[i], dots[i + 1], lam.value, phi.value, r.value);
      if (point.facing > 0.05) path.addCircle(cx + point.x, cy + point.y, 4.5);
    }
    return path.build();
  });
  const halo = useDerivedValue(() => r.value + 9);
  const shadowRect = useDerivedValue(() => ({ x: cx - r.value * 0.78, y: cy + r.value * 0.86, width: r.value * 1.56, height: r.value * 0.24 }));
  const shadowOpacity = useDerivedValue(() => Math.max(0, 1.6 - zoom.value) * 0.5);
  const light = useDerivedValue(() => vec(cx - r.value * 0.38, cy - r.value * 0.42));
  const lightRadius = useDerivedValue(() => r.value * 1.45);
  const shine = useDerivedValue(() => vec(cx - r.value * 0.45, cy - r.value * 0.5));
  const shineRadius = useDerivedValue(() => r.value * 0.7);
  return <Canvas style={{ width, height }} pointerEvents="none">
    <Oval rect={shadowRect} color="#1C3F94" opacity={shadowOpacity}><BlurMask blur={14} style="normal" /></Oval>
    <Circle cx={cx} cy={cy} r={halo} color="rgba(36,87,230,0.12)" />
    <Circle cx={cx} cy={cy} r={r}>
      <RadialGradient c={light} r={lightRadius} colors={["#7FA8FF", "#3E73F0", "#2457E6", "#1C45C4"]} positions={[0, 0.45, 0.75, 1]} />
    </Circle>
    <Path path={grid} style="stroke" strokeWidth={1} color="rgba(255,255,255,0.22)" />
    <Path path={land} color="#FFFBF0" />
    <Path path={borders} style="stroke" strokeWidth={1} strokeJoin="round" strokeCap="round" color="#B9C7E6" />
    <Path path={land} style="stroke" strokeWidth={1.6} strokeJoin="round" color="#1E3A8A" />
    <Group blendMode="softLight">
      <Circle cx={cx} cy={cy} r={r}>
        <RadialGradient c={light} r={lightRadius} colors={["rgba(255,255,255,0.35)", "rgba(255,255,255,0)", "rgba(10,25,80,0.45)"]} positions={[0, 0.55, 1]} />
      </Circle>
    </Group>
    <Circle cx={cx} cy={cy} r={r}>
      <RadialGradient c={shine} r={shineRadius} colors={["rgba(255,255,255,0.28)", "rgba(255,255,255,0)"]} />
    </Circle>
    <Circle cx={cx} cy={cy} r={r} style="stroke" strokeWidth={3.5} color="#FFFFFF" />
    <Path path={marks} color="#E85D75" />
    <Path path={marks} style="stroke" strokeWidth={2} color="#FFFFFF" />
  </Canvas>;
}
