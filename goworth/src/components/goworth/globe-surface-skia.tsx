import { useMemo } from "react";
import { PixelRatio, Platform } from "react-native";
import { Canvas, Circle, Group, Path, Picture, PaintStyle, RadialGradient, Skia, matchFont, vec, type SkCanvas } from "@shopify/react-native-skia";
import { Extrapolation, interpolate, useDerivedValue, type SharedValue } from "react-native-reanimated";
import {
  BORDERS, BORDERS_LIGHT, BUBBLE, DETAIL_RADIUS, GRID, LAND, LAND_LIGHT, addLines, addRings, bubbleScale, globeView, projectPoint, revealFor,
} from "@/components/goworth/globe-math";

/** The country bubbles, as parallel lists by country. */
export type GlobeBubbles = {
  lons: number[]; lats: number[];
  /** The zoom at which each country appears. */
  minZooms: number[];
  dimmed: boolean[]; emphasized: boolean[];
  /** The device's country, or -1. */
  here: number;
  flags: string[]; names: string[];
  colors: { white: string; ring: string; here: string; ink: string; line: string };
};

export type GlobeSurfaceProps = {
  width: number; height: number; radius: number;
  lam: SharedValue<number>; phi: SharedValue<number>; zoom: SharedValue<number>;
  /** 1 once the globe has stopped moving, 0 while it turns or zooms. */
  settled: SharedValue<number>;
  /** Flat [lon, lat, lon, lat, …] list of places to mark. */
  dots: number[];
  bubbles?: GlobeBubbles;
  /** The bubble under the finger, which shrinks a little, or -1. */
  pressed?: SharedValue<number>;
};

const RADIUS = BUBBLE / 2;
const LABEL_TOP = RADIUS + 3;
const LABEL_HEIGHT = 18;
/** Each flag's square in the flag atlas, in points. */
const FLAG_CELL = 30;
const FLAG_COLUMNS = 16;

/**
 * Every flag drawn once into one image. A flag is two letters that only become a flag through text shaping, which
 * the plain text drawing used each frame does not do, so the paragraph engine draws them here and frames copy them.
 */
function flagAtlas(flags: string[]) {
  const scale = PixelRatio.get();
  const rows = Math.max(1, Math.ceil(flags.length / FLAG_COLUMNS));
  const surface = Skia.Surface.Make(FLAG_COLUMNS * FLAG_CELL * scale, rows * FLAG_CELL * scale);
  if (!surface) return null;
  const canvas = surface.getCanvas();
  canvas.scale(scale, scale);
  flags.forEach((flag, index) => {
    const paragraph = Skia.ParagraphBuilder.Make({ maxLines: 1, textStyle: { fontSize: 22, color: Skia.Color("#0F172A") } }).addText(flag).build();
    // Laid out wide and centred by hand, so a flag never wraps onto a second line.
    paragraph.layout(1000);
    paragraph.paint(canvas, (index % FLAG_COLUMNS) * FLAG_CELL + (FLAG_CELL - paragraph.getLongestLine()) / 2,
      Math.floor(index / FLAG_COLUMNS) * FLAG_CELL + (FLAG_CELL - paragraph.getHeight()) / 2);
  });
  surface.flush();
  return { image: surface.makeImageSnapshot(), scale };
}

/**
 * The globe's surface drawn with Skia on the UI thread: paths are built natively every frame, so turning and
 * zooming never cross the bridge. A flat, slightly cartoon look in the app's blues: bright ocean, warm white land
 * with a navy coastline, a soft shine and a white rim.
 */
export default function GlobeSurface({ width, height, radius, lam, phi, zoom, settled, dots, bubbles, pressed }: GlobeSurfaceProps) {
  const cx = width / 2, cy = height / 2;
  const r = useDerivedValue(() => radius * zoom.value);
  const view = useDerivedValue(() => globeView(lam.value, phi.value, radius * zoom.value, cx, cy));
  // Paths are returned from plain derived values rather than Skia's usePathValue: that hook writes a shared value
  // it also captures, so Reanimated re-runs it every frame forever and the globe redraws even while it sits still.
  const grid = useDerivedValue(() => {
    const path = Skia.PathBuilder.Make();
    addLines(path, GRID, view.value);
    return path.build();
  });
  // While the globe moves the lighter outlines are drawn, whatever the zoom; the full ones come in once it rests.
  const detailed = useDerivedValue(() => settled.value === 1 && view.value.r > DETAIL_RADIUS);
  const land = useDerivedValue(() => {
    const path = Skia.PathBuilder.Make();
    addRings(path, detailed.value ? LAND : LAND_LIGHT, view.value);
    return path.build();
  });
  const borders = useDerivedValue(() => {
    const path = Skia.PathBuilder.Make();
    addLines(path, detailed.value ? BORDERS : BORDERS_LIGHT, view.value);
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
  // The ground shadow is a radial fade squashed into an oval: a blur mask looked the same but cost a blur every frame.
  const shadowY = useDerivedValue(() => cy + r.value * 0.98);
  const shadowRadius = useDerivedValue(() => r.value * 0.86);
  const shadowCentre = useDerivedValue(() => vec(cx, shadowY.value));
  const shadowTransform = useDerivedValue(() => [{ translateY: shadowY.value }, { scaleY: 0.17 }, { translateY: -shadowY.value }]);
  const shadowOpacity = useDerivedValue(() => Math.max(0, 1.6 - zoom.value) * 0.5);
  const light = useDerivedValue(() => vec(cx - r.value * 0.38, cy - r.value * 0.42));
  const lightRadius = useDerivedValue(() => r.value * 1.45);
  const shine = useDerivedValue(() => vec(cx - r.value * 0.45, cy - r.value * 0.5));
  const shineRadius = useDerivedValue(() => r.value * 0.7);
  const labelFont = useMemo(() => matchFont({ fontFamily: Platform.select({ ios: "Helvetica Neue", default: "sans-serif" }), fontSize: 11, fontWeight: "bold" }), []);
  // Names are measured and flags drawn once here, so each frame only places them.
  const labelWidths = useMemo(() => bubbles?.names.map((name) => labelFont.measureText(name).width) ?? [], [bubbles, labelFont]);
  const flags = bubbles?.flags;
  const atlas = useMemo(() => flags ? flagAtlas(flags) : null, [flags]);
  const paint = useMemo(() => { const value = Skia.Paint(); value.setAntiAlias(true); return value; }, []);
  const colors = useMemo(() => {
    const c = bubbles?.colors;
    return c ? { white: Skia.Color(c.white), ring: Skia.Color(c.ring), here: Skia.Color(c.here), ink: Skia.Color(c.ink), line: Skia.Color(c.line), shadow: Skia.Color("#1E3A8A") } : null;
  }, [bubbles]);
  const pressedIndex = useDerivedValue(() => pressed?.value ?? -1);
  // Every bubble is drawn into one picture each frame: a few hundred circles and glyphs cost far less than moving a
  // view per country, and nothing has to mount when the globe appears.
  const bubblePicture = useDerivedValue(() => {
    const recorder = Skia.PictureRecorder();
    const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, width, height));
    if (bubbles && colors) {
      const z = zoom.value, r = radius * z, l = lam.value, f = phi.value, down = pressedIndex.value;
      const draw = (c: SkCanvas, i: number) => {
        const view = projectPoint(bubbles.lons[i], bubbles.lats[i], l, f, r);
        const reveal = revealFor(z, bubbles.minZooms[i]);
        if (view.facing < -0.02 || reveal <= 0) return;
        const dimmed = bubbles.dimmed[i], emphasized = bubbles.emphasized[i], here = bubbles.here === i;
        const opacity = interpolate(view.facing, [-0.02, 0.16], [0, dimmed ? 0.32 : 1], Extrapolation.CLAMP) * reveal;
        if (opacity < 0.01) return;
        const scale = bubbleScale(view.facing, z, dimmed) * (0.55 + 0.45 * reveal) * (down === i ? 0.84 : 1);
        c.save();
        c.translate(cx + view.x, cy + view.y);
        c.scale(scale, scale);
        paint.setStyle(PaintStyle.Fill);
        paint.setColor(colors.shadow); paint.setAlphaf(0.3 * opacity);
        c.drawCircle(0, 3, RADIUS, paint);
        paint.setColor(colors.white); paint.setAlphaf(opacity);
        c.drawCircle(0, 0, RADIUS, paint);
        if (emphasized || here) {
          paint.setStyle(PaintStyle.Stroke); paint.setStrokeWidth(3);
          paint.setColor(here ? colors.here : colors.ring); paint.setAlphaf(opacity);
          c.drawCircle(0, 0, RADIUS - 1.5, paint);
          paint.setStyle(PaintStyle.Fill);
        }
        if (atlas) {
          const cell = FLAG_CELL * atlas.scale;
          paint.setColor(colors.white); paint.setAlphaf(opacity);
          c.drawImageRect(atlas.image, Skia.XYWHRect((i % FLAG_COLUMNS) * cell, Math.floor(i / FLAG_COLUMNS) * cell, cell, cell),
            Skia.XYWHRect(-FLAG_CELL / 2, -FLAG_CELL / 2, FLAG_CELL, FLAG_CELL), paint);
        }
        if (here) {
          paint.setColor(colors.here); paint.setAlphaf(opacity);
          c.drawCircle(RADIUS - 6, -RADIUS + 6, 9, paint);
          paint.setColor(colors.white);
          c.drawCircle(RADIUS - 6, -RADIUS + 6, 3, paint);
        }
        // Names fade in a little after their country appears; dimmed countries never show one.
        const label = emphasized || here ? 1 : dimmed ? 0
          : interpolate(z, [bubbles.minZooms[i] + 1.3, bubbles.minZooms[i] + 1.9], [0, 1], Extrapolation.CLAMP);
        if (label > 0) {
          const w = labelWidths[i] + 14;
          const pill = Skia.RRectXY(Skia.XYWHRect(-w / 2, LABEL_TOP, w, LABEL_HEIGHT), 8, 8);
          paint.setColor(colors.white); paint.setAlphaf(opacity * label);
          c.drawRRect(pill, paint);
          paint.setStyle(PaintStyle.Stroke); paint.setStrokeWidth(1);
          paint.setColor(colors.line); paint.setAlphaf(opacity * label);
          c.drawRRect(pill, paint);
          paint.setStyle(PaintStyle.Fill);
          paint.setColor(colors.ink); paint.setAlphaf(opacity * label);
          c.drawText(bubbles.names[i], -labelWidths[i] / 2, LABEL_TOP + 13, paint, labelFont);
        }
        c.restore();
      };
      // Highlighted countries and the device's country are drawn last, so they sit above their neighbours.
      const count = bubbles.lons.length;
      for (let i = 0; i < count; i++) if (!bubbles.emphasized[i] && bubbles.here !== i) draw(canvas, i);
      for (let i = 0; i < count; i++) if (bubbles.emphasized[i] && bubbles.here !== i) draw(canvas, i);
      if (bubbles.here >= 0) draw(canvas, bubbles.here);
    }
    return recorder.finishRecordingAsPicture();
  });
  return <Canvas style={{ width, height }} pointerEvents="none">
    <Group transform={shadowTransform} opacity={shadowOpacity}>
      <Circle cx={cx} cy={shadowY} r={shadowRadius}>
        <RadialGradient c={shadowCentre} r={shadowRadius} colors={["#1C3F94", "rgba(28,63,148,0.6)", "rgba(28,63,148,0)"]} positions={[0, 0.55, 1]} />
      </Circle>
    </Group>
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
    <Picture picture={bubblePicture} />
  </Canvas>;
}
