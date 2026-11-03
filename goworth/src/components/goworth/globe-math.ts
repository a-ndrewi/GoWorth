import type { SkPathBuilder } from "@shopify/react-native-skia";
import { borderLines, landRings } from "@/data/world-land";
import { Extrapolation, interpolate } from "react-native-reanimated";

const DEG = Math.PI / 180;
/** A country bubble's diameter at full size, in points. */
export const BUBBLE = 42;

/**
 * Rings or lines as unit vectors on the sphere (x = cos lat cos lon, y = cos lat sin lon, z = sin lat), each with a
 * bounding cap (centre direction and how far it reaches) so shapes entirely behind the globe are skipped at once.
 * Everything is packed into typed arrays: worklets copy what they capture to the UI thread, and a few flat buffers
 * cross in one go where thousands of small arrays took hundreds of milliseconds every time the globe mounted.
 * Point k is `xyz[3k..3k+2]`; shape s holds points `start[s]` to `start[s + 1] - 1`; its cap is `cap[5s..5s+4]`:
 * the centre, the facing below which all of it is behind the globe, and the chord from the centre to its farthest point.
 */
export type GlobeShapes = { xyz: Float64Array; start: Int32Array; cap: Float64Array };

function prepare(lists: number[][]): GlobeShapes {
  const total = lists.reduce((sum, list) => sum + list.length / 2, 0);
  const xyz = new Float64Array(total * 3);
  const start = new Int32Array(lists.length + 1);
  const cap = new Float64Array(lists.length * 5);
  let k = 0;
  lists.forEach((list, s) => {
    start[s] = k;
    let sx = 0, sy = 0, sz = 0;
    for (let i = 0; i < list.length; i += 2, k++) {
      const lon = list[i] * DEG, lat = list[i + 1] * DEG;
      const x = Math.cos(lat) * Math.cos(lon), y = Math.cos(lat) * Math.sin(lon), z = Math.sin(lat);
      xyz[k * 3] = x; xyz[k * 3 + 1] = y; xyz[k * 3 + 2] = z;
      sx += x; sy += y; sz += z;
    }
    const length = Math.sqrt(sx * sx + sy * sy + sz * sz) || 1;
    const cx = sx / length, cy = sy / length, cz = sz / length;
    let reach = 1;
    for (let p = start[s]; p < k; p++) reach = Math.min(reach, cx * xyz[p * 3] + cy * xyz[p * 3 + 1] + cz * xyz[p * 3 + 2]);
    // Hidden when the cap's nearest edge faces away: cos(90° + reach angle) = -sin(reach angle).
    cap.set([cx, cy, cz, -Math.sqrt(Math.max(0, 1 - reach * reach)) - (reach < 0 ? 2 : 0), Math.sqrt(2 - 2 * reach)], s * 5);
  });
  start[lists.length] = k;
  return { xyz, start, cap };
}

function graticule() {
  const lines: number[][] = [];
  for (let lon = -180; lon < 180; lon += 30) lines.push(Array.from({ length: 37 }, (_, step) => [lon, -90 + step * 5]).flat());
  for (let lat = -60; lat <= 60; lat += 30) lines.push(Array.from({ length: 73 }, (_, step) => [-180 + step * 5, lat]).flat());
  return lines;
}

/**
 * Drops points closer than `minDegrees` to the last one kept. At the starting zoom the full outlines put several
 * points into each pixel; the lighter copies keep the shapes and leave far fewer points to project every frame.
 */
function simplify(lists: number[][], minDegrees: number, ring: boolean) {
  return lists.map((list) => {
    const kept = [list[0], list[1]];
    for (let i = 2; i < list.length - 2; i += 2) {
      const lastLon = kept[kept.length - 2], lastLat = kept[kept.length - 1];
      const dLon = (list[i] - lastLon) * Math.cos(list[i + 1] * DEG), dLat = list[i + 1] - lastLat;
      if (dLon * dLon + dLat * dLat >= minDegrees * minDegrees) kept.push(list[i], list[i + 1]);
    }
    kept.push(list[list.length - 2], list[list.length - 1]);
    // Islands and short borders too small to thin out keep every point rather than vanish.
    return kept.length >= (ring ? 8 : 4) ? kept : list;
  });
}

export const LAND = prepare(landRings);
export const BORDERS = prepare(borderLines);
export const LAND_LIGHT = prepare(simplify(landRings, 0.6, true));
export const BORDERS_LIGHT = prepare(simplify(borderLines, 0.8, false));
export const GRID = prepare(graticule());
/** Above this on-screen radius (points) the full outlines are drawn; below it the lighter ones look the same. */
export const DETAIL_RADIUS = 360;

/** The camera: rotation (longitude `lam`, latitude `phi` in degrees), radius and centre on screen. */
export type GlobeView = { cosLam: number; sinLam: number; sinP0: number; cosP0: number; r: number; cx: number; cy: number };

export function globeView(lam: number, phi: number, r: number, cx: number, cy: number): GlobeView {
  "worklet";
  return { cosLam: Math.cos(lam * DEG), sinLam: Math.sin(lam * DEG), sinP0: Math.sin(phi * DEG), cosP0: Math.cos(phi * DEG), r, cx, cy };
}

/**
 * Whether a shape can be skipped: wholly behind the globe, or (zoomed in) wholly off screen. Its projection stays
 * within one chord of its centre's, so a shape whose centre lies farther than that outside the frame never shows.
 */
function hidden(shapes: GlobeShapes, s: number, view: GlobeView) {
  "worklet";
  const { cap } = shapes;
  const c = s * 5;
  if (view.cosP0 * (cap[c] * view.cosLam + cap[c + 1] * view.sinLam) + view.sinP0 * cap[c + 2] < cap[c + 3]) return true;
  const reach = view.r * cap[c + 4];
  const x = view.r * (cap[c + 1] * view.cosLam - cap[c] * view.sinLam);
  const y = -view.r * (view.cosP0 * cap[c + 2] - view.sinP0 * (cap[c] * view.cosLam + cap[c + 1] * view.sinLam));
  return Math.abs(x) - reach > view.cx || Math.abs(y) - reach > view.cy;
}

// Projection of point k: cl = cos(lat)·cos(lon − lam), sl = cos(lat)·sin(lon − lam).
function px(p: Float64Array, k: number, v: GlobeView) {
  "worklet";
  return v.r * (p[k * 3 + 1] * v.cosLam - p[k * 3] * v.sinLam);
}
function py(p: Float64Array, k: number, v: GlobeView) {
  "worklet";
  return -v.r * (v.cosP0 * p[k * 3 + 2] - v.sinP0 * (p[k * 3] * v.cosLam + p[k * 3 + 1] * v.sinLam));
}
function pz(p: Float64Array, k: number, v: GlobeView) {
  "worklet";
  return v.sinP0 * p[k * 3 + 2] + v.cosP0 * (p[k * 3] * v.cosLam + p[k * 3 + 1] * v.sinLam);
}

/** Where the edge i→j crosses the horizon, snapped onto the rim, as an angle around the globe. */
function rimAngle(p: Float64Array, i: number, j: number, v: GlobeView) {
  "worklet";
  const zi = pz(p, i, v), zj = pz(p, j, v);
  const t = zi / (zi - zj);
  const x = px(p, i, v) + (px(p, j, v) - px(p, i, v)) * t;
  const y = py(p, i, v) + (py(p, j, v) - py(p, i, v)) * t;
  return Math.atan2(y, x);
}

/** Adds filled rings clipped at the horizon; the hidden part of each follows the globe's edge as an arc. */
export function addRings(path: SkPathBuilder, shapes: GlobeShapes, v: GlobeView) {
  "worklet";
  const p = shapes.xyz;
  const oval = { x: v.cx - v.r, y: v.cy - v.r, width: v.r * 2, height: v.r * 2 };
  for (let s = 0; s < shapes.start.length - 1; s++) {
    if (hidden(shapes, s, v)) continue;
    const base = shapes.start[s], n = shapes.start[s + 1] - base;
    let first = -1;
    for (let i = 0; i < n && first < 0; i++) if (pz(p, base + i, v) >= 0) first = i;
    if (first < 0) continue;
    path.moveTo(v.cx + px(p, base + first, v), v.cy + py(p, base + first, v));
    let exit = 0;
    for (let step = 0; step < n; step++) {
      const i = base + (first + step) % n, j = base + (first + step + 1) % n;
      const vi = pz(p, i, v) >= 0, vj = pz(p, j, v) >= 0;
      if (vi && vj) {
        if (j !== base + first) path.lineTo(v.cx + px(p, j, v), v.cy + py(p, j, v));
      } else if (vi || vj) {
        const angle = rimAngle(p, i, j, v);
        if (vi) {
          path.lineTo(v.cx + Math.cos(angle) * v.r, v.cy + Math.sin(angle) * v.r);
          exit = angle;
        } else {
          let sweep = angle - exit;
          while (sweep > Math.PI) sweep -= 2 * Math.PI;
          while (sweep <= -Math.PI) sweep += 2 * Math.PI;
          path.arcToOval(oval, exit / DEG, sweep / DEG, false);
          if (j !== base + first) path.lineTo(v.cx + px(p, j, v), v.cy + py(p, j, v));
        }
      }
    }
    path.close();
  }
}

/** Adds open lines (borders or graticule), each cut where it passes behind the globe. */
export function addLines(path: SkPathBuilder, shapes: GlobeShapes, v: GlobeView) {
  "worklet";
  const p = shapes.xyz;
  for (let s = 0; s < shapes.start.length - 1; s++) {
    if (hidden(shapes, s, v)) continue;
    const base = shapes.start[s], end = shapes.start[s + 1];
    let drawing = false;
    for (let k = base; k < end; k++) {
      if (pz(p, k, v) < 0) {
        if (drawing) {
          const angle = rimAngle(p, k - 1, k, v);
          path.lineTo(v.cx + Math.cos(angle) * v.r, v.cy + Math.sin(angle) * v.r);
        }
        drawing = false;
        continue;
      }
      if (!drawing) {
        if (k > base) {
          const angle = rimAngle(p, k - 1, k, v);
          path.moveTo(v.cx + Math.cos(angle) * v.r, v.cy + Math.sin(angle) * v.r);
          path.lineTo(v.cx + px(p, k, v), v.cy + py(p, k, v));
        } else path.moveTo(v.cx + px(p, k, v), v.cy + py(p, k, v));
        drawing = true;
      } else path.lineTo(v.cx + px(p, k, v), v.cy + py(p, k, v));
    }
  }
}

/** Orthographic projection of one lon/lat: offset from the globe centre and how much it faces the viewer. */
export function projectPoint(lon: number, lat: number, lam: number, phi: number, radius: number) {
  "worklet";
  const l = (lon - lam) * DEG, a = lat * DEG, a0 = phi * DEG;
  const cosA = Math.cos(a);
  return {
    x: radius * cosA * Math.sin(l),
    y: -radius * (Math.cos(a0) * Math.sin(a) - Math.sin(a0) * cosA * Math.cos(l)),
    facing: Math.sin(a0) * Math.sin(a) + Math.cos(a0) * cosA * Math.cos(l),
  };
}

/** Bubbles grow toward the middle of the globe and shrink toward its edge, like the Explore comb. */
export function bubbleScale(facing: number, zoom: number, dimmed: boolean) {
  "worklet";
  const depth = interpolate(facing, [0, 0.3, 1], [0.22, 0.6, 1], Extrapolation.CLAMP);
  const focus = interpolate(facing, [0.92, 1], [1, interpolate(zoom, [1, 3], [1.22, 1.05], Extrapolation.CLAMP)], Extrapolation.CLAMP);
  // Bubbles peak at a medium zoom, then shrink again so country borders stay visible up close.
  const zoomScale = interpolate(zoom, [1, 2.2, 4, 6], [0.56, 0.86, 0.66, 0.58], Extrapolation.CLAMP);
  return depth * focus * zoomScale * (dimmed ? 0.72 : 1);
}

/** Smaller countries fade in as the globe is zoomed, so the overview is not crowded. */
export function revealFor(zoom: number, minZoom: number) {
  "worklet";
  return minZoom <= 1 ? 1 : interpolate(zoom, [minZoom - 0.4, minZoom], [0, 1], Extrapolation.CLAMP);
}
