import { deflateSync, inflateSync } from "node:zlib";

/** An 8-bit RGBA image, row by row. */
export interface Image {
  width: number;
  height: number;
  /** width * height * 4 bytes: R, G, B, A. */
  data: Uint8Array;
}

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/** Largest image figdiff will decode, to avoid running out of memory on a hostile file. */
const MAX_PIXELS = 50_000_000;

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** Undo PNG scanline filtering in place; returns the unfiltered rows without the filter bytes. */
function unfilter(raw: Buffer, height: number, stride: number, bpp: number): Buffer {
  const out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)] as number;
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    const up = dst - stride;
    for (let x = 0; x < stride; x++) {
      const cur = raw[src + x] as number;
      const left = x >= bpp ? (out[dst + x - bpp] as number) : 0;
      const above = y > 0 ? (out[up + x] as number) : 0;
      const upLeft = y > 0 && x >= bpp ? (out[up + x - bpp] as number) : 0;
      let value: number;
      switch (filter) {
        case 0:
          value = cur;
          break;
        case 1:
          value = cur + left;
          break;
        case 2:
          value = cur + above;
          break;
        case 3:
          value = cur + ((left + above) >> 1);
          break;
        case 4:
          value = cur + paeth(left, above, upLeft);
          break;
        default:
          throw new Error(`Invalid PNG filter type ${filter}`);
      }
      out[dst + x] = value & 0xff;
    }
  }
  return out;
}

/**
 * Decode a PNG into RGBA. Supports 8 and 16 bit grayscale, RGB and RGBA (with or without
 * alpha) and 8-bit palette images, without interlacing. Throws a clear error otherwise.
 */
export function decodePng(input: Uint8Array): Image {
  const buf = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  if (buf.length < 8 || !buf.subarray(0, 8).equals(SIGNATURE)) throw new Error("Not a PNG file");

  let width = 0,
    height = 0,
    depth = 0,
    colorType = -1,
    interlace = 0;
  let palette: Buffer | undefined;
  let transparency: Buffer | undefined;
  const idat: Buffer[] = [];

  for (let pos = 8; pos + 8 <= buf.length;) {
    const length = buf.readUInt32BE(pos);
    const type = buf.toString("latin1", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + length);
    pos += 12 + length;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8] as number;
      colorType = data[9] as number;
      interlace = data[12] as number;
    } else if (type === "PLTE") palette = data;
    else if (type === "tRNS") transparency = data;
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
  }

  if (width === 0 || height === 0) throw new Error("PNG has no valid header");
  if (width * height > MAX_PIXELS) throw new Error(`PNG is too large (${width}x${height})`);
  if (interlace !== 0) throw new Error("Interlaced PNG files are not supported");
  const channels = CHANNELS[colorType];
  if (channels === undefined) throw new Error(`Unsupported PNG color type ${colorType}`);
  const supported = colorType === 3 ? depth === 8 : depth === 8 || depth === 16;
  if (!supported) throw new Error(`Unsupported PNG bit depth ${depth} for color type ${colorType}`);

  const bytesPerPixel = channels * (depth / 8);
  const stride = width * bytesPerPixel;
  const raw = inflateSync(Buffer.concat(idat));
  if (raw.length < (stride + 1) * height) throw new Error("PNG image data is truncated");
  const rows = unfilter(raw, height, stride, Math.max(1, bytesPerPixel));

  const out = new Uint8Array(width * height * 4);
  const step = depth / 8; // bytes per sample
  for (let i = 0; i < width * height; i++) {
    const p = i * bytesPerPixel;
    const sample = (c: number) => rows[p + c * step] as number; // high byte for 16-bit
    let r: number,
      g: number,
      b: number,
      a = 255;
    switch (colorType) {
      case 0:
        r = g = b = sample(0);
        break;
      case 2:
        r = sample(0);
        g = sample(1);
        b = sample(2);
        break;
      case 3: {
        const index = rows[p] as number;
        r = palette?.[index * 3] ?? 0;
        g = palette?.[index * 3 + 1] ?? 0;
        b = palette?.[index * 3 + 2] ?? 0;
        a = transparency?.[index] ?? 255;
        break;
      }
      case 4:
        r = g = b = sample(0);
        a = sample(1);
        break;
      default:
        r = sample(0);
        g = sample(1);
        b = sample(2);
        a = sample(3);
    }
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = a;
  }
  return { width, height, data: out };
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = (CRC_TABLE[(c ^ byte) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

/** Encode RGBA pixels as an 8-bit RGBA PNG. */
export function encodePng(image: Image): Buffer {
  const { width, height, data } = image;
  if (data.length !== width * height * 4) throw new Error("Pixel data does not match the image size");
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(data.buffer, data.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  return Buffer.concat([SIGNATURE, chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
