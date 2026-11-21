import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const root = process.cwd();
const targets = {
  electronIco: path.join(root, 'electron', 'assets', 'icon.ico'),
  electronPng: path.join(root, 'electron', 'assets', 'icon.png'),
  buildIco: path.join(root, 'build', 'icon.ico'),
  buildPng: path.join(root, 'build', 'icon.png'),
};

function isValidIco(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const buf = fs.readFileSync(filePath);
  return buf.length >= 22 && buf[0] === 0 && buf[1] === 0 && buf[2] === 1 && buf[3] === 0;
}

function isValidPng(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const buf = fs.readFileSync(filePath);
  return (
    buf.length > 32 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  );
}

function readPngDimensions(buf) {
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/**
 * Pure-Node fallback: generates a crisp 256x256 DevMind Studio dark rounded-square
 * PNG with Fluent blue accent mark if binary image files were omitted during repo transfer.
 */
function generateFallbackIconPng256() {
  const size = 256;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const pad = 12;
  const radius = 52;

  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0; // filter type 0
    for (let x = 0; x < size; x += 1) {
      const px = rowStart + 1 + x * 4;
      const dx = Math.max(pad + radius - x, 0, x - (size - 1 - pad - radius));
      const dy = Math.max(pad + radius - y, 0, y - (size - 1 - pad - radius));
      const dist = Math.hypot(dx, dy);

      if (dist > radius) {
        raw[px] = 0;
        raw[px + 1] = 0;
        raw[px + 2] = 0;
        raw[px + 3] = 0;
        continue;
      }

      // Base dark charcoal tile with subtle top bevel gradient
      const grad = Math.round(38 - (y / size) * 14);
      let r = grad;
      let g = grad + 1;
      let b = grad + 4;
      let a = dist > radius - 1.5 ? Math.round(Math.max(0, (radius - dist) / 1.5) * 255) : 255;

      // Subtle bevel edge
      if (dist > radius - 3 && dist <= radius - 1) {
        r += 24;
        g += 26;
        b += 30;
      }

      // Crisp geometric emblem: white '<' left chevron + Fluent blue (#0078D4) '/' & prism
      const nx = (x - size / 2) / (size / 2);
      const ny = (y - size / 2) / (size / 2);

      // Left '<' chevron
      const leftDiagTop = Math.abs(ny + (nx + 0.56) * 0.95) < 0.08 && nx > -0.58 && nx < -0.22 && ny <= 0.04;
      const leftDiagBot = Math.abs(ny - (nx + 0.56) * 0.95) < 0.08 && nx > -0.58 && nx < -0.22 && ny >= -0.04;

      // Center '/' slash
      const slash = Math.abs(nx + ny * 0.38 - 0.02) < 0.075 && Math.abs(ny) < 0.44;

      // Right hexagon prism ring
      const hx = nx - 0.24;
      const hy = ny;
      const hexDist = Math.max(Math.abs(hx) * 0.866 + Math.abs(hy) * 0.5, Math.abs(hy));
      const hexRing = hexDist <= 0.44 && hexDist >= 0.24 && nx > 0.08;

      if (leftDiagTop || leftDiagBot) {
        r = 244;
        g = 246;
        b = 250;
      } else if (slash) {
        r = ny < 0 ? 240 : 12;
        g = ny < 0 ? 244 : 132;
        b = ny < 0 ? 250 : 228;
      } else if (hexRing) {
        r = 0;
        g = 120;
        b = 212;
      }

      raw[px] = Math.min(255, r);
      raw[px + 1] = Math.min(255, g);
      raw[px + 2] = Math.min(255, b);
      raw[px + 3] = a;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Wraps a 256x256 (or <=256px) RGBA PNG into a valid Windows Vista/10/11 .ico container.
 */
function wrapPngAsIco(pngBuf) {
  const { width, height } = readPngDimensions(pngBuf);
  const wByte = width >= 256 ? 0 : width;
  const hByte = height >= 256 ? 0 : height;

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = ICO
  header.writeUInt16LE(1, 4); // image count = 1

  const entry = Buffer.alloc(16);
  entry[0] = wByte;
  entry[1] = hByte;
  entry[2] = 0; // color palette
  entry[3] = 0; // reserved
  entry.writeUInt16LE(1, 4); // planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(pngBuf.length, 8); // image bytes size
  entry.writeUInt32LE(22, 12); // offset = 6 + 16

  return Buffer.concat([header, entry, pngBuf]);
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function main() {
  ensureDir(targets.electronIco);
  ensureDir(targets.buildIco);

  // 1. Ensure valid PNG icon exists in both electron/assets/icon.png and build/icon.png
  const pngCandidates = [
    targets.electronPng,
    targets.buildPng,
    path.join(root, 'public', 'icon.png'),
    path.join(root, 'public', 'pwa-512x512.png'),
    path.join(root, 'dist', 'icon.png'),
  ];

  let pngSource = pngCandidates.find((p) => isValidPng(p));
  let pngBuffer = pngSource ? fs.readFileSync(pngSource) : generateFallbackIconPng256();

  if (!isValidPng(targets.electronPng)) fs.writeFileSync(targets.electronPng, pngBuffer);
  if (!isValidPng(targets.buildPng)) fs.writeFileSync(targets.buildPng, pngBuffer);

  // 2. Ensure valid Windows .ico exists in both electron/assets/icon.ico and build/icon.ico
  if (isValidIco(targets.electronIco) && !isValidIco(targets.buildIco)) {
    fs.copyFileSync(targets.electronIco, targets.buildIco);
  } else if (isValidIco(targets.buildIco) && !isValidIco(targets.electronIco)) {
    fs.copyFileSync(targets.buildIco, targets.electronIco);
  } else if (!isValidIco(targets.electronIco) && !isValidIco(targets.buildIco)) {
    // Prefer a <=256px PNG (public/icon.png is exact 256x256) for Vista+/Win10/11 ICO compliance
    const icoPngCandidates = [
      path.join(root, 'public', 'icon.png'),
      path.join(root, 'dist', 'icon.png'),
      path.join(root, 'public', 'pwa-192x192.png'),
    ];
    const icoPngPath = icoPngCandidates.find((p) => {
      if (!isValidPng(p)) return false;
      const dims = readPngDimensions(fs.readFileSync(p));
      return dims.width <= 256 && dims.height <= 256;
    });
    const icoPngBuf = icoPngPath ? fs.readFileSync(icoPngPath) : generateFallbackIconPng256();
    const icoBuf = wrapPngAsIco(icoPngBuf);
    fs.writeFileSync(targets.electronIco, icoBuf);
    fs.writeFileSync(targets.buildIco, icoBuf);
    console.log(
      `[ensure-win-icon] Generated Windows ICO (${icoBuf.length} bytes) from ${
        icoPngPath ? path.relative(root, icoPngPath) : 'built-in vector fallback'
      }.`
    );
  }

  console.log(
    `[ensure-win-icon] Verified icons: electron/assets/icon.ico (${fs.statSync(targets.electronIco).size}B), build/icon.ico (${fs.statSync(targets.buildIco).size}B)`
  );
}

main();
