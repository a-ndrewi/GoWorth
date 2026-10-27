import sharp from "sharp";
import { resolve } from "node:path";

// Rebuilds brand-name.png as a clean single-colour wordmark.
// The source was cut from a raster design board, so it carries the board's white haze
// (most visible beside the "h") and light rims around every letter.
// The wordmark is one dark ink, so how dark a pixel looks over white tells how much of it is ink.
const input = resolve(process.argv[2] ?? "assets/images/goworth/brand-name.png");
const output = resolve(process.argv[3] ?? "assets/images/goworth/brand-name.png");

const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height } = info;
const count = width * height;
const luminance = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// The ink colour is the median of the fully opaque dark pixels.
const solid = [];
for (let i = 0; i < count; i++) {
  const [r, g, b, a] = data.subarray(i * 4, i * 4 + 4);
  if (a === 255 && luminance(r, g, b) < 80) solid.push([r, g, b]);
}
const median = (c) => solid.map((p) => p[c]).sort((x, y) => x - y)[solid.length >> 1];
const ink = [median(0), median(1), median(2)];
const inkLuminance = luminance(...ink);

// Over white, a pixel that is k parts ink is darkened by k times the ink's darkness.
const alpha = Buffer.alloc(count);
for (let i = 0; i < count; i++) {
  const a = data[i * 4 + 3] / 255;
  const seen = luminance(...[0, 1, 2].map((c) => a * data[i * 4 + c] + (1 - a) * 255));
  const coverage = (255 - seen) / (255 - inkLuminance);
  // Faint coverage is the board's haze, not ink.
  alpha[i] = Math.round(255 * Math.max(0, Math.min(1, (coverage - 0.2) / 0.7)));
}

// Drop specks that are not part of the letters.
const component = new Int32Array(count).fill(-1);
for (let start = 0; start < count; start++) {
  if (alpha[start] === 0 || component[start] !== -1) continue;
  const members = [start];
  component[start] = start;
  let strong = 0;
  for (let k = 0; k < members.length; k++) {
    const i = members[k];
    if (alpha[i] >= 128) strong++;
    const x = i % width;
    for (const j of [i - width, i + width, x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1]) {
      if (j < 0 || j >= count || alpha[j] === 0 || component[j] !== -1) continue;
      component[j] = start;
      members.push(j);
    }
  }
  if (strong < count * 0.002) for (const i of members) alpha[i] = 0;
}

const rgba = Buffer.alloc(count * 4);
for (let i = 0; i < count; i++) {
  for (let c = 0; c < 3; c++) rgba[i * 4 + c] = ink[c];
  rgba[i * 4 + 3] = alpha[i];
}

const trimmed = await sharp(rgba, { raw: { width, height, channels: 4 } })
  .trim({ background: "#00000000", threshold: 1 })
  .png()
  .toBuffer();
await sharp(trimmed).png({ compressionLevel: 9 }).toFile(output);
console.log(`Wrote ${output} with ink rgb(${ink.join(", ")})`);
