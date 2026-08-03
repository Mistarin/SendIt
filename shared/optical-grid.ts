// Decimen's purpose-built optical symbol. It deliberately keeps the existing
// fountain frame as its payload: this codec only solves screen/camera framing.

export const OPTICAL_GRID = 2;
export const OPTICAL_TILE_MODULES = 96;
export const OPTICAL_TILE_GUTTER = 8;
const TILE_MAGIC0 = 0x4f;
const TILE_MAGIC1 = 0x47;
const TILE_HEADER = 8; // magic, version, tile index/count, payload length
const TILE_VERSION = 1;
const CRC_LEN = 4;
const FINDER = 9;

export interface OpticalTile {
  index: number;
  count: number;
  payload: Uint8Array;
}

export interface OpticalRaster {
  size: number;
  pixels: Uint32Array<ArrayBuffer>;
}

const WHITE = 0xffffffff;
const BLACK = 0xff000000;

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (~crc) >>> 0;
}

function isFinder(x: number, y: number): boolean {
  return (
    (x < FINDER && y < FINDER) ||
    (x >= OPTICAL_TILE_MODULES - FINDER && y < FINDER) ||
    (x < FINDER && y >= OPTICAL_TILE_MODULES - FINDER)
  );
}

function finderBit(x: number, y: number): boolean {
  const ox = x < FINDER ? x : OPTICAL_TILE_MODULES - FINDER;
  const oy = y < FINDER ? y : OPTICAL_TILE_MODULES - FINDER;
  return ox === 0 || oy === 0 || ox === FINDER - 1 || oy === FINDER - 1 || (ox >= 2 && ox <= 6 && oy >= 2 && oy <= 6);
}

function dataCoordinates(): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let y = 1; y < OPTICAL_TILE_MODULES - 1; y++) {
    for (let x = 1; x < OPTICAL_TILE_MODULES - 1; x++) {
      if (!isFinder(x, y)) out.push([x, y]);
    }
  }
  return out;
}

const DATA_COORDINATES = dataCoordinates();
const DATA_INDEX = new Map(DATA_COORDINATES.map(([x, y], index) => [`${x},${y}`, index]));
export const OPTICAL_TILE_PAYLOAD_BYTES = Math.floor(DATA_COORDINATES.length / 8) - TILE_HEADER - CRC_LEN;

function tileBytes(tile: OpticalTile): Uint8Array {
  if (tile.count !== 4 || tile.index < 0 || tile.index >= tile.count) throw new Error("Invalid optical tile identity.");
  if (tile.payload.length > OPTICAL_TILE_PAYLOAD_BYTES) throw new Error("Optical tile payload is too large.");
  const out = new Uint8Array(TILE_HEADER + tile.payload.length + CRC_LEN);
  const view = new DataView(out.buffer);
  view.setUint8(0, TILE_MAGIC0);
  view.setUint8(1, TILE_MAGIC1);
  view.setUint8(2, TILE_VERSION);
  view.setUint8(3, tile.index);
  view.setUint8(4, tile.count);
  view.setUint16(5, tile.payload.length, true);
  out.set(tile.payload, TILE_HEADER);
  view.setUint32(out.length - CRC_LEN, crc32(out.subarray(0, out.length - CRC_LEN)), true);
  return out;
}

function bit(bytes: Uint8Array, index: number): boolean {
  return (bytes[index >>> 3]! & (1 << (7 - (index & 7)))) !== 0;
}

function setBit(bytes: Uint8Array, index: number, value: boolean): void {
  if (value) bytes[index >>> 3]! |= 1 << (7 - (index & 7));
}

export function rasterizeOpticalTile(tile: OpticalTile): OpticalRaster {
  const encoded = tileBytes(tile);
  const pixels = new Uint32Array(OPTICAL_TILE_MODULES * OPTICAL_TILE_MODULES);
  pixels.fill(WHITE);
  for (let y = 0; y < OPTICAL_TILE_MODULES; y++) {
    for (let x = 0; x < OPTICAL_TILE_MODULES; x++) {
      const dataIndex = DATA_INDEX.get(`${x},${y}`);
      const dark = isFinder(x, y) ? finderBit(x, y) : dataIndex !== undefined && bit(encoded, dataIndex);
      if (dark) pixels[y * OPTICAL_TILE_MODULES + x] = BLACK;
    }
  }
  return { size: OPTICAL_TILE_MODULES, pixels };
}

export function rasterizeOpticalGrid(tiles: readonly OpticalTile[]): OpticalRaster {
  if (tiles.length !== 4) throw new Error("An optical grid needs exactly four tiles.");
  const size = OPTICAL_GRID * OPTICAL_TILE_MODULES + (OPTICAL_GRID + 1) * OPTICAL_TILE_GUTTER;
  const pixels = new Uint32Array(size * size);
  pixels.fill(WHITE);
  for (const tile of tiles) {
    const raster = rasterizeOpticalTile(tile);
    const gx = tile.index % OPTICAL_GRID;
    const gy = Math.floor(tile.index / OPTICAL_GRID);
    const ox = OPTICAL_TILE_GUTTER + gx * (OPTICAL_TILE_MODULES + OPTICAL_TILE_GUTTER);
    const oy = OPTICAL_TILE_GUTTER + gy * (OPTICAL_TILE_MODULES + OPTICAL_TILE_GUTTER);
    for (let y = 0; y < raster.size; y++) pixels.set(raster.pixels.subarray(y * raster.size, (y + 1) * raster.size), (oy + y) * size + ox);
  }
  return { size, pixels };
}

export function decodeOpticalTile(samples: ArrayLike<number>, size = OPTICAL_TILE_MODULES): OpticalTile | null {
  if (size !== OPTICAL_TILE_MODULES || samples.length < size * size) return null;
  const encoded = new Uint8Array(Math.ceil(DATA_COORDINATES.length / 8));
  for (let i = 0; i < DATA_COORDINATES.length; i++) {
    const [x, y] = DATA_COORDINATES[i]!;
    setBit(encoded, i, samples[y * size + x] !== 0);
  }
  if (encoded[0] !== TILE_MAGIC0 || encoded[1] !== TILE_MAGIC1 || encoded[2] !== TILE_VERSION) return null;
  const length = encoded[5]! | (encoded[6]! << 8);
  const end = TILE_HEADER + length;
  if (encoded[3]! >= 4 || encoded[4] !== 4 || end + CRC_LEN > encoded.length) return null;
  const view = new DataView(encoded.buffer);
  if (view.getUint32(end, true) !== crc32(encoded.subarray(0, end))) return null;
  return { index: encoded[3]!, count: 4, payload: encoded.slice(TILE_HEADER, end) };
}

/** Decode the sender's square grid from a camera frame. The first version
 * intentionally uses an axis-aligned sampler: the sender's square display is
 * easy to prop parallel to the camera, and this keeps the hot path cheap.
 * QR fallback remains available for angled or partial captures. */
export function decodeOpticalGrid(image: ImageData): Uint8Array[] {
  const { width, height, data } = image;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      const gray = (data[p]! * 77 + data[p + 1]! * 150 + data[p + 2]! * 29) >> 8;
      if (gray < 100) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (maxX < 0 || maxY < 0) return [];
  const darkSpan = Math.min(maxX - minX + 1, maxY - minY + 1);
  const modulePx = darkSpan / (2 * OPTICAL_TILE_MODULES + OPTICAL_TILE_GUTTER);
  if (modulePx < 1) return [];
  const originX = minX - OPTICAL_TILE_GUTTER * modulePx;
  const originY = minY - OPTICAL_TILE_GUTTER * modulePx;
  const output: Uint8Array[] = [];
  for (let tileIndex = 0; tileIndex < 4; tileIndex++) {
    const tile = new Uint8Array(OPTICAL_TILE_MODULES * OPTICAL_TILE_MODULES);
    const gx = tileIndex % 2;
    const gy = Math.floor(tileIndex / 2);
    const tileOriginX = originX + (OPTICAL_TILE_GUTTER + gx * (OPTICAL_TILE_MODULES + OPTICAL_TILE_GUTTER)) * modulePx;
    const tileOriginY = originY + (OPTICAL_TILE_GUTTER + gy * (OPTICAL_TILE_MODULES + OPTICAL_TILE_GUTTER)) * modulePx;
    for (let y = 0; y < OPTICAL_TILE_MODULES; y++) {
      for (let x = 0; x < OPTICAL_TILE_MODULES; x++) {
        const px = Math.min(width - 1, Math.max(0, Math.floor(tileOriginX + (x + 0.5) * modulePx)));
        const py = Math.min(height - 1, Math.max(0, Math.floor(tileOriginY + (y + 0.5) * modulePx)));
        const p = (py * width + px) * 4;
        tile[y * OPTICAL_TILE_MODULES + x] = ((data[p]! * 77 + data[p + 1]! * 150 + data[p + 2]! * 29) >> 8) < 128 ? 1 : 0;
      }
    }
    const decoded = decodeOpticalTile(tile);
    if (decoded) output.push(decoded.payload);
  }
  return output;
}
