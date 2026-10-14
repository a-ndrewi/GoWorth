import { mkdir, readFile, writeFile } from "node:fs/promises";
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
  berlin: "Berlin TV tower city skyline (41610209475).jpg",
  vienna: "Vienna, Austria (Unsplash R2JCl9zI7og).jpg",
  prague: "Prague Height Cityscape (Unsplash).jpg",
  delhi: "New Delhi, India (Unsplash).jpg",
  hanoi: "Hàng Bông, Hanoi, Vietnam (Unsplash).jpg",
  "kuala-lumpur": "Menara Berkembar Petronas, Kuala Lumpur, Malaysia (Unsplash).jpg",
  auckland: "Auckland seen from a hill (Unsplash).jpg",
  toronto: "CN Tower, Toronto, Canada (Unsplash DJ kOgH5u0o).jpg",
  "buenos-aires": "Buenos Aires, Argentina (Unsplash YMOHw3F1Hdk).jpg",
  lima: "Lima, Peru (Unsplash).jpg",
  cairo: "Pyramids in Giza - Egypt.jpg",
  nairobi: "Aerial view of Nairobi.jpg",
  dublin: "Wandering in Dublin (Unsplash).jpg",
  edinburgh: "Skyline of Quartermile, Edinburgh, in June 2024.jpg",
  copenhagen: "Urban Nightscape Copenhagen (Unsplash).jpg",
  stockholm: "Stockholm (Unsplash).jpg",
  oslo: "Oslo sunset (Unsplash).jpg",
  helsinki: "Helsinki Rooftops (Unsplash).jpg",
  tallinn: "Backpacker over Tallinn's Old Town (Unsplash).jpg",
  riga: "Riga center 2020-03.jpg",
  vilnius: "Gediminas Tower Vilnius Lithuania 2025.jpg",
  warsaw: "Palace of Culture and Science in Warsaw, Poland.jpg",
  budapest: "Hungarian Parliament Building (Unsplash C 4sByaxyn4).jpg",
  athens: "From Temple of Olympian Zeus to Lycabetus Athens Greece.jpg",
  zagreb: "Zg 0146 Zagreb-Cathedral with flowers.jpg",
  ljubljana: "Ljubljana, Slovenia 2016.jpg",
  bucharest: "Bucharest city.jpg",
  brasov: "Piața Sfatului, Brașov 2025.jpg",
  sibiu: "Sibiu Romania.jpg",
  sighisoara: "Sighișoara, Romania (Unsplash).jpg",
  "cluj-napoca": "St. Michael's Church in Cluj-Napoca, Transylvania, Romania (1).jpg",
  oradea: "The Black Eagle Palace Oradea (249087659).jpeg",
  suceava: "Panoramic view of Suceava, Romania (as seen in June, 2025 from the defensive walls of the medieval Seat Fortress of Suceava).jpg",
  iasi: "The Palace of Culture in Iași, Romania (front view).jpg",
  sinaia: "Sunset watching on Sinaia mountain (Unsplash).jpg",
  "alba-iulia": "View of the Roman Catholic Cathedral from the garden of the Orthodox Cathedral, Alba Iulia, 2017.jpg",
  "danube-delta": "Pelicans in Danube Delta.jpg",
  sofia: "Sofia, Bulgaria (Unsplash BniZvM UKq8).jpg",
  belgrade: "Beograd na vodi2.jpg",
  brussels: "Brussels, Belgium (Unsplash TK0toNy9H2c).jpg",
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

await mkdir(directory, { recursive: true });
const provenancePath = path.join(directory, "provenance.json");
const provenance = JSON.parse(await readFile(provenancePath, "utf8").catch(() => "{}"));
const refresh = new Set((process.env.REFRESH_PHOTOS || "").split(",").filter(Boolean));
const pending = Object.entries(files).filter(([id]) => !provenance[id] || refresh.has(id));
const pages = new Map();
for (let index = 0; index < pending.length; index += 25) {
  const titles = pending.slice(index, index + 25).map(([, name]) => `File:${name}`).join("|");
  const api = new URL("https://commons.wikimedia.org/w/api.php");
  for (const [key, value] of Object.entries({
    action: "query", format: "json", titles, prop: "imageinfo",
    iiprop: "url|mime|size|extmetadata", iiurlwidth: "960",
  })) api.searchParams.set(key, value);
  const result = await (await get(api)).json();
  for (const page of Object.values(result.query.pages)) pages.set(page.title, page);
}

for (const [id, filename] of pending) {
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
await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);
