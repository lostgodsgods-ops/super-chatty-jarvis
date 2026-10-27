import test from "node:test";
import assert from "node:assert/strict";
import { searchNasaMedia, NASA_MEDIA_LIMITS } from "./nasa-media-connector.mjs";

test("NASA connector normalizes public image metadata and clamps result count", async () => {
  let requestedUrl = "";
  const result = await searchNasaMedia("Orion", {
    limit: 999,
    fetchImpl: async (url) => {
      requestedUrl = url;
      return {
        ok: true,
        json: async () => ({ collection: { items: [{
          data: [{ nasa_id: "ABC123", title: " Orion capsule ", description: "A public image", date_created: "2026-01-02", media_type: "image" }],
          href: "https://images-api.nasa.gov/asset/ABC123",
          links: [{ rel: "preview", href: "https://images-assets.nasa.gov/image/ABC123/ABC123~medium.jpg" }]
        }] } })
      };
    }
  });
  assert.equal(new URL(requestedUrl).searchParams.get("page_size"), String(NASA_MEDIA_LIMITS.maxResults));
  assert.equal(result.length, 1);
  assert.equal(result[0].nasaId, "ABC123");
  assert.equal(result[0].title, "Orion capsule");
  assert.equal(result[0].previewUrl, "https://images-assets.nasa.gov/image/ABC123/ABC123~medium.jpg");
});

test("NASA connector rejects empty queries", async () => {
  await assert.rejects(() => searchNasaMedia("   ", { fetchImpl: async () => { throw new Error("should not fetch"); } }), /NASA_QUERY_REQUIRED/);
});

test("NASA connector rejects malformed API payloads and non-OK responses", async () => {
  await assert.rejects(() => searchNasaMedia("Moon", { fetchImpl: async () => ({ ok: true, json: async () => ({}) }) }), /NASA_MEDIA_SCHEMA_INVALID/);
  await assert.rejects(() => searchNasaMedia("Moon", { fetchImpl: async () => ({ ok: false, status: 429 }) }), /NASA_MEDIA_HTTP_429/);
});

test("NASA connector drops items without valid HTTPS asset URLs", async () => {
  const result = await searchNasaMedia("Moon", { fetchImpl: async () => ({
    ok: true,
    json: async () => ({ collection: { items: [{ data: [{ nasa_id: "X", title: "No source" }], href: "http://unsafe.example" }] } })
  }) });
  assert.deepEqual(result, []);
});
