import Svg, { Path } from "react-native-svg";

/** A GoWorth glyph on a 24px grid: soft tone fills, rounded strokes, solid details and knock-out strokes. */
type Glyph = { tone?: string[]; line?: string[]; solid?: string[]; knock?: string[] };

const circle = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0z`;

const ring = circle(12, 12, 9);
const heart = "M12 19.8s-7.6-4.5-7.6-10.1A4.3 4.3 0 0 1 12 7.1a4.3 4.3 0 0 1 7.6 2.6c0 5.6-7.6 10.1-7.6 10.1z";
const pin = "M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z";
const compassNeedle = "M15.6 8.4l-2.1 5.1-5.1 2.1 2.1-5.1z";
const mapOutline = "M3.5 6.5L9 4.5l6 2.5 5.5-2v12.5L15 19.5l-6-2.5-5.5 2z";
const eye = "M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z";

export const glyphs = {
  back: { line: ["M15 5l-7 7 7 7"] },
  right: { line: ["M9.5 5.5L16 12l-6.5 6.5"] },
  up: { tone: [ring], line: [ring, "M12 16.5v-9", "M8.3 11.2L12 7.5l3.7 3.7"] },
  home: {
    tone: ["M4.5 10.6L12 4.3l7.5 6.3V19a1.5 1.5 0 0 1-1.5 1.5h-3.5v-5.5h-5v5.5H6A1.5 1.5 0 0 1 4.5 19z"],
    line: ["M4.5 10.6L12 4.3l7.5 6.3V19a1.5 1.5 0 0 1-1.5 1.5h-3.5v-5.5h-5v5.5H6A1.5 1.5 0 0 1 4.5 19z"],
  },
  search: { tone: [circle(10.5, 10.5, 6.5)], line: [circle(10.5, 10.5, 6.5), "M15.6 15.6l4.4 4.4"] },
  heart: { tone: [heart], line: [heart] },
  heartFill: { solid: [heart], knock: ["M8.2 10.1a2 2 0 0 1 2-1.9"] },
  pin: { tone: [pin], line: [pin, circle(12, 10, 2.4)] },
  calendar: {
    tone: ["M3.5 7A1.5 1.5 0 0 1 5 5.5h14A1.5 1.5 0 0 1 20.5 7v3h-17z"],
    line: ["M5 5.5h14A1.5 1.5 0 0 1 20.5 7v11.5A1.5 1.5 0 0 1 19 20H5a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 5 5.5z", "M3.5 10h17", "M8 3.5v4", "M16 3.5v4"],
    solid: [circle(8.5, 14.2, 1.1), circle(12, 14.2, 1.1), circle(15.5, 14.2, 1.1)],
  },
  person: { tone: [ring], line: [ring, circle(12, 10, 3), "M6.6 18.2c1.3-2.1 3.2-3.2 5.4-3.2s4.1 1.1 5.4 3.2"] },
  people: {
    tone: [circle(9, 9, 3)],
    line: [circle(9, 9, 3), "M3.5 19c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8", circle(16.5, 8.5, 2.4), "M15.6 13.8c2.6-.2 4.5 1.3 4.9 4.2"],
  },
  settings: {
    tone: [circle(15, 7, 2.2), circle(9, 17, 2.2)],
    line: ["M4 7h8.8", "M17.2 7H20", "M4 17h2.8", "M11.2 17H20", circle(15, 7, 2.2), circle(9, 17, 2.2)],
  },
  plus: { tone: [ring], line: [ring, "M12 8v8", "M8 12h8"] },
  close: { tone: [ring], line: [ring, "M9.2 9.2l5.6 5.6", "M14.8 9.2l-5.6 5.6"] },
  trash: {
    tone: ["M6.5 7.5h11l-.8 11.2a1.5 1.5 0 0 1-1.5 1.3H8.8a1.5 1.5 0 0 1-1.5-1.3z"],
    line: ["M6.5 7.5h11l-.8 11.2a1.5 1.5 0 0 1-1.5 1.3H8.8a1.5 1.5 0 0 1-1.5-1.3z", "M4.5 7.5h15", "M9.5 7.5v-2a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2", "M10.5 11v5.5", "M13.5 11v5.5"],
  },
  tick: { line: ["M6 12.5l4 4 8-9"] },
  check: { tone: [ring], line: [ring, "M8 12.3l2.7 2.7L16 9.6"] },
  star: {
    tone: ["M12 3.8l2.5 5.1 5.6.8-4 3.9.9 5.6-5-2.6-5 2.6.9-5.6-4-3.9 5.6-.8z"],
    line: ["M12 3.8l2.5 5.1 5.6.8-4 3.9.9 5.6-5-2.6-5 2.6.9-5.6-4-3.9 5.6-.8z"],
  },
  sparkle: {
    tone: ["M10.5 4l1.8 4.9 4.9 1.8-4.9 1.8-1.8 4.9-1.8-4.9-4.9-1.8 4.9-1.8z"],
    line: ["M10.5 4l1.8 4.9 4.9 1.8-4.9 1.8-1.8 4.9-1.8-4.9-4.9-1.8 4.9-1.8z", "M18 15v5", "M15.5 17.5h5"],
  },
  compass: { tone: [ring, compassNeedle], line: [ring, compassNeedle] },
  compassFill: { solid: [circle(12, 12, 9.5)], knock: [compassNeedle] },
  bag: {
    tone: ["M6 8h12a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 18 19H6a1.5 1.5 0 0 1-1.5-1.5v-8A1.5 1.5 0 0 1 6 8z"],
    line: ["M6 8h12a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 18 19H6a1.5 1.5 0 0 1-1.5-1.5v-8A1.5 1.5 0 0 1 6 8z", "M9 8V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v2", "M9 11.5v4", "M15 11.5v4", "M8 19v1.5", "M16 19v1.5"],
  },
  trip: { tone: ["M20.5 3.5l-17 7 7 2.5 2.5 7z"], line: ["M20.5 3.5l-17 7 7 2.5 2.5 7z", "M20.5 3.5L10.5 13"] },
  plane: {
    solid: ["M21 15.3v-1.7l-7.4-4.6V4.4a1.6 1.6 0 0 0-3.2 0V9L3 13.6v1.7l7.4-2.3v4.8l-2 1.5v1.4l3.6-1 3.6 1v-1.4l-2-1.5V13z"],
  },
  bell: { tone: ["M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z"], line: ["M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z", "M10 20.5a2 2 0 0 0 4 0"] },
  camera: {
    tone: ["M4.5 8.5A1.5 1.5 0 0 1 6 7h2.2l1.4-2h4.8l1.4 2H18a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 18 19H6a1.5 1.5 0 0 1-1.5-1.5z"],
    line: ["M4.5 8.5A1.5 1.5 0 0 1 6 7h2.2l1.4-2h4.8l1.4 2H18a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 18 19H6a1.5 1.5 0 0 1-1.5-1.5z", circle(12, 13, 3.2)],
  },
  share: {
    tone: ["M6.5 10.5h11A1.5 1.5 0 0 1 19 12v6.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 18.5V12a1.5 1.5 0 0 1 1.5-1.5z"],
    line: ["M12 14.5V4", "M8.5 7.5L12 4l3.5 3.5", "M8 10.5H6.5A1.5 1.5 0 0 0 5 12v6.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V12a1.5 1.5 0 0 0-1.5-1.5H16"],
  },
  sun: {
    tone: [circle(12, 12, 4)],
    line: [circle(12, 12, 4), "M12 3v2", "M12 19v2", "M3 12h2", "M19 12h2", "M5.6 5.6L7 7", "M17 17l1.4 1.4", "M5.6 18.4L7 17", "M17 7l1.4-1.4"],
  },
  wallet: {
    tone: ["M4 8h15a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19H5.5A1.5 1.5 0 0 1 4 17.5z"],
    line: ["M4 8h15a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19H5.5A1.5 1.5 0 0 1 4 17.5z", "M4 8V6.5A1.5 1.5 0 0 1 5.5 5H16", "M16 12h4.5v3.5H16a1.75 1.75 0 0 1 0-3.5z"],
  },
  food: {
    tone: ["M16.5 3.5c-2 1-3.5 3.5-3.5 7v3h3.5z"],
    line: ["M7 3.5v17", "M4.5 3.5V8a2.5 2.5 0 0 0 5 0V3.5", "M16.5 20.5v-17c-2 1-3.5 3.5-3.5 7v3h3.5"],
  },
  bed: {
    tone: ["M11 9h6.5a3 3 0 0 1 3 3v2.5H11z"],
    line: ["M3.5 18.5V6", "M3.5 14.5h17v4", "M20.5 14.5V12a3 3 0 0 0-3-3H11v5.5", circle(7.3, 11.3, 1.8)],
  },
  bus: {
    tone: ["M6.5 4h11A1.5 1.5 0 0 1 19 5.5v6H5v-6A1.5 1.5 0 0 1 6.5 4z"],
    line: ["M6.5 4h11A1.5 1.5 0 0 1 19 5.5V17H5V5.5A1.5 1.5 0 0 1 6.5 4z", "M5 11.5h14", "M7.5 17v2.5", "M16.5 17v2.5"],
    solid: [circle(8.2, 14.3, 1), circle(15.8, 14.3, 1)],
  },
  shopping: {
    tone: ["M5.5 8h13l-1 11.5a1.5 1.5 0 0 1-1.5 1.5H8a1.5 1.5 0 0 1-1.5-1.5z"],
    line: ["M5.5 8h13l-1 11.5a1.5 1.5 0 0 1-1.5 1.5H8a1.5 1.5 0 0 1-1.5-1.5z", "M9 10V7a3 3 0 0 1 6 0v3"],
  },
  beach: {
    tone: ["M3.5 11.5a8.5 8.5 0 0 1 17 0z"],
    line: ["M3.5 11.5a8.5 8.5 0 0 1 17 0z", "M12 3v8.5", "M12 11.5v7a1.8 1.8 0 0 1-3.6 0"],
  },
  mountain: { tone: ["M3 19l6-10 3.5 5.5L15 11l6 8z"], line: ["M3 19l6-10 3.5 5.5L15 11l6 8z", "M7.3 11.8l1.7 1.2 1.6-1.2"] },
  city: {
    tone: ["M4.5 20V9.5l5-2.5V20z"],
    line: ["M4.5 20V9.5l5-2.5V20", "M9.5 20V4.5h10V20", "M3 20h18", "M13 8h3", "M13 11.5h3", "M13 15h3"],
  },
  road: {
    tone: ["M4 16.5V13a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3.5z"],
    line: ["M4 16.5V13a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3.5z", "M5.5 11l1.6-4.2A2 2 0 0 1 9 5.5h6a2 2 0 0 1 1.9 1.3l1.6 4.2", "M6 16.5v2", "M18 16.5v2"],
    solid: [circle(7.5, 13.8, 1), circle(16.5, 13.8, 1)],
  },
  crown: { tone: ["M4 8l4 4 4-6 4 6 4-4-1.5 10h-13z"], line: ["M4 8l4 4 4-6 4 6 4-4-1.5 10h-13z", "M6 20.5h12"] },
  chat: {
    tone: ["M5.5 5h13A1.5 1.5 0 0 1 20 6.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 3.5V17A1.5 1.5 0 0 1 4 15.5v-9A1.5 1.5 0 0 1 5.5 5z"],
    line: ["M5.5 5h13A1.5 1.5 0 0 1 20 6.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 3.5V17A1.5 1.5 0 0 1 4 15.5v-9A1.5 1.5 0 0 1 5.5 5z"],
  },
  map: { tone: ["M9 4.5l6 2.5v12.5l-6-2.5z"], line: [mapOutline, "M9 4.5V17", "M15 7v12.5"] },
  mapFill: { solid: [mapOutline], line: [mapOutline], knock: ["M9 6.5V15.5", "M15 8.5v9"] },
  leaf: { tone: ["M5 19c0-8 5-13.5 14-14 .5 9-5 14-12 14z"], line: ["M5 19c0-8 5-13.5 14-14 .5 9-5 14-12 14z", "M5 19c3-4 6-6.5 9.5-8.5"] },
  book: {
    tone: ["M5 5.5A1.5 1.5 0 0 1 6.5 4H18v14H6.5A1.5 1.5 0 0 0 5 19.5z"],
    line: ["M5 5.5A1.5 1.5 0 0 1 6.5 4H18v14H6.5A1.5 1.5 0 0 0 5 19.5z", "M5 19.5A1.5 1.5 0 0 0 6.5 21H18v-3", "M9 8h5"],
  },
  eye: { tone: [eye], line: [eye, circle(12, 12, 3)] },
  eyeOff: { line: [eye, circle(12, 12, 3), "M4 4l16 16"] },
  mail: {
    tone: ["M4.5 6h15A1.5 1.5 0 0 1 21 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16.5v-9A1.5 1.5 0 0 1 4.5 6z"],
    line: ["M4.5 6h15A1.5 1.5 0 0 1 21 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16.5v-9A1.5 1.5 0 0 1 4.5 6z", "M3.5 7l8.5 6 8.5-6"],
  },
  lock: {
    tone: ["M6.5 10.5h11A1.5 1.5 0 0 1 19 12v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19v-7a1.5 1.5 0 0 1 1.5-1.5z"],
    line: ["M6.5 10.5h11A1.5 1.5 0 0 1 19 12v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19v-7a1.5 1.5 0 0 1 1.5-1.5z", "M8 10.5V8a4 4 0 0 1 8 0v2.5", "M12 14.5v2"],
  },
  help: { tone: [ring], line: [ring, "M9.6 9.4a2.5 2.5 0 0 1 4.8 1c0 1.6-2.4 2-2.4 3.6"], solid: [circle(12, 17.1, 1.1)] },
  logout: {
    tone: ["M5 6a1.5 1.5 0 0 1 1.5-1.5H10v15H6.5A1.5 1.5 0 0 1 5 18z"],
    line: ["M10 4.5H6.5A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5H10", "M14.5 8l4 4-4 4", "M18.5 12H9.5"],
  },
  edit: { tone: ["M14.5 5.5l4 4L9 19H5v-4z"], line: ["M14.5 5.5l4 4L9 19H5v-4z", "M12.5 7.5l4 4", "M13 20h6"] },
  more: { tone: [ring], line: [ring], solid: [circle(8, 12, 1.3), circle(12, 12, 1.3), circle(16, 12, 1.3)] },
  refresh: { line: ["M19.5 12a7.5 7.5 0 1 1-2.2-5.3", "M19.5 4.5v4h-4"] },
  globe: {
    tone: [ring],
    line: [ring, "M3 12h18", "M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z"],
  },
  cocktail: {
    tone: ["M4.5 5h15L12 13z"],
    line: ["M4.5 5h15L12 13z", "M12 13v6.5", "M8.5 20h7", "M15.5 5l2-2.5"],
    solid: [circle(10, 7.6, 1.2)],
  },
  coffee: {
    tone: ["M4.5 9.5h11v4.5a4.5 4.5 0 0 1-4.5 4.5H9a4.5 4.5 0 0 1-4.5-4.5z"],
    line: ["M4.5 9.5h11v4.5a4.5 4.5 0 0 1-4.5 4.5H9a4.5 4.5 0 0 1-4.5-4.5z", "M15.5 11h1.6a2.4 2.4 0 0 1 0 4.8h-1.8", "M8 3.5c-.8 1 .8 2 0 3.2", "M11.5 3.5c-.8 1 .8 2 0 3.2", "M3.5 21h14"],
  },
  music: {
    tone: [circle(7, 17.5, 2.6), circle(17, 15.5, 2.6)],
    line: [circle(7, 17.5, 2.6), circle(17, 15.5, 2.6), "M9.6 17.5V5.5l10-2v12", "M9.6 9l10-2"],
  },
  terrace: {
    tone: ["M3 10.5a9 5.5 0 0 1 18 0z"],
    line: ["M3 10.5a9 5.5 0 0 1 18 0z", "M12 5v-1.5", "M12 10.5v10", "M7.5 15.5h9", "M8.5 15.5l-1.5 5", "M15.5 15.5l1.5 5"],
  },
  instagram: {
    tone: ["M7.8 3.5h8.4a4.3 4.3 0 0 1 4.3 4.3v8.4a4.3 4.3 0 0 1-4.3 4.3H7.8a4.3 4.3 0 0 1-4.3-4.3V7.8a4.3 4.3 0 0 1 4.3-4.3z"],
    line: ["M7.8 3.5h8.4a4.3 4.3 0 0 1 4.3 4.3v8.4a4.3 4.3 0 0 1-4.3 4.3H7.8a4.3 4.3 0 0 1-4.3-4.3V7.8a4.3 4.3 0 0 1 4.3-4.3z", circle(12, 12, 3.9)],
    solid: [circle(16.9, 7.1, 1.1)],
  },
  tiktok: {
    tone: [circle(9.6, 15.4, 3.6)],
    line: ["M13.6 3.5v11.9a3.6 3.6 0 1 1-3.6-3.6", "M13.6 3.5c.5 2.6 2.4 4.5 5.4 4.8"],
  },
  info: { tone: [ring], line: [ring, "M12 11v5.6"], solid: [circle(12, 7.9, 1.15)] },
  target: {
    tone: [circle(12, 12, 2.6)],
    line: [circle(12, 12, 7), circle(12, 12, 2.6), "M12 2.5v3", "M12 18.5v3", "M2.5 12h3", "M18.5 12h3"],
  },
} satisfies Record<string, Glyph>;

export type GlyphName = keyof typeof glyphs;

export function GlyphIcon({ name, size, color, knockColor = "#FFFFFF" }: {
  name: GlyphName; size: number; color: string; knockColor?: string;
}) {
  const glyph: Glyph = glyphs[name];
  const stroke = size <= 16 ? 2.1 : 1.85;
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    {glyph.tone?.map((d, index) => <Path key={`t${index}`} d={d} fill={color} opacity={0.18} />)}
    {glyph.solid?.map((d, index) => <Path key={`s${index}`} d={d} fill={color} />)}
    {glyph.line?.map((d, index) => <Path key={`l${index}`} d={d} stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />)}
    {glyph.knock?.map((d, index) => <Path key={`k${index}`} d={d} stroke={knockColor} fill={d.endsWith("z") ? knockColor : "none"} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />)}
  </Svg>;
}
