import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { crc32 } from '../src/crc32';
import { unzip, zip } from '../src/zip';

const enc = new TextEncoder();

describe('crc32', () => {
  it('matches the standard check value', () => {
    expect(crc32(enc.encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe('zip', () => {
  const entries = [
    { name: 'fastlane/screenshots/en-US/01.png', data: enc.encode('first') },
    { name: 'fastlane/screenshots/tr/01-ğüşiöç.png', data: enc.encode('türkçe isim') },
    { name: 'empty.txt', data: new Uint8Array() },
    { name: 'big.bin', data: new Uint8Array(300_000).map((_, i) => i * 7) },
  ];

  it('round-trips through its own reader', () => {
    const back = unzip(zip(entries));
    expect(back.map((e) => e.name)).toEqual(entries.map((e) => e.name));
    back.forEach((e, i) => expect(e.data).toEqual(entries[i].data));
  });

  it('is a valid archive for other zip tools', () => {
    const dir = mkdtempSync(join(tmpdir(), 'zip-'));
    const file = join(dir, 'out.zip');
    writeFileSync(file, zip(entries));
    // Info-ZIP checks the structure and every CRC
    expect(execFileSync('unzip', ['-t', file]).toString()).toMatch(/No errors detected/);
    // Python's zipfile honours the UTF-8 flag (Apple's bundled unzip doesn't, so
    // it can't be used to check non-ASCII names)
    const script = 'import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); z.extractall(sys.argv[2]); print(z.testzip())';
    expect(execFileSync('python3', ['-c', script, file, join(dir, 'x')]).toString().trim()).toBe('None');
    expect(readFileSync(join(dir, 'x', 'fastlane/screenshots/tr/01-ğüşiöç.png'), 'utf8')).toBe('türkçe isim');
  });

  it('refuses duplicate names and detects corruption', () => {
    expect(() => zip([entries[0], entries[0]])).toThrow('duplicate');
    const z = zip(entries.slice(0, 1));
    z[30 + entries[0].name.length + 1] ^= 0xff;   // 30-byte local header, the name, then the data
    expect(() => unzip(z)).toThrow('checksum');
    expect(() => unzip(enc.encode('not a zip at all'))).toThrow('not a zip');
  });
});
