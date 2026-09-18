import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";

const root = path.resolve(process.argv[2] || ".");
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1)
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(data) {
  let value = 0xffffffff;
  for (const byte of data) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function optimizePng(input) {
  if (!input.subarray(0, 8).equals(signature)) return null;
  const chunks = [];
  const idat = [];
  let offset = 8;
  let firstIdat = -1;
  while (offset + 12 <= input.length) {
    const length = input.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > input.length) return null;
    const type = input.toString("ascii", offset + 4, offset + 8);
    const data = input.subarray(offset + 8, offset + 8 + length);
    if (type === "IDAT") {
      if (firstIdat < 0) firstIdat = chunks.length;
      idat.push(data);
    } else {
      chunks.push({ type, data });
    }
    offset = end;
    if (type === "IEND") break;
  }
  if (!idat.length || firstIdat < 0) return null;
  const compressed = zlib.deflateSync(zlib.inflateSync(Buffer.concat(idat)), {
    level: 9,
    memLevel: 9,
  });
  const output = [signature];
  let inserted = false;
  for (let index = 0; index < chunks.length; index += 1) {
    if (index === firstIdat && !inserted) {
      output.push(chunk("IDAT", compressed));
      inserted = true;
    }
    output.push(chunk(chunks[index].type, chunks[index].data));
  }
  if (!inserted) output.push(chunk("IDAT", compressed));
  return Buffer.concat(output);
}

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(fullPath)));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".png")) files.push(fullPath);
  }
  return files;
}

const files = await walk(root);
let before = 0;
let after = 0;
let changed = 0;
for (const file of files) {
  const input = await fs.readFile(file);
  const output = optimizePng(input);
  before += input.length;
  if (output && output.length < input.length) {
    const temporary = `${file}.optimize-${process.pid}`;
    await fs.writeFile(temporary, output);
    await fs.rename(temporary, file);
    after += output.length;
    changed += 1;
  } else {
    after += input.length;
  }
}
console.log(JSON.stringify({ files: files.length, changed, before, after, reduction: before - after }));
