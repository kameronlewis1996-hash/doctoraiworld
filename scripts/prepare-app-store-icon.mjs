#!/usr/bin/env node
// Create a deterministic, opaque 1024x1024 PNG for an Apple App Store icon.
// The source asset is left untouched; the export is composited over white.
// Uses only Node.js built-ins so the same command works without extra packages.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { deflateSync, inflateSync } from "node:zlib";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultInput = join(repoRoot, "doctorai-app-icon.png");
const defaultOutput = join(repoRoot, "store-assets", "apple", "doctorai-app-icon-1024-opaque.png");
let inputPath = defaultInput;
let outputPath = defaultOutput;
let checkOnly = false;

for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (argument === "--check") {
    checkOnly = true;
  } else if (argument === "--input" || argument === "--output") {
    const value = process.argv[++index];
    if (!value) throw new Error(`${argument} requires a path`);
    if (argument === "--input") inputPath = resolve(value);
    else outputPath = resolve(value);
  } else {
    throw new Error(`Unknown argument: ${argument}`);
  }
}

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let value = n;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  crcTable[n] = value >>> 0;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function parsePng(buffer) {
  if (!buffer.subarray(0, 8).equals(signature)) throw new Error("Input is not a PNG file");
  const chunks = [];
  let offset = 8;
  let sawEnd = false;
  while (offset < buffer.length) {
    if (offset + 12 > buffer.length) throw new Error("Truncated PNG chunk header");
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const start = offset + 8;
    const end = start + length;
    if (end + 4 > buffer.length) throw new Error(`Truncated PNG ${type} chunk`);
    const data = buffer.subarray(start, end);
    const storedCrc = buffer.readUInt32BE(end);
    const actualCrc = crc32(buffer.subarray(offset + 4, end));
    if (storedCrc !== actualCrc) throw new Error(`PNG ${type} CRC mismatch`);
    chunks.push({ type, data });
    offset = end + 4;
    if (type === "IEND") {
      sawEnd = true;
      break;
    }
  }
  if (!sawEnd || offset !== buffer.length) throw new Error("PNG is missing IEND or has trailing bytes");
  const header = chunks.find(({ type }) => type === "IHDR")?.data;
  if (!header || header.length !== 13) throw new Error("PNG has no valid IHDR chunk");
  return {
    width: header.readUInt32BE(0),
    height: header.readUInt32BE(4),
    bitDepth: header[8],
    colorType: header[9],
    interlace: header[12],
    chunks,
  };
}

function paeth(left, up, upperLeft) {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  if (upDistance <= upperLeftDistance) return up;
  return upperLeft;
}

function decodeTruecolor(png) {
  const channels = png.colorType === 6 ? 4 : png.colorType === 2 ? 3 : 0;
  if (png.bitDepth !== 8 || channels === 0 || png.interlace !== 0) {
    throw new Error("Only non-interlaced 8-bit RGB/RGBA PNG files are supported");
  }
  const compressed = Buffer.concat(png.chunks.filter(({ type }) => type === "IDAT").map(({ data }) => data));
  const packed = inflateSync(compressed);
  const rowBytes = png.width * channels;
  const expectedLength = (rowBytes + 1) * png.height;
  if (packed.length !== expectedLength) throw new Error(`Unexpected decoded image length: ${packed.length}`);
  const pixels = Buffer.alloc(rowBytes * png.height);
  for (let y = 0; y < png.height; y += 1) {
    const sourceOffset = y * (rowBytes + 1);
    const filter = packed[sourceOffset];
    const rowOffset = y * rowBytes;
    const previousOffset = rowOffset - rowBytes;
    for (let x = 0; x < rowBytes; x += 1) {
      const raw = packed[sourceOffset + 1 + x];
      const left = x >= channels ? pixels[rowOffset + x - channels] : 0;
      const up = y > 0 ? pixels[previousOffset + x] : 0;
      const upperLeft = y > 0 && x >= channels ? pixels[previousOffset + x - channels] : 0;
      let predictor;
      if (filter === 0) predictor = 0;
      else if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = Math.floor((left + up) / 2);
      else if (filter === 4) predictor = paeth(left, up, upperLeft);
      else throw new Error(`Unsupported PNG filter ${filter}`);
      pixels[rowOffset + x] = (raw + predictor) & 0xff;
    }
  }
  return { pixels, channels };
}

function makeChunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBytes.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + data.length)), 8 + data.length);
  return chunk;
}

function encodeRgbPng(width, height, pixels, metadataChunks) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2; // RGB, no alpha channel
  const scanlines = Buffer.alloc((width * 3 + 1) * height);
  const rowBytes = width * 3;
  for (let y = 0; y < height; y += 1) {
    const outputOffset = y * (rowBytes + 1);
    scanlines[outputOffset] = 0; // PNG filter: None
    pixels.copy(scanlines, outputOffset + 1, y * rowBytes, (y + 1) * rowBytes);
  }
  return Buffer.concat([
    signature,
    makeChunk("IHDR", header),
    ...metadataChunks.map(({ type, data }) => makeChunk(type, data)),
    makeChunk("IDAT", deflateSync(scanlines, { level: 9 })),
    makeChunk("IEND", Buffer.alloc(0)),
  ]);
}

const inputBuffer = await readFile(inputPath);
const sourcePng = parsePng(inputBuffer);
if (sourcePng.width !== 1024 || sourcePng.height !== 1024) {
  throw new Error(`Expected a 1024x1024 source icon, found ${sourcePng.width}x${sourcePng.height}`);
}
if (sourcePng.colorType !== 6) throw new Error("Expected the existing RGBA app icon as the source");
const { pixels: sourcePixels } = decodeTruecolor(sourcePng);
const alphaCounts = { opaque: 0, transparent: 0, partial: 0 };
const rgbPixels = Buffer.alloc(1024 * 1024 * 3);
for (let sourceOffset = 0, targetOffset = 0; sourceOffset < sourcePixels.length; sourceOffset += 4, targetOffset += 3) {
  const alpha = sourcePixels[sourceOffset + 3];
  if (alpha === 255) alphaCounts.opaque += 1;
  else if (alpha === 0) alphaCounts.transparent += 1;
  else alphaCounts.partial += 1;
  const opacity = alpha / 255;
  for (let channel = 0; channel < 3; channel += 1) {
    rgbPixels[targetOffset + channel] = Math.round(sourcePixels[sourceOffset + channel] * opacity + 255 * (1 - opacity));
  }
}

// Preserve the source colour profile/resolution metadata, without carrying unrelated chunks.
const metadataTypes = new Set(["cHRM", "gAMA", "sRGB", "pHYs"]);
const metadataChunks = sourcePng.chunks.filter(({ type }) => metadataTypes.has(type));
if (metadataChunks.some(({ type }) => type === "sRGB") && metadataChunks.some(({ type }) => type === "iCCP")) {
  throw new Error("Source has conflicting sRGB and ICC profiles");
}
const expectedOutput = encodeRgbPng(1024, 1024, rgbPixels, metadataChunks);

if (checkOnly) {
  const outputBuffer = await readFile(outputPath);
  if (!outputBuffer.equals(expectedOutput)) throw new Error("Opaque export differs from a fresh deterministic render");
} else {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, expectedOutput);
}

const verified = parsePng(checkOnly ? await readFile(outputPath) : expectedOutput);
if (verified.width !== 1024 || verified.height !== 1024 || verified.bitDepth !== 8 || verified.colorType !== 2) {
  throw new Error("Export must be 1024x1024, 8-bit RGB, and contain no alpha channel");
}
const { pixels: verifiedPixels, channels } = decodeTruecolor(verified);
if (channels !== 3 || !verifiedPixels.equals(rgbPixels)) throw new Error("Export pixel verification failed");

const result = {
  source: { width: sourcePng.width, height: sourcePng.height, colorType: "RGBA", alphaPixels: alphaCounts },
  export: { width: verified.width, height: verified.height, bitDepth: verified.bitDepth, colorType: "RGB (opaque)", bytes: expectedOutput.length, sha256: createHash("sha256").update(expectedOutput).digest("hex") },
  mode: checkOnly ? "checked" : "created",
};
console.log(JSON.stringify(result, null, 2));

