import sharp from "sharp";
import { resolve } from "node:path";

// Builds the native splash images: the brand mark above the wordmark, laid out like the in-app splash
// (src/features/onboarding.tsx), so the native splash hands over to it without the name popping in.
// Sizes are in points at @3x. The splash plugin shows the image in a square `imageWidth` points wide, so the canvas
// is square and app.json's imageWidth must equal `side` below.
const scale = 3;
const width = 218;
const mark = { width: 132, height: 104 };
const name = { width: 218, height: 54 };
const gap = 15;
// The in-app logo sits above the screen's centre: the hidden sign-in buttons below it take 140 pt, and the safe
// area's top inset is larger than its bottom one. Empty space under the logo puts it at the same height.
const bottomSpace = 112;
const height = mark.height + gap + name.height + bottomSpace;
const side = Math.max(width, height);
const inset = (side - width) / 2;
const px = (points) => Math.round(points * scale);

const root = resolve(import.meta.dirname, "../assets/images/goworth");
const fit = (file, box) => sharp(resolve(root, file))
  .resize(px(box.width), px(box.height), { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png().toBuffer();

/** The wordmark in one flat colour, as the in-app splash tints it in dark mode. */
async function tinted(buffer, [r, g, b]) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) { data[i] = r; data[i + 1] = g; data[i + 2] = b; }
  return sharp(data, { raw: info }).png().toBuffer();
}

const markImage = await fit("brand-mark.png", mark);
const nameImage = await fit("brand-name.png", name);

async function write(file, wordmark) {
  await sharp({ create: { width: px(side), height: px(side), channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      { input: markImage, left: px(inset + (width - mark.width) / 2), top: px(side - height) },
      { input: wordmark, left: px(inset), top: px(side - height + mark.height + gap) },
    ])
    .png().toFile(resolve(root, file));
}

await write("splash.png", nameImage);
// The dark palette's ink (src/constants/design.ts).
await write("splash-dark.png", await tinted(nameImage, [0xee, 0xf2, 0xf8]));
console.log(`splash.png and splash-dark.png: ${px(side)}×${px(side)} px; set imageWidth to ${side} in app.json`);
