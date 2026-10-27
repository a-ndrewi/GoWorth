import assert from "node:assert/strict";
import { test } from "node:test";
import { findPlacePhoto, peekPlacePhoto, prefetchPlacePhotos } from "../src/data/place-photo.ts";

test("place photos reject unrelated files and retain Commons attribution", async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    return {
      ok: true,
      json: async () => ({ query: { pages: {
        1: { index: 1, title: "File:City Park Elsewhere.jpg", imageinfo: [{
          thumburl: "https://thumb.wikimedia.org/elsewhere.jpg",
          descriptionurl: "https://commons.wikimedia.org/wiki/File:Elsewhere.jpg",
          mime: "image/jpeg",
          extmetadata: { LicenseShortName: { value: "CC0" } },
        }] },
        2: { index: 2, title: "File:City Park Portsville.jpg", imageinfo: [{
          thumburl: "https://thumb.wikimedia.org/clock.jpg",
          descriptionurl: "https://commons.wikimedia.org/wiki/File:City_Park_Portsville.jpg",
          mime: "image/jpeg",
          extmetadata: {
            LicenseShortName: { value: "CC BY-SA 4.0" },
            LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0/" },
            Artist: { value: "<a href=\"/wiki/User:Alex\">Alex</a>" },
          },
        }] },
      } } }),
    };
  };
  try {
    const photo = await findPlacePhoto("City Park", "Portsville");
    assert.equal(photo?.artist, "Alex");
    assert.equal(photo?.license, "CC BY-SA 4.0");
    assert.equal(photo?.pageUrl, "https://commons.wikimedia.org/wiki/File:City_Park_Portsville.jpg");
    assert.equal(await findPlacePhoto("City Park", "Portsville"), photo);
    assert.equal(requests, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("failed image URLs can be skipped without losing a verified alternative", async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    return { ok: true, json: async () => ({ query: { pages: {
      1: { index: 1, title: "File:Old Bridge Testport A.jpg", imageinfo: [{ thumburl: "https://thumb.wikimedia.org/a.jpg", descriptionurl: "https://commons.wikimedia.org/wiki/File:Old_Bridge_Testport_A.jpg", mime: "image/jpeg", extmetadata: { LicenseShortName: { value: "CC0" } } }] },
      2: { index: 2, title: "File:Old Bridge Testport B.jpg", imageinfo: [{ thumburl: "https://thumb.wikimedia.org/b.jpg", descriptionurl: "https://commons.wikimedia.org/wiki/File:Old_Bridge_Testport_B.jpg", mime: "image/jpeg", extmetadata: { LicenseShortName: { value: "CC0" } } }] },
    } } }) };
  };
  try {
    const first = await findPlacePhoto("Old Bridge", "Testport");
    const next = await findPlacePhoto("Old Bridge", "Testport", undefined, undefined, undefined, [first.url]);
    assert.equal(first.url, "https://thumb.wikimedia.org/a.jpg");
    assert.equal(next.url, "https://thumb.wikimedia.org/b.jpg");
    assert.equal(requests, 1);
  } finally { globalThis.fetch = originalFetch; }
});

const commonsFile = (title, url) => ({ index: 1, title, imageinfo: [{ thumburl: url, descriptionurl: `https://commons.wikimedia.org/wiki/${title}`, mime: "image/jpeg", extmetadata: { LicenseShortName: { value: "CC0" } } }] });

test("a throttled photo search waits and tries again instead of reporting no photo", async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    if (requests === 1) return { ok: false, status: 429, headers: { get: () => "0.01" }, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ query: { pages: { 1: commonsFile("File:Harbour Lighthouse Retryville.jpg", "https://thumb.wikimedia.org/lighthouse.jpg") } } }) };
  };
  try {
    const photo = await findPlacePhoto("Harbour Lighthouse", "Retryville, Nowhere");
    assert.equal(photo?.url, "https://thumb.wikimedia.org/lighthouse.jpg");
    assert.equal(requests, 2);
  } finally { globalThis.fetch = originalFetch; }
});

test("a search by name alone does not borrow a same-named place from another city", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const query = new URL(url).searchParams.get("gsrsearch");
    // Only the name-only search finds anything, and it is the museum in another city.
    const pages = query === "Museo Civico Romano" ? { 1: commonsFile("File:Museo civico romano (Verona) 1.jpg", "https://thumb.wikimedia.org/verona.jpg") } : {};
    return { ok: true, status: 200, json: async () => ({ query: { pages } }) };
  };
  try {
    assert.equal(await findPlacePhoto("Museo Civico Romano", "Smalltown, Italy"), null);
  } finally { globalThis.fetch = originalFetch; }
});

test("catalog places use their bundled photo without searching", async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error("no network"); };
  try {
    const photo = await findPlacePhoto("Spiaggia Grande", "Positano, Italy");
    assert.match(photo?.url ?? "", /^https:\/\/(upload|thumb)\.wikimedia\.org\//);
    assert.equal(requests, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test("bulk lookups take a place's photo from its Wikidata item before searching Wikipedia by name", async () => {
  const originalFetch = globalThis.fetch;
  const hosts = [];
  globalThis.fetch = async (url) => {
    const { hostname, searchParams } = new URL(url);
    hosts.push(hostname);
    const pages = hostname === "www.wikidata.org"
      ? { 7: { title: searchParams.get("titles"), pageimage: "Ateneul_Roman_Bucuresti.jpg" } }
      : hostname === "commons.wikimedia.org" ? { 1: commonsFile("File:Ateneul Roman Bucuresti.jpg", "https://thumb.wikimedia.org/ateneu.jpg") } : {};
    return { ok: true, status: 200, json: async () => ({ query: { pages } }) };
  };
  try {
    const place = { name: "Ateneul Român", location: "București, România", latitude: 44.4413, longitude: 26.0973, sourceUrl: "https://www.openstreetmap.org/way/77", wikidata: "Q1475806" };
    assert.deepEqual(await prefetchPlacePhotos([place]), [true]);
    assert.equal(peekPlacePhoto(place.name, place.location, place.latitude, place.longitude, place.sourceUrl)?.url, "https://thumb.wikimedia.org/ateneu.jpg");
    assert.deepEqual(hosts, ["www.wikidata.org", "commons.wikimedia.org"]);
  } finally { globalThis.fetch = originalFetch; }
});

const fileWith = (title, url, extra = {}) => ({ index: 1, title, imageinfo: [{ thumburl: url, descriptionurl: `https://commons.wikimedia.org/wiki/${title}`, mime: "image/jpeg",
  extmetadata: { LicenseShortName: { value: "CC0" }, ...extra } }] });

test("a place's own article image is refused when it is a logo, a view from elsewhere, or taken far away", async () => {
  const originalFetch = globalThis.fetch;
  const files = {
    "Signal Tower": "Signal Tower logo.png",
    "Hill Quarter": "View from the Cathedral, Panorama 2014.jpg",
    "Rock Garden": "Rock Garden Testburg.jpg",
  };
  globalThis.fetch = async (url) => {
    const { hostname, searchParams } = new URL(url);
    const titles = searchParams.get("titles") ?? "";
    if (hostname === "www.wikidata.org") return { ok: true, status: 200, json: async () => ({ query: { pages: Object.fromEntries(titles.split("|").map((item, index) =>
      [index, { title: item, pageimage: Object.values(files)[index] }])) } }) };
    const pages = Object.fromEntries(titles.split("|").map((title, index) => [index, fileWith(title.replace(/_/g, " "), `https://thumb.wikimedia.org/${index}.jpg`,
      // The garden's photo was taken on another continent.
      title.includes("Rock Garden") ? { GPSLatitude: { value: "-33.9" }, GPSLongitude: { value: "18.4" } } : {})]));
    return { ok: true, status: 200, json: async () => ({ query: { pages } }) };
  };
  try {
    const places = Object.keys(files).map((name, index) => ({ name, location: "Testburg, Nowhere", latitude: 48.1 + index / 100, longitude: 11.5,
      sourceUrl: `https://www.openstreetmap.org/node/${900 + index}`, wikidata: `Q${900 + index}` }));
    assert.deepEqual(await prefetchPlacePhotos(places), [false, false, false]);
  } finally { globalThis.fetch = originalFetch; }
});

test("a name that says what the place is needs a file that says so too, in whole words", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ query: { pages: {
    // Names the town but not the beach: a satellite view of the delta.
    1: fileWith("File:Delta lobe near Sulmara 2008.jpg", "https://thumb.wikimedia.org/delta.jpg"),
    // "Art" hidden inside "Martin" is not the word "art".
    2: fileWith("File:Saint Martin street Sulmara.jpg", "https://thumb.wikimedia.org/street.jpg"),
  } } }) });
  try {
    assert.equal(await findPlacePhoto("Sulmara Beach", "Sulmara, Nowhere"), null);
    assert.equal(await findPlacePhoto("Art Hall", "Sulmara, Nowhere"), null);
  } finally { globalThis.fetch = originalFetch; }
});

test("the beach is found when its file calls it a beach in the local language", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ query: { pages: { 1: fileWith("File:Plaja Sulvara vara 2019.jpg", "https://thumb.wikimedia.org/plaja.jpg") } } }) });
  try {
    assert.equal((await findPlacePhoto("Sulvara Beach", "Sulvara, Romania"))?.url, "https://thumb.wikimedia.org/plaja.jpg");
  } finally { globalThis.fetch = originalFetch; }
});

test("a Wikipedia redirect to a broader article does not lend its image to the place", async () => {
  const originalFetch = globalThis.fetch;
  const hosts = [];
  globalThis.fetch = async (url) => {
    const { hostname } = new URL(url);
    hosts.push(hostname);
    // "Mile 41" redirects to the village it belongs to, whose image shows somewhere else.
    return { ok: true, status: 200, json: async () => ({ query: {
      redirects: [{ from: "Mile 41", to: "Crisanova, Tulcea" }],
      pages: { 5: { pageid: 5, title: "Crisanova, Tulcea", pageimage: "Another_village_2008.jpg", coordinates: [{ lat: 45.2, lon: 29.4 }] } },
    } }) };
  };
  try {
    const place = { name: "Mile 41", location: "Danube Delta, Romania", near: { latitude: 45.2, longitude: 29.4, radiusKm: 60 } };
    assert.deepEqual(await prefetchPlacePhotos([place]), [false]);
    assert.deepEqual(hosts, ["en.wikipedia.org"]);
  } finally { globalThis.fetch = originalFetch; }
});
