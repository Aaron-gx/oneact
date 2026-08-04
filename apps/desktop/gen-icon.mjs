// 生成 OneAct 桌面端图标 src-tauri/icons/icon.png（512×512：渐变底 + 白菱形 + play）
// 纯 Node 零依赖（zlib + 手写 PNG 封装），不靠任何图像库。
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SIZE = 512;
const here = dirname(fileURLToPath(import.meta.url));

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
const lerp = (a, b, t) => Math.round(a + (b - a) * t);
const sign = (p, p1, p2) => (p[0] - p2[0]) * (p1[1] - p2[1]) - (p1[0] - p2[0]) * (p[1] - p2[1]);
const inTri = (px, py, a, b, c) => {
  const p = [px, py];
  const d1 = sign(p, a, b), d2 = sign(p, b, c), d3 = sign(p, c, a);
  const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
};

const rgba = Buffer.alloc(SIZE * SIZE * 4);
const [r1, g1, b1] = [0x2f, 0x54, 0xeb]; // OneAct 主色
const [r2, g2, b2] = [0x7c, 0x3a, 0xed]; // 强调色
const cx = SIZE / 2, cy = SIZE / 2;
const tri = [[cx - 30, cy - 44], [cx - 30, cy + 44], [cx + 48, cy]];

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const i = (y * SIZE + x) * 4;
    const t = (x + y) / (SIZE * 2);
    let r = lerp(r1, r2, t), g = lerp(g1, g2, t), b = lerp(b1, b2, t), a = 255;
    const rad = 112; // 圆角
    const dx = Math.min(x, SIZE - 1 - x), dy = Math.min(y, SIZE - 1 - y);
    if (dx < rad && dy < rad) {
      if (Math.sqrt((rad - dx) ** 2 + (rad - dy) ** 2) > rad) a = 0;
    }
    const R = 158; // 白菱形
    if (Math.abs(x - cx) / R + Math.abs(y - cy) / R < 0.85) r = g = b = 255;
    if (inTri(x, y, tri[0], tri[1], tri[2])) { r = 0x2f; g = 0x54; b = 0xeb; } // play 三角
    rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = a;
  }
}

const raw = Buffer.alloc((1 + SIZE * 4) * SIZE);
for (let y = 0; y < SIZE; y++) {
  raw[y * (1 + SIZE * 4)] = 0;
  rgba.copy(raw, y * (1 + SIZE * 4) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw)),
  chunk("IEND", Buffer.alloc(0)),
]);
const out = resolve(here, "src-tauri/icons/icon.png");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, png);
console.log(`✓ generated ${out} (${(png.length / 1024).toFixed(1)} KB, ${SIZE}×${SIZE})`);
