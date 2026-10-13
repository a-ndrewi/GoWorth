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
