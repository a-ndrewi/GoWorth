import sharp from "sharp";
import { resolve } from "node:path";

// Rebuilds brand-mark.png as a clean, high-resolution mark for the native splash and in-app logo.
// The source mark was cut from a raster design board, so its alpha is a colour-key guess:
// edge pixels keep the board's white, and the board's soft shadow survives under the "W".
// The logo is all saturated colour, so how saturated a pixel looks over white tells how much
// of it is logo. Edge colours are taken from the nearest solid pixel, so nothing white is left.
const input = resolve(process.argv[2] ?? "assets/images/goworth/brand-mark.png");
const output = resolve(process.argv[3] ?? "assets/images/goworth/brand-mark.png");
const outputWidth = 1200;

const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height } = info;
const count = width * height;
const saturation = (r, g, b) => Math.max(r, g, b) - Math.min(r, g, b);

// What the mark looks like over the white board, and which pixels are solid logo.
const overWhite = new Float32Array(count * 3);
const solid = new Uint8Array(count);
for (let i = 0; i < count; i++) {
  const a = data[i * 4 + 3] / 255;
  for (let c = 0; c < 3; c++) overWhite[i * 3 + c] = a * data[i * 4 + c] + (1 - a) * 255;
  solid[i] = data[i * 4 + 3] === 255 && saturation(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) > 60 ? 1 : 0;
}

// Only trust colours two pixels inside the solid area; the outer rim is already mixed with white.
const known = new Uint8Array(count);
const colour = new Float32Array(count * 3);
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const i = y * width + x;
    let inside = solid[i] === 1;
    for (let dy = -2; inside && dy <= 2; dy++) {
      for (let dx = -2; inside && dx <= 2; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        inside = nx >= 0 && ny >= 0 && nx < width && ny < height && solid[ny * width + nx] === 1;
      }
    }
    if (!inside) continue;
    known[i] = 1;
    for (let c = 0; c < 3; c++) colour[i * 3 + c] = data[i * 4 + c];
  }
}

// Bleed solid colours outwards so every edge pixel has a true logo colour.
for (let pass = 0; pass < 8; pass++) {
  const next = known.slice();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (known[i]) continue;
      const sum = [0, 0, 0];
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const j = ny * width + nx;
          if (!known[j]) continue;
          for (let c = 0; c < 3; c++) sum[c] += colour[j * 3 + c];
          n++;
        }
      }
      if (!n) continue;
      for (let c = 0; c < 3; c++) colour[i * 3 + c] = sum[c] / n;
      next[i] = 1;
    }
  }
  known.set(next);
}

// Over white, a pixel that is k parts logo has k times the logo's saturation.
const rgb = Buffer.alloc(count * 3);
const alpha = Buffer.alloc(count);
for (let i = 0; i < count; i++) {
  for (let c = 0; c < 3; c++) rgb[i * 3 + c] = Math.round(colour[i * 3 + c]);
  if (!known[i]) continue;
  const logo = saturation(colour[i * 3], colour[i * 3 + 1], colour[i * 3 + 2]);
  const seen = saturation(overWhite[i * 3], overWhite[i * 3 + 1], overWhite[i * 3 + 2]);
  const coverage = seen / Math.max(logo, 1);
  // Faint coverage is the board's shadow and noise, not logo.
  alpha[i] = Math.round(255 * Math.max(0, Math.min(1, (coverage - 0.15) / 0.75)));
}

// Drop specks, like the reflection under the "W", that are not part of the mark's shapes.
const component = new Int32Array(count).fill(-1);
for (let start = 0; start < count; start++) {
  if (alpha[start] < 128 || component[start] !== -1) continue;
  const members = [start];
  component[start] = start;
  for (let k = 0; k < members.length; k++) {
    const i = members[k];
    const x = i % width;
    for (const j of [i - width, i + width, x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1]) {
      if (j < 0 || j >= count || alpha[j] < 128 || component[j] !== -1) continue;
      component[j] = start;
      members.push(j);
    }
  }
  if (members.length < count * 0.004) for (const i of members) component[i] = -2;
}
for (let i = 0; i < count; i++) {
  if (component[i] === -2) alpha[i] = 0;
}
// Faint pixels next to a dropped speck go with it.
for (let i = 0; i < count; i++) {
  if (alpha[i] === 0 || alpha[i] >= 128) continue;
  const x = i % width;
  const near = [i - width, i + width, x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1];
  if (!near.some((j) => j >= 0 && j < count && component[j] >= 0)) alpha[i] = 0;
}

const scale = Math.ceil(outputWidth / width) + 1;
const big = { width: width * scale, height: height * scale };
const bigRgb = await sharp(rgb, { raw: { width, height, channels: 3 } })
  .resize(big.width, big.height, { kernel: "lanczos3" })
  .raw()
  .toBuffer();
const bigAlpha = await sharp(alpha, { raw: { width, height, channels: 1 } })
  .resize(big.width, big.height, { kernel: "cubic" })
  .blur(scale * 0.55)
  .extractChannel(0)
  .raw()
  .toBuffer();

// Tighten the soft upscaled edge into a crisp anti-aliased one.
const rgba = Buffer.alloc(big.width * big.height * 4);
for (let i = 0; i < big.width * big.height; i++) {
  const a = bigAlpha[i] / 255;
  const t = Math.max(0, Math.min(1, (a - 0.5) * (scale / 2) + 0.5));
  for (let c = 0; c < 3; c++) rgba[i * 4 + c] = bigRgb[i * 3 + c];
  rgba[i * 4 + 3] = Math.round(255 * t * t * (3 - 2 * t));
}

const trimmed = await sharp(rgba, { raw: { ...big, channels: 4 } })
  .trim({ background: "#00000000", threshold: 1 })
  .png()
  .toBuffer();
await sharp(trimmed)
  .resize({ width: outputWidth, kernel: "lanczos3" })
  .png({ compressionLevel: 9 })
  .toFile(output);
console.log(`Wrote ${output}`);
