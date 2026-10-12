import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const files = {
  positano: "Positano, Italy.jpg",
  santorini: "Santorini Oia Greece Travel Summer Greek Island.jpg",
  bali: "Bali Tegallalang.jpg",
  kyoto: "Temple of the Golden Pavilion, Kyoto Japan (14437492520).jpg",
  iceland: "Skogafoss Waterfall, Iceland (Unsplash).jpg",
  alps: "Matterhorn suisse.jpg",
  paris: "Paris skyline quality image Tour Eiffel.jpg",
  rome: "Colosseum of Rome and Roman forum.jpg",
  tokyo: "Shibuya Crossing, Shibuya, Japan (Unsplash).jpg",
  lisbon: "Tram in Lisbon (Unsplash).jpg",
  "new-york": "Skyline of Manhattan.jpg",
  barcelona: "Sagrada Família, Barcelona.jpg",
  london: "Big Ben (Unsplash).jpg",
  amsterdam: "Amsterdam Canal Houses (Unsplash).jpg",
  istanbul: "Historical peninsula and modern skyline of Istanbul.jpg",
  dubai: "Dubai skyline unsplash.jpg",
  singapore: "Singapore Skyline Panorama (54146978992).jpg",
  bangkok: "A Bangkok Skyline. (28200943426).jpg",
  seoul: "Han River Seoul skyline Pixabay 1214950.jpg",
  sydney: "Sydney Opera from the water (Unsplash).jpg",
  rio: "Rio de Janeiro skyline and Sugarloaf Mountain at sunset, Brazil 4.jpg",
  "cape-town": "Cape Town, assorted - CapeTown4035.jpg",
  marrakech: "Marrakesh, Morocco (Unsplash bnXUaEq9xYQ).jpg",
  "mexico-city": "La Madero (Unsplash).jpg",
};

const userAgent = "GoWorth/1.0 (https://github.com/a-ndrewi/GoWorth)";
const directory = path.resolve("assets/images/destinations");

async function get(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(url, { headers: { "User-Agent": userAgent } });
    if (response.ok) return response;
    if (![429, 502, 503, 504].includes(response.status) || attempt === 3) {
      throw new Error(`${response.status} from ${url}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
  }
  throw new Error(`Could not fetch ${url}`);
}

const titles = Object.values(files).map((name) => `File:${name}`).join("|");
const api = new URL("https://commons.wikimedia.org/w/api.php");
for (const [key, value] of Object.entries({
  action: "query", format: "json", titles, prop: "imageinfo",
  iiprop: "url|mime|size|extmetadata", iiurlwidth: "960",
})) api.searchParams.set(key, value);

const result = await (await get(api)).json();
const pages = new Map(Object.values(result.query.pages).map((page) => [page.title, page]));
const provenance = {};
await mkdir(directory, { recursive: true });

for (const [id, filename] of Object.entries(files)) {
  const page = pages.get(`File:${filename}`);
  const info = page?.imageinfo?.[0];
  if (!info?.thumburl || info.extmetadata?.LicenseShortName?.value !== "CC0") {
    throw new Error(`Missing CC0 image metadata for ${filename}`);
  }
  if (!info.mime.startsWith("image/")) throw new Error(`Not an image: ${filename}`);

  const bytes = Buffer.from(await (await get(info.thumburl)).arrayBuffer());
  const output = await sharp(bytes).rotate().resize({ width: 960, withoutEnlargement: true }).jpeg({ quality: 78, mozjpeg: true }).toBuffer();
  const metadata = await sharp(output).metadata();
  if (!metadata.width || !metadata.height || metadata.width < 600 || metadata.height < 350) {
    throw new Error(`Image is too small: ${filename}`);
  }
  await writeFile(path.join(directory, `${id}.jpg`), output);
  provenance[id] = {
    title: filename,
    source: info.descriptionurl,
    creator: info.extmetadata.Artist?.value ?? "",
    license: "CC0",
    width: metadata.width,
    height: metadata.height,
  };
  process.stdout.write(`${id}: ${metadata.width}x${metadata.height}\n`);
}
await writeFile(path.join(directory, "provenance.json"), `${JSON.stringify(provenance, null, 2)}\n`);
