import assert from "node:assert/strict";
import test from "node:test";
import {
  OPTICAL_TILE_MODULES,
  OPTICAL_TILE_PAYLOAD_BYTES,
  rasterizeOpticalGrid,
  decodeOpticalGrid,
  decodeOpticalTile,
  rasterizeOpticalTile,
} from "../shared/optical-grid.ts";

test("optical tiles round-trip their payload", () => {
  const payload = Uint8Array.from({ length: OPTICAL_TILE_PAYLOAD_BYTES }, (_, i) => (i * 37) & 0xff);
  const raster = rasterizeOpticalTile({ index: 2, count: 4, payload });
  const decoded = decodeOpticalTile(raster.pixels.map((pixel) => (pixel & 0xff) === 0 ? 1 : 0), OPTICAL_TILE_MODULES);
  assert.deepEqual(decoded, { index: 2, count: 4, payload });
});

test("optical tiles reject a changed data cell", () => {
  const raster = rasterizeOpticalTile({ index: 0, count: 4, payload: new Uint8Array([1, 2, 3]) });
  const samples = raster.pixels.map((pixel) => (pixel & 0xff) === 0 ? 1 : 0);
  samples[1 * OPTICAL_TILE_MODULES + 10] ^= 1;
  assert.equal(decodeOpticalTile(samples, OPTICAL_TILE_MODULES), null);
});

test("optical tiles reject invalid dimensions", () => {
  assert.equal(decodeOpticalTile(new Uint8Array(10), 10), null);
});

test("a complete optical grid returns all four payloads", () => {
  const tiles = [0, 1, 2, 3].map((index) => ({ index, count: 4, payload: Uint8Array.from([index, 0xa5]) }));
  const raster = rasterizeOpticalGrid(tiles);
  const bytes = new Uint8Array(raster.pixels.buffer);
  const data = new Uint8ClampedArray(raster.size * raster.size * 4);
  for (let i = 0; i < raster.pixels.length; i++) {
    data[i * 4] = bytes[i * 4]!;
    data[i * 4 + 1] = bytes[i * 4 + 1]!;
    data[i * 4 + 2] = bytes[i * 4 + 2]!;
    data[i * 4 + 3] = 255;
  }
  const decoded = decodeOpticalGrid({ width: raster.size, height: raster.size, data } as ImageData);
  assert.deepEqual(decoded, tiles.map((tile) => tile.payload));
});
