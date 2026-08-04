/**
 * @oneact/schema — 纯计算工具（几何 / 对比度 / 文本度量 / 逃逸块扫描）
 *
 * 全部为平台无关纯函数（无 DOM 依赖），供校验器预检使用。
 * 真实终审测量（离屏 scrollHeight / getBoundingClientRect）由 core 在浏览器环境补充。
 */
import type { CanvasSize } from "./format.js";
import type { Rect } from "./types.js";

// ──────────────────────────────── 几何 ────────────────────────────────

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function toBox(r: Rect): Box {
  const [x, y, w, h] = r;
  return { x, y, w, h };
}

export function area(b: Box): number {
  return b.w * b.h;
}

/** 两矩形交集面积（不相交为 0）。 */
export function intersectArea(a: Box, b: Box): number {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  if (x1 <= x0 || y1 <= y0) return 0;
  return (x1 - x0) * (y1 - y0);
}

/** 重叠率：交集面积 / 较小者面积（0–1）。 */
export function overlapRatio(a: Box, b: Box): number {
  const inter = intersectArea(a, b);
  if (inter === 0) return 0;
  const min = Math.min(area(a), area(b));
  return min > 0 ? inter / min : 0;
}

/** inner 是否完全落在 outer 内。 */
export function isInside(inner: Box, outer: Box): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w + 0.5 &&
    inner.y + inner.h <= outer.y + outer.h + 0.5
  );
}

/** 越界量：各方向正值为越出像素，total 为合计。 */
export function outOfBounds(b: Box, canvas: CanvasSize) {
  const left = Math.max(0, -b.x);
  const top = Math.max(0, -b.y);
  const right = Math.max(0, b.x + b.w - canvas.width);
  const bottom = Math.max(0, b.y + b.h - canvas.height);
  return { left, top, right, bottom, total: left + top + right + bottom };
}

// ──────────────────────────────── 颜色 / 对比度 ────────────────────────────────

export interface RGB {
  r: number;
  g: number;
  b: number;
}

/** 解析 #rgb / #rrggbb / #rrggbbaa / rgb()/rgba()；失败返回 null。 */
export function parseColor(input: string): RGB | null {
  if (typeof input !== "string") return null;
  let s = input.trim();
  const m = /^rgba?\(\s*([^)]+)\s*\)$/i.exec(s);
  if (m) {
    const parts = m[1].split(",").map((p) => parseFloat(p));
    return { r: parts[0] | 0, g: parts[1] | 0, b: parts[2] | 0 };
  }
  s = s.replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(s)) {
    return { r: parseInt(s[0] + s[0], 16), g: parseInt(s[1] + s[1], 16), b: parseInt(s[2] + s[2], 16) };
  }
  if (/^[0-9a-f]{6}$/i.test(s) || /^[0-9a-f]{8}$/i.test(s)) {
    return { r: parseInt(s.slice(0, 2), 16), g: parseInt(s.slice(2, 4), 16), b: parseInt(s.slice(4, 6), 16) };
  }
  return null;
}

function channel(c: number): number {
  c /= 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(rgb: RGB): number {
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

/** WCAG 对比度（1–21）。任一色无法解析返回 null。 */
export function contrastRatio(fg: string, bg: string): number | null {
  const a = parseColor(fg);
  const b = parseColor(bg);
  if (!a || !b) return null;
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

// ──────────────────────────────── 文本溢出估算 ────────────────────────────────

const CJK = /[　-〿㐀-鿿豈-﫿＀-￯‘-‟]/;

/** 估算文本在给定宽度下占据的高度（px）。中英混排加权。 */
export function estimateTextHeight(
  text: string,
  fontSize: number,
  boxWidth: number,
  lineHeight = 1.5,
  padding = 0,
): number {
  if (!text || boxWidth <= 0) return 0;
  let totalWidth = 0;
  for (const ch of text) totalWidth += CJK.test(ch) ? fontSize : fontSize * 0.55;
  const avgCharWidth = text.length > 0 ? totalWidth / text.length : fontSize * 0.55;
  const usableWidth = Math.max(1, boxWidth - padding * 2);
  const charsPerLine = Math.max(1, Math.floor(usableWidth / avgCharWidth));
  // 显式换行增加行数
  const segments = text.split("\n");
  let lines = 0;
  for (const seg of segments) {
    lines += seg.length === 0 ? 1 : Math.ceil(seg.length / charsPerLine);
  }
  lines = Math.max(1, lines);
  return lines * fontSize * lineHeight;
}

// ──────────────────────────────── 逃逸块静态扫描（4.11） ────────────────────────────────

export interface EscapeHit {
  tag: string;
  sample: string;
}

const SUSPICIOUS_PATTERNS: { re: RegExp; tag: string }[] = [
  { re: /<\s*script\b/i, tag: "script" },
  { re: /\son[a-z]+\s*=/i, tag: "event-handler" },
  { re: /javascript:/i, tag: "javascript-url" },
  { re: /<\s*iframe\b/i, tag: "iframe" },
  { re: /<\s*object\b/i, tag: "object" },
  { re: /<\s*embed\b/i, tag: "embed" },
  { re: /<\s*link\b/i, tag: "link" },
  { re: /document\.(cookie|domain|location)/i, tag: "dom-sink" },
  { re: /\beval\s*\(/i, tag: "eval" },
  { re: /https?:\/\//i, tag: "external-link" },
];

/** 静态扫描逃逸块内容，返回命中清单。 */
export function scanEscape(content: string): EscapeHit[] {
  if (typeof content !== "string" || content.length === 0) return [];
  const hits: EscapeHit[] = [];
  for (const p of SUSPICIOUS_PATTERNS) {
    const m = content.match(p.re);
    if (m) hits.push({ tag: p.tag, sample: m[0].slice(0, 40) });
  }
  return hits;
}
