import type { SkPathBuilder } from "@shopify/react-native-skia";
import { borderLines, landRings } from "@/data/world-land";

const DEG = Math.PI / 180;

/**
 * A ring or line as unit vectors on the sphere (a = cos lat cos lon, b = cos lat sin lon, c = sin lat), plus a
 * bounding cap (centre direction and how far it reaches) so shapes entirely behind the globe are skipped at once.
 * Precomputing the vectors leaves only multiplications for each frame.
 */
export type GlobeShape = { a: number[]; b: number[]; c: number[]; center: [number, number, number]; minFacing: number };

function prepare(lists: number[][]): GlobeShape[] {
  return lists.map((list) => {
    const a: number[] = [], b: number[] = [], c: number[] = [];
    let sx = 0, sy = 0, sz = 0;
    for (let i = 0; i < list.length; i += 2) {
      const lon = list[i] * DEG, lat = list[i + 1] * DEG;
      const x = Math.cos(lat) * Math.cos(lon), y = Math.cos(lat) * Math.sin(lon), z = Math.sin(lat);
      a.push(x); b.push(y); c.push(z);
      sx += x; sy += y; sz += z;
    }
    const length = Math.sqrt(sx * sx + sy * sy + sz * sz) || 1;
    const center: [number, number, number] = [sx / length, sy / length, sz / length];
    let reach = 1;
    for (let i = 0; i < a.length; i++) reach = Math.min(reach, center[0] * a[i] + center[1] * b[i] + center[2] * c[i]);
    // Hidden when the cap's nearest edge faces away: cos(90° + reach angle) = -sin(reach angle).
    return { a, b, c, center, minFacing: -Math.sqrt(Math.max(0, 1 - reach * reach)) - (reach < 0 ? 2 : 0) };
  });
}

function graticule() {
  const lines: number[][] = [];
  for (let lon = -180; lon < 180; lon += 30) lines.push(Array.from({ length: 37 }, (_, step) => [lon, -90 + step * 5]).flat());
  for (let lat = -60; lat <= 60; lat += 30) lines.push(Array.from({ length: 73 }, (_, step) => [-180 + step * 5, lat]).flat());
  return lines;
}

export const LAND = prepare(landRings);
export const BORDERS = prepare(borderLines);
export const GRID = prepare(graticule());

/** The camera: rotation (longitude `lam`, latitude `phi` in degrees), radius and centre on screen. */
export type GlobeView = { cosLam: number; sinLam: number; sinP0: number; cosP0: number; r: number; cx: number; cy: number };

export function globeView(lam: number, phi: number, r: number, cx: number, cy: number): GlobeView {
  "worklet";
  return { cosLam: Math.cos(lam * DEG), sinLam: Math.sin(lam * DEG), sinP0: Math.sin(phi * DEG), cosP0: Math.cos(phi * DEG), r, cx, cy };
}

function hidden(shape: GlobeShape, view: GlobeView) {
  "worklet";
  const [x, y, z] = shape.center;
  return view.cosP0 * (x * view.cosLam + y * view.sinLam) + view.sinP0 * z < shape.minFacing;
}

// Projection of point i: cl = cos(lat)·cos(lon − lam), sl = cos(lat)·sin(lon − lam).
function px(s: GlobeShape, i: number, v: GlobeView) {
  "worklet";
  return v.r * (s.b[i] * v.cosLam - s.a[i] * v.sinLam);
}
function py(s: GlobeShape, i: number, v: GlobeView) {
  "worklet";
  return -v.r * (v.cosP0 * s.c[i] - v.sinP0 * (s.a[i] * v.cosLam + s.b[i] * v.sinLam));
}
function pz(s: GlobeShape, i: number, v: GlobeView) {
  "worklet";
  return v.sinP0 * s.c[i] + v.cosP0 * (s.a[i] * v.cosLam + s.b[i] * v.sinLam);
}

/** Where the edge i→j crosses the horizon, snapped onto the rim, as an angle around the globe. */
function rimAngle(s: GlobeShape, i: number, j: number, v: GlobeView) {
  "worklet";
  const zi = pz(s, i, v), zj = pz(s, j, v);
  const t = zi / (zi - zj);
  const x = px(s, i, v) + (px(s, j, v) - px(s, i, v)) * t;
  const y = py(s, i, v) + (py(s, j, v) - py(s, i, v)) * t;
  return Math.atan2(y, x);
}

/** Adds a filled ring clipped at the horizon; the hidden part follows the globe's edge as an arc. */
export function addRing(path: SkPathBuilder, s: GlobeShape, v: GlobeView) {
  "worklet";
  if (hidden(s, v)) return;
  const n = s.a.length;
  let start = -1;
  for (let i = 0; i < n && start < 0; i++) if (pz(s, i, v) >= 0) start = i;
  if (start < 0) return;
  const oval = { x: v.cx - v.r, y: v.cy - v.r, width: v.r * 2, height: v.r * 2 };
  path.moveTo(v.cx + px(s, start, v), v.cy + py(s, start, v));
  let exit = 0;
  for (let k = 0; k < n; k++) {
    const i = (start + k) % n, j = (i + 1) % n;
    const vi = pz(s, i, v) >= 0, vj = pz(s, j, v) >= 0;
    if (vi && vj) {
      if (j !== start) path.lineTo(v.cx + px(s, j, v), v.cy + py(s, j, v));
    } else if (vi || vj) {
      const angle = rimAngle(s, i, j, v);
      if (vi) {
        path.lineTo(v.cx + Math.cos(angle) * v.r, v.cy + Math.sin(angle) * v.r);
        exit = angle;
      } else {
        let sweep = angle - exit;
        while (sweep > Math.PI) sweep -= 2 * Math.PI;
        while (sweep <= -Math.PI) sweep += 2 * Math.PI;
        path.arcToOval(oval, exit / DEG, sweep / DEG, false);
        if (j !== start) path.lineTo(v.cx + px(s, j, v), v.cy + py(s, j, v));
      }
    }
  }
  path.close();
}

/** Adds an open line (border or graticule) cut where it passes behind the globe. */
export function addLine(path: SkPathBuilder, s: GlobeShape, v: GlobeView) {
  "worklet";
  if (hidden(s, v)) return;
  const n = s.a.length;
  let drawing = false;
  for (let i = 0; i < n; i++) {
    if (pz(s, i, v) < 0) {
      if (drawing) {
        const angle = rimAngle(s, i - 1, i, v);
        path.lineTo(v.cx + Math.cos(angle) * v.r, v.cy + Math.sin(angle) * v.r);
      }
      drawing = false;
      continue;
    }
    if (!drawing) {
      if (i > 0) {
        const angle = rimAngle(s, i - 1, i, v);
        path.moveTo(v.cx + Math.cos(angle) * v.r, v.cy + Math.sin(angle) * v.r);
        path.lineTo(v.cx + px(s, i, v), v.cy + py(s, i, v));
      } else path.moveTo(v.cx + px(s, i, v), v.cy + py(s, i, v));
      drawing = true;
    } else path.lineTo(v.cx + px(s, i, v), v.cy + py(s, i, v));
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
