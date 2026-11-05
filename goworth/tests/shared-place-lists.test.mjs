import assert from "node:assert/strict";
import { test } from "node:test";
import { loadNearbyPlaces, loadNearbyVenues, setSharedPlaceLists, sharedPlacesFrom } from "../src/data/nearby-places.ts";

const place = { id: "osm:node:1", name: "Biserica Neagră", latitude: 45.641, longitude: 25.588, kind: "place", category: "Landmarks",
  detail: "Landmarks · 0.1 km away", source: "OpenStreetMap", sourceUrl: "https://www.openstreetmap.org/node/1" };

test("sharedPlacesFrom keeps only well-formed places", () => {
  assert.deepEqual(sharedPlacesFrom(null), []);
  assert.deepEqual(sharedPlacesFrom({ places: [place] }), []);
  const kept = sharedPlacesFrom([place, { ...place, id: 3 }, { ...place, latitude: 200 }, { ...place, name: undefined }, null]);
  assert.deepEqual(kept, [place]);
});

test("a fresh shared list is used without searching", async () => {
  const asked = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("no network in this test"); };
  setSharedPlaceLists({ get: async (key) => { asked.push(key); return { places: [place], savedAt: Date.now() - 60_000 }; }, put: async () => {} });
  try {
    assert.deepEqual(await loadNearbyPlaces({ latitude: 45.6427, longitude: 25.5887 }, 7), [place]);
    const venue = { ...place, id: "osm:node:2", category: "Cafés", venue: { kind: "cafe", terrace: true } };
    setSharedPlaceLists({ get: async (key) => { asked.push(key); return { places: [venue], savedAt: Date.now() }; }, put: async () => {} });
    assert.deepEqual(await loadNearbyVenues({ latitude: 45.6427, longitude: 25.5887 }, 3), [venue]);
    assert.deepEqual(asked, ["places:45.643|25.589|7|", "venues:45.643|25.589|3"]);
  } finally {
    globalThis.fetch = realFetch;
    setSharedPlaceLists(null);
  }
});

test("shared list keys match what the database accepts", () => {
  const pattern = /^(?:places|venues):(-?\d{1,2}\.\d{3})\|(-?\d{1,3}\.\d{3})\|\d{1,2}(?:\.\d{1,17})?(?:\|[A-Za-z0-9:/_-]{0,40})?$/;
  for (const key of ["places:45.643|25.589|7|", "places:-33.869|151.209|12.345678901234567|R123", "venues:45.643|-122.419|0.5", "places:45.643|25.589|25|relation/42"])
    assert.match(key, pattern);
});

test("Wikipedia places keep their lead photo file for the bulk photo check", async () => {
  const { parseWikipediaPlaces } = await import("../src/data/nearby-places.ts");
  const [place] = parseWikipediaPlaces([{ pageid: 7, title: "Bran Castle", lat: 45.515, lon: 25.367,
    pageprops: { page_image_free: "Bran_Castle_2012.jpg", "wikibase-shortdesc": "castle in Romania", wikibase_item: "Q4210" } }], { latitude: 45.515, longitude: 25.367 }, 5);
  assert.equal(place.commonsFile, "Bran Castle 2012.jpg");
});

test("shared lists keep only credited Wikimedia photos, and their thumbnails draw at once", async () => {
  const { peekPlacePhoto } = await import("../src/data/place-photo.ts");
  const photo = { url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Bran.jpg/960px-Bran.jpg", pageUrl: "https://commons.wikimedia.org/wiki/File:Bran.jpg",
    artist: "Someone", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0" };
  const good = { ...place, id: "osm:node:9", name: "Castelul Bran", sourceUrl: "https://www.openstreetmap.org/node/9", photo };
  const bad = { ...place, id: "osm:node:10", name: "Elsewhere", sourceUrl: "https://www.openstreetmap.org/node/10", photo: { ...photo, url: "https://evil.example/x.jpg" } };
  const [kept, dropped] = sharedPlacesFrom([good, bad]);
  assert.deepEqual(kept.photo, photo);
  assert.equal("photo" in dropped, false);
  const realFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("no network in this test"); };
  setSharedPlaceLists({ get: async () => ({ places: [good], savedAt: Date.now() }), put: async () => {} });
  try {
    await loadNearbyPlaces({ latitude: 45.515, longitude: 25.367 }, 5);
    assert.equal(peekPlacePhoto(good.name, "", good.latitude, good.longitude, good.sourceUrl)?.url, photo.url);
  } finally {
    globalThis.fetch = realFetch;
    setSharedPlaceLists(null);
  }
});
