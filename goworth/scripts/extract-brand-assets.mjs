import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const source = process.argv[2];
if (!source) throw new Error("Provide the GoWorth identity board path.");

const out = resolve("assets/images/goworth");
await mkdir(out, { recursive: true });

async function transparentCrop(name, crop, background) {
  const { data, info } = await sharp(source)
    .extract(crop)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += info.channels) {
    const [red, green, blue] = [data[i], data[i + 1], data[i + 2]];
    const saturation = Math.max(red, green, blue) - Math.min(red, green, blue);
    const darkness = 255 - Math.min(red, green, blue);
    const strength =
      background === "white"
        ? Math.max(saturation / 65, darkness / 180)
        : darkness / 150;
    data[i + 3] = Math.round(255 * Math.max(0, Math.min(1, (strength - 0.12) / 0.78)));
  }
  await sharp(data, { raw: info })
    .trim({ background: "#00000000", threshold: 10 })
    .png()
    .toFile(resolve(out, name));
}

await transparentCrop(
  "brand-mark.png",
  { left: 55, top: 81, width: 292, height: 203 },
  "white",
);
await transparentCrop(
  "brand-name.png",
  { left: 350, top: 126, width: 590, height: 122 },
  "white",
);

const logo = await sharp(resolve(out, "brand-mark.png"))
  .resize({ width: 680, height: 570, fit: "contain" })
  .toBuffer();
await sharp({
  create: { width: 1024, height: 1024, channels: 4, background: "#ffffff" },
})
  .composite([{ input: logo, left: 172, top: 227 }])
  .png()
  .toFile(resolve(out, "app-icon.png"));
await sharp(resolve(out, "brand-mark.png"))
  .resize({ width: 720, height: 720, fit: "contain" })
  .png()
  .toFile(resolve(out, "android-foreground.png"));
await sharp(resolve(out, "android-foreground.png"))
  .tint("#0B2545")
  .png()
  .toFile(resolve(out, "android-monochrome.png"));
console.log("Created transparent GoWorth mark, wordmark, and app icons.");
