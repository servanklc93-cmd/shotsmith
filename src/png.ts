// A PNG encoder that writes 24-bit RGB, with no alpha channel.
//
// canvas.toBlob('image/png') always produces RGBA, even for a fully opaque
// image, and App Store Connect rejects screenshots that "contain alpha
// channels or transparencies". Google Play asks for 24-bit PNG too. So the
// pixels are re-encoded here: RGB, each row filtered with whichever PNG
// filter gives the smallest output (the libpng heuristic), then zlib via the
// browser's CompressionStream.

import { crc32 } from './crc32';

const SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** RGBA pixels (as from getImageData) -> filtered RGB scanlines. Alpha is dropped. */
export function filterScanlines(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Uint8Array {
  const stride = width * 3;
  const out = new Uint8Array((stride + 1) * height);
  let prev = new Uint8Array(stride);
  let cur = new Uint8Array(stride);
  const candidates = [0, 1, 2, 3, 4].map(() => new Uint8Array(stride));

  for (let y = 0; y < height; y++) {
    for (let x = 0, s = y * width * 4, d = 0; x < width; x++, s += 4, d += 3) {
      cur[d] = rgba[s];
      cur[d + 1] = rgba[s + 1];
      cur[d + 2] = rgba[s + 2];
    }
    let best = 0;
    let bestScore = Infinity;
    for (let f = 0; f < 5; f++) {
      const row = candidates[f];
      let score = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= 3 ? cur[i - 3] : 0;
        const b = prev[i];
        const c = i >= 3 ? prev[i - 3] : 0;
        const v = f === 0 ? cur[i] : f === 1 ? cur[i] - a : f === 2 ? cur[i] - b
          : f === 3 ? cur[i] - ((a + b) >> 1) : cur[i] - paeth(a, b, c);
        row[i] = v & 0xff;
        // sum of absolute values as signed bytes: smaller usually compresses better
        score += row[i] < 128 ? row[i] : 256 - row[i];
        if (score >= bestScore) break;
      }
      if (score < bestScore) {
        bestScore = score;
        best = f;
      }
    }
    const o = y * (stride + 1);
    out[o] = best;
    out.set(candidates[best], o + 1);
    [prev, cur] = [cur, prev];
  }
  return out;
}

async function zlib(data: Uint8Array): Promise<Uint8Array> {
  // "deflate" is the zlib format (RFC 1950), which is exactly what IDAT wants
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encodeRGB(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Promise<Uint8Array> {
  if (rgba.length !== width * height * 4) throw new Error('pixel buffer does not match the size');
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8;   // bit depth
  header[9] = 2;   // colour type 2: truecolour RGB, no alpha
  const idat = await zlib(filterScanlines(rgba, width, height));
  const parts = [SIGNATURE, chunk('IHDR', header), chunk('IDAT', idat), chunk('IEND', new Uint8Array())];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}
