import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { crc32 } from '../src/crc32';
import { encodeRGB } from '../src/png';

// an independent decoder (node's zlib + the unfilter from the PNG spec),
// so the encoder isn't only checked against itself
function decode(png: Uint8Array) {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  let pos = 8;
  const chunks: Record<string, Uint8Array[]> = {};
  while (pos < png.length) {
    const len = view.getUint32(pos);
    const type = String.fromCharCode(...png.subarray(pos + 4, pos + 8));
    const data = png.subarray(pos + 8, pos + 8 + len);
    expect(view.getUint32(pos + 8 + len)).toBe(crc32(png.subarray(pos + 4, pos + 8 + len)));
    (chunks[type] ??= []).push(data);
    pos += 12 + len;
  }
  const ihdr = new DataView(chunks.IHDR[0].buffer, chunks.IHDR[0].byteOffset);
  const width = ihdr.getUint32(0);
  const height = ihdr.getUint32(4);
  const colourType = chunks.IHDR[0][9];
  const raw = inflateSync(Buffer.concat(chunks.IDAT));
  const stride = width * 3;
  const rgb = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    for (let i = 0; i < stride; i++) {
      const x = raw[y * (stride + 1) + 1 + i];
      const a = i >= 3 ? rgb[y * stride + i - 3] : 0;
      const b = y ? rgb[(y - 1) * stride + i] : 0;
      const c = i >= 3 && y ? rgb[(y - 1) * stride + i - 3] : 0;
      const p = a + b - c;
      const pr = Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c) ? a
        : Math.abs(p - b) <= Math.abs(p - c) ? b : c;
      const pred = [0, a, b, (a + b) >> 1, pr][f];
      rgb[y * stride + i] = (x + pred) & 0xff;
    }
  }
  return { width, height, colourType, rgb, chunks: Object.keys(chunks) };
}

function image(width: number, height: number, fill: (x: number, y: number) => [number, number, number, number]) {
  const px = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) px.set(fill(x, y), (y * width + x) * 4);
  }
  return px;
}

describe('png encoder', () => {
  it('writes RGB without alpha, and the pixels survive', async () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) & 0xff);
    const px = image(37, 23, () => [rand(), rand(), rand(), 255]);
    const out = decode(await encodeRGB(px, 37, 23));
    expect(out.colourType).toBe(2);
    expect(out.chunks).toEqual(['IHDR', 'IDAT', 'IEND']);
    for (let i = 0, j = 0; i < px.length; i += 4, j += 3) {
      expect([out.rgb[j], out.rgb[j + 1], out.rgb[j + 2]]).toEqual([px[i], px[i + 1], px[i + 2]]);
    }
  });

  it('drops transparency instead of keeping it', async () => {
    const out = decode(await encodeRGB(image(2, 2, () => [10, 20, 30, 0]), 2, 2));
    expect(out.colourType).toBe(2);
    expect([...out.rgb.subarray(0, 3)]).toEqual([10, 20, 30]);
  });

  it('compresses smooth images well (filters are working)', async () => {
    const px = image(400, 400, (x, y) => [x % 256, y % 256, (x + y) % 256, 255]);
    const png = await encodeRGB(px, 400, 400);
    expect(png.length).toBeLessThan(400 * 400 * 3 / 20);
  });

  it('rejects a buffer of the wrong size', async () => {
    await expect(encodeRGB(new Uint8Array(10), 2, 2)).rejects.toThrow('does not match');
  });

  it('is a file macOS image tools read as opaque', async () => {
    if (process.platform !== 'darwin') return;
    const dir = mkdtempSync(join(tmpdir(), 'png-'));
    const file = join(dir, 'x.png');
    writeFileSync(file, await encodeRGB(image(64, 32, (x) => [x * 4, 0, 255, 255]), 64, 32));
    const info = execFileSync('sips', ['-g', 'hasAlpha', '-g', 'pixelWidth', '-g', 'pixelHeight', file]).toString();
    expect(info).toMatch(/hasAlpha: no/);
    expect(info).toMatch(/pixelWidth: 64/);
    expect(info).toMatch(/pixelHeight: 32/);
  });
});
