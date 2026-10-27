// Resolves a photo for every place in the app's own catalog once, ahead of time, and writes them to
// src/data/catalog-photos.ts. The app then shows catalog places without searching Wikimedia at all.
//
//   node scripts/resolve-catalog-photos.mjs
//   node scripts/resolve-catalog-photos.mjs --only=place-id,other-id   (redo some places, keep the rest)
//
// Each photo is looked up the way the app does it, then confirmed by downloading the 960px thumbnail with the
// app's User-Agent. Places with no photo are listed at the end, to be filled in by hand in `manual` below.
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname;
const { places, destinationCatalog } = await import(`${root}src/data/catalog.ts`);
const { findPlacePhoto, prefetchPlacePhotos, photoSource, setBundledPhotos } = await import(`${root}src/data/place-photo.ts`);
setBundledPhotos(false);

// Destination centres live in map.ts, which uses app path aliases; read them from its source instead.
const mapSource = readFileSync(`${root}src/data/map.ts`, "utf8");
const centers = Object.fromEntries([...mapSource.matchAll(/^\s+"?([a-z-]+)"?: \[(-?[\d.]+), (-?[\d.]+)\],$/gm)].map((m) => [m[1], { latitude: Number(m[2]), longitude: Number(m[3]) }]));
const wide = { iceland: 350, alps: 220, bali: 150, "new-york": 85, "danube-delta": 160 };
const headers = { "User-Agent": "GoWorth/1.0 (travel app)" };
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Files chosen by hand for places the search gets wrong or cannot find: place id → Commons file title. */
const manual = {
  "third-gate-alba-iulia": "File:Citadel Alba-Carolina (26700229779).jpg",
  "coronation-cathedral": "File:Catedrala Reintregirii Neamului - Alba Iulia.jpg",
  "balti-jaam-market": "File:Balti jaam viewed from Balti Jaama Turg in December.jpg",
  "cota-2000": "File:Bucegi - view from Cota 2000.JPG",
  "helsinki-cathedral": "File:Helsinki Cathedral, Finland - Oct2017.jpg",
  "museum-of-the-future": "File:Museum of the Future inside-Dubai UAE-Andres Larin.jpg",
  "national-gallery-sofia": "File:National Art Gallery of Bulgaria E2.jpg",
  "sighisoara-citadel": "File:Sighișoara Citadel (8153590103).jpg",
  "akrotiri": "File:Excavations at Akrotiri, Santorini - sisaphus.jpg",
  "first-romanian-school": "File:Brașov - Prima școală Românească (2023) - img 02.jpg",
  "sulina-old-lighthouse": "File:Sulina - the old lighthouse.JPG",
  "central-park-cluj": "File:Parcul Central din Cluj.jpg",
  "ethnographic-museum-cluj": "File:Muzeul Etnografic al Transilvaniei (6073973245).jpg",
  "botanical-garden-iasi": "File:The Iași Botanical Garden, main entrance (east).JPG",
  "zemun-quay": "File:Zemunski kej, Beograd.jpg",
  "fira-oia-trail": "File:Fira and Oia - Santorini - Greece.jpg",
};
const only = process.argv.find((arg) => arg.startsWith("--only="))?.slice(7).split(",");

async function commonsFile(title, name, location) {
  const params = new URLSearchParams({ action: "query", titles: title, prop: "imageinfo", iiprop: "url|mime|extmetadata", iiurlwidth: "960", format: "json", origin: "*" });
  let data;
  // Wikimedia answers a busy client with HTTP 429 and plain text; wait and ask again rather than losing the whole run.
  for (let attempt = 0; !data; attempt++) {
    const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, { headers });
    if (response.ok) data = await response.json();
    else if (attempt < 4) await wait(5000 * (attempt + 1));
    else throw new Error(`Commons refused ${title}: HTTP ${response.status}`);
  }
  const page = Object.values(data.query?.pages ?? {})[0];
  const info = page?.imageinfo?.[0];
  if (!info?.thumburl) return null;
  const meta = info.extmetadata ?? {};
  const plain = (value) => (value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return { url: info.thumburl, pageUrl: info.descriptionurl, artist: plain(meta.Artist?.value).slice(0, 120) || "Wikimedia Commons contributor",
    license: meta.LicenseShortName?.value ?? "", licenseUrl: meta.LicenseUrl?.value || info.descriptionurl, name, location };
}

async function downloads(photo) {
  const source = photoSource(photo.url, 960);
  const response = await fetch(source.uri, { headers: source.headers, method: "GET" });
  return response.ok;
}

const destinations = new Map(destinationCatalog.map((destination) => [destination.id, destination]));
const requests = places.filter((place) => !only || only.includes(place.id)).map((place) => {
  const destination = destinations.get(place.destinationId);
  const center = centers[place.destinationId];
  return { place, name: place.name, location: `${destination.name}, ${destination.country}`,
    ...(center ? { near: { ...center, radiusKm: wide[place.destinationId] ?? 60 } } : {}) };
});

// Wikipedia lead images in bulk first, then the per-place search for the rest.
for (let start = 0; start < requests.length; start += 50) {
  await prefetchPlacePhotos(requests.slice(start, start + 50)).catch(() => undefined);
  await wait(500);
}

// With --only, the other places keep the photos already in the generated file.
const existing = only ? readFileSync(`${root}src/data/catalog-photos.ts`, "utf8") : "";
const found = only ? JSON.parse(existing.slice(existing.indexOf("= {") + 2, existing.lastIndexOf("};") + 1)) : {};
const missing = [];
for (const request of requests) {
  let photo = manual[request.place.id] ? await commonsFile(manual[request.place.id], request.name, request.location) : null;
  for (let attempt = 0; !photo && attempt < 3; attempt++) {
    try { photo = await findPlacePhoto(request.name, request.location); break; }
    catch { await wait(4000 * (attempt + 1)); }
  }
  if (photo && !(await downloads(photo).catch(() => false))) photo = null;
  const key = `${request.name}|${request.location}`.toLowerCase();
  if (photo) found[key] = { url: photo.url, pageUrl: photo.pageUrl, artist: photo.artist, license: photo.license, licenseUrl: photo.licenseUrl };
  else {
    // A place redone with --only that no longer passes the checks loses its old photo rather than keeping a wrong one.
    delete found[key];
    missing.push(`${request.place.id} (${request.name}, ${request.location})`);
  }
  process.stdout.write(photo ? "." : "x");
  await wait(250);
}

const body = `// Generated by scripts/resolve-catalog-photos.mjs; edit the script's \`manual\` table, not this file.
import type { PlacePhoto } from "./place-photo.ts";

/** Verified photos for the app's own catalog places, keyed by "name|destination, country" in lower case. */
export const catalogPhotos: Record<string, PlacePhoto> = ${JSON.stringify(found, null, 2)};
`;
writeFileSync(`${root}src/data/catalog-photos.ts`, body);
console.log(`\n${Object.keys(found).length}/${places.length} catalog places have a photo.`);
if (missing.length) console.log(`No photo:\n  ${missing.join("\n  ")}`);
