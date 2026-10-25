import assert from "node:assert/strict";
import { test } from "node:test";
import { findPlacePhoto } from "../src/data/place-photo.ts";

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
