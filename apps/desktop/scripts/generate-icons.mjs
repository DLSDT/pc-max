/**
 * Generates the app icon set (PNG + Windows ICO) with zero dependencies.
 *
 * The icons are a violet→fuchsia gradient tile matching the UI's primary color
 * — a clean placeholder that designers can replace later. Run via:
 *
 *   npm run icons -w @goh/desktop
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src-tauri', 'icons');
mkdirSync(outDir, { recursive: true });

/* ------------------------------- PNG encoder ------------------------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

/** Solid RGBA tile with soft-rounded corners and a diagonal gradient. */
function makePng(size) {
  const c = (size - 1) / 2;
  const half = size / 2;
  const cornerR = size * 0.22;
  const rows = [];

  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    row[0] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      // Distance outside the rounded-rectangle mask.
      const dx = Math.max(Math.abs(x - c) - (half - cornerR), 0);
      const dy = Math.max(Math.abs(y - c) - (half - cornerR), 0);
      const dist = Math.hypot(dx, dy);
      // 1px anti-aliased edge.
      const alpha = Math.max(0, Math.min(1, cornerR - dist + 0.5)) * 255;

      const t = (x + y) / (2 * size); // diagonal gradient 0..1
      const r = Math.round(0x7c + (0xd9 - 0x7c) * t);
      const g = Math.round(0x5c + (0x4f - 0x5c) * t);
      const b = Math.round(0xfc + (0xff - 0xfc) * t);

      const o = 1 + x * 4;
      row[o] = r;
      row[o + 1] = g;
      row[o + 2] = b;
      row[o + 3] = Math.round(alpha);
    }
    rows.push(row);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------- ICO encoder ------------------------------- */

/** Single-image ICO wrapping a PNG (valid for Windows). */
function makeIco(png) {
  const header = Buffer.alloc(6 + 16);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // image count
  header[6] = 0; // width (0 == 256)
  header[7] = 0; // height (0 == 256)
  header[8] = 0; // palette
  header[9] = 0; // reserved
  header.writeUInt16LE(1, 10); // color planes
  header.writeUInt16LE(32, 12); // bits per pixel
  header.writeUInt32LE(png.length, 14); // bytes in resource
  header.writeUInt32LE(22, 18); // offset to image data
  return Buffer.concat([header, png]);
}

/* --------------------------------- Output ---------------------------------- */

const sizes = [
  ['32x32.png', 32],
  ['128x128.png', 128],
  ['128x128@2x.png', 256],
  ['icon.png', 512],
];

for (const [name, size] of sizes) {
  writeFileSync(join(outDir, name), makePng(size));
  console.log(`  wrote ${name} (${size}x${size})`);
}

const icoPng = makePng(256);
writeFileSync(join(outDir, 'icon.ico'), makeIco(icoPng));
console.log(`  wrote icon.ico (256x256, ${icoPng.length} bytes PNG payload)`);
console.log(`\nIcons written to ${outDir}`);
